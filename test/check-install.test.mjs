/** @lane merge
 * @subject scripts/check-install.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,stat,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cleanupInstall,inspectInstallServer,assertMissingAuthDoctor} from '../scripts/check-install.mjs';

async function directory(t){const base=await realpath(await mkdtemp(join(tmpdir(),'workflow-install-test-')));t.after(()=>rm(base,{recursive:true,force:true}));await writeFile(join(base,'evidence.txt'),'retained');return base;}
test('clean-install preserves its primary failure and evidence instead of replacing it with filesystem cleanup failure',async t=>{
 const base=await directory(t),primary=Object.assign(new Error('primary check failed'),{code:'PRIMARY'});let removed=0;
 await assert.rejects(cleanupInstall(base,{error:primary,safeToRemove:true,remove:async()=>{removed++;throw Object.assign(new Error('busy'),{code:'EBUSY'});}}),error=>error===primary);
 assert.equal(removed,0);assert.equal(await readFile(join(base,'evidence.txt'),'utf8'),'retained');assert.equal(primary.installCheck.directory,base);
});
test('clean-install retains uncertain ownership and rejects deletion outside its temporary namespace',async t=>{
 const base=await directory(t);await assert.rejects(cleanupInstall(base,{safeToRemove:false}),{code:'INSTALL_CLEANUP'});assert.equal(await readFile(join(base,'evidence.txt'),'utf8'),'retained');
 await assert.rejects(cleanupInstall(join(base,'evidence.txt'),{safeToRemove:true}),/temporary directory/i);
 await cleanupInstall(base,{safeToRemove:true});await assert.rejects(stat(base),{code:'ENOENT'});
});
test('clean-install closes its App Server once and requires positive owned-job drain without masking inspection errors',async()=>{
 const primary=new Error('inspection failed');let closed=0;const ownership={};
 await assert.rejects(inspectInstallServer({},async()=>{throw primary;},ownership,{connect:async()=>({close:async()=>{closed++;throw new Error('close failed');}})}),error=>error===primary);
 assert.equal(closed,1);assert.equal(ownership.safe,false);assert.equal(primary.installCleanup.serverExited,false);
 await assert.rejects(inspectInstallServer({jobHost:'owned'},async()=>true,{}, {connect:async()=>({close:async()=>({serverExited:true,jobEmpty:false})})}),{code:'INSTALL_CLEANUP'});
 const settled={};assert.equal(await inspectInstallServer({jobHost:'owned'},async()=>42,settled,{connect:async()=>({close:async()=>({serverExited:true,jobEmpty:true})})}),42);assert.equal(settled.safe,true);
});
test('clean-install reads bounded structured zero-inference doctor refusal rather than matching stderr',()=>{
 const value={status:'failed',inferenceRequests:0,stage:'authentication',error:{code:'AUTH_UNSUPPORTED'},cleanup:{serverExited:null,descendants:'notVerified'},admission:{status:'failed',inferenceRequests:0,stages:[{name:'authentication',status:'failed',error:{code:'AUTH_UNSUPPORTED'}}]}};
 const error={code:1,stdout:JSON.stringify(value),stderr:''};assert.deepEqual(assertMissingAuthDoctor(error),value);
 for(const change of [{status:'passed'},{inferenceRequests:1},{stage:'runtime'},{error:{code:'COMMAND_FAILED'}}])assert.throws(()=>assertMissingAuthDoctor({...error,stdout:JSON.stringify({...value,...change})}));
 assert.throws(()=>assertMissingAuthDoctor({...error,stdout:'x'.repeat(65537)}));assert.throws(()=>assertMissingAuthDoctor({...error,code:'ETIMEDOUT'}));
});
