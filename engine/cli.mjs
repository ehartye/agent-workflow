import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { diagnostic, fault } from '../foundation/client.mjs';
import { runWorkflow, readRun, requestControl, readControl } from './controller.mjs';
import { createManagedBackend } from './backend.mjs';
import { startBackground } from './background.mjs';
import { startMonitor } from './monitor-launch.mjs';
import {monitorData} from './monitor-data.mjs';
import {parseScript} from './script.mjs';
import {listWorkflows,resolveWorkflow,saveWorkflow} from './registry.mjs';

const { values } = parseArgs({ options: {
  codex: { type: 'string' }, cwd: { type: 'string' }, script: { type: 'string' },
  run: { type: 'string' }, session: { type: 'string' }, args: { type: 'string' },
  backend: { type: 'string' }, resume: { type: 'boolean' }, status: { type: 'boolean' },
  concurrency: { type: 'string' }, help: { type: 'boolean' },foreground:{type:'boolean'},
  'run-timeout-ms':{type:'string'},'worker-timeout-ms':{type:'string'},
  action:{type:'string'},generation:{type:'string'},control:{type:'string'},dashboard:{type:'boolean'},
  position:{type:'string'},attempt:{type:'string'},turn:{type:'string'},text:{type:'string'},
  reconcile:{type:'string'},worker:{type:'string'},'source-generation':{type:'string'},
  model:{type:'string'},effort:{type:'string'},'max-attempts':{type:'string'},
  writable:{type:'boolean'},
  patch:{type:'string'},basis:{type:'string'},
  workflow:{type:'string'},'list-workflows':{type:'boolean'},'read-workflow':{type:'string'},'save-workflow':{type:'string'},validate:{type:'boolean'},command:{type:'boolean'},overwrite:{type:'boolean'},
} });
if (values.help) {
  console.log('Deadlines: --worker-timeout-ms <1-1800000> defaults to 600000; --run-timeout-ms <0-86400000> defaults to 0 (completion/manual Stop). Resume inherits saved deadlines unless overridden.');
  console.log('Saved definitions: --list-workflows | --read-workflow <[scope:]name> | --save-workflow <[scope:]name> --script <file> [--command] [--overwrite]. Validate: --validate --script <file>. Start a saved definition with --workflow <[scope:]name> instead of --script. Project lookup uses --cwd.');
  console.log('Read a verified complete patch: --patch <worker position> --run <directory> --generation <observed generation> [--basis inputs|base] [--source-generation <prior generation>]. Returns JSON with patch text and SHA-256.');
  console.log('Isolated edits: --writable authorizes workspace-write workers in separate Git worktrees. Default is read-only. Writers require a Git project and a run directory outside it; changes are retained for review.');
  console.log('Restart saved worker and its suffix: --action restart-worker --run <directory> --session <identity> --generation <observed generation> --position <worker position> --attempt <observed attempt> --reconcile <external-effect reconciliation note>\nRead worker evidence: --worker <position> --run <directory> --generation <observed generation> [--source-generation <prior execution generation>]');
  console.log('Dashboard: --dashboard --run <directory>\nWorker control: --action <steer|cancel-worker> --run <directory> --session <identity> --generation <observed generation> --position <worker position> --attempt <observed attempt> [--turn <observed active turn>] [--text <steering instruction>]');
  console.log('Start in background: node engine/cli.mjs --codex <native executable> --cwd <project> --script <workflow.js> --run <directory> --session <identity> [--backend mxc] [--args <JSON>]\nWorker defaults: [--model <catalog model>] [--effort <supported effort>] [--max-attempts <1-5>]\nInspect: --status --run <directory>\nPause/stop: --action <pause|stop> --run <directory> --session <identity> --generation <observed generation>\nControl receipt: --control <id> --run <directory>\nResume saved script: --resume --run <directory> --session <identity> [--script <edited workflow.js>]\nUse --foreground for synchronous diagnostics.');
} else {
  try {
    const definitionActions=['list-workflows','read-workflow','save-workflow','validate'].filter(key=>values[key]!==undefined);
    if(definitionActions.length>1||values.workflow&&values.script)throw fault('CLI_INPUT','Choose one definition operation and one script source');
    if(definitionActions.length){
      const options={cwd:values.cwd??process.cwd(),command:values.command,overwrite:values.overwrite};let result;
      if(values['list-workflows'])result=await listWorkflows(options);
      else if(values['read-workflow'])result=await resolveWorkflow(values['read-workflow'],options);
      else{
        if(!values.script)throw fault('CLI_INPUT','Definition save and validation require --script <file>');
        const script=await readFile(resolve(values.script),'utf8');
        result=values.validate?{valid:true,...parseScript(script)}:await saveWorkflow(values['save-workflow'],script,options);
      }
      console.log(JSON.stringify(result,null,2));
    }else{
    if (!values.run) throw fault('CLI_INPUT','A run directory is required');
    let run;
    const runDir=resolve(values.run);
    if(values.dashboard){console.log(JSON.stringify(await startMonitor(runDir),null,2));}
    else if(values.worker!==undefined||values.patch!==undefined){
      const position=values.patch??values.worker;
      if(!/^(0|[1-9][0-9]*)$/.test(position)||!Number.isInteger(Number(values.generation))||Number(values.generation)<1)throw fault('CLI_INPUT','Worker reads require position and observed generation');
      console.log(JSON.stringify(await monitorData(runDir,{kind:values.patch!==undefined?'patch':'worker',position:Number(position),generation:Number(values.generation),basis:values.basis??'inputs',previewBytes:32*1024*1024,...(values['source-generation']!==undefined?{sourceGeneration:Number(values['source-generation'])}:{})}),null,2));
    }
    else if(values.action==='restart-worker')console.log(JSON.stringify(await startBackground({runDir,sessionId:values.session,resume:true,expectedGeneration:Number(values.generation),restart:{position:Number(values.position),attempt:Number(values.attempt),reconciliation:values.reconcile}}),null,2));
    else if(values.action){console.log(JSON.stringify(await requestControl(runDir,{sessionId:values.session,generation:Number(values.generation),action:values.action,...(['steer','cancel-worker'].includes(values.action)?{position:Number(values.position),attempt:Number(values.attempt),turnId:values.turn??null,...(values.text!==undefined?{text:values.text}:{})}:{})}),null,2));}
    else if(values.control){console.log(JSON.stringify(await readControl(runDir,values.control),null,2));}
    else if (values.status) run = await readRun(runDir);
    else {
      const input={runDir,sessionId:values.session,resume:values.resume,
        ...(values.codex?{codex:values.codex}:{}),...(values.cwd?{cwd:values.cwd}:{}),...(values.backend?{backend:values.backend}:{}),
        ...(values.workflow?{script:(await resolveWorkflow(values.workflow,{cwd:values.cwd??process.cwd()})).script}:values.script?{script:await readFile(resolve(values.script),'utf8')}:{}),
        ...(values.args!==undefined?{args:JSON.parse(values.args)}:{}),...(values.concurrency?{concurrency:Number(values.concurrency)}:{}),
        ...(values['run-timeout-ms']!==undefined?{timeoutMs:values['run-timeout-ms']==='0'?null:Number(values['run-timeout-ms'])}:{}),...(values['worker-timeout-ms']!==undefined?{workerTimeoutMs:Number(values['worker-timeout-ms'])}:{}),
        ...(['model','effort','max-attempts','writable'].some(key=>values[key]!==undefined)?{defaults:{...(values.model!==undefined?{model:values.model}:{}),...(values.effort!==undefined?{effort:values.effort}:{}),...(values['max-attempts']!==undefined?{maxAttempts:Number(values['max-attempts'])}:{}),...(values.writable?{permissions:{sandbox:'workspace-write'}}:{})}}:{})};
      if(!values.foreground)console.log(JSON.stringify(await startBackground(input),null,2));
      else {
        const previous=values.resume?await readRun(runDir):null;
        const launch={codex:input.codex??previous?.launch?.codex,cwd:input.cwd??previous?.launch?.cwd,backend:input.backend??previous?.launch?.backend??'configured',defaults:{...previous?.launch?.defaults,...input.defaults}};
        const backend=await createManagedBackend({executable:launch.codex,cwd:launch.cwd,backend:launch.backend,defaults:launch.defaults});
        run=await runWorkflow({...input,script:input.script??previous?.script,args:Object.hasOwn(input,'args')?input.args:previous?.args??null,concurrency:input.concurrency??previous?.concurrency??2,launch,backend});
      }
    }
    if(run){
      console.log(JSON.stringify({ status: run.status, generation: run.generation, attempts: run.attempts, acceptingControls:run.acceptingControls,updatedAt:run.updatedAt,coverage: run.coverage, result: run.result, error: run.error, cleanup: run.cleanup }, null, 2));
      process.exitCode = values.status||run.status === 'completed' && run.coverage.complete ? 0 : 1;
    }
    }
  } catch (error) {
    console.log(JSON.stringify({ status: 'failed', error: diagnostic(error) }, null, 2));
    process.exitCode = 1;
  }
}
