// @lane merge @subject engine/command-jobs/owner.mjs @subject engine/stage-checkpoints.mjs @subject test/fixtures/command-job-child.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile,lstat,realpath,link} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {prepare,launchFixture,waitFixture,settleFixtures,fixtureEnvironment} from './fixtures/command-job-child.mjs';
import {openStore,jobDirectory,validateReceipt} from '../engine/command-jobs/store.mjs';
import {createOutput,verifyOutput,outputPage} from '../engine/command-jobs/output.mjs';
import {hash,canonical,sha,fileIdentity,validateRequest,terminal,plain,directoryIdentity} from '../engine/command-jobs/contract.mjs';
import * as api from '../engine/command-jobs/index.mjs';
import {admission,verifyCheckBinding} from '../engine/command-jobs/context.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const resources=new WeakMap();
async function removeTemporary(directory){
  const target=resolve(directory),part=relative(root,target);
  assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&part.startsWith('.command-jobs-test-'));
  assert.equal(await realpath(target),target);
  await rm(target,{recursive:true,force:true}); // One attempt; preserve any failure.
}
async function temporary(t){
  if(!resources.has(t)){
    const owned={directories:[],stores:[]};resources.set(t,owned);
    t.after(async()=>{
      // A terminal job receipt alone is insufficient: the owner must exit and
      // every parent SQLite handle must close before the first tree removal.
      for(const directory of owned.directories)await settleFixtures(directory);
      for(const store of owned.stores)store.close();
      for(const directory of owned.directories)await removeTemporary(directory);
    });
  }
  const p=await mkdtemp(join(root,'.command-jobs-test-'));resources.get(t).directories.push(p);return p;
}
const closeAtEnd=(t,store)=>resources.get(t).stores.push(store);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function observe(directory,jobId,predicate){const s=await openStore({runDir:join(directory,'run'),dataDir:directory});try{const end=Date.now()+10000;for(;;){const r=s.read(jobId).receipt;if(predicate(r))return r;if(Date.now()>end)throw Error('Observation deadline');await pause(20);}}finally{s.close();}}
test('fixture seeding never persists unrelated inherited environment values',async t=>{
  const directory=await mkdtemp(join(root,'.command-jobs-test-'));
  // The synchronous seed process exits with its SQLite connection closed before
  // this first and only removal. The sentinel is synthetic, never a credential.
  t.after(()=>removeTemporary(directory));
  const sentinel='NONSECRET_FIXTURE_ENV_'+randomUUID(),env={
    PATH:sentinel,TEMP:directory,TMP:directory,COMMAND_JOB_UNRELATED_SECRET:sentinel,
    ...(process.env.AGENT_WORKFLOW_WORKER===undefined?{}:{AGENT_WORKFLOW_WORKER:process.env.AGENT_WORKFLOW_WORKER})
  };
  const original=new URL('./fixtures/command-job-child.mjs',import.meta.url);let seed=fileURLToPath(original);
  if(process.env.COMMAND_JOBS_BROKEN_ENV_CONTROL==='1'){
    // Deliberate broken behavior lives only in this disposable fixture copy.
    const body=await readFile(original,'utf8'),anchor='const env=fixtureEnvironment(directory);';
    assert.equal(body.split(anchor).length,2);
    const broken=body.replace(anchor,"const env={...process.env,COMMAND_JOB_MARKER:'inherited 雪'};")
      .replace(/from '(\.\.?\/[^']+)'/g,(_,specifier)=>'from '+JSON.stringify(new URL(specifier,original).href));
    seed=join(directory,'broken-environment-fixture.mjs');await writeFile(seed,broken,{flag:'wx'});
  }
  const seeded=spawnSync(process.execPath,[seed,'seed',directory],{env,encoding:'utf8',windowsHide:true});
  assert.equal(seeded.status,0,seeded.stderr);
  const db=new DatabaseSync(join(directory,'run','command-jobs-v1','jobs.sqlite'),{readOnly:true});
  try{
    const rows=db.prepare('SELECT private FROM jobs').all();assert.equal(rows.length,1);
    assert.equal(rows.some(row=>row.private.includes(sentinel)),false,'fixture ledger retained unrelated inherited environment bytes');
  }finally{db.close();}
});

test('deadline schema preserves both boundaries and the qualified range above twenty seconds',()=>{
  const request={schemaVersion:1,requestId:randomUUID(),command:[process.execPath],cwd:root,environment:{mode:'inherit'},kind:'normal',verification:null};
  for(const deadlineMs of [1,20000,20001,86400000])assert.equal(validateRequest({...request,deadlineMs}).deadlineMs,deadlineMs);
  for(const deadlineMs of [0,86400001,1.5])assert.throws(()=>validateRequest({...request,deadlineMs}),{code:'JOB_INPUT'});
});

test('native worker refusal remains distinct from deadline qualification',async t=>{
  if(process.env.AGENT_WORKFLOW_WORKER!=='1'){t.skip('Requires a native worker identity; it must never be fabricated for a positive admission');return;}
  const directory=await temporary(t),request={schemaVersion:1,requestId:randomUUID(),command:[process.execPath],cwd:directory,environment:{mode:'inherit'},kind:'normal',verification:null};
  for(const deadlineMs of [1,20000,20001,86400000])await assert.rejects(api.startCommandJob({dataDir:directory,runId:randomUUID(),sessionId:'owned-fixture',request:{...request,deadlineMs}}),{code:'JOB_WORKER'});
});

