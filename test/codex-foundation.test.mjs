// @lane merge
// @subject foundation/client.mjs
// @subject foundation/probe.mjs
// @subject foundation/launch.mjs
// @subject test/fixtures/foundation-server.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const fixture = fileURLToPath(new URL('./fixtures/foundation-server.mjs', import.meta.url));

test('managed capability homes are explicit named values and cannot widen launch environment',async()=>{
 const {createLaunch}=await import('../foundation/launch.mjs');
 const options={executable:process.execPath,cwd:process.cwd(),env:{AGENT_BEEPS_HOME:'parent-is-not-inherited',AGENT_SPRITES_HOME:'parent-is-not-inherited',OPENAI_API_KEY:'secret'}};
 const launch=createLaunch({...options,capabilityEnvironment:{AGENT_BEEPS_HOME:process.cwd()}});
 assert.deepEqual(launch.env,{AGENT_BEEPS_HOME:process.cwd()});
 for(const capabilityEnvironment of [{NODE_OPTIONS:'--require unwanted'},{OPENAI_API_KEY:'secret'},{AGENT_BEEPS_HOME:'relative'}])assert.throws(()=>createLaunch({...options,capabilityEnvironment}),{code:'LAUNCH_INVALID'});
});
async function connect(t, options = {}, mode = '') {
  const module = await import('../foundation/client.mjs').catch(() => null);
  assert.ok(module?.AppServer, 'Fresh AppServer client must exist');
  const client = await module.AppServer.connect({ command: process.execPath, args: [fixture, mode], requestTimeoutMs: 1000, shutdownMs: 100, ...options });
  t.after(() => client.close());
  return client;
}

test('routes concurrent replies and split UTF-8 notifications without mixing requests', async t => {
  const client = await connect(t);
  const seen = [];
  client.onNotification(message => seen.push(message));
  const results = await Promise.all([
    client.request('echo', { value: 'first', delay: 30 }),
    client.request('echo', { value: 'second', delay: 15 }),
    client.request('fragment', {}),
  ]);
  assert.deepEqual(results, ['first', 'second', 'done']);
  assert.deepEqual(seen, [{ method: 'progress', params: { text: 'café 🧪' } }]);
});

test('diagnostic client denies server requests instead of granting tool approval', async t => {
  const client = await connect(t);
  assert.deepEqual(await client.request('approval', {}), { rejected: true });
});

test('experimental native methods require an explicit connection capability opt-in',async t=>{
  for(const experimentalApi of [false,true]){
    const client=await connect(t,{experimentalApi},'capabilities');
    assert.deepEqual(await client.request('capabilities',{}),{experimentalApi});
  }
});

for (const [method, code, options] of [
  ['hang', 'REQUEST_TIMEOUT', { requestTimeoutMs: 150 }],
  ['bad', 'PROTOCOL_ERROR', {}],
  ['big', 'PROTOCOL_LIMIT', { maxMessageBytes: 1024 }],
  ['exit', 'SERVER_EXIT', {}],
]) {
  test(`${method} closes admission and rejects outstanding requests with ${code}`, async t => {
    const client = await connect(t, { ...options, requestTimeoutMs: 2000 });
    const outstanding = client.request('hang', {});
    const failed = client.request(method, {}, {timeoutMs:options.requestTimeoutMs??1000});
    const results = await Promise.allSettled([outstanding, failed]);
    for (const result of results) {
      assert.equal(result.status, 'rejected');
      assert.equal(result.reason.code, code);
    }
    await assert.rejects(client.request('echo', { value: 'too late' }), { code });
    assert.equal((await client.close()).serverExited, true);
  });
}

test('shutdown observes owned server exit and does not claim descendant drain', async t => {
  const client = await connect(t, {}, 'linger');
  const result = await client.close();
  assert.deepEqual(result, { serverExited: true, forced: true, descendants: 'notVerified' });
  assert.deepEqual(await client.close(), result);
});

async function probeModule() {
  const module = await import('../foundation/probe.mjs').catch(() => null);
  assert.ok(module?.probe, 'Fresh capability probe must exist');
  return module;
}

