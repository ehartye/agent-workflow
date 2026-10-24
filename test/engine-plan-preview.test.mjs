/** @lane merge
 * @subject engine/plan-preview.mjs
 */
import test from 'node:test';
test('preview retains zero-worker step declarations and recognizes inert composition calls',async()=>{
 const {previewPlan}=await import('../engine/plan-preview.mjs');const steps=[{id:'pending',label:'Pending',dependsOn:[]}];const script='export const meta='+JSON.stringify({name:'display',description:'inert',steps})+';const value=await workflow("not-admitted",{});return await refineArtifact({});';
 const preview=previewPlan({script});assert.deepEqual(preview.meta.steps,steps);assert.deepEqual(preview.callSites.map(s=>s.api),['workflow','refineArtifact']);
});
import assert from 'node:assert/strict';
import {previewPlan} from '../engine/plan-preview.mjs';
import {compileSchema} from '../engine/schema.mjs';
import {mkdtemp,access,readFile,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const meta = 'export const meta={name:"preview",description:"Inert inspection"};\n';

test('literal result budgets match dispatch compilation and exact UTF-8 result boundaries',()=>{
  for(const schema of [
    {type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false},
    {type:'object',properties:{text:{type:'string'},kind:{enum:Array.from({length:64},(_,i)=>`kind-${i}-${'x'.repeat(80)}`)}},required:['text','kind'],additionalProperties:false},
  ]){
    const site=previewPlan({script:meta+`await agent('private prompt',{schema:${JSON.stringify(schema)}});`}).callSites[0];
    const compiled=compileSchema(schema),limit=compiled.limits.maxSerializedBytes;
    assert.deepEqual(site.resultBudget,{status:'known',maxSerializedBytes:limit,code:null});
    const value=schema.properties.kind?{text:'é',kind:schema.properties.kind.enum[0]}:{text:'é'};
    value.text+='x'.repeat(limit-Buffer.byteLength(JSON.stringify(value)));
    assert.equal(Buffer.byteLength(JSON.stringify(value)),limit);
    assert.equal(compiled.validate(value),true);
    value.text+='x';
    assert.throws(()=>compiled.validate(value),{code:limit===1048576?'RESULT_SIZE':'RESULT_LIMIT'});
  }
});

test('inert budgets preserve invalid, dynamic and unstructured schema outcomes',()=>{
  const bodies=[
    ["agent('x')",'unstructured',null],
    ["agent('x',{})",'unstructured',null],
    ["agent('x',{schema:{type:'object',properties:{n:{type:'number',minimum:-2}}}})",'known',null],
    ["agent('x',{schema:{type:'array'}})",'invalid','SCHEMA_INVALID'],
    ["agent('x',{schema:{type:'object',pattern:'x'}})",'invalid','SCHEMA_UNSUPPORTED'],
    ["agent('x',{schema:{type:'object',description:"+JSON.stringify('x'.repeat(33000))+"}})",'invalid','SCHEMA_LIMIT'],
    ["agent('x',{schema:args.schema})",'unknown','dynamicSchema'],
    ["agent('x',args.options)",'unknown','dynamicOptions'],
    ["agent('x',{...args.options,schema:{type:'object'}})",'unknown','dynamicOptions'],
    ["agent('x',{schema:{type:'object',...args.schema}})",'unknown','dynamicSchema'],
    ["agent('x',{schema:{type:'array'},schema:{type:'object'}})",'unknown','dynamicOptions'],
    ["agent('x',{schema:{type:'object',get properties(){throw Error('must not run')}}})",'unknown','dynamicSchema'],
    ["agent('x',{schema:{type:'object',[args.key]:1}})",'unknown','dynamicSchema'],
    ["agent('x',{schema:{type:'object',const:{__proto__:null}}})",'unknown','dynamicSchema'],
    ["agent('x',{schema:(globalThis.__budgetExecuted=true,{type:'object'})})",'unknown','dynamicSchema'],
  ];
  for(const [body,status,code] of bodies){
    const site=previewPlan({script:meta+body}).callSites.find(site=>site.api==='agent');
    assert.equal(site.resultBudget?.status,status,body.slice(0,100));
    assert.equal(site.resultBudget.code,code);
    if(status!=='known')assert.equal(site.resultBudget.maxSerializedBytes,null);
  }
  assert.equal(globalThis.__budgetExecuted,undefined);
  assert.deepEqual(previewPlan({script:meta+"function f(agent){agent('x',{schema:{type:'object'}})}"}).callSites,[]);
});

test('budget inspection bounds unique compilation while reusing identical literal schemas',()=>{
  const call=i=>`agent('x',{schema:{type:'object',title:'${i}'}});`;
  const result=previewPlan({script:meta+call(0).repeat(10)+Array.from({length:64},(_,i)=>call(i+1)).join('')});
  assert.equal(result.callSites.filter(site=>site.resultBudget?.status==='known').length,73);
  assert.deepEqual(result.callSites.at(-1).resultBudget,{status:'unknown',maxSerializedBytes:null,code:'schemaInspectionLimit'});
  const wide=previewPlan({script:meta+`agent('x',{schema:{type:'object',const:[${'0,'.repeat(10001)}]}});`});
  assert.equal(wide.callSites[0].resultBudget.status,'unknown');
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=512*1024);
});

