import {readdir,lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {keys,plain,hash,integer,digest,absolute,safePath,fileIdentity,fail} from './contract.mjs';

const literal=p=>typeof p==='string'&&p.length<=4096&&p!==''&&!p.includes('\\')&&!p.includes(':')&&!/[\0-\x1f\x7f]/.test(p)&&p.split('/').every(n=>n&&n!=='.'&&n!=='..');
const sorted=rows=>rows.every((r,i)=>i===0||rows[i-1].path<r.path)&&new Set(rows.map(r=>r.path.toLowerCase())).size===rows.length;
async function inventory(root,exclusions=[]){
  await safePath(root,{directory:true});const files=[],excluded=[],expected=new Map(exclusions.map(e=>[e.path,e]));let count=0,bytes=0;
  async function visit(dir,prefix=''){
    for(const name of (await readdir(dir)).sort()){
      const path=prefix+name;if(!literal(path)||++count>120000)fail('JOB_SNAPSHOT');const full=join(root,...path.split('/')),s=await lstat(full);
      if(s.isSymbolicLink()||!s.isDirectory()&&!s.isFile()||s.isFile()&&s.nlink!==1)fail('JOB_SNAPSHOT');
      const isExcluded=expected.has(path);
      if(isExcluded){excluded.push({path,kind:s.isDirectory()?'directory':'file',bytes:s.isFile()?s.size:null,mtimeMs:s.mtimeMs,mode:s.mode});if(excluded.length>100000)fail('JOB_SNAPSHOT');}
      if(s.isDirectory())await visit(full,path+'/');
      else if(!isExcluded){
        if(files.length>=20000)fail('JOB_SNAPSHOT');const identity=await fileIdentity(full,536870912-bytes);bytes+=identity.bytes;
        files.push({path,...identity});
      }
    }
  }
  await visit(root);files.sort((a,b)=>a.path<b.path?-1:1);excluded.sort((a,b)=>a.path<b.path?-1:1);
  if(!sorted(files)||!sorted(excluded))fail('JOB_SNAPSHOT');return {files,excluded,bytes};
}
export async function verifyIntegrationSnapshot(input){
  try{
    const s=plain(input);keys(s,['schemaVersion','root','canonicalRoot','rootIdentity','baseCommit','files','exclusions','dependencies','contentSha256','manifestSha256']);
    if(s.schemaVersion!==1||!absolute(s.root)||!absolute(s.canonicalRoot)||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(s.baseCommit)||!digest(s.contentSha256)||!digest(s.manifestSha256)||!Array.isArray(s.files)||s.files.length>20000||!sorted(s.files)||!Array.isArray(s.dependencies)||s.dependencies.length>20000)fail('JOB_SNAPSHOT');
    keys(s.rootIdentity,['dev','ino']);if(Object.values(s.rootIdentity).some(v=>typeof v!=='string'||!/^\d{1,40}$/.test(v)))fail('JOB_SNAPSHOT');
    keys(s.exclusions,['entries','sha256']);if(!Array.isArray(s.exclusions.entries)||s.exclusions.entries.length>100000||!sorted(s.exclusions.entries)||s.exclusions.sha256!==hash(s.exclusions.entries))fail('JOB_SNAPSHOT');
    for(const e of s.exclusions.entries){keys(e,['path','kind','bytes','mtimeMs','mode']);if(!literal(e.path)||!['file','directory'].includes(e.kind)||e.kind==='file'&&!integer(e.bytes)||e.kind==='directory'&&e.bytes!==null||e.mtimeMs!==null&&!(typeof e.mtimeMs==='number'&&Number.isFinite(e.mtimeMs)&&e.mtimeMs>=0)||e.mode!==null&&!integer(e.mode))fail('JOB_SNAPSHOT');}
    for(const f of s.files){keys(f,['path','sha256','bytes','mode']);if(!literal(f.path)||!digest(f.sha256)||!integer(f.bytes)||![100644,100755].includes(f.mode))fail('JOB_SNAPSHOT');}
    await safePath(s.root,{directory:true});const before=await lstat(s.root,{bigint:true});
    if(await realpath(s.root)!==s.canonicalRoot||String(before.dev)!==s.rootIdentity.dev||String(before.ino)!==s.rootIdentity.ino)fail('JOB_SNAPSHOT');
    // Only administrative Git metadata and explicitly inventoried prepared
    // dependency payloads may leave the complete implementation inventory.
    // Check every excluded entry: omitting a directory row cannot bypass binding.
    const prepared=new Set();
    for(const e of s.exclusions.entries){
      if(e.path==='.git'||e.path.startsWith('.git/'))continue;
      const parts=e.path.split('/'),index=parts.indexOf('node_modules');
      if(index<0)fail('JOB_SNAPSHOT');
      const payload=join(s.root,...parts.slice(0,index+1));
      if(!prepared.has(payload)){
        await safePath(payload,{directory:true});const path=await realpath(payload);
        if(!s.dependencies.some(d=>d?.kind==='tree'&&d.path===path))fail('JOB_SNAPSHOT');
        prepared.add(payload);
      }
    }
    const observed=await inventory(s.root,s.exclusions.entries);
    if(hash(observed.files)!==hash(s.files)||hash(observed.excluded)!==s.exclusions.sha256)fail('JOB_SNAPSHOT');
    let previous='';for(const d of s.dependencies){keys(d,['id','kind','path','sha256','bytes']);if(typeof d.id!=='string'||!d.id||d.id.length>200||d.id<=previous||!['file','tree'].includes(d.kind)||!absolute(d.path)||!digest(d.sha256)||!integer(d.bytes))fail('JOB_SNAPSHOT');previous=d.id;
      await safePath(d.path,{directory:d.kind==='tree'});if(await realpath(d.path)!==d.path)fail('JOB_SNAPSHOT');
      const actual=d.kind==='file'?await fileIdentity(d.path):await inventory(d.path);
      if(d.bytes!==actual.bytes||d.sha256!==(d.kind==='file'?actual.sha256:hash(actual.files)))fail('JOB_SNAPSHOT');
    }
    const content={baseCommit:s.baseCommit,files:s.files,dependencies:s.dependencies.map(({id,kind,sha256,bytes})=>({id,kind,sha256,bytes}))};
    if(hash(content)!==s.contentSha256)fail('JOB_SNAPSHOT');const {manifestSha256,...body}=s;if(hash(body)!==manifestSha256)fail('JOB_SNAPSHOT');
    const after=await lstat(s.root,{bigint:true});if(before.dev!==after.dev||before.ino!==after.ino||before.mtimeNs!==after.mtimeNs||await realpath(s.root)!==s.canonicalRoot)fail('JOB_SNAPSHOT');
    return s;
  }catch{fail('JOB_SNAPSHOT');}
}
