// @lane merge
// @subject foundation/turn.mjs
// @subject foundation/client.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { AppServer } from '../foundation/client.mjs';

async function setup(t, mode = '') {
  const client = await AppServer.connect({ command: process.execPath, args: [fileURLToPath(new URL('./fixtures/foundation-server.mjs', import.meta.url)), mode], shutdownMs: 100 });
  t.after(() => client.close());
  const module = await import('../foundation/turn.mjs').catch(() => null);
  assert.ok(module?.runTurn, 'Fresh turn runner must exist');
  return { client, runTurn: module.runTurn };
}

test('concurrent turns route early notifications by thread and confirmed turn ID', async t => {
  const { client, runTurn } = await setup(t);
  const results = await Promise.all(['one', 'two'].map(threadId => runTurn(client, { threadId, prompt: 'fixture', timeoutMs: 1000 })));
  assert.deepEqual(results.map(result => result.text), ['one', 'two']);
  assert.deepEqual(results.map(result => result.turnId), ['turn-one', 'turn-two']);
});

test('large cumulative tool output keeps bounded previews and final command outcomes',async t=>{
  const {client,runTurn}=await setup(t,'turn-verbose');let streamed=0,terminalEvents=0;
  const result=await runTurn(client,{threadId:'one',prompt:'fixture',timeoutMs:3000,onEvent:message=>{
    if(message.method==='item/commandExecution/outputDelta')streamed++;
    if(message.method==='turn/completed')terminalEvents++;
  }});
  assert.equal(result.text,'Known command failure reported.');assert.equal(result.status,'completed');
  const item=result.items.find(item=>item.id==='read');
  assert.equal(item.status,'failed');assert.equal(item.exitCode,7);assert.ok(item.aggregatedOutput.length<=4000);
  assert.ok(item.truncated.includes('aggregatedOutput'));assert.equal(result.items.filter(item=>item.id==='read').length,1);
  assert.equal(streamed,80);assert.equal(terminalEvents,1);assert.ok(result.output.observedBytes>1024*1024);
  assert.equal(result.output.truncatedItems,1);assert.ok(Buffer.byteLength(JSON.stringify(result))<32000);
  assert.equal(await client.request('interrupt-count',{}),0);
});

test('final answer size remains a hard bounded failure without silent truncation',async t=>{
  const {client,runTurn}=await setup(t,'turn-answer-limit');
  await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture',timeoutMs:3000}),{code:'TURN_OUTPUT_LIMIT'});
});

test('shared transport failure cannot transfer pre-start annotations into an active turn',async t=>{
  const {client,runTurn}=await setup(t,'turn-hang');let announce;
  const active=new Promise(resolve=>{announce=resolve;});
  const turn=runTurn(client,{threadId:'running',prompt:'fixture',onActive:announce,interruptTimeoutMs:100}).catch(error=>error);
  await active;
  const failed=await client.request('hang',{}, {timeoutMs:20}).catch(error=>{error.notStarted=true;error.evidence={privateToOtherWorker:true};return error;});
  const result=await turn;
  assert.notEqual(result,failed);
  assert.equal(result.notStarted,undefined);assert.equal(result.evidence,undefined);
  assert.equal(result.code,'REQUEST_TIMEOUT');assert.equal(result.interruption.terminalObserved,false);
  const late=await client.request('echo',{}).catch(error=>error);assert.equal(late.notStarted,undefined);
});

test('native turns forward explicit model reasoning and output schema unchanged',async t=>{
  const {client,runTurn}=await setup(t,'turn-settings');
  const outputSchema={type:'object',properties:{count:{type:'integer'}},required:['count'],additionalProperties:false};
  const result=await runTurn(client,{threadId:'one',prompt:'fixture',model:'fixture-model',effort:'high',outputSchema});
  assert.deepEqual(JSON.parse(result.text),{model:'fixture-model',effort:'high',outputSchema});
});

