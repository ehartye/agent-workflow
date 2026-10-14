// @lane merge
// @subject engine/parent-capabilities.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,relative} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import {discoverParentCapabilities} from '../engine/parent-capabilities.mjs';

async function fixture(t){
  const home=await mkdtemp(join(tmpdir(),'workflow-parent-catalog-'));
  t.after(()=>rm(home,{recursive:true,force:true}));
  const plugins=[],skills=[];
  const replies={'plugin/installed':{marketplaces:[{name:'owned',path:null,plugins}],marketplaceLoadErrors:[]},'skills/list':{data:[{cwd:home,skills,errors:[]}]}};
  const client={async request(method){assert.ok(Object.hasOwn(replies,method));return structuredClone(replies[method]);}};
  async function plugin(name,versions,extra={}){
    const entry={id:`${name}@owned`,name,installed:true,enabled:true,availability:'AVAILABLE',disabledReason:null,localVersion:'99.99.99',...extra};plugins.push(entry);
    for(const version of versions){const root=join(home,'plugins/cache/owned',name,version);await mkdir(join(root,'.codex-plugin'),{recursive:true});await writeFile(join(root,'.codex-plugin/plugin.json'),JSON.stringify({name,version:'99.99.99'}));}
    return entry;
  }
  async function skill(name,path=join(home,'skills',name.replaceAll(':','-'),'SKILL.md'),extra={}){
    await mkdir(dirname(path),{recursive:true});await writeFile(path,'private skill body never retained');
    const entry={name,path,scope:'user',enabled:true,pluginId:null,...extra};skills.push(entry);return entry;
  }
  return {home,plugins,skills,replies,client,plugin,skill,run:()=>discoverParentCapabilities(client,{cwd:home,codexHome:home})};
}

test('parent catalog binds original active plugin roots and standalone skills through real RPC transport',async t=>{
  const f=await fixture(t);
  await f.plugin('versions',['1.9.0','1.10.0','1.11.0-beta.2','1.11.0-beta.10']);
  await f.plugin('local',['9.0.0','local']);
  await f.plugin('tool-only',['2.0.0']);
  await f.plugin('disabled',['1.0.0'],{enabled:false});
  await f.plugin('suggestion',[],{installed:false});
  await f.skill('standalone');
  await f.skill('versions:guide',join(f.home,'plugins/cache/owned/versions/1.11.0-beta.10/skills/guide/SKILL.md'),{pluginId:'versions@owned'});
  const script="const r=require('node:readline').createInterface({input:process.stdin});const data=JSON.parse(process.argv[1]);r.on('line',l=>{const q=JSON.parse(l);process.stdout.write(JSON.stringify({id:q.id,result:data[q.method],method:q.method})+'\\n')});";
  const child=spawn(process.execPath,['-e',script,JSON.stringify(f.replies)],{stdio:['pipe','pipe','pipe']});
  const pending=new Map();let id=0;
  const lines=createInterface({input:child.stdout});lines.on('line',line=>{const value=JSON.parse(line);pending.get(value.id)(value.result);pending.delete(value.id);});
  t.after(()=>{lines.close();child.kill();});
  const client={request(method,params){assert.deepEqual(params.cwds,[f.home]);return new Promise(resolve=>{pending.set(++id,resolve);child.stdin.write(JSON.stringify({id,method})+'\n');});}};
  const result=await discoverParentCapabilities(client,{cwd:f.home,codexHome:f.home});
  assert.equal(result.coverage.complete,true);assert.equal(result.roots.length,4);
  const paths=result.roots.map(root=>root.location.path);
  assert.ok(paths.includes(join(f.home,'plugins/cache/owned/versions/1.11.0-beta.10')));
  assert.ok(paths.includes(join(f.home,'plugins/cache/owned/local/local')));
  assert.ok(paths.includes(join(f.home,'plugins/cache/owned/tool-only/2.0.0')));
  assert.ok(paths.includes(join(f.home,'skills/standalone')));
  assert.equal(result.inventory.plugins.find(p=>p.id==='disabled@owned').rootId,null);
  assert.equal(result.inventory.plugins.find(p=>p.id==='suggestion@owned').installed,false);
  assert.equal(result.fingerprint,(await f.run()).fingerprint);
  assert.ok(!JSON.stringify(result).includes('private skill body'));
});

