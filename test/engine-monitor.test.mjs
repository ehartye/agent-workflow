/** @lane merge
 * @subject engine/monitor-server.mjs
 * @subject engine/monitor-data.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {runWorkflow} from '../engine/controller.mjs';

const meta='export const meta={name:"Monitor",description:"Real run"};\n';
const backend=execute=>({identity:'monitor-fixture',execute,close:async()=>({serverExited:true,descendants:'notVerified'})});
async function setup(t){
  const runDir=await mkdtemp(join(tmpdir(),'workflow-monitor-'));
  t.after(()=>rm(runDir,{recursive:true,force:true,maxRetries:10,retryDelay:50}));
  const module=await import('../engine/monitor-server.mjs').catch(()=>null);
  assert.ok(module?.createMonitor,'Monitor surface must exist');
  return{runDir,createMonitor:module.createMonitor};
}
test('monitor binds loopback and protects run data and controls with host origin and bearer checks',async t=>{
  const {runDir,createMonitor}=await setup(t);
  await runWorkflow({runDir,sessionId:'s',script:meta+'return 1;',backend:backend(async()=>{})});
  const monitor=await createMonitor({runDir});t.after(()=>monitor.close());
  const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  assert.equal(url.hostname,'127.0.0.1');assert(token.length>=32);
  const get=(path,headers={})=>fetch(url.origin+path,{headers:{Authorization:`Bearer ${token}`,...headers}});
  assert.equal((await fetch(url.origin+'/api/run')).status,401);
  const hostile=await new Promise((resolve,reject)=>{const req=request(url.origin+'/api/run',{headers:{Host:'attacker.invalid',Authorization:`Bearer ${token}`}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
  assert.equal(hostile,403);
  assert.equal((await get('/api/run',{Origin:'https://attacker.invalid'})).status,403);
  assert.equal((await get('/api/run')).status,200);
  const page=await fetch(url.origin+'/');assert.equal(page.status,200);
  assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
  assert.equal((await get('/api/unknown')).status,404);
  const bad=await fetch(url.origin+'/api/control',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({generation:1,action:'restart-worker'})});
  assert.equal(bad.status,400);
});
test('monitor previews are bounded and full evidence is generation-bound and deliberate',async t=>{
  const {runDir,createMonitor}=await setup(t);
  const evidence='<img src=x onerror=alert(1)>'+ 'x'.repeat(12000);
  const script=meta+'return await agent(args);';
  await runWorkflow({runDir,sessionId:'s',script,args:evidence,backend:backend(async()=>({value:evidence,terminalObserved:true}))});
  const monitor=await createMonitor({runDir});t.after(()=>monitor.close());
  const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  const get=path=>fetch(url.origin+path,{headers:{Authorization:`Bearer ${token}`}});
  const summary=await (await get('/api/run')).json();
  assert(summary.workers[0].prompt.length<2000);assert(summary.truncations.includes('result'));
  assert(summary.workers[0].truncations.includes('result'));assert.equal(summary.script,undefined);
  assert.equal((await (await get('/api/worker/0?generation=1')).json()).result,evidence);
  assert.equal(await (await get('/api/script?generation=1')).text(),script);
  assert.equal((await (await get('/api/result?generation=1')).json()).result,evidence);
  assert.equal((await get('/api/worker/0?generation=2')).status,409);
  assert.equal((await get('/api/worker/0')).status,400);
});

test('activity HTTP reads require authentication and generation and disclose bounded history coverage',async t=>{
  const {runDir,createMonitor}=await setup(t);
  await runWorkflow({runDir,sessionId:'s',script:meta+'return await agent("Read");',backend:backend(async({onEvent})=>{
    for(let i=0;i<270;i++)onEvent({method:'item/commandExecution/outputDelta',params:{threadId:'thread',turnId:'turn',itemId:'command',delta:String(i)}});
    return{value:'done',terminalObserved:true};
  })});
  const monitor=await createMonitor({runDir});t.after(()=>monitor.close());
  const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  const get=path=>fetch(url.origin+path,{headers:{Authorization:`Bearer ${token}`}});
  assert.equal((await fetch(url.origin+'/api/activity?generation=1&position=0')).status,401);
  assert.equal((await get('/api/activity?position=0')).status,400);
  assert.equal((await get('/api/activity?generation=1')).status,400);
  assert.equal((await get('/api/activity?generation=1&position=0&limit=101')).status,400);
  assert.equal((await get('/api/activity?generation=2&position=0')).status,409);
  assert.equal((await get('/api/activity?generation=1&position=1')).status,404);
  const first=await (await get('/api/activity?generation=1&position=0&limit=10')).json();
  assert.equal(first.observed,270);assert.equal(first.retained,256);assert.equal(first.dropped,14);assert.equal(first.records.length,10);
  const second=await (await get(`/api/activity?generation=1&position=0&after=${first.nextCursor}&limit=10`)).json();
  assert.equal(second.records[0].output,'24');
  const db=new DatabaseSync(join(runDir,'run.sqlite'));
  try{db.exec('DELETE FROM activity; DELETE FROM activity_counts');}finally{db.close();}
  const corrupt=await get('/api/activity?generation=1&position=0');
  assert.equal(corrupt.status,500);assert.equal((await corrupt.json()).error.code,'ACTIVITY_CORRUPT');
});
test('monitor pause persists a receipt and resume uses the server-owned session and observed generation',async t=>{
  const {runDir,createMonitor}=await setup(t);
  let started,finish;const running=new Promise(resolve=>{started=resolve;});const gate=new Promise(resolve=>{finish=resolve;});
  const work=runWorkflow({runDir,sessionId:'owned-session',launch:{codex:process.execPath,cwd:runDir,backend:'configured'},script:meta+'return await agent("A");',backend:backend(async()=>{started();await gate;return{value:'A',terminalObserved:true};})});
  await running;
  const resumes=[];
  const monitor=await createMonitor({runDir,start:async input=>{resumes.push(input);return{status:'running',generation:2};}});t.after(()=>monitor.close());
  const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  const post=(path,body)=>fetch(url.origin+path,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const receipt=await (await post('/api/control',{generation:1,action:'pause'})).json();
  assert.equal(receipt.status,'pending');
  await new Promise(resolve=>setTimeout(resolve,80));finish();assert.equal((await work).status,'paused');
  assert.equal((await post('/api/resume',{generation:2})).status,409);
  assert.equal((await post('/api/resume',{generation:1})).status,202);
  assert.equal(resumes.length,1);assert.equal(resumes[0].sessionId,'owned-session');assert.equal(resumes[0].expectedGeneration,1);
});

test('dashboard CLI returns an authenticated URL and its monitor survives launcher exit',async t=>{
  const {runDir}=await setup(t);
  await runWorkflow({runDir,sessionId:'s',script:meta+'return 1;',backend:backend(async()=>{})});
  const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../engine/cli.mjs',import.meta.url)),'--dashboard','--run',runDir],{timeout:15000,windowsHide:true});
  const {url}=JSON.parse(stdout);const parsed=new URL(url),token=new URLSearchParams(parsed.hash.slice(1)).get('token');
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  t.after(()=>fetch(parsed.origin+'/api/close',{method:'POST',headers,body:'{}'}));
  const response=await fetch(parsed.origin+'/api/run',{headers});
  assert.equal(response.status,200);assert.equal((await response.json()).status,'completed');
});
