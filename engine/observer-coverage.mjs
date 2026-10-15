// Consumer-owned observation receipts. No run database, execution or controls.
import {lstat,open,readFile,rename,unlink} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fault} from '../foundation/client.mjs';

const MAX_BYTES=65536,MAX_CONNECTIONS=32;
const statuses=new Set(['running','pausing','stopping','finishing','completed','failed','paused','stopped','blocked']);
const terminalStatuses=new Set(['completed','failed','paused','stopped','blocked']);
const reasons=new Set(['terminal','disconnected','aborted','observation-error']);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const timestamp=value=>typeof value==='string'&&value.length===24&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const invalid=()=>fault('OBSERVER_COVERAGE','Observer receipt identity, cursor or state is invalid; inspect the existing receipt');
const now=()=>new Date().toISOString();
const keys=(value,required,optional=[])=>value&&typeof value==='object'&&!Array.isArray(value)&&required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
function validate(value,{initial=false}={}){
 if(!keys(value,['version','runId','generation','observer','launchedAt','lastProcessedCursor','droppedConnections','unclosedConnections','connections'],['terminal']))throw invalid();
 if(!value||value.version!==1||typeof value.runId!=='string'||!value.runId||value.runId.length>200||typeof value.observer!=='string'||!value.observer||value.observer.length>200||!Number.isSafeInteger(value.generation)||value.generation<1||!timestamp(value.launchedAt)||!integer(value.lastProcessedCursor)||!integer(value.droppedConnections)||!integer(value.unclosedConnections)||!Array.isArray(value.connections)||value.connections.length>MAX_CONNECTIONS)throw invalid();
 if(!initial&&!value.connections.length||value.unclosedConnections>value.connections.length+value.droppedConnections)throw invalid();
 for(const c of value.connections){
  if(!keys(c,['id','startedAt','requestedAfter','lastProcessedCursor','status','preAttachmentCoverage'],['priorGapCoverage','attachedAt','terminalAtAttachment','closedAt','closedDetectedAt','idleWarnings','progressRecords','observationError']))throw invalid();
  if(typeof c.id!=='string'||c.id.length!==36||!timestamp(c.startedAt)||!integer(c.requestedAfter)||!integer(c.lastProcessedCursor)||c.lastProcessedCursor>value.lastProcessedCursor||!['connecting','attached','terminal','disconnected','aborted','observation-error','unknown'].includes(c.status)||c.preAttachmentCoverage!=='missing'||c.priorGapCoverage!==undefined&&c.priorGapCoverage!=='missing'||c.attachedAt!==undefined&&!timestamp(c.attachedAt)||c.closedAt!==undefined&&!timestamp(c.closedAt))throw invalid();
  if(c.lastProcessedCursor<c.requestedAfter||c.terminalAtAttachment!==undefined&&typeof c.terminalAtAttachment!=='boolean'||c.observationError!==undefined&&c.observationError!==true||['idleWarnings','progressRecords'].some(key=>c[key]!==undefined&&!integer(c[key]))||c.closedDetectedAt!==undefined&&!timestamp(c.closedDetectedAt))throw invalid();
  if(Boolean(c.attachedAt)!==(typeof c.terminalAtAttachment==='boolean')||['attached','terminal'].includes(c.status)&&!c.attachedAt||c.status==='connecting'&&c.attachedAt||c.status==='unknown'&&(!c.closedDetectedAt||c.closedAt)||c.status!=='unknown'&&c.closedDetectedAt||['terminal','disconnected','aborted','observation-error'].includes(c.status)!==Boolean(c.closedAt))throw invalid();
 }
 if(value.terminal){
  const terminal=value.terminal,c=value.connections.at(-1);
  if(!keys(terminal,['seq','status','basis','processedAt'])||!integer(terminal.seq)||terminal.seq<1||!terminalStatuses.has(terminal.status)||!['replay','observedAfterAttachment'].includes(terminal.basis)||!timestamp(terminal.processedAt)||terminal.seq!==value.lastProcessedCursor||!c?.attachedAt||c.lastProcessedCursor!==terminal.seq||terminal.basis!==(c.terminalAtAttachment?'replay':'observedAfterAttachment'))throw invalid();
 }else if(value.connections.some(c=>c.status==='terminal'))throw invalid();
 return value;
}
async function read(file,optional=false){
 try{
  const stat=await lstat(file);if(!stat.isFile()||stat.size>MAX_BYTES)throw invalid();
  const bytes=await readFile(file);if(bytes.length>MAX_BYTES)throw invalid();
  return validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
 }catch(error){if(optional&&error.code==='ENOENT')return null;if(error.code==='OBSERVER_COVERAGE')throw error;throw invalid();}
}
export async function readObserverCoverage(file){return read(file);}
async function update(file,change){
 if(typeof file!=='string'||!isAbsolute(file))throw invalid();
 const lock=file+'.lock',temp=file+'.'+randomUUID()+'.tmp';let lease,temporary=false;
 try{
  lease=await open(lock,'wx');
  const value=await change(await read(file,true));validate(value);
  const body=JSON.stringify(value,null,2)+'\n';if(Buffer.byteLength(body)>MAX_BYTES)throw invalid();
  const handle=await open(temp,'wx');temporary=true;
  try{await handle.writeFile(body);await handle.sync();}finally{await handle.close();}
  await rename(temp,file);temporary=false;return structuredClone(value);
 }finally{
  if(temporary)await unlink(temp).catch(()=>{});
  if(lease){await lease.close();await unlink(lock);}
 }
}

