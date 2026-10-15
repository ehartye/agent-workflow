import {DatabaseSync} from 'node:sqlite';
import {lstat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {types} from 'node:util';
import {fault} from '../foundation/client.mjs';
import {closeAdmission} from './append.mjs';

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
export async function requestControl(runDir,{sessionId,generation,action,position,attempt,turnId,text,deadline}){
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
    if(state.generation!==generation)throw fault('CONTROL_GENERATION','Control targets an outdated run generation');
    if(state.acceptingControls!==true||!['running','pausing','stopping'].includes(state.status))throw fault('CONTROL_TERMINAL','Run no longer accepts live controls');
    if(individual){
      const row=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(generation,position);
      assertWorkerTarget(row?JSON.parse(row.value):null,{action,attempt,turnId,deadline});
      if(state.status==='stopping')throw fault('CONTROL_TERMINAL','Stopping run no longer accepts individual controls');
    }
    if(db.prepare("SELECT count(*) AS count FROM controls WHERE generation=? AND json_extract(value,'$.status') IN ('pending','applying')").get(generation).count>=256)throw fault('CONTROL_LIMIT','Too many outstanding controls');
    const receipt={id:randomUUID(),generation,action,status:'pending',requestedAt:new Date().toISOString(),...(individual?{position,attempt,turnId}:{}),...(action==='steer'?{text}:{}),...(action==='worker-deadline'?{deadline}:{})};
    db.prepare('INSERT INTO controls(id,generation,value) VALUES(?,?,?)').run(receipt.id,generation,JSON.stringify(receipt));
    if(!individual)closeAdmission(db,generation);
    db.exec('COMMIT');return receipt;
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{db.close();}
}

export async function readControl(runDir,id){
  const db=await openRun(runDir,true);
  try{const row=db.prepare('SELECT value FROM controls WHERE id=?').get(id);if(!row)throw fault('CONTROL_MISSING','Control receipt does not exist');return JSON.parse(row.value);}finally{db.close();}
}
