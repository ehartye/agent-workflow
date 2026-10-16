/** @lane merge
 * @subject engine/stage-checkpoints.mjs
 * @subject bin/managed-runtime.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import * as vm from 'node:vm';
const {SourceTextModule,SyntheticModule,createContext,runInContext}=vm;
import {sourceDigest,dependenciesDigest,bindRun} from '../bin/managed-runtime.mjs';
import {verifyIntegrationSnapshot} from '../engine/command-jobs/index.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>Array.isArray(x)?`[${x.map(canonical).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')}}`:JSON.stringify(x);
const jsonBytes=x=>Buffer.byteLength(JSON.stringify(x));
const checkpointCap=1048576;
// Valid multibyte question text reaches byte boundaries without huge manifests.
export function sizedRecord(f,bytes){
 const record={...f.record,outstandingQuestions:Array.from({length:64},(_,i)=>({id:'q'+i,text:'q',state:'optional'}))};
 let remaining=bytes-jsonBytes(record);assert.ok(remaining>=0);
 for(const q of record.outstandingQuestions){const n=Math.min(8191,Math.floor(remaining/2));q.text+='é'.repeat(n);remaining-=2*n;if(remaining===1&&q.text.length<8192){q.text+='x';remaining--;}}
 assert.equal(remaining,0,'requested size must fit the valid question inventory');assert.equal(jsonBytes(record),bytes);return record;
}

// Entirely local byte-verified managed fixture; the inert native file is never executed.
// No installation, Git metadata, links, real-home writes or external calls.
export async function fixture(t){
 const root=await realpath(await mkdtemp(fileURLToPath(new URL('./.lifecycle-fixture-acceptance-',import.meta.url))));
 t.after(async()=>{assert.ok(root.startsWith(fileURLToPath(new URL('./',import.meta.url))));await rm(root,{recursive:true,force:true});});
 const dataDir=join(root,'data');await mkdir(dataDir);
 const staging=join(root,'staging');await mkdir(staging);
 for(const name of ['bin','engine','foundation','workflows','hooks','skills'])await mkdir(join(staging,name));
 await writeFile(join(staging,'package.json'),JSON.stringify({version:'0.4.1',dependencies:{'@openai/codex':'0.162.1'}}));
 await writeFile(join(staging,'package-lock.json'),'{}');await writeFile(join(staging,'LICENSE'),'fixture');
 const modules=join(staging,'node_modules','@openai');await mkdir(join(modules,'codex'),{recursive:true});
 await writeFile(join(modules,'codex','package.json'),JSON.stringify({version:'0.162.1'}));
 const nativeRoot=join(modules,`codex-${process.platform}-${process.arch}`);
 const triple=process.platform==='win32'?'x86_64-pc-windows-msvc':'x86_64-unknown-linux-musl';
 const native=join(nativeRoot,'vendor',triple,'bin');await mkdir(native,{recursive:true});
 await writeFile(join(nativeRoot,'package.json'),JSON.stringify({version:`0.162.1-${process.platform}-${process.arch}`}));
 const binary=process.platform==='win32'?'codex.exe':'codex';await writeFile(join(native,binary),'inert fixture');
 const digest=await sourceDigest(staging),id=`0.4.1-${digest.slice(0,16)}-node${process.version.slice(1)}`;
 const runtimePath=join(dataDir,'runtime-v2',id);await mkdir(runtimePath,{recursive:true});
 const {cp}=await import('node:fs/promises');await cp(staging,runtimePath,{recursive:true});
 const runtime={schema:2,version:'0.4.1',id,path:runtimePath,digest,node:process.version,codex:join(runtimePath,'node_modules','@openai',`codex-${process.platform}-${process.arch}`,'vendor',triple,'bin',binary),codexDigest:hash('inert fixture'),dependenciesDigest:await dependenciesDigest(runtimePath)};
 const owner=await bindRun({dataDir,runtime,sessionId:'fixture-origin'});
 const stat=await lstat(dataDir,{bigint:true});const canonicalRoot=await realpath(dataDir);
 const dataInstanceId=hash(JSON.stringify([process.platform==='win32'?canonicalRoot.toLowerCase():canonicalRoot,String(stat.dev),String(stat.ino),String(stat.birthtimeNs)]));
 const run={dataInstanceId,runId:owner.id,runtimeId:id};
 const db=new DatabaseSync(join(owner.runDir,'run.sqlite'));
 db.exec('CREATE TABLE header(id INTEGER PRIMARY KEY,value TEXT);CREATE TABLE workers(generation INTEGER,position INTEGER,value TEXT,PRIMARY KEY(generation,position));');
 db.prepare('INSERT INTO header VALUES(1,?)').run(JSON.stringify({sessionId:'fixture-origin',generation:1,status:'completed'}));db.close();
 const record={schemaVersion:1,originRun:run,planHash:'a'.repeat(64),parentPolicyHash:'b'.repeat(64),parentCatalogHash:'c'.repeat(64),objectives:[],artifacts:[],answers:[],outstandingQuestions:[],nextTasks:[],recovery:[],scopeChanges:[],integration:null,checkRequirements:[]};
 return{root,dataDir,owner,run,record,input:{dataDir,runId:owner.id,sessionId:'fixture-origin'}};
}

// Source modules execute in a test-only realm with an inert process facade. The
// actual worker marker is never removed or modified. No real saved run is targeted.
const realm=createContext({Buffer,TextDecoder,URL,process:{platform:process.platform,version:process.version,execPath:process.execPath,env:{}}});
realm.JSONparse=runInContext('JSON.parse',realm);
const modules=new Map();
export async function fixtureModule(name,mutate=null){
 const key=name+(mutate?'#'+mutate.name:'');if(modules.has(key))return modules.get(key);
 const promise=(async()=>{
  const url=new URL('../engine/'+name,import.meta.url);
  let source=await readFile(url,'utf8');if(mutate)source=mutate(source);
  const probes=name==='delivery-acceptance.mjs'?'export {readProducer,resolveArtifact,verifyRecovery,reason};':name==='stage-checkpoints.mjs'?'export {validateRecord,validateAncestry,canonical,checkFromJob};':'';
  const m=new SourceTextModule(source+'\n'+probes,{context:realm,identifier:url.href});
  await m.link(async(specifier)=>{
   if(['./stage-checkpoints.mjs','./workspace-policy.mjs'].includes(specifier))return (await fixtureModule(specifier.slice(2))).module;
   const ns=await import(specifier.startsWith('.')?new URL(specifier,url).href:specifier);
   return new SyntheticModule(Object.keys(ns),function(){for(const key of Object.keys(ns))this.setExport(key,ns[key]);},{context:realm});
  });await m.evaluate();const api=new Proxy(m.namespace,{get(target,key){const fn=target[key];if(typeof fn!=='function'||['canonical','validateRecord','validateAncestry','readProducer','resolveArtifact','verifyRecovery','checkFromJob','reason'].includes(String(key)))return fn;return async input=>{function inert(x){if(!x||typeof x!=='object')return true;for(const d of Object.values(Object.getOwnPropertyDescriptors(x))){if(!Object.hasOwn(d,'value')||!inert(d.value))return false;}return true;}const result=await fn(inert(input)?realm.JSONparse(JSON.stringify(input)):input);return result===undefined?undefined:JSON.parse(JSON.stringify(result));};}});return{module:m,api};
 })();modules.set(key,promise);return promise;
}
export const fixtureData=x=>realm.JSONparse(JSON.stringify(x));
// Match the actual provider's safe dictionaries in this fixture realm while
// keeping arrays on that realm's ordinary Array prototype.
const providerData=runInContext(`text=>{const convert=x=>{if(!x||typeof x!=='object')return x;if(Array.isArray(x))return x.map(convert);const value=Object.create(null);for(const key of Object.keys(x))value[key]=convert(x[key]);return value;};return convert(JSON.parse(text));}`,realm);
export const coordinator=operation=>operation();
export async function stageApi(){return(await fixtureModule('stage-checkpoints.mjs')).api;}
export async function acceptanceApi(){return(await fixtureModule('delivery-acceptance.mjs')).api;}

if(process.argv[1]===fileURLToPath(import.meta.url)&&process.execArgv.includes('--experimental-vm-modules')){
test('canonical checkpoint comparisons accept actual jobs snapshot dictionaries',async t=>{
 const f=await fixture(t),source=join(f.root,'snapshot-source');await mkdir(source);await writeFile(join(source,'entry.txt'),'real bytes\n');
 const stat=await lstat(source,{bigint:true}),files=[{path:'entry.txt',sha256:hash('real bytes\n'),bytes:11,mode:100644}],content={baseCommit:'1'.repeat(40),files,dependencies:[]};
 const snapshot={schemaVersion:1,root:source,canonicalRoot:await realpath(source),rootIdentity:{dev:String(stat.dev),ino:String(stat.ino)},...content,exclusions:{entries:[],sha256:hash('[]')},contentSha256:hash(canonical(content))};snapshot.manifestSha256=hash(canonical(snapshot));
 const verified=await verifyIntegrationSnapshot(snapshot);
 assert.equal(Object.getPrototypeOf(verified),null,'This samples the real provider representation, not a successful provider double');
 assert.equal((await stageApi()).canonical(providerData(JSON.stringify(verified))),canonical(snapshot));
});
test('canonical checkpoint validation refuses array overrides before map or species callbacks',async t=>{
 const f=await fixture(t),api=await stageApi();
 const samples=runInContext(`(()=>{let calls=0;class Overridden extends Array{map(){calls++;return [];}}class Species extends Array{static get [Symbol.species](){calls++;return Array;}}return [{value:new Overridden(),calls:()=>calls},{value:new Species(),calls:()=>calls}];})()`,realm);
 for(const sample of samples){const record=fixtureData(f.record);record.objectives=sample.value;assert.throws(()=>api.validateRecord(record),e=>e.code==='CHECKPOINT_INPUT');assert.equal(sample.calls(),0);}
});
test('missing checkpoint reads stay unavailable without creating a ledger',async t=>{
 const api=await stageApi();const f=await fixture(t);
 assert.equal(await api.readStageCheckpoint({...f.input,id:randomUUID()}),null);
 assert.deepEqual(await api.listStageCheckpoints(f.input),{available:false,items:[],nextCursor:null,hasMore:false});
 await assert.rejects(lstat(join(f.owner.runDir,'delivery-v1')),e=>e.code==='ENOENT');
});

test('request replay precedes predecessor CAS; changed payload conflicts and chain tampering is refused',async t=>{
 const api=await stageApi();const f=await fixture(t);
 await coordinator(async()=>{
  const input={...f.input,requestId:randomUUID(),expectedPreviousId:null,record:f.record};
  const first=await api.recordStageCheckpoint(input);
  const second=await api.recordStageCheckpoint({...input,requestId:randomUUID(),expectedPreviousId:first.id});
  assert.deepEqual(await api.recordStageCheckpoint(input),first);
  await assert.rejects(api.recordStageCheckpoint({...input,record:{...f.record,planHash:'d'.repeat(64)}}),e=>e.code==='CHECKPOINT_CONFLICT');
  assert.equal(second.previousRecordHash,first.recordHash);
  const {recordHash,...preimage}=first;assert.equal(recordHash,hash(canonical(preimage)));
  const page=await api.listStageCheckpoints({...f.input,limit:1});assert.deepEqual(page,{available:true,items:[first],nextCursor:first.id,hasMore:true});
  assert.deepEqual(await api.listStageCheckpoints({...f.input,after:page.nextCursor,limit:1}),{available:true,items:[second],nextCursor:second.id,hasMore:false});
  assert.deepEqual(await api.listStageCheckpoints({...f.input,after:second.id}),{available:true,items:[],nextCursor:second.id,hasMore:false});
  await assert.rejects(api.listStageCheckpoints({...f.input,after:randomUUID()}),e=>e.code==='CHECKPOINT_CURSOR');
  for(const limit of [0,101,1.5])await assert.rejects(api.listStageCheckpoints({...f.input,limit}),e=>e.code==='CHECKPOINT_INPUT');
  const db=new DatabaseSync(join(f.owner.runDir,'delivery-v1','stages.sqlite'));
  // Valid JSON in a later, not-returned row must still invalidate the first page.
  db.prepare('UPDATE stages SET value=? WHERE id=?').run(JSON.stringify({...second,planHash:'e'.repeat(64)}),second.id);db.close();
  const file=join(f.owner.runDir,'delivery-v1','stages.sqlite'),before=await readFile(file);
  await assert.rejects(api.listStageCheckpoints({...f.input,limit:1}),e=>e.code==='CHECKPOINT_CORRUPT');
  await assert.rejects(api.readStageCheckpoint({...f.input,id:second.id}),e=>e.code==='CHECKPOINT_CORRUPT');
  assert.deepEqual(await readFile(file),before);
 });
});

test('large checkpoints list the largest byte-bounded prefix without gaps or changed hashes',async t=>{
 const api=await stageApi(),f=await fixture(t),records=[];
 for(let i=0;i<3;i++)records.push(await api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:records.at(-1)?.id??null,record:sizedRecord(f,440000)}));
 assert.ok(records.every(r=>jsonBytes(r)<checkpointCap));
 const file=join(f.owner.runDir,'delivery-v1','stages.sqlite'),before=await readFile(file);
 const first=await api.listStageCheckpoints(f.input);
 assert.equal(first.items.length,2);assert.equal(first.hasMore,true);assert.equal(first.nextCursor,records[1].id);assert.ok(jsonBytes(first)<=checkpointCap);
 assert.ok(jsonBytes({...first,items:records,nextCursor:records[2].id,hasMore:false})>checkpointCap,'a third record cannot fit');
 const last=await api.listStageCheckpoints({...f.input,after:first.nextCursor});
 assert.equal(last.items.length,1);assert.equal(last.hasMore,false);assert.equal(last.nextCursor,records[2].id);assert.ok(jsonBytes(last)<=checkpointCap);
 const seen=[...first.items,...last.items];assert.deepEqual(seen,records);assert.equal(new Set(seen.map(r=>r.id)).size,3);
 for(const {recordHash,...preimage} of seen)assert.equal(recordHash,hash(canonical(preimage)));
 const smaller=await api.listStageCheckpoints({...f.input,limit:1});assert.deepEqual(smaller.items,[records[0]]);assert.equal(smaller.hasMore,true);assert.equal(smaller.nextCursor,records[0].id);
 assert.deepEqual(await readFile(file),before);
});

test('one-item envelope limit refuses append atomically and preserves historical replay',async t=>{
 const api=await stageApi(),f=await fixture(t),seed=await api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:f.record});
 const page=record=>({available:true,items:[record],nextCursor:record.id,hasMore:false});
 // Generated UUIDs/hashes/timestamps have fixed widths. Size a successor with
 // non-null ancestry against the complete response, including the final false.
 const template={...seed,previousId:seed.id,previousRecordHash:seed.recordHash};
 const recordBytes=checkpointCap-(jsonBytes(page(template))-jsonBytes(f.record));
 const request={...f.input,requestId:randomUUID(),expectedPreviousId:seed.id,record:sizedRecord(f,recordBytes)};
 const oversized={...request,requestId:randomUUID(),record:sizedRecord(f,recordBytes+1)};
 assert.ok(jsonBytes(oversized)<checkpointCap,'the request itself fits; only its generated list envelope exceeds the cap');
 const file=join(f.owner.runDir,'delivery-v1','stages.sqlite'),before=await readFile(file);
 await assert.rejects(api.recordStageCheckpoint(oversized),e=>e.code==='CHECKPOINT_LIMIT');
 assert.deepEqual(await readFile(file),before);assert.deepEqual((await api.listStageCheckpoints(f.input)).items,[seed]);
 const exact=await api.recordStageCheckpoint(request),final=await api.listStageCheckpoints({...f.input,after:seed.id,limit:1});
 assert.deepEqual(final,page(exact));assert.equal(jsonBytes(final),checkpointCap);
 const tail=await api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:exact.id,record:f.record});
 assert.deepEqual(await api.recordStageCheckpoint(request),exact,'exact replay still precedes the advanced predecessor');
 const middle=await api.listStageCheckpoints({...f.input,after:seed.id});
 assert.deepEqual(middle,{...page(exact),hasMore:true});assert.equal(jsonBytes(middle),checkpointCap-1);
 assert.deepEqual((await api.listStageCheckpoints({...f.input,after:middle.nextCursor})).items,[tail]);
 // Simulate a previously admitted record: preserve its original hash/replay,
 // but never skip it or return a successful empty page when it is next.
 const historicalRequest={...oversized,requestId:randomUUID(),expectedPreviousId:tail.id};
 const historical={...historicalRequest.record,id:randomUUID(),previousId:tail.id,previousRecordHash:tail.recordHash,requestId:historicalRequest.requestId,createdAt:new Date().toISOString()};historical.recordHash=hash(canonical(historical));
 assert.ok(jsonBytes(historical)<=checkpointCap);assert.equal(jsonBytes(page(historical)),checkpointCap+1);
 const db=new DatabaseSync(file);
 try{db.prepare('INSERT INTO stages(id,request_id,request_hash,value) VALUES(?,?,?,?)').run(historical.id,historical.requestId,hash(canonical({originRun:f.run,requestId:historical.requestId,expectedPreviousId:tail.id,record:historicalRequest.record})),canonical(historical));}finally{db.close();}
 const saved=await readFile(file);
 await assert.rejects(api.listStageCheckpoints({...f.input,after:tail.id,limit:1}),e=>e.code==='CHECKPOINT_LIMIT');
 assert.deepEqual(await api.readStageCheckpoint({...f.input,id:historical.id}),historical);
 assert.deepEqual(await api.recordStageCheckpoint(historicalRequest),historical);
 assert.deepEqual(await readFile(file),saved);
});

test('answers bind exact ancestor checkpoint/question; omission keeps required questions open',async t=>{
 const api=await stageApi();const f=await fixture(t);
 await coordinator(async()=>{
  const first=await api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:{...f.record,outstandingQuestions:[{id:'scope',text:'Approve scope?',state:'required'}]}});
  const request={...f.input,requestId:randomUUID(),expectedPreviousId:first.id,record:{...f.record,answers:[{checkpointId:randomUUID(),questionId:'scope',answer:'yes',source:{kind:'coordinator',reference:'owner-approval'}}]}};
  await assert.rejects(api.recordStageCheckpoint(request),e=>e.code==='CHECKPOINT_QUESTION');
  const second=await api.recordStageCheckpoint({...request,record:{...request.record,answers:[{...request.record.answers[0],checkpointId:first.id}]}});
  await assert.rejects(api.recordStageCheckpoint({...request,requestId:randomUUID(),expectedPreviousId:second.id,record:{...request.record,answers:[{...request.record.answers[0],checkpointId:first.id}]}}),e=>e.code==='CHECKPOINT_QUESTION');
 });
});

test('actual worker mutation guard remains enabled',async t=>{
 const api=await import('../engine/stage-checkpoints.mjs');const f=await fixture(t);
 if(process.env.AGENT_WORKFLOW_WORKER!=='1'){t.skip('actual worker context absent');return;}
 await assert.rejects(api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:f.record}),e=>e.code==='CHECKPOINT_WORKER');
 await assert.rejects(api.recordVerificationCheck({...f.input,checkpointId:randomUUID(),checkId:'x',jobId:randomUUID()}),e=>e.code==='CHECKPOINT_WORKER');
 assert.equal(process.env.AGENT_WORKFLOW_WORKER,'1');
});

test('simultaneous predecessor claims append exactly one record and return a bounded conflict',async t=>{
 const api=await stageApi();const f=await fixture(t);
 await coordinator(async()=>{
  const result=await Promise.allSettled([0,1].map(()=>api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:f.record})));
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(result.find(r=>r.status==='rejected').reason.code,'CHECKPOINT_CONFLICT');
  assert.equal((await api.listStageCheckpoints(f.input)).items.length,1);
 });
});

test('nonempty objective references validate without coercion; unknown nested fields and case overlaps refuse',async t=>{
 const api=await stageApi();const f=await fixture(t);
 await coordinator(async()=>{
  const producer={run:f.run,generation:1,position:0,attempt:2};
  const artifact={producer,captureId:'d'.repeat(64),relativePath:'engine/module.mjs',sha256:'e'.repeat(64),bytes:1};
  const record={...f.record,artifacts:[artifact],objectives:[{id:'objective',artifactRefs:[artifact],checkIds:[],verifiers:[producer]}]};
  const first=await api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record});assert.equal(first.objectives[0].id,'objective');
  await assert.rejects(api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:first.id,record:{...record,artifacts:[artifact,{...artifact,relativePath:'ENGINE/module.mjs'}]}}),e=>e.code==='CHECKPOINT_INPUT');
  await assert.rejects(api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:first.id,record:{...record,objectives:[{...record.objectives[0],passed:true}]}}),e=>e.code==='CHECKPOINT_INPUT');
 });
});

test('checkpoint hash preimage agrees with the approved literal vector and rejects an included recordHash',async()=>{
 const canonical=(await stageApi()).canonical,decode=fixtureData;
 const preimage='{"answers":[],"artifacts":[],"checkRequirements":[],"createdAt":"2026-10-15T00:00:00.000Z","id":"00000000-0000-4000-8000-000000000001","integration":null,"nextTasks":[],"objectives":[],"originRun":{"dataInstanceId":"fixture","runId":"00000000-0000-4000-8000-000000000003","runtimeId":"fixture-runtime"},"outstandingQuestions":[],"parentCatalogHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","parentPolicyHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","planHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","previousId":null,"previousRecordHash":null,"recovery":[],"requestId":"00000000-0000-4000-8000-000000000002","schemaVersion":1,"scopeChanges":[]}';
 const expected='138d1c8f093dc1fb37004b8692b75658d15c0bae7bc4f4b2dbd02c49b4e40c72';
 assert.equal(hash(preimage),expected);assert.equal(canonical(decode(JSON.parse(preimage))),preimage);
 assert.notEqual(hash(canonical(decode({...JSON.parse(preimage),recordHash:expected}))),expected);
 const snapshot='{"baseCommit":"1111111111111111111111111111111111111111","canonicalRoot":"C:/fixture/integration","contentSha256":"9b399cb030c95d1243a3995f58528927a9dfa29c3aee063ce317af1e2468c46c","dependencies":[],"exclusions":{"entries":[],"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},"files":[],"root":"C:/fixture/integration","rootIdentity":{"dev":"1","ino":"2"},"schemaVersion":1}';
 assert.equal(hash(snapshot),'3994966a3819deb76d178aa3da97db9bfba8042d8701eb3385d76f2aadc8b682');
});

test('accessors and oversized current records are refused without evaluating getters',async t=>{
 const api=await stageApi();const f=await fixture(t);let observed=0;
 await coordinator(async()=>{
  const record={...f.record};Object.defineProperty(record,'planHash',{enumerable:true,get(){observed++;return 'a'.repeat(64);}});
  await assert.rejects(api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record}),e=>e.code==='CHECKPOINT_INPUT');assert.equal(observed,0);
  await assert.rejects(api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:{...f.record,objectives:Array.from({length:65},(_,i)=>({id:'objective'+i,artifactRefs:[],checkIds:[],verifiers:[]}))}}),e=>e.code==='CHECKPOINT_INPUT');
 });
});

test('a present legacy database without delivery tables is not migrated by inspection',async t=>{
 const api=await stageApi();const f=await fixture(t),dir=join(f.owner.runDir,'delivery-v1');await mkdir(dir);
 const file=join(dir,'stages.sqlite'),db=new DatabaseSync(file);db.exec('CREATE TABLE legacy(value TEXT)');db.close();const before=await readFile(file);
 await assert.rejects(api.listStageCheckpoints(f.input),e=>e.code==='CHECKPOINT_CORRUPT');assert.deepEqual(await readFile(file),before);
});
}

// R3 regressions: exact nested schemas, current paths, plan graph and role ceiling.
if(process.argv[1]===fileURLToPath(import.meta.url)&&process.execArgv.includes('--experimental-vm-modules')){
test('R3 refuses forged captureId and .git artifact paths',async t=>{
 const api=await stageApi(),f=await fixture(t),p={run:f.run,generation:1,position:0,attempt:1};
 for(const ref of [{producer:p,captureId:'invented',relativePath:'a.mjs',sha256:'d'.repeat(64),bytes:1},{producer:p,captureId:'e'.repeat(64),relativePath:'.git/config',sha256:'d'.repeat(64),bytes:1}]){
 await assert.rejects(api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:{...f.record,artifacts:[ref]}}),e=>e.code==='CHECKPOINT_INPUT');}
});
test('R3 permits planning directory prefixes and rejects case aliases and cyclic task plans',async t=>{
 const api=await stageApi(),f=await fixture(t);
 const task={id:'one',objectiveIds:[],ownedPaths:['engine/'],dependsOn:['unresolved'],roleSelections:{skills:[],requireTools:[]}};
 const first=await api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:{...f.record,nextTasks:[task]}});
 assert.deepEqual([...first.nextTasks[0].ownedPaths],['engine/']);
 for(const nextTasks of [[{...task,ownedPaths:['engine/','ENGINE/']}],[{...task,dependsOn:['two']},{...task,id:'two',dependsOn:['one']}]] ){
 await assert.rejects(api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:first.id,record:{...f.record,nextTasks}}),e=>['CHECKPOINT_INPUT','CHECKPOINT_SCOPE'].includes(e.code));}
});
}

export function realmSuite(file){if(!process.execArgv.includes('--experimental-vm-modules'))test('owned isolated fixture realm suite',async()=>{
 // Remove only Node's internal nested test-runner channel metadata. Preserve
 // every worker/session identity and never mutate the real process environment.
 const {NODE_TEST_CONTEXT:runnerChannel,...environment}=process.env;
 const result=await promisify(execFile)(process.execPath,['--experimental-vm-modules','--test','--test-reporter=spec',file],{windowsHide:true,maxBuffer:1048576,env:environment});
 assert.ok(result.stdout.includes('R3')&&/tests\s+[1-9][0-9]*/.test(result.stdout),'child must execute the owned suite');
});}
if(process.argv[1]===fileURLToPath(import.meta.url))realmSuite(fileURLToPath(import.meta.url));
if(process.argv[1]===fileURLToPath(import.meta.url)&&process.execArgv.includes('--experimental-vm-modules')){
test('R3 exact snapshot schema and top-level import refuse caller outcomes before provider access',async t=>{
 const api=await stageApi(),f=await fixture(t);
 await assert.rejects(api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:{...f.record,integration:{snapshot:{manifestSha256:'d'.repeat(64),passed:true},reviewedProducers:[],integratedArtifacts:[],verificationNonce:'v'}}}),e=>e.code==='CHECKPOINT_INPUT');
 await assert.rejects(api.recordVerificationCheck({...f.input,checkpointId:randomUUID(),checkId:'owned',jobId:randomUUID(),outcome:'passed'}),e=>e.code==='CHECKPOINT_INPUT');
});
test('R4 nonempty numeric snapshot matches the shared vector before retained provider access',async t=>{
 const api=await stageApi(),f=await fixture(t);
 const preimage='{"baseCommit":"1111111111111111111111111111111111111111","dependencies":[],"files":[{"bytes":8,"mode":100644,"path":"engine/example.mjs","sha256":"13550350a8681c84c861aac2e5b440161c2b33a3e4f302ac680ca5b686de48de"}]}';
 assert.equal(hash(preimage),'2d103b96bdce4e1a5286bab791c1e57b7a56a6c37294003866f031c163883dd2');
 const content=JSON.parse(preimage);
 const snapshot={schemaVersion:1,root:f.root,canonicalRoot:f.root,rootIdentity:{dev:'1',ino:'2'},...content,exclusions:{entries:[],sha256:hash('[]')},contentSha256:hash(preimage)};
 snapshot.manifestSha256=hash(canonical(snapshot));
 const input=snapshot=>({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:{...f.record,integration:{snapshot,reviewedProducers:[],integratedArtifacts:[],verificationNonce:'r4'}}});
 // The inert runtime deliberately has no jobs provider. This proves schema
 // admission only, never a positive filesystem snapshot or check receipt.
 await assert.rejects(api.recordStageCheckpoint(input(snapshot)),e=>e.code==='CHECKPOINT_UNSUPPORTED');
 for(const mode of ['100644','100755',0,100600]){
  const bad={...snapshot,files:[{...content.files[0],mode}]};
  bad.contentSha256=hash(canonical({...content,files:bad.files}));
  const {manifestSha256,...body}=bad;bad.manifestSha256=hash(canonical(body));
  await assert.rejects(api.recordStageCheckpoint(input(bad)),e=>e.code==='CHECKPOINT_INPUT');
 }
 assert.deepEqual((await api.listStageCheckpoints(f.input)).items,[]);
});
test('R3 task roles stay within the saved ceiling and ancestry cannot rebind plan hashes',async t=>{
 const api=await stageApi(),f=await fixture(t),first=await api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:f.record});
 const task={id:'one',objectiveIds:[],ownedPaths:['engine/'],dependsOn:[],roleSelections:{skills:['unadmitted'],requireTools:[]}};
 await assert.rejects(api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:first.id,record:{...f.record,nextTasks:[task]}}),e=>e.code==='CHECKPOINT_SCOPE');
 await assert.rejects(api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:first.id,record:{...f.record,parentCatalogHash:'e'.repeat(64)}}),e=>['CHECKPOINT_BINDING','CHECKPOINT_OWNERSHIP'].includes(e.code));
});
}