test('Windows original catalog roots accept real short-name aliases without admitting junctions',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t);await f.plugin('short-path',['1.0.0']);await f.skill('standalone');
  const longHome=await realpath(f.home);
  const {stdout}=await promisify(execFile)(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile','-NonInteractive','-Command',"$f=New-Object -ComObject Scripting.FileSystemObject; $f.GetFolder($env:WORKFLOW_OWNED_SHORT_PATH).ShortPath"],
    {env:{...process.env,WORKFLOW_OWNED_SHORT_PATH:longHome},windowsHide:true,timeout:10000,maxBuffer:8192});
  const shortHome=stdout.trim();assert.equal((await realpath(shortHome)).toLowerCase(),longHome.toLowerCase());
  if(shortHome.toLowerCase()===longHome.toLowerCase()){t.skip('Owned fixture volume does not expose an 8.3 alias');return;}
  const replies=structuredClone(f.replies);replies['skills/list'].data[0].cwd=shortHome;
  for(const skill of replies['skills/list'].data[0].skills)skill.path=join(shortHome,relative(f.home,skill.path));
  const client={async request(method,params){assert.deepEqual(params.cwds,[shortHome]);return structuredClone(replies[method]);}};
  const inspect=()=>discoverParentCapabilities(client,{cwd:shortHome,codexHome:shortHome});
  const result=await inspect();
  assert.equal(result.coverage.complete,true,JSON.stringify(result.inventory.missing));assert.equal(result.roots.length,2);
  assert.ok(result.roots.some(root=>root.location.path===join(shortHome,'plugins/cache/owned/short-path/1.0.0')));
  assert.ok(result.roots.some(root=>root.location.path===join(shortHome,'skills/standalone')));
  const link=join(f.home,'redirected');await symlink(join(f.home,'skills/standalone'),link,'junction');
  replies['skills/list'].data[0].skills.push({name:'redirected',path:join(shortHome,'redirected/SKILL.md'),scope:'user',enabled:true,pluginId:null});
  const refused=await inspect();assert.equal(refused.coverage.complete,false);assert.equal(refused.roots.length,2);
  assert.ok(refused.inventory.missing.some(item=>item.id==='redirected'&&item.code==='SOURCE_UNAVAILABLE'));
});

test('missing, duplicate, mismatched and partial catalog entries remain explicit without granting roots',async t=>{
  const f=await fixture(t);await f.plugin('missing',[]);await f.plugin('bad',['1.0.0']);
  await writeFile(join(f.home,'plugins/cache/owned/bad/1.0.0/.codex-plugin/plugin.json'),JSON.stringify({name:'different'}));
  const standalone=await f.skill('duplicate');f.skills.push({...standalone});
  await f.skill('disabled',undefined,{enabled:false});
  f.replies['plugin/installed'].marketplaceLoadErrors.push({message:'SECRET raw diagnostic'});
  f.replies['skills/list'].data[0].errors.push({message:'SECRET raw skill diagnostic'});
  const result=await f.run();
  assert.equal(result.coverage.complete,false);assert.ok(result.inventory.missing.length>=4);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
  assert.equal(result.roots.length,1);assert.equal(result.inventory.skills.filter(s=>s.rootId).length,1);
});

test('native metadata and original paths fail closed on malformed entries, root overflow and links',async t=>{
  const f=await fixture(t);
  f.replies['plugin/installed'].marketplaces[0].plugins.push({id:'../escape@owned',name:'escape',enabled:true,installed:true});
  await assert.rejects(f.run(),{code:'PARENT_CAPABILITIES'});
  f.plugins.length=0;
  for(let i=0;i<129;i++)await f.skill(`skill-${i}`);
  await assert.rejects(f.run(),{code:'PARENT_CAPABILITIES'});
  f.skills.length=0;
  const real=join(f.home,'real');await mkdir(real);await writeFile(join(real,'SKILL.md'),'secret');
  const link=join(f.home,'linked');await symlink(real,link,process.platform==='win32'?'junction':'dir');
  f.skills.push({name:'linked',path:join(link,'SKILL.md'),scope:'user',enabled:true,pluginId:null});
  const result=await f.run();assert.equal(result.coverage.complete,false);assert.equal(result.roots.length,0);
});

test('disabled skills, plugin ownership and RPC failures cannot masquerade as complete parent coverage',async t=>{
  const f=await fixture(t);await f.plugin('disabled',['1.0.0'],{enabled:false});
  await f.skill('disabled:guide',undefined,{pluginId:'disabled@owned'});
  await f.skill('orphan:guide',undefined,{pluginId:'orphan@owned'});
  const result=await f.run();assert.equal(result.roots.length,0);assert.equal(result.coverage.complete,false);
  const failed=await discoverParentCapabilities({async request(){throw new Error('SECRET credential');}},{cwd:f.home,codexHome:f.home});
  assert.equal(failed.coverage.complete,false);assert.equal(failed.roots.length,0);assert.ok(!JSON.stringify(failed).includes('SECRET'));
  f.replies['skills/list'].data[0].skills=[{name:'invalid',path:join(f.home,'absent'),scope:'user',enabled:'yes',pluginId:null}];
  await assert.rejects(f.run(),{code:'PARENT_CAPABILITIES'});
});

