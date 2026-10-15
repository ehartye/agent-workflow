/** @lane merge
 * @subject engine/evaluate.mjs
 * @subject engine/evaluator-child.mjs
 * @subject engine/script.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const meta = 'export const meta = {name:"proof",description:"local workflow"};\n';

test('evaluator preflight uses the exact combined UTF8 envelope without executing script',async()=>{
 const {preflightEvaluatorInput,evaluate}=await import('../engine/evaluate.mjs');
 assert.equal(typeof preflightEvaluatorInput,'function');
 const script=meta+'return args;',prefix=preflightEvaluatorInput(script,'');
 const remaining=2*1024*1024-Buffer.byteLength(prefix);
 assert.equal(Buffer.byteLength(preflightEvaluatorInput(script,'x'.repeat(remaining))),2*1024*1024);
 assert.throws(()=>preflightEvaluatorInput(script,'x'.repeat(remaining+1)),{code:'EVALUATOR_INPUT'});
 assert.throws(()=>preflightEvaluatorInput(script,'雪'.repeat(Math.ceil(remaining/3))),{code:'EVALUATOR_INPUT'});
 let calls=0;
 await assert.rejects(evaluate(script,{args:'x'.repeat(remaining+1),call:async()=>{calls++;}}),{code:'EVALUATOR_INPUT'});
 assert.equal(calls,0);
 assert.throws(()=>preflightEvaluatorInput(meta+' '.repeat(1024*1024),null),{code:'SCRIPT_SIZE'});
});

test('manual-lifetime evaluator waits for broker work beyond its guest idle budget',async()=>{
  const evaluate=await evaluator();
  const result=await evaluate(meta+'return await agent("long implementation");',{timeoutMs:null,idleTimeoutMs:5000,call:async()=>{
    // Use the production idle allowance so host bootstrap is not assumed to
    // finish in400ms. Pending broker work must survive beyond that allowance.
    const started=performance.now();await new Promise(resolve=>setTimeout(resolve,5500));assert.ok(performance.now()-started>=5000);return 'completed';
  }});
  assert.equal(result,'completed');
});

test('manual-lifetime evaluator terminates guest deadlock before and after a broker call',async()=>{
  const evaluate=await evaluator();
  for(const [body,expectedCalls] of [['await new Promise(()=>{});',0],['await agent("A");await new Promise(()=>{});',1]]){
    let calls=0;
    await assert.rejects(evaluate(meta+body,{timeoutMs:null,idleTimeoutMs:5000,call:async()=>{calls++;return 'ok';}}),{code:'EVALUATOR_IDLE'});
    assert.equal(calls,expectedCalls,'A startup timeout cannot impersonate the broker-then-deadlock case');
  }
});
async function evaluator() {
  const module = await import('../engine/evaluate.mjs').catch(() => null);
  assert.ok(module?.evaluate, 'Fresh isolated evaluator must exist');
  return module.evaluate;
}

test('isolated JS keeps pipeline items independent and parallel results ordered', async () => {
  const evaluate = await evaluator();
  const order = [];
  const result = await evaluate(meta + `
    await phase('Read'); await log('start');
    const rows = await pipeline(args, item => agent(item), (value, original) => agent(original + '-2'));
    const failed = await parallel([() => agent('bad'), () => agent('good')]);
    return {rows,failed};`, {
    args: ['slow', 'fast'],
    call: async (method, params) => {
      if (method !== 'agent') return null;
      order.push(params.prompt);
      if (params.prompt === 'bad') throw new Error('fixture failure');
      if (params.prompt === 'slow') await new Promise(resolve => setTimeout(resolve, 100));
      return params.prompt;
    },
  });
  assert.deepEqual(result, { rows: ['slow-2', 'fast-2'], failed: [null, 'good'] });
  assert.ok(order.indexOf('fast-2') < order.indexOf('slow-2'));
});

test('metadata and module loading reject before broker dispatch', async () => {
  const evaluate = await evaluator();
  let called = false;
  for (const script of [meta + `await import('node:fs');`, 'export const meta={...args};return 1;', meta + 'export const another=1;']) {
    await assert.rejects(evaluate(script, { call: async () => { called = true; } }));
  }
  assert.equal(called, false);
});

test('guest has no host or bridge capability and rejects clocks and random', async () => {
  const evaluate = await evaluator();
  const result = await evaluate(meta + `return [typeof process,typeof require,typeof __dispatch,typeof __args];`, { call: async () => null });
  assert.deepEqual(result, ['undefined', 'undefined', 'undefined', 'undefined']);
  for (const expression of ['Date.now()', 'new Date()', 'Date()', 'Math.random()', 'new Date.prototype.constructor()']) {
    await assert.rejects(evaluate(meta + `return ${expression};`, { call: async () => null }));
  }
});

test('guest infinite work, unsettled work and non-JSON result fail within bounds', async () => {
  const evaluate = await evaluator();
  for (const body of ['while(true){}', 'await new Promise(()=>{});', 'return () => 1;']) {
    await assert.rejects(evaluate(meta + body, { call: async () => null, timeoutMs: 500, cpuMs: 100 }));
  }
});
