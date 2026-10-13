import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {basename,dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fault} from '../foundation/client.mjs';

// Execution rows are never lifecycle storage. Reads do not migrate a run.
// Callers select/verify the retained runtime before calling these storage APIs;
// admission below rechecks its ownership and immutable installation receipt.
const MAX_ROWS=20000,MAX_RECORD=2*1024*1024,MAX_INVENTORY=16*1024*1024;
const MAX_ENTRIES=100000,MAX_BYTES=2*1024*1024*1024;
const sha=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`:JSON.stringify(value);
const hash=value=>sha(canonical(value));
const same=(a,b)=>process.platform==='win32'?resolve(a).toLowerCase()===resolve(b).toLowerCase():resolve(a)===resolve(b);
const inside=(root,path)=>{const p=relative(root,path);return p!==''&&p!=='..'&&!p.startsWith('..'+sep)&&!isAbsolute(p);};
const overlaps=(a,b)=>same(a,b)||inside(a,b)||inside(b,a);
const integer=(value,min=0)=>Number.isSafeInteger(value)&&value>=min;
const RETIRE_POLICY={schema:1,preserveExecutionRows:true,preserveRuntime:true,preserveCaptureEvidence:true,preserveGitIdentity:true,retireReplay:true};
function encoded(value,limit=MAX_RECORD){const text=canonical(value);if(typeof text!=='string'||Buffer.byteLength(text)>limit)throw fault('LIFECYCLE_LIMIT','Lifecycle evidence exceeded its complete-record limit');return text;}
function parsed(text,limit=MAX_RECORD){if(typeof text!=='string'||Buffer.byteLength(text)>limit)throw fault('LIFECYCLE_LIMIT','Saved execution record exceeded its limit');return JSON.parse(text);}
async function noLinks(path){
  if(typeof path!=='string'||!isAbsolute(path)||path.length>4096)throw fault('LIFECYCLE_PATH','An absolute owned path is required');
  for(let p=resolve(path);;p=dirname(p)){
    const s=await fs.lstat(p);if(s.isSymbolicLink())throw fault('LIFECYCLE_PATH','Linked paths and reparse points are refused');
    if(dirname(p)===p)break;
  }
}
async function regular(path){await noLinks(path);const s=await fs.lstat(path);if(!s.isFile()||s.nlink!==1)throw fault('LIFECYCLE_PATH','Lifecycle evidence requires unaliased regular files');return s;}
async function bytes(path,limit=MAX_RECORD){
  await regular(path);const handle=await fs.open(path,'r');
  try{
    if((await handle.stat()).size>limit)throw fault('LIFECYCLE_LIMIT','Lifecycle file exceeded its read limit');
    const chunks=[];let size=0;
    while(true){const buffer=Buffer.alloc(Math.min(65536,limit-size+1));const {bytesRead}=await handle.read(buffer,0,buffer.length,null);if(!bytesRead)break;size+=bytesRead;if(size>limit)throw fault('LIFECYCLE_LIMIT','Lifecycle file grew beyond its read limit');chunks.push(buffer.subarray(0,bytesRead));}
    return Buffer.concat(chunks,size);
  }finally{await handle.close();}
}
async function jsonFile(path,limit=MAX_RECORD){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(path,limit)));}
async function database(runDir,readOnly){
  await noLinks(runDir);if(!(await fs.lstat(runDir)).isDirectory())throw fault('LIFECYCLE_PATH','A saved run directory is required');
  const path=join(runDir,'run.sqlite');await regular(path);
  // SQLite sidecars may be absent, but must never redirect database writes.
  for(const suffix of ['-wal','-shm','-journal'])try{await regular(path+suffix);}catch(e){if(e.code!=='ENOENT')throw e;}
  const db=new DatabaseSync(path,{readOnly});db.exec('PRAGMA busy_timeout=1000');return db;
}
const table=(db,name)=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
function boundedRows(db,sql){
  const bounds=db.prepare(`SELECT count(*) AS n,coalesce(sum(length(CAST(value AS BLOB))),0) AS bytes FROM (${sql})`).get();
  if(bounds.n>MAX_ROWS||bounds.bytes>MAX_INVENTORY)throw fault('LIFECYCLE_LIMIT','Complete retained history exceeded its limit');
  return db.prepare(sql).all();
}
function execution(db){
  const header=db.prepare('SELECT value FROM header WHERE id=1').get();if(!header)throw fault('LIFECYCLE_MISSING','Run has no durable execution state');
  const state=parsed(header.value);if(!integer(state.generation,1))throw fault('LIFECYCLE_CORRUPT','Run generation is unavailable');
  const workers=boundedRows(db,'SELECT generation,position,value FROM workers ORDER BY generation,position').map(row=>({...row,worker:parsed(row.value)}));
  for(const row of workers)if(!integer(row.generation,1)||!integer(row.position)||row.worker.position!==row.position||!integer(row.worker.attempts??0))throw fault('LIFECYCLE_CORRUPT','Retained worker identity is unavailable');
  const controls=table(db,'controls')?boundedRows(db,'SELECT id,generation,value FROM controls ORDER BY rowid').map(r=>({...r,receipt:parsed(r.value)})):[];
  return{header:header.value,state,workers,controls};
}
function metadata(db){
  const names=['lifecycle_meta','lifecycle_visibility','lifecycle_receipts','lifecycle_tombstones'],present=names.map(name=>table(db,name));
  if(present.some(Boolean)&&!present.every(Boolean))throw fault('LIFECYCLE_CORRUPT','Lifecycle tables are incomplete');
  if(!present[0])return{revision:0,visibility:[],receipts:[],tombstones:[]};
  const revision=db.prepare('SELECT revision FROM lifecycle_meta WHERE id=1').get()?.revision;
  if(!integer(revision))throw fault('LIFECYCLE_CORRUPT','Lifecycle revision is invalid');
  return{revision,visibility:boundedRows(db,'SELECT value FROM lifecycle_visibility ORDER BY key').map(r=>parsed(r.value)),receipts:boundedRows(db,'SELECT value FROM lifecycle_receipts ORDER BY rowid').map(r=>parsed(r.value,MAX_INVENTORY)),tombstones:boundedRows(db,'SELECT value FROM lifecycle_tombstones ORDER BY key').map(r=>parsed(r.value))};
}
function createTables(db){
  db.exec('CREATE TABLE IF NOT EXISTS lifecycle_meta(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL); INSERT OR IGNORE INTO lifecycle_meta VALUES(1,0); CREATE TABLE IF NOT EXISTS lifecycle_visibility(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS lifecycle_receipts(id TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS lifecycle_tombstones(key TEXT PRIMARY KEY,value TEXT NOT NULL);');
}
const key=(target,generation)=>target.kind==='run'?`run:${generation}`:`worker:${target.generation}:${target.position}:${target.attempt}`;
function targetInput(target){
  if(!target||typeof target!=='object'||Array.isArray(target))throw fault('LIFECYCLE_INPUT','An exact lifecycle target is required');
  const keys=Object.keys(target);
  if(target.kind==='run'&&keys.length===1)return;
  if(target.kind==='worker'&&keys.length===4&&keys.every(k=>['kind','generation','position','attempt'].includes(k))&&integer(target.generation,1)&&integer(target.position)&&target.position<1000&&integer(target.attempt))return;
  throw fault('LIFECYCLE_INPUT','Worker targets require the recorded generation, position and cumulative attempt');
}
function requestInput(request,{reason=false,fields=[]}={}){
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['sessionId','generation','expectedRevision','target','reason',...fields].includes(k)))throw fault('LIFECYCLE_INPUT','Unsupported lifecycle request fields');
  if(!request||typeof request.sessionId!=='string'||!request.sessionId.trim()||request.sessionId.length>256||!integer(request.generation,1)||!integer(request.expectedRevision))throw fault('LIFECYCLE_INPUT','Lifecycle mutation requires the originating session and observed generation/revision');
  targetInput(request.target);
  if(request.reason!==undefined&&(typeof request.reason!=='string'||!request.reason.trim()||request.reason.length>2000)||reason&&request.reason===undefined)throw fault('LIFECYCLE_INPUT','Pruning requires a bounded review reason');
}
async function ownership(runDir,context,sessionId){
  const dataDir=dirname(dirname(runDir)),ownerBytes=await bytes(join(runDir,'runtime.json')),owner=JSON.parse(ownerBytes.toString('utf8'));
  if(owner?.schema!==2||owner.id!==basename(runDir)||basename(dirname(runDir))!=='runs-v2'||typeof owner.sessionId!=='string'||owner.sessionId!==sessionId||context.state.sessionId!==sessionId)throw fault('LIFECYCLE_SESSION','Run ownership and execution must match the originating session');
  const rt=owner.runtime;
  if(!rt||rt.schema!==2||typeof rt.id!=='string'||typeof rt.version!=='string'||rt.id!==`${rt.version}-${rt.digest?.slice(0,16)}-node${process.version.slice(1)}`||typeof rt.path!=='string'||!same(rt.path,join(dataDir,'runtime-v2',rt.id))||typeof rt.codex!=='string'||!inside(rt.path,rt.codex)||rt.node!==process.version||![rt.digest,rt.dependenciesDigest,rt.codexDigest,context.state.runtimeIdentity].every(digest))throw fault('LIFECYCLE_RUNTIME','Retained runtime/dependency identity is unavailable');
  const retained=await jsonFile(join(rt.path,'.runtime.json'));
  if(canonical(retained)!==canonical(rt))throw fault('LIFECYCLE_RUNTIME','Retained runtime installation identity changed');
  return{owner,ownerHash:sha(ownerBytes),runtimeIdentity:hash({runtime:rt,execution:context.state.runtimeIdentity})};
}
function admitted(context,meta,request){
  if(context.state.generation!==request.generation)throw fault('LIFECYCLE_GENERATION','Lifecycle target uses an outdated run generation');
  if(meta.revision!==request.expectedRevision)throw fault('LIFECYCLE_REVISION','Lifecycle metadata changed; inspect a fresh snapshot');
  if(request.target.kind==='worker'){
    const row=context.workers.find(r=>r.generation===request.target.generation&&r.position===request.target.position);
    if(!row||(row.worker.attempts??0)!==request.target.attempt)throw fault('LIFECYCLE_ATTEMPT','Lifecycle target uses an outdated or absent worker attempt');
  }
}
function view(meta,target,generation,status){
  const overlay=meta.visibility.find(v=>key(v.target,v.generation)===key(target,generation));
  const tombstone=meta.tombstones.find(v=>key(v.target,v.generation)===key(target,generation))??meta.tombstones.find(v=>v.target.kind==='run');
  return{schema:1,target,generation,executionStatus:status,visibility:overlay?.visibility??'visible',changedAt:overlay?.changedAt??null,reason:overlay?.reason??null,receiptId:overlay?.receiptId??null,pruned:Boolean(tombstone),tombstone:tombstone??null};
}
export async function readLifecycle(runDir){
  const db=await database(runDir,true);
  try{
    db.exec('BEGIN');const context=execution(db),meta=metadata(db);
    const run=view(meta,{kind:'run'},context.state.generation,context.state.status);
    run.title=typeof context.state.meta?.name==='string'?context.state.meta.name.slice(0,500):null;
    const workers=context.workers.map(r=>view(meta,{kind:'worker',generation:r.generation,position:r.position,attempt:r.worker.attempts??0},r.generation,r.worker.status));
    return{schema:1,revision:meta.revision,run,workers,counts:{hiddenRuns:run.visibility==='visible'?0:1,hiddenWorkers:workers.filter(w=>w.visibility!=='visible').length,archivedWorkers:workers.filter(w=>w.visibility==='archived').length,unknownWorkers:workers.filter(w=>w.executionStatus==='unknown').length,uncertainPrunes:meta.receipts.filter(r=>r.action==='prune'&&['applying','unknown'].includes(r.outcome)).length}};
  }finally{db.close();}
}
export async function readLifecycleReceipt(runDir,id){
  if(typeof id!=='string'||!id||id.length>200)throw fault('LIFECYCLE_INPUT','A receipt identifier is required');
  const db=await database(runDir,true);
  try{const row=table(db,'lifecycle_receipts')?db.prepare('SELECT value FROM lifecycle_receipts WHERE id=?').get(id):null;if(!row)throw fault('LIFECYCLE_MISSING','Lifecycle receipt is unavailable');return parsed(row.value,MAX_INVENTORY);}finally{db.close();}
}
export async function requestLifecycle(runDir,request){
  requestInput(request,{fields:['action','requestId']});
  if(!['hide','archive','restore'].includes(request.action)||typeof request.requestId!=='string'||!request.requestId.trim()||request.requestId.length>200)throw fault('LIFECYCLE_INPUT','Visibility requires hide, archive or restore and a request ID');
  request=JSON.parse(encoded(request));
  const db=await database(runDir,false);
  try{
    // Independent of owner.lock: active execution ownership remains untouched.
    db.exec('BEGIN IMMEDIATE');const context=execution(db),meta=metadata(db);const own=await ownership(runDir,context,request.sessionId);
    const prior=meta.receipts.find(r=>r.id===request.requestId),requestHash=hash(request);
    if(prior){if(prior.requestHash!==requestHash)throw fault('LIFECYCLE_REQUEST','Request ID already identifies another operation');db.exec('COMMIT');return prior;}
    admitted(context,meta,request);createTables(db);
    const timestamp=new Date().toISOString(),revision=meta.revision+1;
    const receipt={schema:1,id:request.requestId,requestId:request.requestId,requestHash,action:request.action,target:request.target,sessionId:request.sessionId,generation:request.generation,ownerHash:own.ownerHash,previousRevision:meta.revision,newRevision:revision,timestamp,outcome:'applied'};
    const overlay={schema:1,target:request.target,generation:request.generation,visibility:{hide:'hidden',archive:'archived',restore:'visible'}[request.action],changedAt:timestamp,reason:request.reason??null,receiptId:receipt.id};
    db.prepare('INSERT OR REPLACE INTO lifecycle_visibility(key,value) VALUES(?,?)').run(key(request.target,request.generation),encoded(overlay));
    db.prepare('UPDATE lifecycle_meta SET revision=? WHERE id=1').run(revision);db.prepare('INSERT INTO lifecycle_receipts(id,value) VALUES(?,?)').run(receipt.id,encoded(receipt));
    db.exec('COMMIT');return receipt;
  }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}finally{db.close();}
}
// Called by the controller *after* obtaining execution ownership and before replay.
// Retirement never relabels prior executions and can never authorize repetition.
export function assertLifecycleReplay(db){
  const meta=metadata(db);
  if(meta.tombstones.length||meta.receipts.some(r=>r.action==='prune'&&['applying','unknown'].includes(r.outcome)))throw fault('REPLAY_PRUNED','Retired or uncertain lifecycle evidence prevents execution reuse; inspect its tombstone/receipt');
}
// backend.close aggregates process/job ownership; terminal inventory belongs to
// individual worker cleanup records and must be positively proven there.
const runDrained=c=>c?.serverExited===true&&c.jobEmpty===true&&c.ownershipScope==='windows-job-members'&&!c.error&&!c.nativeTerminals?.error&&c.nativeTerminals?.inventoryEmpty!==false;
const drained=c=>runDrained(c)&&c.nativeTerminals?.inventoryEmpty===true;
const noProcess=w=>w.status==='failed'&&w.notStarted===true&&w.noProcessStarted===true&&!w.evidence?.cleanup?.error&&!w.evidence?.cleanup?.nativeTerminals?.error&&w.evidence?.cleanup?.serverExited!==false&&w.evidence?.cleanup?.jobEmpty!==false&&w.evidence?.cleanup?.nativeTerminals?.inventoryEmpty!==false;
function flag(value,keys){if(!value||typeof value!=='object')return false;return Object.entries(value).some(([k,v])=>keys.includes(k)&&v===true||flag(v,keys));}
function unresolved(value){if(!value||typeof value!=='object')return false;return Object.entries(value).some(([k,v])=>['unreconciled','reconciliationRequired','recoveryRequired'].includes(k)&&v===true||k==='reconciled'&&v===false||k==='recovery'&&v!=null||unresolved(v));}
function refs(value,output=[]){if(typeof value==='string'&&isAbsolute(value))output.push(resolve(value));else if(value&&typeof value==='object')for(const v of Object.values(value))refs(v,output);return output;}
function selected(context,target){return target.kind==='run'?context.workers:context.workers.filter(r=>r.generation===target.generation&&r.position===target.position);}
function retirementTargets(context,target){return[{target,generation:context.state.generation},...(target.kind==='run'?context.workers.map(r=>({target:{kind:'worker',generation:r.generation,position:r.position,attempt:r.worker.attempts??0},generation:r.generation})):[])];}
function name(value){
  if(typeof value!=='string'||!value||value.length>1024||value.includes('\\')||/[\x00-\x1f:*?"<>|]/.test(value)||isAbsolute(value)||value.split('/').some(p=>!p||['.','..','.git'].includes(p.toLowerCase())||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)))throw fault('PRUNE_INTEGRITY','Unsafe retained workspace name');return value;
}
function fsIdentity(s){
  if(s.ino===0n)throw fault('PRUNE_IDENTITY','Filesystem identity is unavailable');
  return{device:String(s.dev),inode:String(s.ino),birthtime:String(s.birthtimeNs),mode:String(s.mode),size:String(s.size),mtime:String(s.mtimeNs),ctime:String(s.ctimeNs)};
}
async function entryIdentity(path){await noLinks(path);const s=await fs.lstat(path,{bigint:true});if(!s.isFile()&&!s.isDirectory()||s.isFile()&&s.nlink!==1n)throw fault('PRUNE_IDENTITY','Links, hardlink aliases and special payloads cannot be pruned');return{type:s.isDirectory()?'directory':'file',identity:fsIdentity(s),size:Number(s.size)};}
async function fileHash(path,budget){
  await regular(path);const handle=await fs.open(path,'r');const h=createHash('sha256');let total=0;
  try{
    if((await handle.stat()).size>budget)throw fault('PRUNE_LIMIT','Prune payload exceeds the bounded hashing limit');
    const buffer=Buffer.alloc(1024*1024);
    while(true){const {bytesRead}=await handle.read(buffer,0,buffer.length,null);if(!bytesRead)break;total+=bytesRead;if(total>budget)throw fault('PRUNE_LIMIT','Prune payload grew beyond the bounded hashing limit');h.update(buffer.subarray(0,bytesRead));}
    return{sha256:h.digest('hex'),bytes:total};
  }finally{await handle.close();}
}
async function inventory(root,budget){
  const entries=[];let size=0,jsonSize=0;
  async function visit(path,relativeName){
    if(++budget.entries>MAX_ENTRIES)throw fault('PRUNE_LIMIT','Prune inventory exceeded its complete-entry limit');
    const before=await entryIdentity(path),item={name:relativeName,...before,sha256:null};
    if(before.type==='file'){
      const content=await fileHash(path,MAX_BYTES-budget.bytes);size+=content.bytes;budget.bytes+=content.bytes;item.sha256=content.sha256;
      if(content.bytes!==before.size)throw fault('PRUNE_IDENTITY','Payload changed while planning');
    }
    entries.push(item);jsonSize+=Buffer.byteLength(encoded(item));budget.json+=Buffer.byteLength(encoded(item));if(budget.json>MAX_INVENTORY)throw fault('PRUNE_LIMIT','Complete inventory JSON exceeded its limit');
    if(before.type==='directory')for await(const child of await fs.opendir(path))await visit(join(path,name(child.name)),relativeName?relativeName+'/'+child.name:child.name);
    const after=await entryIdentity(path);if(canonical(before)!==canonical(after))throw fault('PRUNE_IDENTITY','Payload identity changed during inventory');
  }
  await visit(root,'');entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  return{entries,entryCount:entries.length,fileCount:entries.filter(e=>e.type==='file').length,bytes:size,inventoryHash:hash(entries),jsonBytes:jsonSize};
}
async function retainedFile(path,expected,limit=32*1024*1024){if(!digest(expected)||sha(await bytes(path,limit))!==expected)throw fault('PRUNE_INTEGRITY','Retained capture evidence is missing or changed');}
async function inputEvidence(runDir,state){
  const ref=state.workspaceInputs;if(!ref)throw fault('PRUNE_INTEGRITY','Workspace lacks captured input ownership');
  if(typeof ref.manifestPath!=='string'||!inside(join(runDir,'workspaces'),ref.manifestPath))throw fault('PRUNE_INTEGRITY','Captured inputs escape owned artifacts');
  await retainedFile(ref.manifestPath,ref.manifestHash);const input=await jsonFile(ref.manifestPath,32*1024*1024);
  if(![1,2].includes(input.version)||input.source!==ref.source||input.base!==ref.base||input.inputTree!==ref.inputTree||!inside(join(runDir,'workspaces'),input.artifactsDir)||!inside(input.artifactsDir,input.inputIndex)||!Array.isArray(input.files)||input.files.length>20000)throw fault('PRUNE_INTEGRITY','Captured input identity is incomplete');
  await retainedFile(input.inputIndex,input.inputIndexHash);
  for(const file of input.files){name(file.name);if(!inside(input.artifactsDir,file.blobPath))throw fault('PRUNE_INTEGRITY','Input blobs escape capture evidence');await retainedFile(file.blobPath,file.sha256,128*1024*1024);}
  if(input.version===2){
    const policy=await import('./workspace-policy.mjs'),capture=await import('./workspaces.mjs');
    if(typeof policy.validateCapturePolicy!=='function'||typeof capture.loadInputs!=='function'||typeof capture.readWorkspaceExclusions!=='function')throw fault('PRUNE_CAPTURE_UNAVAILABLE','Version 2 capture verification requires the coordinator-integrated capture exports');
    const normalized=policy.validateCapturePolicy(input.policy);if(normalized.policyHash!==input.policyHash||ref.policyHash!==input.policyHash||state.capturePolicyHash!==input.policyHash)throw fault('PRUNE_INTEGRITY','Frozen capture policy identity changed');
    await capture.loadInputs(ref);
  }
  return input;
}
async function workspaceEvidence(runDir,state,worker,input,{live=true}={}){
  const ws=worker.workspace;
  if(worker.workspaceError||!ws||!digest(ws.manifestHash)||ws.source!==input.source||ws.common!==input.common||ws.base!==input.base||ws.inputTree!==input.inputTree||ws.inputIndex!==input.inputIndex||ws.inputIndexHash!==input.inputIndexHash||!inside(input.parent,ws.cwd)||!inside(join(runDir,'workspaces'),ws.artifactsDir))throw fault('PRUNE_INTEGRITY','Retained workspace ownership is incomplete');
  await noLinks(ws.cwd);if(await fs.realpath(ws.cwd)!==ws.cwd)throw fault('PRUNE_IDENTITY','Workspace canonical identity changed');
  for(const path of [ws.manifestPath,ws.patchPath,ws.basePatchPath])if(typeof path!=='string'||!inside(ws.artifactsDir,path))throw fault('PRUNE_INTEGRITY','Retained outputs escape owned artifacts');
  await retainedFile(join(ws.cwd,'.git'),ws.gitPointerHash,8192);
  const pointer=(await bytes(join(ws.cwd,'.git'),8192)).toString('utf8').trim();if(!pointer.startsWith('gitdir: '))throw fault('PRUNE_IDENTITY','Workspace Git identity is invalid');
  const registration=resolve(ws.cwd,pointer.slice(8));if(!inside(join(ws.common,'worktrees'),registration))throw fault('PRUNE_IDENTITY','Workspace is not registered in the captured repository');
  const gitdir=(await bytes(join(registration,'gitdir'),8192)).toString('utf8').trim(),common=(await bytes(join(registration,'commondir'),8192)).toString('utf8').trim();
  if(!same(resolve(registration,gitdir),join(ws.cwd,'.git'))||!same(resolve(registration,common),ws.common))throw fault('PRUNE_IDENTITY','Workspace Git registration changed');
  await retainedFile(ws.manifestPath,ws.manifestHash);await retainedFile(ws.patchPath,ws.patchHash);await retainedFile(ws.basePatchPath,ws.basePatchHash);
  const manifest=await jsonFile(ws.manifestPath,32*1024*1024);
  for(const field of ['version','cwd','source','common','base','inputTree','inputIndex','inputIndexHash','gitPointerHash','artifactsDir','resultTree','patchPath','patchHash','basePatchPath','basePatchHash','fileCount','bytes'])if(canonical(manifest[field])!==canonical(ws[field]))throw fault('PRUNE_INTEGRITY','Workspace manifest identity differs from its execution record');
  if(!Array.isArray(manifest.files)||manifest.files.length>20000||manifest.files.length!==ws.fileCount)throw fault('PRUNE_INTEGRITY','Included workspace inventory is incomplete');
  const included=new Map();let total=0;
  for(const file of manifest.files){
    const n=name(file.name);if(included.has(n.toLowerCase())||!integer(file.size)||typeof file.blobPath!=='string'||!inside(ws.artifactsDir,file.blobPath))throw fault('PRUNE_INTEGRITY','Invalid retained file claim');
    included.set(n.toLowerCase(),file);total+=file.size;
    const stored=await bytes(file.blobPath,128*1024*1024);if(stored.length!==file.size||sha(stored)!==file.sha256)throw fault('PRUNE_INTEGRITY','Retained output blob is missing or changed');
    if(live)await retainedFile(join(ws.cwd,...n.split('/')),file.sha256,128*1024*1024);
  }
  if(total!==ws.bytes)throw fault('PRUNE_INTEGRITY','Retained byte count is incomplete');
  if(ws.version===2){
    const capture=await import('./workspaces.mjs');
    if(typeof capture.readWorkspaceExclusions!=='function'||typeof capture.verifyWorkspace!=='function'||ws.policyHash!==input.policyHash||canonical(ws.inputs)!==canonical(state.workspaceInputs))throw fault('PRUNE_CAPTURE_UNAVAILABLE','Version 2 workspace inventory verification is unavailable');
    // Paging verifies the authoritative inventory, never a caller-supplied path.
    for(const stage of ['inputs','outputs']){let after=0,count=0;do{const page=await capture.readWorkspaceExclusions(ws,{stage,after,limit:100});if(page.policyHash!==input.policyHash||!Array.isArray(page.entries)||page.entries.length>100||(count+=page.entries.length)>MAX_ENTRIES)throw fault('PRUNE_INTEGRITY','Excluded inventory is incomplete');if(page.nextAfter===null)break;if(!integer(page.nextAfter)||page.nextAfter<=after)throw fault('PRUNE_INTEGRITY','Excluded inventory paging did not advance');after=page.nextAfter;}while(true);}
    if(live)await capture.verifyWorkspace(ws);
  }else if(ws.version!==1)throw fault('PRUNE_INTEGRITY','Workspace capture version is unsupported');
  return{ws,included};
}
function blocker(code,detail,target){return{code,detail,...(target?{target}:{})};}
async function buildPlan(runDir,context,meta,own,request,{id=randomUUID(),createdAt=new Date().toISOString(),lease=null}={}){
  const {state,workers,controls}=context,chosen=selected(context,request.target),blocked=[];
  const add=(code,detail)=>blocked.push(blocker(code,detail));
  // A prior installed controller may ignore retirement metadata. Do not retire
  // its run and leave a still-valid replay path in that immutable runtime.
  let replayGuard=false;
  try{const pkg=await jsonFile(join(own.owner.runtime.path,'package.json'));replayGuard=Array.isArray(pkg.agentWorkflowCapabilities)&&pkg.agentWorkflowCapabilities.includes('lifecycle-retirement-v1');}catch{}
  if(!replayGuard)add('PRUNE_RUNTIME_UNSUPPORTED','The retained runtime does not declare retirement-aware replay; its evidence must remain available');
  if(lease)await stillOwned(lease);
  else try{await fs.lstat(join(runDir,'owner.lock'));add('PRUNE_LOCKED','Execution ownership is held; a stale lock requires coordinator inspection');}catch(e){if(e.code!=='ENOENT')add('PRUNE_INTEGRITY','Execution ownership could not be inspected');}
  if(!['completed','failed','blocked','paused','stopped'].includes(state.status)||state.acceptingControls||workers.some(r=>['running','queued'].includes(r.worker.status)))add('PRUNE_ACTIVE','Execution must be settled before destructive retirement');
  if(workers.some(r=>r.worker.status==='unknown')||state.status==='unknown'||controls.some(r=>r.receipt.status==='unknown'))add('PRUNE_UNKNOWN','Unknown historical effects must remain available for reconciliation');
  if(meta.receipts.some(r=>r.action==='prune'&&['unknown','applying'].includes(r.outcome)))add('PRUNE_UNCERTAIN','A prior destructive effect requires coordinator reconciliation; retry is forbidden');
  if(!runDrained(state.cleanup)||controls.some(r=>['pending','applying'].includes(r.receipt.status)))add('PRUNE_DRAIN','Exclusive settled ownership and complete owned-job drain evidence are required');
  if(unresolved(state)||workers.some(r=>unresolved(r.worker)))add('PRUNE_UNRECONCILED','Recovery or unreconciled effects are protected');
  if(flag(state,['pinned','retain','retentionRequired'])||chosen.some(r=>flag(r.worker,['pinned','retain','retentionRequired'])))add('PRUNE_PINNED','Pinned retention/runtime/recovery data is protected');
  if(meta.tombstones.some(t=>t.target.kind==='run'||request.target.kind==='worker'&&key(t.target,t.generation)===key(request.target,request.generation)))add('PRUNE_RETIRED','Target already has a retirement tombstone');
  if(state.version!==1||state.workerCount!==workers.filter(r=>r.generation===state.generation).length||workers.some(r=>r.generation>state.generation))add('PRUNE_INTEGRITY','Complete current/historical execution identity is unavailable');
  for(const row of workers){
    const w=row.worker;
    if(!Array.isArray(w.dependencies)||w.dependencies.some(p=>!integer(p)||p>=row.position||!workers.some(r=>r.generation===row.generation&&r.position===p)))add('PRUNE_INTEGRITY','Recorded dependency evidence is incomplete');
    const history=[w.reusedFrom,...(Array.isArray(w.priorExecutions)?w.priorExecutions:[])].filter(Boolean);
    if(w.priorExecutions!==undefined&&!Array.isArray(w.priorExecutions)||history.some(ref=>!integer(ref.generation,1)||ref.generation>=row.generation||ref.position!==row.position||!workers.some(r=>r.generation===ref.generation&&r.position===ref.position)))add('PRUNE_INTEGRITY','Retained reuse/replacement references are incomplete');
    if(!['completed','failed','queued','running','unknown'].includes(w.status)||w.status==='completed'&&(!Object.hasOwn(w,'result')||sha(JSON.stringify(w.result))!==w.resultHash))add('PRUNE_INTEGRITY','Original execution outcome integrity is incomplete');
    if(!noProcess(w)&&!drained(w.evidence?.cleanup))add('PRUNE_DRAIN','Every historical execution requires positive owned-job/native cleanup or separately evidenced no-process startup');
    if(w.activeTurn)add('PRUNE_ACTIVE','A retained active turn prevents destructive retirement');
    if(w.workspaceError||w.options?.permissions?.sandbox==='workspace-write'&&!w.workspace)add('PRUNE_INTEGRITY','Missing writer capture/recovery evidence is protected');
  }
  // Retired dependencies remain referenced, even when hidden or cached.
  if(request.target.kind==='worker')for(const row of workers){
    if(row.generation===request.target.generation&&row.position===request.target.position)continue;
    const references=[row.worker.reusedFrom,...(Array.isArray(row.worker.priorExecutions)?row.worker.priorExecutions:[])].filter(Boolean);
    if(references.some(r=>r.generation===request.target.generation&&r.position===request.target.position)||row.generation===request.target.generation&&Array.isArray(row.worker.dependencies)&&row.worker.dependencies.includes(request.target.position)||row.worker.workspace&&chosen.some(r=>r.worker.workspace?.cwd===row.worker.workspace.cwd))add('PRUNE_REFERENCED','Retained generation, dependency or reuse history still needs this worker');
  }
  const evidenceHash=hash({header:context.header,workers:workers.map(({generation,position,value})=>({generation,position,value})),controls:controls.map(({id,generation,value})=>({id,generation,value}))});
  const referenceGraphHash=hash({paths:refs(state).sort(),workers:workers.map(r=>({generation:r.generation,position:r.position,paths:refs(r.worker).sort(),dependencies:r.worker.dependencies??null,reusedFrom:r.worker.reusedFrom??null,priorExecutions:r.worker.priorExecutions??[]})),tombstones:meta.tombstones});
  const candidates=[],budget={entries:0,bytes:0,json:0};
  if(!blocked.length){
    try{
      const retired=r=>meta.tombstones.some(t=>t.outcome==='applied'&&t.target.kind==='worker'&&t.target.generation===r.generation&&t.target.position===r.position&&t.target.attempt===(r.worker.attempts??0));
      const allWorkspaces=workers.filter(r=>r.worker.workspace),input=allWorkspaces.length?await inputEvidence(runDir,state):null;
      const verified=new Map();
      // An unrelated generation's incomplete artifacts cannot disappear behind a
      // narrowly selected target. Previously retired live bytes stay retired.
      for(const row of allWorkspaces)verified.set(row,await workspaceEvidence(runDir,state,row.worker,input,{live:!retired(row)}));
      const withWorkspaces=chosen.filter(r=>r.worker.workspace&&!retired(r));
      const seen=new Set();
      for(const row of withWorkspaces){
        const {ws,included}=verified.get(row);if(seen.has(ws.cwd))continue;seen.add(ws.cwd);
        const target={kind:'worker',generation:row.generation,position:row.position,attempt:row.worker.attempts??0};
        const workerReferences=workers.flatMap(r=>refs(chosen.includes(r)&&r.worker.workspace?.cwd===ws.cwd?{...r.worker,workspace:{...r.worker.workspace,cwd:null}}:r.worker));
        const protectedPaths=[join(runDir,'run.sqlite'),join(runDir,'runtime.json'),dirname(own.owner.runtime.path),ws.common,ws.artifactsDir,input.artifactsDir,...refs(state),...workerReferences];
        const top=[];let topBytes=0;for await(const child of await fs.opendir(ws.cwd))if(child.name!=='.git'){top.push(name(child.name));topBytes+=Buffer.byteLength(child.name);if(top.length>MAX_ENTRIES||topBytes>MAX_INVENTORY)throw fault('PRUNE_LIMIT','Workspace enumeration exceeded its complete-inventory limit');}top.sort();
        const observed=new Set();
        for(const child of top){
          const path=join(ws.cwd,child);if(protectedPaths.some(p=>overlaps(path,p))){blocked.push(blocker('PRUNE_REFERENCED','A live path is pinned by retained recovery/runtime/input evidence',target));continue;}
          const inv=await inventory(path,budget);
          for(const entry of inv.entries.filter(e=>e.type==='file')){
            const n=(child+(entry.name?'/'+entry.name:'')).toLowerCase();observed.add(n);
            if(ws.version===1&&!included.has(n))throw fault('PRUNE_INTEGRITY','Uncaptured live output cannot be retired');
          }
          candidates.push({path,target,workspace:{cwd:ws.cwd,identity:(await entryIdentity(ws.cwd)).identity,gitPointerHash:ws.gitPointerHash},identity:inv.entries[0].identity,...inv});
        }
        if([...included.keys()].some(n=>!observed.has(n)))throw fault('PRUNE_INTEGRITY','Not every included source output has a reviewed live candidate');
      }
    }catch(e){blocked.push(blocker(e.code==='PRUNE_CAPTURE_UNAVAILABLE'?e.code:'PRUNE_INTEGRITY',e.code==='PRUNE_CAPTURE_UNAVAILABLE'?e.message:'Capture, filesystem identity or complete inventory verification failed'));}
  }
  const plan={schema:1,id,runId:own.owner.id,ownerHash:own.ownerHash,runtimeIdentity:own.runtimeIdentity,generation:state.generation,lifecycleRevision:meta.revision,target:request.target,reason:request.reason,evidenceHash,referenceGraphHash,policyHash:hash({retirement:RETIRE_POLICY,capturePolicyHash:state.capturePolicyHash??null}),candidates,blocked,createdAt};
  encoded(plan,MAX_INVENTORY);return{...plan,planHash:hash(plan)};
}
export async function planPrune(runDir,request){
  requestInput(request,{reason:true});request=JSON.parse(encoded(request));const db=await database(runDir,true);
  try{db.exec('BEGIN');const context=execution(db),meta=metadata(db);admitted(context,meta,request);const own=await ownership(runDir,context,request.sessionId);return await buildPlan(runDir,context,meta,own,request);}finally{db.close();}
}
async function exclusive(runDir){
  const path=join(runDir,'owner.lock'),token=randomUUID();let handle;
  try{handle=await fs.open(path,'wx');}catch(e){if(e.code==='EEXIST')throw fault('RUN_LOCKED','Execution ownership is held; it is never stolen');throw e;}
  try{await handle.writeFile(token);await handle.sync();}catch(e){await handle.close();throw e;}
  return{path,token,handle};
}
async function stillOwned(lease){if((await bytes(lease.path,200)).toString('utf8')!==lease.token)throw fault('RUN_OWNERSHIP','Exclusive prune ownership changed');}
async function deleteCandidate(candidate,lease){
  // No recursive rm, following links, glob expansion, fallback, or retry.
  // Remove precisely reviewed entries, deepest first; additions make rmdir fail.
  const entries=[...candidate.entries].sort((a,b)=>b.name.split('/').length-a.name.split('/').length||b.name.localeCompare(a.name));
  for(const entry of entries){
    const root=await entryIdentity(candidate.workspace.cwd);
    for(const field of ['device','inode','birthtime','mode'])if(root.identity[field]!==candidate.workspace.identity[field])throw fault('PRUNE_IDENTITY','Workspace root identity changed');
    await retainedFile(join(candidate.workspace.cwd,'.git'),candidate.workspace.gitPointerHash,8192);
    await stillOwned(lease);const path=entry.name?join(candidate.path,...entry.name.split('/')):candidate.path;
    if(!same(path,candidate.path)&&!inside(candidate.path,path))throw fault('PRUNE_IDENTITY','Candidate escaped its reviewed path');
    const current=await entryIdentity(path);
    if(entry.type!==current.type)throw fault('PRUNE_IDENTITY','Prune entry type changed');
    if(entry.type==='file'){
      if(canonical(current.identity)!==canonical(entry.identity)||(await fileHash(path,MAX_BYTES)).sha256!==entry.sha256)throw fault('PRUNE_IDENTITY','File identity or bytes changed after approval');
      await fs.unlink(path);
    }else{
      // Our own child removals change directory times/size; identity must persist.
      for(const field of ['device','inode','birthtime','mode'])if(current.identity[field]!==entry.identity[field])throw fault('PRUNE_IDENTITY','Directory identity changed after approval');
      await fs.rmdir(path);
    }
  }
}
export async function applyPrune(runDir,{sessionId,plan,approvedPlanHash}={}){
  if(!plan||plan.schema!==1||typeof plan.id!=='string'||!plan.id||plan.id.length>200||!digest(approvedPlanHash)||plan.planHash!==approvedPlanHash)throw fault('PRUNE_APPROVAL','Exact reviewed plan hash is required');
  plan=JSON.parse(encoded(plan,MAX_INVENTORY));
  const {planHash,...body}=plan;if(hash(body)!==planHash)throw fault('PRUNE_APPROVAL','Reviewed plan contents changed');
  const request={sessionId,generation:plan.generation,expectedRevision:plan.lifecycleRevision,target:plan.target,reason:plan.reason};requestInput(request,{reason:true});
  // Reject a repeated destructive ID before revision errors can obscure its receipt.
  let probe=await database(runDir,true);
  try{const context=execution(probe);await ownership(runDir,context,sessionId);if(metadata(probe).receipts.some(r=>r.id===plan.id))throw fault('PRUNE_REPLAY','Prune was already admitted; inspect its receipt and never resubmit');}finally{probe.close();}
  const lease=await exclusive(runDir);let db,receipt,admittedEffect=false,transaction=false;
  try{
    db=await database(runDir,false);db.exec('BEGIN IMMEDIATE');transaction=true;
    const context=execution(db),meta=metadata(db);admitted(context,meta,request);const own=await ownership(runDir,context,sessionId);
    if(meta.receipts.some(r=>r.id===plan.id))throw fault('PRUNE_REPLAY','Prune receipt already exists');
    await stillOwned(lease);
    const fresh=await buildPlan(runDir,context,meta,own,request,{id:plan.id,createdAt:plan.createdAt,lease});
    if(fresh.blocked.length)throw fault('PRUNE_INELIGIBLE','Prune target is no longer eligible; inspect a fresh plan');
    if(fresh.planHash!==approvedPlanHash)throw fault('PRUNE_STALE','Ownership, evidence, references, inventory or filesystem identity changed');
    createTables(db);const timestamp=new Date().toISOString(),revision=meta.revision+1;
    receipt={schema:1,id:plan.id,requestId:plan.id,action:'prune',target:plan.target,sessionId,generation:plan.generation,previousRevision:meta.revision,newRevision:revision,timestamp,outcome:'applying',planHash,plan,removed:[]};
    db.prepare('INSERT INTO lifecycle_receipts(id,value) VALUES(?,?)').run(receipt.id,encoded(receipt,MAX_INVENTORY));db.prepare('UPDATE lifecycle_meta SET revision=? WHERE id=1').run(revision);
    const tombstones=retirementTargets(context,plan.target).filter(item=>!meta.tombstones.some(t=>key(t.target,t.generation)===key(item.target,item.generation))).map(item=>({schema:1,...item,receiptId:plan.id,planHash,reason:plan.reason,changedAt:timestamp,outcome:'applying',evidenceHash:plan.evidenceHash,referenceGraphHash:plan.referenceGraphHash,retainedExecution:true,retainedCaptureEvidence:true}));
    for(const t of tombstones)db.prepare('INSERT OR REPLACE INTO lifecycle_tombstones(key,value) VALUES(?,?)').run(key(t.target,t.generation),encoded(t));
    db.exec('COMMIT');transaction=false;admittedEffect=true;
    // The applying receipt/tombstones are now durable before the first unlink.
    db.exec('BEGIN IMMEDIATE');transaction=true;await stillOwned(lease);
    if(metadata(db).revision!==revision)throw fault('PRUNE_STALE','Lifecycle metadata changed after prune admission');
    const again=execution(db),againOwner=await ownership(runDir,again,sessionId);
    if(againOwner.ownerHash!==plan.ownerHash||againOwner.runtimeIdentity!==plan.runtimeIdentity||again.header!==context.header)throw fault('PRUNE_STALE','Execution ownership changed after prune admission');
    const rechecked=await buildPlan(runDir,again,meta,againOwner,request,{id:plan.id,createdAt:plan.createdAt,lease});
    if(rechecked.planHash!==planHash)throw fault('PRUNE_STALE','Evidence, references, ownership or inventories changed after prune admission');
    for(const candidate of plan.candidates){
      const budget={entries:0,bytes:0,json:0},current=await inventory(candidate.path,budget);
      if(current.inventoryHash!==candidate.inventoryHash)throw fault('PRUNE_STALE','Reviewed inventory changed before deletion');
      await deleteCandidate(candidate,lease);receipt.removed.push(candidate.path);
    }
    receipt.outcome='applied';receipt.finishedAt=new Date().toISOString();
    db.prepare('UPDATE lifecycle_receipts SET value=? WHERE id=?').run(encoded(receipt,MAX_INVENTORY),receipt.id);
    for(const t of tombstones)db.prepare('UPDATE lifecycle_tombstones SET value=? WHERE key=?').run(encoded({...t,outcome:'applied',changedAt:receipt.finishedAt}),key(t.target,t.generation));
    db.exec('COMMIT');transaction=false;return receipt;
  }catch(e){
    if(transaction){try{db.exec('ROLLBACK');}catch{}transaction=false;}
    if(!admittedEffect)throw e;
    receipt.outcome='unknown';receipt.finishedAt=new Date().toISOString();receipt.error={code:e.code??'PRUNE_FAILED',message:'Prune may have partial effects; preserve evidence and require coordinator reconciliation before any further destructive action'};
    // No filesystem retry. A failed receipt write leaves durable applying evidence.
    try{
      db.exec('BEGIN IMMEDIATE');transaction=true;db.prepare('UPDATE lifecycle_receipts SET value=? WHERE id=?').run(encoded(receipt,MAX_INVENTORY),receipt.id);
      for(const row of boundedRows(db,'SELECT key,value FROM lifecycle_tombstones')){const t=parsed(row.value);if(t.receiptId===receipt.id)db.prepare('UPDATE lifecycle_tombstones SET value=? WHERE key=?').run(encoded({...t,outcome:'unknown',changedAt:receipt.finishedAt}),row.key);}
      db.exec('COMMIT');transaction=false;
    }catch(recordError){if(transaction)try{db.exec('ROLLBACK');}catch{}throw fault('PRUNE_UNCERTAIN','Prune receipt could not be finalized; inspect its durable applying evidence',{cause:recordError});}
    return receipt;
  }finally{
    db?.close();await lease.handle.close();
    // Never remove another owner's lock or attempt stale-lock recovery.
    if((await bytes(lease.path,200)).toString('utf8')===lease.token)await fs.unlink(lease.path);
  }
}
