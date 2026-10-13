import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { pluginRoot } from '../src/paths.mjs';
import { runtimeEntries } from '../bin/runtime-install.mjs';
import { request, readService } from '../src/client.mjs';
import { codexExecutable } from '../src/workers/process.mjs';
import { openAppServer } from '../src/workers/app-server.mjs';
import { nativeParentMcp } from './native-parent-mcp.mjs';
const execute=promisify(execFile);const base=await realpath(await mkdtemp(path.join(os.tmpdir(),'workflow-fresh-install-')));const cache=path.join(base,'marketplace-source');let launchRoot=cache;const dataDir=path.join(base,'persistent-data');await mkdir(cache);
const run=async(script,args=[])=>execute(process.execPath,[path.join(launchRoot,'bin',script),...args],{windowsHide:true,timeout:180000,maxBuffer:1048576,env:{...process.env,PLUGIN_ROOT:launchRoot,PLUGIN_DATA:dataDir,AGENT_WORKFLOW_DATA_DIR:dataDir}});
try{
 for(const item of [...runtimeEntries,'skills','plugin.json','mcp.json','.mcp.json','.codex-plugin','.agents'])await cp(path.join(pluginRoot,item),path.join(cache,item),{recursive:true});
 const codexTestHome=path.join(base,'isolated-codex-home');await mkdir(codexTestHome);
 const native=async args=>JSON.parse((await execute(codexExecutable(),args,{cwd:cache,env:{...process.env,CODEX_HOME:codexTestHome},windowsHide:true,timeout:60000,maxBuffer:1048576})).stdout);
 await native(['plugin','marketplace','add',cache,'--json']);const installed=await native(['plugin','add','agent-workflow@agent-workflow-local','--json']);const listed=await native(['plugin','list','--marketplace','agent-workflow-local','--json']);assert(listed.installed.some(plugin=>plugin.installed&&plugin.enabled&&plugin.name==='agent-workflow'));
 const installedRoot=path.resolve(installed.installedPath);assert(installedRoot.startsWith(path.resolve(codexTestHome)+path.sep));assert.equal(JSON.parse(await readFile(path.join(installedRoot,'plugin.json'),'utf8')).extensions['com.openai'].onboardingSkill,'./skills/workflow-setup/SKILL.md');
 launchRoot=installedRoot;
 const connection=await openAppServer({executable:codexExecutable(),cwd:cache,env:{CODEX_HOME:codexTestHome},emit:()=>{},signal:AbortSignal.timeout(15000)});
 try{const response=await connection.rpc('plugin/read',{marketplacePath:path.join(cache,'.agents','plugins','marketplace.json'),pluginName:'agent-workflow'});const plugin=response.plugin;assert(plugin.summary.installed&&plugin.summary.enabled);assert(plugin.skills.some(skill=>skill.name==='agent-workflow:agent-workflow'),JSON.stringify(plugin.skills.map(skill=>({name:skill.name,enabled:skill.enabled}))));assert(plugin.onboardingSkill?.name==='agent-workflow:workflow-setup',JSON.stringify(plugin.onboardingSkill));}finally{await connection.processHandle.stop();}
 const coldParent=await nativeParentMcp({cwd:cache,codexHome:codexTestHome});let hostSetupInfo;
 try{const status=await coldParent.rpc('mcpServerStatus/list',{limit:50,detail:'full'});const server=status.data.find(server=>server.name==='workflow'&&server.pluginId==='agent-workflow@agent-workflow-local');assert(server,'Installed native MCP server must be visible');assert(Object.keys(server.tools).some(name=>name.endsWith('workflow_setup_info')),JSON.stringify({tools:Object.keys(server.tools),error:server.toolsError}));const thread=await coldParent.rpc('thread/start',{cwd:cache,sandbox:'read-only',approvalPolicy:'never'});const response=await coldParent.rpc('mcpServer/tool/call',{server:server.name,threadId:thread.thread.id,tool:'workflow_setup_info',arguments:{}});assert(!response.isError);hostSetupInfo=response.structuredContent||JSON.parse(response.content[0].text);assert(hostSetupInfo.dataDir.startsWith(path.join(codexTestHome,'plugins','data')+path.sep));assert.equal(hostSetupInfo.pluginRoot,installedRoot);}finally{await coldParent.close();}
 await execute(hostSetupInfo.setupCommand.executable,hostSetupInfo.setupCommand.arguments,{windowsHide:true,timeout:180000,maxBuffer:1048576});
 const warmParent=await nativeParentMcp({cwd:cache,codexHome:codexTestHome});try{const status=await warmParent.rpc('mcpServerStatus/list',{limit:50,detail:'full'});const server=status.data.find(server=>server.name==='workflow'&&server.pluginId==='agent-workflow@agent-workflow-local');assert(Object.keys(server.tools).some(name=>name.endsWith('workflow_start')),JSON.stringify({tools:Object.keys(server.tools),error:server.toolsError}));assert(!Object.keys(server.tools).some(name=>name.endsWith('workflow_setup_info')));}finally{await warmParent.close();}
 await assert.rejects(stat(path.join(launchRoot,'node_modules')),error=>error.code==='ENOENT');
 await assert.rejects(run('launch.mjs',['doctor']),error=>/Managed runtime is not installed/.test(error.stderr));
 const setup=await run('setup.mjs',['--data-dir',dataDir]);assert.match(setup.stdout,/Managed runtime ready/);
 const record=JSON.parse(await readFile(path.join(dataDir,'runtime.json'),'utf8'));assert.equal(path.dirname(record.path),path.join(dataDir,'runtime'));assert((await stat(path.join(record.path,'node_modules'))).isDirectory());await assert.rejects(stat(path.join(launchRoot,'node_modules')),error=>error.code==='ENOENT');
 assert.equal(await readFile(path.join(record.path,'LICENSE'),'utf8'),await readFile(path.join(pluginRoot,'LICENSE'),'utf8'),'Managed source copies must retain the MIT copyright and permission notice');
 await assert.rejects(stat(path.join(record.path,'node_modules','linkedom')),error=>error.code==='ENOENT','Dashboard test dependencies must be omitted from production installation');
 const doctor=JSON.parse((await run('launch.mjs',['doctor'])).stdout);assert.equal(doctor.runtime,'installed');assert.equal(doctor.pluginRoot,path.join(record.path,path.sep));
 const cliOnlyEnv={...process.env,LOCALAPPDATA:path.join(base,'unused-default-data')};delete cliOnlyEnv.AGENT_WORKFLOW_DATA_DIR;delete cliOnlyEnv.PLUGIN_DATA;delete cliOnlyEnv.CLAUDE_PLUGIN_DATA;
 const cliOnlyDoctor=JSON.parse((await execute(process.execPath,[path.join(launchRoot,'bin','launch.mjs'),'doctor','--data-dir',dataDir],{env:cliOnlyEnv,windowsHide:true,timeout:10000,maxBuffer:1048576})).stdout);assert.equal(cliOnlyDoctor.dataDir,dataDir);assert.equal(cliOnlyDoctor.runtime,'installed');assert.equal(cliOnlyDoctor.pluginRoot,path.join(record.path,path.sep));
 await run('launch.mjs',['start','--backend-fixture',path.join(pluginRoot,'test','fixtures','surface-backend.mjs')]);
 const config=JSON.parse(await readFile(path.join(launchRoot,'mcp.json'),'utf8')).mcpServers.workflow;
 const expand=value=>value.replaceAll('${PLUGIN_ROOT}',launchRoot).replaceAll('${PLUGIN_DATA}',dataDir);
 const transport=new StdioClientTransport({command:config.command,args:config.args.map(expand),cwd:expand(config.cwd),env:Object.fromEntries(Object.entries(config.env).map(([key,value])=>[key,expand(value)])),stderr:'pipe'});
 const client=new Client({name:'installed-plugin-check',version:'1'},{capabilities:{}});
 try{await client.connect(transport);const tools=await client.listTools();assert(tools.tools.some(tool=>tool.name==='workflow_start'));const runs=await client.callTool({name:'workflow_list',arguments:{}});assert.equal(runs.isError,undefined);}finally{await client.close();}
 const result=JSON.parse((await run('launch.mjs',['run','--cwd',base,'--script',"export const meta={name:'installed',description:'Fresh cache launch'}; return await agent('fresh');",'--wait'])).stdout);assert.equal(result.result,'fixture:fresh');
 await run('launch.mjs',['shutdown']);for(let i=0;i<100&&await readService(dataDir);i++)await new Promise(resolve=>setTimeout(resolve,30));
 await writeFile(path.join(launchRoot,'ui','style.css'),'\n/* explicit package update */\n',{flag:'a'});await assert.rejects(run('launch.mjs',['doctor']),error=>/Plugin changed/.test(error.stderr));
 process.stdout.write('Isolated native install/onboarding, native cold setup-info call with exact host data, explicit setup and connected production tools, custom-data launch without host env, portable stdio MCP and update boundary verified.\n');
}finally{try{await request('/api/shutdown',{dataDir,method:'POST',body:{}});}catch{}for(let i=0;i<100&&await readService(dataDir);i++)await new Promise(resolve=>setTimeout(resolve,30));const resolved=path.resolve(base);assert.equal(path.dirname(resolved),await realpath(os.tmpdir()));await rm(resolved,{recursive:true,force:true});}