if(process.argv[1]===fileURLToPath(import.meta.url)&&process.execArgv.includes('--experimental-vm-modules')){
test('R3 broken path control is detected without mutating source or worker identity',async t=>{
 const originalMarker=process.env.AGENT_WORKFLOW_WORKER;const mutation=function allowGit(source){const from="p.toLowerCase()!=='.git'";assert.ok(source.includes(from));return source.replace(from,'true');};
 const api=(await fixtureModule('stage-checkpoints.mjs',mutation)).api,f=await fixture(t),producer={run:f.run,generation:1,position:0,attempt:1};
 const ref={producer,captureId:'e'.repeat(64),relativePath:'.git/config',sha256:'d'.repeat(64),bytes:1};
 const broken=await api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:{...f.record,artifacts:[ref]}});
 assert.equal(broken.artifacts[0].relativePath,'.git/config'); // the owning refusal assertion would fail
 assert.equal(process.env.AGENT_WORKFLOW_WORKER,originalMarker);
});
}

if(process.argv[1]===fileURLToPath(import.meta.url)&&process.execArgv.includes('--experimental-vm-modules')){
test('R3 predecessor CAS is shared across actual processes with no repeated writes',async t=>{
 const f=await fixture(t),api=await stageApi(),first=await api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:f.record});
 const source="import {stageApi} from "+JSON.stringify(import.meta.url)+";const api=await stageApi();try{const r=await api.recordStageCheckpoint(JSON.parse(process.argv[1]));console.log(JSON.stringify({status:'recorded',id:r.id}));}catch(e){console.log(JSON.stringify({status:'rejected',code:e.code}));}";
 const results=await Promise.all([0,1].map(()=>promisify(execFile)(process.execPath,['--experimental-vm-modules','--input-type=module','-e',source,JSON.stringify({...f.input,requestId:randomUUID(),expectedPreviousId:first.id,record:f.record})],{windowsHide:true,maxBuffer:65536})));
 const rows=results.map(r=>JSON.parse(r.stdout));assert.equal(rows.filter(r=>r.status==='recorded').length,1);assert.equal(rows.find(r=>r.status==='rejected').code,'CHECKPOINT_CONFLICT');assert.equal((await api.listStageCheckpoints(f.input)).items.length,2);
});
}

