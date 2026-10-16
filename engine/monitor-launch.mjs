import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {fault} from '../foundation/client.mjs';
import {createLaunch} from '../foundation/launch.mjs';
import {validateMonitorBinding} from './monitor/services.mjs';
import {networkInterfaces} from 'node:os';
import {selectMonitorNetwork,sameMonitorNetwork,LOOPBACK_NETWORK} from './monitor-network.mjs';
import {canonicalJSON} from './composition-contracts.mjs';

export async function startMonitor(runDir,{binding=null,network=LOOPBACK_NETWORK}={}){
  binding=validateMonitorBinding(binding);
  const selection=selectMonitorNetwork({request:network,interfaces:networkInterfaces()});
  const child=fork(fileURLToPath(new URL('./monitor-child.mjs',import.meta.url)),[resolve(runDir)],{
    detached:true,windowsHide:true,execArgv:[],stdio:['ignore','ignore','ignore','ipc'],
    env:{...createLaunch({executable:process.execPath,cwd:process.cwd()}).env,...(process.env.AGENT_WORKFLOW_WORKER===undefined?{}:{AGENT_WORKFLOW_WORKER:process.env.AGENT_WORKFLOW_WORKER})},
  });
  return await new Promise((resolveStart,reject)=>{
    let settled=false,ready=null;
    const validate=message=>{
      try{
        if(!message||typeof message.url!=='string'||typeof message.serviceInstanceId!=='string'||! /^[a-f0-9]{32}$/.test(message.serviceInstanceId)||!sameMonitorNetwork({expected:selection,actual:message.network?.selection}))throw Error();
        const url=new URL(message.url),n=message.network;
        if(!Number.isInteger(n.port)||n.port<1||n.port>65535||n.origin!==`http://${selection.address}:${n.port}`||url.origin!==n.origin||url.pathname!==(binding?`/runs/${encodeURIComponent(binding.pinnedRunId)}`:'/')||!/^#token=[A-Za-z0-9_-]{43}$/.test(url.hash)||url.search||url.username||url.password)throw Error();
        if(message.sessionUrl!==null&&message.sessionUrl!==`${n.origin}/session${url.hash}`||binding?.scope==='session'&&message.sessionUrl===null)throw Error();
        return{url:message.url,sessionUrl:message.sessionUrl??null,network:n,serviceInstanceId:message.serviceInstanceId};
      }catch{throw fault('MONITOR_NETWORK','Dashboard startup receipt does not match the selected network, binding and authenticated origin');}
    };
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(child.connected)child.disconnect();child.unref();error?reject(error):resolveStart(value);};
    const timer=setTimeout(()=>finish(fault('MONITOR_START','Dashboard startup timed out')),10000);
    child.send({kind:'initialize',binding,network:selection},error=>{if(error)finish(fault('MONITOR_START','Dashboard initialization failed'));});
    child.on('error',()=>finish(fault('MONITOR_START','Dashboard process could not start')));
    child.on('exit',()=>finish(fault('MONITOR_START','Dashboard exited before startup')));
    child.on('message',message=>{
      try{
        if(message?.kind==='ready'&&!ready){ready=validate(message);child.send({kind:'commit'},error=>{if(error)finish(fault('MONITOR_START','Dashboard acknowledgement failed; inspect this exact launch before repeating'));});}
        else if(message?.kind==='started'&&ready){const started=validate(message);if(canonicalJSON(started)!==canonicalJSON(ready))throw fault('MONITOR_NETWORK','Dashboard started identity differs from ready');finish(null,{...started,pid:child.pid});}
        else if(message?.kind==='failed')finish(fault('MONITOR_START','Dashboard could not read the saved run or revalidate its interface'));
        else throw fault('MONITOR_START','Unexpected dashboard startup message');
      }catch(error){finish(error);}
    });
  });
}
