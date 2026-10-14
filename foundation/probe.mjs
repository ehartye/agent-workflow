import { randomUUID } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';
import { fault, diagnostic } from './client.mjs';

export function assertManagedChatgpt(account, snapshot, expectedSandbox='read-only') {
  if(!['read-only','workspace-write','danger-full-access'].includes(expectedSandbox))throw fault('CONFIG_UNSUPPORTED','Unsupported expected execution policy');
  if (account?.account?.type !== 'chatgpt') throw fault('AUTH_UNSUPPORTED', 'A managed ChatGPT login is required; no billing fallback is allowed');
  const config = snapshot?.config;
  if (!config || !Array.isArray(snapshot.layers) ||
      config.model_provider !== 'openai' || config.forced_login_method !== 'chatgpt' ||
      config.approval_policy !== 'never' || config.sandbox_mode !== expectedSandbox) {
    throw fault('CONFIG_UNSUPPORTED', 'Effective provider, login and sandbox restrictions did not match the probe contract');
  }
  // Config/read includes raw layers: reject custom built-in provider routing even
  // when normalized config does not expose provider definitions.
  for (const layer of [config, ...snapshot.layers.filter(item => !item.disabledReason).map(item => item.config)]) {
    if (!layer || typeof layer !== 'object' || Array.isArray(layer) ||
        layer.model_providers?.openai != null ||
        (layer.chatgpt_base_url != null && layer.chatgpt_base_url !== 'https://chatgpt.com/backend-api/')) {
      throw fault('CONFIG_UNSUPPORTED', 'Custom OpenAI routing is outside this managed-login probe');
    }
  }
  return { mode: 'chatgpt', provider: 'openai' };
}

function errorRecord(error) {
  return diagnostic(error);
}

