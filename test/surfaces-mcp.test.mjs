import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startService } from '../src/service.mjs';
test('stdio MCP initializes, lists tools and returns durable admission without waiting for workers',async t=>{
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'workflow-mcp-'));const starts=[];const run={id:'async-run',status:'running',workers:[{id:'worker',status:'running',prompt:'full prompt'}],approvals:[]};const service=await startService({dataDir,manager:{start:async input=>{starts.push(input);return run;},get:async()=>run,list:async()=>[run],events:async()=>[],shutdown:async()=>{}}});
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../bin/agent-workflow.mjs',import.meta.url)),'mcp','--data-dir',dataDir],stderr:'pipe'});const client=new Client({name:'surface-test',version:'1'},{capabilities:{}});
 t.after(async()=>{await client.close();await service.close();await rm(dataDir,{recursive:true,force:true});});
 await client.connect(transport);const tools=await client.listTools();assert(tools.tools.some(x=>x.name==='workflow_start'));assert(tools.tools.some(x=>x.name==='workflow_approve'));const result=await client.callTool({name:'workflow_start',arguments:{script:'return 1',cwd:dataDir,quotaWaitMs:1500,stallRestarts:2}});assert.equal(result.isError,undefined);const value=JSON.parse(result.content[0].text);assert.equal(value.id,'async-run');assert.equal(value.status,'running');assert.equal(starts[0].quotaWaitMs,1500);assert.equal(starts[0].stallRestarts,2);
 const status=await client.callTool({name:'workflow_status',arguments:{id:'async-run'}});assert.equal(JSON.parse(status.content[0].text).workers[0].prompt,undefined);
 const worker=await client.callTool({name:'workflow_worker',arguments:{id:'async-run',workerId:'worker'}});assert.equal(JSON.parse(worker.content[0].text).worker.prompt,'full prompt');
 const invalid=await client.callTool({name:'workflow_start',arguments:{script:'return 1',cwd:dataDir,quotaWaitMs:3600001,stallRestarts:6}});assert.equal(invalid.isError,true);assert.equal(starts.length,1,'Invalid retry bounds must not reach the manager');
});
test('worker MCP refuses recursive admission before launching a service',async t=>{
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'workflow-recursion-'));const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../bin/agent-workflow.mjs',import.meta.url)),'mcp','--data-dir',dataDir],env:{AGENT_WORKFLOW_WORKER:'1'},stderr:'pipe'});const client=new Client({name:'worker-test',version:'1'},{capabilities:{}});t.after(async()=>{await client.close();await rm(dataDir,{recursive:true,force:true});});await client.connect(transport);const result=await client.callTool({name:'workflow_start',arguments:{script:"export const meta={name:'bad',description:'Recursive'}; return 1;",cwd:dataDir}});assert.equal(result.isError,true);assert.match(result.content[0].text,/worker.*recursive|recursive.*worker/i);await assert.rejects(stat(path.join(dataDir,'service.json')),error=>error.code==='ENOENT');
});
