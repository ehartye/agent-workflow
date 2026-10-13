import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppServer, fault, diagnostic } from './client.mjs';
import { probe } from './probe.mjs';
import { createLaunch, assertChatgptLogin } from './launch.mjs';

const { values } = parseArgs({ options: {
  codex: { type: 'string' }, cwd: { type: 'string' }, output: { type: 'string' },
  backend: { type: 'string', default: 'configured' }, help: { type: 'boolean' },
} });
if (values.help) {
  console.log('node foundation/check.mjs --codex <absolute native Codex executable> --cwd <project> [--backend configured|mxc] [--output <report.json>]');
  process.exit(0);
}
const launch = createLaunch({ executable: values.codex, cwd: values.cwd, backend: values.backend });
const { cwd, env } = launch;
let report;
try {
  const { stdout } = await promisify(execFile)(values.codex, ['--version'], { env, cwd, windowsHide: true, timeout: 5000, maxBuffer: 4096 });
  if (stdout.trim() !== 'codex-cli 0.162.1') throw fault('VERSION_UNSUPPORTED', 'This prototype requires the reviewed Codex 0.162.1 protocol');
  // Check read-only status before starting with a forced login method, since
  // Codex may clear incompatible credentials when enforcing that setting.
  assertChatgptLogin(await promisify(execFile)(values.codex, ['login', 'status'], { env, cwd, windowsHide: true, timeout: 5000, maxBuffer: 8192 }));
  const client = await AppServer.connect(launch);
  report = await probe(client, {
    cwd,
    command: [process.execPath, '-e', 'process.stdout.write("FOUNDATION_OK\\n")'],
    cancelCommand: [process.execPath, '-e', 'process.stdout.write("READY\\n"); setInterval(() => {}, 1000)'],
  });
  report.codexVersion = stdout.trim();
} catch (error) {
  report = { status: 'failed', inferenceRequests: 0, error: diagnostic(error), cleanup: error.cleanup ?? { serverExited: null, descendants: 'notVerified' } };
}
report.requestedBackend = values.backend;
report.platform = process.platform;
report.nodeVersion = process.version;
report.checkedAt = new Date().toISOString();
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (values.output) {
  const output = resolve(values.output);
  const { dirname } = await import('node:path');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, serialized, { flag: 'wx' });
}
process.stdout.write(serialized);
process.exitCode = report.status === 'passed' ? 0 : 1;
