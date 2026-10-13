/** @lane merge
 * @subject engine/run-lifecycle.mjs
 * @subject bin/arguments.mjs
 * @subject bin/command.mjs
 * @subject engine/controller.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {parseCommand} from '../bin/arguments.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const cleanup={serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members',nativeTerminals:{inventoryEmpty:true}};
async function fixture(t,{status='completed',workerStatus='completed'}={}){
  // All writes and deletions are confined to this owned, repository-local fixture.
  const root=await mkdtemp(join(dirname(fileURLToPath(import.meta.url)),'.lifecycle-fixture-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const id=randomUUID(),runDir=join(root,'runs-v2',id),runtimeId=`0.2.1-${'a'.repeat(16)}-node${process.version.slice(1)}`;
  const runtime={schema:2,id:runtimeId,version:'0.2.1',digest:'a'.repeat(64),node:process.version,path:join(root,'runtime-v2',runtimeId),codex:join(root,'runtime-v2',runtimeId,'codex.exe'),codexDigest:'b'.repeat(64),dependenciesDigest:'c'.repeat(64)};
  await mkdir(runDir,{recursive:true});await mkdir(runtime.path,{recursive:true});
  await writeFile(join(runtime.path,'.runtime.json'),JSON.stringify(runtime));
  const owner={schema:2,id,sessionId:'session',runtime,createdAt:'2026-10-13T00:00:00.000Z'};
  await writeFile(join(runDir,'runtime.json'),JSON.stringify(owner));
  const header={version:1,sessionId:'session',generation:1,runtimeIdentity:'d'.repeat(64),status,acceptingControls:status==='running',cleanup,workerCount:1,attempts:1,maxAgents:10};
  const worker={position:0,status:workerStatus,attempts:1,dependencies:[],result:'retained',resultHash:hash(JSON.stringify('retained')),evidence:{cleanup}};
  const db=new DatabaseSync(join(runDir,'run.sqlite'));
  db.exec('CREATE TABLE header(id INTEGER PRIMARY KEY,value TEXT); CREATE TABLE workers(generation INTEGER,position INTEGER,value TEXT,PRIMARY KEY(generation,position)); CREATE TABLE controls(id TEXT PRIMARY KEY,generation INTEGER,value TEXT);');
  db.prepare('INSERT INTO header VALUES(1,?)').run(JSON.stringify(header));
  db.prepare('INSERT INTO workers VALUES(1,0,?)').run(JSON.stringify(worker));db.close();
  const api=await import('../engine/run-lifecycle.mjs');
  return{root,runDir,owner,header,worker,api,request:{sessionId:'session',generation:1,expectedRevision:0,target:{kind:'run'}}};
}
function edit(runDir,callback){const db=new DatabaseSync(join(runDir,'run.sqlite'));try{callback(db);}finally{db.close();}}
function raw(runDir){const db=new DatabaseSync(join(runDir,'run.sqlite'),{readOnly:true});try{return{header:db.prepare('SELECT value FROM header').all(),workers:db.prepare('SELECT * FROM workers ORDER BY generation,position').all(),controls:db.prepare('SELECT * FROM controls').all()};}finally{db.close();}}
async function workspace(f){
  const {root,runDir}=f,source=join(root,'source'),common=join(source,'.git'),parent=join(root,'source-worktrees'),cwd=join(parent,'workflow-fixture'),artifactsDir=join(runDir,'workspaces','g1-w0-fixture'),inputsDir=join(runDir,'workspaces','inputs-fixture');
  await mkdir(cwd,{recursive:true});await mkdir(artifactsDir,{recursive:true});await mkdir(inputsDir,{recursive:true});
  const registration=join(common,'worktrees','fixture');await mkdir(registration,{recursive:true});
  await writeFile(join(cwd,'.git'),`gitdir: ${registration}\n`);await writeFile(join(registration,'gitdir'),join(cwd,'.git')+'\n');await writeFile(join(registration,'commondir'),'../..\n');
  const inputIndex=join(inputsDir,'private-index');await writeFile(inputIndex,'fixture index');
  const input={version:1,source,common,parent,base:'e'.repeat(40),artifactsDir:inputsDir,inputTree:'f'.repeat(40),inputIndex,inputIndexHash:hash('fixture index'),files:[],bytes:0};
  const inputBytes=JSON.stringify(input),inputManifest=join(inputsDir,'inputs.json');await writeFile(inputManifest,inputBytes);
  const ref={manifestPath:inputManifest,manifestHash:hash(inputBytes),source,base:input.base,inputTree:input.inputTree};
  const bytes='source output',blobPath=join(artifactsDir,'blob'),name='source.txt';await writeFile(blobPath,bytes);await writeFile(join(cwd,name),bytes);
  const patchPath=join(artifactsDir,'changes.patch'),basePatchPath=join(artifactsDir,'from-base.patch');await writeFile(patchPath,'patch');await writeFile(basePatchPath,'base patch');
  const ws={version:1,cwd,source,common,base:input.base,inputTree:input.inputTree,artifactsDir,inputIndex,inputIndexHash:input.inputIndexHash,gitPointerHash:hash(await readFile(join(cwd,'.git'))),patchPath,patchHash:hash('patch'),basePatchPath,basePatchHash:hash('base patch'),resultTree:'1'.repeat(40),fileCount:1,bytes:Buffer.byteLength(bytes)};
  const manifestBytes=JSON.stringify({...ws,files:[{name,sha256:hash(bytes),size:Buffer.byteLength(bytes),blobPath}]}),manifestPath=join(artifactsDir,'manifest.json');await writeFile(manifestPath,manifestBytes);
  ws.manifestPath=manifestPath;ws.manifestHash=hash(manifestBytes);
  f.header.workspaceInputs=ref;f.worker.workspace=ws;
  edit(runDir,db=>{db.prepare('UPDATE header SET value=?').run(JSON.stringify(f.header));db.prepare('UPDATE workers SET value=?').run(JSON.stringify(f.worker));});
  return ws;
}

test('absent overlays are visible and read-only discovery creates no lifecycle tables',async t=>{
  const f=await fixture(t),before=raw(f.runDir),view=await f.api.readLifecycle(f.runDir);
  assert.equal(view.schema,1);assert.equal(view.revision,0);assert.equal(view.run.visibility,'visible');assert.equal(view.workers[0].visibility,'visible');
  assert.deepEqual(raw(f.runDir),before);
  edit(f.runDir,db=>assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'lifecycle_%'").get().n,0));
});
test('active and unknown executions can be hidden without taking execution ownership or changing evidence',async t=>{
  const f=await fixture(t,{status:'running',workerStatus:'unknown'}),before=raw(f.runDir);
  await writeFile(join(f.runDir,'owner.lock'),'controller-owner');
  await f.api.requestLifecycle(f.runDir,{...f.request,requestId:'hide-run',action:'hide'});
  await f.api.requestLifecycle(f.runDir,{...f.request,expectedRevision:1,requestId:'archive-worker',action:'archive',target:{kind:'worker',generation:1,position:0,attempt:1}});
  const view=await f.api.readLifecycle(f.runDir);
  assert.equal(view.run.visibility,'hidden');assert.equal(view.workers[0].visibility,'archived');assert.equal(view.counts.unknownWorkers,1);assert.equal(view.counts.hiddenWorkers,1);
  assert.equal(await readFile(join(f.runDir,'owner.lock'),'utf8'),'controller-owner');assert.deepEqual(raw(f.runDir),before);
});
test('overlays persist, receipts remain inspectable, restoration and a replacement generation retain identity',async t=>{
  const f=await fixture(t),target={kind:'worker',generation:1,position:0,attempt:1};
  const receipt=await f.api.requestLifecycle(f.runDir,{...f.request,target,requestId:'hide',action:'hide',reason:'review later'});
  assert.deepEqual(await f.api.readLifecycleReceipt(f.runDir,'hide'),receipt);
  await f.api.requestLifecycle(f.runDir,{...f.request,target,expectedRevision:1,requestId:'restore',action:'restore'});
  assert.equal((await f.api.readLifecycle(f.runDir)).workers[0].visibility,'visible');
  await f.api.requestLifecycle(f.runDir,{...f.request,expectedRevision:2,requestId:'archive',action:'archive'});
  edit(f.runDir,db=>{db.prepare('UPDATE header SET value=?').run(JSON.stringify({...f.header,generation:2}));db.prepare('INSERT INTO workers VALUES(2,0,?)').run(JSON.stringify({...f.worker,attempts:2,priorExecutions:[{generation:1,position:0}]}));});
  const view=await f.api.readLifecycle(f.runDir);assert.equal(view.run.visibility,'visible');assert.equal(view.workers.length,2);assert.deepEqual(view.workers.map(w=>w.target.attempt),[1,2]);
});
test('stale session, generation, revision, attempt and conflicting request IDs reject atomically',async t=>{
  const f=await fixture(t),base={...f.request,requestId:'first',action:'hide'};
  for(const changed of [{sessionId:'other'},{generation:2},{expectedRevision:1},{target:{kind:'worker',generation:1,position:0,attempt:2}}])await assert.rejects(f.api.requestLifecycle(f.runDir,{...base,...changed}));
  assert.equal((await f.api.readLifecycle(f.runDir)).revision,0);
  const first=await f.api.requestLifecycle(f.runDir,base);assert.deepEqual(await f.api.requestLifecycle(f.runDir,base),first);
  await assert.rejects(f.api.requestLifecycle(f.runDir,{...base,action:'archive'}),{code:'LIFECYCLE_REQUEST'});
  const races=await Promise.allSettled(['a','b'].map(requestId=>f.api.requestLifecycle(f.runDir,{...base,expectedRevision:1,requestId,action:'restore'})));
  assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal((await f.api.readLifecycle(f.runDir)).revision,2);
});
test('visibility and destructive targets are captured before asynchronous admission',async t=>{
  const f=await fixture(t),request={...f.request,target:{kind:'run'},requestId:'snapshot',action:'hide'};
  const pending=f.api.requestLifecycle(f.runDir,request);request.action='restore';request.target.kind='worker';
  const receipt=await pending;assert.equal(receipt.action,'hide');assert.deepEqual(receipt.target,{kind:'run'});
  const plan=await f.api.planPrune(f.runDir,{...f.request,expectedRevision:1,reason:'retire snapshot'}),approvedPlanHash=plan.planHash;
  const prune=f.api.applyPrune(f.runDir,{sessionId:'session',plan,approvedPlanHash});plan.target.kind='worker';plan.candidates.push({path:'unreviewed'});
  const pruned=await prune;assert.equal(pruned.outcome,'applied');assert.deepEqual(pruned.target,{kind:'run'});assert.deepEqual(pruned.plan.candidates,[]);
});
test('ownership and retained runtime record changes reject before overlay persistence',async t=>{
  const f=await fixture(t);
  await writeFile(join(f.owner.runtime.path,'.runtime.json'),JSON.stringify({...f.owner.runtime,dependenciesDigest:'9'.repeat(64)}));
  await assert.rejects(f.api.requestLifecycle(f.runDir,{...f.request,requestId:'wrong-runtime',action:'hide'}),{code:'LIFECYCLE_RUNTIME'});
  assert.equal((await f.api.readLifecycle(f.runDir)).revision,0);
});
test('prune plans disclose active, unknown, historical unknown, unreconciled and pinned blockers without writes',async t=>{
  const f=await fixture(t),before=raw(f.runDir);
  const plan=await f.api.planPrune(f.runDir,{...f.request,reason:'retire completed work'});assert.equal(plan.blocked.length,0);assert.deepEqual(raw(f.runDir),before);
  for(const changed of [{status:'running'},{cleanup:{...cleanup,jobEmpty:false}},{pinned:true},{recovery:{required:true}}]){
    edit(f.runDir,db=>db.prepare('UPDATE header SET value=?').run(JSON.stringify({...f.header,...changed})));
    assert.ok((await f.api.planPrune(f.runDir,{...f.request,reason:'review'})).blocked.length>0);
  }
  edit(f.runDir,db=>{db.prepare('UPDATE header SET value=?').run(JSON.stringify({...f.header,generation:2}));db.prepare('UPDATE workers SET value=?').run(JSON.stringify({...f.worker,status:'unknown'}));db.prepare('INSERT INTO workers VALUES(2,0,?)').run(JSON.stringify({...f.worker,attempts:2}));});
  assert.ok((await f.api.planPrune(f.runDir,{...f.request,generation:2,reason:'review'})).blocked.some(b=>b.code==='PRUNE_UNKNOWN'));
});
test('prune requires explicit empty native-terminal inventory at run and executed-worker boundaries',async t=>{
  const f=await fixture(t),missing={serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members'};
  for(const scope of ['run','worker'])for(const observed of [missing,{...missing,nativeTerminals:{}},{...missing,nativeTerminals:{inventoryEmpty:false}}]){
    edit(f.runDir,db=>{db.prepare('UPDATE header SET value=?').run(JSON.stringify({...f.header,cleanup:scope==='run'?observed:cleanup}));db.prepare('UPDATE workers SET value=?').run(JSON.stringify({...f.worker,evidence:{cleanup:scope==='worker'?observed:cleanup}}));});
    const plan=await f.api.planPrune(f.runDir,{...f.request,reason:'require positive cleanup evidence'});assert.ok(plan.blocked.some(b=>b.code==='PRUNE_DRAIN'),`${scope}: ${JSON.stringify(observed)}`);
  }
  edit(f.runDir,db=>{db.prepare('UPDATE header SET value=?').run(JSON.stringify(f.header));db.prepare('UPDATE workers SET value=?').run(JSON.stringify(f.worker));});
  const plan=await f.api.planPrune(f.runDir,{...f.request,reason:'verified native cleanup'});assert.deepEqual(plan.blocked,[]);
});
test('notStarted alone cannot waive native cleanup; a separately evidenced no-process-started failure can',async t=>{
  const f=await fixture(t,{status:'failed',workerStatus:'failed'});
  const before={...f.worker,notStarted:true,evidence:{cleanup:{}}};
  edit(f.runDir,db=>db.prepare('UPDATE workers SET value=?').run(JSON.stringify(before)));
  assert.ok((await f.api.planPrune(f.runDir,{...f.request,reason:'unconfirmed startup'})).blocked.some(b=>b.code==='PRUNE_DRAIN'));
  edit(f.runDir,db=>db.prepare('UPDATE workers SET value=?').run(JSON.stringify({...before,noProcessStarted:false})));
  assert.ok((await f.api.planPrune(f.runDir,{...f.request,reason:'a process may have started'})).blocked.some(b=>b.code==='PRUNE_DRAIN'));
  edit(f.runDir,db=>db.prepare('UPDATE workers SET value=?').run(JSON.stringify({...before,noProcessStarted:true})));
  const plan=await f.api.planPrune(f.runDir,{...f.request,reason:'authoritative pre-process failure'});assert.deepEqual(plan.blocked,[]);
  for(const contradictory of [{error:{code:'DRAIN_FAILED'}},{serverExited:false},{jobEmpty:false},{nativeTerminals:{inventoryEmpty:false}}]){
    edit(f.runDir,db=>db.prepare('UPDATE workers SET value=?').run(JSON.stringify({...before,noProcessStarted:true,evidence:{cleanup:contradictory}})));
    assert.ok((await f.api.planPrune(f.runDir,{...f.request,reason:'contradictory drain evidence'})).blocked.some(b=>b.code==='PRUNE_DRAIN'));
  }
});
test('reviewed worker retirement deletes only its verified live payload and retains audit, artifacts and Git identity',async t=>{
  const f=await fixture(t),ws=await workspace(f),before=raw(f.runDir),target={kind:'worker',generation:1,position:0,attempt:1};
  const plan=await f.api.planPrune(f.runDir,{...f.request,target,reason:'retire accepted worker'});
  assert.deepEqual(plan.blocked,[]);assert.ok(plan.candidates.some(c=>c.path===join(ws.cwd,'source.txt')));
  const receipt=await f.api.applyPrune(f.runDir,{sessionId:'session',plan,approvedPlanHash:plan.planHash});assert.equal(receipt.outcome,'applied');
  assert.deepEqual(await readdir(ws.cwd),['.git']);assert.ok(await readFile(ws.manifestPath));assert.ok(await readFile(ws.inputIndex));assert.ok(await readFile(join(f.runDir,'runtime.json')));
  assert.deepEqual(raw(f.runDir),before);const view=await f.api.readLifecycle(f.runDir);assert.equal(view.workers[0].pruned,true);assert.equal(view.workers[0].tombstone.outcome,'applied');
  edit(f.runDir,db=>assert.throws(()=>f.api.assertLifecycleReplay(db),{code:'REPLAY_PRUNED'}));
  await assert.rejects(f.api.applyPrune(f.runDir,{sessionId:'session',plan,approvedPlanHash:plan.planHash}),{code:'PRUNE_REPLAY'});
});
test('settled run retirement retains execution rows and a tombstone even without filesystem candidates',async t=>{
  const f=await fixture(t),before=raw(f.runDir),plan=await f.api.planPrune(f.runDir,{...f.request,reason:'retire run'});
  assert.deepEqual(plan.candidates,[]);const receipt=await f.api.applyPrune(f.runDir,{sessionId:'session',plan,approvedPlanHash:plan.planHash});
  assert.equal(receipt.outcome,'applied');const view=await f.api.readLifecycle(f.runDir);assert.equal(view.run.pruned,true);assert.equal(view.workers[0].pruned,true);assert.deepEqual(raw(f.runDir),before);
});
test('settled failed work uses the persisted failure and cleanup evidence without inventing terminal fields',async t=>{
  const f=await fixture(t,{status:'failed',workerStatus:'failed'}),before=raw(f.runDir);
  const plan=await f.api.planPrune(f.runDir,{...f.request,reason:'retire inspected failure'});assert.deepEqual(plan.blocked,[]);
  const receipt=await f.api.applyPrune(f.runDir,{sessionId:'session',plan,approvedPlanHash:plan.planHash});assert.equal(receipt.outcome,'applied');
  assert.deepEqual(raw(f.runDir),before);assert.equal((await f.api.readLifecycle(f.runDir)).workers[0].executionStatus,'failed');
});
test('a held execution lock is an explicit read-only prune-plan blocker',async t=>{
  const f=await fixture(t);await writeFile(join(f.runDir,'owner.lock'),'controller-owner');
  const before=raw(f.runDir),plan=await f.api.planPrune(f.runDir,{...f.request,reason:'review eligibility'});
  assert.ok(plan.blocked.some(b=>b.code==='PRUNE_LOCKED'));assert.deepEqual(raw(f.runDir),before);assert.equal(await readFile(join(f.runDir,'owner.lock'),'utf8'),'controller-owner');
});
test('prune revalidates exact approval, revisions, ownership, filesystem identity, added files and changed bytes',async t=>{
  const f=await fixture(t),ws=await workspace(f),plan=await f.api.planPrune(f.runDir,{...f.request,reason:'retire'}),apply=()=>f.api.applyPrune(f.runDir,{sessionId:'session',plan,approvedPlanHash:plan.planHash});
  await assert.rejects(f.api.applyPrune(f.runDir,{sessionId:'session',plan,approvedPlanHash:'0'.repeat(64)}),{code:'PRUNE_APPROVAL'});
  await writeFile(join(f.runDir,'owner.lock'),'other-owner');await assert.rejects(apply(),{code:'RUN_LOCKED'});assert.equal(await readFile(join(f.runDir,'owner.lock'),'utf8'),'other-owner');await unlink(join(f.runDir,'owner.lock'));
  await writeFile(join(ws.cwd,'new.txt'),'unreviewed');await assert.rejects(apply());await unlink(join(ws.cwd,'new.txt'));
  await writeFile(join(ws.cwd,'source.txt'),'changed bytes');await assert.rejects(apply());await writeFile(join(ws.cwd,'source.txt'),'source output');
  await unlink(join(ws.cwd,'source.txt'));await writeFile(join(ws.cwd,'source.txt'),'source output');await assert.rejects(apply());
  await f.api.requestLifecycle(f.runDir,{...f.request,action:'hide',requestId:'new-revision'});await assert.rejects(apply(),{code:'LIFECYCLE_REVISION'});
  assert.equal((await f.api.readLifecycle(f.runDir)).run.pruned,false);
});
test('historical references, retained-artifact corruption and recovery paths block retirement',async t=>{
  const f=await fixture(t),ws=await workspace(f),target={kind:'worker',generation:1,position:0,attempt:1};
  edit(f.runDir,db=>{db.prepare('UPDATE header SET value=?').run(JSON.stringify({...f.header,generation:2}));db.prepare('INSERT INTO workers VALUES(2,0,?)').run(JSON.stringify({...f.worker,reusedFrom:{generation:1,position:0},priorExecutions:[{generation:1,position:0}]}));});
  assert.ok((await f.api.planPrune(f.runDir,{...f.request,generation:2,target,reason:'retire'})).blocked.some(b=>b.code==='PRUNE_REFERENCED'));
  edit(f.runDir,db=>{db.prepare('DELETE FROM workers WHERE generation=2').run();db.prepare('UPDATE header SET value=?').run(JSON.stringify(f.header));});
  await writeFile(ws.manifestPath,'corrupt');assert.ok((await f.api.planPrune(f.runDir,{...f.request,reason:'retire'})).blocked.some(b=>b.code==='PRUNE_INTEGRITY'));
});
test('a settled worker recovery reference cannot be deleted as ordinary live payload',async t=>{
  const f=await fixture(t),ws=await workspace(f);
  f.worker.evidence.recoveryPaths=[join(ws.cwd,'source.txt')];edit(f.runDir,db=>db.prepare('UPDATE workers SET value=?').run(JSON.stringify(f.worker)));
  const plan=await f.api.planPrune(f.runDir,{...f.request,reason:'review retained recovery references'});
  assert.ok(plan.blocked.some(b=>b.code==='PRUNE_REFERENCED'));assert.equal(await readFile(join(ws.cwd,'source.txt'),'utf8'),'source output');
});
test('a sibling worker with incomplete retained artifacts makes destructive retirement ineligible',async t=>{
  const f=await fixture(t),ws=await workspace(f),target={kind:'worker',generation:1,position:1,attempt:1};
  edit(f.runDir,db=>{db.prepare('UPDATE header SET value=?').run(JSON.stringify({...f.header,workerCount:2}));db.prepare('INSERT INTO workers VALUES(1,1,?)').run(JSON.stringify({...f.worker,position:1,workspace:undefined}));});
  await writeFile(ws.patchPath,'changed retained patch');
  assert.ok((await f.api.planPrune(f.runDir,{...f.request,target,reason:'review complete evidence'})).blocked.some(b=>b.code==='PRUNE_INTEGRITY'));
});
test('an interrupted applying receipt is unknown evidence and never eligible for retry or replay',async t=>{
  const f=await fixture(t);await f.api.requestLifecycle(f.runDir,{...f.request,requestId:'create-overlay',action:'hide'});
  edit(f.runDir,db=>db.prepare('INSERT INTO lifecycle_receipts(id,value) VALUES(?,?)').run('interrupted',JSON.stringify({schema:1,id:'interrupted',action:'prune',outcome:'applying',target:{kind:'run'},generation:1})));
  const plan=await f.api.planPrune(f.runDir,{...f.request,expectedRevision:1,reason:'review interruption'});assert.ok(plan.blocked.some(b=>b.code==='PRUNE_UNCERTAIN'));
  assert.equal((await f.api.readLifecycle(f.runDir)).counts.uncertainPrunes,1);
  edit(f.runDir,db=>assert.throws(()=>f.api.assertLifecycleReplay(db),{code:'REPLAY_PRUNED'}));
});
test('a filesystem effect followed by failure persists an unknown receipt and tombstone without retry',async t=>{
  const f=await fixture(t),ws=await workspace(f),before=raw(f.runDir),plan=await f.api.planPrune(f.runDir,{...f.request,reason:'retire'});
  const actualUnlink=fs.unlink;
  const mocked=t.mock.method(fs,'unlink',async path=>{
    if(path===join(ws.cwd,'source.txt')){
      assert.equal((await f.api.readLifecycleReceipt(f.runDir,plan.id)).outcome,'applying');
      await actualUnlink(path);throw Object.assign(new Error('lost acknowledgement after deletion'),{code:'EIO'});
    }
    return actualUnlink(path);
  });
  const receipt=await f.api.applyPrune(f.runDir,{sessionId:'session',plan,approvedPlanHash:plan.planHash});mocked.mock.restore();
  assert.equal(receipt.outcome,'unknown');assert.deepEqual(raw(f.runDir),before);assert.ok(await readFile(ws.manifestPath));
  assert.equal((await f.api.readLifecycle(f.runDir)).run.tombstone.outcome,'unknown');
  await assert.rejects(f.api.applyPrune(f.runDir,{sessionId:'session',plan,approvedPlanHash:plan.planHash}),{code:'PRUNE_REPLAY'});
  const next=await f.api.planPrune(f.runDir,{...f.request,expectedRevision:receipt.newRevision,reason:'inspect'});assert.ok(next.blocked.some(b=>b.code==='PRUNE_UNCERTAIN'));
});
test('CLI lifecycle commands are session-bound and cannot fall through to live controls or worker recursion',()=>{
  for(const command of ['hide','archive','restore','prune-plan','prune']){
    const p=parseCommand([command,'run-id','--session','session'],{});assert.equal(p.runCommand,true);assert.equal(p.mutation,true);
    assert.throws(()=>parseCommand([command,'run-id'],{}),/originating/);
    assert.throws(()=>parseCommand([command,'run-id','--session','session'],{AGENT_WORKFLOW_WORKER:'1'}),/Worker processes/);
  }
  assert.equal(parseCommand(['list','--show-hidden'],{}).values['show-hidden'],true);
  assert.equal(parseCommand(['run','--capture-policy','policy.json','--session','session'],{}).values['capture-policy'],'policy.json');
  assert.throws(()=>parseCommand(['resume','run-id','--capture-policy','other.json','--session','session'],{}),/not valid/);
});
test('controller integration: retirement rejects replay before dispatch without changing historical rows',async t=>{
  const f=await fixture(t),plan=await f.api.planPrune(f.runDir,{...f.request,reason:'retire'});
  await f.api.applyPrune(f.runDir,{sessionId:'session',plan,approvedPlanHash:plan.planHash});const before=raw(f.runDir);
  const {runWorkflow}=await import('../engine/controller.mjs');let calls=0;
  await assert.rejects(runWorkflow({runDir:f.runDir,sessionId:'session',resume:true,script:'export const meta={name:"retired",description:"test"};return 1;',backend:{identity:'test',execute:async()=>{calls++;},close:async()=>cleanup}}),{code:'REPLAY_PRUNED'});
  assert.equal(calls,0);assert.deepEqual(raw(f.runDir),before);
});
test('controller integration: a capture-policy override on resume rejects before dispatch',async t=>{
  const f=await fixture(t),before=raw(f.runDir),{runWorkflow}=await import('../engine/controller.mjs');let calls=0;
  await assert.rejects(runWorkflow({runDir:f.runDir,sessionId:'session',resume:true,capturePolicy:{version:1,excludeDirs:['dist/'],protectedPaths:['source.txt']},script:'export const meta={name:"policy",description:"test"};return 1;',backend:{identity:'test',execute:async()=>{calls++;},close:async()=>cleanup}}),{code:'CAPTURE_POLICY_OVERRIDE'});
  assert.equal(calls,0);assert.deepEqual(raw(f.runDir),before);
});
test('controller integration: the persisted launch policy is accepted as saved context rather than a caller override',async t=>{
  const f=await fixture(t),policy={version:1,excludeDirs:['dist/'],protectedPaths:['source.txt']};
  const policyModule=await import('../engine/workspace-policy.mjs'),captureModule=await import('../engine/workspaces.mjs');
  const supported=typeof policyModule.validateCapturePolicy==='function'&&typeof captureModule.readWorkspaceExclusions==='function';
  const normalized=supported?policyModule.validateCapturePolicy(policy):{policy,policyHash:'e'.repeat(64)};
  f.header.capturePolicy=normalized.policy;f.header.capturePolicyHash=normalized.policyHash;
  edit(f.runDir,db=>db.prepare('UPDATE header SET value=?').run(JSON.stringify(f.header)));
  const {runWorkflow}=await import('../engine/controller.mjs');let calls=0;
  await assert.rejects(runWorkflow({runDir:f.runDir,sessionId:'session',resume:true,launch:{cwd:f.root,capturePolicy:JSON.parse(JSON.stringify(normalized.policy))},script:'export const meta={name:"saved-policy",description:"test"};return 1;',backend:{identity:'test',execute:async()=>{calls++;},close:async()=>cleanup}}),{code:supported?'REPLAY_RUNTIME':'CAPTURE_POLICY_UNAVAILABLE'});
  assert.equal(calls,0);
  await assert.rejects(runWorkflow({runDir:f.runDir,sessionId:'session',resume:true,launch:{cwd:f.root,capturePolicy:{...policy,excludeDirs:['other/']}},script:'export const meta={name:"changed-policy",description:"test"};return 1;',backend:{identity:'test',execute:async()=>{calls++;},close:async()=>cleanup}}),{code:'CAPTURE_POLICY_OVERRIDE'});
});
test('controller integration: a failure before backend dispatch persists separate no-process evidence',async t=>{
  const f=await fixture(t),runDir=join(f.root,'new-fixture-run'),{runWorkflow}=await import('../engine/controller.mjs');let calls=0;
  const result=await runWorkflow({runDir,sessionId:'session',script:'export const meta={name:"admission",description:"test"};return await agent("writer",{permissions:{sandbox:"workspace-write"}});',backend:{identity:'test',execute:async()=>{calls++;return{value:'accepted',terminalObserved:true,evidence:{cleanup}};},close:async()=>cleanup}});
  assert.equal(calls,0);assert.equal(result.workers[0].notStarted,true);assert.equal(result.workers[0].noProcessStarted,true);
});
