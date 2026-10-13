import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const send = message => process.stdout.write(`${JSON.stringify(message)}\n`);
const args = process.argv.slice(2);
let initialized = false;
let acknowledged = false;
let threadParams;
let turnParams;
let prompt;
async function quotaOnce(input) {
  if (input !== 'quota-once') return false;
  let count = 0;
  try { count = JSON.parse(await readFile(process.env.CODEX_FIXTURE_QUOTA_STATE, 'utf8')).attempts; } catch {}
  await writeFile(process.env.CODEX_FIXTURE_QUOTA_STATE, JSON.stringify({ attempts: count + 1 }));
  return count === 0;
}
const finish = text => {
  send({ method: 'item/completed', params: { threadId: 'thread-fixture', turnId: 'turn-fixture', item: { id: 'final', type: 'agentMessage', phase: 'final_answer', text } } });
  if (prompt === 'phase-order') send({ method: 'item/completed', params: { threadId: 'thread-fixture', turnId: 'turn-fixture', item: { id: 'comment', type: 'agentMessage', phase: 'commentary', text: 'status commentary' } } });
  send({ method: 'turn/completed', params: { threadId: 'thread-fixture', turn: { id: 'turn-fixture', status: 'completed', items: [] } } });
};

if (args.includes('exec')) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  send({ type: 'thread.started', thread_id: 'exec-thread' });
  const once = await quotaOnce(input);
  if (input !== 'quota' && !once) send({ type: 'item.started', item: { id: 'tool', type: 'command_execution', command: 'echo fixture', status: 'in_progress' } });
  if (input === 'quota' || input === 'quota-after-tool' || once) {
    send({ type: 'turn.failed', error: { message: 'Account quota reached', codexErrorInfo: 'rateLimitExceeded' } });
  } else if (input === 'exec-stall') {
    setInterval(() => {}, 1000);
  } else {
    if (input.startsWith('tool-')) await new Promise(resolve => setTimeout(resolve, input === 'tool-hard-timeout' ? 1500 : 450));
    send({ type: 'item.completed', item: { id: 'tool', type: 'command_execution', command: 'echo fixture', status: 'completed' } });
    send({ type: 'item.completed', item: { id: 'final', type: 'agent_message', text: input.includes('invalid') ? '{bad' : JSON.stringify({ ok: true, args, prompt: input }) } });
    send({ type: 'turn.completed', ...(input === 'missing-usage' ? {} : { usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: input === 'bad-usage' ? 'unknown' : 7, reasoning_output_tokens: 1 } }) });
  }
} else {
  for await (const line of readline.createInterface({ input: process.stdin })) {
    const message = JSON.parse(line);
    if (message.method === 'initialize') {
      if (process.env.CODEX_FIXTURE_MODE === 'hang-initialize') continue;
      initialized = true;
      send({ id: message.id, result: { userAgent: 'fixture' } });
    } else if (message.method === 'initialized') {
      acknowledged = true;
    } else if (!initialized || !acknowledged) {
      send({ id: message.id, error: { code: -32000, message: 'Not initialized' } });
    } else if (message.method === 'thread/start') {
      threadParams = message.params;
      send({ id: message.id, result: { thread: process.env.CODEX_FIXTURE_MODE === 'bad-thread' ? {} : { id: 'thread-fixture' } } });
    } else if (message.method === 'account/rateLimits/read') {
      send({ id: message.id, result: { rateLimits: { primary: { usedPercent: process.env.CODEX_FIXTURE_QUOTA ? 100 : 40, windowDurationMins: 300, resetsAt: process.env.CODEX_FIXTURE_NO_RESET ? null : Number(process.env.CODEX_FIXTURE_RESET || 1791800000) } }, rateLimitResetCredits: { availableCount: 1, credits: [] } } });
    } else if (message.method === 'turn/start') {
      turnParams = message.params;
      prompt = message.params.input[0].text;
      send({ id: message.id, result: { turn: { id: 'turn-fixture', status: 'inProgress', items: [] } } });
      send({ method: 'turn/started', params: { threadId: 'thread-fixture', turn: { id: 'turn-fixture', status: 'inProgress', items: [] } } });
      if (prompt === 'crash') process.exit(9);
      if (prompt === 'malformed') { process.stdout.write('{bad\n'); continue; }
      if (prompt === 'bad-envelope') { send('not an envelope'); continue; }
      if (prompt === 'bad-usage') { send({ method: 'thread/tokenUsage/updated', params: { tokenUsage: { total: { outputTokens: 'unknown' } } } }); continue; }
      if (prompt === 'cancel-tree' || prompt === 'stall') {
        const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
        send({ method: 'fixture/child', params: { childPid: child.pid } });
        continue;
      }
      if (prompt === 'steer') continue;
      if (prompt.startsWith('tool-')) {
        send({ method: 'item/started', params: { threadId: 'thread-fixture', turnId: 'turn-fixture', item: { id: 'tool', type: 'commandExecution', command: 'long running fixture', status: 'inProgress' } } });
        setTimeout(() => {
          send({ method: 'item/completed', params: { threadId: 'thread-fixture', turnId: 'turn-fixture', item: { id: 'tool', type: 'commandExecution', status: 'completed' } } });
          if (prompt !== 'tool-done-stall') finish('{"ok":true}');
        }, prompt === 'tool-hard-timeout' ? 1500 : 450);
        continue;
      }
      if (prompt === 'quota' || prompt === 'quota-after-tool' || await quotaOnce(prompt)) {
        if (prompt === 'quota-after-tool') send({ method: 'item/started', params: { threadId: 'thread-fixture', turnId: 'turn-fixture', item: { id: 'tool', type: 'mcpToolCall', status: 'inProgress' } } });
        send({ method: 'turn/completed', params: { turn: { id: 'turn-fixture', status: 'failed', error: { message: 'Account quota reached', codexErrorInfo: 'usageLimitExceeded' } } } });
        continue;
      }
      if (prompt === 'cancel-native-tool' || prompt === 'cancel-native-subagent') {
        send({ method: 'item/started', params: { threadId: 'thread-fixture', turnId: 'turn-fixture', item: { id: 'tool', type: prompt === 'cancel-native-subagent' ? 'collabAgentToolCall' : 'mcpToolCall', server: 'fixture', tool: 'external_mutation', status: 'inProgress' } } });
        continue;
      }
      if (prompt === 'approval') {
        send({ id: 999, method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-fixture', turnId: 'turn-fixture', itemId: 'tool', command: 'echo fixture', cwd: threadParams.cwd, availableDecisions: ['accept', 'decline', 'cancel'] } });
        continue;
      }
      if (prompt === 'failed' || prompt === 'no-usage-failed' || prompt === 'mutate-failed') {
        if (prompt === 'mutate-failed') { await writeFile(path.join(threadParams.cwd, 'tracked.txt'), 'mutated\n'); await writeFile(path.join(threadParams.cwd, 'new.txt'), 'new file\n'); }
        send({ method: 'turn/completed', params: { turn: { id: 'turn-fixture', status: 'failed', error: { message: 'fixture failure', codexErrorInfo: 'SandboxError' } } } });
        continue;
      }
      send({ method: 'item/started', params: { threadId: 'thread-fixture', turnId: 'turn-fixture', item: { id: 'tool', type: 'commandExecution', command: 'echo fixture', status: 'inProgress' } } });
      send({ method: 'item/commandExecution/outputDelta', params: { threadId: 'thread-fixture', turnId: 'turn-fixture', itemId: 'tool', delta: 'fixture output\n' } });
      for (const outputTokens of prompt === 'usage-regress' ? [7, 3] : [3, 7, 7]) {
        send({ method: 'thread/tokenUsage/updated', params: { threadId: 'thread-fixture', turnId: 'turn-fixture', tokenUsage: { total: { inputTokens: 10, cachedInputTokens: 2, outputTokens, reasoningOutputTokens: 1, totalTokens: 10 + outputTokens }, last: { inputTokens: 10, cachedInputTokens: 2, outputTokens, reasoningOutputTokens: 1, totalTokens: 10 + outputTokens } } } });
      }
      send({ method: 'item/agentMessage/delta', params: { threadId: 'thread-fixture', turnId: 'turn-fixture', itemId: 'final', delta: 'ignored partial' } });
      finish(prompt === 'wrong-schema' ? '{"ok":"wrong"}' : JSON.stringify({ ok: true, threadParams, turnParams, handshake: acknowledged }));
    } else if (message.id === 999 && 'result' in message) {
      finish(JSON.stringify({ ok: true, decision: message.result.decision }));
    } else if (message.method === 'turn/steer') {
      send({ id: message.id, result: { turnId: 'turn-fixture' } });
      finish(JSON.stringify({ ok: true, steered: message.params }));
    } else if (message.method === 'turn/interrupt') {
      send({ id: message.id, result: {} });
      send({ method: 'turn/completed', params: { turn: { id: 'turn-fixture', status: 'interrupted', items: [] } } });
    }
  }
}
