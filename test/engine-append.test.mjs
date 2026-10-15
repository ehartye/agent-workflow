/** @lane merge
 * @subject bin/command.mjs
 * @subject engine/controller.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {parseCommand} from '../bin/arguments.mjs';

const meta='export const meta={name:"append",description:"live admission"};';
const cleanup={serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members',nativeTerminals:{inventoryEmpty:true}};
const result=value=>({value,terminalObserved:true,evidence:{cleanup}});
const backend=execute=>({identity:'append-fixture-v1',execute,close:async()=>cleanup});
async function setup(t){
 const root=await mkdtemp(join(fileURLToPath(new URL('../',import.meta.url)),'.append-test-'));
 const closers=[];t.after(async()=>{for(const close of closers)close();await rm(root,{recursive:true,force:true});});
 const api=await import('../engine/append.mjs').catch(()=>null);
 assert.equal(typeof api?.requestAppend,'function','public durable append admission must exist');
 return{root,closers,runDir:join(root,'run'),...api};
}
async function until(fn,predicate){const deadline=Date.now()+5000;while(Date.now()<deadline){const value=await fn();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('observable state did not arrive');}
async function fixture(t,maxAgents=4){
 const api=await setup(t),runDir=api.root,db=new DatabaseSync(join(runDir,'run.sqlite'));
 const state={version:1,sessionId:'s',generation:1,status:'running',acceptingControls:true,appendVersion:1,maxAgents,attempts:0,workerCount:0,runtimeIdentity:'runtime',backendIdentity:'backend',launch:{cwd:runDir},workerTimeoutMs:600000};
 db.exec('CREATE TABLE header(id INTEGER PRIMARY KEY,value TEXT); CREATE TABLE workers(generation INTEGER,position INTEGER,value TEXT,PRIMARY KEY(generation,position)); CREATE TABLE controls(id TEXT PRIMARY KEY,generation INTEGER,value TEXT);');
 db.prepare('INSERT INTO header VALUES(1,?)').run(JSON.stringify(state));api.initializeAdmission(db,state);api.closers.push(()=>db.close());
 return{...api,runDir,db,state};
}

test('saved-run reads hold one SQLite snapshot while another process admits an addition',async t=>{
 const {runDir,db}=await fixture(t),{readRun}=await import('../engine/controller.mjs');
 db.exec('PRAGMA journal_mode=WAL');
 const requestId=randomUUID(),original=DatabaseSync.prototype.prepare;
 let admitted=false,observed;
 DatabaseSync.prototype.prepare=function(sql){
  if(!admitted&&sql.startsWith('SELECT value FROM workers WHERE generation=? ORDER BY position')){
   admitted=true;
   // Commit through the public append API on another connection after readRun
   // has read its header/ledger, but before it reads workers and task intents.
   const script=`import{requestAppend}from ${JSON.stringify(new URL('../engine/append.mjs',import.meta.url).href)};const receipt=await requestAppend(process.argv[1],{sessionId:'s',generation:1,requestId:process.argv[2],tasks:[{id:'X',prompt:'X'}]});console.log(JSON.stringify({status:receipt.status}));`;
   const output=execFileSync(process.execPath,['--input-type=module','-e',script,runDir,requestId],{encoding:'utf8',windowsHide:true,timeout:10000});
   assert.deepEqual(JSON.parse(output),{status:'queued'});
  }
  return original.call(this,sql);
 };
 try{observed=await readRun(runDir);}finally{DatabaseSync.prototype.prepare=original;}
 assert.equal(admitted,true,'Concurrent public append committed at the held read boundary');
 assert.equal(observed.workerCount,0);assert.equal(observed.reservedAttempts,0);assert.deepEqual(observed.workers,[]);assert.equal(observed.additions.requested,0);
 const next=await readRun(runDir);
 assert.equal(next.workerCount,1);assert.equal(next.reservedAttempts,1);assert.equal(next.workers.length,1);assert.equal(next.additions.requested,1);
 assert.equal(next.workers[0].status,'queued');assert.equal(next.workers[0].origin.requestId,requestId);assert.equal(next.attempts,0,'Reading never dispatches the admitted addition');
});

test('append CLI requires session and keeps receipt inspection read only',()=>{
 const id=randomUUID(),args=['run-id','--generation','1','--request-id',id];
 const command=parseCommand(['append',...args,'--tasks-file','tasks.json','--session','s'],{});
 assert.equal(command.mutation,true);assert.equal(command.runCommand,true);
 assert.throws(()=>parseCommand(['append',...args,'--tasks-file','tasks.json'],{}),/session/);
 assert.equal(parseCommand(['append-receipt',...args],{}).mutation,false);
 assert.equal(parseCommand(['append-receipt',...args],{AGENT_WORKFLOW_WORKER:'1'}).mutation,false);
 assert.throws(()=>parseCommand(['append',...args,'--tasks-file','tasks.json','--session','s'],{AGENT_WORKFLOW_WORKER:'1'}),/Worker processes/);
 assert.throws(()=>parseCommand(['append',...args,'--tasks-file','tasks.json','--session','s','--writable'],{}),/not valid/);
});

test('appended explicit null overrides a finite default and long safe budgets retain exact replay identity',async t=>{
 const {runDir,requestAppend,readAppendReceipt,normalizeAppendTasks}=await setup(t),requestId=randomUUID(),seen=[];
 const {runWorkflow}=await import('../engine/controller.mjs');
 const tasks=[{id:'unbounded',prompt:'unbounded',options:{timeoutMs:null}},{id:'long',prompt:'long',options:{timeoutMs:2**32}}];
 const input={runDir,sessionId:'s',workerTimeoutMs:600000,script:meta+'return "guest";'};
 const run=await runWorkflow({...input,backend:backend(async({options,prompt})=>{seen.push([prompt,options.timeoutMs]);return result(prompt);}),onReady:()=>requestAppend(runDir,{sessionId:'s',generation:1,requestId,tasks})});
 assert.equal(run.status,'completed');assert.deepEqual(seen,[['unbounded',null],['long',2**32]]);
 const receipt=await readAppendReceipt(runDir,{generation:1,requestId});assert.equal(receipt.status,'settled');
 const replay=await runWorkflow({...input,resume:true,backend:backend(async()=>assert.fail('Accepted completed additions must replay'))});assert.equal(replay.coverage.cached,2);
 for(const timeoutMs of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1,Infinity])await assert.rejects(normalizeAppendTasks([{id:'bad',prompt:'bad',options:{timeoutMs}}]),{code:'APPEND_INPUT'});
});

test('append receipts are durable and idempotent, identity and reserved budget reject before dispatch',async t=>{
 const {root,initializeAdmission,requestAppend,readAppendReceipt}=await setup(t),requestId=randomUUID();
 const runDir=root,db=new DatabaseSync(join(root,'run.sqlite'));
 const state={version:1,sessionId:'s',generation:1,status:'running',appendVersion:1,maxAgents:1,attempts:0,workerCount:0,runtimeIdentity:'runtime',backendIdentity:'backend',launch:{cwd:root},workerTimeoutMs:600000};
 db.exec('CREATE TABLE header(id INTEGER PRIMARY KEY,value TEXT); CREATE TABLE workers(generation INTEGER,position INTEGER,value TEXT,PRIMARY KEY(generation,position));');
 db.prepare('INSERT INTO header VALUES(1,?)').run(JSON.stringify(state));initializeAdmission(db,state);db.close();
 const request={sessionId:'s',generation:1,requestId,tasks:[{id:'X',prompt:'X',options:{}}]};
 const admitted=await requestAppend(runDir,request);
  assert.deepEqual(await requestAppend(runDir,request),admitted);
  await assert.rejects(requestAppend(runDir,{...request,tasks:[{id:'X',prompt:'changed'}]}),{code:'APPEND_CONFLICT'});
  await assert.rejects(requestAppend(runDir,{...request,sessionId:'other'}),{code:'APPEND_SESSION'});
  await assert.rejects(requestAppend(runDir,{...request,generation:2}),{code:'APPEND_GENERATION'});
  await assert.rejects(requestAppend(runDir,{...request,requestId:randomUUID()}),{code:'AGENT_LIMIT'});
 const receipt=await readAppendReceipt(runDir,{generation:1,requestId});
 assert.equal(receipt.status,'queued');assert.equal(receipt.tasks[0].status,'queued');
 assert.equal(receipt.payloadHash,admitted.payloadHash);
 assert.deepEqual(await requestAppend(runDir,request),receipt);
});

test('interleaved guest A, addition X and dependent guest B replay by stable origin',async t=>{
 const {runDir,requestAppend,readAppendReceipt}=await setup(t),requestId=randomUUID();let xStarted;const started=new Promise(resolve=>{xStarted=resolve;});const executed=[];
 const {runWorkflow}=await import('../engine/controller.mjs');
 const script=meta+'await agent("A",{id:"A"});return await agent("B",{dependsOn:["A"]});';
 const input={runDir,sessionId:'s',script,maxAgents:3,concurrency:2};
 const first=await runWorkflow({...input,backend:backend(async({prompt})=>{
  executed.push(prompt);
  if(prompt==='A'){await requestAppend(runDir,{sessionId:'s',generation:1,requestId,tasks:[{id:'X',prompt:'X'}]});await started;}
  if(prompt==='X')xStarted();return result(prompt);
 })});
 assert.equal(first.status,'completed');assert.equal(first.result,'B');assert.deepEqual(executed,['A','X','B']);
 assert.deepEqual(first.workers.map(w=>w.origin.kind),['guest','append','guest']);
 assert.deepEqual(first.workers[2].dependencies,[0]);assert.equal(first.workers[2].origin.ordinal,1);
 const replay=await runWorkflow({...input,resume:true,backend:backend(async()=>assert.fail('completed work must not dispatch again'))});
 assert.equal(replay.status,'completed');assert.equal(replay.coverage.cached,3);assert.equal(replay.result,'B');
 for(const worker of replay.workers){const source=first.workers.find(w=>JSON.stringify(w.origin)===JSON.stringify(worker.origin));assert.equal(worker.sourceGeneration,1);assert.equal(worker.sourcePosition,source.position);}
 assert.equal((await readAppendReceipt(runDir,{generation:1,requestId})).status,'settled');
});

test('tasks-file is bounded strict UTF8 regular JSON and forbids grants and dependency options',async t=>{
 const {root,readAppendTasks}=await setup(t),path=join(root,'tasks.json');
 await writeFile(path,JSON.stringify({tasks:[{id:'X',prompt:'read',options:{label:'added'}}]}));
 assert.deepEqual(await readAppendTasks(path),[{id:'X',prompt:'read',options:{label:'added'}}]);
 for(const contents of [Buffer.from([0xc3,0x28]),' '.repeat(512*1024+1),'{}',JSON.stringify({tasks:[]}),JSON.stringify({tasks:Array.from({length:33},(_,i)=>({id:String(i),prompt:'x'}))}),JSON.stringify({tasks:[{id:'X',prompt:'x',options:{permissions:{sandbox:'danger-full-access'}}}]}),JSON.stringify({tasks:[{id:'X',prompt:'x',options:{dependsOn:[]}}]})]){
  await writeFile(path,contents);await assert.rejects(readAppendTasks(path));
 }
 await assert.rejects(readAppendTasks(root));
});

test('guest retries cannot consume capacity reserved by an accepted batch',async t=>{
 const {runDir,db,allocateSlot,consumeAttempt,admission,requestAppend}=await fixture(t,2);
 const position=allocateSlot(db,1);consumeAttempt(db,1,{reserved:true});
 const request={sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'X',prompt:'X'}]};
 await requestAppend(runDir,request);
 assert.throws(()=>consumeAttempt(db,1),{code:'AGENT_LIMIT'});
 assert.equal(admission(db,1).consumed,1);assert.equal(admission(db,1).reserved,1);
 consumeAttempt(db,1,{reserved:true,position:position+1});
 assert.equal(admission(db,1).consumed,2);assert.equal(admission(db,1).reserved,0);
 assert.throws(()=>consumeAttempt(db,1,{reserved:true,position:position+1}));
});

for(const action of ['pause','stop'])test(`${action} and append share one durable admission winner`,async t=>{
 const {requestControl}=await import('../engine/controls.mjs');
 const {runDir,requestAppend,db,admission}=await fixture(t);
 const request={sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'X',prompt:'X'}]};
 await requestAppend(runDir,request);
 await requestControl(runDir,{sessionId:'s',generation:1,action});
 await assert.rejects(requestAppend(runDir,{...request,requestId:randomUUID()}),{code:'APPEND_CLOSED'});
 assert.equal(admission(db,1).reserved,1);assert.equal(admission(db,1).accepting,false);
});

test('unsupported saved runtime and capability escalation reject without admission mutation',async t=>{
 const {runDir,db,state,requestAppend,admission}=await fixture(t);
 const before=admission(db,1),request={sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'X',prompt:'X',options:{skills:['not-granted']}}]};
 await assert.rejects(requestAppend(runDir,request),{code:'CAPABILITY_SELECTION'});
 assert.deepEqual(admission(db,1),before);
 delete state.appendVersion;db.prepare('UPDATE header SET value=?').run(JSON.stringify(state));
 await assert.rejects(requestAppend(runDir,{...request,tasks:[{id:'X',prompt:'X'}]}),{code:'APPEND_UNSUPPORTED'});
 assert.deepEqual(admission(db,1),before);assert.equal(db.prepare('SELECT count(*) AS n FROM append_requests').get().n,0);
});

test('original writer input snapshot must exist before accepting any added writer',async t=>{
 const {runDir,db,state,requestAppend,admission}=await fixture(t);
 state.launch.defaults={workspace:'isolated'};db.prepare('UPDATE header SET value=?').run(JSON.stringify(state));
 await assert.rejects(requestAppend(runDir,{sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'X',prompt:'X'}]}),{code:'APPEND_INPUTS'});
 assert.equal(admission(db,1).nextSlot,0);
});

test('crash after durable dispatch intent retains unknown delivery before a worker row exists',async t=>{
 const {runDir,requestAppend,readAppendReceipt,consumeAttempt,db,abandonUnstartedAdmission,transaction}=await fixture(t),requestId=randomUUID();
 const receipt=await requestAppend(runDir,{sessionId:'s',generation:1,requestId,tasks:[{id:'X',prompt:'X'}]});
 consumeAttempt(db,1,{reserved:true,position:receipt.tasks[0].position});
 const retained=await readAppendReceipt(runDir,{generation:1,requestId});
 assert.equal(retained.status,'unknown');assert.equal(retained.tasks[0].status,'unknown');
 assert.throws(()=>consumeAttempt(db,1,{position:receipt.tasks[0].position,reserved:true}));
 assert.throws(()=>transaction(db,()=>abandonUnstartedAdmission(db,1,{code:'BACKGROUND_ABANDONED',message:'Cannot erase uncertain intent'})),{code:'APPEND_UNKNOWN'});
 assert.equal((await readAppendReceipt(runDir,{generation:1,requestId})).status,'unknown');
});

test('two real append clients competing for the last attempt have one durable winner',async t=>{
 const {runDir,db,admission}=await fixture(t,1),execute=promisify(execFile);
 const invoke=requestId=>execute(process.execPath,['--input-type=module','-e',`import{requestAppend}from ${JSON.stringify(new URL('../engine/append.mjs',import.meta.url).href)};try{const r=await requestAppend(${JSON.stringify(runDir)},{sessionId:'s',generation:1,requestId:${JSON.stringify(requestId)},tasks:[{id:'X',prompt:'X'}]});console.log(JSON.stringify({status:r.status}));}catch(e){console.log(JSON.stringify({code:e.code}));}`],{windowsHide:true,timeout:10000});
 const results=await Promise.all([invoke(randomUUID()),invoke(randomUUID())]);
 assert.deepEqual(results.map(r=>JSON.parse(r.stdout).status??JSON.parse(r.stdout).code).sort(),['AGENT_LIMIT','queued']);
 assert.equal(admission(db,1).reserved,1);assert.equal(admission(db,1).nextSlot,1);
});

test('closed and exhausted admissions retain rejected receipts without workers or failed aggregate',async t=>{
 const {runDir,db,state,requestAppend,readAppendReceipt,closeAdmission,transaction}=await fixture(t,1);
 const request={sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'X',prompt:'X'}]};
 await requestAppend(runDir,request);
 const exhausted={...request,requestId:randomUUID()};await assert.rejects(requestAppend(runDir,exhausted),{code:'AGENT_LIMIT'});
 const receipt=await readAppendReceipt(runDir,exhausted);assert.equal(receipt.status,'rejected');assert.equal(receipt.error.code,'AGENT_LIMIT');assert.deepEqual(receipt.tasks,[]);
 transaction(db,()=>closeAdmission(db,1));
 const closed={...request,requestId:randomUUID()};await assert.rejects(requestAppend(runDir,closed),{code:'APPEND_CLOSED'});
 assert.equal((await readAppendReceipt(runDir,closed)).status,'rejected');
 assert.equal(JSON.parse(db.prepare('SELECT value FROM header').get().value).status,state.status);
 assert.equal(db.prepare('SELECT count(*) AS n FROM workers').get().n,0);
});

test('corrupt admission counters cannot grant new lifetime capacity',async t=>{
 const {runDir,db,requestAppend}=await fixture(t,1),ledger=JSON.parse(db.prepare('SELECT value FROM admission').get().value);
 ledger.consumed=-1;db.prepare('UPDATE admission SET value=?').run(JSON.stringify(ledger));
 await assert.rejects(requestAppend(runDir,{sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'X',prompt:'X'}]}),{code:'APPEND_CORRUPT'});
 assert.equal(db.prepare('SELECT count(*) AS n FROM append_tasks').get().n,0);
});

test('saved additions reject unsupported delivery and excess rows before parsing their payloads',async t=>{
 const {db,pendingAdditions,runDir,requestAppend}=await fixture(t);
 await requestAppend(runDir,{sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'X',prompt:'X'}]});
 const row=JSON.parse(db.prepare('SELECT value FROM append_tasks WHERE generation=1 AND position=0').get().value);
 row.delivery='unsupported';db.prepare('UPDATE append_tasks SET value=? WHERE generation=1 AND position=0').run(JSON.stringify(row));
 assert.throws(()=>pendingAdditions(db,1),{code:'APPEND_CORRUPT'});
 row.delivery='queued';db.prepare('UPDATE append_tasks SET value=? WHERE generation=1 AND position=0').run(JSON.stringify(row));
 row.padding='x'.repeat(2*1024*1024);db.prepare('UPDATE append_tasks SET value=? WHERE generation=1 AND position=0').run(JSON.stringify(row));
 assert.throws(()=>pendingAdditions(db,1),{code:'APPEND_CORRUPT'},'Oversized saved row is refused before JSON materialization');
 delete row.padding;db.prepare('UPDATE append_tasks SET value=? WHERE generation=1 AND position=0').run(JSON.stringify(row));
 const insert=db.prepare('INSERT INTO append_tasks VALUES(1,?,?)');
 db.exec('BEGIN IMMEDIATE');
 for(let position=1;position<=1000;position++)insert.run(position,position===1000?'{invalid':JSON.stringify({...row,position}));
 db.exec('COMMIT');
 assert.throws(()=>pendingAdditions(db,1),{code:'APPEND_CORRUPT'});
});

test('explicit null options and a UTF8 BOM are rejected as invalid task input',async t=>{
 const {root,readAppendTasks}=await setup(t),path=join(root,'tasks.json');
 await writeFile(path,JSON.stringify({tasks:[{id:'X',prompt:'X',options:null}]}));await assert.rejects(readAppendTasks(path),{code:'APPEND_INPUT'});
 await writeFile(path,'\ufeff'+JSON.stringify({tasks:[{id:'X',prompt:'X'}]}));await assert.rejects(readAppendTasks(path),{code:'APPEND_INPUT'});
});

test('failed addition fails aggregate while retaining guest result, suffix restart includes interleaved guest',async t=>{
 const {runDir,requestAppend}=await setup(t),{runWorkflow}=await import('../engine/controller.mjs'),{restartPlan}=await import('../engine/restart.mjs');
 let xStarted;const started=new Promise(resolve=>{xStarted=resolve;}),executed=[];
 const input={runDir,sessionId:'s',maxAgents:6,script:meta+'await agent("A",{id:"A"});return await agent("B",{dependsOn:["A"]});'};
 const first=await runWorkflow({...input,backend:backend(async({prompt})=>{
  if(prompt==='A'){await requestAppend(runDir,{sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'X',prompt:'X'}]});await started;}
  if(prompt==='X'){xStarted();throw Object.assign(Error('known failure'),{code:'FIXTURE',notStarted:true,evidence:{cleanup}});}return result(prompt);
 })});
 assert.equal(first.status,'failed');assert.equal(first.result,'B');assert.equal(first.workers[1].status,'failed');assert.equal(first.workers[2].status,'completed');
 await assert.rejects(runWorkflow({...input,resume:true,backend:backend(async()=>assert.fail('unreconciled addition must not dispatch'))}),{code:'APPEND_RECONCILE'});
 const restart={position:1,attempt:1,reconciliation:'Reviewed X and every later physical worker'};
 assert.deepEqual(restartPlan(first,restart).affected.map(w=>w.origin.kind),['append','guest']);
 const second=await runWorkflow({...input,resume:true,expectedGeneration:1,restart,backend:backend(async({prompt})=>{executed.push(prompt);return result(prompt);})});
 assert.equal(second.status,'completed');assert.deepEqual(executed,['X','B']);assert.equal(second.coverage.cached,1);
});

test('uncertain added dispatch never auto resubmits and preserves unknown receipt evidence',async t=>{
 const {runDir,requestAppend,readAppendReceipt}=await setup(t),{runWorkflow}=await import('../engine/controller.mjs'),requestId=randomUUID();
 const input={runDir,sessionId:'s',script:meta+'return "guest";'};
 const first=await runWorkflow({...input,backend:backend(async()=>{throw Object.assign(Error('connection lost after submission'),{code:'CONNECTION_LOST'});}),onReady:()=>requestAppend(runDir,{sessionId:'s',generation:1,requestId,tasks:[{id:'X',prompt:'X'}]})});
 assert.equal(first.status,'failed');assert.equal(first.result,'guest');assert.equal(first.workers[0].status,'unknown');
 assert.equal((await readAppendReceipt(runDir,{generation:1,requestId})).status,'unknown');
 await assert.rejects(runWorkflow({...input,resume:true,backend:backend(async()=>assert.fail('unknown must never resubmit'))}),{code:'REPLAY_UNKNOWN'});
});

test('accepted addition drains after guest completion and Pause keeps its original result',async t=>{
 const {runDir,requestAppend,readAppendReceipt}=await setup(t),{runWorkflow,readRun}=await import('../engine/controller.mjs'),{requestControl}=await import('../engine/controls.mjs');
 let start,finish;const started=new Promise(resolve=>{start=resolve;}),gate=new Promise(resolve=>{finish=resolve;});t.after(()=>finish());const requestId=randomUUID();
 const work=runWorkflow({runDir,sessionId:'s',script:meta+'return "original";',backend:backend(async()=>{start();await gate;return result('added');}),onReady:()=>requestAppend(runDir,{sessionId:'s',generation:1,requestId,tasks:[{id:'X',prompt:'X'}]})});
 work.catch(()=>{});await started;await until(()=>readRun(runDir),state=>state.result==='original');
 await requestControl(runDir,{sessionId:'s',generation:1,action:'pause'});
 await assert.rejects(requestAppend(runDir,{sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'Y',prompt:'Y'}]}),{code:'APPEND_CLOSED'});
 finish();const run=await work;assert.equal(run.status,'paused');assert.equal(run.result,'original');assert.equal(run.workers[0].result,'added');
 assert.equal((await readAppendReceipt(runDir,{generation:1,requestId})).status,'settled');
});

test('Stop during post-guest drain retains unknown effects after bounded shutdown',async t=>{
 const {runDir,requestAppend,readAppendReceipt}=await setup(t),{runWorkflow,readRun}=await import('../engine/controller.mjs'),{requestControl}=await import('../engine/controls.mjs');
 let start,finish;const started=new Promise(resolve=>{start=resolve;}),gate=new Promise(resolve=>{finish=resolve;});t.after(()=>finish());const requestId=randomUUID();
 const work=runWorkflow({runDir,sessionId:'s',script:meta+'return "original";',drainTimeoutMs:40,backend:backend(async()=>{start();await gate;return result('late');}),onReady:()=>requestAppend(runDir,{sessionId:'s',generation:1,requestId,tasks:[{id:'X',prompt:'X'}]})});
 work.catch(()=>{});await started;await until(()=>readRun(runDir),state=>state.result==='original');
 await requestControl(runDir,{sessionId:'s',generation:1,action:'stop'});
 const run=await work;assert.equal(run.status,'blocked');assert.equal(run.result,'original');assert.equal(run.workers[0].status,'unknown');assert.equal((await readAppendReceipt(runDir,{generation:1,requestId})).status,'unknown');
 finish();
});

test('run wall deadline still bounds additions after the original guest returns',async t=>{
 const {runDir,requestAppend}=await setup(t),{runWorkflow}=await import('../engine/controller.mjs');
 const run=await runWorkflow({runDir,sessionId:'s',script:meta+'return "original";',timeoutMs:1500,backend:backend(async({signal})=>{await new Promise((_,reject)=>{const stop=()=>reject(Error('uncertain interrupt'));signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();});}),onReady:()=>requestAppend(runDir,{sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'X',prompt:'X'}]})});
 assert.equal(run.status,'failed');assert.equal(run.result,'original');assert.equal(run.error.code,'EVALUATOR_TIMEOUT');assert.equal(run.workers[0].status,'unknown');
});

test('saved additions reject backend drift before changing retained execution',async t=>{
 const {runDir,requestAppend}=await setup(t),{runWorkflow,readRun}=await import('../engine/controller.mjs');
 const input={runDir,sessionId:'s',script:meta+'return "original";'};
 const first=await runWorkflow({...input,backend:backend(async()=>result('X')),onReady:()=>requestAppend(runDir,{sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'X',prompt:'X'}]})});
 await assert.rejects(runWorkflow({...input,resume:true,backend:{...backend(async()=>assert.fail('changed backend must not dispatch')),identity:'other-backend'}}),{code:'APPEND_IDENTITY'});
 assert.deepEqual(await readRun(runDir),first);
});

test('task ID prompt and normalized batch limits are enforced before reserving slots',async t=>{
 const {normalizeAppendTasks}=await setup(t);
 const boundary={id:'i'.repeat(200),prompt:'🙂'.repeat(32768)};assert.equal((await normalizeAppendTasks([boundary]))[0].prompt.length,65536);
 for(const tasks of [[{id:'i'.repeat(201),prompt:'x'}],[{id:'X',prompt:'x'.repeat(65537)}],[{id:'X',prompt:'x'},{id:'X',prompt:'y'}],Array.from({length:32},(_,i)=>({id:String(i),prompt:'x'.repeat(20000)}))])await assert.rejects(normalizeAppendTasks(tasks),error=>['APPEND_INPUT','APPEND_LIMIT'].includes(error.code));
});

test('UUID letter case cannot allocate a second copy of one request',async t=>{
 const {runDir,requestAppend,readAppendReceipt,db,admission}=await fixture(t),requestId='abcdefab-abcd-4abc-8abc-abcdefabcdef';
 const request={sessionId:'s',generation:1,requestId,tasks:[{id:'X',prompt:'X'}]};
 const first=await requestAppend(runDir,request);assert.deepEqual(await requestAppend(runDir,{...request,requestId:requestId.toUpperCase()}),first);
 assert.deepEqual(await readAppendReceipt(runDir,{generation:1,requestId:requestId.toUpperCase()}),first);
 assert.equal(admission(db,1).reserved,1);
});

test('Stop cancels an undispatched addition without converting Stop into aggregate failure',async t=>{
 const {runDir,requestAppend,readAppendReceipt}=await setup(t),{runWorkflow}=await import('../engine/controller.mjs'),{requestControl}=await import('../engine/controls.mjs'),requestId=randomUUID();
 const run=await runWorkflow({runDir,sessionId:'s',script:meta+'return "original";',backend:backend(async()=>assert.fail('Stop before dispatch must preserve no process evidence')),onReady:async()=>{
  await requestAppend(runDir,{sessionId:'s',generation:1,requestId,tasks:[{id:'X',prompt:'X'}]});await requestControl(runDir,{sessionId:'s',generation:1,action:'stop'});
 }});
 assert.equal(run.status,'stopped');assert.equal(run.workers[0].notStarted,true);
 const receipt=await readAppendReceipt(runDir,{generation:1,requestId});assert.equal(receipt.status,'settled');assert.equal(receipt.tasks[0].outcome,'cancelled');
});

test('dispatch intent loses to a committed Stop before the controller polls',async t=>{
 const {runDir,db,requestAppend,consumeAttempt,admission}=await fixture(t),{requestControl}=await import('../engine/controls.mjs');
 const accepted=await requestAppend(runDir,{sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'X',prompt:'X'}]});
 await requestControl(runDir,{sessionId:'s',generation:1,action:'stop'});
 assert.throws(()=>consumeAttempt(db,1,{reserved:true,position:accepted.tasks[0].position,allowPaused:true}),{code:'RUN_STOPPED'});
 assert.equal(admission(db,1).consumed,0);assert.equal(admission(db,1).reserved,1);
});

test('append racing guest completion is either drained once or rejected before execution',async t=>{
 const {runDir,requestAppend,readAppendReceipt}=await setup(t),{runWorkflow}=await import('../engine/controller.mjs'),requestId=randomUUID();
 let start,finish;const started=new Promise(resolve=>{start=resolve;}),gate=new Promise(resolve=>{finish=resolve;});t.after(()=>finish());const executed=[];
 const work=runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("A");',concurrency:1,backend:backend(async({prompt})=>{executed.push(prompt);if(prompt==='A'){start();await gate;}return result(prompt);})});
 work.catch(()=>{});await started;finish();
 let accepted=false;try{await requestAppend(runDir,{sessionId:'s',generation:1,requestId,tasks:[{id:'X',prompt:'X'}]});accepted=true;}catch(error){assert.equal(error.code,'APPEND_CLOSED');}
 const run=await work;assert.equal(run.status,'completed');assert.equal(run.result,'A');assert.deepEqual(executed,accepted?['A','X']:['A']);
 assert.equal((await readAppendReceipt(runDir,{generation:1,requestId})).status,accepted?'settled':'rejected');
});

test('abandoned startup retains accepted receipts as rejected and releases only undispatched reservations',async t=>{
 const {runDir,db,requestAppend,readAppendReceipt,admission,transaction,abandonUnstartedAdmission}=await fixture(t),requestId=randomUUID();
 await requestAppend(runDir,{sessionId:'s',generation:1,requestId,tasks:[{id:'X',prompt:'X'}]});
 assert.equal(typeof abandonUnstartedAdmission,'function');
 transaction(db,()=>abandonUnstartedAdmission(db,1,{code:'BACKGROUND_ABANDONED',message:'No dispatch was authorized'}));
 const receipt=await readAppendReceipt(runDir,{generation:1,requestId});assert.equal(receipt.status,'rejected');assert.equal(receipt.error.code,'BACKGROUND_ABANDONED');
 assert.equal(admission(db,1).reserved,0);assert.equal(admission(db,1).consumed,0);assert.equal(admission(db,1).accepting,false);
});

test('the inbox cannot dispatch while the startup authorization hook is still pending',async t=>{
 const {runDir,requestAppend}=await setup(t),{runWorkflow}=await import('../engine/controller.mjs'),{requestControl,readControl}=await import('../engine/controls.mjs');
 let ready,finish;const admitted=new Promise(resolve=>{ready=resolve;}),gate=new Promise(resolve=>{finish=resolve;});t.after(()=>finish());let executed=0;
 const work=runWorkflow({runDir,sessionId:'s',script:meta+'return "original";',backend:backend(async()=>{executed++;return result('X');}),onReady:async()=>{await requestAppend(runDir,{sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'X',prompt:'X'}]});ready();await gate;}});
 work.catch(()=>{});await admitted;const control=await requestControl(runDir,{sessionId:'s',generation:1,action:'pause'});
 await until(()=>readControl(runDir,control.id),value=>value.status==='applied');assert.equal(executed,0,'a timer poll occurred without startup authorization');
 finish();const run=await work;assert.equal(run.status,'paused');assert.equal(executed,1);assert.equal(run.workers[0].status,'completed');
});

test('normal completion waits for additions admitted during an earlier addition drain',async t=>{
 let startX,startY,finishX,finishY,work;
 t.after(async()=>{finishX?.();finishY?.();await work?.catch(()=>{});});
 const {runDir,requestAppend}=await setup(t),{runWorkflow,readRun}=await import('../engine/controller.mjs');
 const xs=new Promise(resolve=>{startX=resolve;}),ys=new Promise(resolve=>{startY=resolve;}),xg=new Promise(resolve=>{finishX=resolve;}),yg=new Promise(resolve=>{finishY=resolve;});
 const add=id=>requestAppend(runDir,{sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id,prompt:id}]});
 work=runWorkflow({runDir,sessionId:'s',maxAgents:4,concurrency:2,script:meta+'return "guest";',onReady:()=>add('X'),backend:backend(async({prompt,signal})=>{
  if(prompt==='X'){startX();await xg;}else{startY();await Promise.race([yg,new Promise((_,reject)=>{const stop=()=>reject(Error('Unexpected normal-completion interrupt'));signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();})]);}return result(prompt);
 })});work.catch(()=>{});
 await xs;await until(()=>readRun(runDir),state=>state.result==='guest');await add('Y');await ys;finishX();
 await until(()=>readRun(runDir),state=>state.workers[0].status==='completed');
 // Let completion continuations run; Y must remain admitted without a Stop.
 await new Promise(resolve=>setImmediate(resolve));
 const during=await readRun(runDir);assert.equal(during.workers[1].status,'running');assert.equal(during.acceptingAdditions,true);
 finishY();const run=await work;assert.equal(run.status,'completed');assert.equal(run.result,'guest');assert.deepEqual(run.workers.map(worker=>worker.result),['X','Y']);
});

test('restart validates the saved guest prefix before executing affected additions',async t=>{
 let finishA,startX,firstWork,secondWork;
 t.after(async()=>{finishA?.();startX?.();await firstWork?.catch(()=>{});await secondWork?.catch(()=>{});});
 const {runDir,requestAppend}=await setup(t),{runWorkflow}=await import('../engine/controller.mjs');
 const ag=new Promise(resolve=>{finishA=resolve;}),xs=new Promise(resolve=>{startX=resolve;});
 const input={runDir,sessionId:'s',maxAgents:10,concurrency:4,script:meta+'const a=agent("A"),b=agent("B");const winner=await Promise.race([a,b]);await agent("C "+winner);await Promise.all([a,b]);return winner;'};
 firstWork=runWorkflow({...input,backend:backend(async({prompt})=>{
  if(prompt==='A')await ag;
  if(prompt==='C B'){await requestAppend(runDir,{sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'X',prompt:'X'}]});await xs;finishA();}
  if(prompt==='X'){startX();throw Object.assign(Error('Known failed addition'),{notStarted:true,evidence:{cleanup}});}return result(prompt);
 })});const first=await firstWork;assert.equal(first.status,'failed');assert.deepEqual(first.workers.map(worker=>worker.prompt),['A','B','C B','X']);
 const executed=[];secondWork=runWorkflow({...input,resume:true,expectedGeneration:1,restart:{position:3,attempt:1,reconciliation:'Reviewed affected X effects'},backend:backend(async({prompt})=>{executed.push(prompt);return result(prompt);})});
 const second=await secondWork;assert.equal(second.error.code,'RESTART_CHANGED');assert.deepEqual(executed,[],'No affected addition may execute before saved prefix validation');
 assert.equal(second.workers.find(worker=>worker.origin.kind==='append').notStarted,true);
});

test('Pause before restart prefix validation settles affected additions without executing them',async t=>{
 let firstWork,secondWork,startX;
 t.after(async()=>{startX?.();await firstWork?.catch(()=>{});await secondWork?.catch(()=>{});});
 const {runDir,requestAppend}=await setup(t),{runWorkflow}=await import('../engine/controller.mjs'),{requestControl}=await import('../engine/controls.mjs');
 const xs=new Promise(resolve=>{startX=resolve;}),input={runDir,sessionId:'s',maxAgents:5,workerTimeoutMs:30,drainTimeoutMs:20,script:meta+'return await agent("A");'};
 firstWork=runWorkflow({...input,backend:backend(async({prompt})=>{
  if(prompt==='A'){await requestAppend(runDir,{sessionId:'s',generation:1,requestId:randomUUID(),tasks:[{id:'X',prompt:'X'}]});await xs;return result('A');}
  startX();throw Object.assign(Error('Known failure'),{notStarted:true,evidence:{cleanup}});
 })});await firstWork;
 secondWork=runWorkflow({...input,resume:true,expectedGeneration:1,restart:{position:1,attempt:1,reconciliation:'Reviewed X effects'},onReady:()=>requestControl(runDir,{sessionId:'s',generation:2,action:'pause'}),backend:backend(async()=>assert.fail('Unvalidated suffix must not dispatch'))});
 const run=await secondWork,added=run.workers.find(worker=>worker.origin.kind==='append');
 assert.equal(added.notStarted,true);assert.equal(added.status,'failed');assert.equal(added.error.code,'RESTART_CHANGED');assert.equal(run.reservedAttempts,0);
});
