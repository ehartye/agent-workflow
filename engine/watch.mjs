import {setTimeout as delay} from 'node:timers/promises';

function bounded(value,name,min,max){
  if(!Number.isSafeInteger(value)||value<min||value>max)throw Object.assign(Error(`Invalid watch ${name}`),{code:'WATCH_INPUT'});
  return value;
}

// The consumer owns this cursor. Watching never writes run state or sends controls.
export async function watchRun(runDir,{sessionId,generation,after=0,pollMs=500,idleMs=60000,signal}={},dependencies={}){
  if(typeof sessionId!=='string'||!sessionId.trim()||sessionId.length>256)throw Object.assign(Error('Watch requires the originating session'),{code:'WATCH_INPUT'});
  bounded(generation,'generation',1,Number.MAX_SAFE_INTEGER);bounded(after,'cursor',0,Number.MAX_SAFE_INTEGER);
  bounded(pollMs,'poll interval',100,10000);bounded(idleMs,'idle interval',1000,86400000);
  const read=dependencies.read??(async(...args)=>(await import('./notifications.mjs')).readNotifications(...args));
  const write=dependencies.write??jsonlWriter(process.stdout);
  const clock=dependencies.clock??(()=>performance.now()),wallClock=dependencies.wallClock??Date.now,sleep=dependencies.sleep??(ms=>delay(ms,undefined,{signal}));
  const workers=new Map();let cursor=after,attached=false;
  try{
    while(!signal?.aborted){
      let page;
      try{page=await read(runDir,{sessionId,generation,after:cursor,limit:100});}
      catch(error){
        const known=new Set(['NOTIFICATIONS_UNAVAILABLE','NOTIFICATIONS_INPUT','NOTIFICATIONS_SESSION','NOTIFICATIONS_CURSOR','NOTIFICATIONS_GENERATION','NOTIFICATIONS_CORRUPT','REPLAY_SESSION','REPLAY_GENERATION','RUN_PATH']);
        await write({kind:'observation-error',generation,cursor,error:{code:known.has(error.code)?error.code:'OBSERVATION_FAILED'}});
        return{exitCode:2,reason:'observation-error',cursor};
      }
      if(!attached){await write({kind:'attached',generation,cursor,status:page.status});attached=true;}
      for(const event of page.events){await write(event);cursor=event.seq;}
      // Only a completely written page may advance to its durable cursor.
      cursor=page.nextCursor;
      if(page.terminal)return{exitCode:page.status==='completed'?0:1,reason:'terminal',cursor,status:page.status};
      const now=clock();
      for(const worker of page.workers){
        const key=`${worker.position}:${worker.attempt}`;
        if(worker.status!=='running'){workers.delete(key);continue;}
        const progress=worker.progress&&['command','file-change'].includes(worker.progress.kind)?`${worker.progress.kind}:${worker.progress.seq}`:null;
        let observed=workers.get(key);
        const changed=progress!==null&&observed?.progress!==progress;
        if(!observed){
          const savedAt=Date.parse(worker.progress?.at??worker.startedAt);
          const elapsed=Number.isFinite(savedAt)?Math.max(0,wallClock()-savedAt):0;
          observed={progress,last:now-elapsed,warned:false};workers.set(key,observed);
        }
        else if(changed){observed.progress=progress;observed.last=now;observed.warned=false;}
        if(changed)await write({kind:'worker-progress',generation,cursor,position:worker.position,attempt:worker.attempt,progress:worker.progress});
        if(!observed.warned&&now-observed.last>=idleMs){
          await write({kind:'idle-warning',generation,cursor,position:worker.position,attempt:worker.attempt,idleMs:Math.floor(now-observed.last),basis:'no-completed-command-or-file-change'});
          observed.warned=true;
        }
      }
      if(!page.hasMore)await sleep(pollMs);
    }
    return{exitCode:130,reason:'aborted',cursor};
  }catch(error){
    if(['EPIPE','ERR_STREAM_DESTROYED','ERR_STREAM_PREMATURE_CLOSE'].includes(error.code))return{exitCode:0,reason:'disconnected',cursor};
    if(signal?.aborted&&error.name==='AbortError')return{exitCode:130,reason:'aborted',cursor};
    throw error;
  }finally{if(!dependencies.write)write.close();}
}

export function jsonlWriter(stream){
  // An error listener remains installed until the observer is finished, including
  // between writes, so a closed downstream pipe cannot become an uncaught error.
  let failure;
  const onError=error=>{failure=error;};stream.on('error',onError);
  const write=record=>new Promise((resolve,reject)=>{
    if(failure)return reject(failure);
    stream.write(JSON.stringify(record)+'\n',error=>error?reject(error):resolve());
  });
  write.close=()=>stream.removeListener('error',onError);
  return write;
}
