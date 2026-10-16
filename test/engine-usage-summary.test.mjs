/** @lane merge
 * @subject engine/usage-summary.mjs
 * @subject engine/evaluator-child.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readUsageSummary} from '../engine/usage-summary.mjs';
import {runWorkflow,readRun} from '../engine/controller.mjs';
import {fault} from '../foundation/client.mjs';

const total = (inputTokens, outputTokens) => ({inputTokens, cachedInputTokens:0, outputTokens, reasoningOutputTokens:0, totalTokens:inputTokens+outputTokens, cacheWriteInputTokens:0});
async function fixture(t, generations) {
  const dataDir = await mkdtemp(fileURLToPath(new URL('../.controller-test-inspection-', import.meta.url)));
  t.after(() => rm(dataDir, {recursive:true, force:true}));
  const runId = randomUUID(), runDir = join(dataDir, 'runs-v2', runId);
  await mkdir(runDir, {recursive:true});
  await writeFile(join(runDir, 'runtime.json'), JSON.stringify({schema:2, id:runId, sessionId:'inspection', runtime:{id:'fixture-runtime'}}));
  const db = new DatabaseSync(join(runDir, 'run.sqlite'));
  db.exec('CREATE TABLE header(id INTEGER PRIMARY KEY,value TEXT);CREATE TABLE workers(generation INTEGER,position INTEGER,value TEXT,PRIMARY KEY(generation,position));');
  db.prepare('INSERT INTO header VALUES(1,?)').run(JSON.stringify({version:1, generation:generations.length, sessionId:'inspection', status:'completed'}));
  generations.forEach((workers, index) => workers.forEach(worker => db.prepare('INSERT INTO workers VALUES(?,?,?)').run(index+1, worker.position, JSON.stringify(worker))));
  db.close();
  return {dataDir, runId, generation:generations.length, runDir};
}
const worker = (usageByThread, extra={}) => ({position:0,origin:{kind:'script',ordinal:0},status:'completed',attempts:1,usageByThread,...extra});
const read = input => readUsageSummary({dataDir:input.dataDir,runId:input.runId,generation:input.generation});

test('reopened persisted replay copies count native cumulative thread usage once', async t => {
  const original = {position:0, origin:{kind:'script',ordinal:0}, status:'completed', attempts:1, usageByThread:{thread:total(10,2)}};
  const input = await fixture(t, [[original], [{...original, cached:true, reusedFrom:{generation:1,position:0}, sourceGeneration:1, sourcePosition:0}]]);
  const result = await readUsageSummary({dataDir:input.dataDir, runId:input.runId, generation:2});
  assert.deepEqual(result.observedTotals, total(10,2));
  assert.equal(result.threads.length, 1);
  assert.equal(result.hardSpendingCap, false);
  assert.equal(result.attemptCoverage[0].allocatedTotals, null);
  // A copied subject that keys by replay generation instead of native thread
  // must be rejected by this same 12-token assertion (it reports 24).
  const source=await readFile(new URL('../engine/usage-summary.mjs',import.meta.url),'utf8');
  const anchor='threads.set(threadId,'; assert.equal(source.split(anchor).length,2);
  const modulePath=join(input.dataDir,'mutant.mjs');
  await writeFile(modulePath,source.replace(anchor,'threads.set(`${row.generation}:${threadId}`,'));
  const mutant=await import(pathToFileURL(modulePath).href);
  const duplicated=await mutant.readUsageSummary({dataDir:input.dataDir,runId:input.runId,generation:2});
  assert.equal(duplicated.observedTotals.totalTokens,24);
  assert.throws(()=>assert.deepEqual(duplicated.observedTotals,total(10,2)),{code:'ERR_ASSERTION'});
});

test('correction threads and monotonic resumed samples count once per original run and thread', async t => {
  const input = await fixture(t, [
    [worker({original:total(10,2)})],
    [worker({original:total(10,2),correction:total(4,1)}, {attempts:2,attemptOffset:1,priorExecutions:[{generation:1,position:0}]})],
    [worker({original:total(10,2),correction:total(7,2)}, {attempts:3,attemptOffset:2,priorExecutions:[{generation:1,position:0},{generation:2,position:0}]})]
  ]);
  const result = await read(input);
  assert.deepEqual(result.observedTotals,total(17,4));
  assert.equal(result.threads.length,2);
  assert.ok(result.threads.every(thread => thread.run.runId===input.runId));
  assert.ok(result.attemptCoverage.every(attempt => attempt.allocatedTotals===null));
  assert.equal(result.attemptCoverage.at(-1).attemptOffset,2);
  assert.equal(result.run.runtimeId,'fixture-runtime');
  assert.match(result.run.dataInstanceId,/^[a-f0-9]{64}$/);
});

test('incomparable and decreasing observations preserve only the earlier verified lower bound', async t => {
  const input = await fixture(t, [
    [worker({thread:total(10,2)})],
    [worker({thread:total(9,4)}, {attempts:2,attemptOffset:1,priorExecutions:[{generation:1,position:0}]})],
    [worker({thread:total(3,1)}, {attempts:3,attemptOffset:2,priorExecutions:[{generation:1,position:0},{generation:2,position:0}]})]
  ]);
  const result = await read(input);
  assert.deepEqual(result.observedTotals,total(10,2));
  assert.ok(result.unknowns.some(item => item.code==='incompatibleUsage'));
  assert.ok(result.unknowns.some(item => item.code==='decreasingUsage'));
});

test('invalid cached lineage cannot introduce copied spend or hide original usage', async t => {
  const input = await fixture(t, [
    [worker({thread:total(10,2)})],
    [worker({forged:total(200,30)}, {cached:true,reusedFrom:{generation:2,position:0},attempts:1})]
  ]);
  const result = await read(input);
  assert.deepEqual(result.observedTotals,total(10,2));
  assert.ok(result.unknowns.some(item => item.code==='invalidLineage'));
});

test('unlinked claims of the same native thread cannot inflate observed spend', async t => {
  const input = await fixture(t, [[worker({thread:total(10,2)}), worker({thread:total(100,20)},{position:1,origin:{kind:'script',ordinal:1}})]]);
  const result = await read(input);
  assert.deepEqual(result.observedTotals,total(10,2));
  assert.ok(result.unknowns.some(item => item.code==='threadIdentityConflict'));
});

test('malformed/missing observations and live workers are explicit unknown coverage', async t => {
  const input = await fixture(t, [[worker({broken:{...total(1,2),totalTokens:-1}}, {status:'running',evidence:{attempts:[{number:1,threadId:'latest',status:'running'}]}})]]);
  const result = await read(input);
  assert.equal(result.observedTotals,null);
  assert.ok(result.unknowns.some(item => item.code==='invalidUsage'));
  assert.ok(result.unknowns.some(item => item.code==='missingLatestUsage'));
  assert.equal(result.inFlight.length,1);
  assert.equal(result.hardSpendingCap,false);
});

test('controller queued work without attempts remains in flight on read-only SQLite reopen', async t => {
  const input=await fixture(t,[]);
  const database=join(input.runDir,'run.sqlite');
  const empty=new DatabaseSync(database);
  empty.exec('DROP TABLE header;DROP TABLE workers;'); empty.close();
  let started,release,closed=false;
  const active=new Promise(resolve=>{started=resolve;});
  const held=new Promise(resolve=>{release=resolve;});
  const dispatched=[];
  const script='export const meta={name:"queued usage",description:"Owned held-sibling fixture"};return await parallel([()=>agent("active"),()=>agent("queued")]);';
  const work=runWorkflow({runDir:input.runDir,sessionId:'inspection',script,concurrency:1,backend:{
    identity:'queued-usage-'+randomUUID(),
    close:async()=>{closed=true;return {serverExited:true,jobEmpty:true,forced:false};},
    execute:async({prompt})=>{
      dispatched.push(prompt);
      if(prompt==='active'){started();await held;}
      return {value:prompt,terminalObserved:true};
    }
  }});
  // If startup fails, observe that same work promise instead of leaving a
  // readiness wait pending or starting another controller.
  const early=work.then(()=>{throw Error('Fixture settled before inspection');});
  try {
    await Promise.race([active,early]);
    let saved;
    for(let poll=0;poll<200;poll++){
      saved=await readRun(input.runDir);
      if(saved.workers.length===2)break;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.deepEqual(dispatched,['active']);
    assert.deepEqual(saved.workers.map(worker=>worker.status),['running','queued']);
    assert.equal(Object.hasOwn(saved.workers[1],'attempts'),false);
    assert.equal(Object.hasOwn(saved.workers[1],'evidence'),false);
    assert.equal(Object.hasOwn(saved.workers[1],'usageByThread'),false);
    const persisted=()=>{
      const db=new DatabaseSync(database,{readOnly:true});
      try{
        db.exec('BEGIN');
        return {header:db.prepare('SELECT * FROM header').all(),workers:db.prepare('SELECT * FROM workers ORDER BY generation,position').all(),schema:db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all()};
      }finally{db.close();}
    };
    const before=persisted(),names=await readdir(input.runDir);
    const bytes=await readFile(database);
    const walBytes=await readFile(database+'-wal');
    const assertQueued=result=>{
      assert.deepEqual(result.inFlight,[
        {generation:1,position:0,attempt:1,status:'running'},
        {generation:1,position:1,attempt:0,status:'queued'}
      ]);
      const queued=result.attemptCoverage.find(row=>row.position===1);
      assert.deepEqual(queued,{generation:1,position:1,attempts:0,attemptOffset:0,cached:false,source:null,observedAttempts:[],allocatedTotals:null,coverage:'cumulativeOnly'});
      assert.equal(result.observedTotals,null);
      assert.deepEqual(result.threads,[]);
      assert.equal(result.hardSpendingCap,false);
      assert.ok(result.unknowns.some(row=>row.code==='missingLatestUsage'&&row.position===1));
      assert.equal(result.unknowns.some(row=>row.code==='missingUsage'&&row.position===1),false);
      assert.equal(result.unknowns.some(row=>['invalidRecord','invalidLineage','invalidUsage'].includes(row.code)),false);
    };
    assertQueued(await readUsageSummary({dataDir:input.dataDir,runId:input.runId,generation:1}));
    assertQueued(await readUsageSummary({dataDir:input.dataDir,runId:input.runId,generation:1}));
    assert.deepEqual(persisted(),before);
    assert.deepEqual(await readFile(database),bytes);
    assert.deepEqual(await readFile(database+'-wal'),walBytes);
    assert.deepEqual(await readdir(input.runDir),names);
    assert.deepEqual(dispatched,['active']);

    // Break only a disposable copy: omit the actual pre-execution shape.
    // The same public-output assertion must detect the missing queued worker.
    const source=await readFile(new URL('../engine/usage-summary.mjs',import.meta.url),'utf8');
    const anchor='const coordinate=`${row.generation}:${row.position}`;';
    assert.equal(source.split(anchor).length,2);
    const modulePath=join(input.dataDir,'omit-queued-mutant.mjs');
    await writeFile(modulePath,source.replace(anchor,"if (worker?.status==='queued' && worker.attempts===undefined) continue;\n      "+anchor));
    const mutant=await import(pathToFileURL(modulePath).href);
    const omitted=await mutant.readUsageSummary({dataDir:input.dataDir,runId:input.runId,generation:1});
    assert.deepEqual(omitted.inFlight.map(row=>row.position),[0]);
    assert.throws(()=>assertQueued(omitted),{code:'ERR_ASSERTION'});
    t.diagnostic('Broken queued-omission copy returned only position 0; the required [0,1] membership assertion rejected it.');
    assert.deepEqual(persisted(),before);
    assert.deepEqual(await readFile(database),bytes);
    assert.deepEqual(await readFile(database+'-wal'),walBytes);
  }finally{
    release();
    await work;
    // Consume the derived observer even when the regression assertion fails.
    await early.catch(()=>{});
    assert.equal(closed,true);
    assert.equal((await readRun(input.runDir)).status,'completed');
    assert.equal((await readdir(input.runDir)).includes('owner.lock'),false);
  }
});

test('safe integer overflow returns unknown totals instead of wrapped spend', async t => {
  const input = await fixture(t, [[worker({one:total(Number.MAX_SAFE_INTEGER,0),two:total(1,0)})]]);
  const result = await read(input);
  assert.equal(result.observedTotals,null);
  assert.ok(result.unknowns.some(item => item.code==='totalOverflow'));
});

test('usage observation and response limits produce bounded explicit unknowns', async t => {
  const samples = Object.fromEntries(Array.from({length:10001},(_,i) => [`t${i}`,total(1,0)]));
  const input = await fixture(t, [[worker(samples)]]);
  const result = await read(input);
  assert.equal(result.observedTotals,null);
  assert.ok(result.unknowns.some(item => item.code==='observationLimit'));
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=1024*1024);
});

test('generation and ownership validation do not create or rewrite saved records', async t => {
  const input = await fixture(t, [[worker({thread:total(2,1)})]]);
  const before = await readFile(join(input.runDir,'run.sqlite'));
  const names = await readdir(input.runDir);
  await read(input);
  assert.deepEqual(await readFile(join(input.runDir,'run.sqlite')),before);
  assert.deepEqual(await readdir(input.runDir),names);
  await assert.rejects(readUsageSummary({dataDir:input.dataDir,runId:input.runId, generation:2}),{code:'USAGE_GENERATION'});
  await assert.rejects(readUsageSummary({dataDir:input.dataDir,runId:'../escape',generation:1}),{code:'USAGE_INPUT'});
  await assert.rejects(readUsageSummary({dataDir:input.dataDir,runId:input.runId,generation:1,refresh:true}),{code:'USAGE_INPUT'});
  let traps=0;
  const proxy=new Proxy({dataDir:input.dataDir,runId:input.runId,generation:1},Object.fromEntries(['getPrototypeOf','ownKeys','getOwnPropertyDescriptor','get'].map(key=>[key,()=>{traps++;throw Error('caller trap');}])));
  const proxyRefusal=await readUsageSummary(proxy).then(()=>null,error=>error);
  assert.equal(traps,0,'Input refusal must precede caller Proxy traps');
  assert.equal(proxyRefusal?.code,'USAGE_INPUT');
  const revoked=Proxy.revocable({dataDir:input.dataDir,runId:input.runId,generation:1},{});revoked.revoke();
  await assert.rejects(readUsageSummary(revoked.proxy),{code:'USAGE_INPUT'});
  for (const hook of ['toString', Symbol.toPrimitive]) {
    let conversions = 0;
    const runId = {[hook]() { conversions++; throw new Error('caller conversion must stay inert'); }};
    const refusal = await readUsageSummary({dataDir:input.dataDir,runId,generation:1}).then(() => null, error => error);
    assert.equal(conversions,0,'run ID validation must not invoke caller code');
    assert.equal(refusal?.code,'USAGE_INPUT');
  }
  await writeFile(join(input.runDir,'runtime.json'),JSON.stringify({schema:2,id:randomUUID(),sessionId:'inspection',runtime:{id:'fixture-runtime'}}));
  await assert.rejects(read(input),{code:'USAGE_IDENTITY'});
});

test('local evidence attempts translate through the saved cumulative offset', async t => {
  const input=await fixture(t,[
    [worker({old:total(10,2)})],
    [worker({old:total(10,2),fresh:total(4,1)},{attempts:2,attemptOffset:1,priorExecutions:[{generation:1,position:0}],evidence:{attempts:[{number:1,threadId:'fresh',status:'completed'}]}})]
  ]);
  const result=await read(input);
  assert.deepEqual(result.attemptCoverage.at(-1).observedAttempts,[2]);
  assert.equal(result.attemptCoverage.at(-1).allocatedTotals,null);
});

test('filesystem and invalid saved JSON failures have bounded trusted categories', async t => {
  const input=await fixture(t,[[worker({thread:total(2,1)})]]);
  await assert.rejects(readUsageSummary({dataDir:join(input.dataDir,'absent'),runId:input.runId,generation:1}),{code:'USAGE_PATH'});
  await writeFile(join(input.runDir,'runtime.json'),Buffer.from([0xff,0xfe]));
  await assert.rejects(read(input),{code:'USAGE_IDENTITY'});
});

test('real controller replay and restart records reopen with both original native threads', async t => {
  const input=await fixture(t,[]);
  const cleanup={serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members',descendants:'notVerified',nativeTerminals:{inventoryEmpty:true,observed:0,acknowledged:0,descendants:'notVerified'}};
  const script='export const meta={name:"usage",description:"Real persisted inspection fixture"};return await parallel([()=>agent("A"),()=>agent("B")]);';
  let dispatched=0, corrections=0;
  const backend={identity:'inspection-fixture',close:async()=>cleanup,execute:async({prompt,onEvent})=>{
    dispatched++;
    const round=prompt==='B'?++corrections:0;
    const threadId=prompt==='A'?'original':round<=2?'correction':'restart';
    onEvent({method:'thread/tokenUsage/updated',params:{threadId,turnId:'turn',tokenUsage:{total:prompt==='A'?total(10,2):round<=2?total(4,1):total(3,1)}}});
    if(prompt==='B'&&round<=2)throw Object.assign(fault(round===1?'TURN_CANCELLED':'RESULT_SCHEMA','Controlled fixture failure'),{terminalObserved:round===2,evidence:{cleanup,attempts:[{number:1,threadId,status:'failed'}]}});
    return {value:'ok',terminalObserved:true,evidence:{cleanup,attempts:[{number:1,threadId,status:'completed'}]}};
  }};
  // The fixture schema was populated above; controller owns its actual state
  // from this point on, starting with an empty database rather than fake history.
  const db=new DatabaseSync(join(input.runDir,'run.sqlite')); db.exec('DROP TABLE header;DROP TABLE workers;'); db.close();
  await runWorkflow({runDir:input.runDir,sessionId:'inspection',script,backend});
  await runWorkflow({runDir:input.runDir,sessionId:'inspection',script,backend,resume:true,expectedGeneration:1,restart:{position:1,attempt:1,reconciliation:'Reviewed owned fixture effects; execute the explicit correction.'}});
  await runWorkflow({runDir:input.runDir,sessionId:'inspection',script,backend,resume:true,expectedGeneration:2});
  const result=await readUsageSummary({dataDir:input.dataDir,runId:input.runId,generation:3});
  assert.equal(dispatched,4);
  assert.deepEqual(result.observedTotals,total(17,4));
  assert.equal(result.unknowns.length,0);
  assert.deepEqual(result.attemptCoverage.at(-1).observedAttempts,[3]);
});

test('cached corrected workers retain their original offset and prior native spend',async t=>{
  const original=worker({old:total(10,2)});
  const corrected=worker({old:total(10,2),fresh:total(4,1)},{attempts:2,attemptOffset:1,priorExecutions:[{generation:1,position:0}]});
  const input=await fixture(t,[[original],[corrected],[{...corrected,cached:true,reusedFrom:{generation:2,position:0},sourceGeneration:2,sourcePosition:0}]]);
  const result=await read(input);
  assert.deepEqual(result.observedTotals,total(14,3));
  assert.deepEqual(result.unknowns,[]);
});

test('a repeated logical origin without saved predecessor lineage cannot add fresh spend',async t=>{
  const input=await fixture(t,[[worker({old:total(10,2)})],[worker({unlinked:total(100,20)})]]);
  const result=await read(input);
  assert.deepEqual(result.observedTotals,total(10,2));
  assert.ok(result.unknowns.some(item=>item.code==='invalidLineage'));
});

test('malformed local attempt evidence stays unknown without losing other verified workers',async t=>{
  const input=await fixture(t,[[worker({good:total(10,2)}),worker({bad:total(100,20)},{position:1,origin:{kind:'script',ordinal:1},evidence:{attempts:[null]}})]]);
  const result=await read(input);
  assert.deepEqual(result.observedTotals,total(10,2));
  assert.ok(result.unknowns.some(item=>item.code==='invalidLineage'&&item.position===1));
});

for(const [name,extra] of [
  ['missing cumulative offset',{priorExecutions:[{generation:1,position:0}]}],
  ['nonboolean cache marker',{cached:1,priorExecutions:[{generation:1,position:0}]}],
  ['usage without an execution attempt',{attempts:0,origin:{kind:'script',ordinal:1}}]
])test(`${name} cannot introduce new observed spend`,async t=>{
  const input=await fixture(t,[[worker({old:total(10,2)})],[worker({untrusted:total(100,20)},extra)]]);
  const result=await read(input);
  assert.deepEqual(result.observedTotals,total(10,2));
  assert.ok(result.unknowns.length>0);
});
