// Explicit native acceptance: two managed-subscription attempts, outside CI.
import {parseArgs,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createManagedBackend} from './backend.mjs';
import {runWorkflow,readRun,requestControl} from './controller.mjs';
import {monitorData} from './monitor-data.mjs';
import {fault,diagnostic} from '../foundation/client.mjs';

const {values}=parseArgs({options:{codex:{type:'string'},output:{type:'string'}}});
const base=await mkdtemp(join(tmpdir(),'workflow-restart-proof-')),cwd=join(base,'project'),runDir=join(base,'run');await mkdir(cwd);
const marker=randomUUID(),canary=join(cwd,'canary.mjs');
await writeFile(canary,`console.log(${JSON.stringify(marker)});setTimeout(()=>{},8000);\n`,{flag:'wx'});
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const prompt=`Run exactly one PowerShell command with login:false: & ${quote(process.execPath)} ${quote(canary)}. Do not change files or retry a failed command. Wait with write_stdin if needed until it exits, then return a JSON object with marker equal to the printed UUID.`;
const script=`export const meta={name:'reconciled-restart-proof',description:'Cancel a read-only canary, reconcile its effects, then restart it exactly once'};return await agent(${JSON.stringify(prompt)},{schema:{type:'object',properties:{marker:{type:'string'}},required:['marker'],additionalProperties:false}});`;
const sessionId='restart-proof',report={status:'running',backend:'mxc'};let work;
const waitFor=async read=>{const end=Date.now()+120000;while(Date.now()<end){const value=await read();if(value)return value;await new Promise(resolve=>setTimeout(resolve,50));}throw fault('ACCEPTANCE_TIMEOUT','Restart acceptance exceeded its observation deadline');};
process.stderr.write(`Acceptance run: ${runDir}\n`);
try{
  const defaults={maxAttempts:1},launch={codex:values.codex,cwd,backend:'mxc',defaults};
  const native=await createManagedBackend({executable:values.codex,cwd,backend:'mxc',defaults});
  let commandReady=false,ready=false;
  work=runWorkflow({runDir,sessionId,script,launch,maxAgents:2,backend:{...native,execute:request=>native.execute({...request,onEvent:message=>{
    request.onEvent(message);if(message.method==='item/commandExecution/outputDelta'&&message.params.delta.includes(marker))commandReady=true;
  }})},onReady:()=>{ready=true;}});work.catch(()=>{});
  const snapshot=await waitFor(async()=>{if(!ready)return null;const run=await readRun(runDir);if(!run.acceptingControls)throw fault('ACCEPTANCE_EARLY_END','Canary ended before cancellation');return commandReady&&run.workers[0]?.activeTurn?run:null;});
  await requestControl(runDir,{sessionId,generation:snapshot.generation,action:'cancel-worker',position:0,attempt:snapshot.workers[0].attempts,turnId:snapshot.workers[0].activeTurn.turnId});
  const first=await work;
  if(first.workers[0].status!=='unknown'||first.workers[0].evidence?.cleanup?.jobEmpty!==true)throw fault('ACCEPTANCE_CANCEL','Canary cancellation did not retain verified owned-job termination');
  const cli=fileURLToPath(new URL('./cli.mjs',import.meta.url));const exec=promisify(execFile);
  const args=[cli,'--run',runDir,'--session',sessionId,'--action','restart-worker','--generation','1','--position','0','--attempt','1','--reconcile','Reviewed this read-only canary: it only printed a marker and waited; its owned job is empty. No project writes or external service effects need recovery.'];
  const admission=JSON.parse((await exec(process.execPath,args,{windowsHide:true,timeout:90000,maxBuffer:8192})).stdout);report.generation=admission.generation;
  try{await exec(process.execPath,args,{windowsHide:true,timeout:5000,maxBuffer:8192});report.duplicateRejected=false;}
  catch(error){report.duplicateRejected=JSON.parse(error.stdout).error?.code==='REPLAY_GENERATION';}
  const second=await waitFor(async()=>{const run=await readRun(runDir);return run.generation===2&&!run.acceptingControls&&run.cleanup?run:null;});
  const history=await monitorData(runDir,{kind:'worker',generation:2,position:0,sourceGeneration:1});
  const activity=await monitorData(runDir,{kind:'activity',generation:2,position:0,sourceGeneration:1});
  report.markerMatched=second.result?.marker===marker;report.attempts=second.attempts;report.workerAttempts=second.workers[0].attempts;
  report.history={status:history.status,error:history.error,usage:history.usage,activityObserved:activity.observed,cleanup:history.evidence?.cleanup};
  report.priorExecutions=second.workers[0].priorExecutions;report.usage=second.workers[0].usage;report.cleanup=second.cleanup;report.reconciliationRecorded=Boolean(second.restart?.reconciliation);
  report.status=second.status==='completed'&&report.markerMatched&&report.attempts===2&&report.workerAttempts===2&&report.duplicateRejected&&history.status==='unknown'&&activity.observed>0&&report.usage.totalTokens>history.usage.totalTokens&&report.cleanup.jobEmpty===true?'passed':'failed';
}catch(error){report.status='failed';report.error=diagnostic(error);if(work){try{const run=await readRun(runDir);if(run.acceptingControls)await requestControl(runDir,{sessionId,generation:run.generation,action:'stop'});}catch{}await work.catch(()=>{});}}
report.checkedAt=new Date().toISOString();const output=JSON.stringify(report,null,2)+'\n';
if(values.output){await mkdir(dirname(resolve(values.output)),{recursive:true});await writeFile(resolve(values.output),output,{flag:'wx'});}
process.stdout.write(output);process.exitCode=report.status==='passed'?0:1;
