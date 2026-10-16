// @lane merge @subject engine/command-jobs/store.mjs @subject engine/command-jobs/owner.mjs
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {join,dirname,parse} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import {openStore,jobDirectory} from '../../engine/command-jobs/store.mjs';
import {serveJob} from '../../engine/command-jobs/owner.mjs';
import {AppServer} from '../../foundation/client.mjs';
import {resolveAccess} from '../../engine/access-policy.mjs';
import {hash,fileIdentity,directoryIdentity,validateRequest,terminal} from '../../engine/command-jobs/contract.mjs';
import {createOutput,verifyOutput} from '../../engine/command-jobs/output.mjs';
import {admission} from '../../engine/command-jobs/context.mjs';

const fixture=fileURLToPath(import.meta.url),pause=ms=>new Promise(r=>setTimeout(r,ms)),ownerExits=new Map();
// Synthetic protocol fixtures need no credentials or caller search paths. Build
// their environment from owned paths/literals, preserving the actual worker guard.
export function fixtureEnvironment(directory){
  const env={PATH:dirname(process.execPath),TEMP:directory,TMP:directory,COMMAND_JOB_MARKER:'inherited 雪'};
  if(process.platform==='win32')env.SystemRoot=env.WINDIR=join(parse(process.execPath).root,'Windows');
  if(process.env.AGENT_WORKFLOW_WORKER!==undefined)env.AGENT_WORKFLOW_WORKER=process.env.AGENT_WORKFLOW_WORKER;
  return env;
}
export async function settleFixtures(directory){
  const end=Date.now()+15000;
  for(const owner of ownerExits.values())if(owner.directory===directory){
    while(!owner.closed){if(Date.now()>end)throw Error('Fixture owner exit unobserved; preserve temporary tree');await pause(20);}
    await owner.exit;
  }
}
export async function prepare(directory,{kind='normal',deadlineMs=5000,outputLimitBytes=1024,commandMode='command',exitCode=7,delay=50}={}){
  const runDir=join(directory,'run');await mkdir(runDir,{recursive:true});
  const store=await openStore({runDir,dataDir:directory,write:true}),run={dataInstanceId:hash(directory),runId:randomUUID(),runtimeId:'fixture-runtime'};
  const request=validateRequest({schemaVersion:1,requestId:randomUUID(),command:[process.execPath,fixture,commandMode,String(exitCode),String(delay),'space value','','雪','"literal"'],cwd:directory,environment:{mode:'inherit'},deadlineMs,outputLimitBytes,kind,verification:null});
  const access=resolveAccess({access:'parent',sessionId:'fixture',parentAccess:{version:1,sessionId:'fixture',provenance:'codex-session-context',filesystem:'unrestricted',networkAccess:true,approvalPolicy:'never'}});
  const env=fixtureEnvironment(directory);
  const cwdIdentity=await directoryIdentity(directory),executableSha256=(await fileIdentity(process.execPath)).sha256;
  const runtime={id:run.runtimeId,digest:'2'.repeat(64),dependencyHash:'3'.repeat(64),nodeVersion:process.version,nodeExecutableSha256:executableSha256,session0Desktop:'inherit'};
  const invocation={hash:hash({request,executableSha256,canonicalCwd:cwdIdentity.canonical,environmentHash:hash(env),policyHash:access.fingerprint,runtime}),command:request.command,executableSha256,cwd:directory,canonicalCwd:cwdIdentity.canonical,environmentHash:hash(env),policyHash:access.fingerprint,runtime};
  const privateRecord={request,launch:{command:process.execPath,args:[fixture,'server',directory],cwd:directory,env},access,cwdIdentity,nodeExecutable:process.execPath,run,sessionId:'fixture'};
  const item=store.admit({request,run,invocation,privateRecord});return {store,runDir,item,request,run,invocation,privateRecord};
}
export async function launchFixture(directory,options){
  const p=await prepare(directory,options),jobId=p.item.receipt.jobId,nonce=p.store.reserve(jobId);
  const child=spawn(process.execPath,[fixture,'owner',directory,jobId,nonce],{cwd:directory,env:p.privateRecord.launch.env,detached:true,windowsHide:true,stdio:'ignore'});
  const owner={directory,closed:false};owner.exit=new Promise(resolve=>child.once('close',code=>{owner.closed=true;resolve(code);}));ownerExits.set(jobId,owner);
  try{await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();return {jobId,nonce,pid:child.pid};}finally{p.store.close();}
}
export async function waitFixture(directory,jobId,{ownerPid}={}){
  const store=await openStore({runDir:join(directory,'run'),dataDir:directory});
  try{const end=Date.now()+15000;for(;;){const r=store.read(jobId).receipt;if(terminal(r.state)){
    // Positive native drain is a separate test boundary. This waits for the
    // actual fixture owner too, before the test's first temporary-tree removal.
    if(ownerExits.has(jobId))await settleFixtures(directory);
    else if(ownerPid)for(;;){try{process.kill(ownerPid,0);}catch(e){if(e.code==='ESRCH')break;throw e;}if(Date.now()>end)throw Error('Fixture owner exit unobserved');await pause(20);}
    return r;
  }if(Date.now()>end)throw Error('Fixture did not settle');await pause(20);}}finally{store.close();}
}

