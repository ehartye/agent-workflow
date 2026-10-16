import {types} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {lstat,realpath,mkdir,open} from 'node:fs/promises';
import {join,isAbsolute,relative,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolveRun,noLinks} from '../bin/managed-runtime.mjs';
import {fault} from '../foundation/client.mjs';

const MAX=1048576,QUOTA=1024;
const callerFields='schemaVersion originRun planHash parentPolicyHash parentCatalogHash objectives artifacts answers outstandingQuestions nextTasks recovery scopeChanges integration checkRequirements'.split(' ');
const generatedFields='id previousId previousRecordHash requestId createdAt recordHash'.split(' ');
const digest=x=>createHash('sha256').update(x).digest('hex');
function fail(code='INPUT'){throw fault('CHECKPOINT_'+code,`Delivery checkpoint ${code.toLowerCase().replaceAll('_',' ')}`);}
async function guarded(operation){try{return await operation();}catch(error){const code=error?.code==='ERR_SQLITE_ERROR'&&[5,6].includes(error.errcode)?'CONFLICT':error?.code?.replace(/^CHECKPOINT_/,'');fail(['INPUT','LIMIT','CORRUPT','WORKER','SESSION','OWNERSHIP','UNSUPPORTED','SNAPSHOT','CONFLICT','QUESTION','SCOPE','CURSOR','CHECK','OUTPUT','MISSING'].includes(code)?code:'UNAVAILABLE');}}
function argumentsOf(input,required,optional=[],mutation=false){
 if(mutation&&process.env.AGENT_WORKFLOW_WORKER==='1')fail('WORKER');
 bounded(input);requireValue(plain(input)&&required.every(k=>Object.hasOwn(input,k))&&Object.keys(input).every(k=>[...required,...optional].includes(k)));
 return input;
}
export async function recordStageCheckpoint(input){return guarded(()=>dorecordStageCheckpoint(argumentsOf(input,['dataDir','runId','sessionId','expectedPreviousId','requestId','record'],[],true)));}
export async function readStageCheckpoint(input){return guarded(()=>doreadStageCheckpoint(argumentsOf(input,['dataDir','runId','id'],['sessionId'])));}
export async function listStageCheckpoints(input){return guarded(()=>dolistStageCheckpoints(argumentsOf(input,['dataDir','runId'],['sessionId','after','limit'])));}
export async function recordVerificationCheck(input){return guarded(()=>dorecordVerificationCheck(argumentsOf(input,['dataDir','runId','sessionId','checkpointId','checkId','jobId'],[],true)));}
function requireValue(ok,code){if(!ok)fail(code);}
function plain(x){return !types.isProxy(x)&&x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;}
function shape(x,keys){requireValue(plain(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k)));}
function text(x,max=200){requireValue(typeof x==='string'&&x.length>0&&x.length<=max&&!x.includes('\0'));}
function id(x){text(x);requireValue(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(x));}
function uuid(x){requireValue(typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x));}
function sha(x){requireValue(typeof x==='string'&&/^[a-f0-9]{64}$/.test(x));}
function count(x,max=Number.MAX_SAFE_INTEGER){requireValue(Number.isSafeInteger(x)&&x>=0&&x<=max);}
function array(x,max){requireValue(Array.isArray(x)&&x.length<=max);}
function unique(x,key=x=>x){requireValue(new Set(x.map(v=>key(v))).size===x.length);}
function relativePath(x){text(x,1000);requireValue(!isAbsolute(x)&&!x.includes('\\')&&!x.includes(':')&&x.split('/').every(p=>p&&p!=='.'&&p!=='..'&&p.toLowerCase()!=='.git'&&!/[. ]$/.test(p)&&!/[<>"|?*\x00-\x1f]/.test(p)&&!/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p)));}
function pathAliases(paths){const seen=new Map();for(const path of paths){const parts=path.replace(/\/$/,'').split('/');for(let i=1;i<=parts.length;i++){const spelling=parts.slice(0,i).join('/'),key=spelling.toLowerCase();requireValue(!seen.has(key)||seen.get(key)===spelling);seen.set(key,spelling);}}}
function ownedPath(x){text(x,1000);relativePath(x.endsWith('/')?x.slice(0,-1):x);}
function runRef(x){shape(x,['dataInstanceId','runId','runtimeId']);id(x.dataInstanceId);uuid(x.runId);id(x.runtimeId);}
function producer(x){shape(x,['run','generation','position','attempt']);runRef(x.run);count(x.generation);requireValue(x.generation>0);count(x.position,999);count(x.attempt);}
function artifact(x){shape(x,['producer','captureId','relativePath','sha256','bytes']);producer(x.producer);sha(x.captureId);relativePath(x.relativePath);sha(x.sha256);count(x.bytes,536870912);}
function artifacts(x,max=256){array(x,max);x.forEach(artifact);unique(x,a=>canonical(a));}
function strings(x,max=64,validate=id){array(x,max);x.forEach(validate);unique(x);}
// Validate data without invoking toJSON/getters or accepting exotic prototypes.
function canonical(x,depth=0,budget={nodes:0}){
 requireValue(depth<=64&&++budget.nodes<=100000&&!types.isProxy(x));
 if(x===null||typeof x==='boolean'||typeof x==='string')return JSON.stringify(x);
 if(typeof x==='number'){requireValue(Number.isFinite(x));return JSON.stringify(x);}
 // Public caller shapes stay ordinary objects. Verified jobs-provider output
 // also uses inert null-prototype dictionaries; canonical comparisons must
 // accept those while refusing array overrides before map/species can run.
 requireValue(Array.isArray(x)?Object.getPrototypeOf(x)===Array.prototype:plain(x)||x!==null&&typeof x==='object'&&Object.getPrototypeOf(x)===null);
 const descriptors=Object.getOwnPropertyDescriptors(x);
 requireValue(Reflect.ownKeys(x).every(k=>typeof k==='string'&&(Array.isArray(x)&&k==='length'||descriptors[k].enumerable&&Object.hasOwn(descriptors[k],'value'))));
 if(Array.isArray(x)){requireValue(Object.keys(x).length===x.length&&Object.keys(x).every((k,i)=>k===String(i)));return`[${x.map(v=>canonical(v,depth+1,budget)).join(',')}]`;}
 return`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canonical(x[k],depth+1,budget)}`).join(',')}}`;
}
function bounded(x){const value=canonical(x);requireValue(Buffer.byteLength(value)<=MAX,'LIMIT');return value;}
// Schema validation is independent of the jobs provider. Hashes bind the exact
// common R2 preimages; filesystem verification still uses the retained provider.
function snapshot(x){
 shape(x,'schemaVersion root canonicalRoot rootIdentity baseCommit files exclusions dependencies contentSha256 manifestSha256'.split(' '));requireValue(x.schemaVersion===1);
 for(const p of [x.root,x.canonicalRoot]){text(p,2000);requireValue(isAbsolute(p));}
 shape(x.rootIdentity,['dev','ino']);for(const n of Object.values(x.rootIdentity))requireValue(typeof n==='string'&&/^\d{1,40}$/.test(n));
 requireValue(typeof x.baseCommit==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(x.baseCommit));
 array(x.files,20000);let total=0;const paths=[];
 for(const f of x.files){shape(f,['path','sha256','bytes','mode']);relativePath(f.path);sha(f.sha256);count(f.bytes,536870912);requireValue([100644,100755].includes(f.mode));total+=f.bytes;paths.push(f.path);}
 requireValue(total<=536870912&&canonical(paths)===canonical([...paths].sort()));unique(paths,p=>p.toLowerCase());pathAliases(paths);
 shape(x.exclusions,['entries','sha256']);array(x.exclusions.entries,100000);sha(x.exclusions.sha256);const excluded=[];
 for(const e of x.exclusions.entries){shape(e,['path','kind','bytes','mtimeMs','mode']);text(e.path,1000);if(e.path!=='.git')relativePath(e.path);requireValue(['file','directory'].includes(e.kind));if(e.kind==='file')count(e.bytes);else requireValue(e.bytes===null);requireValue(e.mtimeMs===null||typeof e.mtimeMs==='number'&&Number.isFinite(e.mtimeMs)&&e.mtimeMs>=0);if(e.mode!==null)count(e.mode);excluded.push(e.path);}
 unique(excluded,p=>p.toLowerCase());requireValue(canonical(excluded)===canonical([...excluded].sort())&&Buffer.byteLength(canonical(x.exclusions.entries))<=16777216&&digest(canonical(x.exclusions.entries))===x.exclusions.sha256);
 array(x.dependencies,20000);const ids=[];for(const d of x.dependencies){shape(d,['id','kind','path','sha256','bytes']);id(d.id);requireValue(['file','tree'].includes(d.kind));text(d.path,2000);requireValue(isAbsolute(d.path));sha(d.sha256);count(d.bytes,536870912);ids.push(d.id);}
 unique(ids);requireValue(canonical(ids)===canonical([...ids].sort()));sha(x.contentSha256);sha(x.manifestSha256);
 requireValue(x.contentSha256===digest(canonical({baseCommit:x.baseCommit,files:x.files,dependencies:x.dependencies.map(({id,kind,sha256,bytes})=>({id,kind,sha256,bytes}))})));
 const {manifestSha256,...preimage}=x;requireValue(manifestSha256===digest(canonical(preimage)));bounded(x);
}
function requirement(x){
 shape(x,['id','executable','executableSha256','argv','cwd','environmentHash','required','scope']);id(x.id);sha(x.executableSha256);sha(x.environmentHash);
 for(const path of [x.executable,x.cwd]){text(path,2000);requireValue(isAbsolute(path));}
 array(x.argv,255);x.argv.forEach(a=>{requireValue(typeof a==='string'&&!a.includes('\0'));});requireValue(Buffer.byteLength(JSON.stringify(x.argv))<=65536&&typeof x.required==='boolean');
 shape(x.scope,['mode','sourceSnapshotSha256','validationSnapshotSha256','ephemeralPrefixes']);sha(x.scope.sourceSnapshotSha256);sha(x.scope.validationSnapshotSha256);strings(x.scope.ephemeralPrefixes,64,relativePath);
 requireValue(['frozen','validation-copy'].includes(x.scope.mode));
 if(x.scope.mode==='frozen')requireValue(x.scope.sourceSnapshotSha256===x.scope.validationSnapshotSha256&&x.scope.ephemeralPrefixes.length===0);
}
function validateRecord(record){
 bounded(record);shape(record,callerFields);requireValue(record.schemaVersion===1);runRef(record.originRun);
 for(const key of ['planHash','parentPolicyHash','parentCatalogHash'])sha(record[key]);
 array(record.objectives,64);unique(record.objectives,x=>x.id);
 for(const x of record.objectives){shape(x,['id','artifactRefs','checkIds','verifiers']);id(x.id);artifacts(x.artifactRefs);strings(x.checkIds);array(x.verifiers,64);x.verifiers.forEach(p=>{if(p!==null)producer(p);});unique(x.verifiers.filter(Boolean),canonical);}
 artifacts(record.artifacts);unique(record.artifacts,a=>`${canonical(a.producer)}:${a.captureId}:${a.relativePath.toLowerCase()}`);
 array(record.answers,64);for(const x of record.answers){shape(x,['checkpointId','questionId','answer','source']);uuid(x.checkpointId);id(x.questionId);text(x.answer,8192);shape(x.source,['kind','reference']);requireValue(['coordinator','artifact'].includes(x.source.kind));if(x.source.kind==='artifact')artifact(x.source.reference);else text(x.source.reference,1000);}
 unique(record.answers,x=>x.checkpointId+':'+x.questionId);
 array(record.outstandingQuestions,64);unique(record.outstandingQuestions,x=>x.id);for(const x of record.outstandingQuestions){shape(x,['id','text','state']);id(x.id);text(x.text,8192);requireValue(['required','optional'].includes(x.state));}
 array(record.nextTasks,32);unique(record.nextTasks,x=>x.id);for(const x of record.nextTasks){shape(x,['id','objectiveIds','ownedPaths','dependsOn','roleSelections']);id(x.id);strings(x.objectiveIds);strings(x.ownedPaths,256,ownedPath);unique(x.ownedPaths,p=>p.toLowerCase());pathAliases(x.ownedPaths);strings(x.dependsOn,32);shape(x.roleSelections,['skills','requireTools']);strings(x.roleSelections.skills);strings(x.roleSelections.requireTools);}
 array(record.recovery,64);for(const x of record.recovery){shape(x,['producer','outcome','effects','cleanup','reconciliationRefs','replacementEligible','admissionRefs']);producer(x.producer);requireValue(['failed','unknown','cancelled','completed'].includes(x.outcome)&&['knownNone','reconciled','unknown'].includes(x.effects)&&typeof x.replacementEligible==='boolean');shape(x.cleanup,['serverExited','jobEmpty','forced','ownershipScope']);requireValue([true,false,null].includes(x.cleanup.serverExited)&&[true,false,null].includes(x.cleanup.jobEmpty)&&typeof x.cleanup.forced==='boolean'&&x.cleanup.ownershipScope==='windows-job-members');artifacts(x.reconciliationRefs,64);artifacts(x.admissionRefs,64);if(x.replacementEligible)requireValue(x.effects!=='unknown'&&x.cleanup.serverExited===true&&x.cleanup.jobEmpty===true&&!x.cleanup.forced&&x.reconciliationRefs.length>0&&x.admissionRefs.length>0);}
 array(record.scopeChanges,64);for(const x of record.scopeChanges){shape(x,['addedObjectiveIds','removedObjectiveIds','authorization']);strings(x.addedObjectiveIds);strings(x.removedObjectiveIds);artifact(x.authorization);requireValue(!x.addedObjectiveIds.some(id=>x.removedObjectiveIds.includes(id)));}
 array(record.checkRequirements,64);record.checkRequirements.forEach(requirement);unique(record.checkRequirements,x=>x.id);
 if(record.integration!==null){shape(record.integration,['snapshot','reviewedProducers','integratedArtifacts','verificationNonce']);id(record.integration.verificationNonce);array(record.integration.reviewedProducers,256);record.integration.reviewedProducers.forEach(producer);unique(record.integration.reviewedProducers,canonical);artifacts(record.integration.integratedArtifacts);snapshot(record.integration.snapshot);}
 const ids=new Set(record.objectives.map(x=>x.id)),checks=new Set(record.checkRequirements.map(x=>x.id)),refs=new Set(record.artifacts.map(a=>canonical(a)));
 for(const x of record.objectives){requireValue(x.checkIds.every(id=>checks.has(id)));requireValue(x.artifactRefs.every(a=>refs.has(canonical(a))));}
 for(const task of record.nextTasks)requireValue(task.objectiveIds.every(id=>ids.has(id)));
 return record;
}
async function savedHeader(owner){
 const path=join(owner.runDir,'run.sqlite');await noLinks(path);const st=await lstat(path);requireValue(st.isFile()&&st.nlink===1,'OWNERSHIP');
 const db=new DatabaseSync(path,{readOnly:true});try{const row=db.prepare('SELECT value,length(CAST(value AS BLOB)) bytes FROM header WHERE id=1').get();requireValue(row&&row.bytes<=2097152,'OWNERSHIP');const h=JSON.parse(row.value);requireValue(h.sessionId===owner.sessionId,'OWNERSHIP');return h;}finally{db.close();}
}
function ceiling(header,record){
 const policy=header.accessPolicy??header.launch?.accessPolicy;
 if(policy)requireValue(policy.fingerprint===record.parentPolicyHash&&(!header.launch?.accessPolicy||canonical(policy)===canonical(header.launch.accessPolicy)),'OWNERSHIP');
 if(header.parentCapabilitiesHash!==undefined)requireValue(header.parentCapabilitiesHash===record.parentCatalogHash,'OWNERSHIP');
 const manifest=header.workerCapabilities??header.launch?.workerCapabilities,skills=new Set((manifest?.skills??[]).map(s=>s.id)),tools=new Set((manifest?.tools??[]).map(t=>t.id));
 for(const task of record.nextTasks)requireValue(task.roleSelections.skills.every(id=>skills.has(id))&&task.roleSelections.requireTools.every(id=>tools.has(id)),'SCOPE');
}
async function ownerOf({dataDir,runId,sessionId},mutation=false){
 if(mutation&&process.env.AGENT_WORKFLOW_WORKER==='1')fail('WORKER');
 if(sessionId!==undefined)text(sessionId,256);else if(mutation)fail('SESSION');
 try{
  const owner=await resolveRun({dataDir,id:runId,sessionId});await noLinks(dataDir);const root=await realpath(dataDir),stat=await lstat(dataDir,{bigint:true});
  owner.ref={dataInstanceId:digest(JSON.stringify([process.platform==='win32'?root.toLowerCase():root,String(stat.dev),String(stat.ino),String(stat.birthtimeNs)])),runId:owner.id,runtimeId:owner.runtime.id};return owner;
 }catch{fail('OWNERSHIP');}
}
async function dbFile(owner,write=false){
 const directory=join(owner.runDir,'delivery-v1'),file=join(directory,'stages.sqlite');await noLinks(file);
 if(write)await mkdir(directory,{recursive:true,mode:0o700});
 try{const stat=await lstat(file);requireValue(stat.isFile()&&stat.nlink===1&&stat.size<=2200*MAX,'CORRUPT');}catch(e){if(e.code!=='ENOENT')throw e;if(!write)return null;}
 return file;
}
function database(file,write,initialize=false){
 const db=new DatabaseSync(file,{readOnly:!write});db.exec('PRAGMA busy_timeout=1000;');
 if(initialize)db.exec('CREATE TABLE IF NOT EXISTS stages(seq INTEGER PRIMARY KEY,id TEXT UNIQUE NOT NULL,request_id TEXT UNIQUE NOT NULL,request_hash TEXT NOT NULL,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS checks(seq INTEGER PRIMARY KEY,id TEXT UNIQUE NOT NULL,checkpoint_id TEXT NOT NULL,check_id TEXT NOT NULL,job_id TEXT NOT NULL,record_hash TEXT NOT NULL,value TEXT NOT NULL,UNIQUE(checkpoint_id,check_id,job_id));');
 return db;
}
function history(db,originRun){
 try{
  const size=db.prepare('SELECT count(*) n,max(length(CAST(value AS BLOB))) bytes FROM stages').get();requireValue(size.n<=QUOTA&&(size.bytes??0)<=MAX,'CORRUPT');
  const rows=db.prepare('SELECT * FROM stages ORDER BY seq').all(),records=[];
  for(const row of rows){
   const record=JSON.parse(row.value);bounded(record);shape(record,[...callerFields,...generatedFields]);
   const caller=Object.fromEntries(callerFields.map(k=>[k,record[k]]));validateRecord(caller);uuid(record.id);uuid(record.requestId);sha(record.recordHash);
   const previous=records.at(-1);requireValue(row.id===record.id&&row.request_id===record.requestId&&record.previousId===(previous?.id??null)&&record.previousRecordHash===(previous?.recordHash??null)&&canonical(record.originRun)===canonical(originRun),'CORRUPT');
   requireValue(typeof record.createdAt==='string'&&new Date(record.createdAt).toISOString()===record.createdAt,'CORRUPT');
   const {recordHash,...preimage}=record;requireValue(recordHash===digest(canonical(preimage)),'CORRUPT');
   requireValue(row.request_hash===digest(canonical({originRun,requestId:record.requestId,expectedPreviousId:record.previousId,record:caller})),'CORRUPT');
   validateAncestry(records,record);records.push(record);
  }
  return records;
 }catch{fail('CORRUPT');}
}
function validateAncestry(records,record){
 const answered=new Set(records.flatMap(r=>r.answers.map(a=>a.checkpointId+':'+a.questionId)));
 for(const a of record.answers){const target=records.find(r=>r.id===a.checkpointId),key=a.checkpointId+':'+a.questionId;requireValue(target?.outstandingQuestions.some(q=>q.id===a.questionId)&&!answered.has(key),'QUESTION');answered.add(key);}
 const tasks=new Map();for(const r of [...records,record])for(const task of r.nextTasks)tasks.set(task.id,task);
 const active=new Set(),done=new Set();function visit(id){if(done.has(id)||!tasks.has(id))return;requireValue(!active.has(id),'SCOPE');active.add(id);for(const d of tasks.get(id).dependsOn)visit(d);active.delete(id);done.add(id);}for(const id of tasks.keys())visit(id);
 const previous=records.at(-1);if(!previous){requireValue(record.answers.length===0,'QUESTION');requireValue(record.scopeChanges.every(c=>c.removedObjectiveIds.length===0&&c.addedObjectiveIds.every(id=>record.objectives.some(o=>o.id===id))),'SCOPE');return;}
 requireValue(['planHash','parentPolicyHash','parentCatalogHash'].every(k=>record[k]===previous[k]),'OWNERSHIP');
 const before=new Set(previous.objectives.map(o=>o.id)),now=new Set(record.objectives.map(o=>o.id));
 const added=record.scopeChanges.flatMap(c=>c.addedObjectiveIds),removed=record.scopeChanges.flatMap(c=>c.removedObjectiveIds);unique(added);unique(removed);
 requireValue(added.every(id=>!before.has(id)&&now.has(id))&&removed.every(id=>before.has(id)&&!now.has(id))&&[...now].every(id=>before.has(id)||added.includes(id))&&[...before].every(id=>now.has(id)||removed.includes(id)),'SCOPE');
}
async function provider(owner){
 const path=join(owner.runtime.path,'engine','command-jobs','index.mjs');
 try{await noLinks(path);requireValue((await lstat(path)).isFile(),'UNSUPPORTED');const module=await import(pathToFileURL(path).href);requireValue(typeof module.verifyIntegrationSnapshot==='function'&&typeof module.readCommandJob==='function','UNSUPPORTED');return module;}catch{fail('UNSUPPORTED');}
}
async function verifyIntegration(owner,record){if(record.integration){const jobs=await provider(owner),actual=await jobs.verifyIntegrationSnapshot(record.integration.snapshot);requireValue(canonical(actual)===canonical(record.integration.snapshot),'SNAPSHOT');}}

async function dorecordStageCheckpoint({dataDir,runId,sessionId,expectedPreviousId,requestId,record}){
 if(process.env.AGENT_WORKFLOW_WORKER==='1')fail('WORKER');
 validateRecord(record);uuid(requestId);if(expectedPreviousId!==null)uuid(expectedPreviousId);
 const owner=await ownerOf({dataDir,runId,sessionId},true);requireValue(canonical(record.originRun)===canonical(owner.ref),'OWNERSHIP');ceiling(await savedHeader(owner),record);
 const requestHash=digest(canonical({originRun:owner.ref,requestId,expectedPreviousId,record}));
 // No generated values, snapshot reads or CAS before exact request replay.
 const existing=await dbFile(owner),file=existing??await dbFile(owner,true),db=database(file,true,!existing);
 try{
  db.exec('BEGIN IMMEDIATE');const records=history(db,owner.ref),replay=db.prepare('SELECT * FROM stages WHERE request_id=?').get(requestId);
  if(replay){requireValue(replay.request_hash===requestHash,'CONFLICT');db.exec('COMMIT');return JSON.parse(replay.value);}
  requireValue(records.length<QUOTA,'LIMIT');const previous=records.at(-1);requireValue(expectedPreviousId===(previous?.id??null),'CONFLICT');validateAncestry(records,record);
  await verifyIntegration(owner,record);
  const value={...record,id:randomUUID(),previousId:expectedPreviousId,previousRecordHash:previous?.recordHash??null,requestId,createdAt:new Date().toISOString()};value.recordHash=digest(canonical(value));
  // A final one-item page has the larger boolean spelling (false). Admit new
  // records only when that complete envelope fits; historical replay is above.
  requireValue(Buffer.byteLength(JSON.stringify(checkpointPage([value],null,false)))<=MAX,'LIMIT');
  db.prepare('INSERT INTO stages(id,request_id,request_hash,value) VALUES(?,?,?,?)').run(value.id,requestId,requestHash,bounded(value));db.exec('COMMIT');return value;
 }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}finally{db.close();}
}
async function doreadStageCheckpoint({dataDir,runId,id:checkpointId}){
 uuid(checkpointId);const owner=await ownerOf({dataDir,runId}),file=await dbFile(owner);if(!file)return null;
 const db=database(file,false);try{db.exec('BEGIN');const records=history(db,owner.ref),header=await savedHeader(owner);for(const record of records)ceiling(header,record);return records.find(r=>r.id===checkpointId)??null;}finally{db.close();}
}
function checkpointPage(items,after,hasMore){return{available:true,items,nextCursor:items.at(-1)?.id??after,hasMore};}
async function dolistStageCheckpoints({dataDir,runId,after=null,limit=50}){
 if(after!==null)uuid(after);requireValue(Number.isSafeInteger(limit)&&limit>=1&&limit<=100);
 const owner=await ownerOf({dataDir,runId}),file=await dbFile(owner);if(!file)return{available:false,items:[],nextCursor:null,hasMore:false};
 const db=database(file,false);try{db.exec('BEGIN');const records=history(db,owner.ref),header=await savedHeader(owner);for(const record of records)ceiling(header,record);const offset=after===null?0:records.findIndex(r=>r.id===after)+1;requireValue(after===null||offset>0,'CURSOR');
  let page=checkpointPage([],after,offset<records.length);
  // History and the saved ceiling are verified in full before paging. These
  // inert records can be serialized without reapplying a per-record node budget
  // to the aggregate; the byte bound includes every response field.
  for(const record of records.slice(offset,offset+limit)){
   const candidate=checkpointPage([...page.items,record],after,offset+page.items.length+1<records.length);
   if(Buffer.byteLength(JSON.stringify(candidate))>MAX)break;
   page=candidate;
  }
  requireValue(page.items.length>0||!page.hasMore,'LIMIT');return page;
 }finally{db.close();}
}

function drain(cleanup){return cleanup?.serverExited===true&&cleanup.jobEmpty===true&&cleanup.forced===false&&cleanup.ownershipScope==='windows-job-members'&&cleanup.jobHost?.closeObserved===true&&cleanup.jobHost.exitCode===0&&cleanup.jobHost.signal==='none'&&cleanup.jobHost.receipt==='drained'&&!cleanup.error;}
function ownedOutput(owner,path){const r=typeof path==='string'&&isAbsolute(path)?relative(join(owner.runDir,'command-jobs-v1'),path):null;requireValue(r&&r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r),'OUTPUT');}
async function checkFromJob(owner,checkpoint,checkId,jobId,{dataDir,runId,sessionId}){
 const requirement=checkpoint.checkRequirements.find(r=>r.id===checkId);requireValue(requirement&&checkpoint.integration,'CHECK');
 const jobs=await provider(owner),job=await jobs.readCommandJob({dataDir,runId,sessionId,jobId});
 const inv=job?.invocation,verification=job?.verification,execution=job?.execution;
 requireValue(job?.schemaVersion===1&&job.jobId===jobId&&canonical(job.run)===canonical(owner.ref)&&verification?.checkpointId===checkpoint.id&&verification.checkId===checkId,'CHECK');
 requireValue(['succeeded','failed','cancelled','deadline','unknown'].includes(job.state)&&['observed','unknown'].includes(execution?.start)&&['passed','failed','cancelled','deadline','unknown'].includes(execution.outcome),'CHECK');
 if(execution.outcome==='passed')requireValue(job.state==='succeeded'&&execution.start==='observed'&&execution.exitCode===0&&drain(job.cleanup),'CHECK');
 requireValue(inv?.command?.[0]===requirement.executable&&canonical(inv.command.slice(1))===canonical(requirement.argv)&&inv.executableSha256===requirement.executableSha256&&inv.cwd===requirement.cwd&&inv.environmentHash===requirement.environmentHash&&inv.policyHash===checkpoint.parentPolicyHash&&inv.runtime?.id===owner.runtime.id&&inv.runtime.digest===owner.runtime.digest&&inv.runtime.dependencyHash===owner.runtime.dependenciesDigest,'CHECK');sha(inv.hash);
 requireValue(digest(await readBytes(requirement.executable,536870912))===requirement.executableSha256,'CHECK');
 requireValue(inv.runtime.nodeVersion===owner.runtime.node&&['inherit','shared'].includes(inv.runtime.session0Desktop),'CHECK');sha(inv.runtime.nodeExecutableSha256);
 const source=await jobs.verifyIntegrationSnapshot(checkpoint.integration.snapshot);requireValue(canonical(source)===canonical(checkpoint.integration.snapshot)&&source.manifestSha256===requirement.scope.sourceSnapshotSha256,'SNAPSHOT');
 requireValue(verification.snapshotBefore&&verification.snapshotAfter,'SNAPSHOT');const before=await jobs.verifyIntegrationSnapshot(verification.snapshotBefore),after=await jobs.verifyIntegrationSnapshot(verification.snapshotAfter);
 requireValue(canonical(before)===canonical(verification.snapshotBefore)&&canonical(after)===canonical(verification.snapshotAfter)&&canonical(before)===canonical(after)&&before.manifestSha256===requirement.scope.validationSnapshotSha256&&before.contentSha256===source.contentSha256&&inv.canonicalCwd===before.canonicalRoot,'SNAPSHOT');
 requireValue(canonical(before.dependencies.map(({id,kind,sha256,bytes})=>({id,kind,sha256,bytes})))===canonical(source.dependencies.map(({id,kind,sha256,bytes})=>({id,kind,sha256,bytes}))),'SNAPSHOT');
 const outputs={};for(const stream of ['stdout','stderr']){
  const output=job.output?.[stream];requireValue(output?.coverage==='complete'&&output.droppedBytes===0&&output.capReached===false&&output.retainedBytes===output.receivedBytes,'OUTPUT');
  ownedOutput(owner,output.path);const bytes=await readBytes(output.path,16777216);requireValue(bytes.length===output.retainedBytes&&digest(bytes)===output.sha256,'OUTPUT');outputs[stream]=output;
 }
 requireValue(job.output.chunkIndex,'OUTPUT');ownedOutput(owner,job.output.chunkIndex.path);const index=await readBytes(job.output.chunkIndex.path,MAX);requireValue(index.length===job.output.chunkIndex.bytes&&digest(index)===job.output.chunkIndex.sha256,'OUTPUT');outputs.chunkIndex=job.output.chunkIndex;
 // Recheck F after output/snapshot work immediately before a receipt can be appended.
 requireValue(canonical(await jobs.verifyIntegrationSnapshot(source))===canonical(source),'SNAPSHOT');
 requireValue(canonical(await jobs.readCommandJob({dataDir,runId,sessionId,jobId}))===canonical(job),'CHECK');
 return{schemaVersion:1,run:owner.ref,jobId,checkpointId:checkpoint.id,checkId,invocationHash:inv.hash,executable:inv.command[0],executableSha256:inv.executableSha256,argv:inv.command.slice(1),cwd:inv.cwd,environmentHash:inv.environmentHash,snapshotBefore:before,snapshotAfter:after,start:execution.start,outcome:execution.outcome,exitCode:execution.exitCode,outputRefs:outputs,cleanup:job.cleanup};
}
async function readBytes(path,max){
 try{await noLinks(path);const handle=await open(path,'r');try{const stat=await handle.stat();requireValue(stat.isFile()&&stat.nlink===1&&stat.size<=max,'OUTPUT');const bytes=Buffer.alloc(Math.min(stat.size+1,max+1));let size=0;while(size<bytes.length){const r=await handle.read(bytes,size,bytes.length-size,null);if(!r.bytesRead)break;size+=r.bytesRead;}requireValue(size<=max&&size===stat.size,'OUTPUT');const current=await lstat(path),after=await handle.stat();requireValue(current.dev===stat.dev&&current.ino===stat.ino&&current.nlink===1&&after.size===stat.size&&after.mtimeMs===stat.mtimeMs&&after.ctimeMs===stat.ctimeMs,'OUTPUT');return bytes.subarray(0,size);}finally{await handle.close();}}catch{fail('OUTPUT');}
}
async function dorecordVerificationCheck({dataDir,runId,sessionId,checkpointId,checkId,jobId}){
 if(process.env.AGENT_WORKFLOW_WORKER==='1')fail('WORKER');uuid(checkpointId);uuid(jobId);id(checkId);
 const owner=await ownerOf({dataDir,runId,sessionId},true),file=await dbFile(owner);requireValue(file,'MISSING');
 const db=database(file,true);try{
  const checkpoint=history(db,owner.ref).find(r=>r.id===checkpointId);requireValue(checkpoint,'MISSING');
  const value=await checkFromJob(owner,checkpoint,checkId,jobId,{dataDir,runId,sessionId});
  db.exec('BEGIN IMMEDIATE');history(db,owner.ref);const previous=db.prepare('SELECT * FROM checks WHERE checkpoint_id=? AND check_id=? AND job_id=?').get(checkpointId,checkId,jobId);
  if(previous){const receipt=JSON.parse(previous.value),{id:receiptId,...body}=receipt;requireValue(previous.record_hash===digest(canonical(receipt))&&canonical(body)===canonical(value),'CONFLICT');db.exec('COMMIT');return receipt;}
  requireValue(db.prepare('SELECT count(*) n FROM checks').get().n<QUOTA,'LIMIT');const receipt={...value,id:randomUUID()};const serialized=bounded(receipt);
  db.prepare('INSERT INTO checks(id,checkpoint_id,check_id,job_id,record_hash,value) VALUES(?,?,?,?,?,?)').run(receipt.id,checkpointId,checkId,jobId,digest(canonical(receipt)),serialized);db.exec('COMMIT');return receipt;
 }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}finally{db.close();}
}
