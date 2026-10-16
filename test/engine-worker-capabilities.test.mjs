// @lane merge
// @subject engine/worker-capabilities.mjs
// @subject test/fixtures/capability-source-swap.mjs
// @subject skills/agent-workflow
// @subject skills/workflow-authoring
// @subject skills/workflow-setup
// @subject skills/workflow-mode
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,lstat,realpath,cp,rm,symlink,link} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
const root=fileURLToPath(new URL('../',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
async function resolver(){const module=await import('../engine/worker-capabilities.mjs').catch(()=>null);assert.ok(module?.verifySkillSources,'Source verification must exist');return module;}
async function removeDirectory(path,owner){
  const directory=await realpath(path),base=await realpath(owner),suffix=relative(base,directory);
  assert.ok(suffix&&!suffix.startsWith('..')&&directory===path,'cleanup must stay in the owned fixture');
  assert.equal((await lstat(path)).isSymbolicLink(),false);await rm(path,{recursive:true});
}
async function temporary(t){
  const directory=await mkdtemp(join(tmpdir(),'workflow-capability-'));
  t.after(async()=>{await removeDirectory(directory,tmpdir());await assert.rejects(lstat(directory),{code:'ENOENT'});});
  return directory;
}
async function fixture(t){
  const source=await temporary(t);
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
  const directory=await temporary(t);
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
  await removeDirectory(f.source,f.directory);
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
  await removeDirectory(f.source,f.directory);
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
  const second=await retainedFixture(t),target=join(second.directory,'target');await mkdir(target);
  await symlink(target,join(second.source,'linked'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(captureCapabilitySources({runDir:second.runDir,manifest:second.manifest}),{code:'CAPABILITY_SOURCES'});
});

test('an empty retained capability bundle still rejects a linked package container',async t=>{
  const {captureCapabilitySources,loadCapabilitySources}=await import('../engine/capability-sources.mjs'),f=await retainedFixture(t);
  const descriptor=await captureCapabilitySources({runDir:f.runDir,manifest:{version:1,skills:[],tools:[]}});
  const container=join(f.runDir,'source-packages-v1','packages'),outside=join(f.directory,'empty');await mkdir(outside);await removeDirectory(container,f.directory);
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
test('duplicate IDs names paths and references are rejected',async t=>{
  const {verifySkillSources}=await resolver(),{skill}=await fixture(t);
  for(const skills of [[skill,skill],[skill,{...skill,id:'other'}],[skill,{...skill,id:'other',name:'other'}],[{...skill,references:[skill.references[0],skill.references[0]]}],null]){
    await assert.rejects(verifySkillSources(skills),{code:'SKILL_MANIFEST'});
  }
});

async function declaredFiles(directory){
  const files=[];
  async function walk(path){
    for(const name of (await readdir(path)).sort()){
      const file=join(path,name),info=await lstat(file);
      assert.equal(info.isSymbolicLink(),false);
      if(info.isDirectory())await walk(file);
      else{assert.equal(info.isFile(),true);assert.equal(info.nlink,1);const bytes=await readFile(file);files.push({path:relative(directory,file).replaceAll('\\','/'),bytes:bytes.length,sha256:digest(bytes)});}
    }
  }
  await walk(directory);return files;
}

test('all four repaired production skill trees admit complete copied source identities',async t=>{
  const {verifySkillSources,freezeCapabilities,selectCapabilities,admitWorkerCapabilities,checkCompletionSources}=await resolver(),source=await temporary(t),skills=[];
  let files=0,bytes=0;
  for(const name of ['agent-workflow','workflow-authoring','workflow-setup','workflow-mode']){
    const original=join(root,'skills',name),copied=join(source,'skills',name);
    await cp(original,copied,{recursive:true,errorOnExist:true,force:false});
    const inventory=await declaredFiles(original);assert.deepEqual(await declaredFiles(copied),inventory,'every original file must survive with its exact bytes');
    const main=inventory.find(file=>file.path==='SKILL.md'),manifest=JSON.parse(await readFile(join(copied,'resources','manifest.json'),'utf8'));
    assert.equal(main.sha256,manifest.entry.sha256);assert.equal(main.bytes,manifest.entry.bytes);
    for(const file of manifest.files){const actual=inventory.find(item=>item.path===file.output);assert.ok(actual,file.output);assert.equal(actual.sha256,file.outputSha256);assert.equal(actual.bytes,file.outputBytes);}
    const skill={id:name,name:`agent-workflow:${name}`,root:source,path:join(copied,'SKILL.md'),sha256:main.sha256,references:inventory.filter(file=>file!==main).map(file=>({path:`skills/${name}/${file.path}`,sha256:file.sha256}))};
    skills.push(skill);files+=inventory.length;bytes+=inventory.reduce((sum,file)=>sum+file.bytes,0);
    await t.test(name,async child=>{
      child.diagnostic(JSON.stringify({name,files:inventory.length,references:skill.references.length,manifestSha256:digest(await readFile(join(copied,'resources','manifest.json')))}));
      try{assert.equal((await verifySkillSources([skill])).sourceChecks.files,inventory.length);}
      catch(error){child.diagnostic(`${error.code}: ${error.message}`);throw error;}
    });
  }
  t.diagnostic(JSON.stringify({bundleFiles:files,bundleBytes:bytes}));
  const verified=await verifySkillSources(skills);assert.deepEqual(verified.sourceChecks,{scope:'controller-filesystem',files,bytes});
  const bundle=await freezeCapabilities({version:1,skills,tools:[]});assert.equal(bundle.sources.files,files);
  assert.ok(Buffer.byteLength(JSON.stringify(skills))>30000,'real descriptors exceed argv capacity');
  const selection=selectCapabilities(bundle.manifest,{skills:skills.map(skill=>skill.id)}),seen=[],client=commandClient(seen,process.env);
  assert.equal(selection.fingerprint,digest(canonical({manifest:bundle.manifest,skillIds:skills.map(skill=>skill.id),toolIds:[],directSkills:'features.code_mode.direct_only_tool_namespaces=["skills"]'})),'selection retains its existing canonical identity');
  assert.deepEqual(selection.roots,skills.map(skill=>({id:skill.id,location:{type:'environment',environmentId:'local',path:dirname(skill.path)}})));
  const admitted=await admitWorkerCapabilities(client,{cwd:source,selection});
  assert.equal(admitted.sources.status,'passed');assert.equal(admitted.sources.markerObserved,true);
  assert.equal(admitted.fingerprint,selection.fingerprint);assert.deepEqual(admitted.roots,selection.roots);
  assert.deepEqual(admitted.skills.map(skill=>skill.references),skills.map(skill=>skill.references));
  assert.equal(admitted.native.catalog,'notObserved','source admission is not genuine native activation');
  assert.equal(seen.length,1);assert.ok(client.writes.length>2,'multiple bounded writes reach real child stdin');
  assert.ok(seen[0].command.reduce((size,arg)=>size+2*arg.length+3,0)<=30000);
  assert.ok(seen[0].command.every(arg=>!arg.includes(skills[0].references[0].sha256)));
  t.diagnostic(JSON.stringify({stdinBytes:admitted.sources.transport.bytes,chunks:admitted.sources.transport.chunks,selectionFingerprint:selection.fingerprint}));
  const deadline={remaining:()=>Infinity};
  assert.equal(typeof checkCompletionSources,'function','completion must use the same bounded real-process transport');
  const completion=await checkCompletionSources(client,{cwd:source,selection,deadline,sandboxPolicy:{type:'readOnly',networkAccess:false}});
  assert.equal(completion.status,'passed');assert.equal(completion.exitCode,0);assert.equal(completion.sourceStatus,'verified');
  assert.equal(completion.transport.sha256,admitted.sources.transport.sha256);assert.equal(completion.transport.bytes,admitted.sources.transport.bytes);
  assert.equal(completion.transport.input,'closed');assert.equal(completion.transport.settlement,'observed');
  assert.ok(seen.at(-1).command.reduce((size,arg)=>size+2*arg.length+3,0)<=30000);
  await writeFile(join(source,skills[0].references[0].path),'corrupted source after selection');
  const changed=await checkCompletionSources(client,{cwd:source,selection,deadline,sandboxPolicy:{type:'readOnly',networkAccess:false}});
  assert.equal(changed.status,'failed');assert.equal(changed.exitCode,12);assert.equal(changed.sourceStatus,'changedOrUnavailable');
  const corrupt=[];
  await assert.rejects(admitWorkerCapabilities(commandClient(corrupt,process.env),{cwd:source,selection}),error=>{
    assert.equal(error.noInference,true);assert.equal(error.capabilities.sources.start,'observed');assert.equal(error.capabilities.sources.status,'failed');return true;
  });assert.equal(corrupt.length,1,'corruption refuses without another command');
  const mode=skills.at(-1);assert.deepEqual(selectCapabilities(bundle.manifest,{skills:[mode.id]}).roots,[{id:mode.id,location:{type:'environment',environmentId:'local',path:dirname(mode.path)}}]);
});

async function countedSkill(source,id,references){
  const path=join(source,id,'SKILL.md'),main=`---\nname: ${id}\n---\n`;
  await mkdir(dirname(path),{recursive:true});await writeFile(path,main);
  const skill={id,name:id,root:source,path,sha256:digest(main),references:[]};
  for(let index=0;index<references;index++){
    const file={path:`${id}/resource-${index}.md`,sha256:digest(`${id}:${index}`)};
    await writeFile(join(source,file.path),`${id}:${index}`);skill.references.push(file);
  }
  return skill;
}

test('128 distinct references admit and a 129th distinct reference refuses at the manifest bound',async t=>{
  const {verifySkillSources}=await resolver(),source=await temporary(t),skill=await countedSkill(source,'reference-bound',128);
  assert.equal((await verifySkillSources([skill])).sourceChecks.files,129);
  await writeFile(join(source,'reference-bound','resource-128.md'),'last');
  skill.references.push({path:'reference-bound/resource-128.md',sha256:digest('last')});
  assert.equal(new Set(skill.references.map(file=>file.path)).size,129);
  await assert.rejects(verifySkillSources([skill]),{code:'SKILL_MANIFEST',message:'Skill descriptors require distinct IDs native names and original SKILL.md identities'});
});

test('512 unique skill source files admit and file 513 refuses independently of reference limits',async t=>{
  const {verifySkillSources}=await resolver(),source=await temporary(t),skills=[];
  for(let index=0;index<8;index++)skills.push(await countedSkill(source,`group-${index}`,63));
  assert.equal(new Set(skills.flatMap(skill=>[skill.path,...skill.references.map(file=>join(source,file.path))])).size,512);
  const verified=await verifySkillSources(skills);assert.equal(verified.sourceChecks.files,512);
  const last=skills.at(-1);await writeFile(join(source,'group-7','last.md'),'513');last.references.push({path:'group-7/last.md',sha256:digest('513')});
  await assert.rejects(verifySkillSources(skills),{code:'SKILL_SOURCE',message:'Skill source file count exceeded its limit'});
});

test('32 declared skill limit and complete discovery entry and depth bounds still fail closed',async t=>{
  const {verifySkillSources}=await resolver(),source=await temporary(t),skills=[];
  for(let index=0;index<33;index++)skills.push(await countedSkill(source,`skill-${index}`,0));
  assert.equal((await verifySkillSources(skills.slice(0,32))).skills.length,32);
  await assert.rejects(verifySkillSources(skills),{code:'SKILL_MANIFEST',message:'Provide at most 32 declared skill sources'});
  const skill=skills[0];
  for(let index=0;index<511;index++)await mkdir(join(dirname(skill.path),`empty-${index}`));
  await verifySkillSources([skill]);
  await mkdir(join(dirname(skill.path),'overflow'));
  await assert.rejects(verifySkillSources([skill]),{code:'SKILL_SOURCE',message:'Native skill discovery exceeded its bounded directory scan'});
  const deep=skills[1],suffix='one/two/three/four/five/six/leaf.md',file=join(dirname(deep.path),suffix);
  await mkdir(dirname(file),{recursive:true});await writeFile(file,'deep');deep.references.push({path:`skill-1/${suffix}`,sha256:digest('deep')});
  await verifySkillSources([deep]);
  const deeper=join(dirname(file),'seven','leaf.md');await mkdir(dirname(deeper));await writeFile(deeper,'too deep');deep.references.push({path:'skill-1/one/two/three/four/five/six/seven/leaf.md',sha256:digest('too deep')});
  await assert.rejects(verifySkillSources([deep]),{code:'SKILL_SOURCE',message:'Native skill discovery exceeded its bounded directory scan'});
});

test('skill main reference and aggregate byte ceilings remain bounded after count admission',async t=>{
  const {verifySkillSources}=await resolver(),source=await temporary(t),skill=await countedSkill(source,'byte-bound',0),mib=1024*1024;
  const main=Buffer.alloc(mib,109);await writeFile(skill.path,main);skill.sha256=digest(main);
  const sizes=[16*mib,16*mib,16*mib,15*mib];
  for(const [index,size] of sizes.entries()){
    const bytes=Buffer.alloc(size,index),path=`byte-bound/bytes-${index}`;
    await writeFile(join(source,path),bytes);skill.references.push({path,sha256:digest(bytes)});
  }
  assert.equal((await verifySkillSources([skill])).sourceChecks.bytes,64*mib);
  const last=skill.references.at(-1),overflow=Buffer.alloc(15*mib+1,3);await writeFile(join(source,last.path),overflow);last.sha256=digest(overflow);
  await assert.rejects(verifySkillSources([skill]),{code:'SKILL_SOURCE',message:'Skill source bytes exceeded the bounded limit'});
  const largeMain=Buffer.alloc(mib+1,109);await writeFile(skill.path,largeMain);
  await assert.rejects(verifySkillSources([{...skill,sha256:digest(largeMain)}]),{code:'SKILL_SOURCE',message:'Skill source bytes exceeded the bounded limit'});
  await writeFile(skill.path,main);
  const reference=skill.references[0],largeReference=Buffer.alloc(16*mib+1,0);await writeFile(join(source,reference.path),largeReference);
  reference.sha256=digest(largeReference);
  await assert.rejects(verifySkillSources([skill]),{code:'SKILL_SOURCE',message:'Skill source bytes exceeded the bounded limit'});
});

test('missing files hardlinks and path aliases cannot evade declared skill identities',async t=>{
  const {verifySkillSources}=await resolver();
  for(const kind of ['missing-main','missing-reference','hardlink-main','hardlink-reference','case-alias'])await t.test(kind,async child=>{
    const {skill,path,reference,source}=await fixture(child);
    if(kind==='missing-main')await rm(path);
    if(kind==='missing-reference')await rm(reference);
    if(kind==='hardlink-main')await link(path,join(source,'main-alias'));
    if(kind==='hardlink-reference')await link(reference,join(source,'reference-alias'));
    if(kind==='case-alias'){
      skill.references.push({...skill.references[0],path:'scripts/USAGE.md'});
      if(process.platform!=='win32'){await writeFile(join(source,'scripts','USAGE.md'),'distinct');skill.references.at(-1).sha256=digest('distinct');await verifySkillSources([skill]);return;}
      await assert.rejects(verifySkillSources([skill]),{code:'SKILL_MANIFEST',message:'Duplicate or escaping skill reference'});return;
    }
    await assert.rejects(verifySkillSources([skill]),{code:'SKILL_SOURCE'});
  });
});

test('native discovery refuses broader plugin manifests and undeclared nested skills',async t=>{
  const {verifySkillSources}=await resolver();
  for(const name of ['plugin.json','.codex-plugin/plugin.json','.claude-plugin/plugin.json','.cursor-plugin/plugin.json','nested/.cursor-plugin/plugin.json','nested/SKILL.md']){
    await t.test(name,async child=>{
      const {skill,path}=await fixture(child),extra=join(dirname(path),name);
      await mkdir(dirname(extra),{recursive:true});await writeFile(extra,'{}');
      skill.references.push({path:relative(skill.root,extra).replaceAll('\\','/'),sha256:digest('{}')});
      await assert.rejects(verifySkillSources([skill]),{code:'SKILL_SOURCE',message:'Native discovery would expose an undeclared skill or plugin bundle'});
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

test('huge readiness argv is rejected before process dispatch while bulk descriptors use stdin',async t=>{
  const {selectCapabilities}=await resolver(),{skill,tool}=await toolFixture(t);
  tool.guidance='g'.repeat(4000);
  const first=tool.runtime.files[0];
  tool.runtime.files=Array.from({length:64},(_,index)=>({path:`${'a'.repeat(180)}${index}/file`,sha256:first.sha256}));
  const {validateCapabilities}=await resolver();
  const manifest=validateCapabilities({version:1,skills:[skill],tools:[tool]});
  assert.ok(Buffer.byteLength(JSON.stringify(manifest))<256*1024);
  assert.ok(selectCapabilities(manifest,{skills:['compose'],requireTools:['compose-tool']}));
  tool.readiness[0].args=Array.from({length:8},()=> 'a'.repeat(2048));
  const oversized=validateCapabilities({version:1,skills:[skill],tools:[tool]});
  assert.throws(()=>selectCapabilities(oversized,{skills:['compose'],requireTools:['compose-tool']}),{code:'CAPABILITY_SELECTION'});
});

async function toolFixture(t){
  const f=await fixture(t),launcher=join(f.source,'scripts','run-managed.mjs');
  await writeFile(launcher,'const mode=process.argv[2];process.stdout.write(mode==="emit"?Buffer.from(process.argv[3],"base64").toString("utf8"):mode==="capped-json"?JSON.stringify({ready:true,padding:"x".repeat(8165)}):mode==="fail"?"PRIVATE_DIAGNOSTIC":"READY\\n");process.exitCode=mode==="emit"?Number(process.argv[4]??0):mode==="fail"?7:0;');
  await writeFile(join(f.source,'receipt.json'),'{}');
  const receipt={path:'receipt.json',sha256:digest(await readFile(join(f.source,'receipt.json')))};
  const tool={id:'compose-tool',skills:['compose'],node:{path:process.execPath,version:process.version,sha256:digest(await readFile(process.execPath))},launcher:{root:f.source,path:launcher,sha256:digest(await readFile(launcher))},runtime:{root:f.source,files:[{path:'scripts/run-managed.mjs',sha256:digest(await readFile(launcher))}],receipt},dependencies:{root:f.source,files:[receipt],receipt},environment:{AGENT_BEEPS_HOME:f.source},readiness:[{id:'capabilities',args:['ready'],marker:'READY',timeoutMs:1000}],guidance:'Use the managed tool from the native skill instructions.'};
  return {...f,tool};
}

test('tool source verification retains its own 128 file and 64 per-tree limits',async t=>{
  const {verifyToolSources,validateCapabilities}=await resolver(),{source,skill,tool}=await toolFixture(t);
  // A small ordinary executable identity fixture tests source budgets only;
  // existing readiness tests below execute the real admitted Node binary.
  const node=join(source,'node-identity');await writeFile(node,'node identity');tool.node={...tool.node,path:node,sha256:digest('node identity')};
  for(const name of ['runtime','dependencies']){
    const directory=join(source,name);await mkdir(directory);const files=[];
    for(let index=0;index<63;index++){const path=`file-${index}`,bytes=`${name}:${index}`;await writeFile(join(directory,path),bytes);files.push({path,sha256:digest(bytes)});}
    tool[name]={root:directory,files,receipt:files[0]};
  }
  validateCapabilities({version:1,skills:[skill],tools:[tool]});
  assert.equal((await verifyToolSources(tool)).files,128);
  const path='file-63',bytes='runtime:63';await writeFile(join(tool.runtime.root,path),bytes);tool.runtime.files.push({path,sha256:digest(bytes)});
  validateCapabilities({version:1,skills:[skill],tools:[tool]});
  await assert.rejects(verifyToolSources(tool),{code:'CAPABILITY_SOURCE',message:'Declared tool files are unsafe unavailable or changed'});
  tool.runtime.files.push({path:'file-64',sha256:digest('runtime:64')});
  assert.throws(()=>validateCapabilities({version:1,skills:[skill],tools:[tool]}),{code:'CAPABILITY_MANIFEST'});
});

function commandClient(seen,env,expectedPolicy={type:'readOnly',networkAccess:false}){
  const listeners=new Set(),children=new Map(),writes=[];
  return{writes,onNotification(listener){listeners.add(listener);return()=>listeners.delete(listener);},async request(method,params){
    if(method==='command/exec/write'){
      writes.push(params);const child=children.get(params.processId);assert.ok(child,'write must follow registered readiness');
      assert.ok(Buffer.byteLength(JSON.stringify(params))<20000,'bounded native write request');
      if(params.deltaBase64)await new Promise((resolve,reject)=>child.stdin.write(Buffer.from(params.deltaBase64,'base64'),error=>error?reject(error):resolve()));
      if(params.closeStdin)await new Promise((resolve,reject)=>{child.stdin.once('error',reject);child.stdin.end(resolve);});
      return{};
    }
    if(method==='command/exec/terminate'){
      const child=children.get(params.processId);
      if(child)await new Promise(resolve=>{child.once('close',resolve);child.kill();});
      return{};
    }
    assert.equal(method,'command/exec');seen.push(params);
    assert.deepEqual(params.sandboxPolicy,expectedPolicy);
    if(params.streamStdin){
      assert.equal(params.streamStdoutStderr,true);assert.equal(Object.hasOwn(params,'stdin'),false);
      const child=spawn(params.command[0],params.command.slice(1),{cwd:params.cwd,env,timeout:params.timeoutMs,windowsHide:true,stdio:['pipe','pipe','pipe']});
      children.set(params.processId,child);child.stdin.on('error',()=>{});
      const totals={stdout:0,stderr:0};
      for(const stream of ['stdout','stderr'])child[stream].on('data',bytes=>{
        const available=Math.max(0,params.outputBytesCap-totals[stream]);totals[stream]+=bytes.length;
        const message={method:'command/exec/outputDelta',params:{processId:params.processId,stream,deltaBase64:bytes.subarray(0,available).toString('base64'),capReached:totals[stream]>=params.outputBytesCap}};
        for(const listener of listeners)listener(message);
      });
      return await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>{children.delete(params.processId);resolve({exitCode:code??1,stdout:'',stderr:''});});});
    }
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

test('source stdin rejects missing and corrupt bindings, invalid UTF8/JSON, overflow and premature EOF',async t=>{
  const {selectCapabilities,admitWorkerCapabilities}=await resolver(),{skill,source}=await fixture(t),selection=selectCapabilities({version:1,skills:[skill],tools:[]},{skills:['compose']});
  for(const mode of ['missing-binding','wrong-length','wrong-hash','oversized-binding','invalid-utf8','invalid-json','overflow','premature-eof'])await t.test(mode,async()=>{
    const seen=[],client=commandClient(seen,process.env),request=client.request.bind(client);
    let bytes=Buffer.from(JSON.stringify(selection.skills));
    if(mode==='invalid-utf8'){bytes=Buffer.from(bytes);bytes[bytes.length-1]=255;}
    if(mode==='invalid-json'){bytes=Buffer.from(bytes);bytes[bytes.length-1]=123;}
    client.request=async(method,params,options)=>{
      if(method==='command/exec'){
        const command=[...params.command];
        if(mode==='missing-binding')command.pop();
        if(mode==='wrong-length')command[command.length-2]=String(bytes.length+1);
        if(mode==='oversized-binding')command[command.length-2]=String(256*1024+1);
        if(mode==='wrong-hash')command[command.length-1]='0'.repeat(64);
        if(mode.startsWith('invalid-'))command[command.length-1]=digest(bytes);
        return request(method,{...params,command},options);
      }
      if(method==='command/exec/write'&&params.deltaBase64){
        let chunk=bytes;
        if(mode==='overflow')chunk=Buffer.concat([chunk,Buffer.from('x')]);
        if(mode==='premature-eof')chunk=chunk.subarray(0,chunk.length-1);
        return request(method,{...params,deltaBase64:chunk.toString('base64')},options);
      }
      return request(method,params,options);
    };
    await assert.rejects(admitWorkerCapabilities(client,{cwd:source,selection}),error=>{
      assert.equal(error.noInference,true);assert.equal(error.capabilities.sources.status,'failed');assert.equal(error.capabilities.sources.start,'observed');return true;
    });assert.equal(seen.length,1,'no fallback or repeated dispatch');
  });
});

test('large required tool descriptors cross stdin while every real tool file and readiness still checks',async t=>{
  const {freezeCapabilities,selectCapabilities,admitWorkerCapabilities}=await resolver(),{skill,tool,source}=await toolFixture(t);
  for(const [tree,count] of [['runtime',62],['dependencies',61]]){
    for(let i=0;i<count;i++){
      const path=`${tree}-${i}-${'x'.repeat(35)}`,bytes=`${tree}:${i}`;await writeFile(join(source,path),bytes);
      tool[tree].files.push({path,sha256:digest(bytes)});
    }
  }
  tool.runtime.files.push(tool.runtime.receipt);
  assert.ok(JSON.stringify(tool).length*2>30000,'tool descriptor exceeds old argv ceiling');
  const bundle=await freezeCapabilities({version:1,skills:[skill],tools:[tool]}),selection=selectCapabilities(bundle.manifest,{skills:['compose'],requireTools:['compose-tool']}),seen=[],client=commandClient(seen,{...process.env,...tool.environment});
  const evidence=await admitWorkerCapabilities(client,{cwd:source,selection});
  assert.equal(evidence.tools[0].status,'passed');assert.equal(evidence.tools[0].stages[0].markerObserved,true);
  assert.ok(evidence.tools[0].stages[0].transport.chunks>1);assert.equal(seen.length,3);
  for(const request of seen)assert.ok(request.command.reduce((size,arg)=>size+2*arg.length+3,0)<=30000);
});

test('stdin receiver accepts the exact 256KiB JSON byte boundary and rejects one byte over',async()=>{
  const moduleUrl=new URL('../engine/worker-capabilities.mjs',import.meta.url).href;
  const script=`const m=await import(${JSON.stringify(moduleUrl)});await m.verifyCapabilityStdin(...process.argv.slice(1));`;
  const bytes=Buffer.from('[]'+' '.repeat(256*1024-2));
  const pending=promisify(execFile)(process.execPath,['--input-type=module','-e',script,'skills',String(bytes.length),digest(bytes)],{env:process.env,windowsHide:true,maxBuffer:8192,timeout:3000});
  pending.child.stdin.on('error',()=>{});pending.child.stdin.end(bytes);
  const result=await pending;assert.equal(result.stdout,'WORKER_CAPABILITY_INPUT_READY\nWORKER_SKILL_SOURCE_OK\n');assert.equal(result.stderr,'');
  const over=promisify(execFile)(process.execPath,['--input-type=module','-e',script,'skills',String(bytes.length+1),digest(bytes)],{env:process.env,windowsHide:true,maxBuffer:8192,timeout:3000});
  over.child.stdin.end();
  await assert.rejects(over,error=>{assert.equal(error.code,1);assert.equal(error.stdout,'','over-bound binding refuses before readiness');return true;});
});

test('stdin protocol failure, cancellation and deadline stop the owned process without repeat',async t=>{
  const {selectCapabilities,admitWorkerCapabilities}=await resolver(),{skill,source}=await fixture(t),selection=selectCapabilities({version:1,skills:[skill],tools:[]},{skills:['compose']});
  for(const mode of ['bad-base64','truncated-output','huge-output','wrong-stream','invalid-output-utf8','invalid-final-utf8','notification-flood','missing-ready','cancel-ready','cancel-write','lost-write','null-write-rejection','bad-write-response','bad-close-response','bad-final-response','missing-eof','execution-rejection','execution-rejection-write'])await t.test(mode,async()=>{
    const seen=[],client=commandClient(seen,process.env),request=client.request.bind(client),subscribe=client.onNotification.bind(client),abort=new AbortController();
    let terminations=0,writes=0,stdoutMessages=0,rejectExecution;
    const executionFailure=new Promise((resolve,reject)=>{rejectExecution=()=>reject(Error('PRIVATE lost execution response during stdin write'));});
    client.onNotification=listener=>subscribe(message=>{
      if(message.params.stream==='stdout'){
        stdoutMessages++;
        if(mode==='missing-ready')return;
        if(mode==='notification-flood'){for(let i=0;i<257;i++)listener({...message,params:{...message.params,deltaBase64:''}});return;}
        if(mode==='bad-base64')message={...message,params:{...message.params,deltaBase64:'YQ'}};
        if(mode==='truncated-output')message={...message,params:{...message.params,capReached:true}};
        if(mode==='huge-output')message={...message,params:{...message.params,deltaBase64:Buffer.alloc(8193).toString('base64')}};
        if(mode==='wrong-stream')message={...message,params:{...message.params,stream:'other'}};
        if(mode==='invalid-output-utf8')message={...message,params:{...message.params,deltaBase64:Buffer.from([255]).toString('base64')}};
        if(mode==='invalid-final-utf8'&&stdoutMessages>1)message={...message,params:{...message.params,deltaBase64:Buffer.from([255]).toString('base64')}};
        if(mode==='cancel-ready')abort.abort();
      }
      listener(message);
    });
    client.request=async(method,params,options)=>{
      if(method==='command/exec/terminate')terminations++;
      if(mode==='execution-rejection'&&method==='command/exec'){seen.push(params);throw Error('PRIVATE transport rejection');}
      if(mode==='execution-rejection-write'&&method==='command/exec')return Promise.race([request(method,params,options),executionFailure]);
      if(method==='command/exec/write'){
        writes++;
        if(mode==='missing-eof'&&params.closeStdin)return{};
        const result=await request(method,params,options);
        if(mode==='execution-rejection-write')rejectExecution();
        if(mode==='cancel-write')abort.abort();
        if(mode==='lost-write')throw Error('PRIVATE lost acknowledgment after actual write');
        if(mode==='null-write-rejection')throw null;
        if(mode==='bad-write-response'&&!params.closeStdin)return{unexpected:true};
        if(mode==='bad-close-response'&&params.closeStdin)return{unexpected:true};
        return result;
      }
      const result=await request(method,params,options);
      return mode==='bad-final-response'&&method==='command/exec'?{...result,stdout:'unexpected buffered result'}:result;
    };
    await assert.rejects(admitWorkerCapabilities(client,{cwd:source,selection,signal:abort.signal,deadline:performance.now()+700}),error=>{
      assert.equal(error.noInference,true);assert.equal(error.capabilities.sources.status,'failed');
      assert.equal(error.capabilities.sources.transport.settlement,mode.startsWith('execution-rejection')?'unknown':'observed');
      if(['lost-write','null-write-rejection','cancel-write','bad-write-response','bad-close-response'].includes(mode))assert.equal(error.executionUnknown,true,'unknown writes remain diagnostic uncertainty');
      assert.doesNotMatch(JSON.stringify(error.capabilities),/PRIVATE/);return true;
    });
    assert.equal(seen.length,1);assert.ok(terminations<=1,'at most one supported termination');
    if(mode==='lost-write'||mode==='cancel-write')assert.equal(writes,1,'no write repeated after uncertainty or cancellation');
    if(mode==='execution-rejection')assert.equal(writes,0,'execution rejection is handled during readiness wait');
    if(mode==='execution-rejection-write')assert.equal(writes,1,'execution rejection is handled during the write without repeat');
  });
  const seen=[],abort=new AbortController();abort.abort();
  await assert.rejects(admitWorkerCapabilities(commandClient(seen,process.env),{cwd:source,selection,signal:abort.signal}),error=>{
    assert.equal(error.noInference,true);assert.equal(error.capabilities.sources.start,'notStarted');return true;
  });assert.equal(seen.length,0);
  const huge={...skill,references:Array.from({length:128},(_,i)=>({path:`${'x'.repeat(2040)}/${i}`,sha256:skill.sha256}))};
  assert.throws(()=>selectCapabilities({version:1,skills:[huge],tools:[]},{skills:['compose']}),{code:'CAPABILITY_SELECTION'},'descriptor input is bounded independently of argv');
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
  let calls=0;const unknown=commandClient([],process.env);
  unknown.request=async method=>{if(method==='command/exec')calls++;throw Error('PRIVATE_DIAGNOSTIC');};
  await assert.rejects(admitWorkerCapabilities(unknown,{cwd:source,selection}),error=>{
    assert.equal(error.capabilities.sources.start,'unknown');assert.notEqual(error.noProcessStarted,true);assert.equal(error.executionUnknown,true);return true;
  });assert.equal(calls,1);
});

test('readiness shares a bounded deadline and dispatches nothing after it expires',async t=>{
  const {freezeCapabilities,selectCapabilities,admitWorkerCapabilities}=await resolver(),{skill,tool,source}=await toolFixture(t);
  const bundle=await freezeCapabilities({version:1,skills:[skill],tools:[tool]}),selection=selectCapabilities(bundle.manifest,{skills:['compose'],requireTools:['compose-tool']});
  const seen=[],calls=[],client=commandClient(seen,{...process.env,...tool.environment}),request=client.request.bind(client),deadline=performance.now()+700;
  client.request=async(method,params,options)=>{
    calls.push({method,params,options});const result=await request(method,params,options);
    if(method==='command/exec')await new Promise(resolve=>setTimeout(resolve,800));
    return result;
  };
  await assert.rejects(admitWorkerCapabilities(client,{cwd:source,selection,deadline}),error=>{
    assert.equal(error.code,'CAPABILITY_READINESS');assert.equal(error.noInference,true);
    assert.equal(error.capabilities.sources.start,'observed');assert.equal(error.capabilities.sources.exitCode,0);assert.notEqual(error.executionUnknown,true);return true;
  });
  assert.equal(seen.length,1);assert.ok(calls[0].params.timeoutMs<=700);assert.ok(calls[0].options.timeoutMs<=700);
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
