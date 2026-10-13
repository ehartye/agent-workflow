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

export async function requestControl(runDir,{sessionId,generation,action}){
  if(!['pause','stop'].includes(action)||!Number.isInteger(generation)||generation<1)throw fault('CONTROL_INPUT','Control requires pause or stop and the observed generation');
  const db=await openRun(runDir);
  try{
    db.exec('BEGIN IMMEDIATE');
    const header=db.prepare('SELECT value FROM header WHERE id=1').get();
    if(!header)throw fault('CONTROL_MISSING','Run has no durable state');
    const state=JSON.parse(header.value);
    if(state.sessionId!==sessionId)throw fault('CONTROL_SESSION','Control belongs to a different originating session');
    if(state.generation!==generation)throw fault('CONTROL_GENERATION','Control targets an outdated run generation');
    if(state.acceptingControls!==true||!['running','pausing','stopping'].includes(state.status))throw fault('CONTROL_TERMINAL','Run no longer accepts live controls');
    if(db.prepare("SELECT count(*) AS count FROM controls WHERE generation=? AND json_extract(value,'$.status')='pending'").get(generation).count>=256)throw fault('CONTROL_LIMIT','Too many pending controls');
    const receipt={id:randomUUID(),generation,action,status:'pending',requestedAt:new Date().toISOString()};
    db.prepare('INSERT INTO controls(id,generation,value) VALUES(?,?,?)').run(receipt.id,generation,JSON.stringify(receipt));
    db.exec('COMMIT');return receipt;
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{db.close();}
}

export async function readControl(runDir,id){
  const db=await openRun(runDir,true);
  try{const row=db.prepare('SELECT value FROM controls WHERE id=?').get(id);if(!row)throw fault('CONTROL_MISSING','Control receipt does not exist');return JSON.parse(row.value);}finally{db.close();}
}
