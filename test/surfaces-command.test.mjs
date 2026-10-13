/** @lane merge
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveWorkflow } from '../src/registry.mjs';
test('explicit saved command exposes scoped workflow and refuses unrelated skill collision before writing script',async t=>{
 const cwd=await mkdtemp(path.join(os.tmpdir(),'workflow-command-'));t.after(()=>rm(cwd,{recursive:true,force:true}));const script="export const meta = { name: 'audit', description: 'Audit' }; return 1;";
 const saved=await saveWorkflow('audit',script,{cwd,command:true});assert.equal(saved.command,'$workflow-audit');const body=await readFile(saved.skillPath,'utf8');assert.match(body,/project:audit/);assert.match(body,/workflow_start/);
 const collision=path.join(cwd,'.agents','skills','workflow-scan');await mkdir(collision,{recursive:true});await writeFile(path.join(collision,'SKILL.md'),'User-owned skill');await assert.rejects(saveWorkflow('scan',script,{cwd,command:true,overwrite:true}),/unrelated/i);await assert.rejects(stat(path.join(cwd,'.agents','workflows','scan.js')),error=>error.code==='ENOENT');assert.equal(await readFile(path.join(collision,'SKILL.md'),'utf8'),'User-owned skill');
});
