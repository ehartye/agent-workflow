import {parseArgs} from 'node:util';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createManagedBackend} from './backend.mjs';
import {runWorkflow} from './controller.mjs';
import {monitorData} from './monitor-data.mjs';
import {diagnostic} from '../foundation/client.mjs';

const {values}=parseArgs({options:{codex:{type:'string'},backend:{type:'string',default:'configured'},output:{type:'string'}}});
const base=await mkdtemp(join(tmpdir(),'agent-workflow-structured-check-'));
const cwd=join(base,'project'),runDir=join(base,'run');await mkdir(cwd);
const marker=randomUUID();await writeFile(join(cwd,'marker.txt'),marker+'\n',{flag:'wx'});
const script=`export const meta={name:'structured-read-proof',description:'Read a marker into validated JSON and replay without inference'};
return await agent('Run one PowerShell command with login:false to read the first line of marker.txt. Return a JSON object with the exact line as marker. Do not retry a failed command or change any files.',{schema:{type:'object',properties:{marker:{type:'string'}},required:['marker'],additionalProperties:false}});`;
await writeFile(join(base,'workflow.js'),script,{flag:'wx'});
const report={status:'running',backend:values.backend,dispatches:[0,0],checks:[]};
process.stderr.write(`Acceptance run: ${runDir}\n`);
try{
  for(const pass of [0,1]){
    const native=await createManagedBackend({executable:values.codex,cwd,backend:values.backend});
    let observedWhileRunning=false;
    const backend={...native,execute:request=>{report.dispatches[pass]++;return native.execute({...request,onEvent:message=>{
      request.onEvent(message);
      if(message.method==='item/started'&&message.params.item?.type==='commandExecution'){
        const db=new DatabaseSync(join(runDir,'run.sqlite'),{readOnly:true});
        try{
          const worker=JSON.parse(db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(pass+1,request.position).value);
          observedWhileRunning=worker.status==='running'&&worker.activity?.type==='commandExecution'&&worker.activityCount>0;
        }finally{db.close();}
      }
    }});}};
    const run=await runWorkflow({runDir,sessionId:'structured-proof',script,backend,resume:pass===1,maxAgents:5});
    const worker=run.workers[0];
    const matched=run.result?.marker===marker&&Object.keys(run.result).length===1;
    const commandsVerified=pass===1||worker?.evidence?.commands.length===1&&worker.evidence.commands[0].status==='completed'&&worker.evidence.commands[0].exitCode===0;
    const activity=worker?await monitorData(runDir,{kind:'activity',generation:run.generation,position:worker.position,limit:100}):null;
    const activityVerified=Boolean(activity?.records.some(record=>record.method==='item/started'&&record.type==='commandExecution')&&activity.records.some(record=>record.method==='item/completed'&&record.type==='commandExecution'&&record.exitCode===0)&&worker.usage?.totalTokens>0&&(pass===1||observedWhileRunning));
    report.checks.push({status:run.status,generation:run.generation,coverage:run.coverage,attempts:run.attempts,markerMatched:matched,commandsVerified,activityVerified,observedWhileRunning,activity:activity?{observed:activity.observed,retained:activity.retained,dropped:activity.dropped,sourceGeneration:activity.sourceGeneration}:null,usage:worker?.usage??null,settings:worker?.options?{model:worker.options.model,effort:worker.options.effort,permissions:worker.options.permissions}:null,cleanup:run.cleanup,error:run.error??worker?.error??null});
    if(run.status!=='completed'||!matched||!commandsVerified||!activityVerified||!run.coverage.complete)break;
  }
  report.status=report.checks.length===2&&report.checks.every(check=>check.status==='completed'&&check.markerMatched&&check.commandsVerified&&check.activityVerified&&check.coverage.complete&&check.cleanup.serverExited)&&report.dispatches[0]===1&&report.dispatches[1]===0&&report.checks[1].coverage.cached===1?'passed':'failed';
}catch(error){report.status='failed';report.error=diagnostic(error);if(error.admission)report.admission=error.admission;}
report.checkedAt=new Date().toISOString();
const output=JSON.stringify(report,null,2)+'\n';
if(values.output){await mkdir(dirname(resolve(values.output)),{recursive:true});await writeFile(resolve(values.output),output,{flag:'wx'});}
process.stdout.write(output);process.exitCode=report.status==='passed'?0:1;
