/** @lane merge
 * @subject engine/backend.mjs
 * @subject test/fixtures/backend-startup.mjs
 * @subject bin/doctor-diagnostics.mjs
 * @subject engine/controller.mjs
 * @subject engine/restart.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=fileURLToPath(new URL('./fixtures/backend-startup.mjs',import.meta.url));
const windows=process.platform==='win32';
async function construct(t,scenario={}){
  const directory=await mkdtemp(join(root,'.backend-test-'));
  assert.equal(dirname(directory),resolve(root));
  t.after(async()=>{assert.equal(dirname(directory),resolve(root));await rm(directory,{recursive:true,force:true});});
  const env={...process.env,TEMP:directory,TMP:directory,TMPDIR:directory};delete env.NODE_OPTIONS;
  // This outer process includes real Git capture plus several owned servers.
  // Keep their individual protocol/deadline checks intact; filesystem pressure
  // must not kill the constructor before the tested boundary is reached.
  const result=await promisify(execFile)(process.execPath,[...(scenario.operation==='readiness-restart'?['--disable-warning=ExperimentalWarning']:[]),fixture,'construct',JSON.stringify(scenario)],{cwd:directory,env,windowsHide:true,timeout:60000,maxBuffer:64*1024});
  assert.equal(result.stderr,'');
  assert.doesNotMatch(result.stdout,/BACKEND_SECRET_SENTINEL|private@example/);
  assert.ok(Buffer.byteLength(result.stdout)<32*1024,'startup evidence must stay bounded');
  return JSON.parse(result.stdout);
}
function stopped(report,stage,code){
  assert.equal(report.ok,false);
  assert.equal(report.primary.code,code);
  const expected=['discovery','admission','setup'].slice(0,['discovery','admission','setup'].indexOf(stage)+1);
  assert.deepEqual(report.connections,expected,'no later server is admitted');
  assert.equal(report.trace.some(event=>event.method==='thread/start'||event.method==='turn/start'),false,'no inference after failed construction');
  for(const boundary of expected)assert.equal(report.closeCalls[boundary],1,'each owned boundary is closed only once');
  assert.deepEqual(report.evidence.startup.primary,report.primary,'primary evidence stays separate from cleanup');
  assert.deepEqual(report.evidence.startup.cleanup,report.cleanup);
  assert.deepEqual(report.cleanup.startup.map(record=>record.stage),expected);
}
function retained(report,expected){
  if(windows)assert.equal(report.directories.some(name=>name.startsWith('workflow-job-host-')),expected);
}

test('parent execution reaches launch probe readiness thread and turn without disabling configured integrations',async t=>{
 const report=await construct(t,{parentAccess:true,execute:true,nativeSkills:true});
 assert.equal(report.ok,true);assert.equal(report.value,'BACKEND_OK');
 assert.equal(report.effective.permissions.sandbox,'danger-full-access');
 for(const event of report.trace.filter(event=>event.method==='launch')){assert.equal(event.sandbox,'danger-full-access');assert.equal(event.integrationsDisabled,false);assert.equal(event.delegationDisabled,true);}
 for(const event of report.trace.filter(event=>['command/exec','turn/start'].includes(event.method)))assert.deepEqual(event.sandboxPolicy,{type:'dangerFullAccess'});
 assert.equal(report.trace.find(event=>event.method==='thread/start').sandbox,'danger-full-access');
 assert.equal(report.trace.some(event=>event.method==='windowsSandbox/readiness'),false,'parent mode has no MXC readiness prerequisite');
 assert.equal(report.workerEvidence.nativeIntegrations.invocation,'notVerified');
 assert.deepEqual(report.workerEvidence.nativeIntegrations.servers,[{name:'fixture-server',status:'ready',toolCount:1}]);
 assert.equal(report.workerEvidence.capabilities.native.catalog,'callAndOutputObserved');
 assert.equal(report.cleanup.serverExited,true);
});

test('parent native catalog provisions original plugin roots and observes genuine native calls without manual manifests',async t=>{
 const report=await construct(t,{parentAccess:true,execute:true});
 assert.equal(report.ok,true);assert.equal(report.value,'BACKEND_OK');
 assert.equal(report.parentCapabilities.coverage.complete,true);assert.equal(report.parentCapabilities.coverage.pluginCount,1);
 const thread=report.trace.find(event=>event.method==='thread/start');
 assert.deepEqual(thread.roots,report.parentCapabilities.roots);assert.match(thread.roots[0].location.path,/fixture-plugin[\\/]1\.0\.0$/);
 assert.equal(report.trace.find(event=>event.stage==='worker'&&event.method==='launch').directSkills,true);
 const native=report.workerEvidence.parentCapabilities.native;
 assert.equal(native.catalog,'callAndOutputObserved');assert.equal(native.read,'callAndOutputObserved');
 assert.equal(native.readRootMatch,'notVerified');assert.equal(native.catalogContents,'notRetained');
 assert.deepEqual(report.workerEvidence.nativeIntegrations.authentication,[{name:'fixture-server',status:'oAuth'}]);
 assert.equal(report.trace.find(event=>event.method==='turn/start').nativeSkillGuidance,true);
 assert.doesNotMatch(JSON.stringify(report),/PARENT_SKILL_BODY_NOT_COPIED|PRIVATE_NATIVE_SKILL/);
});

test('parent catalog and selected role roots deduplicate exact paths while keeping role identity',async t=>{
 const report=await construct(t,{parentAccess:true,execute:true,nativeSkills:true});
 assert.equal(report.ok,true);
 const roots=report.trace.find(event=>event.method==='thread/start').roots;
 assert.equal(roots.length,2);assert.equal(new Set(roots.map(root=>root.location.path)).size,2);
 assert.equal(roots.find(root=>root.location.path===report.selectedRoot).id,'native-fixture');
 assert.equal(report.workerEvidence.capabilities.native.read,'callAndOutputObserved');
 assert.equal(report.workerEvidence.parentCapabilities.native.read,'callAndOutputObserved');
});

test('parent tasks need not invoke skills unless explicitly assigned and incomplete catalogs refuse before a model',async t=>{
 const plain=await construct(t,{parentAccess:true,execute:true,worker:{nativeCalls:'none'}});
 assert.equal(plain.ok,true);assert.equal(plain.workerEvidence.parentCapabilities.native.read,'notObserved');
 const blocked=await construct(t,{parentAccess:true,execute:true,setup:{partialCatalog:true}});
 assert.equal(blocked.ok,false);assert.equal(blocked.primary.code,'PARENT_CAPABILITIES');
 assert.equal(blocked.connections.includes('worker'),false);assert.equal(blocked.cleanup.serverExited,true);
 assert.equal(blocked.closeCalls.setup,1);assert.equal(blocked.trace.some(event=>event.method==='turn/start'),false);
});

for(const parentAccess of [false,true])for(const completionSource of ['missing','changed'])test(`selected skill ${completionSource} after model dispatch fails completion under ${parentAccess?'parent':'restricted'} policy despite paired native calls`,async t=>{
 const report=await construct(t,{parentAccess,execute:true,nativeSkills:true,worker:{completionSource}});
 assert.equal(report.ok,false);assert.equal(report.primary.code,'CAPABILITY_SOURCE_CHANGED');
 assert.equal(report.evidence.capabilities.sources.status,'passed','initial admission remains truthful');
 const completion=report.evidence.capabilities.completionSources;
 assert.equal(completion.status,'failed');assert.equal(completion.start,'observed');assert.equal(completion.sourceStatus,'changedOrUnavailable');
 assert.equal(completion.scope,'selected-skills');assert.equal(completion.skillCount,1);
 assert.equal(report.evidence.capabilities.native.read,'callAndOutputObserved','paired output does not prove assigned source remained available');
 assert.equal(report.evidence.attempts.length,1);assert.equal(report.evidence.attempts[0].status,'completed');
 assert.notEqual(report.noInference,true);assert.notEqual(report.notStarted,true);assert.notEqual(report.noProcessStarted,true);
 assert.equal(report.evidence.cleanup.serverExited,true);assert.equal(report.evidence.cleanup.nativeTerminals.inventoryEmpty,true);
 const methods=report.trace.filter(event=>event.stage==='worker').map(event=>event.method),turn=methods.indexOf('turn/start');
 assert.ok(methods.indexOf('command/exec')<turn);assert.ok(methods.lastIndexOf('command/exec')>turn);assert.equal(methods.filter(method=>method==='turn/start').length,1);
});

test('partial required native read and disappeared source retain both observations without repeating the model',async t=>{
 const report=await construct(t,{execute:true,nativeSkills:true,worker:{completionSource:'missing',nativeCalls:'unpaired'}});
 assert.equal(report.ok,false);assert.equal(report.primary.code,'CAPABILITY_SOURCE_CHANGED');
 assert.equal(report.evidence.capabilities.native.read,'callObserved');assert.equal(report.evidence.capabilities.completionSources.sourceStatus,'changedOrUnavailable');
 assert.equal(report.evidence.attempts.length,1);assert.equal(report.closeCalls.worker,1);
});

test('completion source transport failure stays unknown after the observed model result without a retry',async t=>{
 const report=await construct(t,{execute:true,nativeSkills:true,worker:{completionTransportFailure:true}});
 assert.equal(report.ok,false);assert.equal(report.primary.code,'CAPABILITY_SOURCE_UNVERIFIED');assert.equal(report.executionUnknown,true);
 assert.equal(report.evidence.capabilities.sources.status,'passed');assert.equal(report.evidence.capabilities.completionSources.start,'unknown');
 assert.equal(report.evidence.capabilities.completionSources.sourceStatus,'unverified');assert.equal(report.evidence.attempts[0].status,'completed');
 assert.notEqual(report.noInference,true);assert.notEqual(report.notStarted,true);assert.equal(report.closeCalls.worker,1);
 assert.equal(report.trace.filter(event=>event.stage==='worker'&&event.method==='command/exec').length,2);
});

for(const nativeRead of ['error','wrong-root','reference','cursor','partial'])test(`selected activation rejects ${nativeRead} native read evidence even when exact sources remain available`,async t=>{
 const delayed=nativeRead==='error';
 const report=await construct(t,{execute:true,nativeSkills:true,twoSkills:nativeRead==='partial',...(delayed?{setup:{closeDelayMs:150}}:{}),worker:{nativeRead,...(delayed?{closeDelayMs:150}:{})}});
 assert.equal(report.ok,false);assert.equal(report.primary.code,'CAPABILITY_NATIVE_SKILLS');
 const capability=report.evidence.capabilities;
 assert.equal(capability.sources.status,'passed');assert.equal(capability.completionSources.status,'passed');
 assert.equal(capability.native.catalog,'callAndOutputObserved');assert.equal(capability.native.read,'callAndOutputObserved');
 assert.deepEqual(capability.native.missing,[]);
 assert.deepEqual(capability.native.missingSkills,nativeRead==='partial'?['native-second']:['native-fixture']);
 assert.deepEqual(capability.native.activation.observed,nativeRead==='partial'?['native-fixture']:[]);
 assert.equal(capability.native.activation.status,'incomplete');assert.equal(capability.native.activation.body,'notVerified');
 assert.equal(report.evidence.attempts[0].status,'completed');assert.equal(report.evidence.cleanup.serverExited,true);
 if(delayed){
   for(const stage of ['setup','worker'])assert.equal(report.trace.filter(event=>event.stage===stage&&event.method==='fixture/gracefulExit').length,1,'the real fixture must reach its delayed normal exit');
   assert.equal(report.evidence.cleanup.forced,false);
   if(windows)assert.equal(report.evidence.cleanup.jobEmpty,true);
 }
 assert.notEqual(report.noInference,true);assert.doesNotMatch(JSON.stringify(report),/PRIVATE_NATIVE_(SKILL_BODY|READ_ERROR)/);
});

test('parent worker can narrow actual policy before readiness and model dispatch',async t=>{
 const report=await construct(t,{parentAccess:true,execute:true,nativeSkills:true,workerOptions:{permissions:{sandbox:'read-only'}}});
 assert.equal(report.ok,true);
 for(const event of report.trace.filter(event=>event.stage==='worker'&&['command/exec','turn/start'].includes(event.method)))assert.deepEqual(event.sandboxPolicy,{type:'readOnly',networkAccess:false});
 assert.equal(report.trace.find(event=>event.method==='thread/start').sandbox,'read-only');
 assert.equal(report.workerEvidence.settings.permissions.sandbox,'read-only');
});

for(const tamper of ['native','fingerprint'])test(`parent ${tamper} tampering rejects before any subprocess`,async t=>{
 const report=await construct(t,{parentAccess:true,tamper});
 assert.equal(report.ok,false);assert.equal(report.primary.code,'ACCESS_POLICY');assert.deepEqual(report.connections,[]);assert.deepEqual(report.trace,[]);
});

test('parent thread policy mismatch fails before readiness and inference',async t=>{
 const report=await construct(t,{parentAccess:true,execute:true,nativeSkills:true,worker:{wrongPolicy:true}});
 assert.equal(report.ok,false);assert.equal(report.primary.code,'THREAD_POLICY');
 assert.equal(report.trace.some(event=>event.stage==='worker'&&['turn/start','command/exec'].includes(event.method)),false);
 assert.equal(report.evidence.cleanup.serverExited,true);
});

test('parent isolated writer retains full execution policy and exact owned worktree',{skip:!windows},async t=>{
 const report=await construct(t,{parentAccess:true,execute:true,workspace:true,workerOptions:{workspace:'isolated'}});
 assert.equal(report.ok,true,JSON.stringify(report.primary));assert.equal(report.value,'BACKEND_OK');
 const thread=report.trace.find(event=>event.method==='thread/start'),turn=report.trace.find(event=>event.method==='turn/start');
 assert.match(thread.cwd,/source-worktrees[\\/]workflow-/);assert.deepEqual(thread.runtimeWorkspaceRoots,[thread.cwd]);
 assert.equal(thread.sandbox,'danger-full-access');assert.equal(turn.cwd,thread.cwd);assert.deepEqual(turn.runtimeWorkspaceRoots,[thread.cwd]);
 assert.deepEqual(turn.sandboxPolicy,{type:'dangerFullAccess'});assert.equal(report.workerEvidence.settings.workspace,'isolated');
 assert.equal(report.workerEvidence.cleanup.nativeTerminals.inventoryEmpty,true);assert.equal(report.workerEvidence.cleanup.jobEmpty,true);
});

for(const workspace of [false,'tampered'])test(`parent isolated writer rejects ${workspace?'tampered':'missing'} worktree before worker launch`,{skip:!windows},async t=>{
 const report=await construct(t,{parentAccess:true,execute:true,workspace,workerOptions:{workspace:'isolated'}});
 assert.equal(report.ok,false);assert.equal(report.primary.code,workspace?'WORKSPACE_PATH':'WORKSPACE_REQUIRED');
 assert.equal(report.connections.includes('worker'),false);assert.equal(report.noProcessStarted,true);
});

test('parent isolated writer rejects thread that loses its owned workspace',{skip:!windows},async t=>{
 const report=await construct(t,{parentAccess:true,execute:true,workspace:true,workerOptions:{workspace:'isolated'},worker:{wrongWorkspace:true}});
 assert.equal(report.ok,false);assert.equal(report.primary.code,'THREAD_POLICY');
 assert.equal(report.trace.some(event=>event.method==='turn/start'),false);assert.equal(report.evidence.cleanup.jobEmpty,true);
});

test('empty owned job cannot override unresolved native terminal cleanup',async t=>{
  const report=await construct(t,{operation:'workerCleanup'});
  const native={error:{code:'TERMINAL_REMAINING',message:'Native terminals remain'},descendants:'notVerified'};
  assert.equal(report.cleanup.jobEmpty,true);assert.equal(report.cleanup.error.code,'TERMINAL_REMAINING');assert.deepEqual(report.cleanup.nativeTerminals,native);
  assert.equal(report.unverified.error.code,'WORKER_DRAIN');
});

test('successful construction includes every startup boundary in aggregate proof and opts threads into native raw events',async t=>{
  const report=await construct(t,{execute:true,discovery:{forced:true,extra:true}});
  assert.equal(report.ok,true);assert.equal(report.value,'BACKEND_OK');
  assert.deepEqual(report.connections,['discovery','admission','setup','worker']);
  assert.deepEqual(report.closeCalls,{discovery:1,admission:1,setup:1,worker:1});
  assert.equal(report.admission.status,'passed');assert.equal(report.admission.inferenceRequests,0);
  assert.equal(report.cleanup.serverExited,true);assert.equal(report.cleanup.forced,true,'discovery receipt participates in aggregate cleanup');
  assert.equal(report.cleanup.descendants,'notVerified');
  assert.deepEqual(report.cleanup.startup.map(record=>record.stage),['discovery','admission','setup']);
  assert.equal(report.cleanup.startup.every(record=>record.cleanup.serverExited===true),true);
  if(windows){assert.equal(report.cleanup.jobEmpty,true);assert.equal(report.cleanup.startup.every(record=>record.cleanup.jobEmpty===true),true);}
  assert.equal(report.sameClose,true);retained(report,false);
  const thread=report.trace.find(event=>event.method==='thread/start');
  assert.equal(thread.experimentalRawEvents,true);assert.equal(thread.experimentalApi,true);
});

test('selected exact skill roots reach native executor tools without UserInput or extraRoots',async t=>{
  const report=await construct(t,{execute:true,nativeSkills:true});
  assert.equal(report.ok,true);assert.equal(report.value,'BACKEND_OK');
  const thread=report.trace.find(event=>event.method==='thread/start');
  assert.equal(thread.roots.length,1);assert.equal(thread.roots[0].id,'native-fixture');
  assert.equal(thread.roots[0].location.type,'environment');assert.equal(thread.roots[0].location.environmentId,'local');
  assert.equal(thread.roots[0].location.path,report.selectedRoot);
  assert.equal(report.trace.some(event=>event.method.startsWith('skills/extraRoots')),false);
  assert.equal(report.trace.find(event=>event.stage==='worker'&&event.method==='launch').directSkills,true);
  assert.equal(report.trace.filter(event=>event.stage!=='worker'&&event.method==='launch').every(event=>!event.directSkills),true);
  const task=report.trace.find(event=>event.method==='turn/start');
  assert.deepEqual(task.inputTypes,['text']);assert.equal(task.nativeSkillGuidance,true);
  assert.equal(report.workerEvidence.capabilities.sources.status,'passed');
  assert.equal(report.workerEvidence.capabilities.native.catalog,'callAndOutputObserved');
  assert.equal(report.workerEvidence.capabilities.native.read,'callAndOutputObserved');
  assert.equal(report.workerEvidence.capabilities.native.readRootMatch,'observedForSelectedMainReads');
  assert.deepEqual(report.workerEvidence.capabilities.native.activation,{status:'complete',required:['native-fixture'],observed:['native-fixture'],missing:[],body:'notVerified'});
  assert.equal(report.closeCalls.worker,1);
});

for(const nativeCalls of ['none','execOnly','unpaired','forgedCustom','forgedAlias','unsupportedReuse'])test(`selected skills reject ${nativeCalls} manual/CLI completion claims without paired native proof`,async t=>{
 const report=await construct(t,{execute:true,nativeSkills:true,worker:{nativeCalls}});
 assert.equal(report.ok,false);assert.equal(report.primary.code,'CAPABILITY_NATIVE_SKILLS');
 assert.deepEqual(report.evidence.capabilities.native.missing,nativeCalls==='unpaired'?['skills.read']:['skills.list','skills.read']);
 assert.equal(report.evidence.attempts.length,1);assert.equal(report.evidence.commands[0].exitCode,0,'a completed manual command does not satisfy native activation');
 assert.notEqual(report.noInference,true);assert.notEqual(report.noProcessStarted,true);assert.equal(report.closeCalls.worker,1);
 assert.equal(report.evidence.cleanup.serverExited,true);
});

test('executed worker source rejection is zero inference with positive cleanup, not no process started',async t=>{
  const report=await construct(t,{execute:true,nativeSkills:true,worker:{sourceFailure:true}});
  assert.equal(report.ok,false);assert.equal(report.primary.code,'CAPABILITY_READINESS');
  assert.equal(report.noInference,true);assert.notEqual(report.noProcessStarted,true);assert.notEqual(report.notStarted,true);
  assert.equal(report.evidence.capabilities.sources.exitCode,7);assert.equal(report.evidence.capabilities.sources.start,'observed');
  assert.equal(report.trace.some(event=>event.method==='turn/start'),false);assert.equal(report.closeCalls.worker,1);
  assert.equal(report.evidence.cleanup.serverExited,true);
});

test('readiness and post-readiness admission cannot renew the task deadline',async t=>{
  const report=await construct(t,{execute:true,nativeSkills:true,timeoutMs:1500,worker:{sourceDelayMs:500,inventoryDelayMs:1200}});
  assert.equal(report.ok,false);assert.equal(report.primary.code,'TURN_TIMEOUT');assert.equal(report.noInference,true);
  assert.equal(report.evidence.capabilities.sources.start,'observed');assert.equal(report.evidence.capabilities.sources.exitCode,0);
  assert.notEqual(report.noProcessStarted,true);assert.notEqual(report.notStarted,true);
  assert.equal(report.trace.some(event=>event.method==='turn/start'),false);assert.equal(report.closeCalls.worker,1);
  assert.equal(report.evidence.cleanup.nativeTerminals.inventoryEmpty,true,'worker budget expiry preserves the independent cleanup transport');
});

test('persisted readiness failure permits only a reconciled restart after native inventory and owned-job drain',{skip:!windows},async t=>{
  const report=await construct(t,{operation:'readiness-restart',nativeSkills:true,worker:{sourceFailure:true}});
  assert.equal(report.ok,true);
  const worker=report.state.workers[0];
  assert.equal(report.state.status,'failed');assert.equal(worker.status,'failed');assert.equal(worker.error.code,'CAPABILITY_READINESS');
  assert.equal(worker.noInference,true);assert.equal(worker.noProcessStarted,false);assert.equal(worker.notStarted,false);
  assert.equal(worker.evidence.capabilities.sources.start,'observed');assert.equal(worker.evidence.capabilities.sources.exitCode,7);
  assert.equal(report.state.cleanup.serverExited,true);assert.equal(report.state.cleanup.jobEmpty,true);
  assert.equal(worker.evidence.cleanup.nativeTerminals?.inventoryEmpty,true);
  assert.equal(worker.evidence.cleanup.jobEmpty,true);assert.equal(worker.evidence.cleanup.ownershipScope,'windows-job-members');
  assert.equal(report.preview.eligible,true);assert.deepEqual(report.restart.plan.affected,[{position:0,status:'failed',attempts:1,origin:{kind:'guest',ordinal:0}}]);
  assert.equal(report.withoutReconciliation.code,'RESTART_RECONCILE');assert.equal(report.unchanged,true);
  const methods=report.trace.filter(event=>event.stage==='worker').map(event=>event.method);
  assert.ok(methods.indexOf('thread/start')<methods.indexOf('command/exec'));
  assert.equal(methods.filter(method=>method==='thread/backgroundTerminals/list').length,2);
  assert.equal(methods.includes('turn/start'),false);assert.equal(report.closeCalls.worker,1);
});

test('readiness failure with missing native inventory remains unknown and restart-ineligible',{skip:!windows},async t=>{
  const report=await construct(t,{operation:'readiness-restart',nativeSkills:true,worker:{sourceFailure:true,requestFailure:'thread/backgroundTerminals/list'}});
  assert.equal(report.ok,true);assert.equal(report.state.workers[0].status,'unknown');
  assert.equal(report.state.workers[0].noInference,true);assert.equal(report.state.workers[0].notStarted,false);
  assert.equal(report.state.cleanup.jobEmpty,true);
  assert.equal(report.state.workers[0].evidence.cleanup.nativeTerminals.error.code,'RPC_ERROR');
  assert.equal(report.preview.eligible,false);assert.equal(report.restart.error.code,'RESTART_DRAIN');
  assert.equal(report.unchanged,true);assert.equal(report.trace.some(event=>event.method==='turn/start'),false);assert.equal(report.closeCalls.worker,1);
});

for(const close of ['unverified','throw','error',...(windows?['job-false','job-missing','server-missing']:[])]){
  test(`discovery ${close} cleanup blocks admission and retains its owned host`,async t=>{
    const report=await construct(t,{discovery:{close,extra:true}});
    stopped(report,'discovery','DISCOVERY_CLEANUP');assert.equal(report.cleanup.serverExited,false);retained(report,true);
    if(close==='throw')assert.equal(report.cleanup.startup[0].cleanup.error.code,'CHECK_FAILED');
  });
}

for(const close of ['verified','throw']){
  test(`failed discovery config read retains its primary failure with ${close} cleanup`,async t=>{
    const report=await construct(t,{discovery:{requestFailure:'config/read',close}});
    stopped(report,'discovery','RPC_ERROR');assert.equal(report.cleanup.serverExited,close==='verified');retained(report,close!=='verified');
    if(close==='throw')assert.equal(report.cleanup.startup[0].cleanup.error.code,'CHECK_FAILED');
  });
}

test('discovery restriction failure still drains the owned server without admitting a probe',async t=>{
  const report=await construct(t,{discovery:{badIntegration:true}});
  stopped(report,'discovery','WORKER_CAPABILITIES');assert.equal(report.cleanup.serverExited,true);retained(report,false);
});

test('admission config failure closes once before any command or setup server',async t=>{
  const report=await construct(t,{admission:{requestFailure:'config/read',close:'throw'}});
  stopped(report,'admission','RPC_ERROR');assert.equal(report.trace.some(event=>event.method==='command/exec'),false);
  assert.equal(report.cleanup.serverExited,false);retained(report,true);
});

for(const close of ['unverified','throw','error',...(windows?['job-false','job-missing']:[])]){
  test(`admission probe ${close} cleanup refuses a setup server even after successful commands`,async t=>{
    const report=await construct(t,{admission:{close}});
    assert.equal(report.ok,false);assert.equal(report.connections.includes('setup'),false);
    assert.equal(report.trace.filter(event=>event.method==='command/exec').length,4);
    stopped(report,'admission',close==='unverified'||close==='throw'?'ADMISSION_FAILED':'ADMISSION_CLEANUP');
    assert.equal(report.admission.status,'failed','retain command probe evidence when ownership admission fails');
    assert.deepEqual(report.admission.cleanup,report.cleanup.startup.at(-1).cleanup);
    assert.equal(report.cleanup.serverExited,false);retained(report,true);
  });
}

test('probe primary failure remains separate from throwing admission cleanup',async t=>{
  const report=await construct(t,{admission:{requestFailure:'command/exec',close:'throw'}});
  stopped(report,'admission','ADMISSION_FAILED');assert.equal(report.admission.error.code,'RPC_ERROR');
  assert.equal(report.admission.cleanup.error.code,'CHECK_FAILED');assert.equal(report.cleanup.serverExited,false);retained(report,true);
});

for(const close of ['unverified','throw','error',...(windows?['job-false','job-missing']:[])]){
  test(`setup ${close} cleanup blocks backend construction without retrying close`,async t=>{
    const report=await construct(t,{setup:{close}});
    stopped(report,'setup','SETUP_CLEANUP');assert.equal(report.cleanup.serverExited,false);retained(report,true);
  });
}

for(const close of ['verified','throw']){
  test(`setup catalog failure preserves the primary error with ${close} cleanup`,async t=>{
    const report=await construct(t,{setup:{badCatalog:true,close}});
    stopped(report,'setup','MODEL_CATALOG');assert.equal(report.cleanup.serverExited,close==='verified');retained(report,close!=='verified');
  });
}

for(const stage of ['discovery','admission','setup']){
  test(`${stage} connection initialization failure retains the transport-owned cleanup without closing again`,async t=>{
    const report=await construct(t,{[stage]:{requestFailure:'initialize',close:'unverified'}});
    stopped(report,stage,'RPC_ERROR');assert.equal(report.cleanup.serverExited,false);retained(report,true);
  });
}

test('pre-ownership job-host setup failure releases temporary storage without launching a server',{skip:!windows},async t=>{
  const report=await construct(t,{buildFailure:true});
  assert.equal(report.ok,false);assert.equal(report.primary.code,'JOB_BUILD');
  assert.deepEqual(report.connections,[]);assert.deepEqual(report.closeCalls,{});retained(report,false);
});

for(const login of ['absent','warning-absent'])test(`native ${login} login refusal is classified before any App Server or inference`,async t=>{
 const report=await construct(t,{login});assert.equal(report.ok,false);assert.equal(report.primary.code,'AUTH_UNSUPPORTED');
 assert.deepEqual(report.connections,[]);assert.deepEqual(report.closeCalls,{});assert.deepEqual(report.trace,[]);retained(report,false);
 assert.equal(report.doctor.status,'failed');assert.equal(report.doctor.stage,'authentication');assert.equal(report.doctor.error.code,'AUTH_UNSUPPORTED');assert.equal(report.doctor.inferenceRequests,0);
 assert.equal(report.doctor.cleanup.serverExited,null,'no App Server cleanup is invented before startup');
});
for(const login of ['unknown','wrong-exit','missing','timeout'])test(`native login ${login} failure is not misclassified as absent authentication`,async t=>{
 const report=await construct(t,{login});assert.equal(report.ok,false);assert.equal(report.primary.code,'CHECK_FAILED');assert.equal(report.doctor.stage,'authentication');
 assert.deepEqual(report.connections,[]);assert.deepEqual(report.trace,[]);retained(report,false);
 const command=report.evidence.startup.command;
 assert.equal(report.evidence.startup.stage,'authentication');
 assert.deepEqual(report.doctor.construction,{stage:'authentication',command});
 assert.equal(report.doctor.inferenceRequests,0);assert.equal(report.doctor.cleanup.serverExited,null);
 assert.notEqual(report.noProcessStarted,true);assert.notEqual(report.notStarted,true);
 if(login==='unknown'){assert.equal(command.exitCode,1);assert.ok(command.stderrBytes>0);}
 if(login==='wrong-exit')assert.equal(command.exitCode,2);
 if(login==='missing'){assert.equal(command.exitCode,null);assert.equal(command.killed,null);}
 if(login==='timeout'){assert.equal(command.exitCode,null);assert.equal(command.killed,true);assert.equal(command.signal,'termination');}
});

test('failed native version subprocess retains only bounded construction facts before any server starts',async t=>{
 const report=await construct(t,{version:'failed'}),bytes=Buffer.byteLength('BACKEND_SECRET_SENTINEL private@example.invalid');
 assert.equal(report.ok,false);assert.equal(report.primary.code,'CHECK_FAILED');
 assert.deepEqual(report.connections,[]);assert.deepEqual(report.trace,[]);retained(report,false);
 const command={exitCode:7,killed:false,signal:'none',stdoutBytes:bytes,stderrBytes:bytes+1};
 assert.equal(report.evidence.startup.stage,'version');assert.deepEqual(report.evidence.startup.command,command);
 assert.deepEqual(report.doctor.construction,{stage:'version',command});assert.equal(report.doctor.stage,'version');
 assert.equal(report.doctor.cleanup.serverExited,null);assert.equal(report.doctor.inferenceRequests,0);
 assert.notEqual(report.noProcessStarted,true);assert.notEqual(report.notStarted,true);
});


test('backend registers one live budget before readiness and clearing keeps command caps independent',async t=>{
 const report=await construct(t,{execute:true,nativeSkills:true,timeoutMs:30,liveChange:{operation:'clear'},worker:{sourceDelayMs:150}});
 assert.equal(report.ok,true);assert.equal(report.value,'BACKEND_OK');
 assert.equal(report.deadlineRegistered.status,'active');assert.equal(report.deadlineRegistered.configuredTimeoutMs,30);
 assert.equal(report.deadlineFinal.status,'closed');assert.equal(report.deadlineFinal.revision,1);assert.equal(report.deadlineFinal.remainingMs,null);
 assert.equal(report.trace.filter(event=>event.method==='thread/start').length,1);assert.equal(report.trace.filter(event=>event.method==='turn/start').length,1);
 assert.equal(report.workerEvidence.cleanup.serverExited,true);assert.equal(report.workerEvidence.cleanup.nativeTerminals.inventoryEmpty,true);
});

test('default backend workers have no wall budget and retain positive cleanup',async t=>{
 const report=await construct(t,{execute:true});assert.equal(report.ok,true);
 assert.equal(report.deadlineRegistered.configuredTimeoutMs,null);assert.equal(report.deadlineRegistered.remainingMs,null);assert.equal(report.deadlineFinal.status,'closed');
 assert.equal(report.workerEvidence.cleanup.serverExited,true);
});


test('live clear during readiness does not leave the submitted command bound to the old wall time',async t=>{
 const report=await construct(t,{execute:true,nativeSkills:true,timeoutMs:250,liveChangeDelayMs:60,liveChange:{operation:'clear'},worker:{sourceDelayMs:300}});
 assert.equal(report.ok,true);assert.equal(report.deadlineFinal.revision,1);
 const checks=report.trace.filter(event=>event.stage==='worker'&&event.method==='command/exec');assert.ok(checks.length>=2);assert.ok(checks.every(event=>event.commandTimeoutMs===20000));
 assert.equal(report.trace.filter(event=>event.method==='turn/start').length,1);assert.equal(report.workerEvidence.cleanup.nativeTerminals.inventoryEmpty,true);
});

test('live set on an unbounded active backend turn expires with one interrupt and positive cleanup',async t=>{
 const report=await construct(t,{execute:true,activeChange:{operation:'set',valueMs:30},worker:{turnDelayMs:200}});
 assert.equal(report.ok,false);assert.equal(report.primary.code,'TURN_TIMEOUT');assert.notEqual(report.noInference,true);
 assert.equal(report.evidence.attempts.length,1);assert.equal(report.evidence.attempts[0].error.code,'TURN_TIMEOUT');
 assert.equal(report.trace.filter(event=>event.method==='turn/start').length,1);assert.equal(report.trace.filter(event=>event.method==='turn/interrupt').length,1);
 assert.equal(report.evidence.cleanup.serverExited,true);assert.equal(report.evidence.cleanup.nativeTerminals.inventoryEmpty,true);assert.equal(report.evidence.deadline.status,'closed');
});

test('deadline expiry during completion source checks retains the completed model and uncertain command facts',async t=>{
 const report=await construct(t,{execute:true,nativeSkills:true,activeChange:{operation:'set',valueMs:150},worker:{sourceDelayMs:350}});
 assert.equal(report.ok,false);assert.equal(report.primary.code,'TURN_TIMEOUT');assert.notEqual(report.noInference,true);
 assert.equal(report.evidence.attempts.length,1);assert.equal(report.evidence.attempts[0].status,'completed');
 assert.equal(report.evidence.capabilities.completionSources.start,'unknown');assert.equal(report.evidence.capabilities.completionSources.sourceStatus,'unverified');
 assert.equal(report.evidence.cleanup.serverExited,true);assert.equal(report.evidence.cleanup.nativeTerminals.inventoryEmpty,true);
 assert.equal(report.trace.filter(row=>row.method==='turn/start').length,1);
});

test('a later deadline during bounded interruption cannot replace the earlier active failure',async t=>{
 const report=await construct(t,{execute:true,activeFailure:true,activeChange:{operation:'set',valueMs:100},worker:{turnDelayMs:500,interruptDelayMs:250}});
 assert.equal(report.ok,false);assert.equal(report.primary.code,'CONTROL_FIXTURE');
 assert.equal(report.evidence.attempts[0].error.code,'CONTROL_FIXTURE');assert.equal(report.evidence.cleanup.serverExited,true);
 assert.equal(report.trace.filter(row=>row.method==='turn/start').length,1);assert.equal(report.trace.filter(row=>row.method==='turn/interrupt').length,1);
});
