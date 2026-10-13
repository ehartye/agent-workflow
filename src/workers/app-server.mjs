import { launch, readLines, emitProcessIdentity } from './process.mjs';
import { usageOf, workerError, cancellationError, classifyQuota, TOOL_TYPES } from './shared.mjs';

export async function openAppServer({ executable, args = [], cwd, env, emit, signal, setConnection = () => {}, connectTimeoutMs = 10000 }) {
  const processHandle = launch(executable, [...args, 'app-server', '--listen', 'stdio://'], { cwd, env });
  const pending = new Map();
  let nextId = 1;
  let receive = () => {};
  let failed;
  const send = message => processHandle.child.stdin.write(`${JSON.stringify(message)}\n`);
  const fail = error => {
    if (failed) return;
    failed = error;
    for (const { reject } of pending.values()) reject(error);
    pending.clear(); receive({ method: 'transport/failure', error });
  };
  const requestStop = () => { void processHandle.stop().catch(error => receive({ method: 'transport/failure', error })); };
  const abort = () => { fail(cancellationError(signal)); requestStop(); };
  signal?.addEventListener('abort', abort, { once: true });
  processHandle.child.stdin.on('error', fail);
  readLines(processHandle.child.stdout, message => {
    if (!message || typeof message !== 'object' || Array.isArray(message) ||
      (message.method !== undefined ? typeof message.method !== 'string' || (message.params !== undefined && (!message.params || typeof message.params !== 'object' || Array.isArray(message.params))) : message.id === undefined || !('result' in message || 'error' in message))) {
      fail(workerError('PROTOCOL_ERROR', 'Invalid app-server JSON-RPC envelope')); return;
    }
    if (message.id !== undefined && !message.method) {
      const wait = pending.get(message.id);
      if (wait) { pending.delete(message.id); message.error ? wait.reject(workerError('RPC_ERROR', message.error.message, 'failed', { rpcError: message.error })) : wait.resolve(message.result); }
    } else receive(message);
  }, error => fail(workerError('PROTOCOL_ERROR', `Invalid worker protocol: ${error.message}`)));
  processHandle.closed.then(result => { signal?.removeEventListener('abort', abort); fail(workerError('PROCESS_EXIT', result.error?.message || `Worker process exited (${result.code ?? result.signal})`, 'failed', { process: result })); });
  const rpc = (method, params = {}) => {
    if (failed) return Promise.reject(failed);
    const id = nextId++;
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); send({ id, method, params }); });
  };
  const connection = { rpc, send, processHandle, onMessage: handler => { receive = handler; } };
  setConnection(connection);
  const connectTimer = setTimeout(() => { fail(workerError('CONNECT_TIMEOUT', 'App-server initialization timed out', 'not-started')); requestStop(); }, connectTimeoutMs);
  try {
    if (signal?.aborted) abort();
    await emit({ type: 'process', pid: processHandle.child.pid });
    if (processHandle.child.pid) void emitProcessIdentity(processHandle.child.pid, emit);
    await rpc('initialize', { clientInfo: { name: 'agent_workflow', title: 'Agent Workflow', version: '0.1.1' } });
    send({ method: 'initialized', params: {} });
  } catch (error) { error.outcome = 'not-started'; await processHandle.stop(); throw error; }
  finally { clearTimeout(connectTimer); }
  return connection;
}

