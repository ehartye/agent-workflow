// Explicit UI preview only. These deterministic workers do not invoke Codex.
import {resolve} from 'node:path';
import {runWorkflow} from '../../engine/controller.mjs';
import {startMonitor} from '../../engine/monitor-launch.mjs';
const runDir=resolve(process.argv[2]);
const script=`export const meta={name:'Monitor preview',description:'Simulated workers for interface verification; no Codex calls.'};
await phase('Research');
const read=agent('Inspect the project entrypoints',{id:'read',label:'Read project',dependsOn:[]});
const compare=agent('Compare source evidence',{id:'compare',label:'Compare sources',dependsOn:[]});
await phase('Review');
const review=agent('Review the collected findings',{id:'review',label:'Review findings',dependsOn:['read','compare']});
await phase('Report');
const report=agent('Write a cited report',{id:'report',label:'Build report',dependsOn:['review']});
return await Promise.all([read,compare,review,report]);`;
const work=runWorkflow({runDir,sessionId:'monitor-preview',script,backend:{identity:'preview-no-model',execute:async({prompt,signal,position})=>{
  await new Promise(resolve=>{const timer=setTimeout(resolve,position<2?10000:8000);signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});
  return{value:`Simulated result: ${prompt}`,terminalObserved:true};
},close:async()=>({serverExited:true,descendants:'notVerified'})},onReady:async()=>{console.log(JSON.stringify(await startMonitor(runDir)));}});
await work;