test('managed ChatGPT admission rejects alternative billing and provider routes', async () => {
  const { assertManagedChatgpt } = await probeModule();
  const account = { account: { type: 'chatgpt' }, requiresOpenaiAuth: true };
  const config = { config: { model_provider: 'openai', forced_login_method: 'chatgpt', approval_policy: 'never', sandbox_mode: 'read-only' }, layers: [{ config: {} }] };
  assert.deepEqual(assertManagedChatgpt(account, config), { mode: 'chatgpt', provider: 'openai' });
  assert.deepEqual(assertManagedChatgpt(account, { ...config, config: { ...config.config, chatgpt_base_url: 'https://chatgpt.com/backend-api/' } }), { mode: 'chatgpt', provider: 'openai' });
  for (const type of ['apiKey', 'amazonBedrock', null]) {
    assert.throws(() => assertManagedChatgpt({ account: type ? { type } : null }, config), { code: 'AUTH_UNSUPPORTED' });
  }
  for (const patch of [{ model_provider: 'other' }, { forced_login_method: 'api' }, { approval_policy: 'on-request' }, { sandbox_mode: 'danger-full-access' }, { model_providers: { openai: { base_url: 'https://other.invalid' } } }, { chatgpt_base_url: 'https://other.invalid' }]) {
    assert.throws(() => assertManagedChatgpt(account, { ...config, config: { ...config.config, ...patch } }), { code: 'CONFIG_UNSUPPORTED' });
  }
  assert.throws(() => assertManagedChatgpt(account, { ...config, layers: [{ config: { model_providers: { openai: { env_key: 'API_KEY' } } } }] }), { code: 'CONFIG_UNSUPPORTED' });
  assert.throws(() => assertManagedChatgpt(account, { config: config.config }), { code: 'CONFIG_UNSUPPORTED' });
});

test('a late command timeout cannot masquerade as successful cancellation', async t => {
  const client = await connect(t, {}, 'cancel-ignored');
  const { probe } = await probeModule();
  const report = await probe(client, { cwd: process.cwd(), command: ['fixture-only'], cancelCommand: ['fixture-only'], platform: 'win32', timeoutMs: 1000, cancelTimeoutMs: 100 });
  assert.equal(report.status, 'failed');
  assert.equal(report.error.code, 'CANCEL_UNVERIFIED');
});

test('cancellation deadline includes delayed termination acknowledgement', async t => {
  const client = await connect(t, {}, 'cancel-late-ack');
  const { probe } = await probeModule();
  const report = await probe(client, { cwd: process.cwd(), command: ['fixture-only'], cancelCommand: ['fixture-only'], platform: 'win32', timeoutMs: 1000, cancelTimeoutMs: 100 });
  assert.equal(report.status, 'failed');
  assert.equal(report.error.code, 'CANCEL_UNVERIFIED');
});

test('launcher constrains configuration and removes API credentials, endpoints and preload code', async () => {
  const module = await import('../foundation/launch.mjs').catch(() => null);
  assert.ok(module?.createLaunch, 'Fresh launch contract must exist');
  const input = { executable: process.execPath, cwd: process.cwd(), backend: 'mxc', platform: 'win32', env: { PATH: 'os-path', CODEX_HOME: 'managed-home', PLAYWRIGHT_BROWSERS_PATH:process.cwd(), OPENAI_API_KEY: 'private-key', CODEX_API_KEY: 'other-key', OPENAI_BASE_URL: 'https://other.invalid', NODE_OPTIONS: '--require unwanted', AWS_SECRET_ACCESS_KEY: 'secret', UNRELATED: 'value' } };
  const launch = module.createLaunch(input);
  assert.deepEqual(launch.env, { PATH: 'os-path', CODEX_HOME: 'managed-home',PLAYWRIGHT_BROWSERS_PATH:process.cwd() });
  for(const cache of ['relative/path','0','https://example.invalid/cache'])assert.throws(()=>module.createLaunch({...input,env:{PLAYWRIGHT_BROWSERS_PATH:cache}}),{code:'LAUNCH_INVALID'});
  assert.ok(launch.args.includes('forced_login_method="chatgpt"'));
  assert.ok(launch.args.includes('model_provider="openai"'));
  assert.ok(launch.args.includes('windows.sandbox="mxc"'));
  assert.throws(() => module.createLaunch({ ...input, backend: 'danger-full-access' }));
  assert.throws(() => module.createLaunch({ ...input, executable: 'codex.cmd' }));
  assert.throws(() => module.assertChatgptLogin({ stdout: '', stderr: 'Logged in using an API key: private-key' }), { code: 'AUTH_UNSUPPORTED' });
  assert.doesNotThrow(() => module.assertChatgptLogin({ stdout: '', stderr: 'Logged in using ChatGPT\n' }));
});

