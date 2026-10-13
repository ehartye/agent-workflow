import { parseArgs, promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppServer, fault, diagnostic, remoteDiagnostic } from './client.mjs';
import { createLaunch, assertChatgptLogin } from './launch.mjs';
import { probe, assertManagedChatgpt } from './probe.mjs';
import { runTurn } from './turn.mjs';

const { values } = parseArgs({ options: { codex: { type: 'string' }, backend: { type: 'string', default: 'configured' }, output: { type: 'string' } } });
const cwd = await mkdtemp(join(tmpdir(), 'agent-workflow-model-check-'));
const launch = createLaunch({ executable: values.codex, cwd, backend: values.backend });
let client;
const report = { status: 'running', inferenceRequests: 0, requestedBackend: values.backend, workers: [] };
try {
  const execute = promisify(execFile);
  const opts = { env: launch.env, cwd, windowsHide: true, timeout: 5000, maxBuffer: 8192 };
  const version = await execute(values.codex, ['--version'], opts);
  if (version.stdout.trim() !== 'codex-cli 0.162.1') throw fault('VERSION_UNSUPPORTED', 'This prototype requires Codex 0.162.1');
  assertChatgptLogin(await execute(values.codex, ['login', 'status'], opts));
  report.codexVersion = version.stdout.trim();
  report.admission = await probe(await AppServer.connect(launch), {
    cwd, command: [process.execPath, '-e', 'process.stdout.write("FOUNDATION_OK\\n")'],
    cancelCommand: [process.execPath, '-e', 'process.stdout.write("READY\\n");setInterval(() => {},1000)'],
  });
  if (report.admission.status !== 'passed') throw fault('ADMISSION_FAILED', 'Command-only admission did not pass; no inference dispatched');
  client = await AppServer.connect(launch);
  report.authentication = assertManagedChatgpt(await client.request('account/read', { refreshToken: false }), await client.request('config/read', { cwd, includeLayers: true }));
  const fixtures = await Promise.all([0, 1].map(async index => {
    const directory = join(cwd, `worker-${index}`);
    await mkdir(directory);
    const marker = `WORKER_${index}_${randomUUID()}`;
    await writeFile(join(directory, 'README.md'), `${marker}\n`, { flag: 'wx' });
    const thread = await client.request('thread/start', {
      cwd: directory, ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only', modelProvider: 'openai',
      developerInstructions: 'This is a bounded read-only worker execution check. Perform only the requested local file read and final answer. Do not delegate or contact external services. On any command failure, stop immediately and report failure without retrying.',
    });
    if (thread.modelProvider !== 'openai' || thread.approvalPolicy !== 'never' || thread.sandbox?.type !== 'readOnly' || thread.sandbox.networkAccess !== false || typeof thread.thread?.id !== 'string') {
      throw fault('THREAD_POLICY', 'Thread did not confirm the required provider and read-only policy');
    }
    return { index, marker, threadId: thread.thread.id };
  }));
  const outcomes = await Promise.allSettled(fixtures.map(async fixture => {
    report.inferenceRequests++;
    const startedAt = Date.now();
    const result = await runTurn(client, { threadId: fixture.threadId,
      prompt: 'Use one local shell command to read only the first line of README.md in your working directory. On Windows use PowerShell with login:false. Return exactly that first line as your final answer. Do not retry a failed command. Do not change files.' });
    const commands = result.items.filter(item => item.type === 'commandExecution');
    const evidence = {
      index: fixture.index, status: 'failed', startedAt, completedAt: Date.now(),
      terminalStatus: result.status, finalMarkerMatched: result.text.trim() === fixture.marker,
      commandCount: commands.length,
      commands: commands.map(item => ({ status: ['completed', 'failed', 'declined', 'inProgress'].includes(item.status) ? item.status : 'unknown', exitCode: Number.isInteger(item.exitCode) ? item.exitCode : null, markerMatched: item.aggregatedOutput?.includes(fixture.marker) === true,
        ...(item.status !== 'completed' || item.exitCode !== 0 ? { diagnostic: remoteDiagnostic({ message: item.aggregatedOutput }) } : {}),
      })),
    };
    evidence.status = evidence.finalMarkerMatched && commands.length > 0 && evidence.commands.every(item => item.status === 'completed' && item.exitCode === 0) && evidence.commands.some(item => item.markerMatched) ? 'passed' : 'failed';
    return evidence;
  }));
  report.workers = outcomes.map((outcome, index) => outcome.status === 'fulfilled' ? outcome.value : { index, status: 'failed', error: diagnostic(outcome.reason), interruption: outcome.reason.interruption });
  report.overlapped = report.workers.every(worker => Number.isFinite(worker.startedAt) && Number.isFinite(worker.completedAt)) && Math.max(...report.workers.map(worker => worker.startedAt)) < Math.min(...report.workers.map(worker => worker.completedAt));
  report.status = report.overlapped && report.workers.every(worker => worker.status === 'passed') ? 'passed' : 'failed';
} catch (error) {
  report.status = 'failed';
  report.error = diagnostic(error);
} finally {
  if (client) report.cleanup = await client.close();
  if (report.cleanup && !report.cleanup.serverExited) report.status = 'failed';
}
report.checkedAt = new Date().toISOString();
report.nodeVersion = process.version;
report.descendants = 'notVerified';
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (values.output) {
  const output = resolve(values.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, serialized, { flag: 'wx' });
}
process.stdout.write(serialized);
process.exitCode = report.status === 'passed' ? 0 : 1;
