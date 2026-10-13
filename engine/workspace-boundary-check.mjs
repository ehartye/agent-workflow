// Explicit native command-only acceptance. No model turns or API billing.
import {parseArgs,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,realpath,link,symlink,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {AppServer,diagnostic,fault} from '../foundation/client.mjs';
import {createLaunch,assertChatgptLogin} from '../foundation/launch.mjs';
import {assertManagedChatgpt} from '../foundation/probe.mjs';
import {buildJobHost} from '../foundation/windows-job.mjs';
import {restrictLaunch,assertRestricted} from './policy.mjs';
import {captureInputs,createWorkspace,assertWorkspaceReady} from './workspaces.mjs';
import {writerPolicy,assertWriterThread} from './workspace-policy.mjs';

const {values}=parseArgs({options:{codex:{type:'string'},output:{type:'string'}}});
const execute=promisify(execFile);let client,report={status:'failed',inferenceRequests:0};
const root=await realpath(await mkdtemp(join(tmpdir(),'workflow-writer-boundary-')));
console.log('Acceptance fixtures: '+root);
try{
  const source=join(root,'project'),artifacts=join(root,'artifacts');await mkdir(source);await mkdir(artifacts);
  const git=async(...args)=>(await execute('git',args,{cwd:source,windowsHide:true,timeout:10000})).stdout.trim();
  await git('init','-q');await git('config','user.email','fixture@example.invalid');await git('config','user.name','Fixture');
  await writeFile(join(source,'note.txt'),'source preserved\n');await git('add','.');await git('commit','-qm','fixture');
  const inputs=await captureInputs({source,artifactsDir:join(artifacts,'inputs')});
  const workspace=await createWorkspace({inputs,artifactsDir:join(artifacts,'a')}),sibling=await createWorkspace({inputs,artifactsDir:join(artifacts,'b')});
  const temporary=join(root,'ordinary-temp.txt');await writeFile(temporary,'outside\n');
  await link(temporary,join(workspace.cwd,'hardlink.txt'));
  try{await assertWorkspaceReady(workspace);throw fault('WRITE_BOUNDARY','Host-planted alias passed admission');}catch(error){if(error.code!=='WORKSPACE_PATH')throw error;report.plantedHardlinkRejected=true;}
  await unlink(join(workspace.cwd,'hardlink.txt'));await assertWorkspaceReady(workspace);
  // Deliberately planted junction tests native enforcement independently of admission.
  await symlink(source,join(workspace.cwd,'junction'),'junction');
  const jobHost=await buildJobHost(root);let launch={...restrictLaunch(createLaunch({executable:resolve(values.codex),cwd:workspace.cwd,backend:'mxc'})),jobHost};
  assertChatgptLogin(await execute(launch.command,['login','status'],{cwd:launch.cwd,env:launch.env,windowsHide:true,timeout:5000}));
  client=await AppServer.connect({...launch,experimentalApi:true});const config=await client.request('config/read',{cwd:workspace.cwd,includeLayers:true});
  assertManagedChatgpt(await client.request('account/read',{refreshToken:false}),config);launch=restrictLaunch(launch,config.config);await client.close();
  client=await AppServer.connect({...launch,experimentalApi:true});assertRestricted((await client.request('config/read',{cwd:workspace.cwd})).config);
  const policy=writerPolicy(workspace.cwd);const thread=await client.request('thread/start',{...policy.thread,ephemeral:true,modelProvider:'openai'});
  // Log only the returned permission envelope for diagnostics, not account/config.
  report.thread={cwd:thread.cwd,runtimeWorkspaceRoots:thread.runtimeWorkspaceRoots,sandbox:thread.sandbox,approvalPolicy:thread.approvalPolicy,activePermissionProfile:thread.activePermissionProfile};
  assertWriterThread(thread,workspace.cwd);
  const gitdir=(await readFile(join(workspace.cwd,'.git'),'utf8')).trim().slice(8);
  const targets=[['owned',join(workspace.cwd,'allowed.txt'),true],['source',join(source,'note.txt'),false],['sibling',join(sibling.cwd,'note.txt'),false],['ordinary-temp',temporary,false],['git-pointer',join(workspace.cwd,'.git'),false],['gitdir',join(gitdir,'probe-write'),false],['junction',join(workspace.cwd,'junction','note.txt'),false]];
  const program=`const fs=require('node:fs');const targets=${JSON.stringify(targets)};const result=targets.map(([name,path,expected])=>{try{const fd=fs.openSync(path,name==='owned'||name==='gitdir'?'w':'r+');fs.writeSync(fd,name==='owned'?'owned write':name==='hardlink'?'link write':'');fs.closeSync(fd);return{name,allowed:true,expected};}catch(e){return{name,allowed:false,expected,code:e.code};}});let created=false;try{fs.linkSync(${JSON.stringify(temporary)},${JSON.stringify(join(workspace.cwd,'created-hardlink.txt'))});created=true;fs.writeFileSync(${JSON.stringify(join(workspace.cwd,'created-hardlink.txt'))},'created link write');result.push({name:'create-hardlink',created,allowed:true,expected:false});}catch(e){result.push({name:'create-hardlink',created,allowed:false,expected:false,code:e.code});}console.log(JSON.stringify(result));`;
  const result=await client.request('command/exec',{command:[process.execPath,'-e',program],cwd:workspace.cwd,sandboxPolicy:policy.turn.sandboxPolicy,timeoutMs:20000,outputBytesCap:8192},{timeoutMs:25000});
  if(result.exitCode!==0){report.command={exitCode:result.exitCode,stderr:result.stderr?.slice(0,2000)};throw fault('WRITE_PROBE','Native write probe did not execute');}
  report.boundaries=JSON.parse(result.stdout);
  report.outsidePreserved=await readFile(join(source,'note.txt'),'utf8')==='source preserved\n'&&await readFile(temporary,'utf8')==='outside\n';
  report.ownedWriteObserved=await readFile(join(workspace.cwd,'allowed.txt'),'utf8')==='owned write';
  if(!report.outsidePreserved)throw fault('WRITE_BOUNDARY','Fixture outside bytes changed');
  if(!report.ownedWriteObserved||report.boundaries.find(item=>item.name==='create-hardlink')?.created!==false)throw fault('WRITE_BOUNDARY','Owned write or hardlink-creation denial was not established');
  if(report.boundaries.some(item=>item.allowed!==item.expected))throw fault('WRITE_BOUNDARY','Native command writes did not match the owned workspace boundary');
  report.status='passed';
}catch(error){report.error=diagnostic(error);process.exitCode=1;}
finally{
  if(client)report.cleanup=await client.close();
  if(report.cleanup?.jobEmpty!==true){report.status='failed';process.exitCode=1;}
  report.checkedAt=new Date().toISOString();
  if(values.output)await writeFile(resolve(values.output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(report,null,2));
}
