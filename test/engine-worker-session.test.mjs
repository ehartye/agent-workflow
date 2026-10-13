/** @lane merge
 * @subject engine/worker-session.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fault} from '../foundation/client.mjs';
const schema={type:'object',properties:{count:{type:'integer'}},required:['count'],additionalProperties:false};
const settings={model:'fixture-model',effort:'low',maxAttempts:5};
async function runner(){const module=await import('../engine/worker-session.mjs').catch(()=>null);assert.ok(module?.runWorkerSession,'Worker session must exist');return module.runWorkerSession;}
const result=(text,id='t')=>({text,threadId:'thread',turnId:id,status:'completed',items:[{type:'commandExecution',status:'completed',exitCode:0}]});
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
