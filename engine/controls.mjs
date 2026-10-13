import {DatabaseSync} from 'node:sqlite';
import {lstat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fault} from '../foundation/client.mjs';

async function openRun(runDir,readOnly=false){
  if(!isAbsolute(runDir??''))throw fault('CONTROL_INPUT','An absolute run directory is required');
  const path=join(runDir,'run.sqlite');
  if(!(await lstat(runDir)).isDirectory()||!(await lstat(path)).isFile())throw fault('RUN_PATH','Control requires a regular run database');
  const db=new DatabaseSync(path,{readOnly});db.exec('PRAGMA busy_timeout=1000');return db;
}

export function assertWorkerTarget(worker,{action,attempt,turnId}){
  if(!worker||!['queued','running'].includes(worker.status)||worker.cancelRequested)throw fault('CONTROL_WORKER','Worker no longer accepts this live control');
  if((worker.attempts??0)!==attempt)throw fault('CONTROL_ATTEMPT','Control targets an outdated worker attempt');
  if((worker.activeTurn?.turnId??null)!==turnId)throw fault('CONTROL_TURN','Control targets an outdated worker turn');
  if(action==='steer'&&!worker.activeTurn)throw fault('CONTROL_TURN','Steering requires a confirmed active turn');
}
export async function requestControl(runDir,{sessionId,generation,action,position,attempt,turnId,text}){
  const individual=['steer','cancel-worker'].includes(action);
  if(!['pause','stop','steer','cancel-worker'].includes(action)||!Number.isInteger(generation)||generation<1)throw fault('CONTROL_INPUT','Control requires a supported action and observed generation');
  if(individual&&(!Number.isInteger(position)||position<0||position>=1000||!Number.isInteger(attempt)||attempt<0||attempt>1000||turnId!==null&&(typeof turnId!=='string'||!turnId||turnId.length>200)))throw fault('CONTROL_INPUT','Worker controls require an exact position, attempt and nullable turn identity');
  if(action==='steer'&&(typeof text!=='string'||!text.trim()||text.length>8000))throw fault('CONTROL_INPUT','Steering requires bounded nonempty text');
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
      assertWorkerTarget(row?JSON.parse(row.value):null,{action,attempt,turnId});
      if(state.status==='stopping')throw fault('CONTROL_TERMINAL','Stopping run no longer accepts individual controls');
    }
    if(db.prepare("SELECT count(*) AS count FROM controls WHERE generation=? AND json_extract(value,'$.status') IN ('pending','applying')").get(generation).count>=256)throw fault('CONTROL_LIMIT','Too many outstanding controls');
    const receipt={id:randomUUID(),generation,action,status:'pending',requestedAt:new Date().toISOString(),...(individual?{position,attempt,turnId}:{}),...(action==='steer'?{text}:{})};
    db.prepare('INSERT INTO controls(id,generation,value) VALUES(?,?,?)').run(receipt.id,generation,JSON.stringify(receipt));
    db.exec('COMMIT');return receipt;
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{db.close();}
}

export async function readControl(runDir,id){
  const db=await openRun(runDir,true);
  try{const row=db.prepare('SELECT value FROM controls WHERE id=?').get(id);if(!row)throw fault('CONTROL_MISSING','Control receipt does not exist');return JSON.parse(row.value);}finally{db.close();}
}