test('writer turns carry the exact owned roots and exclude temporary write grants',async t=>{
  const {client,runTurn}=await setup(t,'turn-writer-policy');const {writerPolicy}=await import('../engine/workspace-policy.mjs');
  const cwd=fileURLToPath(new URL('.',import.meta.url)),execution=writerPolicy(cwd).turn;
  const result=await runTurn(client,{threadId:'one',prompt:'fixture',execution});assert.deepEqual(JSON.parse(result.text),execution);
});

test('live activity routes early tool output and usage only to the confirmed worker turn',async t=>{
  const {client,runTurn}=await setup(t,'turn-activity');
  const seen=new Map();
  await Promise.all(['one','two'].map(threadId=>runTurn(client,{threadId,prompt:'fixture',onActive:identity=>{assert.equal(identity.threadId,threadId);seen.set(threadId,[]);},onEvent:event=>{
    assert.ok(seen.has(threadId),'turn identity confirmed before activity');
    assert.equal(event.params.threadId,threadId);assert.equal(event.params.turnId??event.params.turn?.id,`turn-${threadId}`);seen.get(threadId).push(event);
  }})));
  for(const [threadId,events] of seen){
    assert.equal(events.filter(event=>event.method==='item/started').length,1);
    assert.equal(events.find(event=>event.method==='item/commandExecution/outputDelta').params.delta,threadId+' output');
    assert.equal(events.filter(event=>event.method==='thread/tokenUsage/updated').length,1);
    assert.equal(events.filter(event=>event.method==='turn/completed').length,1);
    assert.doesNotMatch(JSON.stringify(events),/RAW_REASONING|WRONG/);
  }
  assert.equal(seen.size,2);
});

test('activity persistence failure interrupts a live turn and preserves the primary error',async t=>{
  const {client,runTurn}=await setup(t,'turn-hang');
  await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture',timeoutMs:300,onActive:()=>{throw new Error('fixture persistence failure');}}),error=>{
    assert.equal(error.message,'fixture persistence failure');assert.equal(error.interruption.terminalObserved,true);return true;
  });
  assert.equal(await client.request('interrupt-count',{}),1);
});

test('early completed turn cannot mask an activity persistence failure',async t=>{
  const {client,runTurn}=await setup(t,'turn-activity');
  await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture',onEvent:()=>{throw new Error('fixture lost activity');}}),/fixture lost activity/);
});

