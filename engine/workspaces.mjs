import {execFile} from 'node:child_process';
import {mkdir,realpath,lstat,readFile,writeFile,copyFile,chmod,open} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join,resolve,relative,dirname,basename,isAbsolute,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fault,diagnostic} from '../foundation/client.mjs';

const maxFiles=20000,maxBytes=128*1024*1024,maxPatch=32*1024*1024;
const noHooks=join(tmpdir(),`workflow-no-hooks-${randomUUID()}`);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(root,path)=>{const rel=relative(root,path);return rel!== '..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);};
const names=text=>text.split('\0').filter(Boolean);
const gitEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('GIT_')));
async function boundedRead(path,limit=maxBytes){
  const handle=await open(path,'r');
  try{
    if((await handle.stat()).size>limit)throw fault('WORKSPACE_LIMIT','Workspace file exceeds its capture limit');
    let size=0;const chunks=[];
    while(true){const chunk=Buffer.alloc(Math.min(1024*1024,limit-size+1));const {bytesRead}=await handle.read(chunk);if(!bytesRead)break;size+=bytesRead;if(size>limit)throw fault('WORKSPACE_LIMIT','Workspace file grew beyond its capture limit');chunks.push(chunk.subarray(0,bytesRead));}
    return Buffer.concat(chunks,size);
  }finally{await handle.close();}
}
function git(cwd,args,{input,index,maxBuffer=maxPatch}={}){
  return new Promise((done,reject)=>{
    const child=execFile('git',['--no-pager','--no-replace-objects','-c',`core.hooksPath=${noHooks}`,'-c','core.fsmonitor=false',...args],
      {cwd,env:{...gitEnv,...(index?{GIT_INDEX_FILE:index}:{})},windowsHide:true,timeout:20000,maxBuffer,encoding:'buffer'},
      (error,stdout)=>{if(error)reject(fault('WORKSPACE_GIT','Git workspace operation failed'));else{try{done(new TextDecoder('utf-8',{fatal:true}).decode(stdout));}catch{reject(fault('WORKSPACE_GIT','Git paths or output are not valid UTF-8'));}}});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
function safeName(name){
  if(typeof name!=='string'||!name||name.includes('\\')||name.includes(':')||name.includes('\0')||isAbsolute(name)||name.split('/').some(part=>!part||part==='.'||part==='..'||part.toLowerCase()==='.git'))throw fault('WORKSPACE_PATH','Workspace path is unsafe');
  return name;
}
async function file(root,name,{optional=false,allowHardlinks=false}={}){
  safeName(name);let path=root;
  for(const part of name.split('/')){
    path=join(path,part);
    let entry;try{entry=await lstat(path);}catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
    if(entry.isSymbolicLink()||!(entry.isDirectory()||entry.isFile()))throw fault('WORKSPACE_PATH','Workspace links and special files are not supported');
  }
  const entry=await lstat(path);
  if(!entry.isFile()||!inside(root,await realpath(path)))throw fault('WORKSPACE_PATH','Workspace input must be a contained regular file');
  if(!allowHardlinks&&entry.nlink!==1)throw fault('WORKSPACE_PATH','Writer files cannot have hardlink aliases');
  return{path,size:entry.size,mode:entry.mode};
}
async function directory(path,source){
  if(!isAbsolute(path))throw fault('WORKSPACE_PATH','Workspace artifact directory must be absolute');
  const parent=await realpath(dirname(path));const canonical=join(parent,basename(path));
  if(source&&inside(source,canonical))throw fault('WORKSPACE_PATH','Artifacts must live outside the source checkout');
  await mkdir(canonical);return canonical;
}
async function list(cwd,index,{sourceInputs=false}={}){
  const entries=new Map();
  for(const record of names(await git(cwd,['ls-files','--stage','-z'],{index}))){
    const tab=record.indexOf('\t'),[mode,object,stage]=record.slice(0,tab).split(' '),name=safeName(record.slice(tab+1));
    if(tab<0||stage!=='0'||!['100644','100755'].includes(mode)||!object)throw fault('WORKSPACE_PATH','Conflicts, symlinks and submodules cannot be captured');
    entries.set(name,mode);
  }
  for(const name of names(await git(cwd,['ls-files','--others',...(sourceInputs?['--exclude-standard']:[]),'-z'],{index})))entries.set(safeName(name),entries.get(name)??null);
  if(entries.size>maxFiles)throw fault('WORKSPACE_LIMIT','Workspace exceeds the file capture limit');
  return entries;
}
async function captureFiles(cwd,entries,destination,{sourceInputs=false}={}){
  await mkdir(join(destination,'blobs'));let size=0;const files=[];
  for(const [name,mode] of [...entries].sort(([a],[b])=>a<b?-1:a>b?1:0)){
    const entry=await file(cwd,name,{optional:true,allowHardlinks:sourceInputs});if(!entry)continue;
    if(entry.size>maxBytes-size)throw fault('WORKSPACE_LIMIT','Workspace exceeds the byte capture limit');
    const bytes=await boundedRead(entry.path,maxBytes-size);size+=bytes.length;
    if(size>maxBytes)throw fault('WORKSPACE_LIMIT','Workspace exceeds the byte capture limit');
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
async function checkCapture(capture){
  await checkIndex(capture);
  for(const item of capture.files){
    const bytes=await boundedRead(item.blobPath);if(bytes.length!==item.size||digest(bytes)!==item.sha256)throw fault('WORKSPACE_ARTIFACT','Captured input bytes changed');
  }
}
async function checkIndex(record){
  if(!(await lstat(record.inputIndex)).isFile()||digest(await boundedRead(record.inputIndex,maxPatch))!==record.inputIndexHash)throw fault('WORKSPACE_ARTIFACT','Captured input index is missing or changed');
}
export async function captureInputs({source,artifactsDir}){
  try{
    source=await realpath(source);
    if(await realpath((await git(source,['rev-parse','--show-toplevel'])).trim())!==source)throw fault('WORKSPACE_PATH','Writer source must be the repository root');
    const base=(await git(source,['rev-parse','--verify','HEAD^{commit}'])).trim();
    const common=await realpath((await git(source,['rev-parse','--path-format=absolute','--git-common-dir'])).trim());
    const roots=names(await git(source,['worktree','list','--porcelain','-z']));
    const main=roots.find(item=>item.startsWith('worktree '))?.slice(9);
    if(!main)throw fault('WORKSPACE_PATH','Cannot identify the main checkout');
    const mainRoot=await realpath(main),parent=join(dirname(mainRoot),basename(mainRoot)+'-worktrees');
    await mkdir(parent,{recursive:true});
    if((await lstat(parent)).isSymbolicLink()||await realpath(dirname(parent))!==dirname(mainRoot))throw fault('WORKSPACE_PATH','Worktrees require a real sibling directory');
    artifactsDir=await directory(artifactsDir,source);
    const entries=await list(source,undefined,{sourceInputs:true});const captured=await captureFiles(source,entries,artifactsDir,{sourceInputs:true});
    // Detect edits or index changes during capture before blessing a coherent input set.
    if(JSON.stringify([...entries])!==JSON.stringify([...(await list(source,undefined,{sourceInputs:true}))])||(await git(source,['rev-parse','HEAD'])).trim()!==base)throw fault('WORKSPACE_CHANGED','Source changed while inputs were captured');
    const capturedNames=new Set(captured.files.map(item=>item.name));
    for(const name of entries.keys())if(!capturedNames.has(name)&&await file(source,name,{optional:true,allowHardlinks:true}))throw fault('WORKSPACE_CHANGED','Source changed while inputs were captured');
    for(const item of captured.files)if(digest(await boundedRead((await file(source,item.name,{allowHardlinks:true})).path))!==item.sha256)throw fault('WORKSPACE_CHANGED','Source changed while inputs were captured');
    const built=await tree(source,captured,artifactsDir);
    const result={version:1,source,common,base,parent:await realpath(parent),artifactsDir,inputTree:built.tree,inputIndex:built.index,inputIndexHash:digest(await boundedRead(built.index,maxPatch)),...captured};
    const manifestPath=join(artifactsDir,'inputs.json'),manifest=JSON.stringify(result)+'\n';
    await writeFile(manifestPath,manifest,{flag:'wx'});return{...result,manifestPath,manifestHash:digest(manifest)};
  }catch(error){throw Object.assign(fault('WORKSPACE_INPUT','Could not capture isolated writer inputs'),{cause:error});}
}
export function describeInputs(inputs){
  return{manifestPath:inputs.manifestPath,manifestHash:inputs.manifestHash,source:inputs.source,base:inputs.base,inputTree:inputs.inputTree};
}
export async function loadInputs(record){
  try{
    const bytes=await boundedRead(record.manifestPath,maxPatch);
    if(digest(bytes)!==record.manifestHash)throw Error('manifest');
    const inputs=JSON.parse(bytes.toString('utf8'));
    if(inputs.version!==1||inputs.source!==record.source||inputs.base!==record.base||inputs.inputTree!==record.inputTree||!Array.isArray(inputs.files)||inputs.files.length>maxFiles||inputs.files.some(item=>! /^[a-f0-9]{64}$/.test(item.sha256)||item.blobPath!==join(inputs.artifactsDir,'blobs',item.sha256)))throw Error('inputs');
    await checkCapture(inputs);return{...inputs,...record};
  }catch(error){throw Object.assign(fault('WORKSPACE_ARTIFACT','Captured run inputs are missing or changed'),{cause:error});}
}
export async function createWorkspace({inputs,artifactsDir}){
  let cwd;
  try{
    await checkCapture(inputs);artifactsDir=await directory(artifactsDir,inputs.source);
    if(await realpath(inputs.parent)!==inputs.parent||(await lstat(inputs.parent)).isSymbolicLink())throw fault('WORKSPACE_PATH','Worktree parent changed');
    cwd=join(inputs.parent,'workflow-'+randomUUID());
    await git(inputs.source,['worktree','add','--no-checkout','--detach',cwd,inputs.base]);
    for(const item of inputs.files){
      const target=join(cwd,safeName(item.name));await mkdir(dirname(target),{recursive:true});await copyFile(item.blobPath,target);if(process.platform!=='win32')await chmod(target,item.mode==='100755'?0o755:0o644);
    }
    await git(cwd,['read-tree',inputs.inputTree]);
    const identity={version:1,cwd:await realpath(cwd),source:inputs.source,common:inputs.common,base:inputs.base,inputTree:inputs.inputTree,artifactsDir,inputIndex:inputs.inputIndex,inputIndexHash:inputs.inputIndexHash,gitPointerHash:digest(await boundedRead(join(cwd,'.git'),8192))};
    await writeFile(join(artifactsDir,'workspace.json'),JSON.stringify(identity)+'\n',{flag:'wx'});return identity;
  }catch(error){throw Object.assign(fault('WORKSPACE_CREATE','Could not establish an isolated writer workspace'),{cause:error,...(cwd?{workspacePath:cwd}:{})});}
}
export async function collectWorkspace(workspace){
  let stage='identity';
  try{
    await verifyIdentity(workspace);
    // Read against the immutable input index, independent of worker staging.
    stage='destination';
    const capturedDir=await directory(join(workspace.artifactsDir,'result'),workspace.cwd);
    stage='inventory';
    const entries=await list(workspace.cwd,workspace.inputIndex);
    stage='files';
    const captured=await captureFiles(workspace.cwd,entries,capturedDir);
    stage='tree';
    const built=await tree(workspace.cwd,captured,capturedDir);
    stage='diff';
    const diffArgs=['diff','--binary','--no-ext-diff','--no-textconv','--no-renames','--no-color','--src-prefix=a/','--dst-prefix=b/'];
    const patch=await git(workspace.cwd,[...diffArgs,workspace.inputTree,built.tree,'--']);
    const basePatch=await git(workspace.cwd,[...diffArgs,workspace.base,built.tree,'--']);
    const changedFiles=names(await git(workspace.cwd,['diff','--name-only','-z','--no-ext-diff','--no-textconv','--no-renames',workspace.inputTree,built.tree,'--']));
    stage='persist';
    const patchPath=join(capturedDir,'changes.patch'),basePatchPath=join(capturedDir,'from-base.patch');
    await writeFile(patchPath,patch,{flag:'wx'});await writeFile(basePatchPath,basePatch,{flag:'wx'});
    const result={...workspace,resultTree:built.tree,changedFiles,patchPath,basePatchPath,patchHash:digest(patch),basePatchHash:digest(basePatch),bytes:captured.bytes,fileCount:captured.files.length};
    const manifestPath=join(capturedDir,'manifest.json'),manifest=JSON.stringify({...result,files:captured.files})+'\n';
    await writeFile(manifestPath,manifest,{flag:'wx'});return{...result,manifestPath,manifestHash:digest(manifest)};
  }catch(error){throw Object.assign(fault('WORKSPACE_ARTIFACT','Could not retain a complete workspace diff; workspace remains on disk'),{cause:error,captureFailure:{stage,cause:diagnostic(error)},workspacePath:workspace.cwd});}
}
async function verifyIdentity(workspace){
  await checkIndex(workspace);
  if(await realpath(workspace.cwd)!==workspace.cwd||(await lstat(workspace.cwd)).isSymbolicLink()||(await lstat(join(workspace.cwd,'.git'))).isSymbolicLink()||digest(await boundedRead(join(workspace.cwd,'.git'),8192))!==workspace.gitPointerHash)throw fault('WORKSPACE_PATH','Worker workspace identity changed');
  if(await realpath((await git(workspace.cwd,['rev-parse','--path-format=absolute','--git-common-dir'])).trim())!==workspace.common)throw fault('WORKSPACE_PATH','Worker Git metadata changed');
}
export async function assertWorkspaceReady(workspace){
  await verifyIdentity(workspace);
  for(const name of (await list(workspace.cwd,workspace.inputIndex)).keys())await file(workspace.cwd,name,{optional:true});
  return true;
}
export async function verifyWorkspace(workspace){
  try{
    await verifyIdentity(workspace);
    for(const [path,hash] of [[workspace.patchPath,workspace.patchHash],[workspace.basePatchPath,workspace.basePatchHash],[workspace.manifestPath,workspace.manifestHash]]){
      if(!inside(workspace.artifactsDir,path)||(await lstat(path)).isSymbolicLink()||digest(await boundedRead(path,maxPatch))!==hash)throw Error('artifact');
    }
    const manifest=JSON.parse(await readFile(workspace.manifestPath,'utf8'));
    const expected=new Map(manifest.files.map(item=>[item.name,item]));
    const entries=await list(workspace.cwd,workspace.inputIndex);
    for(const name of entries.keys()){
      const current=await file(workspace.cwd,name,{optional:true});if(!current)continue;
      const recorded=expected.get(name);if(!recorded||digest(await boundedRead(current.path))!==recorded.sha256)throw Error('workspace bytes');expected.delete(name);
    }
    if(expected.size)throw Error('missing workspace files');
    return true;
  }catch(error){throw Object.assign(fault('WORKSPACE_ARTIFACT','Retained workspace or diff is missing or changed'),{cause:error});}
}
export async function readWorkspacePatch(workspace,{basis='inputs',previewBytes=maxPatch}={}){
  if(!['inputs','base'].includes(basis)||!Number.isInteger(previewBytes)||previewBytes<1||previewBytes>maxPatch)throw fault('PATCH_INPUT','Choose an inputs or base patch and a bounded preview');
  if(!workspace?.patchPath)throw fault('MONITOR_MISSING','A finalized workspace diff is not available');
  try{
    const path=basis==='base'?workspace.basePatchPath:workspace.patchPath,sha256=basis==='base'?workspace.basePatchHash:workspace.patchHash;
    if(!inside(workspace.artifactsDir,path)||!(await lstat(path)).isFile())throw Error('path');
    const bytes=await boundedRead(path,maxPatch);
    if(digest(bytes)!==sha256)throw Error('hash');
    // TextDecoder's streaming mode omits an incomplete UTF-8 character at the preview boundary.
    const truncated=bytes.length>previewBytes,patch=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,previewBytes),{stream:truncated});
    return{basis,patch,sha256,bytes:bytes.length,truncated,cwd:workspace.cwd,changedFiles:workspace.changedFiles};
  }catch(error){throw Object.assign(fault('WORKSPACE_ARTIFACT','Saved patch is missing or changed'),{cause:error});}
}
