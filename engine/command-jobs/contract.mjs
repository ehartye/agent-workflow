import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {lstat,open,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,resolve} from 'node:path';
import {fault} from '../../foundation/client.mjs';

export const REQUEST_BYTES=2097152,OPTIONS_BYTES=2162688,PRIVATE_BYTES=4194304,ENVIRONMENT_BYTES=1048576,EXPANDED_RECEIPT_BYTES=2162688;
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const fail=(code='JOB_INPUT')=>{throw fault(code,'Command job evidence is invalid or unavailable; preserve the original operation before reconciliation');};
export const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
export const absolute=value=>typeof value==='string'&&value.length<=4096&&isAbsolute(value)&&!/[\0-\x1f\x7f]/.test(value)&&!(process.platform==='win32'&&(/^\\\\[.?]\\/.test(value)||value.slice(2).includes(':')));
export const text=(value,max=200)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\0-\x1f\x7f]/.test(value);

// Descriptor inspection precedes serialization: proxies/accessors are not JSON.
export function plain(value,limit=1048576){
  let count=0;
  function visit(v,depth){
    if(++count>250000||depth>256)fail();
    if(v===null||typeof v==='boolean')return v;
    if(typeof v==='string'){if(Buffer.byteLength(v)>limit)fail('JOB_LIMIT');return v;}
    if(typeof v==='number'&&Number.isFinite(v))return v;
    if(!v||typeof v!=='object'||types.isProxy(v))fail();
    const array=Array.isArray(v);
    if(array?Object.getPrototypeOf(v)!==Array.prototype:![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail();
    const ownKeys=Reflect.ownKeys(v),length=array?Object.getOwnPropertyDescriptor(v,'length').value:null;
    if(array&&(!integer(length,0,250000)||ownKeys.length!==length+1))fail();
    const out=array?[]:Object.create(null);
    for(const k of ownKeys){
      if(array&&k==='length')continue;
      const d=Object.getOwnPropertyDescriptor(v,k);
      if(typeof k!=='string'||k==='__proto__'||!d.enumerable||!Object.hasOwn(d,'value')||array&&(!/^(0|[1-9][0-9]*)$/.test(k)||Number(k)>=length))fail();
      out[k]=visit(d.value,depth+1);
    }
    if(array&&out.length!==length)fail();
    return out;
  }
  const result=visit(value,0);
  if(Buffer.byteLength(JSON.stringify(result))>limit)fail('JOB_LIMIT');
  return result;
}
export function keys(value,names,optional=[]){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!names.includes(k)&&!optional.includes(k))||names.some(k=>!Object.hasOwn(value,k)))fail();
  return value;
}
export function canonical(v){
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
export const hash=value=>sha(canonical(value));
export const mutationGuard=()=>{if(process.env.AGENT_WORKFLOW_WORKER==='1')fail('JOB_WORKER');};
export async function safePath(path,{directory=false,missing=false}={}){
  if(!absolute(path))fail('JOB_PATH');
  for(let p=resolve(path);;p=dirname(p)){
    try{const s=await lstat(p);if(s.isSymbolicLink()||p!==resolve(path)&&!s.isDirectory())fail('JOB_PATH');}
    catch(e){if(!(missing&&e.code==='ENOENT'))throw e;}
    if(dirname(p)===p)break;
  }
  try{const s=await lstat(path);if(directory?!s.isDirectory():!s.isFile()||s.nlink!==1)fail('JOB_PATH');}catch(e){if(!(missing&&e.code==='ENOENT'))throw e;}
  return path;
}
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
export async function bytesAt(path,limit=1048576){
  await safePath(path);const entry=await lstat(path,{bigint:true}),h=await open(path,'r');
  try{
    const before=await h.stat({bigint:true});if(!same(entry,before)||before.size>BigInt(limit))fail('JOB_LIMIT');
    const b=Buffer.alloc(Number(before.size)+1);let n=0;
    while(n<b.length){const r=await h.read(b,n,b.length-n,n);if(!r.bytesRead)break;n+=r.bytesRead;}
    if(n!==Number(before.size)||!same(before,await h.stat({bigint:true}))||!same(before,await lstat(path,{bigint:true})))fail('JOB_INTEGRITY');
    return b.subarray(0,n);
  }finally{await h.close();}
}
export async function fileIdentity(path,limit=536870912){
  await safePath(path);const entry=await lstat(path,{bigint:true}),h=await open(path,'r');
  try{
    const before=await h.stat({bigint:true});if(!same(entry,before)||before.size>BigInt(limit))fail('JOB_LIMIT');
    const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let n=0;
    for(;;){const r=await h.read(buffer,0,buffer.length,n);if(!r.bytesRead)break;n+=r.bytesRead;if(n>limit)fail('JOB_LIMIT');hash.update(buffer.subarray(0,r.bytesRead));}
    if(n!==Number(before.size)||!same(before,await h.stat({bigint:true}))||!same(before,await lstat(path,{bigint:true})))fail('JOB_INTEGRITY');
    return {sha256:hash.digest('hex'),bytes:n,mode:Number(before.mode&0o111n)?100755:100644};
  }finally{await h.close();}
}
export async function verifiedPage(path,expected,{after=0,limitBytes=65536,maxBytes=16777216,allowAppend=false}={}){
  await safePath(path);const entry=await lstat(path,{bigint:true}),h=await open(path,'r');
  try{
    const object=(a,b)=>a.isFile()&&b.isFile()&&a.nlink===1n&&b.nlink===1n&&a.dev===b.dev&&a.ino===b.ino&&a.birthtimeNs===b.birthtimeNs;
    const size=s=>s.size<=BigInt(maxBytes)&&(allowAppend?s.size>=BigInt(expected.retainedBytes):s.size===BigInt(expected.retainedBytes));
    const before=await h.stat({bigint:true});if(!(allowAppend?object(entry,before)&&before.size>=entry.size:same(entry,before))||!size(before)||after>expected.retainedBytes)fail('JOB_OUTPUT');
    const hash=createHash('sha256'),buffer=Buffer.alloc(65536),page=Buffer.alloc(Math.min(limitBytes,expected.retainedBytes-after));let n=0;
    // A live receipt authenticates only its committed prefix. The owner may
    // already have appended/fsynced the next delta before publishing its row.
    while(n<expected.retainedBytes){const r=await h.read(buffer,0,Math.min(buffer.length,expected.retainedBytes-n),n);if(!r.bytesRead)break;hash.update(buffer.subarray(0,r.bytesRead));
      const from=Math.max(after,n),to=Math.min(after+page.length,n+r.bytesRead);if(to>from)buffer.copy(page,from-after,from-n,to-n);n+=r.bytesRead;
    }
    const handle=await h.stat({bigint:true}),name=await lstat(path,{bigint:true});
    const stable=allowAppend?object(before,handle)&&object(handle,name)&&handle.size>=before.size&&name.size>=handle.size&&size(handle)&&size(name):same(before,handle)&&same(before,name);
    if(hash.digest('hex')!==expected.sha256||n!==expected.retainedBytes||!stable)fail('JOB_OUTPUT');return page;
  }finally{await h.close();}
}
export const jsonAt=async(path,limit)=>{try{return plain(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytesAt(path,limit))),limit);}catch(e){if(e.code?.startsWith('JOB_'))throw e;fail('JOB_INTEGRITY');}};
export async function directoryIdentity(path){await safePath(path,{directory:true});const canonical=await realpath(path),s=await lstat(path,{bigint:true});return {canonical,dev:String(s.dev),ino:String(s.ino),birthtimeNs:String(s.birthtimeNs)};}

