/** @lane merge
 * @subject workflows/decomposition-delivery.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkflow } from '../engine/registry.mjs';
import { parseScript } from '../engine/script.mjs';
import {runWorkflow} from '../engine/controller.mjs';
import {createSettings} from '../engine/settings.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
async function recipe(t,name,args,respond,{permissions,expectedStatus='completed'}={}){
 const base=await mkdtemp(path.join(os.tmpdir(),'workflow-recipe-'));const cwd=path.join(base,'project');await mkdir(cwd);const calls=[];t.after(()=>rm(base,{recursive:true,force:true}));
 if(permissions?.sandbox==='workspace-write'){const git=(a)=>promisify(execFile)('git',a,{cwd,windowsHide:true});await git(['init','-q']);await git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','-qm','fixture']);}
 const settings=createSettings({catalog:[{model:'fixture',isDefault:true,defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low'}]}],defaults:{...(permissions?{permissions}:{})}});
 const cleanup={serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members',nativeTerminals:{inventoryEmpty:true}};
 const backend={identity:'recipe-fixture',resolveOptions:settings.resolve,async execute(request){const call={...request,...request.options};calls.push(call);try{return{value:await respond(call,calls),terminalObserved:true,evidence:{cleanup}};}catch(error){error.notStarted=true;error.noProcessStarted=true;throw error;}},close:async()=>cleanup};
 const found=await resolveWorkflow('plugin:'+name,{cwd});const run=await runWorkflow({runDir:path.join(base,'run'),sessionId:'recipe',script:found.script,args,backend,concurrency:3,launch:{cwd}});
 assert.equal(run.status,expectedStatus,JSON.stringify(run.error));return {run,result:run.result,calls};
}

test('documented task shapes are real parseable named JS workflows',async()=>{
 for(const name of ['item-audit','fix-until-check-passes','isolated-migration','changed-file-review','cross-source-research','loop-until-dry','decomposition-delivery']){
  const found=await resolveWorkflow('plugin:'+name);const parsed=parseScript(found.script);assert(parsed.meta.name);assert.match(parsed.body,/\b(agent|pipeline|parallel)\s*\(/);assert.match(parsed.body,/return\b/);
 }
});
test('item audit calls an independent verifier for each finding and preserves lost item/verifier slots',async t=>{
 const {result,calls}=await recipe(t,'item-audit',{items:[{id:'ok',scope:'src'},{id:'lost',scope:'missing'}]},request=>{
  if(request.phase==='Audit'){if(request.label==='lost')throw new Error('Lost audit worker');return {findings:[{id:'f1',statement:'First defect',evidence:['src:1']},{id:'f2',statement:'Second defect',evidence:['src:2']},{id:'f3',statement:'Unsupported claim',evidence:[]}]};}
  if(request.label.endsWith('2'))throw new Error('Lost verifier');if(request.label.endsWith('3'))return {verdict:'confirmed',evidence:[],reason:'No evidence available'};return {verdict:'confirmed',evidence:['src:1'],reason:'Independently checked'};
 });
 assert.equal(calls.filter(c=>c.phase==='Verify').length,3);assert.equal(result.expectedVerifications,3);assert.equal(result.completedVerifications,2);assert.equal(result.rows[0].findings[1].verification,null);assert.equal(result.rows[0].findings[1].status,'unverified');assert.equal(result.rows[0].findings[2].status,'unverified');assert.equal(result.rows[0].findings[2].verification.verdict,'confirmed');assert.equal(result.rows[1].audit,null);assert.equal(result.complete,false);
});
test('fix recipe carries cumulative patch and stops only after two consecutive no-progress rounds',async t=>{
 const {result,calls}=await recipe(t,'fix-until-check-passes',{task:'Fix parser',check:'node --test',maxRounds:8},request=>({passed:false,changed:request.label==='Round 1',fingerprint:'same-failure',checkOutput:'failed',patch:'complete patch',summary:'fixture check'}),{permissions:{sandbox:'workspace-write',networkAccess:false,approvalPolicy:'never'}});
 assert.equal(result.rounds.length,3);assert.equal(result.noProgressRounds,2);assert.equal(result.stopReason,'no-progress');assert(calls.every(c=>c.permissions.sandbox==='workspace-write'&&c.workspace?.cwd));assert.equal(new Set(calls.map(c=>c.workspace.cwd)).size,3);assert.match(calls[1].prompt,/Cumulative patch:\ncomplete patch/);
});
test('migration requests disjoint isolated workers and failed integration review remains incomplete',async t=>{
 const {result,calls}=await recipe(t,'isolated-migration',{migration:'Update imports',slices:[{id:'a',scope:'a/'},{id:'b',scope:'b/'}]},request=>{if(request.phase==='Review')throw new Error('Review unavailable');return {files:[request.label+'/file.js'],patch:'diff',checks:['node --test passed'],summary:'migrated'};},{permissions:{sandbox:'workspace-write',networkAccess:false,approvalPolicy:'never'}});
 assert.equal(calls.filter(c=>c.permissions.sandbox==='workspace-write'&&c.workspace?.cwd).length,2);assert.equal(calls.find(c=>c.phase==='Review').permissions.sandbox,'read-only');assert.equal(result.review,null);assert.equal(result.reviewStatus,'unverified');assert.equal(result.complete,false);assert.equal(result.ready,false);
});
test('changed-file reduction cannot hide a lost file slot',async t=>{
 const {result}=await recipe(t,'changed-file-review',{files:['ok.js','lost.js']},request=>{if(request.phase==='Reduce')return 'One review remains missing';if(request.label==='lost.js')throw new Error('Lost file reviewer');return {findings:[],evidence:['ok.js:1']};});
 assert.equal(result.rows[1].id,'lost.js');assert.equal(result.rows[1].result,null);assert.equal(result.unverified,1);assert.equal(result.complete,false);
});
test('schema-valid inaccessible, partial and empty research evidence remains incomplete',async t=>{
 const {result}=await recipe(t,'cross-source-research',{question:'Which claim is supported?',sources:[{id:'accessible'},{id:'inaccessible'},{id:'partial'},{id:'empty'},{id:'lost'}]},request=>{
  if(request.phase==='Cross-check')return {confirmed:['Supported claim'],contradictions:[],unverified:['Missing source coverage'],citations:['https://primary.test/a']};
  if(request.label==='lost')throw new Error('Lost source worker');
  return {access:request.label==='partial'?'partial':request.label==='inaccessible'?'inaccessible':'accessible',claims:request.label==='accessible'?['Supported claim']:[],citations:request.label==='accessible'?['https://primary.test/a']:[],limitations:request.label==='accessible'?[]:['Coverage missing']};
 });
 assert.equal(result.completed,4);assert.equal(result.evidenceCovered,1);assert.equal(result.unverified,4);assert.equal(result.rows.find(r=>r.id==='inaccessible').status,'inaccessible');assert.equal(result.rows.find(r=>r.id==='partial').status,'partial');assert.equal(result.rows.find(r=>r.id==='empty').status,'unverified');assert.equal(result.rows.find(r=>r.id==='lost').result,null);assert.equal(result.crossCheckStatus,'partial');assert.equal(result.complete,false);
 const uncited=await recipe(t,'cross-source-research',{question:'Supported?',sources:[{id:'one'}]},request=>request.phase==='Cross-check'?{confirmed:['Claim'],contradictions:[],unverified:[],citations:[]}:{access:'accessible',claims:['Claim'],citations:['source:1'],limitations:[]});assert.equal(uncited.result.complete,false);assert.equal(uncited.result.crossCheckStatus,'unverified');assert.deepEqual(uncited.result.crossCheck.citations,[]);
});
test('loop discovery keeps refuted/missing items, deduplicates prototype-like IDs and waits two dry rounds',async t=>{
 const {result,calls}=await recipe(t,'loop-until-dry',{question:'Find and verify defects',verify:true,maxRounds:10},request=>{
  if(request.phase==='Verify'){if(request.label==='missing')throw new Error('Lost discovered-item verifier');if(request.label==='empty')return {verdict:'confirmed',evidence:'  '};return {verdict:'refuted',evidence:'Independent refutation'};}
  return {items:[{id:'__proto__',evidence:'candidate'},{id:'missing',evidence:'candidate'},{id:'empty',evidence:'candidate'}],exhausted:true,limitations:[]};
 });
 assert.equal(calls.filter(c=>c.phase==='Discover').length,3);assert.equal(calls.filter(c=>c.phase==='Verify').length,3);assert.equal(result.items.length,3);assert.equal(result.items.find(i=>i.id==='__proto__').status,'refuted');assert.equal(result.items.find(i=>i.id==='missing').verification,null);assert.equal(result.items.find(i=>i.id==='empty').status,'unverified');assert.equal(result.dryRounds,2);assert.equal(result.complete,false);assert(calls.filter(c=>c.phase==='Discover').slice(1).every(c=>c.prompt.includes('__proto__')&&c.prompt.includes('missing')));
});

const deliveryPermissions={sandbox:'workspace-write',networkAccess:false,approvalPolicy:'never'};
function deliveryPlan(ids=['ui','assets']){
 return {version:1,revision:1,priorRun:null,objectives:ids.map(id=>({id:'objective-'+id,description:'Deliver '+id})),tasks:ids.map(id=>({id,objectiveIds:['objective-'+id],phase:'Build',inputs:['Captured source only; predecessor reports are JSON context'],exclusions:[],readScope:['app/'],writeOwnership:['app/'+id+'/'],prerequisites:[],dependsOn:[],artifactContract:[{claimId:id,relativePath:'app/'+id+'/output.js'}],acceptanceChecks:[{id:'check-'+id,command:'coordinator check '+id,required:true}],limits:{timeoutMs:60000}})),replacements:[]};
}
function scoutReport(request){
 return {taskId:request.label,files:[{relativePath:'app/existing.js',detail:'Read source'}],proposedSlices:[{id:request.label,readScope:['app/'],writeOwnership:['app/'+request.label+'/']}],interfaces:[],prerequisites:[],uncertainties:[]};
}
function taskReport(id,outcome='delivered'){
 return {contract:'agent-workflow.task.v1',taskId:id,outcome,summary:'Authored '+id,blockers:[],artifacts:[{claimId:id,relativePath:'app/'+id+'/output.js',sha256:null,bytes:null}],checks:[{checkId:'check-'+id,status:'notRun',evidenceRefs:[]}]};
}
test('delivery rejects overlapping writer paths before even scouts can dispatch',async t=>{
 for(const ownership of [['app/UI/'],['app/ui/nested/']]){
  const plan=deliveryPlan();plan.tasks[1].writeOwnership=ownership;plan.tasks[1].artifactContract[0].relativePath=ownership[0]+'output.js';
  const {calls,run}=await recipe(t,'decomposition-delivery',{planRevision:plan},()=>{throw new Error('Invalid plan dispatched');},{expectedStatus:'failed'});
  assert.equal(calls.length,0);assert.equal(run.error.code,'SCRIPT_FAILED');
 }
});
test('delivery scouts become isolated deliverable workers and JSON dependencies do not certify integration',async t=>{
 const plan=deliveryPlan();plan.tasks[1].dependsOn=['ui'];
 const {result,calls}=await recipe(t,'decomposition-delivery',{planRevision:plan},request=>request.phase==='Scout'?scoutReport(request):taskReport(request.label),{permissions:deliveryPermissions});
 assert.equal(calls.filter(c=>c.phase==='Scout').length,2);assert(calls.filter(c=>c.phase==='Scout').every(c=>c.permissions.sandbox==='read-only'));
 const writers=calls.filter(c=>c.phase==='Deliver');assert.equal(writers.length,2);assert(writers.every(c=>c.permissions.sandbox==='workspace-write'&&c.workspace?.cwd));assert.equal(new Set(writers.map(c=>c.workspace.cwd)).size,2);
 assert.match(writers[1].prompt,/Authored ui/);assert.match(writers[1].prompt,/predecessor files/i);assert(writers[1].options.dependsOn.includes(writers[0].options.id));assert.equal(writers[0].options.maxAttempts,1);
 assert.deepEqual(result.expectedObjectiveIds,['objective-ui','objective-assets']);assert.equal(result.rows[0].outcome,'delivered');assert.equal(result.rows[0].accepted,false);assert.equal(result.rows[0].workerRef,null);
 assert.equal(result.integration.status,'coordinatorRequired');assert(result.verification.rows.every(row=>row.result===null));assert.deepEqual(result.missingObjectiveIds,result.expectedObjectiveIds);assert.equal(result.complete,false);
});

test('delivery honors explicit unbounded or long worker budgets without imposing a recipe ceiling',async t=>{
 const plan=deliveryPlan();plan.tasks[0].limits.timeoutMs=null;plan.tasks[1].limits.timeoutMs=7200000;
 const {calls}=await recipe(t,'decomposition-delivery',{planRevision:plan},request=>request.phase==='Scout'?scoutReport(request):taskReport(request.label),{permissions:deliveryPermissions});
 assert.equal(calls.length,4);
 for(const call of calls)assert.equal(call.timeoutMs,call.label==='ui'?null:7200000);
});
test('missing rendering prerequisites preserve source authoring and exact blocked checks',async t=>{
 const plan=deliveryPlan(['audio']);plan.tasks[0].prerequisites=[{id:'renderer',command:'render audio.wav',executablePath:'C:/verified/render.exe',cachePath:'C:/verified/render-cache',requiredFor:'verification'}];
 const {result,calls}=await recipe(t,'decomposition-delivery',{planRevision:plan},request=>{
  if(request.phase==='Scout'){const report=scoutReport(request);report.prerequisites=[{id:'renderer',available:false,command:'render audio.wav',executablePath:'C:/verified/render.exe',cachePath:'C:/verified/render-cache',evidence:'Executable absent in isolated worktree'}];return report;}
  const report=taskReport('audio','incomplete');report.blockers=[{code:'E_RENDERER_MISSING',detail:'render audio.wav; C:/verified/render.exe absent; cache C:/verified/render-cache',evidenceRefs:[]}];return report;
 },{permissions:deliveryPermissions});
 assert.equal(calls.filter(c=>c.phase==='Deliver').length,1);assert.match(calls.find(c=>c.phase==='Deliver').prompt,/C:\/verified\/render.exe/);assert.equal(result.rows[0].outcome,'incomplete');assert.equal(result.rows[0].scout.prerequisites[0].available,false);assert.equal(result.complete,false);
});
test('lost scouts, blocked dependencies and missing artifacts keep distinct null coverage without retry',async t=>{
 const plan=deliveryPlan(['lost','partial','dependent']);plan.tasks[2].dependsOn=['partial'];
 const {result,calls}=await recipe(t,'decomposition-delivery',{planRevision:plan},request=>{
  if(request.phase==='Scout'){if(request.label==='lost')throw new Error('Scout unavailable');return scoutReport(request);}
  const report=taskReport(request.label);report.artifacts=[];return report;
 },{permissions:deliveryPermissions});
 assert.deepEqual(calls.filter(c=>c.phase==='Deliver').map(c=>c.label),['partial']);assert.equal(result.rows[0].scout,null);assert.equal(result.rows[0].report,null);assert.equal(result.rows[1].outcome,'delivered');assert.equal(result.rows[1].deliveryEvidence,'missing');assert.equal(result.rows[2].report,null);assert.match(result.rows[2].reason,/prerequisite/i);assert.equal(result.complete,false);
});
test('a completed blocked report, invalid prose, lost delivery and an unassigned objective never count as coverage',async t=>{
 const plan=deliveryPlan(['blocked','prose','lost']);plan.objectives.push({id:'unassigned',description:'Retain a requested objective without a dispatched task'});
 const {result,run,calls}=await recipe(t,'decomposition-delivery',{planRevision:plan},request=>{
  if(request.phase==='Scout')return scoutReport(request);
  if(request.label==='lost')throw new Error('Delivery unavailable');
  if(request.label==='prose')return 'E_BROWSER_MISSING; native turn completed';
  return taskReport('blocked','blocked');
 },{permissions:deliveryPermissions});
 assert.equal(calls.filter(c=>c.phase==='Deliver').length,3,'Lost or invalid answers must not be retried');
 assert.equal(run.workers.find(worker=>worker.options.id===result.rows[0].workerId).status,'completed');assert.equal(result.rows[0].outcome,'blocked');
 assert.equal(result.rows[1].report,null);assert.equal(result.rows[1].outcome,null);assert.equal(result.rows[2].report,null);
 assert(result.missingObjectiveIds.includes('unassigned'));assert.deepEqual(result.missingObjectiveIds,result.expectedObjectiveIds);assert.equal(result.complete,false);
});
test('an unavailable authoring prerequisite blocks only its task',async t=>{
 const plan=deliveryPlan(['blocked','safe']);plan.tasks[0].prerequisites=[{id:'source-generator',command:'generate source',executablePath:'C:/verified/generate.exe',cachePath:null,requiredFor:'authoring'}];
 const {result,calls}=await recipe(t,'decomposition-delivery',{planRevision:plan},request=>request.phase==='Scout'?scoutReport(request):taskReport(request.label),{permissions:deliveryPermissions});
 assert.deepEqual(calls.filter(c=>c.phase==='Deliver').map(c=>c.label),['safe']);assert.equal(result.rows[0].report,null);assert.match(result.rows[0].reason,/generate source/);assert.match(result.rows[0].reason,/C:\/verified\/generate.exe/);assert.equal(result.rows[1].outcome,'delivered');assert.equal(result.complete,false);
});
test('fresh verification requires reviewed producer evidence and a coordinator integrated snapshot',async t=>{
 const plan=deliveryPlan(['ui']);
 const absent=await recipe(t,'decomposition-delivery',{stage:'verify',planRevision:plan},()=>{throw new Error('Unreviewed verification dispatched');});
 assert.equal(absent.calls.length,0);assert.equal(absent.result.verification.rows[0].result,null);assert.equal(absent.result.complete,false);
 const integration={receiptRef:'retained:integration/receipt',snapshotRef:'retained:inputs/manifest',snapshotHash:'a'.repeat(64),handoffs:[{taskId:'ui',producer:{run:{dataInstanceId:'instance',runId:'producer-run',runtimeId:'runtime'},generation:1,position:2,attempt:1},captureRef:'retained:capture/manifest',captureHash:'b'.repeat(64),allowedPaths:['app/ui/output.js'],acceptanceEvidenceRefs:['retained:review/receipt']}]};
 const {calls,result}=await recipe(t,'decomposition-delivery',{stage:'verify',planRevision:plan,integration},request=>{const report=taskReport(request.label);report.checks[0]={checkId:'check-ui',status:'passed',evidenceRefs:[]};return report;});
 assert.equal(calls.length,1);assert.equal(calls[0].phase,'Verify');assert.equal(calls[0].permissions.sandbox,'read-only');assert.match(calls[0].prompt,/retained:inputs\/manifest/);
 assert.equal(result.verification.rows[0].status,'unverified');assert.equal(result.integration.status,'recorded');assert.equal(result.complete,false);
 const evidenced=await recipe(t,'decomposition-delivery',{stage:'verify',planRevision:plan,integration},request=>{const report=taskReport(request.label);report.artifacts[0].sha256='c'.repeat(64);report.artifacts[0].bytes=12;report.checks[0]={checkId:'check-ui',status:'passed',evidenceRefs:['retained:fresh-check/receipt']};return report;});
 assert.equal(evidenced.result.verification.rows[0].status,'reported');assert.equal(evidenced.result.rows[0].accepted,false);assert.equal(evidenced.result.complete,false,'Worker receipts still need authoritative coordinator acceptance');
});
test('unknown replacements reject forged receipt references while independent safe scope still delivers',async t=>{
 const plan=deliveryPlan(['replacement','safe','dependent']);plan.tasks[2].dependsOn=['replacement'];plan.revision=2;plan.priorRun={dataInstanceId:'instance',runId:'prior-run',runtimeId:'runtime'};
 const replacement={taskId:'replacement',prior:{run:plan.priorRun,generation:1,position:4,attempt:2,taskId:'original',outcome:'unknown',effects:'uncertain'},admission:null};plan.replacements=[replacement];
 for(const admission of [null,{reconciliationEvidenceRef:'retained:forged-reconciliation/receipt',drainEvidenceRef:'retained:forged-drain/receipt'}]){
  replacement.admission=admission;
  const {result,calls}=await recipe(t,'decomposition-delivery',{planRevision:plan},request=>{assert.notEqual(request.label,'replacement','Uncertain replacement must never dispatch');if(request.phase==='Scout')return scoutReport(request);assert.equal(request.label,'safe');return taskReport(request.label);},{permissions:deliveryPermissions});
  assert.deepEqual(result.planRevision,plan);assert.equal(result.planRevision.replacements[0].prior.outcome,'unknown');assert.equal(result.planRevision.replacements[0].prior.attempt,2);assert.equal(calls.filter(c=>c.phase==='Deliver').length,1);assert.equal(result.rows[0].report,null);assert.equal(result.rows[0].workerId,null);assert.match(result.rows[0].reason,/coordinator|authoritative/i);assert.equal(result.rows[1].outcome,'delivered');assert.equal(result.rows[2].report,null);assert.match(result.rows[2].reason,/prerequisite/i);assert.equal(result.complete,false);
 }
 replacement.prior.outcome='failed';replacement.prior.effects='reconciled';
 const reconciled=await recipe(t,'decomposition-delivery',{planRevision:plan},request=>{assert.notEqual(request.label,'replacement');if(request.phase==='Scout')return scoutReport(request);assert.equal(request.label,'safe');return taskReport(request.label);},{permissions:deliveryPermissions});
 assert.equal(reconciled.result.rows[0].report,null,'Caller classification as reconciled is not authority');assert.equal(reconciled.result.planRevision.replacements[0].prior.outcome,'failed');
});
