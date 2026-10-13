/** @lane merge
 * @subject engine/controller.mjs
 * @subject engine/workspaces.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runWorkflow,readRun,requestControl} from '../engine/controller.mjs';

test('writer artifact collection cannot replace unknown evidence after the drain deadline',async()=>{
  const execute=promisify(execFile),root=await fs.mkdtemp(join(tmpdir(),'workflow-writer-retirement-'));
  const source=join(root,'project'),runDir=join(root,'run');
  const git=async(...args)=>execute('git',args,{cwd:source,windowsHide:true,timeout:10000});
  const originalWrite=fs.writeFile;
  let releasePatch,announcePatch,announceManifest,releaseClose,announceClose,work;
  const patchGate=new Promise(resolve=>{releasePatch=resolve;});
  const patchEntered=new Promise(resolve=>{announcePatch=resolve;});
  const manifestWritten=new Promise(resolve=>{announceManifest=resolve;});
  const closeGate=new Promise(resolve=>{releaseClose=resolve;});
  const closeEntered=new Promise(resolve=>{announceClose=resolve;});
  // Gate the real artifact write; Git, QuickJS, SQLite and remaining I/O stay real.
  fs.writeFile=async(...args)=>{
    const path=String(args[0]);
    if(path.endsWith('changes.patch')){announcePatch();await patchGate;}
    const result=await originalWrite(...args);
    if(path.endsWith(join('result','manifest.json')))announceManifest();
    return result;
  };
  syncBuiltinESMExports();
  try{
    await fs.mkdir(source);await git('init','-q');await git('config','user.email','fixture@example.invalid');await git('config','user.name','Fixture');
    await fs.writeFile(join(source,'note.txt'),'base\n');await git('add','.');await git('commit','-qm','base');
    const cleanup={serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members'};
    work=runWorkflow({runDir,sessionId:'fixture',launch:{cwd:source},drainTimeoutMs:35,
      script:'export const meta={name:"retirement",description:"late artifact evidence"}; return await agent("edit",{permissions:{sandbox:"workspace-write"}});',
      backend:{identity:'fixture-writer',execute:async({workspace})=>{
        await fs.writeFile(join(workspace.cwd,'note.txt'),'writer output\n');
        return{value:'done',terminalObserved:true,evidence:{cleanup}};
      },close:async()=>{announceClose();await closeGate;return cleanup;}}});
    await patchEntered;
    await requestControl(runDir,{sessionId:'fixture',generation:1,action:'stop'});
    await closeEntered;
    const before=(await readRun(runDir)).workers[0];
    assert.equal(before.status,'unknown');assert.equal(before.error.code,'DRAIN_TIMEOUT');
    releasePatch();await manifestWritten;
    await new Promise(resolve=>setImmediate(resolve));
    const after=(await readRun(runDir)).workers[0];
    assert.equal(after.status,'unknown');assert.equal(after.error.code,'DRAIN_TIMEOUT');
    assert.equal(after.workspace.manifestPath,undefined);
    releaseClose();
    const final=await work;
    assert.equal(final.status,'blocked');assert.equal(final.workers[0].status,'unknown');
  }finally{
    releasePatch();releaseClose();await work?.catch(()=>{});
    fs.writeFile=originalWrite;syncBuiltinESMExports();
    await fs.rm(root,{recursive:true,force:true,maxRetries:20,retryDelay:100});
  }
});
