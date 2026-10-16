/** @lane merge
 * @subject engine/restart.mjs
 * @subject engine/controller.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {runWorkflow,readRun} from '../engine/controller.mjs';
import {fault} from '../foundation/client.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const cleanup={serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members',descendants:'notVerified',nativeTerminals:{inventoryEmpty:true,observed:0,acknowledged:0,descendants:'notVerified'}};
const backend=execute=>({identity:'restart-fixture',execute,close:async()=>cleanup});
const script='export const meta={name:"restart",description:"Reconciled restart proof"};return await parallel([()=>agent("A"),()=>agent("B"),()=>agent("C")]);';
async function setup(t){const runDir=await mkdtemp(join(tmpdir(),'workflow-restart-'));t.after(()=>rm(runDir,{recursive:true,force:true}));return{runDir,sessionId:'s',script};}
const request={position:1,attempt:1,reconciliation:'Reviewed B and C effects; rerun their work.'};

test('reconciled composed restart includes the child container and reuses the earlier no-agent prefix',async t=>{
 const {mkdir,writeFile}=await import('node:fs/promises'),{resolveAccess}=await import('../engine/access-policy.mjs');const root=await mkdtemp(join(tmpdir(),'composed-restart-'));t.after(()=>rm(root,{recursive:true,force:true}));const source=join(root,'source');await mkdir(source);
 await writeFile(join(source,'pure.mjs'),'export const meta={name:"pure",description:"no effects"};return {pure:true};');
 await writeFile(join(source,'worker.mjs'),'export const meta={name:"worker",description:"fixture"};return {answer:await agent("B",{id:"reader"})};');
 const declarations=['pure','worker'].map(alias=>({alias,source:{kind:'script',path:alias+'.mjs'},argsSchema:{type:'object'},resultSchema:{type:'object'},capabilities:{skills:null,tools:null},permissions:null}));
 const script='export const meta='+JSON.stringify({name:'restart',description:'composition',workflows:declarations})+';await agent("A");const pure=await workflow("pure",{});return {pure,worker:await workflow("worker",{})};';
 const accessPolicy=resolveAccess({sessionId:'s',parentAccess:{version:1,sessionId:'s',provenance:'codex-session-context',filesystem:'unrestricted',networkAccess:true,approvalPolicy:'never'}});let calls=[];
 const native=fail=>({...backend(async({prompt})=>{calls.push(prompt);if(fail&&prompt==='B')throw Object.assign(fault('FIXTURE','known failed effect'),{terminalObserved:true,evidence:{cleanup}});return{value:prompt+(fail?'':'2'),terminalObserved:true,evidence:{cleanup}};}),accessPolicy,parentCapabilities:{fingerprint:'a'.repeat(64),coverage:{complete:true}}});
 const input={runDir:join(root,'run'),sessionId:'s',script,launch:{cwd:source,accessPolicy}};const first=await runWorkflow({...input,backend:native(true)});assert.equal(first.workers[1].status,'failed');
 const second=await runWorkflow({...input,backend:native(false),resume:true,expectedGeneration:1,restart:request});assert.equal(second.status,'completed');assert.deepEqual(calls,['A','B','B']);assert.equal(second.result.pure.cached,true);assert.equal(second.workers[0].cached,true);assert.equal(second.workers[1].attempts,2);assert.equal(second.restart.invocationSeq,3);
});
async function initial(input,failedCleanup=cleanup){return runWorkflow({...input,backend:backend(async({prompt,onEvent})=>{
  onEvent({method:'thread/tokenUsage/updated',params:{threadId:prompt,turnId:'turn-'+prompt,tokenUsage:{total:{inputTokens:10,cachedInputTokens:0,outputTokens:2,reasoningOutputTokens:0,totalTokens:12}}}});
  if(prompt==='B')throw Object.assign(fault('TURN_CANCELLED','Cancelled'),{evidence:{cleanup:failedCleanup,attempts:[{number:1,status:'failed'}]}});
  return{value:prompt,terminalObserved:true,evidence:{cleanup,attempts:[{number:1,status:'completed'}]}};
})});}

test('reconciled restart preserves prefix and previous evidence while replacing the suffix once',async t=>{
  const input=await setup(t);const first=await initial(input);assert.equal(first.workers[1].status,'unknown');let calls=[];
  const second=await runWorkflow({...input,resume:true,expectedGeneration:1,restart:request,backend:backend(async({prompt,onEvent})=>{
    calls.push(prompt);onEvent({method:'thread/tokenUsage/updated',params:{threadId:prompt+'-2',turnId:'turn-'+prompt+'-2',tokenUsage:{total:{inputTokens:4,cachedInputTokens:0,outputTokens:1,reasoningOutputTokens:0,totalTokens:5}}}});
    return{value:prompt+'2',terminalObserved:true,evidence:{cleanup,attempts:[{number:1,status:'completed'}]}};
  })});
  assert.deepEqual(calls,['B','C']);assert.deepEqual(second.result,['A','B2','C2']);assert.equal(second.attempts,5);
  assert.equal(second.workers[0].cached,true);assert.equal(second.workers[1].attempts,2);assert.equal(second.workers[1].usage.totalTokens,17);
  assert.deepEqual(second.workers[1].priorExecutions,[{generation:1,position:1}]);assert.equal(second.restart.reconciliation,request.reconciliation);
  const db=new DatabaseSync(join(input.runDir,'run.sqlite'),{readOnly:true});
  try{const prior=JSON.parse(db.prepare('SELECT value FROM workers WHERE generation=1 AND position=1').get().value);assert.deepEqual(prior,first.workers[1]);
    const receipt=JSON.parse(db.prepare('SELECT value FROM controls WHERE id=?').get(second.restart.receiptId).value);assert.equal(receipt.status,'applied');assert.equal(receipt.sourceGeneration,1);assert.equal(receipt.generation,2);
  }finally{db.close();}
  await assert.rejects(runWorkflow({...input,resume:true,expectedGeneration:1,restart:request,backend:backend(async()=>{calls.push('unexpected');})}),{code:'REPLAY_GENERATION'});assert.equal(calls.length,2);
});

test('restart refuses uncertain cleanup, missing reconciliation and stale attempts without advancing generation',async t=>{
  const input=await setup(t);await initial(input);let calls=0;
  for(const [restart,code] of [[{...request,reconciliation:''},'RESTART_RECONCILE'],[{...request,attempt:2},'CONTROL_ATTEMPT']]){
    await assert.rejects(runWorkflow({...input,resume:true,expectedGeneration:1,restart,backend:backend(async()=>{calls++;})}),{code});
    assert.equal((await readRun(input.runDir)).generation,1);
  }
  const db=new DatabaseSync(join(input.runDir,'run.sqlite'));try{const row=JSON.parse(db.prepare('SELECT value FROM workers WHERE generation=1 AND position=2').get().value);row.evidence.cleanup.jobEmpty=false;db.prepare('UPDATE workers SET value=? WHERE generation=1 AND position=2').run(JSON.stringify(row));}finally{db.close();}
  await assert.rejects(runWorkflow({...input,resume:true,expectedGeneration:1,restart:request,backend:backend(async()=>{calls++;})}),{code:'RESTART_DRAIN'});assert.equal(calls,0);
});

test('abandoned restart admission restores the previous run without dispatch or losing its prefix',async t=>{
  const input=await setup(t);const first=await initial(input);let calls=0;
  await assert.rejects(runWorkflow({...input,resume:true,expectedGeneration:1,restart:request,backend:backend(async()=>{calls++;}),onReady:()=>{throw fault('BACKGROUND_ABANDONED','Fixture abandoned');}}),{code:'BACKGROUND_ABANDONED'});
  assert.deepEqual(await readRun(input.runDir),first);assert.equal(calls,0);
});

test('ordinary resume after a reconciled attempt failure preserves every earlier execution and spent usage',async t=>{
  const input=await setup(t);await initial(input);
  await runWorkflow({...input,resume:true,expectedGeneration:1,restart:request,backend:backend(async({prompt})=>{
    if(prompt==='B')throw Object.assign(fault('RESULT_SCHEMA','Invalid structured result'),{terminalObserved:true,evidence:{cleanup}});
    return{value:prompt,terminalObserved:true,evidence:{cleanup}};
  })});
  const third=await runWorkflow({...input,resume:true,backend:backend(async({prompt})=>({value:prompt,terminalObserved:true,evidence:{cleanup}}))});
  assert.equal(third.workers[1].attempts,3);assert.deepEqual(third.workers[1].priorExecutions,[{generation:1,position:1},{generation:2,position:1}]);assert.equal(third.workers[1].usage.totalTokens,12);
});

test('reconciliation cannot waive missing positive native terminal evidence',async t=>{
  const input=await setup(t);const missing={...cleanup};delete missing.nativeTerminals;await initial(input,missing);
  await assert.rejects(runWorkflow({...input,resume:true,expectedGeneration:1,restart:request,backend:backend(async()=>{throw Error('must not dispatch');})}),{code:'RESTART_DRAIN'});
});

test('restart cannot change execution identity, exceed the shared budget or race a second owner',async t=>{
  const input=await setup(t);await initial(input);let calls=0;
  for(const change of [{script:script.replace('agent("B")','agent("Changed")')},{args:{changed:true}},{maxAgents:999}])await assert.rejects(runWorkflow({...input,...change,resume:true,expectedGeneration:1,restart:request,backend:backend(async()=>{calls++;})}),{code:'RESTART_CHANGED'});
  assert.equal(calls,0);
  const execute=async({prompt})=>{calls++;await new Promise(resolve=>setTimeout(resolve,40));return{value:prompt,terminalObserved:true,evidence:{cleanup}};};
  const results=await Promise.allSettled([0,1].map(()=>runWorkflow({...input,resume:true,expectedGeneration:1,restart:request,backend:backend(execute)})));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.ok(['RUN_LOCKED','REPLAY_GENERATION'].includes(results.find(result=>result.status==='rejected').reason.code));assert.equal(calls,2);
  const limited=await setup(t);limited.maxAgents=3;await initial(limited);
  await assert.rejects(runWorkflow({...limited,resume:true,expectedGeneration:1,restart:request,backend:backend(async()=>{calls++;})}),{code:'AGENT_LIMIT'});assert.equal(calls,2);
});

test('authenticated restart and historical reads preserve generation boundaries through HTTP and CLI',async t=>{
  const input=await setup(t);input.launch={codex:process.execPath,cwd:input.runDir,backend:'configured'};await initial(input);
  const {createMonitor}=await import('../engine/monitor-server.mjs');let starts=0;
  const monitor=await createMonitor({runDir:input.runDir,start:async request=>{
    starts++;const run=await runWorkflow({...input,...request,backend:backend(async({prompt})=>({value:prompt+'2',terminalObserved:true,evidence:{cleanup}}))});return{generation:run.generation};
  }});t.after(()=>monitor.close());
  const url=new URL(monitor.url),headers={Authorization:`Bearer ${new URLSearchParams(url.hash.slice(1)).get('token')}`};
  const get=path=>fetch(url.origin+path,{headers});
  const post=body=>fetch(url.origin+'/api/restart',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await fetch(url.origin+'/api/restart',{method:'POST'})).status,401);
  const summary=await(await get('/api/run')).json();assert.equal(summary.restartPreview.eligible,true);assert.equal(summary.restartPreview.affected.length,2);
  assert.equal((await post({generation:1,...request,reconciliation:''})).status,400);
  const response=await post({generation:1,...request});assert.equal(response.status,202);assert.equal((await response.json()).generation,2);
  const old=await(await get('/api/worker/1?generation=2&sourceGeneration=1')).json();assert.equal(old.error.code,'TURN_CANCELLED');assert.equal(old.historyGeneration,1);
  const activity=await(await get('/api/activity?generation=2&position=1&sourceGeneration=1')).json();assert.equal(activity.sourceGeneration,1);assert.equal(activity.observed,1);
  assert.equal((await get('/api/worker/1?generation=1&sourceGeneration=1')).status,409);
  assert.equal((await get('/api/worker/1?generation=2&sourceGeneration=0')).status,400);
  const callsBefore=starts;assert.equal((await post({generation:1,...request})).status,409);assert.equal(starts,callsBefore);
  const printed=JSON.parse((await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../engine/cli.mjs',import.meta.url)),'--run',input.runDir,'--worker','1','--generation','2','--source-generation','1'],{windowsHide:true,timeout:5000})).stdout);
  assert.equal(printed.historyGeneration,1);assert.equal(printed.error.code,'TURN_CANCELLED');
});
