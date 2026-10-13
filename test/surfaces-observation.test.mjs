/** @lane merge
 * @subject bin/agent-workflow.mjs
 * @subject src/service.mjs
 * @subject src/presentation.mjs
 * @subject src/client.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import http from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {startService} from '../src/service.mjs';
const execute=promisify(execFile);
async function fixture(t){
 const dataDir=await mkdtemp(path.join(tmpdir(),'workflow-observation-'));const large='large private evidence '.repeat(75000);
 const run={id:'run-large',status:'stopped',meta:{name:'Readiness',description:'Actual observation boundary',phases:[{title:'Inspect'}]},cwd:dataDir,generation:0,budget:null,permissions:{sandbox:'read-only'},usage:{outputTokens:4},coverage:{requested:2,completed:0,unverified:1},workers:[{id:'worker-1',label:'capture',phase:'Inspect',status:'unknown',prompt:large,error:{code:'CANCELLED',outcome:'unknown',message:'Interrupted'},usage:{outputTokens:4}},{id:'worker-2',label:'station',phase:'Inspect',status:'cancelled',prompt:large}],approvals:[],events:[{seq:1,type:'worker-event',workerId:'worker-1',event:{type:'command/output',text:large}},{seq:2,type:'worker-unknown',workerId:'worker-1'},{seq:3,type:'run-stopped'}],paths:{snapshot:'retained-run.json',events:'retained-events.json'}};
 const manager={ready:Promise.resolve(),list:async()=>[run],get:async id=>id===run.id?run:null,start:async()=>run,events:async(id,since)=>run.events.filter(e=>e.seq>since),shutdown:async()=>{}};
 const service=await startService({dataDir,manager});t.after(async()=>{await service.close();await rm(dataDir,{recursive:true,force:true});});
 const get=route=>fetch(service.url+route,{headers:{authorization:'Bearer '+service.token}});
 return {dataDir,run,get,service};
}
test('summary and monitor reads omit large histories while preserving uncertain slots and evidence access',async t=>{
 const {run,get}=await fixture(t);
 const listText=await (await get('/api/runs?view=summary')).text();assert(Buffer.byteLength(listText)<65536,'Routine list must stay below a normal client buffer');const list=JSON.parse(listText);assert.equal(list[0].workerCounts.unknown,1);assert.equal(list[0].totalWorkers,2);assert.equal(list[0].workers[0].prompt,undefined);
 const monitorText=await (await get('/api/runs/run-large?view=monitor')).text();assert(Buffer.byteLength(monitorText)<65536,'Monitor refresh must not transfer command history or prompts');const monitor=JSON.parse(monitorText);assert.equal(monitor.events,undefined);assert.equal(monitor.workers[0].prompt,undefined);assert.equal(monitor.workers[0].status,'unknown');assert.equal(monitor.eventCount,3);assert.equal(monitor.lastEventSequence,3);assert.equal(monitor.evidence.paths.snapshot,'retained-run.json');
 const worker=await (await get('/api/runs/run-large/workers/worker-1')).json();assert.equal(worker.worker.prompt,run.workers[0].prompt,'Deliberate detail must retain full evidence');assert.equal((await get('/api/runs/run-large/workers/missing')).status,404);
 const full=await (await get('/api/runs/run-large')).json();assert.equal(full.events[0].event.text,run.events[0].event.text,'Existing full API contract remains');
 run.workers[1].status='completed';run.events.push({seq:4,type:'worker-cached',workerId:'worker-2',generation:0});const replay=await (await get('/api/runs/run-large?view=monitor')).json();assert.equal(replay.workers[1].cached,true,'Replay cache remains visible without loading journals');assert.equal(replay.metaTruncated,false);
});
test('compact event pages expose truncation and cursors, with full event access and strict cursor bounds',async t=>{
 const {run,get}=await fixture(t);const page=await (await get('/api/runs/run-large/events?view=compact&since=0&limit=1')).json();assert.equal(page.events.length,1);assert.equal(page.events[0].event.truncated,true);assert.equal(page.nextCursor,1);assert.equal(page.hasMore,true);assert.equal(page.total,3);
 const next=await (await get('/api/runs/run-large/events?view=compact&since=1&limit=2')).json();assert.deepEqual(next.events.map(e=>e.seq),[2,3]);assert.equal(next.hasMore,false);assert.equal(next.nextCursor,3);
 const event=await (await get('/api/runs/run-large/events/1')).json();assert.deepEqual(event,run.events[0]);assert.equal((await get('/api/runs/run-large/events/999')).status,404);
 for(const query of ['limit=0','limit=101','since=-1','limit=1.5'])assert.equal((await get('/api/runs/run-large/events?view=compact&'+query)).status,400);
});
test('CLI compact status fits a bounded observer without losing uncertainty or artifact paths',async t=>{
 const {dataDir,service}=await fixture(t);const routes=[];service.server.on('request',req=>routes.push(req.url));const cli=fileURLToPath(new URL('../bin/agent-workflow.mjs',import.meta.url));
 const output=await execute(process.execPath,[cli,'status','run-large','--compact','--data-dir',dataDir],{windowsHide:true,timeout:10000,maxBuffer:65536});const value=JSON.parse(output.stdout);assert.equal(value.status,'stopped');assert.equal(value.workerCounts.unknown,1);assert.equal(value.workers[0].error.value.outcome,'unknown');assert.equal(value.evidence.paths.snapshot,'retained-run.json');assert.equal(value.events,undefined);
 const events=await execute(process.execPath,[cli,'events','run-large','--compact','--limit','1','--data-dir',dataDir],{windowsHide:true,timeout:10000,maxBuffer:65536});assert.equal(JSON.parse(events.stdout).hasMore,true);
 const admission=await execute(process.execPath,[cli,'run','--script','test script','--compact','--data-dir',dataDir],{windowsHide:true,timeout:10000,maxBuffer:65536}).catch(e=>{throw new Error(e.code);});assert.equal(JSON.parse(admission.stdout).workerCounts.unknown,1);
 routes.length=0;const waited=await execute(process.execPath,[cli,'run','--script','test script','--compact','--wait','--data-dir',dataDir],{windowsHide:true,timeout:10000,maxBuffer:65536}).catch(e=>{throw new Error(e.code);});assert.equal(JSON.parse(waited.stdout).status,'stopped');assert(routes.includes('/api/runs/run-large?view=summary'),'Compact waiting must poll the bounded HTTP view');assert(!routes.includes('/api/runs/run-large'));
});

test('compact events remain bounded with an older supervisor that ignores the view query',async t=>{
 const {run}=await fixture(t),dataDir=await mkdtemp(path.join(tmpdir(),'workflow-legacy-observer-')),token='c'.repeat(64);
 const server=http.createServer((req,res)=>{if(req.headers.authorization!=='Bearer '+token){res.writeHead(401);res.end('{}');return;}res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url.startsWith('/api/health')?{ok:true}:req.url.includes('/events')?run.events:run));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dataDir,{recursive:true,force:true});});await writeFile(path.join(dataDir,'service.json'),JSON.stringify({url:'http://127.0.0.1:'+server.address().port,token,pid:process.pid}));
 const cli=fileURLToPath(new URL('../bin/agent-workflow.mjs',import.meta.url));const output=await execute(process.execPath,[cli,'events','run-large','--compact','--limit','1','--data-dir',dataDir],{windowsHide:true,timeout:10000,maxBuffer:65536}).catch(e=>{throw new Error(e.code);});const page=JSON.parse(output.stdout);assert.equal(page.events.length,1);assert.equal(page.events[0].event.truncated,true);assert.equal(page.legacyFullRead,true);assert.equal(page.hasMore,true);
});

test('accepted structured metadata and worker labels cannot escape bounded read views',async t=>{
 const {run,get}=await fixture(t);run.meta.phases[0].detail={notes:'private-evidence '.repeat(12000)};run.meta.phases[0].model=['model '.repeat(20000)];run.workers[0].label={notes:'worker '.repeat(20000)};run.workers[0].phase={notes:'phase '.repeat(20000)};
 for(const route of ['/api/runs?view=summary','/api/runs/run-large?view=monitor']){const raw=await(await get(route)).text();assert(Buffer.byteLength(raw)<65536,'Accepted JSON-shaped fields must be bounded too');const view=Array.isArray(JSON.parse(raw))?JSON.parse(raw)[0]:JSON.parse(raw);assert.equal(view.metaTruncated,true);assert.equal(typeof view.workers[0].label,'string');}
 assert.deepEqual((await(await get('/api/runs/run-large')).json()).meta.phases[0].detail,run.meta.phases[0].detail);
});

test('monitor preserves recovered tool failures with bounded diagnostics and full event evidence',async t=>{
 const {run,get}=await fixture(t);run.events.push({seq:4,type:'worker-event',generation:0,workerId:'worker-1',event:{type:'item/completed',params:{item:{type:'commandExecution',id:'command-1',status:'failed',exitCode:-1,aggregatedOutput:'setup refresh had errors '+ 'diagnostic '.repeat(2000)}}}});run.events.push({seq:5,type:'worker-event',generation:0,workerId:'worker-1',event:{type:'item/completed',params:{item:{type:'commandExecution',id:'command-2',status:'completed',exitCode:0,aggregatedOutput:'Recovered with successful read'}}}});
 const view=await(await get('/api/runs/run-large?view=monitor')).json();assert.equal(view.workers[0].toolFailures,1);assert.equal(view.workers[0].lastToolFailure.sequence,4);assert.equal(view.workers[0].lastToolFailure.message.truncated,true);assert.match(view.workers[0].lastToolFailure.message.preview,/setup refresh/);assert.equal(view.workers[0].status,'unknown');assert.deepEqual(await(await get('/api/runs/run-large/events/4')).json(),run.events[3]);
});

test('tool failure observations cover exec records, repeated item IDs and non-array MCP content',async t=>{
 const {run,get}=await fixture(t);run.events.push({seq:4,type:'worker-event',generation:0,workerId:'worker-1',event:{type:'item.completed',threadId:'attempt-1',item:{type:'command_execution',id:'item_0',status:'completed',exit_code:1,aggregated_output:'First check failed'}}},{seq:5,type:'worker-event',generation:0,workerId:'worker-1',event:{type:'item.completed',threadId:'attempt-2',item:{type:'command_execution',id:'item_0',status:'completed',exit_code:2,aggregated_output:'Second check failed'}}});
 let response=await get('/api/runs/run-large?view=monitor'),view=await response.json();assert.equal(response.status,200);assert.equal(view.workers[0].toolFailures,2);assert.equal(view.workers[0].lastToolFailure.message.value,'Second check failed');
 run.events.push({seq:6,type:'worker-event',generation:0,workerId:'worker-1',event:{type:'item/completed',params:{item:{type:'mcpToolCall',id:'item_0',status:'failed',result:{content:'Retained non-array error evidence'}}}}});response=await get('/api/runs/run-large?view=monitor');view=await response.json();assert.equal(response.status,200,'Unusual retained content must not break the monitor');assert.equal(view.workers[0].toolFailures,3);assert.deepEqual(view.workers[0].lastToolFailure.message.value,{content:'Retained non-array error evidence'});
});
