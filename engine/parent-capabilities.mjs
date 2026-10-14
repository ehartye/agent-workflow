// Native catalog metadata provisions original roots; it does not prove tool use.
import {lstat,realpath,opendir,open} from 'node:fs/promises';
import {resolve,join,dirname,basename,relative,isAbsolute,parse} from 'node:path';
import {createHash} from 'node:crypto';

const MAX_ITEMS=2048,MAX_ROOTS=128,MAX_RESPONSE=4*1024*1024;
const manifests=['.codex-plugin/plugin.json','.claude-plugin/plugin.json','.cursor-plugin/plugin.json'];
const available=plugin=>plugin.enabled&&plugin.installed&&plugin.availability==='AVAILABLE'&&plugin.disabledReason===null;
const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const key=path=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path);
const text=(value,max=256)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const segment=value=>text(value,128)&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)&&value!=='.'&&value!=='..';
const absolute=value=>text(value,4096)&&isAbsolute(value)&&!/^[/\\]{2}/.test(value)&&!value.replaceAll('\\','/').split('/').some(part=>part==='.'||part==='..')&&!(process.platform==='win32'&&/[<>:"|?*]/.test(value.slice(2)));
const inside=(root,path)=>{const rest=relative(root,path);return rest!==''&&!isAbsolute(rest)&&rest!=='..'&&!rest.startsWith('../')&&!rest.startsWith('..\\');};
function fail(){throw Object.assign(new Error('Parent capability catalog is malformed or exceeds its bounded limits'),{code:'PARENT_CAPABILITIES'});}
function array(value,max=MAX_ITEMS){if(!Array.isArray(value)||value.length>max)fail();return value;}
function pluginIdentity(id){if(!text(id)||id.split('@').length!==2)fail();const [name,marketplace]=id.split('@');if(!segment(name)||!segment(marketplace))fail();return {name,marketplace};}

async function original(path,directory){
  if(!absolute(path))fail();
  const target=resolve(path),base=parse(target).root,parts=relative(base,target).split(/[\\/]/).filter(Boolean);
  if(!parts.length)fail();let current=base;
  for(const [index,part]of parts.entries()){
    current=join(current,part);const stat=await lstat(current),leaf=index===parts.length-1;
    if(stat.isSymbolicLink()||(!leaf||directory?!stat.isDirectory():!stat.isFile()||stat.nlink!==1))throw new Error('unsafe source');
    // Windows 8.3 names can expand without traversing a link. Compare the
    // filesystem identity, retaining the admitted spelling for native roots.
    const canonical=await lstat(await realpath(current));
    if(canonical.isSymbolicLink()||stat.dev!==canonical.dev||stat.ino!==canonical.ino||stat.nlink!==canonical.nlink||stat.isDirectory()!==canonical.isDirectory())throw new Error('unsafe source');
  }
}

async function scan(root,budget){
  const pending=[{path:root,depth:0}];let entries=0,nativeDepth=false;
  while(pending.length){const {path,depth}=pending.pop();await original(path,true);
    const directory=await opendir(path);
    for await(const entry of directory){
      if(++entries>20000||++budget.entries>100000)throw new Error('scan limit');
      const child=join(path,entry.name),stat=await lstat(child);
      if(stat.isSymbolicLink()||!stat.isDirectory()&&(!stat.isFile()||stat.nlink!==1))throw new Error('unsafe source');
      if(stat.isDirectory()){if(depth>=32)throw new Error('scan depth');if(depth>=6)nativeDepth=true;pending.push({path:child,depth:depth+1});}
    }
  }
  return {nativeDepth};
}

// Pinned core-plugin-common/src/installed.rs: local wins; otherwise semantic
// versions compare when both parse, lexical order when either doesn't.
function semver(value){
  const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if(!match)return null;const pre=match[4]?.split('.')??[];
  if(pre.some(item=>/^\d+$/.test(item)&&item.length>1&&item.startsWith('0')))return null;
  const core=match.slice(1,4).map(BigInt);if(core.some(number=>number>18446744073709551615n))return null;
  return {core,pre,build:match[5]?.split('.')??[]};
}
const compare=(a,b)=>a<b?-1:a>b?1:0;
function identifiers(left,right,build=false){
  for(let i=0;i<Math.min(left.length,right.length);i++){
    const x=left[i],y=right[i],xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);
    const order=xn&&yn?(compare(BigInt(x),BigInt(y))||(build?compare(x.length,y.length):0)):xn!==yn?(xn?-1:1):compare(x,y);
    if(order)return order;
  }
  return compare(left.length,right.length);
}
function versions(a,b){const left=semver(a),right=semver(b);if(!left||!right)return compare(a,b);
  for(let i=0;i<3;i++){const order=compare(left.core[i],right.core[i]);if(order)return order;}
  const pre=!left.pre.length||!right.pre.length?compare(Number(!left.pre.length),Number(!right.pre.length)):identifiers(left.pre,right.pre);
  // Rust semver::Version derives total Ord including BuildMetadata, unlike
  // dependency range matching, which ignores build identifiers.
  return pre||identifiers(left.build,right.build,true);
}

async function pluginRoot(home,id,budget){
  const {name,marketplace}=pluginIdentity(id),base=join(home,'plugins/cache',marketplace,name);
  await original(base,true);const candidates=[];let count=0;const directory=await opendir(base);
  for await(const entry of directory){if(++count>MAX_ITEMS)throw new Error('version limit');if(entry.isDirectory()&&/^[A-Za-z0-9_.+-]+$/.test(entry.name)&&!['.','..'].includes(entry.name))candidates.push(entry.name);}
  candidates.sort(versions);const version=candidates.includes('local')?'local':candidates.at(-1);if(!version)throw new Error('missing version');
  const root=join(base,version);await original(root,true);let manifest;
  for(const suffix of manifests){const path=join(root,suffix);try{await lstat(path);}catch(error){if(error.code==='ENOENT')continue;throw error;}manifest=path;break;}
  if(!manifest)throw new Error('missing manifest');
  await original(manifest,false);const file=await open(manifest,'r');let bytes;
  try{const before=await file.stat();if(before.size>1024*1024)throw new Error('manifest limit');bytes=Buffer.alloc(before.size+1);const {bytesRead}=await file.read(bytes,0,bytes.length,0);bytes=bytes.subarray(0,bytesRead);const after=await file.stat();if(bytesRead!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw new Error('source changed');}finally{await file.close();}
  const value=JSON.parse(bytes.toString('utf8'));if(!record(value)||value.name!==name)throw new Error('manifest identity');
  const scanned=await scan(root,budget);await original(manifest,false);return {root,manifestSha256:hash(bytes),...scanned};
}

export async function discoverParentCapabilities(client,{cwd,codexHome}={}){
  if(!client||typeof client.request!=='function'||!absolute(cwd)||!absolute(codexHome))fail();
  const inventory={plugins:[],skills:[],missing:[],warnings:[]},roots=[],rootMap=new Map(),plugins=new Map(),seenSkills=new Set(),seenNames=new Set(),budget={entries:0};
  const missing=(kind,id,code)=>{if(inventory.missing.length>=MAX_ITEMS)fail();inventory.missing.push({kind,id,code});};
  const warning=(kind,id,code)=>{if(inventory.warnings.length>=MAX_ITEMS)fail();inventory.warnings.push({kind,id,code});};
  const bind=path=>{const identity=key(path);if(rootMap.has(identity))return rootMap.get(identity).id;if(roots.length>=MAX_ROOTS)fail();const root={id:`parent-${hash(identity).slice(0,32)}`,location:{type:'environment',environmentId:'local',path:resolve(path)}};roots.push(root);rootMap.set(identity,root);return root.id;};
  async function request(method,params){let value;try{value=await client.request(method,params,{timeoutMs:15000});}catch{missing('catalog',method,'RPC_UNAVAILABLE');return null;}
    let size;try{size=Buffer.byteLength(JSON.stringify(value));}catch{fail();}if(size>MAX_RESPONSE||!record(value)||value.nextCursor)fail();return value;
  }
  const installed=await request('plugin/installed',{cwds:[cwd]});
  if(installed){
    const marketplaces=array(installed.marketplaces,128),errors=array(installed.marketplaceLoadErrors);
    if(errors.length)missing('catalog','plugin/installed','PARTIAL_METADATA');
    for(const marketplace of marketplaces){if(!record(marketplace))fail();
      for(const entry of array(marketplace.plugins)){
        if(inventory.plugins.length>=MAX_ITEMS||!record(entry)||typeof entry.enabled!=='boolean'||typeof entry.installed!=='boolean'||!['AVAILABLE','DISABLED_BY_ADMIN'].includes(entry.availability)||![null,'disabled_by_admin','plan_not_eligible','required_app_unavailable','unknown'].includes(entry.disabledReason))fail();
        const identity=pluginIdentity(entry.id);if(entry.name!==identity.name)fail();const item={id:entry.id,origin:'plugin/installed',enabled:entry.enabled,installed:entry.installed,availability:entry.availability,disabledReason:entry.disabledReason,rootId:null};inventory.plugins.push(item);
        if(plugins.has(item.id)){missing('plugin',item.id,'DUPLICATE_METADATA');continue;}plugins.set(item.id,item);
        if(!available(item))continue;
        let source;try{source=await pluginRoot(codexHome,item.id,budget);}catch{missing('plugin',item.id,'SOURCE_UNAVAILABLE');continue;}
        item.rootId=bind(source.root);item.manifestSha256=source.manifestSha256;
        if(source.nativeDepth)warning('plugin',item.id,'NATIVE_DISCOVERY_DEPTH');
      }
    }
  }
  const listed=await request('skills/list',{cwds:[cwd],forceReload:true});
  if(listed){const data=array(listed.data,1);if(data.length!==1)missing('catalog','skills/list','PARTIAL_METADATA');
    for(const group of data){if(!record(group)||!absolute(group.cwd)||key(group.cwd)!==key(cwd))fail();if(array(group.errors).length)missing('catalog','skills/list','PARTIAL_METADATA');
      for(const entry of array(group.skills)){
        if(inventory.skills.length>=MAX_ITEMS||!record(entry)||!text(entry.name)||!absolute(entry.path)||typeof entry.enabled!=='boolean'||!['user','repo','system','admin'].includes(entry.scope)||!(entry.pluginId===null||typeof entry.pluginId==='string'))fail();
        if(entry.pluginId!==null)pluginIdentity(entry.pluginId);
        const item={name:entry.name,path:resolve(entry.path),pluginId:entry.pluginId,enabled:entry.enabled,scope:entry.scope,rootId:null};inventory.skills.push(item);
        const identity=key(item.path);if(seenSkills.has(identity)){missing('skill',item.name,'DUPLICATE_METADATA');continue;}seenSkills.add(identity);
        if(!item.enabled)continue;
        if(seenNames.has(item.name))warning('skill',item.name,'DUPLICATE_NAME');seenNames.add(item.name);
        if(item.pluginId){let plugin=plugins.get(item.pluginId);
          if(!plugin){
            // Native skills/list supplies original enabled plugin ownership even
            // for configured packages absent from the installed UI inventory.
            // Preserve that provenance rather than invent installed metadata.
            if(inventory.plugins.length>=MAX_ITEMS)fail();
            plugin={id:item.pluginId,origin:'skills/list',enabled:null,installed:null,availability:null,disabledReason:null,rootId:null};
            plugins.set(plugin.id,plugin);inventory.plugins.push(plugin);
            let source;try{source=await pluginRoot(codexHome,plugin.id,budget);if(!inside(source.root,item.path))throw new Error('owner mismatch');await original(item.path,false);}catch{source=null;missing('plugin',plugin.id,'SOURCE_UNAVAILABLE');}
            if(source){
              plugin.rootId=bind(source.root);plugin.manifestSha256=source.manifestSha256;if(source.nativeDepth)warning('plugin',plugin.id,'NATIVE_DISCOVERY_DEPTH');
            }
          }
          if(plugin.origin==='plugin/installed'&&!available(plugin))continue;
          const root=roots.find(root=>root.id===plugin?.rootId);if(!root||!inside(root.location.path,item.path)){missing('skill',item.name,'PLUGIN_SOURCE_UNAVAILABLE');continue;}
          try{await original(item.path,false);}catch{missing('skill',item.name,'SOURCE_UNAVAILABLE');continue;}item.rootId=root.id;continue;
        }
        let scanned;try{if(basename(item.path)!=='SKILL.md')throw new Error('unknown main resource');await original(item.path,false);scanned=await scan(dirname(item.path),budget);}catch{missing('skill',item.name,'SOURCE_UNAVAILABLE');continue;}
        item.rootId=bind(dirname(item.path));
        if(scanned.nativeDepth)warning('skill',item.name,'NATIVE_DISCOVERY_DEPTH');
      }
    }
  }
  // Executor roots are recursively discovered independently of host skill
  // enablement. Do not claim that a broad root preserves a disabled child.
  for(const item of inventory.skills){if(!item.enabled&&roots.some(root=>inside(root.location.path,item.path)))missing('skill',item.name,'DISABLED_SKILL_IN_SELECTED_ROOT');}
  roots.sort((a,b)=>compare(a.id,b.id));inventory.plugins.sort((a,b)=>compare(a.id,b.id));inventory.skills.sort((a,b)=>compare(a.path,b.path)||compare(a.name,b.name));inventory.missing.sort((a,b)=>compare(canonical(a),canonical(b)));inventory.warnings.sort((a,b)=>compare(canonical(a),canonical(b)));
  const coverage={complete:inventory.missing.length===0,pluginCount:inventory.plugins.length,skillCount:inventory.skills.length,rootCount:roots.length,missingCount:inventory.missing.length,warningCount:inventory.warnings.length};
  return {roots,inventory,fingerprint:hash(canonical({roots,inventory,coverage})),coverage};
}