test('preview inspects literal dependencies without running hostile workflow code', () => {
  const script = meta + `
    globalThis.__workflowPreviewExecuted = true;
    fetch('https://must-not-run.invalid');
    throw new Error('must not execute');
    await phase('Build');
    await agent('first', {id:'a'});
    await agent('second', {id:'b', dependsOn:['a']});
  `;
  const result = previewPlan({script});
  assert.equal(globalThis.__workflowPreviewExecuted, undefined);
  assert.equal(result.schemaVersion, 1);
  assert.deepEqual(result.callSites.filter(site => site.api === 'agent').map(site => site.literalId), ['a', 'b']);
  assert.deepEqual(result.dependencyEdges, [{from:'a', to:'b'}]);
  assert.equal(result.truncated, false);
});

test('literal phases group possible members without inventing causal edges', () => {
  const result = previewPlan({script:meta + `await phase('Build'); await agent('a',{id:'a'}); await phase('Check'); await agent('b',{id:'b',phase:'Review'});`});
  assert.deepEqual(result.dependencyEdges, []);
  assert.deepEqual(result.callSites.filter(site => site.api === 'agent').map(site => site.literalPhase), ['Build','Review']);
  assert.deepEqual(result.groups.find(group => group.literalPhase === 'Build').callSites, [result.callSites[1].offsetStart]);
});

test('branches and repeated callbacks preserve unknown dynamic fanout', () => {
  const result = previewPlan({script:meta + `
    if(args.ok) await agent('maybe',{id:'maybe'});
    for(const item of args.items) await agent(item);
    function recursive(){ agent('nested'); recursive(); }
    await parallel(args.tasks.map(item => () => agent(item)));
    agent?.('optional');
  `});
  assert.deepEqual(result.callSites.filter(site => site.api === 'agent').map(site => site.multiplicity), [
    {min:0,max:1}, {min:0,max:null}, {min:0,max:null}, {min:0,max:null}, {min:0,max:1}
  ]);
  assert.ok(result.unknowns.some(item => item.code === 'dynamicMultiplicity'));
  assert.ok(result.unknowns.some(item => item.code === 'optionalCall'));
  const fields = previewPlan({script:meta + `
    class Example {
      [agent('key',{id:'key'})] = agent('instance',{id:'instance'});
      static ready = agent('static',{id:'static'});
    }
    new Example(); new Example();
    agent('dependent',{id:'dependent',dependsOn:['key','instance','static']});
  `});
  assert.deepEqual(fields.callSites.filter(site=>site.api==='agent').map(site=>[site.literalId,site.multiplicity]), [
    ['key',{min:1,max:1}], ['instance',{min:0,max:null}], ['static',{min:1,max:1}], ['dependent',{min:1,max:1}]
  ]);
  assert.deepEqual(fields.dependencyEdges,[{from:'key',to:'dependent'},{from:'static',to:'dependent'}]);
  assert.ok(fields.unknowns.some(item=>item.code==='dynamicDependency'));
});

