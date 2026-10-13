import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppServer, fault } from '../foundation/client.mjs';
import { createLaunch, assertChatgptLogin } from '../foundation/launch.mjs';
import { assertManagedChatgpt, probe } from '../foundation/probe.mjs';
import { runTurn } from '../foundation/turn.mjs';
import { restrictLaunch, assertRestricted, assertDisabledInventory, fingerprint } from './policy.mjs';

export async function createManagedBackend({ executable, cwd, backend = 'configured' }) {
  let launch = restrictLaunch(createLaunch({ executable, cwd, backend }));
  const exec = promisify(execFile);
  const options = { cwd: launch.cwd, env: launch.env, windowsHide: true, timeout: 5000, maxBuffer: 8192 };
  const version = (await exec(executable, ['--version'], options)).stdout.trim();
  if (version !== 'codex-cli 0.162.1') throw fault('VERSION_UNSUPPORTED', 'Workflow engine requires the reviewed Codex 0.162.1 protocol');
  assertChatgptLogin(await exec(executable, ['login','status'], options));
  // Configuration discovery starts no threads and dispatches no model turns.
  const discovery = await AppServer.connect(launch);
  try {
    const config = await discovery.request('config/read', { cwd: launch.cwd, includeLayers: true });
    launch = restrictLaunch(launch, config.config);
  } finally { await discovery.close(); }
  const admissionClient = await AppServer.connect(launch);
  try { assertRestricted((await admissionClient.request('config/read', {cwd:launch.cwd})).config); }
  catch(error) { await admissionClient.close(); throw error; }
  const admission = await probe(admissionClient, {
    cwd: launch.cwd,
    command: [process.execPath, '-e', 'process.stdout.write("FOUNDATION_OK\\n")'],
    cancelCommand: [process.execPath, '-e', 'process.stdout.write("READY\\n");setInterval(() => {},1000)'],
  });
  if (admission.status !== 'passed') throw Object.assign(fault('ADMISSION_FAILED', 'Command-only worker admission failed; no inference dispatched'), {admission});
  const client = await AppServer.connect({ ...launch, env: { ...launch.env, AGENT_WORKFLOW_WORKER: '1' } });
  try {
    const account = await client.request('account/read', { refreshToken: false });
    const config = await client.request('config/read', { cwd: launch.cwd, includeLayers: true });
    assertManagedChatgpt(account, config);
    assertRestricted(config.config);
    const identity = fingerprint({ version, cwd: launch.cwd, backend, account, config: config.config, layers: config.layers.filter(layer => !layer.disabledReason).map(layer => layer.config) });
    return {
      identity, admission,
      async execute({ prompt, options = {}, signal }) {
        if (signal?.aborted) throw Object.assign(fault('RUN_STOPPED', 'Workflow admission is closed'), { notStarted: true });
        let started = false;
        try {
          const thread = await client.request('thread/start', {
            cwd: launch.cwd, ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only', modelProvider: 'openai',
            developerInstructions: 'You are a read-only workflow worker. Complete only your assigned task. Do not launch another agent-workflow runtime. Do not delegate. Stop and report a command startup failure without retrying it. The workflow coordinator owns orchestration.',
          });
          if (thread.modelProvider !== 'openai' || thread.approvalPolicy !== 'never' || thread.sandbox?.type !== 'readOnly' || thread.sandbox.networkAccess !== false || typeof thread.thread?.id !== 'string') throw fault('THREAD_POLICY', 'Worker thread did not confirm the required provider and permissions');
          const tools = await client.request('mcpServerStatus/list', {threadId:thread.thread.id,detail:'toolsAndAuthOnly',limit:100});
          assertDisabledInventory(tools);
          if (signal?.aborted) throw fault('RUN_STOPPED', 'Workflow admission is closed');
          started = true;
          const result = await runTurn(client, { threadId: thread.thread.id, prompt, timeoutMs: options.timeoutMs ?? 120000 });
          return { value: result.text, terminalObserved: true, evidence: {
            commands: result.items.filter(item => item.type === 'commandExecution').map(item => ({
              status: ['completed','failed','declined','inProgress'].includes(item.status) ? item.status : 'unknown',
              exitCode: Number.isInteger(item.exitCode) ? item.exitCode : null,
            })),
          } };
        } catch (error) { if (!started) error.notStarted = true; throw error; }
      },
      close: () => client.close(),
    };
  } catch (error) { await client.close(); throw error; }
}
