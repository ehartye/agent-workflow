import {DatabaseSync} from 'node:sqlite';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {keys,plain,hash,integer,uuid,digest,absolute,safePath,fail,terminal,positiveCleanup,validateRequest,canonical,PRIVATE_BYTES,ENVIRONMENT_BYTES,EXPANDED_RECEIPT_BYTES} from './contract.mjs';
import {validateAccessPolicy} from '../access-policy.mjs';

export const jobDirectory=(runDir,jobId)=>join(runDir,'command-jobs-v1',jobId);
const receiptFields=['schemaVersion','jobId','run','requestId','revision','state','invocation','execution','timing','output','verification','cancellation','cleanup','error'];
function validatePrivate(input){
  const p=plain(input,PRIVATE_BYTES);keys(p,['request','launch','access','cwdIdentity','nodeExecutable','run','sessionId']);
  validateRequest(p.request);validateAccessPolicy(p.access,{sessionId:p.sessionId});
  keys(p.launch,['command','args','cwd','env'],['session0Desktop']);
  plain(p.launch.env,ENVIRONMENT_BYTES);
  if(!absolute(p.launch.command)||!absolute(p.launch.cwd)||!absolute(p.nodeExecutable)||!Array.isArray(p.launch.args)||p.launch.args.some(v=>typeof v!=='string'||v.includes('\0'))||!p.launch.env||typeof p.launch.env!=='object'||Array.isArray(p.launch.env)||Object.entries(p.launch.env).some(([k,v])=>!k||/[=\0]/.test(k)||typeof v!=='string'||v.includes('\0')))fail('JOB_INTEGRITY');
  keys(p.cwdIdentity,['canonical','dev','ino','birthtimeNs']);keys(p.run,['dataInstanceId','runId','runtimeId']);
  if(!absolute(p.cwdIdentity.canonical)||!digest(p.run.dataInstanceId)||!uuid(p.run.runId))fail('JOB_INTEGRITY');
  return p;
}
export function validateReceipt(input){
  // Expanded snapshots are private immutable evidence. Public APIs independently
  // refuse responses above 1 MiB; metadata is still capped after externalization.
  const r=plain(input,EXPANDED_RECEIPT_BYTES);keys(r,receiptFields);
  if(r.schemaVersion!==1||!uuid(r.jobId)||!uuid(r.requestId)||!integer(r.revision)||!['admitted','queued','dispatching','running','draining','succeeded','failed','cancelled','deadline','unknown'].includes(r.state))fail('JOB_INTEGRITY');
  keys(r.run,['dataInstanceId','runId','runtimeId']);if(!digest(r.run.dataInstanceId)||!uuid(r.run.runId)||typeof r.run.runtimeId!=='string')fail('JOB_INTEGRITY');
  keys(r.invocation,['hash','command','executableSha256','cwd','canonicalCwd','environmentHash','policyHash','runtime']);
  const i=r.invocation;if(![i.hash,i.executableSha256,i.environmentHash,i.policyHash].every(digest)||!absolute(i.cwd)||!absolute(i.canonicalCwd)||!Array.isArray(i.command)||!absolute(i.command[0]))fail('JOB_INTEGRITY');
  keys(i.runtime,['id','digest','dependencyHash','nodeVersion','nodeExecutableSha256','session0Desktop']);if(![i.runtime.digest,i.runtime.dependencyHash,i.runtime.nodeExecutableSha256].every(digest)||!['inherit','shared'].includes(i.runtime.session0Desktop))fail('JOB_INTEGRITY');
  keys(r.execution,['start','processId','exitCode','outcome']);if(!['notStarted','observed','unknown'].includes(r.execution.start)||!['pending','passed','failed','cancelled','deadline','unknown'].includes(r.execution.outcome)||r.execution.exitCode!==null&&!integer(r.execution.exitCode,-2147483648,4294967295)||r.execution.processId!==null&&(typeof r.execution.processId!=='string'||r.execution.processId.length>200))fail('JOB_INTEGRITY');
  keys(r.timing,['admittedAt','dispatchIntentAt','startedAt','deadlineAt','endedAt']);for(const [k,v]of Object.entries(r.timing))if(v!==null&&(typeof v!=='string'||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)||['admittedAt','deadlineAt'].includes(k)&&v===null)fail('JOB_INTEGRITY');
  keys(r.output,['limitBytes','stdout','stderr','chunkIndex']);if(!integer(r.output.limitBytes,1,16777216))fail('JOB_INTEGRITY');
  for(const s of [r.output.stdout,r.output.stderr]){keys(s,['path','receivedBytes','retainedBytes','droppedBytes','sha256','capReached','coverage']);if(s.path!==null&&!absolute(s.path)||![s.receivedBytes,s.retainedBytes,s.droppedBytes].every(v=>integer(v))||s.receivedBytes!==s.retainedBytes+s.droppedBytes||s.sha256!==null&&!digest(s.sha256)||![true,false,null].includes(s.capReached)||!['complete','partial','unknown'].includes(s.coverage))fail('JOB_INTEGRITY');}
  if(r.output.stdout.retainedBytes+r.output.stderr.retainedBytes>r.output.limitBytes)fail('JOB_INTEGRITY');
  if(r.output.chunkIndex!==null){keys(r.output.chunkIndex,['path','sha256','bytes','entries']);if(!absolute(r.output.chunkIndex.path)||!digest(r.output.chunkIndex.sha256)||!integer(r.output.chunkIndex.bytes,0,1048576)||!integer(r.output.chunkIndex.entries,0,8192))fail('JOB_INTEGRITY');}
  if(r.cancellation!==null){keys(r.cancellation,['requestId','expectedRevision','recordedAt','status']);if(!uuid(r.cancellation.requestId)||!integer(r.cancellation.expectedRevision)||!['recorded','sent','confirmed','unknown'].includes(r.cancellation.status))fail('JOB_INTEGRITY');}
  if(r.verification!==null)keys(r.verification,['checkpointId','checkId','snapshotBefore','snapshotAfter']);
  if(r.cleanup!==null){keys(r.cleanup,['serverExited','jobEmpty','forced','ownershipScope','jobHost','descendants']);if(![true,false,null].includes(r.cleanup.serverExited)||![true,false,null].includes(r.cleanup.jobEmpty)||typeof r.cleanup.forced!=='boolean'||r.cleanup.ownershipScope!=='windows-job-members'||r.cleanup.descendants!=='notVerified')fail('JOB_INTEGRITY');if(r.cleanup.jobHost!==null)keys(r.cleanup.jobHost,['closeObserved','exitCode','signal','receipt']);}
  if(r.error!==null){keys(r.error,['code','message']);if(typeof r.error.code!=='string'||r.error.code.length>64||typeof r.error.message!=='string'||r.error.message.length>256)fail('JOB_INTEGRITY');}
  if(r.state==='succeeded'&&(r.execution.start!=='observed'||r.execution.outcome!=='passed'||r.execution.exitCode!==0||!positiveCleanup(r.cleanup)||[r.output.stdout,r.output.stderr].some(s=>!digest(s.sha256)||s.coverage==='unknown')||!r.output.chunkIndex))fail('JOB_INTEGRITY');
  return r;
}
export function newReceipt({jobId,request,run,invocation,now=Date.now()}){
  const stream=()=>({path:null,receivedBytes:0,retainedBytes:0,droppedBytes:0,sha256:null,capReached:null,coverage:'unknown'});
  return {schemaVersion:1,jobId,run,requestId:request.requestId,revision:0,state:'admitted',invocation,execution:{start:'notStarted',processId:null,exitCode:null,outcome:'pending'},timing:{admittedAt:new Date(now).toISOString(),dispatchIntentAt:null,startedAt:null,deadlineAt:new Date(now+request.deadlineMs).toISOString(),endedAt:null},output:{limitBytes:request.outputLimitBytes,stdout:stream(),stderr:stream(),chunkIndex:null},verification:request.verification===null?null:{checkpointId:request.verification.checkpointId,checkId:request.verification.checkId,snapshotBefore:request.verification.snapshot,snapshotAfter:null},cancellation:null,cleanup:null,error:null};
}
async function database(path,write){
  await safePath(path,{missing:write});if(!write)await safePath(path);
  await safePath(path+'-journal',{missing:true});
  const db=new DatabaseSync(path,{readOnly:!write});db.exec('PRAGMA busy_timeout=5000');
  if(write)db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, requestId TEXT UNIQUE NOT NULL, admissionHash TEXT NOT NULL, receipt TEXT NOT NULL, receiptHash TEXT NOT NULL, private TEXT NOT NULL, privateHash TEXT NOT NULL, owner TEXT); CREATE TABLE IF NOT EXISTS evidence (hash TEXT PRIMARY KEY, value TEXT NOT NULL)');
  return db;
}
export async function openStore({runDir,dataDir,write=false}){
  const dir=join(runDir,'command-jobs-v1'),admission=join(dataDir,'command-jobs-v1');
  if(write){await safePath(dir,{directory:true,missing:true});await safePath(admission,{directory:true,missing:true});await mkdir(dir,{recursive:true,mode:0o700});await mkdir(admission,{recursive:true,mode:0o700});}
  const db=await database(join(dir,'jobs.sqlite'),write);
  if(write){const leasePath=join(admission,'admission.sqlite');await safePath(leasePath,{missing:true});await safePath(leasePath+'-journal',{missing:true});db.prepare('ATTACH DATABASE ? AS admission').run(leasePath);db.exec('PRAGMA admission.journal_mode=DELETE; PRAGMA admission.synchronous=FULL; CREATE TABLE IF NOT EXISTS admission.heavy (slot INTEGER PRIMARY KEY CHECK(slot=1), runId TEXT NOT NULL, jobId TEXT NOT NULL, owner TEXT NOT NULL)');}
  function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
  function decode(row){
    if(!row)fail('JOB_MISSING');if(Buffer.byteLength(row.receipt)>65536||Buffer.byteLength(row.private)>PRIVATE_BYTES)fail('JOB_INTEGRITY');
    const expanded=JSON.parse(row.receipt);
    if(expanded.verification!==null)for(const k of ['snapshotBefore','snapshotAfter'])if(expanded.verification[k]!==null){
      const ref=expanded.verification[k];keys(ref,['evidenceSha256']);if(!digest(ref.evidenceSha256))fail('JOB_INTEGRITY');
      const blob=db.prepare('SELECT value FROM evidence WHERE hash=?').get(ref.evidenceSha256);if(!blob||Buffer.byteLength(blob.value)>1048576)fail('JOB_INTEGRITY');
      const value=plain(JSON.parse(blob.value));if(hash(value)!==ref.evidenceSha256)fail('JOB_INTEGRITY');expanded.verification[k]=value;
    }
    const receipt=validateReceipt(expanded),privateRecord=validatePrivate(JSON.parse(row.private));
    if(hash(receipt)!==row.receiptHash||hash(privateRecord)!==row.privateHash||receipt.jobId!==row.id||receipt.requestId!==row.requestId||receipt.invocation.hash!==row.admissionHash)fail('JOB_INTEGRITY');
    const i=receipt.invocation,p=privateRecord;
    if(hash({request:p.request,executableSha256:i.executableSha256,canonicalCwd:i.canonicalCwd,environmentHash:i.environmentHash,policyHash:i.policyHash,runtime:i.runtime})!==i.hash||hash(p.request.command)!==hash(i.command)||hash(p.launch.env)!==i.environmentHash||p.access.fingerprint!==i.policyHash||p.request.cwd!==i.cwd||p.cwdIdentity.canonical!==i.canonicalCwd||hash(p.run)!==hash(receipt.run))fail('JOB_INTEGRITY');
    const owner=row.owner===null?null:plain(JSON.parse(row.owner),1024);if(owner!==null){keys(owner,['nonce','pid','startedAt']);if(!uuid(owner.nonce)||owner.pid!==null&&!integer(owner.pid,1)||owner.startedAt!==null&&typeof owner.startedAt!=='string')fail('JOB_INTEGRITY');}
    return {receipt,privateRecord,owner};
  }
  function encode(r){
    const stored=plain(r,EXPANDED_RECEIPT_BYTES);
    if(stored.verification!==null)for(const k of ['snapshotBefore','snapshotAfter'])if(stored.verification[k]!==null){
      const value=stored.verification[k],digest=hash(value),body=canonical(value);db.prepare('INSERT OR IGNORE INTO evidence VALUES (?,?)').run(digest,body);
      const saved=db.prepare('SELECT value FROM evidence WHERE hash=?').get(digest);if(saved.value!==body)fail('JOB_INTEGRITY');stored.verification[k]={evidenceSha256:digest};
    }
    const body=JSON.stringify(stored);if(Buffer.byteLength(body)>65536)fail('JOB_LIMIT');return body;
  }
  const read=id=>decode(db.prepare('SELECT * FROM jobs WHERE id=?').get(id));
  const save=(r)=>{r.revision++;const normalized=validateReceipt(r);db.prepare('UPDATE jobs SET receipt=?,receiptHash=? WHERE id=?').run(encode(normalized),hash(normalized),r.jobId);return normalized;};
  return {close:()=>db.close(),read,
    admit({request,run,invocation,privateRecord,allowNew=true}){return transaction(()=>{
      const row=db.prepare('SELECT * FROM jobs WHERE requestId=?').get(request.requestId);
      if(row){const old=decode(row);if(row.admissionHash!==invocation.hash)fail('JOB_CONFLICT');return {created:false,...old};}
      if(!allowNew)fail('JOB_RUN_STATE');
      if(db.prepare('SELECT count(*) AS n FROM jobs').get().n>=1024||db.prepare("SELECT count(*) AS n FROM jobs WHERE json_extract(receipt,'$.state') NOT IN ('succeeded','failed','cancelled','deadline','unknown')").get().n>=64)fail('JOB_QUOTA');
      validatePrivate(privateRecord);
      const receipt=newReceipt({jobId:randomUUID(),request,run,invocation});validateReceipt(receipt);
      db.prepare('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,NULL)').run(receipt.jobId,request.requestId,invocation.hash,encode(receipt),hash(receipt),JSON.stringify(privateRecord),hash(privateRecord));
      return {created:true,receipt,privateRecord,owner:null};
    });},
    reserve(id){return transaction(()=>{const item=read(id);if(item.owner||item.receipt.state!=='admitted')fail('JOB_OWNER');const nonce=randomUUID();db.prepare('UPDATE jobs SET owner=? WHERE id=?').run(JSON.stringify({nonce,pid:null,startedAt:null}),id);item.receipt.state='queued';save(item.receipt);return nonce;});},
    claim(id,nonce,identity){return transaction(()=>{const item=read(id);if(item.owner?.nonce!==nonce||item.owner.pid!==null||!integer(identity.pid,1)||typeof identity.startedAt!=='string')fail('JOB_OWNER');const owner={nonce,...identity};db.prepare('UPDATE jobs SET owner=? WHERE id=?').run(JSON.stringify(owner),id);return item.receipt;});},
    update(id,nonce,fn){return transaction(()=>{const item=read(id);if(item.owner?.nonce!==nonce)fail('JOB_OWNER');fn(item.receipt);return save(item.receipt);});},
    acquire(id,nonce){return transaction(()=>{const item=read(id),r=item.receipt;if(item.owner?.nonce!==nonce||!item.owner.pid)fail('JOB_OWNER');if(terminal(r.state))return false;if(r.state!=='queued')fail('JOB_OWNER');
      if(Date.now()>=Date.parse(r.timing.deadlineAt)){r.state='deadline';r.execution.outcome='deadline';r.timing.endedAt=new Date().toISOString();save(r);return false;}
      if(item.privateRecord.request.kind==='heavy'){const current=db.prepare('SELECT * FROM admission.heavy WHERE slot=1').get();if(current)return false;db.prepare('INSERT INTO admission.heavy VALUES (1,?,?,?)').run(r.run.runId,id,nonce);}
      r.state='dispatching';r.execution.start='unknown';r.execution.processId='command-'+randomUUID();r.timing.dispatchIntentAt=new Date().toISOString();save(r);return true;
    });},
    release(id,nonce){return transaction(()=>{const {receipt:r}=read(id);if(!terminal(r.state)||r.execution.outcome==='unknown'||!positiveCleanup(r.cleanup))fail('JOB_DRAIN');db.prepare('DELETE FROM admission.heavy WHERE slot=1 AND runId=? AND jobId=? AND owner=?').run(r.run.runId,id,nonce);});},
    cancel(id,requestId,expectedRevision){return transaction(()=>{const {receipt:r}=read(id);if(r.cancellation){if(r.cancellation.requestId!==requestId||r.cancellation.expectedRevision!==expectedRevision)fail('JOB_CONFLICT');return r;}
      if(!uuid(requestId)||!integer(expectedRevision)||r.revision!==expectedRevision||terminal(r.state))fail('JOB_REVISION');
      r.cancellation={requestId,expectedRevision,recordedAt:new Date().toISOString(),status:'recorded'};
      if(['admitted','queued'].includes(r.state)){r.state='cancelled';r.execution.outcome='cancelled';r.timing.endedAt=new Date().toISOString();r.cancellation.status='confirmed';}
      return save(r);
    });}
  };
}
