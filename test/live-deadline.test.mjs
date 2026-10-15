// @lane merge
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDeadlines} from '../engine/deadlines.mjs';
async function factory(){const module=await import('../engine/live-deadline.mjs').catch(()=>null);assert.equal(typeof module?.createLiveDeadline,'function','shared live worker deadline must exist');return module.createLiveDeadline;}
function clock(){let now=0,id=0;const timers=new Map(),delays=[];return {now:()=>now,wallNow:()=>1700000000000+now,setTimeout(fn,ms){assert.ok(ms>0&&ms<=2147483647);delays.push(ms);const key=++id;timers.set(key,{at:now+ms,fn});return key;},clearTimeout(key){timers.delete(key);},advance(ms){const end=now+ms;for(;;){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=end;},get pending(){return timers.size;},delays};}

test('new workers are unbounded while saved and explicit finite budgets remain exact',()=>{
 assert.equal(resolveDeadlines().workerTimeoutMs,null);
 assert.equal(resolveDeadlines({}, {workerTimeoutMs:null}).workerTimeoutMs,null);
 assert.equal(resolveDeadlines({}, {workerTimeoutMs:600000}).workerTimeoutMs,600000);
 assert.equal(resolveDeadlines({workerTimeoutMs:2**32}).workerTimeoutMs,2**32);
 for(const value of [0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>resolveDeadlines({workerTimeoutMs:value}),{code:'RUN_INPUT'});
});
test('unbounded wall time has no timer and explicit live set extend clear preserve initial policy',async()=>{
 const create=await factory(),c=clock(),d=create(null,{clock:c}),changes=[];d.subscribe(s=>changes.push(s));
 assert.equal(d.snapshot().status,'pending');assert.throws(()=>d.apply({operation:'set',valueMs:5,expectedRevision:0}),{code:'DEADLINE_INACTIVE'});
 d.start();c.advance(2**33);assert.equal(d.signal.aborted,false);assert.equal(c.pending,0);assert.equal(d.remaining(),Infinity);
 d.apply({operation:'set',valueMs:100,expectedRevision:0});c.advance(40);assert.equal(d.remaining(),60);
 d.apply({operation:'extend',valueMs:80,expectedRevision:1});c.advance(70);assert.equal(d.remaining(),70);
 assert.throws(()=>d.apply({operation:'clear',expectedRevision:1}),{code:'DEADLINE_REVISION'});
 d.apply({operation:'clear',expectedRevision:2});c.advance(2**33);assert.equal(d.signal.aborted,false);assert.equal(c.pending,0);
 assert.equal(d.snapshot().configuredTimeoutMs,null);assert.equal(d.snapshot().revision,3);assert.equal(d.snapshot().expiresAt,null);
 assert.ok(changes.length>=4);d.close();assert.equal(d.snapshot().status,'closed');assert.throws(()=>d.apply({operation:'set',valueMs:2,expectedRevision:3}),{code:'DEADLINE_CLOSED'});
});
test('shortening expires once and expiry cannot be revived or bypassed by a stale timer',async()=>{
 const create=await factory(),c=clock(),d=create(100,{clock:c});let aborted=0;d.signal.addEventListener('abort',()=>aborted++);d.start();c.advance(20);
 d.apply({operation:'set',valueMs:5,expectedRevision:0});c.advance(5);assert.equal(d.signal.reason.code,'TURN_TIMEOUT');assert.equal(aborted,1);assert.equal(d.snapshot().status,'expired');
 assert.throws(()=>d.apply({operation:'clear',expectedRevision:1}),{code:'DEADLINE_EXPIRED'});c.advance(1000);assert.equal(aborted,1);d.close();assert.equal(c.pending,0);
});
test('long budgets use bounded timer chunks without early expiry; close prevents late expiration',async()=>{
 const create=await factory(),c=clock(),d=create(2**32+30,{clock:c});d.start();c.advance(2147483647);assert.equal(d.signal.aborted,false);assert.equal(c.pending,1);c.advance(2147483647);assert.equal(d.remaining(),32);c.advance(31);assert.equal(d.signal.aborted,false);c.advance(1);assert.equal(d.signal.aborted,true);
 const end=create(5,{clock:c});end.start();end.close();c.advance(50);assert.equal(end.signal.aborted,false);
});
test('malformed live updates have no side effect and unbounded extension needs an explicit set',async()=>{
 const create=await factory(),c=clock(),d=create(null,{clock:c});d.start();
 for(const change of [{operation:'set',valueMs:0,expectedRevision:0},{operation:'set',valueMs:Infinity,expectedRevision:0},{operation:'clear',valueMs:1,expectedRevision:0},{operation:'extend',valueMs:5,expectedRevision:0},{operation:'set',valueMs:5,expectedRevision:0,extra:true}])assert.throws(()=>d.apply(change));
 assert.equal(d.snapshot().revision,0);assert.equal(d.remaining(),Infinity);d.close();
});


test('deadline updates refuse accessors without invoking caller code',async()=>{
 const create=await factory(),d=create(null);d.start();let invoked=0;
 const change={operation:'set',expectedRevision:0,get valueMs(){invoked++;return 5;}};
 assert.throws(()=>d.apply(change),{code:'DEADLINE_INPUT'});assert.equal(invoked,0);assert.equal(d.snapshot().revision,0);d.close();
});
