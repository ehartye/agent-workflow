// Read retained evidence only. No database creation, admission, process control or retry.
import {lstat,open,opendir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {noLinks} from './managed-runtime.mjs';

const receiptName=/^finish-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
async function missingDatabase(runDir){
 try{await lstat(join(runDir,'run.sqlite'));return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}
}
async function json(path,limit){
 await noLinks(path);const info=await lstat(path);
 if(!info.isFile()||info.nlink!==1||info.size>limit)throw Error('Invalid evidence file');
 const handle=await open(path,'r');
 try{
  const opened=await handle.stat();
  if(!opened.isFile()||opened.nlink!==1||opened.size>limit||opened.dev!==info.dev||opened.ino!==info.ino)throw Error('Evidence changed while opening');
  const bytes=Buffer.alloc(limit+1);let size=0;
  while(size<bytes.length){const {bytesRead}=await handle.read(bytes,size,bytes.length-size,null);if(!bytesRead)break;size+=bytesRead;}
  if(size>limit)throw Error('Evidence limit');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size)));
 }finally{await handle.close();}
}
function bounded(value,depth=0){
 if(depth>8)throw Error('Evidence depth');
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(typeof value==='string'&&value.length<=2048)return value;
 if(Array.isArray(value)&&value.length<=16)return value.map(item=>bounded(item,depth+1));
 if(record(value)&&Object.keys(value).length<=32)return Object.fromEntries(Object.entries(value).map(([key,item])=>{
  if(key.length>100)throw Error('Evidence key');
  if(key==='inferenceRequests'&&item!==0)throw Error('Conflicting inference evidence');
  if(['cleanup','admission','error','evidence','command','construction','hostContext','diagnosis','desktopCompatibility','windows','policy'].includes(key)&&item!==null&&!record(item))throw Error('Invalid evidence container');
  if(['startup','stages'].includes(key)&&!Array.isArray(item))throw Error('Invalid evidence list');
  if(['serverExited','jobEmpty','forced','applied'].includes(key)&&item!==null&&typeof item!=='boolean')throw Error('Invalid cleanup evidence');
  return[key,bounded(item,depth+1)];
 }));
 throw Error('Evidence shape');
}
function diagnostic(value){
 if(!record(value)||value.status!=='failed'||value.inferenceRequests!==0)throw Error('Invalid pre-admission diagnostic');
 const keys=['status','inferenceRequests','backend','stage','error','construction','admission','cleanup','startup','startupTruncated','diagnosis','hostContext'];
 return bounded(Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]])));
}

// owner comes from resolveRun: it has already checked run/runtime identity and routing.
export async function readPreadmissionReport(owner){
 const {runDir}=owner;await noLinks(runDir);
 if(!await missingDatabase(runDir))return null;
 const runtime=Object.fromEntries(['id','version','digest','node','path','codexDigest','dependenciesDigest'].filter(key=>Object.hasOwn(owner.runtime,key)).map(key=>[key,owner.runtime[key]]));
 const report={id:owner.id,runDir,sessionId:owner.sessionId,createdAt:owner.createdAt,runtime,
  database:'missing',scope:'pre-database',status:'unavailable',result:null,error:null,
  inferenceRequests:null,admission:null,cleanup:null,receipt:{status:'missing'}};
 const names=[];let count=0;
 for await(const entry of await opendir(runDir)){
  if(++count>128){report.receipt={status:'invalid',reason:'directory-limit'};break;}
  if(receiptName.test(entry.name))names.push(entry.name);
 }
 if(report.receipt.status==='invalid')return await missingDatabase(runDir)?report:null;
 if(names.length>1)report.receipt={status:'ambiguous',reason:'multiple-finish-receipts'};
 else if(names.length===1){
  const name=names[0];
  try{
   const request=await json(join(runDir,name.replace('finish-','launch-')),2*1024*1024);
   if(!record(request)||typeof request.runDir!=='string'||resolve(request.runDir)!==resolve(runDir)||request.sessionId!==owner.sessionId||request.resume!==undefined&&request.resume!==false)throw Error('Receipt binding');
   const finish=await json(join(runDir,name),65536);
   if(!record(finish)||finish.status!=='failed'||Object.hasOwn(finish,'generation')||!record(finish.error)||typeof finish.error.code!=='string'||!/^[-A-Z0-9_]{1,100}$/.test(finish.error.code))throw Error('Invalid finish receipt');
   const admissionFailure=Object.hasOwn(finish,'admissionFailure')?diagnostic(finish.admissionFailure):null;
   const startupDiagnostics=Object.hasOwn(finish,'startupDiagnostics')?diagnostic(finish.startupDiagnostics):null;
   if(!admissionFailure&&!startupDiagnostics)throw Error('No pre-admission evidence');
   const error={code:finish.error.code};
   if(typeof finish.error.message==='string'&&finish.error.message.length<=2048)error.message=finish.error.message;
   Object.assign(report,{status:'failed',error,inferenceRequests:0,
    admission:admissionFailure?.admission??startupDiagnostics?.admission??null,
    cleanup:admissionFailure?.cleanup??startupDiagnostics?.cleanup??null,
    ...(admissionFailure?{admissionFailure}:{}),...(startupDiagnostics?{startupDiagnostics}:{}),
    receipt:{status:'retained',file:name}});
  }catch(error){
   // Invalid/missing evidence is not proof of failure, completion or zero inference.
   if(error.code&& !['ENOENT','EISDIR','ERR_ENCODING_INVALID_ENCODED_DATA'].includes(error.code))throw error;
   report.receipt={status:'invalid',file:name,reason:'invalid-or-unbound-evidence'};
  }
 }
 // Admission may have created storage during this read; prefer the database in that case.
 return await missingDatabase(runDir)?report:null;
}
