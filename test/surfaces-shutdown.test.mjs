import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { RuntimeManager } from '../src/runtime/manager.mjs';
import { createCodexBackend } from '../src/workers/codex.mjs';
import { startService } from '../src/service.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,timeoutMs=5000){const end=Date.now()+timeoutMs;while(Date.now()<end){const value=await check();if(value)return value;await sleep(20);}throw new Error('Fixture condition did not become ready');}
test('service drains a real worker while an authenticated steering request remains in flight',async t=>{
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'workflow-shutdown-'));const cwd=path.join(dataDir,'project');await mkdir(cwd);const backend=createCodexBackend({executable:process.execPath,config:{executableArgs:[fileURLToPath(new URL('./fixtures/surface-pending-codex.mjs',import.meta.url))],connectTimeoutMs:3000}});const manager=new RuntimeManager({dataDir:path.join(dataDir,'runs'),backend});const service=await startService({dataDir,manager});let steering,closing;
 t.after(async()=>{await backend.shutdown();await manager.shutdown();service.server.closeAllConnections();await service.close();await steering;await closing;await rm(dataDir,{recursive:true,force:true});});
 const run=await manager.start({cwd,timeoutMs:30000,script:"export const meta={name:'shutdown',description:'Pending real control RPC'}; return await agent('wait');"});const worker=await until(async()=>{const snapshot=await manager.get(run.id);return snapshot.workers.find(worker=>worker.turnId);});
 steering=fetch(`${service.url}/api/runs/${run.id}/control`,{method:'POST',headers:{authorization:`Bearer ${service.token}`,'content-type':'application/json'},body:JSON.stringify({action:'steer',options:{workerId:worker.id,text:'New direction'}})}).then(async response=>({status:response.status,body:await response.json()}));
 await until(async()=> (await manager.events(run.id)).some(event=>event.event?.type==='fixture/steer-pending'));
 closing=service.close();assert.equal(service.close(),closing,'Concurrent close callers must await the same drain');assert.equal(service.server.listening,false,'New connections must stop before worker drain');const finished=await Promise.race([closing.then(()=>true),sleep(5000).then(()=>false)]);assert.equal(finished,true,'Shutdown must begin worker drain before waiting for in-flight HTTP controls');assert.equal(manager.closed,true);assert.equal(manager.executions.size,0);const response=await steering;assert.equal(response.status,400);assert(response.body.error);
});
