/** @lane merge
 * @subject engine/controller.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const meta = 'export const meta={name:"local",description:"controller acceptance"};\n';
async function setup(t) {
  const runDir = await mkdtemp(join(tmpdir(), 'workflow-engine-'));
  t.after(() => rm(runDir, { recursive: true, force: true }));
  const module = await import('../engine/controller.mjs').catch(() => null);
  assert.ok(module?.runWorkflow, 'Fresh workflow controller must exist');
  return { runDir, runWorkflow: module.runWorkflow, readRun: module.readRun, requestControl: module.requestControl, readControl:module.readControl };
}
const backend = execute => ({ identity: 'fixture-v1', execute, close: async () => ({ serverExited: true, descendants: 'notVerified' }) });

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

test('live native activity is durable before worker completion and late events cannot alter history',async t=>{
  const {runDir,runWorkflow,readRun}=await setup(t);let announced,finish,late;
  const ready=new Promise(resolve=>{announced=resolve;}),gate=new Promise(resolve=>{finish=resolve;});
  const {monitorData}=await import('../engine/monitor-data.mjs');
  const message={method:'item/started',params:{threadId:'thread',turnId:'turn',item:{id:'command',type:'commandExecution',command:'Read marker',status:'inProgress'}}};
  const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("Read");',backend:backend(async({onActive,onEvent})=>{
    try{onActive?.({threadId:'thread',turnId:'turn'});onEvent?.(message);late=()=>onEvent?.(message);}finally{announced();}
    await gate;return{value:'marker',terminalObserved:true};
  })});
  await ready;let snapshot,page;
  try{snapshot=await readRun(runDir);page=await monitorData(runDir,{kind:'activity',generation:1,position:0});}finally{finish();}
  const done=await work;
  assert.deepEqual(snapshot.workers[0].activeTurn,{threadId:'thread',turnId:'turn'});assert.equal(snapshot.workers[0].activity.summary,'Read marker');
  assert.equal(page.records[0].status,'inProgress');assert.equal(done.workers[0].activeTurn,undefined);
  assert.throws(late,{code:'RUN_RETIRED'});
  assert.equal((await monitorData(runDir,{kind:'activity',generation:1,position:0})).records.length,1);
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
  const input = { runDir, sessionId: 's', script: meta + 'return await agent("A",args);' };
  const execute = async () => ({value: ++calls, terminalObserved: true});
  await runWorkflow({...input, args: {label:'first'}, backend:backend(execute)});
  const equivalent = await runWorkflow({...input, args:{label:'renamed',timeoutMs:120000},resume:true,backend:backend(execute)});
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

test('stop retains interruption evidence and refuses replay of unknown dispatched work',async t=>{
  const {runDir,runWorkflow,requestControl}=await setup(t);
  assert.equal(typeof requestControl,'function');
  let started;const running=new Promise(resolve=>{started=resolve;});let closed=false;
  const input={runDir,sessionId:'s',concurrency:1,script:meta+'return await parallel([()=>agent("A"),()=>agent("B")]);'};
  const worker={...backend(async({signal})=>{started();return await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{
    setTimeout(()=>{assert.equal(closed,false,'Give native interruption its terminal observation window');reject(Object.assign(new Error('cancel'),{interruption:{terminalObserved:true,terminalStatus:'interrupted',descendants:'notVerified'}}));},30);
  },{once:true}));}),close:async()=>{closed=true;return{serverExited:true,descendants:'notVerified'};}};
  const work=runWorkflow({...input,backend:worker});await running;
  await assert.rejects(requestControl(runDir,{sessionId:'other',generation:1,action:'stop'}),{code:'CONTROL_SESSION'});
  await assert.rejects(requestControl(runDir,{sessionId:'s',generation:2,action:'stop'}),{code:'CONTROL_GENERATION'});
  await requestControl(runDir,{sessionId:'s',generation:1,action:'stop'});
  const stopped=await work;
  assert.equal(stopped.status,'blocked');assert.equal(stopped.workers[0].status,'unknown');
  assert.equal(stopped.workers[0].interruption.terminalStatus,'interrupted');
  assert.equal(stopped.attempts,1);assert.equal(closed,true);
  await assert.rejects(runWorkflow({...input,resume:true,backend:backend(async()=>{})}),{code:'REPLAY_UNKNOWN'});
});

test('unresponsive backend cannot hold stop forever or rewrite terminal evidence later',async t=>{
  const {runDir,runWorkflow,requestControl,readRun}=await setup(t);
  let started,finish;const running=new Promise(resolve=>{started=resolve;});
  const gate=new Promise(resolve=>{finish=resolve;});
  const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',drainTimeoutMs:60,
    backend:backend(async()=>{started();await gate;return{value:'late',terminalObserved:true};})});
  await running;await requestControl(runDir,{sessionId:'s',generation:1,action:'stop'});
  let timer;const result=await Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>resolve('late'),350);})]);
  clearTimeout(timer);finish();if(result==='late')await work;
  assert.notEqual(result,'late');assert.equal(result.status,'blocked');assert.equal(result.workers[0].status,'unknown');
  const saved=await readRun(runDir);assert.equal(saved.workers[0].status,'unknown');assert.equal(saved.workers[0].result,undefined);
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
