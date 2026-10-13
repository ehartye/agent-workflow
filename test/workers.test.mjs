import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { classifyQuota, workerError } from '../src/workers/shared.mjs';

const module = await import('../src/workers/codex.mjs').catch(() => ({}));
const fixture = fileURLToPath(new URL('./fixtures/codex-process.mjs', import.meta.url));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
const request = (prompt = 'success', extra = {}) => ({ id: `fixture-${prompt}`, runId: 'test-run', prompt, cwd, schema, permissions: { sandbox: 'read-only', networkAccess: false, approvalPolicy: 'never' }, ...extra });
const backend = extra => module.createCodexBackend({ executable: process.execPath, config: { executableArgs: [fixture], ...extra } });
// Process startup is outside the behavior under test. The wait still exceeds the
// stall window, and the hard timeout still expires well before the tool ends.
const stallWindowMs = 1000;
const watchdogBackend = transport => module.createCodexBackend({ transport, executable: process.execPath, config: { executableArgs: [fixture], env: { CODEX_FIXTURE_TOOL_WAIT_MS: '1500', CODEX_FIXTURE_HARD_TOOL_WAIT_MS: '5000' } } });

test('app-server initializes, streams complete records, validates output and counts cumulative usage once', async t => {
  assert.equal(typeof module.createCodexBackend, 'function', 'Codex backend must be implemented');
  const b = backend(); t.after(() => b.shutdown());
  const events = [];
  const result = await b.execute(request('success', { model: 'fixture-model', effort: 'high' }), { onEvent: event => events.push(event) });
  assert.equal(result.value.ok, true);
  assert.equal(result.value.handshake, true);
  assert.equal(result.value.threadParams.approvalPolicy, 'never');
  assert.equal(result.value.turnParams.sandboxPolicy.type, 'readOnly');
  assert.equal(result.value.turnParams.sandboxPolicy.networkAccess, false);
  assert.deepEqual(result.value.turnParams.outputSchema, schema);
  assert.equal(result.value.turnParams.model, 'fixture-model');
  assert.equal(result.value.turnParams.effort, 'high');
  assert.equal(result.usage.outputTokens, 7);
  assert.equal(result.threadId, 'thread-fixture');
  assert.equal(result.turnId, 'turn-fixture');
  assert(events.some(event => event.type === 'item/commandExecution/outputDelta' && event.params.delta === 'fixture output\n'));
  assert(events.some(event => event.type === 'process' && Number.isInteger(event.pid)));
  assert(events.filter(event => event.type === 'usage').every(event => event.usageMode === 'cumulative'));
});

async function guarded(b, input, handlers = {}) {
  const timer = setTimeout(() => b.shutdown(), 10000);
  try { return await b.execute(input, handlers); } finally { clearTimeout(timer); }
}

test('never approval policy declines a server approval without invoking the dashboard', async t => {
  const b = backend(); t.after(() => b.shutdown());
  let called = false;
  const result = await guarded(b, request('approval'), { onApproval: () => { called = true; return 'accept'; } });
  assert.equal(called, false);
  assert.equal(result.value.decision, 'decline');
});

test('on-request approvals return only the explicit supported decision', async t => {
  const b = backend(); t.after(() => b.shutdown());
  const approvals = [];
  const result = await guarded(b, request('approval', { permissions: { sandbox: 'read-only', approvalPolicy: 'on-request', networkAccess: false } }), {
    onApproval: approval => { approvals.push(approval); return 'accept'; },
  });
  assert.equal(approvals[0].command, 'echo fixture');
  assert.equal(approvals[0].workerId, 'fixture-approval');
  assert.equal(result.value.decision, 'accept');
});

test('steering targets the retained active connection and expected turn', async t => {
  const b = backend(); t.after(() => b.shutdown());
  const result = await guarded(b, request('steer'), { onEvent: event => event.type === 'turn' ? b.steer(event.workerId, 'new instruction') : undefined });
  assert.equal(result.value.steered.expectedTurnId, 'turn-fixture');
  assert.equal(result.value.steered.input[0].text, 'new instruction');
  await assert.rejects(b.steer('fixture-steer', 'late'), { code: 'NOT_ACTIVE' });
});

