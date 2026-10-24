/** @lane merge
 * @subject bin/managed-runtime.mjs
 * @subject engine/monitor-adapters.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,readdir,cp,rename} from 'node:fs/promises';
import {join,relative} from 'node:path';
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

test('caller selection preserves a newer default across versions and same-version source fingerprints',async t=>{
 for(const sameVersion of [false,true])await t.test(sameVersion?'same version':'different versions',async t=>{
  const f=await fixture(t),olderCaller=join(f.root,'older-caller');await cp(f.pluginRoot,olderCaller,{recursive:true});
  const first=await installRuntime(f),bound=await bindRun({dataDir:f.dataDir,runtime:first,sessionId:'origin'});
  const owner=await readFile(join(bound.runDir,'runtime.json'));
  if(!sameVersion){const pkg=JSON.parse(await readFile(join(f.pluginRoot,'package.json'),'utf8'));pkg.version='0.3.0';await writeFile(join(f.pluginRoot,'package.json'),JSON.stringify(pkg));}
  await writeFile(join(f.pluginRoot,'engine','input.txt'),'newer source');const second=await installRuntime(f);
  const pointer=await readFile(paths(f.dataDir).pointer),runtimeNames=await readdir(paths(f.dataDir).runtimes);
  assert.equal((await selectRuntime({...f,pluginRoot:olderCaller})).id,first.id);
  assert.equal((await selectRuntime(f)).id,second.id);
  const added=await bindRun({dataDir:f.dataDir,runtime:await selectRuntime({...f,pluginRoot:olderCaller}),sessionId:'origin'});
  assert.equal((await resolveRun({dataDir:f.dataDir,id:added.id,sessionId:'origin'})).runtime.id,first.id);
  assert.equal((await resolveRun({dataDir:f.dataDir,id:bound.id,sessionId:'origin'})).runtime.id,first.id);
  assert.deepEqual(await readFile(join(bound.runDir,'runtime.json')),owner);
  assert.deepEqual(await readFile(paths(f.dataDir).pointer),pointer);assert.deepEqual(await readdir(paths(f.dataDir).runtimes),runtimeNames);
  // Only the used installation is verified; unrelated changed default files
  // do not certify or prevent a different caller's exact prepared execution.
  await writeFile(join(second.path,'engine','input.txt'),'damaged unrelated default');
  assert.equal((await selectRuntime({...f,pluginRoot:olderCaller})).id,first.id);
  assert.deepEqual(await readFile(paths(f.dataDir).pointer),pointer);
  const invalidPointer=JSON.parse(pointer);invalidPointer.current.path=f.root;await writeFile(paths(f.dataDir).pointer,JSON.stringify(invalidPointer));
  const invalidBytes=await readFile(paths(f.dataDir).pointer);
  await assert.rejects(selectRuntime({...f,pluginRoot:olderCaller}),/runtime.*path|directory/i);
  assert.deepEqual(await readFile(paths(f.dataDir).pointer),invalidBytes);
  for(const field of ['version','codexDigest','dependenciesDigest']){
   const malformed=JSON.parse(pointer);malformed.current[field]=[malformed.current[field]];await writeFile(paths(f.dataDir).pointer,JSON.stringify(malformed));
   await assert.rejects(selectRuntime({...f,pluginRoot:olderCaller}),/Invalid managed runtime record/);
  }
 });
});

test('a different-Node default does not weaken exact Node identity for the chosen installation or saved run',async t=>{
 const f=await fixture(t),runtime=await installRuntime(f),bound=await bindRun({dataDir:f.dataDir,runtime,sessionId:'origin'});
 const node=process.version==='v24.0.0'?'v24.1.0':'v24.0.0',id=`${runtime.version}-${runtime.digest.slice(0,16)}-node${node.slice(1)}`,path=join(paths(f.dataDir).runtimes,id);
 await cp(runtime.path,path,{recursive:true});const other={...runtime,node,id,path,codex:join(path,relative(runtime.path,runtime.codex))};await writeFile(join(path,'.runtime.json'),JSON.stringify(other));
 await writeFile(paths(f.dataDir).pointer,JSON.stringify({schema:2,current:other,previous:[runtime]}));const pointer=await readFile(paths(f.dataDir).pointer);
 assert.equal((await selectRuntime(f)).id,runtime.id);assert.deepEqual(await readFile(paths(f.dataDir).pointer),pointer);
 const ownerPath=join(bound.runDir,'runtime.json'),owner=JSON.parse(await readFile(ownerPath,'utf8'));await writeFile(ownerPath,JSON.stringify({...owner,runtime:other}));
 await assert.rejects(resolveRun({dataDir:f.dataDir,id:bound.id,sessionId:'origin'}),/original Node|requires Node/i);
});

test('missing or invalid matching installations fail without fallback, selection writes or run changes',async t=>{
 for(const scenario of ['missing','malformed','foreign-receipt','escaped-path','linked-install','source','native','dependencies'])await t.test(scenario,async t=>{
  const f=await fixture(t),olderCaller=join(f.root,'older-caller');await cp(f.pluginRoot,olderCaller,{recursive:true});const first=await installRuntime(f);
  const bound=await bindRun({dataDir:f.dataDir,runtime:first,sessionId:'origin'}),owner=await readFile(join(bound.runDir,'runtime.json'));
  await writeFile(join(f.pluginRoot,'engine','input.txt'),'newer source');const second=await installRuntime(f),pointer=await readFile(paths(f.dataDir).pointer);
  const receipt=join(first.path,'.runtime.json');
  if(scenario==='missing')await rm(receipt);
  if(scenario==='malformed')await writeFile(receipt,'not JSON');
  if(scenario==='foreign-receipt')await writeFile(receipt,JSON.stringify(second));
  if(scenario==='escaped-path')await writeFile(receipt,JSON.stringify({...first,path:f.root}));
  if(scenario==='linked-install'){const retained=join(f.root,'retained-first');await rename(first.path,retained);await symlink(retained,first.path,process.platform==='win32'?'junction':'dir');}
  if(scenario==='source')await writeFile(join(first.path,'engine','input.txt'),'tampered source');
  if(scenario==='native')await writeFile(first.codex,'tampered native');
  if(scenario==='dependencies')await writeFile(join(first.path,'node_modules','unexpected.txt'),'tampered dependencies');
  await assert.rejects(selectRuntime({...f,pluginRoot:olderCaller}),error=>{
   assert.equal(error.code,scenario==='missing'?'RUNTIME_MATCH_MISSING':'RUNTIME_MATCH_INVALID');
   assert.deepEqual(error.runtimeSelection,{reason:scenario==='missing'?'missing':'invalid',caller:{version:first.version,digest:first.digest,node:first.node},selected:{version:second.version,digest:second.digest,node:second.node}});
   assert.ok(error.message.length<=700);assert.ok(!error.message.includes(f.root));assert.match(error.message,/caller|recorded default/i);return true;
  });
  assert.deepEqual(await readFile(paths(f.dataDir).pointer),pointer);assert.deepEqual(await readFile(join(bound.runDir,'runtime.json')),owner);
 });
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

test('session adapters retain exact runtime controls and isolate navigation, visibility and receipts by session/run',async t=>{
 const {createSessionServices}=await import('../engine/monitor-adapters.mjs');
 const {DatabaseSync}=await import('node:sqlite');
 const f=await fixture(t);
 // Windows CI may supply an 8.3 TEMP alias. A differently cased spelling also
 // reproduces realpath changing the namespace retained in runtime records.
 if(process.platform==='win32')f.dataDir=join(f.root,'DATA');
 await writeFile(join(f.pluginRoot,'engine','monitor-data.mjs'),`import {readFile} from 'node:fs/promises';import {join} from 'node:path';export async function monitorData(runDir){return JSON.parse(await readFile(join(runDir,'snapshot.json'),'utf8'));}`);
 const control=marker=>`import {appendFile} from 'node:fs/promises';import {join,basename} from 'node:path';export async function requestControl(runDir,input){await appendFile(join(runDir,'controls-observed.jsonl'),JSON.stringify(input)+'\\n');return{marker:${JSON.stringify(marker)},runId:basename(runDir),action:input.action};}`;
 await writeFile(join(f.pluginRoot,'engine','controls.mjs'),control('first'));
 await writeFile(join(f.pluginRoot,'engine','background.mjs'),`export async function startBackground(input){return{marker:'first',runDir:input.runDir};}`);
 const first=await installRuntime(f),one=await bindRun({dataDir:f.dataDir,runtime:first,sessionId:'origin'}),foreign=await bindRun({dataDir:f.dataDir,runtime:first,sessionId:'other'});
 await writeFile(join(f.pluginRoot,'engine','controls.mjs'),control('second'));
 const second=await installRuntime(f),two=await bindRun({dataDir:f.dataDir,runtime:second,sessionId:'origin'});
 for(const owner of [one,two,foreign]){
  const state={version:1,sessionId:owner.sessionId,generation:1,runtimeIdentity:'d'.repeat(64),meta:{name:owner.id},status:'running',acceptingControls:true,workerCount:0,workers:[],attempts:0,coverage:{unknown:0},createdAt:owner.createdAt};
  await writeFile(join(owner.runDir,'snapshot.json'),JSON.stringify(state));
  const db=new DatabaseSync(join(owner.runDir,'run.sqlite'));db.exec('CREATE TABLE header(id INTEGER PRIMARY KEY,value TEXT); CREATE TABLE workers(generation INTEGER,position INTEGER,value TEXT,PRIMARY KEY(generation,position)); CREATE TABLE controls(id TEXT PRIMARY KEY,generation INTEGER,value TEXT);');db.prepare('INSERT INTO header VALUES(1,?)').run(JSON.stringify(state));db.close();
 }
 const linkedData=join(f.root,'linked-data');await symlink(f.dataDir,linkedData,process.platform==='win32'?'junction':'dir');
 await assert.rejects(createSessionServices({dataDir:linkedData,sessionId:'origin',pinnedRunId:two.id}),/linked/i);
 const {binding,services}=await createSessionServices({dataDir:f.dataDir,sessionId:'origin',pinnedRunId:two.id});
 assert.equal(binding.pinnedRunId,two.id);assert.equal(binding.runtimeId,second.id);
  const {startMonitor}=await import('../engine/monitor-launch.mjs');const monitor=await startMonitor(two.runDir,{binding});
  const url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token'),headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  try{
   const response=await fetch(url.origin+'/api/run',{headers});assert.equal(response.status,200);const observed=await response.json();
   assert.equal(observed.monitor.capabilities.sessionNavigation,true);assert.equal(observed.monitor.capabilities.lifecycle,true);assert.equal(observed.monitor.run.runtimeId,second.id);
   const page=await(await fetch(url.origin+'/api/session/runs',{headers})).json();assert.equal(page.items.length,2);
   const receipt=await fetch(url.origin+`/api/runs/${one.id}/control`,{method:'POST',headers,body:JSON.stringify({generation:1,action:'stop',target:{dataInstanceId:binding.dataInstanceId,runId:one.id,runtimeId:first.id,generation:1}})});
   assert.equal(receipt.status,202);assert.equal((await receipt.json()).marker,'first');
   const lifecycleTarget={dataInstanceId:binding.dataInstanceId,runId:two.id,runtimeId:second.id,generation:1};
   const hidden=await fetch(url.origin+`/api/runs/${two.id}/lifecycle`,{method:'POST',headers,body:JSON.stringify({action:'hide',runTarget:lifecycleTarget,target:{kind:'run'},generation:1,expectedRevision:0,requestId:'http-hide'})});
   assert.equal(hidden.status,202);const saved=await hidden.json();assert.equal(saved.receipt.runId,two.id);assert.equal(saved.receipt.outcome,'applied');
   const inspected=await fetch(url.origin+`/api/runs/${two.id}/lifecycle/receipts/http-hide`,{headers});assert.equal(inspected.status,200);assert.equal((await inspected.json()).receipt.id,'http-hide');
   const restored=await fetch(url.origin+`/api/runs/${two.id}/lifecycle`,{method:'POST',headers,body:JSON.stringify({action:'restore',runTarget:lifecycleTarget,target:{kind:'run'},generation:1,expectedRevision:1,requestId:'http-restore'})});assert.equal(restored.status,202);
  }finally{await fetch(url.origin+'/api/close',{method:'POST',headers,body:'{}'});}
 const page=await services.listSessionRuns({limit:100,cursor:null,includeHidden:false});assert.deepEqual(new Set(page.items.map(item=>item.ref.runId)),new Set([one.id,two.id]));
 const firstSnapshot=await services.readRun({runId:one.id}),target={...firstSnapshot.experience.run,generation:1};
 assert.equal(target.runtimeId,first.id);assert.equal(firstSnapshot.lifecycle.available,true);
 assert.deepEqual(await services.controlRun({target,action:'stop'}),{marker:'first',runId:one.id,action:'stop'});
 const secondSnapshot=await services.readRun({runId:two.id});assert.equal((await services.controlRun({target:{...secondSnapshot.experience.run,generation:1},action:'pause'})).marker,'second');
 await assert.rejects(services.controlRun({target:{...target,runtimeId:second.id},action:'stop'}),{code:'MONITOR_TARGET'});
 await assert.rejects(services.controlRun({target:{...target,generation:2},action:'stop'}),{code:'REPLAY_GENERATION'});
 await assert.rejects(services.readRun({runId:foreign.id}),/session/i);
 const hidden=await services.lifecycle({action:'hide',runTarget:target,generation:1,expectedRevision:0,requestId:'hide-first',target:{kind:'run'}});assert.equal(hidden.receipt.outcome,'applied');
 const filtered=await services.listSessionRuns({limit:100,includeHidden:false});assert.equal(filtered.hiddenCount,1);assert.deepEqual(filtered.items.map(item=>item.ref.runId),[two.id]);
 assert.equal((await services.listSessionRuns({limit:100,includeHidden:true})).items.length,2);
 assert.equal((await services.readLifecycleReceipt({runId:one.id,receiptId:'hide-first'})).receipt.id,'hide-first');
 await assert.rejects(services.readLifecycleReceipt({runId:two.id,receiptId:'hide-first'}),{code:'LIFECYCLE_MISSING'});
 assert.equal((await services.readRun({runId:one.id})).status,'running');
 const before=await readFile(join(one.runDir,'controls-observed.jsonl'),'utf8');
 await writeFile(join(first.path,'engine','controls.mjs'),control('tampered'));
 await assert.rejects(services.controlRun({target,action:'stop'}),/digest|integrity|changed/i);
 assert.equal(await readFile(join(one.runDir,'controls-observed.jsonl'),'utf8'),before);
});

test('session monitor opens an owned startup container without a database and preserves unavailable evidence without controls',async t=>{
 const {createSessionServices}=await import('../engine/monitor-adapters.mjs');
 const {startMonitor}=await import('../engine/monitor-launch.mjs');
 const {runWorkflow}=await import('../engine/controller.mjs');
 const f=await fixture(t);
 await writeFile(join(f.pluginRoot,'engine','monitor-data.mjs'),`export {monitorData} from ${JSON.stringify(new URL('../engine/monitor-data.mjs',import.meta.url).href)};`);
 // Retained runtimes include controls even when newer deadline exports are absent.
 await writeFile(join(f.pluginRoot,'engine','controls.mjs'),`export async function requestControl(){throw Error('Startup fixture controls must not execute');}`);
 const runtime=await installRuntime(f),failed=await bindRun({dataDir:f.dataDir,runtime,sessionId:'origin'}),healthy=await bindRun({dataDir:f.dataDir,runtime,sessionId:'origin'}),foreign=await bindRun({dataDir:f.dataDir,runtime,sessionId:'other'});
 await writeFile(join(failed.runDir,'finish-fixture.json'),JSON.stringify({status:'failed',inferenceRequests:0,cleanup:{serverExited:true}}));
 await runWorkflow({runDir:healthy.runDir,sessionId:'origin',script:'export const meta={name:"Healthy",description:"Fixture"};return 1;',backend:{identity:'fixture',execute:async()=>{throw Error('No workers');},close:async()=>({serverExited:true})}});
 const before=new Map(await Promise.all((await readdir(failed.runDir)).map(async name=>[name,await readFile(join(failed.runDir,name))])));
 await assert.rejects(createSessionServices({dataDir:f.dataDir,sessionId:'other',pinnedRunId:failed.id}),/session/i);
 const {binding}=await createSessionServices({dataDir:f.dataDir,sessionId:'origin',pinnedRunId:failed.id});
 const monitor=await startMonitor(failed.runDir,{binding}),url=new URL(monitor.url),token=new URLSearchParams(url.hash.slice(1)).get('token'),headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 try{
  assert.equal((await fetch(url.origin+'/api/run')).status,401);
  const state=await(await fetch(url.origin+'/api/run',{headers})).json();
  assert.equal(state.status,'unavailable');assert.equal(state.generation,null);assert.equal(state.availability.status,'unavailable');
  assert.deepEqual(state.workers,[]);assert.equal(state.coverage,undefined);assert.equal(state.cleanup,undefined);assert.equal(state.inferenceRequests,undefined);
  assert.equal(state.monitor.capabilities.sessionNavigation,true);assert.equal(state.monitor.capabilities.scopedControls,false);assert.equal(state.monitor.capabilities.lifecycle,false);
  const page=await(await fetch(url.origin+'/api/session/runs',{headers})).json();assert.equal(page.unavailableCount,1);assert.deepEqual(new Set(page.items.map(item=>item.ref.runId)),new Set([failed.id,healthy.id]));
  const healthyResponse=await fetch(url.origin+`/api/runs/${healthy.id}/run`,{headers});assert.equal(healthyResponse.status,200);const healthyState=await healthyResponse.json();
  assert.equal(healthyState.status,'completed');assert.equal(healthyState.deadlineControls.available,false);assert.equal(healthyState.deadlineControls.receipts,false);
  assert.equal((await fetch(url.origin+`/api/runs/${foreign.id}/run`,{headers})).ok,false);
  const target={dataInstanceId:binding.dataInstanceId,runId:failed.id,runtimeId:runtime.id,generation:1};
  for(const [path,body] of [['control',{action:'stop',generation:1,target}],['resume',{generation:1,target}],['lifecycle',{action:'hide',generation:1,runTarget:target,expectedRevision:0,target:{kind:'run'},requestId:'no-hide'}]])assert.equal((await fetch(url.origin+`/api/${path}`,{method:'POST',headers,body:JSON.stringify(body)})).status,503);
  assert.equal((await fetch(url.origin+'/api/script?generation=1',{headers})).ok,false);
  assert.deepEqual(await readdir(failed.runDir),[...before.keys()]);for(const [name,bytes]of before)assert.deepEqual(await readFile(join(failed.runDir,name)),bytes);
  await writeFile(join(failed.runDir,'run.sqlite'),'invalid database bytes');
  const corrupt=await(await fetch(url.origin+'/api/run',{headers})).json();assert.equal(corrupt.status,'unavailable');assert.equal(corrupt.generation,null);
  assert.equal(await readFile(join(failed.runDir,'run.sqlite'),'utf8'),'invalid database bytes');
  const owner=JSON.parse(before.get('runtime.json'));await writeFile(join(failed.runDir,'runtime.json'),JSON.stringify({...owner,sessionId:'other'}));
  assert.equal((await fetch(url.origin+'/api/run',{headers})).ok,false,'ownership mismatch never becomes a readable placeholder');
 }finally{await fetch(url.origin+'/api/close',{method:'POST',headers,body:'{}'});}
});
