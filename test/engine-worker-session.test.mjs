/** @lane merge
 * @subject engine/worker-session.mjs
 * @subject foundation/turn.mjs
 * @subject test/fixtures/foundation-server.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fault} from '../foundation/client.mjs';
import {AppServer} from '../foundation/client.mjs';
import {fileURLToPath} from 'node:url';
const schema={type:'object',properties:{count:{type:'integer'}},required:['count'],additionalProperties:false};
const settings={model:'fixture-model',effort:'low',maxAttempts:5};
async function runner(){const module=await import('../engine/worker-session.mjs').catch(()=>null);assert.ok(module?.runWorkerSession,'Worker session must exist');return module.runWorkerSession;}
const result=(text,id='t')=>({text,threadId:'thread',turnId:id,status:'completed',items:[{type:'commandExecution',status:'completed',exitCode:0}]});

test('native structured answers exclude progress while invalid explicit output retains diagnostics without JSON salvage',async t=>{
  const run=await runner();
  for(const mode of ['turn-phase-explicit','turn-phase-invalid']){
    const client=await AppServer.connect({command:process.execPath,args:[fileURLToPath(new URL('./fixtures/foundation-server.mjs',import.meta.url)),mode],shutdownMs:100});
    t.after(()=>client.close());
    const input={threadId:'thread',prompt:'Count',schema,settings:{...settings,maxAttempts:1}};
    if(mode==='turn-phase-explicit'){
      const value=await run(client,input);assert.deepEqual(value.value,{count:2});assert.equal(value.evidence.attempts[0].output.answer.selection,'explicit');
    }else await assert.rejects(run(client,input),error=>{
      assert.equal(error.code,'RESULT_JSON');assert.equal(error.terminalObserved,true);assert.equal(error.evidence.attempts.length,1);
      const answer=error.evidence.attempts[0].output.answer;assert.equal(answer.selection,'explicit');assert.equal(answer.selectedItems,1);assert.match(answer.sha256,/^[a-f0-9]{64}$/);
      assert.doesNotMatch(JSON.stringify(error.evidence),/PRIVATE_PROGRESS|Do not salvage/);return true;
    });
  }
});
test('structured correction reuses the thread, reserves each extra attempt and retains command evidence',async()=>{
  const run=await runner();const seen=[];let reservations=0;
  const execution={cwd:'owned-workspace',runtimeWorkspaceRoots:['owned-workspace'],sandboxPolicy:{type:'workspaceWrite',writableRoots:[],networkAccess:false,excludeTmpdirEnvVar:true,excludeSlashTmp:true}};
  const value=await run({}, {threadId:'thread',prompt:'Count',schema,settings,execution,reserveRetry:async()=>{reservations++;},turn:async(client,input)=>{
    seen.push(input);assert.equal(reservations,seen.length-1);return result(seen.length===1?'invalid':'{"count":2}',String(seen.length));
  }});
  assert.deepEqual(value.value,{count:2});assert.equal(value.terminalObserved,true);assert.equal(seen.length,2);
  assert.deepEqual(seen.map(input=>input.threadId),['thread','thread']);assert.deepEqual(seen[0].outputSchema,schema);
  assert.equal(seen[0].model,'fixture-model');assert.equal(seen[0].effort,'low');assert.notEqual(seen[1].prompt,'Count');
  assert.equal(value.evidence.commands.length,2);assert.deepEqual(value.evidence.attempts.map(item=>item.status),['invalid','completed']);
  assert.deepEqual(seen.map(input=>input.execution),[execution,execution]);
});
test('structured correction stops at its default or explicit attempt count',async()=>{
  const run=await runner();
  for(const maxAttempts of [5,2]){
    let calls=0,reservations=0;
    await assert.rejects(run({}, {threadId:'thread',prompt:'Count',schema,settings:{...settings,maxAttempts},reserveRetry:async()=>{reservations++;},turn:async()=>{calls++;return result('{"count":"PRIVATE_SENTINEL"}');}}),error=>{
      assert.equal(error.code,'RESULT_SCHEMA');assert.equal(error.terminalObserved,true);assert.equal(error.evidence.attempts.length,maxAttempts);assert.doesNotMatch(JSON.stringify(error.evidence),/PRIVATE_SENTINEL/);return true;
    });
    assert.equal(calls,maxAttempts);assert.equal(reservations,maxAttempts-1);
  }
});
test('transport loss cancellation and exhausted lifetime budget never dispatch a correction',async()=>{
  const run=await runner();
  for(const code of ['SERVER_EXIT','TURN_CANCELLED']){
    let calls=0,reservations=0;
    await assert.rejects(run({}, {threadId:'thread',prompt:'Count',schema,settings,reserveRetry:async()=>{reservations++;},turn:async()=>{calls++;throw fault(code,'fixture failure');}}),{code});
    assert.equal(calls,1);assert.equal(reservations,0);
  }
  let calls=0;
  await assert.rejects(run({}, {threadId:'thread',prompt:'Count',schema,settings,reserveRetry:async()=>{throw fault('AGENT_LIMIT','Lifetime budget exhausted');},turn:async()=>{calls++;return result('invalid');}}),{code:'AGENT_LIMIT',terminalObserved:true});
  assert.equal(calls,1);
});
test('plain text workers return text without correction and share one overall deadline',async()=>{
  const run=await runner();let calls=0;
  assert.equal((await run({}, {threadId:'thread',prompt:'Count',settings,turn:async()=>{calls++;return result('plain text');}})).value,'plain text');
  assert.equal(calls,1);
  await assert.rejects(run({}, {threadId:'thread',prompt:'Count',settings,schema,timeoutMs:10,reserveRetry:async()=>{await new Promise(resolve=>setTimeout(resolve,20));},turn:async()=>result('invalid')}),{code:'TURN_TIMEOUT',terminalObserved:true});
});

test('native capability guidance is sent only on the initial task and survives as unverified provenance',async()=>{
  const run=await runner(),seen=[];
  const capabilities={fingerprint:'a'.repeat(64),instructions:'Use skills.list with executor authority, then skills.read.',native:{catalog:'notObserved',read:'notObserved'}};
  const value=await run({}, {threadId:'thread',prompt:'Count',schema,settings,capabilities,reserveRetry:async()=>{},turn:async(client,input)=>{
    seen.push(input);return result(seen.length===1?'invalid':'{"count":2}');
  }});
  assert.match(seen[0].prompt,/skills\.list/);
  assert.doesNotMatch(seen[1].prompt,/skills\.list|skills\.read/,'answer correction must not repeat activation guidance');
  assert.equal(Object.hasOwn(seen[0],'skills'),false,'native tools replace UserInput injection');
  assert.equal(value.evidence.capabilities.fingerprint,capabilities.fingerprint);
  assert.equal(value.evidence.capabilities.native.catalog,'notObserved');
  assert.match(seen[1].prompt,/from existing evidence/);
});

test('task execution spends only the deadline remaining after readiness',async()=>{
  const run=await runner();let calls=0;
  await assert.rejects(run({}, {threadId:'thread',prompt:'Count',settings,timeoutMs:10000,deadline:performance.now()-1,turn:async()=>{calls++;return result('too late');}}),{code:'TURN_TIMEOUT',noInference:true});
  assert.equal(calls,0);
  await run({}, {threadId:'thread',prompt:'Count',settings,timeoutMs:10000,deadline:performance.now()+80,turn:async(client,input)=>{
    assert.ok(input.timeoutMs>0&&input.timeoutMs<=80);return result('within shared budget');
  }});
});

test('a timed-out native turn retains prior command outcomes with explicit partial coverage',async t=>{
  const run=await runner();
  const client=await AppServer.connect({command:process.execPath,args:[fileURLToPath(new URL('./fixtures/foundation-server.mjs',import.meta.url)),'turn-hang-after-command'],shutdownMs:100});
  t.after(()=>client.close());
  await assert.rejects(run(client,{threadId:'thread',prompt:'Read then stall',settings,timeoutMs:200}),error=>{
    assert.equal(error.code,'TURN_TIMEOUT');
    assert.deepEqual(error.evidence.commands,[{status:'completed',exitCode:0}]);
    assert.equal(error.evidence.commandCoverage,'retainedItemsOnly');
    assert.deepEqual(error.evidence.attempts[0].output.commandEvidence,{coverage:'retainedItemsOnly',commands:[{status:'completed',exitCode:0}]});
    assert.doesNotMatch(JSON.stringify(error.evidence),/PRIVATE_COMMAND|PRIVATE_CWD|PRIVATE_OUTPUT/);
    return true;
  });
});

test('expiry while assembling an observed terminal retains its identity output and command facts',async()=>{
  const {createLiveDeadline}=await import('../engine/live-deadline.mjs'),run=await runner();
  let now=0,calls=0,reservations=0;
  const liveDeadline=createLiveDeadline(10,{clock:{now:()=>now,wallNow:()=>now,setTimeout:()=>1,clearTimeout:()=>{}}});liveDeadline.start();
  const output={observedMessages:3,observedBytes:25,commandEvidence:{coverage:'retainedItemsOnly',commands:[{status:'completed',exitCode:0}]}};
  try{
    await assert.rejects(run({}, {threadId:'thread',prompt:'Finish',schema,settings,liveDeadline,reserveRetry:async()=>{reservations++;},turn:async()=>{
      calls++;now=11;return{...result('{"count":2}','completed-turn'),output,items:[{type:'commandExecution',status:'completed',exitCode:0,command:'PRIVATE_COMMAND',aggregatedOutput:'PRIVATE_OUTPUT'}]};
    }}),error=>{
      assert.equal(error.code,'TURN_TIMEOUT');assert.equal(error.terminalObserved,true);assert.notEqual(error.noInference,true);
      assert.deepEqual(error.evidence.commands,[{status:'completed',exitCode:0}]);assert.equal(error.evidence.commandCoverage,'retainedItemsOnly');
      assert.equal(error.evidence.attempts.length,1);const attempt=error.evidence.attempts[0];
      assert.equal(attempt.turnId,'completed-turn');assert.deepEqual(attempt.output,output);
      assert.equal(attempt.status,'failed');assert.equal(attempt.error.code,'TURN_TIMEOUT');
      assert.doesNotMatch(JSON.stringify(error.evidence),/PRIVATE_COMMAND|PRIVATE_OUTPUT/);return true;
    });
    assert.equal(calls,1);assert.equal(reservations,0);
  }finally{liveDeadline.close();}
});


test('live changes extend and clear the same native turn without redispatch or interruption',async t=>{
 const {createLiveDeadline}=await import('../engine/live-deadline.mjs');
 let elapsed=0;const timers=new Map();let next=0;
 const clock={now:()=>elapsed,wallNow:()=>1700000000000+elapsed,setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:elapsed+ms});return id;},clearTimeout:id=>timers.delete(id)};
 const advance=ms=>{elapsed+=ms;for(const [id,v] of [...timers])if(v.at<=elapsed){timers.delete(id);v.fn();}};
 const liveDeadline=createLiveDeadline(100,{clock});liveDeadline.start();
 const client=await AppServer.connect({command:process.execPath,args:[fileURLToPath(new URL('./fixtures/foundation-server.mjs',import.meta.url)),'turn-steer'],shutdownMs:1000});
 const abort=new AbortController();let active;const ready=new Promise(resolve=>{active=resolve;});
 const run=await runner(),pending=run(client,{threadId:'thread',prompt:'Keep working',settings,timeoutMs:null,liveDeadline,signal:abort.signal,onActive:active});
 try{
  const identity=await Promise.race([ready,pending]);assert.ok(identity.turnId);
  advance(80);liveDeadline.apply({operation:'extend',valueMs:100,expectedRevision:0});advance(50);assert.equal(liveDeadline.signal.aborted,false);
  liveDeadline.apply({operation:'clear',expectedRevision:1});advance(2**32);assert.equal(liveDeadline.signal.aborted,false);
  assert.equal(await client.request('interrupt-count'),0);
  await client.request('turn/steer',{threadId:identity.threadId,expectedTurnId:identity.turnId,input:[{type:'text',text:'Return STEERED'}]});
  const result=await pending;assert.equal(result.value,'STEERED');assert.equal(result.evidence.attempts.length,1);assert.equal(await client.request('interrupt-count'),0);
 }finally{abort.abort();await pending.catch(()=>{});liveDeadline.close();assert.equal((await client.close()).serverExited,true);}
});

test('live shortening interrupts an owned native turn and retains the actual timeout outcome',async()=>{
 const {createLiveDeadline}=await import('../engine/live-deadline.mjs');
 const liveDeadline=createLiveDeadline(null);liveDeadline.start();
 const client=await AppServer.connect({command:process.execPath,args:[fileURLToPath(new URL('./fixtures/foundation-server.mjs',import.meta.url)),'turn-hang-after-command'],shutdownMs:1000});
 const abort=new AbortController();let active;const ready=new Promise(resolve=>{active=resolve;});
 const pending=(await runner())(client,{threadId:'thread',prompt:'Read then hold',settings,timeoutMs:null,liveDeadline,signal:abort.signal,onActive:active});
 try{await Promise.race([ready,pending]);liveDeadline.apply({operation:'set',valueMs:30,expectedRevision:0});
  await assert.rejects(pending,error=>{assert.equal(error.code,'TURN_TIMEOUT');assert.equal(error.interruption.terminalObserved,true);assert.equal(error.evidence.attempts.length,1);assert.notEqual(error.noInference,true);return true;});
  assert.equal(await client.request('interrupt-count'),1);
 }finally{abort.abort();await pending.catch(()=>{});liveDeadline.close();assert.equal((await client.close()).serverExited,true);}
});


test('a closed or not-yet-started shared deadline cannot dispatch another model turn',async()=>{
 const {createLiveDeadline}=await import('../engine/live-deadline.mjs'),run=await runner();
 for(const closed of [false,true]){const liveDeadline=createLiveDeadline(null);if(closed){liveDeadline.start();liveDeadline.close();}let calls=0;
  await assert.rejects(run({}, {threadId:'thread',prompt:'Do not dispatch',settings,liveDeadline,turn:async()=>{calls++;return result('unexpected');}}),{code:'DEADLINE_INACTIVE',noInference:true});assert.equal(calls,0);liveDeadline.close();}
});

test('parent cancellation remains operational for an unbounded native worker',async()=>{
 const client=await AppServer.connect({command:process.execPath,args:[fileURLToPath(new URL('./fixtures/foundation-server.mjs',import.meta.url)),'turn-hang'],shutdownMs:1000});
 const abort=new AbortController();let active;const ready=new Promise(resolve=>{active=resolve;});const pending=(await runner())(client,{threadId:'thread',prompt:'Hold',settings,signal:abort.signal,onActive:active});
 try{await Promise.race([ready,pending]);abort.abort();await assert.rejects(pending,{code:'TURN_CANCELLED'});assert.equal(await client.request('interrupt-count'),1);}finally{abort.abort();await pending.catch(()=>{});assert.equal((await client.close()).serverExited,true);}
});
