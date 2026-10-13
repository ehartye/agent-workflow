import { DatabaseSync } from 'node:sqlite';
import { mkdir, open, readFile, lstat, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, isAbsolute } from 'node:path';
import { evaluate } from './evaluate.mjs';
import { parseScript } from './script.mjs';
import { fault, diagnostic } from '../foundation/client.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function json(value) {
  const text = JSON.stringify(value, (_, item) => {
    if (['undefined','function','symbol','bigint'].includes(typeof item) || typeof item === 'number' && !Number.isFinite(item)) throw fault('RESULT_JSON', 'Workflow values must be JSON');
    return item;
  });
  if (text == null || Buffer.byteLength(text) > 2 * 1024 * 1024) throw fault('RESULT_SIZE', 'Workflow record exceeded its limit');
  return text;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return json(value);
}
async function regular(path, optional = false) {
  try { if (!(await lstat(path)).isFile()) throw fault('RUN_PATH', 'Run artifacts must be regular files'); }
  catch (error) { if (!optional || error.code !== 'ENOENT') throw error; }
}
function identity() {
  const files = ['controller.mjs','script.mjs','evaluate.mjs','evaluator-child.mjs','backend.mjs','policy.mjs','../foundation/client.mjs','../foundation/turn.mjs','../foundation/launch.mjs','../foundation/probe.mjs','../package-lock.json'];
  return hash(process.version + files.map(file => hash(readFileSync(new URL(file, import.meta.url)))).join(''));
}
function snapshot(db) {
  const header = db.prepare("SELECT value FROM header WHERE id=1").get();
  if (!header) return null;
  const state = JSON.parse(header.value);
  const workers = db.prepare('SELECT value FROM workers WHERE generation=? ORDER BY position').all(state.generation).map(row => JSON.parse(row.value));
  const completed = workers.filter(worker => worker.status === 'completed').length;
  return { ...state, workers, coverage: { requested: workers.length, completed,
    cached: workers.filter(worker => worker.cached).length,
    failed: workers.filter(worker => worker.status === 'failed').length,
    unknown: workers.filter(worker => worker.status === 'unknown').length,
    complete: state.status === 'completed' && completed === workers.length,
  } };
}
export async function readRun(runDir) {
  const path = join(runDir, 'run.sqlite');
  await regular(path);
  const db = new DatabaseSync(path, { readOnly: true });
  try { return snapshot(db); } finally { db.close(); }
}

