import {cp,mkdir,mkdtemp,readFile,rm,stat,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {pluginRoot,runtimeEntries,nativeCodex} from '../bin/managed-runtime.mjs';
import {AppServer} from '../foundation/client.mjs';
import {createLaunch} from '../foundation/launch.mjs';
const execute=promisify(execFile),base=await realpath(await mkdtemp(path.join(tmpdir(),'workflow-clean-install-'))),cache=path.join(base,'marketplace'),dataDir=path.join(base,'data'),codexHome=path.join(base,'codex-home'),project=path.join(base,'project');
let launchRoot=cache;await Promise.all([mkdir(cache),mkdir(codexHome),mkdir(project)]);
const env={...process.env,CODEX_HOME:codexHome,AGENT_WORKFLOW_DATA_DIR:dataDir,PLUGIN_DATA:path.join(base,'unused-host-data')};
const run=(script,args=[])=>execute(process.execPath,[path.join(launchRoot,'bin',script),...args],{windowsHide:true,timeout:180000,maxBuffer:2*1024*1024,env});
try{
 for(const item of [...runtimeEntries,'plugin.json','.codex-plugin','.agents'])await cp(path.join(pluginRoot,item),path.join(cache,item),{recursive:true});
 const codex=await nativeCodex(pluginRoot),native=async args=>JSON.parse((await execute(codex,args,{cwd:cache,env,windowsHide:true,timeout:60000,maxBuffer:2*1024*1024})).stdout);
 await native(['plugin','marketplace','add',cache,'--json']);const installed=await native(['plugin','add','agent-workflow@agent-workflow-local','--json']);const listed=await native(['plugin','list','--marketplace','agent-workflow-local','--json']);assert(listed.installed.some(item=>item.installed&&item.enabled&&item.name==='agent-workflow'));
 launchRoot=path.resolve(installed.installedPath);assert(launchRoot.startsWith(path.resolve(codexHome)+path.sep));
 const launch=createLaunch({executable:codex,cwd:cache});launch.env={...launch.env,CODEX_HOME:codexHome};const client=await AppServer.connect(launch);
 try{const response=await client.request('plugin/read',{marketplacePath:path.join(cache,'.agents','plugins','marketplace.json'),pluginName:'agent-workflow'});assert(response.plugin.summary.installed&&response.plugin.summary.enabled);assert(response.plugin.skills.some(skill=>skill.name==='agent-workflow:agent-workflow'));assert.equal(response.plugin.onboardingSkill.name,'agent-workflow:workflow-setup');}finally{const cleanup=await client.close();assert(cleanup.serverExited);}
 await assert.rejects(stat(path.join(launchRoot,'node_modules')),e=>e.code==='ENOENT');
 await assert.rejects(run('launch.mjs',['workflows']),e=>/runtime is missing/.test(e.stderr));
 const record=JSON.parse((await run('setup.mjs',['--data-dir',dataDir])).stdout);assert.equal(path.dirname(record.path),path.join(dataDir,'runtime-v2'));assert.equal(record.version,JSON.parse(await readFile(path.join(pluginRoot,'package.json'),'utf8')).version);
 assert.equal(await readFile(path.join(record.path,'LICENSE'),'utf8'),await readFile(path.join(pluginRoot,'LICENSE'),'utf8'));
 for(const item of['node_modules/linkedom','node_modules/@modelcontextprotocol/sdk','src','ui','.mcp.json'])await assert.rejects(stat(path.join(record.path,item)),e=>e.code==='ENOENT');
 await assert.rejects(stat(path.join(launchRoot,'node_modules')),e=>e.code==='ENOENT');
 const definitions=JSON.parse((await run('launch.mjs',['workflows','--cwd',project])).stdout);assert.equal(definitions.length,7);assert(definitions.some(item=>item.meta?.name==='decomposition-delivery'||item.name==='decomposition-delivery'));
 const script=path.join(base,'definition.mjs');await writeFile(script,'export const meta={name:"installed",description:"Clean installed definition"}; return args;');
 const saved=JSON.parse((await run('launch.mjs',['save','installed','--cwd',project,'--script',script,'--command'])).stdout);assert.match(await readFile(saved.skillPath,'utf8'),/agent-workflow:agent-workflow/);
 assert.equal(JSON.parse((await run('launch.mjs',['read','project:installed','--cwd',project])).stdout).meta.name,'installed');
 assert.equal(JSON.parse((await run('launch.mjs',['validate',script])).stdout).valid,true);
 assert.equal(JSON.parse((await run('launch.mjs',['mode','on','--scope','session','--session','install-proof','--cwd',project])).stdout).enabled,true);
 const hook=await new Promise((resolve,reject)=>{import('node:child_process').then(({spawn})=>{const child=spawn(process.execPath,[path.join(launchRoot,'hooks','prompt-submit.mjs')],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('exit',code=>code===0?resolve(JSON.parse(out)):reject(Error(err)));child.stdin.end(JSON.stringify({prompt:'Audit the project',cwd:project,session_id:'install-proof'}));},reject);});assert.match(hook.hookSpecificOutput.additionalContext,/packaged CLI/);
 await assert.rejects(run('launch.mjs',['doctor','--cwd',project]),e=>/not logged in|existing managed ChatGPT/i.test(e.stderr));
 await writeFile(path.join(launchRoot,'engine','monitor','style.css'),'\n/* verified update boundary */\n',{flag:'a'});await assert.rejects(run('launch.mjs',['workflows']),e=>/Plugin changed/.test(e.stderr));
 const upgraded=JSON.parse((await run('setup.mjs',['--data-dir',dataDir])).stdout);assert.notEqual(upgraded.id,record.id);assert((await stat(record.path)).isDirectory());
 assert.equal(JSON.parse((await run('launch.mjs',['workflows','--cwd',project])).stdout).length,8);
 console.log('Clean native plugin discovery/onboarding, production-only installation, CLI definitions/commands, shared hook mode, missing-auth refusal and preserved-runtime upgrade verified; zero model turns.');
}finally{const resolved=path.resolve(base);assert.equal(path.dirname(resolved),await realpath(tmpdir()));await rm(resolved,{recursive:true,force:true});}
