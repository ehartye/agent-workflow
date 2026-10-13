/** @lane merge
 * @subject engine/background.mjs
 * @subject engine/background-child.mjs
 * @subject engine/controller.mjs
 * @subject engine/cli.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,writeFile,readFile,mkdir,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readRun,requestControl} from '../engine/controller.mjs';

const exec=promisify(execFile);
async function until(read,predicate){
  const deadline=Date.now()+6000;
  while(Date.now()<deadline){const value=await read().catch(()=>null);if(value&&predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,20));}
  throw new Error('Background outcome not observed');
}

test('detached controller survives launcher exit, pauses durably and resumes from saved script',async t=>{
  const background=await import('../engine/background.mjs').catch(()=>null);
  assert.equal(typeof background?.startBackground,'function');
  const base=await mkdtemp(join(tmpdir(),'workflow-background-'));
  t.after(()=>rm(base,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
  const runDir=join(base,'run');const input=join(base,'input.json');
  const defaults={model:'fixture-model',effort:'low',maxAttempts:2};
  await writeFile(input,JSON.stringify({runDir,sessionId:'original',codex:process.execPath,cwd:base,defaults,concurrency:1,script:'export const meta={name:"background",description:"proof"};return await parallel([()=>agent("A"),()=>agent("B")]);'}));
  const launch=async()=>JSON.parse((await exec(process.execPath,[fileURLToPath(new URL('./fixtures/engine-launch.mjs',import.meta.url)),input],{timeout:8000,windowsHide:true})).stdout);
  const receipt=await launch();
  assert.equal(receipt.status,'running');
  await until(()=>readRun(runDir),state=>state.workers.some(worker=>worker.status==='running'));
  const requested=JSON.parse((await exec(process.execPath,[fileURLToPath(new URL('../engine/cli.mjs',import.meta.url)),'--run',runDir,'--session','original','--generation','1','--action','pause'],{timeout:3000,windowsHide:true})).stdout);
  assert.equal(requested.action,'pause');
  const paused=await until(()=>readRun(runDir),state=>state.status==='paused');
  assert.deepEqual(paused.launch.defaults,defaults);
  assert.deepEqual(JSON.parse(await readFile(join(base,'backend-defaults.json'),'utf8')),defaults);
  assert.equal(paused.attempts,1);assert.equal(paused.workers[0].result,'A');
  const status=JSON.parse((await exec(process.execPath,[fileURLToPath(new URL('../engine/cli.mjs',import.meta.url)),'--run',runDir,'--status'],{timeout:3000,windowsHide:true})).stdout);
  assert.equal(status.status,'paused');
  await until(()=>readFile(receipt.resultPath,'utf8'),()=>true);
  await writeFile(input,JSON.stringify({runDir,sessionId:'original',resume:true}));
  const resumed=await launch();assert.equal(resumed.generation,2);
  const completed=await until(()=>readRun(runDir),state=>state.status==='completed');
  assert.deepEqual(completed.launch.defaults,defaults);
  assert.deepEqual(JSON.parse(await readFile(join(base,'backend-defaults.json'),'utf8')),defaults);
  assert.deepEqual(completed.result,['A','B']);assert.equal(completed.coverage.cached,1);assert.equal(completed.attempts,2);
  await until(()=>readFile(resumed.resultPath,'utf8'),()=>true);
  await writeFile(input,JSON.stringify({runDir,sessionId:'original',resume:true,defaults:{maxAttempts:3}}));
  const overridden=await launch();assert.equal(overridden.generation,3);
  const replayed=await until(()=>readRun(runDir),state=>state.generation===3&&state.status==='completed');
  assert.deepEqual(replayed.launch.defaults,{...defaults,maxAttempts:3});
  assert.deepEqual(JSON.parse(await readFile(join(base,'backend-defaults.json'),'utf8')),{...defaults,maxAttempts:3});
  await until(()=>readFile(overridden.resultPath,'utf8'),()=>true);
});

for(const mode of ['fail','slow'])test(`launcher ${mode} admission preserves failure without worker dispatch`,async t=>{
  const background=await import('../engine/background.mjs').catch(()=>null);
  assert.equal(typeof background?.startBackground,'function');
  const base=await mkdtemp(join(tmpdir(),'workflow-background-failure-'));
  t.after(()=>rm(base,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
  const cwd=join(base,mode);await mkdir(cwd);const runDir=join(base,'run');
  await assert.rejects(background.startBackground({runDir,sessionId:'s',codex:process.execPath,cwd,script:'export const meta={name:"failure",description:"proof"};return await agent("A");'},
    {runnerPath:fileURLToPath(new URL('./fixtures/engine-background.mjs',import.meta.url)),startupMs:mode==='slow'?100:3000}),{code:mode==='slow'?'START_TIMEOUT':'BACKGROUND_FAILED'});
  const files=await until(()=>readdir(runDir),files=>files.some(file=>file.startsWith('finish-')));
  const result=await readFile(join(runDir,files.find(file=>file.startsWith('finish-'))),'utf8');
  assert.equal(JSON.parse(result).status,'failed');assert.doesNotMatch(result,/REVIEW_SECRET_SENTINEL|private@example/);
  await assert.rejects(stat(join(cwd,'dispatched')),{code:'ENOENT'});
});
