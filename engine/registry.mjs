import {lstat,readdir,mkdir,open,writeFile,rename,unlink} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {parseScript} from './script.mjs';
import {fault} from '../foundation/client.mjs';

const maxScript=1024*1024,commandMarker='<!-- agent-workflow generated command v2 -->';
function parseName(value){
  const match=typeof value==='string'&&/^(?:(project|personal|plugin):)?([A-Za-z0-9_-][A-Za-z0-9_.-]{0,100})$/.exec(value);
  if(!match||match[2].includes('..'))throw fault('WORKFLOW_NAME','Use a simple workflow name, optionally qualified with project:, personal: or plugin:');
  const name=match[2].replace(/\.(?:m?js)$/i,'');
  if(/\.(?:m?js)$/i.test(name)||/[. ]$/.test(name)||/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name))throw fault('WORKFLOW_NAME','Workflow name is not a canonical portable filename');
  return{scope:match[1],name};
}
async function noLinks(target){
  for(let path=resolve(target);;path=dirname(path)){
    try{if((await lstat(path)).isSymbolicLink())throw fault('WORKFLOW_PATH','Linked workflow paths are refused');}catch(error){if(error.code!=='ENOENT')throw error;}
    if(dirname(path)===path)return;
  }
}
async function readText(path){
  await noLinks(path);const handle=await open(path,'r');
  try{
    const info=await handle.stat();if(!info.isFile()||info.size>maxScript)throw fault('WORKFLOW_PATH','Workflow must be a regular file no larger than 1 MiB');
    const buffer=Buffer.alloc(maxScript+1);let size=0;
    while(size<buffer.length){const {bytesRead}=await handle.read(buffer,size,buffer.length-size);if(!bytesRead)break;size+=bytesRead;}
    if(size>maxScript)throw fault('WORKFLOW_PATH','Workflow grew beyond 1 MiB');
    return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size));
  }finally{await handle.close();}
}
async function directories({cwd=process.cwd(),homeDir=homedir(),bundledDir=fileURLToPath(new URL('../workflows',import.meta.url))}={}){
  cwd=resolve(cwd);await noLinks(cwd);if(!(await lstat(cwd)).isDirectory())throw fault('WORKFLOW_PATH','Workflow cwd must be a directory');
  const ancestors=[];let projectFound=false;
  for(let current=cwd;;current=dirname(current)){
    ancestors.push(current);
    try{const marker=await lstat(join(current,'.git'));if(marker.isSymbolicLink())throw fault('WORKFLOW_PATH','Linked project metadata is refused');if(marker.isFile()||marker.isDirectory()){projectFound=true;break;}}catch(error){if(error.code!=='ENOENT')throw error;}
    if(dirname(current)===current)break;
  }
  return[...(projectFound?ancestors:[cwd]).map(root=>({scope:'project',dir:join(root,'.agents','workflows')})),{scope:'personal',dir:join(resolve(homeDir),'.agents','workflows')},{scope:'plugin',dir:resolve(bundledDir)}];
}
async function entries(dir){
  await noLinks(dir);let files;
  try{files=await readdir(dir,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return[];throw error;}
  if(files.length>4096)throw fault('WORKFLOW_LIMIT','Workflow directory exceeds 4096 entries');
  const found=new Map();
  for(const file of files.sort((a,b)=>a.name.localeCompare(b.name))){
    if(!/\.(?:m?js)$/i.test(file.name))continue;
    const name=parseName(file.name).name,key=name.toLowerCase();
    if(found.has(key))throw fault('WORKFLOW_COLLISION','Workflow names collide by case or extension in one directory');
    if(!file.isFile())throw fault('WORKFLOW_PATH','Workflow definitions must be regular files');
    found.set(key,{name,scriptPath:join(dir,file.name)});
  }
  return[...found.values()];
}
export async function resolveWorkflow(value,options={}){
  const requested=parseName(value);
  for(const directory of await directories(options)){
    if(requested.scope&&directory.scope!==requested.scope)continue;
    const entry=(await entries(directory.dir)).find(item=>item.name.toLowerCase()===requested.name.toLowerCase());
    if(!entry)continue;
    const script=await readText(entry.scriptPath),{meta}=parseScript(script);
    return{...entry,scope:directory.scope,qualifiedName:`${directory.scope}:${entry.name}`,script,meta};
  }
  throw fault('WORKFLOW_MISSING','Saved workflow was not found');
}
export async function listWorkflows(options={}){
  const result=[],qualified=new Set(),unqualified=new Set();
  for(const directory of await directories(options))for(const entry of await entries(directory.dir)){
    const key=entry.name.toLowerCase(),qualifiedKey=`${directory.scope}:${key}`;if(qualified.has(qualifiedKey))continue;
    qualified.add(qualifiedKey);const qualifiedName=`${directory.scope}:${entry.name}`,{meta}=parseScript(await readText(entry.scriptPath));
    result.push({...entry,scope:directory.scope,qualifiedName,availableAs:unqualified.has(key)?qualifiedName:entry.name,meta:{name:meta.name,description:meta.description.slice(0,1000)}});unqualified.add(key);
    if(result.length>4096)throw fault('WORKFLOW_LIMIT','Workflow registry exceeds 4096 definitions');
  }
  return result;
}
async function replace(path,text,overwrite){
  await mkdir(dirname(path),{recursive:true});await noLinks(path);
  if(!overwrite){try{await writeFile(path,text,{flag:'wx',mode:0o600});}catch(error){if(error.code==='EEXIST')throw fault('WORKFLOW_EXISTS','Existing workflow requires explicit overwrite');throw error;}return;}
  const temporary=`${path}.${randomUUID()}.tmp`;
  try{await writeFile(temporary,text,{flag:'wx',mode:0o600});await rename(temporary,path);}finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
export async function saveWorkflow(value,script,options={}){
  const {scope='project',name}=parseName(value);if(scope==='plugin')throw fault('WORKFLOW_SCOPE','Bundled workflows are read-only');parseScript(script);
  const root=resolve(scope==='personal'?options.homeDir??homedir():options.cwd??process.cwd()),dir=join(root,'.agents','workflows');await noLinks(root);
  const existing=(await entries(dir)).find(item=>item.name.toLowerCase()===name.toLowerCase());
  if(existing&&!options.overwrite)throw fault('WORKFLOW_EXISTS','Existing workflow requires explicit overwrite');
  const scriptPath=existing?.scriptPath??join(dir,name+'.mjs'),qualifiedName=`${scope}:${name}`;
  let command,skillPath,skill;
  if(options.command){
    const skillName='workflow-'+name.toLowerCase();if(skillName.length>64||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName))throw fault('WORKFLOW_COMMAND','Generated commands require a hyphenated name within 64 characters');
    command='$'+skillName;skillPath=join(root,'.agents','skills',skillName,'SKILL.md');await noLinks(skillPath);
    try{const previous=await readText(skillPath);if(!previous.includes(commandMarker))throw fault('WORKFLOW_COMMAND','Refusing to replace an unrelated skill');if(!options.overwrite)throw fault('WORKFLOW_EXISTS','Existing command requires explicit overwrite');}catch(error){if(error.code!=='ENOENT')throw error;}
    skill=`---\nname: ${skillName}\ndescription: Run the saved ${qualifiedName} Agent Workflow when explicitly invoked as ${command} or requested by name.\n---\n\n${commandMarker}\nUse the installed agent-workflow:agent-workflow skill to run ${JSON.stringify(qualifiedName)} through its packaged CLI in the actual current project directory, with the user's requested JSON arguments. Inspect the resolved saved definition before dispatch. Preserve the original session identity and choose a new run unless the user asks to resume a specific saved run. Permissions must stay within the user's authorization; default to read-only. Return the authenticated monitor URL and report actual completion, failed workers and unknown outcomes.\n`;
  }
  await replace(scriptPath,script,Boolean(options.overwrite));if(skillPath)await replace(skillPath,skill,Boolean(options.overwrite));
  return{name,scope,qualifiedName,scriptPath,...(skillPath?{skillPath,command}:{})};
}
