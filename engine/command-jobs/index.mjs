import {spawn} from 'node:child_process';
import {open} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mutationGuard,validateRequest,plain,keys,integer,uuid,fail,terminal,OPTIONS_BYTES} from './contract.mjs';
import {resolveContext,admission,recheckAdmission,verifyCheckBinding} from './context.mjs';
import {openStore,jobDirectory} from './store.mjs';
import {verifyOutput,outputPage} from './output.mjs';
import {verifyIntegrationSnapshot} from './snapshot.mjs';
export {verifyIntegrationSnapshot};

function input(value,names,optional=[]){const v=plain(value,OPTIONS_BYTES);keys(v,names,optional);return v;}
async function load(options,write=false){
  const context=await resolveContext(options),store=await openStore({dataDir:context.dataDir,runDir:context.owner.runDir,write});
  return {context,store};
}
async function checked(context,store,jobId){
  if(!uuid(jobId))fail();const item=store.read(jobId);await recheckAdmission(context,item);
  const r=item.receipt;
  if(r.output.stdout.path!==null)await verifyOutput(r,jobDirectory(context.owner.runDir,jobId),{index:terminal(r.state),live:!terminal(r.state)});
  // A deadline with no terminal owner observation remains unknown, not a retry.
  if(!terminal(r.state)&&Date.now()>Date.parse(r.timing.deadlineAt)+30000){r.state='unknown';r.execution.outcome='unknown';r.error={code:'JOB_OWNER_UNOBSERVED',message:'Terminal owner evidence is unavailable; do not redispatch'};}
  return r;
}
async function start(options){
  mutationGuard();const o=input(options,['dataDir','runId','sessionId','request']),request=validateRequest(o.request);
  // validateRequest owns the explicit 1..86400000 range. R3's reviewed native
  // parameter probe supports that bound; full durable/native qualification is
  // separate and no caller field can supply a positive execution receipt.
  if(request.verification!==null)await verifyIntegrationSnapshot(request.verification.snapshot);
  const {context,store}=await load(o,true);
  try{
    const admitted=await admission(context,request);await verifyCheckBinding(context,request,admitted.invocation);
    const allowNew=context.saved.status==='running'||context.saved.status==='completed'&&context.saved.cleanup?.serverExited===true;
    const item=store.admit({request,run:context.run,...admitted,allowNew});
    if(!item.created)return await checked(context,store,item.receipt.jobId);
    const nonce=store.reserve(item.receipt.jobId),entry=fileURLToPath(new URL('./owner.mjs',import.meta.url));
    const logPath=join(context.owner.runDir,'command-jobs-v1',item.receipt.jobId+'.owner.log');
    const log=await open(logPath,'wx',0o600);
    try{
      // Only fixed bounded diagnostics are written by the owner. No arbitrary
      // command output is connected to these file descriptors.
      const child=spawn(admitted.privateRecord.nodeExecutable,[entry,context.dataDir,o.runId,item.receipt.jobId,nonce],{cwd:context.owner.runDir,env:admitted.privateRecord.launch.env,detached:true,windowsHide:true,shell:false,stdio:['ignore',log.fd,log.fd]});
      await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(Object.assign(new Error('Owner spawn failed'),{code:'JOB_OWNER_START'})));});child.unref();
    }catch{
      store.update(item.receipt.jobId,nonce,r=>{r.state='unknown';r.execution.start='unknown';r.execution.outcome='unknown';r.error={code:'JOB_OWNER_START',message:'Owner startup was not confirmed; inspect this job without retrying'};});
    }finally{await log.close();}
    return store.read(item.receipt.jobId).receipt;
  }finally{store.close();}
}
async function read(options){
  const o=input(options,['dataDir','runId','sessionId','jobId']),{context,store}=await load(o);
  try{return await checked(context,store,o.jobId);}finally{store.close();}
}
async function output(options){
  const o=input(options,['dataDir','runId','sessionId','jobId','stream'],['after','limitBytes']);o.after??=0;o.limitBytes??=65536;
  if(!['stdout','stderr'].includes(o.stream)||!integer(o.after)||!integer(o.limitBytes,1,65536))fail();
  const {context,store}=await load(o);
  try{
    const r=await checked(context,store,o.jobId),s=r.output[o.stream];if(o.after>s.retainedBytes||s.path===null)fail('JOB_OUTPUT');
    return await outputPage(r,jobDirectory(context.owner.runDir,o.jobId),o);
  }finally{store.close();}
}
async function cancel(options){
  mutationGuard();const o=input(options,['dataDir','runId','sessionId','jobId','requestId','expectedRevision']);
  if(!uuid(o.jobId)||!uuid(o.requestId)||!integer(o.expectedRevision))fail();
  const {context,store}=await load(o,true);
  try{await checked(context,store,o.jobId);return store.cancel(o.jobId,o.requestId,o.expectedRevision);}finally{store.close();}
}
async function publicResult(operation){
  try{return plain(await operation(),1048576);}
  catch(e){if(typeof e?.code==='string'&&/^JOB_[A-Z_]+$/.test(e.code))throw e;fail('JOB_UNAVAILABLE');}
}
export async function startCommandJob(options){return publicResult(()=>start(options));}
export async function readCommandJob(options){return publicResult(()=>read(options));}
export async function readCommandJobOutput(options){return publicResult(()=>output(options));}
export async function cancelCommandJob(options){return publicResult(()=>cancel(options));}
