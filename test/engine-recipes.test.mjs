/** @lane merge
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
async function recipe(t,name,args,respond,{permissions}={}){
 const base=await mkdtemp(path.join(os.tmpdir(),'workflow-recipe-'));const cwd=path.join(base,'project');await mkdir(cwd);const calls=[];t.after(()=>rm(base,{recursive:true,force:true}));
 if(permissions?.sandbox==='workspace-write'){const git=(a)=>promisify(execFile)('git',a,{cwd,windowsHide:true});await git(['init','-q']);await git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','-qm','fixture']);}
 const settings=createSettings({catalog:[{model:'fixture',isDefault:true,defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low'}]}],defaults:{...(permissions?{permissions}:{})}});
 const cleanup={serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members',nativeTerminals:{inventoryEmpty:true}};
 const backend={identity:'recipe-fixture',resolveOptions:settings.resolve,async execute(request){const call={...request,...request.options};calls.push(call);try{return{value:await respond(call,calls),terminalObserved:true,evidence:{cleanup}};}catch(error){error.notStarted=true;error.noProcessStarted=true;throw error;}},close:async()=>cleanup};
 const found=await resolveWorkflow('plugin:'+name,{cwd});const run=await runWorkflow({runDir:path.join(base,'run'),sessionId:'recipe',script:found.script,args,backend,concurrency:3,launch:{cwd}});
 assert.equal(run.status,'completed',JSON.stringify(run.error));return {run,result:run.result,calls};
}

test('all six documented task shapes are real parseable named JS workflows',async()=>{
 for(const name of ['item-audit','fix-until-check-passes','isolated-migration','changed-file-review','cross-source-research','loop-until-dry']){
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