if(process.argv[1]===fileURLToPath(import.meta.url)&&process.execArgv.includes('--experimental-vm-modules')){
test('R3 schema refuses proxies without invoking traps',async t=>{
 const f=await fixture(t);let traps=0;const record=new Proxy(f.record,{getPrototypeOf(){traps++;return Object.prototype;},ownKeys(){traps++;return Reflect.ownKeys(f.record);}});
 // Direct probe avoids serializing caller data in the fixture transport.
 const {validateRecord}=(await fixtureModule('stage-checkpoints.mjs')).api;assert.throws(()=>validateRecord(record));assert.equal(traps,0);
});
}

if(process.argv[1]===fileURLToPath(import.meta.url)&&process.execArgv.includes('--experimental-vm-modules')){
test('R3 directory case aliases and genesis removals cannot enter the immutable plan',async t=>{
 const f=await fixture(t),api=await stageApi(),task={id:'one',objectiveIds:[],ownedPaths:['engine/','ENGINE/module.mjs'],dependsOn:[],roleSelections:{skills:[],requireTools:[]}};
 await assert.rejects(api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:{...f.record,nextTasks:[task]}}),e=>e.code==='CHECKPOINT_INPUT');
 const ref={producer:{run:f.run,generation:1,position:0,attempt:1},captureId:'d'.repeat(64),relativePath:'approval.json',sha256:'e'.repeat(64),bytes:1};
 await assert.rejects(api.recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:{...f.record,scopeChanges:[{addedObjectiveIds:[],removedObjectiveIds:['invisible'],authorization:ref}]}}),e=>e.code==='CHECKPOINT_SCOPE');
});
}
