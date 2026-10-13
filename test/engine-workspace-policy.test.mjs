/** @lane merge
 * @subject engine/workspace-policy.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writerPolicy,assertWriterThread} from '../engine/workspace-policy.mjs';

test('writer admission rejects extra roots, temporary grants, network and permission profiles',()=>{
  const cwd=resolve('owned-workspace'),policy=writerPolicy(cwd);
  const thread={cwd,runtimeWorkspaceRoots:[cwd],approvalPolicy:'never',sandbox:policy.turn.sandboxPolicy,activePermissionProfile:null};
  assert.doesNotThrow(()=>assertWriterThread(thread,cwd));
  for(const change of [
    {runtimeWorkspaceRoots:[cwd,resolve('sibling')]}, {cwd:resolve('sibling')},
    {sandbox:{...thread.sandbox,networkAccess:true}}, {sandbox:{...thread.sandbox,writableRoots:[resolve('sibling')]}},
    {sandbox:{...thread.sandbox,excludeTmpdirEnvVar:false}}, {sandbox:{...thread.sandbox,excludeSlashTmp:false}},
    {approvalPolicy:'on-request'}, {activePermissionProfile:{id:'custom'}},
  ])assert.throws(()=>assertWriterThread({...thread,...change},cwd),{code:'THREAD_POLICY'});
  assert.deepEqual(policy.thread.runtimeWorkspaceRoots,[cwd]);assert.deepEqual(policy.turn.runtimeWorkspaceRoots,[cwd]);
  assert.equal(Object.hasOwn(policy.thread,'environments'),false);assert.equal(Object.hasOwn(policy.turn,'environments'),false);
  assert.deepEqual(policy.thread.config.sandbox_workspace_write,{writable_roots:[],network_access:false,exclude_tmpdir_env_var:true,exclude_slash_tmp:true});
});
