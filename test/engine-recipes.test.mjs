/** @lane merge
 * @subject workflows/decomposition-delivery.js
 * @subject workflows/criterion-review.js
 * @subject workflows/evidence-research.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkflow, listWorkflows } from '../engine/registry.mjs';
import { evaluate } from '../engine/evaluate.mjs';
import { compileSchema } from '../engine/schema.mjs';
import { selectCapabilities } from '../engine/worker-capabilities.mjs';
import { createHash } from 'node:crypto';
import { parseScript } from '../engine/script.mjs';
import {runWorkflow} from '../engine/controller.mjs';
import {createSettings} from '../engine/settings.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
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
test('criterion and evidence recipes are discoverable bundled definitions',async()=>{
 const names=(await listWorkflows()).filter(row=>row.scope==='plugin').map(row=>row.name);
 assert(names.includes('criterion-review'),'Missing criterion-review recipe');
 assert(names.includes('evidence-research'),'Missing evidence-research recipe');
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

// This seam runs the actual separate QuickJS process. Only model/native dispatch is
// replaced; the controlled respondents inspect real fixture bytes. It does not
// certify native activation, tool operation, research quality or delivery acceptance.
async function capturedRecipe(name,args,respond,{script,admit}={}){
 const calls=[];
 const source=script??(await resolveWorkflow('plugin:'+name)).script;
 const result=await evaluate(source,{args,call:async(method,params)=>{
  if(method!=='agent')return null;
  const task=JSON.parse(params.prompt);const call={...params,task};calls.push(call);
  admit?.(params.options);
  const value=await respond(call,calls);
  if(value===null)return null;
  const schema=compileSchema(params.options.schema);
  assert(schema.validate(value),JSON.stringify(schema.errors()));
  return value;
 }});
 return {result,calls};
}
const noSelection=()=>({skills:[],requireTools:[]});
function selections(roles){return Object.fromEntries(roles.map(role=>[role,noSelection()]));}
async function evidenceFixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'workflow-evidence-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const file=path.join(root,'evidence.txt');const bytes=Buffer.from('Independent fixture evidence\n');
 await writeFile(file,bytes);
 return {path:file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
}
async function inspectEvidence(ref){
 try{const bytes=await readFile(ref.path);const sha256=createHash('sha256').update(bytes).digest('hex');return {...ref,sha256,bytes:bytes.length,status:sha256===ref.sha256&&bytes.length===ref.bytes?'verified':'changed'};}
 catch(error){if(error.code!=='ENOENT')throw error;return {...ref,status:'missing'};}
}
function criterionArgs(ref){return {version:1,criteria:[{id:'__proto__',text:'The evidence meets the criterion',evidenceRefs:[ref]}],artifactInventory:[ref],roleSelections:selections(['reviewer','skeptic','reducer']),limits:{maxCriteria:32,maxStarts:5,maxRounds:1}};}
async function criterionResponse({task}){
 if(task.role==='reducer')return {summary:'Claims only; coordinator must inspect evidence',dissent:[]};
 return {criterionId:task.criterion.id,verdict:'pass',evidenceRefs:await Promise.all(task.criterion.evidenceRefs.map(inspectEvidence)),dissent:[]};
}
test('criterion review forwards genuine selections to distinct evidence-reading roles',async t=>{
 const ref=await evidenceFixture(t);const args=criterionArgs(ref);
 args.roleSelections.reviewer={skills:['review-skill'],requireTools:['review-tool']};
 args.roleSelections.skeptic={skills:['skeptic-skill'],requireTools:['inspect-tool']};
 const {result,calls}=await capturedRecipe('criterion-review',args,criterionResponse);
 assert.equal(calls.length,3);assert.equal(new Set(calls.map(c=>c.options.id)).size,3);
 for(const call of calls){assert.deepEqual(call.options.skills,args.roleSelections[call.task.role].skills);assert.deepEqual(call.options.requireTools,args.roleSelections[call.task.role].requireTools);assert.equal(call.options.maxAttempts,1);assert.equal(call.options.timeoutMs,null);}
 const skeptic=calls.find(c=>c.task.role==='skeptic');assert.deepEqual(skeptic.task.artifactInventory,[ref]);assert.equal(skeptic.task.review.verdict,'pass');
 assert.match(skeptic.task.instructions,/independent/i);assert.match(skeptic.task.instructions,/skills.list/);
 assert.equal(result.rows[0].status,'reportedPass');assert.deepEqual(result.coveredIds,['__proto__']);assert.deepEqual(result.missingIds,[]);assert.equal(result.complete,false);assert.equal(result.completionAuthority,'coordinator');
});
test('criterion null skeptic and missing skill cannot become a pass through reduction',async t=>{
 const args=criterionArgs(await evidenceFixture(t));
 const {result,calls}=await capturedRecipe('criterion-review',args,call=>{
  if(call.task.role==='skeptic')throw new Error('Selected skill unavailable');return criterionResponse(call);
 });
 assert.equal(calls.length,3);assert.equal(result.rows[0].rounds[0].skeptic,null);assert.equal(result.rows[0].status,'unverified');assert.deepEqual(result.missingIds,['__proto__']);assert.equal(result.complete,false);
});
test('criterion hash drift, missing file and dissent survive independent review',async t=>{
 const ref=await evidenceFixture(t);const args=criterionArgs(ref);await writeFile(ref.path,'changed bytes');
 const changed=await capturedRecipe('criterion-review',args,criterionResponse);
 assert.equal(changed.result.rows[0].status,'unverified');assert.equal(changed.result.rows[0].rounds[0].review.evidenceRefs[0].status,'changed');
 await rm(ref.path);const missing=await capturedRecipe('criterion-review',args,criterionResponse);assert.equal(missing.result.rows[0].status,'unverified');assert.equal(missing.result.rows[0].rounds[0].skeptic.evidenceRefs[0].status,'missing');
 await writeFile(ref.path,'Independent fixture evidence\n');
 const dissent=await capturedRecipe('criterion-review',args,async call=>{const row=await criterionResponse(call);if(call.task.role==='skeptic'){row.verdict='fail';row.dissent=['Counterexample in the evidence'];}return row;});
 assert.equal(dissent.result.rows[0].status,'reportedFail');assert(dissent.result.rows[0].dissent.includes('Counterexample in the evidence'));
});
test('criterion round history cannot erase an earlier null slot',async t=>{
 const args=criterionArgs(await evidenceFixture(t));args.limits.maxRounds=2;
 const {result,calls}=await capturedRecipe('criterion-review',args,call=>call.task.role==='skeptic'&&call.task.round===1?null:criterionResponse(call));
 assert.equal(calls.length,5);assert.equal(result.rows[0].rounds.length,2);assert.equal(result.rows[0].rounds[0].skeptic,null);assert.equal(result.rows[0].status,'unverified');
});
function researchArgs(ref){return {version:1,sources:[{id:'__proto__',...ref,modality:'text'}],questions:[{id:'question',text:'What does the fixture support?'}],roleSelections:selections(['reader','skeptic','reducer']),limits:{maxSources:64,maxStarts:6,maxRounds:1,dryRoundLimit:2}};}
async function researchResponse({task}){
 if(task.role==='reducer')return {summary:'Retain source coverage',dissent:[]};
 const evidence=await inspectEvidence(task.source);
 const evidenceRef={path:evidence.path,sha256:evidence.sha256,bytes:evidence.bytes,status:evidence.status};
 if(task.role==='skeptic')return {sourceId:task.source.id,disposition:'read',verdict:'supported',questionIds:['question'],evidenceRefs:[evidenceRef],limitations:[],dissent:[]};
 return {sourceId:task.source.id,disposition:'read',evidenceRefs:[evidenceRef],answers:[{questionId:'question',text:'Fixture-supported answer'}],limitations:[],dissent:[],needsNextRound:false};
}
test('criterion coverage reducer has a coherent role while original dissent and null slots stay authoritative',async t=>{
 const args=criterionArgs(await evidenceFixture(t));args.criteria.push({...args.criteria[0],id:'missing'});
 const {result,calls}=await capturedRecipe('criterion-review',args,async call=>{
  const {task}=call;
  if(task.role==='reducer'){
   assert.equal(task.summaryScope,'reportedCoverageOnly');assert.match(task.instructions,/coverage.only/i);
   assert.doesNotMatch(task.instructions,/Verify regular files|full SHA-256|Perform independent inspection/);
   assert.match(task.instructions,/skills\.list/);assert.match(task.instructions,/skills\.read/);
   assert(task.rows[0].dissentCount>0);assert.equal(task.rows[1].rounds[0].skeptic,null);
   return {summary:'Reported coverage only; original evidence remains for coordinator review',dissent:[]};
  }
  if(task.role==='skeptic'&&task.criterion.id==='missing')return null;
  const report=await criterionResponse(call);
  if(task.role==='skeptic'){report.verdict='fail';report.dissent=['Independent counterexample'];}
  return report;
 });
 assert.equal(calls.length,5);assert.deepEqual(result.missingRoles,[]);assert.match(result.reduction.summary,/coverage only/);
 assert.equal(result.rows[0].status,'reportedFail');assert(result.rows[0].dissent.includes('Independent counterexample'));
 assert.equal(result.rows[1].rounds[0].skeptic,null);assert.deepEqual(result.missingIds,['missing']);assert.equal(result.complete,false);
});

test('research coverage reducer receives disputes without inventing source inspection or replacing original answers',async t=>{
 const args=researchArgs(await evidenceFixture(t));args.sources.push({...args.sources[0],id:'counterevidence'});
 const {result,calls}=await capturedRecipe('evidence-research',args,async call=>{
  const {task}=call;
  if(task.role==='reducer'){
   assert.equal(task.summaryScope,'reportedCoverageOnly');assert.match(task.instructions,/coverage.only/i);
   assert.doesNotMatch(task.instructions,/Verify regular file|full SHA-256|Perform independent evidence inspection/);
   assert.match(task.instructions,/skills\.list/);assert.match(task.instructions,/skills\.read/);
   assert.deepEqual(task.disputedQuestionIds,['question']);assert.equal(task.rows[1].dissentCount,1);
   return {summary:'Two sources reported read; the question remains disputed',dissent:['Original dissent is retained in source reports']};
  }
  const report=await researchResponse(call);
  if(task.role==='skeptic'&&task.source.id==='counterevidence'){report.verdict='contradicted';report.dissent=['Independent source disagrees'];}
  return report;
 });
 assert.equal(calls.length,5);assert.deepEqual(result.missingRoles,[]);assert.match(result.reductions[0].summary,/disputed/);
 assert.deepEqual(result.disputedQuestionIds,['question']);assert.deepEqual(result.missingQuestionIds,['question']);
 assert.equal(result.rows[0].rounds[0].read.answers[0].text,'Fixture-supported answer');
 assert(result.rows[1].dissent.includes('Independent source disagrees'));assert.equal(result.counts.read,2);assert.equal(result.complete,false);
});

test('research preserves mutually exclusive sampled, dropped, inaccessible, partial and null source coverage',async t=>{
 const ref=await evidenceFixture(t);const args=researchArgs(ref);args.limits.maxStarts=32;
 args.roleSelections={reader:{skills:['reader-skill'],requireTools:['read-tool']},skeptic:{skills:['skeptic-skill'],requireTools:['inspect-tool']},reducer:{skills:['reduce-skill'],requireTools:[]}};
 args.sources=['read','sampled','dropped','inaccessible','partial','lost','null-skeptic'].map(id=>({id,...ref,modality:id==='inaccessible'?'image':'text',...(['sampled','dropped'].includes(id)?{selection:{disposition:id,reason:'Explicit coordinator exclusion'}}:{})}));
 const {result,calls}=await capturedRecipe('evidence-research',args,async call=>{
  const id=call.task.source?.id;if(id==='lost'&&call.task.role==='reader')throw new Error('Reader lost');if(id==='null-skeptic'&&call.task.role==='skeptic')return null;
  const row=await researchResponse(call);if(id==='inaccessible'){row.disposition='inaccessible';row.evidenceRefs=[];row.limitations=['Required image tool unavailable'];if(call.task.role==='reader')row.answers=[];}
  if(id==='partial')row.disposition='partial';return row;
 });
 assert.deepEqual(result.counts,{read:1,partial:2,inaccessible:1,failed:1,sampled:1,dropped:1});assert.equal(result.expected,7);assert.equal(result.accounted,7);
 assert.deepEqual(result.allSeenIds,['read','inaccessible','partial','lost','null-skeptic']);assert.equal(calls.filter(c=>c.task.source?.selection).length,0);
 assert.equal(result.rows.find(r=>r.sourceId==='lost').rounds[0].read,null);assert.equal(result.rows.find(r=>r.sourceId==='null-skeptic').rounds[0].skeptic,null);
 assert.equal(result.stopReason,'inventoryExhausted');assert.equal(result.complete,false);
 for(const call of calls){assert.deepEqual(call.options.skills,args.roleSelections[call.task.role].skills);assert.deepEqual(call.options.requireTools,args.roleSelections[call.task.role].requireTools);}
});
test('research stops dry rounds without adding sources or repairing lost slots',async t=>{
 const args=researchArgs(await evidenceFixture(t));args.limits.maxRounds=2;args.limits.dryRoundLimit=1;
 const {result,calls}=await capturedRecipe('evidence-research',args,async call=>{const row=await researchResponse(call);if(call.task.role==='reader'){row.disposition='partial';row.answers=[];row.needsNextRound=true;}return row;});
 assert.equal(calls.length,3);assert.equal(result.dryRounds,1);assert.equal(result.stopReason,'dryRounds');assert.deepEqual(result.missingQuestionIds,['question']);
 // Losing existing support is dry; replacing it with a newly supported ID is
 // progress even when coverage has the same cardinality.
 for(const replacement of [false,true]){
  const changed=structuredClone(args);if(replacement){changed.questions.push({id:'replacement',text:'What new answer is supported?'});changed.sources.push({...changed.sources[0],id:'counterevidence'});changed.limits.maxStarts=10;}
  const next=await capturedRecipe('evidence-research',changed,async call=>{
   const row=await researchResponse(call);
   if(call.task.role==='reader'){row.disposition='partial';row.needsNextRound=true;}
   if(call.task.round===2){
    if(replacement&&call.task.source?.id!=='counterevidence'){if(call.task.role==='reader')row.answers=[{questionId:'replacement',text:'New supported answer'}];if(call.task.role==='skeptic')row.questionIds=['replacement'];}
    else if(call.task.role==='skeptic'){row.verdict='contradicted';row.dissent=['Earlier support contradicted'];}
   }
   return row;
  });
  assert.equal(next.calls.length,replacement?10:6);assert.equal(next.result.dryRounds,replacement?0:1);
  assert.equal(next.result.stopReason,replacement?'roundLimit':'dryRounds');
  assert.deepEqual(next.result.coveredQuestionIds,replacement?['replacement']:[]);
 }
});
test('research covers an answer first discovered in a planned later round',async t=>{
 const args=researchArgs(await evidenceFixture(t));args.limits.maxRounds=2;
 const {result,calls}=await capturedRecipe('evidence-research',args,async call=>{
  const report=await researchResponse(call);
  if(call.task.round===1&&call.task.role==='reader'){report.disposition='partial';report.answers=[];report.needsNextRound=true;}
  if(call.task.round===1&&call.task.role==='skeptic'){report.disposition='partial';report.verdict='unverified';report.questionIds=[];report.dissent=['No answer established yet'];}
  return report;
 });
 assert.equal(calls.length,6);assert.equal(result.rows[0].rounds.length,2);
 assert.deepEqual(result.rows[0].rounds[0].read.answers,[]);
 assert.deepEqual(result.coveredQuestionIds,['question']);assert.deepEqual(result.missingQuestionIds,[]);
 assert.deepEqual(result.disputedQuestionIds,[]);assert.equal(result.rows[0].disposition,'read');
 assert(result.rows[0].dissent.includes('No answer established yet'));
 assert.equal(result.complete,false);assert.equal(result.completionAuthority,'coordinator');
});

for(const disposition of ['failed','inaccessible'])test('research does not continue after a '+disposition+' skeptic with matching evidence',async t=>{
 const args=researchArgs(await evidenceFixture(t));args.limits.maxRounds=2;
 const {result,calls}=await capturedRecipe('evidence-research',args,async call=>{
  const report=await researchResponse(call);
  if(call.task.role==='reader'){report.disposition='partial';report.answers=[];report.needsNextRound=true;}
  if(call.task.role==='skeptic'){report.disposition=disposition;report.verdict='unverified';report.questionIds=[];report.limitations=['Independent inspection unavailable'];}
  return report;
 });
 assert.equal(result.rows[0].rounds[0].skeptic.evidenceRefs[0].status,'verified');
 assert.equal(calls.length,3,'An ineligible skeptic must not trigger a second reader, skeptic or reducer');
 assert.equal(result.starts,3);assert.equal(result.rows[0].rounds.length,1);
 assert.equal(result.rows[0].rounds[0].skeptic.disposition,disposition);
 assert.equal(result.rows[0].disposition,'partial');assert.deepEqual(result.missingQuestionIds,['question']);
 assert.equal(result.stopReason,'inventoryExhausted');assert.equal(result.complete,false);
});

test('research skeptical contradictions and changed hashes cannot be reduced to covered questions',async t=>{
 const args=researchArgs(await evidenceFixture(t));
 const contradicted=await capturedRecipe('evidence-research',args,async call=>{const row=await researchResponse(call);if(call.task.role==='skeptic'){row.verdict='contradicted';row.dissent=['Independent contradiction'];}return row;});
 assert.deepEqual(contradicted.result.missingQuestionIds,['question']);assert(contradicted.result.rows[0].dissent.includes('Independent contradiction'));
 await writeFile(args.sources[0].path,'drift');const drift=await capturedRecipe('evidence-research',args,researchResponse);assert.deepEqual(drift.result.missingQuestionIds,['question']);assert.equal(drift.result.rows[0].disposition,'partial');
});
for(const verdict of ['contradicted','unverified',null])test('a later '+String(verdict)+' research skeptic leaves the question unresolved',async t=>{
 const args=researchArgs(await evidenceFixture(t));args.limits.maxRounds=2;
 const {result}=await capturedRecipe('evidence-research',args,async call=>{
  if(call.task.role==='skeptic'&&call.task.round===2&&verdict===null)return null;
  const row=await researchResponse(call);
  if(call.task.role==='reader'&&call.task.round===1){row.disposition='partial';row.needsNextRound=true;}
  if(call.task.role==='skeptic'&&call.task.round===2){row.verdict=verdict;row.dissent=['Later independent support unavailable'];}
  return row;
 });
 assert.equal(result.rows[0].rounds.length,2);assert.deepEqual(result.missingQuestionIds,['question']);
 if(verdict!==null)assert(result.rows[0].dissent.includes('Later independent support unavailable'));
 else assert.equal(result.rows[0].rounds[1].skeptic,null);
});
test('independent disagreement across research sources keeps a disputed question missing',async t=>{
 const args=researchArgs(await evidenceFixture(t));args.sources.push({...args.sources[0],id:'counterevidence'});
 const {result}=await capturedRecipe('evidence-research',args,async call=>{const row=await researchResponse(call);if(call.task.role==='skeptic'&&call.task.source.id==='counterevidence'){row.verdict='contradicted';row.dissent=['Independent source disagrees'];}return row;});
 assert.deepEqual(result.missingQuestionIds,['question']);assert.deepEqual(result.disputedQuestionIds,['question']);assert.equal(result.counts.read,2);
});
test('research range evidence remains partial even when a question is supported',async t=>{
 const args=researchArgs(await evidenceFixture(t));args.sources[0].range={start:0,end:5};
 const {result}=await capturedRecipe('evidence-research',args,researchResponse);
 assert.equal(result.rows[0].disposition,'partial');assert.deepEqual(result.missingIds,['__proto__']);assert.deepEqual(result.coveredQuestionIds,['question']);assert.equal(result.complete,false);
});
test('missing real capability-bundle admission leaves role slots null',async t=>{
 const args=criterionArgs(await evidenceFixture(t));args.roleSelections.reviewer={skills:['not-admitted'],requireTools:['missing-tool']};
 const {result}=await capturedRecipe('criterion-review',args,criterionResponse,{admit:options=>selectCapabilities(undefined,options)});
 assert.equal(result.rows[0].rounds[0].review,null);assert.equal(result.rows[0].status,'unverified');
});
test('planned research continuation stops at its round limit',async t=>{
 const args=researchArgs(await evidenceFixture(t));
 const {result}=await capturedRecipe('evidence-research',args,async call=>{const row=await researchResponse(call);if(call.task.role==='reader'){row.disposition='partial';row.needsNextRound=true;}return row;});
 assert.equal(result.stopReason,'roundLimit');assert.equal(result.starts,3);
});
test('oversize research metadata leaves an explicit null slot without truncation or retry',async t=>{
 const args=researchArgs(await evidenceFixture(t));
 const {result,calls}=await capturedRecipe('evidence-research',args,async call=>{const row=await researchResponse(call);if(call.task.role==='reader'){row.answers=[{questionId:'question',text:'界'.repeat(160)},{questionId:'other',text:'界'.repeat(160)}];row.limitations=['界'.repeat(100),'界'.repeat(100)];}return row;});
 assert.equal(calls.length,3);assert.equal(result.rows[0].rounds[0].read,null);assert.equal(result.rows[0].disposition,'failed');assert.equal(result.oversizeReports[0].role,'reader');
});
test('maximum inventories include every skeptic and reducer in pre-dispatch budgets',async t=>{
 const ref=await evidenceFixture(t);const args=criterionArgs(ref);args.criteria=Array.from({length:32},(_,i)=>({...args.criteria[0],id:'criterion-'+i}));args.limits={maxCriteria:32,maxStarts:128,maxRounds:2};
 await assert.rejects(capturedRecipe('criterion-review',args,()=>assert.fail('129-start plan dispatched')),{code:'SCRIPT_FAILED'});
 const research=researchArgs(ref);research.sources=Array.from({length:64},(_,i)=>({...research.sources[0],id:'source-'+i}));research.limits={maxSources:64,maxStarts:256,maxRounds:2,dryRoundLimit:2};
 const budget=await capturedRecipe('evidence-research',research,()=>assert.fail('258-start plan dispatched'));assert.equal(budget.result.plannedStarts,258);assert.equal(budget.result.starts,0);assert.equal(budget.result.counts.failed,64);
});
test('negative controls expose removed skeptic gating and broken disposition arithmetic',async t=>{
 const args=criterionArgs(await evidenceFixture(t));const source=(await resolveWorkflow('plugin:criterion-review')).script;
 const mutant=source.replace('row.rounds.every(r=>verified(r.review,criterion)&&verified(r.skeptic,criterion))','row.rounds.every(r=>verified(r.review,criterion))').replace("r.review.verdict==='fail'||r.skeptic.verdict==='fail'","r.review.verdict==='fail'");assert.notEqual(mutant,source);
 const {result}=await capturedRecipe('criterion-review',args,call=>call.task.role==='skeptic'?null:criterionResponse(call),{script:mutant});
 assert.throws(()=>assert.equal(result.rows[0].status,'unverified'),{code:'ERR_ASSERTION'},'Owning null-skeptic assertion must reject the broken gate');
 const research=researchArgs(args.artifactInventory[0]);const researchSource=(await resolveWorkflow('plugin:evidence-research')).script;
 const broken=researchSource.replace('accounted:Object.values(counts).reduce((a,b)=>a+b,0)','accounted:0');assert.notEqual(broken,researchSource);
 const arithmetic=await capturedRecipe('evidence-research',research,researchResponse,{script:broken});
 assert.throws(()=>assert.equal(arithmetic.result.accounted,arithmetic.result.expected),{code:'ERR_ASSERTION'});
});
test('recipe allowlists and worst-case budgets reject before any worker starts',async t=>{
 const ref=await evidenceFixture(t);
 const invalidCriteria=[a=>a.extra=true,a=>a.roleSelections.reviewer.model='unforwarded',a=>a.limits.extra=1,a=>a.criteria[0].extra=1,a=>a.artifactInventory[0].extra=1,a=>a.roleSelections.extra=noSelection(),a=>a.limits.maxStarts=2,a=>a.criteria.push(a.criteria[0]),a=>a.artifactInventory[0].path='../outside',a=>a.artifactInventory[0].sha256='unverified'];
 const invalidResearch=[a=>a.extra=true,a=>a.sources[0].extra=true,a=>a.questions[0].extra=true,a=>a.limits.maxRounds=3,a=>a.roleSelections.reader.requireTools=['x','x'],a=>a.sources.push(a.sources[0]),a=>a.sources[0].selection={disposition:'sampled',reason:'fixed',extra:true},a=>a.sources[0].range={start:0,end:1,extra:true},a=>a.sources[0].range={start:5,end:4},a=>a.sources[0].modality='unknown'];
 for(const [name,make,mutations] of [['criterion-review',criterionArgs,invalidCriteria],['evidence-research',researchArgs,invalidResearch]])for(const mutate of mutations){const args=make(structuredClone(ref));mutate(args);let starts=0;await assert.rejects(capturedRecipe(name,args,()=>{starts++;return null;}),{code:'SCRIPT_FAILED'});assert.equal(starts,0);}
 const args=researchArgs(ref);args.limits.maxStarts=2;const budget=await capturedRecipe('evidence-research',args,()=>assert.fail('Overbudget dispatch'));assert.equal(budget.result.stopReason,'startBudget');assert.equal(budget.calls.length,0);assert.equal(budget.result.accounted,1);
});
