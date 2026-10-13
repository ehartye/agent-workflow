import {createMonitor} from './monitor-server.mjs';

let monitor,committed=false;
process.on('disconnect',()=>{if(!committed){void monitor?.close();process.exitCode=1;}});
process.on('message',message=>{
  if(message?.kind==='commit'&&monitor&&process.connected){committed=true;process.send({kind:'started',url:monitor.url},error=>{if(error)void monitor.close();if(process.connected)process.disconnect();});}
});
try{
  monitor=await createMonitor({runDir:process.argv[2]});
  if(process.connected)process.send({kind:'ready',url:monitor.url},error=>{if(error)void monitor.close();});else await monitor.close();
}catch{if(process.connected)process.send({kind:'failed'},()=>process.disconnect());process.exitCode=1;}