export async function probe(client, { cwd, command, cancelCommand, platform = process.platform, timeoutMs = 20000, cancelTimeoutMs = 2000,expectedSandbox='read-only',sandboxPolicy={type:'readOnly',networkAccess:false} }) {
  const report = { status: 'running', inferenceRequests: 0, stages: [], runnerEquivalence: 'notVerified' };
  const executeStage = async (name, run) => {
    const stage = { name, status: 'running' };
    report.stages.push(stage);
    try { stage.evidence = await run(stage); stage.status = 'passed'; }
    catch (error) { stage.status = 'failed'; stage.error = errorRecord(error); throw error; }
  };
  const policy = sandboxPolicy;
  const execParams = argv => ({ command: argv, cwd, sandboxPolicy: policy, timeoutMs, outputBytesCap: 8192 });
  async function runCommand(kind, stage) {
    const processId = `${kind}-${randomUUID()}`;
    let output = Buffer.alloc(0);
    let truncated = false;
    let outputValid = true;
    const streamed = kind !== 'buffered';
    const unsubscribe = client.onNotification(message => {
      if (message.method !== 'command/exec/outputDelta' || message.params?.processId !== processId) return;
      const delta = Buffer.from(message.params.deltaBase64, 'base64');
      if (message.params.stream === 'stdout') {
        truncated ||= output.length + delta.length > 8192;
        output = Buffer.concat([output, delta.subarray(0, 8192 - output.length)]);
      }
      const capReached = message.params.capReached;
      if (capReached !== undefined && typeof capReached !== 'boolean') outputValid = false;
      truncated ||= capReached === true;
    });
    try {
      const result = await client.request('command/exec', {
        ...execParams(command), processId, streamStdoutStderr: streamed, ...(kind === 'pty' ? { tty: true } : {}),
      }, { timeoutMs: timeoutMs + 1000 });
      const record = result && typeof result === 'object' && !Array.isArray(result) ? result : null;
      const collected = output.toString('utf8');
      // Node's VT stripper can leave a Windows drive/path suffix from OSC titles.
      const stdout = kind === 'pty' ? stripVTControlCharacters(collected.replace(/\u001b\][\s\S]*?(?:\u0007|\u001b\\)/g, '')) : streamed ? collected : record?.stdout;
      // Project only safe observations after a response. RPC rejections leave
      // evidence absent; neither missing results nor failures prove no startup.
      const evidence = {
        exitCode: Number.isSafeInteger(record?.exitCode) ? record.exitCode : null,
        markerObserved: typeof stdout === 'string' && stdout.trim() === 'FOUNDATION_OK',
        policy, outputTruncated: truncated,
      };
      stage.evidence = evidence;
      if (evidence.exitCode !== 0 || evidence.outputTruncated || !evidence.markerObserved || !outputValid) {
        throw fault('COMMAND_FAILED', 'Sandbox command did not return the expected marker and successful exit');
      }
      return { ...evidence, marker: 'FOUNDATION_OK' };
    } finally { unsubscribe(); }
  }
  async function cancel() {
    const processId = `cancel-${randomUUID()}`;
    let resolveReady;
    let readyTimer;
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      readyTimer = setTimeout(() => reject(fault('CANCEL_NOT_STARTED', 'Cancellation probe did not report command startup')), timeoutMs);
    });
    let output = '';
    const unsubscribe = client.onNotification(message => {
      if (message.method !== 'command/exec/outputDelta' || message.params?.processId !== processId || message.params.stream !== 'stdout') return;
      output = (output + Buffer.from(message.params.deltaBase64, 'base64').toString('utf8')).slice(0, 1024);
      if (output.includes('READY')) resolveReady();
    });
    // Observe the execution promise immediately; errors must not become unhandled
    // while waiting for the streamed startup marker.
    const execution = client.request('command/exec', {
      ...execParams(cancelCommand), processId, streamStdoutStderr: true,
      // Keep the execution timeout beyond the entire readiness/cancellation
      // window so a natural timeout cannot count as verified termination.
      timeoutMs: timeoutMs + cancelTimeoutMs + 2000,
    }, { timeoutMs: timeoutMs + cancelTimeoutMs + 3000 });
    const completed = execution.then(result => ({ result }), error => ({ error }));
    try {
      await Promise.race([ready, completed.then(outcome => { throw outcome.error ?? fault('CANCEL_EARLY_EXIT', 'Cancellation command exited before cancellation'); })]);
      clearTimeout(readyTimer);
      let cancellationTimer;
      let outcome;
      try {
        const deadline = new Promise((_, reject) => {
          cancellationTimer = setTimeout(() => reject(fault('CANCEL_UNVERIFIED', 'Command did not finish within the cancellation deadline')), cancelTimeoutMs);
        });
        const termination = (async () => {
          await client.request('command/exec/terminate', { processId }, { timeoutMs: timeoutMs + cancelTimeoutMs + 1000 });
          return completed;
        })();
        outcome = await Promise.race([termination, deadline]);
      } finally { clearTimeout(cancellationTimer); }
      if (outcome.error) throw outcome.error;
      if (!Number.isInteger(outcome.result.exitCode) || outcome.result.exitCode === 0) throw fault('CANCEL_UNVERIFIED', 'Expected a nonzero terminal command result after cancellation');
      return { terminalResponse: true, exitCode: outcome.result.exitCode, descendants: 'notVerified' };
    } finally { clearTimeout(readyTimer); unsubscribe(); }
  }
  try {
    await executeStage('authentication', async () => {
      const account = await client.request('account/read', { refreshToken: false });
      const config = await client.request('config/read', { cwd, includeLayers: true });
      return assertManagedChatgpt(account, config,expectedSandbox);
    });
    if (platform === 'win32'&&expectedSandbox!=='danger-full-access') await executeStage('windows-readiness', async () => {
      const result = await client.request('windowsSandbox/readiness', {});
      if (result.status !== 'ready') throw fault('SANDBOX_NOT_READY', 'Windows sandbox did not report ready');
      return { status: result.status, commandProven: false };
    });
    await executeStage('buffered-command', stage => runCommand('buffered', stage));
    await executeStage('streamed-command', stage => runCommand('streamed', stage));
    await executeStage('pty-command', stage => runCommand('pty', stage));
    await executeStage('cancellation', cancel);
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = errorRecord(error);
  } finally {
    try { report.cleanup = await client.close(); }
    catch (error) { report.cleanup = { serverExited: false, descendants: 'notVerified', error: errorRecord(error) }; }
    if (!report.cleanup.serverExited) report.status = 'failed';
  }
  return report;
}
