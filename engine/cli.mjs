import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { diagnostic } from '../foundation/client.mjs';
import { runWorkflow, readRun } from './controller.mjs';
import { createManagedBackend } from './backend.mjs';

const { values } = parseArgs({ options: {
  codex: { type: 'string' }, cwd: { type: 'string' }, script: { type: 'string' },
  run: { type: 'string' }, session: { type: 'string' }, args: { type: 'string', default: 'null' },
  backend: { type: 'string', default: 'configured' }, resume: { type: 'boolean' }, status: { type: 'boolean' },
  concurrency: { type: 'string', default: '2' }, help: { type: 'boolean' },
} });
if (values.help) {
  console.log('node engine/cli.mjs --codex <native executable> --cwd <project> --script <workflow.js> --run <directory> --session <identity> [--backend mxc] [--args <JSON>] [--resume]\nInspect without workers: node engine/cli.mjs --status --run <directory>');
} else {
  try {
    if (!values.run) throw new Error('Missing run directory');
    let run;
    if (values.status) run = await readRun(resolve(values.run));
    else {
      const script = await readFile(resolve(values.script), 'utf8');
      const args = JSON.parse(values.args);
      const backend = await createManagedBackend({ executable: values.codex, cwd: values.cwd, backend: values.backend });
      run = await runWorkflow({ runDir: resolve(values.run), sessionId: values.session, script, args, backend, resume: values.resume, concurrency: Number(values.concurrency) });
    }
    console.log(JSON.stringify({ status: run.status, generation: run.generation, attempts: run.attempts, coverage: run.coverage, result: run.result, error: run.error, cleanup: run.cleanup }, null, 2));
    process.exitCode = run.status === 'completed' && run.coverage.complete ? 0 : 1;
  } catch (error) {
    console.log(JSON.stringify({ status: 'failed', error: diagnostic(error) }, null, 2));
    process.exitCode = 1;
  }
}
