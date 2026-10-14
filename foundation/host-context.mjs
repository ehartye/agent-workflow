import {execFile} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir,release} from 'node:os';
import {join} from 'node:path';
import {buildJobHost} from './windows-job.mjs';

const cap=1024;
const invalid=()=>new Error('Invalid host context');
const unsigned=value=>Number.isInteger(value)&&value>=0&&value<=0xffffffff;

// Native output is untrusted. Do not forward usernames, paths or native errors.
export function parseWindowsHostContext(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>cap)throw invalid();
  let value;try{value=JSON.parse(text);}catch{throw invalid();}
  if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();
  if(value.status==='unavailable'&&Object.keys(value).length===1)return {status:'unavailable'};
  const allowed=new Set(['status','sessionId','elevated','interactive','buildNumber','revision','displayVersion']);
  if(value.status!=='observed'||Object.keys(value).some(key=>!allowed.has(key))||
    !unsigned(value.sessionId)||typeof value.elevated!=='boolean'||typeof value.interactive!=='boolean'||
    typeof value.buildNumber!=='string'||!/^\d{1,10}$/.test(value.buildNumber)||!unsigned(value.revision)||
    (value.displayVersion!==undefined&&(typeof value.displayVersion!=='string'||! /^[A-Za-z0-9 ._-]{0,32}$/.test(value.displayVersion))))throw invalid();
  return {status:'observed',sessionId:value.sessionId,elevated:value.elevated,interactive:value.interactive,
    buildNumber:value.buildNumber,revision:value.revision,...(value.displayVersion===undefined?{}:{displayVersion:value.displayVersion})};
}

// The compiler and --context helper are directly owned local children. Neither
// starts a worker. Keep the directory when a child's exit cannot be confirmed.
async function windowsContext(){
  let directory,canRemove=false,stage='build-failed';
  try{
    directory=await mkdtemp(join(tmpdir(),'workflow-host-context-'));
    let helper;
    try{helper=await buildJobHost(directory);canRemove=true;}
    catch(error){canRemove=error.cause?.code==='ENOENT'||(Number.isInteger(error.cause?.code)&&error.cause?.killed!==true);throw error;}
    stage='helper-failed';canRemove=false;
    const result=await new Promise(resolve=>{
      const child=execFile(helper,['--context'],{windowsHide:true,timeout:5000,maxBuffer:cap},(error,stdout,stderr)=>{
        resolve({error,stdout,stderr});
      });
      child.once('close',()=>{canRemove=true;});
    });
    if(!canRemove)return {status:'unavailable',reason:'cleanup-unverified'};
    if(result.error)throw result.error;
    stage='invalid-output';if(result.stderr!=='')throw invalid();
    return parseWindowsHostContext(result.stdout);
  }catch{return {status:'unavailable',reason:stage};}
  finally{if(directory&&canRemove)await rm(directory,{recursive:true,force:true}).catch(()=>{});}
}

export async function readHostContext(){
  const context={node:process.version,platform:process.platform,arch:process.arch,osRelease:release(),
    sshEnvironmentPresent:Boolean(process.env.SSH_CONNECTION||process.env.SSH_CLIENT||process.env.SSH_TTY)};
  if(process.platform==='win32')context.windows=await windowsContext();
  return context;
}
