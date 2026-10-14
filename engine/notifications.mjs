import {DatabaseSync} from 'node:sqlite';
import {lstat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {fault} from '../foundation/client.mjs';

const MAX_EVENTS=100000;
const workerTerminal=new Set(['completed','failed','unknown']);
const runTerminal=new Set(['completed','failed','paused','stopped','blocked']);
const workerStatuses=new Set(['queued','running',...workerTerminal]);
const runStatuses=new Set(['running','pausing','stopping','finishing',...runTerminal]);
const errorCodes=new Set(['TURN_TIMEOUT','DRAIN_TIMEOUT','WORKER_CANCELLED','DEPENDENCY_FAILED','AGENT_LIMIT','AGENT_UNKNOWN','RESULT_JSON','RESULT_SIZE','RESULT_SCHEMA','SCRIPT_FAILED','RUN_STOPPED','WORKSPACE_DRAIN','WORKSPACE_ARTIFACT','CAPABILITY_SELECTION','CAPABILITY_READINESS','SKILL_ACTIVATION','OTHER']);
const corrupt=()=>fault('NOTIFICATIONS_CORRUPT','Notification state is missing or inconsistent');
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const timestamp=value=>typeof value==='string'&&value.length===24&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function parse(value,max=2*1024*1024){if(typeof value!=='string'||Buffer.byteLength(value)>max)throw corrupt();try{return JSON.parse(value);}catch{throw corrupt();}}
function cleanupFacts(value){
 const out={};
 for(const key of ['serverExited','jobEmpty','forced'])if(typeof value?.[key]==='boolean')out[key]=value[key];
 if(object(value))out.descendants='notVerified';
 if(value?.ownershipScope==='windows-job-members')out.ownershipScope=value.ownershipScope;
 if(typeof value?.nativeTerminals?.inventoryEmpty==='boolean')out.nativeInventoryEmpty=value.nativeTerminals.inventoryEmpty;
 if(value?.error!==undefined)out.errorObserved=true;
 return out;
}
function supported(db){
 const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notification_meta'").get();
 if(!table)throw fault('NOTIFICATIONS_UNAVAILABLE','This retained runtime has no durable notification journal');
 if(db.prepare('SELECT version FROM notification_meta WHERE id=1').get()?.version!==1)throw fault('NOTIFICATIONS_UNAVAILABLE','Notification journal version is unsupported');
}

// Admission reserves the worst-case generation before any worker executes. No
// rolling retention is permitted: disconnected consumers must not lose failure.
export function admitNotifications(db,{previous,maxAgents}){
 if(previous)supported(db);
 else db.exec("CREATE TABLE notification_meta(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);INSERT INTO notification_meta VALUES(1,1);CREATE TABLE notifications(seq INTEGER PRIMARY KEY AUTOINCREMENT,generation INTEGER NOT NULL,kind TEXT NOT NULL,position INTEGER NOT NULL,attempt INTEGER,status TEXT NOT NULL,at TEXT NOT NULL,cleanup TEXT NOT NULL,error_code TEXT,UNIQUE(generation,kind,position));CREATE INDEX notifications_generation ON notifications(generation,seq);CREATE TABLE notification_progress(generation INTEGER NOT NULL,position INTEGER NOT NULL,seq INTEGER NOT NULL,kind TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(generation,position));");
 const count=db.prepare('SELECT count(*) AS n FROM notifications').get().n;
 if(!integer(count,0,MAX_EVENTS)||count+maxAgents+1>MAX_EVENTS)throw fault('NOTIFICATIONS_LIMIT','Notification journal capacity requires a new run; saved terminal events were retained');
}

// These writes are called only inside the controller's worker/header transaction.
export function recordNotificationProgress(db,{generation,worker,record}){
 if(!record)return;
 const command=record.type==='commandExecution'&&record.method==='item/completed'&&['completed','failed','declined'].includes(record.status);
 const file=record.type==='fileChange'&&(record.method==='turn/diff/updated'&&record.output?.trim()||record.method==='item/completed'&&record.status==='completed'&&record.input&&record.input!=='[]');
 const kind=command?'command':file?'file-change':null;
 if(!kind)return;
 db.prepare('INSERT INTO notification_progress(generation,position,seq,kind,at) VALUES(?,?,?,?,?) ON CONFLICT(generation,position) DO UPDATE SET seq=excluded.seq,kind=excluded.kind,at=excluded.at').run(generation,worker.position,record.seq,kind,record.at);
}
export function recordWorkerNotification(db,state,worker){
 if(!workerTerminal.has(worker.status))return;
 record(db,{generation:state.generation,kind:'worker-terminal',position:worker.position,attempt:worker.attempts??0,status:worker.status,cleanup:worker.evidence?.cleanup,error:worker.error});
}
export function recordRunNotification(db,state){
 if(!runTerminal.has(state.status))throw corrupt();
 record(db,{generation:state.generation,kind:'run-terminal',position:-1,status:state.status,cleanup:state.cleanup,error:state.error});
}
function record(db,{generation,kind,position,attempt,status,cleanup,error}){
 const prior=db.prepare('SELECT status FROM notifications WHERE generation=? AND kind=? AND position=?').get(generation,kind,position);
 if(prior){if(prior.status!==status)throw corrupt();return;}
 db.prepare('INSERT INTO notifications(generation,kind,position,attempt,status,at,cleanup,error_code) VALUES(?,?,?,?,?,?,?,?)').run(generation,kind,position,attempt??null,status,new Date().toISOString(),JSON.stringify(cleanupFacts(cleanup)),error?(errorCodes.has(error.code)?error.code:'OTHER'):null);
}

export async function readNotifications(runDir,{sessionId,generation,after=0,limit=100}={}){
 if(typeof sessionId!=='string'||!sessionId||sessionId.length>256)throw fault('NOTIFICATIONS_SESSION','Originating session is required');
 if(!integer(generation,1))throw fault('NOTIFICATIONS_GENERATION','Exact current generation is required');
 if(!integer(after))throw fault('NOTIFICATIONS_CURSOR','Cursor must identify a retained event in this generation');
 if(!integer(limit,1,100))throw fault('NOTIFICATIONS_INPUT','Notification page limit must be between 1 and 100');
 if(typeof runDir!=='string'||!isAbsolute(runDir))throw fault('NOTIFICATIONS_INPUT','An absolute run directory is required');
 const path=join(runDir,'run.sqlite');let db;
 try{
  if(!(await lstat(runDir)).isDirectory()||!(await lstat(path)).isFile())throw corrupt();
  db=new DatabaseSync(path,{readOnly:true});db.exec('PRAGMA busy_timeout=1000;BEGIN');supported(db);
  const header=parse(db.prepare('SELECT value FROM header WHERE id=1').get()?.value);
  if(!object(header)||!integer(header.generation,1)||!runStatuses.has(header.status)||!integer(header.workerCount,0,1000))throw corrupt();
  if(header.sessionId!==sessionId)throw fault('NOTIFICATIONS_SESSION','Run belongs to a different originating session');
  if(header.generation!==generation)throw fault('NOTIFICATIONS_GENERATION','Run generation changed; refresh the exact target');
  if(after&&!db.prepare('SELECT seq FROM notifications WHERE generation=? AND seq=?').get(generation,after))throw fault('NOTIFICATIONS_CURSOR','Cursor does not belong to the selected generation');
  const rows=db.prepare('SELECT * FROM notifications WHERE generation=? ORDER BY seq LIMIT 1002').all(generation);
  if(rows.length>1001)throw corrupt();
  const events=rows.map(row=>{
   const worker=row.kind==='worker-terminal',run=row.kind==='run-terminal',cleanup=parse(row.cleanup,500);
   if(!integer(row.seq,1)||row.generation!==generation||!worker&&!run||worker&&(!integer(row.position,0,999)||!integer(row.attempt,0,1000)||!workerTerminal.has(row.status))||run&&(row.position!==-1||row.attempt!==null||!runTerminal.has(row.status))||!timestamp(row.at)||!object(cleanup)||Object.keys(cleanup).some(key=>key==='descendants'?cleanup[key]!=='notVerified':key==='ownershipScope'?cleanup[key]!=='windows-job-members':!['serverExited','jobEmpty','forced','errorObserved','nativeInventoryEmpty'].includes(key)||typeof cleanup[key]!=='boolean')||row.error_code!==null&&!errorCodes.has(row.error_code))throw corrupt();
   return{seq:row.seq,generation,kind:row.kind,...(worker?{position:row.position,attempt:row.attempt}:{}),status:row.status,at:row.at,cleanup,...(row.error_code?{errorCode:row.error_code}:{})};
  });
  const workerRows=db.prepare('SELECT position,value FROM workers WHERE generation=? ORDER BY position LIMIT 1001').all(generation);
  if(workerRows.length!==header.workerCount)throw corrupt();
  const workers=workerRows.map((row,index)=>{
   const worker=parse(row.value);
   if(!object(worker)||row.position!==index||worker.position!==index||!workerStatuses.has(worker.status)||!integer(worker.attempts??0,0,1000))throw corrupt();
   const fact={position:index,attempt:worker.attempts??0,status:worker.status};
   if(worker.startedAt!==undefined){if(!timestamp(worker.startedAt))throw corrupt();fact.startedAt=worker.startedAt;}
   const progress=db.prepare('SELECT seq,kind,at FROM notification_progress WHERE generation=? AND position=?').get(generation,index);
   if(progress){if(!integer(progress.seq,1)||!['command','file-change'].includes(progress.kind)||!timestamp(progress.at))throw corrupt();fact.progress={seq:progress.seq,kind:progress.kind,at:progress.at};}
   return fact;
  });
  for(const event of events.filter(event=>event.kind==='worker-terminal')){
   const worker=workers[event.position];if(!worker||worker.status!==event.status||worker.attempt!==event.attempt)throw corrupt();
  }
  for(const worker of workers){
   const deferred=worker.status==='unknown'&&['pausing','stopping','finishing'].includes(header.status);
   if(workerTerminal.has(worker.status)&&!deferred&&!events.some(event=>event.kind==='worker-terminal'&&event.position===worker.position))throw corrupt();
  }
  const terminalEvents=events.filter(event=>event.kind==='run-terminal');
  const ended=runTerminal.has(header.status);
  if(ended?(terminalEvents.length!==1||events.at(-1)!==terminalEvents[0]||terminalEvents[0].status!==header.status||!object(header.cleanup)||JSON.stringify(terminalEvents[0].cleanup)!==JSON.stringify(cleanupFacts(header.cleanup))||workers.some(worker=>worker.status==='running'||workerTerminal.has(worker.status)&&!events.some(event=>event.kind==='worker-terminal'&&event.position===worker.position))):terminalEvents.length!==0)throw corrupt();
  const pending=events.filter(event=>event.seq>after),page=pending.slice(0,limit),hasMore=pending.length>limit;
  db.exec('COMMIT');
  return{supported:true,generation,events:page,nextCursor:page.at(-1)?.seq??after,hasMore,terminal:ended&&!hasMore,status:header.status,workers};
 }catch(error){if(error.code?.startsWith('NOTIFICATIONS_'))throw error;throw corrupt();}
 finally{db?.close();}
}
