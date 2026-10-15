/** @lane merge
 * @subject engine/background.mjs
 * @subject engine/background-child.mjs
 * @subject engine/controller.mjs
 * @subject engine/cli.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,writeFile,readFile,mkdir,readdir,stat,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readRun,requestControl,readControl} from '../engine/controller.mjs';

const exec=promisify(execFile);

test('detached admission honors an explicit unbounded or finite launcher budget',async t=>{
 const {startBackground}=await import('../engine/background.mjs');
 const base=await mkdtemp(join(tmpdir(),'workflow-startup-budget-'));t.after(()=>rm(base,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 for(const startupMs of [0,3000]){
  const parent=join(base,String(startupMs)),cwd=join(parent,'slow'),runDir=join(parent,'run');await mkdir(cwd,{recursive:true});
  const receipt=await startBackground({runDir,sessionId:'s',codex:process.execPath,cwd,script:'export const meta={name:"slow",description:"explicit startup policy"};return await agent("A");'},{runnerPath:fileURLToPath(new URL('./fixtures/engine-background.mjs',import.meta.url)),startupMs});
  const run=await until(()=>readRun(runDir),r=>r.status==='completed');assert.equal(run.workers.length,1);assert.equal(run.attempts,1);assert.equal(run.result,'A');await until(()=>readFile(receipt.resultPath,'utf8'),()=>true);
 }
});

test('unsafe launcher budgets reject before creating a run or forking',async t=>{
 const {startBackground}=await import('../engine/background.mjs');const base=await mkdtemp(join(tmpdir(),'workflow-startup-invalid-'));t.after(()=>rm(base,{recursive:true,force:true}));
 for(const [index,startupMs] of [-1,0.5,2147483648,NaN,Infinity,'0',null].entries()){
  const runDir=join(base,String(index));await assert.rejects(startBackground({runDir,sessionId:'s',codex:process.execPath,cwd:base,script:'export const meta={name:"invalid",description:"no fork"};return 1;'},{startupMs}),{code:'BACKGROUND_INPUT'});await assert.rejects(stat(runDir),{code:'ENOENT'});
 }
});

test('detached parent access binds the session, reaches the backend and cannot change on resume',async t=>{
 const {startBackground}=await import('../engine/background.mjs');
 const {resolveAccess}=await import('../engine/access-policy.mjs');
 const base=await mkdtemp(join(tmpdir(),'workflow-background-access-'));t.after(()=>rm(base,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const runDir=join(base,'run'),settings={runnerPath:fileURLToPath(new URL('./fixtures/engine-background.mjs',import.meta.url))};
 const accessPolicy=resolveAccess({sessionId:'s',parentAccess:{version:1,sessionId:'s',provenance:'codex-session-context',filesystem:'unrestricted',networkAccess:true,approvalPolicy:'never'}});
 const receipt=await startBackground({runDir,sessionId:'s',codex:process.execPath,cwd:base,accessPolicy,script:'export const meta={name:"parent",description:"persist authority"};return 1;'},settings);
 const first=await until(()=>readRun(runDir),state=>state.status==='completed');
 assert.deepEqual(first.launch.accessPolicy,accessPolicy);assert.deepEqual(first.accessPolicy,accessPolicy);
 assert.deepEqual(JSON.parse(await readFile(join(base,'backend-access.json'),'utf8')),accessPolicy);
 await until(()=>readFile(receipt.resultPath,'utf8'),()=>true);
 const resumed=await startBackground({runDir,sessionId:'s',resume:true},settings);
 const second=await until(()=>readRun(runDir),state=>state.generation===2&&state.status==='completed');
 assert.deepEqual(second.accessPolicy,accessPolicy);assert.deepEqual(second.launch.accessPolicy,accessPolicy);
 await until(()=>readFile(resumed.resultPath,'utf8'),()=>true);
 const before=(await readdir(runDir)).length;
 await assert.rejects(startBackground({runDir,sessionId:'s',resume:true,accessPolicy},settings),{code:'ACCESS_OVERRIDE'});
 assert.equal((await readdir(runDir)).length,before);
 const foreignDir=join(base,'foreign');
 await assert.rejects(startBackground({runDir:foreignDir,sessionId:'foreign',codex:process.execPath,cwd:base,accessPolicy,script:'export const meta={name:"foreign",description:"reject"};return 1;'},settings),{code:'ACCESS_POLICY'});
 await assert.rejects(stat(foreignDir),{code:'ENOENT'});
 const {DatabaseSync}=await import('node:sqlite'),db=new DatabaseSync(join(runDir,'run.sqlite'));
 const header=db.prepare('SELECT value FROM header WHERE id=1').get().value;
 try{
  for(const target of ['native','launch']){
   const changed=JSON.parse(header);
   if(target==='native')changed.accessPolicy.native.command.sandboxPolicy={type:'readOnly',networkAccess:false};
   else delete changed.launch.accessPolicy;
   db.prepare('UPDATE header SET value=? WHERE id=1').run(JSON.stringify(changed));
   await assert.rejects(startBackground({runDir,sessionId:'s',resume:true},settings),{code:'ACCESS_POLICY'});
   assert.equal((await readdir(runDir)).length,before,'rejected saved authority must not create a new launch receipt');
  }
 }finally{db.prepare('UPDATE header SET value=? WHERE id=1').run(header);db.close();}
});

test('detached desktop selection reaches the backend and survives resume without overrides',{skip:process.platform!=='win32'},async t=>{
 const {startBackground}=await import('../engine/background.mjs');
 const base=await mkdtemp(join(tmpdir(),'workflow-background-desktop-'));t.after(()=>rm(base,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const runDir=join(base,'run'),settings={runnerPath:fileURLToPath(new URL('./fixtures/engine-background.mjs',import.meta.url))};
 const receipt=await startBackground({runDir,sessionId:'s',codex:process.execPath,cwd:base,backend:'mxc',session0Desktop:'shared',script:'export const meta={name:"desktop",description:"persist"};return 1;'},settings);
 const first=await until(()=>readRun(runDir),state=>state.status==='completed');
 assert.equal(first.launch.session0Desktop,'shared');
 assert.equal(JSON.parse(await readFile(join(base,'backend-desktop.json'),'utf8')),'shared');
 await until(()=>readFile(receipt.resultPath,'utf8'),()=>true);
 const resumed=await startBackground({runDir,sessionId:'s',resume:true},settings);
 const second=await until(()=>readRun(runDir),state=>state.generation===2&&state.status==='completed');
 assert.equal(second.launch.session0Desktop,'shared');
 assert.equal(JSON.parse(await readFile(join(base,'backend-desktop.json'),'utf8')),'shared');
 await until(()=>readFile(resumed.resultPath,'utf8'),()=>true);
 const before=(await readdir(runDir)).length;
 await assert.rejects(startBackground({runDir,sessionId:'s',resume:true,session0Desktop:'inherit'},settings),{code:'LAUNCH_INVALID'});
 assert.equal((await readdir(runDir)).length,before);
});

test('detached capability admission persists its bundle and resume rejects overrides before a launch',async t=>{
 const {startBackground}=await import('../engine/background.mjs');
 const {createHash}=await import('node:crypto');
 const base=await mkdtemp(join(fileURLToPath(new URL('../',import.meta.url)),'.background-capabilities-'));t.after(()=>rm(base,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const selected=join(base,'selected-skill');await mkdir(selected);
 const path=join(selected,'SKILL.md'),body='native source';await writeFile(path,body);
 const workerCapabilities={version:1,skills:[{id:'native',name:'native',root:base,path,sha256:createHash('sha256').update(body).digest('hex'),references:[]}],tools:[]};
 const runDir=join(base,'run'),settings={runnerPath:fileURLToPath(new URL('./fixtures/engine-background.mjs',import.meta.url))};
 const receipt=await startBackground({runDir,sessionId:'s',codex:process.execPath,cwd:base,workerCapabilities,script:'export const meta={name:"capabilities",description:"persist"};return 1;'},settings);
 assert.deepEqual(receipt.watch,{required:true,attached:false,sessionId:'s',generation:1,after:0});
 const first=await until(()=>readRun(runDir),state=>state.status==='completed');
 assert.deepEqual(first.workerCapabilities,workerCapabilities);assert.equal(first.launch.workerCapabilitiesHash,first.workerCapabilitiesHash);
 await until(()=>readFile(receipt.resultPath,'utf8'),()=>true);
 const count=(await readdir(runDir)).length;
 await assert.rejects(startBackground({runDir,sessionId:'s',resume:true,workerCapabilities},settings),{code:'CAPABILITY_OVERRIDE'});
 assert.equal((await readdir(runDir)).length,count);
});

test('detached retained-source replay survives cache deletion and never redispatches a completed writer',async t=>{
 const {startBackground}=await import('../engine/background.mjs'),{createHash}=await import('node:crypto');
 const base=await mkdtemp(join(tmpdir(),'workflow-retained-replay-'));t.after(()=>rm(base,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const cwd=join(base,'retention'),source=join(base,'cache','plugin'),selected=join(source,'skills','native'),runDir=join(base,'run');
 await mkdir(cwd);await mkdir(selected,{recursive:true});await writeFile(join(cwd,'owned.txt'),'original\n');
 for(const args of [['init','-q'],['add','owned.txt'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']])await exec('git',args,{cwd,windowsHide:true});
 const path=join(selected,'SKILL.md'),body='native fixture source';await writeFile(path,body);
 const workerCapabilities={version:1,skills:[{id:'native',name:'native',root:source,path,sha256:createHash('sha256').update(body).digest('hex'),references:[]}],tools:[]};
 const settings={runnerPath:fileURLToPath(new URL('./fixtures/engine-background.mjs',import.meta.url))};
 const receipt=await startBackground({runDir,sessionId:'s',codex:process.execPath,cwd,workerCapabilities,script:'export const meta={name:"retained",description:"writer replay"};return await agent("Write",{workspace:"isolated",skills:["native"]});'},settings);
 const first=await until(()=>readRun(runDir),state=>state.status==='completed');await until(()=>readFile(receipt.resultPath,'utf8'),()=>true);
 assert.equal(first.launch.capabilitySources.version,1);assert.deepEqual(first.workerCapabilities,workerCapabilities);
 const patch=await readFile(first.workers[0].workspace.patchPath),manifest=first.workers[0].workspace.manifestHash;
 assert.equal(await readFile(join(base,'retention-calls.txt'),'utf8'),'1');
 await rm(source,{recursive:true});
 const resumed=await startBackground({runDir,sessionId:'s',resume:true},settings);
 const second=await until(()=>readRun(runDir),state=>state.generation===2&&state.status==='completed');await until(()=>readFile(resumed.resultPath,'utf8'),()=>true);
 assert.equal(second.coverage.cached,1);assert.equal(second.attempts,first.attempts);assert.equal(await readFile(join(base,'retention-calls.txt'),'utf8'),'1');
 assert.equal(second.workers[0].workspace.manifestHash,manifest);assert.deepEqual(await readFile(second.workers[0].workspace.patchPath),patch);
 assert.equal(await readFile(join(cwd,'owned.txt'),'utf8'),'original\n');
 await writeFile(join(cwd,'change-backend-identity'),'changed configuration');
 const changed=await startBackground({runDir,sessionId:'s',resume:true},settings).then(()=>null,error=>error);
 assert.ok(changed,'changed backend identity refuses replay');assert.deepEqual(await readRun(runDir),second);
 assert.equal(await readFile(join(base,'retention-calls.txt'),'utf8'),'1');
});

test('detached admission persists immutable capture policy and resume cannot replace it',async t=>{
  const {startBackground}=await import('../engine/background.mjs');
  const {validateCapturePolicy}=await import('../engine/workspace-policy.mjs');
  const base=await mkdtemp(join(tmpdir(),'workflow-background-capture-'));t.after(()=>rm(base,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
  const runDir=join(base,'run'),capturePolicy={version:1,excludeDirs:['node_modules/','dist/'],protectedPaths:['src/']};
  const settings={runnerPath:fileURLToPath(new URL('./fixtures/engine-background.mjs',import.meta.url))};
  const receipt=await startBackground({runDir,sessionId:'original',codex:process.execPath,cwd:base,capturePolicy,script:'export const meta={name:"capture",description:"admission"};return 1;'},settings);
  const completed=await until(()=>readRun(runDir),state=>state.status==='completed');
  const frozen=validateCapturePolicy(capturePolicy);
  assert.deepEqual(completed.launch.capturePolicy,frozen.policy);
  assert.equal(completed.launch.capturePolicyHash,frozen.policyHash);
  const request=JSON.parse(await readFile(join(runDir,(await readdir(runDir)).find(name=>name.startsWith('launch-'))),'utf8'));
  assert.deepEqual(request.launch.capturePolicy,frozen.policy);
  await until(()=>readFile(receipt.resultPath,'utf8'),()=>true);
  const resumed=await startBackground({runDir,sessionId:'original',resume:true},settings);
  const replayed=await until(()=>readRun(runDir),state=>state.generation===2&&state.status==='completed');
  assert.deepEqual(replayed.launch.capturePolicy,frozen.policy);assert.equal(replayed.launch.capturePolicyHash,frozen.policyHash);
  await until(()=>readFile(resumed.resultPath,'utf8'),()=>true);
  const before=(await readdir(runDir)).filter(name=>name.startsWith('launch-')).length;
  await assert.rejects(startBackground({runDir,sessionId:'original',resume:true,capturePolicy:{version:1,excludeDirs:[],protectedPaths:['src/']}},settings),{code:'CAPTURE_POLICY_OVERRIDE'});
  assert.equal((await readdir(runDir)).filter(name=>name.startsWith('launch-')).length,before);
  assert.equal((await readRun(runDir)).generation,2);
  await assert.rejects(startBackground({runDir:join(base,'invalid'),sessionId:'original',codex:process.execPath,cwd:base,capturePolicy:{version:1,excludeDirs:['../'],protectedPaths:[]},script:'export const meta={name:"invalid",description:"admission"};return 1;'},settings),{code:'WORKSPACE_POLICY'});
  await assert.rejects(stat(join(base,'invalid')),{code:'ENOENT'});
});

test('CLI writable opt-in persists the permission ceiling before native admission',async t=>{
  const base=await mkdtemp(join(tmpdir(),'workflow-cli-write-'));t.after(()=>rm(base,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
  const runDir=join(base,'run'),script=join(base,'workflow.mjs');await writeFile(script,'export const meta={name:"writer",description:"proof"};return await agent("edit");');
  // Node deliberately fails the pinned Codex version check, so this exercises CLI launch without inference.
  await exec(process.execPath,[fileURLToPath(new URL('../engine/cli.mjs',import.meta.url)),'--writable','--run-timeout-ms','0','--worker-timeout-ms','1800000','--codex',process.execPath,'--cwd',base,'--script',script,'--run',runDir,'--session','s'],{timeout:15000,windowsHide:true}).catch(()=>{});
  const files=await readdir(runDir),launch=files.find(name=>name.startsWith('launch-'));
  assert.ok(launch);assert.deepEqual(JSON.parse(await readFile(join(runDir,launch),'utf8')).launch.defaults.permissions,{sandbox:'workspace-write'});
  const request=JSON.parse(await readFile(join(runDir,launch),'utf8'));assert.equal(request.timeoutMs,null);assert.equal(request.workerTimeoutMs,1800000);
  const finish=files.find(name=>name.startsWith('finish-'));assert.ok(finish);assert.equal(JSON.parse(await readFile(join(runDir,finish),'utf8')).status,'failed');
});

test('detached restart forwards reconciliation and preserves its original failed execution',async t=>{
  const {startBackground}=await import('../engine/background.mjs');const {runWorkflow}=await import('../engine/controller.mjs');
  const base=await mkdtemp(join(tmpdir(),'workflow-background-restart-'));t.after(()=>rm(base,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
  const runDir=join(base,'run'),cleanup={serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members',nativeTerminals:{inventoryEmpty:true}};
  await runWorkflow({runDir,sessionId:'original',script:'export const meta={name:"restart",description:"proof"};return await agent("A");',launch:{codex:process.execPath,cwd:base,backend:'configured'},backend:{identity:'background-fixture-v1',execute:async()=>{throw Object.assign(new Error('cancelled'),{evidence:{cleanup}});},close:async()=>cleanup}});
  const input={runDir,sessionId:'original',resume:true,expectedGeneration:1,restart:{position:0,attempt:1,reconciliation:'Reviewed the cancelled worker effects.'}};
  const receipt=await startBackground(input,{runnerPath:fileURLToPath(new URL('./fixtures/engine-background.mjs',import.meta.url))});
  assert.equal(receipt.generation,2);
  const completed=await until(()=>readRun(runDir),state=>state.generation===2&&state.status==='completed');
  assert.equal(completed.result,'A');assert.equal(completed.workers[0].attempts,2);assert.deepEqual(completed.workers[0].priorExecutions,[{generation:1,position:0}]);
  assert.equal(completed.restart.reconciliation,input.restart.reconciliation);
  await until(()=>readFile(receipt.resultPath,'utf8'),()=>true);
  await assert.rejects(startBackground(input),{code:'REPLAY_GENERATION'});
});
async function until(read,predicate){
  const deadline=Date.now()+6000;let lastState=null,lastReadError=null;
  while(Date.now()<deadline){const value=await read().catch(error=>{lastReadError={code:String(error.code??'').slice(0,80),message:String(error.message??'').slice(0,300)};return null;});if(value&&typeof value==='object'&&typeof value.status==='string')lastState={status:value.status,generation:value.generation,error:value.error??null,coverage:value.coverage??null};if(value&&predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,20));}
  throw new Error('Background outcome not observed: '+JSON.stringify({lastState,lastReadError}));
}

test('detached controller survives launcher exit, pauses durably and resumes from saved script',async t=>{
  const background=await import('../engine/background.mjs').catch(()=>null);
  assert.equal(typeof background?.startBackground,'function');
  const base=await mkdtemp(join(tmpdir(),'workflow-background-'));
  t.after(()=>rm(base,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
  const runDir=join(base,'run');const input=join(base,'input.json');
  await writeFile(join(base,'hold-A'),'Hold the first worker until pause is applied.');
  const defaults={model:'fixture-model',effort:'low',maxAttempts:2};
  await writeFile(input,JSON.stringify({runDir,sessionId:'original',codex:process.execPath,cwd:base,defaults,timeoutMs:7200000,workerTimeoutMs:1800000,concurrency:1,script:'export const meta={name:"background",description:"proof"};return await parallel([()=>agent("A"),()=>agent("B")]);'}));
  const launch=async()=>JSON.parse((await exec(process.execPath,[fileURLToPath(new URL('./fixtures/engine-launch.mjs',import.meta.url)),input],{timeout:8000,windowsHide:true})).stdout);
  const receipt=await launch();
  assert.equal(receipt.status,'running');
  await until(()=>readRun(runDir),state=>state.workers.some(worker=>worker.status==='running'));
  const requested=JSON.parse((await exec(process.execPath,[fileURLToPath(new URL('../engine/cli.mjs',import.meta.url)),'--run',runDir,'--session','original','--generation','1','--action','pause'],{timeout:3000,windowsHide:true})).stdout);
  assert.equal(requested.action,'pause');
  await until(()=>readControl(runDir,requested.id),receipt=>receipt.status==='applied');
  await unlink(join(base,'hold-A'));
  const paused=await until(()=>readRun(runDir),state=>state.status==='paused');
  assert.deepEqual(paused.launch.defaults,defaults);
  assert.equal(paused.timeoutMs,7200000);assert.equal(paused.workerTimeoutMs,1800000);assert.equal(paused.workers[0].options.timeoutMs,1800000);
  assert.deepEqual(JSON.parse(await readFile(join(base,'backend-defaults.json'),'utf8')),defaults);
  assert.equal(paused.attempts,1);assert.equal(paused.workers[0].result,'A');
  const status=JSON.parse((await exec(process.execPath,[fileURLToPath(new URL('../engine/cli.mjs',import.meta.url)),'--run',runDir,'--status'],{timeout:3000,windowsHide:true})).stdout);
  assert.equal(status.status,'paused');
  await until(()=>readFile(receipt.resultPath,'utf8'),()=>true);
  await writeFile(input,JSON.stringify({runDir,sessionId:'original',resume:true}));
  const resumed=await launch();assert.equal(resumed.generation,2);
  const completed=await until(()=>readRun(runDir),state=>state.status==='completed');
  assert.deepEqual(completed.launch.defaults,defaults);
  assert.equal(completed.timeoutMs,7200000);assert.equal(completed.workerTimeoutMs,1800000);assert.equal(completed.workers[1].options.timeoutMs,1800000);
  assert.deepEqual(JSON.parse(await readFile(join(base,'backend-defaults.json'),'utf8')),defaults);
  assert.deepEqual(completed.result,['A','B']);assert.equal(completed.coverage.cached,1);assert.equal(completed.attempts,2);
  await until(()=>readFile(resumed.resultPath,'utf8'),()=>true);
  await writeFile(input,JSON.stringify({runDir,sessionId:'original',resume:true,defaults:{maxAttempts:3}}));
  const overridden=await launch();assert.equal(overridden.generation,3);
  const replayed=await until(()=>readRun(runDir),state=>state.generation===3&&state.status==='completed');
  assert.deepEqual(replayed.launch.defaults,{...defaults,maxAttempts:3});
  assert.deepEqual(JSON.parse(await readFile(join(base,'backend-defaults.json'),'utf8')),{...defaults,maxAttempts:3});
  await until(()=>readFile(overridden.resultPath,'utf8'),()=>true);
});

for(const mode of ['fail','fail-plain','fail-evidence','slow','unknown'])test(`launcher ${mode} admission preserves failure without worker dispatch`,async t=>{
  const background=await import('../engine/background.mjs').catch(()=>null);
  assert.equal(typeof background?.startBackground,'function');
  const base=await mkdtemp(join(tmpdir(),'workflow-background-failure-'));
  t.after(()=>rm(base,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
  const cwd=join(base,mode);await mkdir(cwd);const runDir=join(base,'run');
  await assert.rejects(background.startBackground({runDir,sessionId:'s',codex:process.execPath,cwd,script:'export const meta={name:"failure",description:"proof"};return await agent("A");'},
    {runnerPath:fileURLToPath(new URL('./fixtures/engine-background.mjs',import.meta.url)),startupMs:mode==='slow'?100:3000}),{code:mode==='slow'?'START_TIMEOUT':'BACKGROUND_FAILED'});
  const files=await until(()=>readdir(runDir),files=>files.some(file=>file.startsWith('finish-')));
  const result=await readFile(join(runDir,files.find(file=>file.startsWith('finish-'))),'utf8');
  assert.equal(JSON.parse(result).status,'failed');assert.doesNotMatch(result,/REVIEW_SECRET_SENTINEL|private@example/);
  if(mode==='fail'){
    const failure=JSON.parse(result).admissionFailure;
    assert.equal(failure.cleanup.jobEmpty,true);assert.equal(failure.cleanup.serverExited,true);
    assert.deepEqual(failure.cleanup.desktopCompatibility,{requested:'shared',applied:false});
    assert.equal(failure.startup[0].stage,'discovery');
  }
  if(mode==='unknown'){
    const failure=JSON.parse(result).admissionFailure;
    assert.equal(failure.cleanup.jobEmpty,false);assert.equal(failure.cleanup.serverExited,false);
    assert.deepEqual(failure.cleanup.desktopCompatibility,{requested:'shared',applied:null});
  }
  const completion=JSON.parse(result);
  if(mode!=='slow'){
   assert.ok(completion.startupDiagnostics,'failed background completion must retain sanitized startup evidence');
   assert.equal(completion.startupDiagnostics.inferenceRequests,0);
  }
  if(mode==='fail-evidence'){
    assert.equal(completion.startupDiagnostics.stage,'buffered-command');
    assert.equal(completion.startupDiagnostics.admission.stages[1].evidence.exitCode,-1073741502);
    assert.equal(completion.startupDiagnostics.cleanup.serverExited,false);
    assert.equal(completion.startupDiagnostics.cleanup.jobEmpty,false);
    assert.deepEqual(completion.startupDiagnostics.startup.map(item=>item.stage),['discovery','admission']);
  }else if(mode==='fail-plain')assert.equal(completion.startupDiagnostics.cleanup.serverExited,null,'missing cleanup remains unknown');
  if(mode!=='slow')assert.deepEqual(completion.startupDiagnostics,completion.admissionFailure,'both receipt surfaces retain the same sanitized admission facts');
  await assert.rejects(stat(join(cwd,'dispatched')),{code:'ENOENT'});
});