test('remote errors cannot put credentials or account identities in reports', async t => {
  const client = await connect(t, {}, 'secret-error');
  const { probe } = await probeModule();
  const report = await probe(client, { cwd: process.cwd(), command: ['fixture-only'], cancelCommand: ['fixture-only'], platform: 'win32' });
  assert.equal(report.status, 'failed');
  assert.equal(report.error.code, 'RPC_ERROR');
  assert.doesNotMatch(JSON.stringify(report), /REVIEW_SECRET_SENTINEL|private@example/);
});

test('version-command diagnostics exclude subprocess stderr and argv', async () => {
  const { diagnostic } = await import('../foundation/client.mjs');
  assert.equal(typeof diagnostic, 'function', 'Report-safe diagnostic function must exist');
  const error = await promisify(execFile)(process.execPath, ['-e', 'process.stderr.write("REVIEW_SECRET_SENTINEL");process.exit(2)']).then(() => null, error => error);
  assert.ok(error);
  assert.deepEqual(diagnostic(error), { code: 'CHECK_FAILED', message: 'Foundation check failed; untrusted diagnostic details were excluded' });
});

test('synthetic subprocess probe covers buffered, streamed and PTY execution plus terminal cancellation without a model turn', async t => {
  const client = await connect(t);
  const { probe } = await probeModule();
  const report = await probe(client, { cwd: process.cwd(), command: ['fixture-only'], cancelCommand: ['fixture-only'], platform: 'win32', timeoutMs: 500 });
  assert.equal(report.status, 'passed');
  assert.equal(report.inferenceRequests, 0);
  assert.deepEqual(report.stages.map(stage => [stage.name, stage.status]), [
    ['authentication', 'passed'], ['windows-readiness', 'passed'], ['buffered-command', 'passed'],
    ['streamed-command', 'passed'], ['pty-command', 'passed'], ['cancellation', 'passed'],
  ]);
  assert.equal(report.cleanup.serverExited, true);
  assert.equal(report.cleanup.descendants, 'notVerified');
  assert.equal(report.runnerEquivalence, 'notVerified');
  for (const stage of report.stages.filter(stage => stage.name.endsWith('-command'))) {
    assert.deepEqual(stage.evidence, {
      exitCode: 0, marker: 'FOUNDATION_OK', markerObserved: true,
      policy: { type: 'readOnly', networkAccess: false }, outputTruncated: false,
    });
  }
  assert.equal(JSON.stringify(report).includes('private@example.invalid'), false);
});

// These are synthetic command results from an owned subprocess, not native
// sandbox, Windows status, runner-equivalence or descendant-drain proof.
const commandResultCases = [
  ['nonzero', { exitCode: 7, markerObserved: true, outputTruncated: false }],
  ['windows-status', { exitCode: -1073741502, markerObserved: false, outputTruncated: false }],
  ['incorrect-marker', { exitCode: 0, markerObserved: false, outputTruncated: false }],
  ['missing-marker', { exitCode: 0, markerObserved: false, outputTruncated: false }],
  ['fractional-exit', { exitCode: null, markerObserved: true, outputTruncated: false }],
  ['unsafe-exit', { exitCode: null, markerObserved: true, outputTruncated: false }],
  ['null-exit', { exitCode: null, markerObserved: true, outputTruncated: false }],
  ['boolean-exit', { exitCode: null, markerObserved: true, outputTruncated: false }],
  ['string-exit', { exitCode: null, markerObserved: true, outputTruncated: false }],
  ['secret-exit', { exitCode: null, markerObserved: true, outputTruncated: false }],
  ['missing-exit', { exitCode: null, markerObserved: true, outputTruncated: false }],
  ['null-result', { exitCode: null, markerObserved: false, outputTruncated: false }],
  ['unknown-result', { exitCode: null, markerObserved: false, outputTruncated: false }],
  ['array-result', { exitCode: null, markerObserved: false, outputTruncated: false }],
  ['secret-outputs', { exitCode: 0, markerObserved: false, outputTruncated: false }],
];

