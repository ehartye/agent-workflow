#!/usr/bin/env node
import {readFile,readdir,open,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseCommand,help,parseDeadlineOptions} from './arguments.mjs';
import {pluginRoot,paths,selectRuntime,bindRun,resolveRun,noLinks,nativeCodex} from './managed-runtime.mjs';
import {readMode,setMode} from '../engine/mode.mjs';
import {parseScript} from '../engine/script.mjs';
import {listWorkflows,resolveWorkflow,saveWorkflow} from '../engine/registry.mjs';
import {readRun,runWorkflow,requestControl,readControl} from '../engine/controller.mjs';
import {startBackground} from '../engine/background.mjs';
import {createManagedBackend} from '../engine/backend.mjs';
import {startMonitor} from '../engine/monitor-launch.mjs';
import {freezeWorkflowSources} from '../engine/composition.mjs';
import {contextRunRef} from '../engine/composition-store.mjs';
import {validateArtifactScope} from '../engine/composition-contracts.mjs';
import {monitorData} from '../engine/monitor-data.mjs';
import {MAX_RUN_TIMEOUT_MS,MAX_WORKER_TIMEOUT_MS} from '../engine/deadlines.mjs';
import {readLifecycle,readLifecycleReceipt,requestLifecycle,planPrune,applyPrune} from '../engine/run-lifecycle.mjs';
import * as workspacePolicy from '../engine/workspace-policy.mjs';
import {createSessionServices} from '../engine/monitor-adapters.mjs';
import {doctorFailure,doctorHostContext} from './doctor-diagnostics.mjs';
import {readHostContext} from '../foundation/host-context.mjs';
import {readCapabilities} from '../engine/worker-capabilities.mjs';
import {resolveAccess} from '../engine/access-policy.mjs';
import {fault} from '../foundation/client.mjs';
import {requestAppend,readAppendReceipt,readAppendTasks} from '../engine/append.mjs';
const print=value=>console.log(JSON.stringify(value,null,2));
function backgroundReceipt(id,receipt,p){
 return{id,...receipt,watch:{...receipt.watch,argv:[process.execPath,join(pluginRoot,'bin','launch.mjs'),'watch',id,'--session',p.sessionId,'--generation',String(receipt.generation),'--after','0','--jsonl','--data-dir',p.dataDir]}};
}
function integer(value,name,{min=0,max=Number.MAX_SAFE_INTEGER,required=false}={}){if(value===undefined&&!required)return undefined;if(typeof value!=='string'||!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)throw Error(`--${name} requires an integer from ${min} to ${max}`);return Number(value);}
const backgroundOptions=options=>options['startup-timeout-ms']===undefined?{}:{startupMs:Number(options['startup-timeout-ms'])};
function deadlines(options){
 const run=integer(options['run-timeout-ms'],'run-timeout-ms',{max:MAX_RUN_TIMEOUT_MS});
 const worker=integer(options['worker-timeout-ms'],'worker-timeout-ms',{max:MAX_WORKER_TIMEOUT_MS});
 return{...(run===undefined?{}:{timeoutMs:run===0?null:run}),...(worker===undefined?{}:{workerTimeoutMs:worker===0?null:worker})};
}
async function boundedText(file,limit){
 const path=resolve(file);let handle;
 try{
  await noLinks(path);const before=await lstat(path,{bigint:true});if(!before.isFile()||before.nlink!==1n)throw fault('CLI_FILE','A regular single-link input file is required');
  handle=await open(path,'r');const opened=await handle.stat({bigint:true});
  const same=(a,b)=>['dev','ino','mode','nlink','size','mtimeNs','ctimeNs'].every(key=>a[key]===b[key]);
  if(!opened.isFile()||opened.nlink!==1n||!same(before,opened))throw fault('CLI_FILE_CHANGED','Input file identity changed');
  if(opened.size>BigInt(limit))throw fault('CLI_INPUT_LIMIT','Input exceeded its bounded limit');
  const buffer=Buffer.alloc(limit+1);let size=0;
  while(size<buffer.length){const {bytesRead}=await handle.read(buffer,size,buffer.length-size,null);if(!bytesRead)break;size+=bytesRead;}
  if(size>limit)throw fault('CLI_INPUT_LIMIT','Input exceeded its bounded limit');
  await noLinks(path);if(!same(opened,await handle.stat({bigint:true}))||!same(opened,await lstat(path,{bigint:true}))||BigInt(size)!==opened.size)throw fault('CLI_FILE_CHANGED','Input file identity changed');
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size));}catch{throw fault('CLI_UTF8','Input must be valid UTF-8 encoded text');}
 }catch(error){if(['CLI_FILE','CLI_FILE_CHANGED','CLI_INPUT_LIMIT','CLI_UTF8'].includes(error.code))throw error;throw fault('CLI_FILE','A readable regular input file without linked ancestors is required');}
 finally{await handle?.close();}
}
async function boundedJson(file,limit){
 const text=await boundedText(file,limit);try{return JSON.parse(text);}catch{throw fault('CLI_JSON','Input must contain valid JSON');}
}
const roadmapCommands=new Set(['capture-preflight','plan','usage','acceptance','checkpoint-record','checkpoint','check-record','job-start','job-status','job-output','job-cancel']);
function requestObject(value,fields,required=fields){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.includes(key))||required.some(key=>!Object.hasOwn(value,key))||value.schemaVersion!==1)throw fault('CLI_REQUEST','Invalid request fields or schema');
 return value;
}
async function provider(file,name){
 let module;try{module=await import(new URL(`../engine/${file}`,import.meta.url));}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')throw fault('CLI_UNSUPPORTED','This recorded runtime does not provide the required module or dependency');throw fault('CLI_PROVIDER','The required provider could not be loaded');}
 if(typeof module[name]!=='function')throw fault('CLI_UNSUPPORTED','This recorded runtime does not provide the required export');
 return module[name];
}
async function dataInstanceId(dataDir){
 await noLinks(dataDir);const canonical=await realpath(dataDir),identity=await lstat(dataDir,{bigint:true});
 return createHash('sha256').update(JSON.stringify([process.platform==='win32'?canonical.toLowerCase():canonical,String(identity.dev),String(identity.ino),String(identity.birthtimeNs)])).digest('hex');
}
async function roadmapCommand(p,owner){
 const o=p.values,context={dataDir:p.dataDir,runId:p.id},session={...context,sessionId:p.sessionId};let result;
 if(p.command==='plan'){
  let scriptPath=o.script;
  if(scriptPath===undefined){
   try{scriptPath=(await resolveWorkflow(p.id,{cwd:p.cwd})).scriptPath;}
   catch(error){if(error.code==='WORKFLOW_PATH')throw fault('CLI_FILE','A readable regular single-link workflow source without linked ancestors is required');throw error;}
  }
  const script=await boundedText(scriptPath,1048576);
  if(Buffer.byteLength(script,'utf8')>1048576)throw fault('CLI_INPUT_LIMIT','Script exceeded its bounded limit');
  result=await(await provider('plan-preview.mjs','previewPlan'))({script});
 }else if(p.command==='capture-preflight'){
  const capturePolicy=o['capture-policy']===undefined?null:workspacePolicy.validateCapturePolicy(await boundedJson(o['capture-policy'],2097152)).policy;
  result=await(await provider('capture-preflight.mjs','preflightCapture'))({source:p.cwd,capturePolicy});
 }else if(p.command==='usage')result=await(await provider('usage-summary.mjs','readUsageSummary'))({...context,generation:integer(o.generation,'generation',{min:1,required:true})});
 else if(p.command==='acceptance'){
  const request=requestObject(await boundedJson(o['request-file'],65536),['schemaVersion','run','planHash','checkpointId','objectiveIds']);
  if(!request.run||Object.keys(request.run).some(key=>!['dataInstanceId','runId','runtimeId'].includes(key))||request.run.runId!==p.id||request.run.runtimeId!==owner.runtime.id||request.run.dataInstanceId!==await dataInstanceId(p.dataDir))throw fault('CLI_IDENTITY','Acceptance request run identity does not match the selected run');
  result=await(await provider('delivery-acceptance.mjs','assembleDeliveryAcceptance'))({dataDir:p.dataDir,sessionId:p.sessionId,request});
 }else if(p.command==='checkpoint-record'){
  const request=requestObject(await boundedJson(o['request-file'],1048576),['schemaVersion','requestId','expectedPreviousId','record']);
  result=await(await provider('stage-checkpoints.mjs','recordStageCheckpoint'))({...session,requestId:request.requestId,expectedPreviousId:request.expectedPreviousId,record:request.record});
 }else if(p.command==='checkpoint'){
  result=o['checkpoint-id']!==undefined?await(await provider('stage-checkpoints.mjs','readStageCheckpoint'))({...context,id:o['checkpoint-id']}):await(await provider('stage-checkpoints.mjs','listStageCheckpoints'))({...context,after:o.after??null,limit:integer(o.limit,'limit',{min:1,max:50})??50});
 }else if(p.command==='check-record')result=await(await provider('stage-checkpoints.mjs','recordVerificationCheck'))({...session,checkpointId:o['checkpoint-id'],checkId:o['check-id'],jobId:o['job-id']});
 else if(p.command==='job-start'){
  const fields=['schemaVersion','requestId','command','cwd','environment','deadlineMs','outputLimitBytes','kind','verification'];
  const request=requestObject(await boundedJson(o['request-file'],2097152),fields,fields.filter(key=>key!=='outputLimitBytes'));
  result=await(await provider('command-jobs/index.mjs','startCommandJob'))({...session,request});
 }else if(p.command==='job-status')result=await(await provider('command-jobs/index.mjs','readCommandJob'))({...session,jobId:o['job-id']});
 else if(p.command==='job-output')result=await(await provider('command-jobs/index.mjs','readCommandJobOutput'))({...session,jobId:o['job-id'],stream:o.stream,after:integer(o.after,'after')??0,limitBytes:integer(o['limit-bytes'],'limit-bytes',{min:1,max:65536})??65536});
 else result=await(await provider('command-jobs/index.mjs','cancelCommandJob'))({...session,jobId:o['job-id'],requestId:o['request-id'],expectedRevision:integer(o.revision,'revision',{required:true})});
 const serialized=JSON.stringify(result);if(typeof serialized!=='string'||Buffer.byteLength(serialized,'utf8')>1048576)throw fault('CLI_OUTPUT_LIMIT','Provider response exceeded its bounded limit');
 console.log(serialized);
 if(p.command==='acceptance')return result.complete===true?0:1;
 if(p.command==='capture-preflight')return result.status==='ready'?0:1;
 if(p.command==='check-record')return result.schemaVersion===1&&result.start==='observed'&&result.outcome==='passed'&&result.exitCode===0&&result.cleanup?.serverExited===true&&result.cleanup?.jobEmpty===true&&result.cleanup?.forced===false?0:1;
 if(p.command==='job-cancel')return result.cancellation?.requestId===o['request-id']&&['recorded','sent','confirmed'].includes(result.cancellation.status)?0:1;
 return 0;
}
function lifecycleRequest(p){
 const o=p.values,kind=o.target??'run';if(!['run','worker'].includes(kind))throw Error('--target requires run or worker');
 if(kind==='run'&&['position','attempt','worker-generation'].some(k=>o[k]!==undefined))throw Error('Worker identity options require --target worker');
 const generation=integer(o.generation,'generation',{min:1,required:true});
 const target=kind==='run'?{kind}:{kind,generation:integer(o['worker-generation'],'worker-generation',{min:1})??generation,position:integer(o.position,'position',{max:999,required:true}),attempt:integer(o.attempt,'attempt',{required:true})};
 return{sessionId:p.sessionId,generation,expectedRevision:integer(o.revision,'revision',{required:true}),target,...(o.reason===undefined?{}:{reason:o.reason})};
}
async function commandAccess(p){
 if(p.values.access==='restricted'&&p.command==='doctor')return undefined;
 const access=p.values.access;
 if(access==='parent'&&!p.values['parent-access'])throw fault('PARENT_ACCESS_REQUIRED','Capture the originating session permission context and supply --parent-access file; use --access restricted for intentionally restricted execution');
 return resolveAccess({access,sessionId:p.sessionId,...(access==='parent'?{parentAccess:await boundedJson(p.values['parent-access'],4096)}:{})});
}
export async function main(tokens=process.argv.slice(2)){
 const p=parseCommand(tokens),o=p.values;if(p.command==='help'||o.help){process.stdout.write(help);return 0;}
 let owner;
 if(p.runCommand){owner=await resolveRun({dataDir:p.dataDir,id:p.id,...(p.mutation||p.sessionRead||p.command==='watch'?{sessionId:p.sessionId}:{})});if(p.command==='dashboard'&&o['current-ui']){const current=await selectRuntime({pluginRoot,dataDir:p.dataDir});if(resolve(current.path)!==resolve(pluginRoot))throw Error('Use the public launcher to select the explicitly installed current UI');}else if(resolve(owner.runtime.path)!==resolve(pluginRoot))throw Error('Use the public launcher to select this run’s original runtime');}
 else if(p.command!=='doctor'){const runtime=await selectRuntime({pluginRoot,dataDir:p.dataDir});if(resolve(runtime.path)!==resolve(pluginRoot))throw Error('Use the public launcher to select the managed runtime');}
 if(roadmapCommands.has(p.command)){
  try{return await roadmapCommand(p,owner);}catch(error){
   if(error.code==='CLI_UNSUPPORTED'){print({status:'unsupported',error:{code:'CLI_UNSUPPORTED',message:'Required provider is unavailable in this runtime; reviewed integration is required'}});return 1;}
   // Provider diagnostics cannot leak command bodies, private paths or native stderr.
   if(!String(error.code??'').startsWith('CLI_'))throw fault('CLI_PROVIDER','The provider refused the request; inspect retained evidence before any further action');
   throw error;
  }
 }
 if(p.command==='mode'){const options={dataDir:p.dataDir,cwd:p.cwd,sessionId:p.sessionId,scope:o.scope??'session'};print(p.id==='status'?await readMode(options):await setMode(p.id,options));return 0;}
 const registry={cwd:p.cwd};
 if(p.command==='workflows'){print(await listWorkflows(registry));return 0;}
 if(p.command==='read'){print(await resolveWorkflow(p.id,registry));return 0;}
 if(p.command==='save'||p.command==='validate'){
  const file=o.script??(p.command==='validate'?p.id:undefined);if(!file)throw Error('A workflow script file is required');const bytes=await readFile(resolve(file)),script=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(p.command==='validate'){const parsed=parseScript(script);print(o.summary?{valid:true,name:parsed.meta.name,scriptBytes:bytes.length,scriptSha256:createHash('sha256').update(bytes).digest('hex'),declaredWorkflows:parsed.meta.workflows?.length??0,declaredSteps:parsed.meta.steps?.length??0}:{valid:true,...parsed});}
  else print(await saveWorkflow(p.id,script,{...registry,command:o.command,overwrite:o.overwrite}));return 0;
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
 const session0Desktop=o['session0-desktop']??'inherit';
 const backendName=o.backend??(process.platform==='win32'?'mxc':'configured');if(!['mxc','configured'].includes(backendName))throw Error('Unknown worker backend');
 if(p.command==='doctor'){
  let backend,stage='runtime';
  // Optional diagnostics cannot replace admission failures or weaken policy.
  const hostContext=await readHostContext().then(doctorHostContext,()=>undefined);
  try{
   const accessPolicy=await commandAccess(p);
   const runtime=await selectRuntime({pluginRoot,dataDir:p.dataDir});if(resolve(runtime.path)!==resolve(pluginRoot))throw Error('Use the public launcher to select the managed runtime');
   const executable=await nativeCodex(pluginRoot);stage='backend';
   backend=await createManagedBackend({executable,cwd:p.cwd,backend:backendName,session0Desktop,...(accessPolicy?{accessPolicy}:{})});stage='cleanup';
   const cleanup=await backend.close();
   const requiresJob=process.platform==='win32'||cleanup?.ownershipScope==='windows-job-members';
   if(cleanup?.serverExited!==true||requiresJob&&cleanup.jobEmpty!==true||cleanup.error){print(doctorFailure({code:'WORKER_DRAIN'},{stage,backend:backendName,admission:backend.admission,cleanup,hostContext}));return 1;}
   print({status:'passed',inferenceRequests:0,node:process.version,codex:executable,backend:backendName,...(backend.accessPolicy?{accessPolicy:backend.accessPolicy}:{}),...(backend.parentCapabilities?{parentCapabilities:{fingerprint:backend.parentCapabilities.fingerprint,coverage:backend.parentCapabilities.coverage}}:{}),...(backend.nativeIntegrations?{nativeIntegrations:backend.nativeIntegrations}:{}),...(backend.desktopCompatibility?{desktopCompatibility:backend.desktopCompatibility}:{}),...(hostContext?{hostContext}:{}),admission:backend.admission,cleanup});return 0;
  }catch(error){print(doctorFailure(error,{stage,backend:backendName,admission:backend?.admission,hostContext}));return 1;}
 }
 if(p.command==='run'){
  if(o.script&&p.id)throw Error('Choose a saved workflow name or --script');if(!o.script&&!p.id)throw Error('Provide a saved workflow name or --script');
  const script=o.script?await readFile(resolve(o.script),'utf8'):(await resolveWorkflow(p.id,registry)).script;parseScript(script);
  const {preflightEvaluatorInput,MAX_EVALUATOR_INPUT_BYTES}=await import('../engine/evaluate.mjs');
  const args=o['args-file']!==undefined?await boundedJson(o['args-file'],MAX_EVALUATOR_INPUT_BYTES):o.args===undefined?null:JSON.parse(o.args),concurrency=integer(o.concurrency,'concurrency',{min:1,max:256})??2,limits=deadlines(o);
  preflightEvaluatorInput(script,args);
  const accessPolicy=await commandAccess(p);
  const defaults={...(o.model?{model:o.model}:{}),...(o.effort?{effort:o.effort}:{}),...(o['max-attempts']!==undefined?{maxAttempts:integer(o['max-attempts'],'max-attempts',{min:1,max:5})}:{}),...(o.writable?(accessPolicy.policy.access==='parent'?{workspace:'isolated'}:{permissions:{sandbox:'workspace-write'}}):{})};
  let capturePolicy;
  const capabilities=o['worker-capabilities']===undefined?null:await readCapabilities(o['worker-capabilities']);
  if(o['capture-policy']!==undefined){
   if(typeof workspacePolicy.validateCapturePolicy!=='function')throw Error('Capture policy validation is unavailable in this retained runtime; coordinator integration is required');
   capturePolicy=workspacePolicy.validateCapturePolicy(await boundedJson(o['capture-policy'],2*1024*1024)).policy;
  }
  const runtime=await selectRuntime({pluginRoot,dataDir:p.dataDir});
  const launch={codex:runtime.codex,cwd:p.cwd,backend:backendName,defaults,accessPolicy,...(session0Desktop==='shared'?{session0Desktop}:{}),...(capturePolicy===undefined?{}:{capturePolicy}),...(capabilities?{workerCapabilities:capabilities.manifest,workerCapabilitiesHash:capabilities.fingerprint}:{})};
  if(o['artifact-scope-file']!==undefined){if(!o.writable)throw Error('Artifact scope requires --writable');launch.artifactScope=validateArtifactScope(await boundedJson(o['artifact-scope-file'],65536));}
  const {preflightRunInput}=await import('../engine/controller.mjs');
  preflightRunInput({script,args,launch,...(capabilities?{workerCapabilitySources:capabilities.toolSources}:{})});
  const binding=await bindRun({dataDir:p.dataDir,runtime,sessionId:p.sessionId}),input={runDir:binding.runDir,sessionId:p.sessionId,script,args,concurrency,...limits,...launch};
  if(parseScript(script).meta.workflows?.length)launch.preparedWorkflowSources=await freezeWorkflowSources({runDir:binding.runDir,cwd:p.cwd,declarations:parseScript(script).meta.workflows});
  if(launch.artifactScope)input.artifactScope=launch.artifactScope;
  if(launch.preparedWorkflowSources)input.preparedWorkflowSources=launch.preparedWorkflowSources;
  try{if(!o.foreground){print(backgroundReceipt(binding.id,await startBackground(input,backgroundOptions(o)),p));return 0;}
   const backend=await createManagedBackend({runDir:binding.runDir,retainSources:true,executable:runtime.codex,cwd:p.cwd,backend:backendName,defaults,session0Desktop,accessPolicy,...(capabilities?{workerCapabilities:capabilities.manifest,workerCapabilitiesHash:capabilities.fingerprint}:{})});const run=await runWorkflow({...input,launch,backend});print({id:binding.id,runDir:binding.runDir,status:run.status,generation:run.generation,coverage:run.coverage,result:run.result,error:run.error,cleanup:run.cleanup});return run.status==='completed'&&run.coverage.complete?0:1;
  }catch(error){error.message=`Run ${binding.id}: ${error.message}`;throw error;}
 }
 const runDir=owner.runDir;
 if(['steps','children'].includes(p.command)){const run=await contextRunRef({runDir,sessionId:owner.sessionId}),generation=integer(o.generation,'generation',{min:1,required:true}),options={runDir,run,generation,after:o.after??null,limit:integer(o.limit,'limit',{min:1,max:100})??50};
  if(p.command==='steps')print(await(await import('../engine/steps.mjs')).readStepsAt(options));else print(await(await import('../engine/composition-store.mjs')).readChildrenAt(options));return 0;}
 if(p.command==='domain-control'||p.command==='domain-control-receipt'){const run=await contextRunRef({runDir,sessionId:p.sessionId}),module=await import('../engine/controls.mjs');if(p.command==='domain-control'){if(!o['request-file'])throw Error('--request-file is required');print(await module.requestDomainControl({dataDir:p.dataDir,run,sessionId:p.sessionId,request:await boundedJson(o['request-file'],16384)}));}else print(await module.readDomainControl({dataDir:p.dataDir,run,sessionId:p.sessionId,requestId:o['request-id']}));return 0;}
 if(p.command==='append'||p.command==='append-receipt'){
  if(!o['request-id'])throw Error('--request-id is required; inspect this receipt after a lost response');
  const request={generation:integer(o.generation,'generation',{min:1,required:true}),requestId:o['request-id']};
  if(p.command==='append-receipt'){print(await readAppendReceipt(runDir,request));return 0;}
  if(!o['tasks-file'])throw Error('--tasks-file is required');
  print(await requestAppend(runDir,{...request,sessionId:p.sessionId,tasks:await readAppendTasks(resolve(o['tasks-file']))}));return 0;
 }
 if(p.command==='watch'){
  if(!o.jsonl)throw Error('watch requires --jsonl');
  const {watchRun}=await import('../engine/watch.mjs');
  const abort=new AbortController(),stop=()=>abort.abort();process.on('SIGINT',stop);process.on('SIGTERM',stop);
  try{return(await watchRun(runDir,{sessionId:p.sessionId,generation:integer(o.generation,'generation',{min:1,required:true}),after:integer(o.after,'after')??0,pollMs:integer(o['poll-ms'],'poll-ms',{min:100,max:10000})??500,idleMs:integer(o['idle-ms'],'idle-ms',{min:1000,max:86400000})??60000,signal:abort.signal})).exitCode;}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
 }
 if(p.command==='status'){print({id:p.id,runDir,...await monitorData(runDir),lifecycle:await readLifecycle(runDir)});return 0;}
 if(p.command==='result'){print(await monitorData(runDir,{kind:'result'}));return 0;}
 if(p.command==='dashboard'){const {binding}=await createSessionServices({dataDir:p.dataDir,sessionId:p.sessionId,pinnedRunId:p.id});print({id:p.id,...await startMonitor(runDir,{binding,...(o['lan-bind']===undefined?{}:{network:{schemaVersion:1,mode:'lan',address:o['lan-bind']}})})});return 0;}
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
  print(backgroundReceipt(p.id,await startBackground({runDir,sessionId:p.sessionId,resume:true,...deadlines(o),...(o['workflow-revisions-file']===undefined?{}:{workflowRevisions:await boundedJson(o['workflow-revisions-file'],65536)}),...(generation!==undefined?{expectedGeneration:generation}:{}),...(o.script?{script:await readFile(resolve(o.script),'utf8')}:{}),...(p.command==='restart-worker'?{restart:{position:integer(o.position,'position',{required:true}),attempt:integer(o.attempt,'attempt',{min:1,required:true}),reconciliation:o.reconcile}}:{})},backgroundOptions(o)),p));return 0;
 }
 print(await requestControl(runDir,{sessionId:p.sessionId,generation,action:p.command,...(['steer','cancel-worker','worker-deadline'].includes(p.command)?{position:integer(o.position,'position',{required:true}),attempt:integer(o.attempt,'attempt',{min:1,required:true}),turnId:o.turn??null,...(o.text!==undefined?{text:o.text}:{}),...(p.command==='worker-deadline'?{deadline:parseDeadlineOptions(o)}:{})}:{})}));return 0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().then(code=>{process.exitCode=code;},error=>{console.error(`Agent Workflow: ${error.message}`);process.exitCode=1;});
