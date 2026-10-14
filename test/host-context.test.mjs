/** @lane merge
 * @subject foundation/host-context.mjs
 * @subject foundation/native/JobHost.cs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('host context rejects unknown, oversized or invalid native records',async()=>{
  const {parseWindowsHostContext}=await import('../foundation/host-context.mjs');
  const good={status:'observed',sessionId:0,elevated:true,interactive:false,buildNumber:'26200',revision:9457,displayVersion:'25H2'};
  assert.deepEqual(parseWindowsHostContext(JSON.stringify(good)),good);
  assert.deepEqual(parseWindowsHostContext('{"status":"unavailable"}'),{status:'unavailable'});
  for(const bad of [null,[],{...good,username:'PRIVATE_ACCOUNT'},{...good,sessionId:-1},{...good,elevated:'true'},{...good,revision:2**32},{...good,buildNumber:'PRIVATE_PATH'},{...good,displayVersion:'PRIVATE/ACCOUNT'},{status:'unavailable',sessionId:0}]){
    assert.throws(()=>parseWindowsHostContext(JSON.stringify(bad)),/Invalid host context/);
  }
  assert.throws(()=>parseWindowsHostContext(' '.repeat(2049)),/Invalid host context/);
  assert.throws(()=>parseWindowsHostContext('PRIVATE_NATIVE_ERROR'),/Invalid host context/);
});

test('host context retains local launch facts without environment values', {timeout:25000},async()=>{
  const {readHostContext}=await import('../foundation/host-context.mjs');
  const context=await readHostContext();
  assert.equal(context.node,process.version);assert.equal(context.platform,process.platform);assert.equal(context.arch,process.arch);
  assert.equal(typeof context.osRelease,'string');assert.equal(context.sshEnvironmentPresent,Boolean(process.env.SSH_CONNECTION||process.env.SSH_CLIENT||process.env.SSH_TTY));
  if(process.platform==='win32')assert.equal(context.windows.status,'observed');else assert.equal(context.windows,undefined);
  assert.deepEqual(Object.keys(context).sort(),[...['node','platform','arch','osRelease','sshEnvironmentPresent'],...(process.platform==='win32'?['windows']:[])].sort());
});

test('unavailable native context remains explicit and excludes compiler error details', {skip:process.platform!=='win32',timeout:10000},async t=>{
  const dir=await mkdtemp(join(tmpdir(),'workflow-context-unavailable-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const script=`import {readHostContext} from ${JSON.stringify(new URL('../foundation/host-context.mjs',import.meta.url).href)};process.env.SystemRoot=${JSON.stringify(join(dir,'PRIVATE_COMPILER_PATH'))};console.log(JSON.stringify(await readHostContext()));`;
  const {stdout,stderr}=await promisify(execFile)(process.execPath,['--input-type=module','-e',script],{env:{...process.env,SSH_CONNECTION:'PRIVATE_SSH_ADDRESS'},windowsHide:true,timeout:7000,maxBuffer:4096});
  assert.equal(stderr,'');const context=JSON.parse(stdout);
  assert.equal(context.sshEnvironmentPresent,true);assert.deepEqual(context.windows,{status:'unavailable',reason:'build-failed'});
  assert.doesNotMatch(stdout,/PRIVATE_|csc\.exe|username|USERPROFILE/);
});
