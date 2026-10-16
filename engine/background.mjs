import {fork} from 'node:child_process';
import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {join,resolve,isAbsolute,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {runWorkflow,readRun} from './controller.mjs';
import {parseScript} from './script.mjs';
import {createLaunch} from '../foundation/launch.mjs';
import {fault,diagnostic} from '../foundation/client.mjs';
import {doctorFailure} from '../bin/doctor-diagnostics.mjs';
import {restartPlan} from './restart.mjs';
import {resolveDeadlines} from './deadlines.mjs';
import {validateCapturePolicy} from './workspace-policy.mjs';
import {freezeCapabilities} from './worker-capabilities.mjs';
import {validateAccessPolicy} from './access-policy.mjs';
import {freezeWorkflowSources,verifyWorkflowSources} from './composition.mjs';

export async function startBackground(input,{runnerPath=fileURLToPath(new URL('./background-child.mjs',import.meta.url)),startupMs=60000}={}){
  if(!isAbsolute(input.runDir??'')||typeof input.sessionId!=='string'||!input.sessionId||!Number.isSafeInteger(startupMs)||startupMs<0||startupMs>2147483647)throw fault('BACKGROUND_INPUT','Provide an absolute run directory, originating session and timer-safe startup budget (0 removes it)');
  const previous=input.resume?await readRun(input.runDir):null;
  if(previous&&previous.sessionId!==input.sessionId)throw fault('REPLAY_SESSION','Run belongs to another originating session');
  if(previous&&input.accessPolicy!==undefined)throw fault('ACCESS_OVERRIDE','Saved runs retain their original access policy; start a new run to change it');
  const accessValue=previous?.launch?.accessPolicy??input.accessPolicy;
  const accessPolicy=accessValue===undefined?null:validateAccessPolicy(accessValue,{sessionId:input.sessionId});
  if(previous){
    const savedAccess=previous.accessPolicy===undefined?undefined:validateAccessPolicy(previous.accessPolicy,{sessionId:input.sessionId});
    if(savedAccess?.fingerprint!==accessPolicy?.fingerprint)throw fault('ACCESS_POLICY','Saved access policy identity is inconsistent');
  }
  if(previous&&input.workerCapabilities!==undefined)throw fault('CAPABILITY_OVERRIDE','Saved runs retain the original worker capability bundle');
  const capabilityValue=previous?.workerCapabilities??input.workerCapabilities;
  const capabilitySources=previous?.launch?.capabilitySources;
  const capabilities=capabilityValue===undefined?null:await freezeCapabilities(capabilityValue,{runDir:input.runDir,capabilitySources});
  if(previous?.workerCapabilitiesHash!==undefined&&capabilities?.fingerprint!==previous.workerCapabilitiesHash||input.workerCapabilitiesHash!==undefined&&capabilities?.fingerprint!==input.workerCapabilitiesHash)throw fault('CAPABILITY_IDENTITY','Worker capability ceiling identity changed');
  if(previous&&capabilities&&JSON.stringify(previous.workerCapabilitySources)!==JSON.stringify(capabilities.toolSources))throw fault('CAPABILITY_IDENTITY','Worker tool source availability changed');
  if(previous&&input.capturePolicy!==undefined)throw fault('CAPTURE_POLICY_OVERRIDE','Saved runs retain their original capture policy; start a new run to change it');
  const policyValue=previous?.launch?.capturePolicy??input.capturePolicy;
  const frozenPolicy=policyValue===undefined?null:validateCapturePolicy(policyValue);
  if(previous&&frozenPolicy&&previous.launch.capturePolicyHash!==frozenPolicy.policyHash)throw fault('WORKSPACE_INPUT','Saved capture policy identity is inconsistent');
  if(input.expectedGeneration!==undefined&&previous?.generation!==input.expectedGeneration)throw fault('REPLAY_GENERATION','Run generation changed; refresh before resuming');
  if(input.restart!==undefined){
    if(!input.resume||!Number.isInteger(input.expectedGeneration))throw fault('RESTART_INPUT','Restart requires explicit resume and the observed generation');
    restartPlan(previous,input.restart);
  }
  if(previous&&(!previous.launch||input.restart===undefined&&(previous.cleanup?.serverExited!==true||['running','pausing','stopping','finishing'].includes(previous.status)||previous.workers.some(worker=>['running','unknown'].includes(worker.status)))))throw fault('REPLAY_UNKNOWN','Run launch context or completed execution is not verified');
  if(previous&&input.restart===undefined&&previous.workers.some(worker=>worker.origin?.kind==='append'&&worker.status!=='completed'))throw fault('APPEND_RECONCILE','Noncompleted additions require explicit effect reconciliation and physical-suffix restart');
  if(input.defaults!==undefined&&(!input.defaults||typeof input.defaults!=='object'||Array.isArray(input.defaults)))throw fault('BACKGROUND_INPUT','Worker defaults must be an object');
  if(previous&&input.session0Desktop!==undefined)throw fault('LAUNCH_INVALID','Saved runs retain their original desktop selection');
  const session0Desktop=previous?.launch?.session0Desktop??input.session0Desktop??'inherit';
  const launch={...(session0Desktop==='shared'?{session0Desktop}:{}),codex:input.codex??previous?.launch.codex,cwd:input.cwd??previous?.launch.cwd,backend:input.backend??previous?.launch.backend??'configured',defaults:{...previous?.launch.defaults,...input.defaults}};
  if(accessPolicy)launch.accessPolicy=accessPolicy;
  if(capabilitySources!==undefined)launch.capabilitySources=capabilitySources;
  if(capabilities)Object.assign(launch,{workerCapabilities:capabilities.manifest,workerCapabilitiesHash:capabilities.fingerprint});
  if(frozenPolicy)Object.assign(launch,{capturePolicy:frozenPolicy.policy,capturePolicyHash:frozenPolicy.policyHash});
  if(input.artifactScope??previous?.launch?.artifactScope)launch.artifactScope=input.artifactScope??previous.launch.artifactScope;
  const native=createLaunch({executable:launch.codex,cwd:launch.cwd,backend:launch.backend,session0Desktop});
  launch.cwd=native.cwd;
  const request={runDir:input.runDir,sessionId:input.sessionId,script:input.script??previous?.script,
    args:Object.hasOwn(input,'args')?input.args:previous?.args??null,concurrency:input.concurrency??previous?.concurrency??2,
    maxAgents:input.maxAgents??previous?.maxAgents??1000,...resolveDeadlines(input,previous??{}),resume:input.resume===true,launch,...(input.expectedGeneration===undefined?{}:{expectedGeneration:input.expectedGeneration}),...(input.restart===undefined?{}:{restart:input.restart})};
  const {meta}=parseScript(request.script);
  if(meta.workflows?.length||previous?.compositionVersion){request.launch.preparedWorkflowSources=input.preparedWorkflowSources??await freezeWorkflowSources({runDir:input.runDir,cwd:launch.cwd,declarations:meta.workflows??[],previousCatalog:previous?.workflowSources??null,revisions:input.workflowRevisions??null});await verifyWorkflowSources({runDir:input.runDir,descriptor:request.launch.preparedWorkflowSources});}
  if(input.workflowRevisions!==undefined)request.workflowRevisions=input.workflowRevisions;
  const serialized=JSON.stringify(request);
  if(Buffer.byteLength(serialized)>2*1024*1024)throw fault('BACKGROUND_INPUT','Background request exceeded its limit');
  await mkdir(input.runDir,{recursive:true});
  if(!(await lstat(input.runDir)).isDirectory())throw fault('RUN_PATH','Run directory must not be a symlink');
  const id=randomUUID();
  const requestPath=join(input.runDir,`launch-${id}.json`);
  const resultPath=join(input.runDir,`finish-${id}.json`);
  await writeFile(requestPath,serialized,{flag:'wx'});
  const child=fork(runnerPath,[requestPath],{cwd:resolve(launch.cwd),env:{...native.env,...(process.env.AGENT_WORKFLOW_WORKER===undefined?{}:{AGENT_WORKFLOW_WORKER:process.env.AGENT_WORKFLOW_WORKER})},execArgv:[],detached:true,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  return await new Promise((resolveStart,reject)=>{
    let settled=false,committed=false;
    const finish=(error,value)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      if(child.connected)child.disconnect();child.unref();
      if(error)reject(error);else resolveStart(value);
    };
    const timer=startupMs===0?null:setTimeout(()=>finish(fault(committed?'START_UNCERTAIN':'START_TIMEOUT',committed?'Background start acknowledgement is uncertain; inspect the saved run before retrying':`Background admission exceeded its ${startupMs} ms deadline; no start was authorized`)),startupMs);
    child.on('error',()=>finish(fault('BACKGROUND_START','Background process could not start')));
    child.on('exit',()=>finish(fault(committed?'START_UNCERTAIN':'BACKGROUND_EXIT','Background process exited before startup acknowledgement')));
    child.on('message',message=>{
      if(settled)return;
      if(message?.kind==='ready'&&Number.isInteger(message.generation)&&!committed){
        committed=true;child.send({kind:'commit'},error=>{if(error)finish(fault('START_UNCERTAIN','Background commit delivery is uncertain; inspect the saved run'));});
      }else if(message?.kind==='started'&&committed&&Number.isInteger(message.generation)){
        finish(null,{status:'running',runDir:input.runDir,generation:message.generation,pid:child.pid,resultPath,watch:{required:true,attached:false,sessionId:input.sessionId,generation:message.generation,after:0}});
      }else if(message?.kind==='failed')finish(fault('BACKGROUND_FAILED','Background admission failed; inspect its retained completion receipt'));
    });
  });
}

export async function serveBackground(requestPath,createBackend){
  let commit,abandon;
  let committed=false;
  const permission=new Promise((resolveCommit,reject)=>{commit=resolveCommit;abandon=reject;});
  // Observe early disconnection without an unhandled rejection during admission.
  permission.catch(()=>{});
  const onMessage=message=>{if(message?.kind==='commit'){committed=true;commit();}};
  const onDisconnect=()=>{if(!committed)abandon(fault('BACKGROUND_ABANDONED','Launcher exited before authorizing execution'));};
  process.on('message',onMessage);process.on('disconnect',onDisconnect);
  const send=message=>new Promise((resolveSend,reject)=>{
    if(!process.connected)return reject(fault('BACKGROUND_ABANDONED','Launcher connection is closed'));
    process.send(message,error=>error?reject(fault('BACKGROUND_ABANDONED','Launcher acknowledgement failed')):resolveSend());
  });
  let result,request,admitting=false;
  try{
    request=JSON.parse(await readFile(requestPath,'utf8'));
    parseScript(request.script);
    if(request.launch?.preparedWorkflowSources)await verifyWorkflowSources({runDir:request.runDir,descriptor:request.launch.preparedWorkflowSources});
    if(request.launch?.accessPolicy!==undefined)request.launch.accessPolicy=validateAccessPolicy(request.launch.accessPolicy,{sessionId:request.sessionId});
    admitting=true;
    const backend=await createBackend({runDir:request.runDir,retainSources:request.resume!==true,executable:request.launch.codex,cwd:request.launch.cwd,backend:request.launch.backend,session0Desktop:request.launch.session0Desktop??'inherit',defaults:request.launch.defaults??{},...(request.launch.capabilitySources===undefined?{}:{capabilitySources:request.launch.capabilitySources}),...(request.launch.accessPolicy?{accessPolicy:request.launch.accessPolicy}:{}),...(request.launch.workerCapabilities?{workerCapabilities:request.launch.workerCapabilities,workerCapabilitiesHash:request.launch.workerCapabilitiesHash}:{})});
    admitting=false;
    const run=await runWorkflow({...request,backend,onReady:async({generation})=>{
      await send({kind:'ready',generation});await permission;
      await send({kind:'started',generation});
      process.removeListener('disconnect',onDisconnect);if(process.connected)process.disconnect();
    }});
    result={status:run.status,generation:run.generation,coverage:run.coverage,error:run.error??null,cleanup:run.cleanup};
  }catch(error){
    const failure=admitting||!committed?doctorFailure(error,{backend:request?.launch?.backend}):null;
    result={status:'failed',error:diagnostic(error),...(admitting?{admissionFailure:failure}:{}),...(!committed?{startupDiagnostics:failure}:{})};
  }
  finally{process.removeListener('message',onMessage);process.removeListener('disconnect',onDisconnect);}
  const name=basename(requestPath);
  if(!/^launch-[0-9a-f-]+\.json$/.test(name))throw fault('BACKGROUND_INPUT','Invalid launch receipt name');
  await writeFile(join(dirname(requestPath),name.replace('launch-','finish-')),JSON.stringify(result)+'\n',{flag:'wx'});
  if(process.connected){try{await send({kind:'failed'});}catch{}if(process.connected)process.disconnect();}
  return result;
}
