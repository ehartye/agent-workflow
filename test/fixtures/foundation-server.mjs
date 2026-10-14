import { createInterface } from 'node:readline';

const mode = process.argv[2];
const commandResultMode = /^command-result-(buffered|streamed|pty)-(.+)$/.exec(mode);
const commands = new Map();
const turns = new Map();
let approvalRequest;
let interruptCount = 0;
let capabilities;
const terminated=new Set();
const reply = (id, result) => process.stdout.write(`${JSON.stringify({ id, result })}\n`);
const notification = (method, params) => process.stdout.write(`${JSON.stringify({ method, params })}\n`);
createInterface({ input: process.stdin }).on('line', line => {
  const req = JSON.parse(line);
  if (req.id === 'approval') { reply(approvalRequest, { rejected: Boolean(req.error) }); return; }
  if (req.method === 'initialize') {capabilities=req.params.capabilities;return reply(req.id, { userAgent: 'codex/0.162.1' });}
  if(req.method==='capabilities')return reply(req.id,capabilities);
  if(req.method==='thread/backgroundTerminals/list'){
    if(!capabilities.experimentalApi||req.params.threadId!=='thread')throw new Error('Wrong terminal target/capability');
    const id=req.params.cursor?'two':'one';
    if(terminated.size===2)return reply(req.id,{data:mode==='terminals-remain'?[{processId:'one'}]:[],nextCursor:null});
    return reply(req.id,{data:mode==='terminals-bad'?[{processId:42}]:[{processId:id}],nextCursor:id==='one'?'next':null});
  }
  if(req.method==='thread/backgroundTerminals/terminate'){
    if(req.params.threadId!=='thread'||!['one','two'].includes(req.params.processId))throw new Error('Incorrect terminal handle');
    terminated.add(req.params.processId);return reply(req.id,{terminated:true});
  }
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
    if (req.params.approvalPolicy !== 'never' || req.params.sandboxPolicy.type !== (mode==='turn-writer-policy'?'workspaceWrite':'readOnly') || req.params.sandboxPolicy.networkAccess !== false) throw new Error('Turn broadened permissions');
    if (mode === 'turn-delayed-start' || mode === 'turn-late-start') {
      notification('turn/started', {threadId,turn:{id:turnId,status:'inProgress',items:[]}});
      return setTimeout(()=>reply(req.id,{turn:{id:turnId}}),mode==='turn-late-start'?300:50);
    }
    if (mode === 'turn-exit') { reply(req.id, { turn: { id: turnId } }); return setTimeout(() => process.exit(8), 20); }
    if(['turn-phase-snapshot','turn-phase-explicit','turn-phase-invalid'].includes(mode)){
      const progress={id:'progress',type:'agentMessage',text:'PRIVATE_PROGRESS',...(mode==='turn-phase-snapshot'?{phase:'commentary'}:{})};
      const answer={id:'answer',type:'agentMessage',phase:'final_answer',text:mode==='turn-phase-invalid'?'Do not salvage {"count":2}':'{"count":2}'};
      notification('item/completed',{threadId,turnId,item:progress});
      notification('item/completed',{threadId,turnId,item:answer});
      notification('turn/completed',{threadId,turn:{id:turnId,status:'completed',items:mode==='turn-phase-snapshot'?[progress,answer].map(({phase,...item})=>item):[]}});
      return reply(req.id,{turn:{id:turnId}});
    }
    if(mode==='turn-verbose'||mode==='turn-answer-limit'){
      reply(req.id,{turn:{id:turnId}});
      return setTimeout(()=>{
        if(mode==='turn-verbose'){
          for(let n=0;n<80;n++)notification('item/commandExecution/outputDelta',{threadId,turnId,itemId:'read',delta:'x'.repeat(16384)});
          const item={id:'read',type:'commandExecution',command:'read large metadata',status:'failed',exitCode:7,aggregatedOutput:'x'.repeat(600000)};
          notification('item/completed',{threadId,turnId,item});
          notification('item/completed',{threadId,turnId,item:{id:'answer',type:'agentMessage',text:'Known command failure reported.'}});
          notification('turn/completed',{threadId,turn:{id:turnId,status:'completed',items:[item]}});
        }else{
          notification('item/completed',{threadId,turnId,item:{id:'answer',type:'agentMessage',text:'x'.repeat(600000)}});
          notification('turn/completed',{threadId,turn:{id:turnId,status:'completed',items:[]}});
        }
      },20);
    }
    if (mode.startsWith('turn-hang')||mode==='turn-steer') {
      reply(req.id, { turn: { id: turnId } });
      notification('turn/started', {threadId,turn:{id:turnId,status:'inProgress',items:[]}});
      if(mode==='turn-hang-after-command')notification('item/completed',{threadId,turnId,item:{id:'read-before-stall',type:'commandExecution',status:'completed',exitCode:0,command:'PRIVATE_COMMAND',cwd:'PRIVATE_CWD',aggregatedOutput:'PRIVATE_OUTPUT'}});
      return;
    }
    if(mode==='turn-activity'){
      notification('item/started',{threadId,turnId:'unrelated',item:{id:'wrong',type:'commandExecution',command:'WRONG'}});
      notification('item/started',{threadId,turnId,item:{id:'command',type:'commandExecution',command:'fixture read',status:'inProgress'}});
      notification('item/commandExecution/outputDelta',{threadId,turnId,itemId:'command',delta:threadId+' output'});
      notification('item/reasoning/textDelta',{threadId,turnId,itemId:'reasoning',delta:'RAW_REASONING'});
      notification('item/completed',{threadId,turnId,item:{id:'reasoning',type:'reasoning',content:['RAW_REASONING']}});
      notification('thread/tokenUsage/updated',{threadId,turnId,tokenUsage:{total:{inputTokens:10,cachedInputTokens:0,outputTokens:2,reasoningOutputTokens:1,totalTokens:12},last:{inputTokens:10,cachedInputTokens:0,outputTokens:2,reasoningOutputTokens:1,totalTokens:12}}});
    }
    notification('item/completed', { threadId, turnId: 'unrelated', item: { type: 'agentMessage', id: 'wrong', text: 'WRONG' } });
    const answer=mode==='turn-writer-policy'?JSON.stringify({cwd:req.params.cwd,runtimeWorkspaceRoots:req.params.runtimeWorkspaceRoots,approvalPolicy:req.params.approvalPolicy,sandboxPolicy:req.params.sandboxPolicy}):mode==='turn-settings'?JSON.stringify({model:req.params.model,effort:req.params.effort,outputSchema:req.params.outputSchema}):threadId;
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
  if(req.method==='turn/steer'){
    if(req.params.expectedTurnId!==turns.get(req.params.threadId)||req.params.input[0].text!=='Return STEERED')throw new Error('Incorrect steering target/input');
    reply(req.id,{turnId:req.params.expectedTurnId});
    notification('turn/completed',{threadId:req.params.threadId,turn:{id:req.params.expectedTurnId,status:'completed',items:[{id:'steered',type:'agentMessage',text:'STEERED'}]}});return;
  }
  if (req.method === 'command/exec') {
    if (req.params.sandboxPolicy?.type !== 'readOnly' || req.params.sandboxPolicy.networkAccess !== false) throw new Error('Probe broadened permissions');
    if (mode === 'command-failure') return process.stdout.write(`${JSON.stringify({ id: req.id, error: { code: -32000, message: 'runner pipe-in timeout REVIEW_SECRET_SENTINEL private@example.invalid' } })}\n`);
    if (req.params.processId?.startsWith('cancel-')) {
      commands.set(req.params.processId, req.id);
      notification('command/exec/outputDelta', { processId: req.params.processId, stream: 'stdout', deltaBase64: Buffer.from('READY\n').toString('base64'), capReached: false });
      return;
    }
    const kind = req.params.tty ? 'pty' : req.params.streamStdoutStderr ? 'streamed' : 'buffered';
    if (commandResultMode?.[1] === kind) {
      if (req.params.outputBytesCap !== 8192) throw new Error('Probe changed its command output cap');
      const scenarios = {
        nonzero: { exitCode: 7 },
        'windows-status': { exitCode: -1073741502, stdout: '' },
        'incorrect-marker': { stdout: 'FOUNDATION_WRONG\n' },
        'missing-marker': { stdout: '' },
        'fractional-exit': { exitCode: 0.5 },
        'unsafe-exit': { exitCode: Number.MAX_SAFE_INTEGER + 1 },
        'null-exit': { exitCode: null },
        'boolean-exit': { exitCode: false },
        'string-exit': { exitCode: '0' },
        'secret-exit': { exitCode: { secret: 'REVIEW_EXIT_SENTINEL private@example.invalid' } },
        'missing-exit': { result: { stdout: 'FOUNDATION_OK\n', stderr: 'REVIEW_SECRET_SENTINEL' } },
        'null-result': { result: null, stdout: '' },
        'unknown-result': { result: 'REVIEW_RESULT_SENTINEL', stdout: '' },
        'array-result': { result: [0, 'REVIEW_RESULT_SENTINEL'], stdout: '' },
        'secret-outputs': { stdout: 'FOUNDATION_OK\nREVIEW_SECRET_SENTINEL private@example.invalid', stderr: 'REVIEW_STDERR_SENTINEL' },
        'malformed-stdout': { stdout: { secret: 'REVIEW_STDOUT_SENTINEL' } },
        'stdout-cap': { capStream: 'stdout' },
        'stderr-cap': { capStream: 'stderr' },
        'local-cap': { stdout: `FOUNDATION_OK\n${' '.repeat(8192)}` },
        'local-byte-cap': { stdout: `FOUNDATION_OK\n${'\u3000'.repeat(3000)}` },
        'omitted-cap': { exitCode: 7, omitCap: true },
        'malformed-cap': { capStream: 'stdout', capReached: 'REVIEW_CAP_SENTINEL' },
      };
      const sample = scenarios[commandResultMode[2]];
      if (!sample) throw new Error('Unknown synthetic command result scenario');
      const stdout = sample.stdout ?? 'FOUNDATION_OK\n';
      const stderr = sample.stderr ?? 'REVIEW_STDERR_SENTINEL private@example.invalid';
      if (kind !== 'buffered') {
        const output = kind === 'pty' ? `\u001b[?25l${stdout}\u001b]0;REVIEW_PTY_TITLE_SENTINEL\u0007\u001b[?25h` : stdout;
        for (const [stream, text] of [['stdout', output], ['stderr', stderr]]) {
          notification('command/exec/outputDelta', {
            processId: req.params.processId, stream, deltaBase64: Buffer.from(text).toString('base64'),
            ...(sample.omitCap ? {} : { capReached: sample.capStream === stream ? sample.capReached ?? true : false }),
          });
        }
      }
      return reply(req.id, Object.hasOwn(sample, 'result') ? sample.result : {
        exitCode: Object.hasOwn(sample, 'exitCode') ? sample.exitCode : 0, stdout: kind === 'buffered' ? stdout : '', stderr,
        account: 'private@example.invalid', command: ['REVIEW_ARGV_SENTINEL'], cwd: 'REVIEW_CWD_SENTINEL',
        sandboxPolicy: { type: 'dangerFullAccess', networkAccess: true },
        error: 'REVIEW_RESULT_SENTINEL', noProcessStarted: true,
      });
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
