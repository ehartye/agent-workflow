/** @lane merge
 * @subject bin/launch-v2.mjs
 * @subject bin/command.mjs
 * @subject bin/launch.mjs
 * @subject bin/agent-workflow.mjs
 * @subject bin/doctor-diagnostics.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,readFile,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {installRuntime,bindRun} from '../bin/managed-runtime.mjs';
import {parseCommand} from '../bin/arguments.mjs';
import {doctorFailure} from '../bin/doctor-diagnostics.mjs';
import {DatabaseSync} from 'node:sqlite';
const execute=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));

test('public args-file snapshots large UTF8 JSON and rejects invalid input before binding',async t=>{
 const temp=await mkdtemp(join(root,'.args-entry-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const script=join(temp,'script.js'),file=join(temp,'args.json'),hook=join(temp,'hook.mjs'),trace=join(temp,'trace'),runDir=join(temp,'run');
 await writeFile(script,'export const meta={name:"args",description:"snapshot"};return args;');
 const value={text:'漢字🙂e\u0301\r\n'.repeat(10000),nil:null,missing:{},rows:[0,false,'']};
 assert.ok(JSON.stringify(value).length>32767,'fixture exceeds the Windows command-line capacity');
 await writeFile(file,JSON.stringify(value));
 const runtime=`export * from ${JSON.stringify(new URL('../bin/managed-runtime.mjs?args-fixture',import.meta.url).href)};import{appendFileSync}from'node:fs';export const pluginRoot=${JSON.stringify(root)};export async function selectRuntime(){return{path:pluginRoot,codex:'fixture'};}export async function bindRun(){appendFileSync(${JSON.stringify(trace)},'bind\\n');return{id:'args-id',runDir:${JSON.stringify(runDir)}};}`;
 const backend=`import{appendFileSync}from'node:fs';export async function createManagedBackend({accessPolicy}){appendFileSync(${JSON.stringify(trace)},'backend\\n');return{identity:'args-fixture',accessPolicy,execute:async()=>{throw Error('inference forbidden');},close:async()=>({serverExited:true,descendants:'notVerified'})};}`;
 await writeFile(hook,`import{registerHooks}from'node:module';const base=${JSON.stringify(new URL('../',import.meta.url).href)};registerHooks({load(url,context,next){const source=url===new URL('bin/managed-runtime.mjs',base).href?${JSON.stringify(runtime)}:url===new URL('engine/backend.mjs',base).href?${JSON.stringify(backend)}:undefined;return source===undefined?next(url,context):{format:'module',source,shortCircuit:true};}});`);
 const env={...process.env,NODE_OPTIONS:`--import=${pathToFileURL(hook).href}`};delete env.AGENT_WORKFLOW_WORKER;
 const invoke=(flags,{foreground=true}={})=>execute(process.execPath,[join(root,'bin','launch.mjs'),'run','--script',script,'--session','args-owner','--data-dir',join(temp,'data'),'--access','restricted',...(foreground?['--foreground']:[]),...flags],{cwd:temp,env,windowsHide:true,timeout:10000,maxBuffer:4*1024*1024});
 const result=JSON.parse((await invoke(['--args-file',file])).stdout);
 assert.equal(result.status,'completed');assert.deepEqual(result.result,value);
 await writeFile(file,'{"changed":true}');
 const {readRun,runWorkflow}=await import('../engine/controller.mjs');
 const saved=await readRun(runDir);assert.deepEqual(saved.args,value);
 const replay=await runWorkflow({runDir,sessionId:'args-owner',script:saved.script,args:saved.args,resume:true,backend:{identity:'args-fixture',accessPolicy:saved.accessPolicy,execute:async()=>{throw Error('inference forbidden');},close:async()=>({serverExited:true,descendants:'notVerified'})}});
 assert.deepEqual(replay.result,value);assert.equal(replay.version,saved.version);assert.equal(replay.runtimeIdentity,saved.runtimeIdentity);
 await rm(trace);
 for(const [contents,flags,pattern] of [
  ['{}',['--args','{}','--args-file',file],/mutually exclusive/],
  ['{',['--args-file',file],/JSON/],
  [Buffer.from([0xc3,0x28]),['--args-file',file],/UTF|encoded/],
  ['{}',['--args-file',temp],/regular|EISDIR|EPERM/],
  [' '.repeat(2*1024*1024+1),['--args-file',file],/bounded limit/],
  [JSON.stringify('x'.repeat(2*1024*1024-2)),['--args-file',file],/2 MiB/],
 ]){
  await writeFile(file,contents);await assert.rejects(invoke(flags),error=>pattern.test(error.stderr));
  await assert.rejects(readFile(trace),{code:'ENOENT'});
 }
 await writeFile(script,'export const meta={name:"args",description:"snapshot"};/*'+'"'.repeat(1040000)+'*/return args;');
 const combinedArgs=JSON.stringify('x'.repeat(20000));await writeFile(file,combinedArgs);
 for(const flags of [['--args-file',file],['--args',combinedArgs]]){
  await assert.rejects(invoke(flags),error=>/2 MiB/.test(error.stderr));
  await assert.rejects(readFile(trace),{code:'ENOENT'});
 }
 // Metadata is duplicated in the persisted header but absent from the evaluator body.
 await rm(runDir,{recursive:true,force:true});
 await writeFile(script,`export const meta={name:"args",description:${JSON.stringify('m'.repeat(600000))}};return args;`);
 await writeFile(file,JSON.stringify('x'.repeat(1500000)));
 for(const foreground of [true,false]){
  await assert.rejects(invoke(['--args-file',file],{foreground}),error=>/persisted run input.*2 MiB/.test(error.stderr));
  await assert.rejects(readFile(trace),{code:'ENOENT'});
 }
 await writeFile(script,'export const meta={name:"args",description:"snapshot"};return args;');
 await rm(runDir,{recursive:true,force:true});
 const inline=JSON.parse((await invoke(['--args','{"inline":"雪","nil":null}'])).stdout);
 assert.deepEqual(inline.result,{inline:'雪',nil:null});
 for(const command of ['resume','restart-worker'])assert.throws(()=>parseCommand([command,'saved','--session','args-owner','--args-file',file],{}),/not valid/);
});

