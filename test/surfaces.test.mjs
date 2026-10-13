/** @lane merge
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request } from 'node:http';
import { startService } from '../src/service.mjs';
import { resolveWorkflow, saveWorkflow } from '../src/registry.mjs';
import { setMode, promptContext } from '../src/mode.mjs';

test('loopback service authenticates and forwards every durable run action', async t => {
 const dataDir = await mkdtemp(path.join(tmpdir(), 'workflow-service-'));
 const calls = []; const run = { id:'run-1',status:'running', workers:[], approvals:[] };
 const manager = { start:async input => { calls.push(['start',input]); return run; }, list:async()=>[run], get:async()=>run, events:async(id,since)=>[{seq:since+1,type:'log'}], control:async(...args)=>{calls.push(args);return run;}, approve:async(...args)=>{calls.push(args);return run;}, shutdown:async()=>{} };
 const service = await startService({dataDir,manager});
 t.after(async()=>{ await service.close(); await rm(dataDir,{recursive:true,force:true}); });
 const req = (route, init = {}) => fetch(service.url+route,{...init,headers:{authorization:`Bearer ${service.token}`,'content-type':'application/json',...init.headers}});
 assert.equal((await fetch(service.url+'/api/runs')).status,401);
 assert.equal((await req('/api/runs',{headers:{authorization:'Bearer wrong'}})).status,401);
 const wrongHost=await new Promise((resolve,reject)=>{const connection=request(service.url+'/api/runs',{headers:{host:'evil.test'}},response=>{response.resume();resolve(response.statusCode);});connection.on('error',reject);connection.end();});assert.equal(wrongHost,403);
 assert.equal((await req('/api/runs',{headers:{origin:'https://evil.test'}})).status,403);
 const page=await req('/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(page.headers.get('referrer-policy'),'no-referrer');
 assert.equal((await req('/api/runs',{method:'POST',body:JSON.stringify({script:'return 1',cwd:dataDir})})).status,202);
 assert.equal((await req('/api/runs/run-1/events?since=3')).status,200);
 for(const action of ['pause','stop','resume','cancel-worker','restart-worker','steer']) assert.equal((await req('/api/runs/run-1/control',{method:'POST',body:JSON.stringify({action,options:{workerId:'w',text:'x'}})})).status,200);
 assert.equal((await req('/api/runs/run-1/approve',{method:'POST',body:JSON.stringify({approvalId:'a',decision:'decline'})})).status,200);
 assert.deepEqual(calls,[['start',{script:'return 1',cwd:dataDir}],...['pause','stop','resume','cancel-worker','restart-worker','steer'].map(action=>['run-1',action,{workerId:'w',text:'x'}]),['run-1','a','decline']]);
 assert.equal((await req('/api/runs',{method:'POST',body:'{broken'})).status,400);
 assert.equal((await req('/api/runs',{method:'POST',body:JSON.stringify({script:'x'.repeat(1100000)})})).status,413);
});

test('saved workflow resolves closest project then personal then plugin, and refuses overwrite/traversal/symlink', async t => {
 const base = await mkdtemp(path.join(tmpdir(),'workflow-registry-')); t.after(()=>rm(base,{recursive:true,force:true}));
 const cwd = path.join(base,'project','nested'); const homeDir = path.join(base,'home'); const workflowsDir=path.join(base,'plugin');
 for(const dir of [path.join(base,'project','.agents','workflows'),path.join(cwd,'.agents','workflows'),path.join(homeDir,'.agents','workflows'),workflowsDir]) await mkdir(dir,{recursive:true});
 await mkdir(path.join(base,'project','.git'));
 await writeFile(path.join(workflowsDir,'audit.js'),'plugin'); await writeFile(path.join(homeDir,'.agents','workflows','audit.js'),'personal'); await writeFile(path.join(base,'project','.agents','workflows','audit.js'),'project'); await writeFile(path.join(cwd,'.agents','workflows','audit.js'),'closest');
 assert.equal((await resolveWorkflow('audit',{cwd,homeDir,workflowsDir})).script,'closest');
 assert.equal((await resolveWorkflow('personal:audit',{cwd,homeDir,workflowsDir})).script,'personal');
 assert.equal((await resolveWorkflow('plugin:audit',{cwd,homeDir,workflowsDir})).script,'plugin');
 await assert.rejects(saveWorkflow('project:audit','new',{cwd,homeDir,workflowsDir}),/exists/i);
 await assert.rejects(resolveWorkflow('../audit',{cwd,homeDir,workflowsDir}),/name/i);
 try { await symlink(path.join(workflowsDir,'audit.js'),path.join(cwd,'.agents','workflows','unsafe.js')); } catch(error) { if(error.code==='EPERM') return; throw error; }
 await assert.rejects(resolveWorkflow('unsafe',{cwd,homeDir,workflowsDir}),/symlink/i);
});

test('project lookup stops at closest git root and keeps home workflows personal',async t=>{
 const homeDir=await mkdtemp(path.join(tmpdir(),'workflow-home-'));t.after(()=>rm(homeDir,{recursive:true,force:true}));
 const cwd=path.join(homeDir,'repo','package');await mkdir(cwd,{recursive:true});await mkdir(path.join(homeDir,'repo','.git'));await mkdir(path.join(homeDir,'.agents','workflows'),{recursive:true});await writeFile(path.join(homeDir,'.agents','workflows','audit.js'),'personal');
 const resolved=await resolveWorkflow('audit',{cwd,homeDir,workflowsDir:path.join(homeDir,'plugin')});assert.equal(resolved.scope,'personal');await assert.rejects(resolveWorkflow('project:audit',{cwd,homeDir,workflowsDir:path.join(homeDir,'plugin')}),/not found/);
});

test('opt-in prompt routing is scoped and cannot recursively route workers or tool output', async t => {
 const dataDir=await mkdtemp(path.join(tmpdir(),'workflow-mode-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
 const input={session_id:'s1',cwd:dataDir,prompt:'review my code',role:'user'};
 assert.equal(await promptContext(input,{dataDir,env:{}}),null);
 await setMode('on',{dataDir,scope:'session',sessionId:'s1'});
 assert.match(await promptContext(input,{dataDir,env:{}}),/workflow/i);
 assert.equal(await promptContext({...input,session_id:'s2'},{dataDir,env:{}}),null);
 assert.equal(await promptContext(input,{dataDir,env:{AGENT_WORKFLOW_WORKER:'1'}}),null);
 assert.equal(await promptContext({...input,role:'tool'},{dataDir,env:{}}),null);
 await setMode('off',{dataDir,scope:'session',sessionId:'s1'});
 assert.equal(await promptContext(input,{dataDir,env:{}}),null);
});
