/** @lane merge
 * @subject engine/delivery-acceptance.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {fixture,coordinator,stageApi,acceptanceApi,fixtureModule,realmSuite,fixtureData,sizedRecord} from './engine-stage-checkpoints.test.mjs';
const recordStageCheckpoint=async input=>(await stageApi()).recordStageCheckpoint(input);

const hash=x=>createHash('sha256').update(x).digest('hex');
async function worker(f,value,generation=1,position=0){const db=new DatabaseSync(join(f.owner.runDir,'run.sqlite'));db.prepare('INSERT OR REPLACE INTO workers VALUES(?,?,?)').run(generation,position,JSON.stringify(value));const header=JSON.parse(db.prepare('SELECT value FROM header WHERE id=1').get().value);header.generation=Math.max(header.generation,generation);db.prepare('UPDATE header SET value=? WHERE id=1').run(JSON.stringify(header));db.close();}
const completed=()=>{const result={status:'complete',missing:[]};return{position:0,status:'completed',attempts:1,attemptOffset:0,result,resultHash:hash(JSON.stringify(result)),evidence:{attempts:[{number:1,status:'completed'}],cleanup:{serverExited:true,jobEmpty:true,forced:false,ownershipScope:'windows-job-members',nativeTerminals:{inventoryEmpty:true}}}};};
async function checkpoint(f,verifiers,extra={}){return coordinator(()=>recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:null,record:{...f.record,objectives:[{id:'assembly',artifactRefs:[],checkIds:[],verifiers}],...extra}}));}
const request=(f,checkpointId)=>({schemaVersion:1,run:f.run,planHash:f.record.planHash,checkpointId,objectiveIds:['assembly']});

realmSuite(fileURLToPath(import.meta.url));
if(process.execArgv.includes('--experimental-vm-modules')){
test('caller passed/complete claims cannot grant acceptance',async()=>{
 const {assembleDeliveryAcceptance}=await acceptanceApi();
 await assert.rejects(assembleDeliveryAcceptance({dataDir:process.cwd(),sessionId:'fixture',request:{schemaVersion:1,passed:true,complete:true}}),e=>e.code==='ACCEPTANCE_INPUT');
});

test('R4 objective IDs reject sparse named arrays and exotic inputs before ownership',async()=>{
 const {assembleDeliveryAcceptance}=await import('../engine/delivery-acceptance.mjs');
 const base={schemaVersion:1,run:{dataInstanceId:'fixture',runId:randomUUID(),runtimeId:'fixture-runtime'},planHash:'a'.repeat(64),checkpointId:randomUUID(),objectiveIds:['assembly']};
 const input=objectiveIds=>({dataDir:null,sessionId:'fixture',request:{...base,objectiveIds}});
 // The valid control reaches ownership; invalid inputs must fail earlier.
 await assert.rejects(assembleDeliveryAcceptance(input(['assembly'])),e=>e.code==='ACCEPTANCE_OWNERSHIP');
 let callbacks=0;
 const sparse=Array(1);sparse.named='assembly';
 const subclass=new(class extends Array{})('assembly');
 const accessor=['assembly'];Object.defineProperty(accessor,0,{enumerable:true,get(){callbacks++;return 'assembly';}});
 const proxy=new Proxy(['assembly'],{getPrototypeOf(){callbacks++;return Array.prototype;},ownKeys(){callbacks++;return ['0','length'];},get(){callbacks++;return 'assembly';}});
 const named=['assembly'];named.extra='assembly';
 for(const [label,value] of [['sparse-named',sparse],['subclass',subclass],['accessor',accessor],['proxy',proxy],['named',named]]){
  await assert.rejects(assembleDeliveryAcceptance(input(value)),e=>e.code==='ACCEPTANCE_INPUT',label);
 }
 assert.equal(callbacks,0);
});

test('R4 deterministic provider refusals retain output and snapshot categories',async()=>{
 const {reason}=(await fixtureModule('delivery-acceptance.mjs')).api;
 for(const [code,fallback,expected] of [['JOB_OUTPUT','evidence_unavailable','check_output'],['JOB_SNAPSHOT','evidence_unavailable','check_snapshot'],['JOB_SNAPSHOT','integration_snapshot_unavailable','integration_snapshot_drift']]){
  const row={status:'accepted',reasons:[]};reason(row,{code},fallback);
  assert.equal(row.status,'rejected',code);assert.deepEqual(row.reasons,[expected]);
 }
 for(const code of ['JOB_UNAVAILABLE','JOB_UNKNOWN','ERR_CONNECTION_RESET',undefined]){
  const row={status:'accepted',reasons:[]};reason(row,{code});
  assert.equal(row.status,'unknown');assert.deepEqual(row.reasons,['evidence_unavailable']);
 }
});

test('missing ledger produces explicit missing objectives and no filesystem writes',async t=>{
 const api=await acceptanceApi();const f=await fixture(t);
 const result=await api.assembleDeliveryAcceptance({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,randomUUID())});
 assert.equal(result.complete,false);assert.deepEqual(result.missingObjectiveIds,['assembly']);
 await assert.rejects(lstat(join(f.owner.runDir,'delivery-v1')),e=>e.code==='ENOENT');
});

test('stale cumulative attempt and a completed worker declaring blocked remain rejected',async t=>{
 const api=await acceptanceApi();const f=await fixture(t);await worker(f,completed());
 const p={run:f.run,generation:1,position:0,attempt:0},cp=await checkpoint(f,[p]);
 const before=await readFile(join(f.owner.runDir,'delivery-v1','stages.sqlite'));
 const result=await api.assembleDeliveryAcceptance({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,cp.id)});
 assert.equal(result.rows[0].status,'rejected');assert.ok(result.rows[0].reasons.includes('producer_stale_attempt'));
 const w=completed();w.result.status='blocked';w.resultHash=hash(JSON.stringify(w.result));await worker(f,w);
 const f2=await fixture(t);await worker(f2,w);const cp2=await checkpoint(f2,[{...p,run:f2.run,attempt:1}]);
 const blocked=await api.assembleDeliveryAcceptance({dataDir:f2.dataDir,sessionId:f2.input.sessionId,request:request(f2,cp2.id)});assert.equal(blocked.rows[0].status,'rejected');assert.ok(blocked.rows[0].reasons.includes('producer_declared_outcome'));
 assert.deepEqual(await readFile(join(f.owner.runDir,'delivery-v1','stages.sqlite')),before);
});

test('cached verifier and unknown cleanup cannot satisfy fresh acceptance',async t=>{
 const api=await acceptanceApi();const f=await fixture(t);const w=completed();await worker(f,w);
 await worker(f,{...w,cached:true,reusedFrom:{generation:1,position:0},sourceGeneration:1,sourcePosition:0},2);
 const cp=await checkpoint(f,[{run:f.run,generation:2,position:0,attempt:1}]);
 const result=await api.assembleDeliveryAcceptance({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,cp.id)});assert.equal(result.rows[0].status,'rejected');assert.ok(result.rows[0].reasons.includes('cached_verifier'));
 const f2=await fixture(t),unknown=completed();unknown.evidence.cleanup.jobEmpty=null;await worker(f2,unknown);const cp2=await checkpoint(f2,[{run:f2.run,generation:1,position:0,attempt:1}]);
 assert.equal((await api.assembleDeliveryAcceptance({dataDir:f2.dataDir,sessionId:f2.input.sessionId,request:request(f2,cp2.id)})).rows[0].status,'unknown');
});

test('cross-instance producer and a forged result hash are security rejections, null verifier stays missing',async t=>{
 const api=await acceptanceApi();const f=await fixture(t),w=completed();w.resultHash='0'.repeat(64);await worker(f,w);
 const cp=await checkpoint(f,[{run:f.run,generation:1,position:0,attempt:1},{run:{...f.run,dataInstanceId:'forged'},generation:1,position:0,attempt:1},null]);
 const result=await api.assembleDeliveryAcceptance({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,cp.id)});assert.equal(result.rows[0].status,'rejected');assert.ok(result.rows[0].reasons.includes('producer_result_hash'));assert.ok(result.rows[0].reasons.includes('producer_ownership'));assert.ok(result.rows[0].reasons.includes('verifier_missing'));
});

test('required questions survive omission in a later checkpoint',async t=>{
 const api=await acceptanceApi();const f=await fixture(t);
 const first=await checkpoint(f,[],{outstandingQuestions:[{id:'scope',text:'Proceed?',state:'required'}]});
 const second=await coordinator(()=>recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:first.id,record:{...f.record,objectives:first.objectives}}));
 const result=await api.assembleDeliveryAcceptance({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,second.id)});assert.equal(result.complete,false);assert.ok(result.rows[0].reasons.includes('required_question_open'));
});

test('replacing a previously selected unknown producer requires recorded reconciliation',async t=>{
 const api=await acceptanceApi();const f=await fixture(t),old=completed();old.status='unknown';await worker(f,old);
 const first=await checkpoint(f,[{run:f.run,generation:1,position:0,attempt:1}]);
 const replacement=completed();replacement.position=1;await worker(f,replacement,1,1);
 const second=await coordinator(()=>recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:first.id,record:{...f.record,objectives:[{...first.objectives[0],verifiers:[{run:f.run,generation:1,position:1,attempt:1}]}]}}));
 const result=await api.assembleDeliveryAcceptance({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,second.id)});assert.equal(result.rows[0].status,'unknown');assert.ok(result.rows[0].reasons.includes('recovery_missing'));
});

test('a forged capture identity is rejected even before an integration snapshot exists',async t=>{
 const api=await acceptanceApi();const f=await fixture(t),w=completed();w.workspace={manifestHash:'b'.repeat(64)};await worker(f,w);
 const producer={run:f.run,generation:1,position:0,attempt:1},artifact={producer,captureId:'c'.repeat(64),relativePath:'engine/module.mjs',sha256:'d'.repeat(64),bytes:1};
 const cp=await checkpoint(f,[producer],{artifacts:[artifact],objectives:[{id:'assembly',artifactRefs:[artifact],checkIds:[],verifiers:[producer]}]});
 const result=await api.assembleDeliveryAcceptance({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,cp.id)});assert.equal(result.rows[0].status,'rejected');assert.ok(result.rows[0].reasons.includes('artifact_capture'));
});

test('an earlier checkpoint cannot ignore later revisions across more than eleven byte pages',async t=>{
 const api=await acceptanceApi(),stage=await stageApi(),f=await fixture(t),records=[];
 const record=sizedRecord({...f,record:{...f.record,objectives:[{id:'assembly',artifactRefs:[],checkIds:[],verifiers:[]}]}},600000);
 for(let i=0;i<12;i++)records.push(await recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:records.at(-1)?.id??null,record}));
 assert.equal((await stage.listStageCheckpoints({...f.input,limit:100})).items.length,1,'each large record requires its own byte-limited page');
 const input=checkpointId=>({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,checkpointId)});
 const result=await api.assembleDeliveryAcceptance(input(records[0].id));assert.equal(result.rows[0].status,'rejected');assert.ok(result.rows[0].reasons.includes('checkpoint_stale'));
 const current=await api.assembleDeliveryAcceptance(input(records.at(-1).id));assert.equal(current.complete,false);assert.equal(current.rows[0].status,'missing');assert.ok(!current.rows[0].reasons.includes('checkpoint_stale'));
});

test('checkpoint history consumer refuses duplicate, empty and inconsistent cursor pages',async t=>{
 const f=await fixture(t),cp=await checkpoint(f,[]);
 // Exercise the public assembler with real SQLite reads, then damage only the
 // provider response in the owned fixture realm. No live provider is replaced.
 function response(source,body){const from="import {readStageCheckpoint,listStageCheckpoints} from './stage-checkpoints.mjs';";assert.ok(source.includes(from));return source.replace(from,"import {readStageCheckpoint,listStageCheckpoints as actualList} from './stage-checkpoints.mjs';\nconst listStageCheckpoints=async input=>{const page=await actualList(input);"+body+"};");}
 const duplicate=function duplicatePage(source){return response(source,'return {...page,items:[...page.items,...page.items]};');};
 const empty=function emptyContinuation(source){return response(source,'return {...page,items:[],hasMore:true};');};
 const cursor=function inconsistentCursor(source){return response(source,'return {...page,nextCursor:input.after};');};
 for(const mutate of [duplicate,empty,cursor]){
  const {assembleDeliveryAcceptance}=(await fixtureModule('delivery-acceptance.mjs',mutate)).api;
  await assert.rejects(assembleDeliveryAcceptance({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,cp.id)}),e=>e.code==='ACCEPTANCE_CURSOR',mutate.name);
 }
});

test('a forged scope authorization cannot hide an objective as removed',async t=>{
 const api=await acceptanceApi();const f=await fixture(t),w=completed();w.workspace={manifestHash:'b'.repeat(64)};await worker(f,w);
 const producer={run:f.run,generation:1,position:0,attempt:1};
 const authorization={producer,captureId:'c'.repeat(64),relativePath:'approval.json',sha256:'d'.repeat(64),bytes:1};
 const first=await checkpoint(f,[]);
 const second=await coordinator(()=>recordStageCheckpoint({...f.input,requestId:randomUUID(),expectedPreviousId:first.id,record:{...f.record,objectives:[],scopeChanges:[{addedObjectiveIds:[],removedObjectiveIds:['assembly'],authorization}]}}));
 await assert.rejects(api.assembleDeliveryAcceptance({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,second.id)}),e=>e.code==='ACCEPTANCE_AUTHORIZATION');
});

// Opt-in contains bounded coordinator-prepared JSON REFERENCES, never passed
// receipts. An authentic outer check binds these bytes through its immutable
// environmentHash and the recorder's private inherited environment. Genuine
// inner evidence already exists in the original data instance; it is read only.
// This adds no external snapshot dependency or pre-created V fixture prefix.
const integrationFixture=process.env.AGENT_WORKFLOW_ACCEPTANCE_FIXTURE;
test('authentic completed-partial acceptance and genuine evidence negatives',{skip:!integrationFixture?'notRun: actual jobs/capture providers and disposable integration fixture absent':process.env.AGENT_WORKFLOW_WORKER==='1'?'notRun: integration belongs to the coordinator':false},async()=>{
 assert.ok(typeof integrationFixture==='string'&&Buffer.byteLength(integrationFixture)<=65536,'Acceptance fixture references must fit the bounded JSON input');
 let fixture;try{fixture=JSON.parse(integrationFixture);}catch{assert.fail('Acceptance fixture references must be JSON');}
 const keys=['dataDir','negatives','partialProducer','positive','sessionId'];
 assert.ok(fixture&&typeof fixture==='object'&&!Array.isArray(fixture)&&Object.keys(fixture).length===keys.length&&keys.every(k=>Object.hasOwn(fixture,k)),'Acceptance fixture must contain only the five reference fields');
 assert.ok(typeof fixture.dataDir==='string'&&fixture.dataDir.length<=4096&&isAbsolute(fixture.dataDir)&&!fixture.dataDir.includes('\0'));
 assert.ok(typeof fixture.sessionId==='string'&&fixture.sessionId.length>0&&fixture.sessionId.length<=256);
 const api=await import('../engine/delivery-acceptance.mjs');
 const db=new DatabaseSync(join(fixture.dataDir,'runs-v2',fixture.partialProducer.run.runId,'run.sqlite'),{readOnly:true});
 let before;try{before=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(fixture.partialProducer.generation,fixture.partialProducer.position).value;}finally{db.close();}
 assert.equal(JSON.parse(before).result.status,'partial');
 const input=request=>({dataDir:fixture.dataDir,sessionId:fixture.sessionId,request});
 const positive=await api.assembleDeliveryAcceptance(input(fixture.positive));
 assert.equal(positive.complete,true);assert.ok(positive.rows.every(r=>r.status==='accepted'&&r.artifactRefs.length>0&&r.checkReceiptIds.length>0));
 // Root supplies genuine capture/job providers: a nonempty file must cross
 // the numeric snapshot / string Git capture boundary without coercion.
 const {readStageCheckpoint}=await import('../engine/stage-checkpoints.mjs');
 const cp=await readStageCheckpoint({dataDir:fixture.dataDir,runId:fixture.positive.run.runId,id:fixture.positive.checkpointId});
 assert.ok(cp.integration.snapshot.files.length>0,'positive must use a nonempty provider-verified snapshot');
 assert.ok(cp.integration.snapshot.files.every(f=>f.mode===100644||f.mode===100755));
 assert.ok(positive.rows.some(r=>r.artifactRefs.some(a=>cp.integration.snapshot.files.some(f=>f.path===a.relativePath&&f.sha256===a.sha256&&f.bytes===a.bytes))),'actual captured bytes must occur in the integrated snapshot');
 assert.ok(positive.rows.some(r=>r.producers.some(p=>JSON.stringify(p)===JSON.stringify(fixture.partialProducer))));
 assert.ok(new Set(positive.rows.flatMap(r=>r.producers.map(p=>JSON.stringify(p)))).size>=2);
 assert.deepEqual(fixture.negatives.map(x=>x.kind).sort(),['blocked','cached','failed','null','owned-gap','output-corrupt','snapshot-drift'].sort());
 const expectedReasons={blocked:['producer_declared_outcome'],cached:['cached_verifier'],failed:['producer_execution_failed'],null:['verifier_missing'],'owned-gap':['artifact_missing','artifacts_missing','check_missing'],'output-corrupt':['check_output'],'snapshot-drift':['integration_snapshot_drift','check_snapshot']};
 for(const negative of fixture.negatives){const out=await api.assembleDeliveryAcceptance(input(negative.request));assert.equal(out.complete,false,negative.kind);assert.ok(out.rows.some(r=>r.status!=='accepted'&&r.reasons.some(reason=>expectedReasons[negative.kind].includes(reason))),negative.kind);}
 const after=new DatabaseSync(join(fixture.dataDir,'runs-v2',fixture.partialProducer.run.runId,'run.sqlite'),{readOnly:true});
 try{assert.equal(after.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(fixture.partialProducer.generation,fixture.partialProducer.position).value,before);}finally{after.close();}
});

test('R3 completed partial producer retains its genuine limitation and attempt evidence',async t=>{
 const f=await fixture(t),w=completed();w.result={status:'partial',missing:['future external acceptance']};w.resultHash=hash(JSON.stringify(w.result));await worker(f,w);
 const {readProducer}=(await fixtureModule('delivery-acceptance.mjs')).api;
 const p=await readProducer({...f.input,run:f.run},{run:f.run,generation:1,position:0,attempt:1});
 assert.equal(p.worker.result.status,'partial');assert.deepEqual(Array.from(p.worker.result.missing),['future external acceptance']);
});

test('R3 completed partial cannot hide an unresolved owned artifact or check',async t=>{
 const f=await fixture(t),w=completed();w.result={status:'partial',missing:['anything']};w.resultHash=hash(JSON.stringify(w.result));await worker(f,w);
 const cp=await checkpoint(f,[null]);const out=await(await acceptanceApi()).assembleDeliveryAcceptance({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,cp.id)});
 assert.equal(out.complete,false);assert.ok(out.rows[0].reasons.includes('artifacts_missing'));assert.ok(out.rows[0].reasons.includes('checks_missing'));
});
test('R3 lineage refuses forged attemptOffset and prior execution aliases',async t=>{
 const f=await fixture(t),w=completed();w.priorExecutions=[{generation:0,position:0}];await worker(f,w);
 const cp=await checkpoint(f,[{run:f.run,generation:1,position:0,attempt:1}]);const out=await(await acceptanceApi()).assembleDeliveryAcceptance({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,cp.id)});
 assert.equal(out.rows[0].status,'rejected');
});
test('R3 producer attemptOffset requires actual prior executions and queued zero remains unknown',async t=>{
 const f=await fixture(t),w=completed();w.attempts=4;w.attemptOffset=3;await worker(f,w);
 const api=await acceptanceApi(),cp=await checkpoint(f,[{run:f.run,generation:1,position:0,attempt:4}]);
 const out=await api.assembleDeliveryAcceptance({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,cp.id)});
 assert.ok(out.rows[0].reasons.includes('producer_lineage_missing'));
 const g=await fixture(t);await worker(g,{position:0,status:'queued',cached:false});const q=await checkpoint(g,[{run:g.run,generation:1,position:0,attempt:0}]);
 const pending=await api.assembleDeliveryAcceptance({dataDir:g.dataDir,sessionId:g.input.sessionId,request:request(g,q.id)});assert.equal(pending.rows[0].status,'unknown');
});
test('R3 capture paths are checked before provider availability can hide a forged reference',async t=>{
 const f=await fixture(t),w=completed();w.attempts=1;w.attemptOffset=0;
 w.workspace={manifestHash:'e'.repeat(64),manifestPath:join(f.root,'foreign.json'),artifactsDir:f.root};await worker(f,w);
 const producer={run:f.run,generation:1,position:0,attempt:1},ref={producer,captureId:'e'.repeat(64),relativePath:'a.mjs',sha256:'d'.repeat(64),bytes:1};
 const cp=await checkpoint(f,[],{artifacts:[ref],objectives:[{id:'assembly',artifactRefs:[ref],checkIds:[],verifiers:[null]}]});
 const out=await(await acceptanceApi()).assembleDeliveryAcceptance({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,cp.id)});assert.equal(out.rows[0].status,'rejected');assert.ok(out.rows[0].reasons.includes('artifact_capture_path'));
});
test('R3 real persisted lineage translates attempts and preserves cached implementation provenance',async t=>{
 const f=await fixture(t),origin={kind:'guest',ordinal:0},old=completed();old.origin=origin;old.attempts=3;old.evidence.attempts=[1,2,3].map(number=>({number,status:'completed'}));await worker(f,old);
 const next=completed();next.origin=origin;next.attempts=4;next.attemptOffset=3;next.priorExecutions=[{generation:1,position:0}];await worker(f,next,2);
 const {readProducer}=(await fixtureModule('delivery-acceptance.mjs')).api,context={...f.input,run:f.run};
 assert.equal((await readProducer(context,{run:f.run,generation:2,position:0,attempt:4})).reference.attempt,4);
 await worker(f,{...next,cached:true,reusedFrom:{generation:2,position:0},sourceGeneration:2,sourcePosition:0},3);
 const ref={run:f.run,generation:3,position:0,attempt:4};const cached=await readProducer(context,ref);assert.equal(cached.reference.generation,2);assert.equal(cached.cached,true);
 await assert.rejects(readProducer(context,ref,true),e=>e.reason==='cached_verifier');
});
test('R3 authentic manifest and blob bytes reject corruption; R4 snapshot/capture mode bridge is strict',async t=>{
 const f=await fixture(t),w=completed(),artifactsDir=join(f.owner.runDir,'workspaces','fixture-'+randomUUID()),dir=join(artifactsDir,'result');await mkdir(join(dir,'blobs'),{recursive:true});
 const artifactName='owned/entry.bin';
 const bytes=Buffer.from([0,1,255]),sha256=hash(bytes),blobPath=join(dir,'blobs',sha256);await writeFile(blobPath,bytes);
 const manifest=JSON.stringify({files:[{name:artifactName,mode:'100644',size:3,sha256,blobPath}]});const manifestPath=join(dir,'manifest.json');await writeFile(manifestPath,manifest);w.workspace={artifactsDir,manifestPath,manifestHash:hash(manifest)};await worker(f,w);
 const producer={run:f.run,generation:1,position:0,attempt:1},ref={producer,captureId:hash(manifest),relativePath:artifactName,sha256,bytes:3};
 const cp=await checkpoint(f,[],{artifacts:[ref],objectives:[{id:'assembly',artifactRefs:[ref],checkIds:[],verifiers:[null]}]});
 const api=await acceptanceApi(),input={dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,cp.id)};const unavailable=await api.assembleDeliveryAcceptance(input);assert.equal(unavailable.rows[0].status,'unknown');
 // Run-wide protected paths include other isolated writers' outputs. The
 // public assembler must preserve provider unavailability for this artifact,
 // rather than reject its valid bytes because a foreign output is absent.
 w.workspace.missingProtectedPaths=['foreign/provider.mjs'];await worker(f,w);
 const foreign=await api.assembleDeliveryAcceptance(input);
 assert.equal(foreign.rows[0].status,'unknown');assert.ok(foreign.rows[0].reasons.includes('retained_provider_unavailable'));
 assert.ok(!foreign.rows[0].reasons.includes('artifact_missing'));assert.equal(foreign.complete,false);
 for(const missing of [[artifactName],['owned/'],['OWNED/'],['../foreign.mjs'],null]){
  w.workspace.missingProtectedPaths=missing;await worker(f,w);
  const blocked=await api.assembleDeliveryAcceptance(input);
  assert.equal(blocked.rows[0].status,'rejected');assert.ok(blocked.rows[0].reasons.includes('artifact_missing'));assert.equal(blocked.complete,false);
 }
 w.workspace.missingProtectedPaths=[];await worker(f,w);
 const {resolveArtifact}=(await fixtureModule('delivery-acceptance.mjs')).api;
 const integrated={...cp,integration:{reviewedProducers:[producer],integratedArtifacts:[ref]}};
 const snapshot=mode=>({files:[{path:ref.relativePath,sha256,bytes:3,mode}]});
 // Real saved fixture rows and raw blob/manifest bytes reach the provider
 // boundary. These are fixtures, not genuine native captures or receipts.
 await assert.rejects(resolveArtifact({...f.input,run:f.run},ref,integrated,snapshot(100644)),e=>e.status==='unknown'&&e.reason==='retained_provider_unavailable');
 for(const mode of ['100644',100755,null])await assert.rejects(resolveArtifact({...f.input,run:f.run},ref,integrated,snapshot(mode)),e=>e.status==='rejected'&&e.reason==='integrated_bytes');
 for(const [captureMode,snapshotMode,expected] of [['100755',100755,'retained_provider_unavailable'],[100644,100644,'artifact_manifest'],[100755,100755,'artifact_manifest']]){
  const changed=JSON.stringify({files:[{name:artifactName,mode:captureMode,size:3,sha256,blobPath}]});
  await writeFile(manifestPath,changed);w.workspace.manifestHash=hash(changed);await worker(f,w);
  const changedRef={...ref,captureId:hash(changed)},changedCheckpoint={...integrated,integration:{reviewedProducers:[producer],integratedArtifacts:[changedRef]}};
  await assert.rejects(resolveArtifact({...f.input,run:f.run},changedRef,changedCheckpoint,snapshot(snapshotMode)),e=>e.reason===expected);
 }
 const omitted=JSON.stringify({files:[]});await writeFile(manifestPath,omitted);w.workspace.manifestHash=hash(omitted);await worker(f,w);
 await assert.rejects(resolveArtifact({...f.input,run:f.run},{...ref,captureId:hash(omitted)},integrated,snapshot(100644)),e=>e.reason==='artifact_manifest');
 await writeFile(manifestPath,manifest);w.workspace.manifestHash=hash(manifest);await worker(f,w);
 await writeFile(blobPath,Buffer.from([0,2,255]));const corrupt=await api.assembleDeliveryAcceptance(input);assert.equal(corrupt.rows[0].status,'rejected');assert.ok(corrupt.rows[0].reasons.includes('artifact_blob'));
});
test('R3 unresolved task dependencies remain missing for their objectives',async t=>{
 const f=await fixture(t),cp=await checkpoint(f,[],{nextTasks:[{id:'work',objectiveIds:['assembly'],ownedPaths:['engine/'],dependsOn:['absent'],roleSelections:{skills:[],requireTools:[]}}]});
 const out=await(await acceptanceApi()).assembleDeliveryAcceptance({dataDir:f.dataDir,sessionId:f.input.sessionId,request:request(f,cp.id)});assert.ok(out.rows[0].reasons.includes('task_dependency_missing'));
});
test('R3 broken universal-complete control rejects the genuine partial source',async t=>{
 const f=await fixture(t),w=completed();w.result={status:'partial',missing:['future integration']};w.resultHash=hash(JSON.stringify(w.result));await worker(f,w);
 const mutation=function universalComplete(source){const from="['complete','partial'].includes(r.status)";assert.ok(source.includes(from));return source.replace(from,"['complete'].includes(r.status)");};
 const {readProducer}=(await fixtureModule('delivery-acceptance.mjs',mutation)).api;
 await assert.rejects(readProducer({...f.input,run:f.run},{run:f.run,generation:1,position:0,attempt:1}),e=>e.reason==='producer_declared_outcome');
});
}