/** Call processed only AFTER the named consumer handles a JSONL record.
 * A successful stdout write alone is not a consumer acknowledgment.
 * New connections must use the exact persisted lastProcessedCursor.
 */
export async function openObserverCoverage(file,identity,{after=0}={}){
 if(!integer(after))throw invalid();
 const {runId,generation,observer,launchedAt}=identity??{};
 // Validate the same bounded identity for new and retained files.
 const base={version:1,runId,generation,observer,launchedAt,lastProcessedCursor:after,droppedConnections:0,unclosedConnections:0,connections:[]};validate(base,{initial:true});
 const connectionId=randomUUID();
 await update(file,prior=>{
  const state=prior??base;
  if(prior&&['runId','generation','observer','launchedAt'].some(key=>prior[key]!==base[key])||after!==state.lastProcessedCursor)throw invalid();
  if(state.terminal)throw fault('OBSERVER_TERMINAL','Observation already acknowledged terminal; inspect the retained receipt');
  const at=now(),previous=state.connections.at(-1);
  if(previous&&!previous.closedAt&&!previous.closedDetectedAt){previous.status='unknown';previous.closedDetectedAt=at;state.unclosedConnections++;}
  state.connections.push({id:connectionId,startedAt:at,requestedAfter:after,lastProcessedCursor:after,status:'connecting',preAttachmentCoverage:'missing',...(previous?{priorGapCoverage:'missing'}:{})});
  if(state.connections.length>MAX_CONNECTIONS){state.connections.shift();state.droppedConnections++;}
  return state;
 });
 const mutate=change=>update(file,state=>{
  if(!state||state.runId!==runId||state.generation!==generation||state.observer!==observer||state.connections.at(-1)?.id!==connectionId)throw invalid();
  const connection=state.connections.at(-1);if(connection.closedAt)throw invalid();change(state,connection);return state;
 });
 return{
  async processed(record){
   if(!record||record.generation!==generation)throw invalid();
   return mutate((state,c)=>{
    if(record.kind==='attached'){
     if(c.attachedAt||record.cursor!==state.lastProcessedCursor||!statuses.has(record.status))throw invalid();
     c.attachedAt=now();c.terminalAtAttachment=terminalStatuses.has(record.status);c.status='attached';
    }else if(record.kind==='worker-terminal'||record.kind==='run-terminal'){
     if(!c.attachedAt||!integer(record.seq)||record.seq<=state.lastProcessedCursor||state.terminal)throw invalid();
     if(record.kind==='run-terminal'&&!terminalStatuses.has(record.status))throw invalid();
     state.lastProcessedCursor=record.seq;c.lastProcessedCursor=record.seq;
     if(record.kind==='run-terminal')state.terminal={seq:record.seq,status:record.status,processedAt:now(),basis:c.terminalAtAttachment?'replay':'observedAfterAttachment'};
    }else if(record.kind==='worker-progress'||record.kind==='idle-warning'){
     if(!c.attachedAt||record.cursor!==state.lastProcessedCursor)throw invalid();
     const key=record.kind==='idle-warning'?'idleWarnings':'progressRecords';c[key]=(c[key]??0)+1;if(!integer(c[key]))throw invalid();
    }else if(record.kind==='observation-error'){
     if(record.cursor!==state.lastProcessedCursor)throw invalid();c.observationError=true;
    }else throw invalid();
   });
  },
  async finish(reason){
   if(!reasons.has(reason))throw invalid();
   return mutate((state,c)=>{
    if(reason==='terminal'&&!state.terminal)throw fault('OBSERVER_COVERAGE','Terminal requires a processed run-terminal record');
    c.status=reason;c.closedAt=now();
   });
  },
 };
}