test('rate-limit reading preserves server reset and credit fields', async t => {
  const b = backend(); t.after(() => b.shutdown());
  const limits = await b.readRateLimits();
  assert.equal(limits.rateLimits.primary.usedPercent, 40);
  assert.equal(limits.rateLimits.primary.resetsAt, 1791800000);
  assert.equal(limits.rateLimitResetCredits.availableCount, 1);
});

test('abort kills and drains the worker process tree before rejecting', async t => {
  const b = backend(); t.after(() => b.shutdown());
  const controller = new AbortController();
  let childPid;
  await assert.rejects(guarded(b, request('cancel-tree'), { signal: controller.signal, onEvent: event => {
    if (event.type === 'fixture/child') { childPid = event.params.childPid; controller.abort(); }
  } }), { code: 'CANCELLED', outcome: 'cancelled' });
  assert(Number.isInteger(childPid));
  assert.throws(() => process.kill(childPid, 0), /ESRCH/);
});

test('explicit exec transport streams tools, validates schema and passes permissions', async t => {
  const b = module.createCodexBackend({ transport: 'exec', executable: process.execPath, config: { executableArgs: [fixture] } });
  t.after(() => b.shutdown());
  const events = [];
  const result = await b.execute(request(), { onEvent: event => events.push(event) });
  assert.equal(result.value.ok, true);
  assert.equal(result.value.prompt, 'success');
  assert.equal(result.usage.outputTokens, 7);
  assert(result.value.args.includes('--output-schema'));
  assert(result.value.args.includes('read-only'));
  assert(result.value.args.includes('approval_policy="never"'));
  assert(events.some(event => event.type === 'item.started'));
});

test('invalid permissions and unknown agent profiles fail before any process starts', async t => {
  const b = backend(); t.after(() => b.shutdown());
  const events = [];
  await assert.rejects(b.execute(request('success', { permissions: { sandbox: 'danger-full-access' } }), { onEvent: event => events.push(event) }), { code: 'INVALID_PERMISSIONS', outcome: 'not-started' });
  await assert.rejects(b.execute(request('success', { agentType: 'Explore' })), { code: 'UNKNOWN_AGENT_TYPE', outcome: 'not-started' });
  assert.equal(events.length, 0);
});

test('permission ceiling and explicit agent profile cannot broaden worker grants', async t => {
  const b = backend({ permissions: { sandbox: 'read-only', networkAccess: false, approvalPolicy: 'never' }, agentProfiles: { review: { model: 'profile-model', effort: 'high', developerInstructions: 'Review files', permissions: { sandbox: 'workspace-write', networkAccess: true, approvalPolicy: 'on-request' } } } });
  t.after(() => b.shutdown());
  const result = await b.execute(request('success', { agentType: 'review', permissions: { sandbox: 'workspace-write', networkAccess: true, approvalPolicy: 'on-request' } }));
  assert.equal(result.value.turnParams.sandboxPolicy.type, 'readOnly');
  assert.equal(result.value.turnParams.sandboxPolicy.networkAccess, false);
  assert.equal(result.value.threadParams.approvalPolicy, 'never');
  assert.equal(result.value.threadParams.model, 'profile-model');
  assert.equal(result.value.threadParams.developerInstructions, 'Review files');
});

test('malformed stream, invalid final schema and failed turns preserve failure rather than success', async t => {
  const b = backend(); t.after(() => b.shutdown());
  await assert.rejects(b.execute(request('wrong-schema')), { code: 'SCHEMA_MISMATCH', outcome: 'failed' });
  await assert.rejects(b.execute(request('malformed')), { code: 'PROTOCOL_ERROR', outcome: 'unknown' });
  await assert.rejects(b.execute(request('failed')), { code: 'TURN_FAILED', outcome: 'failed' });
  await assert.rejects(b.execute(request('crash')), { code: 'PROCESS_EXIT', outcome: 'unknown' });
});

