import {DatabaseSync} from 'node:sqlite';
import {join,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveRun} from '../../bin/managed-runtime.mjs';
import {validateAccessPolicy} from '../access-policy.mjs';
import {createLaunch} from '../../foundation/launch.mjs';
import {parentLaunch,restrictLaunch} from '../policy.mjs';
import {plain,hash,uuid,text,safePath,directoryIdentity,fileIdentity,fail} from './contract.mjs';
import {verifyIntegrationSnapshot} from './snapshot.mjs';

export async function resolveContext({dataDir,runId,sessionId}){
  if(!text(sessionId,256)||!uuid(runId)||typeof dataDir!=='string')fail('JOB_OWNERSHIP');
  const root=resolve(dataDir);let owner;
  try{owner=await resolveRun({dataDir:root,id:runId,sessionId});}catch{fail('JOB_OWNERSHIP');}
  // Running these new APIs from a different package never hot-upgrades a run.
  if(resolve(owner.runtime.path)!==resolve(fileURLToPath(new URL('../../',import.meta.url))))fail('JOB_RUNTIME');
  const path=join(owner.runDir,'run.sqlite');await safePath(path);const db=new DatabaseSync(path,{readOnly:true});let saved;
  try{const size=db.prepare('SELECT length(CAST(value AS BLOB)) AS bytes FROM header WHERE id=1').get();if(!size||size.bytes>2097152)fail('JOB_OWNERSHIP');saved=plain(JSON.parse(db.prepare('SELECT value FROM header WHERE id=1').get().value),2097152);}finally{db.close();}
  if(saved.sessionId!==sessionId||typeof saved.status!=='string')fail('JOB_OWNERSHIP');
  let access;try{access=validateAccessPolicy(saved.launch?.accessPolicy,{sessionId});if(validateAccessPolicy(saved.accessPolicy,{sessionId}).fingerprint!==access.fingerprint)fail('JOB_POLICY');}catch{fail('JOB_POLICY');}
  if(saved.launch.codex!==owner.runtime.codex||!['inherit','shared'].includes(saved.launch.session0Desktop??'inherit'))fail('JOB_RUNTIME');
  const dataIdentity=await directoryIdentity(root),dataInstanceId=hashDataInstance(dataIdentity);
  return {dataDir:root,owner,saved,access,run:{dataInstanceId,runId,runtimeId:owner.runtime.id}};
}
function hashDataInstance(i){
  // Same byte preimage as monitor-adapters (not canonical object hashing).
  return fileHash(JSON.stringify([process.platform==='win32'?i.canonical.toLowerCase():i.canonical,i.dev,i.ino,i.birthtimeNs]));
}
import {sha as fileHash} from './contract.mjs';
export async function admission(context,request){
  const {owner,saved,access}=context,cwd=await directoryIdentity(request.cwd);
  if(request.verification!==null&&cwd.canonical!==request.verification.snapshot.canonicalRoot)fail('JOB_CHECK_BINDING');
  if(access.policy.access==='restricted'){
    const root=await directoryIdentity(saved.launch.cwd),p=relative(root.canonical,cwd.canonical);if(p.startsWith('..')||resolve(root.canonical,p)!==cwd.canonical)fail('JOB_CWD');
  }
  const executable=await fileIdentity(request.command[0]),node=await fileIdentity(process.execPath);
  const runtime={id:owner.runtime.id,digest:owner.runtime.digest,dependencyHash:owner.runtime.dependenciesDigest,nodeVersion:owner.runtime.node,nodeExecutableSha256:node.sha256,session0Desktop:saved.launch.session0Desktop??'inherit'};
  const base=createLaunch({executable:owner.runtime.codex,cwd:request.cwd,backend:saved.launch.backend??'configured',session0Desktop:runtime.session0Desktop,sandboxMode:access.policy.permissions.sandbox});
  const launch=(access.policy.access==='parent'?parentLaunch:restrictLaunch)(base);
  // createLaunch deliberately filters env for workers. Jobs retain the initiating
  // coordinator's entire effective environment, captured once and never returned.
  launch.env=plain(Object.fromEntries(Object.entries(process.env).filter(([,v])=>typeof v==='string')),1048576);
  const environmentHash=hash(launch.env),policyHash=access.fingerprint;
  const invocation={hash:hash({request,executableSha256:executable.sha256,canonicalCwd:cwd.canonical,environmentHash,policyHash,runtime}),command:request.command,executableSha256:executable.sha256,cwd:request.cwd,canonicalCwd:cwd.canonical,environmentHash,policyHash,runtime};
  return {invocation,privateRecord:{request,launch,access,cwdIdentity:cwd,nodeExecutable:process.execPath,run:context.run,sessionId:owner.sessionId}};
}
export async function recheckAdmission(context,item){
  const {receipt:r,privateRecord:p}=item;
  if(hash(r.run)!==hash(context.run)||p.sessionId!==context.owner.sessionId||r.invocation.policyHash!==context.access.fingerprint||hash(p.run)!==hash(context.run))fail('JOB_OWNERSHIP');
  const cwd=await directoryIdentity(r.invocation.cwd),exe=await fileIdentity(r.invocation.command[0]),node=await fileIdentity(p.nodeExecutable);
  if(hash(cwd)!==hash(p.cwdIdentity)||exe.sha256!==r.invocation.executableSha256||node.sha256!==r.invocation.runtime.nodeExecutableSha256||hash(p.launch.env)!==r.invocation.environmentHash||hash(p.access)!==hash(context.access))fail('JOB_INTEGRITY');
  const {request}=p;
  if(request.verification!==null&&cwd.canonical!==request.verification.snapshot.canonicalRoot)fail('JOB_CHECK_BINDING');
  if(hash({request,executableSha256:exe.sha256,canonicalCwd:cwd.canonical,environmentHash:r.invocation.environmentHash,policyHash:context.access.fingerprint,runtime:r.invocation.runtime})!==r.invocation.hash||hash(request.command)!==hash(r.invocation.command)||request.cwd!==r.invocation.cwd||p.launch.command!==context.owner.runtime.codex)fail('JOB_INTEGRITY');
  const current=context.owner.runtime,rt=r.invocation.runtime;
  if(rt.id!==current.id||rt.digest!==current.digest||rt.dependencyHash!==current.dependenciesDigest||rt.nodeVersion!==current.node||rt.session0Desktop!==(context.saved.launch.session0Desktop??'inherit'))fail('JOB_RUNTIME');
  const expected=createLaunch({executable:current.codex,cwd:r.invocation.cwd,backend:context.saved.launch.backend??'configured',session0Desktop:rt.session0Desktop,sandboxMode:context.access.policy.permissions.sandbox});
  const policyLaunch=(context.access.policy.access==='parent'?parentLaunch:restrictLaunch)(expected);
  if(hash(p.launch.args)!==hash(policyLaunch.args)||p.launch.cwd!==policyLaunch.cwd||(p.launch.session0Desktop??'inherit')!==rt.session0Desktop)fail('JOB_POLICY');
}

