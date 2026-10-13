import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { pluginRoot } from '../src/paths.mjs';
test('cold MCP exposes exact read-only setup instructions without dependencies or daemon effects',async t=>{
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'workflow-bootstrap-'));const transport=new StdioClientTransport({command:process.execPath,args:[path.join(pluginRoot,'bin','launch.mjs'),'mcp','--data-dir',dataDir],stderr:'pipe'});const client=new Client({name:'cold-install-test',version:'1'},{capabilities:{}});t.after(async()=>{await client.close();await rm(dataDir,{recursive:true,force:true});});
 await client.connect(transport);const listed=await client.listTools();assert.deepEqual(listed.tools.map(tool=>tool.name),['workflow_setup_info']);assert.equal(listed.tools[0].annotations.readOnlyHint,true);const result=await client.callTool({name:'workflow_setup_info',arguments:{}});assert.equal(result.isError,undefined);const info=JSON.parse(result.content[0].text);assert.equal(info.dataDir,dataDir);assert.equal(info.pluginRoot,path.resolve(pluginRoot));assert.equal(info.reason,'missing-runtime');assert.deepEqual(info.setupCommand.arguments,[path.join(pluginRoot,'bin','setup.mjs'),'--data-dir',dataDir]);assert.deepEqual(info.verifyCommand.arguments,[path.join(pluginRoot,'bin','launch.mjs'),'doctor','--data-dir',dataDir]);await assert.rejects(stat(path.join(dataDir,'service.json')),error=>error.code==='ENOENT');await assert.rejects(stat(path.join(dataDir,'runtime')),error=>error.code==='ENOENT');
});
test('changed runtime exposes setup information and preserves its existing pointer until explicit setup',async t=>{
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'workflow-changed-bootstrap-'));const runtimePath=path.join(dataDir,'runtime','old');await mkdir(path.join(runtimePath,'node_modules'),{recursive:true});const record={path:runtimePath,digest:'old-source',version:'old'};await writeFile(path.join(dataDir,'runtime.json'),JSON.stringify(record));const transport=new StdioClientTransport({command:process.execPath,args:[path.join(pluginRoot,'bin','launch.mjs'),'mcp','--data-dir',dataDir],stderr:'pipe'});const client=new Client({name:'changed-install-test',version:'1'},{capabilities:{}});t.after(async()=>{await client.close();await rm(dataDir,{recursive:true,force:true});});await client.connect(transport);const result=await client.callTool({name:'workflow_setup_info',arguments:{}});assert.equal(JSON.parse(result.content[0].text).reason,'changed-runtime');assert.deepEqual(JSON.parse(await readFile(path.join(dataDir,'runtime.json'),'utf8')),record);await assert.rejects(stat(path.join(dataDir,'service.json')),error=>error.code==='ENOENT');
});