export async function runWorkflow({ runDir, sessionId, script, args = null, backend, resume = false, concurrency = 2, maxAgents = 1000, timeoutMs = 120000 }) {
  let db, lease, state, primary;
  let leaseOwned = false;
  let stopped = false;
  let fatal;
  let active = 0;
  let sequence = 0;
  let chain = '';
  let reuse = true;
  let currentPhase = '';
  const waiters = [];
  const calls = new Set();
  const abort = new AbortController();
  const token = randomUUID();
  const lock = typeof runDir === 'string' ? join(runDir, 'owner.lock') : '';
  let closed;
  const closeBackend = () => closed ??= Promise.resolve().then(() => backend.close());
  const own = () => { if (readFileSync(lock, 'utf8') !== token) throw fault('RUN_OWNERSHIP', 'Run ownership changed'); };
  const saveHeader = () => { own(); db.prepare('INSERT OR REPLACE INTO header(id,value) VALUES(1,?)').run(json(state)); };
  const saveWorker = worker => {
    own();
    state.workerCount = Math.max(state.workerCount, worker.position + 1);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT OR REPLACE INTO workers(generation,position,value) VALUES(?,?,?)').run(state.generation, worker.position, json(worker));
      db.prepare('INSERT OR REPLACE INTO header(id,value) VALUES(1,?)').run(json(state));
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const acquire = async () => {
    if (active >= concurrency) await new Promise(resolve => waiters.push(resolve));
    if (stopped) throw fault('RUN_STOPPED', 'Workflow admission is closed');
    active++;
  };
  const release = () => { active--; waiters.shift()?.(); };
  try {
    const { meta } = parseScript(script);
    if (!isAbsolute(runDir ?? '') || typeof sessionId !== 'string' || !sessionId || sessionId.length > 200 || !backend || typeof backend.execute !== 'function' || typeof backend.close !== 'function' || typeof backend.identity !== 'string' || !backend.identity || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 256 || !Number.isInteger(maxAgents) || maxAgents < 1 || maxAgents > 1000) throw fault('RUN_INPUT', 'Invalid workflow identity, backend or limits');
    json(args);
    await mkdir(runDir, { recursive: true });
    if (!(await lstat(runDir)).isDirectory()) throw fault('RUN_PATH', 'Run directory must not be a symlink');
    try { lease = await open(lock, 'wx'); leaseOwned = true; await lease.writeFile(token); await lease.sync(); }
    catch (error) { if (error.code === 'EEXIST') throw fault('RUN_LOCKED', 'Run already has an owner; stale ownership requires inspection'); throw error; }
    const path = join(runDir, 'run.sqlite');
    await regular(path, true);
    db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS header(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS workers(generation INTEGER NOT NULL,position INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(generation,position)); CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,generation INTEGER NOT NULL,value TEXT NOT NULL);');
    const previous = snapshot(db);
    const runtimeIdentity = identity();
    if (previous && !resume) throw fault('RUN_EXISTS', 'Existing run requires explicit resume');
    if (!previous && resume) throw fault('REPLAY_MISSING', 'No saved run exists to replay');
    if (previous && (previous.version !== 1 || !Number.isInteger(previous.generation) || !Number.isInteger(previous.workerCount) || previous.workerCount !== previous.workers.length || previous.workers.some((worker, index) => worker.position !== index || !['queued','running','completed','failed','unknown'].includes(worker.status) || worker.status === 'completed' && (!Object.hasOwn(worker,'result') || hash(json(worker.result)) !== worker.resultHash)))) throw fault('REPLAY_CORRUPT', 'Saved run or worker evidence is missing or corrupt');
    if (previous?.sessionId && previous.sessionId !== sessionId) throw fault('REPLAY_SESSION', 'Saved results belong to a different session');
    if (previous && (previous.status === 'running' || previous.workers.some(worker => ['running','unknown'].includes(worker.status)))) throw fault('REPLAY_UNKNOWN', 'Unknown execution prevents automatic replay');
    if (previous && previous.runtimeIdentity !== runtimeIdentity) throw fault('REPLAY_RUNTIME', 'Saved results require their original runtime version');
    reuse = !previous || previous.backendIdentity === backend.identity;
    const oldWorkers = previous?.workers ?? [];
    state = { version: 1, sessionId, generation: (previous?.generation ?? 0) + 1, runtimeIdentity, backendIdentity: backend.identity,
      status: 'running', meta, script, args, concurrency, maxAgents, workerCount: 0, attempts: previous?.attempts ?? 0, createdAt: previous?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() };
    saveHeader();
    const dispatch = async ({ prompt, options = {} }) => {
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 65536 || !options || Array.isArray(options) || Object.keys(options).some(key => !['label','phase','timeoutMs'].includes(key)) || ['label','phase'].some(key => options[key] != null && (typeof options[key] !== 'string' || options[key].length > 500)) || options.timeoutMs != null && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 120000)) throw fault('AGENT_INPUT', 'Unsupported agent prompt or options');
      if (sequence >= maxAgents || stopped) throw fault('AGENT_LIMIT', 'Workflow agent limit or admission boundary reached');
      const position = sequence++;
      chain = hash(chain + canonical({ prompt, timeoutMs: options.timeoutMs ?? 120000 }));
      const prior = oldWorkers[position];
      const worker = { position, key: chain, prompt, options, phase: options.phase ?? currentPhase, status: 'queued', cached: false };
      if (reuse && prior?.key === worker.key && prior.status === 'completed') {
        if (!Object.hasOwn(prior, 'result') || hash(json(prior.result)) !== prior.resultHash) throw fault('REPLAY_CORRUPT', 'Saved worker result is missing or corrupt');
        Object.assign(worker, { status: 'completed', cached: true, result: prior.result, resultHash: prior.resultHash });
        saveWorker(worker); return worker.result;
      }
      reuse = false;
      saveWorker(worker);
      let acquired = false;
      let dispatched = false;
      try {
        await acquire(); acquired = true;
        if (state.attempts >= maxAgents) throw Object.assign(fault('AGENT_LIMIT', 'Lifetime agent attempt limit reached'), { notStarted: true });
        state.attempts++; worker.status = 'running'; worker.startedAt = new Date().toISOString();
        saveHeader(); saveWorker(worker);
        dispatched = true;
        const result = await backend.execute({ prompt, options, position, signal: abort.signal });
        if (!result?.terminalObserved) throw fault('AGENT_UNKNOWN', 'Worker terminal state was not observed');
        const value = JSON.parse(json(result.value));
        Object.assign(worker, { status: 'completed', result: value, resultHash: hash(json(value)), completedAt: new Date().toISOString() });
        if (result.evidence) worker.evidence = JSON.parse(json(result.evidence));
        saveWorker(worker); return value;
      } catch (error) {
        worker.status = !dispatched || error.notStarted ? 'failed' : 'unknown';
        worker.error = diagnostic(error);
        saveWorker(worker);
        throw error;
      } finally { if (acquired) release(); }
    };
    const call = (method, params) => {
      if (method === 'agent') {
        const work = dispatch(params).catch(error => {
          if (['AGENT_INPUT','AGENT_LIMIT','REPLAY_CORRUPT','RUN_OWNERSHIP'].includes(error.code)) { fatal ??= error; abort.abort(); }
          throw error;
        });
        calls.add(work); work.then(() => calls.delete(work), () => calls.delete(work));
        return work;
      }
      if (stopped) throw fault('RUN_STOPPED', 'Workflow admission is closed');
      if (method === 'phase') {
        if (typeof params.title !== 'string' || params.title.length > 500) throw fault('PHASE_INPUT', 'Phase title must be bounded text');
        currentPhase = params.title;
      } else if (method !== 'log' || typeof params.message !== 'string' || params.message.length > 4000) throw fault('LOG_INPUT', 'Log message must be bounded text');
      own(); db.prepare('INSERT INTO events(generation,value) VALUES(?,?)').run(state.generation, json({ method, ...params }));
      return null;
    };
    try {
      state.result = await evaluate(script, { args, call, timeoutMs, signal: abort.signal });
      if (fatal) throw fatal;
      state.status = 'completed';
    } catch (error) { primary = fatal ?? error; state.status = 'failed'; state.error = diagnostic(primary); }
    stopped = true; abort.abort();
    for (const resolve of waiters.splice(0)) resolve();
    try { state.cleanup = await closeBackend(); }
    catch (error) { state.cleanup = { serverExited: false, error: diagnostic(error), descendants: 'notVerified' }; }
    await Promise.allSettled([...calls]);
    if (!state.cleanup.serverExited || snapshot(db).workers.some(worker => worker.status === 'unknown')) state.status = 'failed';
    state.updatedAt = new Date().toISOString(); saveHeader();
    return snapshot(db);
  } finally {
    stopped = true; abort.abort();
    for (const resolve of waiters.splice(0)) resolve();
    if (backend?.close) { try { await closeBackend(); } catch { /* Reported above when a run was admitted. */ } }
    await Promise.allSettled([...calls]);
    db?.close();
    await lease?.close();
    if (leaseOwned && await readFile(lock, 'utf8').catch(() => '') === token) await unlink(lock);
  }
}
