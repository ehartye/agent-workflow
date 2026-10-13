import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {startBackground} from '../engine/background.mjs';
import {readRun} from '../engine/controller.mjs';
import {createMonitor} from '../engine/monitor-server.mjs';
const root=await mkdtemp(join(tmpdir(),'workflow-smoke-')),runDir=join(root,'run');let monitor;
async function settled(receipt){for(let i=0;i<500;i++){try{await readFile(receipt.resultPath);return await readRun(runDir);}catch(error){if(error.code!=='ENOENT')throw error;}await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Smoke controller did not settle');}
try{
 const options={runnerPath:fileURLToPath(new URL('../test/fixtures/engine-background.mjs',import.meta.url))};
 const first=await settled(await startBackground({runDir,sessionId:'smoke',codex:process.execPath,cwd:root,script:'export const meta={name:"smoke",description:"Explicit offline backend fixture"};return await parallel([()=>agent("A"),()=>agent("B")]);'},options));
 assert.equal(first.status,'completed');assert.deepEqual(first.result,['A','B']);
 const replay=await settled(await startBackground({runDir,sessionId:'smoke',resume:true,expectedGeneration:1},options));assert.equal(replay.generation,2);assert.equal(replay.attempts,2);assert.equal(replay.coverage.cached,2);
 monitor=await createMonitor({runDir});const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token');assert.equal((await fetch(`${url.origin}/api/run`)).status,401);const response=await fetch(`${url.origin}/api/run`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status,200);assert.equal((await response.json()).generation,2);
 console.log(JSON.stringify({offline:true,backend:'explicit detached fixture',status:replay.status,attempts:[first.attempts,replay.attempts],cached:replay.coverage.cached,dashboardAuthentication:true}));
}finally{await monitor?.close();await rm(root,{recursive:true,force:true});}
