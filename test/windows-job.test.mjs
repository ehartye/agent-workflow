/** @lane merge
 * @subject foundation/windows-job.mjs
 * @subject foundation/native/JobHost.cs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm,mkdir,readFile,link} from 'node:fs/promises';
import {createHash} from 'node:crypto';
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

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const profileEku='1.3.6.1.4.1.311.97.1234.5678.9012.3456';
async function packaged(t){
 const root=await mkdtemp(join(tmpdir(),'workflow-signed-package-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const nativeRoot=join(root,'native'),folder=join(nativeRoot,'win32-x64');await mkdir(folder,{recursive:true});
 const source='reviewed source\n',binary=Buffer.alloc(256);binary.write('MZ');binary.writeUInt32LE(128,60);binary.write('PE\0\0',128);binary.writeUInt16LE(0x8664,132);
 await writeFile(join(nativeRoot,'JobHost.cs'),source);const executable=join(folder,'workflow-job-host.exe');await writeFile(executable,binary);
 const manifest={version:1,platform:'win32',arch:'x64',sourceSha256:digest(source),binarySha256:digest(binary),profileEku};
 const manifestPath=join(folder,'manifest.json');await writeFile(manifestPath,JSON.stringify(manifest));
 const policy={version:1,profileEku};let checks=0;
 const signatureCheck=async()=>{checks++;return{status:'Valid',signerEkus:['1.3.6.1.5.5.7.3.3',profileEku],timestampEkus:['1.3.6.1.5.5.7.3.8'],timestampPresent:true};};
 const {verifyJobHostPackage}=await import('../foundation/windows-job.mjs');
 assert.equal(typeof verifyJobHostPackage,'function','Packaged helpers need a nonexecuting trust verifier');
 return{nativeRoot,executable,manifest,manifestPath,binary,policy,signatureCheck,checks:()=>checks,verify:overrides=>verifyJobHostPackage({nativeRoot,policy,platform:'win32',arch:'x64',signatureCheck,...overrides})};
}

test('packaged helper refuses absent, changed or wrong-architecture bytes before signature admission',async t=>{
 const f=await packaged(t);
 assert.equal(await f.verify(),f.executable);assert.equal(f.checks(),1);
 await writeFile(f.executable,Buffer.from('tampered'));await assert.rejects(f.verify(),{code:'JOB_PACKAGE'});assert.equal(f.checks(),1);
 await writeFile(f.executable,f.binary);await writeFile(join(f.nativeRoot,'JobHost.cs'),'different source');await assert.rejects(f.verify(),{code:'JOB_PACKAGE'});assert.equal(f.checks(),1);
 await assert.rejects(f.verify({arch:'arm64'}),{code:'JOB_PLATFORM'});
  await writeFile(join(f.nativeRoot,'JobHost.cs'),'reviewed source\n');
  const wrongMachine=Buffer.from(f.binary);wrongMachine.writeUInt16LE(0x14c,132);await writeFile(f.executable,wrongMachine);
  await writeFile(f.manifestPath,JSON.stringify({...f.manifest,binarySha256:digest(wrongMachine)}));
  await assert.rejects(f.verify(),{code:'JOB_PACKAGE'});assert.equal(f.checks(),1);
  await writeFile(f.executable,f.binary);await writeFile(f.manifestPath,JSON.stringify(f.manifest));
  const alias=join(f.nativeRoot,'alias.exe');await link(f.executable,alias);
  await assert.rejects(f.verify(),{code:'JOB_PACKAGE'});assert.equal(f.checks(),1);await rm(alias);
 await rm(f.manifestPath);await assert.rejects(f.verify(),{code:'JOB_PACKAGE'});assert.equal(f.checks(),1);
});

test('packaged helper requires approved profile, valid timestamped code signing and unchanged verified bytes',async t=>{
 const f=await packaged(t);
  await assert.rejects(f.verify({policy:{version:1,profileEku:'1.3.6.1.5.5.7.3.3'}}),{code:'JOB_PACKAGE'});
  await assert.rejects(f.verify({policy:{version:1,get profileEku(){throw new Error('must not invoke a policy accessor');}}}),{code:'JOB_PACKAGE'});
 for(const signature of [{status:'NotSigned'},{status:'UnknownError'},{status:'Valid',signerEkus:['1.3.6.1.5.5.7.3.3'],timestampPresent:true,timestampEkus:['1.3.6.1.5.5.7.3.8']},{status:'Valid',signerEkus:[profileEku],timestampPresent:true,timestampEkus:['1.3.6.1.5.5.7.3.8']},{status:'Valid',signerEkus:['1.3.6.1.5.5.7.3.3',profileEku],timestampPresent:false,timestampEkus:[]}])await assert.rejects(f.verify({signatureCheck:async()=>signature}),{code:'JOB_SIGNATURE'});
 await writeFile(f.manifestPath,JSON.stringify({...f.manifest,profileEku:'1.2.3.4'}));await assert.rejects(f.verify(),{code:'JOB_PACKAGE'});assert.equal(f.checks(),0);
 await writeFile(f.manifestPath,JSON.stringify(f.manifest));
 await assert.rejects(f.verify({signatureCheck:async()=>{await writeFile(f.executable,'changed while verifying');return f.signatureCheck();}}),{code:'JOB_PACKAGE'});
 assert.equal(await readFile(f.executable,'utf8'),'changed while verifying','verification never repairs or replaces bytes');
});

test('packaged helper builtin signature verification rejects unsigned bytes without executing them',{skip:process.platform!=='win32'},async t=>{
  const f=await packaged(t);
  await assert.rejects(f.verify({signatureCheck:undefined}),{code:'JOB_SIGNATURE'});
  assert.deepEqual(await readFile(f.executable),f.binary);
});

test('unavailable signature checker is distinct from returned trust rejection and cannot forward spoofed diagnostics',async t=>{
  const f=await packaged(t);
  for(const code of ['ENOENT','ETIMEDOUT','JOB_SIGNATURE','JOB_SIGNATURE_CHECK','JOB_PACKAGE']){
    await assert.rejects(f.verify({signatureCheck:async()=>{throw Object.assign(new Error('PRIVATE_SIGNATURE_FAILURE'),{code,stdout:'PRIVATE_SIGNATURE_FAILURE',stderr:'PRIVATE_SIGNATURE_FAILURE'});}}),error=>{
      assert.equal(error.code,'JOB_SIGNATURE_CHECK');assert.doesNotMatch(JSON.stringify(error)+error.message,/PRIVATE_SIGNATURE_FAILURE/);return true;
    });
  }
  await assert.rejects(f.verify({signatureCheck:async()=>({status:'NotTrusted'})}),{code:'JOB_SIGNATURE'});
  assert.deepEqual(await readFile(f.executable),f.binary);
});

test('missing vendor signature command reports verifier failure through a real child without executing the artifact',{skip:!windows},async t=>{
  const f=await packaged(t);
  const moduleUrl=new URL('../foundation/windows-job.mjs',import.meta.url).href;
  const script=`import {verifyJobHostPackage} from ${JSON.stringify(moduleUrl)};process.env.SystemRoot=process.argv[2];try{await verifyJobHostPackage(JSON.parse(process.argv[1]));process.exitCode=1;}catch(error){console.log(JSON.stringify({code:error.code,message:error.message}));}`;
  const {stdout,stderr}=await promisify(execFile)(process.execPath,['--input-type=module','-e',script,JSON.stringify({nativeRoot:f.nativeRoot,policy:f.policy}),join(f.nativeRoot,'missing-windows')],{env:{...process.env,PSModulePath:'PRIVATE_MODULE_PATH'},windowsHide:true,timeout:5000,maxBuffer:2048});
  assert.equal(stderr,'');const result=JSON.parse(stdout);assert.equal(result.code,'JOB_SIGNATURE_CHECK');assert.doesNotMatch(stdout,/PRIVATE_MODULE_PATH|missing-windows/);
  assert.deepEqual(await readFile(f.executable),f.binary);
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
