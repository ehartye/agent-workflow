/** @lane merge
 * @subject engine/workspaces.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,unlink,symlink,realpath,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {captureInputs,describeInputs,loadInputs,createWorkspace,collectWorkspace,verifyWorkspace,assertWorkspaceReady} from '../engine/workspaces.mjs';
import {runWorkflow,readRun} from '../engine/controller.mjs';
import {createSettings} from '../engine/settings.mjs';

const exec=promisify(execFile);
const git=async(cwd,...args)=>(await exec('git',args,{cwd,windowsHide:true,timeout:10000})).stdout.trim();
async function fixture(t){
  const root=await realpath(await mkdtemp(join(tmpdir(),'workflow-write-')));t.after(()=>rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
  const source=join(root,'project'),artifacts=join(root,'artifacts');await mkdir(source);await mkdir(artifacts);
  await git(source,'init','-q');await git(source,'config','user.email','fixture@example.invalid');await git(source,'config','user.name','Fixture');await git(source,'config','core.autocrlf','false');
  await writeFile(join(source,'note.txt'),'base\n');await writeFile(join(source,'binary.dat'),Buffer.from([0,1,2,3]));await writeFile(join(source,'.gitignore'),'ignored/\n');
  await git(source,'add','.');await git(source,'commit','-qm','base');return{root,source,artifacts};
}

test('writer workspaces capture exact local inputs and keep two writers and source independent',async t=>{
  const {root,source,artifacts}=await fixture(t);
  await writeFile(join(source,'note.txt'),'local staged\n');await git(source,'add','note.txt');await writeFile(join(source,'note.txt'),'local unstaged\n');
  await writeFile(join(source,'binary.dat'),Buffer.from([0,255,128,1]));await writeFile(join(source,'new.txt'),'local untracked\n');
  await mkdir(join(source,'ignored'));await writeFile(join(source,'ignored','secret'),'not an input');
  const before=await git(source,'status','--porcelain=v1');const index=await readFile(join(source,'.git','index'));
  const inputs=await captureInputs({source,artifactsDir:join(artifacts,'inputs')});
  const a=await createWorkspace({inputs,artifactsDir:join(artifacts,'a')}),b=await createWorkspace({inputs,artifactsDir:join(artifacts,'b')});
  assert.notEqual(a.cwd,b.cwd);assert.equal(a.cwd.startsWith(join(root,'project-worktrees')),true);
  assert.equal(await readFile(join(a.cwd,'note.txt'),'utf8'),'local unstaged\n');assert.deepEqual(await readFile(join(b.cwd,'binary.dat')),Buffer.from([0,255,128,1]));
  assert.equal(await readFile(join(a.cwd,'new.txt'),'utf8'),'local untracked\n');await assert.rejects(readFile(join(a.cwd,'ignored','secret')),{code:'ENOENT'});
  await writeFile(join(a.cwd,'note.txt'),'writer A\n');await writeFile(join(b.cwd,'note.txt'),'writer B\n');await writeFile(join(a.cwd,'created.bin'),Buffer.from([0,99,2,7]));await unlink(join(a.cwd,'new.txt'));
  await git(source,'config','diff.noprefix','true');await git(source,'config','color.ui','always');
  const result=await collectWorkspace(a);
  assert.deepEqual(result.changedFiles,['created.bin','new.txt','note.txt']);
  const patch=await readFile(result.patchPath,'utf8');assert.match(patch,/local unstaged/);assert.match(patch,/writer A/);assert.match(patch,/GIT binary patch/);assert.match(patch,/deleted file mode/);
  await writeFile(join(b.cwd,'note.txt'),'local unstaged\n');await git(b.cwd,'apply','--check',result.patchPath);await writeFile(join(b.cwd,'note.txt'),'writer B\n');
  const clean=join(root,'base-review');await git(source,'worktree','add','--detach',clean,inputs.base);await git(clean,'apply','--check',result.basePatchPath);
  assert.equal(await readFile(join(source,'note.txt'),'utf8'),'local unstaged\n');assert.equal(await readFile(join(b.cwd,'note.txt'),'utf8'),'writer B\n');
  assert.deepEqual(await readFile(join(source,'.git','index')),index);assert.equal(await git(source,'status','--porcelain=v1'),before);
  assert.equal(await verifyWorkspace(result),true);
  await writeFile(join(a.cwd,'note.txt'),'changed after review\n');await assert.rejects(verifyWorkspace(result),{code:'WORKSPACE_ARTIFACT'});
  await writeFile(join(a.cwd,'note.txt'),'writer A\n');assert.equal(await verifyWorkspace(result),true);
  await writeFile(result.patchPath,'corrupted');await assert.rejects(verifyWorkspace(result),{code:'WORKSPACE_ARTIFACT'});
});

test('worker ignore rules cannot hide new outputs or make changed output reusable',async t=>{
  const {source,artifacts}=await fixture(t);const inputs=await captureInputs({source,artifactsDir:join(artifacts,'inputs')});const workspace=await createWorkspace({inputs,artifactsDir:join(artifacts,'worker')});
  await writeFile(join(workspace.cwd,'.gitignore'),'hidden.txt\n');await writeFile(join(workspace.cwd,'hidden.txt'),'writer output\n');
  const result=await collectWorkspace(workspace);assert.ok(result.changedFiles.includes('hidden.txt'));assert.match(await readFile(result.patchPath,'utf8'),/writer output/);
  await writeFile(join(workspace.cwd,'hidden.txt'),'changed');await assert.rejects(verifyWorkspace(result),{code:'WORKSPACE_ARTIFACT'});
});

test('linked sources keep sibling placement and capture never executes checkout filters or index hooks',async t=>{
  const {root,source,artifacts}=await fixture(t),linked=join(root,'existing-linked');
  await git(source,'worktree','add','--detach',linked,'HEAD');
  const hooks=join(root,'hooks'),sentinel=join(root,'hook-ran');await mkdir(hooks);
  for(const name of ['post-checkout','post-index-change'])await writeFile(join(hooks,name),`#!/bin/sh\nprintf ran > '${sentinel.replaceAll('\\','/')}'\n`,{mode:0o755});
  await git(source,'config','core.hooksPath',hooks);await git(source,'config','filter.fail.clean','nonexistent-workflow-filter');await git(source,'config','filter.fail.smudge','nonexistent-workflow-filter');await git(source,'config','filter.fail.required','true');
  await writeFile(join(linked,'.gitattributes'),'*.txt filter=fail diff=fail\n');await git(source,'config','diff.fail.command','nonexistent-workflow-diff');
  const inputs=await captureInputs({source:linked,artifactsDir:join(artifacts,'inputs')});const workspace=await createWorkspace({inputs,artifactsDir:join(artifacts,'worker')});
  assert.ok(workspace.cwd.startsWith(join(root,'project-worktrees')));await writeFile(join(workspace.cwd,'note.txt'),'edited\n');
  const result=await collectWorkspace(workspace);assert.match(await readFile(result.patchPath,'utf8'),/edited/);await assert.rejects(readFile(sentinel),{code:'ENOENT'});
});

test('capture refuses symlink escapes, unresolved merges and non-Git sources before writer creation',async t=>{
  const {root,source,artifacts}=await fixture(t);
  const outside=join(root,'outside');await mkdir(outside);await writeFile(join(outside,'external'),'outside');
  await symlink(outside,join(source,'escape'),'junction');
  await assert.rejects(captureInputs({source,artifactsDir:join(artifacts,'symlink')}),{code:'WORKSPACE_INPUT'});
  await rm(join(source,'escape')); // Removes the owned junction itself, not its target.
  await git(source,'checkout','-qb','other');await writeFile(join(source,'note.txt'),'other\n');await git(source,'commit','-qam','other');
  await git(source,'checkout','-q','-');await writeFile(join(source,'note.txt'),'main\n');await git(source,'commit','-qam','main');await git(source,'merge','other').catch(()=>{});
  await assert.rejects(captureInputs({source,artifactsDir:join(artifacts,'conflict')}),{code:'WORKSPACE_INPUT'});
  await assert.rejects(captureInputs({source:outside,artifactsDir:join(artifacts,'plain')}),{code:'WORKSPACE_INPUT'});
  assert.equal(await readFile(join(outside,'external'),'utf8'),'outside');
});

test('artifact collection retains a workspace and rejects escaping output instead of following it',async t=>{
  const {root,source,artifacts}=await fixture(t);const inputs=await captureInputs({source,artifactsDir:join(artifacts,'inputs')});const workspace=await createWorkspace({inputs,artifactsDir:join(artifacts,'worker')});
  const outside=join(root,'outside');await mkdir(outside);await writeFile(join(outside,'external'),'outside');await symlink(outside,join(workspace.cwd,'escape'),'junction');
  await assert.rejects(collectWorkspace(workspace),{code:'WORKSPACE_ARTIFACT'});
  assert.equal(await readFile(join(workspace.cwd,'note.txt'),'utf8'),'base\n');assert.equal(await readFile(join(outside,'external'),'utf8'),'outside');
});

test('input copying breaks hardlink aliases and planted aliases prevent worker admission',async t=>{
  const {root,source,artifacts}=await fixture(t),outside=join(root,'outside.txt');await writeFile(outside,'outside');await link(outside,join(source,'linked.txt'));
  const inputs=await captureInputs({source,artifactsDir:join(artifacts,'inputs')});const workspace=await createWorkspace({inputs,artifactsDir:join(artifacts,'worker')});
  await assertWorkspaceReady(workspace);await writeFile(join(workspace.cwd,'linked.txt'),'independent');assert.equal(await readFile(outside,'utf8'),'outside');
  await link(outside,join(workspace.cwd,'planted.txt'));await assert.rejects(assertWorkspaceReady(workspace),{code:'WORKSPACE_PATH'});await assert.rejects(collectWorkspace(workspace),{code:'WORKSPACE_ARTIFACT'});
});
test('modified private input index is rejected before admission collection or replay',async t=>{
  const {source,artifacts}=await fixture(t),inputs=await captureInputs({source,artifactsDir:join(artifacts,'inputs')}),workspace=await createWorkspace({inputs,artifactsDir:join(artifacts,'worker')});
  await exec('git',['update-index','--chmod=+x','note.txt'],{cwd:source,env:{...process.env,GIT_INDEX_FILE:inputs.inputIndex},windowsHide:true});
  await assert.rejects(loadInputs(describeInputs(inputs)),{code:'WORKSPACE_ARTIFACT'});
  await assert.rejects(assertWorkspaceReady(workspace),{code:'WORKSPACE_ARTIFACT'});
  await assert.rejects(collectWorkspace(workspace),{code:'WORKSPACE_ARTIFACT'});
});

const cleanup={serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members',nativeTerminals:{inventoryEmpty:true}};
function writerBackend(execute){
  const settings=createSettings({catalog:[{model:'fixture',isDefault:true,defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low'}]}],defaults:{permissions:{sandbox:'workspace-write'}}});
  return{identity:'writer-fixture',resolveOptions:settings.resolve,execute,close:async()=>cleanup};
}
test('a writer rejected before any process starts retains its empty diff with a known failure',async t=>{
  const {root,source}=await fixture(t);
  const result=await runWorkflow({runDir:join(root,'run'),sessionId:'s',launch:{cwd:source},script:'export const meta={name:"prestart",description:"proof"};return await agent("edit");',
    backend:writerBackend(async()=>{throw Object.assign(new Error('Admission closed'),{code:'RUN_STOPPED',notStarted:true,noProcessStarted:true});})});
  const worker=result.workers[0];assert.equal(worker.status,'failed');assert.equal(worker.notStarted,true);assert.equal(worker.workspaceError,undefined);assert.deepEqual(worker.workspace.changedFiles,[]);assert.equal(await readFile(worker.workspace.patchPath,'utf8'),'');
});
test('writer preparation cannot bypass an attempt budget consumed by a concurrent correction',async t=>{
  const {root,source}=await fixture(t),runDir=join(root,'run');let writers=0;
  const result=await runWorkflow({runDir,sessionId:'s',launch:{cwd:source},maxAgents:2,
    script:'export const meta={name:"budget",description:"proof"};return await parallel([()=>agent("reader",{permissions:{sandbox:"read-only"}}),()=>agent("writer")]);',
    backend:writerBackend(async({workspace,reserveRetry})=>{
      if(workspace)writers++;
      else{
        const deadline=Date.now()+5000;
        while(!(await readRun(runDir)).workspaceInputs){if(Date.now()>deadline)throw new Error('Writer capture not observed');await new Promise(resolve=>setTimeout(resolve,5));}
        await reserveRetry();
      }
      return{value:'done',terminalObserved:true,evidence:{cleanup}};
    })});
  assert.equal(result.attempts,2);assert.equal(writers,0);assert.equal(result.workers[1].notStarted,true);assert.equal(result.workers[1].error.code,'AGENT_LIMIT');
});
test('controller persists writer diffs, reuses intact work and rejects changed retained files before dispatch',async t=>{
  const {root,source}=await fixture(t);await writeFile(join(source,'local.txt'),'local input');let calls=0;
  const input={runDir:join(root,'run'),sessionId:'s',launch:{cwd:source},script:'export const meta={name:"writers",description:"proof"};return await parallel([()=>agent("A"),()=>agent("B")]);'};
  const backend=()=>writerBackend(async({prompt,workspace})=>{calls++;assert.equal(await readFile(join(workspace.cwd,'local.txt'),'utf8'),'local input');await writeFile(join(workspace.cwd,'note.txt'),prompt+'\n');return{value:prompt,terminalObserved:true,evidence:{cleanup}};});
  const first=await runWorkflow({...input,backend:backend()});assert.equal(first.status,'completed');assert.equal(calls,2);assert.notEqual(first.workers[0].workspace.cwd,first.workers[1].workspace.cwd);
  assert.equal(await readFile(join(source,'note.txt'),'utf8'),'base\n');assert.match(await readFile(first.workers[0].workspace.patchPath,'utf8'),/\+A/);
  await writeFile(join(source,'local.txt'),'source changes do not rewrite captured inputs');
  const replay=await runWorkflow({...input,resume:true,backend:backend()});assert.equal(replay.coverage.cached,2);assert.equal(calls,2);assert.deepEqual(replay.workspaceInputs,first.workspaceInputs);
  await writeFile(join(first.workers[0].workspace.cwd,'note.txt'),'tampered');
  await assert.rejects(runWorkflow({...input,resume:true,backend:backend()}),{code:'WORKSPACE_ARTIFACT'});assert.equal(calls,2);
});

test('interrupted writer keeps its patch and restart uses a new workspace from original captured inputs',async t=>{
  const {root,source}=await fixture(t);const input={runDir:join(root,'run'),sessionId:'s',launch:{cwd:source},script:'export const meta={name:"writer-restart",description:"proof"};return await agent("edit");'};
  const first=await runWorkflow({...input,backend:writerBackend(async({workspace})=>{await writeFile(join(workspace.cwd,'note.txt'),'interrupted edit\n');throw Object.assign(new Error('cancelled'),{code:'TURN_CANCELLED',evidence:{cleanup}});})});
  assert.equal(first.workers[0].status,'unknown');assert.match(await readFile(first.workers[0].workspace.patchPath,'utf8'),/interrupted edit/);
  await writeFile(join(source,'note.txt'),'later source edit\n');
  const second=await runWorkflow({...input,resume:true,expectedGeneration:1,restart:{position:0,attempt:1,reconciliation:'Reviewed retained edit; repeat from original inputs.'},backend:writerBackend(async({workspace})=>{
    assert.notEqual(workspace.cwd,first.workers[0].workspace.cwd);assert.equal(await readFile(join(workspace.cwd,'note.txt'),'utf8'),'base\n');await writeFile(join(workspace.cwd,'note.txt'),'replacement\n');return{value:'done',terminalObserved:true,evidence:{cleanup}};
  })});
  assert.equal(second.status,'completed');assert.equal(await readFile(join(first.workers[0].workspace.cwd,'note.txt'),'utf8'),'interrupted edit\n');assert.equal(await readFile(join(source,'note.txt'),'utf8'),'later source edit\n');
});
