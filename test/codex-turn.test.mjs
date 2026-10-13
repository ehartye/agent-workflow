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
