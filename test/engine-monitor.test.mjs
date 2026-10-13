/** @lane merge
 * @subject engine/monitor-server.mjs
 * @subject engine/monitor-data.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {request} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {runWorkflow} from '../engine/controller.mjs';

const reportSchema={type:'object',additionalProperties:false,properties:{
  contract:{const:'agent-workflow.task.v1'},taskId:{type:'string',maxLength:100},outcome:{enum:['delivered','blocked','incomplete']},summary:{type:'string',maxLength:2000},
  blockers:{type:'array',maxItems:16,items:{type:'object',additionalProperties:false,properties:{code:{type:'string'},detail:{type:'string'},evidenceRefs:{type:'array',items:{type:'string'}}},required:['code','detail','evidenceRefs']}},
  artifacts:{type:'array',maxItems:32,items:{type:'object',additionalProperties:false,properties:{claimId:{type:'string'},relativePath:{type:'string'},sha256:{type:['string','null']},bytes:{type:['integer','null']}},required:['claimId','relativePath','sha256','bytes']}},
  checks:{type:'array',maxItems:32,items:{type:'object',additionalProperties:false,properties:{checkId:{type:'string'},status:{enum:['passed','failed','notRun','unknown']},evidenceRefs:{type:'array',items:{type:'string'}}},required:['checkId','status','evidenceRefs']}},
},required:['contract','taskId','outcome','summary','blockers','artifacts','checks']};
const report=(outcome='delivered')=>({contract:'agent-workflow.task.v1',taskId:'phone-game',outcome,summary:'Source authored',blockers:[],artifacts:[{claimId:'game',relativePath:'game.mjs',sha256:null,bytes:null}],checks:[]});

test('experience preserves full phase identities, explicit empty dependencies and unverified completed prose',async()=>{
  const {projectMonitorExperience}=await import('../engine/monitor-data.mjs');
  const run={dataInstanceId:'data',runId:'run',runtimeId:'retained'};
  const label='Build Tidepool '+'x'.repeat(490);
  const workers=[{position:0,status:'completed',phase:label,dependencies:[],result:'E_BROWSER_MISSING: done'}, {position:1,status:'unknown',phase:label+'y',result:{outcome:'delivered'}}];
  const projection=projectMonitorExperience({run,summary:{generation:4,status:'failed'},workers});
  assert.equal(projection.phases.length,2);assert.equal(projection.phases[0].label,label);
  assert.notEqual(projection.phases[0].key,projection.phases[1].key);
  assert.deepEqual(projection.workers[0].dependencies,{available:true,prerequisites:[]});
  assert.equal(projection.workers[1].dependencies.available,false);
  assert.equal(projection.workers[0].task.declaredOutcome,null);assert.equal(projection.workers[0].task.verification,'unverified');
  assert.equal(projection.executionStatus,'failed');assert.equal(workers[1].status,'unknown');
});

test('task delivery needs schema validation and independent retained integrity and acceptance evidence',async()=>{
  const {projectMonitorExperience}=await import('../engine/monitor-data.mjs');
  const run={dataInstanceId:'data',runId:'run',runtimeId:'retained'}, summary={generation:4,status:'completed'};
  const workers=[{position:0,status:'completed',options:{schema:reportSchema},result:report('blocked')},{position:1,status:'completed',options:{schema:reportSchema},result:report()}];
  let projection=projectMonitorExperience({run,summary,workers});
  assert.equal(projection.workers[0].executionStatus,'completed');assert.equal(projection.workers[0].task.declaredOutcome,'blocked');
  assert.equal(projection.workers[1].task.verification,'unverified');
  const evidence=[{id:'capture',worker:{...run,generation:4,position:1},claimId:'game',integrity:'missing',acceptance:'passed',evidenceRef:{receiptId:'retained-receipt'}}];
  projection=projectMonitorExperience({run,summary,workers,evidence});assert.equal(projection.workers[1].task.verification,'rejected');assert.equal(projection.workers[1].task.declaredOutcome,'delivered');
  for(const integrity of ['mismatch','unavailable','unverified']){
    projection=projectMonitorExperience({run,summary,workers,evidence:[{...evidence[0],integrity}]});assert.notEqual(projection.workers[1].task.verification,'verified');
  }
  projection=projectMonitorExperience({run,summary,workers,evidence:[{...evidence[0],integrity:'verified',acceptance:'notRun'}]});assert.equal(projection.workers[1].task.verification,'unverified');
  projection=projectMonitorExperience({run,summary,workers,evidence:[{...evidence[0],integrity:'verified'}]});assert.equal(projection.workers[1].task.verification,'verified');
  projection=projectMonitorExperience({run,summary,workers,evidence:[{...evidence[0],integrity:'verified',worker:{...run,generation:3,position:1}}]});assert.notEqual(projection.workers[1].task.verification,'verified');
  workers[1].result={...report(),extra:true};projection=projectMonitorExperience({run,summary,workers});assert.equal(projection.workers[1].task.protocol,null);
});

test('authenticated service health stays available when saved run reads fail and missing adapters fail explicitly',async t=>{
  const {runDir,createMonitor}=await setup(t);await runWorkflow({runDir,sessionId:'s',script:meta+'return 1;',backend:backend(async()=>{})});
  const monitor=await createMonitor({runDir});t.after(()=>monitor.close());const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  assert.equal((await fetch(url.origin+'/api/health')).status,401);
  const health=await(await fetch(url.origin+'/api/health',{headers})).json();assert.equal(health.status,'available');assert.ok(health.serviceInstanceId);
  assert.equal((await fetch(url.origin+'/api/session/runs',{headers})).status,503);
  assert.equal((await fetch(url.origin+'/api/lifecycle',{method:'POST',headers,body:JSON.stringify({action:'hide',generation:1,expectedRevision:0,target:{kind:'run'},requestId:'request'})})).status,503);
  const db=new DatabaseSync(join(runDir,'run.sqlite'));db.prepare('DELETE FROM header').run();db.close();
  assert.equal((await fetch(url.origin+'/api/run',{headers})).status,404);
  assert.deepEqual(await(await fetch(url.origin+'/api/health',{headers})).json(),health);
});

test('session routes pin read identities and forward exact reviewed lifecycle previews without retargeting Stop',async t=>{
  const {runDir,createMonitor}=await setup(t);await runWorkflow({runDir,sessionId:'s',script:meta+'return 1;',backend:backend(async()=>{})});
  const binding={version:1,scope:'session',dataInstanceId:'data',originatingSessionId:'s',pinnedRunId:basename(runDir),runtimeId:'original-runtime'};
  await writeFile(join(runDir,'runtime.json'),JSON.stringify({schema:2,id:binding.pinnedRunId,sessionId:'s',runtime:{id:'original-runtime'}}));
  const other={dataInstanceId:'data',runId:'replacement',runtimeId:'replacement-runtime'},calls=[];
  const services={
    listSessionRuns:async()=>({items:[{ref:other,title:'Replacement',createdAt:'2026-10-13',executionStatus:'running',disposition:'visible',runUrl:'https://untrusted.invalid/#token=secret'}],nextCursor:null,hiddenCount:3,unknownCount:2}),
    readRun:async input=>{calls.push(input);if(input.runId===binding.pinnedRunId){const {monitorData}=await import('../engine/monitor-data.mjs');return monitorData(runDir,{runRef:{dataInstanceId:'data',runId:binding.pinnedRunId,runtimeId:'original-runtime'}});}return{generation:7,sessionId:'s',status:'running',workers:[],experience:{run:other}};},
    controlRun:async input=>{calls.push(input);return{id:'control',status:'pending'};},
    lifecycle:async input=>{calls.push(input);return{preview:{id:'reviewed',planHash:'a'.repeat(64),candidates:[],blocked:['Pinned recovery evidence']}};},
    readLifecycleReceipt:async input=>{calls.push(input);return{receipt:{id:'reviewed',runId:input.runId,outcome:'unknown'}};},
  };
  const monitor=await createMonitor({runDir,binding,experienceServices:services});t.after(()=>monitor.close());const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  assert.equal(url.pathname,`/runs/${binding.pinnedRunId}`);assert.equal(new URL(monitor.sessionUrl).pathname,'/session');
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'},post=(path,value)=>fetch(url.origin+path,{method:'POST',headers,body:JSON.stringify(value)});
  const navigation=await(await fetch(url.origin+'/api/session/runs?limit=10',{headers})).json();assert.equal(navigation.items[0].runUrl,'/runs/replacement');assert.equal(navigation.hiddenCount,3);assert.equal(navigation.unknownCount,2);
  assert.equal((await fetch(url.origin+'/api/session/runs?limit=101',{headers})).status,400);
  const target={...other,generation:7};
  assert.equal((await post('/api/runs/replacement/control',{target:{...target,runtimeId:'wrong'},generation:7,action:'stop'})).status,409);
  assert.equal((await post('/api/runs/replacement/control',{target,generation:6,action:'stop'})).status,409);
  assert.equal((await post('/api/runs/replacement/control',{target,generation:7,action:'stop'})).status,202);
  assert.deepEqual(calls.find(item=>item.action==='stop').target,target);
  const pinnedTarget={dataInstanceId:'data',runId:binding.pinnedRunId,runtimeId:binding.runtimeId,generation:1};
  assert.equal((await post('/api/control',{target:pinnedTarget,generation:1,action:'stop'})).status,202);assert.ok(calls.some(item=>item.action==='stop'&&item.target.runId===binding.pinnedRunId),'Pinned controls must use the retained-runtime adapter too');
  const value={action:'applyPrune',runTarget:target,target:{kind:'run'},generation:7,expectedRevision:3,requestId:'review',planId:'reviewed',approvedPlanHash:'a'.repeat(64)};
  assert.equal((await post('/api/runs/replacement/lifecycle',value)).status,202);assert.deepEqual(calls.find(item=>item.action==='applyPrune'),value);
  assert.equal((await post('/api/runs/replacement/lifecycle',{...value,runDir:'C:/elsewhere'})).status,400);
  assert.equal((await fetch(url.origin+'/runs/replacement',{headers})).status,200);
  assert.equal((await fetch(url.origin+'/api/run',{headers})).status,200);
  assert.equal((await fetch(url.origin+'/api/runs/replacement/lifecycle/receipts/reviewed',{headers})).status,200);assert.deepEqual(calls.find(item=>item.receiptId),{runId:'replacement',receiptId:'reviewed'});
  calls.length=0;assert.equal((await fetch(url.origin+'/api/lifecycle/receipts/reviewed',{headers})).status,200);assert.deepEqual(calls.find(item=>item.receiptId),{runId:binding.pinnedRunId,receiptId:'reviewed'});
});

const meta='export const meta={name:"Monitor",description:"Real run"};\n';
const backend=execute=>({identity:'monitor-fixture',execute,close:async()=>({serverExited:true,descendants:'notVerified'})});

test('dashboard stays available without activity until authenticated close, with opt-in idle expiry',async t=>{
  const {runDir,createMonitor}=await setup(t);
  await runWorkflow({runDir,sessionId:'s',script:meta+'return 1;',backend:backend(async()=>{})});
  t.mock.timers.enable({apis:['Date','setInterval']});
  const monitor=await createMonitor({runDir});t.after(()=>monitor.close());
  const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  t.mock.timers.tick(31*60*1000);
  assert.equal((await fetch(url.origin+'/api/run',{headers})).status,200);
  assert.equal((await fetch(url.origin+'/api/close',{method:'POST',headers,body:'{}'})).status,200);
  await monitor.close();await assert.rejects(fetch(url.origin+'/api/run',{headers}));
  const expiring=await createMonitor({runDir,idleMs:100});t.after(()=>expiring.close());
  t.mock.timers.tick(200);await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(fetch(new URL(expiring.url).origin+'/api/run'));
});
test('patch reads are authenticated, generation-bound, hash-checked and bounded for the monitor',async t=>{
  const {runDir,createMonitor}=await setup(t);
  await runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("edit");',backend:backend(async()=>({value:'done',terminalObserved:true}))});
  const artifactsDir=join(runDir,'patches');await mkdir(artifactsDir);
  const patch='diff --git a/note b/note\n+'+'x'.repeat(300000),basePatch='base-relative patch\n',patchPath=join(artifactsDir,'changes.patch'),basePatchPath=join(artifactsDir,'base.patch');
  await writeFile(patchPath,patch);await writeFile(basePatchPath,basePatch);
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const db=new DatabaseSync(join(runDir,'run.sqlite'));
  try{const worker=JSON.parse(db.prepare('SELECT value FROM workers WHERE generation=1 AND position=0').get().value);worker.workspace={cwd:join(runDir,'owned-worktree'),artifactsDir,changedFiles:['note'],patchPath,basePatchPath,patchHash:digest(patch),basePatchHash:digest(basePatch)};db.prepare('UPDATE workers SET value=? WHERE generation=1 AND position=0').run(JSON.stringify(worker));}finally{db.close();}
  const monitor=await createMonitor({runDir});t.after(()=>monitor.close());const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  const get=path=>fetch(url.origin+path,{headers:{Authorization:`Bearer ${token}`}});
  assert.equal((await fetch(url.origin+'/api/patch/0?generation=1')).status,401);
  assert.equal((await get('/api/patch/0')).status,400);assert.equal((await get('/api/patch/0?generation=2')).status,409);
  assert.equal((await get('/api/patch/0?generation=1&basis=invalid')).status,400);
  const result=await(await get('/api/patch/0?generation=1&basis=inputs')).json();
  assert.equal(result.sha256,digest(patch));assert.equal(result.bytes,Buffer.byteLength(patch));assert.equal(result.truncated,true);assert.ok(Buffer.byteLength(result.patch)<=256*1024);assert.deepEqual(result.changedFiles,['note']);
  assert.equal((await(await get('/api/patch/0?generation=1&basis=base')).json()).patch,basePatch);
  const summary=await(await get('/api/run')).json();assert.deepEqual(summary.workers[0].workspace.changedFiles,['note']);
  const cli=JSON.parse((await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../engine/cli.mjs',import.meta.url)),'--patch','0','--basis','inputs','--run',runDir,'--generation','1'],{windowsHide:true,maxBuffer:1024*1024})).stdout);assert.equal(cli.patch,patch);assert.equal(cli.truncated,false);
  await writeFile(patchPath,'corrupted');const corrupt=await get('/api/patch/0?generation=1');assert.equal(corrupt.status,500);assert.equal((await corrupt.json()).error.code,'WORKSPACE_ARTIFACT');
});
async function setup(t){
  const runDir=await mkdtemp(join(tmpdir(),'workflow-monitor-'));
  t.after(()=>rm(runDir,{recursive:true,force:true,maxRetries:10,retryDelay:50}));
  const module=await import('../engine/monitor-server.mjs').catch(()=>null);
  assert.ok(module?.createMonitor,'Monitor surface must exist');
  return{runDir,createMonitor:module.createMonitor};
}
test('monitor binds loopback and protects run data and controls with host origin and bearer checks',async t=>{
  const {runDir,createMonitor}=await setup(t);
  await runWorkflow({runDir,sessionId:'s',script:meta+'return 1;',backend:backend(async()=>{})});
  const monitor=await createMonitor({runDir});t.after(()=>monitor.close());
  const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  assert.equal(url.hostname,'127.0.0.1');assert(token.length>=32);
  const get=(path,headers={})=>fetch(url.origin+path,{headers:{Authorization:`Bearer ${token}`,...headers}});
  assert.equal((await fetch(url.origin+'/api/run')).status,401);
  const hostile=await new Promise((resolve,reject)=>{const req=request(url.origin+'/api/run',{headers:{Host:'attacker.invalid',Authorization:`Bearer ${token}`}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
  assert.equal(hostile,403);
  assert.equal((await get('/api/run',{Origin:'https://attacker.invalid'})).status,403);
  assert.equal((await get('/api/run')).status,200);
  const page=await fetch(url.origin+'/');assert.equal(page.status,200);
  assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
  assert.equal((await get('/api/unknown')).status,404);
  const bad=await fetch(url.origin+'/api/control',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({generation:1,action:'restart-worker'})});
  assert.equal(bad.status,400);
});
test('monitor previews are bounded and full evidence is generation-bound and deliberate',async t=>{
  const {runDir,createMonitor}=await setup(t);
  const evidence='<img src=x onerror=alert(1)>'+ 'x'.repeat(12000);
  const script=meta+'return await agent(args);';
  await runWorkflow({runDir,sessionId:'s',script,args:evidence,backend:backend(async()=>({value:evidence,terminalObserved:true}))});
  const monitor=await createMonitor({runDir});t.after(()=>monitor.close());
  const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  const get=path=>fetch(url.origin+path,{headers:{Authorization:`Bearer ${token}`}});
  const summary=await (await get('/api/run')).json();
  assert(summary.workers[0].prompt.length<2000);assert(summary.truncations.includes('result'));
  assert(summary.workers[0].truncations.includes('result'));assert.equal(summary.script,undefined);
  assert.equal((await (await get('/api/worker/0?generation=1')).json()).result,evidence);
  assert.equal(await (await get('/api/script?generation=1')).text(),script);
  assert.equal((await (await get('/api/result?generation=1')).json()).result,evidence);
  assert.equal((await get('/api/worker/0?generation=2')).status,409);
  assert.equal((await get('/api/worker/0')).status,400);
});

test('activity HTTP reads require authentication and generation and disclose bounded history coverage',async t=>{
  const {runDir,createMonitor}=await setup(t);
  await runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("Read");',backend:backend(async({onEvent})=>{
    for(let i=0;i<270;i++)onEvent({method:'item/commandExecution/outputDelta',params:{threadId:'thread',turnId:'turn',itemId:'command',delta:String(i)}});
    return{value:'done',terminalObserved:true};
  })});
  const monitor=await createMonitor({runDir});t.after(()=>monitor.close());
  const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  const get=path=>fetch(url.origin+path,{headers:{Authorization:`Bearer ${token}`}});
  assert.equal((await fetch(url.origin+'/api/activity?generation=1&position=0')).status,401);
  assert.equal((await get('/api/activity?position=0')).status,400);
  assert.equal((await get('/api/activity?generation=1')).status,400);
  assert.equal((await get('/api/activity?generation=1&position=0&limit=101')).status,400);
  assert.equal((await get('/api/activity?generation=2&position=0')).status,409);
  assert.equal((await get('/api/activity?generation=1&position=1')).status,404);
  const first=await (await get('/api/activity?generation=1&position=0&limit=10')).json();
  assert.equal(first.observed,270);assert.equal(first.retained,256);assert.equal(first.dropped,14);assert.equal(first.records.length,10);
  const second=await (await get(`/api/activity?generation=1&position=0&after=${first.nextCursor}&limit=10`)).json();
  assert.equal(second.records[0].output,'24');
  const db=new DatabaseSync(join(runDir,'run.sqlite'));
  try{db.exec('DELETE FROM activity; DELETE FROM activity_counts');}finally{db.close();}
  const corrupt=await get('/api/activity?generation=1&position=0');
  assert.equal(corrupt.status,500);assert.equal((await corrupt.json()).error.code,'ACTIVITY_CORRUPT');
});
test('monitor pause persists a receipt and resume uses the server-owned session and observed generation',async t=>{
  const {runDir,createMonitor}=await setup(t);
  let started,finish;const running=new Promise(resolve=>{started=resolve;});const gate=new Promise(resolve=>{finish=resolve;});
  const work=runWorkflow({runDir,sessionId:'owned-session',launch:{codex:process.execPath,cwd:runDir,backend:'configured'},script:meta+'return await agent("A");',backend:backend(async()=>{started();await gate;return{value:'A',terminalObserved:true};})});
  await running;
  const resumes=[];
  const monitor=await createMonitor({runDir,start:async input=>{resumes.push(input);return{status:'running',generation:2};}});t.after(()=>monitor.close());
  const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  const post=(path,body)=>fetch(url.origin+path,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const receipt=await (await post('/api/control',{generation:1,action:'pause'})).json();
  assert.equal(receipt.status,'pending');
  await new Promise(resolve=>setTimeout(resolve,80));finish();assert.equal((await work).status,'paused');
  assert.equal((await post('/api/resume',{generation:2})).status,409);
  assert.equal((await post('/api/resume',{generation:1})).status,202);
  assert.equal(resumes.length,1);assert.equal(resumes[0].sessionId,'owned-session');assert.equal(resumes[0].expectedGeneration,1);
});

test('monitor and CLI worker controls preserve attempt and turn preconditions',async t=>{
  const {runDir,createMonitor}=await setup(t);let announced,finish;const ready=new Promise(resolve=>{announced=resolve;}),gate=new Promise(resolve=>{finish=resolve;});const steered=[];
  const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',backend:{...backend(async({onActive})=>{onActive({threadId:'thread',turnId:'turn'});announced();await gate;return{value:'A',terminalObserved:true};}),steer:async request=>{steered.push(request);return{turnId:'turn'};}}});
  await ready;const monitor=await createMonitor({runDir});t.after(()=>monitor.close());const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  const post=body=>fetch(url.origin+'/api/control',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    assert.equal((await post({generation:1,action:'steer',position:0,attempt:1,turnId:'stale',text:'Change'})).status,409);
    assert.equal((await post({generation:1,action:'steer',position:0,attempt:1,turnId:'turn',text:'Read another line'})).status,202);
    const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../engine/cli.mjs',import.meta.url)),'--action','steer','--run',runDir,'--session','s','--generation','1','--position','0','--attempt','1','--turn','turn','--text','CLI instruction'],{timeout:10000,windowsHide:true});
    const receipt=JSON.parse(stdout);assert.equal(receipt.position,0);assert.equal(receipt.attempt,1);assert.equal(receipt.turnId,'turn');assert.equal(receipt.text,'CLI instruction');
    const until=Date.now()+2000;while(steered.length<2&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(steered.length,2);
  }finally{finish();await work;}
});

test('dashboard CLI returns an authenticated URL and its monitor survives launcher exit',async t=>{
  const {runDir}=await setup(t);
  await runWorkflow({runDir,sessionId:'s',script:meta+'return 1;',backend:backend(async()=>{})});
  const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../engine/cli.mjs',import.meta.url)),'--dashboard','--run',runDir],{timeout:15000,windowsHide:true});
  const {url}=JSON.parse(stdout);const parsed=new URL(url),token=new URLSearchParams(parsed.hash.slice(1)).get('token');
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  t.after(()=>fetch(parsed.origin+'/api/close',{method:'POST',headers,body:'{}'}));
  const response=await fetch(parsed.origin+'/api/run',{headers});
  assert.equal(response.status,200);assert.equal((await response.json()).status,'completed');
});
