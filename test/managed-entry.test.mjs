/** @lane merge
 * @subject bin/launch-v2.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {installRuntime,bindRun} from '../bin/managed-runtime.mjs';
const execute=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
test('public launcher selects the run-pinned runtime after upgrade and refuses foreign-session control',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'workflow-entry-'));t.after(()=>rm(temp,{recursive:true,force:true}));const pluginRoot=join(temp,'plugin'),dataDir=join(temp,'data');await mkdir(pluginRoot);
 for(const name of ['bin','engine','foundation','workflows','hooks','skills'])await mkdir(join(pluginRoot,name));
 for(const name of ['managed-runtime.mjs','launch-v2.mjs','arguments.mjs'])await cp(join(root,'bin',name),join(pluginRoot,'bin',name));
 await writeFile(join(pluginRoot,'bin','command.mjs'),'import {parseCommand} from "./arguments.mjs";parseCommand();console.log(JSON.stringify({marker:"first",root:import.meta.url,args:process.argv.slice(2)}));');
 await writeFile(join(pluginRoot,'package.json'),JSON.stringify({version:'0.2.0',dependencies:{'@openai/codex':'0.162.1'}}));await writeFile(join(pluginRoot,'package-lock.json'),'{}');await writeFile(join(pluginRoot,'LICENSE'),'MIT');
 const npmCli=join(temp,'npm.mjs');await writeFile(npmCli,`import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';const root=join(process.cwd(),'node_modules/@openai');await mkdir(join(root,'codex'),{recursive:true});await writeFile(join(root,'codex/package.json'),JSON.stringify({version:'0.162.1'}));const target=join(root,'codex-win32-x64');await mkdir(join(target,'vendor/x86_64-pc-windows-msvc/bin'),{recursive:true});await writeFile(join(target,'package.json'),JSON.stringify({version:'0.162.1-win32-x64'}));await writeFile(join(target,'vendor/x86_64-pc-windows-msvc/bin/codex.exe'),'fixture');`);
 const first=await installRuntime({pluginRoot,dataDir,npmCli});const bound=await bindRun({dataDir,runtime:first,sessionId:'origin'});
 await writeFile(join(pluginRoot,'bin','command.mjs'),'import {parseCommand} from "./arguments.mjs";parseCommand();console.log(JSON.stringify({marker:"second"}));');await installRuntime({pluginRoot,dataDir,npmCli});
 const invoke=(args,env={})=>execute(process.execPath,[join(pluginRoot,'bin','launch-v2.mjs'),...args,'--data-dir',dataDir],{env:{...process.env,...env},windowsHide:true,timeout:10000});
 assert.equal(JSON.parse((await invoke(['status',bound.id])).stdout).marker,'first');assert.equal(JSON.parse((await invoke(['workflows'])).stdout).marker,'second');
 await assert.rejects(invoke(['resume',bound.id,'--session','other']),e=>/session/i.test(e.stderr));
 assert.equal(JSON.parse((await invoke(['resume',bound.id],{CODEX_THREAD_ID:'origin'})).stdout).marker,'first');
 await assert.rejects(invoke(['resume',bound.id],{CODEX_THREAD_ID:''}),e=>/session/i.test(e.stderr));
 await assert.rejects(invoke(['run','demo','--session','origin'],{AGENT_WORKFLOW_WORKER:'1'}),e=>/recursive|worker/i.test(e.stderr));
 await assert.rejects(invoke(['status','../runs']),e=>/identifier/i.test(e.stderr));
 await assert.rejects(invoke(['mcp']),e=>/unknown command/i.test(e.stderr));
 await assert.rejects(invoke(['run','demo','--codex','unowned']),e=>/unknown option/i.test(e.stderr));
 await assert.rejects(invoke(['dashboard',bound.id],{CODEX_THREAD_ID:'other'}),e=>/session/i.test(e.stderr));
 assert.equal(JSON.parse((await invoke(['--data-dir',dataDir,'dashboard'],{CODEX_THREAD_ID:'origin'})).stdout).marker,'first');
 assert.match((await invoke(['help'])).stdout,/dashboard/);
});
