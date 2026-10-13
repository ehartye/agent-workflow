/** @lane merge
 * @subject engine/controller.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const meta = 'export const meta={name:"local",description:"controller acceptance"};\n';
async function setup(t) {
  const runDir = await mkdtemp(join(tmpdir(), 'workflow-engine-'));
  t.after(() => rm(runDir, { recursive: true, force: true }));
  const module = await import('../engine/controller.mjs').catch(() => null);
  assert.ok(module?.runWorkflow, 'Fresh workflow controller must exist');
  return { runDir, runWorkflow: module.runWorkflow, readRun: module.readRun };
}
const backend = execute => ({ identity: 'fixture-v1', execute, close: async () => ({ serverExited: true, descendants: 'notVerified' }) });

test('ordered dispatch respects concurrency and persists results before completed replay', async t => {
  const { runDir, runWorkflow, readRun } = await setup(t);
  let active = 0, peak = 0;
  const calls = [];
  const script = meta + 'return await parallel(args.map(prompt => () => agent(prompt)));';
  const execute = async ({ prompt }) => {
    active++; peak = Math.max(peak, active); calls.push(prompt);
    await new Promise(resolve => setTimeout(resolve, prompt === 'A' ? 80 : 10));
    active--; return { value: prompt.toLowerCase(), terminalObserved: true };
  };
  const first = await runWorkflow({ runDir, sessionId: 'session', script, args: ['A','B','C'], concurrency: 2, backend: backend(execute) });
  assert.equal(first.status, 'completed'); assert.deepEqual(first.result, ['a','b','c']);
  assert.equal(peak, 2); assert.deepEqual(calls, ['A','B','C']);
  assert.deepEqual((await readRun(runDir)).result, ['a','b','c']);
  const replay = await runWorkflow({ runDir, sessionId: 'session', script, args: ['A','B','C'], resume: true, backend: backend(execute) });
  assert.equal(replay.coverage.cached, 3); assert.deepEqual(calls, ['A','B','C']);
  const changed = await runWorkflow({ runDir, sessionId: 'session', script, args: ['A','X','C'], resume: true, backend: backend(execute) });
  assert.equal(changed.coverage.cached, 1); assert.deepEqual(calls, ['A','B','C','X','C']);
});

test('replay matches effective execution options while allowing cosmetic label changes', async t => {
  const { runDir, runWorkflow } = await setup(t);
  let calls = 0;
  const input = { runDir, sessionId: 's', script: meta + 'return await agent("A",args);' };
  const execute = async () => ({value: ++calls, terminalObserved: true});
  await runWorkflow({...input, args: {label:'first'}, backend:backend(execute)});
  const equivalent = await runWorkflow({...input, args:{label:'renamed',timeoutMs:120000},resume:true,backend:backend(execute)});
  assert.equal(equivalent.coverage.cached,1); assert.equal(calls,1);
  const changed = await runWorkflow({...input,args:{timeoutMs:1},resume:true,backend:backend(execute)});
  assert.equal(changed.coverage.cached,0); assert.equal(calls,2);
});

test('known failed slot preserves null and invalidates every later successful slot', async t => {
  const { runDir, runWorkflow } = await setup(t);
  const script = meta + 'return await parallel(args.map(prompt => () => agent(prompt)));';
  const calls = [];
  const first = await runWorkflow({ runDir, sessionId: 's', script, args: ['A','B','C'], backend: backend(async ({prompt}) => {
    calls.push(prompt); if(prompt==='B') throw Object.assign(new Error('fixture'),{notStarted:true}); return {value:prompt,terminalObserved:true};
  }) });
  assert.deepEqual(first.result, ['A',null,'C']); assert.equal(first.coverage.complete, false);
  const replay = await runWorkflow({ runDir, sessionId: 's', script, args: ['A','B','C'], resume:true, backend: backend(async ({prompt})=>{calls.push(prompt);return {value:prompt,terminalObserved:true};}) });
  assert.deepEqual(calls,['A','B','C','B','C']); assert.equal(replay.coverage.cached,1);
});

test('unknown execution and different session refuse automatic replay', async t => {
  const { runDir, runWorkflow } = await setup(t);
  const input = { runDir, sessionId:'s',script:meta+'return await agent("A");',backend:backend(async()=>{throw new Error('lost transport');}) };
  const first = await runWorkflow(input);
  assert.equal(first.status,'failed'); assert.equal(first.workers[0].status,'unknown');
  await assert.rejects(runWorkflow({...input,resume:true}),{code:'REPLAY_UNKNOWN'});
  await assert.rejects(runWorkflow({...input,sessionId:'other',resume:true}),{code:'REPLAY_SESSION'});
});

test('exclusive run ownership refuses a second controller without dispatching', async t => {
  const { runDir, runWorkflow } = await setup(t);
  await writeFile(join(runDir,'owner.lock'),'another-controller',{flag:'wx'});
  let called=false;
  await assert.rejects(runWorkflow({runDir,sessionId:'s',script:meta+'return 1;',backend:backend(async()=>{called=true;})}),{code:'RUN_LOCKED'});
  assert.equal(called,false);
});

test('missing or corrupt saved worker rows reject before any replay dispatch', async t => {
  for (const mutation of ['DELETE FROM workers', `UPDATE workers SET value=json_set(value,'$.result','changed')`]) {
    const { runDir, runWorkflow } = await setup(t);
    const input = {runDir,sessionId:'s',script:meta+'return await agent("A");'};
    await runWorkflow({...input,backend:backend(async()=>({value:'A',terminalObserved:true}))});
    const db = new DatabaseSync(join(runDir,'run.sqlite')); db.exec(mutation); db.close();
    let called=false;
    await assert.rejects(runWorkflow({...input,resume:true,backend:backend(async()=>{called=true;return {value:'A',terminalObserved:true};})}),{code:'REPLAY_CORRUPT'});
    assert.equal(called,false);
  }
});
