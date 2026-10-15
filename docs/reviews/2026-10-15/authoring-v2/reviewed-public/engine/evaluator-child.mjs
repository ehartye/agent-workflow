import { getQuickJS } from 'quickjs-emscripten';

let context;
let runtime;
let promise;
let interval;
let sequence = 0;
let sliceDeadline = Infinity;
let cpuMs;
let finished = false;
const pending = new Map();
function finish(message) {
  if (finished) return;
  finished = true; clearInterval(interval);
  process.send?.(message, () => process.exit(message.kind === 'result' ? 0 : 1));
}
function pump() {
  if (!context || finished) return;
  sliceDeadline = performance.now() + cpuMs;
  const jobs = runtime.executePendingJobs(100);
  if (jobs.error) { jobs.error.dispose(); return finish({ kind: 'error' }); }
  const state = context.getPromiseState(promise);
  if (state.type === 'rejected') { state.error.dispose(); return finish({ kind: 'error' }); }
  if (state.type === 'fulfilled') {
    try { finish({ kind: 'result', value: JSON.parse(context.getString(state.value)) }); }
    catch { finish({ kind: 'error' }); }
    finally { state.value.dispose(); }
  }
}
process.on('disconnect', () => process.exit(0));
process.on('message', async message => {
  try {
    if (message.kind === 'reply') {
      const deferred = pending.get(message.id);
      if (!deferred || finished) return;
      pending.delete(message.id);
      const value = context.newString(message.error ? 'Workflow broker call failed' : JSON.stringify(message.value));
      if (message.error) deferred.reject(value); else deferred.resolve(value);
      value.dispose(); deferred.dispose(); pump(); return;
    }
    if (message.kind !== 'start' || runtime) return finish({ kind: 'error' });
    cpuMs = message.cpuMs;
    const module = await getQuickJS();
    runtime = module.newRuntime();
    runtime.setMemoryLimit(32 * 1024 * 1024);
    runtime.setMaxStackSize(512 * 1024);
    runtime.setInterruptHandler(() => performance.now() > sliceDeadline);
    context = runtime.newContext();
    const dispatch = context.newFunction('dispatch', (method, params) => {
      if (pending.size >= 4096) throw new Error('Too many calls');
      const id = ++sequence;
      const deferred = context.newPromise();
      pending.set(id, deferred);
      process.send({ kind: 'call', id, method: context.getString(method), params: JSON.parse(context.getString(params)) });
      return deferred.handle;
    });
    context.setProp(context.global, '__dispatch', dispatch); dispatch.dispose();
    const args = context.newString(JSON.stringify(message.args));
    context.setProp(context.global, '__args', args); args.dispose();
    sliceDeadline = performance.now() + cpuMs;
    context.unwrapResult(context.evalCode(`(() => {
      const dispatch = globalThis.__dispatch;
      const args = JSON.parse(globalThis.__args);
      delete globalThis.__dispatch; delete globalThis.__args;
      const stringify = value => JSON.stringify(value, (_, item) => {
        if (['undefined','function','symbol','bigint'].includes(typeof item) || typeof item === 'number' && !Number.isFinite(item)) throw new Error('JSON values only');
        return item;
      });
      const call = async (method, params) => JSON.parse(await dispatch(method, stringify(params)));
      const bounded = list => { if (!Array.isArray(list) || list.length > 4096) throw new Error('Batch limit'); return list; };
      const api = {
        args,
        agent: (prompt, options = {}) => call('agent', {prompt, options}),
        phase: title => call('phase', {title}),
        log: message => call('log', {message}),
        parallel: tasks => Promise.all(bounded(tasks).map(async task => { try { return await task(); } catch { return null; } })),
        pipeline: (items, ...stages) => Promise.all(bounded(items).map(async (original,index) => {
          try { let value = original; for (const stage of stages) { value = await stage(value,original,index); if (value === null) return null; } return value; } catch { return null; }
        })),
      };
      for (const [name,value] of Object.entries(api)) Object.defineProperty(globalThis,name,{value,writable:false,configurable:false});
      const OriginalDate = Date;
      function DeterministicDate(...args) { if (!new.target || !args.length) throw new Error('Supply a timestamp through args'); return Reflect.construct(OriginalDate,args,DeterministicDate); }
      DeterministicDate.prototype = OriginalDate.prototype;
      Object.defineProperty(DeterministicDate.prototype,'constructor',{value:DeterministicDate});
      DeterministicDate.now = () => { throw new Error('Clock unavailable'); };
      DeterministicDate.parse = OriginalDate.parse; DeterministicDate.UTC = OriginalDate.UTC;
      globalThis.Date = DeterministicDate;
      Math.random = () => { throw new Error('Random unavailable'); };
      // Serialization lives outside the user body's lexical scope.
      Object.defineProperty(globalThis,'__serializeResult',{value:stringify,configurable:true});
    })()`)).dispose();
    // Capture serializer, then remove its global binding before starting the body.
    const serializer = context.getProp(context.global, '__serializeResult');
    context.unwrapResult(context.evalCode('delete globalThis.__serializeResult')).dispose();
    const result = context.evalCode(`(async () => { ${message.body}\n})()`);
    if (result.error) { result.error.dispose(); serializer.dispose(); return finish({ kind: 'error' }); }
    const rawPromise = result.value;
    const then = context.getProp(rawPromise, 'then');
    const serialized = context.callFunction(then, rawPromise, serializer);
    then.dispose(); rawPromise.dispose(); serializer.dispose();
    promise = context.unwrapResult(serialized);
    interval = setInterval(pump, 10);
    pump();
  } catch { finish({ kind: 'error' }); }
});
