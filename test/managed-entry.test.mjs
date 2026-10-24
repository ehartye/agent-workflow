/** @lane merge
 * @subject bin/launch-v2.mjs
 * @subject bin/command.mjs
 * @subject bin/launch.mjs
 * @subject bin/agent-workflow.mjs
 * @subject bin/doctor-diagnostics.mjs
 * @subject engine/cli.mjs
 * @subject engine/capture-preflight.mjs
 * @subject engine/plan-preview.mjs
 * @subject engine/usage-summary.mjs
 * @subject engine/delivery-acceptance.mjs
 * @subject engine/stage-checkpoints.mjs
 * @subject engine/command-jobs/index.mjs
 * @subject docs/api.md
 * @subject docs/roadmap-command-contracts.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,readFile,rm,link,readdir,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {installRuntime,bindRun} from '../bin/managed-runtime.mjs';
import {parseCommand,help} from '../bin/arguments.mjs';
import {doctorFailure} from '../bin/doctor-diagnostics.mjs';
import {DatabaseSync} from 'node:sqlite';
const nativeExecute=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
// Coordinator-authorized trusted source fixture. Only the isolated VM realm
// sees the inert process facade; every actual subprocess retains the marker.
const realmBootstrap=String.raw`
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
import {readFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
const entry=process.argv[1],input=JSON.parse(process.argv[2]),cache=new Map();
const thisBootstrap=process.execArgv[process.execArgv.indexOf('-e')+1];
const inertEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='AGENT_WORKFLOW_WORKER'));
if(input.workerGuard)inertEnv.AGENT_WORKFLOW_WORKER='1';
const facade=Object.freeze({env:Object.freeze(inertEnv),argv:Object.freeze([process.execPath,entry,...input.argv]),execPath:process.execPath,version:process.version,versions:Object.freeze({...process.versions}),platform:process.platform,arch:process.arch,cwd:()=>process.cwd(),stdout:process.stdout,stderr:process.stderr,once:process.once.bind(process),removeListener:process.removeListener.bind(process),get exitCode(){return process.exitCode;},set exitCode(value){process.exitCode=value;}});
const realm=createContext({Buffer,TextDecoder,URL,URLSearchParams,console,setTimeout,clearTimeout,setInterval,clearInterval,AbortController,AbortSignal,performance,process:facade});
async function load(url,force=false){
 if(cache.has(url))return cache.get(url);
 const owned=/\/(?:bin\/(?:arguments|command|launch|launch-v2)|engine\/cli)\.mjs$/.test(new URL(url).pathname);
 if(!force&&!owned){let ns=await import(url);if(url==='node:util'){const original=ns.parseArgs;ns={...ns,parseArgs:options=>original({...options,args:options?.args??facade.argv.slice(2)})};}else if(url==='node:child_process'){const original=ns.spawn;ns={...ns,spawn:(exe,args,options)=>original(exe,exe===process.execPath?['--experimental-vm-modules','--disable-warning=ExperimentalWarning','--input-type=module','-e',thisBootstrap,args[0],JSON.stringify({argv:args.slice(1),workerGuard:input.workerGuard})]:args,{...options,env:{...options?.env,...(process.env.AGENT_WORKFLOW_WORKER===undefined?{}:{AGENT_WORKFLOW_WORKER:process.env.AGENT_WORKFLOW_WORKER})}})};}else if(url.startsWith('file:')){const data=(x,seen=new Set())=>{if(x===null||['string','boolean','number'].includes(typeof x))return true;if(!x||typeof x!=='object'||seen.has(x))return false;seen.add(x);return Reflect.ownKeys(x).every(k=>{const d=Object.getOwnPropertyDescriptor(x,k);return typeof k==='string'&&Object.hasOwn(d,'value')&&data(d.value,seen);});};ns=Object.fromEntries(Object.entries(ns).map(([key,value])=>[key,typeof value==='function'&&!/^[A-Z]/.test(key)?(...args)=>value(...args.map(a=>data(a)?JSON.parse(JSON.stringify(a)):a)):value]));}const m=new SyntheticModule(Object.keys(ns),function(){for(const key of Object.keys(ns))this.setExport(key,ns[key]);},{context:realm,identifier:url});cache.set(url,m);return m;}
 const m=new SourceTextModule(await readFile(fileURLToPath(url),'utf8'),{context:realm,identifier:url,initializeImportMeta(meta){meta.url=url;meta.dirname=dirname(fileURLToPath(url));},importModuleDynamically:async(s)=>{const dep=await load(s.startsWith('.')?new URL(s,url).href:s);if(dep.status==='unlinked')await dep.link(linker(dep.identifier));if(dep.status==='linked')await dep.evaluate();return dep;}});cache.set(url,m);await m.link(linker(url));return m;
}
const linker=base=>async s=>load(s.startsWith('.')?new URL(s,base).href:s);
const m=await load(pathToFileURL(entry).href,true);await m.evaluate();
if(input.operation){const result=await m.namespace[input.operation](input.input);console.log(JSON.stringify(result));}
`;
function execute(executable,argv,options={}){
 const {fixtureRealm=false,fixtureWorkerGuard=false,...nativeOptions}=options;
 // Host verification must exercise the actual CLI and its native Error realm.
 // Only guarded worker fixtures need the authorized isolated process facade.
 if(!fixtureRealm||process.env.AGENT_WORKFLOW_WORKER!=='1')return nativeExecute(executable,argv,nativeOptions);
 const env={...nativeOptions.env,...(process.env.AGENT_WORKFLOW_WORKER===undefined?{}:{AGENT_WORKFLOW_WORKER:process.env.AGENT_WORKFLOW_WORKER})};
 const flags=[];while(argv[0]==='--import'){flags.push(...argv.slice(0,2));argv=argv.slice(2);}
 return nativeExecute(executable,[...flags,'--experimental-vm-modules','--disable-warning=ExperimentalWarning','--input-type=module','-e',realmBootstrap,argv[0],JSON.stringify({argv:argv.slice(1),workerGuard:fixtureWorkerGuard})],{...nativeOptions,env});
}
async function inertRuntime(operation,input){
 if(process.env.AGENT_WORKFLOW_WORKER!=='1')return {installRuntime,bindRun}[operation](input);
 return JSON.parse((await nativeExecute(process.execPath,['--experimental-vm-modules','--disable-warning=ExperimentalWarning','--input-type=module','-e',realmBootstrap,join(root,'bin/managed-runtime.mjs'),JSON.stringify({argv:[],operation,input})],{env:{...process.env},windowsHide:true})).stdout);
}

test('validate summary hashes exact source bytes without printing body and retains full validation',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'summary-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const file=join(temp,'workflow.mjs'),script='export const meta={name:"Résumé",description:"private description",steps:[]};\r\nreturn "PRIVATE PROMPT";\r\n';
 await writeFile(file,script);
 const hook=join(temp,'select.mjs'),runtime=`export * from ${JSON.stringify(new URL('../bin/managed-runtime.mjs?summary-fixture',import.meta.url).href)};export const pluginRoot=${JSON.stringify(root)};export async function selectRuntime(){return{path:pluginRoot};}`;
 await writeFile(hook,`import{registerHooks}from'node:module';registerHooks({load(url,context,next){return url===${JSON.stringify(new URL('../bin/managed-runtime.mjs',import.meta.url).href)}?{format:'module',source:${JSON.stringify(runtime)},shortCircuit:true}:next(url,context);}});`);
 const invoke=argv=>execute(process.execPath,['--import',pathToFileURL(hook).href,join(root,'bin/command.mjs'),...argv],{env:{...process.env},windowsHide:true});
 const {stdout}=await invoke(['validate',file,'--summary']);
 assert.deepEqual(JSON.parse(stdout),{valid:true,name:'Résumé',scriptBytes:Buffer.byteLength(script),scriptSha256:createHash('sha256').update(script).digest('hex'),declaredWorkflows:0,declaredSteps:0});
 assert.ok(!stdout.includes('PRIVATE')&&!stdout.includes('description'));
 assert.equal(JSON.parse((await invoke(['validate',file])).stdout).body,'\r\nreturn "PRIVATE PROMPT";\r\n');
 assert.throws(()=>parseCommand(['validate',file,'--summary','--summary'],{}),/Duplicate/);
 assert.throws(()=>parseCommand(['read','test','--summary'],{}),/not valid/);
 const {help}=await import('../bin/arguments.mjs');
 assert.match(help,/\nsetup\ndoctor \[--cwd path\]/);
 assert.equal(parseCommand(['setup'],{}).command,'setup');
 assert.throws(()=>parseCommand(['setup','--cwd',temp],{}),/not valid for setup/);
 await writeFile(file,'export const meta={name:"bad",description:"bad",steps:[{id:"x",label:"X",dependsOn:["missing"]}]};return 1;');
 await assert.rejects(invoke(['validate',file,'--summary']),error=>error.code===1);
});

test('roadmap command allowlists preserve routing, sessions and worker mutation guards',()=>{
 const commands=[
  ['capture-preflight',[],false],['plan',['--script','inert.js'],false],
  ['usage',['saved','--generation','1'],true],['acceptance',['saved','--session','origin','--request-file','request.json'],true],
  ['checkpoint-record',['saved','--session','origin','--request-file','request.json'],true],['checkpoint',['saved'],true],
  ['check-record',['saved','--session','origin','--checkpoint-id','c','--check-id','check','--job-id','j'],true],
  ['job-start',['saved','--session','origin','--request-file','request.json'],true],
  ['job-status',['saved','--session','origin','--job-id','j'],true],
  ['job-output',['saved','--session','origin','--job-id','j','--stream','stderr'],true],
  ['job-cancel',['saved','--session','origin','--job-id','j','--request-id','r','--revision','0'],true],
 ];
 for(const [command,flags,runBound] of commands){
  const parsed=parseCommand([command,...flags],{});assert.equal(parsed.runCommand,runBound,command);
  for(const option of ['codex','access','parent-access','backend','current-ui'])assert.throws(()=>parseCommand([command,...flags,`--${option}`,'override'],{}),/not valid|Unknown option/);
  const mutation=['checkpoint-record','check-record','job-start','job-cancel'].includes(command);
  assert.equal(parsed.mutation,mutation,command);
  if(mutation)assert.throws(()=>parseCommand([command,...flags],{AGENT_WORKFLOW_WORKER:'1'}),/Worker/);
  else assert.equal(parseCommand([command,...flags],{AGENT_WORKFLOW_WORKER:'1'}).command,command);
 }
 for(const command of ['acceptance','job-start','job-status','job-output','job-cancel','checkpoint-record','check-record']){
  const flags=commands.find(row=>row[0]===command)[1].filter((_,i,all)=>all[i-1]!=='--session'&&all[i]!=='--session');
  assert.throws(()=>parseCommand([command,...flags],{}),/session/);
 }
 for(const value of ['null','-1','1.5','9007199254740992','1e2','01'])assert.throws(()=>parseCommand(['usage','saved','--generation',value],{}),/generation/);
 assert.throws(()=>parseCommand(['usage','saved'],{}),/generation/);
 assert.throws(()=>parseCommand(['plan','saved','--script','inert.js'],{}),/Choose|exclusive/);
 assert.throws(()=>parseCommand(['plan'],{}),/script|name/);
 assert.throws(()=>parseCommand(['checkpoint','saved','--checkpoint-id','c','--limit','2'],{}),/exclusive|Choose/);
 assert.throws(()=>parseCommand(['job-output','saved','--session','origin','--job-id','j','--stream','all'],{}),/stream/);
 assert.throws(()=>parseCommand(['job-output','saved','--session','origin','--job-id','j','--stream','stdout','--limit-bytes','65537'],{}),/limit-bytes/);
 assert.throws(()=>parseCommand(['usage','saved','--generation','1','--generation','2'],{}),/Duplicate/);
});

test('roadmap bounded inputs fail before missing provider import and inspect refuses execution flags',async t=>{
 const temp=await mkdtemp(join(root,'.args-entry-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const file=join(temp,'.agents','workflows','inert.mjs'),hook=join(temp,'hook.mjs');await mkdir(dirname(file),{recursive:true});
 const runtime=`export * from ${JSON.stringify(new URL('../bin/managed-runtime.mjs?roadmap-fixture',import.meta.url).href)};export const pluginRoot=${JSON.stringify(root)};export async function selectRuntime(){return{path:pluginRoot};}export async function resolveRun(options){if(options.sessionId!=='origin')throw Error('Missing exact session');return{id:options.id,runDir:${JSON.stringify(temp)},runtime:{id:'fixture-runtime',path:pluginRoot}};}`;
 const previewUrl=new URL('../engine/plan-preview.mjs',import.meta.url).href;
 const jobsUrl=new URL('../engine/command-jobs/index.mjs',import.meta.url).href;
 await writeFile(hook,`import{registerHooks}from'node:module';registerHooks({resolve(specifier,context,next){if([${JSON.stringify(previewUrl)},${JSON.stringify(jobsUrl)}].includes(new URL(specifier,context.parentURL).href))return{url:'data:text/javascript,export{}',shortCircuit:true};return next(specifier,context);},load(url,context,next){return url===${JSON.stringify(new URL('../bin/managed-runtime.mjs',import.meta.url).href)}?{format:'module',source:${JSON.stringify(runtime)},shortCircuit:true}:next(url,context);}});`);
 const env={...process.env,NODE_OPTIONS:`--import=${pathToFileURL(hook).href}`};delete env.CODEX_THREAD_ID;
 const invoke=(args,entry='bin/command.mjs')=>execute(process.execPath,[join(root,entry),...args],{fixtureRealm:true,cwd:temp,env,windowsHide:true,timeout:10000});
 for(const [contents,path,pattern] of [[Buffer.from([0xc3,0x28]),file,/UTF|encoded/],['x'.repeat(1048577),file,/bounded limit/],['text',temp,/regular/]]){
  await writeFile(file,contents);await assert.rejects(invoke(['plan','--script',path]),e=>pattern.test(e.stderr));
 }
 for(const [command,limit] of [['acceptance',65536],['checkpoint-record',1048576],['job-start',2097152]]){
  for(const [contents,pattern] of [[Buffer.from([0xc3,0x28]),/UTF|encoded/],['{',/JSON/],[' '.repeat(limit+1),/bounded limit/],['{"schemaVersion":1,"passed":true}',/request|fields|schema/]]){
   await writeFile(file,contents);await assert.rejects(invoke([command,'saved','--session','origin','--request-file',file]),e=>pattern.test(e.stderr));
  }
 }
 await writeFile(file,JSON.stringify({schemaVersion:1,run:{runId:'other',dataInstanceId:'x',runtimeId:'fixture-runtime'},planHash:'a'.repeat(64),checkpointId:'c',objectiveIds:[]}));
 await assert.rejects(invoke(['acceptance','saved','--session','origin','--request-file',file]),e=>/identity|run ID/.test(e.stderr));
 for(const extra of [['--run',temp],['--codex','foreign'],['--action','stop'],['--resume'],['--foreground'],['--args','{}'],['--session','origin']]){
  await assert.rejects(invoke(['--inspect','plan','--script',file,...extra],'engine/cli.mjs'),e=>/not valid|Unknown option|inspect/.test(e.stderr+e.stdout));
 }
 await writeFile(file,'export const meta={name:"inert",description:"not executed"};throw Error("EXECUTED");');
 // Missing provider is an honest unsupported result, never a fabricated pass.
 const unsupported=await invoke(['--inspect','plan','--script',file],'engine/cli.mjs').then(()=>assert.fail('Missing provider cannot pass'),e=>e);
 assert.equal(JSON.parse(unsupported.stdout).status,'unsupported');assert.doesNotMatch(unsupported.stderr+unsupported.stdout,/EXECUTED/);
 await t.test('job request raw-byte boundary admits 2 MiB and refuses one more before provider import',async()=>{
  const request=JSON.stringify({schemaVersion:1,requestId:'558e26de-e014-4fc1-9008-049d3c4706c1',command:[process.execPath,'--version'],cwd:temp,environment:{mode:'inherit'},deadlineMs:1000,kind:'normal',verification:null});
  for(const bytes of [131073,2097152]){
   await writeFile(file,request+' '.repeat(bytes-Buffer.byteLength(request)));
   const result=await invoke(['job-start','saved','--session','origin','--request-file',file]).then(()=>assert.fail('Absent provider cannot pass'),e=>e);
   assert.equal(result.code,1);assert.doesNotMatch(result.stderr,/bounded limit/);assert.match(result.stdout,/"status": "unsupported"/);
  }
  await writeFile(file,request+' '.repeat(2097153-Buffer.byteLength(request)));
  await assert.rejects(invoke(['job-start','saved','--session','origin','--request-file',file]),e=>e.code===1&&/bounded limit/.test(e.stderr)&&!e.stdout.includes('unsupported'));
 });
 // Deterministic metadata races exercise the actual reader without creating links.
 // Only this command's fs imports are wrapped; providers remain absent, never successful doubles.
 const commandUrl=new URL('../bin/command.mjs',import.meta.url).href;
 const fsFacade=`export * from 'node:fs/promises';import * as fs from 'node:fs/promises';let readStarted=false;const input=${JSON.stringify(file)},mode=process.env.CLI_INPUT_FIXTURE;export async function lstat(p,o){const s=await fs.lstat(p,o);if(p===input&&mode==='linked-path')s.nlink=2n;if(p===input&&readStarted&&mode==='changed-path')s.ino+=1n;return s;}export async function open(p,flags){const h=await fs.open(p,flags);if(p!==input)return h;return{read:async(...args)=>{const r=await h.read(...args);readStarted=true;return r;},stat:async(...args)=>{const s=await h.stat(...args);if(mode==='linked-handle'||mode==='linked-after-read'&&readStarted)s.nlink=2n;return s;},close:()=>h.close()};}`;
 await writeFile(hook,`import{registerHooks}from'node:module';registerHooks({resolve(specifier,context,next){if(context.parentURL===${JSON.stringify(commandUrl)}&&specifier==='node:fs/promises')return{url:${JSON.stringify('data:text/javascript,'+encodeURIComponent(fsFacade))},shortCircuit:true};if(new URL(specifier,context.parentURL).href===${JSON.stringify(previewUrl)})return{url:'data:text/javascript,export{}',shortCircuit:true};return next(specifier,context);},load(url,context,next){return url===${JSON.stringify(new URL('../bin/managed-runtime.mjs',import.meta.url).href)}?{format:'module',source:${JSON.stringify(runtime)},shortCircuit:true}:next(url,context);}});`);
 await writeFile(file,'export const meta={name:"inert",description:"not executed"};throw Error("EXECUTED");');
 for(const mode of ['linked-path','linked-handle','linked-after-read','changed-path'])for(const input of [['--script',file],['project:inert','--cwd',temp]])await t.test(mode+' '+input[0],async()=>{
  await assert.rejects(execute(process.execPath,[join(root,'bin/command.mjs'),'plan',...input],{cwd:temp,env:{...env,CLI_INPUT_FIXTURE:mode},windowsHide:true,timeout:10000}),e=>e.code===1&&/single-link|identity changed/.test(e.stderr)&&!e.stdout.includes('unsupported'));
 });
 await t.test('physical hardlink input is refused before provider import',{skip:process.env.AGENT_WORKFLOW_WORKER==='1'?'Coordinator fixture: this writer may not create filesystem links':false},async()=>{
  const alias=join(temp,'alias');await link(file,alias);
  await assert.rejects(invoke(['plan','--script',alias]),e=>e.code===1&&/single-link/.test(e.stderr)&&!e.stdout.includes('unsupported'));
  await assert.rejects(invoke(['plan','project:inert','--cwd',temp]),e=>e.code===1&&/single-link/.test(e.stderr)&&!e.stdout.includes('unsupported'));
 });
});

test('roadmap CLI returns a complete bounded result when indentation would exceed the wire limit',async t=>{
 const temp=await mkdtemp(join(root,'.args-entry-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const file=join(temp,'plan.js'),hook=join(temp,'hook.mjs');
 const rows=Array.from({length:4000},(_,i)=>{let row=i;for(let depth=0;depth<9;depth++)row={child:row};return row;});
 const script=`export const meta=${JSON.stringify({name:'wire-size',description:'complete structured metadata',rows})};throw Error('WORKFLOW_EXECUTED_SENTINEL');await agent('private',{schema:{type:'object'}});`;
 await writeFile(file,script);
 const {previewPlan}=await import('../engine/plan-preview.mjs'),expected=previewPlan({script});
 assert.equal(expected.truncated,false);
 assert.ok(Buffer.byteLength(JSON.stringify(expected))<1048576);
 assert.ok(Buffer.byteLength(JSON.stringify(expected,null,2))>1048576,'fixture must expose indentation-only overflow');
 // Only managed-runtime selection is a fixture. The CLI, parser, provider,
 // serialization and child-process stdout are real; no workflow is evaluated.
 const runtime=`export * from ${JSON.stringify(new URL('../bin/managed-runtime.mjs?wire-size-fixture',import.meta.url).href)};export const pluginRoot=${JSON.stringify(root)};export async function selectRuntime(){return{path:pluginRoot};}`;
 await writeFile(hook,`import{registerHooks}from'node:module';registerHooks({load(url,context,next){return url===${JSON.stringify(new URL('../bin/managed-runtime.mjs',import.meta.url).href)}?{format:'module',source:${JSON.stringify(runtime)},shortCircuit:true}:next(url,context);}});`);
 const result=await execute(process.execPath,[join(root,'bin/command.mjs'),'plan','--script',file],{cwd:temp,env:{...process.env,NODE_OPTIONS:`--import=${pathToFileURL(hook).href}`},windowsHide:true,timeout:10000,maxBuffer:4*1024*1024});
 assert.deepEqual(JSON.parse(result.stdout),expected);
 assert.deepEqual(JSON.parse(result.stdout).callSites.find(site=>site.api==='agent').resultBudget,{status:'known',maxSerializedBytes:1048576,code:null});
 assert.ok(Buffer.byteLength(result.stdout)<=1048577,'wire payload plus final newline stays bounded');
 assert.doesNotMatch(result.stdout+result.stderr,/WORKFLOW_EXECUTED_SENTINEL/);
});

test('roadmap CLI refuses an oversized provider value before emitting any partial result',async t=>{
 const temp=await mkdtemp(join(root,'.args-entry-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const file=join(temp,'plan.js'),hook=join(temp,'hook.mjs');await writeFile(file,'export const meta={name:"wire",description:"limit"};');
 const runtime=`export * from ${JSON.stringify(new URL('../bin/managed-runtime.mjs?wire-overflow-fixture',import.meta.url).href)};export const pluginRoot=${JSON.stringify(root)};export async function selectRuntime(){return{path:pluginRoot};}`;
 // A deliberately out-of-contract provider exercises only the CLI's defensive
 // output boundary. This is not a provider or native execution qualification.
 const previewUrl=new URL('../engine/plan-preview.mjs',import.meta.url).href;
 await writeFile(hook,`import{registerHooks}from'node:module';registerHooks({load(url,context,next){const source=url===${JSON.stringify(new URL('../bin/managed-runtime.mjs',import.meta.url).href)}?${JSON.stringify(runtime)}:url===${JSON.stringify(previewUrl)}?'export function previewPlan(){return {body:"x".repeat(1048576)};}':undefined;return source===undefined?next(url,context):{format:'module',source,shortCircuit:true};}});`);
 await assert.rejects(execute(process.execPath,[join(root,'bin/command.mjs'),'plan','--script',file],{cwd:temp,env:{...process.env,NODE_OPTIONS:`--import=${pathToFileURL(hook).href}`},windowsHide:true,timeout:10000,maxBuffer:4*1024*1024}),e=>e.code===1&&e.stdout===''&&/Provider response exceeded its bounded limit/.test(e.stderr));
});

test('inspect normalization exposes only declared read flags and never a raw run path',async()=>{
 const {inspectCommand}=await import('../bin/arguments.mjs');
 assert.deepEqual(inspectCommand(['--inspect','usage','--run-id','saved','--generation','2','--data-dir','owned']),['usage','saved','--data-dir','owned','--generation','2']);
 assert.deepEqual(inspectCommand(['--inspect=plan','project:inert','--cwd','owned']),['plan','project:inert','--cwd','owned']);
 for(const command of ['job-start','job-cancel','checkpoint-record','check-record','run','stop'])assert.throws(()=>inspectCommand(['--inspect',command]),/read operation/);
 assert.throws(()=>inspectCommand(['--inspect','usage','--generation','2']),/run-id/);
 assert.throws(()=>inspectCommand(['--inspect','plan','--run-id','saved','--script','file']),/not valid/);
 assert.throws(()=>inspectCommand(['--inspect','usage','--run-id','saved','--generation','1','--generation','2']),/Duplicate/);
});

test('public help and API list the complete roadmap command and outcome contracts',async()=>{
 const api=await readFile(join(root,'docs/api.md'),'utf8'),contracts=await readFile(join(root,'docs/roadmap-command-contracts.md'),'utf8');
 for(const name of ['capture-preflight','plan','usage','acceptance','checkpoint-record','checkpoint','check-record','job-start','job-status','job-output','job-cancel']){
  for(const [label,text] of [['help',help],['API',api],['contracts',contracts]])assert.match(text,new RegExp(`\\b${name}\\b`),`${label}: ${name}`);
 }
 assert.match(help,/recorded runtime/);assert.match(contracts,/exit.*0|exit0/);
 assert.match(help,/job request 2 MiB/);assert.match(contracts,/command jobs to 2,097,152/);assert.match(api,/source packages/);
});

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
 const env={...process.env,NODE_OPTIONS:`--import=${pathToFileURL(hook).href}`};
 const invoke=(flags,{foreground=true}={})=>execute(process.execPath,[join(root,'bin','launch.mjs'),'run','--script',script,'--session','args-owner','--data-dir',join(temp,'data'),'--access','restricted',...(foreground?['--foreground']:[]),...flags],{fixtureRealm:true,cwd:temp,env,windowsHide:true,timeout:10000,maxBuffer:4*1024*1024});
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
 const temp=await mkdtemp(join(root,'.args-entry-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const script=join(temp,'script.js'),hook=join(temp,'hook.mjs'),dataDir=join(temp,'data');await writeFile(script,'export const meta={name:"fixture",description:"receipt"};return 1;');
 const runtime=`export * from ${JSON.stringify(new URL("../bin/managed-runtime.mjs?receipt-fixture",import.meta.url).href)};export const pluginRoot=${JSON.stringify(root)};export function defaultDataDir(){throw Error('explicit data required');}export async function selectRuntime(){return{path:pluginRoot,codex:'fixture'};}export async function bindRun(){return{id:'saved-id',runDir:${JSON.stringify(join(temp,'run'))}};}export async function resolveRun(){return{runDir:${JSON.stringify(join(temp,'run'))},runtime:{path:pluginRoot}};}export function paths(){}export function noLinks(){}export function nativeCodex(){throw Error('inference forbidden');}`;
 const background=`export async function startBackground(input,settings={}){return{status:'running',generation:3,startupMs:settings.startupMs??60000,accessPolicy:input.accessPolicy,defaults:input.defaults,workerTimeoutMs:input.workerTimeoutMs,watch:{required:true,attached:false,sessionId:input.sessionId,generation:3,after:0}};}`;
 await writeFile(hook,`import{registerHooks}from'node:module';const base=${JSON.stringify(new URL('../',import.meta.url).href)};registerHooks({load(url,context,next){const source=url===new URL('bin/managed-runtime.mjs',base).href?${JSON.stringify(runtime)}:url===new URL('engine/background.mjs',base).href?${JSON.stringify(background)}:undefined;return source===undefined?next(url,context):{format:'module',source,shortCircuit:true};}});`);
 const env={...process.env};delete env.NODE_OPTIONS;
 const invoke=flags=>execute(process.execPath,['--import',pathToFileURL(hook).href,join(root,'bin','command.mjs'),'run','--script',script,'--session','origin','--data-dir',dataDir,...flags],{fixtureRealm:true,cwd:temp,env,windowsHide:true,timeout:10000});
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
 assert.equal(receipt.startupMs,60000);
 for(const startupMs of [0,180000,2147483647])assert.equal(JSON.parse((await invoke(['--access','restricted','--startup-timeout-ms',String(startupMs)])).stdout).startupMs,startupMs);
 for(const command of ['resume','restart-worker']){
  const r=await execute(process.execPath,['--import',pathToFileURL(hook).href,join(root,'bin','command.mjs'),command,'saved-id','--session','origin','--data-dir',dataDir,'--startup-timeout-ms','0',...(command==='restart-worker'?['--generation','2','--position','0','--attempt','1','--reconcile','Reviewed settled effects']:[])],{fixtureRealm:true,cwd:temp,env,windowsHide:true,timeout:10000});assert.equal(JSON.parse(r.stdout).startupMs,0);
 }
 for(const value of ['-1','0.5','2147483648','NaN','Infinity'])assert.throws(()=>parseCommand(['run','demo','--session','origin','--startup-timeout-ms',value],{}),/startup-timeout-ms/);
 assert.throws(()=>parseCommand(['run','demo','--session','origin','--foreground','--startup-timeout-ms','0'],{}),/detached/);
 assert.throws(()=>parseCommand(['status','demo','--startup-timeout-ms','0'],{}),/not valid/);
});

test('public worker-deadline CLI creates exact durable controls and rejects ambiguous or foreign requests',async t=>{
 const temp=await mkdtemp(join(root,'.deadline-entry-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const hook=join(temp,'hook.mjs'),db=new DatabaseSync(join(temp,'run.sqlite'));
 db.exec('CREATE TABLE header(id INTEGER PRIMARY KEY,value TEXT);CREATE TABLE workers(generation INTEGER,position INTEGER,value TEXT);CREATE TABLE controls(id TEXT PRIMARY KEY,generation INTEGER,value TEXT);');
 db.prepare('INSERT INTO header VALUES(1,?)').run(JSON.stringify({sessionId:'owner',generation:2,status:'running',acceptingControls:true}));
 db.prepare('INSERT INTO workers VALUES(2,0,?)').run(JSON.stringify({position:0,status:'running',attempts:1,deadline:{status:'active',revision:4}}));db.close();
 const runtime=`export * from ${JSON.stringify(new URL('../bin/managed-runtime.mjs?deadline-fixture',import.meta.url).href)};export const pluginRoot=${JSON.stringify(root)};export async function resolveRun(){return{runDir:${JSON.stringify(temp)},runtime:{path:pluginRoot}};}export async function selectRuntime(){throw Error('Must use original runtime');}`;
 await writeFile(hook,`import{registerHooks}from'node:module';registerHooks({load(url,context,next){return url===${JSON.stringify(new URL('../bin/managed-runtime.mjs',import.meta.url).href)}?{format:'module',source:${JSON.stringify(runtime)},shortCircuit:true}:next(url,context);}});`);
 const env={...process.env,NODE_OPTIONS:`--import=${pathToFileURL(hook).href}`};
 const args=['worker-deadline','saved','--session','owner','--generation','2','--position','0','--attempt','1','--deadline-revision','4','--data-dir',temp];
 const invoke=flags=>execute(process.execPath,[join(root,'bin/launch.mjs'),...args,...flags],{fixtureRealm:true,cwd:temp,env,windowsHide:true,timeout:10000});
 for(const [flags,deadline] of [[['--set-ms',String(2**32)],{operation:'set',valueMs:2**32,expectedRevision:4}],[['--extend-ms','10'],{operation:'extend',valueMs:10,expectedRevision:4}],[['--clear'],{operation:'clear',expectedRevision:4}]]){
  const receipt=JSON.parse((await invoke(flags)).stdout);assert.equal(receipt.status,'pending');assert.equal(receipt.turnId,null);assert.equal(receipt.generation,2);assert.equal(receipt.attempt,1);assert.deepEqual(receipt.deadline,deadline);
 }
 const internal=JSON.parse((await execute(process.execPath,[join(root,'engine/cli.mjs'),'--action','worker-deadline','--run',temp,'--session','owner','--generation','2','--position','0','--attempt','1','--deadline-revision','4','--clear'],{fixtureRealm:true,cwd:temp,env,windowsHide:true,timeout:10000})).stdout);
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
 const temp=await mkdtemp(join(tmpdir(),'doctor-test-'));
 assert.equal(dirname(temp),resolve(tmpdir()));
 t.after(async()=>{assert.equal(dirname(temp),resolve(tmpdir()));await rm(temp,{recursive:true,force:true});});
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
 export {unused as freezeWorkflowSources,unused as contextRunRef,unused as validateArtifactScope,unused as readCapabilities,unused as readMode,unused as setMode,unused as parseScript,unused as listWorkflows,unused as resolveWorkflow,unused as saveWorkflow,unused as readRun,unused as runWorkflow,unused as requestControl,unused as readControl,unused as requestAppend,unused as readAppendReceipt,unused as readAppendTasks,unused as startBackground,unused as startMonitor,unused as monitorData,unused as readLifecycle,unused as readLifecycleReceipt,unused as requestLifecycle,unused as planPrune,unused as applyPrune,unused as createSessionServices};
 export const MAX_RUN_TIMEOUT_MS=86400000,MAX_WORKER_TIMEOUT_MS=1800000;`;
 const context=`export async function readHostContext(){${scenario.contextFailure?`throw Error(${JSON.stringify(doctorSecret)});`:`return ${JSON.stringify(scenario.hostContext??hostContext)};`}}`;
 await writeFile(hook,`import {registerHooks} from 'node:module';
 const base=${JSON.stringify(new URL('../',import.meta.url).href)},backend=${JSON.stringify(backend)},runtime=${JSON.stringify(runtime)},unused=${JSON.stringify(unused)},hostContext=${JSON.stringify(context)};
 registerHooks({load(url,context,nextLoad){
  const source=url===new URL('foundation/host-context.mjs',base).href?hostContext:url===new URL('bin/managed-runtime.mjs',base).href?runtime:url===new URL('engine/backend.mjs',base).href?backend:url===new URL('engine/access-policy.mjs',base).href?undefined:url.startsWith(new URL('engine/',base).href)?unused:undefined;
  return source===undefined?nextLoad(url,context):{format:'module',source,shortCircuit:true};
 }});`);
 const env={...process.env};delete env.NODE_OPTIONS;
 let result;
 try{result={...await execute(process.execPath,['--import',pathToFileURL(hook).href,join(root,'bin','command.mjs'),'doctor','--backend','mxc','--data-dir',join(temp,'data')],{fixtureRealm:true,cwd:temp,env,windowsHide:true,timeout:10000,maxBuffer:32*1024}),code:0};}
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
 const env={...process.env};delete env.NODE_OPTIONS;
 for(const mode of ['missing','malformed']){
  if(mode==='malformed'){await mkdir(data);await writeFile(join(data,'runtime-v2.json'),'DOCTOR_SECRET_SENTINEL private@example.invalid');}
  for(const entry of ['launch.mjs','agent-workflow.mjs','launch-v2.mjs']){
   const result=await execute(process.execPath,[join(plugin,'bin',entry),'doctor','--data-dir',data],{fixtureRealm:true,env,windowsHide:true,timeout:10000}).then(()=>null,error=>error);
   assert.equal(result?.code,1);assert.equal(result.stderr,'');
   const report=JSON.parse(result.stdout);assert.equal(report.status,'failed');assert.equal(report.stage,'runtime');assert.equal(report.inferenceRequests,0);
   assert.equal(report.cleanup.serverExited,null);assert.equal(report.admission,undefined);
   assert.doesNotMatch(result.stdout,/DOCTOR_SECRET_SENTINEL|private@example|stack|argv/);
  }
 }
});

test('doctor retains bounded runtime selection identities without reading accessors or arbitrary causes',()=>{
 const identity={version:'0.6.3',digest:'a'.repeat(64),node:process.version};
 const error={code:'RUNTIME_MATCH_INVALID',runtimeSelection:{reason:'invalid',caller:identity,selected:{...identity,digest:'b'.repeat(64)},cause:'PRIVATE_SOURCE_PATH'}};
 const result=doctorFailure(error,{stage:'runtime'});
 assert.deepEqual(result.error,{code:'RUNTIME_MATCH_INVALID'});assert.deepEqual(result.runtimeSelection,{reason:'invalid',caller:identity,selected:{...identity,digest:'b'.repeat(64)}});
 assert.ok(!JSON.stringify(result).includes('PRIVATE_SOURCE_PATH'));
 for(const change of [
  {caller:{...identity,version:'x'.repeat(1000)}},
  {caller:{...identity,node:'PRIVATE_PATH'}},
  {caller:{...identity,digest:'private'}},
  {reason:'PRIVATE_PATH'},
  {reason:'missing'},
  {get caller(){throw Error('must not invoke accessor');}},
 ]){
  const selection={...error.runtimeSelection};Object.defineProperties(selection,Object.getOwnPropertyDescriptors(change));
  const failed=doctorFailure({...error,runtimeSelection:selection},{stage:'runtime'});assert.equal(failed.runtimeSelection,undefined);assert.ok(!JSON.stringify(failed).includes('PRIVATE'));
 }
 assert.equal(doctorFailure(error,{stage:'backend'}).runtimeSelection,undefined);
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
  const parsed=parseCommand([command,'demo','--session','s','--run-timeout-ms','7200000','--worker-timeout-ms','1800000'],{});
  assert.equal(parsed.values['run-timeout-ms'],'7200000');assert.equal(parsed.values['worker-timeout-ms'],'1800000');
 }
 assert.throws(()=>parseCommand(['status','demo','--run-timeout-ms','7200000'],{}),/not valid/);
});
test('public launcher selects the run-pinned runtime after upgrade and refuses foreign-session control',async t=>{
 const installRuntime=input=>inertRuntime('installRuntime',input),bindRun=input=>inertRuntime('bindRun',input);
 const temp=await mkdtemp(join(tmpdir(),'workflow-entry-'));t.after(()=>rm(temp,{recursive:true,force:true}));const pluginRoot=join(temp,'plugin'),dataDir=join(temp,'data');await mkdir(pluginRoot);
 for(const name of ['bin','engine','foundation','workflows','hooks','skills'])await mkdir(join(pluginRoot,name));
 for(const name of ['managed-runtime.mjs','launch-v2.mjs','arguments.mjs','doctor-diagnostics.mjs'])await cp(join(root,'bin',name),join(pluginRoot,'bin',name));
 await writeFile(join(pluginRoot,'bin','command.mjs'),`import{readFile}from'node:fs/promises';import{join}from'node:path';import{bindRun,pluginRoot}from'./managed-runtime.mjs';import{parseCommand}from'./arguments.mjs';const p=parseCommand();const bound=p.command==='run'?await bindRun({dataDir:p.dataDir,runtime:JSON.parse(await readFile(join(pluginRoot,'.runtime.json'),'utf8')),sessionId:p.sessionId}):null;console.log(JSON.stringify({marker:'first',root:import.meta.url,args:process.argv.slice(2),bound}));`);
 await writeFile(join(pluginRoot,'package.json'),JSON.stringify({version:'0.2.0',dependencies:{'@openai/codex':'0.162.1'}}));await writeFile(join(pluginRoot,'package-lock.json'),'{}');await writeFile(join(pluginRoot,'LICENSE'),'MIT');
 const npmCli=join(temp,'npm.mjs');await writeFile(npmCli,`import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';const root=join(process.cwd(),'node_modules/@openai');await mkdir(join(root,'codex'),{recursive:true});await writeFile(join(root,'codex/package.json'),JSON.stringify({version:'0.162.1'}));const target=join(root,'codex-win32-x64');await mkdir(join(target,'vendor/x86_64-pc-windows-msvc/bin'),{recursive:true});await writeFile(join(target,'package.json'),JSON.stringify({version:'0.162.1-win32-x64'}));await writeFile(join(target,'vendor/x86_64-pc-windows-msvc/bin/codex.exe'),'fixture');`);
 const first=await installRuntime({pluginRoot,dataDir,npmCli});const bound=await bindRun({dataDir,runtime:first,sessionId:'origin'});
 await writeFile(join(pluginRoot,'bin','command.mjs'),'console.log(JSON.stringify({marker:"second"}));');const second=await installRuntime({pluginRoot,dataDir,npmCli});
 const invoke=(args,env={})=>execute(process.execPath,[join(pluginRoot,'bin','launch-v2.mjs'),...args,'--data-dir',dataDir],{fixtureRealm:true,fixtureWorkerGuard:env.AGENT_WORKFLOW_WORKER==='1',env:{...process.env,...env},windowsHide:true,timeout:10000});
 const invokeOlder=args=>execute(process.execPath,[join(first.path,'bin','launch-v2.mjs'),...args,'--data-dir',dataDir],{fixtureRealm:true,env:{...process.env},windowsHide:true,timeout:10000});
 const pointerBefore=await readFile(join(dataDir,'runtime-v2.json')),ownerBefore=await readFile(join(bound.runDir,'runtime.json'));
 const [older,newer]=await Promise.all([invokeOlder(['run','demo','--session','origin']),invoke(['workflows'])]);
 const started=JSON.parse(older.stdout);assert.equal(started.marker,'first');assert.equal(started.bound.runtime.id,first.id);assert.equal(started.bound.sessionId,'origin');assert.equal(JSON.parse(newer.stdout).marker,'second');
 assert.deepEqual(await readFile(join(dataDir,'runtime-v2.json')),pointerBefore);assert.deepEqual(await readFile(join(bound.runDir,'runtime.json')),ownerBefore);
 assert.equal(JSON.parse((await invoke(['watch',bound.id,'--session','origin','--generation','1','--jsonl'])).stdout).marker,'first');
 await assert.rejects(invoke(['watch',bound.id,'--generation','1','--jsonl'],{CODEX_THREAD_ID:''}),e=>/session/i.test(e.stderr));
 assert.equal(JSON.parse((await invoke(['status',bound.id])).stdout).marker,'first');assert.equal(JSON.parse((await invoke(['workflows'])).stdout).marker,'second');
 for(const [command,flags] of [
  ['usage',['--generation','1']],['acceptance',['--session','origin','--request-file','request.json']],
  ['checkpoint',[]],['checkpoint-record',['--session','origin','--request-file','request.json']],
  ['check-record',['--session','origin','--checkpoint-id','c','--check-id','check','--job-id','j']],
  ['job-start',['--session','origin','--request-file','request.json']],['job-status',['--session','origin','--job-id','j']],
  ['job-output',['--session','origin','--job-id','j','--stream','stdout']],
  ['job-cancel',['--session','origin','--job-id','j','--request-id','request','--revision','0']],
 ])assert.equal(JSON.parse((await invoke([command,bound.id,...flags])).stdout).marker,'first',command);
 for(const [command,flags] of [['plan',['--script','inert.js']],['capture-preflight',[]]])assert.equal(JSON.parse((await invoke([command,...flags])).stdout).marker,'second',command);
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
 await rm(join(first.path,'.runtime.json'));
 const refused=await invokeOlder(['doctor']).then(()=>assert.fail('Missing exact match cannot dispatch doctor'),error=>error);
 assert.equal(refused.code,1);assert.equal(refused.stderr,'');const report=JSON.parse(refused.stdout);
 assert.equal(report.stage,'runtime');assert.equal(report.error.code,'RUNTIME_MATCH_MISSING');
 assert.deepEqual(report.runtimeSelection,{reason:'missing',caller:{version:first.version,digest:first.digest,node:first.node},selected:{version:second.version,digest:second.digest,node:second.node}});
 assert.ok(!refused.stdout.includes(temp));assert.deepEqual(await readFile(join(dataDir,'runtime-v2.json')),pointerBefore);
 await assert.rejects(invoke(['dashboard',bound.id,'--current-ui'],{CODEX_THREAD_ID:'other'}),e=>/session/i.test(e.stderr));
 assert.match((await invoke(['help'])).stdout,/dashboard/);
});

test('public roadmap reads use real integrated providers and retain runtime, session and no-install boundaries',async t=>{
 const required=['engine/plan-preview.mjs','engine/usage-summary.mjs','engine/delivery-acceptance.mjs','engine/stage-checkpoints.mjs','engine/command-jobs/index.mjs'];
 const missing=[];for(const name of required)try{await readFile(join(root,name));}catch(error){if(error.code!=='ENOENT')throw error;missing.push(name);}
 if(missing.length){t.skip(`Reviewed integration required: ${missing.join(', ')}`);return;}
 if(process.env.AGENT_WORKFLOW_WORKER==='1'){t.skip('Coordinator must execute the managed-runtime fixture; worker installation guard remains enabled');return;}
 const temp=await mkdtemp(join(root,'.args-entry-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const plugin=join(temp,'plugin'),dataDir=join(temp,'data'),npmCli=join(temp,'npm.mjs'),installTrace=join(temp,'install.trace');await mkdir(plugin);
 for(const name of ['bin','engine','foundation','workflows','hooks','skills','package.json','package-lock.json','LICENSE'])await cp(join(root,name),join(plugin,name),{recursive:true});
 const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).dependencies['@openai/codex'];
 // Use the prepared actual JS/WASM dependency payloads so the real providers
 // load. Only native Codex is inert; no successful provider export is replaced.
 await writeFile(npmCli,`import{mkdir,writeFile,appendFile,readdir,cp}from'node:fs/promises';import{join}from'node:path';await appendFile(${JSON.stringify(installTrace)},'install\\n');const prepared=${JSON.stringify(join(root,'node_modules'))},modules=join(process.cwd(),'node_modules');await mkdir(modules,{recursive:true});for(const name of await readdir(prepared))if(!['@openai','.bin','.package-lock.json'].includes(name))await cp(join(prepared,name),join(modules,name),{recursive:true});const base=join(modules,'@openai');await mkdir(join(base,'codex'),{recursive:true});await writeFile(join(base,'codex/package.json'),JSON.stringify({version:${JSON.stringify(version)}}));const target=join(base,'codex-win32-x64');await mkdir(join(target,'vendor/x86_64-pc-windows-msvc/bin'),{recursive:true});await writeFile(join(target,'package.json'),JSON.stringify({version:${JSON.stringify(version+'-win32-x64')}}));await writeFile(join(target,'vendor/x86_64-pc-windows-msvc/bin/codex.exe'),'inert fixture: native execution forbidden');`);
 const first=await installRuntime({pluginRoot:plugin,dataDir,npmCli}),bound=await bindRun({dataDir,runtime:first,sessionId:'origin'});
 const env={...process.env};delete env.NODE_OPTIONS;delete env.CODEX_THREAD_ID;
 const invoke=async(args,selectedData=dataDir)=>execute(process.execPath,[join(plugin,'bin/launch.mjs'),...args,'--data-dir',selectedData],{fixtureRealm:true,cwd:temp,env,windowsHide:true,timeout:10000}).then(value=>({...value,code:0}),error=>{if(typeof error.code!=='number')throw error;return error;});
 const script='export const meta={name:"inert",description:"preview only"};throw Error("WORKFLOW_EXECUTED_SENTINEL");',file=join(temp,'inert.js');await writeFile(file,script);
 const {previewPlan}=await import(pathToFileURL(join(first.path,'engine/plan-preview.mjs')).href);
 const plan=await invoke(['plan','--script',file]);assert.equal(plan.code,0,plan.stderr);assert.deepEqual(JSON.parse(plan.stdout),await previewPlan({script}));assert.doesNotMatch(plan.stderr,/WORKFLOW_EXECUTED_SENTINEL/);
 const savedFile=join(temp,'.agents','workflows','inert.mjs');await mkdir(dirname(savedFile),{recursive:true});await writeFile(savedFile,script);
 const savedPlan=await invoke(['plan','project:inert','--cwd',temp]);assert.equal(savedPlan.code,0,savedPlan.stderr);assert.deepEqual(JSON.parse(savedPlan.stdout),JSON.parse(plan.stdout));assert.doesNotMatch(savedPlan.stderr,/WORKFLOW_EXECUTED_SENTINEL/);
 const context={dataDir,runId:bound.id},session={...context,sessionId:'origin'},jobId='72eadbf1-4ba2-45a0-85d4-52efb42ed1bf';
 const {readUsageSummary}=await import(pathToFileURL(join(first.path,'engine/usage-summary.mjs')).href);
 const {listStageCheckpoints}=await import(pathToFileURL(join(first.path,'engine/stage-checkpoints.mjs')).href);
 const {readCommandJob,readCommandJobOutput}=await import(pathToFileURL(join(first.path,'engine/command-jobs/index.mjs')).href);
 const reads=[
  {args:['usage',bound.id,'--generation','1'],read:()=>readUsageSummary({...context,generation:1})},
  {args:['checkpoint',bound.id],read:()=>listStageCheckpoints({...context,after:null,limit:50})},
  {args:['job-status',bound.id,'--session','origin','--job-id',jobId],read:()=>readCommandJob({...session,jobId})},
  {args:['job-output',bound.id,'--session','origin','--job-id',jobId,'--stream','stdout'],read:()=>readCommandJobOutput({...session,jobId,stream:'stdout',after:0,limitBytes:65536})},
 ];
 for(const row of reads)row.expected=await row.read().then(value=>({value}),error=>({error}));
 await writeFile(join(plugin,'bin/command.mjs'),'throw Error("CURRENT_RUNTIME_SENTINEL");');await installRuntime({pluginRoot:plugin,dataDir,npmCli});
 const pointer=await readFile(join(dataDir,'runtime-v2.json')),owner=await readFile(join(bound.runDir,'runtime.json')),installs=await readFile(installTrace),runtimeNames=await readdir(join(dataDir,'runtime-v2'));
 for(const {args,expected} of reads){const actual=await invoke(args);assert.doesNotMatch(actual.stderr+actual.stdout,/CURRENT_RUNTIME_SENTINEL|unsupported/);if(expected.error){assert.equal(actual.code,1);assert.match(actual.stderr,/provider refused/);}else{assert.equal(actual.code,0,actual.stderr);assert.deepEqual(JSON.parse(actual.stdout),expected.value);}}
 const canonical=await realpath(dataDir),identity=await lstat(dataDir,{bigint:true});
 const dataInstanceId=createHash('sha256').update(JSON.stringify([process.platform==='win32'?canonical.toLowerCase():canonical,String(identity.dev),String(identity.ino),String(identity.birthtimeNs)])).digest('hex');
 const requestFile=join(temp,'acceptance.json');await writeFile(requestFile,JSON.stringify({schemaVersion:1,run:{dataInstanceId,runId:bound.id,runtimeId:first.id},planHash:'a'.repeat(64),checkpointId:'b2ed1048-84fa-48de-a3ed-8352fbe3ae31',objectiveIds:['missing']}));
 const assembly=await invoke(['acceptance',bound.id,'--session','origin','--request-file',requestFile]);assert.equal(assembly.code,1);assert.doesNotMatch(assembly.stdout+assembly.stderr,/CURRENT_RUNTIME_SENTINEL|unsupported/);if(assembly.stdout)assert.equal(JSON.parse(assembly.stdout).complete,false);else assert.match(assembly.stderr,/provider refused/);
 for(const args of [['job-status',bound.id,'--job-id',jobId],['job-output',bound.id,'--job-id',jobId,'--stream','stdout'],['acceptance',bound.id,'--request-file',requestFile]]){const foreign=await invoke([...args,'--session','foreign']);assert.equal(foreign.code,1);assert.match(foreign.stderr,/another originating session/);}
 const current=await invoke(['plan','--script',file]);assert.equal(current.code,1);assert.match(current.stderr,/CURRENT_RUNTIME_SENTINEL/);
 const absentData=join(temp,'absent-data'),absent=await invoke(['plan','--script',file],absentData);assert.equal(absent.code,1);await assert.rejects(lstat(absentData),{code:'ENOENT'});
 assert.deepEqual(await readFile(join(dataDir,'runtime-v2.json')),pointer);assert.deepEqual(await readFile(join(bound.runDir,'runtime.json')),owner);assert.deepEqual(await readFile(installTrace),installs);assert.deepEqual(await readdir(join(dataDir,'runtime-v2')),runtimeNames);
});
