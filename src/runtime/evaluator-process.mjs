import { getQuickJS } from "quickjs-emscripten";
import { performance } from "node:perf_hooks";

let context,
  runtime,
  cpuLeft,
  deadline,
  sequence = 0,
  ended = false;
const deferred = new Map();
function send(message) {
  if (process.connected) process.send(message);
}
function fail(error) {
  if (ended) return;
  ended = true;
  send({
    type: "error",
    error: {
      message: error?.message ?? String(error),
      code: error?.code ?? "EVALUATOR_ERROR",
    },
  });
  setTimeout(() => process.exit(1), 10);
}
function bounded(operation) {
  const begin = performance.now();
  deadline = begin + cpuLeft;
  try {
    return operation();
  } finally {
    cpuLeft -= performance.now() - begin;
  }
}
function pump() {
  if (ended) return;
  try {
    const result = bounded(() => runtime.executePendingJobs());
    if (result.error) {
      const error = context.dump(result.error);
      result.error.dispose();
      throw Error(error.message ?? JSON.stringify(error));
    }
  } catch (error) {
    fail(error);
  }
}

process.on("message", async (message) => {
  try {
    if (message.type === "start") {
      const QuickJS = await getQuickJS();
      runtime = QuickJS.newRuntime();
      runtime.setMemoryLimit(message.memoryBytes);
      runtime.setMaxStackSize(512 * 1024);
      cpuLeft = message.cpuMs;
      runtime.setInterruptHandler(() => performance.now() > deadline);
      context = runtime.newContext();
      const broker = context.newFunction("__broker", (requestHandle) => {
        const request = JSON.parse(context.getString(requestHandle));
        const promise = context.newPromise();
        const id = ++sequence;
        deferred.set(id, promise);
        send({ type: "broker", id, request });
        return promise.handle;
      });
      context.setProp(context.global, "__broker", broker);
      broker.dispose();
      const bootstrap = `
        (()=>{ const rpc=__broker, encode=JSON.stringify, decode=JSON.parse; delete globalThis.__broker;
          let spent=${JSON.stringify(message.spent)}, phaseName=null;
          const args=${message.args === undefined ? "undefined" : JSON.stringify(message.args)};
          const budget=Object.freeze({total:${JSON.stringify(message.budget)},spent:()=>spent,remaining:()=>${message.budget === null ? "Infinity" : `${JSON.stringify(message.budget)}-spent`}});
          const call=async (request)=>{try{const reply=decode(await rpc(encode(request)));if(reply.spent!==undefined)spent=reply.spent;return reply.value;}catch(error){if(error.spent!==undefined)spent=error.spent;throw error;}};
          const agent=(prompt,options={})=>call({type:'agent',prompt,options:{...options,phase:options.phase??phaseName}});
          const phase=title=>{phaseName=title;return call({type:'phase',title});};
          const log=message=>call({type:'log',message:String(message)});
          const workflow=(name,args)=>call({type:'workflow',name,args});
          const parallel=async thunks=>{if(!Array.isArray(thunks)||thunks.length>4096)throw Error('parallel batch limit is 4096');return await Promise.all(thunks.map(async thunk=>{try{return await thunk();}catch{return null;}}));};
          const pipeline=async (items,...stages)=>{if(!Array.isArray(items)||items.length>4096)throw Error('pipeline batch limit is 4096');return await Promise.all(items.map(async(item,index)=>{try{let value=item;for(const stage of stages)value=await stage(value,item,index);return value;}catch{return null;}}));};
          const RealDate=Date; const dates=new WeakMap(); globalThis.Date=class Date {constructor(...values){if(!values.length)throw Error('Date without explicit input is unavailable');dates.set(this,new RealDate(...values).getTime());}getTime(){return dates.get(this);}valueOf(){return this.getTime();}toISOString(){return new RealDate(this.getTime()).toISOString();}toJSON(){return this.toISOString();}toString(){return this.toISOString();}static now(){throw Error('Date.now is unavailable');}static parse(value){return RealDate.parse(value);}static UTC(...values){return RealDate.UTC(...values);}};
          Object.defineProperty(Math,'random',{value:()=>{throw Error('Math.random is unavailable');},writable:false,configurable:false});
          for(const [name,value] of Object.entries({agent,phase,log,workflow,parallel,pipeline,args,budget}))Object.defineProperty(globalThis,name,{value,writable:false,configurable:false});
          return value=>{const json=encode(value??null);if(json===undefined)throw Error('Workflow result must serialize as JSON');return json;};
        })();`;
      const result = bounded(() => context.evalCode(bootstrap, "workflow.js"));
      if (result.error) {
        const error = context.dump(result.error);
        result.error.dispose();
        throw Error(error.message ?? JSON.stringify(error));
      }
      const serialize = result.value;
      pump();
      const execution = bounded(() =>
        context.evalCode(`(async()=>{${message.body}\n})()`, "workflow.js"),
      );
      if (execution.error) {
        const error = bounded(() => context.dump(execution.error));
        execution.error.dispose();
        throw Error(error.message ?? JSON.stringify(error));
      }
      const completion = context.resolvePromise(execution.value);
      execution.value.dispose();
      completion
        .then((result) => {
          if (ended) {
            result.dispose();
            return;
          }
          try {
            if (result.error) {
              const error = bounded(() => context.dump(result.error));
              result.error.dispose();
              fail(error);
              return;
            }
            const encoded = bounded(() =>
              context.callFunction(serialize, context.undefined, result.value),
            );
            result.value.dispose();
            serialize.dispose();
            if (encoded.error) {
              const error = bounded(() => context.dump(encoded.error));
              encoded.error.dispose();
              throw Error(error.message ?? JSON.stringify(error));
            }
            const json = context.getString(encoded.value);
            encoded.value.dispose();
            ended = true;
            send({ type: "result", value: JSON.parse(json) });
            setTimeout(() => process.exit(0), 10);
          } catch (error) {
            fail(error);
          }
        })
        .catch(fail);
      pump();
    } else if (message.type === "reply" && !ended) {
      const promise = deferred.get(message.id);
      if (!promise) throw Error("Unknown broker reply");
      deferred.delete(message.id);
      if (message.error) {
        const error = context.newError(message.error.message);
        const code = context.newString(message.error.code);
        context.setProp(error, "code", code);
        code.dispose();
        if (message.error.spent !== undefined) {
          const spent = context.newNumber(message.error.spent);
          context.setProp(error, "spent", spent);
          spent.dispose();
        }
        promise.reject(error);
        error.dispose();
      } else {
        const value = context.newString(JSON.stringify(message.value));
        promise.resolve(value);
        value.dispose();
      }
      promise.dispose();
      pump();
    }
  } catch (error) {
    fail(error);
  }
});