test('doctor preserves known admission labels without exposing snapshots or native catalog payloads',()=>{
 for(const code of ['ACCESS_POLICY','ACCESS_OVERRIDE','PARENT_ACCESS_REQUIRED','PARENT_ACCESS_INVALID','PARENT_CAPABILITIES','JOB_SIGNATURE','JOB_SIGNATURE_CHECK']){
  const report=doctorFailure({code,message:'PRIVATE_PARENT_SENTINEL',parentAccess:{secret:'PRIVATE_PARENT_SENTINEL'},evidence:{parentCapabilities:{secret:'PRIVATE_PARENT_SENTINEL'}}});
  assert.deepEqual(report.error,{code});assert.equal(report.inferenceRequests,0);
  assert.equal(JSON.stringify(report).includes('PRIVATE_PARENT_SENTINEL'),false);
 }
});

test('new public starts default to parent access while restrictions and snapshot input are explicit',()=>{
 const parent=parseCommand(['run','demo','--session','s','--parent-access','authority.json'],{});
 assert.equal(parent.values.access,'parent');assert.equal(parent.values['parent-access'],'authority.json');
 assert.equal(parseCommand(['run','demo','--session','s','--access','restricted'],{}).values.access,'restricted');
 assert.equal(parseCommand(['doctor'],{}).values.access,'restricted');
 assert.equal(parseCommand(['doctor','--access','parent','--session','s','--parent-access','authority.json'],{}).values.access,'parent');
 assert.throws(()=>parseCommand(['run','demo','--session','s','--access','arbitrary'],{}),/parent or restricted/);
 for(const command of ['resume','restart-worker'])assert.throws(()=>parseCommand([command,'demo','--session','s','--access','parent'],{}),/not valid/);
});

test('Session 0 desktop selection is explicit, enumerated and frozen for saved runs',()=>{
 for(const command of ['doctor','run'])for(const mode of ['inherit','shared']){
  const args=command==='run'?['run','demo','--session','s']:['doctor'];
  assert.equal(parseCommand([...args,'--session0-desktop',mode],{}).values['session0-desktop'],mode);
 }
 assert.throws(()=>parseCommand(['doctor','--session0-desktop','arbitrary'],{}),/inherit or shared/);
 for(const command of ['resume','restart-worker','mode'])assert.throws(()=>parseCommand([command,command==='mode'?'status':'demo','--session','s','--session0-desktop','shared'],{}),/not valid/);
});

const hostContext={node:'v24.21.0',platform:'win32',arch:'x64',osRelease:'10.0.26200',sshEnvironmentPresent:true,windows:{status:'observed',sessionId:0,elevated:true,interactive:false,buildNumber:'26200',revision:9457,displayVersion:'25H2'}};
test('doctor classifies supplied Windows DLL startup status without claiming a DLL, cause or repair',()=>{
 for(const exitCode of [-1073741502,3221225794]){
  const admission=failedAdmission();admission.stages[2].evidence={exitCode,markerObserved:false,outputTruncated:false};
  const report=doctorFailure({code:'ADMISSION_FAILED',admission},{backend:'mxc',hostContext});
  assert.deepEqual(report.diagnosis,{kind:'windows-dll-initialization-failed',ntstatus:'0xC0000142',cause:'notDetermined'});
  assert.deepEqual(report.hostContext,hostContext);
  assert.equal(report.status,'failed');assert.equal(report.inferenceRequests,0);assert.equal(report.error.code,'ADMISSION_FAILED');assert.equal(report.stage,'buffered-command');
  assert.equal(report.admission.stages[2].evidence.exitCode,exitCode);assert.deepEqual(report.cleanup,doctorCleanup);
  assert.doesNotMatch(JSON.stringify(report),/user32|fixed|repair|retry|fallback|password|email/);
 }
});
test('doctor does not infer DLL startup failure from missing facts, another platform, or cancellation',()=>{
 for(const [exitCode,context,name,status] of [[undefined,hostContext,'buffered-command','failed'],[1,hostContext,'buffered-command','failed'],[-1073741502,{...hostContext,platform:'linux'},'buffered-command','failed'],[-1073741502,hostContext,'cancellation','failed'],[-1073741502,hostContext,'buffered-command','passed']]){
  const admission=failedAdmission();admission.stages[2].name=name;admission.stages[2].status=status;if(exitCode!==undefined)admission.stages[2].evidence={exitCode};
  const report=doctorFailure({code:'ADMISSION_FAILED',admission},{backend:'mxc',hostContext:context});
  assert.equal(report.diagnosis,undefined);assert.equal(report.status,'failed');
 }
});
test('doctor host context is bounded and allowlisted without invoking untrusted accessors',()=>{
 const context={...hostContext,secret:doctorSecret,windows:{...hostContext.windows,username:doctorSecret,command:doctorSecret}};
 Object.defineProperty(context,'stack',{get(){throw Error('must not invoke host accessors');}});
 const report=doctorFailure({code:'ADMISSION_FAILED'},{backend:'mxc',hostContext:context});
 assert.deepEqual(report.hostContext,hostContext);assert.doesNotMatch(JSON.stringify(report),/DOCTOR_SECRET_SENTINEL|private@example|username|command|stack/);
 const unavailable=doctorFailure({code:'ADMISSION_FAILED'},{hostContext:{...hostContext,windows:{status:'unavailable',reason:doctorSecret}}});
 assert.deepEqual(unavailable.hostContext.windows,{status:'unavailable'});
 const invalid=doctorFailure({code:'ADMISSION_FAILED'},{hostContext:{...hostContext,windows:{...hostContext.windows,sessionId:-1}}});
 assert.deepEqual(invalid.hostContext.windows,{status:'unavailable'});
});

