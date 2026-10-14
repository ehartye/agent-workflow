import { execFile } from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import { promisify } from 'node:util';
import { AppServer, fault, diagnostic } from '../foundation/client.mjs';
import {cleanupTerminals} from '../foundation/terminals.mjs';
import {buildJobHost} from '../foundation/windows-job.mjs';
import { createLaunch, assertChatgptLogin } from '../foundation/launch.mjs';
import { assertManagedChatgpt, probe } from '../foundation/probe.mjs';
import { runWorkerSession } from './worker-session.mjs';
import {DEFAULT_WORKER_TIMEOUT_MS} from './deadlines.mjs';
import { createSettings } from './settings.mjs';
import {steerTurn} from '../foundation/turn.mjs';
import { restrictLaunch, assertRestricted, assertDisabledInventory, fingerprint } from './policy.mjs';
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

export async function createManagedBackend({ executable, cwd, backend = 'configured', defaults={},workerCapabilities,workerCapabilitiesHash }) {
  if(defaults.permissions?.sandbox==='workspace-write'&&(process.platform!=='win32'||backend!=='mxc'))throw fault('WORKSPACE_BACKEND','Writers require the verified Windows MXC backend; select --backend mxc');
  let directory;
  const startup={attempted:false,records:[]};
  try{
    const bundle=workerCapabilities===undefined?null:await freezeCapabilities(workerCapabilities);
    if(workerCapabilitiesHash!==undefined&&bundle?.fingerprint!==workerCapabilitiesHash)throw fault('CAPABILITY_IDENTITY','Worker capability ceiling identity changed');
    let jobHost;
    if(process.platform==='win32'){directory=await mkdtemp(join(tmpdir(),'workflow-job-host-'));jobHost=await buildJobHost(directory);}
    const managed=await createBackend({executable,cwd,backend,defaults,jobHost,startup,bundle});
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

async function createBackend({executable,cwd,backend,defaults,jobHost,startup,bundle}){
  const requiresJob=Boolean(jobHost);
  const retainCleanup=(stage,receipt)=>{
    // Only fixed ownership facts and public diagnostics enter retained startup
    // evidence; never spread transport errors or server-supplied details.
    const cleanup={serverExited:receipt?.serverExited===true,forced:receipt?.forced===true,descendants:'notVerified',...(requiresJob?{jobEmpty:receipt?.jobEmpty===true,ownershipScope:'windows-job-members'}:{}),...(receipt?.error?{error:diagnostic(receipt.error)}:{})};
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
  let launch = {...restrictLaunch(createLaunch({ executable, cwd, backend })),...(jobHost?{jobHost}:{})};
  const exec = promisify(execFile);
  const options = { cwd: launch.cwd, env: launch.env, windowsHide: true, timeout: 5000, maxBuffer: 8192 };
  const version = (await exec(executable, ['--version'], options)).stdout.trim();
  if (version !== 'codex-cli 0.162.1') throw fault('VERSION_UNSUPPORTED', 'Workflow engine requires the reviewed Codex 0.162.1 protocol');
  let login;
  try{login=await exec(executable,['login','status'],options);}
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
  const discovery = await connectStartup('discovery',launch);
  let discoveryFailure;
  try {
    const config = await discovery.request('config/read', { cwd: launch.cwd, includeLayers: true });
    launch = restrictLaunch(launch, config.config);
  } catch(error){discoveryFailure=error;}
  const discoveryCleanup=await closeStartup('discovery',discovery);
  if(discoveryFailure)throw discoveryFailure;
  requireCleanup(discoveryCleanup,'DISCOVERY_CLEANUP','Configuration discovery did not confirm ownership termination');
  const admissionClient = await connectStartup('admission',launch);
  try { assertRestricted((await admissionClient.request('config/read', {cwd:launch.cwd})).config); }
  catch(error) { await closeStartup('admission',admissionClient); throw error; }
  let admission;
  try{admission = await probe(admissionClient, {
    cwd: launch.cwd,
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
  const client = await connectStartup('setup',{ ...launch, experimentalApi:true, env: { ...launch.env, AGENT_WORKFLOW_WORKER: '1' } });
  let setupClosed=false;
  try {
    const account = await client.request('account/read', { refreshToken: false });
    const config = await client.request('config/read', { cwd: launch.cwd, includeLayers: true });
    assertManagedChatgpt(account, config);
    assertRestricted(config.config);
    const catalog=[];let cursor;
    for(let page=0;page<10;page++){
      const models=await client.request('model/list',{includeHidden:true,limit:100,...(cursor?{cursor}:{})});
      if(!Array.isArray(models.data))throw fault('MODEL_CATALOG','Codex model catalog is malformed');
      catalog.push(...models.data);cursor=models.nextCursor;
      if(cursor==null)break;
      if(typeof cursor!=='string'||!cursor||page===9)throw fault('MODEL_CATALOG','Codex model catalog exceeded its page limit');
    }
    const settings=createSettings({catalog,config:config.config,defaults,workerCapabilities:bundle?.manifest});
    const activeWorkers=new Map();
    const connections=new Set(),cleanupHistory=[];let closing=false,closePromise;
    const identity = fingerprint({ version, cwd: launch.cwd, backend, account, config: config.config, defaults:settings.resolve(),playwrightBrowsersPath:launch.env.PLAYWRIGHT_BROWSERS_PATH??null,...(bundle?{workerCapabilitiesHash:bundle.fingerprint,directSkills:DIRECT_SKILLS}:{}), layers: config.layers.filter(layer => !layer.disabledReason).map(layer => layer.config) });
    setupClosed=true;
    const setupCleanup=await closeStartup('setup',client);
    requireCleanup(setupCleanup,'SETUP_CLEANUP','Configuration server did not confirm ownership termination');
    return {
      identity, admission, ...(bundle?{workerCapabilitiesHash:bundle.fingerprint}:{}),resolveOptions:settings.resolve,
      async steer({position,turnId,text}){
        const identity=activeWorkers.get(position);
        if(!identity||identity.turnId!==turnId)throw fault('CONTROL_TURN','Worker no longer owns that active turn');
        return steerTurn(identity.client,{threadId:identity.threadId,turnId:identity.turnId,text});
      },
      async execute({ prompt, options = {}, signal, reserveRetry, position, onActive,onEvent,workspace }) {
        if (closing||signal?.aborted) throw Object.assign(fault('RUN_STOPPED', 'Workflow admission is closed'), { notStarted: true,noProcessStarted:true });
        const effective=settings.resolve(options),writing=effective.permissions.sandbox==='workspace-write';
        const selection=selectCapabilities(bundle?.manifest,options);
        if(writing){
          if(!jobHost||!workspace)throw Object.assign(fault('WORKSPACE_REQUIRED','Writer execution requires an owned Windows job and isolated workspace'),{notStarted:true,noProcessStarted:true});
          try{await assertWorkspaceReady(workspace);}catch(error){error.notStarted=true;error.noProcessStarted=true;throw error;}
        }else if(workspace)throw Object.assign(fault('WORKSPACE_POLICY','Read-only workers cannot receive writable workspaces'),{notStarted:true,noProcessStarted:true});
        const workerCwd=writing?workspace.cwd:launch.cwd,policy=writing?writerPolicy(workerCwd):null;
        if(closing||signal?.aborted)throw Object.assign(fault('RUN_STOPPED','Worker admission is closed'),{notStarted:true,noProcessStarted:true});
        let started = false;
        let ownedThread,result,primary,workerClient,capabilities,nativeSkills;
        const workerEnv=createLaunch({executable:launch.command,cwd:workerCwd,backend,env:launch.env,capabilityEnvironment:selection?.environment}).env;
        const connection=AppServer.connect({...launch,args:[...launch.args,...(policy?.launchArgs??[]),...(selection?.skills.length?['-c',DIRECT_SKILLS]:[])],cwd:workerCwd,experimentalApi:true,env:{...workerEnv,AGENT_WORKFLOW_WORKER:'1'}});
        connections.add(connection);
        try {
          workerClient=await connection;
          if(closing||signal?.aborted)throw fault('RUN_STOPPED','Workflow admission is closed');
          const workerConfig=await workerClient.request('config/read',{cwd:workerCwd,includeLayers:true});
          assertRestricted(workerConfig.config);
          assertManagedChatgpt(await workerClient.request('account/read',{refreshToken:false}),workerConfig);
          if(selection?.skills.length)assertDirectSkills(workerConfig.config);
          const thread = await workerClient.request('thread/start', {
            cwd:workerCwd,approvalPolicy:'never',sandbox:'read-only',...policy?.thread,ephemeral:true,modelProvider:'openai',experimentalRawEvents:true,
            model:effective.model,config:{...policy?.thread.config,model_reasoning_effort:effective.effort},
            ...(selection?.roots.length?{selectedCapabilityRoots:selection.roots}:{}),
            developerInstructions: `${writing?'You are an isolated writer. Edit and validate only inside your assigned worktree. Do not commit, merge, change Git metadata or create filesystem links. Your changes will be retained for review.':'You are a read-only workflow worker.'} Complete only your assigned task. Do not launch another agent-workflow runtime. Do not delegate. If a command cannot start or a prerequisite check fails, report the blocked command, executable or cache path, and observed evidence. Pause only work that depends on that prerequisite; continue independent authorized authoring or review within your assigned scope. A command that launched and exited nonzero was executed and may have changed files; describe it as notStarted only when tool evidence explicitly confirms no process began. Never automatically retry or use a fallback after uncertain or potentially mutating effects; the coordinator must reconcile them first. Do not weaken sandbox or execution policy, change global configuration, or automatically install missing prerequisites. Use only explicitly authorized installation steps and coordinator-verified executable/cache paths; otherwise leave dependent build, test or rendering to the coordinator and disclose missing verification. The workflow coordinator owns orchestration.`,
          });
          if(writing)assertWriterThread(thread,workerCwd);
          if (thread.modelProvider !== 'openai' || thread.approvalPolicy !== 'never' || !writing&&(thread.sandbox?.type !== 'readOnly'||thread.sandbox.networkAccess!==false) || typeof thread.thread?.id !== 'string') throw fault('THREAD_POLICY', 'Worker thread did not confirm the required provider and permissions');
          if(thread.model!==effective.model||thread.reasoningEffort!==effective.effort)throw fault('THREAD_SETTINGS','Worker thread did not confirm its model and reasoning settings');
          ownedThread=thread.thread.id;
          // Readiness executes commands but no model turn. Own the thread first
          // so even rejected readiness retains native inventory cleanup proof.
          const timeoutMs=options.timeoutMs??DEFAULT_WORKER_TIMEOUT_MS,deadline=performance.now()+timeoutMs;
          const remaining=()=>{const ms=Math.floor(deadline-performance.now());if(ms<=0)throw fault('TURN_TIMEOUT','Worker exceeded its overall deadline');return ms;};
          capabilities=await admitWorkerCapabilities(workerClient,{cwd:workerCwd,selection,signal,deadline});
          if(capabilities){capabilities.native.exposure=selection.skills.length?'effectiveDirectModelOnly':'notSelected';nativeSkills=observeNativeSkills(workerClient,ownedThread,capabilities.native);}
          const tools = await workerClient.request('mcpServerStatus/list', {threadId:thread.thread.id,detail:'toolsAndAuthOnly',limit:100},{timeoutMs:Math.min(15000,remaining())});
          assertDisabledInventory(tools);
          if (signal?.aborted) throw fault('RUN_STOPPED', 'Workflow admission is closed');
          remaining();
          started = true;
          result = await runWorkerSession(workerClient, { threadId: thread.thread.id, prompt, timeoutMs,deadline, signal, schema:options.schema,settings:effective,execution:policy?.turn,capabilities,reserveRetry,onEvent,onActive:identity=>{nativeSkills?.confirm(identity.turnId);activeWorkers.set(position,{...identity,client:workerClient});onActive?.(identity);} });
          if(capabilities){
            nativeSkills?.finish();result.evidence.capabilities.native={...capabilities.native};
            if(selection.skills.length){
              const missing=[['catalog','skills.list'],['read','skills.read']].filter(([key])=>capabilities.native[key]!=='callAndOutputObserved').map(([,tool])=>tool);
              if(missing.length){
                capabilities.native.missing=missing;
                result.evidence.capabilities.native.missing=missing;
                throw Object.assign(fault('CAPABILITY_NATIVE_SKILLS','Selected skills require paired native skill-tool invocations; completion claims cannot substitute'),{evidence:result.evidence,terminalObserved:result.terminalObserved});
              }
            }
          }
          result.evidence.settings=effective;
          return result;
        } catch (error) {
          primary=error;if (!started) error.noInference = true;
          nativeSkills?.finish();error.evidence??={commands:[],attempts:[]};
          if(error.capabilities)error.evidence.capabilities=error.capabilities;
          else if(capabilities)error.evidence.capabilities={...(error.evidence.capabilities??capabilities),native:{...capabilities.native}};
          throw error;
        }
        finally{
          nativeSkills?.finish();
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
      error.evidence??={};
      error.evidence.startup={primary:diagnostic(error),cleanup:error.cleanup};
    }
    throw error;
  }
}
