/** @lane merge
 * @subject engine/controller.mjs
 * @subject engine/notifications.mjs
 * @subject engine/evaluator-child.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runWorkflow} from '../engine/controller.mjs';
import {fault} from '../foundation/client.mjs';

const meta='export const meta={name:"notifications",description:"durable observation fixture"};\n';
const deferred=()=>{let resolve;return{promise:new Promise(r=>{resolve=r;}),resolve};};
async function setup(t){
 const root=await mkdtemp(join(fileURLToPath(new URL('../',import.meta.url)),'.notifications-test-'));
 const cleanup=[];t.after(async()=>{for(const close of cleanup)await close();await rm(root,{recursive:true,force:true});});
 const module=await import('../engine/notifications.mjs').catch(()=>null);
 assert.equal(typeof module?.readNotifications,'function','Durable notification reader must exist');
 return{root,cleanup,read:options=>module.readNotifications(join(root,'run'),{sessionId:'owner',generation:1,...options}),input:{runDir:join(root,'run'),sessionId:'owner',script:meta+'return await agent("PRIVATE_PROMPT");',backend:{identity:'notifications-fixture',execute:async()=>({value:'PRIVATE_RESULT',terminalObserved:true,evidence:{cleanup:{serverExited:true,jobEmpty:true}}}),close:async()=>({serverExited:true,forced:false})}}};
}

test('terminal-before-watch survives reconnect, pages without dropping terminal events and rejects foreign identities',async t=>{
 const {input,read}=await setup(t);await runWorkflow(input);
 const first=await read({limit:1});
 assert.equal(first.supported,true);assert.equal(first.hasMore,true);assert.equal(first.terminal,false);
 assert.deepEqual(first.events.map(e=>[e.kind,e.position,e.status]),[['worker-terminal',0,'completed']]);
 assert.deepEqual(await read({limit:1}),first,'Lost consumer can replay exact durable event');
 const last=await read({after:first.nextCursor,limit:1});
 assert.deepEqual(last.events.map(e=>[e.kind,e.status]),[['run-terminal','completed']]);assert.equal(last.terminal,true);assert.equal(last.hasMore,false);
 assert.equal((await read({after:last.nextCursor})).terminal,true);
 assert.equal(JSON.stringify(await read({})).includes('PRIVATE'),false);
 for(const options of [{sessionId:'foreign'},{sessionId:undefined}])await assert.rejects(read(options),{code:'NOTIFICATIONS_SESSION'});
 for(const options of [{generation:0},{generation:2},{generation:undefined}])await assert.rejects(read(options),{code:'NOTIFICATIONS_GENERATION'});
 for(const after of [-1,0.5,999999,NaN])await assert.rejects(read({after}),{code:'NOTIFICATIONS_CURSOR'});
 await runWorkflow({...input,resume:true});
 await assert.rejects(read({}),{code:'NOTIFICATIONS_GENERATION'});
 await assert.rejects(read({generation:2,after:first.nextCursor}),{code:'NOTIFICATIONS_CURSOR'});
 const replay=await read({generation:2});assert.equal(replay.events.length,2);assert.ok(replay.events[0].seq>last.nextCursor);assert.equal(replay.terminal,true);
});

test('worker failure is durable while sibling runs; command progress survives prose and activity eviction; run terminal waits for cleanup',async t=>{
 const {input,read,cleanup}=await setup(t),both=deferred(),finishSibling=deferred(),closing=deferred(),drain=deferred();
 let arrived=0,emit;
 input.script=meta+'return await Promise.allSettled([agent("PRIVATE_A"),agent("PRIVATE_B")]);';
 input.backend.execute=async({position,onEvent})=>{
  if(++arrived===2)both.resolve();await both.promise;
  if(position===0)throw Object.assign(fault('TURN_TIMEOUT','PRIVATE_ERROR'),{terminalObserved:true,evidence:{cleanup:{serverExited:true,jobEmpty:true}}});
  const event=(method,item)=>onEvent({method,params:{threadId:'thread',turnId:'turn',item}});
  emit=event;
  event('item/started',{id:'command',type:'commandExecution',command:'PRIVATE_COMMAND'});
  event('item/completed',{id:'command',type:'commandExecution',status:'completed',exitCode:0});
  for(let i=0;i<270;i++)event('item/completed',{id:'prose-'+i,type:'agentMessage',text:'PRIVATE_PROSE'});
  await finishSibling.promise;return{value:'PRIVATE_RESULT',terminalObserved:true};
 };
 input.backend.close=async()=>{closing.resolve();await drain.promise;return{serverExited:true,forced:false};};
 const running=runWorkflow(input);cleanup.push(async()=>{finishSibling.resolve();drain.resolve();await running;});await both.promise;
 let middle;
 for(let i=0;i<200;i++){middle=await read({});if(middle.events.length)break;await new Promise(r=>setTimeout(r,5));}
 assert.equal(middle.terminal,false);assert.equal(middle.events[0].kind,'worker-terminal');assert.equal(middle.events[0].errorCode,'TURN_TIMEOUT');
 const worker=middle.workers.find(w=>w.position===1);assert.equal(worker.status,'running');assert.equal(worker.progress.kind,'command');
 assert.ok(Number.isFinite(Date.parse(worker.startedAt)));
 assert.equal(JSON.stringify(middle).includes('PRIVATE'),false);
 const progress=worker.progress;assert.deepEqual((await read({})).workers.find(w=>w.position===1).progress,progress);
 emit('item/started',{id:'pending',type:'commandExecution',command:'PRIVATE_PENDING_COMMAND'});
 emit('item/completed',{id:'still-pending',type:'commandExecution',status:'inProgress'});
 assert.deepEqual((await read({})).workers.find(w=>w.position===1).progress,progress,'Starting or pending commands do not reset completed-command idle time');
 emit('item/completed',{id:'empty-change',type:'fileChange',changes:[]});
 assert.deepEqual((await read({})).workers.find(w=>w.position===1).progress,progress);
 emit('item/completed',{id:'change',type:'fileChange',changes:[{path:'PRIVATE_PATH',diff:'PRIVATE_DIFF'}]});
 const changed=(await read({})).workers.find(w=>w.position===1).progress;assert.equal(changed.kind,'file-change');assert.ok(changed.seq>progress.seq);
 const db=new DatabaseSync(join(input.runDir,'run.sqlite')),row=db.prepare("SELECT * FROM notifications WHERE kind='worker-terminal' AND position=0").get();
 db.prepare('DELETE FROM notifications WHERE seq=?').run(row.seq);db.close();
 try{await assert.rejects(read({}),{code:'NOTIFICATIONS_CORRUPT'});}
 finally{const restore=new DatabaseSync(join(input.runDir,'run.sqlite'));try{restore.prepare('INSERT INTO notifications(seq,generation,kind,position,attempt,status,at,cleanup,error_code) VALUES(?,?,?,?,?,?,?,?,?)').run(row.seq,row.generation,row.kind,row.position,row.attempt,row.status,row.at,row.cleanup,row.error_code);}finally{restore.close();}}
 finishSibling.resolve();await closing.promise;
 const held=await read({});assert.equal(held.terminal,false);assert.equal(held.events.some(e=>e.kind==='run-terminal'),false);
 drain.resolve();await running;const done=await read({});assert.equal(done.terminal,true);assert.equal(done.events.at(-1).kind,'run-terminal');assert.equal(done.events.at(-1).cleanup.serverExited,true);
});

test('failed terminal journal write rolls back the final header instead of publishing completion',async t=>{
 const {input,read}=await setup(t);
 input.onReady=()=>{const db=new DatabaseSync(join(input.runDir,'run.sqlite'));try{db.exec("CREATE TRIGGER reject_final BEFORE INSERT ON notifications WHEN NEW.kind='run-terminal' BEGIN SELECT RAISE(ABORT,'fixture durable storage failure'); END;");}finally{db.close();}};
 await assert.rejects(runWorkflow(input));
 const result=await read({});assert.equal(result.terminal,false);assert.equal(result.status,'finishing');assert.equal(result.events.length,1);assert.equal(result.events[0].kind,'worker-terminal');
});

test('full journal refuses generation admission before execution and retains existing terminal events',async t=>{
 const {input,read}=await setup(t);await runWorkflow(input);const prior=await read({});
 const db=new DatabaseSync(join(input.runDir,'run.sqlite'));
 try{db.exec("WITH RECURSIVE n(x) AS (VALUES(2) UNION ALL SELECT x+1 FROM n WHERE x<99001) INSERT INTO notifications(generation,kind,position,attempt,status,at,cleanup,error_code) SELECT x,'run-terminal',-1,NULL,'completed','2026-01-01T00:00:00.000Z','{}',NULL FROM n;");}finally{db.close();}
 let called=false;input.backend.execute=async()=>{called=true;throw new Error('must not execute');};
 await assert.rejects(runWorkflow({...input,resume:true}),{code:'NOTIFICATIONS_LIMIT'});assert.equal(called,false);assert.deepEqual(await read({}),prior);
});

test('old schema and malformed terminal evidence fail closed instead of fabricating completion',async t=>{
 const {input,read,root}=await setup(t);
 await mkdir(input.runDir);let db=new DatabaseSync(join(input.runDir,'run.sqlite'));db.exec('CREATE TABLE header(id INTEGER PRIMARY KEY,value TEXT);');db.prepare('INSERT INTO header VALUES(1,?)').run(JSON.stringify({sessionId:'owner',generation:1,status:'completed'}));db.close();
 await assert.rejects(read({}),{code:'NOTIFICATIONS_UNAVAILABLE'});
 await rm(input.runDir,{recursive:true});await runWorkflow(input);
 db=new DatabaseSync(join(input.runDir,'run.sqlite'));const header=db.prepare('SELECT value FROM header WHERE id=1').get().value;
 const inconsistent=JSON.parse(header);inconsistent.cleanup.serverExited=false;db.prepare('UPDATE header SET value=?').run(JSON.stringify(inconsistent));db.close();
 await assert.rejects(read({}),{code:'NOTIFICATIONS_CORRUPT'});
 db=new DatabaseSync(join(input.runDir,'run.sqlite'));db.prepare('UPDATE header SET value=?').run(header);db.close();
 db=new DatabaseSync(join(input.runDir,'run.sqlite'));db.prepare("DELETE FROM notifications WHERE kind='run-terminal'").run();db.close();
 await assert.rejects(read({}),{code:'NOTIFICATIONS_CORRUPT'});
 db=new DatabaseSync(join(input.runDir,'run.sqlite'));db.prepare('UPDATE header SET value=?').run('{broken');db.close();
 await assert.rejects(read({}),{code:'NOTIFICATIONS_CORRUPT'});
 assert.ok(root);
});