export async function verifyCheckBinding(context,request,invocation){
  if(request.verification===null)return;
  if(invocation.canonicalCwd!==request.verification.snapshot.canonicalRoot)fail('JOB_CHECK_BINDING');
  let provider;try{provider=await import('../stage-checkpoints.mjs');}catch{fail('JOB_CHECK_PROVIDER_MISSING');}
  if(typeof provider.readStageCheckpoint!=='function')fail('JOB_CHECK_PROVIDER_MISSING');
  const v=request.verification,checkpoint=await provider.readStageCheckpoint({dataDir:context.dataDir,runId:context.run.runId,id:v.checkpointId});
  const requirements=checkpoint?.checkRequirements;
  if(hash(checkpoint?.originRun??null)!==hash(context.run)||!Array.isArray(requirements))fail('JOB_CHECK_BINDING');
  const matches=requirements.filter(c=>c.id===v.checkId);if(matches.length!==1||!checkpoint.integration?.snapshot)fail('JOB_CHECK_BINDING');
  const c=matches[0],scope=c.scope;
  if(c.executable!==invocation.command[0]||c.executableSha256!==invocation.executableSha256||hash(c.argv)!==hash(invocation.command.slice(1))||c.cwd!==invocation.cwd||c.environmentHash!==invocation.environmentHash||!scope||!['frozen','validation-copy'].includes(scope.mode)||scope.validationSnapshotSha256!==v.snapshot.manifestSha256||scope.sourceSnapshotSha256!==checkpoint.integration.snapshot.manifestSha256)fail('JOB_CHECK_BINDING');
  const source=await verifyIntegrationSnapshot(checkpoint.integration.snapshot),validation=await verifyIntegrationSnapshot(v.snapshot);
  if(source.contentSha256!==validation.contentSha256||scope.mode==='frozen'&&source.manifestSha256!==validation.manifestSha256||scope.mode==='validation-copy'&&source.manifestSha256===validation.manifestSha256)fail('JOB_CHECK_BINDING');
}