test('usage never decreases', async t => {
  const b = backend(); t.after(() => b.shutdown());
  assert.equal((await b.execute(request('usage-regress'))).usage.outputTokens, 7);
});

test('commentary does not replace a final answer', async t => {
  const b = backend(); t.after(() => b.shutdown());
  assert.equal((await b.execute(request('phase-order'))).value.ok, true);
});

test('timeouts and stalls drain workers and preserve uncertain write outcomes', async t => {
  const b = backend(); t.after(() => b.shutdown());
  await assert.rejects(guarded(b, request('stall', { timeoutMs: 2000, permissions: { sandbox: 'workspace-write', networkAccess: false, approvalPolicy: 'never' } })), { code: 'TIMEOUT', outcome: 'unknown' });
  await assert.rejects(guarded(b, request('stall', { stallMs: stallWindowMs, timeoutMs: 5000 })), { code: 'STALLED', outcome: 'cancelled' });
});

test('exec can explicitly ignore user config while app-server rejects that unsupported flag', async t => {
  const b = module.createCodexBackend({ transport: 'exec', executable: process.execPath, config: { executableArgs: [fixture], ignoreUserConfig: true } });
  t.after(() => b.shutdown());
  assert((await b.execute(request())).value.args.includes('--ignore-user-config'));
  const server = backend({ ignoreUserConfig: true }); t.after(() => server.shutdown());
  const events = [];
  await assert.rejects(server.execute(request(), { onEvent: event => events.push(event) }), { code: 'UNSUPPORTED_CONFIG', outcome: 'not-started' });
  assert.equal(events.length, 0);
});

test('protocol envelopes fail closed rather than silently missing evidence', async t => {
  const b = backend(); t.after(() => b.shutdown());
  await assert.rejects(guarded(b, request('bad-envelope')), { code: 'PROTOCOL_ERROR', outcome: 'unknown' });
});

test('invalid usage fields fail closed rather than silently missing evidence', async t => {
  const b = backend(); t.after(() => b.shutdown());
  await assert.rejects(guarded(b, request('bad-usage')), { code: 'PROTOCOL_ERROR', outcome: 'unknown' });
});

test('missing usage retains explicit unknown coverage', async t => {
  const b = backend(); t.after(() => b.shutdown());
  await assert.rejects(b.execute(request('no-usage-failed')), error => error.usage.observed === false);
  assert.equal((await b.execute(request())).usage.observed, true);
});

test('initialization timeout is bounded and classified before effectful dispatch', async t => {
  const b = backend({ env: { CODEX_FIXTURE_MODE: 'hang-initialize' }, connectTimeoutMs: 100 }); t.after(() => b.shutdown());
  await assert.rejects(guarded(b, request()), { code: 'CONNECT_TIMEOUT', outcome: 'not-started' });
});

test('invalid thread response fails before effectful dispatch', async t => {
  const invalid = backend({ env: { CODEX_FIXTURE_MODE: 'bad-thread' } }); t.after(() => invalid.shutdown());
  await assert.rejects(guarded(invalid, request()), { code: 'INVALID_RESPONSE', outcome: 'not-started' });
});

test('named project profiles load as data and only restrict authorized permissions', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'agent-workflow-profile-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await mkdir(path.join(temp, '.agents'));
  await writeFile(path.join(temp, '.agents', 'agent-workflow.json'), JSON.stringify({ agentProfiles: { reviewer: { model: 'project-model', effort: 'low', developerInstructions: 'Inspect only', permissions: { sandbox: 'workspace-write', networkAccess: true, approvalPolicy: 'on-request' } } } }));
  const b = backend(); t.after(() => b.shutdown());
  const result = await b.execute(request('success', { cwd: temp, agentType: 'reviewer' }));
  assert.equal(result.value.threadParams.model, 'project-model');
  assert.equal(result.value.threadParams.developerInstructions, 'Inspect only');
  assert.equal(result.value.turnParams.effort, 'low');
  assert.equal(result.value.turnParams.sandboxPolicy.type, 'readOnly');
  assert.equal(result.value.turnParams.sandboxPolicy.networkAccess, false);
  await writeFile(path.join(temp, '.agents', 'agent-workflow.json'), '{bad');
  const events = [];
  await assert.rejects(b.execute(request('success', { cwd: temp, agentType: 'reviewer' }), { onEvent: event => events.push(event) }), { code: 'INVALID_AGENT_CONFIG', outcome: 'not-started' });
  assert.equal(events.length, 0);
});

