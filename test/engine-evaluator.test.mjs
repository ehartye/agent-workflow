/** @lane merge
 * @subject engine/evaluate.mjs
 * @subject engine/evaluator-child.mjs
 * @subject engine/script.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const meta = 'export const meta = {name:"proof",description:"local workflow"};\n';

test('manual-lifetime evaluator waits for broker work beyond its guest idle budget',async()=>{
  const evaluate=await evaluator();
  const result=await evaluate(meta+'return await agent("long implementation");',{timeoutMs:null,idleTimeoutMs:400,call:async()=>{
    await new Promise(resolve=>setTimeout(resolve,800));return 'completed';
  }});
  assert.equal(result,'completed');
});

test('manual-lifetime evaluator still terminates guest deadlock after broker work settles',async()=>{
  const evaluate=await evaluator();
  for(const body of ['await new Promise(()=>{});','await agent("A");await new Promise(()=>{});']){
    await assert.rejects(evaluate(meta+body,{timeoutMs:null,idleTimeoutMs:400,call:async()=> 'ok'}),{code:'EVALUATOR_IDLE'});
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
