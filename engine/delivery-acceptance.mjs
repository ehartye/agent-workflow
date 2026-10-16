import {types} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {lstat,realpath,open} from 'node:fs/promises';
import {join,isAbsolute,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolveRun,noLinks} from '../bin/managed-runtime.mjs';
import {readStageCheckpoint,listStageCheckpoints} from './stage-checkpoints.mjs';
import {validateCapturePolicy} from './workspace-policy.mjs';
import {fault} from '../foundation/client.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>Array.isArray(x)?`[${x.map(v=>canonical(v)).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')}}`:JSON.stringify(x);
const same=(a,b)=>canonical(a)===canonical(b);
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const id=x=>typeof x==='string'&&x.length<=200&&/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(x);
function fail(code){throw fault('ACCEPTANCE_'+code,`Delivery acceptance ${code.toLowerCase()}`);}
function check(value,reason,status='rejected'){if(!value)throw Object.assign(new Error(reason),{reason,status});}
function plain(x){return !types.isProxy(x)&&x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;}
function inertJson(x,depth=0,budget={n:0}){
 if(depth>64||++budget.n>100000||types.isProxy(x))fail('INPUT');
 if(x===null||['boolean','string'].includes(typeof x))return;
 if(typeof x==='number'&&Number.isFinite(x))return;
 if(!plain(x)&&!Array.isArray(x))fail('INPUT');
 if(Array.isArray(x)&&(Object.getPrototypeOf(x)!==Array.prototype||Object.keys(x).length!==x.length||!Object.keys(x).every((k,i)=>k===`${i}`)))fail('INPUT');
 const d=Object.getOwnPropertyDescriptors(x);for(const k of Reflect.ownKeys(x)){if(typeof k!=='string'||!Object.hasOwn(d[k],'value'))fail('INPUT');if(Array.isArray(x)&&k==='length')continue;if(!d[k].enumerable)fail('INPUT');inertJson(d[k].value,depth+1,budget);}
}
function requestSchema(x){
 inertJson(x);const keys=['schemaVersion','run','planHash','checkpointId','objectiveIds'];
 if(!plain(x)||Object.keys(x).length!==keys.length||!keys.every(k=>Object.hasOwn(x,k))||x.schemaVersion!==1||!sha(x.planHash)||!uuid(x.checkpointId))fail('INPUT');
 if(!plain(x.run)||Object.keys(x.run).length!==3||!id(x.run.dataInstanceId)||!uuid(x.run.runId)||!id(x.run.runtimeId)||!Array.isArray(x.objectiveIds)||x.objectiveIds.length>64||!x.objectiveIds.every(id)||new Set(x.objectiveIds).size!==x.objectiveIds.length||Buffer.byteLength(JSON.stringify(x))>65536)fail('INPUT');
}
async function identify(dataDir,runId,sessionId){
 try{const owner=await resolveRun({dataDir,id:runId,sessionId});await noLinks(dataDir);const root=await realpath(dataDir),stat=await lstat(dataDir,{bigint:true});return{owner,ref:{dataInstanceId:hash(JSON.stringify([process.platform==='win32'?root.toLowerCase():root,String(stat.dev),String(stat.ino),String(stat.birthtimeNs)])),runId:owner.id,runtimeId:owner.runtime.id}};}catch{fail('OWNERSHIP');}
}
async function retained(owner,name){
 const path=join(owner.runtime.path,'engine',name);try{await noLinks(path);check((await lstat(path)).isFile(),'retained_provider_unavailable','unknown');return await import(pathToFileURL(path).href);}catch{throw Object.assign(new Error('retained_provider_unavailable'),{reason:'retained_provider_unavailable',status:'unknown'});}
}
async function regular(path,max){
 await noLinks(path);const h=await open(path,'r');try{const s=await h.stat();check(s.isFile()&&s.nlink===1&&s.size<=max,'artifact_path');const bytes=Buffer.alloc(Math.min(s.size+1,max+1));let n=0;while(n<bytes.length){const r=await h.read(bytes,n,bytes.length-n,null);if(!r.bytesRead)break;n+=r.bytesRead;}const after=await h.stat(),name=await lstat(path);check(n===s.size&&after.size===s.size&&after.mtimeMs===s.mtimeMs&&name.dev===s.dev&&name.ino===s.ino&&name.nlink===1,'artifact_changed');return bytes.subarray(0,n);}finally{await h.close();}
}
async function readProducer({dataDir,sessionId,run},reference,fresh=false,inspect=false){
 check(reference.run.dataInstanceId===run.dataInstanceId,'producer_ownership');
 let owner;try{({owner}=await identify(dataDir,reference.run.runId,sessionId));}catch{check(false,'producer_ownership');}
 check(owner.runtime.id===reference.run.runtimeId,'producer_ownership');
 const path=join(owner.runDir,'run.sqlite');await noLinks(path);check((await lstat(path)).isFile(),'producer_storage','missing');
 const db=new DatabaseSync(path,{readOnly:true});
 try{
  db.exec('BEGIN');const headerRow=db.prepare('SELECT value,length(CAST(value AS BLOB)) bytes FROM header WHERE id=1').get();check(headerRow&&headerRow.bytes<=2097152,'producer_storage');const header=JSON.parse(headerRow.value);check(header.sessionId===sessionId,'producer_ownership');
  const visited=new Set();let reads=0;
  function get(generation,position){
   check(Number.isSafeInteger(generation)&&generation>0&&generation<=header.generation&&Number.isSafeInteger(position)&&position>=0&&position<1000,'producer_lineage');
   check(++reads<=1000,'producer_lineage_limit','unknown');const row=db.prepare('SELECT value,length(CAST(value AS BLOB)) bytes FROM workers WHERE generation=? AND position=?').get(generation,position);check(row,'producer_missing','missing');check(row.bytes<=2097152,'producer_storage');const w=JSON.parse(row.value);check(w.position===position,'producer_lineage');return w;
  }
  let generation=reference.generation,position=reference.position,w=get(generation,position),cached=false;
  for(;;){
   const key=generation+':'+position;check(!visited.has(key),'producer_lineage');visited.add(key);
   const cumulative=w.attempts??(w.status==='queued'?0:null);
   check(Number.isSafeInteger(cumulative)&&cumulative>=0&&cumulative===reference.attempt,'producer_stale_attempt');
   const offset=w.attemptOffset??0;check(Number.isSafeInteger(offset)&&offset>=0&&offset<=cumulative,'producer_stale_attempt');
   check(Array.isArray(w.priorExecutions??[])&&(w.priorExecutions??[]).length<=1000,'producer_lineage');
   if(offset>0)check(w.priorExecutions?.length>0,'producer_lineage_missing','unknown');
   const priorKeys=new Set();let priorMaximum=0;
   for(const p of w.priorExecutions??[]){check(p&&Object.keys(p).length===2&&Number.isSafeInteger(p.generation)&&p.generation<generation&&!priorKeys.has(p.generation+':'+p.position),'producer_lineage');priorKeys.add(p.generation+':'+p.position);const prior=get(p.generation,p.position);check(plain(w.origin)&&same(prior.origin,w.origin)&&Number.isSafeInteger(prior.attempts)&&prior.attempts<=offset,'producer_lineage');priorMaximum=Math.max(priorMaximum,prior.attempts);}
   if(offset>0)check(priorMaximum===offset,'producer_stale_attempt');
   if(!w.reusedFrom){check(!w.cached,'producer_lineage');break;}
   cached=true;check(w.cached===true&&w.reusedFrom.generation<generation&&(!Object.hasOwn(w,'sourceGeneration')||w.sourceGeneration===w.reusedFrom.generation)&&(!Object.hasOwn(w,'sourcePosition')||w.sourcePosition===w.reusedFrom.position),'producer_lineage');
   const source=get(w.reusedFrom.generation,w.reusedFrom.position);check(same(source.origin??null,w.origin??null)&&same(source.result,w.result)&&source.resultHash===w.resultHash,'producer_lineage');generation=w.reusedFrom.generation;position=w.reusedFrom.position;w=source;
  }
  if(fresh)check(!cached,'cached_verifier');
  if(inspect)return{owner,worker:w,cached,reference:{run:reference.run,generation,position,attempt:reference.attempt}};
  check(!['unknown','running','queued'].includes(w.status),'producer_execution_unknown','unknown');check(w.status==='completed','producer_execution_failed');
  check(Object.hasOwn(w,'result')&&sha(w.resultHash)&&hash(JSON.stringify(w.result))===w.resultHash,'producer_result_hash');
  const r=w.result;
  check(plain(r)&&['complete','partial'].includes(r.status)&&(!Object.hasOwn(r,'missing')||Array.isArray(r.missing)&&r.missing.length<=64&&r.missing.every(x=>typeof x==='string'&&x.length<=8192)),'producer_declared_outcome');
  if(fresh)check(r.status==='complete'&&(!r.missing||r.missing.length===0),'verifier_declared_outcome');
  // Partial source declarations remain visible facts. Completion is decided only
  // by the objective's explicit artifact, review, authentic check and verifier set.
  const attempts=w.evidence?.attempts,offset=w.attemptOffset??0;
  check(Array.isArray(attempts)&&attempts.length>0&&attempts.length<=1000,'producer_attempt_evidence','unknown');
  check(attempts.every((a,i)=>Number.isSafeInteger(a.number)&&a.number===i+1)&&attempts.at(-1).status==='completed'&&offset+attempts.at(-1).number===reference.attempt,'producer_stale_attempt');
  const c=w.evidence?.cleanup;check(c?.serverExited===true&&c.jobEmpty===true&&c.forced===false&&c.ownershipScope==='windows-job-members'&&!c.error&&!c.nativeTerminals?.error&&c.nativeTerminals?.inventoryEmpty===true,'producer_drain_unknown','unknown');
  return{owner,worker:w,cached,reference:{run:reference.run,generation,position,attempt:reference.attempt}};
 }catch(error){if(error.reason)throw error;check(false,'producer_corrupt');}finally{db.close();}
}
function safeRelative(path){return typeof path==='string'&&path.length>0&&path.length<=1000&&!isAbsolute(path)&&!path.includes('\\')&&!path.includes(':')&&path.split('/').every(s=>s&&s!=='.'&&s!=='..'&&s.toLowerCase()!=='.git'&&!/[. ]$/.test(s)&&!/[<>"|?*\x00-\x1f]/.test(s)&&!/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(s));}
const inside=(root,path)=>{if(typeof path!=='string'||!isAbsolute(path))return false;const r=relative(root,path);return r.length>0&&!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep);};
async function resolveArtifact(context,ref,checkpoint,source,integrated=true){
 check(safeRelative(ref.relativePath),'artifact_path');const p=await readProducer(context,ref.producer);
 const workspace=p.worker.workspace;check(workspace?.manifestHash===ref.captureId,'artifact_capture');
 check(inside(join(p.owner.runDir,'workspaces'),workspace.artifactsDir)&&workspace.manifestPath===join(workspace.artifactsDir,'result','manifest.json'),'artifact_capture_path');
 if(checkpoint.integration)check(checkpoint.integration.reviewedProducers.some(r=>same(r,p.reference)),'producer_not_reviewed');
 const manifestBytes=await regular(workspace.manifestPath,33554432);check(hash(manifestBytes)===workspace.manifestHash,'artifact_manifest_hash');
 const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifestBytes));check(Array.isArray(manifest.files)&&manifest.files.length<=20000,'artifact_manifest');
 let total=0;const names=new Set();for(const entry of manifest.files){check(safeRelative(entry.name)&&!names.has(entry.name.toLowerCase()),'artifact_case_overlap');check(sha(entry.sha256)&&Number.isSafeInteger(entry.size)&&entry.size>=0&&['100644','100755'].includes(entry.mode),'artifact_manifest');total+=entry.size;check(total<=536870912,'artifact_manifest');names.add(entry.name.toLowerCase());}
 const captured=manifest.files.find(x=>x.name===ref.relativePath);check(captured&&captured.sha256===ref.sha256&&captured.size===ref.bytes,'artifact_manifest');
 check(captured.blobPath===join(workspace.artifactsDir,'result','blobs',ref.sha256),'artifact_blob_path');const bytes=await regular(captured.blobPath,536870912);check(bytes.length===ref.bytes&&hash(bytes)===ref.sha256,'artifact_blob');
 // The run-wide protected roster can include other isolated writers' outputs.
 // Validate its recorded missing subset with the capture-policy owner, reject
 // omissions of this required artifact, and pass the unchanged full workspace
 // to the retained integrity verifier below. Do not filter historical evidence.
 if(workspace.missingProtectedPaths!==undefined){
  try{validateCapturePolicy({version:1,excludeDirs:[],protectedPaths:workspace.missingProtectedPaths});}catch{check(false,'artifact_missing');}
  const name=ref.relativePath.toLowerCase();
  check(!workspace.missingProtectedPaths.some(path=>path.endsWith('/')?name.startsWith(path.toLowerCase()):name===path.toLowerCase()),'artifact_missing');
 }
 // Validate the two independent enums before the provider boundary. Known
 // byte/mode mismatches remain refusals even if live capture is unavailable.
 if(integrated){const file=source.files.find(x=>x.path===ref.relativePath);const mode=captured.mode==='100644'?100644:captured.mode==='100755'?100755:null;check(file&&file.sha256===ref.sha256&&file.bytes===ref.bytes&&mode!==null&&file.mode===mode,'integrated_bytes');check(checkpoint.integration.integratedArtifacts.some(a=>same(a,ref)),'artifact_not_integrated');}
 const module=await retained(p.owner,'workspaces.mjs');check(typeof module.verifyWorkspace==='function'&&typeof module.readWorkspacePatch==='function','capture_provider_unavailable','unknown');
 try{await module.verifyWorkspace(workspace);await module.readWorkspacePatch(workspace,{previewBytes:1});}catch(error){let missing=false;for(let e=error;e;e=e.cause)if(e.code==='ENOENT')missing=true;check(false,missing?'capture_integrity_unavailable':'capture_integrity',missing?'unknown':'rejected');}
 return p.reference;
}
async function verifyRecovery(context,objective,ancestry,checkpoint,source){
 const current=new Set([...objective.artifactRefs.map(a=>a.producer),...objective.verifiers.filter(Boolean)].map(p=>canonical(p)));
 const inspected=new Set();
 for(const previous of ancestry.slice(0,-1)){
  const old=previous.objectives.find(o=>o.id===objective.id);if(!old)continue;
  for(const ref of [...old.artifactRefs.map(a=>a.producer),...old.verifiers.filter(Boolean)]){
   const key=canonical(ref);if(current.has(key)||inspected.has(key))continue;inspected.add(key);
   const prior=await readProducer(context,ref,false,true),w=prior.worker,c=w.evidence?.cleanup;
   const uncertain=w.status!=='completed'||c?.serverExited!==true||c.jobEmpty!==true||c.forced!==false||c.error;
   if(!uncertain)continue;
   const recovery=ancestry.flatMap(r=>r.recovery).find(r=>same(r.producer,prior.reference));
   check(recovery?.replacementEligible===true&&recovery.effects!=='unknown'&&recovery.reconciliationRefs.length>0&&recovery.admissionRefs.length>0,'recovery_missing','unknown');
   check(recovery.outcome===w.status&&recovery.cleanup.serverExited===c?.serverExited&&recovery.cleanup.jobEmpty===c?.jobEmpty&&recovery.cleanup.forced===c?.forced&&recovery.cleanup.ownershipScope===c?.ownershipScope,'recovery_facts');
   check(source!==null,'recovery_evidence_unavailable','unknown');
   for(const artifact of [...recovery.reconciliationRefs,...recovery.admissionRefs])await resolveArtifact(context,artifact,checkpoint,source,false);
  }
 }
}
function completeDrain(c){return c?.serverExited===true&&c.jobEmpty===true&&c.forced===false&&c.ownershipScope==='windows-job-members'&&c.jobHost?.closeObserved===true&&c.jobHost.exitCode===0&&c.jobHost.signal==='none'&&c.jobHost.receipt==='drained'&&!c.error;}
async function checkReceipts(context,checkpoint,checkId,jobs,source){
 const path=join(context.owner.runDir,'delivery-v1','stages.sqlite');await noLinks(path);const db=new DatabaseSync(path,{readOnly:true});let rows;
 try{
  const exists=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='checks'").get();check(exists,'check_missing','missing');
  const size=db.prepare('SELECT count(*) n,max(length(CAST(value AS BLOB))) bytes FROM checks').get();check(size.n<=1024&&(size.bytes??0)<=1048576,'check_corrupt');
  rows=db.prepare('SELECT * FROM checks WHERE checkpoint_id=? AND check_id=? ORDER BY seq').all(checkpoint.id,checkId);
 }finally{db.close();}
 check(rows.length>0,'check_missing','missing');const required=checkpoint.checkRequirements.find(r=>r.id===checkId);check(required,'check_requirement');
 const accepted=[];let passed=false;
 for(const row of rows){
  const receipt=JSON.parse(row.value);check(row.record_hash===hash(canonical(receipt))&&receipt.id===row.id&&receipt.jobId===row.job_id&&receipt.checkpointId===checkpoint.id&&receipt.checkId===checkId&&same(receipt.run,context.run),'check_corrupt');
  check(same(Object.keys(receipt).sort(),'schemaVersion id run jobId checkpointId checkId invocationHash executable executableSha256 argv cwd environmentHash snapshotBefore snapshotAfter start outcome exitCode outputRefs cleanup'.split(' ').sort()),'check_corrupt');
  const job=await jobs.readCommandJob({dataDir:context.dataDir,runId:context.run.runId,sessionId:context.sessionId,jobId:receipt.jobId});const inv=job?.invocation,v=job?.verification;
  check(job.schemaVersion===1&&same(job.run,context.run)&&job.jobId===receipt.jobId&&same(job.cleanup,receipt.cleanup),'check_corrupt');
  check(job.execution?.start==='observed'&&['passed','failed'].includes(job.execution.outcome)&&completeDrain(job.cleanup),'check_execution_unknown','unknown');
  if(job.execution.outcome==='passed')check(job.state==='succeeded'&&job.execution.exitCode===0,'check_corrupt');
  check(v?.checkpointId===checkpoint.id&&v.checkId===checkId&&v.snapshotBefore&&v.snapshotAfter,'check_snapshot');
  check(same(v.snapshotBefore,receipt.snapshotBefore)&&same(v.snapshotAfter,receipt.snapshotAfter)&&same(v.snapshotBefore,v.snapshotAfter),'check_snapshot');
  check(inv.command[0]===required.executable&&same(inv.command.slice(1),required.argv)&&inv.executableSha256===required.executableSha256&&inv.cwd===required.cwd&&inv.environmentHash===required.environmentHash&&inv.policyHash===checkpoint.parentPolicyHash&&inv.runtime?.id===context.owner.runtime.id&&inv.runtime.digest===context.owner.runtime.digest&&inv.runtime.dependencyHash===context.owner.runtime.dependenciesDigest,'check_invocation');
  check(receipt.invocationHash===inv.hash&&receipt.executable===inv.command[0]&&same(receipt.argv,inv.command.slice(1))&&receipt.environmentHash===inv.environmentHash&&receipt.cwd===inv.cwd&&receipt.executableSha256===inv.executableSha256&&receipt.start===job.execution.start&&receipt.outcome===job.execution.outcome&&receipt.exitCode===job.execution.exitCode,'check_corrupt');
  const copy=await jobs.verifyIntegrationSnapshot(v.snapshotAfter);check(same(copy,v.snapshotAfter)&&copy.manifestSha256===required.scope.validationSnapshotSha256&&source.manifestSha256===required.scope.sourceSnapshotSha256&&copy.contentSha256===source.contentSha256&&inv.canonicalCwd===copy.canonicalRoot,'check_snapshot');
  check(same(copy.dependencies.map(({id,kind,sha256,bytes})=>({id,kind,sha256,bytes})),source.dependencies.map(({id,kind,sha256,bytes})=>({id,kind,sha256,bytes}))),'check_snapshot');
  for(const stream of ['stdout','stderr']){const out=job.output?.[stream];check(out?.coverage==='complete'&&out.droppedBytes===0&&out.capReached===false&&out.retainedBytes===out.receivedBytes&&same(out,receipt.outputRefs[stream]),'check_output');const bytes=await regular(out.path,16777216);check(bytes.length===out.retainedBytes&&hash(bytes)===out.sha256,'check_output');}
  check(job.output.chunkIndex&&same(job.output.chunkIndex,receipt.outputRefs.chunkIndex),'check_output');const index=await regular(job.output.chunkIndex.path,1048576);check(index.length===job.output.chunkIndex.bytes&&hash(index)===job.output.chunkIndex.sha256,'check_output');
  accepted.push(receipt.id);
  if(job.execution.outcome==='passed')passed=true;
 }
 check(passed,'check_failed');
 return accepted;
}
function reason(row,error,fallback='evidence_unavailable'){
 // These provider codes identify deterministic integrity failures. Other job
 // failures (transport, process, missing evidence) retain unknown status.
 const integrity=error.code==='JOB_OUTPUT'?'check_output':error.code==='JOB_SNAPSHOT'?(fallback==='integration_snapshot_unavailable'?'integration_snapshot_drift':'check_snapshot'):null;
 const status=integrity?'rejected':error.status??'unknown',code=integrity??error.reason??fallback;
 row.reasons.push(code);const rank={accepted:0,missing:1,unknown:2,rejected:3};if(rank[status]>rank[row.status])row.status=status;
}
export async function assembleDeliveryAcceptance(input){
 inertJson(input);if(!plain(input)||!same(Object.keys(input).sort(),['dataDir','request','sessionId']))fail('INPUT');
 const {dataDir,sessionId,request}=input;
 requestSchema(request);if(typeof sessionId!=='string'||!sessionId||sessionId.length>256)fail('OWNERSHIP');
 const {owner,ref:run}=await identify(dataDir,request.run.runId,sessionId);if(!same(run,request.run))fail('OWNERSHIP');
 const context={dataDir,sessionId,run,owner};const checkpoint=await readStageCheckpoint({dataDir,runId:run.runId,id:request.checkpointId});
 const output={schemaVersion:1,planHash:request.planHash,integrationCheckpointId:request.checkpointId,rows:[],missingObjectiveIds:[],removedObjectiveIds:[],complete:false};
 if(!checkpoint){output.rows=request.objectiveIds.map(objectiveId=>({objectiveId,status:'missing',producers:[],artifactRefs:[],checkReceiptIds:[],reasons:['checkpoint_missing']}));output.missingObjectiveIds=[...request.objectiveIds];return output;}
 if(checkpoint.planHash!==request.planHash||!same(checkpoint.originRun,run))fail('BINDING');
 const records=[],seen=new Set();let after=null;for(;;){
  const page=await listStageCheckpoints({dataDir,runId:run.runId,after,limit:100});
  // Byte-limited pages may contain one record. Fresh linked records on every
  // page bound traversal by the existing record quota rather than page count.
  if(page?.available!==true||!Array.isArray(page.items)||page.items.length===0||page.items.length>100||typeof page.hasMore!=='boolean'||!uuid(page.nextCursor)||page.nextCursor===after||page.nextCursor!==page.items.at(-1).id)fail('CURSOR');
  if(records.length+page.items.length>1024)fail('LIMIT');
  for(const record of page.items){
   const previous=records.at(-1);
   if(!uuid(record.id)||seen.has(record.id)||record.previousId!==(previous?.id??null)||record.previousRecordHash!==(previous?.recordHash??null))fail('CURSOR');
   seen.add(record.id);records.push(record);
  }
  if(!page.hasMore)break;if(records.length===1024)fail('LIMIT');after=page.nextCursor;
 }
 const selectedIndex=records.findIndex(r=>r.id===checkpoint.id);check(selectedIndex>=0,'checkpoint_changed');const ancestry=records.slice(0,selectedIndex+1);
 const answers=new Set(ancestry.flatMap(r=>r.answers.map(a=>a.checkpointId+':'+a.questionId)));
 const open=ancestry.some(r=>r.outstandingQuestions.some(q=>q.state==='required'&&!answers.has(r.id+':'+q.id)));
 const removed=new Set();for(const r of ancestry)for(const c of r.scopeChanges){c.addedObjectiveIds.forEach(id=>removed.delete(id));c.removedObjectiveIds.forEach(id=>removed.add(id));}output.removedObjectiveIds=[...removed];
 let source=null,jobs=null,snapshotError=null;
 if(checkpoint.integration){try{jobs=await retained(owner,'command-jobs/index.mjs');check(typeof jobs.verifyIntegrationSnapshot==='function'&&typeof jobs.readCommandJob==='function','jobs_provider_unavailable','unknown');source=await jobs.verifyIntegrationSnapshot(checkpoint.integration.snapshot);check(same(source,checkpoint.integration.snapshot),'integration_snapshot_drift');}catch(e){snapshotError=e;}}
 const authorizationErrors=[];
 for(const record of ancestry){
  const refs=[...record.scopeChanges.map(c=>c.authorization),...record.answers.filter(a=>a.source.kind==='artifact').map(a=>a.source.reference)];
  for(const ref of refs){try{await resolveArtifact(context,ref,checkpoint,source,false);}catch(e){if(e.status==='rejected')fail('AUTHORIZATION');authorizationErrors.push(e);}}
 }
 const objectives=new Map(checkpoint.objectives.map(o=>[o.id,o]));
 const tasks=new Map();for(const record of ancestry)for(const task of record.nextTasks)tasks.set(task.id,task);
 const unresolved=new Map();function missingDependencies(id,seen=new Set()){
  if(unresolved.has(id))return unresolved.get(id);if(!tasks.has(id))return true;
  check(!seen.has(id),'task_dependency_cycle');seen.add(id);
  const missing=tasks.get(id).dependsOn.some(d=>missingDependencies(d,new Set(seen)));unresolved.set(id,missing);return missing;
 }
 // Every retained objective is assembled even if the caller requests a subset.
 const ids=[...new Set([...request.objectiveIds,...objectives.keys()])].filter(id=>!removed.has(id));
 for(const objectiveId of ids){
  const row={objectiveId,status:'accepted',producers:[],artifactRefs:[],checkReceiptIds:[],reasons:[]},objective=objectives.get(objectiveId);output.rows.push(row);
  if(records.at(-1)?.id!==checkpoint.id)reason(row,{reason:'checkpoint_stale',status:'rejected'});
  for(const e of authorizationErrors)reason(row,e,'authorization_unavailable');
  if(!objective){reason(row,{reason:'objective_missing',status:'missing'});continue;}
  if([...tasks.values()].some(t=>t.objectiveIds.includes(objectiveId)&&missingDependencies(t.id)))reason(row,{reason:'task_dependency_missing',status:'missing'});
  try{await verifyRecovery(context,objective,ancestry,checkpoint,source);}catch(e){reason(row,e);}
  if(open)reason(row,{reason:'required_question_open',status:'missing'});
  if(!checkpoint.integration)reason(row,{reason:'integration_missing',status:'missing'});else if(snapshotError)reason(row,snapshotError,'integration_snapshot_unavailable');
  if(!objective.artifactRefs.length)reason(row,{reason:'artifacts_missing',status:'missing'});
  const implementations=new Set();
  for(const artifact of objective.artifactRefs){
   try{const p=await readProducer(context,artifact.producer);row.producers.push(p.reference);implementations.add(canonical(p.reference));await resolveArtifact(context,artifact,checkpoint,source,Boolean(source));row.artifactRefs.push(artifact);if(p.worker.result.status==='partial')row.reasons.push('source_partial_declaration');}
   catch(e){reason(row,e);}
  }
  if(!objective.verifiers.length)reason(row,{reason:'verifier_missing',status:'missing'});
  for(const verifier of objective.verifiers){
   if(verifier===null){reason(row,{reason:'verifier_missing',status:'missing'});continue;}
   try{const p=await readProducer(context,verifier,true);row.producers.push(p.reference);
    check(!implementations.has(canonical(p.reference)),'verifier_not_independent');
    if(source){const proof=p.worker.result.verification;if(proof!==undefined)check(proof&&proof.integrationCheckpointId===checkpoint.id&&proof.planHash===checkpoint.planHash&&proof.sourceSnapshotSha256===source.manifestSha256&&proof.verificationNonce===checkpoint.integration.verificationNonce,'verifier_binding');check(Date.parse(p.worker.startedAt)>=Date.parse(checkpoint.createdAt),'verifier_not_fresh');}
   }catch(e){reason(row,e);}
  }
  const requiredIds=new Set([...objective.checkIds,...checkpoint.checkRequirements.filter(r=>r.required).map(r=>r.id)]);
  if(!requiredIds.size)reason(row,{reason:'checks_missing',status:'missing'});
  if(jobs&&source&&!snapshotError)for(const id of requiredIds){try{row.checkReceiptIds.push(...await checkReceipts(context,checkpoint,id,jobs,source));}catch(e){reason(row,e);}}
  row.producers=[...new Map(row.producers.map(p=>[canonical(p),p])).values()];row.reasons=[...new Set(row.reasons)];
 }
 // Every integration assertion is resolved, including entries outside an
 // individual objective. Unreferenced claims cannot smuggle a forged capture.
 if(checkpoint.integration){
  const errors=[];
  for(const ref of checkpoint.integration.reviewedProducers)try{await readProducer(context,ref);}catch(e){errors.push(e);}
  for(const ref of checkpoint.integration.integratedArtifacts)try{await resolveArtifact(context,ref,checkpoint,source,Boolean(source));}catch(e){errors.push(e);}
  for(const row of output.rows)for(const e of errors)reason(row,e);
 }
 // Always perform the independent final source check, including rows with gaps.
 if(source&&jobs){try{check(same(await jobs.verifyIntegrationSnapshot(checkpoint.integration.snapshot),source),'integration_snapshot_drift');}catch(e){for(const row of output.rows)reason(row,e,'integration_snapshot_unavailable');}}
 const advanced=await listStageCheckpoints({dataDir,runId:run.runId,after:records.at(-1).id,limit:1});if(advanced.items.length)for(const row of output.rows)reason(row,{reason:'checkpoint_changed',status:'rejected'});
 output.missingObjectiveIds=output.rows.filter(r=>r.status!=='accepted').map(r=>r.objectiveId);
 output.complete=output.rows.length>0&&output.missingObjectiveIds.length===0&&!open&&source!==null&&!snapshotError&&authorizationErrors.length===0;
 if(Buffer.byteLength(JSON.stringify(output))>1048576)fail('LIMIT');return output;
}