test('unsupported tool restrictions fail before dispatch', async t => {
  const b = backend(); t.after(() => b.shutdown());
  const events = [];
  await assert.rejects(b.execute(request('success', { disallowedTools: ['exec_command'] }), { onEvent: event => events.push(event) }), { code: 'UNSUPPORTED_OPTION', outcome: 'not-started' });
  await assert.rejects(b.execute(request('success', { bashCommandClamp: 'read-only' })), { code: 'UNSUPPORTED_OPTION', outcome: 'not-started' });
  assert.equal(events.length, 0);
});

test('cancellation preserves uncertain external effects after native tool dispatch', async t => {
  const b = backend(); t.after(() => b.shutdown());
  const controller = new AbortController();
  await assert.rejects(guarded(b, request('cancel-native-tool'), { signal: controller.signal, onEvent: event => {
    if (event.type === 'item/started') controller.abort();
  } }), { code: 'CANCELLED', outcome: 'unknown' });
});

test('execution fingerprint changes with profile or authorized permission changes and exposes no config text', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'agent-workflow-fingerprint-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await mkdir(path.join(temp, '.agents'));
  const filename = path.join(temp, '.agents', 'agent-workflow.json');
  await writeFile(filename, JSON.stringify({ agentProfiles: { reviewer: { model: 'one', developerInstructions: 'private configured instructions' } } }));
  const b = backend(); t.after(() => b.shutdown());
  assert.equal(typeof b.executionFingerprint, 'function', 'Backend must expose cache execution fingerprint');
  const first = await b.executionFingerprint({ cwd: temp, permissions: request().permissions });
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, await b.executionFingerprint({ cwd: temp, permissions: request().permissions }));
  await writeFile(filename, JSON.stringify({ agentProfiles: { reviewer: { model: 'two', developerInstructions: 'private configured instructions' } } }));
  assert.notEqual(first, await b.executionFingerprint({ cwd: temp, permissions: request().permissions }));
  assert.notEqual(first, await b.executionFingerprint({ cwd: temp, permissions: { ...request().permissions, networkAccess: true } }));
  assert(!first.includes('private'));
});

test('unsafe owner-authored output schema is rejected before a process starts', async t => {
  const b = backend(); t.after(() => b.shutdown());
  const events = [];
  await assert.rejects(b.execute(request('success', { schema: { type: 'object', properties: { text: { type: 'string', pattern: '(a+)+$' } } } }), { onEvent: event => events.push(event) }), { code: 'INVALID_SCHEMA', outcome: 'not-started' });
  assert.equal(events.length, 0);
});

test('simultaneous duplicate worker identities are rejected before a second dispatch', async t => {
  const b = backend(); t.after(() => b.shutdown());
  const controller = new AbortController();
  t.after(() => controller.abort());
  const events = [];
  let started;
  const dispatched = new Promise(resolve => { started = resolve; });
  const first = guarded(b, request('steer'), { signal: controller.signal, onEvent: event => { events.push(event); if (event.type === 'process') started(); } });
  first.catch(() => {});
  await assert.rejects(guarded(b, request('steer')), { code: 'DUPLICATE_WORKER', outcome: 'not-started' });
  await dispatched;
  controller.abort();
  await assert.rejects(first, { code: 'CANCELLED' });
  assert.equal(events.filter(event => event.type === 'process').length, 1);
});

