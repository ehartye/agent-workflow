/** @lane merge
 * @subject hooks/prompt-submit.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setMode,readMode,promptContext} from '../engine/mode.mjs';
test('explicit workflow routing uses closest project and session overrides without granting permissions',async t=>{
 const root=await mkdtemp(join(tmpdir(),'workflow-mode-v2-'));t.after(()=>rm(root,{recursive:true,force:true}));const dataDir=join(root,'data'),cwd=join(root,'project','nested');await mkdir(cwd,{recursive:true});
 assert.equal((await readMode({dataDir,cwd,sessionId:'s'})).enabled,false);
 await setMode('on',{dataDir,cwd:join(root,'project'),scope:'project'});assert.equal((await readMode({dataDir,cwd,sessionId:'s'})).enabled,true);
 await setMode('off',{dataDir,cwd,scope:'project'});assert.equal((await readMode({dataDir,cwd,sessionId:'s'})).enabled,false);
 await setMode('on',{dataDir,cwd,sessionId:'s'});assert.equal((await readMode({dataDir,cwd,sessionId:'s'})).source,'session');
 const input={prompt:'Please audit this project',cwd,session_id:'s'};assert.match(await promptContext(input,{dataDir}),/agent-workflow/);assert.doesNotMatch(await promptContext(input,{dataDir}),/workflow_start|MCP/);
 assert.equal(await promptContext({...input,input_source:'tool'},{dataDir}),null);assert.equal(await promptContext(input,{dataDir,env:{AGENT_WORKFLOW_WORKER:'1'}}),null);
 await assert.rejects(setMode('on',{dataDir,cwd}),/session/i);await assert.rejects(setMode('on',{dataDir,cwd,scope:'project',env:{AGENT_WORKFLOW_WORKER:'1'}}),/worker/i);
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(new URL('../hooks/prompt-submit.mjs',import.meta.url))],{windowsHide:true,env:{...process.env,AGENT_WORKFLOW_DATA_DIR:dataDir},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);child.on('error',reject);child.on('exit',code=>resolve({code,stdout,stderr}));child.stdin.end(JSON.stringify(input));});
 assert.equal(result.code,0,result.stderr);assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext,/packaged CLI/);
});
