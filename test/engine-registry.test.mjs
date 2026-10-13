/** @lane merge
 * @subject engine/registry.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const script=name=>`export const meta={name:${JSON.stringify(name)},description:"saved proof"};return args;`;
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'workflow-registry-'));t.after(()=>rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}));const project=join(root,'project'),cwd=join(project,'nested'),homeDir=join(root,'home'),bundledDir=join(root,'bundled');for(const dir of [join(project,'.git'),cwd,homeDir,bundledDir])await mkdir(dir,{recursive:true});return{root,project,cwd,homeDir,bundledDir};}
async function registry(){const module=await import('../engine/registry.mjs').catch(()=>null);assert.ok(module?.resolveWorkflow,'Fresh registry is required');return module;}
async function definition(root,name,value){const dir=join(root,'.agents','workflows');await mkdir(dir,{recursive:true});await writeFile(join(dir,name+'.mjs'),script(value));}
test('saved definitions resolve closest project then personal then plugin and reload without caching',async t=>{
 const options=await fixture(t),api=await registry();await definition(options.project,'audit','root');await definition(options.cwd,'audit','nested');await definition(options.homeDir,'audit','personal');await writeFile(join(options.bundledDir,'audit.mjs'),script('plugin'));
 assert.equal((await api.resolveWorkflow('audit',options)).meta.name,'nested');assert.equal((await api.resolveWorkflow('personal:audit',options)).meta.name,'personal');assert.equal((await api.resolveWorkflow('plugin:audit',options)).meta.name,'plugin');
 const listed=await api.listWorkflows(options);assert.deepEqual(listed.map(item=>item.qualifiedName),['project:audit','personal:audit','plugin:audit']);assert.equal(listed[0].availableAs,'audit');assert.equal(listed[1].availableAs,'personal:audit');
 await definition(options.cwd,'audit','edited');assert.equal((await api.resolveWorkflow('project:audit',options)).meta.name,'edited');
 await writeFile(join(options.cwd,'.agents','workflows','audit.mjs'),'invalid');await assert.rejects(api.resolveWorkflow('audit',options),{code:'SCRIPT_META'});
});
test('same-directory extension and case collisions fail instead of selecting arbitrary definitions',async t=>{
 const options=await fixture(t),api=await registry();await definition(options.cwd,'audit','one');const dir=join(options.cwd,'.agents','workflows');await writeFile(join(dir,'AUDIT.js'),script('two'));
 await assert.rejects(api.resolveWorkflow('audit',options),{code:'WORKFLOW_COLLISION'});await assert.rejects(api.listWorkflows(options),{code:'WORKFLOW_COLLISION'});
});
test('save validates scripts and names, protects existing definitions and unrelated command skills',async t=>{
 const options=await fixture(t),api=await registry();for(const name of ['../escape','project:../escape','plugin:owned'])await assert.rejects(api.saveWorkflow(name,script('x'),options));
 await assert.rejects(api.saveWorkflow('bad','not a workflow',options),{code:'SCRIPT_SYNTAX'});
 await assert.rejects(api.saveWorkflow('odd_name',script('valid definition'),{...options,command:true}),{code:'WORKFLOW_COMMAND'});
 await assert.rejects(api.saveWorkflow('audit.js.mjs',script('ambiguous'),options),{code:'WORKFLOW_NAME'});
 const saved=await api.saveWorkflow('project:owned',script('first'),{...options,command:true});assert.equal(saved.command,'$workflow-owned');assert.equal(saved.scriptPath,join(options.cwd,'.agents','workflows','owned.mjs'));
 assert.equal((await api.resolveWorkflow(saved.qualifiedName,options)).meta.name,'first');
 const body=await readFile(saved.skillPath,'utf8');assert.match(body,/project:owned/);assert.doesNotMatch(body,/workflow_start|MCP/);
 await assert.rejects(api.saveWorkflow('owned',script('second'),options),{code:'WORKFLOW_EXISTS'});assert.equal((await api.resolveWorkflow('owned',options)).meta.name,'first');
 await api.saveWorkflow('owned',script('second'),{...options,overwrite:true,command:true});assert.equal((await api.resolveWorkflow('owned',options)).meta.name,'second');
 await writeFile(saved.skillPath,'Unrelated owner skill');await assert.rejects(api.saveWorkflow('owned',script('third'),{...options,overwrite:true,command:true}),{code:'WORKFLOW_COMMAND'});assert.equal((await api.resolveWorkflow('owned',options)).meta.name,'second');
});
test('workflow discovery and save refuse linked directories without touching outside files',async t=>{
 const options=await fixture(t),api=await registry(),outside=join(options.root,'outside');await mkdir(outside);await writeFile(join(outside,'audit.mjs'),script('outside'));await mkdir(join(options.cwd,'.agents'));await symlink(outside,join(options.cwd,'.agents','workflows'),'junction');
 await assert.rejects(api.resolveWorkflow('audit',options),{code:'WORKFLOW_PATH'});await assert.rejects(api.saveWorkflow('audit',script('changed'),{...options,overwrite:true}),{code:'WORKFLOW_PATH'});assert.equal(await readFile(join(outside,'audit.mjs'),'utf8'),script('outside'));
});
test('CLI validates saves lists and reads named definitions without starting workers',async t=>{
 const options=await fixture(t),input=join(options.root,'input.mjs');await writeFile(input,script('CLI saved'));
 const cli=(...args)=>promisify(execFile)(process.execPath,[fileURLToPath(new URL('../engine/cli.mjs',import.meta.url)),'--cwd',options.cwd,...args],{windowsHide:true,timeout:5000,env:{...process.env,HOME:options.homeDir,USERPROFILE:options.homeDir}});
 assert.equal(JSON.parse((await cli('--validate','--script',input)).stdout).meta.name,'CLI saved');
 const saved=JSON.parse((await cli('--save-workflow','proof','--script',input,'--command')).stdout);assert.equal(saved.command,'$workflow-proof');
 assert.equal(JSON.parse((await cli('--read-workflow','project:proof')).stdout).script,script('CLI saved'));
 const list=JSON.parse((await cli('--list-workflows')).stdout);assert.ok(list.some(item=>item.qualifiedName==='project:proof'));
});
