import {cp,mkdir,mkdtemp,readFile,rm,stat,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {pluginRoot,runtimeEntries,nativeCodex} from '../bin/managed-runtime.mjs';
import {AppServer} from '../foundation/client.mjs';
import {createLaunch} from '../foundation/launch.mjs';
import {pathToFileURL} from 'node:url';
import {buildJobHost} from '../foundation/windows-job.mjs';

const drained=(receipt,requiresJob)=>receipt?.serverExited===true&&(!requiresJob||receipt.jobEmpty===true)&&!receipt.error;
const cleanupFailure=()=>Object.assign(new Error('Clean installation ownership did not confirm termination'),{code:'INSTALL_CLEANUP'});
// A failed check retains its entire temporary tree. Cleanup is never an error
// replacement or an automatic retry, and importing this script starts no work.
export async function cleanupInstall(base,{error,safeToRemove=true,tempRoot=tmpdir(),remove=rm}={}){
 const resolved=path.resolve(base);
 if(error||!safeToRemove){const failure=error??cleanupFailure();failure.installCheck={directory:resolved,retained:true,ownershipVerified:safeToRemove};throw failure;}
 assert.equal(path.dirname(resolved),await realpath(tempRoot),'Cleanup must stay inside the owned temporary directory namespace');
 try{await remove(resolved,{recursive:true,force:true});}catch(failure){failure.installCheck={directory:resolved,retained:true,ownershipVerified:true};throw failure;}
}
export async function inspectInstallServer(launch,inspect,ownership,{connect=options=>AppServer.connect(options)}={}){
 ownership.safe=false;let client,result,primary,receipt;
 try{client=await connect(launch);result=await inspect(client);}catch(error){primary=error;receipt=error.cleanup;}
 if(client){try{receipt=await client.close();}catch(error){receipt={serverExited:false,error:{code:'INSTALL_CLEANUP'}};}}
 ownership.receipt=receipt??{serverExited:false};ownership.safe=drained(receipt,Boolean(launch.jobHost));
 if(primary){primary.installCleanup=ownership.receipt;throw primary;}
 if(!ownership.safe)throw Object.assign(cleanupFailure(),{installCleanup:ownership.receipt});
 return result;
}
export function assertMissingAuthDoctor(error){
 assert.equal(error.code,1);assert.equal(typeof error.stdout,'string');assert.ok(Buffer.byteLength(error.stdout)<=65536);
 const report=JSON.parse(error.stdout);assert.equal(report.status,'failed');assert.equal(report.inferenceRequests,0);
 assert.equal(report.stage,'authentication');assert.equal(report.error?.code,'AUTH_UNSUPPORTED');assert.equal(report.cleanup?.serverExited,null);
 assert.equal(report.admission?.status,'failed');assert.equal(report.admission.inferenceRequests,0);
 assert.deepEqual(report.admission.stages,[{name:'authentication',status:'failed',error:{code:'AUTH_UNSUPPORTED'}}]);
 assert.equal(report.startup,undefined);return report;
}

export async function checkInstall(){
const execute=promisify(execFile),base=await realpath(await mkdtemp(path.join(tmpdir(),'workflow-clean-install-'))),cache=path.join(base,'marketplace'),dataDir=path.join(base,'data'),codexHome=path.join(base,'codex-home'),project=path.join(base,'project');
let launchRoot=cache,primary,commandsSettled=true;const ownership={safe:true};await Promise.all([mkdir(cache),mkdir(codexHome),mkdir(project)]);
const env={...process.env,CODEX_HOME:codexHome,AGENT_WORKFLOW_DATA_DIR:dataDir,PLUGIN_DATA:path.join(base,'unused-host-data')};
const trackedExecute=async(...args)=>{try{return await execute(...args);}catch(error){if(error.killed||error.signal||typeof error.code!=='number'&&error.code!=='ENOENT')commandsSettled=false;throw error;}};
const run=(script,args=[])=>trackedExecute(process.execPath,[path.join(launchRoot,'bin',script),...args],{windowsHide:true,timeout:180000,maxBuffer:2*1024*1024,env});
try{
 for(const item of [...runtimeEntries,'plugin.json','.codex-plugin','.agents'])await cp(path.join(pluginRoot,item),path.join(cache,item),{recursive:true});
 const codex=await nativeCodex(pluginRoot),native=async args=>JSON.parse((await trackedExecute(codex,args,{cwd:cache,env,windowsHide:true,timeout:60000,maxBuffer:2*1024*1024})).stdout);
 await native(['plugin','marketplace','add',cache,'--json']);const installed=await native(['plugin','add','agent-workflow@agent-workflow-local','--json']);const listed=await native(['plugin','list','--marketplace','agent-workflow-local','--json']);assert(listed.installed.some(item=>item.installed&&item.enabled&&item.name==='agent-workflow'));
 launchRoot=path.resolve(installed.installedPath);assert(launchRoot.startsWith(path.resolve(codexHome)+path.sep));
 const launch=createLaunch({executable:codex,cwd:cache});launch.env={...launch.env,CODEX_HOME:codexHome};
 if(process.platform==='win32'){const jobDirectory=path.join(base,'job-host');await mkdir(jobDirectory);launch.jobHost=await buildJobHost(jobDirectory);}
 await inspectInstallServer(launch,async client=>{const response=await client.request('plugin/read',{marketplacePath:path.join(cache,'.agents','plugins','marketplace.json'),pluginName:'agent-workflow'});assert(response.plugin.summary.installed&&response.plugin.summary.enabled);assert(response.plugin.skills.some(skill=>skill.name==='agent-workflow:agent-workflow'));assert.equal(response.plugin.onboardingSkill.name,'agent-workflow:workflow-setup');},ownership);
 await assert.rejects(stat(path.join(launchRoot,'node_modules')),e=>e.code==='ENOENT');
 await assert.rejects(run('launch.mjs',['workflows']),e=>/runtime is missing/.test(e.stderr));
 const record=JSON.parse((await run('setup.mjs',['--data-dir',dataDir])).stdout);assert.equal(path.dirname(record.path),path.join(dataDir,'runtime-v2'));assert.equal(record.version,JSON.parse(await readFile(path.join(pluginRoot,'package.json'),'utf8')).version);
 assert.equal(await readFile(path.join(record.path,'LICENSE'),'utf8'),await readFile(path.join(pluginRoot,'LICENSE'),'utf8'));
 for(const item of['node_modules/linkedom','node_modules/@modelcontextprotocol/sdk','src','ui','.mcp.json'])await assert.rejects(stat(path.join(record.path,item)),e=>e.code==='ENOENT');
 await assert.rejects(stat(path.join(launchRoot,'node_modules')),e=>e.code==='ENOENT');
 const definitions=JSON.parse((await run('launch.mjs',['workflows','--cwd',project])).stdout);
 // Personal definitions are valid user input outside this owned installation.
 // Verify packaged definitions and the isolated project without counting them.
 const packagedNames=['changed-file-review','criterion-review','cross-source-research','decomposition-delivery','evidence-research','fix-until-check-passes','isolated-migration','item-audit','loop-until-dry'];
 assert.deepEqual(definitions.filter(item=>item.scope==='plugin').map(item=>item.name).sort(),packagedNames);
 assert.equal(definitions.filter(item=>item.scope==='project').length,0);
 const script=path.join(base,'definition.mjs');await writeFile(script,'export const meta={name:"installed",description:"Clean installed definition"}; return args;');
 const saved=JSON.parse((await run('launch.mjs',['save','installed','--cwd',project,'--script',script,'--command'])).stdout);assert.match(await readFile(saved.skillPath,'utf8'),/agent-workflow:agent-workflow/);
 assert.equal(JSON.parse((await run('launch.mjs',['read','project:installed','--cwd',project])).stdout).meta.name,'installed');
 assert.equal(JSON.parse((await run('launch.mjs',['validate',script])).stdout).valid,true);
 assert.equal(JSON.parse((await run('launch.mjs',['mode','on','--scope','session','--session','install-proof','--cwd',project])).stdout).enabled,true);
 const hook=await new Promise((resolve,reject)=>{import('node:child_process').then(({spawn})=>{const child=spawn(process.execPath,[path.join(launchRoot,'hooks','prompt-submit.mjs')],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('exit',code=>code===0?resolve(JSON.parse(out)):reject(Error(err)));child.stdin.end(JSON.stringify({prompt:'Audit the project',cwd:project,session_id:'install-proof'}));},reject);});assert.match(hook.hookSpecificOutput.additionalContext,/packaged CLI/);
 await assert.rejects(stat(path.join(codexHome,'auth.json')),error=>error.code==='ENOENT');
 await assert.rejects(trackedExecute(codex,['login','status'],{cwd:project,env,windowsHide:true,timeout:60000,maxBuffer:8192}),error=>error.code===1&&`${error.stdout}\n${error.stderr}`.trim().split(/\r?\n/).at(-1)==='Not logged in');
 await assert.rejects(run('launch.mjs',['doctor','--cwd',project]),error=>{assertMissingAuthDoctor(error);return true;});
 await writeFile(path.join(launchRoot,'engine','monitor','style.css'),'\n/* verified update boundary */\n',{flag:'a'});await assert.rejects(run('launch.mjs',['workflows']),e=>/No matching installed runtime/.test(e.stderr));
 const upgraded=JSON.parse((await run('setup.mjs',['--data-dir',dataDir])).stdout);assert.notEqual(upgraded.id,record.id);assert((await stat(record.path)).isDirectory());
 const upgradedDefinitions=JSON.parse((await run('launch.mjs',['workflows','--cwd',project])).stdout);
 assert.deepEqual(upgradedDefinitions.filter(item=>item.scope==='plugin').map(item=>item.name).sort(),packagedNames);
 assert.deepEqual(upgradedDefinitions.filter(item=>item.scope==='project').map(item=>item.name),['installed']);
 const pointerBytes=await readFile(path.join(dataDir,'runtime-v2.json'));
 const retained=await trackedExecute(process.execPath,[path.join(record.path,'bin','launch.mjs'),'validate',script,'--summary','--data-dir',dataDir],{env,windowsHide:true,timeout:180000,maxBuffer:2*1024*1024});
 assert.equal(JSON.parse(retained.stdout).valid,true);assert.deepEqual(await readFile(path.join(dataDir,'runtime-v2.json')),pointerBytes);
}catch(error){primary=error;}
await cleanupInstall(base,{error:primary,safeToRemove:commandsSettled&&ownership.safe});
console.log('Clean native plugin discovery/onboarding, production-only installation, CLI definitions/commands, shared hook mode, structured missing-auth refusal and preserved-runtime upgrade verified; zero model turns; owned App Server cleanup confirmed.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await checkInstall();