test('public coordinator range reaches ownership admission on an owned disposable target',async t=>{
  if(process.env.AGENT_WORKFLOW_WORKER==='1'){t.skip('JOB_WORKER prevents positive public admission in this actual worker; coordinator must run this check');return;}
  const directory=await temporary(t),request={schemaVersion:1,requestId:randomUUID(),command:[process.execPath],cwd:directory,environment:{mode:'inherit'},kind:'normal',verification:null};
  // No runtime/run binding exists here. Accepted range values must reach the
  // ownership boundary, without executing a command or touching any saved run.
  for(const deadlineMs of [1,20000,20001,86400000])await assert.rejects(api.startCommandJob({dataDir:directory,runId:randomUUID(),sessionId:'owned-fixture',request:{...request,deadlineMs}}),{code:'JOB_OWNERSHIP'});
  for(const deadlineMs of [0,86400001])await assert.rejects(api.startCommandJob({dataDir:directory,runId:randomUUID(),sessionId:'owned-fixture',request:{...request,deadlineMs}}),{code:'JOB_INPUT'});
});
test('teardown waits for the detached owner and closes SQLite before its first removal',async t=>{
  let directory,store,jobId;
  await t.test('finish the test body while the owned command is still pending',async child=>{
    directory=await temporary(child);const p=await prepare(directory);store=p.store;closeAtEnd(child,store);
    ({jobId}=await launchFixture(directory,{delay:300}));
    assert.equal(terminal(store.read(jobId).receipt.state),false);
  });
  await settleFixtures(directory);
  assert.throws(()=>store.read(jobId),/closed|not open/i);
  await assert.rejects(lstat(directory),{code:'ENOENT'});
});
test('a detached command receipt survives the initiating process and preserves both streams', async t=>{
  const directory=await mkdtemp(join(root,'.command-jobs-test-'));
  t.after(()=>removeTemporary(directory));
  const launched=spawnSync(process.execPath,[fileURLToPath(new URL('./fixtures/command-job-child.mjs',import.meta.url)),'reconnect',directory],{env:fixtureEnvironment(directory),encoding:'utf8',windowsHide:true});
  assert.equal(launched.status,0,'the durable command owner must retain its receipt after the initiating process exits: '+launched.stderr);
  const receipt=JSON.parse(launched.stdout);
  assert.equal(receipt.execution.exitCode,7);
  assert.equal(receipt.stdout,'hello 雪');
  assert.equal(receipt.stderr,'error stream');
  assert.equal(receipt.dispatchCount,1);
});