test('worker capability manifests are a new-run-only public option',()=>{
 const parsed=parseCommand(['run','demo','--session','s','--worker-capabilities','bundle.json'],{});
 assert.equal(parsed.values['worker-capabilities'],'bundle.json');
 for(const command of ['resume','restart-worker','status'])assert.throws(()=>parseCommand([command,'demo','--session','s','--worker-capabilities','bundle.json'],{}),/not valid/);
 assert.throws(()=>parseCommand(['run','demo','--session','s','--worker-capabilities','bundle.json'],{AGENT_WORKFLOW_WORKER:'1'}),/Worker processes cannot/);
});

test('public detached start advertises exact observer arguments without claiming an attachment',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'workflow-watch-entry-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const script=join(temp,'script.js'),hook=join(temp,'hook.mjs'),dataDir=join(temp,'data');await writeFile(script,'export const meta={name:"fixture",description:"receipt"};return 1;');
 const runtime=`export * from ${JSON.stringify(new URL("../bin/managed-runtime.mjs?receipt-fixture",import.meta.url).href)};export const pluginRoot=${JSON.stringify(root)};export function defaultDataDir(){throw Error('explicit data required');}export async function selectRuntime(){return{path:pluginRoot,codex:'fixture'};}export async function bindRun(){return{id:'saved-id',runDir:${JSON.stringify(join(temp,'run'))}};}export function resolveRun(){throw Error('unexpected read');}export function paths(){}export function noLinks(){}export function nativeCodex(){throw Error('inference forbidden');}`;
 const background=`export async function startBackground(input){return{status:'running',generation:3,accessPolicy:input.accessPolicy,defaults:input.defaults,workerTimeoutMs:input.workerTimeoutMs,watch:{required:true,attached:false,sessionId:input.sessionId,generation:3,after:0}};}`;
 await writeFile(hook,`import{registerHooks}from'node:module';const base=${JSON.stringify(new URL('../',import.meta.url).href)};registerHooks({load(url,context,next){const source=url===new URL('bin/managed-runtime.mjs',base).href?${JSON.stringify(runtime)}:url===new URL('engine/background.mjs',base).href?${JSON.stringify(background)}:undefined;return source===undefined?next(url,context):{format:'module',source,shortCircuit:true};}});`);
 const env={...process.env};delete env.NODE_OPTIONS;delete env.AGENT_WORKFLOW_WORKER;
 const invoke=flags=>execute(process.execPath,['--import',pathToFileURL(hook).href,join(root,'bin','command.mjs'),'run','--script',script,'--session','origin','--data-dir',dataDir,...flags],{cwd:temp,env,windowsHide:true,timeout:10000});
 const result=await invoke(['--access','restricted','--writable']);
 const receipt=JSON.parse(result.stdout);assert.equal(receipt.watch.attached,false);assert.equal(receipt.watch.required,true);
 assert.deepEqual(receipt.watch.argv,[process.execPath,join(root,'bin','launch.mjs'),'watch','saved-id','--session','origin','--generation','3','--after','0','--jsonl','--data-dir',dataDir]);
 const parsed=parseCommand(receipt.watch.argv.slice(2),{});assert.equal(parsed.command,'watch');assert.equal(parsed.sessionId,'origin');assert.equal(parsed.values.generation,'3');
 assert.equal(receipt.accessPolicy.policy.access,'restricted');assert.equal(receipt.defaults.permissions.sandbox,'workspace-write');
 await assert.rejects(invoke([]),error=>/parent-access/.test(error.stderr));
 const authority=join(temp,'authority.json');
 await writeFile(authority,JSON.stringify({version:1,sessionId:'origin',provenance:'codex-session-context',filesystem:'unrestricted',networkAccess:true,approvalPolicy:'never'}));
 const parent=JSON.parse((await invoke(['--parent-access',authority,'--writable'])).stdout);
 assert.equal(parent.accessPolicy.policy.access,'parent');assert.equal(parent.accessPolicy.policy.sessionId,'origin');
 assert.equal(parent.defaults.workspace,'isolated');assert.equal(parent.defaults.permissions,undefined);
 assert.equal(JSON.parse((await invoke(['--access','restricted','--worker-timeout-ms','0'])).stdout).workerTimeoutMs,null);
 assert.equal(JSON.parse((await invoke(['--access','restricted','--worker-timeout-ms',String(2**32)])).stdout).workerTimeoutMs,2**32);
});

