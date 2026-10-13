import { codexExecutable, recoverOrphan } from './process.mjs';
import { executeAppServer, openAppServer } from './app-server.mjs';
import { executeExec } from './exec.mjs';
import { resultValidator, workerError, effectiveRequest, WAIT_ITEM_TYPES } from './shared.mjs';
import { createIsolatedWorkspace, collectArtifacts } from './worktrees.mjs';
import { loadProfileConfig, readProjectProfiles } from './profiles.mjs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const codexVersion = require('@openai/codex/package.json').version;
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;

export function createCodexBackend({ transport = 'app-server', executable, config = {} } = {}) {
  const active = new Map();
  const readLimits = async signal => {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timeout = setTimeout(() => controller.abort(workerError('TIMEOUT', 'Rate-limit read timed out')), config.connectTimeoutMs ?? 10000);
    let connection;
    try {
      connection = await openAppServer({ executable: executable || codexExecutable(), args: config.executableArgs || [], cwd: config.cwd, env: config.env, emit: () => {}, signal: controller.signal, connectTimeoutMs: config.connectTimeoutMs });
      return await connection.rpc('account/rateLimits/read');
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); if (connection) await connection.processHandle.stop(); }
  };
  return {
    async execute(input, { onEvent = () => {}, onApproval, signal } = {}) {
      if (active.has(input.id)) throw workerError('DUPLICATE_WORKER', 'Worker identity is already active', 'not-started');
      const validate = resultValidator(input.schema);
      const request = effectiveRequest(input, await loadProfileConfig(input, config));
      if (active.has(input.id)) throw workerError('DUPLICATE_WORKER', 'Worker identity is already active', 'not-started');
      if (transport === 'app-server' && config.ignoreUserConfig) throw workerError('UNSUPPORTED_CONFIG', 'Pinned app-server does not support ignoreUserConfig; choose explicit exec transport', 'not-started');
      const controller = new AbortController();
      const state = { controller };
      const abort = () => controller.abort(workerError('CANCELLED', 'Worker cancelled', 'cancelled'));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      const timeout = setTimeout(() => controller.abort(workerError('TIMEOUT', 'Worker time limit reached', 'cancelled')), request.timeoutMs ?? config.timeoutMs ?? 600000);
      let stall;
      const waits = new Set();
      const resetStall = () => {
        clearTimeout(stall);
        if (!state.settled && waits.size === 0 && (request.stallMs || config.stallMs)) stall = setTimeout(() => controller.abort(workerError('STALLED', 'Worker produced no protocol progress within stall limit', 'cancelled')), request.stallMs ?? config.stallMs);
      };
      const setWaiting = (key, waiting) => { if (waiting) waits.add(key); else waits.delete(key); resetStall(); };
      active.set(request.id, state);
      const emit = event => {
        if (state.settled) return;
        const item = event.item ?? event.params?.item;
        if (item?.id && WAIT_ITEM_TYPES.has(item.type)) {
          if (['item/started', 'item.started'].includes(event.type)) waits.add(`tool:${item.id}`);
          else if (['item/completed', 'item.completed'].includes(event.type)) waits.delete(`tool:${item.id}`);
        }
        resetStall(); return onEvent({ workerId: request.id, runId: request.runId, ...event });
      };
      let workspace;
      try {
        if (!['app-server', 'exec'].includes(transport)) throw workerError('UNSUPPORTED_TRANSPORT', 'Unsupported worker transport', 'not-started');
        if (controller.signal.aborted) throw controller.signal.reason;
        workspace = await createIsolatedWorkspace(request);
        request.cwd = workspace.cwd;
        const result = await (transport === 'app-server' ? executeAppServer : executeExec)(request, {
          executable: executable || codexExecutable(), args: config.executableArgs || [], cwd: request.cwd, env: config.env, emit, validate,
          signal: controller.signal, onApproval, ignoreUserConfig: config.ignoreUserConfig, connectTimeoutMs: config.connectTimeoutMs,
          setWaiting, readRateLimits: () => readLimits(controller.signal),
          setConnection: connection => { state.connection = connection; }, setIds: ids => Object.assign(state, ids),
        });
        if (workspace.isolated) result.artifacts = await collectArtifacts(workspace);
        return result;
      } catch (error) {
        if (workspace?.isolated) {
          try { error.artifacts = await collectArtifacts(workspace); }
          catch (artifactError) { error.artifacts = { worktreePath: workspace.cwd, collectionError: artifactError.message }; }
        }
        throw error;
      } finally { state.settled = true; clearTimeout(timeout); clearTimeout(stall); signal?.removeEventListener('abort', abort); active.delete(request.id); }
    },
    async steer(workerId, text) {
      const state = active.get(workerId);
      if (!state?.turnId || !state.connection.rpc) throw workerError('NOT_ACTIVE', 'No active worker turn');
      if (typeof text !== 'string' || !text.trim()) throw workerError('INVALID_STEER', 'Steering text is required');
      return state.connection.rpc('turn/steer', { threadId: state.threadId, expectedTurnId: state.turnId, input: [{ type: 'text', text }] });
    },
    readRateLimits: () => readLimits(),
    recoverOrphan,
    async executionFingerprint({ cwd, permissions }) {
      const projectProfiles = await readProjectProfiles(cwd);
      return createHash('sha256').update(JSON.stringify(stable({ codexVersion, transport, projectProfiles, configuredProfiles: config.agentProfiles ?? {}, ceiling: config.permissions ?? null, permissions, ignoreUserConfig: config.ignoreUserConfig ?? false }))).digest('hex');
    },
    async shutdown() { const states = [...active.values()]; for (const state of states) state.controller.abort(workerError('CANCELLED', 'Backend shutting down', 'cancelled')); await Promise.all(states.map(state => state.connection?.processHandle.stop())); },
  };
}
