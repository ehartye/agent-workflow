import { parseArgs, promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppServer, fault, diagnostic } from './client.mjs';
import { createLaunch, assertChatgptLogin } from './launch.mjs';
import { assertManagedChatgpt, probe } from './probe.mjs';
import { runTurn } from './turn.mjs';
import { restrictLaunch, assertRestricted, assertDisabledInventory } from '../engine/policy.mjs';

const {values}=parseArgs({options:{codex:{type:'string'},backend:{type:'string',default:'configured'},output:{type:'string'}}});
const cwd=await mkdtemp(join(tmpdir(),'agent-workflow-interrupt-'));
const marker=`READY_${randomUUID()}`;
let launch=restrictLaunch(createLaunch({executable:values.codex,cwd,backend:values.backend}));
let client;
let unsubscribe;
const report={status:'running',inferenceRequests:0,backend:values.backend,commandStarted:false,commands:[],descendants:'notVerified'};
try {
  const exec=promisify(execFile);
  const options={cwd,env:launch.env,windowsHide:true,timeout:5000,maxBuffer:8192};
  report.codexVersion=(await exec(values.codex,['--version'],options)).stdout.trim();
  if(report.codexVersion!=='codex-cli 0.162.1')throw fault('VERSION_UNSUPPORTED','Interruption check requires Codex 0.162.1');
  assertChatgptLogin(await exec(values.codex,['login','status'],options));
  const discovery=await AppServer.connect(launch);
  try {launch=restrictLaunch(launch,(await discovery.request('config/read',{cwd})).config);}finally{await discovery.close();}
  client=await AppServer.connect(launch);
  assertRestricted((await client.request('config/read',{cwd})).config);
  report.admission=await probe(client,{cwd,command:[process.execPath,'-e','process.stdout.write("FOUNDATION_OK\\n")'],cancelCommand:[process.execPath,'-e','process.stdout.write("READY\\n");setInterval(()=>{},1000)']});
  client=undefined;
  if(report.admission.status!=='passed')throw fault('ADMISSION_FAILED','Command-only admission failed; no inference dispatched');
  client=await AppServer.connect(launch);
  const config=await client.request('config/read',{cwd,includeLayers:true});
  assertRestricted(config.config);
  assertManagedChatgpt(await client.request('account/read',{refreshToken:false}),config);
  const thread=await client.request('thread/start',{cwd,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',modelProvider:'openai'});
  const threadId=thread.thread.id;
  if(thread.modelProvider!=='openai'||thread.approvalPolicy!=='never'||thread.sandbox?.type!=='readOnly'||thread.sandbox.networkAccess!==false)throw fault('THREAD_POLICY','Unexpected worker policy');
  assertDisabledInventory(await client.request('mcpServerStatus/list',{threadId,detail:'toolsAndAuthOnly',limit:100}));
  const abort=new AbortController();
  let output='';
  let interruptedAt;
  unsubscribe=client.onNotification(message=>{
    if(message.params?.threadId!==threadId)return;
    if(message.method==='item/commandExecution/outputDelta'){
      output=(output+message.params.delta).slice(-8192);
      if(!abort.signal.aborted&&output.includes(marker)){
        report.commandStarted=true;interruptedAt=Date.now();abort.abort();
      }
    }
    if(message.method==='item/completed'&&message.params.item?.type==='commandExecution'){
      const item=message.params.item;
      report.commands.push({status:['completed','failed','declined','inProgress'].includes(item.status)?item.status:'unknown',exitCode:Number.isInteger(item.exitCode)?item.exitCode:null});
    }
  });
  report.inferenceRequests++;
  try {
    await runTurn(client,{threadId,signal:abort.signal,prompt:`Run exactly one PowerShell command with login:false: Write-Output '${marker}'; Start-Sleep -Seconds 30. This is a cancellation check. Do not retry or change files.`,timeoutMs:90000,interruptTimeoutMs:5000});
    throw fault('INTERRUPT_MISSING','Turn completed without requested interruption');
  }catch(error){
    report.turnError=diagnostic(error);report.interruption=error.interruption;
    if(interruptedAt)report.interruptionElapsedMs=Date.now()-interruptedAt;
    if(error.code!=='TURN_CANCELLED'||!report.commandStarted||!error.interruption?.terminalObserved||error.interruption.terminalStatus!=='interrupted')throw error;
  }
  const alive=await client.request('command/exec',{cwd,command:[process.execPath,'-e','process.stdout.write("ALIVE")'],sandboxPolicy:{type:'readOnly',networkAccess:false},timeoutMs:5000,outputBytesCap:1024});
  report.retainedServerCommandPassed=alive.exitCode===0&&alive.stdout==='ALIVE';
  report.status=report.retainedServerCommandPassed?'passed':'failed';
}catch(error){report.status='failed';report.error=diagnostic(error);}
finally{unsubscribe?.();if(client)report.cleanup=await client.close();if(report.cleanup&&!report.cleanup.serverExited)report.status='failed';}
report.checkedAt=new Date().toISOString();
const output=JSON.stringify(report,null,2)+'\n';
if(values.output){const path=resolve(values.output);await mkdir(dirname(path),{recursive:true});await writeFile(path,output,{flag:'wx'});}
process.stdout.write(output);process.exitCode=report.status==='passed'?0:1;
