import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {fault} from '../foundation/client.mjs';
import {createLaunch} from '../foundation/launch.mjs';
import {validateMonitorBinding} from './monitor/services.mjs';

export async function startMonitor(runDir,{binding=null}={}){
  binding=validateMonitorBinding(binding);
  const child=fork(fileURLToPath(new URL('./monitor-child.mjs',import.meta.url)),[resolve(runDir)],{
    detached:true,windowsHide:true,execArgv:[],stdio:['ignore','ignore','ignore','ipc'],
    env:createLaunch({executable:process.execPath,cwd:process.cwd()}).env,
  });
  return await new Promise((resolveStart,reject)=>{
    let settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(child.connected)child.disconnect();child.unref();error?reject(error):resolveStart(value);};
    const timer=setTimeout(()=>finish(fault('MONITOR_START','Dashboard startup timed out')),10000);
    child.send({kind:'initialize',binding},error=>{if(error)finish(fault('MONITOR_START','Dashboard initialization failed'));});
    child.on('error',()=>finish(fault('MONITOR_START','Dashboard process could not start')));
    child.on('exit',()=>finish(fault('MONITOR_START','Dashboard exited before startup')));
    child.on('message',message=>{
      if(message?.kind==='ready'&&typeof message.url==='string'){
        child.send({kind:'commit'},error=>{if(error)finish(fault('MONITOR_START','Dashboard acknowledgement failed'));});
      }else if(message?.kind==='started'&&typeof message.url==='string')finish(null,{url:message.url,pid:child.pid,sessionUrl:message.sessionUrl??null});
      else if(message?.kind==='failed')finish(fault('MONITOR_START','Dashboard could not read the saved run'));
    });
  });
}
