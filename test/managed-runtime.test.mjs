/** @lane merge
 * @subject bin/managed-runtime.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {sourceDigest,installRuntime,selectRuntime,bindRun,resolveRun,paths,defaultDataDir} from '../bin/managed-runtime.mjs';
const nativeTarget=process.platform==='win32'?'x86_64-pc-windows-msvc':'x86_64-unknown-linux-musl';
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'workflow-managed-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const pluginRoot=join(root,'plugin'),dataDir=join(root,'data');await mkdir(pluginRoot);await mkdir(dataDir);
 for(const name of ['bin','engine','foundation','workflows','hooks','skills']){await mkdir(join(pluginRoot,name));await writeFile(join(pluginRoot,name,'input.txt'),name);}
 await writeFile(join(pluginRoot,'LICENSE'),'MIT');await writeFile(join(pluginRoot,'package-lock.json'),'{}');
 await writeFile(join(pluginRoot,'package.json'),JSON.stringify({version:'0.2.0',dependencies:{'@openai/codex':'0.162.1'}}));
 const npmCli=join(root,'npm-fixture.mjs');
 await writeFile(npmCli,`import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';
 const p=join(process.cwd(),'node_modules','@openai');const target=${JSON.stringify(nativeTarget)};const platform=${JSON.stringify(process.platform)};
 await mkdir(join(p,'codex'),{recursive:true});await writeFile(join(p,'codex','package.json'),JSON.stringify({version:'0.162.1'}));
 const q=join(p,'codex-'+platform+'-x64');await mkdir(join(q,'vendor',target,'bin'),{recursive:true});await writeFile(join(q,'package.json'),JSON.stringify({version:'0.162.1-'+platform+'-x64'}));await writeFile(join(q,'vendor',target,'bin',platform==='win32'?'codex.exe':'codex'),'fixture native binary');`);
 return{root,pluginRoot,dataDir,npmCli};
}
test('managed installation fingerprints fresh sources and preserves prior runtimes and legacy data',async t=>{
 const f=await fixture(t);const legacy=join(f.dataDir,'runtime.json');await writeFile(legacy,'legacy pointer bytes');await mkdir(join(f.dataDir,'runs'));await writeFile(join(f.dataDir,'runs','legacy.json'),'old run bytes');
 const first=await installRuntime(f);assert.equal(first.schema,2);assert.equal(first.digest,await sourceDigest(f.pluginRoot));assert.equal((await selectRuntime(f)).id,first.id);
 await writeFile(join(f.pluginRoot,'engine','input.txt'),'changed engine');await assert.rejects(selectRuntime(f),/changed|setup/i);
 const second=await installRuntime(f);assert.notEqual(second.id,first.id);assert.equal(await readFile(join(first.path,'engine','input.txt'),'utf8'),'engine');
 const pointer=JSON.parse(await readFile(join(f.dataDir,'runtime-v2.json'),'utf8'));assert.equal(pointer.previous[0].id,first.id);assert.equal(await readFile(legacy,'utf8'),'legacy pointer bytes');assert.equal(await readFile(join(f.dataDir,'runs','legacy.json'),'utf8'),'old run bytes');
 assert.equal((await installRuntime(f)).id,second.id);
});
test('run bindings retain exact runtime and session across upgrades and reject path or byte substitutions',async t=>{
 const f=await fixture(t);const first=await installRuntime(f);const bound=await bindRun({dataDir:f.dataDir,runtime:first,sessionId:'origin'});
 assert.equal(bound.runDir,join(paths(f.dataDir).runs,bound.id));assert.equal((await resolveRun({dataDir:f.dataDir,id:bound.id,sessionId:'origin'})).runtime.id,first.id);
 await writeFile(join(f.pluginRoot,'engine','input.txt'),'v2');await installRuntime(f);
 assert.equal((await resolveRun({dataDir:f.dataDir,id:bound.id,sessionId:'origin'})).runtime.id,first.id);
 await assert.rejects(resolveRun({dataDir:f.dataDir,id:bound.id,sessionId:'other'}),/session/i);await assert.rejects(resolveRun({dataDir:f.dataDir,id:'../runs'}),/identifier/i);
 const ownerPath=join(bound.runDir,'runtime.json'),owner=JSON.parse(await readFile(ownerPath,'utf8'));await writeFile(ownerPath,JSON.stringify({...owner,runtime:{...owner.runtime,path:f.pluginRoot}}));
 await assert.rejects(resolveRun({dataDir:f.dataDir,id:bound.id}),/runtime.*path|directory/i);await writeFile(ownerPath,JSON.stringify(owner));
 await writeFile(join(first.path,'foundation','input.txt'),'tampered');await assert.rejects(resolveRun({dataDir:f.dataDir,id:bound.id}),/digest|changed|integrity/i);
});
test('setup and selection reject incomplete installs, altered native bytes and linked inputs',async t=>{
 const f=await fixture(t);const first=await installRuntime(f);await writeFile(first.codex,'altered native binary');await assert.rejects(selectRuntime(f),/native|integrity/i);await assert.rejects(installRuntime(f),/native|integrity/i);
 const second=await fixture(t);await rm(join(second.pluginRoot,'foundation'),{recursive:true});await assert.rejects(installRuntime(second),/ENOENT|missing/i);
 const third=await fixture(t);await symlink(third.root,join(third.pluginRoot,'engine','outside'),process.platform==='win32'?'junction':'dir');await assert.rejects(sourceDigest(third.pluginRoot),/link/i);
});
test('dependency install failure does not select a runtime or remove existing user data',async t=>{
 const f=await fixture(t);await writeFile(f.npmCli,'process.exit(7)');await assert.rejects(installRuntime(f),/npm.*7/i);await assert.rejects(readFile(join(f.dataDir,'runtime-v2.json')),e=>e.code==='ENOENT');
});
test('runtime identity rejects modified transitive JavaScript and native sidecars',async t=>{
 const f=await fixture(t);await writeFile(f.npmCli,(await readFile(f.npmCli,'utf8'))+`\nawait mkdir('node_modules/transitive',{recursive:true});await writeFile('node_modules/transitive/runtime.js','original');`);
 const first=await installRuntime(f),bound=await bindRun({dataDir:f.dataDir,runtime:first,sessionId:'origin'});
 await writeFile(join(first.path,'node_modules/transitive/runtime.js'),'substituted');await assert.rejects(selectRuntime(f),/dependenc.*integrity|integrity.*dependenc/i);await assert.rejects(resolveRun({dataDir:f.dataDir,id:bound.id}),/dependenc.*integrity|integrity.*dependenc/i);
});

test('CLI and host hooks share the same default state despite host-only plugin data variables',()=>{
 const base=join(tmpdir(),'workflow-default-data');assert.equal(defaultDataDir({LOCALAPPDATA:base,PLUGIN_DATA:join(base,'host-only')}),defaultDataDir({LOCALAPPDATA:base}));
 assert.equal(defaultDataDir({LOCALAPPDATA:base,AGENT_WORKFLOW_DATA_DIR:join(base,'explicit')}),join(base,'explicit'));
});