test('exact argv, Unicode, empty arguments, cwd and inherited marker survive shell-free dispatch',async t=>{
  const directory=await temporary(t),{jobId}=await launchFixture(directory,{commandMode:'identity',exitCode:0}),r=await waitFixture(directory,jobId);
  assert.equal(r.state,'succeeded');const output=await verifyOutput(r,jobDirectory(join(directory,'run'),jobId));
  assert.deepEqual(JSON.parse(await readFile(output.stdout.path,'utf8')),{argv:['space value','','雪','"literal"'],cwd:directory,marker:'inherited 雪'});
  assert.equal(r.execution.exitCode,0);assert.equal(r.cleanup.jobHost.receipt,'drained');
});
test('idempotency compares the full invocation and never reserves a second owner',async t=>{
  const p=await prepare(await temporary(t));closeAtEnd(t,p.store);const first=p.item.receipt;
  const again=p.store.admit(p);assert.equal(again.created,false);assert.equal(again.receipt.jobId,first.jobId);
  p.store.reserve(first.jobId);assert.throws(()=>p.store.reserve(first.jobId),{code:'JOB_OWNER'});
  assert.throws(()=>p.store.admit({...p,invocation:{...p.invocation,hash:'a'.repeat(64)}}),{code:'JOB_CONFLICT'});
});
test('two SQLite connections preserve an uncertain heavy lease and refuse PID adoption',async t=>{
  const directory=await temporary(t),a=await prepare(directory,{kind:'heavy'});closeAtEnd(t,a.store);
  const nonce=a.store.reserve(a.item.receipt.jobId);a.store.claim(a.item.receipt.jobId,nonce,{pid:123,startedAt:new Date().toISOString()});assert.equal(a.store.acquire(a.item.receipt.jobId,nonce),true);
  const b=await prepare(directory,{kind:'heavy'});closeAtEnd(t,b.store);const nonceB=b.store.reserve(b.item.receipt.jobId);b.store.claim(b.item.receipt.jobId,nonceB,{pid:456,startedAt:new Date().toISOString()});
  assert.equal(b.store.acquire(b.item.receipt.jobId,nonceB),false);
  assert.throws(()=>a.store.claim(a.item.receipt.jobId,nonce,{pid:789,startedAt:new Date().toISOString()}),{code:'JOB_OWNER'});
  a.store.update(a.item.receipt.jobId,nonce,r=>{r.state='unknown';r.execution.outcome='unknown';});assert.throws(()=>a.store.release(a.item.receipt.jobId,nonce),{code:'JOB_DRAIN'});
  assert.equal(b.store.acquire(b.item.receipt.jobId,nonceB),false);
});
test('independent detached owners serialize heavy commands in the same data instance',async t=>{
  const directory=await temporary(t),a=await launchFixture(directory,{kind:'heavy',delay:600}),b=await launchFixture(directory,{kind:'heavy',delay:50});
  const [first,second]=await Promise.all([waitFixture(directory,a.jobId),waitFixture(directory,b.jobId)]);
  assert.equal(first.state,'failed');assert.equal(second.state,'failed');
  assert.ok(Date.parse(second.timing.dispatchIntentAt)>=Date.parse(first.timing.endedAt));
  assert.equal((await readFile(join(directory,'dispatches.log'),'utf8')).trim().split('\n').length,2);
});
test('malformed protocol output preserves an unknown outcome even after positive fixture drain',async t=>{
  const directory=await temporary(t),{jobId}=await launchFixture(directory,{kind:'heavy',commandMode:'bad-frame'}),r=await waitFixture(directory,jobId);
  assert.equal(r.state,'unknown');assert.equal(r.execution.outcome,'unknown');assert.equal(r.output.stdout.coverage,'unknown');
  const db=new DatabaseSync(join(directory,'command-jobs-v1','admission.sqlite'),{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) AS n FROM heavy').get().n,1);}finally{db.close();}
});
test('transport loss preserves an already observed command start while keeping effects unknown',async t=>{
  const directory=await temporary(t),{jobId}=await launchFixture(directory,{kind:'heavy',commandMode:'loss-after-output'}),r=await waitFixture(directory,jobId);
  assert.equal(r.state,'unknown');assert.equal(r.execution.start,'observed');assert.equal(r.execution.outcome,'unknown');assert.equal(r.output.stdout.coverage,'unknown');
});
test('byte pages preserve split UTF-8 bytes and reject cursors into dropped output',async t=>{
  const directory=join(await temporary(t),'output'),output=await createOutput(directory,5),id='command-page';
  output.append({processId:id,stream:'stdout',deltaBase64:Buffer.from('雪abc').toString('base64'),capReached:true},id);
  const r={jobId:randomUUID(),output:output.finish()},one=await outputPage(r,directory,{stream:'stdout',limitBytes:1}),two=await outputPage(r,directory,{stream:'stdout',after:one.nextCursor,limitBytes:4});
  assert.equal(one.hasMore,true);assert.equal(two.hasMore,false);assert.equal(two.nextCursor,5);assert.equal(two.truncated,true);
  assert.deepEqual(Buffer.concat([Buffer.from(one.dataBase64,'base64'),Buffer.from(two.dataBase64,'base64')]),Buffer.from('雪ab'));
  await assert.rejects(outputPage(r,directory,{stream:'stdout',after:6}),{code:'JOB_OUTPUT'});await assert.rejects(outputPage(r,directory,{stream:'stdout',limitBytes:65537}));
});
test('live output reads authenticate the published prefix while the owner has appended newer bytes',async t=>{
  const directory=join(await temporary(t),'output'),output=await createOutput(directory,128),id='command-published-prefix';
  const append=(stream,text)=>output.append({processId:id,stream,deltaBase64:Buffer.from(text).toString('base64')},id);
  try{
    const empty={jobId:randomUUID(),state:'running',output:output.snapshot()};
    append('stdout','saved 雪');append('stderr','saved error');
    const published={jobId:empty.jobId,state:'running',output:output.snapshot()};
    // This is the real owner ordering: spool append/fsync precedes SQLite
    // publication. No concurrent scheduler timing or mock read is required.
    append('stdout',' newer');append('stderr',' newer');
    for(const [receipt,text] of [[empty,''],[published,'saved 雪']]){
      const verified=await verifyOutput(receipt,directory,{index:false,live:true});
      assert.equal(verified.stdout.bytes,Buffer.byteLength(text));
      const page=await outputPage(receipt,directory,{stream:'stdout',limitBytes:128});
      assert.equal(Buffer.from(page.dataBase64,'base64').toString(),text);
      assert.equal(page.nextCursor,Buffer.byteLength(text));assert.equal(page.hasMore,false);
    }
    const error=await outputPage(published,directory,{stream:'stderr',after:6,limitBytes:128});
    assert.equal(Buffer.from(error.dataBase64,'base64').toString(),'error');
    const split=await outputPage(published,directory,{stream:'stdout',after:6,limitBytes:1});
    assert.deepEqual(Buffer.from(split.dataBase64,'base64'),Buffer.from('雪').subarray(0,1));
    await assert.rejects(outputPage(published,directory,{stream:'stdout',after:published.output.stdout.retainedBytes+1}),{code:'JOB_OUTPUT'});
    // A valid appended suffix never excuses a changed already-published byte.
    await writeFile(published.output.stdout.path,'Xaved 雪 newer');
    await assert.rejects(verifyOutput(published,directory,{index:false,live:true}),{code:'JOB_OUTPUT'});
    await assert.rejects(outputPage(published,directory,{stream:'stdout'}),{code:'JOB_OUTPUT'});
    await writeFile(published.output.stdout.path,'short');
    await assert.rejects(verifyOutput(published,directory,{index:false,live:true}),{code:'JOB_OUTPUT'});
    await assert.rejects(outputPage(published,directory,{stream:'stdout'}),{code:'JOB_OUTPUT'});
    await writeFile(published.output.stdout.path,'saved 雪 newer');
    const alias=join(directory,'alias.bin');await link(published.output.stdout.path,alias);
    for(const read of [()=>verifyOutput(published,directory,{index:false,live:true}),()=>outputPage(published,directory,{stream:'stdout'})])await assert.rejects(read(),{code:'JOB_PATH'});
    await rm(alias);
  }finally{output.finish();}
});
test('queued cancellation is revision-bound, durable, and does not dispatch',async t=>{
  const p=await prepare(await temporary(t));closeAtEnd(t,p.store);p.store.reserve(p.item.receipt.jobId);
  const before=p.store.read(p.item.receipt.jobId).receipt,id=randomUUID(),cancelled=p.store.cancel(before.jobId,id,before.revision);
  assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.execution.start,'notStarted');assert.deepEqual(p.store.cancel(before.jobId,id,before.revision),cancelled);
  assert.throws(()=>p.store.cancel(before.jobId,randomUUID(),before.revision),{code:'JOB_CONFLICT'});
});
test('running cancellation sends terminate once and requires a terminal result and drain',async t=>{
  const directory=await temporary(t),{jobId}=await launchFixture(directory,{commandMode:'hang'});
  await observe(directory,jobId,r=>r.execution.start==='observed');const store=await openStore({runDir:join(directory,'run'),dataDir:directory,write:true});
  try{const r=store.read(jobId).receipt;store.cancel(jobId,randomUUID(),r.revision);}finally{store.close();}
  const r=await waitFixture(directory,jobId);assert.equal(r.state,'cancelled');assert.equal(r.cancellation.status,'confirmed');assert.equal(r.cleanup.jobEmpty,true);
  assert.equal((await readFile(join(directory,'terminates.log'),'utf8')).trim(),'terminate');
});
test('deadline includes queue time and an expired queue never dispatches',async t=>{
  const p=await prepare(await temporary(t),{deadlineMs:1});closeAtEnd(t,p.store);const nonce=p.store.reserve(p.item.receipt.jobId);p.store.claim(p.item.receipt.jobId,nonce,{pid:1,startedAt:new Date().toISOString()});
  await pause(5);assert.equal(p.store.acquire(p.item.receipt.jobId,nonce),false);const r=p.store.read(p.item.receipt.jobId).receipt;
  assert.equal(r.state,'deadline');assert.equal(r.execution.start,'notStarted');assert.equal(Date.parse(r.timing.deadlineAt)-Date.parse(r.timing.admittedAt),1);
});
test('public read reports overdue owner loss before dispatch without adoption or redispatch',async t=>{
  const child=fileURLToPath(new URL('./fixtures/command-job-child.mjs',import.meta.url)),entry=new URL('../engine/command-jobs/index.mjs',import.meta.url).href;
  for(const phase of ['admitted','reserved','claimed'])await t.test(phase,async t=>{
    const directory=await temporary(t),seed=spawnSync(process.execPath,[child,'public-read-seed',directory,phase],{env:fixtureEnvironment(directory),encoding:'utf8',windowsHide:true});
    assert.equal(seed.status,0,seed.stderr);const fixture=JSON.parse(seed.stdout),store=await openStore({runDir:join(directory,'run'),dataDir:directory});closeAtEnd(t,store);
    const before=store.read(fixture.jobId),readAt=milliseconds=>{
      const code=`const api=await import(${JSON.stringify(entry)});console.log(JSON.stringify(await api.readCommandJob(JSON.parse(process.argv[1]))));`;
      const result=spawnSync(process.execPath,['--import',pathToFileURL(fixture.hook).href,'--input-type=module','-e',code,JSON.stringify({dataDir:directory,runId:fixture.runId,sessionId:'fixture',jobId:fixture.jobId})],{env:{...fixtureEnvironment(directory),COMMAND_JOB_READ_AT:String(milliseconds)},encoding:'utf8',windowsHide:true,timeout:10000});
      assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
    };
    assert.equal(before.receipt.timing.dispatchIntentAt,null);
    assert.equal(readAt(Date.parse(fixture.deadlineAt)+30000).state,before.receipt.state,'The existing terminal-observation grace boundary is unchanged');
    const overdue=readAt(Date.parse(fixture.deadlineAt)+30001);
    assert.equal(overdue.state,'unknown');assert.equal(overdue.execution.outcome,'unknown');assert.equal(overdue.error.code,'JOB_OWNER_UNOBSERVED');assert.equal(overdue.cleanup,null);
    assert.deepEqual(store.read(fixture.jobId),before,'Read projection must not claim an owner, release a lease or rewrite recorded evidence');
    await assert.rejects(readFile(join(directory,'dispatches.log')),{code:'ENOENT'});
  });
});
test('public live job and output APIs read one committed receipt without exposing an unpublished suffix',async t=>{
  const directory=await temporary(t),child=fileURLToPath(new URL('./fixtures/command-job-child.mjs',import.meta.url));
  const seeded=spawnSync(process.execPath,[child,'public-read-seed',directory,'output'],{env:fixtureEnvironment(directory),encoding:'utf8',windowsHide:true});
  assert.equal(seeded.status,0,seeded.stderr);const fixture=JSON.parse(seeded.stdout);
  const options={dataDir:directory,runId:fixture.runId,sessionId:'fixture',jobId:fixture.jobId};
  const source=`const api=await import(${JSON.stringify(new URL('../engine/command-jobs/index.mjs',import.meta.url).href)});const options=JSON.parse(process.argv[1]);console.log(JSON.stringify({receipt:await api.readCommandJob(options),page:await api.readCommandJobOutput({...options,stream:'stdout',after:0})}));`;
  const observed=spawnSync(process.execPath,['--import',pathToFileURL(fixture.hook).href,'--input-type=module','-e',source,JSON.stringify(options)],{env:{...fixtureEnvironment(directory),COMMAND_JOB_READ_AT:String(Date.parse(fixture.deadlineAt)-1)},encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(observed.status,0,observed.stderr);const {receipt,page}=JSON.parse(observed.stdout);
  assert.equal(receipt.state,'running');assert.equal(receipt.output.stdout.retainedBytes,Buffer.byteLength('saved 雪'));
  assert.equal(Buffer.from(page.dataBase64,'base64').toString(),'saved 雪');
  assert.equal(page.nextCursor,receipt.output.stdout.retainedBytes);assert.equal(page.hasMore,false);
  const store=await openStore({runDir:join(directory,'run'),dataDir:directory});
  try{assert.equal(hash(store.read(fixture.jobId).receipt),hash(receipt));}finally{store.close();}
  await assert.rejects(readFile(join(directory,'dispatches.log')),{code:'ENOENT'});
});
test('a running deadline settles with retained startup output and positive fixture drain',async t=>{
  const directory=await temporary(t),{jobId}=await launchFixture(directory,{commandMode:'hang',deadlineMs:500});const r=await waitFixture(directory,jobId);
  assert.equal(r.state,'deadline');assert.equal(r.execution.start,'observed');assert.equal(r.cleanup.jobEmpty,true);assert.notEqual(r.execution.exitCode,0);
});
test('combined output cap retains bounded bytes while the child continues and drains',async t=>{
  const directory=await temporary(t),{jobId}=await launchFixture(directory,{commandMode:'flood',exitCode:0,outputLimitBytes:101}),r=await waitFixture(directory,jobId);
  assert.equal(r.state,'succeeded');assert.equal(r.output.stdout.retainedBytes+r.output.stderr.retainedBytes,101);
  assert.equal(r.output.stdout.receivedBytes+r.output.stderr.receivedBytes,2097152);assert.equal(await readFile(join(directory,'continued.txt'),'utf8'),'continued');
  await verifyOutput(r,jobDirectory(join(directory,'run'),jobId));
  assert.ok(r.output.stdout.droppedBytes+r.output.stderr.droppedBytes>0);
});
test('invalid output frames, corrupt spools, and absent signed drain cannot establish success',async t=>{
  const directory=join(await temporary(t),'output'),output=await createOutput(directory,64),id='command-test';
  assert.throws(()=>output.append({processId:id,stream:'stdout',deltaBase64:'YQ'},id),{code:'JOB_OUTPUT'});
  assert.throws(()=>output.append({processId:'other',stream:'stdout',deltaBase64:'YQ=='},id),{code:'JOB_OUTPUT'});
  output.append({processId:id,stream:'stderr',deltaBase64:Buffer.from('雪').toString('base64')},id);
  const p=await prepare(await temporary(t));closeAtEnd(t,p.store);const r=p.item.receipt;r.output=output.finish();
  await verifyOutput(r,directory);
  await writeFile(r.output.stderr.path,'雪extra');
  await assert.rejects(verifyOutput(r,directory,{live:true}),{code:'JOB_OUTPUT'});
  await assert.rejects(outputPage(r,directory,{stream:'stderr'}),{code:'JOB_OUTPUT'});
  await writeFile(r.output.stderr.path,'tamper');await assert.rejects(verifyOutput(r,directory),{code:'JOB_OUTPUT'});
  r.state='succeeded';r.execution={start:'observed',processId:id,exitCode:0,outcome:'passed'};assert.throws(()=>validateReceipt(r),{code:'JOB_INTEGRITY'});
});
test('store corruption is refused on reopen rather than projected as a receipt',async t=>{
  const directory=await temporary(t),p=await prepare(directory),id=p.item.receipt.jobId;p.store.close();
  const db=new DatabaseSync(join(p.runDir,'command-jobs-v1','jobs.sqlite'));db.prepare('UPDATE jobs SET receiptHash=? WHERE id=?').run('0'.repeat(64),id);db.close();
  const s=await openStore({runDir:p.runDir,dataDir:directory});try{assert.throws(()=>s.read(id),{code:'JOB_INTEGRITY'});}finally{s.close();}
});
test('request schema rejects widening, unsafe bounds, accessors, and preserves shared argv mapping',()=>{
  const request={schemaVersion:1,requestId:randomUUID(),command:['C:/fixture/node.exe','-e','process.stdout.write(process.argv[1])','space value',''],cwd:root,environment:{mode:'inherit'},deadlineMs:1000,kind:'normal',verification:null};
  assert.deepEqual(Array.from(validateRequest(request).command.slice(1)),['-e','process.stdout.write(process.argv[1])','space value','']);
  for(const mutation of [{...request,passed:true},{...request,deadlineMs:86400001},{...request,environment:{mode:'inherit',secret:'value'}},{...request,command:['relative.exe']}])assert.throws(()=>validateRequest(mutation));
  const accessor={...request};Object.defineProperty(accessor,'command',{enumerable:true,get(){throw Error('must not invoke');}});assert.throws(()=>validateRequest(accessor),{code:'JOB_INPUT'});
  assert.equal(sha(canonical({})),'44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
  assert.equal(sha(canonical([])),'4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945');
  const vector={baseCommit:'1'.repeat(40),canonicalRoot:'C:/fixture/integration',contentSha256:'9b399cb030c95d1243a3995f58528927a9dfa29c3aee063ce317af1e2468c46c',dependencies:[],exclusions:{entries:[],sha256:'4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'},files:[],root:'C:/fixture/integration',rootIdentity:{dev:'1',ino:'2'},schemaVersion:1};
  assert.equal(hash(vector),'3994966a3819deb76d178aa3da97db9bfba8042d8701eb3385d76f2aadc8b682');
});
test('verification commands cannot substitute caller evidence for an absent checkpoint provider',async t=>{
  // This isolated baseline deliberately lacks the provider owned by acceptance.
  try{await lstat(new URL('../engine/stage-checkpoints.mjs',import.meta.url));t.skip('The integrated provider requires its own actual checkpoint/recorded-job checks');return;}catch(e){if(e.code!=='ENOENT')throw e;}
  await assert.rejects(verifyCheckBinding({dataDir:root,run:{runId:randomUUID()}},{verification:{checkpointId:randomUUID(),checkId:'fixture',snapshot:{}}},{}),{code:'JOB_CHECK_PROVIDER_MISSING'});
});
test('public mutation APIs refuse native workers before touching run storage',async()=>{
  const source=`import{startCommandJob,cancelCommandJob}from ${JSON.stringify(new URL('../engine/command-jobs/index.mjs',import.meta.url).href)};for(const fn of[startCommandJob,cancelCommandJob]){try{await fn({});process.exitCode=1;}catch(e){if(e.code!=='JOB_WORKER')throw e;}}`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',source],{env:{...fixtureEnvironment(root),AGENT_WORKFLOW_WORKER:'1'},windowsHide:true,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  assert.deepEqual(Object.keys(api).sort(),['cancelCommandJob','readCommandJob','readCommandJobOutput','startCommandJob','verifyIntegrationSnapshot'].sort());
});

async function snapshot(rootPath,files,exclusions=[],dependencies=[]){
  const rootIdentity=await lstat(rootPath,{bigint:true}),record={schemaVersion:1,root:rootPath,canonicalRoot:await realpath(rootPath),rootIdentity:{dev:String(rootIdentity.dev),ino:String(rootIdentity.ino)},baseCommit:'1'.repeat(40),files,exclusions:{entries:exclusions,sha256:hash(exclusions)},dependencies};
  record.contentSha256=hash({baseCommit:record.baseCommit,files,dependencies:dependencies.map(({id,kind,sha256,bytes})=>({id,kind,sha256,bytes}))});record.manifestSha256=hash(record);return record;
}
test('snapshot rechecks complete files, exact exclusions, dependencies and both hash preimages',async t=>{
  const directory=await temporary(t),source=join(directory,'source');await mkdir(source);await writeFile(join(source,'a.txt'),'source');await writeFile(join(directory,'dependency.bin'),'dep');
  const file={path:'a.txt',...await fileIdentity(join(source,'a.txt'))},depIdentity=await fileIdentity(join(directory,'dependency.bin')),dependency={id:'node-fixture',kind:'file',path:await realpath(join(directory,'dependency.bin')),sha256:depIdentity.sha256,bytes:depIdentity.bytes};
  const s=await snapshot(source,[file],[],[dependency]);assert.deepEqual(JSON.parse(JSON.stringify(await api.verifyIntegrationSnapshot(s))),s);
  await writeFile(join(source,'extra.txt'),'drift');await assert.rejects(api.verifyIntegrationSnapshot(s),{code:'JOB_SNAPSHOT'});
  await rm(join(source,'extra.txt'));await writeFile(join(directory,'dependency.bin'),'changed');await assert.rejects(api.verifyIntegrationSnapshot(s),{code:'JOB_SNAPSHOT'});
});
test('an excluded node_modules tree without explicit dependency identity blocks a frozen check',async t=>{
  const directory=await temporary(t);await mkdir(join(directory,'node_modules'));await writeFile(join(directory,'node_modules','module.js'),'module');
  const exclusions=[];for(const path of ['node_modules','node_modules/module.js']){const s=await lstat(join(directory,...path.split('/')));exclusions.push({path,kind:s.isDirectory()?'directory':'file',bytes:s.isFile()?s.size:null,mtimeMs:s.mtimeMs,mode:s.mode});}
  const s=await snapshot(directory,[],exclusions);await assert.rejects(api.verifyIntegrationSnapshot(s),{code:'JOB_SNAPSHOT'});
});

test('original command arrays reject trailing holes, subclasses and descriptors without callbacks',async t=>{
  const request={schemaVersion:1,requestId:randomUUID(),command:[process.execPath,'','雪'],cwd:root,environment:{mode:'inherit'},deadlineMs:1000,kind:'normal',verification:null};
  let callbacks=0;
  class CommandArray extends Array {toJSON(){callbacks++;return [process.execPath];}}
  const trailing=[process.execPath];trailing.length=2;
  const sparse=[process.execPath,, 'literal'];
  const named=[process.execPath];named.extra='hidden';
  const accessor=[process.execPath];Object.defineProperty(accessor,'1',{enumerable:true,get(){callbacks++;return 'hidden';}});
  const subclass=new CommandArray(process.execPath);
  const proxy=new Proxy([process.execPath],{get(){callbacks++;throw Error('callback');},ownKeys(){callbacks++;throw Error('callback');}});
  for(const [name,command] of Object.entries({trailing,sparse,named,accessor,subclass,proxy}))await t.test(name,()=>{
    assert.throws(()=>validateRequest({...request,command}),{code:'JOB_INPUT'});
    assert.equal(callbacks,0);
  });
  assert.deepEqual(Array.from(validateRequest(request).command),request.command);
});

test('request and options byte envelopes reject one over before normalization can erase evidence',()=>{
  const request={schemaVersion:1,requestId:randomUUID(),command:[process.execPath],cwd:root,environment:{mode:'inherit'},deadlineMs:1000,outputLimitBytes:1048576,kind:'normal',verification:{checkpointId:randomUUID(),checkId:'envelope-shape-only',snapshot:''}};
  // The boundary payload exercises only the request envelope, never a positive
  // snapshot/check receipt. The filesystem-backed snapshot below covers validity.
  request.verification.snapshot='x'.repeat(2097152-Buffer.byteLength(JSON.stringify(request)));
  assert.equal(Buffer.byteLength(JSON.stringify(request)),2097152);
  assert.doesNotThrow(()=>validateRequest(request));
  assert.throws(()=>validateRequest({...request,verification:{...request.verification,snapshot:request.verification.snapshot+'x'}}),{code:'JOB_LIMIT'});
  const options={dataDir:root,runId:randomUUID(),sessionId:'fixture',request};
  assert.doesNotThrow(()=>plain(options,2162688));
  const boundary={payload:''};boundary.payload='x'.repeat(2162688-Buffer.byteLength(JSON.stringify(boundary)));
  assert.doesNotThrow(()=>plain(boundary,2162688));
  assert.throws(()=>plain({...boundary,payload:boundary.payload+'x'},2162688),{code:'JOB_LIMIT'});
});

test('public read enforces the exact options envelope before ownership validation without dispatch',async()=>{
  const options={dataDir:root,runId:randomUUID(),sessionId:'',jobId:randomUUID()};
  options.sessionId='x'.repeat(2162688-Buffer.byteLength(JSON.stringify(options)));
  assert.equal(Buffer.byteLength(JSON.stringify(options)),2162688);
  // Deliberately invalid session length: an in-envelope wrapper must reach the
  // ownership validator, which refuses before accessing any run or starting work.
  await assert.rejects(api.readCommandJob(options),{code:'JOB_OWNERSHIP'});
  await assert.rejects(api.readCommandJob({...options,sessionId:options.sessionId+'x'}),{code:'JOB_LIMIT'});
});

test('private ledger byte envelope is exact and refusal preserves its admitted records',async t=>{
  const p=await prepare(await temporary(t));closeAtEnd(t,p.store);
  // This fixture-only launch vector is never executed or offered as policy
  // evidence; production owner rechecks still require the exact saved launch.
  const privateRecord={...p.privateRecord,launch:{...p.privateRecord.launch,args:['']}};
  privateRecord.launch.args[0]='x'.repeat(4194304-Buffer.byteLength(JSON.stringify(privateRecord)));
  assert.equal(Buffer.byteLength(JSON.stringify(privateRecord)),4194304);
  // prepare already admitted the request. Use a distinct full invocation so the
  // boundary tests exercise new persistence rather than an idempotent read.
  const request={...p.request,requestId:randomUUID()};privateRecord.request=request;
  const i=p.invocation,invocation={...i,hash:hash({request,executableSha256:i.executableSha256,canonicalCwd:i.canonicalCwd,environmentHash:i.environmentHash,policyHash:i.policyHash,runtime:i.runtime})};
  const item=p.store.admit({...p,request,invocation,privateRecord});
  assert.equal(p.store.read(item.receipt.jobId).owner,null);
  assert.throws(()=>p.store.admit({...p,request:{...request,requestId:randomUUID()},invocation,privateRecord:{...privateRecord,launch:{...privateRecord.launch,args:[privateRecord.launch.args[0]+'x']}}}),{code:'JOB_LIMIT'});
  assert.equal(p.store.read(item.receipt.jobId).receipt.execution.start,'notStarted');
});

test('a real near-limit nonempty snapshot persists with bounded private environment and two expanded snapshots',async t=>{
  const directory=await temporary(t),source=join(directory,'source');await mkdir(source);
  const files=Array.from({length:3400},(_,i)=>({path:String(i).padStart(4,'0')+'-'+ 'n'.repeat(210)+'.txt',sha256:sha(''),bytes:0,mode:100644}));
  let s=await snapshot(source,files);
  while(Buffer.byteLength(JSON.stringify(s))>1044000){files.pop();s=await snapshot(source,files);}
  for(let i=0;i<files.length;i+=32)await Promise.all(files.slice(i,i+32).map(f=>writeFile(join(source,f.path),'',{flag:'wx'})));
  assert.ok(Buffer.byteLength(JSON.stringify(s))>1000000);
  assert.deepEqual(JSON.parse(JSON.stringify(await api.verifyIntegrationSnapshot(s))),s);
  const p=await prepare(directory);closeAtEnd(t,p.store);
  const request={...p.request,requestId:randomUUID(),cwd:source,command:[process.execPath,'x'.repeat(60000)],verification:{checkpointId:randomUUID(),checkId:'large-fixture',snapshot:s}};
  assert.ok(Buffer.byteLength(JSON.stringify(request))>131072);
  assert.doesNotThrow(()=>validateRequest(request));
  const env={MARKER:''};env.MARKER='x'.repeat(1048576-Buffer.byteLength(JSON.stringify(env)));
  const cwdIdentity=await directoryIdentity(source),environmentHash=hash(env),invocation={...p.invocation,command:request.command,cwd:source,canonicalCwd:cwdIdentity.canonical,environmentHash};
  invocation.hash=hash({request,executableSha256:invocation.executableSha256,canonicalCwd:cwdIdentity.canonical,environmentHash,policyHash:invocation.policyHash,runtime:invocation.runtime});
  const privateRecord={...p.privateRecord,request,cwdIdentity,launch:{...p.privateRecord.launch,cwd:source,env}};
  assert.ok(Buffer.byteLength(JSON.stringify(privateRecord))>2097152);
  const item=p.store.admit({...p,request,invocation,privateRecord}),id=item.receipt.jobId,nonce=p.store.reserve(id);
  p.store.update(id,nonce,r=>{r.verification.snapshotAfter=s;});
  const stored=p.store.read(id).receipt;
  assert.ok(Buffer.byteLength(JSON.stringify(stored))>1048576);
  assert.throws(()=>plain(stored,1048576),{code:'JOB_LIMIT'});
  const reopened=await openStore({runDir:p.runDir,dataDir:directory});
  try{assert.equal(hash(reopened.read(id).receipt),hash(stored));}finally{reopened.close();}
  assert.equal(stored.execution.start,'notStarted');
  const db=new DatabaseSync(join(p.runDir,'command-jobs-v1','jobs.sqlite'),{readOnly:true});
  try{const row=db.prepare('SELECT receipt,private FROM jobs WHERE id=?').get(id);assert.ok(Buffer.byteLength(row.receipt)<=65536);assert.ok(Buffer.byteLength(row.private)<=4194304);}finally{db.close();}
  const overEnv={...env,MARKER:env.MARKER+'x'};
  assert.throws(()=>p.store.admit({...p,request:{...request,requestId:randomUUID()},invocation,privateRecord:{...privateRecord,launch:{...privateRecord.launch,env:overEnv}}}),{code:'JOB_LIMIT'});
});

test('correctly rehashed exclusions cannot hide implementation, test or package inputs',async t=>{
  const directory=await temporary(t);
  for(const path of ['critical.mjs','package-lock.json','test/critical.test.mjs']){await mkdir(join(directory,...path.split('/').slice(0,-1)),{recursive:true});await writeFile(join(directory,...path.split('/')),'critical');}
  const entries=[];
  for(const path of ['critical.mjs','package-lock.json','test','test/critical.test.mjs']){const s=await lstat(join(directory,...path.split('/')));entries.push({path,kind:s.isDirectory()?'directory':'file',bytes:s.isFile()?s.size:null,mtimeMs:s.mtimeMs,mode:s.mode});}
  const s=await snapshot(directory,[],entries);
  await assert.rejects(api.verifyIntegrationSnapshot(s),{code:'JOB_SNAPSHOT'});
});

test('excluded dependency files require a complete tree identity even without an excluded directory entry',async t=>{
  const directory=await temporary(t),payload=join(directory,'node_modules');await mkdir(payload);await writeFile(join(payload,'module.js'),'module');
  const stat=await lstat(join(payload,'module.js')),entries=[{path:'node_modules/module.js',kind:'file',bytes:stat.size,mtimeMs:stat.mtimeMs,mode:stat.mode}];
  const unbound=await snapshot(directory,[],entries);
  await assert.rejects(api.verifyIntegrationSnapshot(unbound),{code:'JOB_SNAPSHOT'});
  const identity=await fileIdentity(join(payload,'module.js')),dependency={id:'prepared',kind:'tree',path:await realpath(payload),sha256:hash([{path:'module.js',...identity}]),bytes:identity.bytes};
  const bound=await snapshot(directory,[],entries,[dependency]);
  assert.deepEqual(JSON.parse(JSON.stringify(await api.verifyIntegrationSnapshot(bound))),bound);
  await writeFile(join(payload,'unlisted.js'),'new input');
  await assert.rejects(api.verifyIntegrationSnapshot(bound),{code:'JOB_SNAPSHOT'});
});

test('snapshot numeric modes are exact and verification cwd must equal its canonical root before provider admission',async t=>{
  const vector={baseCommit:'1'.repeat(40),dependencies:[],files:[{bytes:8,mode:100644,path:'engine/example.mjs',sha256:'13550350a8681c84c861aac2e5b440161c2b33a3e4f302ac680ca5b686de48de'}]};
  assert.equal(hash(vector),'2d103b96bdce4e1a5286bab791c1e57b7a56a6c37294003866f031c163883dd2');
  const directory=await temporary(t),source=join(directory,'source'),other=join(directory,'other');await mkdir(source);await mkdir(other);await writeFile(join(source,'a.txt'),'source');
  const file={path:'a.txt',...await fileIdentity(join(source,'a.txt'))},s=await snapshot(source,[file]);
  const wrongMode=await snapshot(source,[{...file,mode:'100644'}]);
  await assert.rejects(api.verifyIntegrationSnapshot(wrongMode),{code:'JOB_SNAPSHOT'});
  const p=await prepare(directory);closeAtEnd(t,p.store);
  const request={...p.request,cwd:other,verification:{checkpointId:randomUUID(),checkId:'wrong-cwd',snapshot:s}},invocation={...p.invocation,cwd:other,canonicalCwd:await realpath(other)};
  await assert.rejects(admission({owner:{runtime:{id:p.run.runtimeId,codex:process.execPath}},saved:{launch:{}},access:p.privateRecord.access,run:p.run},request),{code:'JOB_CHECK_BINDING'});
  await assert.rejects(verifyCheckBinding({dataDir:directory,run:p.run},request,invocation),{code:'JOB_CHECK_BINDING'});
});
