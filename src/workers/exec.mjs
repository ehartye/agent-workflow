import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launch, readLines, emitProcessIdentity } from './process.mjs';
import { usageOf, workerError, cancellationError, classifyQuota, TOOL_TYPES } from './shared.mjs';

export async function executeExec(request, context) {
  if (request.permissions.approvalPolicy !== 'never') throw workerError('EXEC_APPROVAL_UNSUPPORTED', 'Exec transport requires approvalPolicy never; use app-server for approvals', 'not-started');
  const temp = await mkdtemp(path.join(os.tmpdir(), 'agent-workflow-exec-'));
  let handle;
  let usage = usageOf();
  let threadId;
  let finalText;
  let completed = false;
  let protocolError;
  let potentialEffects = false;
  let queue = Promise.resolve();
  try {
    const args = [...context.args, 'exec', '--json', '--color', 'never', '--sandbox', request.permissions.sandbox,
      '-c', 'approval_policy="never"', '-c', `sandbox_workspace_write.network_access=${request.permissions.networkAccess}`,
      '-c', `sandbox_read_only.network_access=${request.permissions.networkAccess}`, '-C', request.cwd];
    if (context.ignoreUserConfig) args.push('--ignore-user-config');
    if (request.model) args.push('--model', request.model);
    if (request.effort) args.push('-c', `model_reasoning_effort=${JSON.stringify(request.effort)}`);
    if (request.developerInstructions) args.push('-c', `developer_instructions=${JSON.stringify(request.developerInstructions)}`);
    if (request.schema !== undefined) { const schemaPath = path.join(temp, 'schema.json'); await writeFile(schemaPath, JSON.stringify(request.schema)); args.push('--output-schema', schemaPath); }
    args.push('-');
    handle = launch(context.executable, args, { cwd: request.cwd, env: context.env });
    context.setConnection({ processHandle: handle });
    let failDrain;
    const drainFailure = new Promise((_, reject) => { failDrain = reject; });
    drainFailure.catch(() => {});
    const requestStop = () => { void handle.stop().catch(failDrain); };
    handle.child.stdin.on('error', error => { protocolError ||= error; });
    const abort = () => { protocolError = cancellationError(context.signal); requestStop(); };
    context.signal.addEventListener('abort', abort, { once: true });
    if (context.signal.aborted) abort();
    readLines(handle.child.stdout, message => {
      queue = queue.then(async () => {
        if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') throw workerError('PROTOCOL_ERROR', 'Invalid exec JSONL event', 'unknown');
        if (message.type === 'item.started' && TOOL_TYPES.has(message.item?.type)) potentialEffects = true;
        await context.emit({ ...message, threadId });
        if (message.type === 'thread.started') threadId = message.thread_id;
        if (message.type === 'item.completed' && message.item?.type === 'agent_message') finalText = message.item.text;
        if (message.type === 'turn.completed') {
          if (message.usage !== undefined && (message.usage === null || typeof message.usage !== 'object' || Array.isArray(message.usage) ||
            ['input_tokens', 'cached_input_tokens', 'output_tokens'].some(key => !Number.isSafeInteger(message.usage[key]) || message.usage[key] < 0) ||
            ['reasoning_output_tokens', 'cache_write_input_tokens', 'total_tokens'].some(key => message.usage[key] !== undefined && (!Number.isSafeInteger(message.usage[key]) || message.usage[key] < 0)) ||
            !Number.isSafeInteger(message.usage.input_tokens + message.usage.output_tokens))) throw workerError('PROTOCOL_ERROR', 'Invalid exec token usage', 'unknown');
          completed = true; usage = usageOf(message.usage); await context.emit({ type: 'usage', usage, usageMode: 'cumulative' });
        }
        if (message.type === 'turn.failed' || message.type === 'error') { protocolError = workerError('TURN_FAILED', message.error?.message || message.message || 'Worker turn failed', 'failed', { turnError: message.error ?? message }); requestStop(); }
      }).catch(error => { protocolError = error; requestStop(); });
    }, error => { protocolError = workerError('PROTOCOL_ERROR', error.message, 'unknown'); requestStop(); });
    await context.emit({ type: 'process', pid: handle.child.pid });
    if (handle.child.pid) void emitProcessIdentity(handle.child.pid, context.emit);
    handle.child.stdin.end(request.prompt);
    const exit = await Promise.race([handle.closed, drainFailure]);
    context.signal.removeEventListener('abort', abort);
    await queue;
    if (protocolError) throw protocolError;
    if (exit.error || exit.code !== 0) throw workerError('PROCESS_EXIT', exit.error?.message || `Codex exec exited ${exit.code}`, 'unknown', { process: exit });
    if (!completed || typeof finalText !== 'string') throw workerError('MISSING_OUTPUT', 'Exec exited without a completed turn and final output', 'unknown');
    return { value: context.validate(finalText), usage, threadId };
  } catch (error) {
    error.usage = usage;
    if (!handle) error.outcome = 'not-started';
    else if (['CANCELLED', 'TIMEOUT', 'STALLED'].includes(error.code)) error.outcome = request.permissions.sandbox === 'workspace-write' || potentialEffects ? 'unknown' : 'cancelled';
    if (handle) await handle.stop();
    throw await classifyQuota(error, potentialEffects, context);
  } finally { try { if (handle) await handle.stop(); } catch (error) { error.usage = usage; throw error; } finally { await rm(temp, { recursive: true, force: true }); } }
}
