import {DatabaseSync} from 'node:sqlite';
import {lstat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {types} from 'node:util';
import {fault} from '../foundation/client.mjs';
import {closeAdmission} from './append.mjs';
import {strictJSON,exact,digest,isUuid,isCount,canonicalJSON,validateChildRef} from './composition-contracts.mjs';
import {contextRunRef,resolveCompositionRun} from './composition-store.mjs';

async function openRun(runDir,readOnly=false){
  if(!isAbsolute(runDir??''))throw fault('CONTROL_INPUT','An absolute run directory is required');
  const path=join(runDir,'run.sqlite');
  if(!(await lstat(runDir)).isDirectory()||!(await lstat(path)).isFile())throw fault('RUN_PATH','Control requires a regular run database');
  const db=new DatabaseSync(path,{readOnly});db.exec('PRAGMA busy_timeout=1000');return db;
}

export function validateDeadlineChange(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||types.isProxy(input))throw fault('CONTROL_INPUT','Deadline control requires own data fields');
  const fields=Object.getOwnPropertyDescriptors(input);
  if(Reflect.ownKeys(fields).some(key=>!['operation','expectedRevision','valueMs'].includes(key)||!Object.hasOwn(fields[key],'value')))throw fault('CONTROL_INPUT','Deadline control contains unsupported fields');
  const value=Object.fromEntries(Object.entries(fields).map(([key,descriptor])=>[key,descriptor.value]));
  if(!['set','extend','clear'].includes(value.operation)||!Number.isSafeInteger(value.expectedRevision)||value.expectedRevision<0||(value.operation==='clear'?Object.hasOwn(value,'valueMs'):!Number.isSafeInteger(value.valueMs)||value.valueMs<=0))throw fault('CONTROL_INPUT','Deadline control requires an operation, exact revision and positive safe milliseconds when applicable');
  return value;
}
export function assertWorkerTarget(worker,{action,attempt,turnId,deadline}){
  if(!worker||!['queued','running'].includes(worker.status)||worker.cancelRequested)throw fault('CONTROL_WORKER','Worker no longer accepts this live control');
  if((worker.attempts??0)!==attempt)throw fault('CONTROL_ATTEMPT','Control targets an outdated worker attempt');
  if((worker.activeTurn?.turnId??null)!==turnId)throw fault('CONTROL_TURN','Control targets an outdated worker turn');
  if(action==='steer'&&!worker.activeTurn)throw fault('CONTROL_TURN','Steering requires a confirmed active turn');
  if(action==='worker-deadline'){
    const change=validateDeadlineChange(deadline);
    if(worker.status!=='running'||!worker.deadline)throw fault('CONTROL_DEADLINE','Worker has no active deadline handle');
    if(worker.deadline.status==='expired')throw fault('DEADLINE_EXPIRED','Expired worker deadline cannot be revived');
    if(worker.deadline.status!=='active')throw fault('DEADLINE_CLOSED','Worker deadline no longer accepts changes');
    if(worker.deadline.revision!==change.expectedRevision)throw fault('DEADLINE_REVISION','Worker deadline revision changed');
  }
}
export async function requestControl(runDir,{sessionId,generation,action,position,attempt,turnId,text,deadline,requestId}){
  if(requestId!==undefined&&!isUuid(requestId))throw fault('CONTROL_INPUT','Preallocated requestId must be a lowercase UUID v4');
  const individual=['steer','cancel-worker','worker-deadline'].includes(action);
  if(!['pause','stop','steer','cancel-worker','worker-deadline'].includes(action)||!Number.isInteger(generation)||generation<1)throw fault('CONTROL_INPUT','Control requires a supported action and observed generation');
  if(individual&&(!Number.isInteger(position)||position<0||position>=1000||!Number.isInteger(attempt)||attempt<0||attempt>1000||turnId!==null&&(typeof turnId!=='string'||!turnId||turnId.length>200)))throw fault('CONTROL_INPUT','Worker controls require an exact position, attempt and nullable turn identity');
  if(action==='steer'&&(typeof text!=='string'||!text.trim()||text.length>8000))throw fault('CONTROL_INPUT','Steering requires bounded nonempty text');
  if(action==='worker-deadline')deadline=validateDeadlineChange(deadline);
  else if(deadline!==undefined)throw fault('CONTROL_INPUT','Deadline data requires a worker-deadline action');
  const db=await openRun(runDir);
  try{
    db.exec('BEGIN IMMEDIATE');
    const header=db.prepare('SELECT value FROM header WHERE id=1').get();
    if(!header)throw fault('CONTROL_MISSING','Run has no durable state');
    const state=JSON.parse(header.value);
    if(state.sessionId!==sessionId)throw fault('CONTROL_SESSION','Control belongs to a different originating session');
    const requestHash=requestId===undefined?null:digest({sessionId,generation,action,position:position??null,attempt:attempt??null,turnId:turnId??null,text:text??null,deadline:deadline??null});
    if(requestId!==undefined){const row=db.prepare('SELECT value FROM controls WHERE id=?').get(requestId);if(row){const old=JSON.parse(row.value);if(old.requestHash!==requestHash)throw fault('CONTROL_CONFLICT','Request identity was already used for another payload');db.exec('COMMIT');return old;}}
    if(state.generation!==generation)throw fault('CONTROL_GENERATION','Control targets an outdated run generation');
    if(state.acceptingControls!==true||!['running','pausing','stopping'].includes(state.status))throw fault('CONTROL_TERMINAL','Run no longer accepts live controls');
    if(individual){
      const row=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(generation,position);
      assertWorkerTarget(row?JSON.parse(row.value):null,{action,attempt,turnId,deadline});
      if(state.status==='stopping')throw fault('CONTROL_TERMINAL','Stopping run no longer accepts individual controls');
    }
    if(db.prepare("SELECT count(*) AS count FROM controls WHERE generation=? AND json_extract(value,'$.status') IN ('pending','applying')").get(generation).count>=256)throw fault('CONTROL_LIMIT','Too many outstanding controls');
    const receipt={id:requestId??randomUUID(),generation,action,status:'pending',requestedAt:new Date().toISOString(),...(requestHash?{requestHash}:{}),...(individual?{position,attempt,turnId}:{}),...(action==='steer'?{text}:{}),...(action==='worker-deadline'?{deadline}:{})};
    db.prepare('INSERT INTO controls(id,generation,value) VALUES(?,?,?)').run(receipt.id,generation,JSON.stringify(receipt));
    if(!individual)closeAdmission(db,generation);
    db.exec('COMMIT');return receipt;
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{db.close();}
}

export function validateDomainControl(request){
 const r=strictJSON(request,{code:'CONTROL_INPUT',maxBytes:16384});exact(r,['schemaVersion','requestId','expectedGeneration','action','payload'],[],'CONTROL_INPUT');if(r.schemaVersion!==1||!isUuid(r.requestId)||!Number.isSafeInteger(r.expectedGeneration)||r.expectedGeneration<1)throw fault('CONTROL_INPUT','Invalid domain control identity');
 if(['pause','stop'].includes(r.action)){exact(r.payload,['expectedAdmissionRevision'],[],'CONTROL_INPUT');if(!isCount(r.payload.expectedAdmissionRevision))throw fault('CONTROL_INPUT','Exact admission revision required');}
 else if(r.action==='cancel-child'){exact(r.payload,['child','expectedRevision'],[],'CONTROL_INPUT');validateChildRef(r.payload.child);if(!isCount(r.payload.expectedRevision))throw fault('CONTROL_INPUT','Exact child revision required');}
 else if(['refinement-limits','refinement-stop-after'].includes(r.action))throw fault('REFINEMENT_UNSUPPORTED','Artifact controls await reviewed provider integration');else throw fault('CONTROL_INPUT','Unsupported domain control action');return r;
}
export async function requestDomainControl({dataDir,run,sessionId,request}){
 request=validateDomainControl(request);const owner=await resolveCompositionRun({dataDir,run,sessionId}),db=await openRun(owner.runDir);
 try{db.exec('BEGIN IMMEDIATE');const state=JSON.parse(db.prepare('SELECT value FROM header WHERE id=1').get().value);if(state.sessionId!==sessionId||canonicalJSON(await contextRunRef({runDir:owner.runDir,sessionId}))!==canonicalJSON(run))throw fault('CONTROL_SESSION','Domain control binding differs');
  if(state.domainControlsVersion!==1)throw fault('COMPOSITION_UNSUPPORTED','Recorded runtime does not support domain controls');
  const requestHash=digest({run,sessionId,request}),old=db.prepare('SELECT request_hash,value FROM domain_controls WHERE request_id=?').get(request.requestId);if(old){if(old.request_hash!==requestHash)throw fault('CONTROL_CONFLICT','Request identity conflicts');const value=domainReceipt(db,JSON.parse(old.value));db.exec('COMMIT');return value;}
  if(state.generation!==request.expectedGeneration)throw fault('CONTROL_GENERATION','Domain control targets another generation');
  if(!state.acceptingControls||!['running','pausing'].includes(state.status))throw fault('CONTROL_TERMINAL','Domain control admission is closed');
  if(db.prepare("SELECT count(*) AS n FROM controls WHERE json_extract(value,'$.status') IN ('pending','applying')").get().n>=256||db.prepare('SELECT count(*) AS n FROM domain_controls').get().n>=10000)throw fault('CONTROL_LIMIT','Domain control retention or pending limit reached');
  let targetRevision;
  if(request.action==='cancel-child'){const child=request.payload.child;if(canonicalJSON(child.run)!==canonicalJSON(run)||child.generation!==state.generation)throw fault('CONTROL_GENERATION','Child binding differs');const row=db.prepare("SELECT value FROM invocations WHERE generation=? AND json_extract(value,'$.child.invocationId')=?").get(state.generation,child.invocationId),r=row?JSON.parse(row.value):null;if(!r||!['intent','running'].includes(r.status)||request.payload.expectedRevision!==0)throw fault('CONTROL_CONFLICT','Child revision or execution changed');targetRevision=0;}
  else{const a=JSON.parse(db.prepare('SELECT value FROM admission WHERE generation=?').get(state.generation).value);if(a.revision!==request.payload.expectedAdmissionRevision)throw fault('CONTROL_CONFLICT','Admission revision changed');targetRevision=a.revision;closeAdmission(db,state.generation);}
  const at=new Date().toISOString(),receipt={schemaVersion:1,requestId:request.requestId,requestHash,run,generation:state.generation,action:request.action,status:'pending',targetRevision,appliedRevision:null,requestedAt:at,settledAt:null,error:null};
  db.prepare('INSERT INTO domain_controls VALUES(?,?,?)').run(request.requestId,requestHash,canonicalJSON(receipt));db.prepare('INSERT INTO controls VALUES(?,?,?)').run(request.requestId,state.generation,canonicalJSON({id:request.requestId,generation:state.generation,action:request.action,status:'pending',requestedAt:at,domain:true,payload:request.payload}));db.exec('COMMIT');return receipt;
 }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}finally{db.close();}
}
function domainReceipt(db,receipt){const row=db.prepare('SELECT value FROM controls WHERE id=?').get(receipt.requestId);if(!row)throw fault('COMPOSITION_CORRUPT','Domain control lost its application record');const c=JSON.parse(row.value);if(c.generation!==receipt.generation||c.action!==receipt.action)throw fault('COMPOSITION_CORRUPT','Domain control application identity differs');return{...receipt,status:c.status,appliedRevision:c.status==='applied'?(receipt.targetRevision??0)+1:null,settledAt:['applied','rejected','unknown'].includes(c.status)?c.appliedAt??null:null,error:c.error?{code:c.error.code??'CONTROL_UNKNOWN',evidence:null}:null};}
export async function readDomainControl({dataDir,run,sessionId,requestId}){if(!isUuid(requestId))throw fault('CONTROL_INPUT','Exact UUID required');const owner=await resolveCompositionRun({dataDir,run,sessionId}),db=await openRun(owner.runDir,true);try{if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='domain_controls'").get())throw fault('COMPOSITION_UNSUPPORTED','Recorded runtime has no domain controls');const row=db.prepare('SELECT value FROM domain_controls WHERE request_id=?').get(requestId);if(!row)throw fault('CONTROL_MISSING','Domain control was not found');const r=JSON.parse(row.value);if(canonicalJSON(r.run)!==canonicalJSON(run))throw fault('CONTROL_SESSION','Domain control belongs to another run');return domainReceipt(db,r);}finally{db.close();}}

export async function readControl(runDir,id){
  const db=await openRun(runDir,true);
  try{const row=db.prepare('SELECT value FROM controls WHERE id=?').get(id);if(!row)throw fault('CONTROL_MISSING','Control receipt does not exist');return JSON.parse(row.value);}finally{db.close();}
}
