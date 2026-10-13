/** @lane merge
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkflow } from '../src/registry.mjs';
import { parseScript } from '../src/runtime/script.mjs';
import { RuntimeManager } from '../src/runtime/manager.mjs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
async function recipe(t,name,args,respond,{permissions}={}){
 const base=await mkdtemp(path.join(os.tmpdir(),'workflow-recipe-'));const cwd=path.join(base,'project');await mkdir(cwd);const calls=[];
 const backend={async execute(request,{onEvent}){calls.push(request);onEvent({type:'fixture-dispatch',workerId:request.id});return {value:await respond(request,calls),usage:{inputTokens:1,outputTokens:2}};},async shutdown(){}};
 const manager=new RuntimeManager({dataDir:path.join(base,'state'),backend,resolveWorkflow});t.after(async()=>{await manager.shutdown();await rm(base,{recursive:true,force:true});});
 const admitted=await manager.start({name:'plugin:'+name,cwd,args,permissions,concurrency:3});const deadline=Date.now()+15000;let run;
 while(Date.now()<deadline){run=await manager.get(admitted.id);if(['completed','failed'].includes(run.status))break;await new Promise(resolve=>setTimeout(resolve,15));}
 assert.equal(run.status,'completed',JSON.stringify(run.error));return {run,result:run.result,calls};
}
test('all six documented task shapes are real parseable named JS workflows',async()=>{
 for(const name of ['item-audit','fix-until-check-passes','isolated-migration','changed-file-review','cross-source-research','loop-until-dry']){
  const found=await resolveWorkflow('plugin:'+name);const parsed=parseScript(found.script);assert(parsed.meta.name);assert.match(parsed.body,/\b(agent|pipeline|parallel)\s*\(/);assert.match(parsed.body,/return\b/);
 }
});
test('item audit calls an independent verifier for each finding and preserves lost item/verifier slots',async t=>{
 const {result,calls}=await recipe(t,'item-audit',{items:[{id:'ok',scope:'src'},{id:'lost',scope:'missing'}]},request=>{
  if(request.phase==='Audit'){if(request.label==='lost')throw new Error('Lost audit worker');return {findings:[{id:'f1',statement:'First defect',evidence:['src:1']},{id:'f2',statement:'Second defect',evidence:['src:2']}]};}
  if(request.label.endsWith('2'))throw new Error('Lost verifier');return {verdict:'confirmed',evidence:['src:1'],reason:'Independently checked'};
 });
 assert.equal(calls.filter(c=>c.phase==='Verify').length,2);assert.equal(result.expectedVerifications,2);assert.equal(result.completedVerifications,1);assert.equal(result.rows[0].findings[1].verification,null);assert.equal(result.rows[0].findings[1].status,'unverified');assert.equal(result.rows[1].audit,null);assert.equal(result.complete,false);
});
test('fix recipe carries cumulative patch and stops only after two consecutive no-progress rounds',async t=>{
 const {result,calls}=await recipe(t,'fix-until-check-passes',{task:'Fix parser',check:'node --test',maxRounds:8},request=>({passed:false,changed:request.label==='Round 1',fingerprint:'same-failure',checkOutput:'failed',patch:'complete patch',summary:'fixture check'}),{permissions:{sandbox:'workspace-write',networkAccess:false,approvalPolicy:'never'}});
 assert.equal(result.rounds.length,3);assert.equal(result.noProgressRounds,2);assert.equal(result.stopReason,'no-progress');assert(calls.every(c=>c.isolation==='worktree'));assert.match(calls[1].prompt,/Cumulative patch:\ncomplete patch/);
});
test('migration requests disjoint isolated workers and failed integration review remains incomplete',async t=>{
 const {result,calls}=await recipe(t,'isolated-migration',{migration:'Update imports',slices:[{id:'a',scope:'a/'},{id:'b',scope:'b/'}]},request=>{if(request.phase==='Review')throw new Error('Review unavailable');return {files:[request.label+'/file.js'],patch:'diff',checks:['node --test passed'],summary:'migrated'};},{permissions:{sandbox:'workspace-write',networkAccess:false,approvalPolicy:'never'}});
 assert.equal(calls.filter(c=>c.isolation==='worktree').length,2);assert.equal(result.review,null);assert.equal(result.reviewStatus,'unverified');assert.equal(result.complete,false);assert.equal(result.ready,false);
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
});
test('loop discovery keeps refuted/missing items, deduplicates prototype-like IDs and waits two dry rounds',async t=>{
 const {result,calls}=await recipe(t,'loop-until-dry',{question:'Find and verify defects',verify:true,maxRounds:10},request=>{
  if(request.phase==='Verify'){if(request.label==='missing')throw new Error('Lost discovered-item verifier');return {verdict:'refuted',evidence:'Independent refutation'};}
  return {items:[{id:'__proto__',evidence:'candidate'},{id:'missing',evidence:'candidate'}],exhausted:true,limitations:[]};
 });
 assert.equal(calls.filter(c=>c.phase==='Discover').length,3);assert.equal(calls.filter(c=>c.phase==='Verify').length,2);assert.equal(result.items.length,2);assert.equal(result.items.find(i=>i.id==='__proto__').status,'refuted');assert.equal(result.items.find(i=>i.id==='missing').verification,null);assert.equal(result.dryRounds,2);assert.equal(result.complete,false);assert(calls.filter(c=>c.phase==='Discover').slice(1).every(c=>c.prompt.includes('__proto__')&&c.prompt.includes('missing')));
});
