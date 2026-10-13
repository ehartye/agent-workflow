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
import { createSettings } from './settings.mjs';
import {steerTurn} from '../foundation/turn.mjs';
import { restrictLaunch, assertRestricted, assertDisabledInventory, fingerprint } from './policy.mjs';
import {writerPolicy,assertWriterThread} from './workspace-policy.mjs';
import {assertWorkspaceReady} from './workspaces.mjs';

export function workerCleanup(ownership,nativeTerminals,requiresJob){
  const cleanup={...ownership,...(nativeTerminals?{nativeTerminals}:{})};
  if(!ownership.serverExited||requiresJob&&ownership.jobEmpty!==true)cleanup.error=diagnostic(fault('WORKER_DRAIN','Worker ownership boundary did not confirm termination'));
  else if(nativeTerminals?.error)cleanup.error=nativeTerminals.error;
  return cleanup;
}

export async function createManagedBackend({ executable, cwd, backend = 'configured', defaults={} }) {
  if(defaults.permissions?.sandbox==='workspace-write'&&(process.platform!=='win32'||backend!=='mxc'))throw fault('WORKSPACE_BACKEND','Writers require the verified Windows MXC backend; select --backend mxc');
  let directory;
  try{
    let jobHost;
    if(process.platform==='win32'){directory=await mkdtemp(join(tmpdir(),'workflow-job-host-'));jobHost=await buildJobHost(directory);}
    const managed=await createBackend({executable,cwd,backend,defaults,jobHost});
    let closing;
    return{...managed,close:()=>closing??=(async()=>{const result=await managed.close();if(directory&&result.serverExited)await rm(directory,{recursive:true,force:true});return result;})()};
  }catch(error){if(directory)await rm(directory,{recursive:true,force:true});throw error;}
}

