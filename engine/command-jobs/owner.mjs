import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {AppServer} from '../../foundation/client.mjs';
import {buildJobHost} from '../../foundation/windows-job.mjs';
import {assertManagedChatgpt} from '../../foundation/probe.mjs';
import {assertNoDelegation,assertRestricted} from '../policy.mjs';
import {resolveContext,recheckAdmission,verifyCheckBinding} from './context.mjs';
import {openStore,jobDirectory} from './store.mjs';
import {createOutput,verifyOutput} from './output.mjs';
import {verifyIntegrationSnapshot} from './snapshot.mjs';
import {integer,mutationGuard,positiveCleanup,fail,terminal,uuid,safePath,absolute} from './contract.mjs';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cleanupProjection=c=>c?{serverExited:c.serverExited??null,jobEmpty:c.jobEmpty??null,forced:c.forced===true,ownershipScope:'windows-job-members',jobHost:c.jobHost?Object.fromEntries(['closeObserved','exitCode','signal','receipt'].map(k=>[k,c.jobHost[k]??null])):null,descendants:'notVerified'}:null;

// The fixture seam exercises only protocol/persistence behavior. Public start
// never accepts a connector; the executable entry below pins the signed host.
export async function serveJob({store,jobId,nonce,runDir,connect,recheck=async()=>{},pollMs=50}){
  let client,output,unsubscribe,timer,polling=false,commandSent=false,terminateAttempted=false,protocolError=false,result,error,cleanup;
  store.claim(jobId,nonce,{pid:process.pid,startedAt:new Date(Date.now()-process.uptime()*1000).toISOString()});
  const update=fn=>store.update(jobId,nonce,fn),read=()=>store.read(jobId).receipt;
  try{
    while(!store.acquire(jobId,nonce)){if(terminal(read().state))return read();await pause(pollMs);}
    const item=store.read(jobId);await recheck(item);
    const {privateRecord:p,receipt:r}=item;
    if(r.verification!==null)await verifyIntegrationSnapshot(r.verification.snapshotBefore);
    output=await createOutput(jobDirectory(runDir,jobId),r.output.limitBytes);update(r=>{r.output=output.snapshot();});
    client=await connect(p);
    const account=await client.request('account/read',{refreshToken:false});
    const config=await client.request('config/read',{cwd:r.invocation.cwd,includeLayers:true});
    assertManagedChatgpt(account,config,p.access.policy.permissions.sandbox);
    (p.access.policy.access==='parent'?assertNoDelegation:assertRestricted)(config.config);
    const remaining=Date.parse(r.timing.deadlineAt)-Date.now();
    if(remaining<=0||read().cancellation){update(r=>{r.execution.start='notStarted';r.execution.outcome=r.cancellation?'cancelled':'deadline';});}
    else{
      await recheck(store.read(jobId));
      unsubscribe=client.onNotification(message=>{
        if(message.method!=='command/exec/outputDelta')return;
        try{const outputRecord=output.append(message.params,r.execution.processId);update(r=>{r.output=outputRecord;r.execution.start='observed';r.timing.startedAt??=new Date().toISOString();});}
        catch{protocolError=true;throw Error('Bounded job output consumer failed');}
      });
      const poll=async()=>{
        if(polling||terminateAttempted||!commandSent)return;polling=true;
        try{
          const current=read(),deadline=Date.now()>=Date.parse(current.timing.deadlineAt);
          if(!current.cancellation&&!deadline)return;
          terminateAttempted=true;
          update(r=>{if(r.cancellation)r.cancellation.status='sent';});
          try{await client.request('command/exec/terminate',{processId:r.execution.processId},{timeoutMs:15000});update(r=>{if(r.cancellation)r.cancellation.status='confirmed';});}
          catch{protocolError=true;update(r=>{if(r.cancellation)r.cancellation.status='unknown';});}
        }catch{protocolError=true;}finally{polling=false;}
      };
      timer=setInterval(()=>{void poll();},pollMs);
      update(r=>{r.state='running';});commandSent=true;
      const left=Date.parse(r.timing.deadlineAt)-Date.now();
      if(left<=0){commandSent=false;update(r=>{r.execution.start='notStarted';r.execution.outcome='deadline';});}
      else result=await client.request('command/exec',{command:r.invocation.command,cwd:r.invocation.cwd,sandboxPolicy:p.access.native.command.sandboxPolicy,processId:r.execution.processId,timeoutMs:left,outputBytesCap:16777216,streamStdoutStderr:true},{timeoutMs:left+15000});
      clearInterval(timer);while(polling)await pause(10);
      if(commandSent){
        if(!result||!integer(result.exitCode,-2147483648,4294967295))fail('JOB_PROTOCOL');
        update(r=>{r.execution.start='observed';r.timing.startedAt??=new Date().toISOString();r.execution.exitCode=result.exitCode;r.execution.outcome=r.cancellation?.status==='confirmed'?'cancelled':Date.now()>=Date.parse(r.timing.deadlineAt)?'deadline':result.exitCode===0?'passed':'failed';});
      }
    }
  }catch(e){error=e;cleanup=e.cleanup;}
  finally{
    clearInterval(timer);while(polling)await pause(10);unsubscribe?.();
    if(!terminal(read().state))update(r=>{r.state='draining';});
    if(client)try{cleanup=await client.close();}catch{protocolError=true;}
    try{
      if(output){const record=output.finish(Boolean(error||protocolError));update(r=>{r.output=record;});await verifyOutput(read(),jobDirectory(runDir,jobId));}
    }catch{protocolError=true;}
    try{if(read().verification!==null&&!error&&!protocolError){await recheck(store.read(jobId));const after=await verifyIntegrationSnapshot(read().verification.snapshotBefore);update(r=>{r.verification.snapshotAfter=after;});}}catch{protocolError=true;}
    update(r=>{
      r.cleanup=cleanupProjection(cleanup);r.timing.endedAt=new Date().toISOString();
      const rejected=cleanup?.jobHost?.receipt==='rejected-before-spawn';
      if(error||protocolError||commandSent&&!positiveCleanup(r.cleanup)||r.execution.outcome==='pending'){
        r.state='unknown';r.execution.outcome='unknown';if(commandSent&&r.execution.start!=='observed')r.execution.start='unknown';
        r.error={code:rejected?'JOB_SESSION0_BLOCKED':protocolError?'JOB_INTEGRITY':'JOB_EXECUTION_UNKNOWN',message:rejected?'Session 0 admission was rejected before command dispatch':'Command or ownership evidence is incomplete; do not retry'};
      }else r.state=({passed:'succeeded',failed:'failed',cancelled:'cancelled',deadline:'deadline'})[r.execution.outcome]??'unknown';
    });
    if(positiveCleanup(read().cleanup)&&read().execution.outcome!=='unknown')store.release(jobId,nonce);
  }
  return read();
}

