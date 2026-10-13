import { createInterface } from 'node:readline';

const mode = process.argv[2];
const commands = new Map();
const turns = new Map();
let approvalRequest;
let interruptCount = 0;
const reply = (id, result) => process.stdout.write(`${JSON.stringify({ id, result })}\n`);
const notification = (method, params) => process.stdout.write(`${JSON.stringify({ method, params })}\n`);
createInterface({ input: process.stdin }).on('line', line => {
  const req = JSON.parse(line);
  if (req.id === 'approval') { reply(approvalRequest, { rejected: Boolean(req.error) }); return; }
  if (req.method === 'initialize') return reply(req.id, { userAgent: 'codex/0.162.1' });
  if (req.method === 'initialized') return;
  if (req.method === 'echo') return setTimeout(() => reply(req.id, req.params.value), req.params.delay);
  if (req.method === 'interrupt-count') return reply(req.id,interruptCount);
  if (req.method === 'fragment') {
    const bytes = Buffer.from(`${JSON.stringify({ method: 'progress', params: { text: 'café 🧪' } })}\n${JSON.stringify({ id: req.id, result: 'done' })}\n`);
    const cut = bytes.indexOf(Buffer.from('🧪')) + 2;
    process.stdout.write(bytes.subarray(0, cut));
    return setTimeout(() => process.stdout.write(bytes.subarray(cut)), 5);
  }
  if (req.method === 'approval') {
    approvalRequest = req.id;
    return process.stdout.write(`${JSON.stringify({ id: 'approval', method: 'item/commandExecution/requestApproval', params: {} })}\n`);
  }
  if (req.method === 'hang') return;
  if (req.method === 'bad') return process.stdout.write('not-json\n');
  if (req.method === 'big') return process.stdout.write('x'.repeat(2048));
  if (req.method === 'exit') return process.exit(7);
  if (req.method === 'account/read') {
    if (mode === 'secret-error') return process.stdout.write(`${JSON.stringify({ id: req.id, error: { code: -32000, message: 'authorization=Bearer REVIEW_SECRET_SENTINEL account=private@example.invalid' } })}\n`);
    return reply(req.id, { account: { type: mode === 'api' ? 'apiKey' : 'chatgpt', email: 'private@example.invalid' }, requiresOpenaiAuth: true });
  }
  if (req.method === 'config/read') return reply(req.id, { config: { model_provider: 'openai', forced_login_method: 'chatgpt', approval_policy: 'never', sandbox_mode: 'read-only' }, layers: [{ config: {}, name: { type: 'sessionFlags' }, version: 'test' }], origins: {} });
  if (req.method === 'windowsSandbox/readiness') return reply(req.id, { status: mode === 'not-ready' ? 'updateRequired' : 'ready' });
  if (req.method === 'turn/start') {
    const threadId = req.params.threadId;
    const turnId = `turn-${threadId}`;
    turns.set(threadId, turnId);
    if (req.params.approvalPolicy !== 'never' || req.params.sandboxPolicy.type !== 'readOnly' || req.params.sandboxPolicy.networkAccess !== false) throw new Error('Turn broadened permissions');
    if (mode === 'turn-delayed-start' || mode === 'turn-late-start') {
      notification('turn/started', {threadId,turn:{id:turnId,status:'inProgress',items:[]}});
      return setTimeout(()=>reply(req.id,{turn:{id:turnId}}),mode==='turn-late-start'?300:50);
    }
    if (mode === 'turn-exit') { reply(req.id, { turn: { id: turnId } }); return setTimeout(() => process.exit(8), 20); }
    if (mode.startsWith('turn-hang')) {
      reply(req.id, { turn: { id: turnId } });
      notification('turn/started', {threadId,turn:{id:turnId,status:'inProgress',items:[]}});
      return;
    }
    notification('item/completed', { threadId, turnId: 'unrelated', item: { type: 'agentMessage', id: 'wrong', text: 'WRONG' } });
    const answer=mode==='turn-settings'?JSON.stringify({model:req.params.model,effort:req.params.effort,outputSchema:req.params.outputSchema}):threadId;
    notification('item/completed', { threadId, turnId, item: { type: 'agentMessage', id: 'answer', text: answer } });
    notification('turn/completed', { threadId, turn: { id: turnId, status: mode === 'turn-failed' ? 'failed' : 'completed', error: mode === 'turn-failed' ? { message: 'runner pipe-in timeout REVIEW_SECRET_SENTINEL private@example.invalid' } : null, items: [] } });
    return setTimeout(() => reply(req.id, { turn: { id: turnId } }), threadId === 'one' ? 20 : 5);
  }
  if (req.method === 'turn/interrupt') {
    interruptCount++;
    reply(req.id, {});
    if (mode !== 'turn-hang-ignore') notification('turn/completed', { threadId: req.params.threadId, turn: { id: turns.get(req.params.threadId), status: mode==='turn-hang-complete'?'completed':'interrupted', items: [] } });
    return;
  }
  if (req.method === 'command/exec') {
    if (req.params.sandboxPolicy?.type !== 'readOnly' || req.params.sandboxPolicy.networkAccess !== false) throw new Error('Probe broadened permissions');
    if (mode === 'command-failure') return process.stdout.write(`${JSON.stringify({ id: req.id, error: { code: -32000, message: 'runner pipe-in timeout' } })}\n`);
    if (req.params.processId?.startsWith('cancel-')) {
      commands.set(req.params.processId, req.id);
      notification('command/exec/outputDelta', { processId: req.params.processId, stream: 'stdout', deltaBase64: Buffer.from('READY\n').toString('base64'), capReached: false });
      return;
    }
    if (req.params.streamStdoutStderr || req.params.tty) {
      const output = req.params.tty ? '\u001b[?25l\u001b[2J\u001b[HFOUNDATION_OK\r\n\u001b]0;C:\\fixture\\codex.exe\u0007\u001b[?25h' : 'FOUNDATION_OK\n';
      notification('command/exec/outputDelta', { processId: req.params.processId, stream: 'stdout', deltaBase64: Buffer.from(output).toString('base64'), capReached: false });
      return reply(req.id, { exitCode: 0, stdout: '', stderr: '' });
    }
    return reply(req.id, { exitCode: 0, stdout: 'FOUNDATION_OK\n', stderr: '' });
  }
  if (req.method === 'command/exec/terminate') {
    if (mode === 'cancel-late-ack') {
      setTimeout(() => reply(req.id, {}), 350);
      return setTimeout(() => reply(commands.get(req.params.processId), { exitCode: 124, stdout: '', stderr: '' }), 400);
    }
    reply(req.id, {});
    if (mode === 'cancel-ignored') return setTimeout(() => reply(commands.get(req.params.processId), { exitCode: 1, stdout: '', stderr: '' }), 350);
    if (mode !== 'cancel-hangs') reply(commands.get(req.params.processId), { exitCode: 1, stdout: '', stderr: '' });
    return;
  }
  throw new Error(`Unexpected method: ${req.method}`);
}).on('close', () => {
  if (mode === 'linger') setInterval(() => {}, 1000);
  else process.exit(0);
});