test('lexical bindings including hoists, parameters and destructuring shadow broker names', () => {
  const result = previewPlan({script:meta + `
    { agent('tdz'); const agent=()=>{}; }
    function helper(agent){agent('parameter');}
    function hoist(){agent('var');var agent;}
    try{}catch({agent}){agent('caught');}
    {const {agent}=args; agent('binding');}
    const alias=agent; alias('alias'); globalThis.agent('member');
    function separate(x=agent('initializer',{id:'initializer'})){var agent;agent('body');}
    function parameter(x=agent('parameter-tdz'),agent){}
    switch(agent('discriminant',{id:'discriminant'})){case agent('case-tdz'):let agent;}
    await agent('real',{id:'real'});
  `});
  assert.deepEqual(result.callSites.map(site => site.literalId), ['initializer','discriminant','real']);
  assert.ok(result.unknowns.some(item => item.code === 'shadowedCall'));
  assert.ok(result.unknowns.some(item => item.code === 'unsupportedCall'));
});

test('duplicate, forward and computed dependency identities stay unknown', () => {
  const result = previewPlan({script:meta + `
    await agent('a',{id:'a'});
    await agent('b',{id:'b',dependsOn:['a','future']});
    await agent('duplicate',{id:'a'});
    await agent('future',{id:'future'});
    await agent('dynamic',{['id']:args.id,dependsOn:args.dependencies});
  `});
  assert.deepEqual(result.dependencyEdges, []);
  assert.ok(result.unknowns.some(item => item.code === 'duplicateId'));
  assert.ok(result.unknowns.some(item => item.code === 'unresolvedDependency'));
  assert.ok(result.unknowns.some(item => item.code === 'dynamicOptions'));
});

test('nested calls cannot establish earlier admission from their source offsets', () => {
  const result = previewPlan({script:meta + `
    await agent('prior',{id:'prior'});
    await agent(await agent('inner',{id:'inner',dependsOn:['outer','prior']}),{id:'outer'});
  `});
  // The outer call starts first in source, but its inner argument runs before
  // outer admission. Only the independent, fully preceding call is known.
  assert.deepEqual(result.dependencyEdges, [{from:'prior',to:'inner'}]);
  const inner = result.callSites.find(site => site.literalId === 'inner');
  assert.ok(result.unknowns.some(item => item.code === 'unresolvedDependency' && item.offsetStart === inner.offsetStart));
  // Even a valid inner -> outer dependency stays unknown: the preview does
  // not resolve argument evaluation order to prove nested admission.
  const reverse = previewPlan({script:meta + `await agent(await agent('inner',{id:'inner'}),{id:'outer',dependsOn:['inner']});`});
  assert.deepEqual(reverse.dependencyEdges, []);
  assert.ok(reverse.unknowns.some(item => item.code === 'unresolvedDependency'));
});

test('depth, call-site, group, traversal and output bounds never return a complete graph', () => {
  const depth = previewPlan({script:meta + `const value=${'['.repeat(260)}0${']'.repeat(260)};agent('after');`});
  assert.equal(depth.truncated, true);
  assert.ok(depth.unknowns.some(item => item.code === 'depthLimit'));
  const calls = previewPlan({script:meta + `agent('x');`.repeat(4097)});
  assert.equal(calls.truncated, true);
  assert.ok(calls.callSites.length <= 4096);
  assert.ok(Buffer.byteLength(JSON.stringify(calls)) <= 512*1024);
  const groups = previewPlan({script:meta + Array.from({length:1001},(_,index) => `phase('p${index}');agent('x');`).join('')});
  assert.equal(groups.truncated, true);
  assert.ok(groups.groups.length <= 1000);
  const nodes = previewPlan({script:meta + ';'.repeat(200001)});
  assert.equal(nodes.truncated, true);
  assert.ok(nodes.unknowns.some(item => item.code === 'nodeLimit'));
  const metadata = previewPlan({script:`export const meta={name:'large',description:'${'x'.repeat(600000)}'};`});
  assert.equal(metadata.truncated,true);
  assert.ok(Buffer.byteLength(JSON.stringify(metadata))<=512*1024);
});

