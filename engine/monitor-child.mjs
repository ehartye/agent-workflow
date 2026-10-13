import {createMonitor} from './monitor-server.mjs';
import {dirname,basename} from 'node:path';
import {createSessionServices} from './monitor-adapters.mjs';
import {fault} from '../foundation/client.mjs';

let monitor,committed=false,initializing=false;
const initialization=setTimeout(()=>{if(!initializing){process.exitCode=1;if(process.connected)process.disconnect();}},10000);
process.on('disconnect',()=>{if(!committed){void monitor?.close();process.exitCode=1;}});
process.on('message',async message=>{
  if(message?.kind==='initialize'&&!initializing){
    initializing=true;clearTimeout(initialization);
    try{
      const runDir=process.argv[2];let integrated;
      if(message.binding){
        integrated=await createSessionServices({dataDir:dirname(dirname(runDir)),sessionId:message.binding.originatingSessionId,pinnedRunId:basename(runDir)});
        if(Object.keys(integrated.binding).some(key=>integrated.binding[key]!==message.binding[key]))throw fault('MONITOR_OWNERSHIP','Dashboard launch binding changed before admission');
      }
      monitor=await createMonitor({runDir,binding:integrated?.binding??null,experienceServices:integrated?.services??null});
      if(process.connected)process.send({kind:'ready',url:monitor.url,sessionUrl:monitor.sessionUrl},error=>{if(error)void monitor.close();});else await monitor.close();
    }catch{if(process.connected)process.send({kind:'failed'},()=>process.disconnect());process.exitCode=1;}
  }
  if(message?.kind==='commit'&&monitor&&process.connected){committed=true;process.send({kind:'started',url:monitor.url,sessionUrl:monitor.sessionUrl},error=>{if(error)void monitor.close();if(process.connected)process.disconnect();});}
});