test('public worker-deadline CLI creates exact durable controls and rejects ambiguous or foreign requests',async t=>{
 const temp=await mkdtemp(join(root,'.deadline-entry-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const hook=join(temp,'hook.mjs'),db=new DatabaseSync(join(temp,'run.sqlite'));
 db.exec('CREATE TABLE header(id INTEGER PRIMARY KEY,value TEXT);CREATE TABLE workers(generation INTEGER,position INTEGER,value TEXT);CREATE TABLE controls(id TEXT PRIMARY KEY,generation INTEGER,value TEXT);');
 db.prepare('INSERT INTO header VALUES(1,?)').run(JSON.stringify({sessionId:'owner',generation:2,status:'running',acceptingControls:true}));
 db.prepare('INSERT INTO workers VALUES(2,0,?)').run(JSON.stringify({position:0,status:'running',attempts:1,deadline:{status:'active',revision:4}}));db.close();
 const runtime=`export * from ${JSON.stringify(new URL('../bin/managed-runtime.mjs?deadline-fixture',import.meta.url).href)};export const pluginRoot=${JSON.stringify(root)};export async function resolveRun(){return{runDir:${JSON.stringify(temp)},runtime:{path:pluginRoot}};}export async function selectRuntime(){throw Error('Must use original runtime');}`;
 await writeFile(hook,`import{registerHooks}from'node:module';registerHooks({load(url,context,next){return url===${JSON.stringify(new URL('../bin/managed-runtime.mjs',import.meta.url).href)}?{format:'module',source:${JSON.stringify(runtime)},shortCircuit:true}:next(url,context);}});`);
 const env={...process.env,NODE_OPTIONS:`--import=${pathToFileURL(hook).href}`};delete env.AGENT_WORKFLOW_WORKER;
 const args=['worker-deadline','saved','--session','owner','--generation','2','--position','0','--attempt','1','--deadline-revision','4','--data-dir',temp];
 const invoke=flags=>execute(process.execPath,[join(root,'bin/launch.mjs'),...args,...flags],{cwd:temp,env,windowsHide:true,timeout:10000});
 for(const [flags,deadline] of [[['--set-ms',String(2**32)],{operation:'set',valueMs:2**32,expectedRevision:4}],[['--extend-ms','10'],{operation:'extend',valueMs:10,expectedRevision:4}],[['--clear'],{operation:'clear',expectedRevision:4}]]){
  const receipt=JSON.parse((await invoke(flags)).stdout);assert.equal(receipt.status,'pending');assert.equal(receipt.turnId,null);assert.equal(receipt.generation,2);assert.equal(receipt.attempt,1);assert.deepEqual(receipt.deadline,deadline);
 }
 const internal=JSON.parse((await execute(process.execPath,[join(root,'engine/cli.mjs'),'--action','worker-deadline','--run',temp,'--session','owner','--generation','2','--position','0','--attempt','1','--deadline-revision','4','--clear'],{cwd:temp,env,windowsHide:true,timeout:10000})).stdout);
 assert.deepEqual(internal.deadline,{operation:'clear',expectedRevision:4});assert.equal(internal.status,'pending');
 for(const flags of [[],['--set-ms','1','--clear'],['--set-ms','0'],['--extend-ms','9007199254740992'],['--clear','--turn','stale']])await assert.rejects(invoke(flags));
 const countDb=new DatabaseSync(join(temp,'run.sqlite'),{readOnly:true});try{assert.equal(countDb.prepare('SELECT count(*) AS n FROM controls').get().n,4);}finally{countDb.close();}
 const parsed=parseCommand([...args,'--clear'],{});assert.equal(parsed.mutation,true);assert.equal(parsed.runCommand,true);
 assert.throws(()=>parseCommand(['worker-deadline','saved','--clear'],{}),/session/);
 assert.throws(()=>parseCommand([...args,'--clear'],{AGENT_WORKFLOW_WORKER:'1'}),/Worker processes/);
});

const doctorSecret='DOCTOR_SECRET_SENTINEL private@example.invalid C:/private/account';
const doctorCleanup={serverExited:true,forced:false,descendants:'notVerified',jobEmpty:true,ownershipScope:'windows-job-members'};
const failedAdmission=()=>({status:'failed',inferenceRequests:0,runnerEquivalence:'notVerified',stages:[
 {name:'authentication',status:'passed',evidence:{mode:'chatgpt',provider:'openai'}},
 {name:'windows-readiness',status:'passed',evidence:{status:'ready',commandProven:false}},
 {name:'buffered-command',status:'failed',error:{code:'COMMAND_FAILED',message:doctorSecret}},
],error:{code:'COMMAND_FAILED',message:doctorSecret},cleanup:doctorCleanup});

// Exercise the actual CLI process with only its managed-runtime/backend seams
// replaced. No installed runtime, native server, dependencies or real run data.
async function invokeDoctor(t,scenario){
 const temp=await mkdtemp(join(root,'.doctor-test-'));
 assert.equal(dirname(temp),resolve(root));
 t.after(async()=>{assert.equal(dirname(temp),resolve(root));await rm(temp,{recursive:true,force:true});});
 const trace=join(temp,'trace.txt'),hook=join(temp,'hook.mjs');
 const backend=`import {appendFileSync} from 'node:fs';
 const scenario=${JSON.stringify(scenario)},trace=${JSON.stringify(trace)};
 export async function createManagedBackend(){
  appendFileSync(trace,'create\\n');
  if(scenario.failure!==false)throw Object.assign(Error(${JSON.stringify(doctorSecret)}),scenario.error??{code:'ADMISSION_FAILED'},${Object.hasOwn(scenario,'admission')?'{admission:scenario.admission}':'{}'});
  return {admission:scenario.admission,async close(){appendFileSync(trace,'close\\n');if(scenario.closeError)throw Object.assign(Error(${JSON.stringify(doctorSecret)}),scenario.closeError);return scenario.cleanup;},execute(){throw Error('Doctor dispatched inference');}};
 }`;
 const runtime=`import {appendFileSync} from 'node:fs';
 const scenario=${JSON.stringify(scenario)},trace=${JSON.stringify(trace)};
 export const pluginRoot=${JSON.stringify(root)};
 export async function selectRuntime(){appendFileSync(trace,'select\\n');if(scenario.phase==='selection')throw Object.assign(Error(${JSON.stringify(doctorSecret)}),scenario.error);return {path:pluginRoot};}
 export async function nativeCodex(){appendFileSync(trace,'native\\n');if(scenario.phase==='native')throw Object.assign(Error(${JSON.stringify(doctorSecret)}),scenario.error);return 'C:/private/native/codex.exe';}
 export function defaultDataDir(){throw Error('Doctor must use its explicit fixture data directory');}
 export function paths(){throw Error('Doctor inspected run records');}
 export function bindRun(){throw Error('Doctor created a run');}
 export function resolveRun(){throw Error('Doctor inspected a run');}
 export function noLinks(){throw Error('Unexpected runtime operation');}`;
 const unused=`function unused(){throw Error('Doctor used an unrelated engine operation');}
 export {unused as readCapabilities,unused as readMode,unused as setMode,unused as parseScript,unused as listWorkflows,unused as resolveWorkflow,unused as saveWorkflow,unused as readRun,unused as runWorkflow,unused as requestControl,unused as readControl,unused as requestAppend,unused as readAppendReceipt,unused as readAppendTasks,unused as startBackground,unused as startMonitor,unused as monitorData,unused as readLifecycle,unused as readLifecycleReceipt,unused as requestLifecycle,unused as planPrune,unused as applyPrune,unused as createSessionServices};
 export const MAX_RUN_TIMEOUT_MS=86400000,MAX_WORKER_TIMEOUT_MS=1800000;`;
 const context=`export async function readHostContext(){${scenario.contextFailure?`throw Error(${JSON.stringify(doctorSecret)});`:`return ${JSON.stringify(scenario.hostContext??hostContext)};`}}`;
 await writeFile(hook,`import {registerHooks} from 'node:module';
 const base=${JSON.stringify(new URL('../',import.meta.url).href)},backend=${JSON.stringify(backend)},runtime=${JSON.stringify(runtime)},unused=${JSON.stringify(unused)},hostContext=${JSON.stringify(context)};
 registerHooks({load(url,context,nextLoad){
  const source=url===new URL('foundation/host-context.mjs',base).href?hostContext:url===new URL('bin/managed-runtime.mjs',base).href?runtime:url===new URL('engine/backend.mjs',base).href?backend:url===new URL('engine/access-policy.mjs',base).href?undefined:url.startsWith(new URL('engine/',base).href)?unused:undefined;
  return source===undefined?nextLoad(url,context):{format:'module',source,shortCircuit:true};
 }});`);
 const env={...process.env};delete env.NODE_OPTIONS;delete env.AGENT_WORKFLOW_WORKER;
 let result;
 try{result={...await execute(process.execPath,['--import',pathToFileURL(hook).href,join(root,'bin','command.mjs'),'doctor','--backend','mxc','--data-dir',join(temp,'data')],{cwd:temp,env,windowsHide:true,timeout:10000,maxBuffer:32*1024}),code:0};}
 catch(error){if(typeof error.code!=='number')throw error;result={code:error.code,stdout:error.stdout,stderr:error.stderr};}
 assert.ok(result.stdout.trim(),'doctor must emit structured diagnostics on stdout');
 assert.equal(result.stderr,'','doctor must not leak generic error messages to stderr');
 return {...result,report:JSON.parse(result.stdout),trace:await readFile(trace,'utf8')};
}

function assertDoctorFailure(result,stage,code){
 assert.equal(result.code,1);assert.equal(result.report.status,'failed');assert.equal(result.report.inferenceRequests,0);
 assert.equal(result.report.stage,stage);assert.deepEqual(result.report.error,{code});
 assert.doesNotMatch(result.stdout,/DOCTOR_SECRET_SENTINEL|private@example|C:[/\\]|stdout|stderr|stack|account|config|command\":|authToken/);
 assert.ok(Buffer.byteLength(result.stdout)<8192,'doctor diagnostics must stay bounded');
}

test('public doctor includes safe host context on pass and classifies supplied DLL failures',async t=>{
 const admission=failedAdmission();admission.stages[2].evidence={exitCode:-1073741502};
 const failure=await invokeDoctor(t,{admission});
 assertDoctorFailure(failure,'buffered-command','ADMISSION_FAILED');
 assert.deepEqual(failure.report.hostContext,hostContext);
 assert.equal(failure.report.diagnosis.ntstatus,'0xC0000142');
 const passed={...admission,status:'passed',stages:admission.stages.slice(0,2)};delete passed.error;
 const success=await invokeDoctor(t,{failure:false,admission:passed,cleanup:doctorCleanup,hostContext:{...hostContext,secret:doctorSecret,windows:{...hostContext.windows,username:doctorSecret}}});
 assert.equal(success.code,0);assert.equal(success.report.status,'passed');assert.equal(success.report.inferenceRequests,0);
 assert.deepEqual(success.report.hostContext,hostContext);assert.equal(success.report.diagnosis,undefined);
 assert.doesNotMatch(success.stdout,/DOCTOR_SECRET_SENTINEL|private@example|username/);
});

test('unavailable doctor host collection preserves the original admission result and cleanup',async t=>{
 const result=await invokeDoctor(t,{admission:failedAdmission(),contextFailure:true});
 assertDoctorFailure(result,'buffered-command','ADMISSION_FAILED');
 assert.equal(result.report.hostContext,undefined);assert.equal(result.report.diagnosis,undefined);
 assert.deepEqual(result.report.cleanup,doctorCleanup);assert.equal(result.trace,'select\nnative\ncreate\n');
});

test('doctor retains failed command admission stages and owned cleanup without inventing command facts',async t=>{
 const result=await invokeDoctor(t,{admission:failedAdmission()});
 assertDoctorFailure(result,'buffered-command','ADMISSION_FAILED');
 assert.deepEqual(result.report.admission,{status:'failed',inferenceRequests:0,runnerEquivalence:'notVerified',stages:[
  {name:'authentication',status:'passed',evidence:{mode:'chatgpt',provider:'openai'}},
  {name:'windows-readiness',status:'passed',evidence:{status:'ready',commandProven:false}},
  {name:'buffered-command',status:'failed',error:{code:'COMMAND_FAILED'}},
 ],error:{code:'COMMAND_FAILED'},cleanup:doctorCleanup});
 assert.deepEqual(result.report.cleanup,doctorCleanup);
 assert.equal(result.trace,'select\nnative\ncreate\n','failed backend admission owns its cleanup; doctor must not retry');
});

test('doctor retains only safe supplied command facts and rejects hostile nested fields',async t=>{
 const admission=failedAdmission();
 const hostile={message:doctorSecret,stdout:doctorSecret,stderr:doctorSecret,stack:doctorSecret,account:{email:doctorSecret},config:{authToken:doctorSecret},command:[doctorSecret],path:doctorSecret};
 Object.assign(admission,hostile);
 for(const stage of admission.stages)Object.assign(stage,hostile);
 Object.assign(admission.stages[0].evidence,hostile);
 admission.stages[2].evidence={exitCode:-1073741502,markerObserved:false,outputTruncated:true,...hostile};
 admission.cleanup={...doctorCleanup,...hostile,nativeTerminals:hostile,error:{code:'RPC_ERROR',...hostile}};
 const result=await invokeDoctor(t,{admission,error:{code:'ADMISSION_FAILED',...hostile}});
 assertDoctorFailure(result,'buffered-command','ADMISSION_FAILED');
 assert.deepEqual(result.report.admission.stages[2].evidence,{exitCode:-1073741502,markerObserved:false,outputTruncated:true});
 assert.deepEqual(result.report.cleanup,{...doctorCleanup,error:{code:'RPC_ERROR'}});
});

test('doctor handles missing and malformed admission without accepting untrusted codes or cleanup claims',async t=>{
 for(const admission of [undefined,null,doctorSecret,[],{status:'passed',inferenceRequests:99,stages:[null,{name:doctorSecret,status:'passed'},{name:'authentication',status:doctorSecret,error:{code:doctorSecret}}],cleanup:{serverExited:'true',forced:1,descendants:'verified',jobEmpty:'true',ownershipScope:doctorSecret}}]){
  await t.test(String(admission===undefined?'missing':typeof admission),async t=>{
   const result=await invokeDoctor(t,{...(admission===undefined?{}:{admission}),error:{code:'DOCTOR_SECRET_SENTINEL',message:doctorSecret}});
   assertDoctorFailure(result,'backend','CHECK_FAILED');
   assert.equal(result.report.cleanup.serverExited,null);assert.equal(result.report.cleanup.descendants,'notVerified');
   assert.ok(!result.report.admission||result.report.admission.status!=='passed');
  });
 }
});

test('doctor bounds stage summaries and excludes oversized or unknown codes and evidence',async t=>{
 const admission=failedAdmission();
 admission.stages=Array.from({length:1000},()=>({name:'authentication',status:'passed',evidence:{mode:doctorSecret}}));
 admission.stages[0]={name:'buffered-command',status:'failed',error:{code:'A'.repeat(100000)},evidence:{exitCode:1e100,marker:doctorSecret,markerObserved:'false',outputTruncated:1}};
 const result=await invokeDoctor(t,{admission});
 assertDoctorFailure(result,'buffered-command','ADMISSION_FAILED');
 assert.equal(result.report.admission.stagesTruncated,true);assert.ok(result.report.admission.stages.length<=6);
 assert.deepEqual(result.report.admission.stages[0].error,{code:'CHECK_FAILED'});
 assert.ok(!result.report.admission.stages[0].evidence);
});

test('doctor reports runtime and connection failures with safe cleanup and no admission retry',async t=>{
 for(const phase of ['selection','native','backend'])await t.test(phase,async t=>{
  const result=await invokeDoctor(t,{phase,error:{code:'SERVER_START',message:doctorSecret,cleanup:{serverExited:false,forced:true,descendants:'notVerified'}}});
  assertDoctorFailure(result,phase==='backend'?'backend':'runtime','SERVER_START');
  assert.equal(result.report.cleanup.serverExited,false);
  assert.equal(result.trace,phase==='selection'?'select\n':phase==='native'?'select\nnative\n':'select\nnative\ncreate\n');
 });
});

test('doctor retains passing admission when owned cleanup fails or throws and never retries close',async t=>{
 for(const [name,closeError] of [['unconfirmed',undefined],['throws',{code:'REQUEST_TIMEOUT',message:doctorSecret,cleanup:{serverExited:false,descendants:'notVerified'}}],['throws without receipt',{code:'REQUEST_TIMEOUT',message:doctorSecret}]])await t.test(name,async t=>{
  const admission={...failedAdmission(),status:'passed',stages:failedAdmission().stages.slice(0,2)};delete admission.error;
  const result=await invokeDoctor(t,{failure:false,admission,cleanup:{serverExited:false,forced:true,descendants:'notVerified'},closeError});
  assertDoctorFailure(result,'cleanup',closeError?'REQUEST_TIMEOUT':'WORKER_DRAIN');
  assert.equal(result.report.admission.status,'passed');assert.equal(result.report.cleanup.serverExited,closeError&&!Object.hasOwn(closeError,'cleanup')?null:false);
  assert.equal(result.trace,'select\nnative\ncreate\nclose\n');
 });
});

test('doctor treats malformed owned cleanup as unknown and fails closed',async t=>{
 const admission={...failedAdmission(),status:'passed',stages:failedAdmission().stages.slice(0,2)};delete admission.error;
 const result=await invokeDoctor(t,{failure:false,admission,cleanup:{serverExited:'true',jobEmpty:'true',descendants:'verified',path:doctorSecret}});
 assertDoctorFailure(result,'cleanup','WORKER_DRAIN');
 assert.deepEqual(result.report.cleanup,{serverExited:null,descendants:'notVerified'});
 assert.equal(result.trace,'select\nnative\ncreate\nclose\n');
});

test('doctor diagnostics never invoke nested accessors or serializers',async()=>{
 const {doctorFailure}=await import('../bin/doctor-diagnostics.mjs');
 let inspected=0;
 const poison={get message(){inspected++;throw Error(doctorSecret);},toJSON(){inspected++;throw Error(doctorSecret);}};
 const admission=failedAdmission();
 admission.stages[2].evidence=Object.create(poison,{exitCode:{get(){inspected++;throw Error(doctorSecret);}},markerObserved:{value:false}});
 admission.cleanup={...doctorCleanup,toJSON:poison.toJSON};admission.extra=admission;
 const error=Object.assign(Error(doctorSecret),{code:'ADMISSION_FAILED',admission,toJSON:poison.toJSON});
 error.evidence={startup:{stage:'version',command:Object.create(poison,{exitCode:{get(){inspected++;throw Error(doctorSecret);}},killed:{value:true},signal:{value:doctorSecret},stdoutBytes:{value:Infinity},stderrBytes:{value:4},stdout:{value:doctorSecret}})}};
 const report=doctorFailure(error,{backend:'mxc'}),stdout=JSON.stringify(report);
 assert.equal(inspected,0);assert.doesNotMatch(stdout,/DOCTOR_SECRET_SENTINEL|private@example/);
 assert.deepEqual(report.admission.stages[2].evidence,{markerObserved:false});
 assert.deepEqual(report.construction,{stage:'version',command:{exitCode:null,killed:true,signal:'unknown',stdoutBytes:null,stderrBytes:4}});
 assert.equal(report.stage,'buffered-command','precise admission evidence wins over inconsistent construction metadata');
});

test('doctor preserves successful zero-inference output and owned cleanup',async t=>{
 const admission={...failedAdmission(),status:'passed',stages:failedAdmission().stages.slice(0,2)};delete admission.error;
 const result=await invokeDoctor(t,{failure:false,admission,cleanup:doctorCleanup});
 assert.equal(result.code,0);
 assert.deepEqual(result.report,{status:'passed',inferenceRequests:0,node:process.version,codex:'C:/private/native/codex.exe',backend:'mxc',hostContext,admission,cleanup:doctorCleanup});
 assert.match(result.trace,/^select\nnative\ncreate\nclose\n(?:close\n)?$/);
});

test('public doctor launchers sanitize missing and malformed runtime selection without starting work',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'workflow-doctor-public-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const plugin=join(temp,'plugin'),data=join(temp,'DOCTOR_SECRET_SENTINEL-data');await mkdir(join(plugin,'bin'),{recursive:true});
 for(const name of ['launch.mjs','launch-v2.mjs','agent-workflow.mjs','arguments.mjs','managed-runtime.mjs','doctor-diagnostics.mjs'])await cp(join(root,'bin',name),join(plugin,'bin',name));
 const env={...process.env};delete env.NODE_OPTIONS;delete env.AGENT_WORKFLOW_WORKER;
 for(const mode of ['missing','malformed']){
  if(mode==='malformed'){await mkdir(data);await writeFile(join(data,'runtime-v2.json'),'DOCTOR_SECRET_SENTINEL private@example.invalid');}
  for(const entry of ['launch.mjs','agent-workflow.mjs','launch-v2.mjs']){
   const result=await execute(process.execPath,[join(plugin,'bin',entry),'doctor','--data-dir',data],{env,windowsHide:true,timeout:10000}).then(()=>null,error=>error);
   assert.equal(result?.code,1);assert.equal(result.stderr,'');
   const report=JSON.parse(result.stdout);assert.equal(report.status,'failed');assert.equal(report.stage,'runtime');assert.equal(report.inferenceRequests,0);
   assert.equal(report.cleanup.serverExited,null);assert.equal(report.admission,undefined);
   assert.doesNotMatch(result.stdout,/DOCTOR_SECRET_SENTINEL|private@example|stack|argv/);
  }
 }
});

test('doctor fails closed when an owned Windows job lacks positive empty proof',async t=>{
 for(const cleanup of [{serverExited:true,jobEmpty:false,ownershipScope:'windows-job-members'},
   {serverExited:true,ownershipScope:'windows-job-members'},
   {serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members',error:{code:'WORKER_DRAIN'}}]){
  const result=await invokeDoctor(t,{failure:false,admission:{status:'passed',stages:[]},cleanup});
  assertDoctorFailure(result,'cleanup','WORKER_DRAIN');assert.equal(result.trace,'select\nnative\ncreate\nclose\n');
 }
});

test('doctor exposes bounded startup ownership boundaries separately from the primary failure',async t=>{
 const cleanup={serverExited:false,jobEmpty:false,descendants:'notVerified',startup:[
  {stage:'discovery',cleanup:{serverExited:false,jobEmpty:false,error:{code:'REQUEST_TIMEOUT',message:doctorSecret},account:doctorSecret}},
 ]};
 const result=await invokeDoctor(t,{error:{code:'DISCOVERY_CLEANUP',cleanup}});
 assertDoctorFailure(result,'discovery','DISCOVERY_CLEANUP');
 assert.deepEqual(result.report.startup,[{stage:'discovery',cleanup:{serverExited:false,jobEmpty:false,descendants:'notVerified',error:{code:'REQUEST_TIMEOUT'}}}]);
 assert.deepEqual(result.report.cleanup,{serverExited:false,jobEmpty:false,descendants:'notVerified'});
});

test('public CLI accepts explicit run and worker deadlines for starts and resumes',()=>{
 for(const command of ['run','resume']){
  const parsed=parseCommand([command,'demo','--session','s','--run-timeout-ms','7200000','--worker-timeout-ms','1800000']);
  assert.equal(parsed.values['run-timeout-ms'],'7200000');assert.equal(parsed.values['worker-timeout-ms'],'1800000');
 }
 assert.throws(()=>parseCommand(['status','demo','--run-timeout-ms','7200000']),/not valid/);
});
test('public launcher selects the run-pinned runtime after upgrade and refuses foreign-session control',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'workflow-entry-'));t.after(()=>rm(temp,{recursive:true,force:true}));const pluginRoot=join(temp,'plugin'),dataDir=join(temp,'data');await mkdir(pluginRoot);
 for(const name of ['bin','engine','foundation','workflows','hooks','skills'])await mkdir(join(pluginRoot,name));
 for(const name of ['managed-runtime.mjs','launch-v2.mjs','arguments.mjs','doctor-diagnostics.mjs'])await cp(join(root,'bin',name),join(pluginRoot,'bin',name));
 await writeFile(join(pluginRoot,'bin','command.mjs'),'import {parseCommand} from "./arguments.mjs";parseCommand();console.log(JSON.stringify({marker:"first",root:import.meta.url,args:process.argv.slice(2)}));');
 await writeFile(join(pluginRoot,'package.json'),JSON.stringify({version:'0.2.0',dependencies:{'@openai/codex':'0.162.1'}}));await writeFile(join(pluginRoot,'package-lock.json'),'{}');await writeFile(join(pluginRoot,'LICENSE'),'MIT');
 const npmCli=join(temp,'npm.mjs');await writeFile(npmCli,`import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';const root=join(process.cwd(),'node_modules/@openai');await mkdir(join(root,'codex'),{recursive:true});await writeFile(join(root,'codex/package.json'),JSON.stringify({version:'0.162.1'}));const target=join(root,'codex-win32-x64');await mkdir(join(target,'vendor/x86_64-pc-windows-msvc/bin'),{recursive:true});await writeFile(join(target,'package.json'),JSON.stringify({version:'0.162.1-win32-x64'}));await writeFile(join(target,'vendor/x86_64-pc-windows-msvc/bin/codex.exe'),'fixture');`);
 const first=await installRuntime({pluginRoot,dataDir,npmCli});const bound=await bindRun({dataDir,runtime:first,sessionId:'origin'});
 await writeFile(join(pluginRoot,'bin','command.mjs'),'import {parseCommand} from "./arguments.mjs";parseCommand();console.log(JSON.stringify({marker:"second"}));');await installRuntime({pluginRoot,dataDir,npmCli});
 const invoke=(args,env={})=>execute(process.execPath,[join(pluginRoot,'bin','launch-v2.mjs'),...args,'--data-dir',dataDir],{env:{...process.env,...env},windowsHide:true,timeout:10000});
 assert.equal(JSON.parse((await invoke(['watch',bound.id,'--session','origin','--generation','1','--jsonl'])).stdout).marker,'first');
 await assert.rejects(invoke(['watch',bound.id,'--generation','1','--jsonl'],{CODEX_THREAD_ID:''}),e=>/session/i.test(e.stderr));
 assert.equal(JSON.parse((await invoke(['status',bound.id])).stdout).marker,'first');assert.equal(JSON.parse((await invoke(['workflows'])).stdout).marker,'second');
 await assert.rejects(invoke(['resume',bound.id,'--session','other']),e=>/session/i.test(e.stderr));
 assert.equal(JSON.parse((await invoke(['resume',bound.id],{CODEX_THREAD_ID:'origin'})).stdout).marker,'first');
 await assert.rejects(invoke(['resume',bound.id],{CODEX_THREAD_ID:''}),e=>/session/i.test(e.stderr));
 await assert.rejects(invoke(['run','demo','--session','origin'],{AGENT_WORKFLOW_WORKER:'1'}),e=>/recursive|worker/i.test(e.stderr));
 await assert.rejects(invoke(['status','../runs']),e=>/identifier/i.test(e.stderr));
 await assert.rejects(invoke(['mcp']),e=>/unknown command/i.test(e.stderr));
 await assert.rejects(invoke(['run','demo','--codex','unowned']),e=>/unknown option/i.test(e.stderr));
 await assert.rejects(invoke(['dashboard',bound.id],{CODEX_THREAD_ID:'other'}),e=>/session/i.test(e.stderr));
 assert.equal(JSON.parse((await invoke(['--data-dir',dataDir,'dashboard'],{CODEX_THREAD_ID:'origin'})).stdout).marker,'first');
 assert.equal(JSON.parse((await invoke(['dashboard',bound.id,'--current-ui'],{CODEX_THREAD_ID:'origin'})).stdout).marker,'second');
 await assert.rejects(invoke(['dashboard',bound.id,'--current-ui'],{CODEX_THREAD_ID:'other'}),e=>/session/i.test(e.stderr));
 assert.match((await invoke(['help'])).stdout,/dashboard/);
});
