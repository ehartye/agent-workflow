import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ensureService, request, waitRun, readService } from '../src/client.mjs';
import { pluginRoot } from '../src/paths.mjs';
const dataDir=await mkdtemp(path.join(os.tmpdir(),'agent-workflow-smoke-'));
try{
 await ensureService({dataDir,backendFixture:path.join(pluginRoot,'test','fixtures','surface-backend.mjs')});
 const admitted=await request('/api/runs',{dataDir,method:'POST',body:{cwd:dataDir,concurrency:2,script:"export const meta={name:'offline-smoke',description:'Real detached supervisor and explicit fixture worker processes'}; const rows=await parallel([()=>agent('one'),()=>agent('two')]); return {rows,complete:rows.every(row=>row!==null)};"}});
 const run=await waitRun(admitted.id,{dataDir,timeoutMs:10000});assert.equal(run.status,'completed');assert.deepEqual(run.result.rows,['fixture:one','fixture:two']);assert.equal(run.usage.outputTokens,4);assert(run.workers.every(w=>w.pid));
 process.stdout.write(JSON.stringify({offline:true,backend:'explicit test fixture processes',status:run.status,workers:run.workers.length,usage:run.usage,coverage:run.coverage})+'\n');
}finally{try{await request('/api/shutdown',{dataDir,method:'POST',body:{}});}catch{}for(let i=0;i<100&&await readService(dataDir);i++)await new Promise(resolve=>setTimeout(resolve,30));await rm(dataDir,{recursive:true,force:true});}
