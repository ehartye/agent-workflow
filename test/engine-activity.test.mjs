/** @lane merge
 * @subject engine/activity.mjs
 * @subject foundation/turn.mjs
 * @subject foundation/client.mjs
 * @subject foundation/tool-observation.mjs
 * @subject test/fixtures/tool-observation-server.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {AppServer} from '../foundation/client.mjs';
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

test('native raw observations persist only projected facts with attempts and coverage intact',async t=>{
  const directory=await mkdtemp(fileURLToPath(new URL('./.tool-observation-',import.meta.url))),filename=join(directory,'activity.sqlite');
  let db;
  t.after(async()=>{if(db?.isOpen)db.close();await rm(directory,{recursive:true,force:true});});
  const {createActivityTable,recordActivity,readActivity}=await import('../engine/activity.mjs');
  db=new DatabaseSync(filename);createActivityTable(db);const worker={position:0,attempts:2};
  recordActivity(db,{generation:1,worker,message:event('item/completed',{item:{id:'old',type:'commandExecution',status:'failed',exitCode:1,aggregatedOutput:'Prior failure remains'}})});
  const old=db.prepare('SELECT value FROM activity').get().value;
  const client=await AppServer.connect({command:process.execPath,args:[fileURLToPath(new URL('./fixtures/tool-observation-server.mjs',import.meta.url)),'skill-pairs'],shutdownMs:100});
  t.after(()=>client.close());const {runTurn}=await import('../foundation/turn.mjs');
  worker.attempts=3;
  const result=await runTurn(client,{threadId:'thread',prompt:'fixture',onActive:identity=>{worker.activeTurn=identity;},onEvent:message=>recordActivity(db,{generation:1,worker,message})});
  const before=JSON.stringify(worker),beforeCount=worker.activityCount;await client.request('late-output');
  assert.equal(JSON.stringify(worker),before,'Late output cannot rewrite terminal evidence');
  const saved=()=>{
    let page=readActivity(db,{generation:1,position:0,limit:100,expectedObserved:beforeCount});const records=[...page.records];
    while(page.hasMore){page=readActivity(db,{generation:1,position:0,after:page.nextCursor,limit:100,expectedObserved:beforeCount});records.push(...page.records);}
    return{...page,records};
  };
  const page=saved();
  assert.equal(page.observed,page.records.length);assert.equal(page.dropped,0);assert.equal(page.records[0].attempt,2);
  assert.equal(page.records[0].status,'failed');
  assert.equal(db.prepare('SELECT value FROM activity WHERE seq=1').get().value,old);
  const tools=page.records.filter(record=>record.type==='nativeTool');assert.ok(tools.length>0);
  assert.ok(tools.every(record=>record.attempt===3&&['exec','wait','apply_patch','skills.list','skills.read'].includes(record.toolObservation.tool)&&!record.input&&!record.output));
  const skill=id=>tools.findLast(record=>record.itemId===id)?.toolObservation;
  for(const [id,tool] of [['skillList','skills.list'],['skillRead','skills.read']]){
    assert.deepEqual(skill(id),{tool,callId:id,family:'function',namespace:'skills',callObserved:true,outputObserved:true,outcome:'unknown',ambiguous:false});
  }
  for(const id of ['skillReuse','skillFamilyReuse','skillMismatch','skillFamily']){
    assert.equal(skill(id)?.ambiguous,true,id);assert.equal(skill(id)?.outcome,'unknown',id);
  }
  assert.equal(skill('skillReuse').namespace,'unverified');
  assert.equal(skill('skillFamilyReuse').family,'ambiguous');
  assert.equal(skill('skillMismatch').tool,'skills.list');
  assert.equal(skill('skillOutputNamespace').namespace,'unverified');
  assert.equal(skill('skillOutputNamespace').outcome,'unknown');
  assert.equal(skill('skillOutputOnly').callObserved,false);
  assert.equal(skill('skillNoOutput').outputObserved,false);
  assert.equal(skill('skillForeign').outputObserved,false);
  assert.equal(skill('skillWrapper').outcome,'unknown','A body wrapper cannot claim skill success');
  for(const id of ['skillBareList','skillPretendCanonical','skillCustom'])assert.equal(skill(id),undefined,id);
  assert.equal(tools.findLast(record=>record.itemId==='reject').toolObservation.tool,'exec');
  assert.equal(tools.findLast(record=>record.itemId==='reject').status,'reportedRejected');
  assert.equal(tools.findLast(record=>record.itemId==='wait').toolObservation.tool,'wait');
  assert.equal(tools.findLast(record=>record.itemId==='wait').status,'reportedSucceeded');
  assert.equal(tools.findLast(record=>record.itemId==='directPatch').toolObservation.tool,'apply_patch');
  assert.equal(tools.findLast(record=>record.itemId==='directPatch').status,'unknown');
  for(const id of ['supportedConflict','reorderedConflict','secondaryHeader','lateSecondaryHeader','mixedContent'])assert.equal(tools.findLast(record=>record.itemId===id).status,'unknown',id);
  assert.equal(tools.findLast(record=>record.itemId==='conflict').status,'unknown');
  assert.deepEqual(page.records.at(-1).toolObservationSummary.counters,result.output.toolObservations.counters);
  assert.doesNotMatch(JSON.stringify({page,worker,result}),/SECRET_|Bearer|private@example|encrypted|arguments|Script error|patch bytes/);
  db.close();db=new DatabaseSync(filename);
  assert.deepEqual(saved(),page,'Safe identities and coverage survive an on-disk database reopen');
  assert.equal(db.prepare('SELECT value FROM activity WHERE seq=1').get().value,old,'Prior failed attempt bytes survive unchanged');
});

const projected=(extra={})=>event('rawResponseItem/completed',{toolObservation:{tool:'exec',callId:'call',family:'custom',namespace:'absent',callObserved:true,outputObserved:true,outcome:'reportedRejected',ambiguous:false,...extra}});
test('activity refuses unprojected raw fields and validates safe tool identity without leaking extras',async t=>{
  const {db,recordActivity,readActivity}=await setup(t),worker={position:0,attempts:1,activeTurn:{threadId:'thread',turnId:'turn'}};
  recordActivity(db,{generation:1,worker,message:event('rawResponseItem/completed',{item:{type:'custom_tool_call',call_id:'call',name:'apply_patch',input:'SECRET_INPUT'}})});
  assert.equal(readActivity(db,{generation:1,position:0}).observed,0);
  const message=projected({input:'SECRET_INPUT',output:'SECRET_OUTPUT',encrypted:'SECRET_ENCRYPTED'});
  message.params.credentials='SECRET_CREDENTIAL';recordActivity(db,{generation:1,worker,message});
  const page=readActivity(db,{generation:1,position:0});assert.equal(page.observed,1);
  assert.equal(page.records[0].status,'reportedRejected');assert.doesNotMatch(JSON.stringify({page,worker}),/SECRET_|noEffects/);
  assert.equal(page.records[0].toolObservation.tool,'exec');
  assert.equal(worker.activity.summary,'exec: reportedRejected','Worker summary preserves the observed outer tool identity');
  assert.deepEqual(Object.keys(page.records[0].toolObservation).sort(),['tool','callId','family','namespace','callObserved','outputObserved','outcome','ambiguous'].sort());
  for(const bad of [projected({callId:''}),projected({callId:'x'.repeat(201)}),projected({tool:'other'}),projected({tool:'apply_patch'}),
    projected({family:'function'}),projected({namespace:'unverified'}),projected({callObserved:false}),projected({outputObserved:false}),
    projected({callId:'💡'.repeat(51)}),projected({outcome:'noEffects'}),projected({callObserved:'yes'}),projected({namespace:'functions'}),projected({outcome:'reportedSucceeded',ambiguous:true}),
    projected({tool:'skills.read',family:'function',namespace:'skills',outcome:'reportedSucceeded'}),
    projected({tool:'skills.read',family:'custom',namespace:'skills',outcome:'unknown'}),
    projected({tool:'skills.list',family:'function',namespace:'absent',outcome:'unknown'}),
    projected({tool:'exec',namespace:'skills',outcome:'unknown'}),
    projected({tool:'skills.read',family:'ambiguous',namespace:'skills',outcome:'unknown',ambiguous:false})]){
    assert.throws(()=>recordActivity(db,{generation:1,worker,message:bad}),{code:'ACTIVITY_INPUT'});
  }
  const foreign=projected();foreign.params.turnId='other';
  assert.throws(()=>recordActivity(db,{generation:1,worker,message:foreign}),{code:'ACTIVITY_INPUT'});
  assert.equal(readActivity(db,{generation:1,position:0,expectedObserved:1}).observed,1);
  const summary={source:'rawResponseItem/completed',capability:'unverified',limit:256,observed:2,trackedIds:1,retained:1,paired:1,
    counters:{malformed:0,duplicate:0,conflicting:0,discarded:0,overflow:0,unconfirmedDiscarded:0,foreign:0,unsupported:0,missingCall:0,missingOutput:0},credentials:'SECRET_CREDENTIAL'};
  const terminal=value=>event('turn/completed',{turnId:undefined,turn:{id:'turn',status:'completed'},toolObservationSummary:value});
  recordActivity(db,{generation:1,worker,message:terminal(summary)});
  assert.doesNotMatch(JSON.stringify(readActivity(db,{generation:1,position:0})),/SECRET_/);
  for(const bad of [{...summary,observed:-1},{...summary,trackedIds:257},{...summary,paired:0},{...summary,counters:{...summary.counters,missingCall:-1}}]){
    assert.throws(()=>recordActivity(db,{generation:1,worker,message:terminal(bad)}),{code:'ACTIVITY_INPUT'});
  }
  assert.equal(readActivity(db,{generation:1,position:0,expectedObserved:2}).observed,2);
});

test('tool observation and coverage rollback leave accepted worker state unchanged',async t=>{
  const {db,recordActivity,readActivity}=await setup(t),worker={position:0,attempts:1,activeTurn:{threadId:'thread',turnId:'turn'}};
  recordActivity(db,{generation:1,worker,message:projected()});const before=structuredClone(worker);
  // Same clone/transaction ownership as controller.saveWorker; no observer state
  // may live outside this rollback boundary in the activity store.
  db.exec("CREATE TRIGGER reject_tool BEFORE INSERT ON activity_counts BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
  const next=structuredClone(worker);db.exec('BEGIN IMMEDIATE');
  assert.throws(()=>recordActivity(db,{generation:1,worker:next,message:projected({callId:'replacement'})}),/fixture rollback/);
  db.exec('ROLLBACK');assert.deepEqual(worker,before);assert.deepEqual(next,before);
  assert.equal(readActivity(db,{generation:1,position:0,expectedObserved:before.activityCount}).observed,1);
});

test('bounded native tool history discloses discards and async delivery remains observable',async t=>{
  const {db,recordActivity,readActivity}=await setup(t),worker={position:0,attempts:1,activeTurn:{threadId:'thread',turnId:'turn'}};
  for(let i=0;i<270;i++)recordActivity(db,{generation:1,worker,message:projected({callId:`call-${i}`})});
  recordActivity(db,{generation:1,worker,message:event('item/completed',{item:{id:'notice',type:'agentMessage',phase:'final_answer',delivery:'async',text:'Notice'}})});
  const page=readActivity(db,{generation:1,position:0,after:0,limit:100,expectedObserved:worker.activityCount});
  assert.equal(page.observed,271);assert.equal(page.retained,256);assert.equal(page.dropped,15);
  const last=readActivity(db,{generation:1,position:0,after:270,limit:100}).records.at(-1);
  assert.equal(last.phase,'final_answer');assert.equal(last.delivery,'async');assert.equal(last.output,'Notice');
});
