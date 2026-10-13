/** @lane merge
 * @subject src/workers/process.mjs
 * @subject src/workers/codex.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as processTools from '../src/workers/process.mjs';
import { createCodexBackend } from '../src/workers/codex.mjs';

test('orphan recovery verifies process creation identity and drains matching Windows/Linux trees', { skip: !['win32', 'linux'].includes(process.platform) }, async t => {
  assert.equal(typeof processTools.readProcessIdentity, 'function', 'Process identity inspection must be implemented');
  const fixture = fileURLToPath(new URL('./fixtures/orphan-process.mjs', import.meta.url));
  const handle = processTools.launch(process.execPath, [fixture]);
  t.after(() => handle.stop());
  const [chunk] = await once(handle.child.stdout, 'data');
  const childPid = JSON.parse(chunk.toString()).childPid;
  const identity = await processTools.readProcessIdentity(handle.child.pid);
  assert.equal(identity.pid, handle.child.pid);
  assert(identity.startIdentity);
  assert.match(identity.fingerprint, /^[a-f0-9]{64}$/);
  assert(!JSON.stringify(identity).includes(fixture));
  const backend = createCodexBackend(); t.after(() => backend.shutdown());
  await assert.rejects(backend.recoverOrphan({ pid: handle.child.pid }), { code: 'ORPHAN_UNVERIFIED', outcome: 'unknown' });
  await assert.rejects(backend.recoverOrphan({ pid: handle.child.pid, processIdentity: { ...identity, startIdentity: 'different' } }), { code: 'ORPHAN_UNVERIFIED', outcome: 'unknown' });
  assert.doesNotThrow(() => process.kill(handle.child.pid, 0));
  const result = await backend.recoverOrphan({ pid: handle.child.pid, processIdentity: identity });
  assert.equal(result.drained, true);
  await handle.closed;
  assert.throws(() => process.kill(childPid, 0), /ESRCH/);
  await assert.rejects(backend.recoverOrphan({ pid: handle.child.pid, processIdentity: identity }), { code: 'ORPHAN_UNVERIFIED', outcome: 'unknown' });
});

test('an absent root cannot prove drain while its detached descendant remains alive', { skip: !['win32', 'linux'].includes(process.platform) }, async t => {
  const fixture = fileURLToPath(new URL('./fixtures/exiting-orphan-process.mjs', import.meta.url));
  const handle = processTools.launch(process.execPath, [fixture]);
  const [chunk] = await once(handle.child.stdout, 'data');
  const childPid = JSON.parse(chunk.toString()).childPid;
  const rootRecord = { pid: handle.child.pid, processIdentity: await processTools.readProcessIdentity(handle.child.pid) };
  const childRecord = { pid: childPid, processIdentity: await processTools.readProcessIdentity(childPid) };
  let childDrained = false;
  t.after(async () => {
    if (!childDrained) await processTools.recoverOrphan(childRecord);
    await handle.stop();
  });
  handle.child.stdin.end('exit');
  assert.equal((await handle.closed).code, 0);
  await assert.rejects(processTools.recoverOrphan(rootRecord), { code: 'ORPHAN_UNVERIFIED', outcome: 'unknown' });
  assert.doesNotThrow(() => process.kill(childPid, 0));
  const cleanup = await processTools.recoverOrphan(childRecord);
  assert.equal(cleanup.drained, true);
  childDrained = true;
});

test('active worker records its recoverable process identity without command-line text', async t => {
  const fixture = fileURLToPath(new URL('./fixtures/codex-process.mjs', import.meta.url));
  const backend = createCodexBackend({ executable: process.execPath, config: { executableArgs: [fixture] } });
  t.after(() => backend.shutdown());
  const controller = new AbortController();
  let identity;
  const timer = setTimeout(() => controller.abort(), 5000); t.after(() => clearTimeout(timer));
  await assert.rejects(backend.execute({ id: 'identity-worker', runId: 'test', prompt: 'stall', cwd: process.cwd(), permissions: { sandbox: 'read-only', networkAccess: false, approvalPolicy: 'never' } }, { signal: controller.signal, onEvent: event => {
    if (event.type === 'process-identity') { identity = event.processIdentity; controller.abort(); }
  } }), { code: 'CANCELLED' });
  assert(identity?.startIdentity);
  assert(!JSON.stringify(identity).includes(fixture));
});

test('missing Windows tree-kill executable fails explicitly rather than hanging or claiming drain', { skip: process.platform !== 'win32' }, async t => {
  const missingRoot=await mkdtemp(path.join(tmpdir(),'workflow-missing-system-root-'));
  t.after(()=>rm(missingRoot,{recursive:true,force:true}));
  const fixture = fileURLToPath(new URL('./fixtures/orphan-process.mjs', import.meta.url));
  const handle = processTools.launch(process.execPath, [fixture]);
  await once(handle.child.stdout, 'data');
  const identity = await processTools.readProcessIdentity(handle.child.pid);
  const record = { pid: handle.child.pid, processIdentity: identity };
  const systemRoot = process.env.SystemRoot;
  t.after(async () => { process.env.SystemRoot = systemRoot; await processTools.recoverOrphan(record); });
  process.env.SystemRoot = missingRoot;
  const escape = setTimeout(() => { process.env.SystemRoot = systemRoot; void processTools.recoverOrphan(record); }, 750);
  try { await assert.rejects(handle.stop(), { code: 'DRAIN_FAILED', outcome: 'unknown' }); }
  finally { clearTimeout(escape); process.env.SystemRoot = systemRoot; }
});

for (const transport of ['app-server', 'exec']) {
  test(`${transport} cancellation catches drain failure without crashing or awaiting an unclosed process`, { skip: process.platform !== 'win32' }, async t => {
    const fixture = fileURLToPath(new URL('./fixtures/worker-drain-harness.mjs', import.meta.url));
    const handle = processTools.launch(process.execPath, [fixture, transport]);
    const messages = [];
    let record;
    processTools.readLines(handle.child.stdout, message => { messages.push(message); if (message.type === 'owned') record = message.record; }, error => { throw error; });
    t.after(async () => { if (!messages.some(message=>message.type==='drained') && record && await processTools.readProcessIdentity(record.pid)) await processTools.recoverOrphan(record); await handle.stop(); });
    const timer = setTimeout(() => { void handle.stop(); }, 15000);
    const result = await handle.closed; clearTimeout(timer);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(messages.find(message => message.type === 'caught'), { type: 'caught', code: 'DRAIN_FAILED', outcome: 'unknown', usageObserved: false });
    assert(record?.processIdentity?.startIdentity);
    assert.deepEqual(messages.find(message=>message.type==='drained'),{type:'drained',pid:record.pid},'Harness must report verified drain before its parent skips fallback cleanup');
  });
}
