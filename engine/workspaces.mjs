import {execFile} from 'node:child_process';
import {mkdir,realpath,lstat,writeFile,copyFile,chmod,open,opendir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join,resolve,relative,dirname,basename,isAbsolute,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fault,diagnostic} from '../foundation/client.mjs';
import {validateCapturePolicy} from './workspace-policy.mjs';

const maxFiles=20000,maxBytes=512*1024*1024,maxPatch=512*1024*1024;
const maxMetadata=32*1024*1024,maxPreview=32*1024*1024;
const maxExcludedEntries=100000,maxInventoryBytes=16*1024*1024,maxTraversalEntries=100000;
const captureLimits=Object.freeze({includedFiles:maxFiles,includedBytes:maxBytes,patchBytes:maxPatch,metadataBytes:maxMetadata,previewBytes:maxPreview,
  excludedEntries:maxExcludedEntries,traversalEntries:maxTraversalEntries,excludedInventoryBytes:maxInventoryBytes});
const captureCauses=new WeakMap();
const gitFailures=new WeakSet();
function captureFault(code,message,category){
  const error=fault(code,message);captureCauses.set(error,category??({WORKSPACE_PATH:'unsafePath',WORKSPACE_CHANGED:'sourceChanged',WORKSPACE_NESTED_GIT:'nestedGit',WORKSPACE_LIMIT:'byteLimit',WORKSPACE_POLICY:'policy'}[code]??'unknown'));return error;
}
function gitFault(code,message,category){const error=captureFault(code,message,category);gitFailures.add(error);return error;}
const noHooks=join(tmpdir(),`workflow-no-hooks-${randomUUID()}`);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);
const inside=(root,path)=>{const rel=relative(root,path);return rel!== '..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);};
const names=text=>text.split('\0').filter(Boolean);
const gitEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('GIT_')));
async function boundedRead(path,limit=maxBytes){
  const handle=await open(path,'r');
  try{
    if((await handle.stat()).size>limit)throw captureFault('WORKSPACE_LIMIT','Workspace file exceeds its capture limit');
    let size=0;const chunks=[];
    while(true){const chunk=Buffer.alloc(Math.min(1024*1024,limit-size+1));const {bytesRead}=await handle.read(chunk);if(!bytesRead)break;size+=bytesRead;if(size>limit)throw captureFault('WORKSPACE_LIMIT','Workspace file grew beyond its capture limit');chunks.push(chunk.subarray(0,bytesRead));}
    return Buffer.concat(chunks,size);
  }finally{await handle.close();}
}
function git(cwd,args,{input,index,maxBuffer=maxMetadata,raw=false}={}){
  return new Promise((done,reject)=>{
    const fail=(code,message,category)=>reject(gitFault(code,message,category));
    // Retained blobs and private indexes can exceed MAX_PATH. Scope support to
    // each Windows command without changing repository or machine configuration.
    const child=execFile('git',['--no-pager','--no-replace-objects',...(process.platform==='win32'?['-c','core.longpaths=true']:[]),'-c',`core.hooksPath=${noHooks}`,'-c','core.fsmonitor=false',...args],
      {cwd,env:{...gitEnv,GIT_OPTIONAL_LOCKS:'0',...(index?{GIT_INDEX_FILE:index}:{})},windowsHide:true,timeout:20000,maxBuffer,encoding:'buffer'},
      (error,stdout)=>{
        if(error){
          // Inspect only local execFile facts, never stderr/message signatures or
          // caller-supplied WORKSPACE_* strings. The projection is privately marked.
          if(error.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER')fail('WORKSPACE_GIT_BUFFER','Git workspace output exceeded its bounded buffer','gitBuffer');
          else if(error.killed===true&&error.signal==='SIGTERM')fail('WORKSPACE_GIT_TIMEOUT','Git workspace operation exceeded its execution timeout','gitTimeout');
          else if(Number.isInteger(error.code))fail('WORKSPACE_GIT_EXIT','Git workspace operation exited unsuccessfully','gitExit');
          else if(['ENOENT','EACCES','EPERM','ENOEXEC','ENOTDIR','EAGAIN','ENOMEM'].includes(error.code)&&typeof error.syscall==='string'&&error.syscall.startsWith('spawn '))fail('WORKSPACE_GIT_LAUNCH','Git workspace process could not be launched','gitLaunch');
          else fail('WORKSPACE_GIT','Git workspace operation failed','unknown');
        }else if(raw){done(stdout);}else{
          try{done(new TextDecoder('utf-8',{fatal:true}).decode(stdout));}
          catch{fail('WORKSPACE_GIT_ENCODING','Git workspace output is not valid UTF-8','gitEncoding');}
        }
      });
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
function safeName(name){
  if(typeof name!=='string'||!name||name.includes('\\')||name.includes(':')||name.includes('\0')||isAbsolute(name)||name.split('/').some(part=>!part||part==='.'||part==='..'||part.toLowerCase()==='.git'))throw captureFault('WORKSPACE_PATH','Workspace path is unsafe');
  return name;
}
async function file(root,name,{optional=false,allowHardlinks=false}={}){
  safeName(name);let path=root;
  for(const part of name.split('/')){
    path=join(path,part);
    let entry;try{entry=await lstat(path);}catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
    if(entry.isSymbolicLink()||!(entry.isDirectory()||entry.isFile()))throw captureFault('WORKSPACE_PATH','Workspace links and special files are not supported');
  }
  const entry=await lstat(path);
  if(!entry.isFile()||!inside(root,await realpath(path)))throw captureFault('WORKSPACE_PATH','Workspace input must be a contained regular file');
  if(!allowHardlinks&&entry.nlink!==1)throw captureFault('WORKSPACE_PATH','Writer files cannot have hardlink aliases');
  return{path,size:entry.size,mode:entry.mode};
}
async function directory(path,source){
  if(!isAbsolute(path))throw captureFault('WORKSPACE_PATH','Workspace artifact directory must be absolute');
  const parent=await realpath(dirname(path));const canonical=join(parent,basename(path));
  if(source&&inside(source,canonical))throw captureFault('WORKSPACE_PATH','Artifacts must live outside the source checkout');
  await mkdir(canonical);return canonical;
}
async function list(cwd,index,{sourceInputs=false}={}){
  const entries=new Map();
  for(const record of names(await git(cwd,['ls-files','--stage','-z'],{index}))){
    const tab=record.indexOf('\t'),[mode,object,stage]=record.slice(0,tab).split(' '),name=safeName(record.slice(tab+1));
    if(tab<0||stage!=='0'||!['100644','100755'].includes(mode)||!object)throw captureFault('WORKSPACE_PATH','Conflicts, symlinks and submodules cannot be captured');
    entries.set(name,mode);
  }
  for(const name of names(await git(cwd,['ls-files','--others',...(sourceInputs?['--exclude-standard']:[]),'-z'],{index})))entries.set(safeName(name),entries.get(name)??null);
  if(entries.size>maxFiles)throw captureFault('WORKSPACE_LIMIT','Workspace exceeds the file capture limit','fileLimit');
  return entries;
}

function explicitName(name){
  safeName(name);
  if(Buffer.byteLength(name)>1024||name!==name.normalize('NFC')||/[\x00-\x1f\x7f*?<>|"~]/.test(name)
    ||name.split('/').some(part=>/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)))throw captureFault('WORKSPACE_PATH','Explicit capture path is ambiguous');
  return name;
}
const exclusion=(name,policy)=>policy.excludeDirs.find(prefix=>(name+'/').toLowerCase().startsWith(prefix.toLowerCase()))??null;
const entryIdentity=map=>JSON.stringify([...map].sort(([a],[b])=>a<b?-1:a>b?1:0));
const missingProtectedPaths=(policy,files)=>{
  const names=files.map(item=>item.name.toLowerCase());
  return policy.protectedPaths.filter(path=>path.endsWith('/')?!names.some(name=>name.startsWith(path.toLowerCase())):!names.includes(path.toLowerCase()));
};
async function trackedFiles(cwd,index,policy){
  const tracked=new Map(),folded=new Set();
  for(const record of names(await git(cwd,['ls-files','--stage','-z'],{index}))){
    const tab=record.indexOf('\t'),[mode,object,stage]=record.slice(0,tab).split(' '),name=explicitName(record.slice(tab+1)),key=name.toLowerCase();
    if(tab<0||stage!=='0'||!['100644','100755'].includes(mode)||!object||folded.has(key))throw captureFault('WORKSPACE_PATH','Conflicts, links and colliding tracked paths cannot be captured');
    if(exclusion(name,policy))throw captureFault('WORKSPACE_POLICY','Capture exclusions cannot cover tracked paths');
    tracked.set(name,mode);folded.add(key);
    if(tracked.size>maxFiles)throw captureFault('WORKSPACE_LIMIT','Workspace exceeds the file capture limit','fileLimit');
  }
  return tracked;
}
// Stream directory entries; Git ignores (including global and worker edits) have no say.
// Excluded files are inventoried by lstat only, never opened or followed.
async function explicitList(cwd,index,policy){
  const tracked=await trackedFiles(cwd,index,policy),trackedNames=new Map([...tracked.keys()].map(name=>[name.toLowerCase(),name])),entries=new Map(tracked),excluded=[],metadata=[],seen=new Set();
  let traversed=0,fileCount=0,bytes=0,inventoryBytes=Buffer.byteLength('{"version":1,"entries":[]}');
  const visit=async(name,inherited=null)=>{
    const path=name?join(cwd,name):cwd,before=await lstat(path);
    if(before.isSymbolicLink()||!before.isDirectory()||await realpath(path)!==path)throw captureFault('WORKSPACE_PATH','Capture traversal requires contained real directories');
    const directory=await opendir(path);
    for await(const entry of directory){
      if(!name&&entry.name==='.git')continue;
      if(entry.name.toLowerCase()==='.git')throw captureFault('WORKSPACE_NESTED_GIT','Nested Git administration cannot be captured');
      const relativeName=explicitName(name?name+'/'+entry.name:entry.name),key=relativeName.toLowerCase();
      if(seen.has(key))throw captureFault('WORKSPACE_PATH','Capture paths collide');seen.add(key);
      if(trackedNames.has(key)&&trackedNames.get(key)!==relativeName)throw captureFault('WORKSPACE_PATH','Tracked and live capture paths collide');
      const info=await lstat(join(cwd,relativeName));
      if(info.isSymbolicLink()||!(info.isDirectory()||info.isFile())||!inside(cwd,await realpath(join(cwd,relativeName))))throw captureFault('WORKSPACE_PATH','Capture links, reparse points and special files are not supported');
      const excludedBy=inherited??exclusion(relativeName,policy);
      if(excludedBy){
        // A prefix is a directory contract, not permission to omit a same-name file.
        if(!inherited&&!info.isDirectory())throw captureFault('WORKSPACE_PATH','An excluded directory prefix names a file');
        const item={name:relativeName+(info.isDirectory()?'/':''),type:info.isDirectory()?'directory':'file',size:info.isDirectory()?0:info.size,excludedBy};
        metadata.push({name:item.name,dev:info.dev,ino:info.ino,size:info.size,mtimeMs:info.mtimeMs,ctimeMs:info.ctimeMs,mode:info.mode,nlink:info.nlink});
        inventoryBytes+=Buffer.byteLength(JSON.stringify(item))+1;
        if(excluded.length>=maxExcludedEntries||inventoryBytes>maxInventoryBytes)throw captureFault('WORKSPACE_LIMIT','Workspace excluded inventory exceeds its entry or byte limit','inventoryLimit');
        if(!Number.isSafeInteger(item.size)||item.size<0||!Number.isSafeInteger(bytes+item.size))throw captureFault('WORKSPACE_LIMIT','Workspace excluded byte count exceeds its safe limit');
        excluded.push(item);if(info.isFile()){fileCount++;bytes+=item.size;}
      }else{
        if(++traversed>maxTraversalEntries)throw captureFault('WORKSPACE_LIMIT','Workspace directory enumeration exceeds its entry limit','inventoryLimit');
        if(info.isFile())entries.set(relativeName,tracked.get(relativeName)??null);
        if(entries.size>maxFiles)throw captureFault('WORKSPACE_LIMIT','Workspace exceeds the file capture limit','fileLimit');
      }
      if(info.isDirectory())await visit(relativeName,excludedBy);
    }
    const after=await lstat(path);
    if(before.dev!==after.dev||before.ino!==after.ino||before.mtimeMs!==after.mtimeMs||await realpath(path)!==path)throw captureFault('WORKSPACE_CHANGED','Directory changed during capture enumeration');
  };
  await visit('');excluded.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  return{entries,inventory:{version:1,entries:excluded},fileCount,bytes,metadata:JSON.stringify(metadata.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0))};
}
async function saveInventory(destination,enumeration){
  const path=join(destination,'exclusions.json'),json=JSON.stringify(enumeration.inventory)+'\n';
  if(Buffer.byteLength(json)>maxInventoryBytes)throw captureFault('WORKSPACE_LIMIT','Workspace excluded inventory exceeds its byte limit','inventoryLimit');
  await writeFile(path,json,{flag:'wx'});
  return{path,sha256:digest(json),entryCount:enumeration.inventory.entries.length,fileCount:enumeration.fileCount,bytes:enumeration.bytes};
}
async function readInventory(descriptor,destination,policy){
  if(!descriptor||Object.keys(descriptor).sort().join(',')!=='bytes,entryCount,fileCount,path,sha256'||descriptor.path!==join(destination,'exclusions.json')
    ||! /^[a-f0-9]{64}$/.test(descriptor.sha256)||!Number.isInteger(descriptor.entryCount)||descriptor.entryCount<0||descriptor.entryCount>maxExcludedEntries
    ||!Number.isInteger(descriptor.fileCount)||descriptor.fileCount<0||descriptor.fileCount>descriptor.entryCount||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<0)throw fault('WORKSPACE_ARTIFACT','Excluded inventory descriptor is invalid');
  const info=await lstat(descriptor.path);
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||await realpath(descriptor.path)!==descriptor.path)throw fault('WORKSPACE_ARTIFACT','Excluded inventory identity changed');
  const data=await boundedRead(descriptor.path,maxInventoryBytes);
  if(digest(data)!==descriptor.sha256)throw fault('WORKSPACE_ARTIFACT','Excluded inventory bytes changed');
  const inventory=JSON.parse(data.toString('utf8'));
  if(inventory.version!==1||Object.keys(inventory).sort().join(',')!=='entries,version'||!Array.isArray(inventory.entries)||inventory.entries.length!==descriptor.entryCount)throw fault('WORKSPACE_ARTIFACT','Excluded inventory is incomplete');
  let fileCount=0,bytes=0,prior='',folded=new Set();
  for(const item of inventory.entries){
    if(!item||Object.keys(item).sort().join(',')!=='excludedBy,name,size,type'||!['directory','file'].includes(item.type)||typeof item.name!=='string'
      ||item.type==='directory'&&!item.name.endsWith('/')||item.type==='file'&&item.name.endsWith('/'))throw fault('WORKSPACE_ARTIFACT','Excluded inventory entry is invalid');
    const name=explicitName(item.type==='directory'?item.name.slice(0,-1):item.name),key=name.toLowerCase();
    if(item.name<=prior||folded.has(key)||exclusion(name,policy)!==item.excludedBy||!Number.isSafeInteger(item.size)||item.size<0||item.type==='directory'&&item.size!==0)throw fault('WORKSPACE_ARTIFACT','Excluded inventory entry changed');
    prior=item.name;folded.add(key);if(item.type==='file'){fileCount++;bytes+=item.size;}
  }
  if(fileCount!==descriptor.fileCount||bytes!==descriptor.bytes||!Number.isSafeInteger(bytes))throw fault('WORKSPACE_ARTIFACT','Excluded inventory totals changed');
  return inventory.entries;
}
async function checkPolicyCapture(capture){
  const {policy,policyHash}=validateCapturePolicy(capture.policy);
  if(policyHash!==capture.policyHash||canonical(policy)!==canonical(capture.policy)||capture.inputIndex!==join(capture.artifactsDir,'private-index'))throw fault('WORKSPACE_ARTIFACT','Capture policy identity changed');
  await readInventory(capture.excludedInventory,capture.artifactsDir,policy);
  let bytes=0;const seen=new Set();
  for(const item of capture.files){
    const name=explicitName(item.name),key=name.toLowerCase();
    if(seen.has(key)||exclusion(name,policy)||!['100644','100755'].includes(item.mode)||!Number.isSafeInteger(item.size)||item.size<0||item.blobPath!==join(capture.artifactsDir,'blobs',item.sha256)||! /^[a-f0-9]{64}$/.test(item.sha256))throw fault('WORKSPACE_ARTIFACT','Included capture entry changed');
    seen.add(key);bytes+=item.size;
  }
  if(capture.files.length>maxFiles||bytes!==capture.bytes||bytes>maxBytes)throw fault('WORKSPACE_ARTIFACT','Included capture totals changed');
}
async function checkResultFiles(manifest,policy,destination){
  let bytes=0;const seen=new Set();
  for(const item of manifest.files){
    const name=explicitName(item.name),key=name.toLowerCase();
    if(seen.has(key)||exclusion(name,policy)||!['100644','100755'].includes(item.mode)||!Number.isSafeInteger(item.size)||item.size<0
      ||! /^[a-f0-9]{64}$/.test(item.sha256)||item.blobPath!==join(destination,'blobs',item.sha256))throw fault('WORKSPACE_ARTIFACT','Retained included file identity changed');
    seen.add(key);bytes+=item.size;
    const info=await lstat(item.blobPath);
    if(!info.isFile()||info.nlink!==1||await realpath(item.blobPath)!==item.blobPath)throw fault('WORKSPACE_ARTIFACT','Retained included blob identity changed');
    const data=await boundedRead(item.blobPath);
    if(data.length!==item.size||digest(data)!==item.sha256)throw fault('WORKSPACE_ARTIFACT','Retained included blob bytes changed');
  }
  if(bytes>maxBytes||manifest.bytes!==bytes||manifest.fileCount!==manifest.files.length)throw fault('WORKSPACE_ARTIFACT','Retained included totals changed');
  if(JSON.stringify(manifest.missingProtectedPaths)!==JSON.stringify(missingProtectedPaths(policy,manifest.files)))throw fault('WORKSPACE_ARTIFACT','Missing assigned-output evidence changed');
}
async function captureFiles(cwd,entries,destination,{sourceInputs=false}={}){
  await mkdir(join(destination,'blobs'));let size=0;const files=[];
  for(const [name,mode] of [...entries].sort(([a],[b])=>a<b?-1:a>b?1:0)){
    const entry=await file(cwd,name,{optional:true,allowHardlinks:sourceInputs});if(!entry)continue;
    if(entry.size>maxBytes-size)throw captureFault('WORKSPACE_LIMIT','Workspace exceeds the byte capture limit');
    const bytes=await boundedRead(entry.path,maxBytes-size);size+=bytes.length;
    if(size>maxBytes)throw captureFault('WORKSPACE_LIMIT','Workspace exceeds the byte capture limit');
    const sha256=digest(bytes),blobPath=join(destination,'blobs',sha256);
    await writeFile(blobPath,bytes,{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
    files.push({name,mode:mode??(process.platform!=='win32'&&entry.mode&0o111?'100755':'100644'),size:bytes.length,sha256,blobPath});
  }
  return{files,bytes:size};
}
async function tree(cwd,capture,artifactsDir){
  const index=join(artifactsDir,'private-index');
  await git(cwd,['read-tree','--empty'],{index});
  if(capture.files.length){
    const objects=(await git(cwd,['hash-object','-w','--no-filters','--stdin-paths'],{input:capture.files.map(item=>JSON.stringify(item.blobPath.replaceAll('\\','/'))).join('\n')+'\n'})).trim().split('\n');
    if(objects.length!==capture.files.length||objects.some(id=>! /^[0-9a-f]{40,64}$/.test(id)))throw fault('WORKSPACE_GIT','Git did not identify every captured file');
    await git(cwd,['update-index','-z','--index-info'],{index,input:capture.files.map((item,i)=>`${item.mode} ${objects[i]}\t${item.name}\0`).join('')});
  }
  return{tree:(await git(cwd,['write-tree'],{index})).trim(),index};
}
async function checkCapture(capture,{verifyBlobs=true}={}){
  if(![1,2].includes(capture.version)||capture.version===1&&(capture.policy!==undefined||capture.policyHash!==undefined||capture.excludedInventory!==undefined))throw fault('WORKSPACE_ARTIFACT','Capture version or legacy policy identity changed');
  if(capture.version===2)await checkPolicyCapture(capture);
  await checkIndex(capture);
  if(!verifyBlobs)return;
  for(const item of capture.files){
    if(capture.version===2){const entry=await lstat(item.blobPath);if(!entry.isFile()||entry.nlink!==1||await realpath(item.blobPath)!==item.blobPath)throw fault('WORKSPACE_ARTIFACT','Captured blob identity changed');}
    const bytes=await boundedRead(item.blobPath);if(bytes.length!==item.size||digest(bytes)!==item.sha256)throw fault('WORKSPACE_ARTIFACT','Captured input bytes changed');
  }
}
async function checkIndex(record){
  const info=await lstat(record.inputIndex);
  if(!info.isFile()||record.version===2&&(info.nlink!==1||await realpath(record.inputIndex)!==record.inputIndex)||digest(await boundedRead(record.inputIndex,maxMetadata))!==record.inputIndexHash)throw fault('WORKSPACE_ARTIFACT','Captured input index is missing or changed');
}
const fileIdentity=files=>JSON.stringify(files.map(({name,mode,size,sha256})=>({name,mode,size,sha256})));
async function inspectFiles(source,entries,included){
  const files=[];let bytes=0;
  for(const [name,mode] of [...entries].sort(([a],[b])=>a<b?-1:a>b?1:0)){
    const entry=await file(source,name,{optional:true,allowHardlinks:true});if(!entry)continue;
    included.files=files.length+1;included.bytes=bytes+entry.size;
    if(!Number.isSafeInteger(included.bytes)||included.bytes>maxBytes)throw captureFault('WORKSPACE_LIMIT','Workspace exceeds the byte capture limit');
    const handle=await open(entry.path,'r'),hash=createHash('sha256');let size=0;
    try{
      const before=await handle.stat();
      if(!before.isFile())throw captureFault('WORKSPACE_PATH','Workspace input must be a contained regular file');
      const chunk=Buffer.alloc(1024*1024);
      while(true){
        const {bytesRead}=await handle.read(chunk,0,Math.min(chunk.length,maxBytes-bytes-size+1));if(!bytesRead)break;
        size+=bytesRead;if(bytes+size>maxBytes)throw captureFault('WORKSPACE_LIMIT','Workspace exceeds the byte capture limit');
        hash.update(chunk.subarray(0,bytesRead));
      }
      const after=await handle.stat(),live=await lstat(entry.path);
      if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs
        ||live.dev!==after.dev||live.ino!==after.ino||live.isSymbolicLink()||size!==after.size||await realpath(entry.path)!==entry.path)
        throw captureFault('WORKSPACE_CHANGED','Source changed while inputs were inspected');
    }finally{await handle.close();}
    bytes+=size;included.bytes=bytes;
    files.push({name,mode:mode??(process.platform!=='win32'&&entry.mode&0o111?'100755':'100644'),size,sha256:hash.digest('hex')});
  }
  included.files=files.length;included.bytes=bytes;return files;
}
// Admission only: no object/index writes, artifact destinations, hooks or worktrees.
// The error is for capture's existing outer failure channel; public preflight
// returns only report and never serializes this internal cause or file inventory.
export async function inspectCaptureInputs(options){
  let stage='policy',frozen=null,source,capturePolicy;
  const report={schemaVersion:1,status:'blocked',policyHash:null,base:null,limits:{...captureLimits},included:{files:null,bytes:null},
    excluded:{entries:null,files:null,bytes:null,inventoryBytes:null},coverage:'partial',failure:null,inferenceStarted:false,writerWorkspaceCreated:false};
  try{
    if(!options||Object.getPrototypeOf(options)!==Object.prototype||!Object.hasOwn(options,'source')
      ||Reflect.ownKeys(options).some(key=>!['source','capturePolicy'].includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(options,key),'value')))
      throw captureFault('WORKSPACE_POLICY','Capture inspection requires only source and an optional capture policy');
    ({source,capturePolicy=null}=options);
    if(capturePolicy!==null){
      try{frozen=validateCapturePolicy(capturePolicy);}catch{throw captureFault('WORKSPACE_POLICY','Capture policy requires bounded, unambiguous relative paths and disjoint source ownership');}
      report.policyHash=frozen.policyHash;
    }
    stage='source';
    if(typeof source!=='string'||!isAbsolute(source))throw captureFault('WORKSPACE_PATH','Writer source must be an absolute repository root');
    source=await realpath(source);
    if(await realpath((await git(source,['rev-parse','--show-toplevel'])).trim())!==source)throw captureFault('WORKSPACE_PATH','Writer source must be the repository root');
    const base=(await git(source,['rev-parse','--verify','HEAD^{commit}'])).trim();
    if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(base))throw gitFault('WORKSPACE_GIT','Git did not identify a valid source commit','unknown');
    report.base=base;
    const common=await realpath((await git(source,['rev-parse','--path-format=absolute','--git-common-dir'])).trim());
    const roots=names(await git(source,['worktree','list','--porcelain','-z'])),main=roots.find(item=>item.startsWith('worktree '))?.slice(9);
    if(!main)throw captureFault('WORKSPACE_PATH','Cannot identify the main checkout');
    const mainRoot=await realpath(main),parent=join(dirname(mainRoot),basename(mainRoot)+'-worktrees');
    stage='inventory';const enumeration=frozen?await explicitList(source,undefined,frozen.policy):null;
    const entries=enumeration?.entries??await list(source,undefined,{sourceInputs:true});
    if(enumeration)report.excluded={entries:enumeration.inventory.entries.length,files:enumeration.fileCount,bytes:enumeration.bytes,inventoryBytes:Buffer.byteLength(JSON.stringify(enumeration.inventory)+'\n')};
    stage='included';report.included={files:0,bytes:0};const files=await inspectFiles(source,entries,report.included);
    stage='consistency';const again=frozen?await explicitList(source,undefined,frozen.policy):null;
    if(entryIdentity(entries)!==entryIdentity(again?.entries??await list(source,undefined,{sourceInputs:true}))
      ||frozen&&(JSON.stringify(enumeration.inventory)!==JSON.stringify(again.inventory)||enumeration.metadata!==again.metadata)||(await git(source,['rev-parse','HEAD'])).trim()!==base
      ||fileIdentity(files)!==fileIdentity(await inspectFiles(source,entries,{files:0,bytes:0})))throw captureFault('WORKSPACE_CHANGED','Source changed while inputs were inspected');
    report.status='ready';report.coverage=frozen?'complete':'partial';
    return{report,source,base,common,parent,frozen,entries,enumeration,files};
  }catch(error){
    report.failure={stage:gitFailures.has(error)?'git':stage,code:captureCauses.has(error)?error.code:'CHECK_FAILED',category:captureCauses.get(error)??'unknown'};
    return{report,error,captureStage:({policy:'repository',source:'repository',included:'files',excluded:'inventory',git:'repository'}[stage]??stage)};
  }
}
export async function captureInputs({source,artifactsDir,capturePolicy}){
  let stage='repository';
  try{
    // Existing capture callers select legacy admission by omission. The public
    // read-only preflight has its separately specified null default.
    if(capturePolicy===null)validateCapturePolicy(capturePolicy);
    const inspected=await inspectCaptureInputs({source,capturePolicy:capturePolicy??null});
    if(inspected.error){stage=inspected.captureStage;throw inspected.error;}
    const {frozen,base,common,parent,entries,enumeration}=inspected;source=inspected.source;
    await mkdir(parent,{recursive:true});
    if((await lstat(parent)).isSymbolicLink()||await realpath(dirname(parent))!==dirname(parent))throw captureFault('WORKSPACE_PATH','Worktrees require a real sibling directory');
    artifactsDir=await directory(artifactsDir,source);
    stage='files';const captured=await captureFiles(source,entries,artifactsDir,{sourceInputs:true});
    // Detect edits or index changes during capture before blessing a coherent input set.
    stage='consistency';const again=frozen?await explicitList(source,undefined,frozen.policy):null;
    if(entryIdentity(entries)!==entryIdentity(again?.entries??await list(source,undefined,{sourceInputs:true}))
      ||frozen&&(JSON.stringify(enumeration.inventory)!==JSON.stringify(again.inventory)||enumeration.metadata!==again.metadata)||(await git(source,['rev-parse','HEAD'])).trim()!==base
      ||fileIdentity(inspected.files)!==fileIdentity(captured.files))throw captureFault('WORKSPACE_CHANGED','Source changed while inputs were captured');
    const capturedNames=new Set(captured.files.map(item=>item.name));
    for(const name of entries.keys())if(!capturedNames.has(name)&&await file(source,name,{optional:true,allowHardlinks:true}))throw captureFault('WORKSPACE_CHANGED','Source changed while inputs were captured');
    for(const item of captured.files)if(digest(await boundedRead((await file(source,item.name,{allowHardlinks:true})).path))!==item.sha256)throw captureFault('WORKSPACE_CHANGED','Source changed while inputs were captured');
    stage='tree';const built=await tree(source,captured,artifactsDir);
    const result={version:frozen?2:1,source,common,base,parent:await realpath(parent),artifactsDir,inputTree:built.tree,inputIndex:built.index,inputIndexHash:digest(await boundedRead(built.index,maxMetadata)),...captured,
      ...(frozen?{...frozen,excludedInventory:await saveInventory(artifactsDir,enumeration)}:{})};
    stage='manifest';const manifestPath=join(artifactsDir,'inputs.json'),manifest=JSON.stringify(result)+'\n';
    await writeFile(manifestPath,manifest,{flag:'wx'});return{...result,manifestPath,manifestHash:digest(manifest)};
  }catch(error){throw Object.assign(fault('WORKSPACE_INPUT','Could not capture isolated writer inputs'),{cause:error,captureFailure:{stage,cause:diagnostic(error)}});}
}
export function describeInputs(inputs){
  return{...(inputs.version===2?{version:2}:{}),manifestPath:inputs.manifestPath,manifestHash:inputs.manifestHash,source:inputs.source,base:inputs.base,inputTree:inputs.inputTree,
    ...(inputs.version===2?{policyHash:inputs.policyHash,excludedInventory:{...inputs.excludedInventory}}:{})};
}
async function readInputs(record,{verifyBlobs=true}={}){
  try{
    const bytes=await boundedRead(record.manifestPath,maxMetadata);
    if(digest(bytes)!==record.manifestHash)throw Error('manifest');
    const inputs=JSON.parse(bytes.toString('utf8'));
    if(![1,2].includes(inputs.version)||inputs.source!==record.source||inputs.base!==record.base||inputs.inputTree!==record.inputTree||!Array.isArray(inputs.files)||inputs.files.length>maxFiles||inputs.files.some(item=>! /^[a-f0-9]{64}$/.test(item.sha256)||item.blobPath!==join(inputs.artifactsDir,'blobs',item.sha256)))throw Error('inputs');
    if(inputs.version===2&&(Object.keys(record).sort().join(',')!=='base,excludedInventory,inputTree,manifestHash,manifestPath,policyHash,source,version'
      ||record.version!==2||record.policyHash!==inputs.policyHash||canonical(record.excludedInventory)!==canonical(inputs.excludedInventory)
      ||record.manifestPath!==join(inputs.artifactsDir,'inputs.json')||await realpath(record.manifestPath)!==record.manifestPath||!(await lstat(record.manifestPath)).isFile()))throw Error('input identity');
    if(inputs.version===1&&(record.version!=null&&record.version!==1||record.policyHash!==undefined||record.excludedInventory!==undefined))throw Error('legacy policy reinterpretation');
    await checkCapture(inputs,{verifyBlobs});if(inputs.version===2)inputs.policy=validateCapturePolicy(inputs.policy).policy;return{...inputs,...record};
  }catch(error){throw Object.assign(fault('WORKSPACE_ARTIFACT','Captured run inputs are missing or changed'),{cause:error});}
}
export async function loadInputs(record){return readInputs(record);}
export async function createWorkspace({inputs,artifactsDir}){
  let cwd;
  try{
    if(inputs.version===2){
      const retained=await loadInputs(describeInputs(inputs));
      for(const key of ['version','source','common','base','parent','artifactsDir','inputTree','inputIndex','inputIndexHash','files','bytes','policy','policyHash','excludedInventory'])
        if(canonical(inputs[key])!==canonical(retained[key]))throw fault('WORKSPACE_ARTIFACT','Supplied input capture differs from its retained manifest');
      inputs=retained;
    }else await checkCapture(inputs);
    artifactsDir=await directory(artifactsDir,inputs.source);
    if(await realpath(inputs.parent)!==inputs.parent||(await lstat(inputs.parent)).isSymbolicLink())throw captureFault('WORKSPACE_PATH','Worktree parent changed');
    cwd=join(inputs.parent,'workflow-'+randomUUID());
    await git(inputs.source,['worktree','add','--no-checkout','--detach',cwd,inputs.base]);
    for(const item of inputs.files){
      const target=join(cwd,safeName(item.name));await mkdir(dirname(target),{recursive:true});await copyFile(item.blobPath,target);if(process.platform!=='win32')await chmod(target,item.mode==='100755'?0o755:0o644);
    }
    await git(cwd,['read-tree',inputs.inputTree]);
    const identity={version:inputs.version,cwd:await realpath(cwd),source:inputs.source,common:inputs.common,base:inputs.base,inputTree:inputs.inputTree,artifactsDir,inputIndex:inputs.inputIndex,inputIndexHash:inputs.inputIndexHash,gitPointerHash:digest(await boundedRead(join(cwd,'.git'),8192)),
      ...(inputs.version===2?{inputs:describeInputs(inputs),policyHash:inputs.policyHash}:{})};
    await writeFile(join(artifactsDir,'workspace.json'),JSON.stringify(identity)+'\n',{flag:'wx'});return identity;
  }catch(error){throw Object.assign(fault('WORKSPACE_CREATE','Could not establish an isolated writer workspace'),{cause:error,...(cwd?{workspacePath:cwd}:{})});}
}
export async function collectWorkspace(workspace){
  let stage='identity';
  try{
    const inputs=await verifyIdentity(workspace);
    // Read against the immutable input index, independent of worker staging.
    stage='destination';
    const capturedDir=await directory(join(workspace.artifactsDir,'result'),workspace.cwd);
    stage='inventory';
    const enumeration=inputs?await explicitList(workspace.cwd,workspace.inputIndex,inputs.policy):null;
    const entries=enumeration?.entries??await list(workspace.cwd,workspace.inputIndex);
    stage='files';
    const captured=await captureFiles(workspace.cwd,entries,capturedDir);
    if(enumeration){
      const again=await explicitList(workspace.cwd,workspace.inputIndex,inputs.policy);
      if(entryIdentity(entries)!==entryIdentity(again.entries)||JSON.stringify(enumeration.inventory)!==JSON.stringify(again.inventory)||enumeration.metadata!==again.metadata)throw captureFault('WORKSPACE_CHANGED','Workspace changed while outputs were captured');
      const capturedNames=new Set(captured.files.map(item=>item.name));
      for(const name of entries.keys())if(!capturedNames.has(name)&&await file(workspace.cwd,name,{optional:true}))throw captureFault('WORKSPACE_CHANGED','Workspace changed while outputs were captured');
      for(const item of captured.files)if(digest(await boundedRead((await file(workspace.cwd,item.name)).path))!==item.sha256)throw captureFault('WORKSPACE_CHANGED','Workspace changed while outputs were captured');
    }
    stage='tree';
    const built=await tree(workspace.cwd,captured,capturedDir);
    stage='diff';
    const diffArgs=['diff','--binary','--no-ext-diff','--no-textconv','--no-renames','--no-color','--src-prefix=a/','--dst-prefix=b/'];
    // Git text hunks may contain legacy encodings. Retain their bytes exactly;
    // path listings and object identities still require strict UTF-8 decoding.
    const patch=await git(workspace.cwd,[...diffArgs,workspace.inputTree,built.tree,'--'],{maxBuffer:maxPatch,raw:true});
    const basePatch=await git(workspace.cwd,[...diffArgs,workspace.base,built.tree,'--'],{maxBuffer:maxPatch,raw:true});
    const changedFiles=names(await git(workspace.cwd,['diff','--name-only','-z','--no-ext-diff','--no-textconv','--no-renames',workspace.inputTree,built.tree,'--']));
    stage='persist';
    const patchPath=join(capturedDir,'changes.patch'),basePatchPath=join(capturedDir,'from-base.patch');
    await writeFile(patchPath,patch,{flag:'wx'});await writeFile(basePatchPath,basePatch,{flag:'wx'});
    const result={...workspace,resultTree:built.tree,changedFiles,patchPath,basePatchPath,patchHash:digest(patch),basePatchHash:digest(basePatch),bytes:captured.bytes,fileCount:captured.files.length,
      ...(enumeration?{excludedInventory:await saveInventory(capturedDir,enumeration),missingProtectedPaths:missingProtectedPaths(inputs.policy,captured.files)}:{})};
    const manifestPath=join(capturedDir,'manifest.json'),manifest=JSON.stringify({...result,files:captured.files})+'\n';
    await writeFile(manifestPath,manifest,{flag:'wx'});return{...result,manifestPath,manifestHash:digest(manifest)};
  }catch(error){throw Object.assign(fault('WORKSPACE_ARTIFACT','Could not retain a complete workspace diff; workspace remains on disk'),{cause:error,captureFailure:{stage,cause:diagnostic(error)},workspacePath:workspace.cwd});}
}
async function verifyIdentity(workspace,{verifyBlobs=true}={}){
  let inputs=null;
  if(workspace.version===2){
    try{
      inputs=await readInputs(workspace.inputs,{verifyBlobs});
      for(const key of ['source','common','base','inputTree','inputIndex','inputIndexHash','policyHash'])if(workspace[key]!==inputs[key])throw Error('input identity');
      const path=join(workspace.artifactsDir,'workspace.json'),info=await lstat(path);
      if(!info.isFile()||info.nlink!==1||await realpath(path)!==path)throw Error('workspace manifest identity');
      const bytes=await boundedRead(path,maxMetadata),identity=JSON.parse(bytes.toString('utf8'));
      for(const key of ['version','cwd','source','common','base','inputTree','artifactsDir','inputIndex','inputIndexHash','gitPointerHash','inputs','policyHash'])
        if(canonical(identity[key])!==canonical(workspace[key]))throw Error('workspace identity');
    }catch(error){throw Object.assign(fault('WORKSPACE_ARTIFACT','Workspace capture policy or input identity changed'),{cause:error});}
  }else if(workspace.version!==1||workspace.policyHash!==undefined||workspace.inputs!==undefined)throw fault('WORKSPACE_ARTIFACT','Workspace version or legacy identity changed');
  await checkIndex(workspace);
  if(await realpath(workspace.cwd)!==workspace.cwd||(await lstat(workspace.cwd)).isSymbolicLink()||(await lstat(join(workspace.cwd,'.git'))).isSymbolicLink()||digest(await boundedRead(join(workspace.cwd,'.git'),8192))!==workspace.gitPointerHash)throw captureFault('WORKSPACE_PATH','Worker workspace identity changed');
  if(await realpath((await git(workspace.cwd,['rev-parse','--path-format=absolute','--git-common-dir'])).trim())!==workspace.common)throw captureFault('WORKSPACE_PATH','Worker Git metadata changed');
  return inputs;
}
export async function assertWorkspaceReady(workspace){
  const inputs=await verifyIdentity(workspace);
  const entries=inputs?(await explicitList(workspace.cwd,workspace.inputIndex,inputs.policy)).entries:await list(workspace.cwd,workspace.inputIndex);
  const expected=inputs?new Map(inputs.files.map(item=>[item.name,item])):null;
  for(const name of entries.keys()){
    const current=await file(workspace.cwd,name,{optional:true});
    if(expected){
      const recorded=expected.get(name);
      if(!current||!recorded||digest(await boundedRead(current.path))!==recorded.sha256)throw fault('WORKSPACE_ARTIFACT','Writer admission bytes differ from the captured inputs');
      expected.delete(name);
    }
  }
  if(expected?.size)throw fault('WORKSPACE_ARTIFACT','Writer admission is missing captured inputs');
  return true;
}
export async function verifyWorkspace(workspace){
  try{
    const inputs=await verifyIdentity(workspace);
    if(inputs&&(workspace.patchPath!==join(workspace.artifactsDir,'result','changes.patch')||workspace.basePatchPath!==join(workspace.artifactsDir,'result','from-base.patch')
      ||workspace.manifestPath!==join(workspace.artifactsDir,'result','manifest.json')))throw Error('result artifact paths');
    for(const [path,hash] of [[workspace.patchPath,workspace.patchHash],[workspace.basePatchPath,workspace.basePatchHash],[workspace.manifestPath,workspace.manifestHash]]){
      const info=await lstat(path);
      if(!inside(workspace.artifactsDir,path)||info.isSymbolicLink()||inputs&&(!info.isFile()||info.nlink!==1||await realpath(path)!==path)||digest(await boundedRead(path,path===workspace.manifestPath?maxMetadata:maxPatch))!==hash)throw Error('artifact');
    }
    const manifest=JSON.parse((await boundedRead(workspace.manifestPath,maxMetadata)).toString('utf8'));
    if(inputs){
      for(const key of ['version','cwd','source','common','base','inputTree','artifactsDir','inputIndex','inputIndexHash','gitPointerHash','inputs','policyHash','excludedInventory','missingProtectedPaths','resultTree','changedFiles','patchPath','basePatchPath','patchHash','basePatchHash','bytes','fileCount'])
        if(canonical(manifest[key])!==canonical(workspace[key]))throw Error('result identity');
      if(workspace.manifestPath!==join(workspace.artifactsDir,'result','manifest.json')||!Array.isArray(manifest.files)||manifest.files.length>maxFiles)throw Error('result manifest');
      await readInventory(workspace.excludedInventory,join(workspace.artifactsDir,'result'),inputs.policy);
      await checkResultFiles(manifest,inputs.policy,join(workspace.artifactsDir,'result'));
    }
    const expected=new Map(manifest.files.map(item=>[item.name,item]));
    const entries=inputs?(await explicitList(workspace.cwd,workspace.inputIndex,inputs.policy)).entries:await list(workspace.cwd,workspace.inputIndex);
    for(const name of entries.keys()){
      const current=await file(workspace.cwd,name,{optional:true});if(!current)continue;
      const recorded=expected.get(name);if(!recorded||digest(await boundedRead(current.path))!==recorded.sha256)throw Error('workspace bytes');expected.delete(name);
    }
    if(expected.size)throw Error('missing workspace files');
    return true;
  }catch(error){throw Object.assign(fault('WORKSPACE_ARTIFACT','Retained workspace or diff is missing or changed'),{cause:error});}
}
export async function readWorkspaceExclusions(workspace,options={}){
  if(!options||Object.getPrototypeOf(options)!==Object.prototype)throw fault('WORKSPACE_INPUT','Exclusion paging requires a JSON options object');
  const {stage='inputs',after=0,limit=100}=options;
  if(Object.keys(options).some(key=>!['stage','after','limit'].includes(key))||!['inputs','outputs'].includes(stage)
    ||!Number.isInteger(after)||after<0||!Number.isInteger(limit)||limit<1||limit>100||workspace?.version!==2)throw fault('WORKSPACE_INPUT','Choose a version 2 capture stage and bounded exclusion page');
  try{
    // Metadata paging does not certify included payloads; admission/replay do that.
    const inputs=await verifyIdentity(workspace,{verifyBlobs:false});let descriptor=inputs.excludedInventory,destination=inputs.artifactsDir;
    if(stage==='outputs'){
      if(workspace.manifestPath!==join(workspace.artifactsDir,'result','manifest.json'))throw Error('missing output capture');
      const info=await lstat(workspace.manifestPath);
      if(!info.isFile()||info.isSymbolicLink()||await realpath(workspace.manifestPath)!==workspace.manifestPath)throw Error('manifest identity');
      const data=await boundedRead(workspace.manifestPath,maxMetadata);
      if(digest(data)!==workspace.manifestHash)throw Error('manifest hash');
      const manifest=JSON.parse(data.toString('utf8'));
      if(manifest.policyHash!==inputs.policyHash||canonical(manifest.inputs)!==canonical(workspace.inputs)
        ||canonical(manifest.excludedInventory)!==canonical(workspace.excludedInventory))throw Error('output inventory identity');
      descriptor=manifest.excludedInventory;destination=join(workspace.artifactsDir,'result');
    }
    const entries=await readInventory(descriptor,destination,inputs.policy);
    if(after>entries.length)throw fault('WORKSPACE_INPUT','Exclusion cursor is outside the retained inventory');
    return{policyHash:inputs.policyHash,inventoryHash:descriptor.sha256,entries:entries.slice(after,after+limit),entryCount:descriptor.entryCount,
      fileCount:descriptor.fileCount,bytes:descriptor.bytes,nextAfter:after+limit<entries.length?after+limit:null};
  }catch(error){if(error.code==='WORKSPACE_INPUT')throw error;throw Object.assign(fault('WORKSPACE_ARTIFACT','Workspace excluded inventory is missing or changed'),{cause:error});}
}
export async function readWorkspacePatch(workspace,{basis='inputs',previewBytes=maxPreview}={}){
  if(!['inputs','base'].includes(basis)||!Number.isInteger(previewBytes)||previewBytes<1||previewBytes>maxPreview)throw fault('PATCH_INPUT','Choose an inputs or base patch and a bounded preview');
  if(!workspace?.patchPath)throw fault('MONITOR_MISSING','A finalized workspace diff is not available');
  try{
    const path=basis==='base'?workspace.basePatchPath:workspace.patchPath,sha256=basis==='base'?workspace.basePatchHash:workspace.patchHash;
    if(!inside(workspace.artifactsDir,path)||!(await lstat(path)).isFile())throw Error('path');
    const bytes=await boundedRead(path,maxPatch);
    if(digest(bytes)!==sha256)throw Error('hash');
    // TextDecoder's streaming mode omits an incomplete UTF-8 character at the preview boundary.
    const truncated=bytes.length>previewBytes;
    let patch='',previewUnavailable;
    try{patch=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,previewBytes),{stream:truncated});}
    catch{previewUnavailable='non-utf8';}
    return{basis,patch,sha256,bytes:bytes.length,truncated,cwd:workspace.cwd,changedFiles:workspace.changedFiles,...(previewUnavailable?{previewUnavailable}:{})};
  }catch(error){throw Object.assign(fault('WORKSPACE_ARTIFACT','Saved patch is missing or changed'),{cause:error});}
}
