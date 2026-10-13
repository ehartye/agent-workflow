import readline from 'node:readline';
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
for await(const line of readline.createInterface({input:process.stdin})){
 const request=JSON.parse(line);
 if(request.method==='initialize')send({id:request.id,result:{}});
 if(request.method==='thread/start')send({id:request.id,result:{thread:{id:'pending-thread'}}});
 if(request.method==='turn/start')send({id:request.id,result:{turn:{id:'pending-turn'}}});
 if(request.method==='turn/steer')send({method:'fixture/steer-pending',params:{}});
 // The turn and steering RPC stay pending until the actual backend aborts/drains this process.
}
