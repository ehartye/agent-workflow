// @lane merge
// @subject engine/worker-capabilities.mjs
// @subject test/fixtures/capability-source-swap.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root=fileURLToPath(new URL('../',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function resolver(){const module=await import('../engine/worker-capabilities.mjs').catch(()=>null);assert.ok(module?.verifySkillSources,'Source verification must exist');return module;}
async function fixture(t){
  const source=await mkdtemp(join(root,'.capability-test-'));t.after(()=>rm(source,{recursive:true,force:true}));
  const path=join(source,'skills','compose','SKILL.md'),reference=join(source,'scripts','usage.md');
  await mkdir(dirname(path),{recursive:true});await mkdir(dirname(reference),{recursive:true});
  await writeFile(path,'---\nname: plugin:compose\n---\nNative content; no manual injection.\n');
  await writeFile(reference,'Keep the original plugin-relative layout.\n');
  return {source,path,reference,skill:{id:'compose',name:'plugin:compose',root:source,path,sha256:digest(await readFile(path)),references:[{path:'scripts/usage.md',sha256:digest(await readFile(reference))}]}};
}
test('source verification checks original bytes and references without extracting a skill body',async t=>{
  const {verifySkillSources}=await resolver(),{skill,path}=await fixture(t);
  const verified=await verifySkillSources([skill]);
  assert.match(verified.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(verified.skills[0].path,path);assert.equal(verified.skills[0].references.length,1);
  assert.equal(Object.isFrozen(verified.skills[0]),true);
  assert.doesNotMatch(JSON.stringify(verified),/Native content|no manual injection/);
});
test('source identity drift and escaping references fail closed',async t=>{
  const {verifySkillSources}=await resolver(),{skill,path,reference}=await fixture(t);
  for(const change of [{enabled:true},{sha256:'0'.repeat(64)},{references:[{path:'../escape.md',sha256:skill.sha256}]},{references:[{path:'scripts/usage.md',sha256:skill.sha256}]},{path:reference}]){
    await assert.rejects(verifySkillSources([{...skill,...change}]),error=>/^SKILL_/.test(error.code));
  }
  await writeFile(path,'Changed source');await assert.rejects(verifySkillSources([skill]),{code:'SKILL_SOURCE'});
});

async function retainedFixture(t){
  const directory=await mkdtemp(join(tmpdir(),'workflow-retained-sources-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const source=join(directory,'cache','plugin','1.0.0'),runDir=join(directory,'run');
  const path=join(source,'skills','compose','SKILL.md'),reference=join(source,'scripts','usage.md');
  await mkdir(dirname(path),{recursive:true});await mkdir(dirname(reference),{recursive:true});await mkdir(runDir);
  await writeFile(path,'---\nname: fixture:compose\n---\nPRIVATE_RETAINED_SKILL_BODY');await writeFile(reference,'PRIVATE_RETAINED_REFERENCE');
  await writeFile(join(source,'scripts','run.mjs'),'process.stdout.write("RETAINED_TOOL_OK");');
  await mkdir(join(source,'.codex-plugin'));await writeFile(join(source,'.codex-plugin','plugin.json'),'{"name":"fixture"}');
  const manifest={version:1,skills:[{id:'compose',name:'fixture:compose',root:source,path,sha256:digest(await readFile(path)),references:[{path:'scripts/usage.md',sha256:digest(await readFile(reference))}]}],tools:[]};
  return {directory,source,runDir,path,reference,manifest};
}

test('retained packages preserve complete plugin layout and real tool execution after original cache deletion',async t=>{
  const {captureCapabilitySources,loadCapabilitySources}=await import('../engine/capability-sources.mjs'),f=await retainedFixture(t);
  const descriptor=await captureCapabilitySources({runDir:f.runDir,manifest:f.manifest});
  await rm(f.source,{recursive:true});
  const loaded=await loadCapabilitySources({runDir:f.runDir,descriptor});
  assert.deepEqual(loaded.manifest,f.manifest,'original provenance is unchanged');
  const skill=loaded.executionManifest.skills[0];assert.notEqual(skill.root,f.source);assert.equal(skill.sha256,f.manifest.skills[0].sha256);
  assert.equal(await readFile(join(skill.root,'.codex-plugin','plugin.json'),'utf8'),'{"name":"fixture"}');
  assert.equal(await readFile(join(skill.root,'scripts','usage.md'),'utf8'),'PRIVATE_RETAINED_REFERENCE');
  const result=await promisify(execFile)(process.execPath,[join(skill.root,'scripts','run.mjs')],{windowsHide:true});
  assert.equal(result.stdout,'RETAINED_TOOL_OK');assert.equal(result.stderr,'');
  const {freezeCapabilities,selectCapabilities}=await resolver();
  const bundle=await freezeCapabilities(f.manifest,{runDir:f.runDir,capabilitySources:descriptor});
  assert.deepEqual(bundle.manifest,f.manifest);assert.deepEqual(bundle.executionManifest,loaded.executionManifest);
  assert.equal(selectCapabilities(bundle.executionManifest,{skills:['compose']}).roots[0].location.path,dirname(skill.path));
  assert.doesNotMatch(JSON.stringify(descriptor),/PRIVATE_RETAINED/);
});

test('retention coalesces a parent plugin and selected skill while mapping associated launcher and exact readiness paths',async t=>{
  const {captureCapabilitySources,loadCapabilitySources}=await import('../engine/capability-sources.mjs'),f=await retainedFixture(t);
  const state=join(f.directory,'managed');await mkdir(state);await writeFile(join(state,'receipt.json'),'{}');
  const launcher=join(f.source,'scripts','run.mjs');
  await writeFile(launcher,'import {readFileSync} from "node:fs";if(readFileSync(process.argv[2],"utf8")!=="PRIVATE_RETAINED_REFERENCE")throw Error("wrong reference");process.stdout.write("RETAINED_TOOL_OK");');
  const receipt={path:'receipt.json',sha256:digest('{}')};
  f.manifest.tools.push({id:'compose-tool',skills:['compose'],node:{path:process.execPath,version:process.version,sha256:digest(await readFile(process.execPath))},launcher:{root:f.source,path:launcher,sha256:digest(await readFile(launcher))},runtime:{root:state,files:[receipt],receipt},dependencies:{root:state,files:[receipt],receipt},environment:{AGENT_BEEPS_HOME:state},readiness:[{id:'reference',args:[f.reference],marker:'RETAINED_TOOL_OK',timeoutMs:2000}],guidance:'Native plugin launcher; opaque text is not rewritten.'});
  const roots=[{id:'parent-plugin',location:{type:'environment',environmentId:'local',path:f.source}},{id:'parent-skill',location:{type:'environment',environmentId:'local',path:dirname(f.path)}}];
  const parentCapabilities={roots,inventory:{plugins:[],skills:[{path:f.path}]},coverage:{complete:true},fingerprint:'a'.repeat(64)};
  const {freezeCapabilities,selectCapabilities,admitWorkerCapabilities}=await resolver(),original=await freezeCapabilities(f.manifest);
  const descriptor=await captureCapabilitySources({runDir:f.runDir,manifest:f.manifest,parentCapabilities});
  await rm(f.source,{recursive:true});
  const loaded=await loadCapabilitySources({runDir:f.runDir,descriptor}),bundle=await freezeCapabilities(f.manifest,{runDir:f.runDir,capabilitySources:descriptor});
  assert.equal(bundle.fingerprint,original.fingerprint);assert.notEqual(bundle.executionManifest.tools[0].launcher.path,launcher);
  assert.equal(loaded.parentCapabilities.roots[1].location.path,dirname(bundle.executionManifest.skills[0].path));
  assert.equal(loaded.parentCapabilities.roots[0].location.path,bundle.executionManifest.skills[0].root);
  assert.equal(loaded.parentCapabilities.sourceRetention.originFingerprint,parentCapabilities.fingerprint);
  const seen=[],selection=selectCapabilities(bundle.executionManifest,{skills:['compose'],requireTools:['compose-tool']});
  const evidence=await admitWorkerCapabilities(commandClient(seen,{...process.env,AGENT_BEEPS_HOME:state}),{cwd:f.directory,selection});
  assert.equal(evidence.tools[0].status,'passed');assert.equal(evidence.tools[0].environment.AGENT_BEEPS_HOME,state);
  assert.equal(seen.at(-1).command[2],join(bundle.executionManifest.skills[0].root,'scripts','usage.md'));
});

test('retained packages reject changed, added, missing and linked files rather than consulting the old cache',async t=>{
  const {captureCapabilitySources,loadCapabilitySources}=await import('../engine/capability-sources.mjs');
  for(const change of ['changed','added','missing','link'])await t.test(change,async child=>{
    const f=await retainedFixture(child),descriptor=await captureCapabilitySources({runDir:f.runDir,manifest:f.manifest});
    const loaded=await loadCapabilitySources({runDir:f.runDir,descriptor}),source=loaded.executionManifest.skills[0].root;
    if(change==='changed')await writeFile(join(source,'scripts','usage.md'),'tampered');
    if(change==='added')await writeFile(join(source,'extra.md'),'undeclared');
    if(change==='missing')await rm(join(source,'scripts','usage.md'));
    if(change==='link')await symlink(f.source,join(source,'linked'),process.platform==='win32'?'junction':'dir');
    await assert.rejects(loadCapabilitySources({runDir:f.runDir,descriptor}),{code:'CAPABILITY_SOURCES'});
  });
});

test('source retention refuses linked sources, a store inside its source, republishing and corrupt descriptors',async t=>{
  const {captureCapabilitySources,loadCapabilitySources}=await import('../engine/capability-sources.mjs'),f=await retainedFixture(t);
  await assert.rejects(captureCapabilitySources({runDir:f.source,manifest:f.manifest}),{code:'CAPABILITY_SOURCES'});
  const descriptor=await captureCapabilitySources({runDir:f.runDir,manifest:f.manifest});
  await assert.rejects(captureCapabilitySources({runDir:f.runDir,manifest:f.manifest}),{code:'CAPABILITY_SOURCES'});
  for(const bad of [{...descriptor,sha256:'0'.repeat(64)},{...descriptor,path:f.source},{...descriptor,bytes:descriptor.bytes+1}]){
    await assert.rejects(loadCapabilitySources({runDir:f.runDir,descriptor:bad}),{code:'CAPABILITY_SOURCES'});
  }
  const second=await retainedFixture(t);await symlink(f.source,join(second.source,'linked'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(captureCapabilitySources({runDir:second.runDir,manifest:second.manifest}),{code:'CAPABILITY_SOURCES'});
});

test('an empty retained capability bundle still rejects a linked package container',async t=>{
  const {captureCapabilitySources,loadCapabilitySources}=await import('../engine/capability-sources.mjs'),f=await retainedFixture(t);
  const descriptor=await captureCapabilitySources({runDir:f.runDir,manifest:{version:1,skills:[],tools:[]}});
  const container=join(f.runDir,'source-packages-v1','packages'),outside=join(f.directory,'empty');await mkdir(outside);await rm(container,{recursive:true});
  await symlink(outside,container,process.platform==='win32'?'junction':'dir');
  await assert.rejects(loadCapabilitySources({runDir:f.runDir,descriptor}),{code:'CAPABILITY_SOURCES'});
});

test('retention rejects a plugin manifest changed after native catalog discovery',async t=>{
  const {captureCapabilitySources}=await import('../engine/capability-sources.mjs'),f=await retainedFixture(t);
  const parentCapabilities={roots:[{id:'plugin',location:{type:'environment',environmentId:'local',path:f.source}}],inventory:{plugins:[{id:'fixture@owned',rootId:'plugin',manifestSha256:digest('{"name":"fixture"}')}],skills:[]},coverage:{complete:true},fingerprint:'a'.repeat(64)};
  await writeFile(join(f.source,'.codex-plugin','plugin.json'),'{"name":"fixture","version":"changed"}');
  await assert.rejects(captureCapabilitySources({runDir:f.runDir,manifest:f.manifest,parentCapabilities}),{code:'CAPABILITY_SOURCES'});
});

test('an intermediate destination junction is rejected before any file is created outside its retained package',async()=>{
  const result=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./fixtures/capability-source-swap.mjs',import.meta.url))],{windowsHide:true,timeout:10000,maxBuffer:8192});
  const observed=JSON.parse(result.stdout);assert.equal(observed.swapped,true);assert.equal(observed.error,'CAPABILITY_SOURCES');
  assert.equal(observed.outsideCreated,false,'rejection after writing through the junction is too late');
});
test('duplicate IDs names paths and unbounded references are rejected',async t=>{
  const {verifySkillSources}=await resolver(),{skill}=await fixture(t);
  for(const skills of [[skill,skill],[skill,{...skill,id:'other'}],[{...skill,references:Array(65).fill(skill.references[0])}],null]){
    await assert.rejects(verifySkillSources(skills),{code:'SKILL_MANIFEST'});
  }
});

test('native discovery refuses broader plugin manifests and undeclared nested skills',async t=>{
  const {verifySkillSources}=await resolver();
  for(const name of ['plugin.json','.codex-plugin/plugin.json','.claude-plugin/plugin.json','.cursor-plugin/plugin.json','nested/.cursor-plugin/plugin.json','nested/SKILL.md']){
    await t.test(name,async child=>{
      const {skill,path}=await fixture(child),extra=join(dirname(path),name);
      await mkdir(dirname(extra),{recursive:true});await writeFile(extra,'{}');
      await assert.rejects(verifySkillSources([skill]),{code:'SKILL_SOURCE'});
    });
  }
});

test('native discovery refuses descendant directory links without following them',async t=>{
  const {verifySkillSources}=await resolver(),{skill,path,source}=await fixture(t);
  const outside=join(source,'outside');await mkdir(outside);await writeFile(join(outside,'SKILL.md'),'Undeclared skill');
  await symlink(outside,join(dirname(path),'linked'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(verifySkillSources([skill]),{code:'SKILL_SOURCE'});
});

test('native skill metadata and resources must belong to the declared source identity',async t=>{
  const {verifySkillSources}=await resolver(),{skill,path,source}=await fixture(t);
  const metadata=join(dirname(path),'agents','openai.yaml');await mkdir(dirname(metadata),{recursive:true});
  await writeFile(metadata,'policy:\n  allow_implicit_invocation: false\n');
  await assert.rejects(verifySkillSources([skill]),{code:'SKILL_SOURCE'});
  skill.references.push({path:'skills/compose/agents/openai.yaml',sha256:digest(await readFile(metadata))});
  await verifySkillSources([skill]);
  await writeFile(metadata,'changed metadata');await assert.rejects(verifySkillSources([skill]),{code:'SKILL_SOURCE'});
});

test('immutable bundle rejects unknown grants and selects exact native executor roots',async t=>{
  const {freezeCapabilities,selectCapabilities}=await resolver(),{skill}=await fixture(t);
  assert.equal(typeof freezeCapabilities,'function');
  const bundle=await freezeCapabilities({version:1,skills:[skill],tools:[]});
  const selected=selectCapabilities(bundle.manifest,{skills:['compose']});
  assert.deepEqual(selected.roots,[{id:'compose',location:{type:'environment',environmentId:'local',path:dirname(skill.path)}}]);
  assert.equal(selected.native.catalog,'notObserved');
  assert.match(selected.instructions,/skills\.list/);assert.match(selected.instructions,/skills\.read/);
  assert.doesNotMatch(selected.instructions,/Native content|no manual injection/);
  for(const value of [{version:1,skills:[skill],tools:[],ready:true},{version:2,skills:[],tools:[]}])await assert.rejects(freezeCapabilities(value),{code:'CAPABILITY_MANIFEST'});
  for(const options of [{skills:null},{requireTools:null},{skills:['missing']},{skills:['compose','compose']},{skills:[skill.path]},{skills:['compose'],requireTools:['missing']}])assert.throws(()=>selectCapabilities(bundle.manifest,options),{code:'CAPABILITY_SELECTION'});
});

test('valid oversized capability commands are rejected before process dispatch',async t=>{
  const {selectCapabilities}=await resolver(),{skill,tool}=await toolFixture(t);
  tool.guidance='g'.repeat(4000);
  const first=tool.runtime.files[0];
  tool.runtime.files=Array.from({length:64},(_,index)=>({path:`${'a'.repeat(180)}${index}/file`,sha256:first.sha256}));
  const {validateCapabilities}=await resolver();
  const manifest=validateCapabilities({version:1,skills:[skill],tools:[tool]});
  assert.ok(Buffer.byteLength(JSON.stringify(manifest))<256*1024);
  assert.throws(()=>selectCapabilities(manifest,{skills:['compose'],requireTools:['compose-tool']}),{code:'CAPABILITY_SELECTION'});
});

async function toolFixture(t){
  const f=await fixture(t),launcher=join(f.source,'scripts','run-managed.mjs');
  await writeFile(launcher,'const mode=process.argv[2];process.stdout.write(mode==="emit"?Buffer.from(process.argv[3],"base64").toString("utf8"):mode==="capped-json"?JSON.stringify({ready:true,padding:"x".repeat(8165)}):mode==="fail"?"PRIVATE_DIAGNOSTIC":"READY\\n");process.exitCode=mode==="emit"?Number(process.argv[4]??0):mode==="fail"?7:0;');
  await writeFile(join(f.source,'receipt.json'),'{}');
  const receipt={path:'receipt.json',sha256:digest(await readFile(join(f.source,'receipt.json')))};
  const tool={id:'compose-tool',skills:['compose'],node:{path:process.execPath,version:process.version,sha256:digest(await readFile(process.execPath))},launcher:{root:f.source,path:launcher,sha256:digest(await readFile(launcher))},runtime:{root:f.source,files:[{path:'scripts/run-managed.mjs',sha256:digest(await readFile(launcher))}],receipt},dependencies:{root:f.source,files:[receipt],receipt},environment:{AGENT_BEEPS_HOME:f.source},readiness:[{id:'capabilities',args:['ready'],marker:'READY',timeoutMs:1000}],guidance:'Use the managed tool from the native skill instructions.'};
  return {...f,tool};
}
function commandClient(seen,env,expectedPolicy={type:'readOnly',networkAccess:false}){
  return{async request(method,params){
    assert.equal(method,'command/exec');seen.push(params);
    assert.deepEqual(params.sandboxPolicy,expectedPolicy);
    assert.equal(params.streamStdoutStderr,false);
    try{const result=await promisify(execFile)(params.command[0],params.command.slice(1),{cwd:params.cwd,env,timeout:params.timeoutMs,windowsHide:true,maxBuffer:8192});return{exitCode:0,...result};}
    catch(error){if(Number.isInteger(error.code))return{exitCode:error.code,stdout:error.stdout,stderr:error.stderr};throw error;}
  }};
}
test('required managed readiness executes real processes; optional tools retain missing stages',async t=>{
  const {freezeCapabilities,selectCapabilities,admitWorkerCapabilities}=await resolver(),{skill,tool,source,reference}=await toolFixture(t);
  assert.equal(typeof admitWorkerCapabilities,'function');
  const bundle=await freezeCapabilities({version:1,skills:[skill],tools:[tool]});
  const env={...process.env,...tool.environment},seen=[];
  const optional=await admitWorkerCapabilities(commandClient(seen,env),{cwd:source,selection:selectCapabilities(bundle.manifest,{skills:['compose']})});
  assert.equal(optional.tools[0].status,'notChecked');assert.deepEqual(optional.tools[0].missing,['source','readiness']);
  assert.ok(optional.instructions.includes(JSON.stringify(reference)),'Verified external documents need their actual original path after native activation');
  assert.match(optional.instructions,/outside.*native.*package/i);
  assert.equal(optional.instructions.includes(tool.node.path),false,'optional metadata is not admitted invocation guidance');
  assert.equal(seen.length,1,'only skill source check runs for independent authoring');
  const admitted=await admitWorkerCapabilities(commandClient(seen,env),{cwd:source,selection:selectCapabilities(bundle.manifest,{skills:['compose'],requireTools:['compose-tool']})});
  assert.equal(admitted.tools[0].status,'passed');assert.equal(admitted.tools[0].stages.at(-1).exitCode,0);
  assert.equal(admitted.tools[0].stages.at(-1).start,'observed');assert.equal(admitted.native.catalog,'notObserved');
  assert.equal(admitted.tools[0].stages.at(-1).expectation,'marker');assert.equal(admitted.tools[0].stages.at(-1).matched,true);
  assert.doesNotMatch(JSON.stringify(admitted),/PRIVATE_DIAGNOSTIC/);
  const {runWorkerSession}=await import('../engine/worker-session.mjs');
  let taskPrompt;
  await runWorkerSession({}, {threadId:'fixture',prompt:'Use the admitted tool',settings:{model:'fixture-model',effort:'low'},capabilities:admitted,turn:async(client,input)=>{
    taskPrompt=input.prompt;return{text:'done',turnId:'fixture-turn',items:[]};
  }});
  const metadata={id:tool.id,node:{path:tool.node.path,version:tool.node.version},launcher:tool.launcher.path,environment:tool.environment,readiness:tool.readiness};
  assert.ok(taskPrompt.includes(JSON.stringify(metadata)),'initial model task receives exact verified invocation paths, environment and checked stages');
  assert.doesNotMatch(taskPrompt,/Native content; no manual injection/,'skill bodies are not copied into task prompts');
});

test('required native tool readiness uses the admitted parent policy for source and executable checks',async t=>{
 const {freezeCapabilities,selectCapabilities,admitWorkerCapabilities}=await resolver(),{skill,tool,source}=await toolFixture(t);
 const bundle=await freezeCapabilities({version:1,skills:[skill],tools:[tool]}),seen=[],sandboxPolicy={type:'dangerFullAccess'};
 const result=await admitWorkerCapabilities(commandClient(seen,{...process.env,...tool.environment},sandboxPolicy),{cwd:source,selection:selectCapabilities(bundle.manifest,{skills:['compose'],requireTools:['compose-tool']}),sandboxPolicy});
 assert.equal(result.tools[0].status,'passed');assert.equal(seen.length,3);
 assert.equal(seen.at(-1).command[1],tool.launcher.path);
 assert.equal(result.native.catalog,'notObserved','readiness does not claim genuine skill invocation');
});

test('readiness JSON expectations are bounded own scalar fields and exclusive with text markers',async t=>{
  const {validateCapabilities}=await resolver(),{skill,tool}=await toolFixture(t);
  const stage={id:'ready',args:[],json:{ready:true,count:2,version:'',missing:null},timeoutMs:1000};
  const validate=value=>validateCapabilities({version:1,skills:[skill],tools:[{...tool,readiness:[value]}]});
  assert.deepEqual(validate(stage).tools[0].readiness[0],stage);
  const inherited=Object.create({ready:true});inherited.count=1;
  const accessor={};Object.defineProperty(accessor,'ready',{enumerable:true,get(){throw Error('expectation getter executed');}});
  for(const json of [{},[],null,{ready:[]},{ready:{}},{ready:undefined},{ready:Infinity},{ready:NaN},{ready:'x'.repeat(201)},Object.fromEntries(Array.from({length:17},(_,i)=>['k'+i,true])),JSON.parse('{"__proto__":true}'),{constructor:true},{prototype:true},{'bad\nkey':true},{'a.b':true},{['x'.repeat(101)]:true},inherited,accessor]){
    assert.throws(()=>validate({...stage,json}),{code:'CAPABILITY_MANIFEST'});
  }
  assert.throws(()=>validate({...stage,marker:'READY'}),{code:'CAPABILITY_MANIFEST'});
  const {json,...neither}=stage;assert.throws(()=>validate(neither),{code:'CAPABILITY_MANIFEST'});
});

test('readiness JSON checks entire bounded stdout, exact own fields and executed failure without retaining output',async t=>{
  const {freezeCapabilities,selectCapabilities,admitWorkerCapabilities}=await resolver(),{skill,tool,source}=await toolFixture(t);
  const run=async({stdout,exit=0,json={ready:true},mode='emit'})=>{
    tool.readiness=[{id:'json-ready',args:mode==='emit'?['emit',Buffer.from(stdout).toString('base64'),String(exit)]:[mode],json,timeoutMs:1000}];
    const bundle=await freezeCapabilities({version:1,skills:[skill],tools:[tool]}),seen=[];
    try{const evidence=await admitWorkerCapabilities(commandClient(seen,{...process.env,...tool.environment}),{cwd:source,selection:selectCapabilities(bundle.manifest,{skills:['compose'],requireTools:['compose-tool']})});return{evidence,stage:evidence.tools[0].stages.at(-1),seen};}
    catch(error){assert.equal(error.code,'CAPABILITY_READINESS');assert.equal(error.noInference,true);assert.notEqual(error.executionUnknown,true);return{error,evidence:error.capabilities,stage:error.capabilities.tools[0].stages.at(-1),seen};}
  };
  const passed=await run({stdout:' \n'+JSON.stringify({ready:true,count:2,version:'',missing:null,unasserted:{secret:'PRIVATE_JSON_OUTPUT'}})+'\n',json:{ready:true,count:2,version:'',missing:null}});
  assert.equal(passed.error,undefined);assert.equal(passed.stage.status,'passed');assert.equal(passed.stage.expectation,'json');assert.equal(passed.stage.matched,true);assert.equal(passed.stage.markerObserved,undefined);
  assert.doesNotMatch(JSON.stringify(passed.evidence),/PRIVATE_JSON_OUTPUT/);
  for(const value of [{stdout:'{"ready":"true"}'},{stdout:'{}'},{stdout:'null'},{stdout:'[{"ready":true}]'},{stdout:'{"ready":true}\nextra'},{stdout:'prefix {"ready":true}'},{stdout:'{"ready":true}',exit:7},{mode:'capped-json'}]){
    const failed=await run(value);assert.ok(failed.error);assert.equal(failed.stage.status,'failed');assert.equal(failed.stage.start,'observed');assert.equal(failed.stage.expectation,'json');assert.equal(failed.seen.length,3,'one source and tool check, one readiness command; no retry');
    if(value.mode==='capped-json')assert.equal(failed.stage.outputTruncated,true);
    else if(value.exit)assert.equal(failed.stage.exitCode,7);
    else assert.equal(failed.stage.matched,false);
  }
});
test('nonzero executed readiness and unknown transport failures never certify no startup or retry',async t=>{
  const {freezeCapabilities,selectCapabilities,admitWorkerCapabilities}=await resolver(),{skill,tool,source}=await toolFixture(t);
  tool.readiness[0].args=['fail'];
  const bundle=await freezeCapabilities({version:1,skills:[skill],tools:[tool]}),selection=selectCapabilities(bundle.manifest,{skills:['compose'],requireTools:['compose-tool']}),seen=[];
  await assert.rejects(admitWorkerCapabilities(commandClient(seen,{...process.env,...tool.environment}),{cwd:source,selection}),error=>{
    const stage=error.capabilities.tools[0].stages.at(-1);
    assert.equal(stage.start,'observed');assert.equal(stage.exitCode,7);assert.equal(stage.status,'failed');assert.equal(error.noInference,true);assert.notEqual(error.noProcessStarted,true);assert.notEqual(error.executionUnknown,true);
    assert.doesNotMatch(JSON.stringify(error.capabilities),/PRIVATE_DIAGNOSTIC/);return true;
  });
  assert.equal(seen.length,3);
  let calls=0;
  await assert.rejects(admitWorkerCapabilities({async request(){calls++;throw Error('PRIVATE_DIAGNOSTIC');}},{cwd:source,selection}),error=>{
    assert.equal(error.capabilities.sources.start,'unknown');assert.notEqual(error.noProcessStarted,true);assert.equal(error.executionUnknown,true);return true;
  });assert.equal(calls,1);
});

test('readiness shares a bounded deadline and dispatches nothing after it expires',async t=>{
  const {freezeCapabilities,selectCapabilities,admitWorkerCapabilities}=await resolver(),{skill,tool,source}=await toolFixture(t);
  const bundle=await freezeCapabilities({version:1,skills:[skill],tools:[tool]}),selection=selectCapabilities(bundle.manifest,{skills:['compose'],requireTools:['compose-tool']});
  const seen=[],deadline=performance.now()+80;
  await assert.rejects(admitWorkerCapabilities({async request(method,params,options){
    seen.push({params,options});await new Promise(resolve=>setTimeout(resolve,100));
    return{exitCode:0,stdout:'WORKER_SKILL_SOURCE_OK',stderr:''};
  }},{cwd:source,selection,deadline}),error=>{
    assert.equal(error.code,'CAPABILITY_READINESS');assert.equal(error.noInference,true);
    assert.equal(error.capabilities.sources.start,'observed');assert.equal(error.capabilities.sources.exitCode,0);assert.notEqual(error.executionUnknown,true);return true;
  });
  assert.equal(seen.length,1);assert.ok(seen[0].params.timeoutMs<=80);assert.ok(seen[0].options.timeoutMs<=80);
  await assert.rejects(admitWorkerCapabilities({async request(){throw Error('expired deadline dispatched a command');}},{cwd:source,selection,deadline:performance.now()-1}),error=>{
    assert.equal(error.capabilities.sources.start,'notStarted');assert.notEqual(error.executionUnknown,true);return true;
  });
});

test('native skills observation excludes payloads foreign namespaces and ambiguous pairs',async()=>{
 const {observeNativeSkills}=await resolver();let listener;const evidence={catalog:'notObserved',read:'notObserved'};
 const client={onNotification(fn){listener=fn;return()=>{};}};
 const observer=observeNativeSkills(client,'owned',evidence);
 const notify=item=>listener({method:'rawResponseItem/completed',params:{threadId:'owned',turnId:'initial',item}});
 notify({type:'function_call',call_id:'foreign',namespace:'other',name:'skills.list',arguments:'PRIVATE_PAYLOAD'});
 notify({type:'function_call_output',call_id:'foreign',output:'PRIVATE_PAYLOAD'});
 notify({type:'function_call',call_id:'ambiguous',namespace:'skills',name:'list',arguments:'PRIVATE_PAYLOAD'});
 notify({type:'function_call',call_id:'ambiguous',namespace:'skills',name:'read',arguments:'PRIVATE_PAYLOAD'});
 notify({type:'function_call_output',call_id:'ambiguous',output:'PRIVATE_PAYLOAD'});
 observer.confirm('initial');observer.finish();
 assert.equal(evidence.catalog,'notObserved');assert.equal(evidence.read,'notObserved');
 assert.doesNotMatch(JSON.stringify(evidence),/PRIVATE_PAYLOAD/);
 assert.equal(evidence.observations.some(entry=>entry.callId==='foreign'),false);
});

test('required activation identifies each original main read and excludes failed partial or mismatched reads',async t=>{
  const {observeNativeSkills}=await resolver(),f=await fixture(t);
  const skills=[f.skill,{...f.skill,id:'other',path:join(f.source,'skills','other','SKILL.md')}];
  const exercise=items=>{
    let listener;const evidence={catalog:'notObserved',read:'notObserved'};
    const observer=observeNativeSkills({onNotification(fn){listener=fn;return()=>{};}},'owned',evidence,{skills});
    for(const item of items)listener({method:'rawResponseItem/completed',params:{threadId:'owned',turnId:'initial',item}});
    observer.confirm('initial');observer.finish();return evidence;
  };
  const pair=(id,root,{cursor,resource=`skill://${id}/${root.replaceAll('\\','/')}/SKILL.md`,output}={})=>[
    {type:'function_call',call_id:id,namespace:'skills',name:'read',arguments:JSON.stringify({package:`skill://${id}/${root}`,...(cursor?{cursor}:{}),resource})},
    {type:'function_call_output',call_id:id,output:output??JSON.stringify({resource,skill_root:root,contents:'PRIVATE_SKILL_CONTENTS',next_cursor:null})},
  ];
  const compose=dirname(f.skill.path),other=dirname(skills[1].path);
  const passed=exercise([...pair('compose',compose),...pair('other',other)]);
  assert.deepEqual(passed.activation,{status:'complete',required:['compose','other'],observed:['compose','other'],missing:[],body:'notVerified'});
  assert.equal(passed.readRootMatch,'observedForSelectedMainReads');
  for(const rejected of [[],pair('other',other,{output:'skill package is not available'}),pair('other',other,{cursor:'continuation'}),
    pair('other',compose),pair('other',other,{resource:`skill://other/${other.replaceAll('\\','/')}/references.md`}),
    pair('other',other,{output:JSON.stringify({resource:`skill://other/${other.replaceAll('\\','/')}/SKILL.md`,skill_root:other,contents:'PRIVATE_SKILL_CONTENTS',next_cursor:null,extra:'PRIVATE_OUTPUT'})})]){
    const evidence=exercise([...pair('compose',compose),...rejected]);
    assert.equal(evidence.activation.status,'incomplete');assert.deepEqual(evidence.activation.missing,['other']);
    assert.doesNotMatch(JSON.stringify(evidence),/PRIVATE_|skill package|skill:\/\/|SKILL.md|contents/);
  }
  const conflicting=pair('compose',compose);
  conflicting.push({...conflicting[1],output:JSON.stringify({resource:`skill://compose/${other.replaceAll('\\','/')}/SKILL.md`,skill_root:other,contents:'PRIVATE_SKILL_CONTENTS',next_cursor:null})});
  assert.deepEqual(exercise(conflicting).activation.missing,['compose','other'],'conflicting resource identity cannot certify activation');
  const reused=pair('compose',compose);
  reused.splice(1,0,{...reused[0],arguments:JSON.stringify({package:'skill://different-package'})});
  assert.deepEqual(exercise(reused).activation.missing,['compose','other'],'duplicate call identities cannot conceal different package requests');
  assert.doesNotMatch(JSON.stringify(passed),/PRIVATE_|skill:\/\/|SKILL.md|contents/);
});

test('native skill proof stays incomplete when early coverage drops a conflicting identity',async()=>{
  const {observeNativeSkills}=await resolver();
  const {EARLY_TOOL_LIMIT}=await import('../foundation/tool-observation.mjs');
  let listener;const evidence={catalog:'notObserved',read:'notObserved'};
  const observer=observeNativeSkills({onNotification(fn){listener=fn;return()=>{};}},'owned',evidence);
  const notify=item=>listener({method:'rawResponseItem/completed',params:{threadId:'owned',turnId:'initial',item}});
  for(const name of ['list','read']){
    notify({type:'function_call',call_id:name,namespace:'skills',name,arguments:'{}'});
    notify({type:'function_call_output',call_id:name,output:'PRIVATE_PAYLOAD'});
  }
  for(let index=4;index<EARLY_TOOL_LIMIT;index++)notify({type:'function_call',call_id:'filler',name:'exec',arguments:'{}'});
  notify({type:'function_call',call_id:'list',namespace:'other',name:'list',arguments:'{}'});
  observer.confirm('initial');observer.finish();
  assert.equal(evidence.catalog,'notObserved');assert.equal(evidence.read,'notObserved');
  assert.equal(evidence.coverage,'incomplete');assert.equal(evidence.counters.unconfirmedDiscarded,1);
  assert.doesNotMatch(JSON.stringify(evidence),/PRIVATE_PAYLOAD/);
});
