import {fork} from 'node:child_process';
import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {join,resolve,isAbsolute,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {runWorkflow,readRun} from './controller.mjs';
import {parseScript} from './script.mjs';
import {createLaunch} from '../foundation/launch.mjs';
import {fault,diagnostic} from '../foundation/client.mjs';

export async function startBackground(input,{runnerPath=fileURLToPath(new URL('./background-child.mjs',import.meta.url)),startupMs=60000}={}){
  if(!isAbsolute(input.runDir??'')||typeof input.sessionId!=='string'||!input.sessionId||!Number.isFinite(startupMs)||startupMs<=0)throw fault('BACKGROUND_INPUT','Provide an absolute run directory and originating session');
  const previous=input.resume?await readRun(input.runDir):null;
  if(previous&&previous.sessionId!==input.sessionId)throw fault('REPLAY_SESSION','Run belongs to another originating session');
  if(previous&&(!previous.launch||previous.cleanup?.serverExited!==true||['running','pausing','stopping','finishing'].includes(previous.status)||previous.workers.some(worker=>['running','unknown'].includes(worker.status))))throw fault('REPLAY_UNKNOWN','Run launch context or completed execution is not verified');
  const launch={codex:input.codex??previous?.launch.codex,cwd:input.cwd??previous?.launch.cwd,backend:input.backend??previous?.launch.backend??'configured'};
  const native=createLaunch({executable:launch.codex,cwd:launch.cwd,backend:launch.backend});
  launch.cwd=native.cwd;
  const request={runDir:input.runDir,sessionId:input.sessionId,script:input.script??previous?.script,
    args:Object.hasOwn(input,'args')?input.args:previous?.args??null,concurrency:input.concurrency??previous?.concurrency??2,
    maxAgents:input.maxAgents??previous?.maxAgents??1000,resume:input.resume===true,launch};
  parseScript(request.script);
  const serialized=JSON.stringify(request);
  if(Buffer.byteLength(serialized)>2*1024*1024)throw fault('BACKGROUND_INPUT','Background request exceeded its limit');
  await mkdir(input.runDir,{recursive:true});
  if(!(await lstat(input.runDir)).isDirectory())throw fault('RUN_PATH','Run directory must not be a symlink');
  const id=randomUUID();
  const requestPath=join(input.runDir,`launch-${id}.json`);
  const resultPath=join(input.runDir,`finish-${id}.json`);
  await writeFile(requestPath,serialized,{flag:'wx'});
  const child=fork(runnerPath,[requestPath],{cwd:resolve(launch.cwd),env:native.env,execArgv:[],detached:true,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  return await new Promise((resolveStart,reject)=>{
    let settled=false,committed=false;
    const finish=(error,value)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      if(child.connected)child.disconnect();child.unref();
      if(error)reject(error);else resolveStart(value);
    };
    const timer=setTimeout(()=>finish(fault(committed?'START_UNCERTAIN':'START_TIMEOUT',committed?'Background start acknowledgement is uncertain; inspect the saved run before retrying':'Background admission exceeded its deadline; no start was authorized')),startupMs);
    child.on('error',()=>finish(fault('BACKGROUND_START','Background process could not start')));
    child.on('exit',()=>finish(fault(committed?'START_UNCERTAIN':'BACKGROUND_EXIT','Background process exited before startup acknowledgement')));
    child.on('message',message=>{
      if(settled)return;
      if(message?.kind==='ready'&&Number.isInteger(message.generation)&&!committed){
        committed=true;child.send({kind:'commit'},error=>{if(error)finish(fault('START_UNCERTAIN','Background commit delivery is uncertain; inspect the saved run'));});
      }else if(message?.kind==='started'&&committed&&Number.isInteger(message.generation)){
        finish(null,{status:'running',runDir:input.runDir,generation:message.generation,pid:child.pid,resultPath});
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
  let result;
  try{
    const request=JSON.parse(await readFile(requestPath,'utf8'));
    parseScript(request.script);
    const backend=await createBackend({executable:request.launch.codex,cwd:request.launch.cwd,backend:request.launch.backend});
    const run=await runWorkflow({...request,backend,onReady:async({generation})=>{
      await send({kind:'ready',generation});await permission;
      await send({kind:'started',generation});
      process.removeListener('disconnect',onDisconnect);if(process.connected)process.disconnect();
    }});
    result={status:run.status,generation:run.generation,coverage:run.coverage,error:run.error??null,cleanup:run.cleanup};
  }catch(error){result={status:'failed',error:diagnostic(error)};}
  finally{process.removeListener('message',onMessage);process.removeListener('disconnect',onDisconnect);}
  const name=basename(requestPath);
  if(!/^launch-[0-9a-f-]+\.json$/.test(name))throw fault('BACKGROUND_INPUT','Invalid launch receipt name');
  await writeFile(join(dirname(requestPath),name.replace('launch-','finish-')),JSON.stringify(result)+'\n',{flag:'wx'});
  if(process.connected){try{await send({kind:'failed'});}catch{}if(process.connected)process.disconnect();}
  return result;
}
