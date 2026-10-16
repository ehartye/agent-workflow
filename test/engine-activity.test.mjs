/** @lane merge
 * @subject engine/activity.mjs
 * @subject foundation/turn.mjs
 * @subject foundation/client.mjs
 * @subject foundation/tool-observation.mjs
 * @subject test/fixtures/tool-observation-server.mjs
 * @subject test/fixtures/foundation-server.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {AppServer} from '../foundation/client.mjs';
async function setup(t){const module=await import('../engine/activity.mjs').catch(()=>null);assert.ok(module?.recordActivity,'Activity store must exist');const db=new DatabaseSync(':memory:');t.after(()=>db.close());module.createActivityTable(db);return{...module,db};}
const event=(method,params={})=>({method,params:{threadId:'thread',turnId:'turn',...params}});

test('completed messages survive raw-tail pressure without changing raw counts or cursors',async t=>{
  const {db,recordActivity,readActivity,readCompletedMessages}=await setup(t);
  assert.equal(typeof readCompletedMessages,'function','Completed messages need independent bounded retention');
  const worker={position:2,attempts:7,activeTurn:{threadId:'thread',turnId:'turn'}};
  recordActivity(db,{generation:3,worker,message:event('item/completed',{item:{id:'answer',type:'agentMessage',text:'Retained terminal answer'}})});
  for(let i=0;i<300;i++)recordActivity(db,{generation:3,worker,message:event('item/agentMessage/delta',{itemId:'noise',delta:String(i)})});
  const raw=readActivity(db,{generation:3,position:2,after:0,limit:100,expectedObserved:301});
  assert.equal(worker.activityCount,301);assert.equal(raw.observed,301);assert.equal(raw.retained,256);assert.equal(raw.dropped,45);
  assert.equal(raw.records[0].seq,46);assert.equal(raw.nextCursor,145);assert.equal(raw.hasMore,true);
  const messages=readCompletedMessages(db,{generation:3,position:2});
  assert.equal(messages.available,true);assert.equal(messages.records.length,1);
  assert.equal(messages.records[0].text,'Retained terminal answer');assert.equal(messages.records[0].terminalSeq,1);
  assert.equal(messages.records[0].attempt,7);assert.equal(messages.records[0].complete,true);
  assert.equal(messages.nextCursor,1);assert.equal(messages.hasMore,false);
  assert.equal(messages.counts.terminalNotificationsObserved,1);assert.equal(messages.counts.insertions,1);
  db.exec('UPDATE activity_counts SET observed=256 WHERE generation=3 AND position=2');
  assert.throws(()=>readActivity(db,{generation:3,position:2,expectedObserved:301}),{code:'ACTIVITY_CORRUPT'},'Keeping messages must not conceal a reset raw counter');
  db.exec('UPDATE activity_counts SET observed=301 WHERE generation=3 AND position=2');
});

test('completed history bounds UTF-8 bytes and discloses duplicates replacements and conflicts',async t=>{
  const {db,recordActivity,readActivity,readCompletedMessages}=await setup(t);
  assert.equal(typeof readCompletedMessages,'function');
  const worker={position:0,attempts:1},terminal=(id,text,extra={})=>event('item/completed',{item:{id,type:'agentMessage',text,...extra}});
  recordActivity(db,{generation:1,worker,message:terminal('answer','prefix',{truncated:['text']})});
  recordActivity(db,{generation:1,worker,message:terminal('answer','prefix',{truncated:['text']})});
  recordActivity(db,{generation:1,worker,message:terminal('answer','prefix complete')});
  const accepted=readCompletedMessages(db,{generation:1,position:0});
  assert.deepEqual([accepted.counts.terminalNotificationsObserved,accepted.counts.insertions,accepted.counts.replacements,accepted.counts.duplicateNoops],[3,1,1,1]);
  assert.equal(accepted.records[0].terminalSeq,3);assert.equal(accepted.records[0].complete,true);
  const before=structuredClone(worker);
  db.exec('BEGIN IMMEDIATE');
  assert.throws(()=>recordActivity(db,{generation:1,worker,message:terminal('answer','contradiction')}),{code:'ACTIVITY_CORRUPT'});db.exec('ROLLBACK');
  assert.deepEqual(worker,before);assert.deepEqual(readCompletedMessages(db,{generation:1,position:0}),accepted);
  recordActivity(db,{generation:1,worker,message:terminal('large','💡'.repeat(9000))});
  recordActivity(db,{generation:1,worker,message:event('item/agentMessage/delta',{itemId:'large',delta:'never completes a terminal'})});
  const page=readCompletedMessages(db,{generation:1,position:0,limit:1});assert.equal(page.hasMore,true);assert.equal(page.nextCursor,3);
  const next=readCompletedMessages(db,{generation:1,position:0,after:page.nextCursor});const large=next.records[0];
  assert.equal(Buffer.byteLength(large.text),32768);assert.equal(large.text.isWellFormed(),true);assert.equal(large.complete,false);assert.ok(large.truncations.includes('textBytes'));
  assert.equal(Buffer.byteLength(JSON.stringify(large)),large.bytes);assert.ok(large.bytes<=36864);
  const stored=db.prepare('SELECT * FROM completed_messages WHERE id=?').get(large.id),forged={...large,complete:true};
  forged.bytes=Buffer.byteLength(JSON.stringify(forged));const body=JSON.stringify(forged);db.prepare('UPDATE completed_messages SET bytes=?,value=? WHERE id=?').run(Buffer.byteLength(body),body,large.id);
  assert.throws(()=>readCompletedMessages(db,{generation:1,position:0}),{code:'ACTIVITY_CORRUPT'},'A truncated terminal cannot be relabeled complete');
  db.prepare('UPDATE completed_messages SET bytes=?,value=? WHERE id=?').run(stored.bytes,stored.value,large.id);
  assert.equal(next.nextCursor,4);assert.equal(next.hasMore,false);assert.equal(next.counts.terminalNotificationsObserved,4);
  worker.attempts=2;recordActivity(db,{generation:1,worker,message:terminal('answer','another attempt')});
  recordActivity(db,{generation:1,worker,message:{...terminal('answer','another turn'),params:{...terminal('answer','another turn').params,turnId:'other'}}});
  assert.equal(readCompletedMessages(db,{generation:1,position:0}).counts.retained,4);
  assert.equal(readActivity(db,{generation:1,position:0}).observed,7);
});

test('completed message count and byte eviction preserve accounting on reopen and old storage stays read-only',async t=>{
  const directory=await mkdtemp(fileURLToPath(new URL('./.command-facts-',import.meta.url))),filename=join(directory,'messages.sqlite');let db;
  t.after(async()=>{if(db?.isOpen)db.close();await rm(directory,{recursive:true,force:true});});
  const {createActivityTable,recordActivity,readCompletedMessages}=await import('../engine/activity.mjs');assert.equal(typeof readCompletedMessages,'function');
  db=new DatabaseSync(filename);createActivityTable(db);const worker={position:0,attempts:1};
  const add=(id,text='terminal')=>recordActivity(db,{generation:1,worker,message:event('item/completed',{item:{id,type:'agentMessage',text}})});
  for(let i=0;i<70;i++)add(`count-${i}`);
  let page=readCompletedMessages(db,{generation:1,position:0});assert.equal(page.counts.retained,64);assert.equal(page.counts.evictedCountLimit,6);assert.equal(page.counts.evictedByteLimit,0);
  for(let i=0;i<40;i++)add(`bytes-${i}`,'💡'.repeat(8192));
  page=readCompletedMessages(db,{generation:1,position:0});assert.ok(page.counts.evictedByteLimit>0);assert.ok(page.counts.retainedBytes<=1048576);
  const c=page.counts;assert.equal(c.retained,c.insertions-c.evictedCountLimit-c.evictedByteLimit);assert.equal(c.terminalNotificationsObserved,c.insertions+c.replacements+c.duplicateNoops);
  add('count-0');assert.equal(readCompletedMessages(db,{generation:1,position:0}).counts.insertions,111,'Evicted identities reobserved count as new insertions');
  const saved=readCompletedMessages(db,{generation:1,position:0});db.close();db=new DatabaseSync(filename);createActivityTable(db);assert.deepEqual(readCompletedMessages(db,{generation:1,position:0}),saved);
  db.exec('DROP TABLE completed_messages;DROP TABLE completed_message_counts');db.close();db=new DatabaseSync(filename,{readOnly:true});
  const legacy=readCompletedMessages(db,{generation:1,position:0});assert.equal(legacy.available,false);assert.equal(legacy.coverage,'legacyRawOnly');assert.equal(legacy.priorActivityUncovered,111);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'completed_message%'").get().n,0);
  db.close();db=new DatabaseSync(filename);createActivityTable(db);add('new');createActivityTable(db);
  assert.equal(readCompletedMessages(db,{generation:1,position:0}).counts.priorActivityUncovered,111);
});

test('generation message budgets and corrupt metadata cannot claim complete coverage',async t=>{
  const {db,recordActivity,readCompletedMessages}=await setup(t);assert.equal(typeof readCompletedMessages,'function');
  for(let position=0;position<5;position++)for(let i=0;i<64;i++)recordActivity(db,{generation:1,worker:{position,attempts:1},message:event('item/completed',{item:{id:`small-${i}`,type:'agentMessage',text:'small'}})});
  assert.equal(db.prepare('SELECT count(*) AS n FROM completed_messages').get().n,256);
  assert.equal(readCompletedMessages(db,{generation:1,position:0}).counts.evictedCountLimit,64);
  for(let position=5;position<10;position++)for(let i=0;i<31;i++)recordActivity(db,{generation:1,worker:{position,attempts:1},message:event('item/completed',{item:{id:`large-${i}`,type:'agentMessage',text:'💡'.repeat(8192)}})});
  assert.ok(db.prepare('SELECT sum(bytes) AS n FROM completed_messages').get().n<=4194304);
  const row=db.prepare('SELECT * FROM completed_messages LIMIT 1').get();
  db.prepare('UPDATE completed_messages SET bytes=1,value=? WHERE id=?').run('x'.repeat(40000),row.id);
  assert.throws(()=>readCompletedMessages(db,{generation:1,position:row.position}),{code:'ACTIVITY_CORRUPT'});
  db.prepare('UPDATE completed_messages SET bytes=?,value=? WHERE id=?').run(row.bytes,row.value,row.id);
  db.prepare('UPDATE completed_message_counts SET insertions=insertions+1 WHERE generation=1 AND position=?').run(row.position);
  assert.throws(()=>readCompletedMessages(db,{generation:1,position:row.position}),{code:'ACTIVITY_CORRUPT'});
});

test('JSON expansion truncates terminal text explicitly and message responses stay bounded',async t=>{
  const {db,recordActivity,readCompletedMessages}=await setup(t),worker={position:0,attempts:1};
  recordActivity(db,{generation:1,worker,message:event('item/completed',{item:{id:'escaped',type:'agentMessage',text:'\u0000'.repeat(10000)}})});
  let page=readCompletedMessages(db,{generation:1,position:0});const escaped=page.records[0];
  assert.equal(escaped.complete,false);assert.ok(escaped.truncations.includes('recordBytes'));assert.ok(escaped.bytes<=36864);assert.equal(escaped.bytes,Buffer.byteLength(JSON.stringify(escaped)));
  recordActivity(db,{generation:1,worker,message:event('item/completed',{item:{id:'escaped',type:'agentMessage',text:'\u0000'.repeat(10000)}})});
  assert.equal(readCompletedMessages(db,{generation:1,position:0}).counts.duplicateNoops,1);
  for(let i=0;i<40;i++)recordActivity(db,{generation:1,worker,message:event('item/completed',{item:{id:`large-${i}`,type:'agentMessage',text:'💡'.repeat(8192)}})});
  page=readCompletedMessages(db,{generation:1,position:0,limit:100});assert.ok(Buffer.byteLength(JSON.stringify(page))<1048576);assert.equal(page.hasMore,true,'Large pages split before the JSON response bound');
  let loaded=page.records.length;
  while(page.hasMore){const next=readCompletedMessages(db,{generation:1,position:0,after:page.nextCursor,limit:100});assert.ok(next.records[0].terminalSeq>page.nextCursor);assert.ok(Buffer.byteLength(JSON.stringify(next))<1048576);loaded+=next.records.length;page=next;}
  assert.equal(loaded,page.counts.retained);assert.equal(readCompletedMessages(db,{generation:1,position:0,after:page.nextCursor}).nextCursor,page.nextCursor);
});

test('command facts survive delta pressure and database reopen without retaining command bodies',async t=>{
  const directory=await mkdtemp(fileURLToPath(new URL('./.command-facts-',import.meta.url)));
  let db; t.after(async()=>{if(db?.isOpen)db.close();await rm(directory,{recursive:true,force:true});});
  const {createActivityTable,recordActivity,readActivity}=await import('../engine/activity.mjs');
  const filename=join(directory,'activity.sqlite');db=new DatabaseSync(filename);createActivityTable(db);
  const worker={position:3,attempts:7},command='pwsh -Command "SECRET_TOKEN=private; exit 7"';
  db.exec('BEGIN IMMEDIATE');
  for(const method of ['item/started','item/completed'])recordActivity(db,{generation:2,worker,message:event(method,{item:{id:'early',type:'commandExecution',command,status:method==='item/started'?'inProgress':'failed',exitCode:method==='item/completed'?7:undefined,aggregatedOutput:'SECRET_OUTPUT'}})});
  for(let i=0;i<3000;i++)recordActivity(db,{generation:2,worker,message:event(i%2?'item/agentMessage/delta':'item/commandExecution/outputDelta',{itemId:'noise',delta:'pressure'})});
  db.exec('COMMIT');
  const page=readActivity(db,{generation:2,position:3});
  assert.equal(page.retained,256);assert.equal(page.records.some(row=>row.itemId==='early'),false);
  const facts=page.commandFacts;assert.ok(facts,'Command facts have independent retention');
  assert.equal(facts.observed,2);assert.equal(facts.retained,2);assert.equal(facts.dropped,0);
  assert.deepEqual(facts.records.map(row=>[row.generation,row.position,row.attempt,row.event,row.itemId,row.exitCode,row.outcome]),[[2,3,7,'started','early',null,'unknown'],[2,3,7,'completed','early',7,'failed']]);
  assert.deepEqual(facts.records[0].command,{representation:'sha256',encoding:'utf8',bytes:Buffer.byteLength(command),sha256:createHash('sha256').update(command).digest('hex')});
  assert.doesNotMatch(JSON.stringify(facts),/SECRET_|pwsh|private|pressure/);
  assert.deepEqual(readActivity(db,{generation:2,position:3,after:page.nextCursor+4000,limit:1}).commandFacts,facts,'Fact envelope does not depend on activity paging');
  db.close();db=new DatabaseSync(filename);createActivityTable(db);
  assert.deepEqual(readActivity(db,{generation:2,position:3}).commandFacts,facts);
  assert.equal(readActivity(db,{generation:1,position:3}).commandFacts.observed,0);
  db.exec('BEGIN IMMEDIATE');
  for(let i=0;i<140;i++)recordActivity(db,{generation:2,worker,message:event('item/started',{item:{id:`later-${i}`,type:'commandExecution'}})});
  db.exec('COMMIT');
  const evicted=readActivity(db,{generation:2,position:3}).commandFacts;
  assert.equal(evicted.observed,142);assert.equal(evicted.retained,128);assert.deepEqual(evicted.evicted,{countLimit:14,byteLimit:0});
  db.close();db=new DatabaseSync(filename);createActivityTable(db);
  assert.deepEqual(readActivity(db,{generation:2,position:3}).commandFacts,evicted,'Nonzero eviction counters survive reopen');
});

test('command fact count and byte budgets disclose worker and generation evictions',async t=>{
  const {db,recordActivity,readActivity}=await setup(t);
  const append=(generation,position,n,wide=false)=>{
    const worker={position,attempts:position+1};
    for(let i=0;i<n;i++)recordActivity(db,{generation,worker,message:event('item/completed',{threadId:wide?'t'.repeat(200):'thread',turnId:wide?'u'.repeat(200):'turn',item:{id:wide?String(i).padEnd(200,'i'):String(i),type:'commandExecution',command:'fixture',status:'completed',exitCode:0}})});
  };
  append(1,0,140);
  const counted=readActivity(db,{generation:1,position:0}).commandFacts;
  assert.equal(counted.retained,128);assert.equal(counted.evicted.countLimit,12);assert.equal(counted.evicted.byteLimit,0);assert.equal(counted.records[0].itemId,'12');
  append(2,0,100,true);
  const bytes=readActivity(db,{generation:2,position:0}).commandFacts;
  assert.ok(bytes.retained<100);assert.ok(bytes.retainedBytes<=65536);assert.equal(bytes.evicted.countLimit,0);assert.equal(bytes.evicted.byteLimit,100-bytes.retained);
  for(let position=0;position<9;position++)append(3,position,120);
  let retained=0,dropped=0;
  for(let position=0;position<9;position++){
    const facts=readActivity(db,{generation:3,position}).commandFacts;
    retained+=facts.retained;dropped+=facts.dropped;
    assert.equal(facts.observed,facts.retained+facts.evicted.countLimit+facts.evicted.byteLimit);
    assert.ok(facts.records.every(row=>row.position===position&&row.attempt===position+1&&Buffer.byteLength(JSON.stringify(row))<=2048));
  }
  assert.equal(retained,1024);assert.equal(dropped,56);
  for(let position=0;position<10;position++)append(4,position,60,true);
  let totalBytes=0,byteEvicted=0;
  for(let position=0;position<10;position++){
    const facts=readActivity(db,{generation:4,position}).commandFacts;
    totalBytes+=facts.retainedBytes;byteEvicted+=facts.evicted.byteLimit;
  }
  assert.ok(totalBytes<=524288);assert.ok(byteEvicted>0);
});

test('command facts distinguish omissions and explicit timeout from unknown outcomes',async t=>{
  const {db,recordActivity,readActivity}=await setup(t),worker={position:0,attempts:2};
  const cases=[{command:['node','--version'],exitCode:0},{command:'x'.repeat(65537),exitCode:7},{command:'partial',truncated:['command']},{command:{private:'SECRET_SHAPE'}},{status:'timedOut'},{status:'completed'},{status:'failed',exitCode:124},{timedOut:true,exitCode:124},{status:'failed',exitCode:0}];
  for(const [i,extra] of cases.entries())recordActivity(db,{generation:1,worker,message:event('item/completed',{item:{id:String(i),type:'commandExecution',...extra}})});
  const facts=readActivity(db,{generation:1,position:0}).commandFacts;
  assert.deepEqual(facts.records.map(row=>row.outcome),['succeeded','failed','unknown','unknown','timedOut','unknown','failed','timedOut','failed']);
  assert.deepEqual(facts.records.map(row=>row.command.reason),[undefined,'hashInputLimit','sourceTruncated','unsupportedShape','notProvided','notProvided','notProvided','notProvided','notProvided']);
  assert.equal(facts.records[0].command.encoding,'argvJsonUtf8');assert.doesNotMatch(JSON.stringify(facts),/SECRET_SHAPE|--version|partial/);
  worker.attempts=3;recordActivity(db,{generation:1,worker,message:event('item/completed',{item:{id:'0',type:'commandExecution',exitCode:9}})});
  assert.deepEqual(readActivity(db,{generation:1,position:0}).commandFacts.records.filter(row=>row.itemId==='0').map(row=>[row.attempt,row.exitCode]),[[2,0],[3,9]]);
});

test('missing or invalid command coverage cannot claim an empty complete history',async t=>{
  const {db,recordActivity,readActivity}=await setup(t),worker={position:0,attempts:1};
  recordActivity(db,{generation:1,worker,message:event('item/agentMessage/delta',{itemId:'answer',delta:'text'})});
  db.exec('DELETE FROM command_fact_counts');
  assert.throws(()=>readActivity(db,{generation:1,position:0}),{code:'ACTIVITY_CORRUPT'});
  db.exec('INSERT INTO command_fact_counts(generation,position,observed,evicted_count) VALUES(1,0,-1,-1)');
  assert.throws(()=>readActivity(db,{generation:1,position:0}),{code:'ACTIVITY_CORRUPT'});
  db.exec('UPDATE command_fact_counts SET observed=0,evicted_count=0');
  recordActivity(db,{generation:1,worker,message:event('item/completed',{item:{id:'command',type:'commandExecution',command:'private',exitCode:0}})});
  const row=db.prepare('SELECT seq,bytes,value FROM command_facts').get();
  for(const mutate of [value=>{value.position=99;},value=>{value.extraPayload='SECRET';},value=>{value.command.sha256='invalid';},value=>{value.event='started';},value=>{value.at='invalid';},value=>{value.exitCode=7;value.outcome='succeeded';},value=>{value.status='declined';value.outcome='succeeded';},value=>{value.status='interrupted';value.outcome='succeeded';}]){
    const value=JSON.parse(row.value);mutate(value);const body=JSON.stringify(value);db.prepare('UPDATE command_facts SET bytes=?,value=? WHERE seq=?').run(Buffer.byteLength(body),body,row.seq);
    assert.throws(()=>readActivity(db,{generation:1,position:0}),{code:'ACTIVITY_CORRUPT'});
  }
  for(const bytes of [-1,row.bytes+1]){db.prepare('UPDATE command_facts SET bytes=?,value=? WHERE seq=?').run(bytes,row.value,row.seq);assert.throws(()=>readActivity(db,{generation:1,position:0}),{code:'ACTIVITY_CORRUPT'});}
  db.prepare('UPDATE command_facts SET bytes=1,value=? WHERE seq=?').run(' '.repeat(4096),row.seq);assert.throws(()=>readActivity(db,{generation:1,position:0}),{code:'ACTIVITY_CORRUPT'});
  db.prepare('UPDATE command_facts SET bytes=?,value=? WHERE seq=?').run(row.bytes,row.value,row.seq);assert.equal(readActivity(db,{generation:1,position:0}).commandFacts.retained,1);
});

test('initializing fact storage exposes prior activity as uncovered without backfilling previews',async t=>{
  const {db,createActivityTable,recordActivity,readActivity}=await setup(t),worker={position:0,attempts:1};
  recordActivity(db,{generation:1,worker,message:event('item/completed',{item:{id:'old',type:'commandExecution',command:'old preview',exitCode:1}})});
  const before=db.prepare('SELECT value FROM activity').get().value;
  db.exec('DROP TABLE command_facts; DROP TABLE command_fact_counts');createActivityTable(db);
  const facts=readActivity(db,{generation:1,position:0}).commandFacts;
  assert.equal(facts.priorActivityUncovered,1);assert.equal(facts.observed,0);assert.deepEqual(facts.records,[]);
  worker.attempts=2;recordActivity(db,{generation:1,worker,message:event('item/completed',{item:{id:'new',type:'commandExecution',exitCode:0}})});
  createActivityTable(db);
  const later=readActivity(db,{generation:1,position:0}).commandFacts;
  assert.equal(later.priorActivityUncovered,1);assert.equal(later.observed,1);assert.equal(later.records[0].command.reason,'notProvided');
  assert.equal(db.prepare('SELECT value FROM activity WHERE seq=1').get().value,before);
});

test('native notification fixture retains command identities through answer pressure',async t=>{
  const {db,recordActivity,readActivity}=await setup(t),worker={position:4,attempts:3};
  const client=await AppServer.connect({command:process.execPath,args:[fileURLToPath(new URL('./fixtures/foundation-server.mjs',import.meta.url)),'turn-command-pressure'],shutdownMs:100});
  t.after(()=>client.close());const {runTurn}=await import('../foundation/turn.mjs');
  const result=await runTurn(client,{threadId:'thread',prompt:'fixture',timeoutMs:5000,onActive:identity=>{worker.activeTurn=identity;},onEvent:message=>recordActivity(db,{generation:5,worker,message})});
  const page=readActivity(db,{generation:5,position:4});
  assert.equal(result.text,'thread');assert.equal(result.status,'completed');assert.ok(page.dropped>2000);
  assert.deepEqual(page.commandFacts.records.map(row=>[row.threadId,row.turnId,row.event,row.exitCode,row.outcome]),[['thread','turn-thread','started',null,'unknown'],['thread','turn-thread','completed',7,'failed']]);
  assert.equal(page.commandFacts.records[1].command.reason,'notProvided','Completion without a body cannot claim an argv');
  assert.doesNotMatch(JSON.stringify(page.commandFacts),/SECRET_|RAW_REASONING|WRONG/);
  assert.equal(await client.request('interrupt-count'),0);
});

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

test('activity facts and coverage rollback leave accepted worker state unchanged',async t=>{
  const {db,recordActivity,readActivity}=await setup(t),worker={position:0,attempts:1,activeTurn:{threadId:'thread',turnId:'turn'}};
  recordActivity(db,{generation:1,worker,message:projected()});const before=structuredClone(worker);
  // Same clone/transaction ownership as controller.saveWorker; no observer state
  // may live outside this rollback boundary in the activity store.
  db.exec("CREATE TRIGGER reject_tool BEFORE INSERT ON activity_counts BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
  const accepted=readActivity(db,{generation:1,position:0,expectedObserved:before.activityCount});
  for(const message of [projected({callId:'replacement'}),event('item/started',{item:{id:'rolled-back',type:'commandExecution',command:'SECRET_ROLLBACK'}})]){
    const next=structuredClone(worker);db.exec('BEGIN IMMEDIATE');
    assert.throws(()=>recordActivity(db,{generation:1,worker:next,message}),/fixture rollback/);
    db.exec('ROLLBACK');assert.deepEqual(worker,before);assert.deepEqual(next,before);
    assert.deepEqual(readActivity(db,{generation:1,position:0,expectedObserved:before.activityCount}),accepted);
  }
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