test('preview preserves script validation and rejects unknown input keys', () => {
  assert.throws(() => previewPlan({script:meta + 'import x from "x";'}), {code:'SCRIPT_MODULE'});
  assert.throws(() => previewPlan({script:meta + '(() => import("x"))();'}), {code:'SCRIPT_MODULE'});
  assert.throws(() => previewPlan({script:meta + '('}), {code:'SCRIPT_SYNTAX'});
  assert.throws(() => previewPlan({script:'x'.repeat(1024*1024+1)}), {code:'SCRIPT_SIZE'});
  assert.throws(() => previewPlan({script:meta,execute:true}), {code:'PLAN_INPUT'});
  let traps=0;
  const proxy=new Proxy({script:meta},Object.fromEntries(['getPrototypeOf','ownKeys','getOwnPropertyDescriptor','get'].map(key=>[key,()=>{traps++;throw Error('caller trap');}])));
  let refusal;try{previewPlan(proxy);}catch(error){refusal=error;}
  assert.equal(traps,0,'Input refusal must precede caller Proxy traps');
  assert.equal(refusal?.code,'PLAN_INPUT');
  const revoked=Proxy.revocable({script:meta},{});revoked.revoke();
  assert.throws(()=>previewPlan(revoked.proxy),{code:'PLAN_INPUT'});
});

test('large metadata plus saturated unknown coverage returns within the response bound',()=>{
  const script=`export const meta={name:'large',description:'${'x'.repeat(510000)}'};`+'mystery();'.repeat(400);
  const program=`import {previewPlan} from ${JSON.stringify(new URL('../engine/plan-preview.mjs',import.meta.url).href)};
    const result=previewPlan({script:${JSON.stringify(script)}});
    process.stdout.write(JSON.stringify({truncated:result.truncated,bytes:Buffer.byteLength(JSON.stringify(result))}));`;
  // A dedicated, pure parser child bounds a regression that otherwise spins
  // forever. This is an explicit test execution bound, not a worker deadline.
  const child=spawnSync(process.execPath,['--input-type=module'],{input:program,encoding:'utf8',timeout:3000,windowsHide:true,maxBuffer:1024*1024});
  assert.equal(child.status,0,child.error?.code??child.stderr);
  const result=JSON.parse(child.stdout);
  assert.equal(result.truncated,true);
  assert.ok(result.bytes<=512*1024);
});

test('an existing validator stack limit stays an unknown preview instead of an uncaught host error',()=>{
  const result=previewPlan({script:meta+'const wide=['+'0,'.repeat(150000)+'];'});
  assert.equal(result.truncated,true);
  assert.deepEqual(result.callSites,[]);
  assert.ok(result.unknowns.some(item=>item.code==='validationLimit'));
});

test('a hostile file-writing script stays inert and a side-effect mutation fails the same invariant', async t => {
  const root=await mkdtemp(fileURLToPath(new URL('../.controller-test-inspection-',import.meta.url)));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const marker=join(root,'executed.txt');
  const script=meta+`process.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(marker)},'ran');throw Error('must not run');`;
  const assertAbsent=()=>assert.rejects(access(marker),{code:'ENOENT'});
  previewPlan({script});
  await assertAbsent();
  // Controlled copy of our subject injects the forbidden observable effect;
  // no workflow is evaluated in the test process and product source is intact.
  const source=await readFile(new URL('../engine/plan-preview.mjs',import.meta.url),'utf8');
  const anchor='const {script} = input;';
  assert.equal(source.split(anchor).length,2);
  const mutant=source.replace(anchor,`${anchor}\nprocess.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(marker)},'ran');`)
    .replace("from './script.mjs'",`from ${JSON.stringify(new URL('../engine/script.mjs',import.meta.url).href)}`)
    .replace("from './plan-result-budget.mjs'",`from ${JSON.stringify(new URL('../engine/plan-result-budget.mjs',import.meta.url).href)}`);
  const modulePath=join(root,'mutant.mjs'); await writeFile(modulePath,mutant);
  (await import(pathToFileURL(modulePath).href)).previewPlan({script});
  assert.equal(await readFile(marker,'utf8'),'ran');
  await assert.rejects(assertAbsent(),{code:'ERR_ASSERTION'});
});
