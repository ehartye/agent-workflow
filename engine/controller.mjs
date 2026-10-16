import { DatabaseSync } from 'node:sqlite';
import { mkdir, open, readFile, lstat, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, isAbsolute } from 'node:path';
import { evaluate } from './evaluate.mjs';
import {resolveDeadlines,MAX_WORKER_TIMEOUT_MS} from './deadlines.mjs';
import { parseScript } from './script.mjs';
import { compileSchema } from './schema.mjs';
import {createActivityTable,recordActivity} from './activity.mjs';
import {admitNotifications,recordNotificationProgress,recordWorkerNotification,recordRunNotification} from './notifications.mjs';
import {assertWorkerTarget} from './controls.mjs';
import {restartPlan} from './restart.mjs';
import {runWorkspaces} from './workspace-run.mjs';
import {collectWorkspace,verifyWorkspace,loadInputs} from './workspaces.mjs';
import * as workspaceCapture from './workspaces.mjs';
import * as workspacePolicy from './workspace-policy.mjs';
import {assertLifecycleReplay} from './run-lifecycle.mjs';
import { fault, diagnostic } from '../foundation/client.mjs';
import {freezeCapabilities,selectCapabilities} from './worker-capabilities.mjs';
import {validateAccessPolicy} from './access-policy.mjs';
import {initializeAdmission,projectAdmission,projectAdditionWorkers,allocateSlot,consumeAttempt,releaseReservation,closeAdmission,pendingAdditions,transaction,abandonUnstartedAdmission} from './append.mjs';
import {freezeWorkflowSources,verifyWorkflowSources,createCompositionRuntime} from './composition.mjs';
import {createRootContext,contextRunRef,createCompositionTables,validateInvocationHistory,writeInvocation} from './composition-store.mjs';
import {createStepTables,retainStepCatalog,associateStep,loadStepCatalogs,validateStepBindings,projectSteps} from './steps.mjs';
import {digest,canonicalJSON,validateArtifactScope} from './composition-contracts.mjs';
export {requestControl,readControl} from './controls.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function json(value) {
  const text = JSON.stringify(value, (_, item) => {
    if (['undefined','function','symbol','bigint'].includes(typeof item) || typeof item === 'number' && !Number.isFinite(item)) throw fault('RESULT_JSON', 'Workflow values must be JSON');
    return item;
  });
  if (text == null || Buffer.byteLength(text) > 2 * 1024 * 1024) throw fault('RESULT_SIZE', 'Workflow record exceeded its limit');
  return text;
}
// A necessary lower bound, not a prediction of the final header: backend,
// runtime, workspace and lifecycle facts are added during execution.
export function preflightRunInput({script,args=null,launch=null,workerCapabilities,workerCapabilitiesHash,workerCapabilitySources,capturePolicy}) {
  const {meta}=parseScript(script),record={meta,script,args,launch};
  const capabilities=workerCapabilities??launch?.workerCapabilities;
  if(capabilities!==undefined){
    record.workerCapabilities=capabilities;
    const fingerprint=workerCapabilitiesHash??launch?.workerCapabilitiesHash;
    if(fingerprint!==undefined)record.workerCapabilitiesHash=fingerprint;
    if(workerCapabilitySources!==undefined)record.workerCapabilitySources=workerCapabilitySources;
  }
  if(launch?.accessPolicy!==undefined)record.accessPolicy=launch.accessPolicy;
  const policy=capturePolicy??launch?.capturePolicy;
  if(policy!==undefined){record.capturePolicy=policy;if(launch?.capturePolicyHash!==undefined)record.capturePolicyHash=launch.capturePolicyHash;}
  try{json(record);}catch(error){
    if(error.code==='RESULT_SIZE')throw fault('RESULT_SIZE','Known persisted run input exceeds the 2 MiB record limit; use file-backed manifests with hashes and bounded ranges');
    throw error;
  }
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return json(value);
}
async function regular(path, optional = false) {
  try { if (!(await lstat(path)).isFile()) throw fault('RUN_PATH', 'Run artifacts must be regular files'); }
  catch (error) { if (!optional || error.code !== 'ENOENT') throw error; }
}
function identity() {
  const files = ['controller.mjs','notifications.mjs','run-lifecycle.mjs','deadlines.mjs','live-deadline.mjs','controls.mjs','restart.mjs','activity.mjs','schema.mjs','settings.mjs','access-policy.mjs','parent-capabilities.mjs','capability-sources.mjs','worker-session.mjs','worker-capabilities.mjs','workspace-run.mjs','workspaces.mjs','workspace-policy.mjs','script.mjs','evaluate.mjs','evaluator-child.mjs','backend.mjs','policy.mjs','../foundation/client.mjs','../foundation/turn.mjs','../foundation/tool-observation.mjs','../foundation/terminals.mjs','../foundation/windows-job.mjs','../foundation/native/JobHost.cs','../foundation/native/job-host-policy.json','../foundation/native/win32-x64/manifest.json','../foundation/native/win32-x64/workflow-job-host.exe','../foundation/launch.mjs','../foundation/probe.mjs','../package-lock.json'];
  return hash(process.version + [...files,'append.mjs','composition.mjs','composition-store.mjs','composition-contracts.mjs','steps.mjs'].map(file => hash(readFileSync(new URL(file, import.meta.url)))).join(''));
}
function snapshot(db) {
  const header = db.prepare("SELECT value FROM header WHERE id=1").get();
  if (!header) return null;
  const state = projectAdmission(db,JSON.parse(header.value));
  const workers = projectAdditionWorkers(db,state,db.prepare('SELECT value FROM workers WHERE generation=? ORDER BY position LIMIT 1001').all(state.generation).map(row => JSON.parse(row.value)));
  const completed = workers.filter(worker => worker.status === 'completed').length;
  const added=workers.filter(worker=>worker.origin?.kind==='append');
  return { ...state, workers,additions:{requested:added.length,completed:added.filter(worker=>worker.status==='completed').length,failed:added.filter(worker=>worker.status==='failed').length,unknown:added.filter(worker=>worker.status==='unknown').length}, coverage: { requested: workers.length, completed,
    cached: workers.filter(worker => worker.cached).length,
    failed: workers.filter(worker => worker.status === 'failed').length,
    unknown: workers.filter(worker => worker.status === 'unknown').length,
    complete: state.status === 'completed' && completed === workers.length,
  } };
}
export async function readRun(runDir) {
  const path = join(runDir, 'run.sqlite');
  await regular(path);
  const db = new DatabaseSync(path, { readOnly: true });
  try { db.exec('BEGIN');const value=snapshot(db);if(value?.compositionVersion===1){const run=await contextRunRef({runDir,sessionId:value.sessionId}),sources=await verifyWorkflowSources({runDir,descriptor:value.workflowSources}),context=createRootContext({db,runDir,run,generation:value.generation,sessionId:value.sessionId,state:value,sources,signal:new AbortController().signal,assertOwner:()=>{},transaction:()=>{throw fault('COMPOSITION_INPUT','Saved read cannot publish records');},workspaceInputs:async()=>value.workspaceInputs??null,resolveWorker:async()=>null,resolveAuthority:()=>null});await validateInvocationHistory({context});}
    if(value?.stepsVersion===1){const run=await contextRunRef({runDir,sessionId:value.sessionId}),catalogs=loadStepCatalogs(db,value.generation);validateStepBindings({db,state:value,catalogs,run});projectSteps({catalogs,workers:value.workers,run,generation:value.generation,available:true,accepting:value.acceptingAdditions});}db.exec('COMMIT');return value; } finally { db.close(); }
}