export async function executeAppServer(request, context) {
  const connection = await openAppServer(context);
  context.setConnection(connection);
  let usage = usageOf();
  let threadId;
  let turnId;
  let finalText;
  let dispatched = false;
  let potentialEffects = false;
  let eventQueue = Promise.resolve();
  let complete;
  let fail;
  const completion = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
  completion.catch(() => {});
  connection.onMessage(message => {
    eventQueue = eventQueue.then(async () => {
      if (message.error) { fail(message.error); return; }
      if (message.method === 'item/started' && TOOL_TYPES.has(message.params?.item?.type)) potentialEffects = true;
      await context.emit({ type: message.method, params: message.params, ...(message.id !== undefined ? { requestId: message.id } : {}), threadId, turnId });
      const params = message.params || {};
      if (message.id !== undefined && message.method) {
        if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(message.method)) {
          void (async () => {
            context.setWaiting(`approval:${message.id}`, true);
            try {
            let decision = 'decline';
            if (request.permissions.approvalPolicy === 'on-request' && context.onApproval) {
              const response = await context.onApproval({ id: String(message.id), workerId: request.id, runId: request.runId, method: message.method, ...params });
              decision = typeof response === 'string' ? response : response?.decision;
              if (!['accept', 'acceptForSession', 'decline', 'cancel'].includes(decision) || (params.availableDecisions && !params.availableDecisions.includes(decision))) throw workerError('INVALID_APPROVAL', 'Approval callback returned an unsupported decision');
            }
            connection.send({ id: message.id, result: { decision } });
            } finally { context.setWaiting(`approval:${message.id}`, false); }
          })().catch(fail);
        } else if (message.method === 'item/permissions/requestApproval') {
          connection.send({ id: message.id, result: { permissions: {}, scope: 'turn' } });
        } else {
          connection.send({ id: message.id, error: { code: -32601, message: 'Unsupported server request' } });
          fail(workerError('UNSUPPORTED_SERVER_REQUEST', `Unsupported server request: ${message.method}`));
        }
      }
      if (message.method === 'thread/tokenUsage/updated') {
        const raw = params.tokenUsage?.total;
        if (!raw || ['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens', 'totalTokens'].some(key => !Number.isSafeInteger(raw[key]) || raw[key] < 0)) throw workerError('PROTOCOL_ERROR', 'Invalid cumulative token usage');
        const current = usageOf(params.tokenUsage.total);
        usage = Object.fromEntries(Object.entries(current).map(([key, value]) => [key, key === 'observed' ? value || usage[key] : Math.max(usage[key], value)]));
        await context.emit({ type: 'usage', usage, usageMode: 'cumulative', threadId, turnId });
      }
      if (message.method === 'item/completed' && params.item?.type === 'agentMessage' && params.item.phase !== 'commentary') finalText = params.item.text;
      if (message.method === 'turn/completed') {
        if (params.turn.status === 'completed') complete();
        else fail(workerError('TURN_FAILED', params.turn.error?.message || `Worker turn ${params.turn.status}`, params.turn.status === 'interrupted' ? 'cancelled' : 'failed', { turnError: params.turn.error }));
      }
    }).catch(fail);
  });
  try {
    const thread = await connection.rpc('thread/start', { cwd: request.cwd, model: request.model, sandbox: request.permissions.sandbox, approvalPolicy: request.permissions.approvalPolicy, approvalsReviewer: 'user', developerInstructions: request.developerInstructions });
    if (typeof thread?.thread?.id !== 'string' || !thread.thread.id) throw workerError('INVALID_RESPONSE', 'App-server thread/start returned no thread identity');
    threadId = thread.thread.id;
    await context.emit({ type: 'thread', threadId });
    dispatched = true;
    const turn = await connection.rpc('turn/start', {
      threadId, input: [{ type: 'text', text: request.prompt }], cwd: request.cwd, model: request.model, effort: request.effort,
      approvalPolicy: request.permissions.approvalPolicy, approvalsReviewer: 'user', outputSchema: request.schema,
      sandboxPolicy: { type: request.permissions.sandbox === 'workspace-write' ? 'workspaceWrite' : 'readOnly', networkAccess: request.permissions.networkAccess },
    });
    if (typeof turn?.turn?.id !== 'string' || !turn.turn.id) throw workerError('PROTOCOL_ERROR', 'App-server turn/start returned no turn identity');
    turnId = turn.turn.id;
    context.setIds({ threadId, turnId });
    await context.emit({ type: 'turn', threadId, turnId });
    await completion;
    await eventQueue;
    if (typeof finalText !== 'string') throw workerError('MISSING_OUTPUT', 'Completed turn has no final agent message');
    return { value: context.validate(finalText), usage, threadId, turnId };
  } catch (error) {
    error.usage = usage;
    if (!dispatched) error.outcome = 'not-started';
    else if (['PROCESS_EXIT', 'PROTOCOL_ERROR'].includes(error.code)) error.outcome = 'unknown';
    else if (['CANCELLED', 'TIMEOUT', 'STALLED'].includes(error.code)) error.outcome = request.permissions.sandbox === 'workspace-write' || potentialEffects ? 'unknown' : 'cancelled';
    await connection.processHandle.stop();
    throw await classifyQuota(error, potentialEffects, context);
  } finally { try { await connection.processHandle.stop(); } catch (error) { error.usage = usage; throw error; } }
}
