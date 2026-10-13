// Explicit native acceptance check; never included in offline CI.
import {parseArgs,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AppServer,fault,diagnostic} from './client.mjs';
import {createLaunch,assertChatgptLogin} from './launch.mjs';
import {assertManagedChatgpt} from './probe.mjs';
import {runTurn,steerTurn} from './turn.mjs';
import {restrictLaunch,assertRestricted,assertDisabledInventory} from '../engine/policy.mjs';
import {buildJobHost} from './windows-job.mjs';

const {values}=parseArgs({options:{codex:{type:'string'},output:{type:'string'},'owned-job':{type:'boolean'}}});
const cwd=await mkdtemp(join(tmpdir(),'workflow-lifecycle-')),marker=randomUUID();
const canary=join(cwd,'canary.mjs');
await writeFile(canary,`import {spawn} from 'node:child_process';
const marker=${JSON.stringify(marker)};
if(process.argv[2]==='child'){
 console.log(marker+JSON.stringify({kind:'child',pid:process.pid}));
 setTimeout(()=>process.exit(0),60000);
}else{
 const child=spawn(process.execPath,[import.meta.filename,'child'],{detached:true,windowsHide:true,stdio:['ignore','inherit','inherit']});child.unref();
 console.log(marker+JSON.stringify({kind:'parent',pid:process.pid,child:child.pid}));
 setTimeout(()=>process.exit(0),process.argv[2]==='normal'?1500:60000);
}
`,{flag:'wx'});
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={status:'running',backend:'mxc',inferenceRequests:0,normal:null,cancel:null,scope:'Observed canary parent and detached child only; not arbitrary process-tree certification'};
let client;
try{
 let launch=restrictLaunch(createLaunch({executable:values.codex,cwd,backend:'mxc'}));
 if(values['owned-job']){launch.jobHost=await buildJobHost(cwd);report.ownership='windows-job';}
 const exec=promisify(execFile),options={cwd,env:launch.env,windowsHide:true,timeout:5000,maxBuffer:8192};
 if((await exec(values.codex,['--version'],options)).stdout.trim()!=='codex-cli 0.162.1')throw fault('VERSION_UNSUPPORTED','Lifecycle check requires pinned Codex 0.162.1');
 assertChatgptLogin(await exec(values.codex,['login','status'],options));
 const discover=await AppServer.connect(launch);
 try{launch=restrictLaunch(launch,(await discover.request('config/read',{cwd})).config);}finally{await discover.close();}
 client=await AppServer.connect({...launch,experimentalApi:true});
 const config=await client.request('config/read',{cwd,includeLayers:true});assertRestricted(config.config);assertManagedChatgpt(await client.request('account/read',{refreshToken:false}),config);
 async function observe(start){
  let text='',resolveReady;const identities=new Map();
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  const consume=delta=>{
   text=(text+delta).slice(-8192);
   for(const line of text.split(/\r?\n/)){const i=line.indexOf(marker);if(i<0)continue;let value;try{value=JSON.parse(line.slice(i+marker.length));}catch{continue;}
    if(['parent','child'].includes(value.kind)&&Number.isInteger(value.pid)&&value.pid>0)identities.set(value.kind,value);
   }
   if(identities.size===2&&identities.get('parent').child===identities.get('child').pid)resolveReady();
  };
  const job=start(consume);const observed=Promise.resolve(job).then(result=>({result}),error=>({error}));
  let timer;
  try{await Promise.race([ready,observed.then(outcome=>{throw outcome.error??fault('CANARY_EARLY_EXIT','Canary finished before both process identities were observed');}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fault('CANARY_START','Canary identities were not observed')),45000);})]);}
  finally{clearTimeout(timer);}
  const pids=[...identities.values()].map(value=>value.pid);
  if(pids.some(pid=>!alive(pid)))throw fault('CANARY_NOT_ALIVE','Both canary processes must be live before cancellation or normal exit');
  return{pids,observed};
 }
 async function exits(pids){const start=performance.now();while(performance.now()-start<5000){if(pids.every(pid=>!alive(pid)))return{bothExited:true,elapsedMs:Math.round(performance.now()-start)};await delay(30);}return{bothExited:false,elapsedMs:Math.round(performance.now()-start)};}
 const processId=randomUUID();let unsubscribe;
 try{
  const normal=await observe(consume=>{
   unsubscribe=client.onNotification(message=>{if(message.method==='command/exec/outputDelta'&&message.params.processId===processId&&message.params.stream==='stdout')consume(Buffer.from(message.params.deltaBase64,'base64').toString('utf8'));});
   return client.request('command/exec',{cwd,command:[process.execPath,canary,'normal'],processId,streamStdoutStderr:true,sandboxPolicy:{type:'readOnly',networkAccess:false},timeoutMs:10000,outputBytesCap:8192});
  });
  const terminal=await normal.observed;if(terminal.error)throw terminal.error;
  report.normal={bothObservedAlive:true,exitCode:terminal.result.exitCode,...await exits(normal.pids)};
 }finally{unsubscribe?.();}
 if(report.normal.exitCode!==0||!report.normal.bothExited)throw fault('CANARY_NORMAL_DRAIN','Normal foreground exit did not drain the observed detached child');
 const thread=await client.request('thread/start',{cwd,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',modelProvider:'openai'}),threadId=thread.thread?.id;
 if(typeof threadId!=='string'||thread.modelProvider!=='openai'||thread.approvalPolicy!=='never'||thread.sandbox?.type!=='readOnly'||thread.sandbox.networkAccess!==false)throw fault('THREAD_POLICY','Native worker policy not confirmed');
 assertDisabledInventory(await client.request('mcpServerStatus/list',{threadId,detail:'toolsAndAuthOnly',limit:100}));
 const abort=new AbortController();let identity;
 report.inferenceRequests++;
 const running=await observe(consume=>runTurn(client,{threadId,signal:abort.signal,timeoutMs:60000,interruptTimeoutMs:5000,onActive:value=>{identity=value;},onEvent:message=>{if(message.method==='item/commandExecution/outputDelta')consume(message.params.delta);},prompt:`Run exactly one command with login:false: & '${process.execPath.replaceAll("'","''")}' '${canary.replaceAll("'","''")}'. This is a self-expiring cancellation canary. Do not change files or retry failed commands. If it returns a running process, wait for it with write_stdin; do not finish the turn while it is running.`}));
 const terminals=await client.request('thread/backgroundTerminals/list',{threadId,limit:100});
 report.cancel={bothObservedAlive:true,nativeTerminalsBefore:terminals.data.length};
 report.cancel.steeringConfirmed=(await steerTurn(client,{...identity,text:'Keep waiting for the existing canary command; do not launch any additional command.'})).turnId===identity.turnId;
 const cancelAt=performance.now();abort.abort();const outcome=await running.observed;
 report.cancel.turnError=outcome.error?diagnostic(outcome.error):null;report.cancel.interruption=outcome.error?.interruption??null;
 const termination=[];
 for(const terminal of terminals.data)termination.push(await client.request('thread/backgroundTerminals/terminate',{threadId,processId:terminal.processId}));
 report.cancel.termination=termination;
 await client.request('thread/backgroundTerminals/clean',{threadId});
 report.cancel.nativeTerminalsAfter=(await client.request('thread/backgroundTerminals/list',{threadId,limit:100})).data.length;
 Object.assign(report.cancel,await exits(running.pids));report.cancel.totalElapsedMs=Math.round(performance.now()-cancelAt);
 if(outcome.error?.code!=='TURN_CANCELLED'||outcome.error.interruption?.terminalStatus!=='interrupted'||!report.cancel.bothExited||report.cancel.nativeTerminalsAfter!==0)throw fault('CANARY_CANCEL_DRAIN','Cancellation did not prove the observed canary process exits');
 report.status='passed';
}catch(error){report.status='failed';report.error=diagnostic(error);}
finally{if(client)report.cleanup=await client.close();if(report.cleanup?.serverExited!==true)report.status='failed';}
report.checkedAt=new Date().toISOString();const output=JSON.stringify(report,null,2)+'\n';
if(values.output){await mkdir(dirname(resolve(values.output)),{recursive:true});await writeFile(resolve(values.output),output,{flag:'wx'});}
process.stdout.write(output);process.exitCode=report.status==='passed'?0:1;
