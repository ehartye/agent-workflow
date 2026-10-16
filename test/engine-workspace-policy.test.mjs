/** @lane merge
 * @subject engine/workspace-policy.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writerPolicy,assertWriterThread} from '../engine/workspace-policy.mjs';
import * as policies from '../engine/workspace-policy.mjs';
import {createHash} from 'node:crypto';

test('capture policy is canonical, copied and immutable with a stable content identity',()=>{
  const value={version:1,excludeDirs:['generated/','cache/'],protectedPaths:['note.txt','assets/']};
  const {policy,policyHash}=policies.validateCapturePolicy(value);
  assert.deepEqual(policy,{version:1,excludeDirs:['cache/','generated/'],protectedPaths:['assets/','note.txt']});
  assert.equal(policyHash,createHash('sha256').update(JSON.stringify(policy)).digest('hex'));
  assert.equal(policies.validateCapturePolicy({...value,excludeDirs:[...value.excludeDirs].reverse()}).policyHash,policyHash);
  value.excludeDirs.push('assets/');value.protectedPaths.length=0;
  assert.deepEqual(policy.protectedPaths,['assets/','note.txt']);assert.equal(policy.excludeDirs.length,2);
  assert.throws(()=>policy.excludeDirs.push('assets/'),TypeError);
});

test('capture policy rejects ambiguous names, overlapping exclusions and assigned-output conflicts',()=>{
  const valid={version:1,excludeDirs:['generated/'],protectedPaths:['note.txt','assets/']};
  for(const excludeDirs of [
    ['../generated/'],['/generated/'],['C:/generated/'],['generated\\'],['generated'],
    ['generated//'],['generated/./'],['.git/'],['x/.GiT/'],['git~1/'],['generated./'],
    ['generated /'],['nul/'],['con.txt/'],['a*/'],['a?/'],['a:/'],['a\n/'],
    ['generated/','GENERATED/'],['generated/','generated/nested/'],['assets/'],['assets/cache/'],
    ['generated/','generated-other/','generated/nested/'],
    ['note.txt/'],Array.from({length:257},(_,i)=>`cache${i}/`),
  ])assert.throws(()=>policies.validateCapturePolicy({...valid,excludeDirs}),{code:'WORKSPACE_POLICY'});
  for(const change of [{version:2},{extra:true},{protectedPaths:['assets/','ASSETS/']},{protectedPaths:['../note.txt']},{protectedPaths:null},{excludeDirs:null}])
    assert.throws(()=>policies.validateCapturePolicy({...valid,...change}),{code:'WORKSPACE_POLICY'});
  assert.throws(()=>policies.validateCapturePolicy(null),{code:'WORKSPACE_POLICY'});
  assert.throws(()=>policies.validateCapturePolicy({...valid,protectedPaths:['a'.repeat(1025)]}),{code:'WORKSPACE_POLICY'});
  assert.throws(()=>policies.validateCapturePolicy({...valid,excludeDirs:Array(1)}),{code:'WORKSPACE_POLICY'});
  assert.throws(()=>policies.validateCapturePolicy({...valid,protectedPaths:Array.from({length:20001},(_,i)=>`source${i}.mjs`)}),{code:'WORKSPACE_POLICY'});
  assert.throws(()=>policies.validateCapturePolicy({...valid,protectedPaths:Array.from({length:20000},(_,i)=>`source${i}-${'x'.repeat(60)}.mjs`)}),{code:'WORKSPACE_POLICY'});
});

test('capture policy rejects accessor and symbol fields without evaluating caller code',()=>{
  let reads=0;const value={version:1,excludeDirs:[],protectedPaths:[]};
  assert.throws(()=>policies.validateCapturePolicy({...value,get excludeDirs(){reads++;return [];}}),{code:'WORKSPACE_POLICY'});
  assert.throws(()=>policies.validateCapturePolicy({...value,[Symbol('private')]:true}),{code:'WORKSPACE_POLICY'});
  const excludeDirs=[];Object.defineProperty(excludeDirs,0,{enumerable:true,get(){reads++;return 'cache/';}});
  assert.throws(()=>policies.validateCapturePolicy({...value,excludeDirs}),{code:'WORKSPACE_POLICY'});
  const hidden=[];Object.defineProperty(hidden,0,{get(){reads++;return 'cache/';}});
  assert.throws(()=>policies.validateCapturePolicy({...value,excludeDirs:hidden}),{code:'WORKSPACE_POLICY'});
  assert.equal(reads,0);
});

test('writer admission rejects extra roots, temporary grants, network and permission profiles',()=>{
  const cwd=resolve('owned-workspace'),policy=writerPolicy(cwd);
  assert.deepEqual(policy.launchArgs,['-c',`projects={${JSON.stringify(cwd)}={trust_level="trusted"}}`]);
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
