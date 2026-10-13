import { createCodexBackend } from '../../src/workers/codex.mjs';
import { readProcessIdentity, recoverOrphan } from '../../src/workers/process.mjs';
import { fileURLToPath } from 'node:url';

const transport = process.argv[2];
const actualSystemRoot = process.env.SystemRoot;
const fixture = fileURLToPath(new URL('./codex-process.mjs', import.meta.url));
const backend = createCodexBackend({ transport, executable: process.execPath, config: { executableArgs: [fixture], env: { SystemRoot: actualSystemRoot } } });
const controller = new AbortController();
let record;
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`);
try {
  await backend.execute({ id: 'drain-harness-worker', runId: 'drain-harness', prompt: transport === 'exec' ? 'exec-stall' : 'stall', cwd: process.cwd(), timeoutMs: 10000, permissions: { sandbox: 'read-only', networkAccess: false, approvalPolicy: 'never' } }, { signal: controller.signal, onEvent: async event => {
    if (event.type === 'process') {
      record = { pid: event.pid, processIdentity: await readProcessIdentity(event.pid) };
      send({ type: 'owned', record });
      process.env.SystemRoot = 'C:\\agent-workflow-fixture-nonexistent-system-root';
    }
    if (event.type === 'turn' || event.type === 'thread.started') controller.abort();
  } });
  send({ type: 'unexpected-success' });
} catch (error) {
  send({ type: 'caught', code: error.code, outcome: error.outcome, usageObserved: error.usage?.observed });
} finally {
  process.env.SystemRoot = actualSystemRoot;
  if (record) {
    const cleanup=await recoverOrphan(record);
    if(cleanup.drained===true)send({type:'drained',pid:record.pid});
  }
  await backend.shutdown();
}