const mode=process.argv[2];
if(process.argv[1]===fixture&&mode==='public-read-seed'){
  const directory=process.argv[3],phase=process.argv[4],p=await prepare(directory);
  try{
    const context={dataDir:directory,run:p.run,access:p.privateRecord.access,saved:{launch:{backend:'configured',session0Desktop:'inherit'}},owner:{id:p.run.runId,runDir:p.runDir,sessionId:'fixture',runtime:{id:p.run.runtimeId,digest:'2'.repeat(64),dependenciesDigest:'3'.repeat(64),node:process.version,codex:process.execPath}}};
    const request={...p.request,requestId:randomUUID()},admitted=await admission(context,request),item=p.store.admit({request,run:p.run,...admitted});
    if(phase!=='admitted'){
      const nonce=p.store.reserve(item.receipt.jobId);
      if(['claimed','output'].includes(phase))p.store.claim(item.receipt.jobId,nonce,{pid:process.pid,startedAt:new Date().toISOString()});
      if(phase==='output'){
        p.store.acquire(item.receipt.jobId,nonce);
        const output=await createOutput(jobDirectory(p.runDir,item.receipt.jobId),request.outputLimitBytes),processId=p.store.read(item.receipt.jobId).receipt.execution.processId;
        try{
          output.append({processId,stream:'stdout',deltaBase64:Buffer.from('saved 雪').toString('base64')},processId);
          p.store.update(item.receipt.jobId,nonce,r=>{r.state='running';r.output=output.snapshot();});
          output.append({processId,stream:'stdout',deltaBase64:Buffer.from(' newer unpublished bytes').toString('base64')},processId);
        }finally{output.finish();} // Close fixture handles without publishing a newer row.
      }
    }
    const contextUrl=new URL('../../engine/command-jobs/context.mjs',import.meta.url).href,hook=join(directory,'public-read-hook.mjs');
    // Only ownership resolution is a declared fixture. Actual admission recheck,
    // public read, SQLite integrity and receipt projection run unchanged. This
    // produces no positive native/job qualification and never launches an owner.
    const replacement=`export * from ${JSON.stringify(contextUrl+'?overdue-read-fixture')};const context=${JSON.stringify(context)};export async function resolveContext(o){if(o.dataDir!==context.dataDir||o.runId!==context.run.runId||o.sessionId!=='fixture')throw Error('Foreign fixture target');return context;}`;
    await writeFile(hook,`import{registerHooks}from'node:module';Date.now=()=>Number(process.env.COMMAND_JOB_READ_AT);registerHooks({resolve(specifier,c,next){if(new URL(specifier,c.parentURL).href===${JSON.stringify(contextUrl)})return{url:${JSON.stringify('data:text/javascript,'+encodeURIComponent(replacement))},shortCircuit:true};return next(specifier,c);}});`);
    process.stdout.write(JSON.stringify({jobId:item.receipt.jobId,runId:p.run.runId,hook,deadlineAt:item.receipt.timing.deadlineAt}));
  }finally{p.store.close();}
}else if(process.argv[1]===fixture&&mode==='seed'){
  const p=await prepare(process.argv[3]);
  try{process.stdout.write(JSON.stringify({jobId:p.item.receipt.jobId}));}finally{p.store.close();}
}else if(process.argv[1]===fixture&&mode==='reconnect'){
  const directory=process.argv[3],first=spawnSync(process.execPath,[fixture,'launch',directory],{env:fixtureEnvironment(directory),encoding:'utf8',windowsHide:true});
  if(first.status!==0)throw Error(first.stderr);const {jobId,pid}=JSON.parse(first.stdout);
  const receipt=await waitFixture(directory,jobId,{ownerPid:pid}),output=await verifyOutput(receipt,jobDirectory(join(directory,'run'),jobId));
  const dispatches=(await readFile(join(directory,'dispatches.log'),'utf8')).trim().split('\n').length;
  process.stdout.write(JSON.stringify({...receipt,stdout:await readFile(output.stdout.path,'utf8'),stderr:await readFile(output.stderr.path,'utf8'),dispatchCount:dispatches}));
}else if(process.argv[1]===fixture&&mode==='launch'){
  process.stdout.write(JSON.stringify(await launchFixture(process.argv[3])));
}else if(process.argv[1]===fixture&&mode==='owner'){
  const [directory,jobId,nonce]=process.argv.slice(3),runDir=join(directory,'run'),store=await openStore({runDir,dataDir:directory,write:true});
  try{await serveJob({store,runDir,jobId,nonce,connect:async p=>{
    const client=await AppServer.connect({...p.launch,shutdownMs:1000,maxMessageBytes:262144});
    // Synthetic host facts exercise the state machine only. The fixture has no
    // signed host and cannot pass public retained-runtime admission.
    return {request:client.request.bind(client),onNotification:client.onNotification.bind(client),close:async()=>{
      const actual=await client.close();return {...actual,jobEmpty:actual.serverExited&&!actual.forced,ownershipScope:'windows-job-members',jobHost:{closeObserved:actual.serverExited,exitCode:0,signal:'none',receipt:actual.forced?'missing':'drained'}};
    }};
  }});}finally{store.close();}
}else if(process.argv[1]===fixture&&mode==='server'){
  const directory=process.argv[3],lines=createInterface({input:process.stdin});let child;
  const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
  lines.on('line',async line=>{
    const message=JSON.parse(line),{method,params,id}=message;
    if(method==='initialize')send({id,result:{}});
    else if(method==='account/read')send({id,result:{account:{type:'chatgpt'}}});
    else if(method==='config/read')send({id,result:{config:{model_provider:'openai',forced_login_method:'chatgpt',approval_policy:'never',sandbox_mode:'danger-full-access',features:{multi_agent:false,multi_agent_v2:false},agents:{enabled:false}},layers:[]}});
    else if(method==='command/exec'){
      await appendFile(join(directory,'dispatches.log'),'dispatch\n');
      if(params.command[2]==='loss-after-output'){
        send({method:'command/exec/outputDelta',params:{processId:params.processId,stream:'stdout',deltaBase64:Buffer.from('READY').toString('base64'),capReached:false}});
        setTimeout(()=>process.exit(0),20);return;
      }
      if(params.command[2]==='bad-frame')send({method:'command/exec/outputDelta',params:{processId:params.processId,stream:'stdout',deltaBase64:'YQ',capReached:false}});
      child=spawn(params.command[0],params.command.slice(1),{cwd:params.cwd,env:fixtureEnvironment(directory),shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
      for(const stream of ['stdout','stderr'])child[stream].on('data',bytes=>send({method:'command/exec/outputDelta',params:{processId:params.processId,stream,deltaBase64:bytes.toString('base64'),capReached:false}}));
      const timer=setTimeout(()=>child.kill(),params.timeoutMs);
      child.once('close',code=>{clearTimeout(timer);send({id,result:{exitCode:code??1,stdout:'',stderr:''}});child=null;});
    }else if(method==='command/exec/terminate'){
      await appendFile(join(directory,'terminates.log'),'terminate\n');child?.kill();send({id,result:{}});
    }
  });
  lines.on('close',()=>{child?.kill();});
}else if(process.argv[1]===fixture&&['command','flood','identity','hang'].includes(mode)){
  if(mode==='command'){await pause(Number(process.argv[4]));process.stdout.write('hello 雪');process.stderr.write('error stream');process.exitCode=Number(process.argv[3]);}
  if(mode==='identity'){process.stdout.write(JSON.stringify({argv:process.argv.slice(5),cwd:process.cwd(),marker:process.env.COMMAND_JOB_MARKER}));}
  if(mode==='flood'){for(let i=0;i<64;i++){process.stdout.write(Buffer.alloc(16384,65));process.stderr.write(Buffer.alloc(16384,66));await pause(1);}await writeFile(join(process.cwd(),'continued.txt'),'continued');}
  if(mode==='hang'){process.stdout.write('READY');await pause(10000);}
}
