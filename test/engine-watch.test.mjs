/** @lane merge
 * @subject engine/watch.mjs
 * @subject bin/arguments.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCommand} from '../bin/arguments.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {Writable} from 'node:stream';
import {runWorkflow,readRun} from '../engine/controller.mjs';
const module=await import('../engine/watch.mjs').catch(()=>({}));

test('watch requires originating session, generation and JSONL with bounded observation settings',()=>{
 const parsed=parseCommand(['watch','run-id','--session','s','--generation','1','--after','0','--jsonl','--idle-ms','1000','--poll-ms','100'],{});
 assert.equal(parsed.runCommand,true);assert.equal(parsed.sessionId,'s');assert.equal(parsed.values.jsonl,true);
 assert.throws(()=>parseCommand(['watch','run-id','--generation','1','--jsonl'],{}),/session/i);
});

test('watch replays durable worker failure and immediate terminal without inventing attachment',async()=>{
 assert.equal(typeof module.watchRun,'function');const records=[],calls=[];
 const result=await module.watchRun('/fixture',{sessionId:'s',generation:1,after:0,idleMs:1000,pollMs:100},{read:async(_,input)=>{calls.push(input);return{supported:true,generation:1,events:[{seq:1,generation:1,kind:'worker-terminal',position:0,attempt:1,status:'unknown'},{seq:2,generation:1,kind:'run-terminal',status:'failed'}],nextCursor:2,terminal:true,status:'failed',workers:[]};},write:async record=>records.push(record)});
 assert.deepEqual(records.map(r=>r.kind),['attached','worker-terminal','run-terminal']);assert.equal(result.exitCode,1);assert.equal(result.cursor,2);assert.equal(calls[0].sessionId,'s');
});

test('watch idle warning ignores prose and resets only for actual executable/file-change progress',async()=>{
 assert.equal(typeof module.watchRun,'function');let now=0,reads=0;const records=[];
 const result=await module.watchRun('/fixture',{sessionId:'s',generation:1,pollMs:100,idleMs:1000},{clock:()=>now,sleep:async ms=>{now+=ms;},write:async r=>records.push({...r,observedAt:now}),read:async()=>{reads++;return{supported:true,generation:1,events:now===2600?[{seq:1,generation:1,kind:'run-terminal',status:'completed'}]:[],nextCursor:now===2600?1:0,terminal:now===2600,status:now===2600?'completed':'running',workers:[{position:0,attempt:1,status:'running',commentary:`message ${reads}`,progress:now>=1500?{seq:7,kind:'command',at:'2026-10-14T00:00:00Z'}:null}]};}});
 assert.equal(result.exitCode,0);assert.deepEqual(records.filter(r=>r.kind==='idle-warning').map(r=>r.observedAt),[1000,2500]);
});

test('late attachment reports existing idle time from saved activity or worker start',async()=>{
 for(const progress of [undefined,{seq:2,kind:'file-change',at:'2026-10-14T00:00:03.000Z'}]){
  const records=[];let reads=0;
  await module.watchRun('/fixture',{sessionId:'s',generation:1,pollMs:100,idleMs:1000},{clock:()=>5000,wallClock:()=>Date.parse('2026-10-14T00:00:05.000Z'),sleep:async()=>{},write:async r=>records.push(r),read:async()=>({supported:true,generation:1,events:[],nextCursor:0,terminal:++reads===2,status:reads===2?'completed':'running',workers:[{position:0,attempt:1,status:'running',startedAt:'2026-10-14T00:00:00.000Z',progress}]})});
  assert.equal(records.find(r=>r.kind==='idle-warning')?.idleMs,progress?2000:5000);
 }
});

test('watch output disconnection never issues controls or advances consumer cursor silently',async()=>{
 assert.equal(typeof module.watchRun,'function');let reads=0;
 const result=await module.watchRun('/fixture',{sessionId:'s',generation:1,pollMs:100,idleMs:1000},{read:async()=>{reads++;return{supported:true,generation:1,events:[{seq:1,generation:1,kind:'worker-terminal',position:0,attempt:1,status:'failed'}],nextCursor:1,terminal:false,status:'running',workers:[]};},write:async r=>{if(r.kind==='worker-terminal')throw Object.assign(Error('closed'),{code:'EPIPE'});}});
 assert.equal(result.reason,'disconnected');assert.equal(result.cursor,0);assert.equal(reads,1);
});

test('closed output stream leaves durable outcomes intact and unacknowledged events replayable',async t=>{
 const base=await mkdtemp(join(tmpdir(),'workflow-watch-pipe-'));t.after(()=>rm(base,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const runDir=join(base,'run');let executions=0;
 await runWorkflow({runDir,sessionId:'origin',script:'export const meta={name:"pipe",description:"disconnect"};return await agent("A");',backend:{identity:'pipe-fixture',async execute(){executions++;return{terminalObserved:true,value:1};},async close(){return{serverExited:true};}}});
 const before=await readRun(runDir);
 const stream=new Writable({write(chunk,encoding,callback){callback(JSON.parse(chunk).kind==='worker-terminal'?Object.assign(Error('pipe closed'),{code:'EPIPE'}):undefined);}});
 const write=module.jsonlWriter(stream);
 const first=await module.watchRun(runDir,{sessionId:'origin',generation:1},{write});write.close();
 assert.equal(first.reason,'disconnected');assert.equal(first.cursor,0);
 const records=[];const second=await module.watchRun(runDir,{sessionId:'origin',generation:1,after:first.cursor},{write:async r=>records.push(r)});
 assert.equal(second.exitCode,0);assert.deepEqual(records.map(r=>r.kind),['attached','worker-terminal','run-terminal']);
 assert.deepEqual(await readRun(runDir),before);assert.equal(executions,1);
});

test('watch drains terminal pages before exiting and abort never controls the workflow',async()=>{
 const records=[];let reads=0;
 const result=await module.watchRun('/fixture',{sessionId:'s',generation:1},{write:async r=>records.push(r),read:async(_,input)=>{
  reads++;assert.equal(input.after,reads-1);return{supported:true,generation:1,status:'failed',workers:[],events:[{seq:reads,generation:1,kind:reads===1?'worker-terminal':'run-terminal',status:'failed'}],nextCursor:reads,terminal:reads===2,hasMore:reads===1};
 },sleep:async()=>{throw Error('Do not delay pending events');}});
 assert.equal(result.cursor,2);assert.equal(reads,2);assert.equal(records.at(-1).kind,'run-terminal');
 const signal=AbortSignal.abort();let called=false;
 assert.equal((await module.watchRun('/fixture',{sessionId:'s',generation:1,signal},{read:async()=>{called=true;},write:async()=>{}})).reason,'aborted');assert.equal(called,false);
});

test('watch refuses malformed inputs before reading and surfaces unavailable observation',async()=>{
 assert.equal(typeof module.watchRun,'function');let reads=0;const read=async()=>{reads++;throw Object.assign(Error('private'),{code:'NOTIFICATIONS_UNAVAILABLE'});};
 for(const bad of [{sessionId:''},{generation:0},{after:-1},{pollMs:0},{idleMs:0}])await assert.rejects(module.watchRun('/fixture',{sessionId:'s',generation:1,pollMs:100,idleMs:1000,...bad},{read,write:async()=>{}}));
 assert.equal(reads,0);const records=[];const result=await module.watchRun('/fixture',{sessionId:'s',generation:1,pollMs:100,idleMs:1000},{read,write:async r=>records.push(r)});
 assert.equal(result.exitCode,2);assert.deepEqual(records.map(r=>r.kind),['observation-error']);assert.equal(records[0].error.code,'NOTIFICATIONS_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(records),/private/);
});

test('killed observer reconnects to durable failure and terminal events without stopping or replaying work',async t=>{
 const base=await mkdtemp(join(tmpdir(),'workflow-watch-'));
 let release,entered;const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});let executions=0,closed=0;
 const runDir=join(base,'run');
 const run=runWorkflow({runDir,sessionId:'origin',script:'export const meta={name:"observe",description:"failure delivery"};return await agent("held");',backend:{identity:'watch-fixture',async execute(){executions++;entered();await gate;throw Object.assign(Error('private message'),{code:'TURN_TIMEOUT'});},async close(){closed++;return{serverExited:true};}}});
 t.after(async()=>{release();await run;await rm(base,{recursive:true,force:true,maxRetries:20,retryDelay:100});});await started;
 const launch=after=>{
  const child=spawn(process.execPath,['--input-type=module','-e',`import {watchRun} from ${JSON.stringify(new URL('../engine/watch.mjs',import.meta.url).href)};process.exitCode=(await watchRun(${JSON.stringify(runDir)},{sessionId:'origin',generation:1,after:${after},pollMs:100,idleMs:1000})).exitCode;`],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const records=[];let pending='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{pending+=chunk;let end;while((end=pending.indexOf('\n'))>=0){records.push(JSON.parse(pending.slice(0,end)));pending=pending.slice(end+1);}});child.stderr.on('data',chunk=>{stderr+=chunk;});
  const done=once(child,'exit');t.after(()=>{if(child.exitCode===null)child.kill();});return{child,records,done,stderr:()=>stderr};
 };
 const first=launch(0);await until(()=>first.records.some(r=>r.kind==='attached'));first.child.kill();await first.done;
 assert.equal((await readRun(runDir)).status,'running');assert.equal(executions,1);assert.equal(closed,0);
 const second=launch(0);await until(()=>second.records.some(r=>r.kind==='attached'));release();const settled=await run;const [code]=await second.done;
 assert.equal(settled.status,'failed');assert.equal(code,1);assert.equal(executions,1);assert.equal(closed,1);
 const terminal=second.records.filter(r=>r.kind.endsWith('-terminal'));assert.deepEqual(terminal.map(r=>r.kind),['worker-terminal','run-terminal']);
 assert.equal(terminal[1].cleanup.serverExited,true);assert.doesNotMatch(JSON.stringify(second.records),/private message/);
 const third=launch(terminal[0].seq);const [thirdCode]=await third.done;assert.equal(thirdCode,1);
 assert.deepEqual(third.records.filter(r=>r.kind.endsWith('-terminal')).map(r=>r.kind),['run-terminal']);
 assert.equal((await readRun(runDir)).status,'failed');assert.equal(executions,1);assert.doesNotMatch(second.stderr(),/uncaught|Error:/);
});

async function until(predicate){const end=Date.now()+8000;while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('Watch observation did not arrive');}
