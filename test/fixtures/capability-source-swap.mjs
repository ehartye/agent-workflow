// Real filesystem race at a deterministic I/O boundary, not a native proof.
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const directory=await fs.mkdtemp(join(tmpdir(),'workflow-source-swap-'));
const source=join(directory,'source'),runDir=join(directory,'run'),outside=join(directory,'outside');
const digest=value=>createHash('sha256').update(value).digest('hex');
const sourceKey=process.platform==='win32'?resolve(source).toLowerCase():resolve(source);
const target=join(runDir,'source-packages-v1','packages',digest(sourceKey));
const file=join(source,'a','b','owned.txt');
await fs.mkdir(join(source,'a','b'),{recursive:true});await fs.mkdir(join(source,'skills','selected'),{recursive:true});await fs.mkdir(runDir);await fs.mkdir(outside);
await fs.writeFile(file,'owned source');const body='---\nname: selected\n---\nSource';const path=join(source,'skills','selected','SKILL.md');await fs.writeFile(path,body);
const nativeOpen=fs.open;let reads=0,swapped=false,error;
fs.open=async function(path,flags,...args){
  if(resolve(String(path))===resolve(file)&&flags==='r'&&++reads===2){
    const from=join(target,'a'),to=join(outside,'moved-a');
    // Both exact absolute targets are inside the owned test directory.
    for(const candidate of [from,to]){const suffix=relative(directory,resolve(candidate));assert.ok(suffix&&!suffix.startsWith('..'));}
    assert.equal(resolve(await fs.realpath(from)),resolve(from));assert.equal((await fs.lstat(from)).isSymbolicLink(),false);
    await fs.rename(from,to);await fs.symlink(to,from,process.platform==='win32'?'junction':'dir');swapped=true;
  }
  return nativeOpen(path,flags,...args);
};
syncBuiltinESMExports();
try{
  const {captureCapabilitySources}=await import('../../engine/capability-sources.mjs');
  await captureCapabilitySources({runDir,manifest:{version:1,skills:[{id:'selected',name:'selected',root:source,path,sha256:digest(body),references:[]}],tools:[]}});
}catch(failure){error=failure.code;}
finally{fs.open=nativeOpen;syncBuiltinESMExports();}
const outsideCreated=await fs.lstat(join(outside,'moved-a','b','owned.txt')).then(()=>true,failure=>{if(failure.code==='ENOENT')return false;throw failure;});
console.log(JSON.stringify({swapped,error,outsideCreated}));
assert.equal(relative(await fs.realpath(tmpdir()),directory).startsWith('..'),false);await fs.rm(directory,{recursive:true,force:true});
