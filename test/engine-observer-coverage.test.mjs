/** @lane merge
 * @subject engine/observer-coverage.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {watchRun} from '../engine/watch.mjs';
const module=await import('../engine/observer-coverage.mjs').catch(()=>({}));
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'workflow-observer-'));t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:10}));return join(dir,'coverage.json');}
const identity={runId:'run-one',generation:1,observer:'coordinator',launchedAt:'2026-10-15T00:00:00.000Z'};

test('consumer coverage preserves preattachment gaps and distinguishes terminal replay',async t=>{
 const file=await fixture(t);assert.equal(typeof module.openObserverCoverage,'function');
 const coverage=await module.openObserverCoverage(file,identity,{after:0});
 await coverage.processed({kind:'attached',generation:1,cursor:0,status:'failed'});
 await coverage.processed({kind:'worker-terminal',generation:1,seq:1,status:'failed',position:0,attempt:1,prompt:'secret'});
 await coverage.processed({kind:'run-terminal',generation:1,seq:2,status:'failed'});
 await coverage.finish('terminal');
 const saved=await module.readObserverCoverage(file);
 assert.equal(saved.lastProcessedCursor,2);assert.equal(saved.connections[0].preAttachmentCoverage,'missing');assert.equal(saved.terminal.basis,'replay');
 assert.equal(saved.connections[0].status,'terminal');assert.doesNotMatch(await readFile(file,'utf8'),/secret|prompt/);
});

test('failed downstream processing leaves event unacknowledged and reconnect replays from actual cursor',async t=>{
 const file=await fixture(t);assert.equal(typeof module.openObserverCoverage,'function');
 const first=await module.openObserverCoverage(file,identity,{after:0});
 const page={generation:1,status:'failed',events:[{kind:'worker-terminal',generation:1,seq:1,status:'failed'},{kind:'run-terminal',generation:1,seq:2,status:'failed'}],nextCursor:2,terminal:true,workers:[]};
 const result=await watchRun('/fixture',{sessionId:'origin',generation:1},{read:async()=>page,write:async record=>{if(record.seq===1)throw Object.assign(Error('closed'),{code:'EPIPE'});await first.processed(record);}});
 await first.finish(result.reason);assert.equal((await module.readObserverCoverage(file)).lastProcessedCursor,0);
 const second=await module.openObserverCoverage(file,identity,{after:0});
 await watchRun('/fixture',{sessionId:'origin',generation:1},{read:async()=>page,write:record=>second.processed(record)});await second.finish('terminal');
 const saved=await module.readObserverCoverage(file);assert.equal(saved.connections.length,2);assert.equal(saved.connections[0].status,'disconnected');assert.equal(saved.lastProcessedCursor,2);assert.equal(saved.connections[1].priorGapCoverage,'missing');
});

test('coverage refuses mismatched identity, skipped acknowledgment baseline and invalid records without overwrite',async t=>{
 const file=await fixture(t);assert.equal(typeof module.openObserverCoverage,'function');
 const coverage=await module.openObserverCoverage(file,identity,{after:0});const before=await readFile(file,'utf8');
 for(const bad of [{...identity,generation:2},{...identity,observer:'other'}])await assert.rejects(module.openObserverCoverage(file,bad,{after:0}));
 await assert.rejects(module.openObserverCoverage(file,identity,{after:5}));
 await assert.rejects(coverage.processed({kind:'attached',generation:2,cursor:0,status:'running'}));
 assert.equal(await readFile(file,'utf8'),before);
 await coverage.processed({kind:'attached',generation:1,cursor:0,status:'running'});
 await assert.rejects(coverage.processed({kind:'run-terminal',generation:1,seq:-1,status:'completed'}));
 await assert.rejects(coverage.finish('terminal'),/Terminal requires a processed run-terminal record/);
 await coverage.finish('aborted');
});

test('coverage bounds connection history, labels unclosed attempts unknown and never rewrites old evidence',async t=>{
 const file=await fixture(t);assert.equal(typeof module.openObserverCoverage,'function');
 let coverage=await module.openObserverCoverage(file,identity,{after:0});
 await coverage.processed({kind:'attached',generation:1,cursor:0,status:'running'});
 for(let i=0;i<36;i++){coverage=await module.openObserverCoverage(file,identity,{after:0});await coverage.finish('aborted');}
 const saved=await module.readObserverCoverage(file);assert.equal(saved.connections.length,32);assert.equal(saved.droppedConnections,5);assert.equal(saved.unclosedConnections,1);assert.equal(saved.launchedAt,identity.launchedAt);assert.ok(Buffer.byteLength(await readFile(file))<=65536);
});

test('coverage rejects corrupt existing files without resetting their cursor',async t=>{
 const file=await fixture(t);assert.equal(typeof module.openObserverCoverage,'function');await writeFile(file,'{"version":1}');
 await assert.rejects(module.openObserverCoverage(file,identity,{after:0}));assert.equal(await readFile(file,'utf8'),'{"version":1}');
});

test('coverage rejects injected payloads and impossible terminal or connection facts without modifying evidence',async t=>{
 const file=await fixture(t);const coverage=await module.openObserverCoverage(file,identity,{after:0});await coverage.processed({kind:'attached',generation:1,cursor:0,status:'running'});
 const valid=JSON.parse(await readFile(file,'utf8'));
 for(const mutate of [state=>{state.prompt='secret';},state=>{state.connections[0].output='secret';},state=>{state.connections[0].terminalAtAttachment='true';},state=>{state.connections[0].idleWarnings=-1;},state=>{state.connections=[];state.terminal={seq:0,status:'completed',basis:'replay',processedAt:identity.launchedAt};}]){
  const state=structuredClone(valid);mutate(state);const body=JSON.stringify(state);await writeFile(file,body);
  await assert.rejects(module.readObserverCoverage(file));await assert.rejects(module.openObserverCoverage(file,identity,{after:0}));assert.equal(await readFile(file,'utf8'),body);
 }
});
