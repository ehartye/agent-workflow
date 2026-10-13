import { parseArgs } from 'node:util';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createManagedBackend } from './backend.mjs';
import { runWorkflow } from './controller.mjs';
import { diagnostic } from '../foundation/client.mjs';

const { values } = parseArgs({ options: { codex: { type: 'string' }, backend: { type: 'string', default: 'configured' }, output: { type: 'string' } } });
const base = await mkdtemp(join(tmpdir(), 'agent-workflow-engine-check-'));
const cwd = join(base, 'project');
const runDir = join(base, 'run');
await mkdir(cwd);
const markers = [randomUUID(), randomUUID()];
await Promise.all(markers.map((marker, index) => writeFile(join(cwd, `${index}.txt`), `${marker}\n`, { flag: 'wx' })));
const script = `export const meta={name:'local-read-proof',description:'Two read-only file workers and replay'};
await phase('Read');
return await parallel(args.map(file => () => agent('Run one PowerShell command with login:false to read only the first line of ' + file + '. Return exactly that line. Do not retry a failed command or change any files.')));`;
await writeFile(join(base, 'workflow.js'), script, { flag: 'wx' });
const report = { status: 'running', backend: values.backend, dispatches: [0, 0], checks: [] };
try {
  for (const pass of [0, 1]) {
    const native = await createManagedBackend({ executable: values.codex, cwd, backend: values.backend });
    const backend = { ...native, execute: request => { report.dispatches[pass]++; return native.execute(request); } };
    const run = await runWorkflow({ runDir, sessionId: 'local-proof', script, args: ['0.txt','1.txt'], backend, resume: pass === 1 });
    const matched = JSON.stringify(run.result) === JSON.stringify(markers);
    const commandsVerified = pass === 1 || run.workers.every(worker => worker.evidence?.commands.length === 1 && worker.evidence.commands[0].status === 'completed' && worker.evidence.commands[0].exitCode === 0);
    report.checks.push({ status: run.status, generation: run.generation, coverage: run.coverage, markersMatched: matched, commandsVerified, cleanup: run.cleanup });
    if (run.status !== 'completed' || !matched || !commandsVerified || !run.coverage.complete) break;
  }
  report.status = report.checks.length === 2 && report.checks.every(check => check.status === 'completed' && check.markersMatched && check.commandsVerified && check.coverage.complete) && report.dispatches[0] === 2 && report.dispatches[1] === 0 && report.checks[1].coverage.cached === 2 ? 'passed' : 'failed';
} catch (error) { report.status = 'failed'; report.error = diagnostic(error); if (error.admission) report.admission = error.admission; }
report.checkedAt = new Date().toISOString();
const output = `${JSON.stringify(report, null, 2)}\n`;
if (values.output) { await mkdir(dirname(resolve(values.output)), { recursive: true }); await writeFile(resolve(values.output), output, { flag: 'wx' }); }
process.stdout.write(output);
process.exitCode = report.status === 'passed' ? 0 : 1;
