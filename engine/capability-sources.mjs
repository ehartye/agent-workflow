// Run-owned source packages. This preserves bytes/layout, not credentials,
// mutable managed homes, native invocation or associated-tool acceptance.
import {lstat,realpath,opendir,open,mkdir,writeFile,rename,chmod} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,parse,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fault} from '../foundation/client.mjs';
import {PLUGIN_MANIFESTS} from './parent-capabilities.mjs';

const MAX_BYTES=512*1024*1024,MAX_INDEX=8*1024*1024,MAX_ENTRIES=100000;
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const key=path=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path);
const order=(a,b)=>a<b?-1:a>b?1:0;
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>record(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const absolute=path=>typeof path==='string'&&path.length>0&&path.length<=4096&&isAbsolute(path)&&!/^[/\\]{2}/.test(path)&&!/[\u0000-\u001f\u007f]/.test(path)&&!path.replaceAll('\\','/').split('/').some(p=>p==='.'||p==='..');
const within=(root,path)=>{const suffix=relative(root,path);return suffix===''||!isAbsolute(suffix)&&suffix!=='..'&&!suffix.startsWith('../')&&!suffix.startsWith('..\\');};
const fail=()=>{throw fault('CAPABILITY_SOURCES','Run-owned capability sources are missing unsafe changed or exceed their bounded limits');};
const safe=async operation=>{try{return await operation();}catch(error){if(error?.code==='CAPABILITY_SOURCES')throw error;fail();}};
const budget=()=>({entries:0,bytes:0});
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs&&a.mode===b.mode&&a.nlink===b.nlink;

async function ordinary(path,directory){
  if(!absolute(path))fail();
  const target=resolve(path),base=parse(target).root,parts=relative(base,target).split(/[\\/]/).filter(Boolean);
  if(!parts.length)fail();let current=base;
  for(const [index,part] of parts.entries()){
    current=join(current,part);const stat=await lstat(current),leaf=index===parts.length-1;
    if(stat.isSymbolicLink()||(!leaf||directory?!stat.isDirectory():!stat.isFile()||stat.nlink!==1))fail();
    const resolved=await lstat(await realpath(current));
    if(stat.dev!==resolved.dev||stat.ino!==resolved.ino||stat.isDirectory()!==resolved.isDirectory())fail();
  }
}

async function fileIdentity(path,limits,{copyTo}={}){
  await ordinary(path,false);const input=await open(path,'r');let output;
  try{
    const before=await input.stat();
    if(!before.isFile()||before.nlink!==1||before.size>MAX_BYTES||limits.bytes+before.size>MAX_BYTES)fail();
    if(copyTo){await ordinary(dirname(copyTo),true);output=await open(copyTo,'wx',before.mode&0o777);}
    const digest=createHash('sha256'),buffer=Buffer.alloc(64*1024);let bytes=0;
    while(true){const {bytesRead}=await input.read(buffer,0,buffer.length,null);if(!bytesRead)break;bytes+=bytesRead;
      if(bytes>before.size||limits.bytes+bytes>MAX_BYTES)fail();const chunk=buffer.subarray(0,bytesRead);digest.update(chunk);
      if(output){let written=0;while(written<bytesRead){const result=await output.write(chunk,written,bytesRead-written,null);if(result.bytesWritten<=0)fail();written+=result.bytesWritten;}}
    }
    const after=await input.stat(),entry=await lstat(path);
    if(bytes!==before.size||!same(before,after)||!same(before,entry)||entry.isSymbolicLink())fail();
    await ordinary(path,false);limits.bytes+=bytes;
    if(output){await output.sync();await output.close();output=null;await chmod(copyTo,before.mode&0o777);}
    return {bytes,mode:before.mode&0o777,sha256:digest.digest('hex')};
  }finally{await output?.close();await input.close();}
}

async function inventory(root,limits){
  const files=[],directories=[],pending=[{path:root,depth:0}];
  while(pending.length){const {path,depth}=pending.pop();await ordinary(path,true);const stat=await lstat(path);
    directories.push({path:relative(root,path).replaceAll('\\','/'),mode:stat.mode&0o777});
    for await(const entry of await opendir(path)){
      if(++limits.entries>MAX_ENTRIES||/[\u0000-\u001f\u007f]/.test(entry.name)||entry.name.includes(':'))fail();
      const child=join(path,entry.name),info=await lstat(child);
      if(info.isSymbolicLink())fail();
      if(info.isDirectory()){if(depth>=32)fail();pending.push({path:child,depth:depth+1});}
      else{if(!info.isFile()||info.nlink!==1)fail();files.push({path:relative(root,child).replaceAll('\\','/'),...await fileIdentity(child,limits)});}
    }
    await ordinary(path,true);
  }
  files.sort((a,b)=>order(a.path,b.path));directories.sort((a,b)=>order(a.path,b.path));
  return {files,directories};
}

const storeFor=runDir=>{if(!absolute(runDir))fail();return join(resolve(runDir),'source-packages-v1');};
function rootsFor(manifest,parentCapabilities){
  const input=[...(parentCapabilities?.roots??[]).map(root=>root.location.path),...(manifest?.skills??[]).map(skill=>skill.root)];
  if(input.length>160||input.some(path=>!absolute(path)))fail();
  const unique=[...new Map(input.map(path=>[key(path),resolve(path)])).values()].sort((a,b)=>a.length-b.length||order(a,b));
  const roots=[];for(const path of unique)if(!roots.some(root=>within(root,path)))roots.push(path);
  if(roots.length>128)fail();return roots.sort(order);
}
const targetFor=(store,originalRoot)=>join(store,'packages',sha(key(originalRoot)));
function verifyPluginIdentities(parentCapabilities,packages){
  for(const plugin of parentCapabilities?.inventory.plugins??[]){
    if(plugin.rootId===null)continue;
    const source=parentCapabilities.roots.find(root=>root.id===plugin.rootId)?.location.path;
    if(!source||!hash(plugin.manifestSha256))fail();
    const item=packages.find(item=>within(item.originalRoot,source));if(!item)fail();
    const files=new Map(item.tree.files.map(file=>[file.path,file]));
    const manifest=PLUGIN_MANIFESTS.map(suffix=>files.get(relative(item.originalRoot,join(source,suffix)).replaceAll('\\','/'))).find(Boolean);
    if(manifest?.sha256!==plugin.manifestSha256)fail();
  }
}

export async function captureCapabilitySources({runDir,manifest=null,parentCapabilities=null}){
  return safe(async()=>{
    const store=storeFor(runDir),roots=rootsFor(manifest,parentCapabilities);
    await ordinary(resolve(runDir),true);
    if(roots.some(root=>within(root,store)||within(store,root)))fail();
    // Exclusive ownership; partial failed captures are never implicitly reused.
    await mkdir(store,{mode:0o700});await mkdir(join(store,'packages'),{mode:0o700});
    const packages=[],beforeBudget=budget(),copyBudget=budget();
    for(const originalRoot of roots){
      const tree=await inventory(originalRoot,beforeBudget),root=targetFor(store,originalRoot);
      for(const dir of [...tree.directories].sort((a,b)=>a.path.length-b.path.length))await mkdir(join(root,dir.path),{mode:0o700});
      for(const file of tree.files){const copied=await fileIdentity(join(originalRoot,file.path),copyBudget,{copyTo:join(root,file.path)});if(canonical(copied)!==canonical({bytes:file.bytes,mode:file.mode,sha256:file.sha256}))fail();}
      // Directory creation is subject to umask; establish the admitted modes.
      for(const dir of [...tree.directories].reverse())await chmod(join(root,dir.path),dir.mode);
      packages.push({originalRoot,root,tree,treeSha256:sha(canonical(tree))});
    }
    const afterBudget=budget(),retainedBudget=budget();
    for(const item of packages){
      if(canonical(await inventory(item.originalRoot,afterBudget))!==canonical(item.tree)||canonical(await inventory(item.root,retainedBudget))!==canonical(item.tree))fail();
    }
    verifyPluginIdentities(parentCapabilities,packages);
    const value={version:1,manifest:structuredClone(manifest),parentCapabilities:structuredClone(parentCapabilities),packages};
    const bytes=Buffer.from(JSON.stringify(value)+'\n');if(bytes.length>MAX_INDEX)fail();
    const pending=join(store,`index-${randomUUID()}.pending`);await writeFile(pending,bytes,{flag:'wx',mode:0o600});await ordinary(store,true);
    await rename(pending,join(store,'index.json'));
    return {version:1,sha256:sha(bytes),bytes:bytes.length};
  });
}

export async function loadCapabilitySources({runDir,descriptor}){
  return safe(async()=>{
    if(!exact(descriptor,['version','sha256','bytes'])||descriptor.version!==1||!hash(descriptor.sha256)||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<1||descriptor.bytes>MAX_INDEX)fail();
    const store=storeFor(runDir),path=join(store,'index.json');await ordinary(path,false);
    const handle=await open(path,'r');let value;
    try{const before=await handle.stat();if(before.size!==descriptor.bytes)fail();const buffer=Buffer.alloc(descriptor.bytes+1);let size=0;
      while(size<buffer.length){const {bytesRead}=await handle.read(buffer,size,buffer.length-size,null);if(!bytesRead)break;size+=bytesRead;}const bytes=buffer.subarray(0,size);
      if(bytes.length!==descriptor.bytes||sha(bytes)!==descriptor.sha256||!same(before,await handle.stat())||!same(before,await lstat(path)))fail();
      value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    }finally{await handle.close();}
    if(!exact(value,['version','manifest','parentCapabilities','packages'])||value.version!==1||!Array.isArray(value.packages)||value.packages.length>128)fail();
    const expected=rootsFor(value.manifest,value.parentCapabilities),limits=budget();
    if(value.packages.length!==expected.length)fail();
    for(const [index,item] of value.packages.entries()){
      if(!exact(item,['originalRoot','root','tree','treeSha256'])||item.originalRoot!==expected[index]||item.root!==targetFor(store,item.originalRoot)||!hash(item.treeSha256)||!exact(item.tree,['files','directories'])||sha(canonical(item.tree))!==item.treeSha256)fail();
      if(canonical(await inventory(item.root,limits))!==canonical(item.tree))fail();
    }
    verifyPluginIdentities(value.parentCapabilities,value.packages);
    // The index and all package roots must be the complete published store.
    const top=new Set(['index.json','packages']);await ordinary(store,true);
    for await(const entry of await opendir(store))if(!top.delete(entry.name))fail();
    if(top.size)fail();
    const container=join(store,'packages');await ordinary(container,true);
    const children=new Set(value.packages.map(item=>sha(key(item.originalRoot))));
    for await(const entry of await opendir(container))if(!children.delete(entry.name))fail();
    if(children.size)fail();
    const mapPath=path=>{if(!absolute(path))fail();const item=value.packages.find(item=>within(item.originalRoot,path));return item?join(item.root,relative(item.originalRoot,path)):path;};
    const executionManifest=structuredClone(value.manifest);
    if(executionManifest){
      for(const skill of executionManifest.skills){skill.path=mapPath(skill.path);skill.root=mapPath(skill.root);}
      for(const tool of executionManifest.tools){
        tool.node.path=mapPath(tool.node.path);tool.launcher.root=mapPath(tool.launcher.root);tool.launcher.path=mapPath(tool.launcher.path);
        for(const tree of [tool.runtime,tool.dependencies])tree.root=mapPath(tree.root);
        for(const stage of tool.readiness)stage.args=stage.args.map(arg=>absolute(arg)?mapPath(arg):arg);
        // Managed homes/caches are mutable state, not source-package copies.
        if(Object.values(tool.environment).some(path=>mapPath(path)!==path))fail();
      }
    }
    const parentCapabilities=structuredClone(value.parentCapabilities);
    if(parentCapabilities){
      if(parentCapabilities.coverage?.complete!==true||!hash(parentCapabilities.fingerprint))fail();
      const originFingerprint=parentCapabilities.fingerprint;
      for(const root of parentCapabilities.roots){const original=root.location.path;root.location.path=mapPath(original);if(root.location.path===original)fail();}
      for(const skill of parentCapabilities.inventory.skills)skill.path=mapPath(skill.path);
      parentCapabilities.fingerprint=sha(canonical({originFingerprint,sourcePackagesSha256:descriptor.sha256}));
      parentCapabilities.sourceRetention={originFingerprint,sourcePackagesSha256:descriptor.sha256};
    }
    return {descriptor:structuredClone(descriptor),manifest:value.manifest,executionManifest,parentCapabilities,originalParentCapabilities:value.parentCapabilities};
  });
}
