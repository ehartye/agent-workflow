import { execFile } from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join,resolve} from 'node:path';
import { promisify } from 'node:util';
import {randomUUID} from 'node:crypto';
import { AppServer, fault, diagnostic } from '../foundation/client.mjs';
import {cleanupTerminals} from '../foundation/terminals.mjs';
import {buildJobHost} from '../foundation/windows-job.mjs';
import { createLaunch, assertChatgptLogin } from '../foundation/launch.mjs';
import { assertManagedChatgpt, probe } from '../foundation/probe.mjs';
import { runWorkerSession } from './worker-session.mjs';
import {DEFAULT_WORKER_TIMEOUT_MS} from './deadlines.mjs';
import {createLiveDeadline} from './live-deadline.mjs';
import { createSettings } from './settings.mjs';
import {steerTurn} from '../foundation/turn.mjs';
import { restrictLaunch, assertRestricted, assertDisabledInventory, fingerprint,parentLaunch,assertNoDelegation,integrationFacts } from './policy.mjs';
import {validateAccessPolicy} from './access-policy.mjs';
import {discoverParentCapabilities} from './parent-capabilities.mjs';
import {captureCapabilitySources,loadCapabilitySources} from './capability-sources.mjs';
import {writerPolicy,assertWriterThread} from './workspace-policy.mjs';
import {assertWorkspaceReady} from './workspaces.mjs';
import {freezeCapabilities,selectCapabilities,admitWorkerCapabilities,DIRECT_SKILLS,assertDirectSkills,observeNativeSkills} from './worker-capabilities.mjs';

export function workerCleanup(ownership,nativeTerminals,requiresJob){
  const cleanup={...ownership,...(nativeTerminals?{nativeTerminals}:{})};
  if(!ownership.serverExited||requiresJob&&ownership.jobEmpty!==true)cleanup.error=diagnostic(fault('WORKER_DRAIN','Worker ownership boundary did not confirm termination'));
  else if(nativeTerminals?.error)cleanup.error=nativeTerminals.error;
  return cleanup;
}

const ownershipVerified=(receipt,requiresJob)=>receipt?.serverExited===true&&(!requiresJob||receipt.jobEmpty===true)&&!receipt.error;
function aggregateCleanup(records,requiresJob,startup){
  return{serverExited:records.every(record=>ownershipVerified(record,requiresJob)),forced:records.some(record=>record?.forced===true),descendants:'notVerified',...(requiresJob?{jobEmpty:records.every(record=>record?.jobEmpty===true),ownershipScope:'windows-job-members'}:{}),startup};
}

function commandFailureFacts(error){
  const field=key=>{try{return Object.getOwnPropertyDescriptor(error,key)?.value;}catch{return undefined;}};
  const code=field('code'),killed=field('killed'),signal=field('signal');
  const bytes=key=>{const value=field(key);return typeof value==='string'?Buffer.byteLength(value):Buffer.isBuffer(value)?value.length:null;};
  return{exitCode:Number.isInteger(code)&&code>=-2147483648&&code<=4294967295?code:null,killed:typeof killed==='boolean'?killed:null,
    signal:signal===null?'none':['SIGTERM','SIGKILL','SIGINT'].includes(signal)?'termination':typeof signal==='string'?'other':'unknown',stdoutBytes:bytes('stdout'),stderrBytes:bytes('stderr')};
}

const completionSourceCommand=skills=>[process.execPath,'--input-type=module','-e',`try{const m=await import(${JSON.stringify(new URL('./worker-capabilities.mjs',import.meta.url).href)});await m.verifySkillSources(JSON.parse(process.argv[1]));process.stdout.write("WORKER_SKILL_COMPLETION_OK\\n");}catch(e){const changed=e?.code==="SKILL_SOURCE";process.stdout.write(changed?"WORKER_SKILL_COMPLETION_CHANGED\\n":"WORKER_SKILL_COMPLETION_UNKNOWN\\n");process.exitCode=changed?12:13;}`,JSON.stringify(skills)];

