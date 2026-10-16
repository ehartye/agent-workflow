/** @lane merge
 * @subject engine/monitor-server.mjs
 * @subject engine/monitor-data.mjs
 * @subject engine/monitor/services.mjs
 * @subject engine/monitor-adapters.mjs
 * @subject engine/controls.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir,readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {request} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {runWorkflow} from '../engine/controller.mjs';

test('pinned steps route pages actual declarations and rejects duplicate queries',async t=>{
 const runDir=await mkdtemp(join(tmpdir(),'steps-http-'));t.after(()=>rm(runDir,{recursive:true,force:true}));
 await runWorkflow({runDir,sessionId:'s',script:'export const meta={name:"planned",description:"zero workers",steps:[{id:"a",label:"A",dependsOn:[]},{id:"b",label:"B",dependsOn:["a"]}]};return null;',backend:{identity:'fixture',execute:async()=>{throw Error('forbidden');},close:async()=>({serverExited:true})}});
 const {createMonitor}=await import('../engine/monitor-server.mjs');const monitor=await createMonitor({runDir});t.after(()=>monitor.close());const url=new URL(monitor.url),authorization='Bearer '+new URLSearchParams(url.hash.slice(1)).get('token');
 const first=await fetch(url.origin+'/api/steps?generation=1&limit=1',{headers:{authorization}});assert.equal(first.status,200);const page=await first.json();assert.equal(page.coverage.declared,2);assert.equal(page.coverage.assigned,0);assert.equal(page.items[0].execution,'planned');assert.equal(page.hasMore,true);
 const next=await fetch(url.origin+'/api/steps?generation=1&limit=1&after='+page.nextCursor,{headers:{authorization}}).then(r=>r.json());assert.equal(next.items[0].ref.stepId,'b');assert.equal(next.hasMore,false);
 assert.equal((await fetch(url.origin+'/api/steps?generation=1&generation=1',{headers:{authorization}})).status,400);
});

test('summary stepsRevision follows validated catalogs and worker state but stays stable on activity and unchanged polls',async t=>{
 const {monitorData}=await import('../engine/monitor-data.mjs'),{readStepsAt}=await import('../engine/steps.mjs'),{resolveAccess}=await import('../engine/access-policy.mjs'),{verifyWorkflowSources}=await import('../engine/composition.mjs');
 const root=await mkdtemp(join(tmpdir(),'steps-revision-'));t.after(()=>rm(root,{recursive:true,force:true}));const runDir=join(root,'run'),source=join(root,'source');await mkdir(source);
 const child='export const meta={name:"pure",description:"worker free",steps:[{id:"child",label:"Child",dependsOn:[]}]};return {ok:true};';await writeFile(join(source,'pure.mjs'),child);
 const accessPolicy=resolveAccess({sessionId:'s',parentAccess:{version:1,sessionId:'s',provenance:'codex-session-context',filesystem:'unrestricted',networkAccess:true,approvalPolicy:'never'}}),cleanup={serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members',nativeTerminals:{inventoryEmpty:true}};
 const script='export const meta='+JSON.stringify({name:'revision',description:'projection',steps:[{id:'a',label:'A',dependsOn:[],worker:{id:'a'}},{id:'b',label:'B',dependsOn:[],worker:{id:'b'}}],workflows:[{alias:'pure',source:{kind:'script',path:'pure.mjs'},argsSchema:{type:'object'},resultSchema:{type:'object'},capabilities:{skills:null,tools:null},permissions:null}]})+';await agent("A",{id:"a",maxAttempts:1});await workflow("pure",{});return await agent("B",{id:"b",maxAttempts:1});';
 let releaseA,releaseB,startedA,startedB,activity;const gateA=new Promise(r=>{releaseA=r;}),gateB=new Promise(r=>{releaseB=r;}),aStarted=new Promise(r=>{startedA=r;}),bStarted=new Promise(r=>{startedB=r;});let admitted;
 const work=runWorkflow({runDir,sessionId:'s',script,launch:{cwd:source,accessPolicy},onReady:async()=>{admitted=await monitorData(runDir);},backend:{identity:'steps-revision',accessPolicy,parentCapabilities:{fingerprint:'a'.repeat(64),coverage:{complete:true}},close:async()=>cleanup,execute:async({prompt,onEvent})=>{if(prompt==='A'){activity=()=>onEvent({method:'item/agentMessage/delta',params:{threadId:'a',turnId:'a',itemId:'note',delta:'irrelevant activity'}});startedA();await gateA;return{value:'A',terminalObserved:true,evidence:{cleanup}};}startedB();await gateB;throw Object.assign(new Error('known failure'),{code:'FIXTURE',terminalObserved:true,evidence:{cleanup}});}}});
 let during,afterChild;
 try{await aStarted;during=await monitorData(runDir);assert.match(during.stepsRevision,/^[a-f0-9]{64}$/);assert.notEqual(during.stepsRevision,admitted.stepsRevision);assert.equal((await monitorData(runDir)).stepsRevision,during.stepsRevision);activity();assert.equal((await monitorData(runDir)).stepsRevision,during.stepsRevision);releaseA();await bStarted;afterChild=await monitorData(runDir);assert.notEqual(afterChild.stepsRevision,during.stepsRevision);assert.equal((await readStepsAt({runDir,run:null,generation:1})).coverage.declared,3);assert.equal((await monitorData(runDir)).stepsRevision,afterChild.stepsRevision);}finally{releaseA();releaseB();await work;}
 const terminal=await monitorData(runDir);assert.notEqual(terminal.stepsRevision,afterChild.stepsRevision);assert.equal((await monitorData(runDir)).stepsRevision,terminal.stepsRevision);
 const db=new DatabaseSync(join(runDir,'run.sqlite'),{readOnly:true});let state;try{state=JSON.parse(db.prepare('SELECT value FROM header WHERE id=1').get().value);}finally{db.close();}
 const sources=await verifyWorkflowSources({runDir,descriptor:state.workflowSources}),blob=join(runDir,'workflow-sources-v1','blobs',sources.entries[0].script.sha256);await writeFile(blob,child.replace('Child','Wrong'));
 await assert.rejects(monitorData(runDir),{code:'STEP_CORRUPT'});
});

test('worker-free child scope changes summary stepsRevision without creating workers; old runtimes omit it',async t=>{
 const {monitorData}=await import('../engine/monitor-data.mjs'),{resolveAccess}=await import('../engine/access-policy.mjs');const root=await mkdtemp(join(tmpdir(),'steps-pure-revision-'));t.after(()=>rm(root,{recursive:true,force:true}));const runDir=join(root,'run'),source=join(root,'source');await mkdir(source);await writeFile(join(source,'pure.mjs'),'export const meta={name:"pure",description:"worker free",steps:[{id:"c",label:"C",dependsOn:[]}]};return {ok:true};');
 const accessPolicy=resolveAccess({sessionId:'s',parentAccess:{version:1,sessionId:'s',provenance:'codex-session-context',filesystem:'unrestricted',networkAccess:true,approvalPolicy:'never'}}),workflows=[{alias:'pure',source:{kind:'script',path:'pure.mjs'},argsSchema:{type:'object'},resultSchema:{type:'object'},capabilities:{skills:null,tools:null},permissions:null}];let before;
 await runWorkflow({runDir,sessionId:'s',script:'export const meta='+JSON.stringify({name:'pure',description:'revision',workflows})+';return await workflow("pure",{});',launch:{cwd:source,accessPolicy},onReady:async()=>{before=await monitorData(runDir);},backend:{identity:'pure-revision',accessPolicy,parentCapabilities:{fingerprint:'a'.repeat(64),coverage:{complete:true}},execute:async()=>assert.fail('no worker'),close:async()=>({serverExited:true})}});
 const after=await monitorData(runDir);assert.equal(after.workers.length,0);assert.match(before.stepsRevision,/^[a-f0-9]{64}$/);assert.notEqual(after.stepsRevision,before.stepsRevision);assert.equal((await monitorData(runDir)).stepsRevision,after.stepsRevision);
 // Isolate catalog appearance from terminal/admission changes using the real
 // retained child and an open header/ledger snapshot; there are still no workers.
 const db=new DatabaseSync(join(runDir,'run.sqlite'));try{const state=JSON.parse(db.prepare('SELECT value FROM header WHERE id=1').get().value),admission=JSON.parse(db.prepare('SELECT value FROM admission WHERE generation=1').get().value);state.status=before.status;state.acceptingControls=before.acceptingControls;admission.accepting=before.acceptingAdditions;db.prepare('UPDATE header SET value=? WHERE id=1').run(JSON.stringify(state));db.prepare('UPDATE admission SET value=? WHERE generation=1').run(JSON.stringify(admission));const open=await monitorData(runDir);assert.notEqual(open.stepsRevision,before.stepsRevision,'Worker-free catalog itself must change the revision');assert.equal((await monitorData(runDir)).stepsRevision,open.stepsRevision);delete state.stepsVersion;db.prepare('UPDATE header SET value=? WHERE id=1').run(JSON.stringify(state));}finally{db.close();}
 assert.equal(Object.hasOwn(await monitorData(runDir),'stepsRevision'),false,'Absent version is explicit unavailable, never a reconstructed revision');
});

test('summary stepsRevision verifies complete workers and follows assignments beyond the first step page',async t=>{
 const {runDir}=await setup(t),{monitorData}=await import('../engine/monitor-data.mjs');const steps=Array.from({length:105},(_,i)=>({id:'s'+i,label:'Step '+i,dependsOn:[]}));
 await runWorkflow({runDir,sessionId:'s',script:'export const meta='+JSON.stringify({name:'assignments',description:'complete projection',steps})+';return await agent("Read",{id:"reader",stepId:"s103",maxAttempts:1});',backend:backend(async()=>({value:'done',terminalObserved:true}))});
 const before=await monitorData(runDir),db=new DatabaseSync(join(runDir,'run.sqlite'));try{const worker=JSON.parse(db.prepare('SELECT value FROM workers WHERE generation=1 AND position=0').get().value);worker.step.stepId='s104';worker.options.stepId='s104';db.prepare('UPDATE workers SET value=? WHERE generation=1 AND position=0').run(JSON.stringify(worker));const reassigned=await monitorData(runDir);assert.notEqual(reassigned.stepsRevision,before.stepsRevision);worker.attempts++;db.prepare('UPDATE workers SET value=? WHERE generation=1 AND position=0').run(JSON.stringify(worker));const attempt=await monitorData(runDir);assert.notEqual(attempt.stepsRevision,reassigned.stepsRevision);assert.equal((await monitorData(runDir)).stepsRevision,attempt.stepsRevision);db.exec('DELETE FROM workers WHERE generation=1');await assert.rejects(monitorData(runDir),{code:'STEP_CORRUPT'});const {readStepsAt}=await import('../engine/steps.mjs');await assert.rejects(readStepsAt({runDir,run:null,generation:1}),{code:'STEP_CORRUPT'});}finally{db.close();}
});

test('summary and page one reject a missing required binding without publishing a verified revision',async t=>{
 const {monitorData}=await import('../engine/monitor-data.mjs'),{readStepsAt}=await import('../engine/steps.mjs');
 for(const mutation of ['delete','null'])await t.test(mutation,async t=>{
  const {runDir}=await setup(t);
  const steps=Array.from({length:105},(_,i)=>({id:'s'+i,label:'Step '+i,dependsOn:[]}));let effects=0;
  await runWorkflow({runDir,sessionId:'s',script:'export const meta='+JSON.stringify({name:'binding',description:'complete projection',steps})+';return await agent("Read",{id:"reader",stepId:"s103",maxAttempts:1});',backend:backend(async()=>({value:++effects,terminalObserved:true}))});
  const run=null;assert.match((await monitorData(runDir)).stepsRevision,/^[a-f0-9]{64}$/);
  const db=new DatabaseSync(join(runDir,'run.sqlite'));let corrupt;
  try{const w=JSON.parse(db.prepare('SELECT value FROM workers WHERE generation=1 AND position=0').get().value);if(mutation==='delete')delete w.step;else w.step=null;corrupt=JSON.stringify(w);db.prepare('UPDATE workers SET value=? WHERE generation=1 AND position=0').run(corrupt);}finally{db.close();}
  await t.test('summary',()=>assert.rejects(monitorData(runDir,{kind:'summary',runRef:run}),{code:'STEP_CORRUPT'}));
  await t.test('page one',()=>assert.rejects(readStepsAt({runDir,run,generation:1,limit:1}),{code:'STEP_CORRUPT'}));
  const saved=new DatabaseSync(join(runDir,'run.sqlite'),{readOnly:true});try{assert.equal(saved.prepare('SELECT value FROM workers WHERE generation=1 AND position=0').get().value,corrupt);assert.equal(JSON.parse(saved.prepare('SELECT value FROM header WHERE id=1').get().value).generation,1);}finally{saved.close();}
  assert.equal(effects,1);
 });
});

test('monitor preserves uncertain added dispatch across summary full-worker and saved-run reads',async t=>{
 const {runDir}=await setup(t),{requestAppend}=await import('../engine/append.mjs'),{randomUUID}=await import('node:crypto');
 const {monitorData}=await import('../engine/monitor-data.mjs'),{readRun}=await import('../engine/controller.mjs');
 await runWorkflow({runDir,sessionId:'s',script:meta+'return null;',onReady:()=>requestAppend(runDir,{sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'late',prompt:'Read'}]}),backend:backend(async()=>({value:'done',terminalObserved:true}))});
 const db=new DatabaseSync(join(runDir,'run.sqlite'));
 try{
  const header=JSON.parse(db.prepare('SELECT value FROM header WHERE id=1').get().value);header.status='running';delete header.cleanup;
  db.prepare('UPDATE header SET value=? WHERE id=1').run(JSON.stringify(header));
  const worker=JSON.parse(db.prepare('SELECT value FROM workers WHERE generation=1 AND position=0').get().value);
  worker.status='queued';worker.attempts=0;for(const key of ['result','resultHash','startedAt','completedAt','evidence'])delete worker[key];
  db.prepare('UPDATE workers SET value=? WHERE generation=1 AND position=0').run(JSON.stringify(worker));
  db.exec('DELETE FROM notifications;DELETE FROM notification_progress');
  const summary=await monitorData(runDir);
  assert.equal(summary.workers[0].status,'unknown');assert.equal(summary.coverage.unknown,1);assert.equal(summary.additions.unknown,1);
  assert.equal((await monitorData(runDir,{kind:'worker',generation:1,position:0})).status,'unknown');
  assert.equal((await readRun(runDir)).workers[0].status,'unknown');
  assert.equal(JSON.parse(db.prepare('SELECT value FROM workers WHERE generation=1 AND position=0').get().value).status,'queued','Projection does not rewrite persisted evidence');
  worker.origin.taskId='conflicting-origin';db.prepare('UPDATE workers SET value=? WHERE generation=1 AND position=0').run(JSON.stringify(worker));
  await assert.rejects(monitorData(runDir),{code:'APPEND_CORRUPT'});
  await assert.rejects(monitorData(runDir,{kind:'worker',generation:1,position:0}),{code:'APPEND_CORRUPT'});
  await assert.rejects(readRun(runDir),{code:'APPEND_CORRUPT'});
 }finally{db.close();}
});

test('monitor follows retained source positions when cached workers move to new physical slots',async t=>{
 const runDir=await mkdtemp(join(tmpdir(),'workflow-monitor-origin-'));t.after(()=>rm(runDir,{recursive:true,force:true,maxRetries:10}));
 const {monitorData}=await import('../engine/monitor-data.mjs');
 const backend={identity:'origin-fixture',async execute({prompt,onEvent}){
  onEvent({method:'item/completed',params:{threadId:`thread-${prompt}`,turnId:`turn-${prompt}`,item:{id:`command-${prompt}`,type:'commandExecution',command:prompt,status:'completed',exitCode:0}}});
  return{value:prompt,terminalObserved:true};
 },async close(){return{serverExited:true};}};
 const input={runDir,sessionId:'origin',script:'export const meta={name:"origins",description:"retained positions"};return await parallel([()=>agent("A"),()=>agent("B")]);',backend};
 await runWorkflow(input);const cached=await runWorkflow({...input,resume:true});assert.ok(cached.workers.every(w=>w.cached));
 // Persistence fixture for the supported replay mapping: physical slots change,
 // but each cached worker retains its earlier execution's source coordinates.
 const db=new DatabaseSync(join(runDir,'run.sqlite'));
 try{db.exec('BEGIN IMMEDIATE;DELETE FROM workers WHERE generation=2');for(const [position,prior] of [...cached.workers].reverse().entries())db.prepare('INSERT INTO workers VALUES(2,?,?)').run(position,JSON.stringify({...prior,position,sourceGeneration:1,sourcePosition:prior.reusedFrom.position}));db.exec('COMMIT');}finally{db.close();}
 const activity=await monitorData(runDir,{kind:'activity',generation:2,position:1});assert.equal(activity.records[0].input,'A');assert.equal(activity.sourceGeneration,1);assert.equal(activity.sourcePosition,0);
 const earlier=await monitorData(runDir,{kind:'worker',generation:2,position:1,sourceGeneration:1});assert.equal(earlier.prompt,'A');assert.equal(earlier.historyPosition,0);
 assert.match((await monitorData(runDir)).stepsRevision,/^[a-f0-9]{64}$/);
 // Mirrored coordinates agreeing with each other are insufficient: a corrupt
 // cache link must not attribute B's equally sized activity history to A.
 const corrupt=new DatabaseSync(join(runDir,'run.sqlite'));
 try{
  const row=JSON.parse(corrupt.prepare('SELECT value FROM workers WHERE generation=2 AND position=1').get().value);
  row.reusedFrom.position=1;row.sourcePosition=1;
  corrupt.prepare('UPDATE workers SET value=? WHERE generation=2 AND position=1').run(JSON.stringify(row));
 }finally{corrupt.close();}
 await assert.rejects(monitorData(runDir,{kind:'activity',generation:2,position:1}),{code:'ACTIVITY_CORRUPT'});
 await assert.rejects(monitorData(runDir),{code:'STEP_CORRUPT'});
 const {readStepsAt}=await import('../engine/steps.mjs');await assert.rejects(readStepsAt({runDir,run:null,generation:2}),{code:'STEP_CORRUPT'});
});

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
  const {runDir,createMonitor,dataInstanceId}=await setup(t);
  const binding={version:1,scope:'session',dataInstanceId,originatingSessionId:'s',pinnedRunId:basename(runDir),runtimeId:'original-runtime'};
  await writeFile(join(runDir,'runtime.json'),JSON.stringify({schema:2,id:binding.pinnedRunId,sessionId:'s',runtime:{id:'original-runtime'}}));
  await runWorkflow({runDir,sessionId:'s',script:meta+'return 1;',backend:backend(async()=>{})});
  const other={dataInstanceId,runId:'replacement',runtimeId:'replacement-runtime'},calls=[];
  const services={
    listSessionRuns:async()=>({items:[{ref:other,title:'Replacement',createdAt:'2026-10-13',executionStatus:'running',disposition:'visible',runUrl:'https://untrusted.invalid/#token=secret'}],nextCursor:null,hiddenCount:3,unknownCount:2}),
    readRun:async input=>{calls.push(input);if(input.runId===binding.pinnedRunId){const {monitorData}=await import('../engine/monitor-data.mjs');return monitorData(runDir,{runRef:{dataInstanceId,runId:binding.pinnedRunId,runtimeId:'original-runtime'}});}return{generation:7,sessionId:'s',status:'running',workers:[],experience:{run:other}};},
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
  const pinnedTarget={dataInstanceId,runId:binding.pinnedRunId,runtimeId:binding.runtimeId,generation:1};
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
  const root=await mkdtemp(join(tmpdir(),'workflow-monitor-')),runDir=join(root,'runs-v2',randomUUID());await mkdir(runDir,{recursive:true});
  t.after(()=>rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}));
  const module=await import('../engine/monitor-server.mjs').catch(()=>null);
  assert.ok(module?.createMonitor,'Monitor surface must exist');
  const {dataInstanceIdentity}=await import('../engine/composition-store.mjs');return{runDir,createMonitor:module.createMonitor,dataInstanceId:await dataInstanceIdentity(root)};
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
  // Reject an oversized saved worker set before parsing an out-of-budget row.
  const db=new DatabaseSync(join(runDir,'run.sqlite'));
  try{
   const insert=db.prepare('INSERT INTO workers(generation,position,value) VALUES(1,?,?)');
   db.exec('BEGIN IMMEDIATE');
   for(let position=1;position<=1000;position++)insert.run(position,position===1000?'{invalid':JSON.stringify({position,status:'queued'}));
   db.exec('COMMIT');
  }finally{db.close();}
  const excess=await get('/api/run');assert.equal(excess.status,500);
  assert.equal((await excess.json()).error.code,'MONITOR_LIMIT');
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

test('completed message HTTP reads preserve cached source identity and readonly legacy coverage',async t=>{
  const {runDir,createMonitor}=await setup(t);
  const input={runDir,sessionId:'s',script:meta+'return await agent("Read");',backend:backend(async({onEvent})=>{
    onEvent({method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{id:'answer',type:'agentMessage',text:'terminal'}}});
    for(let i=0;i<300;i++)onEvent({method:'item/agentMessage/delta',params:{threadId:'thread',turnId:'turn',itemId:'noise',delta:String(i)}});
    return{value:'done',terminalObserved:true};
  })};await runWorkflow(input);await runWorkflow({...input,resume:true});
  const monitor=await createMonitor({runDir});t.after(()=>monitor.close());const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  const get=path=>fetch(url.origin+path,{headers:{Authorization:`Bearer ${token}`}});
  assert.equal((await fetch(url.origin+'/api/messages?generation=2&position=0')).status,401);
  for(const query of ['position=0','generation=2','generation=2&position=0&after=-1','generation=2&position=0&limit=101'])assert.equal((await get('/api/messages?'+query)).status,400);
  assert.equal((await get('/api/messages?generation=1&position=0')).status,409);
  const page=await(await get('/api/messages?generation=2&position=0')).json();assert.equal(page.available,true);assert.equal(page.sourceGeneration,1);assert.equal(page.sourcePosition,0);assert.equal(page.records[0].text,'terminal');
  assert.equal((await get('/api/messages?generation=2&position=0&sourceGeneration=1')).status,200);
  // Keep the terminal row intact while corrupting its raw history counters.
  // This specifically owns the messages route's raw-count refusal.
  const corrupt=new DatabaseSync(join(runDir,'run.sqlite'));
  const observed=corrupt.prepare('SELECT observed FROM activity_counts WHERE generation=1 AND position=0').get().observed;
  assert.equal(corrupt.prepare('SELECT count(*) AS n FROM completed_messages').get().n,1);
  assert.equal(observed,301);
  corrupt.prepare('UPDATE activity_counts SET observed=256 WHERE generation=1 AND position=0').run();corrupt.close();
  const refused=await get('/api/messages?generation=2&position=0');
  assert.equal(refused.status,500);assert.equal((await refused.json()).error.code,'ACTIVITY_CORRUPT');
  // Meaningful broken behavior: bypass raw validation only for messages.
  // Load this inertly edited module from memory; never patch production code.
  const subject=new URL('../engine/monitor-data.mjs',import.meta.url);
  const source=await readFile(subject,'utf8'),needle='const activity=readActivity(db,';
  assert.equal(source.split(needle).length,2,'The negative control must change exactly one validation boundary');
  const broken=source.replace(needle,"const activity=kind==='messages'?null:readActivity(db,")
    .replace(/from '(\.{1,2}\/[^']+)'/g,(_,path)=>`from '${new URL(path,subject).href}'`);
  const mutant=await import(`data:text/javascript;base64,${Buffer.from(broken).toString('base64')}`);
  const {monitorData}=await import('../engine/monitor-data.mjs');
  const refusesReset=reader=>assert.rejects(reader(runDir,{kind:'messages',generation:2,position:0}),{code:'ACTIVITY_CORRUPT'});
  await refusesReset(monitorData);
  await assert.rejects(()=>refusesReset(mutant.monitorData),{code:'ERR_ASSERTION'},'The regression must reject removal of messages-specific raw validation');
  const restore=new DatabaseSync(join(runDir,'run.sqlite'));
  restore.prepare('UPDATE activity_counts SET observed=? WHERE generation=1 AND position=0').run(observed);restore.close();
  const intact=await(await get('/api/messages?generation=2&position=0')).json();assert.equal(intact.records[0].text,'terminal');
  const db=new DatabaseSync(join(runDir,'run.sqlite'));db.exec('DROP TABLE completed_messages;DROP TABLE completed_message_counts');db.close();
  const legacy=await(await get('/api/messages?generation=2&position=0')).json();assert.equal(legacy.available,false);assert.equal(legacy.coverage,'legacyRawOnly');assert.equal(legacy.priorActivityUncovered,301);
  const check=new DatabaseSync(join(runDir,'run.sqlite'),{readOnly:true});assert.equal(check.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'completed_message%'").get().n,0);check.close();
});

test('deadline HTTP control preserves revision nullable turn and bounded receipt reads',async t=>{
  const {runDir,createMonitor}=await setup(t);let announce,finish;
  const ready=new Promise(resolve=>{announce=resolve;}),gate=new Promise(resolve=>{finish=resolve;});
  const {createLiveDeadline}=await import('../engine/live-deadline.mjs');
  const work=runWorkflow({runDir,sessionId:'owner',script:meta+'return await agent("A");',backend:backend(async({onDeadline})=>{const deadline=createLiveDeadline();deadline.start();onDeadline(deadline);announce();try{await gate;return{value:'A',terminalObserved:true};}finally{deadline.close();}})});
  await ready;const monitor=await createMonitor({runDir});t.after(()=>monitor.close());const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token'),headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const post=value=>fetch(url.origin+'/api/control',{method:'POST',headers,body:JSON.stringify(value)});
  try{
    const input={generation:1,position:0,attempt:1,turnId:null,action:'worker-deadline',deadline:{operation:'set',expectedRevision:0,valueMs:600000}};
    assert.equal((await post({...input,sessionId:'wrong'})).status,400);
    for(const deadline of [{operation:'clear',expectedRevision:0,valueMs:1},{operation:'set',expectedRevision:0,valueMs:0},{operation:'extend',expectedRevision:0,valueMs:2,other:true}])assert.equal((await post({...input,deadline})).status,400);
    for(const change of [{attempt:2},{generation:2},{turnId:'stale'},{deadline:{...input.deadline,expectedRevision:4}}])assert.equal((await post({...input,...change})).status,409);
    const accepted=await post(input);assert.equal(accepted.status,202);const receipt=await accepted.json();assert.equal(receipt.deadline.expectedRevision,0);assert.equal(receipt.turnId,null);
    assert.equal((await fetch(url.origin+`/api/control/receipts/${receipt.id}`)).status,401);
    const read=await fetch(url.origin+`/api/control/receipts/${receipt.id}?generation=1`,{headers});assert.equal(read.status,200);assert.equal((await read.json()).id,receipt.id);
    assert.equal((await fetch(url.origin+`/api/control/receipts/${receipt.id}?generation=2`,{headers})).status,409);
    assert.equal((await fetch(url.origin+'/api/control/receipts/missing?generation=1',{headers})).status,404);
  }finally{finish();await work;}
});

test('scoped deadlines bind data run runtime session and revision while unsupported controls stay inert',async t=>{
  const {runDir,createMonitor,dataInstanceId}=await setup(t);
  const {monitorData}=await import('../engine/monitor-data.mjs'),{requestControl,readControl}=await import('../engine/controls.mjs');
  const binding={version:1,scope:'session',dataInstanceId,originatingSessionId:'s',pinnedRunId:basename(runDir),runtimeId:'retained'};
  await writeFile(join(runDir,'runtime.json'),JSON.stringify({schema:2,id:binding.pinnedRunId,sessionId:'s',runtime:{id:'retained'}}));
  await runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',backend:backend(async()=>({value:'A',terminalObserved:true}))});
  const db=new DatabaseSync(join(runDir,'run.sqlite'));
  const header=JSON.parse(db.prepare('SELECT value FROM header').get().value);header.status='running';header.acceptingControls=true;db.prepare('UPDATE header SET value=?').run(JSON.stringify(header));
  const saved=JSON.parse(db.prepare('SELECT value FROM workers WHERE generation=1 AND position=0').get().value);Object.assign(saved,{status:'running',activeTurn:{threadId:'thread',turnId:'turn'},deadline:{status:'active',revision:3,remainingMs:60000,expiresAt:100000}});db.prepare('UPDATE workers SET value=? WHERE generation=1 AND position=0').run(JSON.stringify(saved));db.close();
  const run={dataInstanceId,runId:binding.pinnedRunId,runtimeId:'retained'};let supported=true,wrongSession=false;
  const services={readRun:async({kind,...options})=>{const result=await monitorData(runDir,{...options,kind,runRef:run});return kind&&kind!=='summary'?result:{...result,sessionId:wrongSession?'wrong':'s',deadlineControls:{available:supported,receipts:true}};},
    controlRun:({target,action,deadline})=>requestControl(runDir,{sessionId:'s',generation:target.generation,position:target.position,attempt:target.attempt,turnId:target.turnId,action,deadline}),
    readControlReceipt:({receiptId})=>readControl(runDir,receiptId)};
  const monitor=await createMonitor({runDir,binding,experienceServices:services});t.after(()=>monitor.close());const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token'),headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const path=`/api/runs/${binding.pinnedRunId}/control`,post=input=>fetch(url.origin+path,{method:'POST',headers,body:JSON.stringify(input)}),target={...run,generation:1,position:0,attempt:1,turnId:'turn'},input={generation:1,position:0,attempt:1,turnId:'turn',target,action:'worker-deadline',deadline:{operation:'extend',expectedRevision:3,valueMs:1000}};
  for(const change of [{dataInstanceId:'wrong'},{runId:'wrong'},{runtimeId:'wrong'},{generation:2},{attempt:2},{turnId:null}])assert.equal((await post({...input,target:{...target,...change}})).status,409);
  assert.equal((await post({...input,sessionId:'s'})).status,400);assert.equal((await post({...input,deadline:{...input.deadline,expectedRevision:2}})).status,409);
  supported=false;assert.equal((await post(input)).status,503);supported=true;wrongSession=true;assert.equal((await post(input)).status,403);wrongSession=false;
  const accepted=await post(input);assert.equal(accepted.status,202);const receipt=await accepted.json();assert.equal(receipt.deadline.operation,'extend');
  const response=await fetch(url.origin+`/api/runs/${binding.pinnedRunId}/control/receipts/${receipt.id}?generation=1`,{headers});assert.equal(response.status,200);assert.equal((await response.json()).id,receipt.id);
  const check=new DatabaseSync(join(runDir,'run.sqlite'),{readOnly:true});assert.equal(check.prepare('SELECT count(*) AS n FROM controls').get().n,1);check.close();
  assert.equal((await fetch(url.origin+`/api/runs/${binding.pinnedRunId}/messages?generation=1&position=0`,{headers})).status,200);
  const advanced=new DatabaseSync(join(runDir,'run.sqlite'));header.generation=2;advanced.prepare('UPDATE header SET value=?').run(JSON.stringify(header));
  const {digest}=await import('../engine/composition-contracts.mjs'),catalog=JSON.parse(advanced.prepare('SELECT value FROM step_catalogs WHERE generation=1 AND ordinal=0').get().value);delete catalog.catalogHash;catalog.generation=2;catalog.catalogHash=digest(catalog);advanced.prepare('INSERT INTO step_catalogs VALUES(2,0,?)').run(JSON.stringify(catalog));
  const ledger=JSON.parse(advanced.prepare('SELECT value FROM admission WHERE generation=1').get().value);Object.assign(ledger,{generation:2,nextSlot:0,consumed:0,reserved:0,accepting:false});advanced.prepare('INSERT INTO admission VALUES(2,?)').run(JSON.stringify(ledger));advanced.close();
  assert.equal((await fetch(url.origin+`/api/runs/${binding.pinnedRunId}/control/receipts/${receipt.id}?generation=1`,{headers})).status,200,'An observed ID remains readable after a later generation starts');
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
