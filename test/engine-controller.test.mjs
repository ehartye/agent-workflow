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
