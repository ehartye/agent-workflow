import {DatabaseSync} from 'node:sqlite';
import {lstat,open} from 'node:fs/promises';
import {join,isAbsolute,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {fault} from '../foundation/client.mjs';
import {selectCapabilities} from './worker-capabilities.mjs';
import {MAX_WORKER_TIMEOUT_MS} from './deadlines.mjs';
import {loadInputs} from './workspaces.mjs';

const LIMIT=512*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function transaction(db,body){db.exec('BEGIN IMMEDIATE');try{const value=body();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
export function initializeAdmission(db,state){
 db.exec('CREATE TABLE IF NOT EXISTS admission(generation INTEGER PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS append_requests(generation INTEGER NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(generation,id)); CREATE TABLE IF NOT EXISTS append_tasks(generation INTEGER NOT NULL,position INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(generation,position));');
 db.prepare('INSERT INTO admission VALUES(?,?)').run(state.generation,JSON.stringify({version:1,generation:state.generation,revision:0,accepting:true,nextSlot:0,consumed:state.attempts??0,reserved:0,maxAgents:state.maxAgents}));
}
export function admission(db,generation){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='admission'").get())return null;
 const row=db.prepare('SELECT value FROM admission WHERE generation=?').get(generation);if(!row)return null;
 let value;try{value=JSON.parse(row.value);}catch{throw fault('APPEND_CORRUPT','Admission ledger is not JSON');}
 if(!value||value.version!==1||value.generation!==generation||typeof value.accepting!=='boolean'||!['revision','nextSlot','consumed','reserved','maxAgents'].every(key=>Number.isSafeInteger(value[key])&&value[key]>=0)||value.maxAgents<1||value.maxAgents>1000||value.nextSlot>value.maxAgents||value.reserved>value.nextSlot||value.consumed+value.reserved>value.maxAgents)throw fault('APPEND_CORRUPT','Admission ledger counters or identity are invalid');return value;
}
function saveAdmission(db,value){value.revision++;db.prepare('UPDATE admission SET value=? WHERE generation=?').run(JSON.stringify(value),value.generation);}
export function projectAdmission(db,state){const value=admission(db,state.generation);if(value)Object.assign(state,{attempts:value.consumed,reservedAttempts:value.reserved,workerCount:value.nextSlot,acceptingAdditions:value.accepting,admissionRevision:value.revision});return state;}
export function allocateSlot(db,generation,{reserve=true}={}){return transaction(db,()=>{
 const value=admission(db,generation);if(!value)throw fault('APPEND_UNSUPPORTED','Runtime has no generation admission ledger');
 if(value.nextSlot>=value.maxAgents||reserve&&value.consumed+value.reserved>=value.maxAgents)throw fault('AGENT_LIMIT','No lifetime worker capacity remains');
 const position=value.nextSlot++;if(reserve)value.reserved++;saveAdmission(db,value);return position;
});}
export function consumeAttempt(db,generation,{reserved=false,position,allowPaused=false}={}){return transaction(db,()=>{
 const value=admission(db,generation);
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='controls'").get()){
  const blocked=db.prepare("SELECT value FROM controls WHERE generation=? AND json_extract(value,'$.action') IN ('pause','stop') AND json_extract(value,'$.status') IN ('pending','applied')").all(generation).map(row=>JSON.parse(row.value));
  if(blocked.some(control=>control.action==='stop'||!allowPaused))throw Object.assign(fault('RUN_STOPPED','Committed run control closed dispatch admission'),{notStarted:true});
 }
 if(reserved?value.reserved<1:value.consumed+value.reserved>=value.maxAgents)throw fault('AGENT_LIMIT','No lifetime worker attempt remains');
 if(reserved)value.reserved--;value.consumed++;saveAdmission(db,value);
 if(position!==undefined){const row=db.prepare('SELECT value FROM append_tasks WHERE generation=? AND position=?').get(generation,position);if(row){const task=JSON.parse(row.value);if(task.delivery!=='queued')throw fault('APPEND_UNKNOWN','Dispatch intent already exists; reconcile effects before restarting');task.delivery='active';task.dispatchedAt=new Date().toISOString();db.prepare('UPDATE append_tasks SET value=? WHERE generation=? AND position=?').run(JSON.stringify(task),generation,position);}}
 return value.consumed;
});}
export function releaseReservation(db,generation){return transaction(db,()=>{const value=admission(db,generation);if(value.reserved<1)throw fault('APPEND_CORRUPT','Missing undispatched reservation');value.reserved--;saveAdmission(db,value);});}
// Called inside the same transaction as Pause/Stop or terminal publication.
export function closeAdmission(db,generation){const value=admission(db,generation);if(value?.accepting){value.accepting=false;saveAdmission(db,value);}}
// The controller calls this in its startup rollback transaction, before enabling
// either the guest or inbox dispatcher. Retain acknowledged request identities.
export function abandonUnstartedAdmission(db,generation,error){
 if(db.prepare('SELECT count(*) AS n FROM workers WHERE generation=?').get(generation).n||pendingAdditions(db,generation).some(task=>task.delivery!=='queued'))throw fault('APPEND_UNKNOWN','Startup already has execution evidence; reconcile instead of abandoning');
 const requests=db.prepare('SELECT id,value FROM append_requests WHERE generation=?').all(generation);
 if(!requests.length){db.prepare('DELETE FROM append_tasks WHERE generation=?').run(generation);db.prepare('DELETE FROM admission WHERE generation=?').run(generation);return;}
 for(const row of requests){const value=JSON.parse(row.value);if(value.status!=='rejected'){value.status='rejected';value.error=error;value.rejectedAt=new Date().toISOString();db.prepare('UPDATE append_requests SET value=? WHERE generation=? AND id=?').run(JSON.stringify(value),generation,row.id);}}
 const value=admission(db,generation);value.accepting=false;value.reserved=0;saveAdmission(db,value);
}
export function pendingAdditions(db,generation){
 const rows=db.prepare('SELECT position,CASE WHEN length(CAST(value AS BLOB))<=2097152 THEN value ELSE NULL END AS value FROM append_tasks WHERE generation=? ORDER BY position LIMIT 1001').all(generation);
 if(rows.length>1000)throw fault('APPEND_CORRUPT','Saved addition count exceeds the worker limit');
 const ledger=admission(db,generation);
 if(!ledger)throw fault('APPEND_CORRUPT','Saved additions require their admission ledger');
 return rows.map(row=>{
  if(typeof row.value!=='string')throw fault('APPEND_CORRUPT','Saved addition exceeds the 2 MiB row limit');
  let task;try{task=JSON.parse(row.value);}catch{throw fault('APPEND_CORRUPT','Saved addition is not JSON');}
  if(!object(task)||!Number.isInteger(row.position)||row.position<0||row.position>=ledger.nextSlot||task.position!==row.position||!['queued','active'].includes(task.delivery)||task.origin?.kind!=='append'||!Number.isInteger(task.origin.generation)||task.origin.generation<1||task.origin.generation>generation||!uuid.test(task.origin.requestId??'')||typeof task.origin.taskId!=='string'||!task.origin.taskId.trim()||task.origin.taskId.length>200||typeof task.prompt!=='string'||!task.prompt.trim()||task.prompt.length>65536||!object(task.options)||typeof task.key!=='string'||!/^[a-f0-9]{64}$/.test(task.key))throw fault('APPEND_CORRUPT','Saved addition identity or delivery is invalid');
  return task;
 });
}
// Read-only projection shared by saved-run, monitor and notification readers.
// A committed dispatch intent is not evidence that native submission began.
export function projectAdditionWorkers(db,state,workers){
 if(state.appendVersion===undefined)return workers;
 if(state.appendVersion!==1)throw fault('APPEND_UNSUPPORTED','Saved addition schema is unsupported');
 const ledger=admission(db,state.generation);
 if(!ledger||workers.length>1000)throw fault('APPEND_CORRUPT','Saved workers require bounded admission evidence');
 const projected=new Map();
 for(const worker of workers){
  if(!object(worker)||!Number.isInteger(worker.position)||worker.position<0||worker.position>=ledger.nextSlot||projected.has(worker.position))throw fault('APPEND_CORRUPT','Saved worker positions are inconsistent');
  projected.set(worker.position,worker);
 }
 for(const task of pendingAdditions(db,state.generation)){
  const saved=projected.get(task.position);
  if(saved&&canonical(saved.origin)!==canonical(task.origin))throw fault('APPEND_CORRUPT','Saved addition and worker origins disagree');
  let worker=saved??{...task,status:'queued',cached:false};
  if(task.delivery==='active'&&worker.status==='queued')worker={...worker,status:'unknown',dispatchUnconfirmed:true,error:worker.error??{code:'APPEND_UNKNOWN',message:'A dispatch intent was committed without confirmed running evidence; reconcile effects before repeating work'}};
  projected.set(task.position,worker);
 }
 return[...projected.values()].sort((a,b)=>a.position-b.position);
}
export function appendInputIdentity(state){
 const defaults=state.launch?.defaults??{},writer=defaults.workspace==='isolated'||defaults.permissions?.sandbox==='workspace-write';
 if(writer){if(!state.workspaceInputs)throw fault('APPEND_INPUTS','Original verified captured inputs are not ready');return{mode:'originalCapturedInputs',inputs:state.workspaceInputs};}
 return{mode:'originalLiveDirectory',directory:state.launch?.cwd??null};
}
function identities(state,runDir){return{runId:basename(runDir),runtimeIdentity:state.runtimeIdentity,backendIdentity:state.backendIdentity,accessFingerprint:state.accessPolicy?.fingerprint??null,workerCapabilitiesHash:state.workerCapabilitiesHash??null,parentCapabilitiesHash:state.parentCapabilitiesHash??null,capturePolicyHash:state.capturePolicyHash??null,input:appendInputIdentity(state)};}
export async function normalizeAppendTasks(tasks,manifest,{checkCapabilities=true}={}){
 if(!Array.isArray(tasks)||tasks.length<1||tasks.length>32)throw fault('APPEND_INPUT','Append requires 1..32 independent tasks');
 const ids=new Set(),normalized=[];
 for(const task of tasks){
  if(!object(task)||Object.keys(task).some(key=>!['id','prompt','options'].includes(key))||typeof task.id!=='string'||!task.id.trim()||task.id.length>200||ids.has(task.id)||typeof task.prompt!=='string'||!task.prompt.trim()||task.prompt.length>65536)throw fault('APPEND_INPUT','Task IDs must be unique and bounded; prompts require 1..65536 UTF-16 units');
  ids.add(task.id);const options=Object.hasOwn(task,'options')?task.options:{};
  if(!object(options)||Object.keys(options).some(key=>!['label','phase','skills','requireTools','timeoutMs','schema'].includes(key))||['label','phase'].some(key=>options[key]!=null&&(typeof options[key]!=='string'||options[key].length>500))||options.timeoutMs!=null&&(!Number.isInteger(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>MAX_WORKER_TIMEOUT_MS))throw fault('APPEND_INPUT','Unsupported appended task options');
  if(checkCapabilities)selectCapabilities(manifest,options);
  if(Object.hasOwn(options,'schema')){const {compileSchema}=await import('./schema.mjs');compileSchema(options.schema);}
  normalized.push({id:task.id,prompt:task.prompt,options:JSON.parse(JSON.stringify(options,(_,value)=>{if(['undefined','function','symbol','bigint'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))throw fault('APPEND_INPUT','Task options must be JSON');return value;}))});
 }
 if(Buffer.byteLength(canonical({tasks:normalized}))>LIMIT)throw fault('APPEND_LIMIT','Normalized task payload exceeds 512 KiB');return normalized;
}
export async function readAppendTasks(path){
 if(typeof path!=='string'||!(await lstat(path)).isFile())throw fault('APPEND_INPUT','tasks-file must be a regular UTF8 JSON file');
 const handle=await open(path,'r');try{
  if(!(await handle.stat()).isFile())throw fault('APPEND_INPUT','tasks-file must be regular');
  const buffer=Buffer.alloc(LIMIT+1);let size=0;while(size<buffer.length){const {bytesRead}=await handle.read(buffer,size,buffer.length-size,null);if(!bytesRead)break;size+=bytesRead;}
  if(size>LIMIT)throw fault('APPEND_LIMIT','tasks-file exceeds 512 KiB');
  let payload;try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer.subarray(0,size)));}catch{throw fault('APPEND_INPUT','tasks-file must contain strict UTF8 JSON');}
  if(!object(payload)||Object.keys(payload).length!==1||!Object.hasOwn(payload,'tasks'))throw fault('APPEND_INPUT','tasks-file must contain exactly {tasks:[...]}');
  // The run capability ceiling is checked during admission, not file loading.
  return await normalizeAppendTasks(payload.tasks,undefined,{checkCapabilities:false});
 }finally{await handle.close();}
}
async function openRun(runDir,readOnly=false){
 if(!isAbsolute(runDir??'')||!(await lstat(runDir)).isDirectory()||!(await lstat(join(runDir,'run.sqlite'))).isFile())throw fault('RUN_PATH','Append requires a regular saved run database');
 const db=new DatabaseSync(join(runDir,'run.sqlite'),{readOnly});db.exec('PRAGMA busy_timeout=1000');return db;
}
function receipt(db,generation,requestId){
 const row=db.prepare('SELECT value FROM append_requests WHERE generation=? AND id=?').get(generation,requestId);if(!row)throw fault('APPEND_MISSING','Append receipt does not exist');
 const value=JSON.parse(row.value);
 if(value.status==='rejected')return value;
 value.tasks=value.tasks.map(task=>{
  const worker=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(generation,task.position),record=worker?JSON.parse(worker.value):null;
  const intent=db.prepare('SELECT value FROM append_tasks WHERE generation=? AND position=?').get(generation,task.position);
  const delivery=intent?JSON.parse(intent.value):null;
  const status=delivery?.delivery==='active'&&(!record||record.status==='queued')?'unknown':record?.status??'queued';
  const outcome=record?.status==='failed'&&(record.error?.code==='TURN_CANCELLED'||record.notStarted&&['WORKER_CANCELLED','RUN_STOPPED'].includes(record.error?.code))?'cancelled':status;
  return{...task,status,...(['completed','failed','cancelled'].includes(outcome)?{outcome}:{}),...(record?.startedAt?{startedAt:record.startedAt}:{}),...(record?.completedAt||record?.settledAt?{settledAt:record.completedAt??record.settledAt}:{}),...(record?.error?{error:record.error}:{}),...(record&&Object.hasOwn(record,'result')?{result:record.result}:{})};
 });
 value.status=value.tasks.some(task=>task.status==='unknown')?'unknown':value.tasks.every(task=>['completed','failed'].includes(task.status))?'settled':value.tasks.some(task=>task.status==='running')?'active':'queued';return value;
}
export async function requestAppend(runDir,{sessionId,generation,requestId,tasks}){
 if(typeof sessionId!=='string'||!sessionId||!Number.isInteger(generation)||generation<1||!uuid.test(requestId??''))throw fault('APPEND_INPUT','Append requires originating session, exact generation and UUID request ID');
 requestId=requestId.toLowerCase();
 const db=await openRun(runDir);
 try{
  const before=JSON.parse(db.prepare('SELECT value FROM header WHERE id=1').get()?.value??'null');
  if(before?.appendVersion!==1||!admission(db,before.generation))throw fault('APPEND_UNSUPPORTED','This retained runtime does not support live append; start a new run with the candidate runtime');
  if(before.sessionId!==sessionId)throw fault('APPEND_SESSION','Append belongs to another originating session');
  if(before.generation!==generation)throw fault('APPEND_GENERATION','Append targets an outdated generation');
  const normalized=await normalizeAppendTasks(tasks,before.workerCapabilities),identity=identities(before,runDir);
  if(identity.input.mode==='originalCapturedInputs')await loadInputs(identity.input.inputs);
  const payloadHash=digest({tasks:normalized,identity});
  const admitted=transaction(db,()=>{
   const state=JSON.parse(db.prepare('SELECT value FROM header WHERE id=1').get().value);
   if(state.sessionId!==sessionId)throw fault('APPEND_SESSION','Originating session changed');
   if(state.generation!==generation)throw fault('APPEND_GENERATION','Run generation changed');
   if(canonical(identities(state,runDir))!==canonical(identity))throw fault('APPEND_IDENTITY','Original runtime, authority or inputs changed');
   const prior=db.prepare('SELECT value FROM append_requests WHERE generation=? AND id=?').get(generation,requestId);
   if(prior){if(JSON.parse(prior.value).payloadHash!==payloadHash)throw fault('APPEND_CONFLICT','Request ID already names another payload');return receipt(db,generation,requestId);}
   const ledger=admission(db,generation);
   const rejected=!ledger.accepting||!['running','finishing'].includes(state.status)?{code:'APPEND_CLOSED',message:'Run addition admission is closed'}:ledger.nextSlot+normalized.length>ledger.maxAgents||ledger.consumed+ledger.reserved+normalized.length>ledger.maxAgents?{code:'AGENT_LIMIT',message:'Batch exceeds remaining lifetime worker capacity'}:null;
   if(rejected){const value={version:1,generation,requestId,payloadHash,identity,status:'rejected',requestedAt:new Date().toISOString(),tasks:[],error:rejected};db.prepare('INSERT INTO append_requests VALUES(?,?,?)').run(generation,requestId,JSON.stringify(value));return value;}
   const requestedAt=new Date().toISOString(),accepted=normalized.map(task=>{
    const position=ledger.nextSlot++,origin={kind:'append',generation,requestId,taskId:task.id};
    db.prepare('INSERT INTO append_tasks VALUES(?,?,?)').run(generation,position,JSON.stringify({position,origin,prompt:task.prompt,options:task.options,key:digest({origin,task,identity}),delivery:'queued',requestedAt}));
    return{id:task.id,position,origin,status:'queued'};
   });
   ledger.reserved+=normalized.length;saveAdmission(db,ledger);
   const value={version:1,generation,requestId,payloadHash,identity,status:'queued',requestedAt,acceptedAt:requestedAt,tasks:accepted};
   db.prepare('INSERT INTO append_requests VALUES(?,?,?)').run(generation,requestId,JSON.stringify(value));return value;
  });
  if(admitted.status==='rejected')throw Object.assign(fault(admitted.error.code,admitted.error.message),{receipt:admitted});return admitted;
 }finally{db.close();}
}
export async function readAppendReceipt(runDir,{generation,requestId}){
 if(!Number.isInteger(generation)||generation<1||!uuid.test(requestId??''))throw fault('APPEND_INPUT','Receipt inspection requires generation and UUID request ID');
 const db=await openRun(runDir,true);try{db.exec('BEGIN');if(!admission(db,generation))throw fault('APPEND_UNSUPPORTED','Retained runtime has no append receipts');return receipt(db,generation,requestId.toLowerCase());}finally{db.close();}
}
