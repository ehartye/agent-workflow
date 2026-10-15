/** @lane merge
 * @subject engine/controller.mjs
 * @subject engine/evaluator-child.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile,cp,appendFile,stat } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';

const meta = 'export const meta={name:"local",description:"controller acceptance"};\n';
test('replay refuses changed native observation source and preserves the accepted execution',async t=>{
 const {runDir}=await setup(t),repository=fileURLToPath(new URL('../',import.meta.url)),source=join(runDir,'source');
 for(const name of ['engine','foundation','package-lock.json'])await cp(join(repository,name),join(source,name),{recursive:true});
 const {runWorkflow,readRun}=await import(pathToFileURL(join(source,'engine/controller.mjs')).href);let calls=0;
 const input={runDir:join(runDir,'state'),sessionId:'synthetic-source-identity',script:meta+'return await agent("Read");',backend:backend(async()=>({value:++calls,terminalObserved:true}))};
 const before=await runWorkflow(input);assert.equal(before.status,'completed');assert.equal(calls,1);
 await appendFile(join(source,'foundation/tool-observation.mjs'),'\n// changed controlled source identity\n');
 await assert.rejects(runWorkflow({...input,resume:true}),{code:'REPLAY_RUNTIME'});
 assert.equal(calls,1);assert.deepEqual(await readRun(input.runDir),before);
});
async function setup(t) {
  const runDir = await mkdtemp(join(fileURLToPath(new URL('../', import.meta.url)), '.controller-test-'));
  t.after(() => rm(runDir, { recursive: true, force: true }));
  const module = await import('../engine/controller.mjs').catch(() => null);
  assert.ok(module?.runWorkflow, 'Fresh workflow controller must exist');
  return { runDir, runWorkflow: module.runWorkflow, readRun: module.readRun, requestControl: module.requestControl, readControl:module.readControl };
}
// Synthetic backend observations; these tests make no model, Windows job or descendant claim.
const backend = execute => ({ identity: 'fixture-v1', execute, close: async () => ({ serverExited: true, descendants: 'notVerified' }) });

test('new-run persisted input overflow refuses before creating state artifacts',async t=>{
 const {runDir:root,runWorkflow}=await setup(t),runDir=join(root,'unbound');let calls=0;
 const script=`export const meta={name:"large",description:${JSON.stringify('m'.repeat(600000))}};return args;`;
 await assert.rejects(runWorkflow({runDir,sessionId:'s',script,args:'x'.repeat(1500000),backend:backend(async()=>{calls++;return{value:null,terminalObserved:true};})}),error=>error.code==='RESULT_SIZE'&&/persisted run input.*2 MiB/.test(error.message));
 assert.equal(calls,0);await assert.rejects(stat(runDir),{code:'ENOENT'});
});

test('oversized worker prompt retains AGENT_INPUT with file-backed guidance before execution',async t=>{
 const {runDir,runWorkflow}=await setup(t);let calls=0;
 const run=await runWorkflow({runDir,sessionId:'s',script:meta+'return await agent(args);',args:'🙂'.repeat(32769),backend:backend(async()=>{calls++;return{value:'unexpected',terminalObserved:true};})});
 assert.equal(calls,0);assert.equal(run.error.code,'AGENT_INPUT');
 assert.match(run.error.message,/65536 UTF-16/);assert.match(run.error.message,/file.*hash.*range/i);
});

test('parent catalog drift refuses replay before repeating a completed writer or changing retained artifacts',async t=>{
  const {runDir:root,runWorkflow,readRun}=await setup(t);
  const {mkdir,readFile}=await import('node:fs/promises');
  const {promisify}=await import('node:util');const {execFile}=await import('node:child_process');const exec=promisify(execFile);
  const {resolveAccess}=await import('../engine/access-policy.mjs');const {verifyWorkspace}=await import('../engine/workspaces.mjs');
  const source=join(root,'project');await mkdir(source);
  const git=(...args)=>exec('git',args,{cwd:source,windowsHide:true});
  await git('init','-q');await git('config','user.name','Fixture');await git('config','user.email','fixture@example.invalid');
  await writeFile(join(source,'note.txt'),'original\n');await git('add','.');await git('commit','-qm','fixture');
  const accessPolicy=resolveAccess({sessionId:'s',parentAccess:{version:1,sessionId:'s',provenance:'codex-session-context',filesystem:'unrestricted',networkAccess:true,approvalPolicy:'never'}});
  const cleanup={serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members',nativeTerminals:{inventoryEmpty:true}};
  let calls=0;
  const native=(catalog='a'.repeat(64))=>({identity:`backend-${catalog}`,accessPolicy,parentCapabilities:{fingerprint:catalog,coverage:{complete:true}},close:async()=>cleanup,execute:async({workspace})=>{
    calls++;await writeFile(join(workspace.cwd,'note.txt'),`owned effect ${calls}\n`);return{value:'done',terminalObserved:true,evidence:{cleanup}};
  }});
  const input={runDir:join(root,'run'),sessionId:'s',launch:{cwd:source,accessPolicy},script:meta+'return await agent("Write",{workspace:"isolated"});'};
  const first=await runWorkflow({...input,backend:native()});assert.equal(first.status,'completed');assert.equal(calls,1);
  const patch=await readFile(first.workers[0].workspace.patchPath);
  await assert.rejects(runWorkflow({...input,resume:true,backend:native('b'.repeat(64))}),{code:'PARENT_CAPABILITIES_CHANGED'});
  assert.deepEqual(await readRun(input.runDir),first);assert.equal(calls,1);
  assert.deepEqual(await readFile(first.workers[0].workspace.patchPath),patch);assert.equal(await verifyWorkspace(first.workers[0].workspace),true);
  assert.equal(await readFile(join(source,'note.txt'),'utf8'),'original\n');assert.equal(first.parentCapabilitiesHash,'a'.repeat(64));
  const cached=await runWorkflow({...input,resume:true,backend:native()});assert.equal(cached.coverage.cached,1);assert.equal(calls,1);
  const absent=native();delete absent.parentCapabilities;
  await assert.rejects(runWorkflow({...input,resume:true,backend:absent}),{code:'PARENT_CAPABILITIES_CHANGED'});
  assert.deepEqual(await readRun(input.runDir),cached);
  const db=new DatabaseSync(join(input.runDir,'run.sqlite'));
  const header=JSON.parse(db.prepare('SELECT value FROM header WHERE id=1').get().value);delete header.parentCapabilitiesHash;
  db.prepare('UPDATE header SET value=? WHERE id=1').run(JSON.stringify(header));db.close();
  const incomplete=await readRun(input.runDir);
  await assert.rejects(runWorkflow({...input,resume:true,backend:native()}),{code:'PARENT_CAPABILITIES_CHANGED'});
  assert.deepEqual(await readRun(input.runDir),incomplete);assert.equal(calls,1);
});

test('parent catalog drift also rejects explicit restart and fresh incomplete catalog before worker admission',async t=>{
  const {runDir,runWorkflow,readRun}=await setup(t);const {resolveAccess}=await import('../engine/access-policy.mjs');
  const accessPolicy=resolveAccess({sessionId:'s',parentAccess:{version:1,sessionId:'s',provenance:'codex-session-context',filesystem:'unrestricted',networkAccess:true,approvalPolicy:'never'}});
  const cleanup={serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members',nativeTerminals:{inventoryEmpty:true}};let calls=0;
  const native=(hash='a'.repeat(64),complete=true)=>({identity:`backend-${hash}`,accessPolicy,parentCapabilities:{fingerprint:hash,coverage:{complete}},close:async()=>cleanup,execute:async()=>{
    calls++;throw Object.assign(new Error('known task failure'),{code:'FIXTURE',terminalObserved:true,evidence:{cleanup}});
  }});
  const input={runDir,sessionId:'s',launch:{accessPolicy},script:meta+'return await agent("Task");'};
  const missing=native();delete missing.parentCapabilities;
  await assert.rejects(runWorkflow({...input,backend:missing}),{code:'PARENT_CAPABILITIES_CHANGED'});assert.equal(calls,0);
  await assert.rejects(runWorkflow({...input,backend:native('a'.repeat(64),false)}),{code:'PARENT_CAPABILITIES_CHANGED'});assert.equal(calls,0);
  const first=await runWorkflow({...input,backend:native()});assert.equal(first.workers[0].status,'failed');assert.equal(calls,1);
  await assert.rejects(runWorkflow({...input,resume:true,expectedGeneration:first.generation,restart:{position:0,attempt:first.workers[0].attempts,reconciliation:'Owned fixture failure had no external effects.'},backend:native('b'.repeat(64))}),{code:'PARENT_CAPABILITIES_CHANGED'});
  assert.deepEqual(await readRun(runDir),first);assert.equal(calls,1);
});

test('capability ceiling persists and rejects resume overrides source drift and undeclared worker IDs',async t=>{
  const {runDir,runWorkflow,readRun}=await setup(t);
  const source=join(runDir,'skill-source');await (await import('node:fs/promises')).mkdir(source);
  const path=join(source,'SKILL.md');await writeFile(path,'original native skill');
  const {createHash}=await import('node:crypto');
  const skill={id:'selected',name:'native-skill',root:source,path,sha256:createHash('sha256').update('original native skill').digest('hex'),references:[]};
  const manifest={version:1,skills:[skill],tools:[]};let calls=0;
  const input={runDir,sessionId:'s',workerCapabilities:manifest,script:meta+'return await agent("Use native skill",{skills:["selected"]});',backend:backend(async()=>({value:++calls,terminalObserved:true}))};
  const first=await runWorkflow(input);assert.equal(first.status,'completed');assert.deepEqual(first.workerCapabilities,manifest);assert.match(first.workerCapabilitiesHash,/^[a-f0-9]{64}$/);
  const {workerCapabilities,...saved}=input;
  const replay=await runWorkflow({...saved,resume:true});assert.equal(replay.coverage.cached,1);assert.equal(calls,1);
  await assert.rejects(runWorkflow({...input,resume:true}),{code:'CAPABILITY_OVERRIDE'});assert.deepEqual(await readRun(runDir),replay);
  await writeFile(path,'drift');await assert.rejects(runWorkflow({...saved,resume:true}),{code:'SKILL_SOURCE'});assert.deepEqual(await readRun(runDir),replay);
  await writeFile(path,'original native skill');
  const invalid=await runWorkflow({...saved,resume:true,script:meta+'return await agent("Invalid",{skills:["undeclared"]});'});
  assert.equal(invalid.error.code,'CAPABILITY_SELECTION');assert.equal(calls,1);
});

test('run and worker deadlines are independent, persisted and reused on replay',async t=>{
  const {runDir,runWorkflow,readRun}=await setup(t);const seen=[];
  const input={runDir,sessionId:'s',script:meta+'return await agent("A");'};
  const execute=async({options})=>{seen.push(options.timeoutMs);return{value:'done',terminalObserved:true};};
  const first=await runWorkflow({...input,backend:backend(execute)});
  assert.equal(first.timeoutMs,null);assert.equal(first.workerTimeoutMs,null);
  assert.deepEqual(seen,[null]);assert.equal(first.workers[0].options.timeoutMs,null);
  const changed=await runWorkflow({...input,resume:true,timeoutMs:7200000,workerTimeoutMs:1800000,backend:backend(execute)});
  assert.equal(changed.coverage.cached,0);assert.deepEqual(seen,[null,1800000]);
  const replay=await runWorkflow({...input,resume:true,backend:backend(execute)});
  assert.equal(replay.coverage.cached,1);assert.equal(replay.timeoutMs,7200000);assert.equal(replay.workerTimeoutMs,1800000);
  assert.equal((await readRun(runDir)).workerTimeoutMs,1800000);
  const manual=await runWorkflow({...input,resume:true,timeoutMs:null,backend:backend(execute)});
  assert.equal(manual.timeoutMs,null);assert.equal(manual.coverage.cached,1);
  const cleared=await runWorkflow({...input,resume:true,workerTimeoutMs:null,backend:backend(execute)});
  assert.equal(cleared.workerTimeoutMs,null);assert.equal(cleared.coverage.cached,0);assert.deepEqual(seen,[null,1800000,null]);
});

test('worker deadlines accept bounded implementation work and reject overflow before dispatch',async t=>{
  const {runDir,runWorkflow}=await setup(t);let calls=0;
  const execute=async({options})=>{calls++;return{value:options.timeoutMs,terminalObserved:true};};
  const input={runDir,sessionId:'s',script:meta+'return await agent("A",{timeoutMs:args});'};
  const first=await runWorkflow({...input,args:2**32,backend:backend(execute)});
  assert.equal(first.status,'completed');assert.equal(first.result,2**32);
  const invalid=await runWorkflow({...input,resume:true,args:Number.MAX_SAFE_INTEGER+1,backend:backend(execute)});
  assert.equal(invalid.error.code,'AGENT_INPUT');assert.equal(calls,1);
});

test('invalid run and worker limits fail before admission',async t=>{
  const {runDir,runWorkflow}=await setup(t);let calls=0;
  for(const limits of [{timeoutMs:0},{timeoutMs:86400001},{timeoutMs:1.5},{workerTimeoutMs:0},{workerTimeoutMs:Number.MAX_SAFE_INTEGER+1},{workerTimeoutMs:1.5}]){
    await assert.rejects(runWorkflow({runDir,sessionId:'s',script:meta+'return 1;',...limits,backend:backend(async()=>{calls++;})}),{code:'RUN_INPUT'});
  }
  assert.equal(calls,0);
});

test('run wall deadline cancels outstanding work and preserves unknown outcomes',async t=>{
  const {runDir,runWorkflow}=await setup(t);let aborted=false;
  const run=await runWorkflow({runDir,sessionId:'s',timeoutMs:1500,workerTimeoutMs:600000,script:meta+'return await agent("A");',backend:backend(async({signal})=>{
    await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('unconfirmed cancellation'));},{once:true}));
  })});
  assert.equal(run.error.code,'EVALUATOR_TIMEOUT');assert.equal(aborted,true);assert.equal(run.workers[0].status,'unknown');assert.equal(run.cleanup.serverExited,true);
});

test('untrusted backend errors cannot inject capture diagnostics into persisted worker failures',async t=>{
  const {runDir,runWorkflow,readRun}=await setup(t);
  const run=await runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',backend:backend(async()=>{
    throw Object.assign(new Error('PRIVATE_ERROR'),{code:'WORKSPACE_INPUT',terminalObserved:true,captureFailure:{stage:'inventory',cause:{code:'PRIVATE',message:'PRIVATE_CAPTURE'}}});
  })});
  assert.equal(run.workers[0].error.code,'CHECK_FAILED');
  assert.equal(run.workers[0].error.capture,undefined);
  assert.doesNotMatch(JSON.stringify((await readRun(runDir)).workers[0].error),/PRIVATE/);
});

test('primary terminal failure retains its diagnostic but failed cleanup prohibits replay',async t=>{
  const {runDir,runWorkflow}=await setup(t);
  const {fault}=await import('../foundation/client.mjs');let calls=0;
  const input={runDir,sessionId:'s',script:meta+'return await agent("A");',backend:backend(async()=>{
    calls++;throw Object.assign(fault('RESULT_SCHEMA','Result contract failed'),{terminalObserved:true,evidence:{cleanup:{error:{code:'TERMINAL_REMAINING',message:'Native terminals remain'},descendants:'notVerified'}}});
  })};
  const run=await runWorkflow(input);
  assert.equal(run.workers[0].status,'unknown');
  assert.equal(run.workers[0].error.code,'RESULT_SCHEMA');
  assert.equal(run.workers[0].evidence.cleanup.error.code,'TERMINAL_REMAINING');
  await assert.rejects(runWorkflow({...input,resume:true}),{code:'REPLAY_UNKNOWN'});
  assert.equal(calls,1);
});

test('individual steering and cancellation target one exact attempt while unrelated work completes',async t=>{
  const {runDir,runWorkflow,requestControl,readControl}=await setup(t);let announced,finish;
  const ready=new Promise(resolve=>{announced=resolve;}),gate=new Promise(resolve=>{finish=resolve;});let started=0;const steered=[];
  const input={runDir,sessionId:'s',concurrency:2,script:meta+'return await parallel([()=>agent("A"),()=>agent("B")]);'};
  const work=runWorkflow({...input,backend:{...backend(async({position,onActive,signal})=>{
    onActive({threadId:`thread-${position}`,turnId:`turn-${position}`});if(++started===2)announced();
    if(position===1){await gate;assert.equal(signal.aborted,false);return{value:'B survived',terminalObserved:true};}
    return await Promise.race([gate.then(()=>({value:'A finished',terminalObserved:true})),new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('cancelled'),{interruption:{terminalObserved:true,terminalStatus:'interrupted',descendants:'notVerified'}})),{once:true}))]);
  }),steer:async request=>{steered.push(request);return{turnId:request.turnId};}}});
  await ready;let run;
  try{
    await assert.rejects(requestControl(runDir,{sessionId:'s',generation:1,action:'steer',position:0,attempt:2,turnId:'turn-0',text:'Change'}),{code:'CONTROL_ATTEMPT'});
    await assert.rejects(requestControl(runDir,{sessionId:'s',generation:1,action:'steer',position:0,attempt:1,turnId:'stale',text:'Change'}),{code:'CONTROL_TURN'});
    const steer=await requestControl(runDir,{sessionId:'s',generation:1,action:'steer',position:0,attempt:1,turnId:'turn-0',text:'Read a different line'});
    let receipt;
    const until=Date.now()+2000;
    do{await new Promise(resolve=>setTimeout(resolve,10));receipt=await readControl(runDir,steer.id);}while(['pending','applying'].includes(receipt.status)&&Date.now()<until);
    assert.equal(receipt.status,'applied');assert.equal(steered.length,1);assert.equal(steered[0].position,0);assert.equal(steered[0].text,'Read a different line');
    const cancel=await requestControl(runDir,{sessionId:'s',generation:1,action:'cancel-worker',position:0,attempt:1,turnId:'turn-0'});
    do{await new Promise(resolve=>setTimeout(resolve,10));receipt=await readControl(runDir,cancel.id);}while(receipt.status==='pending'&&Date.now()<until);
    assert.equal(receipt.status,'applied');
  }finally{finish();run=await work;}
  assert.equal(run.workers[0].status,'unknown');assert.equal(run.workers[0].interruption.terminalStatus,'interrupted');assert.equal(run.workers[1].result,'B survived');
  assert.deepEqual(run.result,[null,'B survived']);assert.equal(run.attempts,2);
});

for(const waitKind of ['slot','dependency'])test(`queued ${waitKind} cancellation settles before unrelated active work completes`,async t=>{
  const {runDir,runWorkflow,readRun,requestControl,readControl}=await setup(t);let announced,finish;const ready=new Promise(resolve=>{announced=resolve;}),gate=new Promise(resolve=>{finish=resolve;});const calls=[];
  const work=runWorkflow({runDir,sessionId:'s',concurrency:1,args:waitKind==='dependency',script:meta+'return await parallel([()=>agent("A",{id:"a"}),()=>agent("B",{dependsOn:args?["a"]:[]})]);',backend:backend(async({prompt,signal})=>{calls.push(prompt);announced();await gate;assert.equal(signal.aborted,false);return{value:prompt,terminalObserved:true};})});
  await ready;let run;
  try{
    const until=Date.now()+2000;while((await readRun(runDir)).workers.length<2&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
    const cancel=await requestControl(runDir,{sessionId:'s',generation:1,action:'cancel-worker',position:1,attempt:0,turnId:null});
    while((await readControl(runDir,cancel.id)).status==='pending'&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
    let during;do{await new Promise(resolve=>setTimeout(resolve,10));during=await readRun(runDir);}while(during.workers[1].status==='queued'&&Date.now()<until);
    assert.equal(during.workers[1].status,'failed');assert.equal(during.workers[0].status,'running');
  }finally{finish();run=await work;}
  assert.deepEqual(calls,['A']);assert.equal(run.workers[1].status,'failed');assert.equal(run.workers[1].error.code,'WORKER_CANCELLED');assert.equal(run.workers[1].attempts??0,0);
});

test('whole-run stop preempts unconfirmed steering and late confirmation cannot rewrite its receipt',async t=>{
  const {runDir,runWorkflow,requestControl,readControl}=await setup(t);let announced,confirm,finish;const ready=new Promise(resolve=>{announced=resolve;}),gate=new Promise(resolve=>{finish=resolve;}),steering=new Promise(resolve=>{confirm=resolve;});
  const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',backend:{...backend(async({onActive,signal})=>{
    onActive({threadId:'thread',turnId:'turn'});announced();
    return await Promise.race([gate.then(()=>({value:'finished',terminalObserved:true})),new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}))]);
  }),steer:()=>steering}});
  await ready;let receipt,run;
  try{
    receipt=await requestControl(runDir,{sessionId:'s',generation:1,action:'steer',position:0,attempt:1,turnId:'turn',text:'Read another line'});
    const until=Date.now()+2000;while((await readControl(runDir,receipt.id)).status==='pending'&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal((await readControl(runDir,receipt.id)).status,'applying');
    await requestControl(runDir,{sessionId:'s',generation:1,action:'stop'});
    run=await work;
  }finally{finish();await work;}
  assert.equal(run.status,'blocked');assert.equal((await readControl(runDir,receipt.id)).status,'unknown');
  confirm({turnId:'turn'});await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await readControl(runDir,receipt.id)).status,'unknown');
});

test('rolled back activity cannot leak usage into subsequent worker persistence',async t=>{
  const {runDir,runWorkflow}=await setup(t);
  const run=await runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("Read");',onReady:()=>{
    const db=new DatabaseSync(join(runDir,'run.sqlite'));
    try{db.exec("CREATE TRIGGER activity_failure BEFORE INSERT ON activity_counts BEGIN SELECT RAISE(ABORT,'fixture persistence failure'); END;");}finally{db.close();}
  },backend:backend(async({onEvent})=>{
    onEvent({method:'thread/tokenUsage/updated',params:{threadId:'thread',turnId:'turn',tokenUsage:{total:{inputTokens:10,cachedInputTokens:0,outputTokens:2,reasoningOutputTokens:0,totalTokens:12}}}});
    return{value:'must not succeed',terminalObserved:true};
  })});
  assert.equal(run.workers[0].status,'unknown');
  assert.equal(run.workers[0].usage,undefined);assert.equal(run.workers[0].usageByThread,undefined);
  assert.equal(run.workers[0].activityCount,undefined);
  const {monitorData}=await import('../engine/monitor-data.mjs');
  const page=await monitorData(runDir,{kind:'activity',generation:1,position:0});
  assert.equal(page.observed,0);assert.equal(page.retained,0);
});

test('live synthetic native-protocol activity is durable before worker completion and late events cannot alter history',async t=>{
  const {runDir,runWorkflow,readRun}=await setup(t);let announced,finish,late;
  const ready=new Promise(resolve=>{announced=resolve;}),gate=new Promise(resolve=>{finish=resolve;});
  const {monitorData}=await import('../engine/monitor-data.mjs');
  const message={method:'item/started',params:{threadId:'thread',turnId:'turn',item:{id:'command',type:'commandExecution',command:'Read marker',status:'inProgress'}}};
  const usage={inputTokens:10,cachedInputTokens:2,outputTokens:3,reasoningOutputTokens:1,totalTokens:13};
  const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("Read");',backend:backend(async({onActive,onEvent})=>{
    try{
      onActive({threadId:'thread',turnId:'turn'});onEvent(message);
      onEvent({method:'thread/tokenUsage/updated',params:{threadId:'thread',turnId:'turn',tokenUsage:{total:usage}}});
      late=()=>onEvent(message);
    }finally{announced();}
    await gate;return{value:'marker',terminalObserved:true};
  })});
  await ready;let snapshot,page;
  try{snapshot=await readRun(runDir);page=await monitorData(runDir,{kind:'activity',generation:1,position:0});}finally{finish();}
  const done=await work;
  assert.equal(snapshot.status,'running');assert.equal(snapshot.workers[0].status,'running');
  assert.deepEqual(snapshot.workers[0].activeTurn,{threadId:'thread',turnId:'turn'});
  assert.equal(page.records[0].input,'Read marker');assert.equal(snapshot.workers[0].activity.method,'thread/tokenUsage/updated');
  assert.equal(page.observed,2);assert.equal(snapshot.workers[0].activityCount,page.observed);
  assert.deepEqual(snapshot.workers[0].usage,{observedThreads:1,...usage,cacheWriteInputTokens:0});
  assert.deepEqual(done.workers[0].usage,snapshot.workers[0].usage);
  assert.equal(page.records[0].status,'inProgress');assert.equal(done.workers[0].activeTurn,undefined);
  assert.throws(late,{code:'RUN_RETIRED'});
  assert.deepEqual(await readRun(runDir),done);
  assert.deepEqual(await monitorData(runDir,{kind:'activity',generation:1,position:0}),page);
});

test('cached workers retain original activity usage and attempt evidence without new observations',async t=>{
  const {runDir,runWorkflow}=await setup(t);let calls=0;
  const {monitorData}=await import('../engine/monitor-data.mjs');
  const input={runDir,sessionId:'s',script:meta+'return await agent("Read");',backend:backend(async({onEvent})=>{
    calls++;onEvent({method:'thread/tokenUsage/updated',params:{threadId:'thread',turnId:'turn',tokenUsage:{total:{inputTokens:10,cachedInputTokens:0,outputTokens:2,reasoningOutputTokens:0,totalTokens:12}}}});
    return{value:'marker',terminalObserved:true,evidence:{attempts:[{number:1,status:'completed'}]}};
  })};
  await runWorkflow(input);await runWorkflow({...input,resume:true});
  const third=await runWorkflow({...input,resume:true});
  assert.equal(calls,1);assert.equal(third.attempts,1);assert.equal(third.workers[0].usage.totalTokens,12);
  assert.deepEqual(third.workers[0].reusedFrom,{generation:1,position:0});
  assert.equal(third.workers[0].evidence.attempts.length,1);
  const page=await monitorData(runDir,{kind:'activity',generation:3,position:0});
  assert.equal(page.records.length,1);assert.equal(page.observed,1);assert.equal(page.sourceGeneration,1);
  await assert.rejects(monitorData(runDir,{kind:'activity',generation:1,position:0}),{code:'REPLAY_GENERATION'});
});

test('correction attempts reserve the shared lifetime budget before another native turn',async t=>{
  const {runDir,runWorkflow,readRun}=await setup(t);
  const {runWorkerSession}=await import('../engine/worker-session.mjs');
  let turns=0;
  const run=await runWorkflow({runDir,sessionId:'s',maxAgents:2,script:meta+'return await agent("Count",{schema:{type:"object"}});',backend:backend(async({prompt,options,reserveRetry})=>runWorkerSession({}, {threadId:'thread',prompt,schema:options.schema,settings:{maxAttempts:5},reserveRetry,turn:async()=>{
    turns++;assert.equal((await readRun(runDir)).attempts,turns);return{text:'invalid',items:[],turnId:String(turns)};
  }}))});
  assert.equal(turns,2);assert.equal(run.attempts,2);assert.equal(run.workers[0].attempts,2);
  assert.equal(run.status,'failed');assert.equal(run.workers[0].status,'failed');assert.equal(run.workers[0].error.code,'AGENT_LIMIT');
  assert.equal(run.workers[0].evidence.attempts.length,2);
});

test('effective worker settings persist and invalidate replay when catalog defaults change',async t=>{
  const {runDir,runWorkflow}=await setup(t);let calls=0;
  const input={runDir,sessionId:'s',script:meta+'return await agent("Count",{model:"fixture-model"});'};
  const native=effort=>({...backend(async()=>({value:++calls,terminalObserved:true})),resolveOptions:options=>({model:options.model,effort,maxAttempts:5,permissions:{sandbox:'read-only',networkAccess:false,approvalPolicy:'never'}})});
  const first=await runWorkflow({...input,backend:native('low')});
  assert.equal(first.workers[0].options.effort,'low');
  const cached=await runWorkflow({...input,resume:true,backend:native('low')});assert.equal(cached.coverage.cached,1);
  const changed=await runWorkflow({...input,resume:true,backend:native('medium')});assert.equal(changed.coverage.cached,0);assert.equal(calls,2);
});

test('structured schema admission rejects before dispatch and preserves accepted JSON across replay',async t=>{
  const {runDir,runWorkflow}=await setup(t);let calls=0;
  const schema={type:'object',properties:{count:{type:'integer',minimum:0}},required:['count'],additionalProperties:false};
  const input={runDir,sessionId:'s',script:meta+'return await agent("Count",{schema:args});'};
  const execute=async({options})=>{calls++;assert.deepEqual(options.schema,schema);return{value:{count:2},terminalObserved:true};};
  const invalid=await runWorkflow({...input,args:{...schema,required:['missing']},backend:backend(execute)});
  assert.equal(invalid.status,'failed');assert.equal(invalid.error.code,'SCHEMA_INVALID');assert.equal(calls,0);
  const first=await runWorkflow({...input,args:schema,resume:true,backend:backend(execute)});
  assert.equal(first.status,'completed');assert.deepEqual(first.result,{count:2});assert.equal(calls,1);
  const cached=await runWorkflow({...input,args:schema,resume:true,backend:backend(execute)});
  assert.equal(cached.coverage.cached,1);assert.equal(calls,1);
  const changed=await runWorkflow({...input,args:{...schema,description:'Updated output contract'},resume:true,backend:backend(async()=>{calls++;return{value:{count:3},terminalObserved:true};})});
  assert.equal(changed.coverage.cached,0);assert.deepEqual(changed.result,{count:3});assert.equal(calls,2);
});

test('terminal structured validation failure is failed and retryable while unknown execution stays unknown',async t=>{
  const {runDir,runWorkflow}=await setup(t);
  const input={runDir,sessionId:'s',script:meta+'return await agent("Count",{schema:{type:"object",properties:{count:{type:"integer"}},required:["count"],additionalProperties:false}});'};
  const invalid=await runWorkflow({...input,backend:backend(async()=>({value:{count:'PRIVATE_SENTINEL'},terminalObserved:true,evidence:{commands:[{exitCode:0}]}}))});
  assert.equal(invalid.workers[0].status,'failed');assert.equal(invalid.workers[0].error.code,'RESULT_SCHEMA');
  assert.deepEqual(invalid.workers[0].evidence,{commands:[{exitCode:0}]});
  assert.equal(Object.hasOwn(invalid.workers[0],'result'),false);assert.doesNotMatch(JSON.stringify(invalid.workers[0].error),/PRIVATE_SENTINEL/);
  const retried=await runWorkflow({...input,resume:true,backend:backend(async()=>({value:{count:4},terminalObserved:true}))});
  assert.equal(retried.status,'completed');assert.equal(retried.attempts,2);
  const unknown=await runWorkflow({...input,script:input.script.replace('Count','Changed'),resume:true,backend:backend(async()=>({value:{count:5},terminalObserved:false}))});
  assert.equal(unknown.workers[0].status,'unknown');
});

test('ordered dispatch respects concurrency and persists results before completed replay', async t => {
  const { runDir, runWorkflow, readRun } = await setup(t);
  let active = 0, peak = 0;
  const calls = [];
  const script = meta + 'return await parallel(args.map(prompt => () => agent(prompt)));';
  const execute = async ({ prompt }) => {
    active++; peak = Math.max(peak, active); calls.push(prompt);
    await new Promise(resolve => setTimeout(resolve, prompt === 'A' ? 80 : 10));
    active--; return { value: prompt.toLowerCase(), terminalObserved: true };
  };
  const first = await runWorkflow({ runDir, sessionId: 'session', script, args: ['A','B','C'], concurrency: 2, backend: backend(execute) });
  assert.equal(first.status, 'completed'); assert.deepEqual(first.result, ['a','b','c']);
  assert.equal(peak, 2); assert.deepEqual(calls, ['A','B','C']);
  assert.deepEqual((await readRun(runDir)).result, ['a','b','c']);
  const replay = await runWorkflow({ runDir, sessionId: 'session', script, args: ['A','B','C'], resume: true, backend: backend(execute) });
  assert.equal(replay.coverage.cached, 3); assert.deepEqual(calls, ['A','B','C']);
  const changed = await runWorkflow({ runDir, sessionId: 'session', script, args: ['A','X','C'], resume: true, backend: backend(execute) });
  assert.equal(changed.coverage.cached, 1); assert.deepEqual(calls, ['A','B','C','X','C']);
});

test('replay matches effective execution options while allowing cosmetic label changes', async t => {
  const { runDir, runWorkflow } = await setup(t);
  let calls = 0;
  const input = { runDir, sessionId: 's', workerTimeoutMs:600000, script: meta + 'return await agent("A",args);' };
  const execute = async () => ({value: ++calls, terminalObserved: true});
  await runWorkflow({...input, args: {label:'first'}, backend:backend(execute)});
  const equivalent = await runWorkflow({...input, args:{label:'renamed',timeoutMs:600000},resume:true,backend:backend(execute)});
  assert.equal(equivalent.coverage.cached,1); assert.equal(calls,1);
  const changed = await runWorkflow({...input,args:{timeoutMs:1},resume:true,backend:backend(execute)});
  assert.equal(changed.coverage.cached,0); assert.equal(calls,2);
});

test('known failed slot preserves null and invalidates every later successful slot', async t => {
  const { runDir, runWorkflow } = await setup(t);
  const script = meta + 'return await parallel(args.map(prompt => () => agent(prompt)));';
  const calls = [];
  const first = await runWorkflow({ runDir, sessionId: 's', script, args: ['A','B','C'], backend: backend(async ({prompt}) => {
    calls.push(prompt); if(prompt==='B') throw Object.assign(new Error('fixture'),{notStarted:true}); return {value:prompt,terminalObserved:true};
  }) });
  assert.deepEqual(first.result, ['A',null,'C']); assert.equal(first.coverage.complete, false);
  const replay = await runWorkflow({ runDir, sessionId: 's', script, args: ['A','B','C'], resume:true, backend: backend(async ({prompt})=>{calls.push(prompt);return {value:prompt,terminalObserved:true};}) });
  assert.deepEqual(calls,['A','B','C','B','C']); assert.equal(replay.coverage.cached,1);
});

test('unknown execution and different session refuse automatic replay', async t => {
  const { runDir, runWorkflow } = await setup(t);
  const input = { runDir, sessionId:'s',script:meta+'return await agent("A");',backend:backend(async()=>{throw new Error('lost transport');}) };
  const first = await runWorkflow(input);
  assert.equal(first.status,'failed'); assert.equal(first.workers[0].status,'unknown');
  await assert.rejects(runWorkflow({...input,resume:true}),{code:'REPLAY_UNKNOWN'});
  await assert.rejects(runWorkflow({...input,sessionId:'other',resume:true}),{code:'REPLAY_SESSION'});
});

test('failed server shutdown blocks replay even when worker results completed',async t=>{
  const {runDir,runWorkflow}=await setup(t);
  const input={runDir,sessionId:'s',script:meta+'return await agent("A");'};
  const execute=async()=>({value:'A',terminalObserved:true});
  const failed=await runWorkflow({...input,backend:{...backend(execute),close:async()=>({serverExited:false,descendants:'notVerified'})}});
  assert.equal(failed.status,'failed');assert.equal(failed.workers[0].status,'completed');
  await assert.rejects(runWorkflow({...input,resume:true,backend:backend(execute)}),{code:'REPLAY_UNKNOWN'});
});

test('terminal status is published only after backend shutdown evidence is stored',async t=>{
  const {runDir,runWorkflow,readRun}=await setup(t);
  let closing,finish;const entered=new Promise(resolve=>{closing=resolve;});const gate=new Promise(resolve=>{finish=resolve;});
  const work=runWorkflow({runDir,sessionId:'s',script:meta+'return 1;',backend:{...backend(async()=>{}),close:async()=>{closing();await gate;return{serverExited:true,descendants:'notVerified'};}}});
  await entered;const during=await readRun(runDir);finish();const done=await work;
  assert.equal(during.status,'finishing');assert.equal(during.acceptingControls,false);
  assert.equal(done.status,'completed');assert.equal(done.cleanup.serverExited,true);
});

test('failure remains nonterminal while settled workers persist during drain',async t=>{
  const {runDir,runWorkflow,readRun}=await setup(t);
  let admitted=0,allStarted,finish;
  const started=new Promise(resolve=>{allStarted=resolve;});
  const gate=new Promise(resolve=>{finish=resolve;});
  const work=runWorkflow({runDir,sessionId:'s',concurrency:3,
    script:meta+'const a=agent("A");const c=agent("C");return await agent("B");',
    backend:backend(async({prompt,signal})=>{
      if(++admitted===3)allStarted();await started;
      if(prompt==='B')throw Object.assign(new Error('fixture failure'),{notStarted:true});
      if(prompt==='A')await new Promise(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',resolve,{once:true});});
      else await gate;
      return{value:prompt,terminalObserved:true};
    })});
  let during;
  try{
    const deadline=Date.now()+3000;
    do{await new Promise(resolve=>setTimeout(resolve,10));during=await readRun(runDir).catch(()=>null);}
    while(during?.workers[0]?.status!=='completed'&&Date.now()<deadline);
  }finally{finish();}
  const done=await work;
  assert.equal(during?.workers[0]?.status,'completed');
  assert.equal(during.status,'finishing');assert.equal(during.cleanup,undefined);
  assert.equal(done.status,'failed');assert.equal(done.cleanup.serverExited,true);
});

test('exclusive run ownership refuses a second controller without dispatching', async t => {
  const { runDir, runWorkflow } = await setup(t);
  await writeFile(join(runDir,'owner.lock'),'another-controller',{flag:'wx'});
  let called=false;
  await assert.rejects(runWorkflow({runDir,sessionId:'s',script:meta+'return 1;',backend:backend(async()=>{called=true;})}),{code:'RUN_LOCKED'});
  assert.equal(called,false);
});

test('stale resume generation is rejected under exclusive ownership before dispatch',async t=>{
  const {runDir,runWorkflow}=await setup(t);
  const input={runDir,sessionId:'s',script:meta+'return 1;',backend:backend(async()=>{})};
  await runWorkflow(input);
  await assert.rejects(runWorkflow({...input,resume:true,expectedGeneration:2}),{code:'REPLAY_GENERATION'});
});

test('declared worker dependencies wait for completed prerequisites and persist graph edges',async t=>{
  const {runDir,runWorkflow}=await setup(t);const order=[];
  const run=await runWorkflow({runDir,sessionId:'s',concurrency:3,script:meta+`
    return await parallel([
      ()=>agent('Read',{id:'read'}),
      ()=>agent('Review',{id:'review',dependsOn:['read']}),
      ()=>agent('Independent',{id:'other'})
    ]);`,backend:backend(async({prompt})=>{order.push(prompt+' started');if(prompt==='Read')await new Promise(resolve=>setTimeout(resolve,60));order.push(prompt+' completed');return{value:prompt,terminalObserved:true};})});
  assert.equal(run.status,'completed');assert.deepEqual(run.workers[1].dependencies,[0]);
  assert(order.indexOf('Read completed')<order.indexOf('Review started'));
  assert(order.indexOf('Independent started')<order.indexOf('Read completed'));
});

test('failed or invalid dependencies never dispatch their dependent worker',async t=>{
  const {runDir,runWorkflow}=await setup(t);const calls=[];
  const run=await runWorkflow({runDir,sessionId:'s',script:meta+`return await parallel([()=>agent('A',{id:'a'}),()=>agent('B',{dependsOn:['a']})]);`,
    backend:backend(async({prompt})=>{calls.push(prompt);throw Object.assign(new Error('fixture'),{notStarted:true});})});
  assert.deepEqual(calls,['A']);assert.equal(run.workers[1].error.code,'DEPENDENCY_FAILED');
  const next=await setup(t);let dispatched=false;
  const invalid=await next.runWorkflow({runDir:next.runDir,sessionId:'s',script:meta+`return await agent('B',{dependsOn:['missing']});`,backend:backend(async()=>{dispatched=true;})});
  assert.equal(invalid.status,'failed');assert.equal(dispatched,false);
});

test('missing or corrupt saved worker rows reject before any replay dispatch', async t => {
  for (const mutation of ['DELETE FROM workers', `UPDATE workers SET value=json_set(value,'$.result','changed')`]) {
    const { runDir, runWorkflow } = await setup(t);
    const input = {runDir,sessionId:'s',script:meta+'return await agent("A");'};
    await runWorkflow({...input,backend:backend(async()=>({value:'A',terminalObserved:true}))});
    const db = new DatabaseSync(join(runDir,'run.sqlite')); db.exec(mutation); db.close();
    let called=false;
    await assert.rejects(runWorkflow({...input,resume:true,backend:backend(async()=>{called=true;return {value:'A',terminalObserved:true};})}),{code:'REPLAY_CORRUPT'});
    assert.equal(called,false);
  }
});

test('pause persists completed work and prevents queued admission until explicit replay', async t=>{
  const {runDir,runWorkflow,requestControl,readControl}=await setup(t);
  assert.equal(typeof requestControl,'function');
  let started,finish;
  const running=new Promise(resolve=>{started=resolve;});
  const gate=new Promise(resolve=>{finish=resolve;});
  const calls=[];
  const input={runDir,sessionId:'s',concurrency:1,script:meta+'return await parallel([()=>agent("A"),()=>agent("B")]);'};
  const work=runWorkflow({...input,backend:backend(async({prompt})=>{calls.push(prompt);started();await gate;return{value:prompt,terminalObserved:true};})});
  await running;
  const receipt=await requestControl(runDir,{sessionId:'s',generation:1,action:'pause'});
  await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>{clearInterval(timer);reject(new Error('Control was not applied'));},2000);const timer=setInterval(async()=>{if((await readControl(runDir,receipt.id)).status==='applied'){clearInterval(timer);clearTimeout(deadline);resolve();}},10);});
  finish();const paused=await work;
  assert.equal(paused.status,'paused');assert.deepEqual(calls,['A']);assert.equal(paused.workers[0].result,'A');
  const resumed=await runWorkflow({...input,resume:true,backend:backend(async({prompt})=>{calls.push(prompt);return{value:prompt,terminalObserved:true};})});
  assert.equal(resumed.status,'completed');assert.equal(resumed.coverage.cached,1);assert.deepEqual(calls,['A','B']);
});

test('stop durably retains activity and unknown interruption through controlled drain and refuses late writes or replay',async t=>{
  const {runDir,runWorkflow,readRun,requestControl,readControl}=await setup(t);
  const {monitorData}=await import('../engine/monitor-data.mjs');
  assert.equal(typeof requestControl,'function');
  // Synthetic controlled backend; the controller still uses its real SQLite and evaluator process.
  let started,closing,finish,lateEvent,lateActive,retry;
  const running=new Promise(resolve=>{started=resolve;});
  const draining=new Promise(resolve=>{closing=resolve;});
  const gate=new Promise(resolve=>{finish=resolve;});let closed=false,dispatches=0;
  const usage={inputTokens:10,cachedInputTokens:2,outputTokens:3,reasoningOutputTokens:1,totalTokens:13};
  const progress={method:'item/agentMessage/delta',params:{threadId:'thread',turnId:'turn',itemId:'progress',delta:'durable before stop'}};
  const input={runDir,sessionId:'s',concurrency:1,script:meta+'return await parallel([()=>agent("A"),()=>agent("B")]);'};
  const worker={...backend(async({signal,onActive,onEvent,reserveRetry})=>{
    dispatches++;onActive({threadId:'thread',turnId:'turn'});onEvent(progress);
    onEvent({method:'thread/tokenUsage/updated',params:{threadId:'thread',turnId:'turn',tokenUsage:{total:usage}}});
    lateEvent=()=>onEvent(progress);lateActive=()=>onActive({threadId:'late',turnId:'late'});retry=reserveRetry;
    const cancellation=new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{
      assert.equal(closed,false,'Observe the synthetic interruption before controlled backend shutdown');
      onEvent({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'interrupted',items:[]}}});
      reject(Object.assign(new Error('cancel'),{interruption:{terminalObserved:true,terminalStatus:'interrupted',descendants:'notVerified'}}));
    },{once:true}));
    started();return await Promise.race([cancellation,gate.then(()=>({value:'fixture released for cleanup',terminalObserved:false}))]);
  }),close:async()=>{closing();await gate;closed=true;return{serverExited:true,descendants:'notVerified'};}};
  const work=runWorkflow({...input,backend:worker});let before,during,receipt,stopped;
  try{
    await Promise.race([running,draining.then(()=>assert.fail('Controlled backend closed before synthetic worker admission'))]);
    before=await readRun(runDir);
    assert.equal(before.workers[0].status,'running');assert.equal(before.workers[0].activityCount,2);
    await assert.rejects(requestControl(runDir,{sessionId:'other',generation:1,action:'stop'}),{code:'CONTROL_SESSION'});
    await assert.rejects(requestControl(runDir,{sessionId:'s',generation:2,action:'stop'}),{code:'CONTROL_GENERATION'});
    receipt=await requestControl(runDir,{sessionId:'s',generation:1,action:'stop'});
    await draining;during=await readRun(runDir);
    assert.equal(closed,false);assert.equal(during.status,'stopping');assert.equal(during.acceptingControls,false);
    assert.equal(during.cleanup,undefined);assert.equal(during.workers[0].status,'unknown');
    assert.equal(during.workers[0].activeTurn,undefined);assert.equal(during.workers[0].activityCount,3);
    assert.equal(during.workers[0].notStarted,false);assert.equal(during.workers[0].noProcessStarted,false);
    assert.deepEqual(during.workers[0].usage,{observedThreads:1,...usage,cacheWriteInputTokens:0});
    assert.equal((await readControl(runDir,receipt.id)).status,'applied');
    assert.throws(lateEvent,{code:'RUN_RETIRED'});assert.throws(lateActive,{code:'RUN_RETIRED'});
    await assert.rejects(retry(),{code:'RUN_STOPPED'});
    assert.deepEqual(await readRun(runDir),during);
  }finally{finish();stopped=await work;}
  assert.equal(stopped.status,'blocked');assert.equal(stopped.workers[0].status,'unknown');
  assert.equal(stopped.workers[0].interruption.terminalStatus,'interrupted');
  assert.equal(stopped.workers[0].interruption.descendants,'notVerified');
  assert.equal(stopped.workers[1].status,'queued');assert.equal(stopped.coverage.complete,false);
  assert.equal(stopped.coverage.unknown,1);assert.equal(stopped.attempts,1);assert.equal(closed,true);
  assert.equal(stopped.cleanup.serverExited,true);assert.equal(stopped.cleanup.descendants,'notVerified');
  assert.equal(stopped.sessionId,before.sessionId);assert.equal(stopped.runtimeIdentity,before.runtimeIdentity);
  assert.equal(stopped.backendIdentity,before.backendIdentity);assert.equal(stopped.generation,1);
  assert.deepEqual(stopped.workers[0].usage,during.workers[0].usage);
  const page=await monitorData(runDir,{kind:'activity',generation:1,position:0});
  assert.equal(page.observed,3);assert.equal(page.records.at(-1).status,'interrupted');
  assert.throws(lateEvent,{code:'RUN_RETIRED'});assert.throws(lateActive,{code:'RUN_RETIRED'});
  await assert.rejects(requestControl(runDir,{sessionId:'s',generation:1,action:'stop'}),{code:'CONTROL_TERMINAL'});
  await assert.rejects(runWorkflow({...input,resume:true,backend:backend(async()=>{dispatches++;})}),{code:'REPLAY_UNKNOWN'});
  assert.equal(dispatches,1);assert.deepEqual(await readRun(runDir),stopped);
  assert.deepEqual(await monitorData(runDir,{kind:'activity',generation:1,position:0}),page);
});

test('unresponsive backend cannot hold stop forever or rewrite terminal evidence later',async t=>{
  const {runDir,runWorkflow,requestControl,readRun}=await setup(t);
  const {readNotifications}=await import('../engine/notifications.mjs');
  let started,finish;const running=new Promise(resolve=>{started=resolve;});
  const gate=new Promise(resolve=>{finish=resolve;});
  let closing,drain;const closeEntered=new Promise(resolve=>{closing=resolve;}),closeGate=new Promise(resolve=>{drain=resolve;});
  t.after(()=>{finish();drain();});
  const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',drainTimeoutMs:60,
    backend:{...backend(async()=>{started();await gate;return{value:'late',terminalObserved:true};}),close:async()=>{closing();await closeGate;return{serverExited:true};}}});
  await running;await requestControl(runDir,{sessionId:'s',generation:1,action:'stop'});
  await closeEntered;
  const held=await readNotifications(runDir,{sessionId:'s',generation:1});assert.equal(held.terminal,false);assert.deepEqual(held.events,[],'Forced unknown worker is not a terminal notification before backend drain');
  drain();
  let timer;const result=await Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>resolve('late'),350);})]);
  clearTimeout(timer);finish();if(result==='late')await work;
  assert.notEqual(result,'late');assert.equal(result.status,'blocked');assert.equal(result.workers[0].status,'unknown');
  const saved=await readRun(runDir);assert.equal(saved.workers[0].status,'unknown');assert.equal(saved.workers[0].result,undefined);
  const terminal=await readNotifications(runDir,{sessionId:'s',generation:1});assert.equal(terminal.terminal,true);assert.deepEqual(terminal.events.map(e=>[e.kind,e.status]),[['worker-terminal','unknown'],['run-terminal','blocked']]);
  await assert.rejects(requestControl(runDir,{sessionId:'s',generation:1,action:'pause'}),{code:'CONTROL_TERMINAL'});
});

test('stop supersedes an existing pause drain deadline',async t=>{
  const {runDir,runWorkflow,requestControl,readControl}=await setup(t);
  let started,finish;const running=new Promise(resolve=>{started=resolve;});const gate=new Promise(resolve=>{finish=resolve;});
  const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',timeoutMs:1000,drainTimeoutMs:50,
    backend:backend(async()=>{started();await gate;return{value:'A',terminalObserved:true};})});
  await running;const pause=await requestControl(runDir,{sessionId:'s',generation:1,action:'pause'});
  while((await readControl(runDir,pause.id)).status==='pending')await new Promise(resolve=>setTimeout(resolve,10));
  await requestControl(runDir,{sessionId:'s',generation:1,action:'stop'});
  let timer;const result=await Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>resolve('late'),300);})]);
  clearTimeout(timer);finish();if(result==='late')await work;
  assert.notEqual(result,'late');assert.equal(result.status,'blocked');
});

test('mailbox closure settles every accepted control even if admission fails immediately',async t=>{
  const {runDir,runWorkflow,readControl}=await setup(t);
  // An atomic fixture queue represents controls already accepted by another CLI.
  // The admission hook fails before a timer poll can consume the first batch.
  const ids=Array.from({length:201},(_,i)=>`accepted-${i}`);
  await runWorkflow({runDir,sessionId:'s',script:meta+'return 1;',backend:backend(async()=>{}),onReady:()=>{
    const db=new DatabaseSync(join(runDir,'run.sqlite'));db.exec('BEGIN IMMEDIATE');
    for(const id of ids)db.prepare('INSERT INTO controls(id,generation,value) VALUES(?,?,?)').run(id,1,JSON.stringify({id,generation:1,action:'pause',status:'pending'}));
    db.exec('COMMIT');db.close();throw new Error('admission failed');
  }});
  for(const id of ids)assert.notEqual((await readControl(runDir,id)).status,'pending');
});