for (const transport of ['app-server', 'exec']) {
  test(`${transport} discounts known active tool waits`, async t => {
    const b = watchdogBackend(transport);
    t.after(() => b.shutdown());
    assert.equal((await guarded(b, request('tool-wait', { stallMs: stallWindowMs, timeoutMs: 8000 }))).value.ok, true);
  });

  test(`${transport} preserves independent hard timeout during tool wait`, async t => {
    const b = watchdogBackend(transport);
    t.after(() => b.shutdown());
    await assert.rejects(guarded(b, request('tool-hard-timeout', { stallMs: stallWindowMs, timeoutMs: 2000 })), { code: 'TIMEOUT', outcome: 'unknown' });
  });

  test(`${transport} maps explicit pre-tool quota to a verified account reset`, async t => {
    const b = module.createCodexBackend({ transport, executable: process.execPath, config: { executableArgs: [fixture], env: { CODEX_FIXTURE_QUOTA: '1' } } });
    t.after(() => b.shutdown());
    await assert.rejects(b.execute(request('quota')), error => error.code === 'QUOTA' && error.outcome === 'not-started' && error.resetAt === 1791800000000 && error.usage.observed === false);
    await assert.rejects(b.execute(request('quota-after-tool')), { code: 'QUOTA', outcome: 'unknown' });
  });
}

test('approval waiting discounts silence', async t => {
  const b = backend(); t.after(() => b.shutdown());
  const approved = await guarded(b, request('approval', { stallMs: stallWindowMs, timeoutMs: 8000, permissions: { sandbox: 'read-only', networkAccess: false, approvalPolicy: 'on-request' } }), { onApproval: async () => { await new Promise(resolve => setTimeout(resolve, 1500)); return 'accept'; } });
  assert.equal(approved.value.decision, 'accept');
});

test('post-tool silence remains guarded after the tool has completed', async t => {
  const b = watchdogBackend('app-server'); t.after(() => b.shutdown());
  let completed = false;
  await assert.rejects(guarded(b, request('tool-done-stall', { stallMs: stallWindowMs, timeoutMs: 8000 }), { onEvent: event => { if (event.type === 'item/completed' && event.params?.item?.id === 'tool') completed = true; } }), { code: 'STALLED', outcome: 'unknown' });
  assert.equal(completed, true);
});

test('quota reset remains absent when native account data does not establish it', async t => {
  const b = backend({ env: { CODEX_FIXTURE_QUOTA: '1', CODEX_FIXTURE_NO_RESET: '1' } }); t.after(() => b.shutdown());
  await assert.rejects(b.execute(request('quota')), error => error.code === 'QUOTA' && error.outcome === 'not-started' && error.resetAt === undefined);
});

test('account-query drain failures override quota eligibility and preserve already observed usage', async () => {
  const error = workerError('TURN_FAILED', 'Native quota', 'failed', { turnError: { codexErrorInfo: 'usageLimitExceeded' }, usage: { observed: true, outputTokens: 3 } });
  const context = { signal: new AbortController().signal, setWaiting() {}, readRateLimits: async () => { throw workerError('DRAIN_FAILED', 'Account process failed to drain', 'unknown'); } };
  await assert.rejects(classifyQuota(error, false, context), failure => failure.code === 'DRAIN_FAILED' && failure.outcome === 'unknown' && failure.usage.outputTokens === 3);
});

test('exec rejects malformed observed usage and preserves truly missing usage coverage', async t => {
  const b = module.createCodexBackend({ transport: 'exec', executable: process.execPath, config: { executableArgs: [fixture] } });
  t.after(() => b.shutdown());
  await assert.rejects(b.execute(request('bad-usage')), { code: 'PROTOCOL_ERROR', outcome: 'unknown' });
  assert.equal((await b.execute(request('missing-usage'))).usage.observed, false);
});

test('pinned native subagent tool tags preserve uncertain child effects on cancellation', async t => {
  const b = backend(); t.after(() => b.shutdown());
  const controller = new AbortController();
  await assert.rejects(guarded(b, request('cancel-native-subagent'), { signal: controller.signal, onEvent: event => { if (event.type === 'item/started') controller.abort(); } }), { code: 'CANCELLED', outcome: 'unknown' });
});