for (const kind of ['buffered', 'streamed', 'pty']) {
  test(`synthetic ${kind} command failures retain only safe observations and owned cleanup`, async t => {
    // Common result projection has one owner; streamed output/cap handling is
    // shared with PTY. Keep stage wiring and PTY normalization representative.
    const cases = kind === 'buffered' ? [...commandResultCases,
      ['malformed-stdout', { exitCode: 0, markerObserved: false, outputTruncated: false }],
    ] : kind === 'streamed' ? commandResultCases.filter(([name]) => ['nonzero', 'secret-outputs'].includes(name))
      : commandResultCases.filter(([name]) => name === 'nonzero');
    if (kind === 'streamed') cases.push(
      ['stdout-cap', { exitCode: 0, markerObserved: true, outputTruncated: true }],
      ['stderr-cap', { exitCode: 0, markerObserved: true, outputTruncated: true }],
      ['local-cap', { exitCode: 0, markerObserved: true, outputTruncated: true }],
      ['local-byte-cap', { exitCode: 0, markerObserved: true, outputTruncated: true }],
      ['omitted-cap', { exitCode: 7, markerObserved: true, outputTruncated: false }],
      ['malformed-cap', { exitCode: 0, markerObserved: true, outputTruncated: false }],
    );
    for (const [scenario, observations] of cases) {
      await t.test(scenario, async t => {
        const client = await connect(t, {}, `command-result-${kind}-${scenario}`);
        const { probe } = await probeModule();
        const report = await probe(client, {
          cwd: 'REVIEW_CWD_SENTINEL', command: ['REVIEW_ARGV_SENTINEL'],
          cancelCommand: ['fixture-only'], platform: 'win32', timeoutMs: 1000,
        });
        const failed = report.stages.at(-1);
        assert.equal(report.status, 'failed');
        assert.equal(failed.name, `${kind}-command`);
        assert.equal(failed.status, 'failed');
        assert.ok(report.stages.slice(0, -1).every(stage => stage.status === 'passed'));
        assert.deepEqual(failed.evidence, {
          ...observations, policy: { type: 'readOnly', networkAccess: false },
        });
        assert.deepEqual(failed.error, {
          code: 'COMMAND_FAILED', message: 'Sandbox command did not return the expected marker and successful exit',
        });
        assert.deepEqual(report.error, failed.error);
        assert.equal(report.inferenceRequests, 0);
        assert.equal(report.runnerEquivalence, 'notVerified');
        assert.equal(report.cleanup.serverExited, true);
        assert.equal(report.cleanup.descendants, 'notVerified');
        assert.doesNotMatch(JSON.stringify(report), /REVIEW_[A-Z_]+|private@example|stdout|stderr|argv|cwd|noProcessStarted/);
      });
    }
  });
}

for (const [mode, expected] of [['api', 'AUTH_UNSUPPORTED'], ['not-ready', 'SANDBOX_NOT_READY'], ['command-failure', 'RPC_ERROR'], ['cancel-hangs', 'CANCEL_UNVERIFIED']]) {
  test(`probe fails closed for ${mode} and retains primary error separately from cleanup`, async t => {
    const client = await connect(t, {}, mode);
    const { probe } = await probeModule();
    const report = await probe(client, { cwd: process.cwd(), command: ['fixture-only'], cancelCommand: ['fixture-only'], platform: 'win32', timeoutMs: 150 });
    assert.equal(report.status, 'failed');
    assert.equal(report.error.code, expected);
    if (mode === 'command-failure') {
      assert.match(report.error.message, /runner pipe-in/);
      assert.equal(Object.hasOwn(report.stages.at(-1), 'evidence'), false, 'RPC rejection has no command result evidence');
      assert.doesNotMatch(JSON.stringify(report), /REVIEW_[A-Z_]+|private@example|noProcessStarted/);
    }
    assert.equal(report.cleanup.serverExited, true);
    assert.equal(report.inferenceRequests, 0);
    assert.equal(report.stages.at(-1).status, 'failed');
  });
}
