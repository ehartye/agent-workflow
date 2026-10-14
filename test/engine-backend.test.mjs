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
  const result=await promisify(execFile)(process.execPath,[...(scenario.operation==='readiness-restart'?['--disable-warning=ExperimentalWarning']:[]),fixture,'construct',JSON.stringify(scenario)],{cwd:directory,env,windowsHide:true,timeout:10000,maxBuffer:64*1024});
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
  assert.equal(report.workerEvidence.capabilities.native.readRootMatch,'notVerified','paired calls do not certify every selected root/content');
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
  assert.equal(report.ok,false);assert.equal(report.primary.code,'REQUEST_TIMEOUT');assert.equal(report.noInference,true);
  assert.equal(report.evidence.capabilities.sources.start,'observed');assert.equal(report.evidence.capabilities.sources.exitCode,0);
  assert.notEqual(report.noProcessStarted,true);assert.notEqual(report.notStarted,true);
  assert.equal(report.trace.some(event=>event.method==='turn/start'),false);assert.equal(report.closeCalls.worker,1);
  assert.ok(report.evidence.cleanup.nativeTerminals.error,'timed-out transport cannot invent native inventory proof');
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
  assert.equal(report.preview.eligible,true);assert.deepEqual(report.restart.plan.affected,[{position:0,status:'failed',attempts:1}]);
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
 const report=await construct(t,{login});assert.equal(report.ok,false);assert.equal(report.primary.code,'CHECK_FAILED');assert.equal(report.doctor.stage,'backend');
 assert.deepEqual(report.connections,[]);assert.deepEqual(report.trace,[]);retained(report,false);
});
