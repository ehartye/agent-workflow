import {fault} from '../foundation/client.mjs';
import {types} from 'node:util';

const MAX_TIMER_MS=2147483647;
const valid=value=>Number.isSafeInteger(value)&&value>0;
const systemClock={now:()=>performance.now(),wallNow:()=>Date.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)};

// One owner per worker. The wall clock is presentation only; elapsed time uses
// a monotonic clock. Commands and protocol acknowledgements keep their own caps.
export function createLiveDeadline(configuredTimeoutMs=null,{clock=systemClock}={}){
  if(configuredTimeoutMs!==null&&!valid(configuredTimeoutMs))throw fault('DEADLINE_INPUT','Worker timeout must be null or a positive safe integer');
  let status='pending',revision=0,budget=configuredTimeoutMs,anchor,timer;
  const controller=new AbortController(),listeners=new Set();
  const left=()=>budget===null?Infinity:Math.max(0,budget-(status==='active'?clock.now()-anchor:0));
  const snapshot=()=>({configuredTimeoutMs,revision,remainingMs:budget===null?null:status==='expired'?0:Math.ceil(left()),expiresAt:status==='active'&&budget!==null?clock.wallNow()+left():null,status});
  const notify=()=>{const value=snapshot();for(const listener of listeners)try{listener({...value});}catch{/* Observation is not an execution/control acknowledgement. */}};
  const expire=()=>{if(status!=='active')return;clock.clearTimeout(timer);timer=undefined;status='expired';budget=0;controller.abort(fault('TURN_TIMEOUT','Worker exceeded its live wall deadline'));notify();};
  const check=()=>{if(status==='active'&&left()<=0)expire();};
  const arm=()=>{clock.clearTimeout(timer);timer=undefined;if(status!=='active'||budget===null)return;if(left()<=0){expire();return;}timer=clock.setTimeout(()=>{timer=undefined;check();arm();},Math.min(MAX_TIMER_MS,Math.ceil(left())));};
  const handle={
    signal:controller.signal,
    start(){if(status!=='pending')throw fault('DEADLINE_INACTIVE','Worker deadline has already started');anchor=clock.now();status='active';arm();notify();return handle.snapshot();},
    remaining(){check();return status==='expired'?0:left();},
    snapshot(){check();return snapshot();},
    subscribe(listener){if(typeof listener!=='function')throw fault('DEADLINE_INPUT','Deadline subscriber must be a function');listeners.add(listener);return()=>listeners.delete(listener);},
    apply(change){
      check();
      if(status==='expired')throw fault('DEADLINE_EXPIRED','Expired worker deadlines cannot be revived');
      if(status==='closed')throw fault('DEADLINE_CLOSED','Worker deadline owner has closed');
      if(status!=='active')throw fault('DEADLINE_INACTIVE','Worker deadline has not started');
      if(!change||typeof change!=='object'||Array.isArray(change)||types.isProxy(change))throw fault('DEADLINE_INPUT','Provide a plain deadline update');
      const fields=Object.getOwnPropertyDescriptors(change);
      if(Reflect.ownKeys(fields).some(key=>!['operation','valueMs','expectedRevision'].includes(key)||!Object.hasOwn(fields[key],'value')))throw fault('DEADLINE_INPUT','Deadline updates require own data fields');
      change=Object.fromEntries(Object.entries(fields).map(([key,descriptor])=>[key,descriptor.value]));
      if(!['set','extend','clear'].includes(change.operation)||!Number.isSafeInteger(change.expectedRevision)||change.expectedRevision<0||(change.operation==='clear'?Object.hasOwn(change,'valueMs'):!valid(change.valueMs)))throw fault('DEADLINE_INPUT','Provide a deadline operation, expected revision and positive safe milliseconds when required');
      if(change.expectedRevision!==revision)throw fault('DEADLINE_REVISION','Worker deadline revision changed');
      const next=change.operation==='clear'?null:change.operation==='set'?change.valueMs:Math.ceil(left())+change.valueMs;
      if(next!==null&&!valid(next)||revision===Number.MAX_SAFE_INTEGER)throw fault('DEADLINE_INPUT','Deadline extension requires a finite budget without overflow');
      budget=next;anchor=clock.now();revision++;arm();notify();return handle.snapshot();
    },
    close(){if(status==='closed')return;check();budget=status==='expired'?0:budget===null?null:left();clock.clearTimeout(timer);timer=undefined;status='closed';notify();listeners.clear();},
  };
  return Object.freeze(handle);
}
