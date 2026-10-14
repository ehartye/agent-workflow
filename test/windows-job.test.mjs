/** @lane merge
 * @subject foundation/windows-job.mjs
 * @subject foundation/native/JobHost.cs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const windows=process.platform==='win32';
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
test('Windows host context reports bounded local facts without starting a job', {skip:!windows,timeout:25000},async t=>{
  const {buildJobHost}=await import('../foundation/windows-job.mjs');
  const dir=await mkdtemp(join(tmpdir(),'workflow-context-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const host=await buildJobHost(dir);
  const {stdout,stderr}=await promisify(execFile)(host,['--context'],{windowsHide:true,timeout:5000,maxBuffer:2048});
  assert.equal(stderr,'');assert.ok(Buffer.byteLength(stdout)<2048);
  const context=JSON.parse(stdout);
  if(context.sessionId!==0){
    await assert.rejects(promisify(execFile)(host,['--session0-desktop',process.execPath,'-e','console.log("UNEXPECTED_CHILD")'],{windowsHide:true,timeout:5000,maxBuffer:2048}),error=>error.code===2&&error.stdout===''&&error.stderr==='WORKFLOW_SESSION0_DESKTOP_REJECTED\n');
    const {AppServer}=await import('../foundation/client.mjs');
    await assert.rejects(AppServer.connect({command:process.execPath,args:['-e','console.log("UNEXPECTED_CHILD")'],jobHost:host,session0Desktop:'shared'}),error=>error.code==='SESSION0_DESKTOP_SCOPE'&&error.cleanup.serverExited===true&&error.cleanup.jobEmpty===true&&error.cleanup.desktopCompatibility.applied===false);
  }
  assert.equal(context.status,'observed');
  assert.deepEqual(Object.keys(context).sort(),['buildNumber','displayVersion','elevated','interactive','revision','sessionId','status']);
  assert.ok(Number.isInteger(context.sessionId)&&context.sessionId>=0);
  assert.equal(typeof context.elevated,'boolean');assert.equal(typeof context.interactive,'boolean');
  assert.match(context.buildNumber,/^\d{1,10}$/);assert.ok(Number.isInteger(context.revision)&&context.revision>=0);
  assert.match(context.displayVersion,/^[A-Za-z0-9 ._-]{0,32}$/);
  await assert.rejects(promisify(execFile)(host,['--context',process.execPath,'-e','console.log("UNEXPECTED_CHILD")'],{windowsHide:true,timeout:5000,maxBuffer:2048}),error=>error.code===2&&error.stdout===''&&error.stderr==='');
});
test('Windows owned job drains detached descendants on root exit and stdin cancellation', {skip:!windows,timeout:30000},async t=>{
  const {buildJobHost}=await import('../foundation/windows-job.mjs');
  const dir=await mkdtemp(join(tmpdir(),'workflow-job-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const host=await buildJobHost(dir);
  await t.test('App Server reports owned job drain separately from protocol completion',async()=>{
    const {AppServer}=await import('../foundation/client.mjs');
    const client=await AppServer.connect({command:process.execPath,args:[fileURLToPath(new URL('./fixtures/foundation-server.mjs',import.meta.url))],jobHost:host});
    try{assert.equal(await client.request('echo',{value:'inside job'}),'inside job');}
    finally{const cleanup=await client.close();assert.equal(cleanup.serverExited,true);assert.equal(cleanup.descendants,'notVerified');assert.equal(cleanup.ownershipScope,'windows-job-members');assert.equal(cleanup.jobEmpty,true);}
  });
  const script=join(dir,'canary with spaces.mjs');
  await writeFile(script,`import {spawn} from 'node:child_process';
if(process.argv[2]==='child'){setTimeout(()=>{},10000);}else{
 const child=spawn(process.execPath,[import.meta.filename,'child'],{detached:true,stdio:'ignore',windowsHide:true});child.unref();
 console.log(JSON.stringify({root:process.pid,child:child.pid,args:process.argv.slice(3)}));
 setTimeout(()=>process.exit(0),process.argv[2]==='normal'?700:10000);
}`);
  for(const mode of ['normal','cancel','host-death'])await t.test(mode,async()=>{
    const args=['space here','quote"here','backslash\\',''];
    const child=spawn(host,[process.execPath,script,mode,...args],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',errors='',ready;
    const announced=new Promise(resolve=>{ready=resolve;});
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('\n'))ready();});
    child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{errors+=chunk;});
    const closed=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});
    let timer;
    try{
      await Promise.race([announced,closed.then(()=>{throw Error('Job exited before canary readiness: '+errors);}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Canary startup timed out')),5000);})]);
      const ids=JSON.parse(output.trim());assert.deepEqual(ids.args,args);assert.equal(alive(ids.root),true);assert.equal(alive(ids.child),true);
      if(mode==='cancel')child.stdin.end();
      if(mode==='host-death')child.kill();
      const result=await closed;
      const deadline=Date.now()+5000;
      while((alive(ids.root)||alive(ids.child))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
      assert.equal(alive(ids.root),false);assert.equal(alive(ids.child),false);
      if(mode!=='host-death'){assert.equal(result.code,0,errors);assert.equal(errors,'WORKFLOW_JOB_READY\nWORKFLOW_JOB_DRAINED\n');}
      else assert.doesNotMatch(errors,/WORKFLOW_JOB_DRAINED/);
    }finally{clearTimeout(timer);child.stdin.destroy();if(child.exitCode===null&&child.signalCode===null)child.kill();await closed;}
  });
  await t.test('spawn failure has no drain success receipt',async()=>{
    const child=spawn(host,[join(dir,'absent.exe')],{windowsHide:true,stdio:['pipe','pipe','pipe']});let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
    const code=await new Promise(resolve=>child.on('close',resolve));assert.notEqual(code,0);assert.doesNotMatch(errors,/WORKFLOW_JOB_DRAINED/);
  });
});
