import { fault, remoteDiagnostic } from './client.mjs';

// One outstanding turn per thread. The caller owns the server and its shutdown.
// A terminal turn acknowledges harness completion, not arbitrary process drain.
const active = new WeakMap();
export async function runTurn(client, { threadId, prompt, timeoutMs = 120000, interruptTimeoutMs = 3000, signal, model, effort, outputSchema }) {
  if (typeof threadId !== 'string' || !threadId || typeof prompt !== 'string' || !prompt ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(interruptTimeoutMs) || interruptTimeoutMs <= 0) {
    throw fault('TURN_INPUT', 'A thread, prompt and positive deadlines are required');
  }
  if (signal?.aborted) throw Object.assign(fault('TURN_CANCELLED', 'Codex turn was cancelled before dispatch'), {notStarted:true});
  if (!active.has(client)) active.set(client, new Set());
  const busy = active.get(client);
  if (busy.has(threadId)) throw fault('THREAD_BUSY', 'Only one turn per thread may run at once');
  busy.add(threadId);
  let turnId;
  let terminal;
  let resolveTerminal;
  let rejectFailure;
  let timer;
  let start;
  let retired = false;
  let bytes = 0;
  const early = [];
  const items = new Map();
  const done = new Promise(resolve => { resolveTerminal = resolve; });
  const failure = new Promise((_, reject) => { rejectFailure = reject; });
  const cancel = () => rejectFailure(fault('TURN_CANCELLED', 'Codex turn was cancelled'));
  signal?.addEventListener('abort',cancel,{once:true});
  // Subscribe before dispatch: notifications can precede the turn/start reply.
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(fault('TURN_TIMEOUT', 'Codex turn exceeded its deadline')), timeoutMs);
  });
  const stopFailure = client.onFailure(rejectFailure);
  const consume = message => {
    const params = message.params;
    if (message.method === 'item/completed' && params.turnId === turnId && !terminal) {
      if (params.item && typeof params.item.id === 'string') items.set(params.item.id, params.item);
    }
    if (message.method === 'turn/completed' && params.turn?.id === turnId && !terminal) {
      terminal = params.turn;
      for (const item of terminal.items ?? []) if (typeof item.id === 'string') items.set(item.id, item);
      resolveTerminal(terminal);
    }
  };
  const stopNotifications = client.onNotification(message => {
    if (message.params?.threadId !== threadId || !['item/completed', 'turn/completed'].includes(message.method)) return;
    bytes += Buffer.byteLength(JSON.stringify(message));
    if (bytes > 1024 * 1024) { rejectFailure(fault('TURN_OUTPUT_LIMIT', 'Turn evidence exceeded its bounded output limit')); return; }
    if (turnId) consume(message);
    else early.push(message);
  });
  try {
    start = client.request('turn/start', {
      threadId, input: [{ type: 'text', text: prompt }], approvalPolicy: 'never',
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
      ...(model===undefined?{}:{model}),...(effort===undefined?{}:{effort}),...(outputSchema===undefined?{}:{outputSchema}),
    }).then(started => {
      if (retired) return;
      if (typeof started?.turn?.id !== 'string' || !started.turn.id) throw fault('TURN_PROTOCOL', 'Codex did not return a turn identifier');
      turnId = started.turn.id;
      for (const message of early) consume(message);
      early.length = 0;
    });
    await Promise.race([start, failure, deadline]);
    await Promise.race([done, failure, deadline]);
    if (terminal.status !== 'completed') throw fault('TURN_FAILED', `Codex turn did not complete successfully: ${remoteDiagnostic(terminal.error)}`);
    const completedItems = [...items.values()];
    const messages = completedItems.filter(item => item.type === 'agentMessage' && (item.phase == null || item.phase === 'final_answer'));
    return { threadId, turnId, status: terminal.status, text: messages.map(item => item.text).join('\n'), items: completedItems };
  } catch (error) {
    if (!terminal) {
      let interruptTimer;
      const interruptBy = performance.now() + interruptTimeoutMs;
      try {
        const bounded = new Promise((_, reject) => { interruptTimer = setTimeout(() => reject(fault('INTERRUPT_UNVERIFIED', 'Turn interruption was not observed')), interruptTimeoutMs); });
        await Promise.race([(async () => {
          // Cancellation may beat turn/start's reply. Wait for its confirmed ID
          // inside the same interruption budget; never guess which turn to stop.
          await start;
          if (retired || performance.now() >= interruptBy || !turnId || terminal) return;
          await client.request('turn/interrupt', { threadId, turnId }, { timeoutMs: interruptTimeoutMs + 1000 });
          await done;
        })(), bounded]);
      } catch { /* Preserve the primary failure, with separate interruption evidence. */ }
      finally { clearTimeout(interruptTimer); }
      error.interruption = { terminalObserved: Boolean(terminal), terminalStatus: ['completed','failed','interrupted'].includes(terminal?.status) ? terminal.status : null, descendants: 'notVerified' };
    }
    throw error;
  } finally {
    retired = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort',cancel);
    stopNotifications();
    stopFailure();
    // Unknown turn state must not permit another turn on this thread.
    if (terminal) busy.delete(threadId);
  }
}
