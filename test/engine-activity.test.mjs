/** @lane merge
 * @subject engine/activity.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
async function setup(t){const module=await import('../engine/activity.mjs').catch(()=>null);assert.ok(module?.recordActivity,'Activity store must exist');const db=new DatabaseSync(':memory:');t.after(()=>db.close());module.createActivityTable(db);return{...module,db};}
const event=(method,params={})=>({method,params:{threadId:'thread',turnId:'turn',...params}});

test('missing or inconsistent activity counters cannot claim complete history',async t=>{
  const {db,recordActivity,readActivity}=await setup(t),worker={position:0,attempts:1};
  recordActivity(db,{generation:1,worker,message:event('item/started',{item:{id:'tool',type:'commandExecution',command:'Read marker'}})});
  db.exec('DELETE FROM activity_counts');
  assert.throws(()=>readActivity(db,{generation:1,position:0}),{code:'ACTIVITY_CORRUPT'});
  db.exec('INSERT INTO activity_counts VALUES(1,0,0)');
  assert.throws(()=>readActivity(db,{generation:1,position:0}),{code:'ACTIVITY_CORRUPT'});
  db.exec('DELETE FROM activity; DELETE FROM activity_counts');
  assert.throws(()=>readActivity(db,{generation:1,position:0,expectedObserved:worker.activityCount}),{code:'ACTIVITY_CORRUPT'});
});
test('activity records actual tool input output and status with bounded explicit truncation',async t=>{
  const {db,recordActivity,readActivity}=await setup(t),worker={position:0,attempts:1};
  recordActivity(db,{generation:1,worker,message:event('item/started',{item:{id:'tool',type:'commandExecution',command:'Read marker',cwd:'project',status:'inProgress'}})});
  recordActivity(db,{generation:1,worker,message:event('item/commandExecution/outputDelta',{itemId:'tool',delta:'\u0000💡'.repeat(10000)})});
  recordActivity(db,{generation:1,worker,message:event('item/completed',{item:{id:'tool',type:'commandExecution',command:'Read marker',status:'completed',exitCode:0,aggregatedOutput:'marker'}})});
  const page=readActivity(db,{generation:1,position:0});
  assert.equal(page.records.length,3);assert.equal(page.records[0].input,'Read marker');assert.equal(page.records[2].output,'marker');assert.equal(page.records[2].status,'completed');
  assert(page.records[1].truncated.includes('output'));assert(page.records.every(row=>Buffer.byteLength(JSON.stringify(row))<=16384));
  assert.equal(worker.activity.status,'completed');assert.equal(worker.activityCount,3);
});
test('cumulative usage is counted once per thread across corrections and separately across restarted threads',async t=>{
  const {db,recordActivity}=await setup(t),worker={position:0,attempts:1};
  const usage=(threadId,inputTokens,outputTokens)=>event('thread/tokenUsage/updated',{threadId,tokenUsage:{total:{inputTokens,cachedInputTokens:0,outputTokens,reasoningOutputTokens:0,totalTokens:inputTokens+outputTokens}}});
  for(const message of [usage('thread',10,2),usage('thread',10,2),usage('thread',15,3),usage('replacement',4,1)])recordActivity(db,{generation:1,worker,message});
  assert.equal(worker.usage.inputTokens,19);assert.equal(worker.usage.outputTokens,4);assert.equal(worker.usage.observedThreads,2);
  assert.throws(()=>recordActivity(db,{generation:1,worker,message:usage('thread',2,1)}),{code:'USAGE_INVALID'});
  assert.throws(()=>recordActivity(db,{generation:1,worker,message:usage('thread',NaN,1)}),{code:'USAGE_INVALID'});
  const before=structuredClone(worker);
  assert.throws(()=>recordActivity(db,{generation:1,worker,message:usage('overflow',Number.MAX_SAFE_INTEGER,0)}),{code:'USAGE_INVALID'});
  assert.deepEqual(worker,before,'Rejected usage must not mutate accepted totals');
});
test('paged activity discloses discarded history and isolates worker generations',async t=>{
  const {db,recordActivity,readActivity}=await setup(t),worker={position:0,attempts:1};
  for(let i=0;i<270;i++)recordActivity(db,{generation:1,worker,message:event('item/commandExecution/outputDelta',{itemId:'tool',delta:String(i)})});
  const first=readActivity(db,{generation:1,position:0,limit:10});
  assert.equal(first.retained,256);assert.equal(first.dropped,14);assert.equal(first.records[0].output,'14');assert.equal(first.hasMore,true);
  const next=readActivity(db,{generation:1,position:0,after:first.nextCursor,limit:100});assert.equal(next.records[0].output,'24');
  assert.equal(readActivity(db,{generation:2,position:0}).records.length,0);
  assert.equal(readActivity(db,{generation:1,position:1}).records.length,0);
  assert.throws(()=>readActivity(db,{generation:1,position:0,limit:101}),{code:'ACTIVITY_INPUT'});
});
test('generation-wide retention is bounded and raw reasoning never enters evidence',async t=>{
  const {db,recordActivity,readActivity}=await setup(t);
  for(let position=0;position<17;position++){
    const worker={position,attempts:1};
    for(let i=0;i<256;i++)recordActivity(db,{generation:1,worker,message:event('item/commandExecution/outputDelta',{itemId:'tool',delta:String(i)})});
    recordActivity(db,{generation:1,worker,message:event('item/completed',{item:{id:'reason',type:'reasoning',content:['RAW_REASONING']}})});
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM activity').get().n,4096);
  assert.equal(readActivity(db,{generation:1,position:0}).dropped,256);
  assert.doesNotMatch(JSON.stringify(db.prepare('SELECT value FROM activity').all()),/RAW_REASONING/);
});