export async function runWorkflow({ runDir, sessionId, script, args = null, backend, resume = false, expectedGeneration, restart, workflowRevisions, accessPolicy,capturePolicy,workerCapabilities,workerCapabilitiesHash, concurrency = 2, maxAgents = 1000, timeoutMs, workerTimeoutMs, drainTimeoutMs=20000, onReady, launch=null }) {
  let db, lease, state, primary;
  let leaseOwned = false;
  let stopped = false;
  let fatal;
  let active = 0;
  let sequence = 0;
  let chain = '';
  let reuse = true;
  let currentPhase = '';
  let controlAction;
  let controlTimer;
  let lifetimeTimer;
  let evaluationStartedAt;
  let pumpAdditions=()=>{};
  let dispatchReady=false;
  let additionFailure;
  const replayAdditions=new Map();
  let drainTimer,expireDrain;
  let drainBy=Infinity;
  const armDrain=ms=>{drainBy=Math.min(drainBy,performance.now()+ms);clearTimeout(drainTimer);drainTimer=setTimeout(()=>expireDrain(false),Math.max(0,drainBy-performance.now()));};
  let retiredWrites=false;
  const currentWorkers=new Map();
  const workerAborts=new Map();
  const workerDeadlines=new Map();
  const steering=new Set();
  let controlsRetired=false;
  const workerIds=new Map();
  const settlements=new Map();
  const waiters = [];
  const calls = new Set();
  const abort = new AbortController();
  abort.signal.addEventListener('abort',()=>{if(expireDrain)armDrain(drainTimeoutMs);},{once:true});
  const evaluatorAbort = new AbortController();
  const token = randomUUID();
  const lock = typeof runDir === 'string' ? join(runDir, 'owner.lock') : '';
  let closed;
  const closeBackend = () => closed ??= Promise.resolve().then(() => backend.close());
  const own = () => { if (readFileSync(lock, 'utf8') !== token) throw fault('RUN_OWNERSHIP', 'Run ownership changed'); };
  const saveHeader = () => { own(); projectAdmission(db,state);db.prepare('INSERT OR REPLACE INTO header(id,value) VALUES(1,?)').run(json(state)); };
  const saveWorker = (worker,message,terminalReady=false) => {
    own();
    const next=message?structuredClone(worker):worker;
    state.workerCount = Math.max(state.workerCount, worker.position + 1);
    transaction(db,()=>{
      if(message)recordNotificationProgress(db,{generation:state.generation,worker:next,record:recordActivity(db,{generation:state.generation,worker:next,message})});
      db.prepare('INSERT OR REPLACE INTO workers(generation,position,value) VALUES(?,?,?)').run(state.generation, next.position, json(next));
      projectAdmission(db,state);
      db.prepare('INSERT OR REPLACE INTO header(id,value) VALUES(1,?)').run(json(state));
      if(terminalReady)recordWorkerNotification(db,state,next);
      if(message)Object.assign(worker,next);
    });
  };
  const cancelled=()=>Object.assign(fault('WORKER_CANCELLED','Worker was cancelled before dispatch'),{notStarted:true});
  const waitFor=async(promise,signal)=>{
    if(signal.aborted)throw cancelled();
    let cancel;
    try{return await Promise.race([promise,new Promise((_,reject)=>{cancel=()=>reject(cancelled());signal.addEventListener('abort',cancel,{once:true});})]);}
    finally{signal.removeEventListener('abort',cancel);}
  };
  const acquire = async (signal,addition=false) => {
    const closed=()=>stopped&&!(addition&&controlAction==='pause');
    if (closed()) throw fault('RUN_STOPPED', 'Workflow admission is closed');
    if(signal.aborted)throw cancelled();
    if(active<concurrency&&!waiters.length){active++;return;}
    await new Promise((resolve,reject)=>{
      const cancel=()=>{const index=waiters.indexOf(admit);if(index!==-1)waiters.splice(index,1);reject(cancelled());};
      const admit=()=>{
        signal.removeEventListener('abort',cancel);
        if(closed()){reject(fault('RUN_STOPPED','Workflow admission is closed'));waiters.shift()?.();return;}
        if(signal.aborted)return reject(cancelled());
        active++;resolve();
      };
      waiters.push(admit);signal.addEventListener('abort',cancel,{once:true});
    });
  };
  const release = () => { active--; waiters.shift()?.(); };
  try {
    const { meta } = parseScript(script);
    resolveDeadlines({timeoutMs,workerTimeoutMs});
    if(!Number.isFinite(drainTimeoutMs)||drainTimeoutMs<=0)throw fault('RUN_INPUT','A positive drain deadline is required');
    if (!isAbsolute(runDir ?? '') || typeof sessionId !== 'string' || !sessionId || sessionId.length > 256 || !backend || typeof backend.execute !== 'function' || typeof backend.close !== 'function' || typeof backend.identity !== 'string' || !backend.identity || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 256 || !Number.isInteger(maxAgents) || maxAgents < 1 || maxAgents > 1000) throw fault('RUN_INPUT', 'Invalid workflow identity, backend or limits');
    json(args);
    if(!resume)preflightRunInput({script,args,launch,workerCapabilities,workerCapabilitiesHash,capturePolicy});
    if(resume&&accessPolicy!==undefined)throw fault('ACCESS_OVERRIDE','Resume/restart retain their original access policy');
    const checkedAccess=value=>value===undefined?undefined:validateAccessPolicy(value,{sessionId});
    const inputAccess=checkedAccess(accessPolicy),launchAccess=checkedAccess(launch?.accessPolicy),backendAccess=checkedAccess(backend.accessPolicy);
    if(inputAccess&&launchAccess&&inputAccess.fingerprint!==launchAccess.fingerprint)throw fault('ACCESS_POLICY','Input and launch access policies disagree');
    let normalizedAccess=inputAccess??launchAccess;
    await mkdir(runDir, { recursive: true });
    if (!(await lstat(runDir)).isDirectory()) throw fault('RUN_PATH', 'Run directory must not be a symlink');
    try { lease = await open(lock, 'wx'); leaseOwned = true; await lease.writeFile(token); await lease.sync(); }
    catch (error) { if (error.code === 'EEXIST') throw fault('RUN_LOCKED', 'Run already has an owner; stale ownership requires inspection'); throw error; }
    const path = join(runDir, 'run.sqlite');
    await regular(path, true);
    db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000; CREATE TABLE IF NOT EXISTS header(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS workers(generation INTEGER NOT NULL,position INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(generation,position)); CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,generation INTEGER NOT NULL,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS controls(id TEXT PRIMARY KEY,generation INTEGER NOT NULL,value TEXT NOT NULL);');
    createActivityTable(db);
    const previous = snapshot(db);
    assertLifecycleReplay(db);
    ({timeoutMs,workerTimeoutMs}=resolveDeadlines({timeoutMs,workerTimeoutMs},previous??{}));
    const previousHeader=db.prepare('SELECT value FROM header WHERE id=1').get()?.value;
    if(expectedGeneration!==undefined&&previous?.generation!==expectedGeneration)throw fault('REPLAY_GENERATION','Run generation changed; refresh before resuming');
    const runtimeIdentity = identity();
    if (previous && !resume) throw fault('RUN_EXISTS', 'Existing run requires explicit resume');
    if (!previous && resume) throw fault('REPLAY_MISSING', 'No saved run exists to replay');
    if (previous && (previous.version !== 1 || !Number.isInteger(previous.generation) || !Number.isInteger(previous.workerCount) || previous.workerCount !== previous.workers.length || previous.workers.some((worker, index) => worker.position !== index || !['queued','running','completed','failed','unknown'].includes(worker.status) || worker.status === 'completed' && (!Object.hasOwn(worker,'result') || hash(json(worker.result)) !== worker.resultHash)))) throw fault('REPLAY_CORRUPT', 'Saved run or worker evidence is missing or corrupt');
    if (previous?.sessionId && previous.sessionId !== sessionId) throw fault('REPLAY_SESSION', 'Saved results belong to a different session');
    if(previous){
      const savedAccess=checkedAccess(previous.accessPolicy),savedLaunchAccess=checkedAccess(previous.launch?.accessPolicy);
      if(savedAccess?.fingerprint!==savedLaunchAccess?.fingerprint)throw fault('ACCESS_POLICY','Saved header and launch access policies disagree');
      if(launchAccess&&launchAccess.fingerprint!==savedAccess?.fingerprint)throw fault('ACCESS_OVERRIDE','Resume/restart retain their original access policy');
      normalizedAccess=savedAccess;
      launch??=previous.launch;
    }
    if(normalizedAccess?.fingerprint!==backendAccess?.fingerprint)throw fault('ACCESS_POLICY','Backend did not confirm the admitted access policy');
    if(normalizedAccess)launch={...launch,accessPolicy:normalizedAccess};
    const capabilitySources=backend.capabilitySources;
    if(previous&&previous.launch?.capabilitySources===undefined&&capabilitySources!==undefined)throw fault('CAPABILITY_IDENTITY','Saved descriptorless runs cannot acquire retained source bindings');
    if(previous?.launch?.capabilitySources!==undefined&&canonical(previous.launch.capabilitySources)!==canonical(capabilitySources??null)||launch?.capabilitySources!==undefined&&canonical(launch.capabilitySources)!==canonical(capabilitySources??null))throw fault('CAPABILITY_IDENTITY','Saved source packages require their exact admitted backend binding');
    if(capabilitySources!==undefined)launch={...launch,capabilitySources};
    // Catalog drift is an authority/source change, not a model-default cache miss.
    // Take its identity only from the admitted backend, before any new generation.
    let parentCapabilitiesHash;
    if(normalizedAccess?.policy.access==='parent'){
      parentCapabilitiesHash=backend.parentCapabilities?.fingerprint;
      if(typeof parentCapabilitiesHash!=='string'||!/^[a-f0-9]{64}$/.test(parentCapabilitiesHash)||backend.parentCapabilities?.coverage?.complete!==true||previous&&previous.parentCapabilitiesHash!==parentCapabilitiesHash)throw fault('PARENT_CAPABILITIES_CHANGED','Parent native catalog identity is missing, incomplete or changed; start a new admitted run');
    }else if(previous?.parentCapabilitiesHash!==undefined)throw fault('PARENT_CAPABILITIES_CHANGED','Saved parent native catalog requires its original parent access');
    if(previous&&(workerCapabilities!==undefined||launch?.workerCapabilities!==undefined&&canonical(launch.workerCapabilities)!==canonical(previous.workerCapabilities??null)))throw fault('CAPABILITY_OVERRIDE','Resume/restart retain their original worker capability bundle');
    const capabilityValue=previous?previous.workerCapabilities:workerCapabilities??launch?.workerCapabilities;
    const capabilities=capabilityValue===undefined?null:await freezeCapabilities(capabilityValue,{runDir,capabilitySources});
    if(previous?.workerCapabilitiesHash!==undefined&&capabilities?.fingerprint!==previous.workerCapabilitiesHash||workerCapabilitiesHash!==undefined&&capabilities?.fingerprint!==workerCapabilitiesHash||launch?.workerCapabilitiesHash!==undefined&&capabilities?.fingerprint!==launch.workerCapabilitiesHash||capabilities&&backend.workerCapabilitiesHash!==undefined&&backend.workerCapabilitiesHash!==capabilities.fingerprint)throw fault('CAPABILITY_IDENTITY','Capability ceiling fingerprint changed or is inconsistent');
    if(previous&&capabilities&&(previous.workerCapabilitySources===undefined||canonical(previous.workerCapabilitySources)!==canonical(capabilities.toolSources)))throw fault('CAPABILITY_IDENTITY','Declared tool source availability changed or is missing; cached results cannot be reused');
    if(capabilities&&launch)launch={...launch,workerCapabilities:capabilities.manifest,workerCapabilitiesHash:capabilities.fingerprint};
    if(launch?.artifactScope){const scope=validateArtifactScope(launch.artifactScope.scope);if(scope.scopeHash!==launch.artifactScope.scopeHash||previous&&canonicalJSON(previous.launch?.artifactScope??null)!==canonicalJSON(scope))throw fault('ARTIFACT_OWNERSHIP','Artifact scope identity changed');if(!normalizedAccess||launch.defaults?.workspace!=='isolated'&&launch.defaults?.permissions?.sandbox!=='workspace-write')throw fault('ARTIFACT_OWNERSHIP','Artifact scope requires an admitted writable launch');}
    if(previous&&(capturePolicy!==undefined||launch?.capturePolicy!==undefined&&canonical(launch.capturePolicy)!==canonical(previous.capturePolicy??null)))throw fault('CAPTURE_POLICY_OVERRIDE','Resume/restart must use the saved capture policy; a change requires a new run');
    const suppliedPolicy=previous?previous.capturePolicy:capturePolicy??launch?.capturePolicy;
    let normalizedPolicy;
    if(suppliedPolicy!==undefined){
      if(typeof workspacePolicy.validateCapturePolicy!=='function'||typeof workspaceCapture.readWorkspaceExclusions!=='function')throw fault('CAPTURE_POLICY_UNAVAILABLE','Capture policy admission requires coordinator-integrated version 2 capture exports');
      normalizedPolicy=workspacePolicy.validateCapturePolicy(suppliedPolicy);
      if(previous&&normalizedPolicy.policyHash!==previous.capturePolicyHash||previous?.workspaceInputs&&previous.workspaceInputs.policyHash!==normalizedPolicy.policyHash)throw fault('CAPTURE_POLICY_IDENTITY','Saved capture policy identity changed');
      if(launch)launch={...launch,capturePolicy:normalizedPolicy.policy,capturePolicyHash:normalizedPolicy.policyHash};
    }else if(previous?.capturePolicyHash!==undefined||previous?.workspaceInputs?.version===2)throw fault('CAPTURE_POLICY_IDENTITY','Version 2 captured inputs require their saved policy');
    let restartAdmission;
    if(restart!==undefined){
      if(!resume||!Number.isInteger(expectedGeneration))throw fault('RESTART_INPUT','Restart requires explicit resume and the observed generation');
      restartAdmission=restartPlan(previous,restart);
      if(script!==previous.script||canonical(args)!==canonical(previous.args)||backend.identity!==previous.backendIdentity||maxAgents!==previous.maxAgents||timeoutMs!==previous.timeoutMs||workerTimeoutMs!==previous.workerTimeoutMs)throw fault('RESTART_CHANGED','Restart must use the saved script, arguments, backend, lifetime limit and deadlines');
    }
    if (previous && !restartAdmission && (previous.cleanup?.serverExited!==true || ['running','pausing','stopping','finishing'].includes(previous.status) || previous.workers.some(worker => ['running','unknown'].includes(worker.status)))) throw fault('REPLAY_UNKNOWN', 'Unknown execution prevents automatic replay');
    if (previous && previous.runtimeIdentity !== runtimeIdentity) throw fault('REPLAY_RUNTIME', 'Saved results require their original runtime version');
    if(previous?.launch?.capabilitySources!==undefined&&previous.backendIdentity!==backend.identity)throw fault('CAPABILITY_ENVIRONMENT_CHANGED','Retained-source replay requires the original admitted backend identity; no completed work was redispatched');
    reuse = !previous || previous.backendIdentity === backend.identity;
    const oldWorkers = previous?.workers ?? [];
    const compositionEnabled=Boolean(meta.workflows?.length||previous?.compositionVersion);
    if(compositionEnabled&&!normalizedAccess)throw fault('COMPOSITION_INPUT','Composition requires a verified saved access identity');
    if(workflowRevisions!==undefined&&(!resume||workflowRevisions.expectedGeneration!==previous?.generation||expectedGeneration!==previous?.generation||previous.cleanup?.jobEmpty!==true||previous.cleanup?.ownershipScope!=='windows-job-members'||previous.cleanup?.error||previous.cleanup?.nativeTerminals?.error||oldWorkers.some(w=>w.status!=='completed'||w.evidence?.cleanup?.serverExited!==true||w.evidence?.cleanup?.jobEmpty!==true||w.evidence?.cleanup?.ownershipScope!=='windows-job-members'||w.evidence?.cleanup?.error||w.evidence?.cleanup?.nativeTerminals?.inventoryEmpty!==true)))throw fault('COMPOSITION_UNKNOWN','Source revision requires exact generation and positively drained reconciled work');
    createCompositionTables(db);createStepTables(db);
    const runRef=await contextRunRef({runDir,sessionId});
    let workflowSources,sources;
    if(compositionEnabled){
      workflowSources=launch?.preparedWorkflowSources??(previous?.workflowSources?await freezeWorkflowSources({runDir,cwd:launch?.cwd,declarations:meta.workflows??[],previousCatalog:previous.workflowSources,revisions:workflowRevisions??null}):await freezeWorkflowSources({runDir,cwd:launch?.cwd,declarations:meta.workflows??[]}));
      sources=await verifyWorkflowSources({runDir,descriptor:workflowSources});
      if(canonicalJSON(sources.entries.map(e=>e.declaration).sort((a,b)=>a.alias<b.alias?-1:1))!==canonicalJSON([...(meta.workflows??[])].sort((a,b)=>a.alias<b.alias?-1:1)))throw fault('COMPOSITION_CORRUPT','Admitted declarations differ from source catalog');
      for(const d of meta.workflows??[]){for(const [key,field]of [['skills','skills'],['tools','tools']])if(d.capabilities[key]!==null&&d.capabilities[key].some(id=>!capabilities?.manifest[field]?.some(item=>item.id===id)))throw fault('COMPOSITION_INPUT','Child declaration exceeds admitted capabilities');if(d.permissions?.sandbox==='workspace-write'&&normalizedAccess.policy.permissions.sandbox==='read-only')throw fault('COMPOSITION_INPUT','Child declaration exceeds root permissions');}
    }
    if(previous?.compositionVersion){const previousSources=await verifyWorkflowSources({runDir,descriptor:previous.workflowSources});const readContext=createRootContext({db,runDir,run:runRef,generation:previous.generation,sessionId,state:previous,sources:previousSources,signal:evaluatorAbort.signal,assertOwner:own,transaction:body=>transaction(db,body),workspaceInputs:async()=>previous.workspaceInputs??null,resolveWorker:async()=>null,resolveAuthority:()=>null});await validateInvocationHistory({context:readContext});}
    if(oldWorkers.some(worker=>worker.origin?.kind==='append')&&(previous.backendIdentity!==backend.identity||previous.maxAgents!==maxAgents||previous.concurrency!==concurrency))throw fault('APPEND_IDENTITY','Saved additions retain their original backend, lifetime budget and concurrency ceiling');
    if(previous&&!restartAdmission&&oldWorkers.some(worker=>worker.origin?.kind==='append'&&worker.status!=='completed'))throw fault('APPEND_RECONCILE','Noncompleted additions require explicit effect reconciliation and physical-suffix restart');
    const oldGuests=oldWorkers.filter(worker=>worker.origin?.kind!=='append');
    const restartPrefix=restartAdmission&&!compositionEnabled?oldGuests.filter(worker=>worker.position<=restartAdmission.position):[];
    let restartValidated=0,releaseRestartPrefix;
    const restartPrefixReady=new Promise(resolve=>{releaseRestartPrefix=resolve;});
    if(!restartPrefix.length)releaseRestartPrefix();
    if(previous?.workspaceInputs)await loadInputs(previous.workspaceInputs);
    if(reuse)for(const worker of oldWorkers){
      if(worker.status!=='completed'||restartAdmission&&worker.position>=restartAdmission.position)continue;
      if((worker.options?.permissions?.sandbox==='workspace-write'||worker.options?.workspace==='isolated')&&!worker.workspace)throw fault('WORKSPACE_ARTIFACT','Completed writer workspace is missing');
      if(worker.workspace)await verifyWorkspace(worker.workspace);
    }
    admitNotifications(db,{previous,maxAgents});
    const lastAdmissionGeneration=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='admission'").get()?db.prepare('SELECT COALESCE(MAX(generation),0) AS generation FROM admission').get().generation:0;
    state = { version: 1, appendVersion:1, sessionId, generation: Math.max(previous?.generation??0,lastAdmissionGeneration) + 1, runtimeIdentity, backendIdentity: backend.identity,
      status: 'running', acceptingControls:true, meta, script, args, launch, concurrency, maxAgents, timeoutMs, workerTimeoutMs, workerCount: 0, attempts: previous?.attempts ?? 0, createdAt: previous?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() };
    if(previous?.workspaceInputs)state.workspaceInputs=previous.workspaceInputs;
    if(normalizedAccess)state.accessPolicy=normalizedAccess;
    if(parentCapabilitiesHash)state.parentCapabilitiesHash=parentCapabilitiesHash;
    if(capabilities){state.workerCapabilities=capabilities.manifest;state.workerCapabilitiesHash=capabilities.fingerprint;state.workerCapabilitySources=capabilities.toolSources;}
    if(normalizedPolicy){state.capturePolicy=normalizedPolicy.policy;state.capturePolicyHash=normalizedPolicy.policyHash;}
    state.stepsVersion=1;
    state.domainControlsVersion=1;
    if(compositionEnabled){state.compositionVersion=1;state.workflowSources=workflowSources;}
    initializeAdmission(db,state);
    // Replay additions by stable request origin. Their new physical slots need
    // not match their old slots; guest ordinals and dependency hashes are separate.
    for(const prior of oldWorkers.filter(worker=>worker.origin?.kind==='append')){
      const cached=reuse&&prior.status==='completed'&&(!restartAdmission||prior.position<(restartAdmission.firstAffectedPosition??restartAdmission.position));
      const position=allocateSlot(db,state.generation,{reserve:!cached});
      const task={position,origin:prior.origin,prompt:prior.prompt,options:prior.options,key:prior.key,delivery:'queued'};
      db.prepare('INSERT INTO append_tasks VALUES(?,?,?)').run(state.generation,position,json(task));replayAdditions.set(position,prior);
    }
    const workspaces=runWorkspaces({runDir,source:launch?.cwd,inputs:state.workspaceInputs,...(normalizedPolicy?{capturePolicy:normalizedPolicy.policy}:{}),onInputs:record=>{if(retiredWrites)throw fault('RUN_RETIRED','Run no longer owns workspace admission');if(normalizedPolicy&&(record.version!==2||record.policyHash!==normalizedPolicy.policyHash))throw fault('CAPTURE_POLICY_IDENTITY','Workspace inputs did not confirm the frozen policy');state.workspaceInputs=record;saveHeader();}});
    const makeContext=(header,catalog)=>createRootContext({db,runDir,run:runRef,generation:header.generation,sessionId,state:header,sources:catalog,signal:evaluatorAbort.signal,assertOwner:()=>{own();if(retiredWrites)throw fault('RUN_RETIRED','Controller no longer owns domain writes');},transaction:body=>{own();return transaction(db,body);},workspaceInputs:()=>workspaces.originalInputs(),resolveWorker:async ref=>{if(canonicalJSON(ref.run)!==canonicalJSON(runRef)||ref.generation!==header.generation)throw fault('COMPOSITION_INPUT','Foreign worker reference');const w=snapshot(db).workers.find(w=>w.position===ref.position);if(!w||(w.attempts??0)!==ref.attempt)throw fault('COMPOSITION_INPUT','Worker attempt differs');return w;},resolveAuthority:()=>({accessPolicy:header.accessPolicy??null,capturePolicy:header.capturePolicy??null,workerCapabilities:header.workerCapabilities??null})});
    const context=makeContext(state,sources??null);
    const previousContext=previous?.compositionVersion?makeContext(previous,await verifyWorkflowSources({runDir,descriptor:previous.workflowSources})):null;
    if(previousContext)await validateInvocationHistory({context:previousContext});
    const rootCatalog=transaction(db,()=>retainStepCatalog({db,run:runRef,generation:state.generation,scope:{kind:'root'},sourceId:hash(script),steps:meta.steps??[]}));
    if(workflowRevisions!==undefined)transaction(db,()=>{const revision=db.prepare('SELECT COALESCE(MAX(revision),0)+1 AS n FROM source_revisions').get().n;db.prepare('INSERT INTO source_revisions VALUES(?,?,?)').run(revision,workflowSources.catalogHash,json({generation:state.generation,request:workflowRevisions,descriptor:workflowSources}));});
    if(restartAdmission){
      state.restart={...restartAdmission,sourceGeneration:previous.generation,receiptId:randomUUID()};
      const receipt={id:state.restart.receiptId,generation:state.generation,sourceGeneration:previous.generation,action:'restart-worker',status:'applied',requestedAt:state.updatedAt,appliedAt:state.updatedAt,...restartAdmission};
      db.exec('BEGIN IMMEDIATE');
      try{saveHeader();db.prepare('INSERT INTO controls(id,generation,value) VALUES(?,?,?)').run(receipt.id,state.generation,json(receipt));db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
    }else saveHeader();
    const finishSteering=(receipt,error,sent=true)=>{
      steering.delete(receipt.position);
      if(controlsRetired)return;
      own();
      receipt.status=error?(sent?'unknown':'rejected'):'applied';receipt.appliedAt=new Date().toISOString();
      if(error)receipt.error=diagnostic(error);
      db.prepare('UPDATE controls SET value=? WHERE id=?').run(json(receipt),receipt.id);
    };
    const applyControls = (closing=false) => {
      own();
      let applied=false;const workerActions=[];
      db.exec('BEGIN IMMEDIATE');
      try{
        const rows=db.prepare("SELECT value FROM controls WHERE generation=? AND json_extract(value,'$.status')='pending' ORDER BY rowid").all(state.generation);
        for(const row of rows){
          const receipt=JSON.parse(row.value);
          if(receipt.action==='cancel-child'){
            try{if(closing||primary||!composition)throw fault('CONTROL_TERMINAL','Child control admission closed');const child=receipt.payload.child;
              const r=db.prepare("SELECT value FROM invocations WHERE generation=? AND json_extract(value,'$.child.invocationId')=?").get(state.generation,child.invocationId);if(!r||!['intent','running'].includes(JSON.parse(r.value).status))throw fault('CONTROL_CONFLICT','Child execution changed');
              composition.cancelChild(child);for(const worker of currentWorkers.values())if(worker.origin?.invocationId===child.invocationId)workerAborts.get(worker.position)?.abort();receipt.status='applied';
            }catch(error){receipt.status='rejected';receipt.error=diagnostic(error);}receipt.appliedAt=new Date().toISOString();db.prepare('UPDATE controls SET value=? WHERE id=?').run(json(receipt),receipt.id);continue;
          }
          if(['steer','cancel-worker','worker-deadline'].includes(receipt.action)){
            const worker=currentWorkers.get(receipt.position);
            try{
              if(closing||primary||controlAction==='stop')throw fault('CONTROL_TERMINAL','Run control admission has closed');
              assertWorkerTarget(worker,receipt);
              if(receipt.action==='steer'&&(steering.has(receipt.position)||workerActions.some(item=>item.receipt.position===receipt.position&&item.receipt.action==='steer')))throw fault('CONTROL_BUSY','A steering request is already in flight for this worker');
              if(receipt.action==='cancel-worker'&&workerActions.some(item=>item.receipt.position===receipt.position&&item.receipt.action==='cancel-worker'))throw fault('CONTROL_WORKER','Worker cancellation is already requested');
              if(receipt.action==='worker-deadline'&&!workerDeadlines.has(worker.position))throw fault('CONTROL_DEADLINE','Worker has no live deadline owner');
              receipt.status=receipt.action==='cancel-worker'?'applied':'applying';receipt.appliedAt=new Date().toISOString();
              if(receipt.action==='cancel-worker')db.prepare('UPDATE workers SET value=? WHERE generation=? AND position=?').run(json({...worker,cancelRequested:true}),state.generation,worker.position);
              workerActions.push({receipt,worker});
            }catch(error){receipt.status='rejected';receipt.error=diagnostic(error);receipt.appliedAt=new Date().toISOString();}
            db.prepare('UPDATE controls SET value=? WHERE id=?').run(json(receipt),receipt.id);continue;
          }
          if(!['pause','stop'].includes(receipt.action))throw fault('CONTROL_CORRUPT','Stored control action is invalid');
          const denied=Boolean(primary)||controlAction==='stop'&&receipt.action==='pause';
          receipt.status=denied?'rejected':'applied';receipt.appliedAt=new Date().toISOString();
          if(!denied){applied=true;controlAction=receipt.action;state.status=controlAction==='pause'?'pausing':'stopping';state.updatedAt=receipt.appliedAt;}
          if(!denied)closeAdmission(db,state.generation);
          db.prepare('UPDATE controls SET value=? WHERE id=?').run(json(receipt),receipt.id);
        }
        if(closing){
          state.acceptingControls=false;
          closeAdmission(db,state.generation);
          for(const row of db.prepare("SELECT value FROM controls WHERE generation=? AND json_extract(value,'$.status')='applying'").all(state.generation)){
            const receipt=JSON.parse(row.value);receipt.status='unknown';receipt.error=diagnostic(fault('CONTROL_UNCONFIRMED','Runner closed before live control confirmation'));receipt.appliedAt=new Date().toISOString();db.prepare('UPDATE controls SET value=? WHERE id=?').run(json(receipt),receipt.id);
          }
        }
        if(rows.length||closing)saveHeader();
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      if(closing)controlsRetired=true;
      for(const {receipt,worker} of workerActions){
        if(receipt.action==='cancel-worker'){worker.cancelRequested=true;workerAborts.get(worker.position)?.abort();}
        else if(receipt.action==='worker-deadline'){
          let applied=false;
          try{
            if(controlsRetired||fatal||controlAction==='stop')throw fault('CONTROL_TERMINAL','Run no longer accepts deadline changes');
            assertWorkerTarget(currentWorkers.get(worker.position),receipt);
            const entry=workerDeadlines.get(worker.position);
            if(!entry)throw fault('CONTROL_DEADLINE','Worker deadline owner closed');
            receipt.deadlineResult=entry.handle.apply(receipt.deadline);applied=true;
            if(entry.error)throw entry.error;
            receipt.status='applied';
          }catch(error){receipt.status=applied?'unknown':'rejected';receipt.error=diagnostic(error);}
          receipt.appliedAt=new Date().toISOString();
          db.prepare('UPDATE controls SET value=? WHERE id=?').run(json(receipt),receipt.id);
        }
        else{
          steering.add(worker.position);
          let sent=false;
          Promise.resolve().then(()=>{
            if(controlsRetired||controlAction==='stop')throw fault('CONTROL_TERMINAL','Run no longer accepts steering');
            assertWorkerTarget(currentWorkers.get(worker.position),receipt);
            if(typeof backend.steer!=='function')throw fault('CONTROL_UNSUPPORTED','Backend does not support live steering');
            sent=true;
            return backend.steer({position:receipt.position,turnId:receipt.turnId,text:receipt.text});
          }).then(result=>{if(result?.turnId!==receipt.turnId)throw fault('CONTROL_TURN','Backend did not confirm the targeted turn');finishSteering(receipt);}).catch(error=>{try{finishSteering(receipt,error,sent);}catch(failure){fatal??=failure;stopped=true;evaluatorAbort.abort();abort.abort();}});
        }
      }
      if(applied){stopped=true;evaluatorAbort.abort();if(controlAction==='stop'){abort.abort();if(expireDrain)armDrain(drainTimeoutMs);for(const resolve of waiters.splice(0))resolve();}}
    };
    controlTimer=setInterval(()=>{try{applyControls();pumpAdditions();}catch(error){fatal??=error;stopped=true;evaluatorAbort.abort();abort.abort();if(expireDrain)armDrain(drainTimeoutMs);for(const resolve of waiters.splice(0))resolve();}},25);
    const dispatch = async ({ prompt, options = {}, addition,scope,journal,priorOverride,publishInvocation }) => {
      if (typeof prompt === 'string' && prompt.length > 65536) throw fault('AGENT_INPUT', 'Worker prompt exceeds 65536 UTF-16 code units; keep bulk data in project files and pass file paths, hashes and assigned ranges');
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 65536 || !options || Array.isArray(options) || Object.keys(options).some(key => !['id','dependsOn','label','phase','timeoutMs','schema','model','effort','maxAttempts','permissions','workspace','skills','requireTools','stepId','inputSnapshot','reviewPacket'].includes(key)) || options.workspace!==undefined&&options.workspace!=='isolated' || ['label','phase'].some(key => options[key] != null && (typeof options[key] !== 'string' || options[key].length > 500)) || options.timeoutMs != null && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > MAX_WORKER_TIMEOUT_MS)) throw fault('AGENT_INPUT', 'Unsupported agent prompt or options');
      if(Object.hasOwn(options,'inputSnapshot')||Object.hasOwn(options,'reviewPacket'))throw fault('ARTIFACT_UNAVAILABLE','Artifact input and review packet providers are not integrated at this foundation checkpoint');
      if(scope?.declaration){const d=scope.declaration;for(const [key,ceiling]of [['skills',d.capabilities.skills],['requireTools',d.capabilities.tools]]){if(ceiling!==null&&(options[key]??[]).some(id=>!ceiling.includes(id)))throw fault('COMPOSITION_INPUT','Child worker selection exceeds its retained capability ceiling');}
        if(d.permissions){if(options.permissions?.sandbox!==undefined&&options.permissions.sandbox!=='read-only'&&d.permissions.sandbox==='read-only'||options.permissions?.networkAccess===true||options.permissions?.approvalPolicy!==undefined&&options.permissions.approvalPolicy!=='never')throw fault('COMPOSITION_INPUT','Child worker permissions exceed its declaration');options={...options,permissions:{...d.permissions,...options.permissions}};}}
      const capabilitySelection=selectCapabilities(capabilities?.manifest,options);
      options={...options,timeoutMs:options.timeoutMs===undefined?workerTimeoutMs:options.timeoutMs};
      const compiled=Object.hasOwn(options,'schema')?compileSchema(options.schema):null;
      if(backend.resolveOptions)options={...options,...backend.resolveOptions(options)};
      if(addition)options={...options,maxAttempts:1};
      const localIds=scope?.workerIds??workerIds;
      if(options.id!==undefined&&(typeof options.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(options.id)||['__proto__','constructor','prototype'].includes(options.id.toLowerCase())||[...localIds.keys()].some(id=>id.toLowerCase()===options.id.toLowerCase())))throw fault('AGENT_INPUT','Worker ids must be unique bounded identifiers');
      if(options.dependsOn!==undefined&&(!Array.isArray(options.dependsOn)||options.dependsOn.length>256||options.dependsOn.some(id=>typeof id!=='string'||!localIds.has(id))||new Set(options.dependsOn).size!==options.dependsOn.length))throw fault('AGENT_INPUT','Dependencies must name distinct earlier workers');
      const step=addition?null:associateStep({catalog:scope?.catalog??rootCatalog,options,workers:[...currentWorkers.values()]});
      if (stopped&&!addition) throw fault('RUN_STOPPED', 'Workflow admission is closed');
      if (!addition&&sequence >= maxAgents) throw fault('AGENT_LIMIT', 'Workflow agent limit reached');
      const ordinal=addition?null:scope?scope.ordinal++:sequence++;
      const dependencies=(options.dependsOn??[]).map(id=>localIds.get(id));
      if(!addition&&!journal)chain = hash(chain + canonical({ prompt, timeoutMs: options.timeoutMs, dependencies:dependencies.map(position=>currentWorkers.get(position).origin), schema:compiled?.schema??null,model:options.model??null,effort:options.effort??null,maxAttempts:options.maxAttempts??5,permissions:options.permissions??null,...(options.stepId?{stepId:options.stepId}:{}),...(options.workspace?{workspace:options.workspace}:{}),...(normalizedPolicy?{capturePolicyHash:normalizedPolicy.policyHash}:{}),...(capabilitySelection?{workerCapabilitiesHash:capabilities.fingerprint,capabilitySelectionHash:capabilitySelection.fingerprint}:{}) }));
      const key=addition?.key??journal?.key??chain,prior=addition?replayAdditions.get(addition.position):journal?priorOverride:oldGuests[ordinal];
      if(!addition&&!journal&&restartAdmission&&prior?.position<=restartAdmission.position&&prior?.key!==key)throw fault('RESTART_CHANGED','Saved worker invocation changed before the restart target');
      if(!addition&&!journal&&restartAdmission&&restartValidated<restartPrefix.length){
        if(prior!==restartPrefix[restartValidated])throw fault('RESTART_CHANGED','Saved guest prefix changed before the restart target');
        restartValidated++;if(restartValidated===restartPrefix.length)releaseRestartPrefix();
      }
      const cached=!journal&&(addition?previous?.backendIdentity===backend.identity:reuse)&&(!restartAdmission||prior?.position<restartAdmission.position)&&prior?.key===key&&prior.status==='completed';
      let position,worker;transaction(db,()=>{position=addition?.position??allocateSlot(db,state.generation,{reserve:!cached});worker={position,origin:addition?.origin??(scope?.depth?{kind:'child',invocationId:scope.id,ordinal}:{kind:'guest',ordinal}),key,prompt,options,phase:options.phase??scope?.phase??currentPhase,status:'queued',cached:false,...(step?{step}:{}),...(journal?{invocation:{seq:journal.seq,parentSeq:journal.parentSeq,scopeId:journal.scopeId,localCall:journal.localCall}}:{})};if(journal){journal.workerPosition=position;writeInvocation(context,journal,{insert:true});saveWorker(worker);}});
      if(capabilitySelection)worker.capabilitySelection={fingerprint:capabilitySelection.fingerprint,skills:options.skills??[],requireTools:options.requireTools??[]};
      const workerAbort=new AbortController();workerAborts.set(position,workerAbort);
      const signal=AbortSignal.any([abort.signal,workerAbort.signal]);
      if(Object.hasOwn(options,'dependsOn'))worker.dependencies=dependencies;
      currentWorkers.set(position,worker);
      if(options.id!==undefined)localIds.set(options.id,position);
      let settle;settlements.set(position,new Promise(resolve=>{settle=resolve;}));
      if (cached) {
        if (!Object.hasOwn(prior, 'result') || hash(json(prior.result)) !== prior.resultHash) throw fault('REPLAY_CORRUPT', 'Saved worker result is missing or corrupt');
        if(compiled&&!compiled.validate(prior.result))throw fault('REPLAY_CORRUPT','Saved worker result violates its schema');
        Object.assign(worker, { status: 'completed', cached: true, result: prior.result, resultHash: prior.resultHash });
        worker.reusedFrom=prior.reusedFrom??{generation:previous.generation,position:prior.position};
        worker.sourceGeneration=worker.reusedFrom.generation;worker.sourcePosition=worker.reusedFrom.position;
        for(const key of ['workspace','evidence','deadline','attempts','attemptOffset','priorExecutions','usageByThread','usage','activity','activityCount','startedAt','completedAt'])if(Object.hasOwn(prior,key))worker[key]=structuredClone(prior[key]);
        saveWorker(worker,undefined,true);settle(); return worker.result;
      }
      if(!addition)reuse = false;
      if(prior){
        worker.priorExecutions=[...(prior.priorExecutions??[]),prior.reusedFrom??{generation:previous.generation,position:prior.position}];
        worker.attemptOffset=prior.attempts??0;worker.attempts=worker.attemptOffset;
        for(const key of ['usageByThread','usage'])if(Object.hasOwn(prior,key))worker[key]=structuredClone(prior[key]);
      }
      saveWorker(worker);
      let acquired = false;
      let reserved=true;
      let dispatched = false;
      let terminalObserved=false;
      let executionOpen=false;
      let workspaceCollected=false;
      const retainWorkspace=async(evidence,noProcessStarted=false)=>{
        if(!worker.workspace||workspaceCollected)return;workspaceCollected=true;
        try{
          if(dispatched&&(!noProcessStarted||evidence?.cleanup?.error)&&(evidence?.cleanup?.serverExited!==true||evidence.cleanup.jobEmpty!==true||evidence.cleanup.error))throw fault('WORKSPACE_DRAIN','Workspace retained without a final diff because worker termination is unverified');
          const retained=await collectWorkspace(worker.workspace);
          if(retiredWrites)throw fault('RUN_RETIRED','Late artifacts cannot change terminal evidence');
          worker.workspace=retained;
        }catch(error){if(!retiredWrites)worker.workspaceError={...diagnostic(error),...(error.captureFailure?{capture:error.captureFailure}:{})};throw error;}
      };
      try {
        // A replayed affected addition has no guest await to gate its effects.
        // Validate the original guest prefix/target before it can acquire a slot.
        if(addition&&restartAdmission&&prior?.position>=restartAdmission.position){
          await waitFor(restartPrefixReady,signal);
          if(restartValidated<restartPrefix.length)throw fault('RESTART_CHANGED','Saved guest prefix did not validate before affected addition admission');
        }
        await waitFor(Promise.all(dependencies.map(position=>settlements.get(position))),signal);
        if(workerAbort.signal.aborted)throw Object.assign(fault('WORKER_CANCELLED','Worker was cancelled before dispatch'),{notStarted:true});
        if(dependencies.some(position=>currentWorkers.get(position).status!=='completed'))throw Object.assign(fault('DEPENDENCY_FAILED','A prerequisite did not complete successfully'),{notStarted:true});
        await acquire(signal,Boolean(addition)); acquired = true;
        if(workerAbort.signal.aborted)throw Object.assign(fault('WORKER_CANCELLED','Worker was cancelled before dispatch'),{notStarted:true});
        if(options.permissions?.sandbox==='workspace-write'||options.workspace==='isolated'){
          const workspace=await workspaces.prepare({generation:state.generation,position});
          if(retiredWrites)throw fault('RUN_RETIRED','Late workspace admission cannot change terminal evidence');
          if(normalizedPolicy&&(workspace.version!==2||workspace.policyHash!==normalizedPolicy.policyHash))throw fault('CAPTURE_POLICY_IDENTITY','Writer workspace did not confirm the frozen policy');
          worker.workspace=workspace;saveWorker(worker);
          if(signal.aborted||stopped&&!(addition&&controlAction==='pause'))throw Object.assign(fault('RUN_STOPPED','Worker admission closed while preparing its workspace'),{notStarted:true});
        }
        if(workerAbort.signal.aborted)throw cancelled();
        applyControls();
        if(scope?.depth&&db.prepare("SELECT 1 FROM controls WHERE generation=? AND json_extract(value,'$.action')='cancel-child' AND json_extract(value,'$.payload.child.invocationId')=? AND json_extract(value,'$.status') IN ('pending','applied')").get(state.generation,scope.id))throw cancelled();
        consumeAttempt(db,state.generation,{reserved:true,allowPaused:Boolean(addition),...(addition?{position}:{})});reserved=false;
        worker.attempts=(worker.attemptOffset??0)+1; worker.status = 'running'; worker.startedAt = new Date().toISOString();
        saveHeader(); saveWorker(worker);
        dispatched = true;
        executionOpen=true;
        const reserveRetry=async()=>{
          if(retiredWrites||signal.aborted)throw fault('RUN_STOPPED','Worker admission is closed');
          if(addition)throw fault('AGENT_LIMIT','Appended tasks have exactly one attempt');
          consumeAttempt(db,state.generation,{allowPaused:true});worker.attempts++;saveWorker(worker);
        };
        const observationOpen=()=>{if(retiredWrites||!executionOpen)throw fault('RUN_RETIRED','Late worker activity cannot change terminal evidence');};
        const onActive=identity=>{observationOpen();worker.activeTurn=JSON.parse(json(identity));saveWorker(worker);};
        const onEvent=message=>{observationOpen();saveWorker(worker,message);};
        const onDeadline=handle=>{
          observationOpen();
          if(workerDeadlines.has(position))throw fault('CONTROL_DEADLINE','Worker deadline owner is already registered');
          const entry={handle};workerDeadlines.set(position,entry);
          worker.deadline=handle.snapshot();saveWorker(worker);
          entry.unsubscribe=handle.subscribe(value=>{
            if(retiredWrites||!executionOpen)return;
            try{worker.deadline=JSON.parse(json(value));saveWorker(worker);}
            catch(error){entry.error=error;fatal??=error;stopped=true;evaluatorAbort.abort();abort.abort();if(expireDrain)armDrain(drainTimeoutMs);for(const resolve of waiters.splice(0))resolve();}
          });
        };
        const result = await backend.execute({ prompt, options, position, signal, reserveRetry, onActive,onEvent,onDeadline,workspace:worker.workspace });
        executionOpen=false;delete worker.activeTurn;
        if(retiredWrites)throw fault('RUN_RETIRED','Late worker result cannot change terminal evidence');
        if (!result?.terminalObserved) throw fault('AGENT_UNKNOWN', 'Worker terminal state was not observed');
        terminalObserved=true;
        if (result.evidence) worker.evidence = JSON.parse(json(result.evidence));
        await retainWorkspace(result.evidence);
        if(retiredWrites)throw fault('RUN_RETIRED','Late artifacts cannot change terminal evidence');
        const value = JSON.parse(json(result.value));
        if(compiled&&!compiled.validate(value))throw fault('RESULT_SCHEMA','Worker result does not satisfy its declared schema');
        Object.assign(worker, { status: 'completed', result: value, resultHash: hash(json(value)), completedAt: new Date().toISOString() });
        if(publishInvocation)await publishInvocation({value,publish:()=>saveWorker(worker,undefined,true)});else saveWorker(worker,undefined,true); return value;
      } catch (error) {
        executionOpen=false;delete worker.activeTurn;
        if(retiredWrites)throw error;
        if(error.code==='RUN_STOPPED')applyControls();
        try{await retainWorkspace(error.evidence,error.noProcessStarted===true);}catch{ /* Primary failure and separate workspace diagnostic both survive. */ }
        if(retiredWrites)throw error;
        worker.status = error.evidence?.cleanup?.error||error.executionUnknown===true ? 'unknown' : !dispatched && controlAction&&!addition ? 'queued' : !dispatched || error.notStarted || error.noInference===true || terminalObserved || error.terminalObserved===true ? 'failed' : 'unknown';
        worker.error = diagnostic(error);
        if(worker.error.code==='WORKSPACE_INPUT'&&['repository','inventory','files','consistency','tree','manifest'].includes(error.captureFailure?.stage)){
          worker.error.capture={stage:error.captureFailure.stage,cause:diagnostic(error.cause)};
        }
        worker.settledAt=new Date().toISOString();
        worker.notStarted=!dispatched||error.notStarted===true;
        worker.noProcessStarted=!dispatched||error.noProcessStarted===true;
        worker.noInference=!dispatched||error.noInference===true;
        if(error.evidence)worker.evidence=JSON.parse(json(error.evidence));
        if(worker.workspaceError)worker.status='unknown';
        if(error.interruption)worker.interruption={terminalObserved:error.interruption.terminalObserved===true,terminalStatus:['completed','failed','interrupted'].includes(error.interruption.terminalStatus)?error.interruption.terminalStatus:null,descendants:'notVerified'};
        if(publishInvocation)await publishInvocation({error,publish:()=>saveWorker(worker,undefined,true)});else saveWorker(worker,undefined,true);
        throw error;
      } finally {workerDeadlines.get(position)?.unsubscribe?.();workerDeadlines.delete(position);if(reserved&&!retiredWrites)releaseReservation(db,state.generation);workerAborts.delete(position);if (acquired) release();settle(); }
    };
    pumpAdditions=()=>{
      if(retiredWrites||!dispatchReady)return;
      for(const task of pendingAdditions(db,state.generation)){
        if(currentWorkers.has(task.position))continue;
        if(task.delivery!=='queued')throw fault('APPEND_UNKNOWN','A dispatch intent without a worker requires effect reconciliation');
        const work=dispatch({prompt:task.prompt,options:task.options,addition:task}).catch(error=>{
          const controlled=controlAction==='stop'&&['RUN_STOPPED','WORKER_CANCELLED','TURN_CANCELLED'].includes(error.code);
          if(!controlled)additionFailure??=error;
          if(!retiredWrites&&(error.evidence?.cleanup?.error||currentWorkers.get(task.position)?.workspaceError)){
            fatal??=error;state.error=diagnostic(fatal);stopped=true;evaluatorAbort.abort();abort.abort();
          }
          if(!retiredWrites&&!currentWorkers.has(task.position)){
            const worker={...task,status:'failed',cached:false,error:diagnostic(error),notStarted:true,noProcessStarted:true,noInference:true};
            currentWorkers.set(task.position,worker);releaseReservation(db,state.generation);saveWorker(worker,undefined,true);
          }
        });
        calls.add(work);work.then(()=>calls.delete(work),()=>calls.delete(work));
      }
    };
    let composition;
    if(compositionEnabled)composition=await createCompositionRuntime({context,previous,previousContext,script,args,restart:restartAdmission,normalizeAgent:(params,scope)=>{let options={...params.options};if(scope.declaration?.permissions)options.permissions={...scope.declaration.permissions,...options.permissions};options.timeoutMs=options.timeoutMs===undefined?workerTimeoutMs:options.timeoutMs;if(backend.resolveOptions)options={...options,...backend.resolveOptions(options)};return{...params,options};},admission:()=>{applyControls();if(stopped)throw fault('RUN_STOPPED','Composition admission is closed');},recordProcess:event=>{own();if(!retiredWrites)db.prepare('INSERT INTO events(generation,value) VALUES(?,?)').run(state.generation,json({method:'child-process',...event}));},copyWorker:(prior,key)=>{
      const position=allocateSlot(db,state.generation,{reserve:false}),worker=structuredClone(prior);worker.position=position;worker.cached=true;worker.key=key;worker.reusedFrom=prior.reusedFrom??{generation:previous.generation,position:prior.position};worker.sourceGeneration=worker.reusedFrom.generation;worker.sourcePosition=worker.reusedFrom.position;
      if(worker.step){worker.step.generation=state.generation;if(worker.step.scope.kind==='child')worker.step.scope.invocation.generation=state.generation;}currentWorkers.set(position,worker);saveWorker(worker,undefined,true);return position;
    },dispatch:({method,params,scope,journal,prior,publishInvocation})=>method==='agent'?dispatch({...params,scope,journal,priorOverride:prior,publishInvocation}):cosmetic(method,params,scope)});
    const cosmetic=(method,params,scope)=>{
      if(stopped)throw fault('RUN_STOPPED','Workflow admission is closed');
      if(method==='phase'){if(typeof params.title!=='string'||params.title.length>500)throw fault('PHASE_INPUT','Phase title must be bounded text');if(!scope)currentPhase=params.title;}
      else if(method!=='log'||typeof params.message!=='string'||params.message.length>4000)throw fault('LOG_INPUT','Log message must be bounded text');
      own();db.prepare('INSERT INTO events(generation,value) VALUES(?,?)').run(state.generation,json({method,...params,...(scope?{scopeId:scope.id}:{})}));return null;
    };
    const call = (method, params) => {
      if(['refineArtifact','workflow'].includes(method)&&!composition){fatal??=fault(method==='workflow'?'COMPOSITION_INPUT':'REFINEMENT_UNSUPPORTED',method==='workflow'?'Workflow alias is not declared':'Artifact refinement providers are not integrated at this foundation checkpoint');stopped=true;evaluatorAbort.abort();abort.abort();throw fatal;}
      if(composition){const work=composition.call(method,params).catch(error=>{if(!['RUN_STOPPED','EVALUATOR_ABORTED'].includes(error.code)){fatal??=error;stopped=true;evaluatorAbort.abort();abort.abort();}throw error;});calls.add(work);work.then(()=>calls.delete(work),()=>calls.delete(work));return work;}
      if (method === 'agent') {
        const work = dispatch(params).catch(error => {
          if (['AGENT_INPUT','AGENT_LIMIT','STEP_INPUT','ARTIFACT_UNAVAILABLE','WORKER_SETTINGS','CAPABILITY_SELECTION','SCHEMA_INVALID','SCHEMA_UNSUPPORTED','SCHEMA_LIMIT','REPLAY_CORRUPT','RESTART_CHANGED','RUN_OWNERSHIP'].includes(error.code)) { fatal ??= error; stopped=true; evaluatorAbort.abort(); abort.abort(); for(const resolve of waiters.splice(0))resolve(); }
          throw error;
        });
        calls.add(work); work.then(() => calls.delete(work), () => calls.delete(work));
        return work;
      }
      if (stopped) throw fault('RUN_STOPPED', 'Workflow admission is closed');
      if (method === 'phase') {
        if (typeof params.title !== 'string' || params.title.length > 500) throw fault('PHASE_INPUT', 'Phase title must be bounded text');
        currentPhase = params.title;
      } else if (method !== 'log' || typeof params.message !== 'string' || params.message.length > 4000) throw fault('LOG_INPUT', 'Log message must be bounded text');
      own(); db.prepare('INSERT INTO events(generation,value) VALUES(?,?)').run(state.generation, json({ method, ...params }));
      return null;
    };
    if(restartAdmission){
      try{await onReady?.({generation:state.generation,status:state.status});}
      catch(error){
        clearInterval(controlTimer);controlsRetired=true;
        db.exec('BEGIN IMMEDIATE');
        try{
          own();db.prepare('UPDATE header SET value=? WHERE id=1').run(previousHeader);
          abandonUnstartedAdmission(db,state.generation,diagnostic(error));
          for(const row of db.prepare('SELECT value FROM controls WHERE generation=?').all(state.generation)){
            const receipt=JSON.parse(row.value);receipt.status='rejected';receipt.error=diagnostic(error);db.prepare('UPDATE controls SET value=? WHERE id=?').run(json(receipt),receipt.id);
          }
          db.exec('COMMIT');
        }catch(failure){db.exec('ROLLBACK');throw failure;}
        throw error;
      }
    }
    try {
      if(!restartAdmission)await onReady?.({generation:state.generation,status:state.status});
      dispatchReady=true;
      applyControls();
      pumpAdditions();
      evaluationStartedAt=performance.now();
      state.result = await evaluate(script, { args, call, timeoutMs, signal: evaluatorAbort.signal });
      composition?.assertConsumed();
      if (fatal) throw fatal;
      if(restartValidated<restartPrefix.length)throw fault('RESTART_CHANGED','Saved guest prefix was not fully replayed before the restart target');
      state.guestFinishedAt=new Date().toISOString();saveHeader();
    } catch (error) { if(!controlAction||fatal){primary=fatal??error;state.status = 'finishing'; state.error = diagnostic(primary);} }
    // A paused/failed guest cannot leave replay additions waiting forever for
    // invocations it will never reach. They settle explicitly without dispatch.
    releaseRestartPrefix();
    if(!dispatchReady){stopped=true;abort.abort();dispatchReady=true;}
    // Completion and append serialize on the same ledger. An accepted batch
    // wins before closure and joins this drain, even after guest completion.
    if(!primary&&!fatal&&!controlAction){
      if(timeoutMs!==null)lifetimeTimer=setTimeout(()=>{
        fatal??=fault('EVALUATOR_TIMEOUT','Workflow run exceeded its wall deadline while draining accepted work');state.error=diagnostic(fatal);
        stopped=true;evaluatorAbort.abort();abort.abort();
      },Math.max(0,timeoutMs-(performance.now()-evaluationStartedAt)));
      for(;;){
        pumpAdditions();
        let wake;
        const interrupted=new Promise(resolve=>{wake=()=>resolve(false);evaluatorAbort.signal.addEventListener('abort',wake,{once:true});if(evaluatorAbort.signal.aborted)wake();});
        const settled=await Promise.race([Promise.allSettled([...calls]).then(()=>true),interrupted]);
        evaluatorAbort.signal.removeEventListener('abort',wake);
        if(!settled)break;
        const closed=transaction(db,()=>{
          const tasks=pendingAdditions(db,state.generation);
          if(calls.size||tasks.some(task=>!currentWorkers.has(task.position)))return false;
          closeAdmission(db,state.generation);saveHeader();return true;
        });
        if(closed)break;
      }
    }else pumpAdditions();
    clearTimeout(lifetimeTimer);
    transaction(db,()=>{closeAdmission(db,state.generation);saveHeader();});
    pumpAdditions();
    stopped = true; if(controlAction!=='pause')abort.abort();
    if(controlAction!=='pause')for (const resolve of waiters.splice(0)) resolve();
    // Pause lets accepted work settle without a guessed lifetime. Stop or an
    // explicit run deadline still supplies the independent bounded drain.
    if(controlAction==='pause'&&timeoutMs!==null)lifetimeTimer=setTimeout(()=>{
      fatal??=fault('EVALUATOR_TIMEOUT','Workflow run exceeded its wall deadline while paused');state.error=diagnostic(fatal);
      abort.abort();for(const resolve of waiters.splice(0))resolve();if(expireDrain)armDrain(drainTimeoutMs);
    },Math.max(0,timeoutMs-(performance.now()-evaluationStartedAt)));
    const drained=await Promise.race([Promise.allSettled([...calls]).then(()=>true),new Promise(resolve=>{expireDrain=resolve;if(controlAction!=='pause'||primary||fatal||abort.signal.aborted)armDrain(drainTimeoutMs);})]);
    clearTimeout(drainTimer);
    expireDrain=undefined;
    if(!drained){
      abort.abort();retiredWrites=true;
      for(const worker of currentWorkers.values())if(worker.status==='running'){
        worker.status='unknown';worker.error=diagnostic(fault('DRAIN_TIMEOUT','Worker did not settle within the drain deadline'));saveWorker(worker);
      }
    }
    clearInterval(controlTimer);
    clearTimeout(lifetimeTimer);
    state.status=controlAction==='pause'?'pausing':controlAction==='stop'?'stopping':'finishing';
    applyControls(true);
    try { state.cleanup = await closeBackend(); }
    catch (error) { state.cleanup = { serverExited: false, error: diagnostic(error), descendants: 'notVerified' }; }
    if(drained)await Promise.allSettled([...calls]);
    if(primary||fatal||additionFailure)state.status='failed';else state.status=controlAction==='pause'?'paused':controlAction==='stop'?'stopped':'completed';
    if(additionFailure)state.appendError=diagnostic(additionFailure);
    if (!state.cleanup.serverExited || snapshot(db).workers.some(worker => worker.status === 'unknown')) state.status = controlAction?'blocked':'failed';
    state.updatedAt = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try{
      saveHeader();
      for(const worker of currentWorkers.values())recordWorkerNotification(db,state,worker);
      recordRunNotification(db,state);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return snapshot(db);
  } finally {
    controlsRetired=true;
    clearInterval(controlTimer);
    clearTimeout(lifetimeTimer);
    clearTimeout(drainTimer);
    stopped = true; abort.abort();
    for (const resolve of waiters.splice(0)) resolve();
    if (backend?.close) { try { await closeBackend(); } catch { /* Reported above when a run was admitted. */ } }
    retiredWrites=true;
    db?.close();
    await lease?.close();
    if (leaseOwned && await readFile(lock, 'utf8').catch(() => '') === token) await unlink(lock);
  }
}
