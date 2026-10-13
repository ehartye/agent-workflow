import { DatabaseSync } from 'node:sqlite';
import { mkdir, open, readFile, lstat, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, isAbsolute } from 'node:path';
import { evaluate } from './evaluate.mjs';
import { parseScript } from './script.mjs';
import { compileSchema } from './schema.mjs';
import {createActivityTable,recordActivity} from './activity.mjs';
import { fault, diagnostic } from '../foundation/client.mjs';
export {requestControl,readControl} from './controls.mjs';

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
  const files = ['controller.mjs','controls.mjs','activity.mjs','schema.mjs','settings.mjs','worker-session.mjs','script.mjs','evaluate.mjs','evaluator-child.mjs','backend.mjs','policy.mjs','../foundation/client.mjs','../foundation/turn.mjs','../foundation/launch.mjs','../foundation/probe.mjs','../package-lock.json'];
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

export async function runWorkflow({ runDir, sessionId, script, args = null, backend, resume = false, expectedGeneration, concurrency = 2, maxAgents = 1000, timeoutMs = 120000, drainTimeoutMs=20000, onReady, launch=null }) {
  let db, lease, state, primary;
  let leaseOwned = false;
  let stopped = false;
  let fatal;
  let active = 0;
  let sequence = 0;
  let chain = '';
  let reuse = true;
  let currentPhase = '';
  let controlAction;
  let controlTimer;
  let drainTimer,expireDrain;
  let drainBy=Infinity;
  const armDrain=ms=>{drainBy=Math.min(drainBy,performance.now()+ms);clearTimeout(drainTimer);drainTimer=setTimeout(()=>expireDrain(false),Math.max(0,drainBy-performance.now()));};
  let retiredWrites=false;
  const currentWorkers=new Map();
  const workerIds=new Map();
  const settlements=new Map();
  const waiters = [];
  const calls = new Set();
  const abort = new AbortController();
  const evaluatorAbort = new AbortController();
  const token = randomUUID();
  const lock = typeof runDir === 'string' ? join(runDir, 'owner.lock') : '';
  let closed;
  const closeBackend = () => closed ??= Promise.resolve().then(() => backend.close());
  const own = () => { if (readFileSync(lock, 'utf8') !== token) throw fault('RUN_OWNERSHIP', 'Run ownership changed'); };
  const saveHeader = () => { own(); db.prepare('INSERT OR REPLACE INTO header(id,value) VALUES(1,?)').run(json(state)); };
  const saveWorker = (worker,message) => {
    own();
    const next=message?structuredClone(worker):worker;
    state.workerCount = Math.max(state.workerCount, worker.position + 1);
    db.exec('BEGIN IMMEDIATE');
    try {
      if(message)recordActivity(db,{generation:state.generation,worker:next,message});
      db.prepare('INSERT OR REPLACE INTO workers(generation,position,value) VALUES(?,?,?)').run(state.generation, next.position, json(next));
      db.prepare('INSERT OR REPLACE INTO header(id,value) VALUES(1,?)').run(json(state));
      db.exec('COMMIT');
      if(message)Object.assign(worker,next);
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
    if(!Number.isFinite(drainTimeoutMs)||drainTimeoutMs<=0)throw fault('RUN_INPUT','A positive drain deadline is required');
    if (!isAbsolute(runDir ?? '') || typeof sessionId !== 'string' || !sessionId || sessionId.length > 200 || !backend || typeof backend.execute !== 'function' || typeof backend.close !== 'function' || typeof backend.identity !== 'string' || !backend.identity || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 256 || !Number.isInteger(maxAgents) || maxAgents < 1 || maxAgents > 1000) throw fault('RUN_INPUT', 'Invalid workflow identity, backend or limits');
    json(args);
    await mkdir(runDir, { recursive: true });
    if (!(await lstat(runDir)).isDirectory()) throw fault('RUN_PATH', 'Run directory must not be a symlink');
    try { lease = await open(lock, 'wx'); leaseOwned = true; await lease.writeFile(token); await lease.sync(); }
    catch (error) { if (error.code === 'EEXIST') throw fault('RUN_LOCKED', 'Run already has an owner; stale ownership requires inspection'); throw error; }
    const path = join(runDir, 'run.sqlite');
    await regular(path, true);
    db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000; CREATE TABLE IF NOT EXISTS header(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS workers(generation INTEGER NOT NULL,position INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(generation,position)); CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,generation INTEGER NOT NULL,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS controls(id TEXT PRIMARY KEY,generation INTEGER NOT NULL,value TEXT NOT NULL);');
    createActivityTable(db);
    const previous = snapshot(db);
    if(expectedGeneration!==undefined&&previous?.generation!==expectedGeneration)throw fault('REPLAY_GENERATION','Run generation changed; refresh before resuming');
    const runtimeIdentity = identity();
    if (previous && !resume) throw fault('RUN_EXISTS', 'Existing run requires explicit resume');
    if (!previous && resume) throw fault('REPLAY_MISSING', 'No saved run exists to replay');
    if (previous && (previous.version !== 1 || !Number.isInteger(previous.generation) || !Number.isInteger(previous.workerCount) || previous.workerCount !== previous.workers.length || previous.workers.some((worker, index) => worker.position !== index || !['queued','running','completed','failed','unknown'].includes(worker.status) || worker.status === 'completed' && (!Object.hasOwn(worker,'result') || hash(json(worker.result)) !== worker.resultHash)))) throw fault('REPLAY_CORRUPT', 'Saved run or worker evidence is missing or corrupt');
    if (previous?.sessionId && previous.sessionId !== sessionId) throw fault('REPLAY_SESSION', 'Saved results belong to a different session');
    if (previous && (previous.cleanup?.serverExited!==true || ['running','pausing','stopping','finishing'].includes(previous.status) || previous.workers.some(worker => ['running','unknown'].includes(worker.status)))) throw fault('REPLAY_UNKNOWN', 'Unknown execution prevents automatic replay');
    if (previous && previous.runtimeIdentity !== runtimeIdentity) throw fault('REPLAY_RUNTIME', 'Saved results require their original runtime version');
    reuse = !previous || previous.backendIdentity === backend.identity;
    const oldWorkers = previous?.workers ?? [];
    state = { version: 1, sessionId, generation: (previous?.generation ?? 0) + 1, runtimeIdentity, backendIdentity: backend.identity,
      status: 'running', acceptingControls:true, meta, script, args, launch, concurrency, maxAgents, workerCount: 0, attempts: previous?.attempts ?? 0, createdAt: previous?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() };
    saveHeader();
    const applyControls = (closing=false) => {
      own();
      let applied=false;
      db.exec('BEGIN IMMEDIATE');
      try{
        const rows=db.prepare("SELECT value FROM controls WHERE generation=? AND json_extract(value,'$.status')='pending' ORDER BY rowid").all(state.generation);
        for(const row of rows){
          const receipt=JSON.parse(row.value);
          if(!['pause','stop'].includes(receipt.action))throw fault('CONTROL_CORRUPT','Stored control action is invalid');
          const denied=Boolean(primary)||controlAction==='stop'&&receipt.action==='pause';
          receipt.status=denied?'rejected':'applied';receipt.appliedAt=new Date().toISOString();
          if(!denied){applied=true;controlAction=receipt.action;state.status=controlAction==='pause'?'pausing':'stopping';state.updatedAt=receipt.appliedAt;}
          db.prepare('UPDATE controls SET value=? WHERE id=?').run(json(receipt),receipt.id);
        }
        if(closing)state.acceptingControls=false;
        if(rows.length||closing)saveHeader();
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      if(applied){stopped=true;evaluatorAbort.abort();if(controlAction==='stop'){abort.abort();if(expireDrain)armDrain(drainTimeoutMs);}for(const resolve of waiters.splice(0))resolve();}
    };
    controlTimer=setInterval(()=>{try{applyControls();}catch(error){fatal??=error;stopped=true;evaluatorAbort.abort();abort.abort();for(const resolve of waiters.splice(0))resolve();}},25);
    const dispatch = async ({ prompt, options = {} }) => {
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 65536 || !options || Array.isArray(options) || Object.keys(options).some(key => !['id','dependsOn','label','phase','timeoutMs','schema','model','effort','maxAttempts','permissions'].includes(key)) || ['label','phase'].some(key => options[key] != null && (typeof options[key] !== 'string' || options[key].length > 500)) || options.timeoutMs != null && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 120000)) throw fault('AGENT_INPUT', 'Unsupported agent prompt or options');
      const compiled=Object.hasOwn(options,'schema')?compileSchema(options.schema):null;
      if(backend.resolveOptions)options={...options,...backend.resolveOptions(options)};
      if(options.id!==undefined&&(typeof options.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(options.id)||workerIds.has(options.id)))throw fault('AGENT_INPUT','Worker ids must be unique bounded identifiers');
      if(options.dependsOn!==undefined&&(!Array.isArray(options.dependsOn)||options.dependsOn.length>256||options.dependsOn.some(id=>typeof id!=='string'||!workerIds.has(id))||new Set(options.dependsOn).size!==options.dependsOn.length))throw fault('AGENT_INPUT','Dependencies must name distinct earlier workers');
      if (stopped) throw fault('RUN_STOPPED', 'Workflow admission is closed');
      if (sequence >= maxAgents) throw fault('AGENT_LIMIT', 'Workflow agent limit reached');
      const position = sequence++;
      const dependencies=(options.dependsOn??[]).map(id=>workerIds.get(id));
      chain = hash(chain + canonical({ prompt, timeoutMs: options.timeoutMs ?? 120000, dependencies, schema:compiled?.schema??null,model:options.model??null,effort:options.effort??null,maxAttempts:options.maxAttempts??5,permissions:options.permissions??null }));
      const prior = oldWorkers[position];
      const worker = { position, key: chain, prompt, options, phase: options.phase ?? currentPhase, status: 'queued', cached: false };
      if(Object.hasOwn(options,'dependsOn'))worker.dependencies=dependencies;
      currentWorkers.set(position,worker);
      if(options.id!==undefined)workerIds.set(options.id,position);
      let settle;settlements.set(position,new Promise(resolve=>{settle=resolve;}));
      if (reuse && prior?.key === worker.key && prior.status === 'completed') {
        if (!Object.hasOwn(prior, 'result') || hash(json(prior.result)) !== prior.resultHash) throw fault('REPLAY_CORRUPT', 'Saved worker result is missing or corrupt');
        if(compiled&&!compiled.validate(prior.result))throw fault('REPLAY_CORRUPT','Saved worker result violates its schema');
        Object.assign(worker, { status: 'completed', cached: true, result: prior.result, resultHash: prior.resultHash });
        worker.reusedFrom=prior.reusedFrom??{generation:previous.generation,position:prior.position};
        for(const key of ['evidence','attempts','usageByThread','usage','activity','activityCount','startedAt','completedAt'])if(Object.hasOwn(prior,key))worker[key]=structuredClone(prior[key]);
        saveWorker(worker);settle(); return worker.result;
      }
      reuse = false;
      saveWorker(worker);
      let acquired = false;
      let dispatched = false;
      let terminalObserved=false;
      let executionOpen=false;
      try {
        await Promise.all(dependencies.map(position=>settlements.get(position)));
        if(dependencies.some(position=>currentWorkers.get(position).status!=='completed'))throw Object.assign(fault('DEPENDENCY_FAILED','A prerequisite did not complete successfully'),{notStarted:true});
        await acquire(); acquired = true;
        if (state.attempts >= maxAgents) throw Object.assign(fault('AGENT_LIMIT', 'Lifetime agent attempt limit reached'), { notStarted: true });
        state.attempts++; worker.attempts=1; worker.status = 'running'; worker.startedAt = new Date().toISOString();
        saveHeader(); saveWorker(worker);
        dispatched = true;
        executionOpen=true;
        const reserveRetry=async()=>{
          if(retiredWrites||abort.signal.aborted)throw fault('RUN_STOPPED','Worker admission is closed');
          if(state.attempts>=maxAgents)throw fault('AGENT_LIMIT','Lifetime agent attempt limit reached');
          state.attempts++;worker.attempts++;saveWorker(worker);
        };
        const observationOpen=()=>{if(retiredWrites||!executionOpen)throw fault('RUN_RETIRED','Late worker activity cannot change terminal evidence');};
        const onActive=identity=>{observationOpen();worker.activeTurn=JSON.parse(json(identity));saveWorker(worker);};
        const onEvent=message=>{observationOpen();saveWorker(worker,message);};
        const result = await backend.execute({ prompt, options, position, signal: abort.signal, reserveRetry, onActive,onEvent });
        executionOpen=false;delete worker.activeTurn;
        if(retiredWrites)throw fault('RUN_RETIRED','Late worker result cannot change terminal evidence');
        if (!result?.terminalObserved) throw fault('AGENT_UNKNOWN', 'Worker terminal state was not observed');
        terminalObserved=true;
        if (result.evidence) worker.evidence = JSON.parse(json(result.evidence));
        const value = JSON.parse(json(result.value));
        if(compiled&&!compiled.validate(value))throw fault('RESULT_SCHEMA','Worker result does not satisfy its declared schema');
        Object.assign(worker, { status: 'completed', result: value, resultHash: hash(json(value)), completedAt: new Date().toISOString() });
        saveWorker(worker); return value;
      } catch (error) {
        executionOpen=false;delete worker.activeTurn;
        if(retiredWrites)throw error;
        worker.status = !dispatched && controlAction ? 'queued' : !dispatched || error.notStarted || terminalObserved || error.terminalObserved===true ? 'failed' : 'unknown';
        worker.error = diagnostic(error);
        if(error.evidence)worker.evidence=JSON.parse(json(error.evidence));
        if(error.interruption)worker.interruption={terminalObserved:error.interruption.terminalObserved===true,terminalStatus:['completed','failed','interrupted'].includes(error.interruption.terminalStatus)?error.interruption.terminalStatus:null,descendants:'notVerified'};
        saveWorker(worker);
        throw error;
      } finally { if (acquired) release();settle(); }
    };
    const call = (method, params) => {
      if (method === 'agent') {
        const work = dispatch(params).catch(error => {
          if (['AGENT_INPUT','AGENT_LIMIT','WORKER_SETTINGS','SCHEMA_INVALID','SCHEMA_UNSUPPORTED','SCHEMA_LIMIT','REPLAY_CORRUPT','RUN_OWNERSHIP'].includes(error.code)) { fatal ??= error; stopped=true; evaluatorAbort.abort(); abort.abort(); for(const resolve of waiters.splice(0))resolve(); }
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
      await onReady?.({generation:state.generation,status:state.status});
      state.result = await evaluate(script, { args, call, timeoutMs, signal: evaluatorAbort.signal });
      if (fatal) throw fatal;
      state.status = 'finishing';
    } catch (error) { if(!controlAction||fatal){primary=fatal??error;state.status = 'finishing'; state.error = diagnostic(primary);} }
    stopped = true; if(controlAction!=='pause')abort.abort();
    for (const resolve of waiters.splice(0)) resolve();
    // Give workers their bounded native interruption/completion window before
    // closing the retained connection that carries terminal evidence.
    const drained=await Promise.race([Promise.allSettled([...calls]).then(()=>true),new Promise(resolve=>{expireDrain=resolve;armDrain(controlAction==='pause'?Math.max(timeoutMs+5000,drainTimeoutMs):drainTimeoutMs);})]);
    clearTimeout(drainTimer);
    expireDrain=undefined;
    if(!drained){
      abort.abort();retiredWrites=true;
      for(const worker of currentWorkers.values())if(worker.status==='running'){
        worker.status='unknown';worker.error=diagnostic(fault('DRAIN_TIMEOUT','Worker did not settle within the drain deadline'));saveWorker(worker);
      }
    }
    clearInterval(controlTimer);
    state.status=controlAction==='pause'?'pausing':controlAction==='stop'?'stopping':'finishing';
    applyControls(true);
    try { state.cleanup = await closeBackend(); }
    catch (error) { state.cleanup = { serverExited: false, error: diagnostic(error), descendants: 'notVerified' }; }
    if(drained)await Promise.allSettled([...calls]);
    if(primary||fatal)state.status='failed';else state.status=controlAction==='pause'?'paused':controlAction==='stop'?'stopped':'completed';
    if (!state.cleanup.serverExited || snapshot(db).workers.some(worker => worker.status === 'unknown')) state.status = controlAction?'blocked':'failed';
    state.updatedAt = new Date().toISOString(); saveHeader();
    return snapshot(db);
  } finally {
    clearInterval(controlTimer);
    clearTimeout(drainTimer);
    stopped = true; abort.abort();
    for (const resolve of waiters.splice(0)) resolve();
    if (backend?.close) { try { await closeBackend(); } catch { /* Reported above when a run was admitted. */ } }
    retiredWrites=true;
    db?.close();
    await lease?.close();
    if (leaseOwned && await readFile(lock, 'utf8').catch(() => '') === token) await unlink(lock);
  }
}
