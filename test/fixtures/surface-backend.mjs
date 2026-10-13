import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export function createBackend(){const children=new Set();return {
 async execute(request,{signal,onEvent,onApproval}={}){
  if(request.prompt==='approval'){const decision=await onApproval({id:'fixture-a',type:'command',command:'test-only'});return {value:decision,usage:{inputTokens:1,outputTokens:1}};}
  return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(new URL('./surface-worker.mjs',import.meta.url)),JSON.stringify(request)],{windowsHide:true,stdio:['ignore','pipe','pipe']});children.add(child);onEvent?.({type:'process-started',pid:child.pid});let stdout='';child.stdout.on('data',chunk=>{stdout+=chunk;onEvent?.({type:'progress',message:chunk.toString()});});const cancel=()=>child.kill();signal?.addEventListener('abort',cancel,{once:true});child.once('error',reject);child.once('exit',code=>{children.delete(child);signal?.removeEventListener('abort',cancel);if(signal?.aborted)return reject(Object.assign(new Error('Fixture cancelled after process drain'),{outcome:'cancelled',drainVerified:true}));if(code!==0)return reject(new Error('Fixture worker failed'));try{resolve(JSON.parse(stdout.trim().split('\n').at(-1)));}catch(error){reject(error);}});});
 },async steer(){return {accepted:true};},async shutdown(){for(const child of children)child.kill();},async readRateLimits(){return null;}
};}
