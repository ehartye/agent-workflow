/** @lane merge
 * @subject engine/controller.mjs
 * @subject engine/controls.mjs
 * @subject engine/monitor-data.mjs
 * @subject test/fixtures/foundation-server.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {AppServer} from '../foundation/client.mjs';
import {runWorkflow,readRun,requestControl,readControl} from '../engine/controller.mjs';
import {runWorkerSession} from '../engine/worker-session.mjs';
import {createLiveDeadline} from '../engine/live-deadline.mjs';
import {monitorData} from '../engine/monitor-data.mjs';

const meta='export const meta={name:"deadlines",description:"live control"};';
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
async function until(read,check){const end=Date.now()+5000;while(Date.now()<end){const value=await read();if(check(value))return value;await new Promise(r=>setTimeout(r,5));}assert.fail('Expected durable observation did not arrive');}
async function directory(t){const runDir=await mkdtemp(join(fileURLToPath(new URL('../',import.meta.url)),'.deadline-control-test-'));t.after(()=>rm(runDir,{recursive:true,force:true}));return runDir;}
const target=(turnId=null,expectedRevision=0)=>({sessionId:'s',generation:1,action:'worker-deadline',position:0,attempt:1,turnId,deadline:{operation:'clear',expectedRevision}});

test('durable live deadline controls preserve readiness identity and the same native turn without changing replay',async t=>{
 const runDir=await directory(t),ready=gate(),admit=gate(),done=gate();let handle;
 const client=await AppServer.connect({command:process.execPath,args:[fileURLToPath(new URL('./fixtures/foundation-server.mjs',import.meta.url)),'turn-steer'],shutdownMs:1000});
 const backend={identity:'deadline-process-v1',close:()=>client.close(),execute:async({options,signal,onDeadline,onActive,onEvent})=>{
  handle=createLiveDeadline(options.timeoutMs);handle.start();onDeadline?.(handle);ready.resolve();
  try{await admit.promise;const result=await runWorkerSession(client,{threadId:'thread',prompt:'Wait for fixture steering',settings:{model:'fixture-model',effort:'low',maxAttempts:1},signal,liveDeadline:handle,onActive,onEvent});return result;}finally{handle.close();}
 }};
 const input={runDir,sessionId:'s',workerTimeoutMs:50000,script:meta+'return await agent("A",{timeoutMs:null});'};
 const work=runWorkflow({...input,backend});work.finally(()=>done.resolve()).catch(()=>{});
 try{
  await ready.promise;const initial=await readRun(runDir);assert.equal(initial.workers[0].options.timeoutMs,null);assert.equal(initial.workers[0].deadline.status,'active');
  await assert.rejects(requestControl(runDir,{...target(),sessionId:'foreign'}),{code:'CONTROL_SESSION'});
  await assert.rejects(requestControl(runDir,{...target(),generation:2}),{code:'CONTROL_GENERATION'});
  await assert.rejects(requestControl(runDir,{...target(),attempt:2}),{code:'CONTROL_ATTEMPT'});
  await assert.rejects(requestControl(runDir,target('wrong-turn')),{code:'CONTROL_TURN'});
  const request=await requestControl(runDir,{...target(),deadline:{operation:'set',valueMs:2**32,expectedRevision:0}});
  assert.equal(request.status,'pending');const applied=await until(()=>readControl(runDir,request.id),r=>r.status!=='pending'&&r.status!=='applying');assert.equal(applied.status,'applied');assert.equal(applied.deadlineResult.revision,1);
  await assert.rejects(requestControl(runDir,target(null,0)),{code:'DEADLINE_REVISION'});
  admit.resolve();const active=await until(()=>readRun(runDir),r=>r.workers[0].activeTurn);const turnId=active.workers[0].activeTurn.turnId;
  for(const deadline of [{operation:'extend',valueMs:1000,expectedRevision:1},{operation:'clear',expectedRevision:2}]){
   const receipt=await requestControl(runDir,{...target(turnId),deadline});assert.equal((await until(()=>readControl(runDir,receipt.id),r=>!['pending','applying'].includes(r.status))).status,'applied');
  }
  const saved=await readRun(runDir);assert.equal(saved.workers[0].deadline.revision,3);assert.equal(saved.workers[0].deadline.remainingMs,null);assert.equal(saved.workers[0].options.timeoutMs,null);assert.equal(saved.workers[0].key,initial.workers[0].key);
  assert.equal((await monitorData(runDir)).workers[0].deadline.revision,3);assert.equal(await client.request('interrupt-count'),0);
  await client.request('turn/steer',{threadId:'thread',expectedTurnId:turnId,input:[{type:'text',text:'Return STEERED'}]});
  const result=await work;assert.equal(result.status,'completed');assert.equal(result.workers[0].deadline.status,'closed');assert.equal(result.attempts,1);
  await assert.rejects(requestControl(runDir,target(turnId,3)),{code:'CONTROL_TERMINAL'});
  const replay=await runWorkflow({...input,resume:true,backend:{identity:backend.identity,execute:async()=>assert.fail('Live edits must not invalidate completed replay'),close:async()=>({serverExited:true})}});
  assert.equal(replay.coverage.cached,1);assert.deepEqual(replay.workers[0].deadline,result.workers[0].deadline);
 }finally{admit.resolve();if(!(await readRun(runDir)).cleanup){await requestControl(runDir,{sessionId:'s',generation:1,action:'stop'}).catch(()=>{});}await work.catch(()=>{});await client.close();}
});

test('an unbounded Pause keeps accepted work alive until explicit Stop supplies bounded drain',async t=>{
 const runDir=await directory(t),ready=gate(),finish=gate();let cancelled=false;
 const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',drainTimeoutMs:40,backend:{identity:'pause-live',close:async()=>({serverExited:true}),execute:async({signal})=>{signal.addEventListener('abort',()=>{cancelled=true;});ready.resolve();await finish.promise;return{value:'late',terminalObserved:true};}}});
 try{await ready.promise;const pause=await requestControl(runDir,{sessionId:'s',generation:1,action:'pause'});await until(()=>readControl(runDir,pause.id),r=>r.status==='applied');
  await new Promise(r=>setTimeout(r,120));assert.equal((await readRun(runDir)).status,'pausing');assert.equal(cancelled,false);
  await requestControl(runDir,{sessionId:'s',generation:1,action:'stop'});const run=await work;assert.equal(cancelled,true);assert.equal(run.status,'blocked');assert.equal(run.workers[0].error.code,'DRAIN_TIMEOUT');
 }finally{finish.resolve();await work;}
});

test('same-revision controls apply once and reject expired or settled handles without revival',async t=>{
 const runDir=await directory(t),ready=gate(),finish=gate();let handle;
 const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',backend:{identity:'deadline-cas',close:async()=>({serverExited:true}),execute:async({onDeadline})=>{handle=createLiveDeadline(null);handle.start();onDeadline?.(handle);ready.resolve();await finish.promise;handle.close();return{value:'done',terminalObserved:true};}}});
 try{await ready.promise;const first=await requestControl(runDir,target());let second;
  try{second=await requestControl(runDir,target());}catch(error){assert.equal(error.code,'DEADLINE_REVISION');}
  assert.equal((await until(()=>readControl(runDir,first.id),r=>!['pending','applying'].includes(r.status))).status,'applied');
  if(second){const rejected=await until(()=>readControl(runDir,second.id),r=>!['pending','applying'].includes(r.status));assert.equal(rejected.status,'rejected');assert.equal(rejected.error.code,'DEADLINE_REVISION');}
  assert.equal(handle.snapshot().revision,1,'Only one same-revision mutation is applied');
  handle.apply({operation:'set',valueMs:1,expectedRevision:1});await new Promise(r=>setTimeout(r,5));await assert.rejects(requestControl(runDir,target(null,2)),{code:'DEADLINE_EXPIRED'});
 }finally{finish.resolve();await work;}
});

test('deadline intent is committed before mutation and failed snapshot persistence leaves an unknown receipt',async t=>{
 const runDir=await directory(t),ready=gate(),finish=gate();let handle,applications=0;
 const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',backend:{identity:'deadline-persistence',close:async()=>({serverExited:true}),execute:async({onDeadline})=>{
  handle=createLiveDeadline(null);handle.start();onDeadline({...handle,apply(change){
   const reader=new DatabaseSync(join(runDir,'run.sqlite'),{readOnly:true});try{const receipt=JSON.parse(reader.prepare("SELECT value FROM controls WHERE json_extract(value,'$.action')='worker-deadline'").get().value);assert.equal(receipt.status,'applying');}finally{reader.close();}
   applications++;return handle.apply(change);
  }});ready.resolve();await finish.promise;handle.close();return{value:'done',terminalObserved:true};
 }}});
 let db;
 try{await ready.promise;db=new DatabaseSync(join(runDir,'run.sqlite'));db.exec("CREATE TRIGGER reject_live_snapshot BEFORE INSERT ON workers WHEN json_extract(NEW.value,'$.deadline.revision')=1 BEGIN SELECT RAISE(FAIL,'controlled snapshot write failure'); END");
  const receipt=await requestControl(runDir,target());const observed=await until(()=>readControl(runDir,receipt.id),r=>!['pending','applying'].includes(r.status));
  assert.equal(observed.status,'unknown');assert.equal(handle.snapshot().revision,1);assert.equal(applications,1);
  assert.equal((await readRun(runDir)).workers[0].deadline.revision,0,'a failed persisted snapshot must not be invented');
 }finally{db?.exec('DROP TRIGGER IF EXISTS reject_live_snapshot');db?.close();finish.resolve();await work.catch(()=>{});}
});

test('accepted deadline controls revalidate the turn before applying and never revive a completed worker',async t=>{
 const runDir=await directory(t),ready=gate(),finish=gate();let handle,activate;
 const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',backend:{identity:'deadline-revalidate',close:async()=>({serverExited:true}),execute:async({onDeadline,onActive})=>{handle=createLiveDeadline(null);handle.start();onDeadline(handle);activate=onActive;ready.resolve();await finish.promise;handle.close();return{value:'done',terminalObserved:true};}}});
 try{await ready.promise;const receipt=await requestControl(runDir,target());activate({threadId:'thread',turnId:'now-active'});
  const observed=await until(()=>readControl(runDir,receipt.id),r=>!['pending','applying'].includes(r.status));assert.equal(observed.status,'rejected');assert.equal(observed.error.code,'CONTROL_TURN');assert.equal(handle.snapshot().revision,0);
  finish.resolve();const result=await work;assert.equal(result.workers[0].deadline.status,'closed');await assert.rejects(requestControl(runDir,target('now-active')),{code:'CONTROL_TERMINAL'});
 }finally{finish.resolve();await work;}
});

test('deadline control input rejects accessors proxies overflow and queued targets without persistence',async t=>{
 const runDir=await directory(t),ready=gate(),finish=gate();let invoked=0;
 const work=runWorkflow({runDir,sessionId:'s',concurrency:1,script:meta+'return await parallel([()=>agent("A"),()=>agent("B")]);',backend:{identity:'deadline-input',close:async()=>({serverExited:true}),execute:async({onDeadline})=>{const handle=createLiveDeadline(null);handle.start();onDeadline(handle);ready.resolve();await finish.promise;handle.close();return{value:'done',terminalObserved:true};}}});
 try{await ready.promise;
  for(const deadline of [{operation:'set',expectedRevision:0,get valueMs(){invoked++;return 1;}},new Proxy({},{ownKeys(){invoked++;return[];}}),{operation:'clear',expectedRevision:0,valueMs:1},{operation:'set',valueMs:Number.MAX_SAFE_INTEGER+1,expectedRevision:0},{operation:'clear',expectedRevision:-1},{operation:'clear',expectedRevision:0,extra:true}])await assert.rejects(requestControl(runDir,{...target(),deadline}),{code:'CONTROL_INPUT'});
  assert.equal(invoked,0);await until(()=>readRun(runDir),r=>r.workers.length===2);
  await assert.rejects(requestControl(runDir,{...target(),position:1,attempt:0}),{code:'CONTROL_DEADLINE'});
  const db=new DatabaseSync(join(runDir,'run.sqlite'),{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) AS n FROM controls').get().n,0);}finally{db.close();}
 }finally{finish.resolve();await work;}
});

test('a lost applied-receipt write preserves unknown intent and never repeats a deadline mutation',async t=>{
 const runDir=await directory(t),ready=gate(),finish=gate();let handle,applications=0;
 const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',drainTimeoutMs:200,backend:{identity:'deadline-lost-receipt',close:async()=>({serverExited:true}),execute:async({onDeadline,signal})=>{
  handle=createLiveDeadline(null);handle.start();onDeadline({...handle,apply(change){applications++;return handle.apply(change);}});ready.resolve();await finish.promise;handle.close();return{value:'done',terminalObserved:true};
 }}});
 let db;
 try{await ready.promise;db=new DatabaseSync(join(runDir,'run.sqlite'));db.exec("CREATE TRIGGER reject_applied_receipt BEFORE UPDATE ON controls WHEN json_extract(NEW.value,'$.action')='worker-deadline' AND json_extract(NEW.value,'$.status')='applied' BEGIN SELECT RAISE(FAIL,'controlled lost applied receipt'); END");
  const receipt=await requestControl(runDir,target());await until(()=>readRun(runDir),r=>r.workers[0].deadline.revision===1);finish.resolve();await work;
  const observed=await readControl(runDir,receipt.id);assert.equal(observed.status,'unknown');assert.equal(observed.error.code,'CONTROL_UNCONFIRMED');assert.equal(applications,1);
 }finally{db?.exec('DROP TRIGGER IF EXISTS reject_applied_receipt');db?.close();finish.resolve();await work.catch(()=>{});}
});

test('explicit run wall budget bounds startup or accepted work while Pause has no worker timer',async t=>{
 const runDir=await directory(t),ready=gate(),finish=gate();
 const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',timeoutMs:250,drainTimeoutMs:30,backend:{identity:'pause-run-wall',close:async()=>({serverExited:true}),execute:async()=>{ready.resolve();await finish.promise;return{value:'late',terminalObserved:true};}}});
 try{
  // The run budget includes evaluator startup. On a busy host it may expire
  // before execute() is admitted, which must not leave this test waiting forever.
  const admitted=await Promise.race([ready.promise.then(()=>true),work.then(()=>false)]);
  if(admitted)try{await requestControl(runDir,{sessionId:'s',generation:1,action:'pause'});}catch(error){if(error.code!=='CONTROL_TERMINAL')throw error;}
  const result=await work;assert.equal(result.error.code,'EVALUATOR_TIMEOUT');
  if(admitted){assert.equal(result.status,'blocked');assert.equal(result.workers[0].error.code,'DRAIN_TIMEOUT');}
  else{assert.equal(result.status,'failed');assert.ok(result.workers.every(worker=>worker.notStarted&&worker.noInference));assert.equal(result.cleanup.serverExited,true);}
 }
 finally{finish.resolve();await work;}
});

test('fatal asynchronous control persistence during Pause still enters bounded global cancellation',async t=>{
 const runDir=await directory(t),ready=gate(),finish=gate(),confirm=gate();let closed=false,cancelled=false;
 const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',drainTimeoutMs:30,backend:{identity:'pause-fatal-control',close:async()=>{closed=true;return{serverExited:true};},steer:()=>confirm.promise,execute:async({signal,onActive})=>{onActive({threadId:'thread',turnId:'turn'});signal.addEventListener('abort',()=>{cancelled=true;});ready.resolve();await finish.promise;return{value:'late',terminalObserved:true};}}});
 const outcome=work.then(value=>({value}),error=>({error}));let db,timer;
 try{await ready.promise;const steer=await requestControl(runDir,{sessionId:'s',generation:1,action:'steer',position:0,attempt:1,turnId:'turn',text:'controlled'});await until(()=>readControl(runDir,steer.id),r=>r.status==='applying');
  const pause=await requestControl(runDir,{sessionId:'s',generation:1,action:'pause'});await until(()=>readControl(runDir,pause.id),r=>r.status==='applied');
  await new Promise(resolve=>setTimeout(resolve,120));assert.equal((await readRun(runDir)).status,'pausing');
  db=new DatabaseSync(join(runDir,'run.sqlite'));db.exec("CREATE TRIGGER reject_steer_settlement BEFORE UPDATE ON controls WHEN json_extract(NEW.value,'$.action')='steer' AND json_extract(NEW.value,'$.status') IN ('applied','unknown') BEGIN SELECT RAISE(FAIL,'controlled steering persistence failure'); END");
  confirm.resolve({turnId:'turn'});const settled=await Promise.race([outcome,new Promise(resolve=>{timer=setTimeout(()=>resolve('late'),350);})]);
  assert.notEqual(settled,'late');assert.equal(cancelled,true);assert.equal(closed,true);assert.ok(settled.error);
 }finally{clearTimeout(timer);db?.exec('DROP TRIGGER IF EXISTS reject_steer_settlement');db?.close();confirm.resolve({turnId:'turn'});finish.resolve();await outcome;}
});