async function createBackend({executable,cwd,backend,defaults,jobHost}){
  let launch = {...restrictLaunch(createLaunch({ executable, cwd, backend })),...(jobHost?{jobHost}:{})};
  const exec = promisify(execFile);
  const options = { cwd: launch.cwd, env: launch.env, windowsHide: true, timeout: 5000, maxBuffer: 8192 };
  const version = (await exec(executable, ['--version'], options)).stdout.trim();
  if (version !== 'codex-cli 0.162.1') throw fault('VERSION_UNSUPPORTED', 'Workflow engine requires the reviewed Codex 0.162.1 protocol');
  assertChatgptLogin(await exec(executable, ['login','status'], options));
  // Configuration discovery starts no threads and dispatches no model turns.
  const discovery = await AppServer.connect(launch);
  try {
    const config = await discovery.request('config/read', { cwd: launch.cwd, includeLayers: true });
    launch = restrictLaunch(launch, config.config);
  } finally { await discovery.close(); }
  const admissionClient = await AppServer.connect(launch);
  try { assertRestricted((await admissionClient.request('config/read', {cwd:launch.cwd})).config); }
  catch(error) { await admissionClient.close(); throw error; }
  const admission = await probe(admissionClient, {
    cwd: launch.cwd,
    command: [process.execPath, '-e', 'process.stdout.write("FOUNDATION_OK\\n")'],
    cancelCommand: [process.execPath, '-e', 'process.stdout.write("READY\\n");setInterval(() => {},1000)'],
  });
  if (admission.status !== 'passed') throw Object.assign(fault('ADMISSION_FAILED', 'Command-only worker admission failed; no inference dispatched'), {admission});
  const client = await AppServer.connect({ ...launch, experimentalApi:true, env: { ...launch.env, AGENT_WORKFLOW_WORKER: '1' } });
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
    const settings=createSettings({catalog,config:config.config,defaults});
    const activeWorkers=new Map();
    const connections=new Set(),cleanupHistory=[];let closing=false,closePromise;
    const identity = fingerprint({ version, cwd: launch.cwd, backend, account, config: config.config, defaults:settings.resolve(), layers: config.layers.filter(layer => !layer.disabledReason).map(layer => layer.config) });
    const setupCleanup=await client.close();
    if(!setupCleanup.serverExited)throw fault('SETUP_CLEANUP','Configuration server did not confirm termination');
    return {
      identity, admission, resolveOptions:settings.resolve,
      async steer({position,turnId,text}){
        const identity=activeWorkers.get(position);
        if(!identity||identity.turnId!==turnId)throw fault('CONTROL_TURN','Worker no longer owns that active turn');
        return steerTurn(identity.client,{threadId:identity.threadId,turnId:identity.turnId,text});
      },
      async execute({ prompt, options = {}, signal, reserveRetry, position, onActive,onEvent,workspace }) {
        if (closing||signal?.aborted) throw Object.assign(fault('RUN_STOPPED', 'Workflow admission is closed'), { notStarted: true,noProcessStarted:true });
        const effective=settings.resolve(options),writing=effective.permissions.sandbox==='workspace-write';
        if(writing){
          if(!jobHost||!workspace)throw Object.assign(fault('WORKSPACE_REQUIRED','Writer execution requires an owned Windows job and isolated workspace'),{notStarted:true,noProcessStarted:true});
          try{await assertWorkspaceReady(workspace);}catch(error){error.notStarted=true;error.noProcessStarted=true;throw error;}
        }else if(workspace)throw Object.assign(fault('WORKSPACE_POLICY','Read-only workers cannot receive writable workspaces'),{notStarted:true,noProcessStarted:true});
        const workerCwd=writing?workspace.cwd:launch.cwd,policy=writing?writerPolicy(workerCwd):null;
        if(closing||signal?.aborted)throw Object.assign(fault('RUN_STOPPED','Worker admission is closed'),{notStarted:true,noProcessStarted:true});
        let started = false;
        let ownedThread,result,primary,workerClient;
        const connection=AppServer.connect({...launch,args:[...launch.args,...(policy?.launchArgs??[])],cwd:workerCwd,experimentalApi:true,env:{...launch.env,AGENT_WORKFLOW_WORKER:'1'}});
        connections.add(connection);
        try {
          workerClient=await connection;
          if(closing||signal?.aborted)throw fault('RUN_STOPPED','Workflow admission is closed');
          const workerConfig=await workerClient.request('config/read',{cwd:workerCwd,includeLayers:true});
          assertRestricted(workerConfig.config);
          assertManagedChatgpt(await workerClient.request('account/read',{refreshToken:false}),workerConfig);
          const thread = await workerClient.request('thread/start', {
            cwd:workerCwd,approvalPolicy:'never',sandbox:'read-only',...policy?.thread,ephemeral:true,modelProvider:'openai',
            model:effective.model,config:{...policy?.thread.config,model_reasoning_effort:effective.effort},
            developerInstructions: `${writing?'You are an isolated writer. Edit and validate only inside your assigned worktree. Do not commit, merge, change Git metadata or create filesystem links. Your changes will be retained for review.':'You are a read-only workflow worker.'} Complete only your assigned task. Do not launch another agent-workflow runtime. Do not delegate. Stop and report a command startup failure without retrying it. The workflow coordinator owns orchestration.`,
          });
          if(writing)assertWriterThread(thread,workerCwd);
          if (thread.modelProvider !== 'openai' || thread.approvalPolicy !== 'never' || !writing&&(thread.sandbox?.type !== 'readOnly'||thread.sandbox.networkAccess!==false) || typeof thread.thread?.id !== 'string') throw fault('THREAD_POLICY', 'Worker thread did not confirm the required provider and permissions');
          if(thread.model!==effective.model||thread.reasoningEffort!==effective.effort)throw fault('THREAD_SETTINGS','Worker thread did not confirm its model and reasoning settings');
          ownedThread=thread.thread.id;
          const tools = await workerClient.request('mcpServerStatus/list', {threadId:thread.thread.id,detail:'toolsAndAuthOnly',limit:100});
          assertDisabledInventory(tools);
          if (signal?.aborted) throw fault('RUN_STOPPED', 'Workflow admission is closed');
          started = true;
          result = await runWorkerSession(workerClient, { threadId: thread.thread.id, prompt, timeoutMs: options.timeoutMs ?? 120000, signal, schema:options.schema,settings:effective,execution:policy?.turn,reserveRetry,onEvent,onActive:identity=>{activeWorkers.set(position,{...identity,client:workerClient});onActive?.(identity);} });
          result.evidence.settings=effective;
          return result;
        } catch (error) {primary=error;if (!started) error.notStarted = true; throw error; }
        finally{
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
        const records=[setupCleanup,...cleanupHistory,...active];
        return{serverExited:records.every(record=>record.serverExited===true),forced:records.some(record=>record.forced),descendants:'notVerified',...(jobHost?{jobEmpty:records.every(record=>record.jobEmpty===true),ownershipScope:'windows-job-members'}:{})};
      })(),
    };
  } catch (error) { await client.close(); throw error; }
}