async function main(){
  mutationGuard();if(process.argv.length!==6||!uuid(process.argv[3])||!uuid(process.argv[4])||!uuid(process.argv[5]))fail('JOB_OWNER');
  const [dataDir,runId,jobId,nonce]=process.argv.slice(2);
  if(!absolute(dataDir))fail('JOB_OWNER');
  // The session comes only from the private admitted record, never CLI authority.
  const runDir=resolve(dataDir,'runs-v2',runId);await safePath(resolve(runDir,'command-jobs-v1','jobs.sqlite'));
  const reader=await openStore({dataDir,runDir});let p;
  try{const item=reader.read(jobId);if(item.owner?.nonce!==nonce||item.owner.pid!==null)fail('JOB_OWNER');p=item.privateRecord;}finally{reader.close();}
  const context=await resolveContext({dataDir,runId,sessionId:p.sessionId}),store=await openStore({dataDir,runDir,write:true});
  try{
    await serveJob({store,runDir,jobId,nonce,recheck:async item=>{await recheckAdmission(context,item);await verifyCheckBinding(context,item.privateRecord.request,item.receipt.invocation);},connect:async p=>{
      const jobHost=await buildJobHost();return AppServer.connect({...p.launch,jobHost,session0Desktop:p.launch.session0Desktop??'inherit',maxMessageBytes:262144});
    }});
  }finally{store.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url)))main().catch(()=>{process.stderr.write('COMMAND_JOB_OWNER_UNCERTAIN\n');process.exitCode=1;});
