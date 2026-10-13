import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request, waitRun, readService } from '../src/client.mjs';
const exec=promisify(execFile);const bin=fileURLToPath(new URL('../bin/agent-workflow.mjs',import.meta.url));const fixture=fileURLToPath(new URL('./fixtures/surface-backend.mjs',import.meta.url));const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('detached supervisor survives CLI exit, streams a real fixture process, waits for approval and restores completed runs',async t=>{
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'workflow-daemon-'));const cli=async(...args)=>{const result=await exec(process.execPath,[bin,...args,'--data-dir',dataDir],{windowsHide:true,timeout:20000});return result.stdout;};
 t.after(async()=>{try{await request('/api/shutdown',{dataDir,method:'POST',body:{}});}catch{}await sleep(150);await rm(dataDir,{recursive:true,force:true});});
 const started=JSON.parse(await cli('start','--backend-fixture',fixture));assert(started.pid);assert.notEqual(started.pid,process.pid);assert(!started.token);
 const script="export const meta={name:'daemon',description:'Actual detached journey'}; return await agent('hello');";const admitted=JSON.parse(await cli('run','--script',script,'--cwd',dataDir,'--quota-wait','1500','--stall-restarts','2'));const completed=await waitRun(admitted.id,{dataDir,timeoutMs:10000});assert.equal(completed.status,'completed');assert.equal(completed.result,'fixture:hello');assert(completed.workers[0].pid);assert.equal(completed.usage.outputTokens,2);assert.equal(completed.quotaWaitMs,1500);assert.equal(completed.stallRestarts,2);assert(await readFile(completed.resultPath,'utf8'));
 const approvalScript="export const meta={name:'approval',description:'Wait for explicit decision'}; return await agent('approval');";const approval=JSON.parse(await cli('run','--script',approvalScript,'--cwd',dataDir,'--approvals','on-request'));let pending;for(let i=0;i<50;i++){const state=await request('/api/runs/'+approval.id,{dataDir});pending=state.approvals.find(a=>a.status==='pending');if(pending)break;await sleep(50);}assert(pending);await sleep(100);assert.equal((await request('/api/runs/'+approval.id,{dataDir})).status,'running');await cli('approve',approval.id,'--approval',pending.id,'--decision','decline');assert.equal((await waitRun(approval.id,{dataDir,timeoutMs:5000})).result,'decline');
 await cli('shutdown');for(let i=0;i<50&&await readService(dataDir);i++)await sleep(50);await cli('start','--backend-fixture',fixture);assert.equal((await request('/api/runs/'+admitted.id,{dataDir})).result,'fixture:hello');
 const url=await cli('dashboard');assert.match(url,/^http:\/\/127\.0\.0\.1:\d+\/#token=[a-f0-9]{64}\s*$/);
});
