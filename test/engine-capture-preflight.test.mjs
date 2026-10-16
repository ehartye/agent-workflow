/** @lane merge
 * @subject engine/workspaces.mjs
 * @subject engine/capture-preflight.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,lstat,rm,realpath,open,utimes,unlink} from 'node:fs/promises';
import filesystem from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {promisify} from 'node:util';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as workspaces from '../engine/workspaces.mjs';
import {preflightCapture} from '../engine/capture-preflight.mjs';
import {diagnostic,fault} from '../foundation/client.mjs';

const exec=promisify(execFile),policy={version:1,excludeDirs:['generated/'],protectedPaths:['note.txt']};
const git=async(cwd,...args)=>(await exec('git',args,{cwd,windowsHide:true,timeout:10000})).stdout.trim();
async function fixture(t){
  const repository=await realpath(dirname(dirname(fileURLToPath(import.meta.url))));
  const root=await realpath(await mkdtemp(join(repository,'.workspace-test-')));
  assert.equal(dirname(root),repository);t.after(()=>rm(root,{recursive:true,force:true}));
  const source=join(root,'project');await mkdir(source);
  await git(source,'init','-q');await git(source,'config','user.email','fixture@example.invalid');await git(source,'config','user.name','Fixture');
  await git(source,'config','core.autocrlf','false');
  await writeFile(join(source,'note.txt'),'base\n');await writeFile(join(source,'.gitignore'),'generated/\n');
  await git(source,'add','.');await git(source,'commit','-qm','base');return{root,source};
}
// Includes source, all Git administrative files/objects, and the sibling root.
async function inventory(root){
  const rows=[];
  const visit=async(path,name)=>{
    const info=await lstat(path);assert.equal(info.isSymbolicLink(),false);
    if(info.isDirectory()){
      rows.push({name,kind:'directory',mtimeMs:info.mtimeMs});
      for(const child of (await readdir(path)).sort())await visit(join(path,child),name+'/'+child);
    }else rows.push({name,kind:'file',bytes:info.size,sha256:createHash('sha256').update(await readFile(path)).digest('hex'),mtimeMs:info.mtimeMs});
  };
  await visit(root,'');return rows;
}
test('read-only admission and public preflight leave source and Git administration byte-identical',async t=>{
  assert.equal(typeof workspaces.inspectCaptureInputs,'function','shared read-only admission must be available');
  const {preflightCapture}=await import('../engine/capture-preflight.mjs');
  const {root,source}=await fixture(t);
  await mkdir(join(source,'generated'));await writeFile(join(source,'generated','cache.bin'),'excluded');
  const before=await inventory(root),report=await preflightCapture({source,capturePolicy:policy});
  assert.equal(report.status,'ready');assert.equal(report.coverage,'complete');assert.equal(report.failure,null);
  assert.equal(report.inferenceStarted,false);assert.equal(report.writerWorkspaceCreated,false);
  assert.deepEqual(report.included,{files:2,bytes:16});
  assert.equal(report.excluded.entries,2);assert.equal(report.excluded.files,1);assert.equal(report.excluded.bytes,8);
  assert.equal(report.limits.includedBytes,536870912);assert.equal(report.limits.patchBytes,536870912);
  assert.deepEqual(await inventory(root),before);
});

async function intercept(source,handler,action){
  const original=childProcess.execFile;
  childProcess.execFile=function(file,args,options,callback){
    if(file==='git'&&options?.cwd===source)return handler({original,args,options,callback});
    return original.apply(this,arguments);
  };syncBuiltinESMExports();
  try{return await action();}finally{childProcess.execFile=original;syncBuiltinESMExports();}
}
test('Git failure facts are causal fixed codes with no stderr, argv or arbitrary error projection',async t=>{
  const {root,source}=await fixture(t),secret='PRIVATE-token-command-and-stderr';
  const cases=[
    ['launch','WORKSPACE_GIT_LAUNCH','gitLaunch',({original,options,callback})=>original(join(root,'missing.exe'),[],options,callback)],
    ['exit','WORKSPACE_GIT_EXIT','gitExit',({original,options,callback})=>original(process.execPath,['-e',`process.stderr.write('${secret}');process.exit(7)`],options,callback)],
    ['timeout','WORKSPACE_GIT_TIMEOUT','gitTimeout',({original,options,callback})=>original(process.execPath,['-e','setInterval(()=>{},1000)'],{...options,timeout:25},callback)],
    ['buffer','WORKSPACE_GIT_BUFFER','gitBuffer',({original,options,callback})=>original(process.execPath,['-e',`process.stdout.write('${secret}'.repeat(100))`],{...options,maxBuffer:16},callback)],
    ['encoding','WORKSPACE_GIT_ENCODING','gitEncoding',({original,options,callback})=>original(process.execPath,['-e','process.stdout.write(Buffer.from([255]))'],options,callback)],
    ['unknown','WORKSPACE_GIT','unknown',({original,options,callback})=>original(process.execPath,['-e',''],options,()=>callback(fault('WORKSPACE_GIT_TIMEOUT',secret),Buffer.alloc(0)))],
  ];
  for(const [name,code,category,handler] of cases)await t.test(name,async()=>{
    await intercept(source,handler,async()=>{
      const report=await preflightCapture({source,capturePolicy:policy});
      assert.deepEqual(report.failure,{stage:'git',code,category});assert.equal(report.base,null);
      assert.equal(report.status,'blocked');assert.equal(report.coverage,'partial');
      assert.doesNotMatch(JSON.stringify(report),new RegExp(secret+'|stderr|argv|missing.exe'));
      await assert.rejects(workspaces.captureInputs({source,artifactsDir:join(root,'must-not-exist'),capturePolicy:policy}),error=>{
        assert.equal(error.code,'WORKSPACE_INPUT');assert.equal(error.captureFailure.stage,'repository');
        assert.equal(diagnostic(error.cause).code,code);assert.doesNotMatch(JSON.stringify(error.captureFailure),new RegExp(secret));return true;
      });
    });
  });
});
test('preflight refuses same-size excluded metadata drift between passes',async t=>{
  const {source}=await fixture(t);await mkdir(join(source,'generated'));const path=join(source,'generated','cache.bin');await writeFile(path,'old');
  let inventories=0;
  const report=await intercept(source,({original,args,options,callback})=>original('git',args,options,async(...result)=>{
    if(args.includes('ls-files')&&++inventories===2){await writeFile(path,'new');await utimes(path,2000000000,2000000000);}
    callback(...result);
  }),()=>preflightCapture({source,capturePolicy:policy}));
  assert.equal(inventories,2);assert.deepEqual(report.failure,{stage:'consistency',code:'WORKSPACE_CHANGED',category:'sourceChanged'});
});
test('preflight refuses included source mutation between passes',async t=>{
  const {source}=await fixture(t);let inventories=0;
  const report=await intercept(source,({original,args,options,callback})=>original('git',args,options,async(...result)=>{
    if(args.includes('ls-files')&&++inventories===2)await writeFile(join(source,'note.txt'),'edit\n');callback(...result);
  }),()=>preflightCapture({source,capturePolicy:policy}));
  assert.deepEqual(report.failure,{stage:'consistency',code:'WORKSPACE_CHANGED',category:'sourceChanged'});
});
test('oversize tracked inputs block before reading payload, and tracked exclusions include deleted paths',async t=>{
  const {source}=await fixture(t),handle=await open(join(source,'note.txt'),'r+');
  try{await handle.truncate(536870913);}finally{await handle.close();}
  const report=await preflightCapture({source,capturePolicy:policy});
  assert.deepEqual(report.failure,{stage:'included',code:'WORKSPACE_LIMIT',category:'byteLimit'});
  assert.ok(report.included.bytes>report.limits.includedBytes);assert.equal(report.inferenceStarted,false);
  await mkdir(join(source,'generated'));await writeFile(join(source,'generated','tracked.txt'),'tracked');
  await git(source,'add','--force','generated/tracked.txt');await unlink(join(source,'generated','tracked.txt'));
  const conflict=await preflightCapture({source,capturePolicy:policy});
  assert.deepEqual(conflict.failure,{stage:'inventory',code:'WORKSPACE_POLICY',category:'policy'});
});
test('preflight rejects excluded nested Git with bounded public facts',async t=>{
  const {source}=await fixture(t);await mkdir(join(source,'generated','nested','.git'),{recursive:true});
  const report=await preflightCapture({source,capturePolicy:policy});
  assert.deepEqual(report.failure,{stage:'inventory',code:'WORKSPACE_NESTED_GIT',category:'nestedGit'});
  assert.equal(report.writerWorkspaceCreated,false);assert.equal(report.coverage,'partial');
  assert.ok(Buffer.byteLength(JSON.stringify(report))<1048576);
});
test('preflight options reject unknown keys and accessors without evaluating them',async()=>{
  let reads=0;
  for(const options of [null,{},[],{source:process.cwd(),extra:true},{get source(){reads++;return process.cwd();}}]){
    const report=await preflightCapture(options);
    assert.equal(report.status,'blocked');assert.equal(report.failure.category,'policy');
  }
  assert.equal(reads,0);
});

test('malformed Git commit output cannot enter the bounded public base field',async t=>{
  const {source}=await fixture(t);
  const report=await intercept(source,({original,args,options,callback})=>args.includes('HEAD^{commit}')
    ?original(process.execPath,['-e',"process.stdout.write('PRIVATE-commit-output'.repeat(60000))"],options,callback)
    :original('git',args,options,callback),()=>preflightCapture({source,capturePolicy:policy}));
  assert.equal(report.status,'blocked');assert.equal(report.base===null,true,'malformed commit must not become public base');
  assert.deepEqual(report.failure,{stage:'git',code:'WORKSPACE_GIT',category:'unknown'});
  assert.ok(Buffer.byteLength(JSON.stringify(report))<1048576);assert.doesNotMatch(JSON.stringify(report),/PRIVATE/);
});

test('included byte admission accepts exactly 512 MiB and refuses one byte over',async t=>{
  const {source}=await fixture(t),path=join(source,'note.txt'),handle=await open(path,'r+');
  try{await handle.truncate(536870912-11);}finally{await handle.close();}
  const ready=await preflightCapture({source,capturePolicy:policy});
  assert.equal(ready.status,'ready');assert.deepEqual(ready.included,{files:2,bytes:536870912});
  const grow=await open(path,'r+');try{await grow.truncate(536870912-10);}finally{await grow.close();}
  const blocked=await preflightCapture({source,capturePolicy:policy});
  assert.deepEqual(blocked.failure,{stage:'included',code:'WORKSPACE_LIMIT',category:'byteLimit'});
  assert.equal(blocked.included.bytes,536870913);
});
test('tracked inventory file count accepts 20000 entries and refuses 20001 without truncation',async t=>{
  const {source}=await fixture(t);let count=20000;
  // Controlled Git stdout models tracked, locally deleted paths, including the
  // count boundary, without creating 20,001 files or changing the real index.
  await intercept(source,({original,args,options,callback})=>args.includes('--stage')
    ?original(process.execPath,['-e',`for(let i=0;i<${count};i++)process.stdout.write('100644 ${'1'.repeat(40)} 0\\tfile-'+i+'\\0')`],options,callback)
    :original('git',args,options,callback),async()=>{
      const ready=await preflightCapture({source});assert.equal(ready.status,'ready');assert.equal(ready.included.files,0);
      count++;const blocked=await preflightCapture({source});
      assert.deepEqual(blocked.failure,{stage:'inventory',code:'WORKSPACE_LIMIT',category:'fileLimit'});
    });
});

// Keep real Git discovery, source hashing and both admission passes. Only the
// large directory stream and its corresponding metadata are controlled; these
// cases do not qualify an actual 100,000-entry filesystem or native worker.
async function withInventory(source,{excludedNames=[],directories=0},action){
  const original={opendir:filesystem.opendir,lstat:filesystem.lstat,realpath:filesystem.realpath};
  const generated=join(source,'generated'),directoryInfo=await lstat(generated),fileInfo=await lstat(join(source,'note.txt'));
  const virtual=path=>typeof path==='string'&&(path.startsWith(generated+'\\')||path.startsWith(generated+'/'))
    ?'file':typeof path==='string'&&dirname(path)===source&&/^directory-\d{6}$/.test(path.slice(source.length+1))?'directory':null;
  filesystem.lstat=async function(path,...args){
    const kind=virtual(path);return kind?(kind==='file'?fileInfo:directoryInfo):original.lstat(path,...args);
  };
  filesystem.realpath=async function(path,...args){return virtual(path)?path:original.realpath(path,...args);};
  filesystem.opendir=async function(path,...args){
    if(virtual(path)==='directory')return(async function*(){})();
    const real=await original.opendir(path,...args);
    if(path!==source&&path!==generated)return real;
    return(async function*(){
      for await(const entry of real)yield entry;
      if(path===generated)for(const name of excludedNames)yield{name};
      if(path===source)for(let i=0;i<directories;i++)yield{name:'directory-'+String(i).padStart(6,'0')};
    })();
  };syncBuiltinESMExports();
  try{return await action();}finally{Object.assign(filesystem,original);syncBuiltinESMExports();}
}
async function inventoryMutant(root,before,after){
  let code=await readFile(new URL('../engine/workspaces.mjs',import.meta.url),'utf8');
  assert.equal(code.split(before).length,2,'negative control must change exactly one guard');
  code=code.replace(before,after)
    .replace("'../foundation/client.mjs'",JSON.stringify(new URL('../foundation/client.mjs',import.meta.url).href))
    .replace("'./workspace-policy.mjs'",JSON.stringify(new URL('../engine/workspace-policy.mjs',import.meta.url).href));
  const path=join(root,'inventory-mutant.mjs');await writeFile(path,code);
  const mutant=await import(pathToFileURL(path).href);return async options=>(await mutant.inspectCaptureInputs(options)).report;
}
function inventoryRefusal(report,ready,totals){
  assert.equal(report.status,'blocked');assert.equal(report.coverage,'partial');
  assert.deepEqual(report.failure,{stage:'inventory',code:'WORKSPACE_LIMIT',category:'inventoryLimit'});
  assert.equal(report.policyHash,ready.policyHash);assert.equal(report.base,ready.base);
  // Unavailable counts are null; any observed partial counts are lower bounds.
  // Do not require a particular private enumeration-progress representation.
  for(const group of ['included','excluded']){
    assert.deepEqual(Object.keys(report[group]).sort(),Object.keys(totals[group]).sort());
    for(const [key,total] of Object.entries(totals[group])){
      const value=report[group][key];
      assert.ok(value===null||Number.isSafeInteger(value)&&value>=0&&value<=total,group+'.'+key+' must be unavailable or a truthful lower bound');
    }
  }
  assert.equal(report.inferenceStarted,false);assert.equal(report.writerWorkspaceCreated,false);
}
async function inventoryBoundary(t,{names=[],directories=0,limit,mutate,expected}){
  const {root,source}=await fixture(t);await mkdir(join(source,'generated'));
  const mutant=await inventoryMutant(root,...mutate),before=await inventory(root);
  const ready=await withInventory(source,{excludedNames:names,directories},()=>preflightCapture({source,capturePolicy:policy}));
  assert.equal(ready.status,'ready');assert.equal(ready.coverage,'complete');assert.equal(ready.failure,null);
  assert.equal(ready.limits[limit],expected);
  assert.equal(ready.inferenceStarted,false);assert.equal(ready.writerWorkspaceCreated,false);
  assert.deepEqual(ready.included,{files:2,bytes:16});
  const entries=[{name:'generated/',type:'directory',size:0,excludedBy:'generated/'},
    ...names.map(name=>({name:'generated/'+name,type:'file',size:5,excludedBy:'generated/'}))];
  assert.deepEqual(ready.excluded,{entries:entries.length,files:names.length,bytes:names.length*5,
    inventoryBytes:Buffer.byteLength(JSON.stringify({version:1,entries})+'\n')});
  assert.deepEqual(await inventory(root),before);
  if(limit==='excludedEntries')names.push('one-over');
  else if(limit==='traversalEntries')directories++;
  else names[names.length-1]+='x';
  const over={excludedNames:names,directories};
  const totals={included:ready.included,excluded:{entries:names.length+1,files:names.length,bytes:names.length*5,
    inventoryBytes:ready.excluded.inventoryBytes+(limit==='excludedEntries'?Buffer.byteLength(JSON.stringify({name:'generated/one-over',type:'file',size:5,excludedBy:'generated/'}))+1:limit==='excludedInventoryBytes'?1:0)}};
  const blocked=await withInventory(source,over,()=>preflightCapture({source,capturePolicy:policy}));
  inventoryRefusal(blocked,ready,totals);assert.deepEqual(await inventory(root),before);
  const falselyReady=await withInventory(source,over,()=>mutant({source,capturePolicy:policy}));
  assert.equal(falselyReady.status,'ready','one-over negative control must reach admission');
  assert.throws(()=>inventoryRefusal(falselyReady,ready,totals),{code:'ERR_ASSERTION'});
  assert.deepEqual(await inventory(root),before);
}
test('public preflight excludedEntries accepts exactly 100000 and refuses one over without effects',async t=>{
  await inventoryBoundary(t,{names:Array.from({length:99999},(_,i)=>'item-'+String(i).padStart(6,'0')),
    limit:'excludedEntries',expected:100000,mutate:['excluded.length>=maxExcludedEntries','excluded.length>maxExcludedEntries']});
});
test('public preflight traversalEntries accepts exactly 100000 and refuses one over without effects',async t=>{
  // The two real included files also count toward traversal; generated/ is excluded.
  await inventoryBoundary(t,{directories:99998,limit:'traversalEntries',expected:100000,
    mutate:['++traversed>maxTraversalEntries','++traversed>maxTraversalEntries+1']});
});
test('public preflight excludedInventoryBytes accepts exactly 16 MiB and refuses one byte over without effects',async t=>{
  const directory={name:'generated/',type:'directory',size:0,excludedBy:'generated/'};
  const file=name=>({name:'generated/'+name,type:'file',size:5,excludedBy:'generated/'});
  const name=i=>'item-'+String(i).padStart(6,'0')+'-';
  const target=16777216,base=Buffer.byteLength(JSON.stringify({version:1,entries:[directory]})+'\n');
  const minimum=Buffer.byteLength(JSON.stringify(file(name(0))))+1,step=minimum+128;
  const count=Math.floor((target-base)/step),names=Array.from({length:count},(_,i)=>name(i)+'x'.repeat(128));
  const remaining=target-base-count*step;
  if(remaining>=minimum)names.push(name(count)+'x'.repeat(remaining-minimum));
  else names[names.length-1]+='x'.repeat(remaining);
  assert.ok(names.every(value=>value.length<255));
  assert.equal(base+names.reduce((bytes,value)=>bytes+Buffer.byteLength(JSON.stringify(file(value)))+1,0),target);
  await inventoryBoundary(t,{names,limit:'excludedInventoryBytes',expected:target,
    mutate:['inventoryBytes>maxInventoryBytes','inventoryBytes>maxInventoryBytes+1']});
});

test('negative control calling captureInputs fails the same no-effects inventory assertion',async t=>{
  const {root,source}=await fixture(t),path=join(root,'mutant-preflight.mjs');
  let code=await readFile(new URL('../engine/capture-preflight.mjs',import.meta.url),'utf8');
  code=code.replace("{inspectCaptureInputs}","{inspectCaptureInputs,captureInputs}")
    .replace("'./workspaces.mjs'",JSON.stringify(new URL('../engine/workspaces.mjs',import.meta.url).href))
    .replace('return (await inspectCaptureInputs(options)).report;',`await captureInputs({...options,artifactsDir:${JSON.stringify(join(root,'forbidden-capture'))}});return (await inspectCaptureInputs(options)).report;`);
  assert.match(code,/forbidden-capture/);await writeFile(path,code);
  const mutant=await import(pathToFileURL(path).href),before=await inventory(root);
  await mutant.preflightCapture({source,capturePolicy:policy});
  const after=await inventory(root);assert.throws(()=>assert.deepEqual(after,before),{code:'ERR_ASSERTION'});
  assert.ok(after.some(item=>item.name.endsWith('/inputs.json')));
});
test('negative control omitting excluded comparison falsely admits same-size excluded drift',async t=>{
  const {root,source}=await fixture(t);await mkdir(join(source,'generated'));const cache=join(source,'generated','cache.bin');await writeFile(cache,'old');
  let code=await readFile(new URL('../engine/workspaces.mjs',import.meta.url),'utf8');
  code=code.replace("'../foundation/client.mjs'",JSON.stringify(new URL('../foundation/client.mjs',import.meta.url).href))
    .replace("'./workspace-policy.mjs'",JSON.stringify(new URL('../engine/workspace-policy.mjs',import.meta.url).href));
  const comparison='||frozen&&(JSON.stringify(enumeration.inventory)!==JSON.stringify(again.inventory)||enumeration.metadata!==again.metadata)';
  assert.ok(code.includes(comparison));code=code.replaceAll(comparison,'');
  const path=join(root,'mutant-workspaces.mjs');await writeFile(path,code);const mutant=await import(pathToFileURL(path).href);
  let inventories=0;
  const inspected=await intercept(source,({original,args,options,callback})=>original('git',args,options,async(...result)=>{
    if(args.includes('ls-files')&&++inventories===2){await writeFile(cache,'new');await utimes(cache,2000000000,2000000000);}callback(...result);
  }),()=>mutant.inspectCaptureInputs({source,capturePolicy:policy}));
  assert.equal(inventories,2);assert.equal(inspected.report.status,'ready');
  assert.throws(()=>assert.equal(inspected.report.failure?.category,'sourceChanged'),{code:'ERR_ASSERTION'});
});
