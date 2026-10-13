/** @lane merge
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { RuntimeManager } from '../src/runtime/manager.mjs';
import { createCodexBackend } from '../src/workers/codex.mjs';

const fixture = fileURLToPath(new URL('./fixtures/codex-process.mjs', import.meta.url));
const meta = 'export const meta={name:"native-quota-integration",description:"Native worker quota boundary"};\n';
const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
async function settled(manager, id) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const snapshot = await manager.get(id);
    if (['completed', 'failed', 'stopped', 'paused'].includes(snapshot.status)) return snapshot;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Native quota integration did not settle');
}

test('manager waits once on verified native quota reset and retains the original attempt', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'agent-workflow-native-quota-'));
  const state = path.join(temp, 'quota-state.json');
  const resetAt = (Math.ceil(Date.now() / 1000) + 1) * 1000;
  const backend = createCodexBackend({ executable: process.execPath, config: { executableArgs: [fixture], env: { CODEX_FIXTURE_QUOTA: '1', CODEX_FIXTURE_QUOTA_STATE: state, CODEX_FIXTURE_RESET: String(resetAt / 1000) } } });
  const manager = new RuntimeManager({ dataDir: path.join(temp, 'journal'), backend });
  t.after(async () => { await manager.shutdown(); await rm(temp, { recursive: true, force: true }); });
  const run = await manager.start({ script: meta + `return await agent("quota-once",{schema:${JSON.stringify(schema)}});`, cwd: process.cwd(), quotaWaitMs: 3000, timeoutMs: 5000 });
  const result = await settled(manager, run.id);
  assert.equal(result.status, 'completed', JSON.stringify(result.error));
  assert.equal(result.result.ok, true);
  assert.equal(result.usage.attempts, 2);
  assert.equal(result.usage.outputTokens, 7);
  assert.equal(JSON.parse(await readFile(state, 'utf8')).attempts, 2);
  assert.equal(result.events.filter(event => event.type === 'worker-quota-wait').length, 1);
});

for (const [name, prompt, extra, expectedOutcome] of [
  ['default wait disabled', 'quota', {}, 'not-started'],
  ['missing verified reset', 'quota', { quotaWaitMs: 3000, noReset: true }, 'not-started'],
  ['observed tool effects', 'quota-after-tool', { quotaWaitMs: 3000 }, 'unknown'],
]) {
  test(`manager does not retry native quota with ${name}`, async t => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'agent-workflow-native-quota-'));
    const backend = createCodexBackend({ executable: process.execPath, config: { executableArgs: [fixture], env: { CODEX_FIXTURE_QUOTA: '1', ...(extra.noReset ? { CODEX_FIXTURE_NO_RESET: '1' } : {}) } } });
    const manager = new RuntimeManager({ dataDir: path.join(temp, 'journal'), backend });
    t.after(async () => { await manager.shutdown(); await rm(temp, { recursive: true, force: true }); });
    const run = await manager.start({ script: meta + `return await agent(${JSON.stringify(prompt)});`, cwd: process.cwd(), quotaWaitMs: extra.quotaWaitMs ?? 0, timeoutMs: 5000 });
    const result = await settled(manager, run.id);
    assert.equal(result.status, 'failed');
    assert.equal(result.usage.attempts, 1);
    assert.equal(result.workers[0].error.code, 'QUOTA');
    assert.equal(result.workers[0].error.outcome, expectedOutcome);
    assert.equal(result.events.filter(event => event.type === 'worker-quota-wait').length, 0);
  });
}
