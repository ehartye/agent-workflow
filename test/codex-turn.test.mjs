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
