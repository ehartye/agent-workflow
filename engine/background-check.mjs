import {parseArgs} from 'node:util';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startBackground} from './background.mjs';
import {readRun,requestControl} from './controller.mjs';
import {fault,diagnostic} from '../foundation/client.mjs';

const {values}=parseArgs({options:{codex:{type:'string'},backend:{type:'string',default:'configured'},output:{type:'string'}}});
const base=await mkdtemp(join(tmpdir(),'workflow-background-native-'));
const cwd=join(base,'project'),runDir=join(base,'run');await mkdir(cwd);
const markers=[randomUUID(),randomUUID()];
await Promise.all(markers.map((marker,index)=>writeFile(join(cwd,`${index}.txt`),marker+'\n',{flag:'wx'})));
const script=`export const meta={name:'background-read-proof',description:'Pause and resume real workers'};
await phase('Read');return await parallel(args.map(file=>()=>agent('Run exactly one PowerShell command with login:false to read only the first line of '+file+', then Start-Sleep -Seconds 2. Return exactly the first line. Do not retry or change files.')));`;
await writeFile(join(base,'workflow.js'),script,{flag:'wx'});
const report={status:'running',backend:values.backend,checks:[]};
async function until(read,predicate,timeoutMs=140000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){const value=await read();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,50));}
  throw fault('CHECK_TIMEOUT','Expected background transition was not observed');
}
const inspect=run=>({status:run.status,generation:run.generation,attempts:run.attempts,coverage:run.coverage,cleanup:run.cleanup,
  commands:run.workers.filter(worker=>!worker.cached&&worker.status==='completed').flatMap(worker=>worker.evidence?.commands??[])});
try{
  const first=await startBackground({runDir,sessionId:'native-background-proof',script,args:['0.txt','1.txt'],codex:values.codex,cwd,backend:values.backend,concurrency:1});
  await until(()=>readRun(runDir),run=>run.workers.some(worker=>worker.status==='running'));
  await requestControl(runDir,{sessionId:'native-background-proof',generation:first.generation,action:'pause'});
  const paused=await until(()=>readRun(runDir),run=>!['running','pausing','stopping','finishing'].includes(run.status));
  report.checks.push(inspect(paused));
  if(paused.status!=='paused'||paused.attempts!==1||paused.workers[0].result!==markers[0])throw fault('PAUSE_PROOF','Pause did not retain exactly the first successful worker');
  await until(()=>readFile(first.resultPath,'utf8').catch(()=>null),Boolean);
  for(const pass of [1,2]){
    const receipt=await startBackground({runDir,sessionId:'native-background-proof',resume:true});
    const run=await until(()=>readRun(runDir),run=>!['running','pausing','stopping','finishing'].includes(run.status));
    const matched=JSON.stringify(run.result)===JSON.stringify(markers);
    report.checks.push({...inspect(run),markersMatched:matched});
    if(run.status!=='completed'||!matched||run.coverage.cached!==pass||run.attempts!==2||!run.coverage.complete||run.cleanup?.serverExited!==true)throw fault('REPLAY_PROOF','Background resume did not preserve the expected prefix and shutdown evidence');
    await until(()=>readFile(receipt.resultPath,'utf8').catch(()=>null),Boolean);
  }
  const commands=report.checks.flatMap(check=>check.commands);
  if(commands.length!==2||commands.some(command=>command.status!=='completed'||command.exitCode!==0))throw fault('COMMAND_PROOF','Expected two successful file-read commands');
  report.status='passed';
}catch(error){
  report.status='failed';report.error=diagnostic(error);
  if(['ERR_SQLITE_ERROR','ENOENT','EACCES','EPERM'].includes(error.code))report.error.nativeCode=error.code;
  if(Number.isInteger(error.errcode))report.error.sqliteCode=error.errcode;
  const run=await readRun(runDir).catch(()=>null);
  if(run?.acceptingControls)report.stopRequested=Boolean(await requestControl(runDir,{sessionId:'native-background-proof',generation:run.generation,action:'stop'}).catch(()=>null));
}
report.checkedAt=new Date().toISOString();report.descendants='notVerified';
const output=JSON.stringify(report,null,2)+'\n';
if(values.output){const path=resolve(values.output);await mkdir(dirname(path),{recursive:true});await writeFile(path,output,{flag:'wx'});}
process.stdout.write(output);process.exitCode=report.status==='passed'?0:1;
