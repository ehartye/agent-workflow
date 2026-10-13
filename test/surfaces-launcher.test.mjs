import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pluginRoot } from '../src/paths.mjs';
import { sourceDigest } from '../bin/runtime-install.mjs';
const execute=promisify(execFile);
test('launcher resolves explicit custom data before runtime lookup without host environment masking',async t=>{
 const base=await mkdtemp(path.join(os.tmpdir(),'workflow-launcher-'));t.after(()=>rm(base,{recursive:true,force:true}));const dataDir=path.join(base,'custom-data');const runtime=path.join(dataDir,'runtime','fixture');await mkdir(path.join(runtime,'bin'),{recursive:true});await mkdir(path.join(runtime,'node_modules'));
 await writeFile(path.join(runtime,'bin','agent-workflow.mjs'),"process.stdout.write(JSON.stringify({dataDir:process.env.AGENT_WORKFLOW_DATA_DIR,args:process.argv.slice(2)}));");await writeFile(path.join(dataDir,'runtime.json'),JSON.stringify({path:runtime,digest:await sourceDigest(pluginRoot),version:'test'}));
 const env={...process.env,LOCALAPPDATA:path.join(base,'unused-default')};delete env.AGENT_WORKFLOW_DATA_DIR;delete env.PLUGIN_DATA;delete env.CLAUDE_PLUGIN_DATA;
 const result=await execute(process.execPath,[path.join(pluginRoot,'bin','launch.mjs'),'doctor','--data-dir',dataDir],{env,windowsHide:true,timeout:10000});const value=JSON.parse(result.stdout);assert.equal(value.dataDir,dataDir);assert.deepEqual(value.args,['doctor','--data-dir',dataDir]);
});
test('launcher rejects a missing explicit data path before attempting default lookup',async()=>{
 await assert.rejects(execute(process.execPath,[path.join(pluginRoot,'bin','launch.mjs'),'doctor','--data-dir'],{windowsHide:true,timeout:10000}),error=>/Missing value for --data-dir/.test(error.stderr));
});