async function checkCompletionSources(client,{command,cwd,sandboxPolicy,selection,deadline,signal}){
  const fact={scope:'selected-skills',skillCount:selection.skills.length,selectionFingerprint:selection.fingerprint,status:'failed',start:'unknown',exitCode:null,sourceStatus:'unverified',outputTruncated:false};
  try{
    if(signal?.aborted){fact.start='notStarted';throw fault('RUN_STOPPED','Completion source check was cancelled');}
    const remaining=deadline.remaining();
    if(remaining<=0){fact.start='notStarted';throw fault('TURN_TIMEOUT','Worker deadline elapsed before source completion check');}
    const timeoutMs=20000;
    const response=await client.request('command/exec',{processId:`capability-completion-${randomUUID()}`,command,cwd,sandboxPolicy,streamStdoutStderr:false,timeoutMs,outputBytesCap:8192},{timeoutMs:timeoutMs+1000});
    if(Number.isSafeInteger(response?.exitCode)&&response.exitCode>=-2147483648&&response.exitCode<=4294967295){fact.start='observed';fact.exitCode=response.exitCode;}
    const valid=typeof response?.stdout==='string'&&typeof response?.stderr==='string';
    fact.outputTruncated=!valid||Buffer.byteLength(response.stdout+response.stderr)>=8192;
    if(valid&&!fact.outputTruncated&&response.stderr===''){
      if(fact.exitCode===0&&response.stdout.trim()==='WORKER_SKILL_COMPLETION_OK')fact.sourceStatus='verified';
      else if(fact.exitCode===12&&response.stdout.trim()==='WORKER_SKILL_COMPLETION_CHANGED')fact.sourceStatus='changedOrUnavailable';
    }
    if(deadline.remaining()<=0)throw fault('TURN_TIMEOUT','Worker deadline elapsed during source completion check');
    if(fact.sourceStatus==='verified')fact.status='passed';
  }catch(error){fact.error={code:['RUN_STOPPED','TURN_TIMEOUT','REQUEST_TIMEOUT'].includes(error?.code)?error.code:'COMPLETION_CHECK_FAILED'};}
  return fact;
}

// Deadline cancellation abandons the command wait, not its ownership. The
// execute finally block still inventories the owned thread and drains its job.
// Native command/RPC caps are independent and cannot be extended retroactively.
function boundedWorkerClient(client,signal,deadline){
  return{request(method,params,options){
    const failure=()=>deadline.signal.aborted?fault('TURN_TIMEOUT','Worker exceeded its live wall deadline'):fault('RUN_STOPPED','Worker was cancelled');
    if(signal.aborted||deadline.remaining()<=0)return Promise.reject(failure());
    let cancel;
    const stopped=new Promise((_,reject)=>{cancel=()=>reject(failure());signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();});
    return Promise.race([Promise.resolve().then(()=>{if(signal.aborted)throw failure();return client.request(method,params,options);}),stopped]).finally(()=>signal.removeEventListener('abort',cancel));
  }};
}

// Native inventory waits for configured MCP startup. Its RPC allowance must
// include that startup budget instead of expiring at the ordinary 15-second
// transport bound. Worker wall deadlines/cancellation still race this request.
function integrationInventoryTimeoutMs(config){
  const protocolAllowanceMs=15000,maxTimerMs=2147483647;
  let timeoutMs=protocolAllowanceMs;
  for(const server of Object.values(config.mcp_servers??{})){
    if(server.enabled===false||server.startup_timeout_sec===undefined)continue;
    const seconds=server.startup_timeout_sec,milliseconds=Math.ceil(seconds*1000);
    if(typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0||!Number.isSafeInteger(milliseconds)||milliseconds>maxTimerMs-protocolAllowanceMs)throw fault('MCP_STARTUP_TIMEOUT','Configured MCP startup budget exceeds the supported RPC timer range');
    timeoutMs=Math.max(timeoutMs,milliseconds+protocolAllowanceMs);
  }
  return timeoutMs;
}

export async function createManagedBackend({ executable, cwd, backend = 'configured', defaults={},workerCapabilities,workerCapabilitiesHash,session0Desktop='inherit',accessPolicy,runDir,capabilitySources,retainSources=false }) {
  accessPolicy=accessPolicy===undefined?undefined:validateAccessPolicy(accessPolicy);
  if(defaults.permissions?.sandbox==='workspace-write'&&(process.platform!=='win32'||backend!=='mxc'))throw fault('WORKSPACE_BACKEND','Writers require the verified Windows MXC backend; select --backend mxc');
  createLaunch({executable,cwd,backend,session0Desktop});
  let directory;
  const startup={attempted:false,records:[]};
  try{
    const bundle=workerCapabilities===undefined?null:await freezeCapabilities(workerCapabilities,{runDir,capabilitySources});
    if(workerCapabilitiesHash!==undefined&&bundle?.fingerprint!==workerCapabilitiesHash)throw fault('CAPABILITY_IDENTITY','Worker capability ceiling identity changed');
    let jobHost;
    if(process.platform==='win32'){directory=await mkdtemp(join(tmpdir(),'workflow-job-host-'));jobHost=await buildJobHost(directory);}
    const managed=await createBackend({executable,cwd,backend,defaults,jobHost,startup,bundle,session0Desktop,accessPolicy,runDir,capabilitySources,retainSources});
    let closing;
    return{...managed,close:()=>closing??=(async()=>{const result=await managed.close();if(directory&&ownershipVerified(result,true))await rm(directory,{recursive:true,force:true});return result;})()};
  }catch(error){
    // A failed/throwing close is an unknown ownership outcome, not permission
    // to remove the job host. Before any connection attempt there is no job.
    if(directory&&(!startup.attempted||ownershipVerified(error.cleanup,true))){
      try{await rm(directory,{recursive:true,force:true});}
      catch(storageError){error.evidence??={};error.evidence.storageCleanup=diagnostic(storageError);}
    }
    throw error;
  }
}

