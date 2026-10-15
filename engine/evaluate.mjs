import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseScript } from './script.mjs';
import { fault } from '../foundation/client.mjs';

export const MAX_EVALUATOR_INPUT_BYTES = 2 * 1024 * 1024;

// Serialize exactly the envelope sent to the child; this parses but never runs guest code.
export function preflightEvaluatorInput(script, args = null, cpuMs = 1000) {
  const { body } = parseScript(script);
  const input = JSON.stringify({ kind: 'start', body, args, cpuMs });
  if (Buffer.byteLength(input) > MAX_EVALUATOR_INPUT_BYTES) throw fault('EVALUATOR_INPUT', 'Combined workflow script and args exceed the 2 MiB evaluator input limit; use file-backed manifests with hashes and bounded ranges');
  return input;
}

export async function evaluate(script, { args = null, call, timeoutMs = null, idleTimeoutMs = 5000, cpuMs = 1000, signal } = {}) {
  if (typeof call !== 'function' || timeoutMs!==null&&(!Number.isFinite(timeoutMs)||timeoutMs<=0) || !Number.isFinite(idleTimeoutMs)||idleTimeoutMs<=0 || !Number.isFinite(cpuMs) || cpuMs <= 0) throw fault('EVALUATOR_INPUT', 'A broker and positive execution limits are required');
  if (signal?.aborted) throw fault('EVALUATOR_ABORTED', 'Workflow evaluation was cancelled');
  const input = preflightEvaluatorInput(script, args, cpuMs);
  const child = fork(fileURLToPath(new URL('./evaluator-child.mjs', import.meta.url)), [], {
    windowsHide: true, silent: true, execArgv: [],
    // The child needs only Node and installed WASM; never inherit credentials/preloads.
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(SystemRoot|WINDIR|TEMP|TMP|PATH)$/i.test(key))),
  });
  child.stdout.resume(); child.stderr.resume();
  return await new Promise((resolve, reject) => {
    let outcome;
    let exited = false;
    let total = 0;
    let pending = 0;
    let killTimer,idleTimer;
    const timer = timeoutMs===null?undefined:setTimeout(() => finish({ error: fault('EVALUATOR_TIMEOUT', 'Workflow evaluator exceeded its wall deadline') }), timeoutMs);
    const armIdle=()=>{
      clearTimeout(idleTimer);
      if(!outcome&&!pending)idleTimer=setTimeout(()=>finish({error:fault('EVALUATOR_IDLE','Workflow evaluator made no progress with no outstanding broker work')}),idleTimeoutMs);
    };
    const abort = () => finish({ error: fault('EVALUATOR_ABORTED', 'Workflow evaluation was cancelled') });
    const send = message => {
      if (outcome || !child.connected) return;
      child.send(message, error => { if (error) finish({ error: fault('EVALUATOR_TRANSPORT', 'Evaluator IPC failed') }); });
    };
    const finish = value => {
      if (outcome) return;
      outcome = value;
      clearTimeout(timer);
      clearTimeout(idleTimer);
      signal?.removeEventListener('abort', abort);
      if (child.connected) child.disconnect();
      killTimer = setTimeout(() => { if (!exited) child.kill(); }, 250);
    };
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', () => finish({ error: fault('EVALUATOR_START', 'Evaluator process could not start') }));
    const observeExit = () => {
      if (exited) return;
      exited = true; clearTimeout(timer); clearTimeout(idleTimer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort);
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
      if (!outcome) outcome = { error: fault('EVALUATOR_EXIT', 'Evaluator exited without a result') };
      if (outcome.error) reject(outcome.error); else resolve(outcome.value);
    };
    // Explicit IPC disconnect can suppress ChildProcess's close event on Windows.
    // This evaluator cannot spawn children; the owned process exit is sufficient.
    child.on('exit', observeExit);
    child.on('close', observeExit);
    child.on('message', message => {
      if (outcome) return;
      if (!message || Buffer.byteLength(JSON.stringify(message)) > 1024 * 1024) return finish({ error: fault('EVALUATOR_LIMIT', 'Evaluator message exceeded its limit') });
      if (message.kind === 'result') return finish(pending ? { error: fault('EVALUATOR_PENDING', 'Workflow returned with unawaited broker calls') } : { value: message.value });
      if (message.kind === 'error') return finish({ error: fault('SCRIPT_FAILED', 'Workflow script failed inside the isolated evaluator') });
      if (message.kind !== 'call' || !Number.isInteger(message.id) || !['agent', 'phase', 'log'].includes(message.method) || ++total > 10000 || ++pending > 4096) return finish({ error: fault('EVALUATOR_PROTOCOL', 'Invalid or excessive evaluator broker messages') });
      clearTimeout(idleTimer);
      Promise.resolve().then(() => call(message.method, message.params)).then(value => {
        const json = JSON.stringify(value ?? null);
        if (Buffer.byteLength(json) > 1024 * 1024) throw fault('EVALUATOR_LIMIT', 'Broker response exceeded its limit');
        send({ kind: 'reply', id: message.id, value: JSON.parse(json) });
      }, () => send({ kind: 'reply', id: message.id, error: true })).catch(() => finish({ error: fault('EVALUATOR_BROKER', 'Broker response could not be transferred') })).finally(() => { pending--; armIdle(); });
    });
    send(JSON.parse(input));
    armIdle();
  });
}