test('completion in the start acknowledgement microtask cannot mask lost activity',async()=>{
  const {runTurn}=await import('../foundation/turn.mjs');let notify;
  const client={onFailure(){return()=>{};},onNotification(fn){notify=fn;return()=>{};},request(method){
    if(method==='turn/start')return new Promise(resolve=>setImmediate(()=>{
      resolve({turn:{id:'turn'}});
      queueMicrotask(()=>notify({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed',items:[{id:'answer',type:'agentMessage',text:'ACCEPTED'}]}}}));
    }));
    return Promise.resolve({});
  }};
  await assert.rejects(runTurn(client,{threadId:'thread',prompt:'fixture',onEvent(){throw Object.assign(new Error('Persistence failed'),{code:'REVIEW_PERSISTENCE'});}}),{code:'REVIEW_PERSISTENCE'});
});

test('terminal item collections exclude raw reasoning from activity and returned evidence',async()=>{
  const {runTurn}=await import('../foundation/turn.mjs');let notify;const observed=[];
  const client={onFailure(){return()=>{};},onNotification(fn){notify=fn;return()=>{};},async request(){
    notify({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed',items:[{id:'reason',type:'reasoning',content:['RAW_REASONING']},{id:'answer',type:'agentMessage',text:'Answer'}]}}});
    return{turn:{id:'turn'}};
  }};
  const result=await runTurn(client,{threadId:'thread',prompt:'fixture',onEvent:event=>observed.push(event)});
  assert.equal(result.text,'Answer');assert.doesNotMatch(JSON.stringify({result,observed}),/RAW_REASONING/);
});

test('steering targets the confirmed active turn and rejects stale or retired identity',async t=>{
  const {client,runTurn}=await setup(t,'turn-steer');
  const module=await import('../foundation/turn.mjs');assert.equal(typeof module.steerTurn,'function');
  let confirm;const ready=new Promise(resolve=>{confirm=resolve;});
  const running=runTurn(client,{threadId:'one',prompt:'fixture',timeoutMs:1500,onActive:confirm});
  const identity=await ready;
  await assert.rejects(module.steerTurn(client,{...identity,turnId:'stale',text:'Change direction'}),{code:'CONTROL_TURN'});
  assert.deepEqual(await module.steerTurn(client,{...identity,text:'Return STEERED'}),{turnId:identity.turnId});
  assert.equal((await running).text,'STEERED');
  await assert.rejects(module.steerTurn(client,{...identity,text:'Too late'}),{code:'CONTROL_TURN'});
});

test('failed terminal turn is never an accepted result', async t => {
  const { client, runTurn } = await setup(t, 'turn-failed');
  await assert.rejects(runTurn(client, { threadId: 'one', prompt: 'fixture' }), error => {
    assert.equal(error.code, 'TURN_FAILED');
    assert.match(error.message, /runner pipe-in/);
    assert.doesNotMatch(error.message, /REVIEW_SECRET_SENTINEL|private@example/);
    return true;
  });
});

test('connection loss rejects a running turn without waiting for its deadline', async t => {
  const { client, runTurn } = await setup(t, 'turn-exit');
  await assert.rejects(runTurn(client, { threadId: 'one', prompt: 'fixture', timeoutMs: 2000 }), { code: 'SERVER_EXIT' });
});

for (const [mode, terminalObserved] of [['turn-hang', true], ['turn-hang-ignore', false]]) {
  test(`turn deadline retains timeout and reports interruption evidence for ${mode}`, async t => {
    const { client, runTurn } = await setup(t, mode);
    await assert.rejects(runTurn(client, { threadId: 'one', prompt: 'fixture', timeoutMs: 100, interruptTimeoutMs: 100 }), error => {
      assert.equal(error.code, 'TURN_TIMEOUT');
      assert.equal(error.interruption.terminalObserved, terminalObserved);
      return true;
    });
  });
}

test('already cancelled turn does not dispatch or reserve the thread', async t => {
  const {client,runTurn}=await setup(t);
  await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture',signal:AbortSignal.abort()}),{code:'TURN_CANCELLED',notStarted:true});
  assert.equal((await runTurn(client,{threadId:'one',prompt:'fixture'})).text,'one');
});

test('late start acknowledgement cannot dispatch interruption after the cancellation deadline', async t=>{
  const {client,runTurn}=await setup(t,'turn-late-start');
  const abort=new AbortController();
  t.after(client.onNotification(message=>{if(message.method==='turn/started')abort.abort();}));
  await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture',signal:abort.signal,interruptTimeoutMs:50}),error=>{
    assert.equal(error.code,'TURN_CANCELLED');assert.equal(error.interruption.terminalObserved,false);return true;
  });
  assert.equal(await client.request('interrupt-count',{}),0);
  await client.request('echo',{delay:350,value:'past delayed acknowledgement'});
  assert.equal(await client.request('interrupt-count',{}),0);
  await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture'}),{code:'THREAD_BUSY'});
});

for(const [mode,terminalObserved] of [['turn-hang',true],['turn-delayed-start',true],['turn-hang-ignore',false],['turn-hang-complete',true]]) {
  test(`cancellation interrupts the confirmed turn and retains evidence for ${mode}`,async t=>{
    const {client,runTurn}=await setup(t,mode);
    const abort=new AbortController();
    const unsubscribe=client.onNotification(message=>{if(message.method==='turn/started')abort.abort();});
    t.after(unsubscribe);
    await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture',signal:abort.signal,timeoutMs:1500,interruptTimeoutMs:150}),error=>{
      assert.equal(error.code,'TURN_CANCELLED');
      assert.equal(error.interruption.terminalObserved,terminalObserved);
      assert.equal(error.interruption.terminalStatus,terminalObserved?(mode==='turn-hang-complete'?'completed':'interrupted'):null);
      assert.equal(error.interruption.descendants,'notVerified');
      return true;
    });
    if(!terminalObserved)await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture'}),{code:'THREAD_BUSY'});
  });
}
