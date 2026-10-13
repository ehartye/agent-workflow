#!/usr/bin/env node
import {readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseCommand,help} from './arguments.mjs';
import {pluginRoot,paths,selectRuntime,bindRun,resolveRun,noLinks,nativeCodex} from './managed-runtime.mjs';
import {readMode,setMode} from '../engine/mode.mjs';
import {parseScript} from '../engine/script.mjs';
import {listWorkflows,resolveWorkflow,saveWorkflow} from '../engine/registry.mjs';
import {readRun,runWorkflow,requestControl,readControl} from '../engine/controller.mjs';
import {startBackground} from '../engine/background.mjs';
import {createManagedBackend} from '../engine/backend.mjs';
import {startMonitor} from '../engine/monitor-launch.mjs';
import {monitorData} from '../engine/monitor-data.mjs';
import {MAX_RUN_TIMEOUT_MS,MAX_WORKER_TIMEOUT_MS} from '../engine/deadlines.mjs';
const print=value=>console.log(JSON.stringify(value,null,2));
function integer(value,name,{min=0,max=Number.MAX_SAFE_INTEGER,required=false}={}){if(value===undefined&&!required)return undefined;if(typeof value!=='string'||!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)throw Error(`--${name} requires an integer from ${min} to ${max}`);return Number(value);}
function deadlines(options){
 const run=integer(options['run-timeout-ms'],'run-timeout-ms',{max:MAX_RUN_TIMEOUT_MS});
 const worker=integer(options['worker-timeout-ms'],'worker-timeout-ms',{min:1,max:MAX_WORKER_TIMEOUT_MS});
 return{...(run===undefined?{}:{timeoutMs:run===0?null:run}),...(worker===undefined?{}:{workerTimeoutMs:worker})};
}
export async function main(tokens=process.argv.slice(2)){
 const p=parseCommand(tokens),o=p.values;if(p.command==='help'||o.help){process.stdout.write(help);return 0;}
 let owner;
 if(p.runCommand){owner=await resolveRun({dataDir:p.dataDir,id:p.id,...(p.mutation?{sessionId:p.sessionId}:{})});if(resolve(owner.runtime.path)!==resolve(pluginRoot))throw Error('Use the public launcher to select this run’s original runtime');}
 else{const runtime=await selectRuntime({pluginRoot,dataDir:p.dataDir});if(resolve(runtime.path)!==resolve(pluginRoot))throw Error('Use the public launcher to select the managed runtime');}
 if(p.command==='mode'){const options={dataDir:p.dataDir,cwd:p.cwd,sessionId:p.sessionId,scope:o.scope??'session'};print(p.id==='status'?await readMode(options):await setMode(p.id,options));return 0;}
 const registry={cwd:p.cwd};
 if(p.command==='workflows'){print(await listWorkflows(registry));return 0;}
 if(p.command==='read'){print(await resolveWorkflow(p.id,registry));return 0;}
 if(p.command==='save'||p.command==='validate'){
  const file=o.script??(p.command==='validate'?p.id:undefined);if(!file)throw Error('A workflow script file is required');const script=await readFile(resolve(file),'utf8');
  print(p.command==='validate'?{valid:true,...parseScript(script)}:await saveWorkflow(p.id,script,{...registry,command:o.command,overwrite:o.overwrite}));return 0;
 }
 if(p.command==='list'){
  const root=paths(p.dataDir).runs;await noLinks(root);let entries;try{entries=await readdir(root,{withFileTypes:true});}catch(e){if(e.code==='ENOENT'){print([]);return 0;}throw e;}
  if(entries.length>10000)throw Error('Run listing exceeded its limit');const runs=[];
  for(const entry of entries.filter(item=>item.isDirectory())){
   const runDir=join(root,entry.name),file=join(runDir,'runtime.json');await noLinks(file);
   try{const record=JSON.parse(await readFile(file,'utf8'));if(record.schema!==2||record.id!==entry.name)throw Error('Invalid run ownership');let observed;try{const run=await readRun(runDir);observed={status:run.status,generation:run.generation,coverage:run.coverage};}catch(error){observed={status:'unavailable',error:error.message};}runs.push({id:record.id,createdAt:record.createdAt,runtime:record.runtime.id,...observed});}catch(error){runs.push({id:entry.name,status:'unavailable',error:error.message});}
  }runs.sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??''));print(runs);return 0;
 }
 const backendName=o.backend??(process.platform==='win32'?'mxc':'configured');if(!['mxc','configured'].includes(backendName))throw Error('Unknown worker backend');
 if(p.command==='doctor'){
  const executable=await nativeCodex(pluginRoot);let backend;try{backend=await createManagedBackend({executable,cwd:p.cwd,backend:backendName});const cleanup=await backend.close();print({status:cleanup.serverExited?'passed':'failed',inferenceRequests:0,node:process.version,codex:executable,backend:backendName,admission:backend.admission,cleanup});return cleanup.serverExited?0:1;}finally{await backend?.close();}
 }
 if(p.command==='run'){
  if(o.script&&p.id)throw Error('Choose a saved workflow name or --script');if(!o.script&&!p.id)throw Error('Provide a saved workflow name or --script');
  const script=o.script?await readFile(resolve(o.script),'utf8'):(await resolveWorkflow(p.id,registry)).script;parseScript(script);
  const args=o.args===undefined?null:JSON.parse(o.args),concurrency=integer(o.concurrency,'concurrency',{min:1,max:256})??2,limits=deadlines(o);
  const defaults={...(o.model?{model:o.model}:{}),...(o.effort?{effort:o.effort}:{}),...(o['max-attempts']!==undefined?{maxAttempts:integer(o['max-attempts'],'max-attempts',{min:1,max:5})}:{}),...(o.writable?{permissions:{sandbox:'workspace-write'}}:{})};
  const runtime=await selectRuntime({pluginRoot,dataDir:p.dataDir}),binding=await bindRun({dataDir:p.dataDir,runtime,sessionId:p.sessionId});
  const launch={codex:runtime.codex,cwd:p.cwd,backend:backendName,defaults},input={runDir:binding.runDir,sessionId:p.sessionId,script,args,concurrency,...limits,...launch};
  try{if(!o.foreground){print({id:binding.id,...await startBackground(input)});return 0;}
   const backend=await createManagedBackend({executable:runtime.codex,cwd:p.cwd,backend:backendName,defaults});const run=await runWorkflow({...input,launch,backend});print({id:binding.id,runDir:binding.runDir,status:run.status,generation:run.generation,coverage:run.coverage,result:run.result,error:run.error,cleanup:run.cleanup});return run.status==='completed'&&run.coverage.complete?0:1;
  }catch(error){error.message=`Run ${binding.id}: ${error.message}`;throw error;}
 }
 const runDir=owner.runDir;
 if(p.command==='status'){print({id:p.id,runDir,...await monitorData(runDir)});return 0;}
 if(p.command==='result'){print(await monitorData(runDir,{kind:'result'}));return 0;}
 if(p.command==='dashboard'){print({id:p.id,...await startMonitor(runDir)});return 0;}
 if(p.command==='control'){if(!o.receipt)throw Error('--receipt is required');print(await readControl(runDir,o.receipt));return 0;}
 const generation=integer(o.generation,'generation',{min:1,required:p.command!=='resume'});
 if(['worker','events','patch'].includes(p.command)){
  const position=integer(o.position,'position',{required:true}),sourceGeneration=integer(o['source-generation'],'source-generation',{min:1});
  print(await monitorData(runDir,{kind:p.command==='events'?'activity':p.command,generation,position,sourceGeneration,after:integer(o.after,'after')??0,limit:integer(o.limit,'limit',{min:1,max:100})??50,basis:o.basis??'inputs',previewBytes:32*1024*1024}));return 0;
 }
 if(p.command==='resume'||p.command==='restart-worker'){
  print({id:p.id,...await startBackground({runDir,sessionId:p.sessionId,resume:true,...deadlines(o),...(generation!==undefined?{expectedGeneration:generation}:{}),...(o.script?{script:await readFile(resolve(o.script),'utf8')}:{}),...(p.command==='restart-worker'?{restart:{position:integer(o.position,'position',{required:true}),attempt:integer(o.attempt,'attempt',{min:1,required:true}),reconciliation:o.reconcile}}:{})})});return 0;
 }
 print(await requestControl(runDir,{sessionId:p.sessionId,generation,action:p.command,...(['steer','cancel-worker'].includes(p.command)?{position:integer(o.position,'position',{required:true}),attempt:integer(o.attempt,'attempt',{min:1,required:true}),turnId:o.turn??null,...(o.text!==undefined?{text:o.text}:{})}:{})}));return 0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().then(code=>{process.exitCode=code;},error=>{console.error(`Agent Workflow: ${error.message}`);process.exitCode=1;});
