#!/usr/bin/env node
import {readFile,readdir,open} from 'node:fs/promises';
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
import {readLifecycle,readLifecycleReceipt,requestLifecycle,planPrune,applyPrune} from '../engine/run-lifecycle.mjs';
import * as workspacePolicy from '../engine/workspace-policy.mjs';
import {createSessionServices} from '../engine/monitor-adapters.mjs';
import {doctorFailure} from './doctor-diagnostics.mjs';
import {readCapabilities} from '../engine/worker-capabilities.mjs';
const print=value=>console.log(JSON.stringify(value,null,2));
function backgroundReceipt(id,receipt,p){
 return{id,...receipt,watch:{...receipt.watch,argv:[process.execPath,join(pluginRoot,'bin','launch.mjs'),'watch',id,'--session',p.sessionId,'--generation',String(receipt.generation),'--after','0','--jsonl','--data-dir',p.dataDir]}};
}
function integer(value,name,{min=0,max=Number.MAX_SAFE_INTEGER,required=false}={}){if(value===undefined&&!required)return undefined;if(typeof value!=='string'||!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)throw Error(`--${name} requires an integer from ${min} to ${max}`);return Number(value);}
function deadlines(options){
 const run=integer(options['run-timeout-ms'],'run-timeout-ms',{max:MAX_RUN_TIMEOUT_MS});
 const worker=integer(options['worker-timeout-ms'],'worker-timeout-ms',{min:1,max:MAX_WORKER_TIMEOUT_MS});
 return{...(run===undefined?{}:{timeoutMs:run===0?null:run}),...(worker===undefined?{}:{workerTimeoutMs:worker})};
}
async function boundedJson(file,limit){
 const handle=await open(resolve(file),'r');
 try{if(!(await handle.stat()).isFile())throw Error('A regular JSON file is required');const buffer=Buffer.alloc(limit+1);let size=0;while(size<buffer.length){const {bytesRead}=await handle.read(buffer,size,buffer.length-size,null);if(!bytesRead)break;size+=bytesRead;}if(size>limit)throw Error('JSON input exceeded its bounded limit');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size)));}finally{await handle.close();}
}
function lifecycleRequest(p){
 const o=p.values,kind=o.target??'run';if(!['run','worker'].includes(kind))throw Error('--target requires run or worker');
 if(kind==='run'&&['position','attempt','worker-generation'].some(k=>o[k]!==undefined))throw Error('Worker identity options require --target worker');
 const generation=integer(o.generation,'generation',{min:1,required:true});
 const target=kind==='run'?{kind}:{kind,generation:integer(o['worker-generation'],'worker-generation',{min:1})??generation,position:integer(o.position,'position',{max:999,required:true}),attempt:integer(o.attempt,'attempt',{required:true})};
 return{sessionId:p.sessionId,generation,expectedRevision:integer(o.revision,'revision',{required:true}),target,...(o.reason===undefined?{}:{reason:o.reason})};
}
export async function main(tokens=process.argv.slice(2)){
 const p=parseCommand(tokens),o=p.values;if(p.command==='help'||o.help){process.stdout.write(help);return 0;}
 let owner;
 if(p.runCommand){owner=await resolveRun({dataDir:p.dataDir,id:p.id,...(p.mutation||p.command==='watch'?{sessionId:p.sessionId}:{})});if(p.command==='dashboard'&&o['current-ui']){const current=await selectRuntime({pluginRoot,dataDir:p.dataDir});if(resolve(current.path)!==resolve(pluginRoot))throw Error('Use the public launcher to select the explicitly installed current UI');}else if(resolve(owner.runtime.path)!==resolve(pluginRoot))throw Error('Use the public launcher to select this run’s original runtime');}
 else if(p.command!=='doctor'){const runtime=await selectRuntime({pluginRoot,dataDir:p.dataDir});if(resolve(runtime.path)!==resolve(pluginRoot))throw Error('Use the public launcher to select the managed runtime');}
 if(p.command==='mode'){const options={dataDir:p.dataDir,cwd:p.cwd,sessionId:p.sessionId,scope:o.scope??'session'};print(p.id==='status'?await readMode(options):await setMode(p.id,options));return 0;}
 const registry={cwd:p.cwd};
 if(p.command==='workflows'){print(await listWorkflows(registry));return 0;}
 if(p.command==='read'){print(await resolveWorkflow(p.id,registry));return 0;}
 if(p.command==='save'||p.command==='validate'){
  const file=o.script??(p.command==='validate'?p.id:undefined);if(!file)throw Error('A workflow script file is required');const script=await readFile(resolve(file),'utf8');
  print(p.command==='validate'?{valid:true,...parseScript(script)}:await saveWorkflow(p.id,script,{...registry,command:o.command,overwrite:o.overwrite}));return 0;
 }
 if(p.command==='list'){
  const root=paths(p.dataDir).runs;await noLinks(root);let entries;try{entries=await readdir(root,{withFileTypes:true});}catch(e){if(e.code==='ENOENT'){print({runs:[],counts:{visible:0,hidden:0,archived:0,unknown:0,unavailable:0}});return 0;}throw e;}
  if(entries.length>10000)throw Error('Run listing exceeded its limit');const runs=[];
  for(const entry of entries.filter(item=>item.isDirectory())){
   const runDir=join(root,entry.name),file=join(runDir,'runtime.json');await noLinks(file);
   try{const record=await boundedJson(file,2*1024*1024);if(record.schema!==2||record.id!==entry.name)throw Error('Invalid run ownership');let observed;try{const run=await readRun(runDir),lifecycle=await readLifecycle(runDir);observed={status:run.status,generation:run.generation,coverage:run.coverage,disposition:lifecycle.run.visibility,pruned:lifecycle.run.pruned,lifecycleRevision:lifecycle.revision,lifecycleCounts:lifecycle.counts};}catch(error){observed={status:'unavailable',error:error.message};}runs.push({id:record.id,createdAt:record.createdAt,runtime:record.runtime.id,...observed});}catch(error){runs.push({id:entry.name,status:'unavailable',error:error.message});}
  }runs.sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??''));
  const counts={visible:runs.filter(r=>!r.disposition||r.disposition==='visible').length,hidden:runs.filter(r=>['hidden','archived'].includes(r.disposition)).length,archived:runs.filter(r=>r.disposition==='archived').length,unknown:runs.reduce((n,r)=>n+(r.lifecycleCounts?.unknownWorkers??0),0),unavailable:runs.filter(r=>r.status==='unavailable').length};
  print({runs:o['show-hidden']?runs:runs.filter(r=>!['hidden','archived'].includes(r.disposition)),counts});return 0;
 }
 const backendName=o.backend??(process.platform==='win32'?'mxc':'configured');if(!['mxc','configured'].includes(backendName))throw Error('Unknown worker backend');
 if(p.command==='doctor'){
  let backend,stage='runtime';
  try{
   const runtime=await selectRuntime({pluginRoot,dataDir:p.dataDir});if(resolve(runtime.path)!==resolve(pluginRoot))throw Error('Use the public launcher to select the managed runtime');
   const executable=await nativeCodex(pluginRoot);stage='backend';
   backend=await createManagedBackend({executable,cwd:p.cwd,backend:backendName});stage='cleanup';
   const cleanup=await backend.close();
   const requiresJob=process.platform==='win32'||cleanup?.ownershipScope==='windows-job-members';
   if(cleanup?.serverExited!==true||requiresJob&&cleanup.jobEmpty!==true||cleanup.error){print(doctorFailure({code:'WORKER_DRAIN'},{stage,backend:backendName,admission:backend.admission,cleanup}));return 1;}
   print({status:'passed',inferenceRequests:0,node:process.version,codex:executable,backend:backendName,admission:backend.admission,cleanup});return 0;
  }catch(error){print(doctorFailure(error,{stage,backend:backendName,admission:backend?.admission}));return 1;}
 }
 if(p.command==='run'){
  if(o.script&&p.id)throw Error('Choose a saved workflow name or --script');if(!o.script&&!p.id)throw Error('Provide a saved workflow name or --script');
  const script=o.script?await readFile(resolve(o.script),'utf8'):(await resolveWorkflow(p.id,registry)).script;parseScript(script);
  const args=o.args===undefined?null:JSON.parse(o.args),concurrency=integer(o.concurrency,'concurrency',{min:1,max:256})??2,limits=deadlines(o);
  const defaults={...(o.model?{model:o.model}:{}),...(o.effort?{effort:o.effort}:{}),...(o['max-attempts']!==undefined?{maxAttempts:integer(o['max-attempts'],'max-attempts',{min:1,max:5})}:{}),...(o.writable?{permissions:{sandbox:'workspace-write'}}:{})};
  let capturePolicy;
  const capabilities=o['worker-capabilities']===undefined?null:await readCapabilities(o['worker-capabilities']);
  if(o['capture-policy']!==undefined){
   if(typeof workspacePolicy.validateCapturePolicy!=='function')throw Error('Capture policy validation is unavailable in this retained runtime; coordinator integration is required');
   capturePolicy=workspacePolicy.validateCapturePolicy(await boundedJson(o['capture-policy'],2*1024*1024)).policy;
  }
  const runtime=await selectRuntime({pluginRoot,dataDir:p.dataDir}),binding=await bindRun({dataDir:p.dataDir,runtime,sessionId:p.sessionId});
  const launch={codex:runtime.codex,cwd:p.cwd,backend:backendName,defaults,...(capturePolicy===undefined?{}:{capturePolicy}),...(capabilities?{workerCapabilities:capabilities.manifest,workerCapabilitiesHash:capabilities.fingerprint}:{})},input={runDir:binding.runDir,sessionId:p.sessionId,script,args,concurrency,...limits,...launch};
  try{if(!o.foreground){print(backgroundReceipt(binding.id,await startBackground(input),p));return 0;}
   const backend=await createManagedBackend({executable:runtime.codex,cwd:p.cwd,backend:backendName,defaults,...(capabilities?{workerCapabilities:capabilities.manifest,workerCapabilitiesHash:capabilities.fingerprint}:{})});const run=await runWorkflow({...input,launch,backend});print({id:binding.id,runDir:binding.runDir,status:run.status,generation:run.generation,coverage:run.coverage,result:run.result,error:run.error,cleanup:run.cleanup});return run.status==='completed'&&run.coverage.complete?0:1;
  }catch(error){error.message=`Run ${binding.id}: ${error.message}`;throw error;}
 }
 const runDir=owner.runDir;
 if(p.command==='watch'){
  if(!o.jsonl)throw Error('watch requires --jsonl');
  const {watchRun}=await import('../engine/watch.mjs');
  const abort=new AbortController(),stop=()=>abort.abort();process.on('SIGINT',stop);process.on('SIGTERM',stop);
  try{return(await watchRun(runDir,{sessionId:p.sessionId,generation:integer(o.generation,'generation',{min:1,required:true}),after:integer(o.after,'after')??0,pollMs:integer(o['poll-ms'],'poll-ms',{min:100,max:10000})??500,idleMs:integer(o['idle-ms'],'idle-ms',{min:1000,max:86400000})??60000,signal:abort.signal})).exitCode;}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
 }
 if(p.command==='status'){print({id:p.id,runDir,...await monitorData(runDir),lifecycle:await readLifecycle(runDir)});return 0;}
 if(p.command==='result'){print(await monitorData(runDir,{kind:'result'}));return 0;}
 if(p.command==='dashboard'){const {binding}=await createSessionServices({dataDir:p.dataDir,sessionId:p.sessionId,pinnedRunId:p.id});print({id:p.id,...await startMonitor(runDir,{binding})});return 0;}
 if(p.command==='control'){if(!o.receipt)throw Error('--receipt is required');print(await readControl(runDir,o.receipt));return 0;}
 // Settled lifecycle operations never use the live-control mailbox.
 if(p.command==='lifecycle'){print(await readLifecycle(runDir));return 0;}
 if(p.command==='lifecycle-receipt'){if(!o.receipt)throw Error('--receipt is required');print(await readLifecycleReceipt(runDir,o.receipt));return 0;}
 if(['hide','archive','restore'].includes(p.command)){if(!o.request)throw Error('--request is required; inspect that receipt after a lost response');print(await requestLifecycle(runDir,{...lifecycleRequest(p),action:p.command,requestId:o.request}));return 0;}
 if(p.command==='prune-plan'){print(await planPrune(runDir,lifecycleRequest(p)));return 0;}
 if(p.command==='prune'){
  if(!o.plan||!o['approved-plan-hash'])throw Error('Prune requires --plan and the exact reviewed --approved-plan-hash');
  const receipt=await applyPrune(runDir,{sessionId:p.sessionId,plan:await boundedJson(o.plan,16*1024*1024),approvedPlanHash:o['approved-plan-hash']});print(receipt);return receipt.outcome==='applied'?0:1;
 }
 const generation=integer(o.generation,'generation',{min:1,required:p.command!=='resume'});
 if(['worker','events','patch','exclusions'].includes(p.command)){
  const position=integer(o.position,'position',{required:true}),sourceGeneration=integer(o['source-generation'],'source-generation',{min:1});
  print(await monitorData(runDir,{kind:p.command==='events'?'activity':p.command,generation,position,sourceGeneration,after:integer(o.after,'after')??0,limit:integer(o.limit,'limit',{min:1,max:100})??50,basis:o.basis??'inputs',stage:o.stage??'outputs',previewBytes:32*1024*1024}));return 0;
 }
 if(p.command==='resume'||p.command==='restart-worker'){
  print(backgroundReceipt(p.id,await startBackground({runDir,sessionId:p.sessionId,resume:true,...deadlines(o),...(generation!==undefined?{expectedGeneration:generation}:{}),...(o.script?{script:await readFile(resolve(o.script),'utf8')}:{}),...(p.command==='restart-worker'?{restart:{position:integer(o.position,'position',{required:true}),attempt:integer(o.attempt,'attempt',{min:1,required:true}),reconciliation:o.reconcile}}:{})}),p));return 0;
 }
 print(await requestControl(runDir,{sessionId:p.sessionId,generation,action:p.command,...(['steer','cancel-worker'].includes(p.command)?{position:integer(o.position,'position',{required:true}),attempt:integer(o.attempt,'attempt',{min:1,required:true}),turnId:o.turn??null,...(o.text!==undefined?{text:o.text}:{})}:{})}));return 0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().then(code=>{process.exitCode=code;},error=>{console.error(`Agent Workflow: ${error.message}`);process.exitCode=1;});