test('whole plugin roots preserve disabled-skill gaps and retain duplicate names as warnings',async t=>{
  const f=await fixture(t);await f.plugin('mixed',['1.0.0']);
  await f.skill('mixed:disabled',join(f.home,'plugins/cache/owned/mixed/1.0.0/skills/disabled/SKILL.md'),{pluginId:'mixed@owned',enabled:false});
  await f.skill('duplicate-name');await f.skill('duplicate-name',join(f.home,'other/SKILL.md'));
  const result=await f.run();assert.equal(result.coverage.complete,false);
  assert.ok(result.inventory.missing.some(item=>item.code==='DISABLED_SKILL_IN_SELECTED_ROOT'));
  assert.ok(result.inventory.warnings.some(item=>item.code==='DUPLICATE_NAME'));
});

test('native unavailable plugins remain inventoried without executor-root activation',async t=>{
  const f=await fixture(t);await f.plugin('admin',['1.0.0'],{availability:'DISABLED_BY_ADMIN',disabledReason:'disabled_by_admin'});
  await f.plugin('plan',['1.0.0'],{disabledReason:'plan_not_eligible'});
  const result=await f.run();assert.equal(result.roots.length,0);assert.equal(result.coverage.complete,true);
  assert.equal(result.inventory.plugins[0].availability,'DISABLED_BY_ADMIN');
  assert.equal(result.inventory.plugins[1].disabledReason,'plan_not_eligible');
});

test('active root selection matches native build metadata total ordering and lexical fallback',async t=>{
  const f=await fixture(t);await f.plugin('build',['1.0.0+10','1.0.0+2','1.0.0+02']);
  await f.plugin('lexical',['alpha','zeta']);
  const result=await f.run();assert.equal(result.coverage.complete,true);
  assert.ok(result.roots.some(root=>root.location.path===join(f.home,'plugins/cache/owned/build/1.0.0+10')));
  assert.ok(result.roots.some(root=>root.location.path===join(f.home,'plugins/cache/owned/lexical/zeta')));
});

test('native skill-owned installed plugins absent from installed UI inventory retain both same-name packages',async t=>{
  const f=await fixture(t);await f.plugin('paired',['1.0.0']);
  const dev=join(f.home,'plugins/cache/dev/paired/2.0.0');
  await mkdir(join(dev,'.claude-plugin'),{recursive:true});await writeFile(join(dev,'.claude-plugin/plugin.json'),JSON.stringify({name:'paired',version:'2.0.0'}));
  await f.skill('paired:guide',join(f.home,'plugins/cache/owned/paired/1.0.0/skills/guide/SKILL.md'),{pluginId:'paired@owned'});
  await f.skill('paired:guide',join(dev,'skills/guide/SKILL.md'),{pluginId:'paired@dev'});
  const result=await f.run();assert.equal(result.coverage.complete,true);assert.equal(result.roots.length,2);
  assert.equal(new Set(result.inventory.skills.map(skill=>skill.rootId)).size,2);
  assert.ok(result.inventory.warnings.some(item=>item.code==='DUPLICATE_NAME'));
  const inferred=result.inventory.plugins.find(plugin=>plugin.id==='paired@dev');assert.equal(inferred.origin,'skills/list');assert.equal(inferred.installed,null);assert.equal(inferred.enabled,null);
});

test('ordinary nested plugin resources beyond native discovery depth remain original readable roots',async t=>{
  const f=await fixture(t);await f.plugin('resources',['1.0.0']);
  const root=join(f.home,'plugins/cache/owned/resources/1.0.0');
  await f.skill('resources:main',join(root,'skills/main/SKILL.md'),{pluginId:'resources@owned'});
  const resource=join(root,'skills/main/templates/starter/examples/example/app/api/notes/file.txt');
  await mkdir(dirname(resource),{recursive:true});await writeFile(resource,'native resource body');
  const result=await f.run();assert.equal(result.coverage.complete,true);assert.equal(result.roots.length,1);
  assert.ok(result.inventory.warnings.some(item=>item.code==='NATIVE_DISCOVERY_DEPTH'));
  assert.ok(!JSON.stringify(result).includes('native resource body'));
});
