/** @lane merge
 * @subject scripts/release-protection.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, readdir, mkdir, link, symlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const script=join(root,'scripts/release-protection.mjs');
const repository='example/workflow',branch='release/next';
const endpoint='/repos/example/workflow/branches/release%2Fnext/protection';
const digest=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const flag=enabled=>({enabled});
function settings(){return {
  url:'https://api.github.com'+endpoint,
  required_status_checks:{strict:true,contexts:['verify'],checks:[{context:'verify',app_id:15368}]},
  enforce_admins:flag(true),
  required_pull_request_reviews:{dismiss_stale_reviews:true,require_code_owner_reviews:true,
    required_approving_review_count:2,require_last_push_approval:true,
    dismissal_restrictions:{users:[{login:'maintainer'}],teams:[{slug:'release'}],apps:[]},
    bypass_pull_request_allowances:{users:[],teams:[],apps:[{slug:'release-bot'}]}},
  restrictions:{users:[{login:'maintainer'}],teams:[{slug:'release'}],apps:[]},
  required_linear_history:flag(true),allow_force_pushes:flag(false),allow_deletions:flag(false),
  block_creations:flag(true),required_conversation_resolution:flag(true),lock_branch:flag(false),
  allow_fork_syncing:flag(true)
};}
function evidence(protection=settings(),overrides={}){return {
  schemaVersion:1,repository,branch,apiVersion:'2022-11-28',capturedAt:'2026-10-15T10:00:00.000Z',
  provenance:{kind:'fixture',source:'owned offline GET fixture',observationId:'before'},
  state:'protected',protection,...overrides
};}
function cli(argv){return spawnSync(process.execPath,[script,...argv],{cwd:root,encoding:'utf8',windowsHide:true});}
async function fixture(t){
  const dir=await mkdtemp(join(root,'.release-protection-test-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const input=join(dir,'input.json'),snapshot=join(dir,'snapshot.json');
  await writeFile(input,JSON.stringify(evidence()));
  return {dir,input,snapshot};
}
async function snapshotFixture(t,raw=evidence()){
  const f=await fixture(t);await writeFile(f.input,JSON.stringify(raw));
  const r=cli(['snapshot','--input',f.input,'--output',f.snapshot]);
  assert.equal(r.status,0,r.stderr);
  return {...f,value:JSON.parse(await readFile(f.snapshot,'utf8'))};
}

test('offline CLI snapshots evidence and plans a full PUT with checks only',async t=>{
  const f=await snapshotFixture(t),output=join(f.dir,'plan.json');
  const r=cli(['preflight','--snapshot',f.snapshot,'--repository',repository,'--branch',branch,'--output',output]);
  assert.equal(r.status,0,r.stderr);
  const plan=JSON.parse(await readFile(output,'utf8'));
  assert.equal(plan.dryRun,true);assert.equal(plan.complete,true);
  assert.equal(plan.restoration.method,'PUT');assert.equal(plan.restoration.path,endpoint);
  assert.deepEqual(plan.restoration.body.required_status_checks,{strict:true,checks:[{context:'verify',app_id:15368}]});
  assert.equal(plan.restoration.body.enforce_admins,true);
  assert.deepEqual(plan.restoration.body.required_pull_request_reviews,{
    dismiss_stale_reviews:true,require_code_owner_reviews:true,required_approving_review_count:2,
    require_last_push_approval:true,dismissal_restrictions:{users:['maintainer'],teams:['release'],apps:[]},
    bypass_pull_request_allowances:{users:[],teams:[],apps:['release-bot']}
  });
  assert.deepEqual(plan.restoration.body.restrictions,{users:['maintainer'],teams:['release'],apps:[]});
  assert.equal(plan.restoration.body.required_linear_history,true);
  assert.equal(plan.restoration.body.allow_force_pushes,false);
  assert.equal(plan.restoration.body.allow_deletions,false);
  assert.equal(plan.restoration.body.block_creations,true);
  assert.equal(plan.restoration.body.required_conversation_resolution,true);
  assert.equal(plan.restoration.body.lock_branch,false);
  assert.equal(plan.restoration.body.allow_fork_syncing,true);
  assert.equal(f.value.evidenceSha256,digest(await readFile(f.input)));
  assert.equal(f.value.settingsSha256,digest(canonical(settings())));
  assert.deepEqual((await readdir(f.dir)).sort(),['input.json','plan.json','snapshot.json']);
});

test('exact comparison catches every protected flag including admin enforcement',async t=>{
  const f=await snapshotFixture(t);
  const {compareProtectionSettings}=await import('../scripts/release-protection.mjs');
  for(const name of ['enforce_admins','required_linear_history','allow_force_pushes','allow_deletions',
    'block_creations','required_conversation_resolution','lock_branch','allow_fork_syncing']){
    const changed=settings();changed[name].enabled=!changed[name].enabled;
    const actual=evidence(changed,{capturedAt:'2026-10-15T11:00:00.000Z',provenance:{kind:'ownerObservation',source:'owner GET receipt',observationId:'after'}});
    const report=compareProtectionSettings({expected:f.value,actual});
    assert.equal(report.matches,false,name);assert.equal(report.restored,false,name);
    const row=report.settings.find(row=>row.path===name);
    assert.deepEqual(row,{path:name,expected:settings()[name].enabled,actual:changed[name].enabled,match:false});
  }
});

test('verify distinguishes fixture match, fresh owner observation, and stale observation',async t=>{
  const f=await snapshotFixture(t),observed=join(f.dir,'observed.json');
  const verify=async(actual,name)=>{
    await writeFile(observed,JSON.stringify(actual));const output=join(f.dir,name+'.json');
    const r=cli(['verify','--snapshot',f.snapshot,'--observed',observed,'--output',output]);
    return {r,report:JSON.parse(await readFile(output,'utf8'))};
  };
  const fixtureReport=await verify(evidence(settings(),{capturedAt:'2026-10-15T11:00:00.000Z',provenance:{kind:'fixture',source:'fixture GET',observationId:'after'}}),'fixture');
  assert.equal(fixtureReport.r.status,0,fixtureReport.r.stderr);
  assert.equal(fixtureReport.report.matches,true);assert.equal(fixtureReport.report.restored,false);
  assert.equal(fixtureReport.report.scope,'fixture');
  const fresh=evidence(settings(),{capturedAt:'2026-10-15T11:00:00.000Z',provenance:{kind:'ownerObservation',source:'owner GET receipt',observationId:'after'}});
  const ownerFixture=await snapshotFixture(t,evidence(settings(),{provenance:{kind:'ownerObservation',source:'owner original GET receipt',observationId:'owner-before'}}));
  const {compareProtectionSettings}=await import('../scripts/release-protection.mjs');
  const owner=compareProtectionSettings({expected:ownerFixture.value,actual:{...fresh,provenance:{...fresh.provenance,snapshotSha256:ownerFixture.value.snapshotSha256,afterRestoration:true}}});
  assert.equal(owner.restored,true);assert.equal(owner.scope,'ownerSuppliedObservation');
  const assertFreshRefusals=compare=>{
    for(const [name,patch] of [['reused observation',{observationId:'owner-before'}],['wrong snapshot',{snapshotSha256:'0'.repeat(64)}],['absent restoration',{afterRestoration:undefined}],['false restoration',{afterRestoration:false}]]){
      const actual={...fresh,provenance:{...fresh.provenance,snapshotSha256:ownerFixture.value.snapshotSha256,afterRestoration:true,...patch}};
      if(actual.provenance.afterRestoration===undefined)delete actual.provenance.afterRestoration;
      const refused=compare({expected:ownerFixture.value,actual});
      assert.equal(refused.matches,false,name);assert.equal(refused.restored,false,name);assert.ok(refused.missing.includes('freshObservation'),name);
    }
  };
  assertFreshRefusals(compareProtectionSettings);
  const source=await readFile(script,'utf8');
  for(const [name,before,after] of [
    ['reused-id','actual.provenance.observationId!==expected.provenance.observationId','true'],
    ['restoration-binding',"if(!fixture&&(!actual.provenance.afterRestoration||actual.provenance.snapshotSha256!==expected.snapshotSha256))missing.push('freshObservation');",'']
  ]){
    assert.equal(source.split(before).length,2);const path=join(f.dir,name+'-mutant.mjs');await writeFile(path,source.replace(before,after));
    const mutant=await import(pathToFileURL(path).href);assert.throws(()=>assertFreshRefusals(mutant.compareProtectionSettings),assert.AssertionError);
  }
  const stale=await verify({...fresh,capturedAt:'2026-10-15T09:00:00.000Z'},'stale');
  assert.equal(stale.r.status,1);assert.equal(stale.report.restored,false);
  assert.ok(stale.report.missing.includes('freshObservation'));
});

test('contexts-only maps losslessly while conflicting checks or future settings block the plan',async t=>{
  const {buildProtectionRestorePlan}=await import('../scripts/release-protection.mjs');
  const legacy=settings();delete legacy.required_status_checks.checks;
  const f=await snapshotFixture(t,evidence(legacy));
  const plan=buildProtectionRestorePlan({snapshot:f.value,repository,branch});
  assert.deepEqual(plan.restoration.body.required_status_checks,{strict:true,contexts:['verify']});
  const unknown=settings();unknown.future_protection={enabled:true};
  const u=await snapshotFixture(t,evidence(unknown));
  const blocked=buildProtectionRestorePlan({snapshot:u.value,repository,branch});
  assert.equal(blocked.complete,false);assert.equal(blocked.restoration,null);
  assert.ok(blocked.unknown.includes('future_protection'));
  const conflict=settings();conflict.required_status_checks.contexts=['different'];
  const c=await snapshotFixture(t,evidence(conflict));
  assert.equal(buildProtectionRestorePlan({snapshot:c.value,repository,branch}).complete,false);
});

test('sets compare by identity without losing app binding or review restrictions',async t=>{
  const s=settings();s.restrictions.users.push({login:'second'});
  const f=await snapshotFixture(t,evidence(s));
  const {compareProtectionSettings}=await import('../scripts/release-protection.mjs');
  const fresh=protection=>evidence(protection,{capturedAt:'2026-10-15T11:00:00.000Z',provenance:{kind:'ownerObservation',source:'owner GET',observationId:'after'}});
  const reordered=structuredClone(s);reordered.restrictions.users.reverse();
  assert.equal(compareProtectionSettings({expected:f.value,actual:fresh(reordered)}).matches,true);
  reordered.required_status_checks.checks[0].app_id=999;
  const assertAppMismatch=report=>{
    assert.equal(report.matches,false);
    assert.equal(report.restored,false);
    assert.deepEqual(report.settings.find(row=>row.path==='required_status_checks.checks'),{
      path:'required_status_checks.checks',expected:[{context:'verify',app_id:15368}],
      actual:[{context:'verify',app_id:999}],match:false
    });
  };
  assertAppMismatch(compareProtectionSettings({expected:f.value,actual:fresh(reordered)}));
  // A fixture-only mutation conflates positive app IDs. The same oracle must
  // reject it; fixture provenance alone always keeps restored:false.
  const source=await readFile(script,'utf8');
  const mutant=source.replace('const value=structuredClone(settings),checks=value.required_status_checks;',
    'const value=structuredClone(settings),checks=value.required_status_checks; if(checks?.checks)for(const check of checks.checks)check.app_id=-1;');
  assert.notEqual(mutant,source);
  const mutantPath=join(f.dir,'app-binding-mutant.mjs');await writeFile(mutantPath,mutant);
  const mutated=await import(pathToFileURL(mutantPath).href);
  const conflated=mutated.compareProtectionSettings({expected:f.value,actual:fresh(reordered)});
  assert.equal(conflated.matches,true);
  assert.throws(()=>assertAppMismatch(conflated),assert.AssertionError);
  const review=structuredClone(s);review.required_pull_request_reviews.dismissal_restrictions.teams=[];
  const result=compareProtectionSettings({expected:f.value,actual:fresh(review)});
  assert.equal(result.restored,false);
  assert.ok(result.settings.some(row=>row.path==='required_pull_request_reviews.dismissal_restrictions.teams'&&!row.match));
});

test('absent protection differs from disabled settings and unsupported disabled state',async t=>{
  const {buildProtectionRestorePlan,compareProtectionSettings}=await import('../scripts/release-protection.mjs');
  const absent=await snapshotFixture(t,evidence(null,{state:'absent'}));
  const plan=buildProtectionRestorePlan({snapshot:absent.value,repository,branch});
  assert.equal(plan.restoration.method,'DELETE');assert.equal(plan.restoration.body,null);
  const current=evidence(settings(),{capturedAt:'2026-10-15T11:00:00.000Z',provenance:{kind:'fixture',source:'fixture',observationId:'after'}});
  assert.equal(compareProtectionSettings({expected:absent.value,actual:current}).matches,false);
  const disabled=await snapshotFixture(t,evidence(null,{state:'disabled'}));
  assert.equal(buildProtectionRestorePlan({snapshot:disabled.value,repository,branch}).complete,false);
});

test('identity, hash, API schema and missing-setting drift fail closed',async t=>{
  const {buildProtectionRestorePlan,compareProtectionSettings}=await import('../scripts/release-protection.mjs');
  const f=await snapshotFixture(t),args={snapshot:f.value,repository,branch};
  assert.throws(()=>buildProtectionRestorePlan({...args,repository:'other/repo'}),{code:'PROTECTION_IDENTITY'});
  assert.throws(()=>buildProtectionRestorePlan({...args,branch:'other'}),{code:'PROTECTION_IDENTITY'});
  const tampered=structuredClone(f.value);tampered.protection.enforce_admins.enabled=false;
  assert.throws(()=>buildProtectionRestorePlan({...args,snapshot:tampered}),{code:'PROTECTION_HASH'});
  assert.throws(()=>compareProtectionSettings({expected:f.value,actual:evidence(settings(),{repository:'other/repo'})}),{code:'PROTECTION_IDENTITY'});
  const unknown=await snapshotFixture(t,evidence(settings(),{apiVersion:'2099-01-01'}));
  assert.equal(buildProtectionRestorePlan({...args,snapshot:unknown.value}).complete,false);
  const missing=settings();delete missing.enforce_admins;
  const result=compareProtectionSettings({expected:f.value,actual:evidence(missing,{capturedAt:'2026-10-15T11:00:00.000Z',provenance:{kind:'fixture',source:'fixture',observationId:'after'}})});
  assert.equal(result.matches,false);assert.ok(result.missing.includes('actual.enforce_admins'));
});

test('CLI refuses overwrite, unknown flags, invalid UTF-8, oversized and nonregular input',async t=>{
  const f=await snapshotFixture(t),prior=await readFile(f.snapshot);
  const collision=cli(['snapshot','--input',f.input,'--output',f.snapshot]);
  assert.equal(collision.status,1);assert.match(collision.stderr,/PROTECTION_OUTPUT_EXISTS/);
  assert.deepEqual(await readFile(f.snapshot),prior);
  for(const extra of [['--apply'],['--input',f.input],['--network','true']]){
    const r=cli(['snapshot','--input',f.input,'--output',join(f.dir,'refused.json'),...extra]);
    assert.equal(r.status,1);assert.match(r.stderr,/PROTECTION_ARGUMENTS/);
  }
  for(const [name,data] of [['utf8',Buffer.from([0xc3,0x28])],['huge',Buffer.alloc(1048577,32)],['json','{'],['proto','{"__proto__":{}}']]){
    const input=join(f.dir,name);await writeFile(input,data);
    const r=cli(['snapshot','--input',input,'--output',join(f.dir,name+'.out')]);
    assert.equal(r.status,1,name);assert.match(r.stderr,/PROTECTION_(INPUT|LIMIT|SCHEMA)/);
    assert.doesNotMatch(r.stderr,new RegExp(f.dir.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
  const directory=join(f.dir,'directory');await mkdir(directory);
  assert.equal(cli(['snapshot','--input',directory,'--output',join(f.dir,'dir.out')]).status,1);
  await t.test('exact raw input and formatted output byte boundaries',async()=>{
    const limit=1048576,raw=JSON.stringify(evidence()),padded=join(f.dir,'exact-input.json'),inputOutput=join(f.dir,'exact-input.out');
    await writeFile(padded,raw+' '.repeat(limit-Buffer.byteLength(raw)));
    const admitted=cli(['snapshot','--input',padded,'--output',inputOutput]);assert.equal(admitted.status,0,admitted.stderr);
    const exact=evidence();exact.protection.restrictions.users[0].description='';
    const shape={...exact,evidenceSha256:'0'.repeat(64),settingsSha256:'0'.repeat(64),snapshotSha256:'0'.repeat(64)};
    const padding=limit-Buffer.byteLength(JSON.stringify(shape,null,2)+'\n');
    exact.protection.restrictions.users[0].description='x'.repeat(padding);
    const output=join(f.dir,'exact-output.json'),input=join(f.dir,'output-input.json');await writeFile(input,JSON.stringify(exact));
    const written=cli(['snapshot','--input',input,'--output',output]);assert.equal(written.status,0,written.stderr);assert.equal((await readFile(output)).length,limit);
    exact.protection.restrictions.users[0].description+='x';await writeFile(input,JSON.stringify(exact));
    const over=join(f.dir,'oversized-output.json'),refused=cli(['snapshot','--input',input,'--output',over]);assert.equal(refused.status,1);assert.match(refused.stderr,/PROTECTION_LIMIT/);assert.equal((await readdir(f.dir)).includes('oversized-output.json'),false);
  });
  await t.test('hardlinked evidence is refused without creating a receipt',{skip:process.env.AGENT_WORKFLOW_WORKER==='1'?'Coordinator-owned filesystem-link fixture':false},async()=>{
    const alias=join(f.dir,'hardlinked.json'),output=join(f.dir,'hardlinked.out'),before=await readFile(f.input);
    await link(f.input,alias);
    const result=cli(['snapshot','--input',alias,'--output',output]);
    assert.equal(result.status,1);assert.match(result.stderr,/PROTECTION_INPUT/);
    assert.equal((await readdir(f.dir)).includes('hardlinked.out'),false);
    assert.deepEqual(await readFile(f.input),before);
  });
  await t.test('linked ancestor is refused without creating a receipt',{skip:process.env.AGENT_WORKFLOW_WORKER==='1'?'Coordinator-owned filesystem-link fixture':false},async()=>{
    const target=join(f.dir,'target'),alias=join(f.dir,'linked-parent'),output=join(f.dir,'linked-parent.out');
    await mkdir(target);await writeFile(join(target,'input.json'),JSON.stringify(evidence()));
    await symlink(target,alias,process.platform==='win32'?'junction':'dir');
    const result=cli(['snapshot','--input',join(alias,'input.json'),'--output',output]);
    assert.equal(result.status,1);assert.match(result.stderr,/PROTECTION_INPUT/);
    assert.equal((await readdir(f.dir)).includes('linked-parent.out'),false);
  });
});

test('equivalent unbound checks compare with contexts without inventing an app binding',async t=>{
  const original=settings();delete original.required_status_checks.checks;
  const f=await snapshotFixture(t,evidence(original));
  const observed=settings();observed.required_status_checks.checks[0].app_id=null;
  const {compareProtectionSettings}=await import('../scripts/release-protection.mjs');
  const report=compareProtectionSettings({expected:f.value,actual:evidence(observed,{
    capturedAt:'2026-10-15T11:00:00.000Z',provenance:{kind:'fixture',source:'GET fixture',observationId:'after'}})});
  assert.equal(report.matches,true);
  observed.required_status_checks.checks[0].app_id=15368;
  assert.equal(compareProtectionSettings({expected:f.value,actual:evidence(observed,{
    capturedAt:'2026-10-15T11:00:00.000Z',provenance:{kind:'fixture',source:'GET fixture',observationId:'after'}})}).matches,false);
});

test('public pure input validation rejects accessors without invoking them',async t=>{
  const f=await snapshotFixture(t),{buildProtectionRestorePlan,compareProtectionSettings,main}=await import('../scripts/release-protection.mjs');
  let calls=0;const snapshot=structuredClone(f.value);
  Object.defineProperty(snapshot,'repository',{enumerable:false,get(){calls++;return repository;}});
  assert.throws(()=>buildProtectionRestorePlan({snapshot,repository,branch}),{code:'PROTECTION_SCHEMA'});
  assert.equal(calls,0);
  const rehash=s=>{
    s.settingsSha256=digest(canonical(s.protection));
    const {snapshotSha256,...unsigned}=s;s.snapshotSha256=digest(canonical(unsigned));return s;
  };
  const malformed=[
    ['trailing hole',()=>new Array(1)],
    ['hole masked by named property',()=>Object.assign(new Array(1),{named:'verify'})],
    ['dense with named property',()=>Object.assign(['verify'],{named:'verify'})],
    ['array subclass',()=>new (class extends Array {})('verify')]
  ];
  for(const [name,make] of malformed)await t.test(name,()=>{
    const changed=structuredClone(f.value);changed.protection.required_status_checks.contexts=make();
    // These are valid recomputed integrity fields, not a hash-corruption case.
    assert.throws(()=>buildProtectionRestorePlan({snapshot:rehash(changed),repository,branch}),{code:'PROTECTION_SCHEMA'});
    const actual=evidence();actual.protection.required_status_checks.contexts=make();
    assert.throws(()=>compareProtectionSettings({expected:f.value,actual}),{code:'PROTECTION_SCHEMA'});
  });
  await t.test('nested actor array',()=>{
    const changed=structuredClone(f.value);
    changed.protection.restrictions.users=Object.assign(new Array(1),{named:{login:'maintainer'}});
    assert.throws(()=>buildProtectionRestorePlan({snapshot:rehash(changed),repository,branch}),{code:'PROTECTION_SCHEMA'});
  });
  await t.test('array accessor does not run',()=>{
    const actual=evidence(),contexts=[];
    Object.defineProperty(contexts,'0',{enumerable:true,get(){calls++;return 'verify';}});
    actual.protection.required_status_checks.contexts=contexts;
    assert.throws(()=>compareProtectionSettings({expected:f.value,actual}),{code:'PROTECTION_SCHEMA'});
    assert.equal(calls,0);
  });
  await t.test('proxy traps do not run',()=>{
    const actual=evidence();
    actual.protection.required_status_checks.contexts=new Proxy(['verify'],{
      getPrototypeOf(){calls++;return Array.prototype;},ownKeys(){calls++;return ['0','length'];},
      getOwnPropertyDescriptor(target,key){calls++;return Reflect.getOwnPropertyDescriptor(target,key);}
    });
    assert.throws(()=>compareProtectionSettings({expected:f.value,actual}),{code:'PROTECTION_SCHEMA'});
    assert.equal(calls,0);
  });
  await t.test('command argv rejects named properties before output',async()=>{
    const output=join(f.dir,'bad-argv.json');
    const argv=Object.assign(['snapshot','--input',f.input,'--output',output],{named:'ignored'});
    await assert.rejects(main(argv),{code:'PROTECTION_SCHEMA'});
    assert.equal((await readdir(f.dir)).includes('bad-argv.json'),false);
  });
  await t.test('exact pure byte, depth and node limits reject one more',async()=>{
    const make=()=>({snapshot:structuredClone(f.value),repository,branch});
    const valid=input=>{rehash(input.snapshot);assert.equal(buildProtectionRestorePlan(input).complete,true);};
    const bytes=make();bytes.snapshot.protection.restrictions.users[0].description='';
    bytes.snapshot.protection.restrictions.users[0].description='x'.repeat(1048576-Buffer.byteLength(canonical(bytes)));valid(bytes);
    assert.equal(Buffer.byteLength(canonical(bytes)),1048576);
    bytes.snapshot.protection.restrictions.users[0].description+='x';rehash(bytes.snapshot);
    assert.throws(()=>buildProtectionRestorePlan(bytes),{code:'PROTECTION_LIMIT'});
    const depth=make();let chain=0;for(let i=0;i<42;i++)chain={child:chain};depth.snapshot.protection.restrictions.users[0].permissions=chain;valid(depth);
    depth.snapshot.protection.restrictions.users[0].permissions={child:chain};rehash(depth.snapshot);
    assert.throws(()=>buildProtectionRestorePlan(depth),{code:'PROTECTION_SCHEMA'});
    const nodes=make();nodes.snapshot.protection.restrictions.users[0].permissions=[];
    let count=0;JSON.stringify(nodes,(_key,value)=>{count++;return value;});
    nodes.snapshot.protection.restrictions.users[0].permissions=Array(50000-count).fill(null);valid(nodes);
    nodes.snapshot.protection.restrictions.users[0].permissions.push(null);rehash(nodes.snapshot);
    assert.throws(()=>buildProtectionRestorePlan(nodes),{code:'PROTECTION_SCHEMA'});
    const source=await readFile(script,'utf8');
    for(const [name,before,after,input,code] of [
      ['pure-bytes','const LIMIT=1048576;','const LIMIT=2097152;',bytes,'PROTECTION_LIMIT'],
      ['depth','depth>48','depth>49',depth,'PROTECTION_SCHEMA'],
      ['nodes','nodes>50000','nodes>50001',nodes,'PROTECTION_SCHEMA']
    ]){
      assert.equal(source.split(before).length,2);const path=join(f.dir,name+'-mutant.mjs');await writeFile(path,source.replace(before,after));const mutant=await import(pathToFileURL(path).href);
      assert.equal(mutant.buildProtectionRestorePlan(input).complete,true,name);
      assert.throws(()=>assert.throws(()=>mutant.buildProtectionRestorePlan(input),{code}),assert.AssertionError);
    }
  });
});

test('snapshot refuses duplicate JSON setting names instead of discarding earlier evidence',async t=>{
  const f=await fixture(t),output=join(f.dir,'ambiguous.json');
  const raw=JSON.stringify(evidence()).replace('"enforce_admins":{"enabled":true}',
    '"enforce_admins":{"enabled":false},"enforce_admins":{"enabled":true}');
  await writeFile(f.input,raw);
  const r=cli(['snapshot','--input',f.input,'--output',output]);
  assert.equal(r.status,1);assert.match(r.stderr,/PROTECTION_INPUT/);
  assert.deepEqual((await readdir(f.dir)).sort(),['input.json']);
});

test('unknown public inputs and inherited command names cannot select operations',async t=>{
  const f=await snapshotFixture(t),{buildProtectionRestorePlan,compareProtectionSettings}=await import('../scripts/release-protection.mjs');
  assert.throws(()=>buildProtectionRestorePlan({snapshot:f.value,repository,branch,apply:true}),{code:'PROTECTION_SCHEMA'});
  assert.throws(()=>compareProtectionSettings({expected:f.value,actual:evidence(),passed:true}),{code:'PROTECTION_SCHEMA'});
  for(const command of ['constructor','__proto__','toString']){
    const r=cli([command,'--output',join(f.dir,command+'.json')]);
    assert.equal(r.status,1);assert.match(r.stderr,/PROTECTION_ARGUMENTS/);
  }
});
