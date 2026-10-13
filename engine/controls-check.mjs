// Explicit subscription-consuming acceptance; never part of offline CI.
import {parseArgs} from 'node:util';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createManagedBackend} from './backend.mjs';
import {runWorkflow,readRun,requestControl,readControl} from './controller.mjs';
import {diagnostic,fault} from '../foundation/client.mjs';

const {values}=parseArgs({options:{codex:{type:'string'},output:{type:'string'}}});
const base=await mkdtemp(join(tmpdir(),'workflow-controls-')),cwd=join(base,'project'),runDir=join(base,'run');await mkdir(cwd);
const marker=randomUUID();
await writeFile(join(cwd,'canary.mjs'),`console.log('CANARY_READY');setTimeout(()=>{},45000);\n`,{flag:'wx'});
await writeFile(join(cwd,'sibling.mjs'),`console.log('SIBLING_READY');setTimeout(()=>console.log(${JSON.stringify(marker)}),20000);\n`,{flag:'wx'});
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const prompt=file=>`Run exactly one PowerShell command with login:false: & ${quote(process.execPath)} ${quote(join(cwd,file))}. Do not change files or retry a failed command. If it returns a running process, wait using write_stdin until it ends.`;
const script=`export const meta={name:'individual-controls-proof',description:'Steer and cancel one native worker while its sibling completes'};
return await parallel([()=>agent(${JSON.stringify(prompt('canary.mjs'))}),()=>agent(${JSON.stringify(prompt('sibling.mjs')+' Return a JSON object with marker equal to the UUID printed at the end.')},{schema:{type:'object',properties:{marker:{type:'string'}},required:['marker'],additionalProperties:false}})]);`;
const sessionId='controls-proof',report={status:'running',backend:'mxc',dispatches:0};let work,announced=false;
process.stderr.write(`Acceptance run: ${runDir}\n`);
const waitFor=async read=>{const end=Date.now()+90000;while(Date.now()<end){const value=await read();if(value)return value;await new Promise(resolve=>setTimeout(resolve,30));}throw fault('ACCEPTANCE_TIMEOUT','Native control acceptance did not settle before its deadline');};
try{
  const native=await createManagedBackend({executable:values.codex,cwd,backend:'mxc'});
  const started=new Set();
  work=runWorkflow({runDir,sessionId,script,concurrency:2,backend:{...native,execute:request=>{
    report.dispatches++;return native.execute({...request,onEvent:message=>{
      request.onEvent(message);
      if(message.method==='item/commandExecution/outputDelta'&&/CANARY_READY|SIBLING_READY/.test(message.params.delta))started.add(request.position);
    }});
  }},onReady:()=>{announced=true;}});
  // Observe rejection immediately; the controller promise is awaited below.
  work.catch(()=>{});
  const snapshot=await waitFor(async()=>{
    if(!announced)return null;const run=await readRun(runDir);
    if(!run.acceptingControls)throw fault('ACCEPTANCE_EARLY_END','Run ended before both canaries were active');
    return started.size===2&&run.workers.length===2&&run.workers.every(worker=>worker.status==='running'&&worker.activeTurn)?run:null;
  });
  const target={sessionId,generation:snapshot.generation,position:0,attempt:snapshot.workers[0].attempts,turnId:snapshot.workers[0].activeTurn.turnId};
  const steer=await requestControl(runDir,{...target,action:'steer',text:'Keep waiting on the current command. Do not launch any other command.'});
  const steering=await waitFor(async()=>{const value=await readControl(runDir,steer.id);return ['pending','applying'].includes(value.status)?null:value;});
  report.steering=steering.status;if(steering.status!=='applied')throw fault('ACCEPTANCE_STEER','Steering was not confirmed');
  const cancel=await requestControl(runDir,{...target,action:'cancel-worker'});
  const cancelled=await waitFor(async()=>{const value=await readControl(runDir,cancel.id);return value.status==='pending'?null:value;});
  report.cancellation=cancelled.status;
  const during=await waitFor(async()=>{const run=await readRun(runDir);return ['queued','running'].includes(run.workers[0].status)?null:run;});
  report.siblingStillRunning=during.workers[1].status==='running';
  const run=await work;
  report.workers=run.workers.map(worker=>({status:worker.status,error:worker.error,interruption:worker.interruption,cleanup:worker.evidence?.cleanup,attempts:worker.attempts}));
  report.siblingMarkerMatched=run.workers[1].result?.marker===marker;
  report.cleanup=run.cleanup;
  report.status=report.steering==='applied'&&report.cancellation==='applied'&&report.siblingStillRunning&&report.siblingMarkerMatched&&report.workers[0].cleanup?.jobEmpty===true&&report.workers[1].cleanup?.jobEmpty===true&&run.cleanup.jobEmpty===true?'passed':'failed';
}catch(error){
  report.status='failed';report.error=diagnostic(error);
  if(work){try{const run=await readRun(runDir);if(run.acceptingControls)await requestControl(runDir,{sessionId,generation:run.generation,action:'stop'});}catch{}await work.catch(()=>{});}
}
report.checkedAt=new Date().toISOString();const output=JSON.stringify(report,null,2)+'\n';
if(values.output){await mkdir(dirname(resolve(values.output)),{recursive:true});await writeFile(resolve(values.output),output,{flag:'wx'});}
process.stdout.write(output);process.exitCode=report.status==='passed'?0:1;
