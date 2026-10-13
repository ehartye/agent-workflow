/** @lane merge
 * @subject engine/workspaces.mjs
 * @subject engine/workspace-run.mjs
 * @subject engine/controller.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,unlink,symlink,realpath,link,open,stat,readdir} from 'node:fs/promises';
import {join,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {captureInputs,describeInputs,loadInputs,createWorkspace,collectWorkspace,verifyWorkspace,assertWorkspaceReady} from '../engine/workspaces.mjs';
import * as workspaces from '../engine/workspaces.mjs';
import {runWorkspaces} from '../engine/workspace-run.mjs';
import {createSettings} from '../engine/settings.mjs';

// Controller-only cases require installed dependencies; capture cases use Node/Git only.
const runWorkflow=async options=>(await import('../engine/controller.mjs')).runWorkflow(options);
const readRun=async path=>(await import('../engine/controller.mjs')).readRun(path);
const exec=promisify(execFile);
const git=async(cwd,...args)=>(await exec('git',args,{cwd,windowsHide:true,timeout:10000})).stdout.trim();
async function fixture(t){
  const repository=await realpath(dirname(dirname(fileURLToPath(import.meta.url))));
  const root=await realpath(await mkdtemp(join(repository,'.workspace-test-')));
  assert.equal(dirname(root),repository);assert.equal(basename(root).startsWith('.workspace-test-'),true);
  t.after(()=>rm(root,{recursive:true,force:true}));
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

const capturePolicy={version:1,excludeDirs:['generated/'],protectedPaths:['assigned/','binary.dat','note.txt']};
async function sparse(path,bytes=128*1024*1024+1){const handle=await open(path,'w');try{await handle.truncate(bytes);}finally{await handle.close();}}

test('explicit capture excludes large generated payloads with complete inventories and retains ignored source and binary outputs',async t=>{
  const {source,artifacts}=await fixture(t);
  await mkdir(join(source,'generated'));await sparse(join(source,'generated','large.bin'));
  await mkdir(join(source,'ignored'));await writeFile(join(source,'ignored','source.txt'),'retained despite ignore');
  const policy=structuredClone(capturePolicy),inputs=await captureInputs({source,artifactsDir:join(artifacts,'inputs'),capturePolicy:policy});
  policy.excludeDirs.push('assigned/');
  assert.equal(inputs.version,2);assert.equal(inputs.files.some(f=>f.name==='ignored/source.txt'),true);
  assert.equal(inputs.files.some(f=>f.name.startsWith('generated/')),false);
  const ref=describeInputs(inputs);assert.equal(ref.version,2);assert.equal(ref.policyHash,inputs.policyHash);
  assert.deepEqual((await loadInputs(ref)).policy,capturePolicy);
  const {bytes,fileCount,entryCount,sha256,path}=ref.excludedInventory;
  assert.deepEqual((await loadInputs({...ref,excludedInventory:{bytes,fileCount,entryCount,sha256,path}})).policy,capturePolicy);
  const worker=await createWorkspace({inputs,artifactsDir:join(artifacts,'worker')});
  assert.equal(worker.version,2);assert.deepEqual(worker.inputs,ref);assert.equal(worker.policyHash,inputs.policyHash);
  const inputPage=await workspaces.readWorkspaceExclusions(worker,{stage:'inputs',after:0,limit:1});
  assert.equal(inputPage.entryCount,2);assert.equal(inputPage.fileCount,1);assert.equal(inputPage.bytes,128*1024*1024+1);
  assert.deepEqual(inputPage.entries,[{name:'generated/',type:'directory',size:0,excludedBy:'generated/'}]);assert.equal(inputPage.nextAfter,1);
  const next=await workspaces.readWorkspaceExclusions(worker,{stage:'inputs',after:1,limit:1});
  assert.deepEqual(next.entries,[{name:'generated/large.bin',type:'file',size:128*1024*1024+1,excludedBy:'generated/'}]);assert.equal(next.nextAfter,null);
  await mkdir(join(worker.cwd,'generated'));await sparse(join(worker.cwd,'generated','large.bin'));
  await mkdir(join(worker.cwd,'assigned'));await writeFile(join(worker.cwd,'assigned','output.txt'),'assigned source');
  await writeFile(join(worker.cwd,'.gitignore'),'assigned/\nunexpected.bin\n');
  await writeFile(join(worker.cwd,'note.txt'),'source edit\n');await writeFile(join(worker.cwd,'unexpected.bin'),Buffer.from([0,255,1]));
  const result=await collectWorkspace(worker);
  assert.deepEqual(result.missingProtectedPaths,[]);
  assert.equal(result.bytes<1024,true);assert.ok(result.changedFiles.includes('assigned/output.txt'));assert.ok(result.changedFiles.includes('unexpected.bin'));
  assert.equal(result.changedFiles.some(name=>name.startsWith('generated/')),false);assert.match(await readFile(result.patchPath,'utf8'),/GIT binary patch/);
  const outputPage=await workspaces.readWorkspaceExclusions(result,{stage:'outputs',after:0,limit:100});assert.equal(outputPage.fileCount,1);
  assert.equal(outputPage.policyHash,inputs.policyHash);assert.equal(outputPage.inventoryHash,result.excludedInventory.sha256);
  await writeFile(join(worker.cwd,'generated','large.bin'),'omitted bytes changed');assert.equal(await verifyWorkspace(result),true);
  const generated=join(worker.cwd,'generated');assert.equal(dirname(generated),worker.cwd);await rm(generated,{recursive:true});
  assert.equal(await verifyWorkspace(result),true);
  assert.equal((await workspaces.readWorkspaceExclusions(result,{stage:'outputs'})).bytes,128*1024*1024+1);
  await writeFile(join(worker.cwd,'new-hidden.txt'),'not excluded');await assert.rejects(verifyWorkspace(result),{code:'WORKSPACE_ARTIFACT'});
  await unlink(join(worker.cwd,'new-hidden.txt'));await writeFile(join(worker.cwd,'unexpected.bin'),Buffer.from([0,255,2]));
  await assert.rejects(verifyWorkspace(result),{code:'WORKSPACE_ARTIFACT'});
});

test('explicit capture rejects tracked exclusion conflicts including locally deleted tracked paths',async t=>{
  const {source,artifacts}=await fixture(t);await mkdir(join(source,'generated'));await writeFile(join(source,'generated','tracked.txt'),'tracked');
  await git(source,'add','generated/tracked.txt');await git(source,'commit','-qm','tracked generated');await unlink(join(source,'generated','tracked.txt'));
  await assert.rejects(captureInputs({source,artifactsDir:join(artifacts,'inputs'),capturePolicy}),error=>error.code==='WORKSPACE_INPUT'&&error.cause?.code==='WORKSPACE_POLICY');
});

test('an explicit empty policy includes repository, private and configured global ignored inputs',async t=>{
  const {root,source,artifacts}=await fixture(t),globalIgnore=join(root,'global-ignore');
  await writeFile(globalIgnore,'global.txt\n');await git(source,'config','core.excludesFile',globalIgnore);
  await writeFile(join(source,'.git','info','exclude'),'private.txt\n');await writeFile(join(source,'private.txt'),'private ignored');await writeFile(join(source,'global.txt'),'global ignored');
  await mkdir(join(source,'ignored'));await writeFile(join(source,'ignored','source.txt'),'repository ignored');
  const inputs=await captureInputs({source,artifactsDir:join(artifacts,'explicit'),capturePolicy:{version:1,excludeDirs:[],protectedPaths:[]}});
  for(const name of ['global.txt','private.txt','ignored/source.txt'])assert.ok(inputs.files.some(item=>item.name===name));
  const legacy=await captureInputs({source,artifactsDir:join(artifacts,'legacy')});
  for(const name of ['global.txt','private.txt','ignored/source.txt'])assert.equal(legacy.files.some(item=>item.name===name),false);
});

test('unsafe excluded contents reject output capture and preserve exact enumeration diagnostics',async t=>{
  const {root,source,artifacts}=await fixture(t);const inputs=await captureInputs({source,artifactsDir:join(artifacts,'inputs'),capturePolicy});
  const worker=await createWorkspace({inputs,artifactsDir:join(artifacts,'worker')}),outside=join(root,'outside');await mkdir(outside);await writeFile(join(outside,'canary'),'outside');
  await mkdir(join(worker.cwd,'generated'));await symlink(outside,join(worker.cwd,'generated','escape'),'junction');
  await assert.rejects(collectWorkspace(worker),error=>error.code==='WORKSPACE_ARTIFACT'&&error.captureFailure.stage==='inventory'&&error.captureFailure.cause.code==='WORKSPACE_PATH');
  assert.equal(await readFile(join(outside,'canary'),'utf8'),'outside');
});

test('explicit capture rejects excluded junctions without following outside files',async t=>{
  const {root,source,artifacts}=await fixture(t);const outside=join(root,'outside');await mkdir(outside);await writeFile(join(outside,'canary'),'outside');
  await symlink(outside,join(source,'generated'),'junction');
  await assert.rejects(captureInputs({source,artifactsDir:join(artifacts,'inputs'),capturePolicy}),{code:'WORKSPACE_INPUT'});
  assert.equal(await readFile(join(outside,'canary'),'utf8'),'outside');
});

test('missing assigned outputs remain explicit evidence rather than a claim of delivery',async t=>{
  const {source,artifacts}=await fixture(t);
  const policy={...capturePolicy,protectedPaths:['assigned/output.txt','binary.dat','note.txt']};
  const inputs=await captureInputs({source,artifactsDir:join(artifacts,'inputs'),capturePolicy:policy});
  const worker=await createWorkspace({inputs,artifactsDir:join(artifacts,'worker')});await unlink(join(worker.cwd,'note.txt'));
  const result=await collectWorkspace(worker);
  assert.deepEqual(result.missingProtectedPaths,['assigned/output.txt','note.txt']);assert.equal(await verifyWorkspace(result),true);
  const manifest=JSON.parse(await readFile(result.manifestPath,'utf8'));assert.deepEqual(manifest.missingProtectedPaths,result.missingProtectedPaths);
  await assert.rejects(verifyWorkspace({...result,missingProtectedPaths:[]}),{code:'WORKSPACE_ARTIFACT'});
});

test('policy and inventory tampering rejects load, admission, collection and replay with bounded inventory reads',async t=>{
  const {source,artifacts}=await fixture(t);const inputs=await captureInputs({source,artifactsDir:join(artifacts,'inputs'),capturePolicy});
  const ref=describeInputs(inputs),worker=await createWorkspace({inputs,artifactsDir:join(artifacts,'worker')});
  await assert.rejects(loadInputs({...ref,policyHash:'0'.repeat(64)}),{code:'WORKSPACE_ARTIFACT'});
  await assert.rejects(loadInputs({...ref,excludedInventory:{...ref.excludedInventory,path:join(source,'note.txt')}}),{code:'WORKSPACE_ARTIFACT'});
  await assert.rejects(createWorkspace({inputs:{...inputs,policy:{...capturePolicy,excludeDirs:['assigned/']}},artifactsDir:join(artifacts,'bad')}),{code:'WORKSPACE_CREATE'});
  await assert.rejects(assertWorkspaceReady({...worker,policyHash:'0'.repeat(64)}),{code:'WORKSPACE_ARTIFACT'});
  await assert.rejects(createWorkspace({inputs:{...inputs,version:1},artifactsDir:join(artifacts,'downgraded')}),{code:'WORKSPACE_CREATE'});
  await assert.rejects(assertWorkspaceReady({...worker,version:1}),{code:'WORKSPACE_ARTIFACT'});
  await writeFile(join(worker.cwd,'note.txt'),'changed before dispatch');await assert.rejects(assertWorkspaceReady(worker),{code:'WORKSPACE_ARTIFACT'});
  await writeFile(join(worker.cwd,'note.txt'),'base\n');await writeFile(join(worker.cwd,'unexpected.txt'),'new before dispatch');
  await assert.rejects(assertWorkspaceReady(worker),{code:'WORKSPACE_ARTIFACT'});await unlink(join(worker.cwd,'unexpected.txt'));
  for(const options of [null,false,{stage:'else'},{stage:'inputs',limit:101},{stage:'inputs',after:-1},{stage:'inputs',path:ref.excludedInventory.path}])
    await assert.rejects(workspaces.readWorkspaceExclusions(worker,options),{code:'WORKSPACE_INPUT'});
  const result=await collectWorkspace(worker);
  // An inventory page verifies retained metadata, not every included payload.
  const inputBlob=inputs.files.find(item=>item.name==='note.txt').blobPath,inputBytes=await readFile(inputBlob);
  await writeFile(inputBlob,'corrupt included input');
  assert.equal((await workspaces.readWorkspaceExclusions(result,{stage:'outputs'})).entryCount,0);
  await assert.rejects(loadInputs(ref),{code:'WORKSPACE_ARTIFACT'});await writeFile(inputBlob,inputBytes);
  const manifest=JSON.parse(await readFile(result.manifestPath,'utf8')),blob=manifest.files.find(item=>item.name==='note.txt').blobPath;
  const original=await readFile(blob);await writeFile(blob,'tampered retained blob');await assert.rejects(verifyWorkspace(result),{code:'WORKSPACE_ARTIFACT'});await writeFile(blob,original);
  await writeFile(result.excludedInventory.path,'[]\n');await assert.rejects(verifyWorkspace(result),{code:'WORKSPACE_ARTIFACT'});
  await assert.rejects(workspaces.readWorkspaceExclusions(result,{stage:'outputs'}),{code:'WORKSPACE_ARTIFACT'});
  await writeFile(inputs.excludedInventory.path,'[]\n');
  await assert.rejects(loadInputs(ref),{code:'WORKSPACE_ARTIFACT'});await assert.rejects(assertWorkspaceReady(worker),{code:'WORKSPACE_ARTIFACT'});
  await assert.rejects(collectWorkspace(worker),error=>error.code==='WORKSPACE_ARTIFACT'&&error.captureFailure.stage==='identity');
});

test('nonexcluded overflow retains capture stage and precise diagnostics under an explicit policy',async t=>{
  const {source,artifacts}=await fixture(t);const inputs=await captureInputs({source,artifactsDir:join(artifacts,'inputs'),capturePolicy});
  const worker=await createWorkspace({inputs,artifactsDir:join(artifacts,'worker')});await sparse(join(worker.cwd,'large.bin'));
  await assert.rejects(collectWorkspace(worker),error=>{
    assert.equal(error.code,'WORKSPACE_ARTIFACT');assert.deepEqual(error.captureFailure,{stage:'files',cause:{code:'WORKSPACE_LIMIT',message:'Workspace exceeds the byte capture limit'}});
    assert.equal(error.workspacePath,worker.cwd);return true;
  });assert.equal((await stat(join(worker.cwd,'large.bin'))).size,128*1024*1024+1);
});

test('oversized and over-count persisted inventories fail closed before admission',async t=>{
  const {source,artifacts}=await fixture(t);const inputs=await captureInputs({source,artifactsDir:join(artifacts,'inputs'),capturePolicy}),ref=describeInputs(inputs);
  const original=await readFile(inputs.excludedInventory.path);await sparse(inputs.excludedInventory.path,16*1024*1024+1);
  await assert.rejects(loadInputs(ref),error=>error.code==='WORKSPACE_ARTIFACT'&&error.cause.code==='WORKSPACE_LIMIT');
  await writeFile(inputs.excludedInventory.path,original);
  const manifest=JSON.parse(await readFile(inputs.manifestPath,'utf8'));manifest.excludedInventory.entryCount=100001;
  const bytes=JSON.stringify(manifest)+'\n';await writeFile(inputs.manifestPath,bytes);
  const invalidRef={...ref,manifestHash:createHash('sha256').update(bytes).digest('hex'),excludedInventory:manifest.excludedInventory};
  await assert.rejects(loadInputs(invalidRef),error=>error.code==='WORKSPACE_ARTIFACT'&&error.cause.message==='Excluded inventory descriptor is invalid');
});

test('excluded enumeration fails rather than silently truncating an inventory over 16 MiB',async t=>{
  const {source,artifacts}=await fixture(t);
  // Long shared literal prefixes reach the JSON cap with fewer than 20,000 files.
  const prefix=['generated',...Array.from({length:4},(_,i)=>String(i)+'x'.repeat(219))].join('/')+'/';
  const directory=join(source,prefix);await mkdir(directory,{recursive:true});
  for(let start=0;start<10000;start+=50)await Promise.all(Array.from({length:50},(_,offset)=>writeFile(join(directory,`file-${String(start+offset).padStart(5,'0')}`),'')));
  const policy={...capturePolicy,excludeDirs:[prefix]};
  await assert.rejects(captureInputs({source,artifactsDir:join(artifacts,'inputs'),capturePolicy:policy}),error=>{
    assert.equal(error.code,'WORKSPACE_INPUT');assert.equal(error.cause.code,'WORKSPACE_LIMIT');
    assert.equal(error.cause.message,'Workspace excluded inventory exceeds its entry or byte limit');return true;
  });
  await assert.rejects(readFile(join(artifacts,'inputs','inputs.json')),{code:'ENOENT'});
  assert.equal(await readFile(join(source,'note.txt'),'utf8'),'base\n');
});

test('workspace preparation freezes policies and refuses legacy or version two policy reinterpretation',async t=>{
  const {root,source,artifacts}=await fixture(t);const runDir=join(root,'run');await mkdir(runDir);
  let ref;const policy=structuredClone(capturePolicy),manager=runWorkspaces({runDir,source,capturePolicy:policy,onInputs:async value=>{ref=value;}});
  policy.excludeDirs.push('assigned/');const worker=await manager.prepare({generation:1,position:0});assert.equal(worker.inputs.policyHash,ref.policyHash);
  const loaded=await loadInputs(ref);assert.deepEqual(loaded.policy,capturePolicy);
  await writeFile(join(worker.cwd,'note.txt'),'predecessor edits');await writeFile(join(source,'note.txt'),'later source edits');
  const replacement=await runWorkspaces({runDir,source,inputs:ref,capturePolicy}).prepare({generation:2,position:0});
  assert.notEqual(replacement.cwd,worker.cwd);assert.equal(await readFile(join(replacement.cwd,'note.txt'),'utf8'),'base\n');
  const legacy=await captureInputs({source,artifactsDir:join(artifacts,'legacy')});assert.equal(legacy.version,1);assert.equal(describeInputs(legacy).version,undefined);
  const legacyLoaded=await loadInputs(describeInputs(legacy));assert.equal(legacyLoaded.policy,undefined);
  for(const inputs of [ref,describeInputs(legacy)])await assert.rejects(runWorkspaces({runDir,source,inputs,capturePolicy:{...capturePolicy,excludeDirs:['cache/']}}).prepare({generation:2,position:0}),{code:'WORKSPACE_INPUT'});
  const legacyWorker=await createWorkspace({inputs:legacyLoaded,artifactsDir:join(artifacts,'legacy-worker')});
  const legacyResult=await collectWorkspace(legacyWorker);assert.equal(await verifyWorkspace(legacyResult),true);
  await mkdir(join(legacyWorker.cwd,'generated'));await sparse(join(legacyWorker.cwd,'generated','large.bin'));
  await assert.rejects(verifyWorkspace(legacyResult),{code:'WORKSPACE_ARTIFACT'});
  const another=await createWorkspace({inputs:legacyLoaded,artifactsDir:join(artifacts,'legacy-overflow')});
  await mkdir(join(another.cwd,'generated'));await sparse(join(another.cwd,'generated','large.bin'));await assert.rejects(collectWorkspace(another),{code:'WORKSPACE_ARTIFACT'});
});

test('capture persistence must precede writer creation and a failed persistence callback is never retried',async t=>{
  const {root,source}=await fixture(t),runDir=join(root,'run');await mkdir(runDir);
  await assert.rejects(runWorkspaces({runDir,source,capturePolicy}).prepare({generation:1,position:0}),{code:'WORKSPACE_INPUT'});
  let calls=0;const manager=runWorkspaces({runDir,source,capturePolicy,onInputs:async()=>{calls++;throw new Error('persistence unavailable');}});
  await assert.rejects(manager.prepare({generation:1,position:0}),/persistence unavailable/);
  assert.equal(calls,1);assert.equal((await readdir(join(runDir,'workspaces'))).filter(name=>name.startsWith('g')).length,0);
  await assert.rejects(manager.prepare({generation:1,position:1}),/persistence unavailable/);assert.equal(calls,1);
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

test('controller freezes explicit exclusions before writer dispatch and replays the same captured identity',async t=>{
  const {root,source}=await fixture(t),runDir=join(root,'run');let calls=0;
  await mkdir(join(source,'generated'));await sparse(join(source,'generated','dependency.bin'));
  const input={runDir,sessionId:'s',launch:{cwd:source,capturePolicy},script:'export const meta={name:"frozen-policy",description:"proof"};return await agent("edit");'};
  const backend=()=>writerBackend(async({workspace})=>{
    calls++;const saved=await readRun(runDir);assert.equal(saved.capturePolicyHash,workspace.policyHash);assert.equal(saved.workspaceInputs.policyHash,workspace.policyHash);
    await assert.rejects(stat(join(workspace.cwd,'generated')),{code:'ENOENT'});
    await mkdir(join(workspace.cwd,'generated'));await sparse(join(workspace.cwd,'generated','output.bin'));
    await writeFile(join(workspace.cwd,'note.txt'),'reviewable source\n');return{value:'done',terminalObserved:true,evidence:{cleanup}};
  });
  const first=await runWorkflow({...input,backend:backend()});assert.equal(first.status,'completed');
  assert.equal(first.launch.capturePolicyHash,first.capturePolicyHash);assert.equal(first.workspaceInputs.version,2);
  assert.deepEqual(first.workers[0].workspace.changedFiles,['note.txt']);
  const omitted=await workspaces.readWorkspaceExclusions(first.workers[0].workspace,{stage:'outputs',after:0,limit:100});assert.ok(omitted.entries.some(item=>item.name==='generated/output.bin'));
  const replay=await runWorkflow({...input,resume:true,backend:backend()});assert.equal(replay.coverage.cached,1);assert.equal(calls,1);
  assert.equal(replay.capturePolicyHash,first.capturePolicyHash);assert.deepEqual(replay.workspaceInputs,first.workspaceInputs);
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(join(runDir,'run.sqlite'));
  try{const header=JSON.parse(db.prepare('SELECT value FROM header WHERE id=1').get().value);header.capturePolicyHash='0'.repeat(64);db.prepare('UPDATE header SET value=? WHERE id=1').run(JSON.stringify(header));}finally{db.close();}
  await assert.rejects(runWorkflow({...input,resume:true,backend:backend()}),{code:'CAPTURE_POLICY_IDENTITY'});assert.equal(calls,1);
});

test('capture limits retain a precise durable diagnostic and leave completed worker artifacts unknown',async t=>{
  const {root,source}=await fixture(t),runDir=join(root,'run');
  const result=await runWorkflow({runDir,sessionId:'s',launch:{cwd:source},script:'export const meta={name:"capture-limit",description:"proof"};return await agent("edit");',backend:writerBackend(async({workspace})=>{
    const handle=await open(join(workspace.cwd,'large-dependency.bin'),'w');
    try{await handle.truncate(128*1024*1024+1);}finally{await handle.close();}
    return{value:'worker finished',terminalObserved:true,evidence:{cleanup}};
  })});
  const worker=result.workers[0];
  assert.equal(worker.status,'unknown');assert.equal(worker.error.code,'WORKSPACE_ARTIFACT');
  assert.deepEqual(worker.workspaceError.capture,{stage:'files',cause:{code:'WORKSPACE_LIMIT',message:'Workspace exceeds the byte capture limit'}});
  assert.equal(worker.evidence.cleanup.jobEmpty,true);assert.equal(worker.workspace.patchPath,undefined);
  assert.equal((await stat(join(worker.workspace.cwd,'large-dependency.bin'))).size,128*1024*1024+1);
  assert.deepEqual((await readRun(runDir)).workers[0].workspaceError,worker.workspaceError);
});
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