export function validateRequest(input){
  const r=plain(input,REQUEST_BYTES);keys(r,['schemaVersion','requestId','command','cwd','environment','deadlineMs','kind','verification'],['outputLimitBytes']);
  if(r.schemaVersion!==1||!uuid(r.requestId)||!Array.isArray(r.command)||!integer(r.command.length,1,256)||!absolute(r.command[0])||r.command.some(v=>typeof v!=='string'||v.includes('\0'))||r.command.reduce((n,v)=>n+Buffer.byteLength(v),0)>65536||!absolute(r.cwd)||!integer(r.deadlineMs,1,86400000)||!['normal','heavy'].includes(r.kind))fail();
  keys(r.environment,['mode']);if(r.environment.mode!=='inherit')fail();
  r.outputLimitBytes??=1048576;if(!integer(r.outputLimitBytes,1,16777216))fail();
  if(r.verification!==null){keys(r.verification,['checkpointId','checkId','snapshot']);if(!uuid(r.verification.checkpointId)||!text(r.verification.checkId))fail();}
  return plain(r,REQUEST_BYTES);
}
export const terminal=state=>['succeeded','failed','cancelled','deadline','unknown'].includes(state);
export const positiveCleanup=c=>c?.serverExited===true&&c.jobEmpty===true&&c.forced===false&&c.ownershipScope==='windows-job-members'&&c.descendants==='notVerified'&&c.jobHost?.closeObserved===true&&c.jobHost.exitCode===0&&c.jobHost.signal==='none'&&c.jobHost.receipt==='drained';
