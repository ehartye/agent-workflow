import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { diagnostic, fault } from '../foundation/client.mjs';
import { runWorkflow, readRun, requestControl, readControl } from './controller.mjs';
import { createManagedBackend } from './backend.mjs';
import { startBackground } from './background.mjs';
import { startMonitor } from './monitor-launch.mjs';

const { values } = parseArgs({ options: {
  codex: { type: 'string' }, cwd: { type: 'string' }, script: { type: 'string' },
  run: { type: 'string' }, session: { type: 'string' }, args: { type: 'string' },
  backend: { type: 'string' }, resume: { type: 'boolean' }, status: { type: 'boolean' },
  concurrency: { type: 'string' }, help: { type: 'boolean' },foreground:{type:'boolean'},
  action:{type:'string'},generation:{type:'string'},control:{type:'string'},dashboard:{type:'boolean'},
} });
if (values.help) {
  console.log('Start in background: node engine/cli.mjs --codex <native executable> --cwd <project> --script <workflow.js> --run <directory> --session <identity> [--backend mxc] [--args <JSON>]\nInspect: --status --run <directory>\nPause/stop: --action <pause|stop> --run <directory> --session <identity> --generation <observed generation>\nControl receipt: --control <id> --run <directory>\nResume saved script: --resume --run <directory> --session <identity> [--script <edited workflow.js>]\nUse --foreground for synchronous diagnostics.');
} else {
  try {
    if (!values.run) throw fault('CLI_INPUT','A run directory is required');
    let run;
    const runDir=resolve(values.run);
    if(values.dashboard){console.log(JSON.stringify(await startMonitor(runDir),null,2));}
    else if(values.action){console.log(JSON.stringify(await requestControl(runDir,{sessionId:values.session,generation:Number(values.generation),action:values.action}),null,2));}
    else if(values.control){console.log(JSON.stringify(await readControl(runDir,values.control),null,2));}
    else if (values.status) run = await readRun(runDir);
    else {
      const input={runDir,sessionId:values.session,resume:values.resume,
        ...(values.codex?{codex:values.codex}:{}),...(values.cwd?{cwd:values.cwd}:{}),...(values.backend?{backend:values.backend}:{}),
        ...(values.script?{script:await readFile(resolve(values.script),'utf8')}:{}),
        ...(values.args!==undefined?{args:JSON.parse(values.args)}:{}),...(values.concurrency?{concurrency:Number(values.concurrency)}:{})};
      if(!values.foreground)console.log(JSON.stringify(await startBackground(input),null,2));
      else {
        const previous=values.resume?await readRun(runDir):null;
        const launch={codex:input.codex??previous?.launch?.codex,cwd:input.cwd??previous?.launch?.cwd,backend:input.backend??previous?.launch?.backend??'configured'};
        const backend=await createManagedBackend({executable:launch.codex,cwd:launch.cwd,backend:launch.backend});
        run=await runWorkflow({...input,script:input.script??previous?.script,args:Object.hasOwn(input,'args')?input.args:previous?.args??null,concurrency:input.concurrency??previous?.concurrency??2,launch,backend});
      }
    }
    if(run){
      console.log(JSON.stringify({ status: run.status, generation: run.generation, attempts: run.attempts, acceptingControls:run.acceptingControls,updatedAt:run.updatedAt,coverage: run.coverage, result: run.result, error: run.error, cleanup: run.cleanup }, null, 2));
      process.exitCode = values.status||run.status === 'completed' && run.coverage.complete ? 0 : 1;
    }
  } catch (error) {
    console.log(JSON.stringify({ status: 'failed', error: diagnostic(error) }, null, 2));
    process.exitCode = 1;
  }
}
