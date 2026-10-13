import {fault} from './client.mjs';

// Native acknowledgements and inventory are retained separately from OS drain.
// Pinned Codex/MXC can downgrade a job-empty observation failure to a warning.
export async function cleanupTerminals(client,threadId,{timeoutMs=5000}={}){
  if(typeof threadId!=='string'||!threadId||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw fault('TERMINAL_INPUT','Terminal cleanup requires a thread and positive deadline');
  const deadline=performance.now()+timeoutMs;
  const request=(method,params)=>{
    const remaining=deadline-performance.now();if(remaining<=0)throw fault('TERMINAL_TIMEOUT','Native terminal cleanup exceeded its deadline');
    return client.request(method,{threadId,...params},{timeoutMs:remaining});
  };
  const list=async()=>{
    const ids=new Set(),cursors=new Set();let cursor;
    for(let page=0;page<10;page++){
      const result=await request('thread/backgroundTerminals/list',{limit:100,...(cursor?{cursor}:{})});
      if(!Array.isArray(result?.data)||result.data.length>100)throw fault('TERMINAL_PROTOCOL','Malformed native terminal inventory');
      for(const item of result.data){if(typeof item.processId!=='string'||!item.processId||item.processId.length>200||ids.has(item.processId))throw fault('TERMINAL_PROTOCOL','Invalid or repeated native terminal handle');ids.add(item.processId);}
      cursor=result.nextCursor;
      if(cursor==null)return[...ids];
      if(typeof cursor!=='string'||!cursor||cursor.length>1000||cursors.has(cursor))throw fault('TERMINAL_PROTOCOL','Invalid native terminal inventory cursor');
      cursors.add(cursor);
    }
    throw fault('TERMINAL_LIMIT','Native terminal inventory exceeded its page limit');
  };
  const ids=await list();let acknowledged=0;
  for(const processId of ids){
    const result=await request('thread/backgroundTerminals/terminate',{processId});
    if(typeof result?.terminated!=='boolean')throw fault('TERMINAL_PROTOCOL','Native terminal termination acknowledgement is malformed');
    if(result.terminated)acknowledged++;
  }
  if((await list()).length)throw fault('TERMINAL_REMAINING','Native terminals remain after cleanup requests');
  return{observed:ids.length,acknowledged,inventoryEmpty:true,descendants:'notVerified'};
}
