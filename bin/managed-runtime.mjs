import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {cp,lstat,mkdir,open,readdir,rename,rm,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {dirname,join,relative,resolve,sep,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';

export const pluginRoot=fileURLToPath(new URL('../',import.meta.url));
export const runtimeEntries=['package.json','package-lock.json','LICENSE','bin','engine','foundation','workflows','hooks','skills'];
const versionPattern=/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;
const digestPattern=/^[a-f0-9]{64}$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const execute=promisify(execFile);
export function defaultDataDir(env=process.env){return resolve(env.AGENT_WORKFLOW_DATA_DIR||join(env.LOCALAPPDATA||join(homedir(),'.local','share'),'agent-workflow'));}
export function paths(dataDir){const root=resolve(dataDir);return{root,runtimes:join(root,'runtime-v2'),pointer:join(root,'runtime-v2.json'),runs:join(root,'runs-v2')};}
export async function noLinks(target){for(let item=resolve(target);;item=dirname(item)){try{if((await lstat(item)).isSymbolicLink())throw Error('Linked paths are refused');}catch(e){if(e.code!=='ENOENT')throw e;}if(dirname(item)===item)break;}}
async function regular(file){await noLinks(file);if(!(await lstat(file)).isFile())throw Error('Expected a regular file');}
export async function readJson(file){await regular(file);const handle=await open(file,'r');try{const bytes=Buffer.alloc(2*1024*1024+1);let size=0;while(size<bytes.length){const result=await handle.read(bytes,size,bytes.length-size,null);if(!result.bytesRead)break;size+=result.bytesRead;}if(size===bytes.length)throw Error('JSON record exceeded its limit');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size)));}finally{await handle.close();}}
export async function atomicJson(file,value){await noLinks(file);await mkdir(dirname(file),{recursive:true,mode:0o700});const temp=`${file}.${randomUUID()}.tmp`;try{await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temp,file);}finally{await rm(temp,{force:true});}}
async function fileDigest(file){await regular(file);const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function treeDigest(root,entries,{fileLimit,byteLimit}){
 await noLinks(root);const hash=createHash('sha256');let count=0,size=0;
 async function visit(name){if(++count>fileLimit)throw Error('Runtime file limit exceeded');const file=join(root,name),s=await lstat(file);if(s.isSymbolicLink())throw Error('Linked runtime inputs are refused');
  hash.update(JSON.stringify([name.replaceAll('\\','/'),s.isDirectory()?'directory':'file'])+'\n');
  if(s.isDirectory()){for(const child of(await readdir(file)).sort())await visit(join(name,child));}
  else{if(!s.isFile()||(size+=s.size)>byteLimit)throw Error('Invalid or oversized runtime input');const bytes=createHash('sha256');for await(const chunk of createReadStream(file))bytes.update(chunk);hash.update(bytes.digest('hex'));}
 }
 for(const entry of entries)await visit(entry);return hash.digest('hex');
}
export const sourceDigest=root=>treeDigest(root,runtimeEntries,{fileLimit:20000,byteLimit:128*1024*1024});
export const dependenciesDigest=root=>treeDigest(root,['node_modules'],{fileLimit:100000,byteLimit:2*1024*1024*1024});

function runtimeId(record){return`${record.version}-${record.digest.slice(0,16)}-node${record.node.slice(1)}`;}
function validateRecord(record,dataDir,{checkNode=true}={}){
 if(record?.schema!==2||['version','digest','node','id','codexDigest','dependenciesDigest'].some(key=>typeof record[key]!=='string')||!versionPattern.test(record.version)||!digestPattern.test(record.digest)||!/^v\d+\.\d+\.\d+$/.test(record.node)||record.id!==runtimeId(record)||!digestPattern.test(record.codexDigest)||!digestPattern.test(record.dependenciesDigest))throw Error('Invalid managed runtime record');
 const expected=join(paths(dataDir).runtimes,record.id);if(typeof record.path!=='string'||resolve(record.path)!==expected)throw Error('Managed runtime path escapes its directory');
 if(checkNode&&record.node!==process.version)throw Error(`Runtime requires Node ${record.node}; use its original Node version or set up a new runtime for new runs`);
 return record;
}
export async function nativeCodex(root){
 const platforms={win32:{x64:'x86_64-pc-windows-msvc',arm64:'aarch64-pc-windows-msvc'},linux:{x64:'x86_64-unknown-linux-musl',arm64:'aarch64-unknown-linux-musl'},darwin:{x64:'x86_64-apple-darwin',arm64:'aarch64-apple-darwin'}};
 const triple=platforms[process.platform]?.[process.arch];if(!triple)throw Error('Unsupported native Codex platform');
 const pkg=await readJson(join(root,'package.json'));if(pkg.dependencies?.['@openai/codex']!=='0.162.1')throw Error('Runtime requires pinned Codex 0.162.1');
 for(const[name,version]of Object.entries(pkg.dependencies??{})){if((await readJson(join(root,'node_modules',...name.split('/'),'package.json'))).version!==version)throw Error(`Installed dependency version differs: ${name}`);}
 const nativeRoot=join(root,'node_modules','@openai',`codex-${process.platform}-${process.arch}`);
 if((await readJson(join(nativeRoot,'package.json'))).version!==`0.162.1-${process.platform}-${process.arch}`)throw Error('Native Codex package version differs');
 const executable=join(nativeRoot,'vendor',triple,'bin',process.platform==='win32'?'codex.exe':'codex');await regular(executable);return executable;
}
export async function verifyRuntime(record,dataDir){
 validateRecord(record,dataDir);await noLinks(record.path);
 if(await sourceDigest(record.path)!==record.digest)throw Error('Managed runtime source digest changed; preserve its evidence and reinstall a clean package');
 const codex=await nativeCodex(record.path);if(record.codex!==codex||await fileDigest(codex)!==record.codexDigest)throw Error('Native executable integrity changed');if(await dependenciesDigest(record.path)!==record.dependenciesDigest)throw Error('Installed dependency integrity changed');return record;
}
async function findNpm(){
 const candidates=[process.env.npm_execpath,join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),...(process.env.PATH??'').split(delimiter).map(dir=>join(dir,'node_modules','npm','bin','npm-cli.js'))];
 for(const file of candidates.filter(Boolean))try{await regular(file);return file;}catch{}throw Error('npm CLI not found; install Node 24+ with npm');
}
export async function installRuntime({pluginRoot:source=pluginRoot,dataDir=defaultDataDir(),npmCli}={}){
 if(process.env.AGENT_WORKFLOW_WORKER==='1')throw Error('Worker processes cannot install runtimes');if(Number(process.versions.node.split('.')[0])<24)throw Error('Node 24+ is required');
 source=resolve(source);const p=paths(dataDir);await noLinks(p.root);if(p.root===source||p.root.startsWith(source+sep))throw Error('Runtime data must live outside the plugin package');
 const digest=await sourceDigest(source),pkg=await readJson(join(source,'package.json'));if(!versionPattern.test(pkg.version))throw Error('Invalid plugin version');
 const base={schema:2,version:pkg.version,digest,node:process.version};const id=runtimeId(base),target=join(p.runtimes,id);await mkdir(p.runtimes,{recursive:true,mode:0o700});await noLinks(target);
 let record;
 try{record=await readJson(join(target,'.runtime.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(record){await verifyRuntime(record,p.root);if(record.path!==target)throw Error('Runtime receipt selects another installation');}
 else{
  try{await lstat(target);throw Error('Incomplete managed runtime exists; preserve it before repairing installation');}catch(e){if(e.code!=='ENOENT')throw e;}
  const stage=join(p.runtimes,`.install-${randomUUID()}`);await mkdir(stage,{mode:0o700});
  try{
   for(const entry of runtimeEntries)await cp(join(source,entry),join(stage,entry),{recursive:true,errorOnExist:true});
   if(await sourceDigest(stage)!==digest)throw Error('Plugin source changed while installing');
   try{await execute(process.execPath,[npmCli??await findNpm(),'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:stage,windowsHide:true,timeout:180000,maxBuffer:2*1024*1024});}catch(e){throw Error(`npm ci failed (${e.code??'startup/timeout'})`);}
   const native=await nativeCodex(stage);record={...base,id,path:target,codex:join(target,relative(stage,native)),codexDigest:await fileDigest(native),dependenciesDigest:await dependenciesDigest(stage)};
   if(await sourceDigest(stage)!==digest)throw Error('Runtime sources changed during dependency installation');
   await writeFile(join(stage,'.runtime.json'),JSON.stringify(record)+'\n',{flag:'wx',mode:0o600});await rename(stage,target);
  }finally{if(dirname(resolve(stage))!==p.runtimes)throw Error('Invalid installation cleanup path');await rm(stage,{recursive:true,force:true});}
 }
 let previous=[];try{const old=await readJson(p.pointer);if(old.schema!==2||!Array.isArray(old.previous)||old.previous.length>1000)throw Error('Invalid runtime selection history');previous=[old.current,...old.previous].filter(item=>item.id!==record.id);for(const item of previous){if(typeof item.id!=='string'||typeof item.path!=='string')throw Error('Invalid prior runtime reference');}}catch(e){if(e.code!=='ENOENT')throw e;}
 if(previous.length>1000)throw Error('Runtime history limit exceeded; preserve and archive older references before installing');
 await atomicJson(p.pointer,{schema:2,current:record,previous});return record;
}
function selectionFailure(reason,caller,selected,cause){
 const identity=record=>({version:record.version.slice(0,80),digest:record.digest,node:record.node.slice(0,40)});
 const runtimeSelection={reason,caller:identity(caller),selected:identity(selected)};
 const describe=record=>`${record.version} / source ${record.digest.slice(0,16)} / Node ${record.node}`;
 const message=reason==='missing'?'No matching installed runtime':'Matching installed runtime failed identity or integrity verification';
 const guidance=reason==='missing'?'Run setup from this caller package to install it; setup changes the shared default.':'Preserve the failed installation and run setup from a clean caller package.';
 return Object.assign(new Error(`${message} for caller ${describe(runtimeSelection.caller)}; recorded default ${describe(runtimeSelection.selected)}. ${guidance} Existing runs retain their recorded runtime.`,{cause}),{code:reason==='missing'?'RUNTIME_MATCH_MISSING':'RUNTIME_MATCH_INVALID',runtimeSelection});
}
export async function selectRuntime({pluginRoot:source=pluginRoot,dataDir=defaultDataDir()}={}){
 const pointer=await readJson(paths(dataDir).pointer);if(pointer.schema!==2)throw Error('Invalid runtime pointer');
 // The default can belong to another package/Node. Validate its recorded
 // identity and path, but only verify bytes for the installation actually used.
 const selected=validateRecord(pointer.current,dataDir,{checkNode:false});
 const digest=await sourceDigest(source),pkg=await readJson(join(source,'package.json'));
 if(typeof pkg.version!=='string'||!versionPattern.test(pkg.version))throw Error('Invalid caller plugin version');
 const caller={version:pkg.version,digest,node:process.version},id=runtimeId(caller);
 const matches=record=>record?.id===id&&record.version===caller.version&&record.digest===caller.digest&&record.node===caller.node;
 if(selected.id===id){
  if(!matches(selected))throw selectionFailure('invalid',caller,selected,Error('Runtime record does not match the full caller identity'));
  return verifyRuntime(selected,dataDir);
 }
 let record;
 try{record=await readJson(join(paths(dataDir).runtimes,id,'.runtime.json'));}
 catch(error){throw selectionFailure(error.code==='ENOENT'?'missing':'invalid',caller,selected,error);}
 try{
  if(!matches(record))throw Error('Runtime receipt does not match the full caller identity');
  return await verifyRuntime(record,dataDir);
 }catch(error){throw selectionFailure('invalid',caller,selected,error);}
}
export async function bindRun({dataDir=defaultDataDir(),runtime,sessionId}){
 if(typeof sessionId!=='string'||!sessionId.trim()||sessionId.length>256)throw Error('An originating Codex session is required');await verifyRuntime(runtime,dataDir);
 const id=randomUUID(),runDir=join(paths(dataDir).runs,id);await noLinks(runDir);await mkdir(runDir,{recursive:true,mode:0o700});
 const owner={schema:2,id,sessionId,createdAt:new Date().toISOString(),runtime};await writeFile(join(runDir,'runtime.json'),JSON.stringify(owner)+'\n',{flag:'wx',mode:0o600});return{...owner,runDir};
}
export async function resolveRun({dataDir=defaultDataDir(),id,sessionId}){
 if(typeof id!=='string'||!uuidPattern.test(id))throw Error('Invalid run identifier; use the ID returned by run');
 const runDir=join(paths(dataDir).runs,id),record=await readJson(join(runDir,'runtime.json'));
 if(record.schema!==2||record.id!==id||typeof record.sessionId!=='string'||!record.sessionId)throw Error('Invalid run ownership record');
 if(sessionId!==undefined&&record.sessionId!==sessionId)throw Error('Run belongs to another originating session');
 return{...record,runDir,runtime:await verifyRuntime(record.runtime,dataDir)};
}
