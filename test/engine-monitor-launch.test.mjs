/** @lane merge
 * @subject engine/monitor-launch.mjs
 * @subject engine/monitor-child.mjs
 * @subject engine/monitor-network.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir,networkInterfaces} from 'node:os';
import {join} from 'node:path';
import {runWorkflow} from '../engine/controller.mjs';
import {startMonitor} from '../engine/monitor-launch.mjs';

test('invalid LAN launch refuses before creating a process even for a nonexistent run',async()=>{
 for(const address of ['0.0.0.0','127.0.0.1','8.8.8.8','10.01.2.3','10.2.3.4:80','192.0.2.1']){
  await assert.rejects(startMonitor(join(tmpdir(),'absent-monitor'),{network:{schemaVersion:1,mode:'lan',address}}),{code:'MONITOR_NETWORK'});
 }
});

test('monitor launcher returns matching authenticated network identity and Close ends its actual process',async t=>{
 const runDir=await mkdtemp(join(tmpdir(),'monitor-launch-'));t.after(()=>rm(runDir,{recursive:true,force:true}));
 await runWorkflow({runDir,sessionId:'s',script:'export const meta={name:"monitor",description:"fixture"};return null;',backend:{identity:'fixture',execute:async()=>{throw Error('forbidden');},close:async()=>({serverExited:true})}});
 const receipt=await startMonitor(runDir);const url=new URL(receipt.url),token=new URLSearchParams(url.hash.slice(1)).get('token');
 t.after(async()=>{try{await fetch(url.origin+'/api/close',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'{}'});}catch{}});
 const health=await fetch(url.origin+'/api/health',{headers:{authorization:'Bearer '+token}}).then(r=>r.json());
 assert.equal(receipt.network.selection.mode,'loopback');assert.deepEqual(health.network,receipt.network);assert.equal(health.serviceInstanceId,receipt.serviceInstanceId);
 assert.equal((await fetch(url.origin+'/api/health')).status,401);
 assert.equal((await fetch(url.origin+'/api/health',{headers:{authorization:'Bearer '+token,origin:'http://foreign.invalid'}})).status,403);
 assert.equal((await fetch(url.origin+'/api/close',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'{}'})).status,200);
 for(let i=0;i<100;i++){try{process.kill(receipt.pid,0);}catch{return;}await new Promise(r=>setTimeout(r,20));}
 assert.fail('dashboard process remained alive after authenticated Close');
});

test('network selection rejects malformed inventories and binds exact interface identity',async()=>{
 const {selectMonitorNetwork,verifyMonitorNetwork,sameMonitorNetwork}=await import('../engine/monitor-network.mjs');
 const interfaces={fixture:[{address:'192.168.4.12',family:'IPv4',internal:false,netmask:'255.255.255.0',mac:'00:00:00:00:00:00'}]};
 const request={schemaVersion:1,mode:'lan',address:'192.168.4.12'},selection=selectMonitorNetwork({request,interfaces});
 assert.equal(selection.prefixLength,24);assert.equal(sameMonitorNetwork({expected:selection,actual:verifyMonitorNetwork({selection,interfaces})}),true);
 assert.throws(()=>verifyMonitorNetwork({selection,interfaces:{}}),{code:'MONITOR_NETWORK'});
 assert.throws(()=>selectMonitorNetwork({request,interfaces:{...interfaces,duplicate:interfaces.fixture}}),{code:'MONITOR_NETWORK'});
 assert.throws(()=>selectMonitorNetwork({request,interfaces:{fixture:[{...interfaces.fixture[0],netmask:'255.0.255.0'}]}}),{code:'MONITOR_NETWORK'});
});

test('actual private interface serves the same LAN origin and authenticated health',async t=>{
 const match=Object.values(networkInterfaces()).flat().find(e=>e.family==='IPv4'&&!e.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(e.address));
 assert.ok(match,'actual local private IPv4 prerequisite is missing; LAN HTTP coverage is unavailable');
 const runDir=await mkdtemp(join(tmpdir(),'monitor-lan-'));t.after(()=>rm(runDir,{recursive:true,force:true}));
 await runWorkflow({runDir,sessionId:'s',script:'export const meta={name:"LAN",description:"fixture"};return null;',backend:{identity:'fixture',execute:async()=>{throw Error('forbidden');},close:async()=>({serverExited:true})}});
 const receipt=await startMonitor(runDir,{network:{schemaVersion:1,mode:'lan',address:match.address}}),url=new URL(receipt.url),authorization='Bearer '+new URLSearchParams(url.hash.slice(1)).get('token');
 t.after(async()=>{try{await fetch(url.origin+'/api/close',{method:'POST',headers:{authorization,'content-type':'application/json'},body:'{}'});}catch{}});
 assert.equal(url.hostname,match.address);assert.ok(Number(url.port)>0);
 try{const response=await fetch(url.origin+'/api/health',{headers:{authorization,origin:url.origin}});assert.equal(response.status,200);const health=await response.json();assert.deepEqual(health.network,receipt.network);assert.equal(health.serviceInstanceId,receipt.serviceInstanceId);}
 finally{await fetch(url.origin+'/api/close',{method:'POST',headers:{authorization,'content-type':'application/json'},body:'{}'});}
});
