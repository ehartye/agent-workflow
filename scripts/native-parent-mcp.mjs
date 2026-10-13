import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { codexExecutable } from '../src/workers/process.mjs';
const execute=promisify(execFile);
// Parent management probe deliberately does not use the worker-marked process launcher.
export async function nativeParentMcp({cwd,codexHome}){
 const env={...process.env,CODEX_HOME:codexHome};delete env.AGENT_WORKFLOW_WORKER;
 const child=spawn(codexExecutable(),['app-server','--listen','stdio://'],{cwd,env,windowsHide:true,shell:false,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
 const pending=new Map();let nextId=1,buffer='',stderr='';const send=message=>child.stdin.write(JSON.stringify(message)+'\n');
 const fail=error=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();};
 child.once('error',fail);child.stdin.on('error',fail);child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-16000);});
 child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;if(Buffer.byteLength(buffer)>4*1024*1024){fail(new Error('Native management response exceeded bound'));return;}let newline;while((newline=buffer.indexOf('\n'))!==-1){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line.trim())continue;let message;try{message=JSON.parse(line);}catch(error){fail(error);return;}if(message.id!==undefined&&!message.method){const item=pending.get(message.id);if(item){pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}}}});
 const closed=new Promise(resolve=>child.once('close',resolve));child.once('close',code=>fail(new Error(`Native management process exited ${code}: ${stderr}`)));
 const rpc=(method,params={})=>{const id=nextId++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Native management ${method} timed out`));},15000);pending.set(id,{resolve,reject,timer});send({id,method,params});});};
 async function close(){
  fail(new Error('Native management probe closed'));if(child.exitCode!==null||child.signalCode!==null)return closed;
  child.stdin.end();let grace;const ended=await Promise.race([closed.then(()=>true),new Promise(resolve=>{grace=setTimeout(()=>resolve(false),1500);})]);clearTimeout(grace);if(ended)return;
  if(process.platform==='win32'){try{await execute(path.join(process.env.SystemRoot||'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:10000});}catch(error){if(error.code!==128)throw error;}}
  else{try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}}
  let timeout;try{await Promise.race([closed,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Native management process did not drain')),10000);})]);}finally{clearTimeout(timeout);}
 }
 try{await rpc('initialize',{clientInfo:{name:'agent_workflow_parent_install_check',version:'1'}});send({method:'initialized',params:{}});}catch(error){await close();throw error;}
 return {rpc,close};
}