async function createBackend({executable,cwd,backend,defaults,jobHost,startup,bundle,session0Desktop,accessPolicy,runDir,capabilitySources,retainSources}){
  const parent=accessPolicy?.policy.access==='parent',expectedSandbox=parent?'danger-full-access':'read-only';
  const assertIntegrations=parent?assertNoDelegation:assertRestricted;
  const requiresJob=Boolean(jobHost);
  let constructionStage='launch',commandFailure;
  const retainCleanup=(stage,receipt)=>{
    // Only fixed ownership facts and public diagnostics enter retained startup
    // evidence; never spread transport errors or server-supplied details.
    const cleanup={serverExited:receipt?.serverExited===true,forced:receipt?.forced===true,descendants:'notVerified',...(requiresJob?{jobEmpty:receipt?.jobEmpty===true,ownershipScope:'windows-job-members'}:{}),...(receipt?.desktopCompatibility?{desktopCompatibility:receipt.desktopCompatibility}:{}),...(receipt?.error?{error:diagnostic(receipt.error)}:{})};
    startup.records.push({stage,cleanup});return cleanup;
  };
  const connectStartup=async(stage,options)=>{
    startup.attempted=true;
    try{return await AppServer.connect(options);}
    catch(error){retainCleanup(stage,error.cleanup);throw error;}
  };
  const closeStartup=async(stage,client)=>{
    let receipt;
    try{receipt=await client.close();}
    catch(error){receipt={serverExited:false,error};}
    return retainCleanup(stage,receipt);
  };
  const requireCleanup=(receipt,code,message)=>{if(!ownershipVerified(receipt,requiresJob))throw fault(code,message);};
  try{
  let launch = {...(parent?parentLaunch:restrictLaunch)(createLaunch({ executable, cwd, backend, session0Desktop,sandboxMode:expectedSandbox })),...(jobHost?{jobHost}:{})};
  const exec = promisify(execFile);
  const options = { cwd: launch.cwd, env: launch.env, windowsHide: true, timeout: 5000, maxBuffer: 8192 };
  const preflight=async args=>{try{return await exec(executable,args,options);}catch(error){commandFailure=commandFailureFacts(error);throw error;}};
  constructionStage='version';
  const version = (await preflight(['--version'])).stdout.trim();
  if (version !== 'codex-cli 0.162.1') throw fault('VERSION_UNSUPPORTED', 'Workflow engine requires the reviewed Codex 0.162.1 protocol');
  constructionStage='authentication';
  let login;
  try{login=await preflight(['login','status']);}
  catch(error){
    // Native absent-login status uses exit 1. Only that settled, known response
    // enters authentication classification; startup/timeout/unknown failures
    // retain their original failure and never expose raw process output.
    if(error.killed||error.signal||error.code!==1||typeof error.stdout!=='string'||error.stdout.trim()!==''||typeof error.stderr!=='string'||error.stderr.trim().split(/\r?\n/).at(-1)!=='Not logged in')throw error;
    login={stdout:'',stderr:'Not logged in'};
  }
  try{assertChatgptLogin(login);}
  catch(error){error.admission={status:'failed',inferenceRequests:0,runnerEquivalence:'notVerified',stages:[{name:'authentication',status:'failed',error:diagnostic(error)}],error:diagnostic(error)};throw error;}
  // Configuration discovery starts no threads and dispatches no model turns.
  constructionStage='discovery';
  const discovery = await connectStartup('discovery',launch);
  let discoveryFailure;
  try {
    const config = await discovery.request('config/read', { cwd: launch.cwd, includeLayers: true });
    launch = parent?parentLaunch(launch):restrictLaunch(launch, config.config);
    if(parent)integrationFacts(config.config);
  } catch(error){discoveryFailure=error;}
  const discoveryCleanup=await closeStartup('discovery',discovery);
  if(discoveryFailure)throw discoveryFailure;
  requireCleanup(discoveryCleanup,'DISCOVERY_CLEANUP','Configuration discovery did not confirm ownership termination');
  constructionStage='admission';
  const admissionClient = await connectStartup('admission',launch);
  try { assertIntegrations((await admissionClient.request('config/read', {cwd:launch.cwd})).config); }
  catch(error) { await closeStartup('admission',admissionClient); throw error; }
  let admission;
  try{admission = await probe(admissionClient, {
    cwd: launch.cwd,
    expectedSandbox,...(parent?{sandboxPolicy:accessPolicy.native.command.sandboxPolicy}:{}),
    command: [process.execPath, '-e', 'process.stdout.write("FOUNDATION_OK\\n")'],
    cancelCommand: [process.execPath, '-e', 'process.stdout.write("READY\\n");setInterval(() => {},1000)'],
  });}catch(error){
    // Probe owns its close attempt. Preserve an absent receipt as unknown;
    // never retry cleanup after an unexpected rejection.
    retainCleanup('admission',error.cleanup);throw error;
  }
  admission.cleanup=retainCleanup('admission',admission.cleanup);
  if (admission.status !== 'passed') throw Object.assign(fault('ADMISSION_FAILED', 'Command-only worker admission failed; no inference dispatched'), {admission});
  if(!ownershipVerified(admission.cleanup,requiresJob)){
    admission.status='failed';
    throw Object.assign(fault('ADMISSION_CLEANUP','Command admission did not confirm ownership termination'),{admission});
  }
  constructionStage='setup';
  const client = await connectStartup('setup',{ ...launch, experimentalApi:true, env: { ...launch.env, AGENT_WORKFLOW_WORKER: '1' } });
  let setupClosed=false;
  try {
    const account = await client.request('account/read', { refreshToken: false });
    const config = await client.request('config/read', { cwd: launch.cwd, includeLayers: true });
    assertManagedChatgpt(account, config,expectedSandbox);
    assertIntegrations(config.config);
    const catalog=[];let cursor;
    for(let page=0;page<10;page++){
      const models=await client.request('model/list',{includeHidden:true,limit:100,...(cursor?{cursor}:{})});
      if(!Array.isArray(models.data))throw fault('MODEL_CATALOG','Codex model catalog is malformed');
      catalog.push(...models.data);cursor=models.nextCursor;
      if(cursor==null)break;
      if(typeof cursor!=='string'||!cursor||page===9)throw fault('MODEL_CATALOG','Codex model catalog exceeded its page limit');
    }
    const settings=createSettings({catalog,config:config.config,defaults,workerCapabilities:bundle?.manifest,accessPolicy});
    const nativeIntegrations=parent?integrationFacts(config.config):undefined;
    const integrationIdentity=value=>fingerprint(Object.fromEntries(['plugins','mcp_servers','apps'].map(name=>[name,value?.[name]??{}])));
    const admittedIntegrations=parent?integrationIdentity(config.config):null;
    let parentCapabilities,retained;
    if(capabilitySources!==undefined){
      retained=await loadCapabilitySources({runDir,descriptor:capabilitySources});
      if(Boolean(retained.parentCapabilities)!==parent)throw fault('CAPABILITY_IDENTITY','Retained parent catalog does not match the admitted access policy');
      parentCapabilities=retained.parentCapabilities;
    }else if(parent){
      const homes=Object.entries(launch.env).filter(([key])=>key.toUpperCase()==='CODEX_HOME').map(([,value])=>value);
      if(new Set(homes).size>1)throw fault('PARENT_CAPABILITIES','Native home configuration is ambiguous');
      parentCapabilities=await discoverParentCapabilities(client,{cwd:launch.cwd,codexHome:homes[0]??join(homedir(),'.codex')});
      if(!parentCapabilities.coverage.complete)throw Object.assign(fault('PARENT_CAPABILITIES','Parent native catalog is incomplete; no model was admitted'),{evidence:{parentCapabilities:structuredClone(parentCapabilities)}});
    }
    if(retainSources&&runDir&&capabilitySources===undefined&&(bundle||parentCapabilities)){
      capabilitySources=await captureCapabilitySources({runDir,manifest:bundle?.manifest??null,parentCapabilities:parentCapabilities??null});
      retained=await loadCapabilitySources({runDir,descriptor:capabilitySources});
      parentCapabilities=retained.parentCapabilities;
      if(bundle)bundle=await freezeCapabilities(bundle.manifest,{runDir,capabilitySources});
    }
    const activeWorkers=new Map();
    const connections=new Set(),cleanupHistory=[];let closing=false,closePromise;
    const identity = fingerprint({ version, cwd: launch.cwd, backend,...(accessPolicy?{accessPolicyHash:accessPolicy.fingerprint}:{}),...(parentCapabilities?{parentCapabilitiesHash:parentCapabilities.fingerprint,parentDirectSkills:DIRECT_SKILLS}:{}),...(capabilitySources?{capabilitySources}:{}),...(session0Desktop==='shared'?{session0Desktop}:{}), account, config: config.config, defaults:settings.resolve(),playwrightBrowsersPath:launch.env.PLAYWRIGHT_BROWSERS_PATH??null,...(bundle?{workerCapabilitiesHash:bundle.fingerprint,directSkills:DIRECT_SKILLS}:{}), layers: config.layers.filter(layer => !layer.disabledReason).map(layer => layer.config) });
    setupClosed=true;
    const setupCleanup=await closeStartup('setup',client);
    requireCleanup(setupCleanup,'SETUP_CLEANUP','Configuration server did not confirm ownership termination');
    return {
      identity, admission,...(capabilitySources?{capabilitySources:structuredClone(capabilitySources)}:{}),...(accessPolicy?{accessPolicy}:{}),...(parentCapabilities?{parentCapabilities:structuredClone(parentCapabilities)}:{}),...(nativeIntegrations?{nativeIntegrations}:{}),...(session0Desktop==='shared'?{desktopCompatibility:admission.cleanup.desktopCompatibility}:{}), ...(bundle?{workerCapabilitiesHash:bundle.fingerprint}:{}),resolveOptions:settings.resolve,
      async steer({position,turnId,text}){
        const identity=activeWorkers.get(position);
        if(!identity||identity.turnId!==turnId)throw fault('CONTROL_TURN','Worker no longer owns that active turn');
        return steerTurn(identity.client,{threadId:identity.threadId,turnId:identity.turnId,text});
      },
      async execute({ prompt, options = {}, signal, reserveRetry, position, onActive,onEvent,onDeadline,workspace }) {
        if (closing||signal?.aborted) throw Object.assign(fault('RUN_STOPPED', 'Workflow admission is closed'), { notStarted: true,noProcessStarted:true });
        const effective=settings.resolve(options),restrictedWriter=effective.permissions.sandbox==='workspace-write',writing=restrictedWriter||effective.workspace==='isolated';
        if(restrictedWriter&&(process.platform!=='win32'||backend!=='mxc'))throw Object.assign(fault('WORKSPACE_BACKEND','Restricted writers require the Windows MXC backend'),{notStarted:true,noProcessStarted:true});
        const sourceEvidence=capabilitySources?{sha256:capabilitySources.sha256,scope:'controller-filesystem',before:'notChecked',completion:'notChecked'}:null;
        if(capabilitySources){
          try{await loadCapabilitySources({runDir,descriptor:capabilitySources});sourceEvidence.before='passed';}
          catch(error){throw Object.assign(error,{notStarted:true,noProcessStarted:true,noInference:true,evidence:{capabilitySources:{...sourceEvidence,before:'failed'}}});}
        }
        const selection=selectCapabilities(bundle?.executionManifest??bundle?.manifest,options);
        const completionCommand=selection?.skills.length?completionSourceCommand(selection.skills):null;
        if(completionCommand&&completionCommand.reduce((size,arg)=>size+2*arg.length+3,0)>30000)throw Object.assign(fault('CAPABILITY_SELECTION','Selected completion check exceeds the Windows command-line budget'),{notStarted:true,noProcessStarted:true});
        const rootKey=path=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path);
        const rootsByPath=new Map((parentCapabilities?.roots??[]).map(root=>[rootKey(root.location.path),root]));
        // Exact role roots keep their stable declared IDs when the native
        // catalog already exposed the same original directory.
        for(const root of selection?.roots??[])rootsByPath.set(rootKey(root.location.path),root);
        const roots=[...rootsByPath.values()];
        if(roots.length>128||new Set(roots.map(root=>root.id)).size!==roots.length)throw Object.assign(fault('PARENT_CAPABILITIES','Native selected roots exceed their bound or have conflicting identities'),{notStarted:true,noProcessStarted:true});
        const directSkills=roots.length>0;
        const parentGuidance=parentCapabilities&&directSkills?`${capabilitySources?'Verified run-retained copies of the admitted parent source packages':'Original parent native capability roots'} are available: ${JSON.stringify(roots)}. When your task uses skills, call genuine skills.list with authority {kind:"executor"}, then skills.read using the returned package and main_resource. Resolve same-name packages using their admitted root and native catalog metadata. Discovery is availability evidence, not proof of invocation. Do not substitute a manual SKILL.md read or copied skill body for native activation.`:'';
        if(Buffer.byteLength(parentGuidance)>65536)throw Object.assign(fault('PARENT_CAPABILITIES','Parent native root guidance exceeded its bound'),{notStarted:true,noProcessStarted:true});
        if(writing){
          if(!jobHost||!workspace)throw Object.assign(fault('WORKSPACE_REQUIRED','Writer execution requires an owned Windows job and isolated workspace'),{notStarted:true,noProcessStarted:true});
          try{await assertWorkspaceReady(workspace);}catch(error){error.notStarted=true;error.noProcessStarted=true;throw error;}
        }else if(workspace)throw Object.assign(fault('WORKSPACE_POLICY','Read-only workers cannot receive writable workspaces'),{notStarted:true,noProcessStarted:true});
        const workerCwd=writing?workspace.cwd:launch.cwd;
        let policy=restrictedWriter?writerPolicy(workerCwd):{launchArgs:[],thread:{sandbox:effective.permissions.sandbox,approvalPolicy:'never'},turn:{sandboxPolicy:effective.permissions.sandbox==='danger-full-access'?{type:'dangerFullAccess'}:{type:'readOnly',networkAccess:effective.permissions.networkAccess}}};
        if(parent){
          policy.launchArgs=[...policy.launchArgs,'-c',`sandbox_mode="${effective.permissions.sandbox}"`];
          if(writing&&!restrictedWriter){
            const ownership=writerPolicy(workerCwd);
            policy.launchArgs.push(...ownership.launchArgs);
            const common={cwd:workerCwd,runtimeWorkspaceRoots:[workerCwd]};
            policy.thread={...policy.thread,...common};policy.turn={...policy.turn,...common};
          }
        }
        if(closing||signal?.aborted)throw Object.assign(fault('RUN_STOPPED','Worker admission is closed'),{notStarted:true,noProcessStarted:true});
        let started = false;
        let ownedThread,result,primary,workerClient,capabilities,nativeSkills,observedIntegrations,liveDeadline,nativeInventory;
        const parentNative=parentCapabilities?{catalog:'notObserved',read:'notObserved',exposure:directSkills?'effectiveDirectModelOnly':'notSelected'}:undefined;
        const finishNative=()=>{nativeSkills?.finish();if(capabilities&&parentNative)Object.assign(capabilities.native,parentNative);};
        const workerEnv=createLaunch({executable:launch.command,cwd:workerCwd,backend,env:launch.env,capabilityEnvironment:selection?.environment}).env;
        const connection=AppServer.connect({...launch,args:[...launch.args,...(policy?.launchArgs??[]),...(directSkills?['-c',DIRECT_SKILLS]:[])],cwd:workerCwd,experimentalApi:true,env:{...workerEnv,AGENT_WORKFLOW_WORKER:'1'}});
        connections.add(connection);
        try {
          workerClient=await connection;
          if(closing||signal?.aborted)throw fault('RUN_STOPPED','Workflow admission is closed');
          const workerConfig=await workerClient.request('config/read',{cwd:workerCwd,includeLayers:true});
          assertIntegrations(workerConfig.config);
          if(capabilitySources&&parent&&integrationIdentity(workerConfig.config)!==admittedIntegrations)throw fault('CAPABILITY_ENVIRONMENT_CHANGED','Native integration configuration changed after source admission; no model was admitted');
          assertManagedChatgpt(await workerClient.request('account/read',{refreshToken:false}),workerConfig,parent?effective.permissions.sandbox:'read-only');
          if(directSkills)assertDirectSkills(workerConfig.config);
          const thread = await workerClient.request('thread/start', {
            cwd:workerCwd,approvalPolicy:'never',sandbox:'read-only',...policy?.thread,ephemeral:true,modelProvider:'openai',experimentalRawEvents:true,
            model:effective.model,config:{...policy?.thread.config,model_reasoning_effort:effective.effort},
            ...(roots.length?{selectedCapabilityRoots:roots}:{}),
            developerInstructions: `${writing?`You own an assigned worktree${parent&&!restrictedWriter?' for organization and review; full parent access does not enforce filesystem isolation':''}. Edit and validate only inside your assigned worktree. Do not commit, merge, change Git metadata or create filesystem links. Your changes will be retained for review.`:effective.permissions.sandbox==='read-only'?'You are a read-only workflow worker.':'You have the admitted parent execution access; stay within your assigned task scope.'} Complete only your assigned task. Do not launch another agent-workflow runtime. Do not delegate. If a command cannot start or a prerequisite check fails, report the blocked command, executable or cache path, and observed evidence. Pause only work that depends on that prerequisite; continue independent authorized authoring or review within your assigned scope. A command that launched and exited nonzero was executed and may have changed files; describe it as notStarted only when tool evidence explicitly confirms no process began. Never automatically retry or use a fallback after uncertain or potentially mutating effects; the coordinator must reconcile them first. Do not weaken sandbox or execution policy, change global configuration, or automatically install missing prerequisites. Use only explicitly authorized installation steps and coordinator-verified executable/cache paths; otherwise leave dependent build, test or rendering to the coordinator and disclose missing verification. The workflow coordinator owns orchestration.`,
          });
          if(restrictedWriter)assertWriterThread(thread,workerCwd);
          if(writing&&!restrictedWriter){const same=path=>typeof path==='string'&&resolve(path).toLowerCase()===resolve(workerCwd).toLowerCase();if(!same(thread.cwd)||!Array.isArray(thread.runtimeWorkspaceRoots)||thread.runtimeWorkspaceRoots.length!==1||!same(thread.runtimeWorkspaceRoots[0]))throw fault('THREAD_POLICY','Worker did not confirm its assigned worktree');}
          if (thread.modelProvider !== 'openai' || thread.approvalPolicy !== 'never' || !restrictedWriter&&fingerprint(thread.sandbox)!==fingerprint(policy.turn.sandboxPolicy) || typeof thread.thread?.id !== 'string') throw fault('THREAD_POLICY', 'Worker thread did not confirm the required provider and permissions');
          if(thread.model!==effective.model||thread.reasoningEffort!==effective.effort)throw fault('THREAD_SETTINGS','Worker thread did not confirm its model and reasoning settings');
          ownedThread=thread.thread.id;
          // Readiness executes commands but no model turn. Own the thread first
          // so even rejected readiness retains native inventory cleanup proof.
          const timeoutMs=options.timeoutMs===undefined?DEFAULT_WORKER_TIMEOUT_MS:options.timeoutMs;
          liveDeadline=createLiveDeadline(timeoutMs);liveDeadline.start();onDeadline?.(liveDeadline);
          signal=AbortSignal.any([liveDeadline.signal,...(signal?[signal]:[])]);
          const remaining=()=>{const ms=liveDeadline.remaining();if(ms<=0)throw fault('TURN_TIMEOUT','Worker exceeded its overall deadline');return ms;};
          const boundedClient=boundedWorkerClient(workerClient,signal,liveDeadline);
          // No fixed snapshot of the wall deadline enters command admission.
          // Its independent 20-second command caps remain live-change invariant.
          capabilities=await admitWorkerCapabilities(boundedClient,{cwd:workerCwd,selection,signal,...(parent?{sandboxPolicy:policy.turn.sandboxPolicy}:{})});
          if(capabilities)capabilities.native.exposure=directSkills?'effectiveDirectModelOnly':'notSelected';
          if(parentNative||capabilities)nativeSkills=observeNativeSkills(workerClient,ownedThread,parentNative??capabilities.native,{skills:selection?.skills??[]});
          const inventoryTimeoutMs=integrationInventoryTimeoutMs(workerConfig.config),inventoryStarted=performance.now();
          nativeInventory={status:'running',timeoutMs:inventoryTimeoutMs,elapsedMs:0};
          try{
            const tools=await boundedClient.request('mcpServerStatus/list',{threadId:thread.thread.id,detail:'toolsAndAuthOnly',limit:100},{timeoutMs:inventoryTimeoutMs});
            if(parent){
              observedIntegrations=integrationFacts(workerConfig.config,tools);
              observedIntegrations.authentication=observedIntegrations.servers.map(server=>({name:server.name,status:['unknown','unsupported','notLoggedIn','bearerToken','oAuth'].includes(tools.data.find(item=>item.name===server.name)?.authStatus)?tools.data.find(item=>item.name===server.name).authStatus:'unknown'}));
              const {fingerprint:priorFingerprint,...facts}=observedIntegrations;
              observedIntegrations.fingerprint=fingerprint(facts);
            }
            if(!parent)assertDisabledInventory(tools);
            nativeInventory.status='passed';
          }catch(error){nativeInventory.status='failed';throw error;}
          finally{nativeInventory.elapsedMs=performance.now()-inventoryStarted;}
          if (signal?.aborted) throw fault('RUN_STOPPED', 'Workflow admission is closed');
          remaining();
          started = true;
          result = await runWorkerSession(workerClient, { threadId: thread.thread.id, prompt:[prompt,parentGuidance].filter(Boolean).join('\n\n'), timeoutMs,liveDeadline, signal, schema:options.schema,settings:effective,execution:policy?.turn,capabilities,reserveRetry,onEvent,onActive:identity=>{nativeSkills?.confirm(identity.turnId);activeWorkers.set(position,{...identity,client:workerClient});onActive?.(identity);} });
          finishNative();
          if(capabilitySources){
            try{await loadCapabilitySources({runDir,descriptor:capabilitySources});sourceEvidence.completion='passed';}
            catch(error){sourceEvidence.completion='failed';throw error;}
            result.evidence.capabilitySources={...sourceEvidence};
          }
          if(parentCapabilities)result.evidence.parentCapabilities={...structuredClone(parentCapabilities),selectedRoots:structuredClone(roots),native:{...parentNative}};
          if(capabilities){
            result.evidence.capabilities.native={...capabilities.native};
            if(selection.skills.length){
              capabilities.completionSources=await checkCompletionSources(boundedClient,{command:completionCommand,cwd:workerCwd,sandboxPolicy:policy.turn.sandboxPolicy,selection,deadline:liveDeadline,signal});
              result.evidence.capabilities.completionSources={...capabilities.completionSources};
              remaining();
              if(capabilities.completionSources.status!=='passed'){
                const changed=capabilities.completionSources.sourceStatus==='changedOrUnavailable';
                throw Object.assign(fault(changed?'CAPABILITY_SOURCE_CHANGED':'CAPABILITY_SOURCE_UNVERIFIED',changed?'Assigned skill source changed or became unavailable before completion':'Assigned skill source could not be verified before completion'),{evidence:result.evidence,terminalObserved:result.terminalObserved,...(capabilities.completionSources.start==='unknown'?{executionUnknown:true}:{})});
              }
              const missing=[['catalog','skills.list'],['read','skills.read']].filter(([key])=>capabilities.native[key]!=='callAndOutputObserved').map(([,tool])=>tool);
              const activation=capabilities.native.activation;
              const missingSkills=activation?.status==='complete'?[]:activation?.missing?.length?activation.missing:selection.skills.map(skill=>skill.id);
              if(missing.length||missingSkills.length){
                capabilities.native.missing=missing;
                capabilities.native.missingSkills=missingSkills;
                result.evidence.capabilities.native.missing=missing;
                result.evidence.capabilities.native.missingSkills=missingSkills;
                throw Object.assign(fault('CAPABILITY_NATIVE_SKILLS','Selected skills require paired catalog calls and successful initial native reads of every assigned main resource'),{evidence:result.evidence,terminalObserved:result.terminalObserved});
              }
            }
          }
          result.evidence.settings=effective;
          if(nativeInventory)result.evidence.nativeInventory={...nativeInventory};
          if(observedIntegrations)result.evidence.nativeIntegrations=observedIntegrations;
          return result;
        } catch (error) {
          if(result){error.evidence??=result.evidence;if(result.terminalObserved)error.terminalObserved=true;}
          if(!started&&liveDeadline?.signal.aborted&&['CAPABILITY_READINESS','RUN_STOPPED'].includes(error.code))error=Object.assign(fault('TURN_TIMEOUT','Worker exceeded its live wall deadline'),{...(error.evidence?{evidence:error.evidence}:{}),...(error.capabilities?{capabilities:error.capabilities}:{}),...(error.executionUnknown?{executionUnknown:true}:{})});
          primary=error;if (!started) error.noInference = true;
          finishNative();error.evidence??={commands:[],attempts:[]};
          if(sourceEvidence)error.evidence.capabilitySources={...sourceEvidence};
          if(parentCapabilities)error.evidence.parentCapabilities={...structuredClone(parentCapabilities),selectedRoots:structuredClone(roots),native:{...parentNative}};
          if(observedIntegrations)error.evidence.nativeIntegrations=observedIntegrations;
          if(nativeInventory)error.evidence.nativeInventory={...nativeInventory};
          if(error.capabilities)error.evidence.capabilities=error.capabilities;
          else if(capabilities)error.evidence.capabilities={...(error.evidence.capabilities??capabilities),native:{...capabilities.native}};
          throw error;
        }
        finally{
          liveDeadline?.close();
          if(liveDeadline){const evidence=primary?(primary.evidence??={}):result?.evidence;if(evidence)evidence.deadline=liveDeadline.snapshot();}
          finishNative();
          activeWorkers.delete(position);
          let nativeTerminals;
          if(ownedThread){try{nativeTerminals=await cleanupTerminals(workerClient,ownedThread);}catch(error){nativeTerminals={error:diagnostic(error),descendants:'notVerified'};}}
          const ownership=workerClient?await workerClient.close():primary?.cleanup??{serverExited:false,descendants:'notVerified'};
          cleanupHistory.push(ownership);connections.delete(connection);
          const cleanup=workerCleanup(ownership,nativeTerminals,Boolean(jobHost));
          if(primary){primary.evidence??={commands:[],attempts:[]};primary.evidence.cleanup=cleanup;}
          else if(result){result.evidence.cleanup=cleanup;if(cleanup.error)throw Object.assign(fault('WORKER_CLEANUP','Worker cleanup did not finish'),{evidence:result.evidence});}
        }
      },
      close:()=>closePromise??=(async()=>{
        closing=true;
        const active=await Promise.all([...connections].map(connection=>connection.then(worker=>worker.close(),error=>error.cleanup??{serverExited:false,descendants:'notVerified'})));
        const records=[...startup.records.map(record=>record.cleanup),...cleanupHistory,...active];
        return aggregateCleanup(records,requiresJob,startup.records);
      })(),
    };
  } catch (error) { if(!setupClosed)await closeStartup('setup',client); throw error; }
  }catch(error){
    if(startup.attempted){
      error.cleanup=aggregateCleanup(startup.records.map(record=>record.cleanup),requiresJob,startup.records);
    }
    error.evidence??={};
    error.evidence.startup={primary:diagnostic(error),stage:constructionStage,...(commandFailure?{command:commandFailure}:{}),...(error.cleanup?{cleanup:error.cleanup}:{})};
    throw error;
  }
}
