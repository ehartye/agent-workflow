import { readFile, readdir, mkdir, writeFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { assertNoSymlink, pluginRoot } from './paths.mjs';
const suffixes=['.js','.mjs'];
function parseName(value) { if(typeof value!=='string') throw new Error('Workflow name must be text');const match=/^(?:(project|personal|plugin):)?([a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,100})$/.exec(value);if(!match || match[2].includes('..')) throw new Error('Invalid workflow name');return {scope:match[1],name:match[2].replace(/\.(m?js)$/,'')}; }
async function directories({cwd=process.cwd(),homeDir=os.homedir(),workflowsDir=path.join(pluginRoot,'workflows')}={}) { const dirs=[];const root=await projectRoot(cwd);let current=path.resolve(cwd);for(;;) { dirs.push({scope:'project',dir:path.join(current,'.agents','workflows')});if(current===root)break;current=path.dirname(current); }dirs.push({scope:'personal',dir:path.join(homeDir,'.agents','workflows')},{scope:'plugin',dir:workflowsDir});return dirs; }
export async function resolveWorkflow(value,options={}) {const {scope,name}=parseName(value);for(const entry of await directories(options)) {if(scope && entry.scope!==scope) continue;for(const suffix of suffixes) {const scriptPath=path.join(entry.dir,name+suffix);await assertNoSymlink(scriptPath);try {const s=await stat(scriptPath);if(!s.isFile() || s.size>524288) throw new Error('Workflow is not a regular bounded script');return {script:(await readFile(scriptPath,'utf8')).replace(/\r\n/g,'\n'),scriptPath,name,scope:entry.scope};}catch(error){if(error.code!=='ENOENT') throw error;} }}throw new Error(`Workflow not found: ${value}`); }
export async function listWorkflows(options={}) { const found=[];const seen=new Set();for(const entry of await directories(options)) {await assertNoSymlink(entry.dir);let files;try {files=await readdir(entry.dir,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')continue;throw error;}for(const file of files.sort((a,b)=>a.name.localeCompare(b.name))) {if(!/\.(m?js)$/.test(file.name)) continue;await assertNoSymlink(path.join(entry.dir,file.name));if(!file.isFile())continue;const name=file.name.replace(/\.(m?js)$/,'');const key=`${entry.scope}:${name}`;if(seen.has(key))continue;seen.add(key);found.push({name,qualifiedName:key,scope:entry.scope,scriptPath:path.join(entry.dir,file.name),availableAs:seen.has(name)?key:name});seen.add(name);} }return found; }
async function projectRoot(cwd) {let current=path.resolve(cwd);for(;;) {try {await stat(path.join(current,'.git'));return current;}catch(error){if(error.code!=='ENOENT')throw error;}const parent=path.dirname(current);if(current===parent)return path.resolve(cwd);current=parent;} }
export async function saveWorkflow(value,script,options={}) {
 const {scope='project',name}=parseName(value);
 if(scope==='plugin') throw new Error('Bundled workflows are read-only; save to project or personal');
 if(typeof script!=='string'||Buffer.byteLength(script)>524288)throw new Error('Script must be text at most 524288 bytes');
 const root=scope==='personal'?(options.homeDir||os.homedir()):await projectRoot(options.cwd||process.cwd());
 const dir=path.join(root,'.agents','workflows');const scriptPath=path.join(dir,name+'.js');await assertNoSymlink(scriptPath);
 let skillPath,command,skillBody;
 if(options.command){
  const skillName='workflow-'+name.toLowerCase();if(skillName.length>64)throw new Error('Workflow command name exceeds 64 characters');
  command='$'+skillName;skillPath=path.join(root,'.agents','skills',skillName,'SKILL.md');await assertNoSymlink(skillPath);
  try{const existing=await readFile(skillPath,'utf8');if(!existing.includes('<!-- agent-workflow generated command -->'))throw new Error('Refused to overwrite an unrelated existing skill');if(!options.overwrite)throw new Error('Workflow command already exists; explicit overwrite is required');}catch(error){if(error.code!=='ENOENT')throw error;}
  skillBody=`---\nname: ${skillName}\ndescription: Run the saved ${scope} Agent Workflow ${name} when the user invokes ${command} or explicitly asks for that named workflow.\n---\n\n<!-- agent-workflow generated command -->\nUse workflow_start with name ${JSON.stringify(scope+':'+name)}, the actual current project cwd, and the user’s requested JSON args. Keep permissions within the user’s authorized scope; defaults are read-only, no network and approvals never. Validate/inspect the saved script with workflow_read if its scope is uncertain. Admission returns a run ID, not completion; poll compact workflow_status/result or open workflow_dashboard. Preserve failed and unknown outcomes.\n`;
 }
 await mkdir(dir,{recursive:true});
 if(!options.overwrite)await writeFile(scriptPath,script,{flag:'wx',mode:0o600});
 else{const temp=`${scriptPath}.${randomUUID()}.tmp`;await writeFile(temp,script,{flag:'wx',mode:0o600});await rename(temp,scriptPath);}
 if(skillPath){await mkdir(path.dirname(skillPath),{recursive:true});if(!options.overwrite)await writeFile(skillPath,skillBody,{flag:'wx',mode:0o600});else{const temp=`${skillPath}.${randomUUID()}.tmp`;await writeFile(temp,skillBody,{flag:'wx',mode:0o600});await rename(temp,skillPath);}}
 return {name,scope,scriptPath,...(skillPath?{skillPath,command}: {})};
}
