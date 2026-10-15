// @lane merge
// @subject foundation/turn.mjs
// @subject foundation/client.mjs
// @subject foundation/tool-observation.mjs
// @subject test/fixtures/foundation-server.mjs
// @subject test/fixtures/tool-observation-server.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AppServer } from '../foundation/client.mjs';

async function setup(t, mode = '') {
  const client = await AppServer.connect({ command: process.execPath, args: [fileURLToPath(new URL('./fixtures/foundation-server.mjs', import.meta.url)), mode], shutdownMs: 100 });
  t.after(() => client.close());
  const module = await import('../foundation/turn.mjs').catch(() => null);
  assert.ok(module?.runTurn, 'Fresh turn runner must exist');
  return { client, runTurn: module.runTurn };
}

test('concurrent turns route early notifications by thread and confirmed turn ID', async t => {
  const { client, runTurn } = await setup(t);
  const results = await Promise.all(['one', 'two'].map(threadId => runTurn(client, { threadId, prompt: 'fixture', timeoutMs: 1000 })));
  assert.deepEqual(results.map(result => result.text), ['one', 'two']);
  assert.deepEqual(results.map(result => result.turnId), ['turn-one', 'turn-two']);
});

test('large cumulative tool output keeps bounded previews and final command outcomes',async t=>{
  const {client,runTurn}=await setup(t,'turn-verbose');let streamed=0,terminalEvents=0;
  const result=await runTurn(client,{threadId:'one',prompt:'fixture',timeoutMs:3000,onEvent:message=>{
    if(message.method==='item/commandExecution/outputDelta')streamed++;
    if(message.method==='turn/completed')terminalEvents++;
  }});
  assert.equal(result.text,'Known command failure reported.');assert.equal(result.status,'completed');
  const item=result.items.find(item=>item.id==='read');
  assert.equal(item.status,'failed');assert.equal(item.exitCode,7);assert.ok(item.aggregatedOutput.length<=4000);
  assert.ok(item.truncated.includes('aggregatedOutput'));assert.equal(result.items.filter(item=>item.id==='read').length,1);
  assert.equal(streamed,80);assert.equal(terminalEvents,1);assert.ok(result.output.observedBytes>1024*1024);
  assert.equal(result.output.truncatedItems,1);assert.ok(Buffer.byteLength(JSON.stringify(result))<32000);
  assert.equal(await client.request('interrupt-count',{}),0);
});

test('final answer size remains a hard bounded failure without silent truncation',async t=>{
  const {client,runTurn}=await setup(t,'turn-answer-limit');
  await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture',timeoutMs:3000}),{code:'TURN_OUTPUT_LIMIT'});
});

test('default transport admits a 2 MiB UTF-8 tool frame and snapshots with bounded retained output',async t=>{
  const {client,runTurn}=await setup(t,'turn-large-frame');
  let deltas=0,completed=0,terminals=0;
  const result=await runTurn(client,{threadId:'one',prompt:'fixture',timeoutMs:15000,onEvent:message=>{
    if(message.method==='item/commandExecution/outputDelta'){
      deltas++; assert.equal(Buffer.byteLength(message.params.delta),2*1024*1024);
      assert.ok(message.params.delta.startsWith('café 🧪|')); assert.ok(message.params.delta.endsWith('|fin 🧪'));
      assert.equal(message.params.delta.includes('\uFFFD'),false);
    }
    if(message.method==='item/completed'&&message.params.item.id==='read')completed++;
    if(message.method==='turn/completed')terminals++;
  }});
  assert.equal(result.status,'completed'); assert.equal(result.text,'Read complete.');
  const item=result.items.find(value=>value.id==='read');
  assert.equal(item.status,'completed'); assert.equal(item.exitCode,0);
  assert.ok(item.aggregatedOutput.startsWith('café 🧪|')); assert.equal(item.aggregatedOutput.includes('\uFFFD'),false);
  assert.ok(item.aggregatedOutput.length<=4000); assert.ok(item.truncated.includes('aggregatedOutput'));
  assert.equal(result.items.filter(value=>value.id==='read').length,1);
  assert.equal(deltas,1); assert.equal(completed,1); assert.equal(terminals,1);
  assert.equal(result.output.truncatedItems,1); assert.ok(result.output.retainedBytes<=1024*1024);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<32000); assert.ok(result.output.observedBytes>6*1024*1024);
  assert.equal(await client.request('echo',{value:'still routed',delay:0}),'still routed');
  assert.equal(await client.request('interrupt-count'),0);
  assert.equal((await client.close()).serverExited,true);
});

test('terminal snapshots cannot erase known message phases or promote progress into the answer',async t=>{
  const {client,runTurn}=await setup(t,'turn-phase-snapshot');
  const result=await runTurn(client,{threadId:'one',prompt:'fixture'});
  assert.deepEqual(JSON.parse(result.text),{count:2});
  assert.equal(result.items.find(item=>item.id==='progress').phase,'commentary');
  assert.equal(result.items.find(item=>item.id==='answer').phase,'final_answer');
  assert.equal(result.output.answer.selection,'explicit');
  assert.equal(result.output.answer.selectedItems,1);
});

test('explicit final answers take precedence over unphased messages with bounded selection diagnostics',async t=>{
  const {client,runTurn}=await setup(t,'turn-phase-explicit');
  const result=await runTurn(client,{threadId:'one',prompt:'fixture'});
  assert.deepEqual(JSON.parse(result.text),{count:2});
  assert.deepEqual(result.output.answer,{selection:'explicit',selectedItems:1,phases:{final:1,commentary:0,unphased:1,other:0},bytes:11,sha256:createHash('sha256').update('{"count":2}').digest('hex')});
  assert.doesNotMatch(JSON.stringify(result.output.answer),/PRIVATE_PROGRESS|count/);
});

async function messageTurn(messages,snapshot=messages,started=[]){
  const {runTurn}=await import('../foundation/turn.mjs');let notify;const observed=[];
  const client={onFailure(){return()=>{};},onNotification(fn){notify=fn;return()=>{};},async request(){
    for(const item of started)notify({method:'item/started',params:{threadId:'thread',turnId:'turn',item}});
    for(const item of messages)notify({method:'item/completed',params:{threadId:'thread',turnId:'turn',item}});
    notify({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed',items:snapshot}}});
    return{turn:{id:'turn'}};
  }};
  const result=await runTurn(client,{threadId:'thread',prompt:'fixture',onEvent:message=>observed.push(message)});
  return{result,observed};
}
for(const [phase,answerPhase] of [['final_answer','final_answer'],[undefined,undefined],['final_answer',undefined]])test(`async ${phase??'legacy'} notices cannot contaminate ${answerPhase??'legacy'} JSON answers`,async()=>{
  const notice={id:'notice',type:'agentMessage',phase,delivery:'async',text:'PRIVATE_NOTICE '+ 'x'.repeat(20000)};
  const answer={id:'answer',type:'agentMessage',phase:answerPhase,text:'{"count":2}'};
  const {result,observed}=await messageTurn([notice,answer],[{...notice,phase:undefined,delivery:undefined},{...answer,phase:undefined}]);
  assert.deepEqual(JSON.parse(result.text),{count:2});assert.equal(result.items.length,2);
  assert.equal(result.items.find(item=>item.id==='notice').delivery,'async');
  assert.ok(result.items.find(item=>item.id==='notice').truncated.includes('text'));
  assert.equal(observed.filter(message=>message.params.item?.id==='notice').length,1);
  assert.equal(result.output.answer.selectedItems,1);assert.deepEqual(result.output.answer.excludedDelivery,{async:1,unsupported:0});
  assert.ok(Buffer.byteLength(JSON.stringify(result.output.answer))<500);
  assert.doesNotMatch(JSON.stringify(result.output.answer),/PRIVATE_NOTICE|count/);
});
test('start-only async metadata excludes later omissions without promoting unfinished messages',async()=>{
 const notice={id:'notice',type:'agentMessage',phase:'final_answer',delivery:'async',text:'PRIVATE_NOTICE'};
 const omitted={id:'notice',type:'agentMessage',phase:'final_answer',text:'PRIVATE_NOTICE'};
 const answer={id:'answer',type:'agentMessage',phase:'final_answer',text:'{"count":2}'};
 const unfinished={id:'unfinished',type:'agentMessage',phase:'final_answer',text:'PRIVATE_UNFINISHED'};
 const {result}=await messageTurn([omitted,answer],[omitted,answer],[notice,unfinished]);
 assert.deepEqual(JSON.parse(result.text),{count:2});
 assert.equal(result.items.find(item=>item.id==='notice').delivery,'async');
 assert.equal(result.items.some(item=>item.id==='unfinished'),false);
 assert.deepEqual(result.output.answer.excludedDelivery,{async:1,unsupported:0});
});

test('only async or unsupported delivery messages remain observable with no terminal answer',async()=>{
  const {result}=await messageTurn([
    {id:'async',type:'agentMessage',phase:'final_answer',delivery:'async',text:'{"count":2}'},
    {id:'future',type:'agentMessage',phase:'final_answer',delivery:'future-delivery',text:'{"count":3}'}
  ],[{id:'async',type:'agentMessage',text:'{"count":2}'},{id:'future',type:'agentMessage',text:'{"count":3}'}]);
  assert.equal(result.text,'');assert.equal(result.output.answer.selection,'none');
  assert.equal(result.items.find(item=>item.id==='future').delivery,'future-delivery');
  assert.deepEqual(result.output.answer.excludedDelivery,{async:1,unsupported:1});
});

for(const phase of ['commentary','partial_answer'])test(`start-only ${phase} metadata cannot become a legacy answer after omission`,async()=>{
 const notice={id:'notice',type:'agentMessage',phase,text:'PRIVATE_PROGRESS'},omitted={id:'notice',type:'agentMessage',text:'PRIVATE_PROGRESS'};
 const answer={id:'answer',type:'agentMessage',text:'{"count":2}'};
 const {result}=await messageTurn([omitted,answer],[omitted,answer],[notice]);
 assert.deepEqual(JSON.parse(result.text),{count:2});assert.equal(result.items.find(item=>item.id==='notice').phase,phase);
});

test('unfinished exclusion metadata is bounded without promoting started text',async()=>{
 const {runTurn}=await import('../foundation/turn.mjs');let notify;
 const client={onFailure(){return()=>{};},onNotification(fn){notify=fn;return()=>{};},async request(){
  for(let i=0;i<1025;i++)notify({method:'item/started',params:{threadId:'thread',turnId:'turn',item:{id:`notice-${i}`,type:'agentMessage',phase:'commentary',text:'unfinished'}}});
  notify({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed',items:[]}}});return{turn:{id:'turn'}};
 }};
 await assert.rejects(runTurn(client,{threadId:'thread',prompt:'fixture'}),{code:'TURN_OUTPUT_LIMIT'});
});
test('legacy ordinary answers deduplicate by item ID and preserve exact text',async()=>{
  const answer={id:'answer',type:'agentMessage',text:'Do not salvage {"count":2}'};
  const {result}=await messageTurn([answer,answer],[answer]);
  assert.equal(result.text,answer.text);assert.equal(result.output.answer.selection,'legacy');
  assert.equal(result.output.answer.selectedItems,1);assert.throws(()=>JSON.parse(result.text));
});
test('contradictory final answers cannot silently select a convenient JSON object',async()=>{
  const {result}=await messageTurn([2,3].map(count=>({id:`answer-${count}`,type:'agentMessage',phase:'final_answer',text:JSON.stringify({count})})));
  assert.equal(result.text,'{"count":2}\n{"count":3}');assert.throws(()=>JSON.parse(result.text));
  assert.equal(result.output.answer.selectedItems,2);
});

async function toolTurn(t,mode='pairs'){
  const client=await AppServer.connect({command:process.execPath,args:[fileURLToPath(new URL('./fixtures/tool-observation-server.mjs',import.meta.url)),mode],shutdownMs:100});
  t.after(()=>client.close());const {runTurn}=await import('../foundation/turn.mjs');const events=[];
  const result=await runTurn(client,{threadId:'thread',prompt:'fixture',timeoutMs:3000,onEvent:message=>events.push(message)});
  // An explicit acknowledgement proves late output was delivered after completion.
  await client.request('late-output');
  return{client,result,events};
}
test('raw native tools are projected before early retention and paired only by confirmed identities',async t=>{
  const {client,result,events}=await toolTurn(t);
  const tools=result.output.toolObservations;
  assert.ok(tools,'safe native tool coverage must be retained');
  const byId=Object.fromEntries(tools.observations.map(value=>[value.callId,value]));
  assert.equal(byId.reject.outcome,'reportedRejected');assert.equal(byId.reject.callObserved,true);assert.equal(byId.reject.outputObserved,true);
  assert.equal(byId.reordered.outcome,'reportedSucceeded');
  assert.equal(byId.conflict.outcome,'unknown');assert.equal(byId.conflict.ambiguous,true);
  assert.equal(byId.orphan.outcome,'unknown');assert.equal(byId.orphan.outputObserved,false);
  assert.equal(byId.outputOnly.callObserved,false);assert.equal(byId.outputOnly.outcome,'unknown');
  assert.equal(byId.unnamedOrphan,undefined,'An unnamed orphan output cannot invent a tool identity');
  assert.equal(byId.namespaced.outcome,'unknown');assert.equal(byId.namespaced.namespace,'unverified');
  assert.equal(byId.contentArray.outcome,'unknown');assert.equal(byId.function.tool,'apply_patch');assert.equal(byId.function.outcome,'unknown');
  assert.equal(byId.malformed.outcome,'unknown');assert.equal(byId.familyConflict.outcome,'unknown');
  assert.equal(byId.toolConflict.outcome,'unknown');assert.equal(byId.namespaceConflict.outcome,'unknown');
  assert.equal(byId.reused.outcome,'unknown');assert.equal(byId.reused.ambiguous,true);
  assert.equal(byId.foreignOutput.outputObserved,false);assert.equal(byId.unrecognized.outcome,'unknown');
  assert.equal(byId.ambiguousOutput.outcome,'unknown');assert.equal(byId.malformedInput.outcome,'unknown');
  assert.equal(byId.failed.outcome,'reportedFailed');assert.equal(byId.missingName,undefined);
  assert.equal(byId.reject.tool,'exec','A rejected nested patch remains an exec wrapper observation');
  assert.equal(byId.directPatch.tool,'apply_patch');assert.equal(byId.directPatch.outcome,'unknown','Script wrappers cannot report direct apply_patch outcomes');
  assert.equal(byId.wait.tool,'wait');assert.equal(byId.wait.outcome,'reportedSucceeded');
  assert.equal(byId.namedExec.tool,'exec');assert.equal(byId.namedExec.outcome,'reportedSucceeded');
  assert.equal(byId.crlf.outcome,'reportedSucceeded');
  assert.equal(byId.overhead.outcome,'reportedSucceeded');
  assert.equal(byId.functionExec.tool,'exec');assert.equal(byId.functionExec.outcome,'unknown','Pinned Script wrappers belong to custom code-mode calls');
  for(const id of ['supportedConflict','reorderedConflict','duplicateName']){
    assert.equal(byId[id].tool,'exec');assert.equal(byId[id].ambiguous,true);assert.equal(byId[id].outcome,'unknown');
  }
  for(const id of ['outputNamespace','nullNamespace']){
    assert.equal(byId[id].namespace,'unverified');assert.equal(byId[id].outcome,'unknown');
  }
  assert.equal(byId.execOutputOnly.tool,'exec');assert.equal(byId.execOutputOnly.callObserved,false);assert.equal(byId.execOutputOnly.outcome,'unknown');
  assert.equal(byId.waitOrphan.tool,'wait');assert.equal(byId.waitOrphan.outputObserved,false);assert.equal(byId.waitOrphan.outcome,'unknown');
  for(const id of ['emptyArray','singlePart','extraPart','mixedContent','missingText','extraFields','secondaryFields','nullPart','reorderedHeader',
    'secondaryHeader','latePrimaryHeader','lateSecondaryHeader','embeddedPrimaryHeader','embeddedSecondaryHeader','repeatedHeader',
    'secondaryRunning','completedError','combinedHeaderBody','extraHeaderNewline','missingFailureDetail','missingFailurePrefix','malformedOverhead','malformedHeader','running','stringOutput']){
    assert.equal(byId[id].tool,'exec');assert.equal(byId[id].outcome,'unknown',id);
  }
  assert.equal(byId.foreign,undefined);
  assert.equal(tools.capability,'unverified');assert.ok(tools.counters.duplicate>=2);assert.ok(tools.counters.conflicting>=2);
  assert.ok(tools.counters.malformed>=2);assert.ok(tools.counters.discarded>=2);
  assert.ok(tools.counters.missingCall>=2);assert.ok(tools.counters.missingOutput>=1);
  const raw=events.filter(message=>message.method==='rawResponseItem/completed');assert.ok(raw.length>0);
  assert.equal(raw.filter(message=>message.params.toolObservation.callId==='reject').length,2);
  assert.equal(raw.filter(message=>message.params.toolObservation.callId==='conflict').length,3);
  assert.ok(raw.every(message=>['exec','wait','apply_patch'].includes(message.params.toolObservation?.tool)&&!Object.hasOwn(message.params,'item')));
  const safeKeys=['tool','callId','family','namespace','callObserved','outputObserved','outcome','ambiguous'].sort();
  for(const value of [...tools.observations,...raw.map(message=>message.params.toolObservation)])assert.deepEqual(Object.keys(value).sort(),safeKeys);
  const {projectToolEvent}=await import('../foundation/tool-observation.mjs');
  const oversized=projectToolEvent({method:'rawResponseItem/completed',params:{threadId:'thread',turnId:'turn',item:{
    type:'custom_tool_call_output',call_id:'oversized',name:'exec',output:[{type:'input_text',text:'Script completed\nWall time 0.1 seconds\nOutput:\n'},
      {type:'input_text',text:'💡'.repeat(300000)}],reasoning:'SECRET_REASONING'}}});
  assert.equal(oversized.outcome,'unknown','Oversized bodies cannot bypass bounded wrapper inspection');
  assert.ok(Buffer.byteLength(JSON.stringify(oversized))<500);assert.doesNotMatch(JSON.stringify(oversized),/SECRET_|💡|sha256|hash|input_text|Script completed/);
  assert.ok(events.every(message=>message.params.threadId==='thread'&&(message.params.turnId??message.params.turn?.id)==='turn'));
  const terminal=events.find(message=>message.method==='turn/completed');assert.deepEqual(terminal.params.toolObservationSummary.counters,tools.counters);
  assert.doesNotMatch(JSON.stringify({result,events}),/SECRET_|Bearer|private@example|encrypted|arguments|patch bytes|Script error/);
  assert.equal(await client.request('interrupt-count'),0);
  assert.deepEqual(await client.close(),{serverExited:true,forced:false,descendants:'notVerified'});
});
test('foreign and malformed raw identities are discarded with persisted terminal coverage',async t=>{
  const {result,events}=await toolTurn(t,'foreign-only');const tools=result.output.toolObservations;
  assert.deepEqual(tools.observations,[]);assert.equal(tools.observed,0);
  assert.equal(tools.counters.foreign,1);assert.equal(tools.counters.malformed,1);assert.equal(tools.counters.discarded,2);
  assert.deepEqual(events.find(message=>message.method==='turn/completed').params.toolObservationSummary.counters,tools.counters);
});
for(const mode of ['early-overflow','confirmed-overflow'])test(`${mode} bounds safe tool observation without cancelling a valid answer`,async t=>{
  const {result,events}=await toolTurn(t,mode);const tools=result.output.toolObservations;
  assert.equal(result.text,'{"count":2}');assert.ok(tools.observations.length<=256);
  assert.ok(tools.counters.discarded>0);assert.ok(tools.counters.overflow>0);
  if(mode==='early-overflow')assert.ok(tools.counters.unconfirmedDiscarded>0);
  assert.ok(tools.observations.every(value=>value.tool==='exec'&&value.outcome==='unknown'&&!value.outputObserved));
  assert.ok(events.filter(message=>message.method==='rawResponseItem/completed').length<=256);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<120000);
});

for(const cause of ['timeout','oversize'])test(`shared ${cause} failure preserves active turn history without transferring pre-start annotations`,async t=>{
  const {client,runTurn}=await setup(t,'turn-hang-after-command');let announce;
  const active=new Promise(resolve=>{announce=resolve;});
  const turn=runTurn(client,{threadId:'running',prompt:'fixture',onEvent:message=>{if(message.method==='item/completed')announce();},interruptTimeoutMs:100}).catch(error=>error);
  await active;
  const failed=await (cause==='timeout'?client.request('hang',{}, {timeoutMs:20}):client.request('frame',{bytes:16*1024*1024+1,terminated:true},{timeoutMs:15000})).catch(error=>{error.notStarted=true;error.evidence={privateToOtherWorker:true};return error;});
  const result=await turn;
  assert.notEqual(result,failed);
  assert.equal(result.notStarted,undefined);assert.equal(result.evidence,undefined);
  assert.equal(result.code,cause==='timeout'?'REQUEST_TIMEOUT':'PROTOCOL_LIMIT');
  assert.equal(result.interruption.terminalObserved,false);assert.equal(result.interruption.terminalStatus,null);
  assert.deepEqual(result.output.commandEvidence,{coverage:'retainedItemsOnly',commands:[{status:'completed',exitCode:0}]});
  assert.ok(result.output.observedMessages>0);
  await assert.rejects(runTurn(client,{threadId:'running',prompt:'must not retry'}),{code:'THREAD_BUSY'});
  const late=await client.request('echo',{}).catch(error=>error);assert.equal(late.notStarted,undefined);
  assert.equal(late.code,result.code);
  const cleanup=await client.close();assert.equal(cleanup.serverExited,true);assert.equal(cleanup.descendants,'notVerified');
});

test('native turns forward explicit model reasoning and output schema unchanged',async t=>{
  const {client,runTurn}=await setup(t,'turn-settings');
  const outputSchema={type:'object',properties:{count:{type:'integer'}},required:['count'],additionalProperties:false};
  const result=await runTurn(client,{threadId:'one',prompt:'fixture',model:'fixture-model',effort:'high',outputSchema});
  assert.deepEqual(JSON.parse(result.text),{model:'fixture-model',effort:'high',outputSchema});
});

test('writer turns carry the exact owned roots and exclude temporary write grants',async t=>{
  const {client,runTurn}=await setup(t,'turn-writer-policy');const {writerPolicy}=await import('../engine/workspace-policy.mjs');
  const cwd=fileURLToPath(new URL('.',import.meta.url)),execution=writerPolicy(cwd).turn;
  const result=await runTurn(client,{threadId:'one',prompt:'fixture',execution});assert.deepEqual(JSON.parse(result.text),execution);
});

test('live activity routes early tool output and usage only to the confirmed worker turn',async t=>{
  const {client,runTurn}=await setup(t,'turn-activity');
  const seen=new Map();
  await Promise.all(['one','two'].map(threadId=>runTurn(client,{threadId,prompt:'fixture',onActive:identity=>{assert.equal(identity.threadId,threadId);seen.set(threadId,[]);},onEvent:event=>{
    assert.ok(seen.has(threadId),'turn identity confirmed before activity');
    assert.equal(event.params.threadId,threadId);assert.equal(event.params.turnId??event.params.turn?.id,`turn-${threadId}`);seen.get(threadId).push(event);
  }})));
  for(const [threadId,events] of seen){
    assert.equal(events.filter(event=>event.method==='item/started').length,1);
    assert.equal(events.find(event=>event.method==='item/commandExecution/outputDelta').params.delta,threadId+' output');
    assert.equal(events.filter(event=>event.method==='thread/tokenUsage/updated').length,1);
    assert.equal(events.filter(event=>event.method==='turn/completed').length,1);
    assert.doesNotMatch(JSON.stringify(events),/RAW_REASONING|WRONG/);
  }
  assert.equal(seen.size,2);
});

test('activity persistence failure interrupts a live turn and preserves the primary error',async t=>{
  const {client,runTurn}=await setup(t,'turn-hang');
  await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture',timeoutMs:300,onActive:()=>{throw new Error('fixture persistence failure');}}),error=>{
    assert.equal(error.message,'fixture persistence failure');assert.equal(error.interruption.terminalObserved,true);return true;
  });
  assert.equal(await client.request('interrupt-count',{}),1);
});

for(const cancellation of [true,false])test(`${cancellation?'cancellation':'timeout'} output metrics include the observed interruption terminal`,async()=>{
  const {runTurn}=await import('../foundation/turn.mjs');let notify,retired=false;const abort=new AbortController(),events=[];
  const client={onFailure(){return()=>{};},onNotification(fn){notify=fn;return()=>{retired=true;};},request(method){
    if(method==='turn/start')return new Promise(resolve=>setImmediate(()=>{
      resolve({turn:{id:'turn'}});queueMicrotask(()=>{
        for(let i=0;i<3;i++)notify({method:'item/agentMessage/delta',params:{threadId:'thread',turnId:'turn',itemId:'progress',delta:String(i)}});
        if(cancellation)abort.abort();
      });
    }));
    assert.equal(method,'turn/interrupt');
    notify({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'interrupted',items:[]}}});
    return Promise.resolve({});
  }};
  await assert.rejects(runTurn(client,{threadId:'thread',prompt:'fixture',signal:abort.signal,timeoutMs:40,interruptTimeoutMs:100,onEvent:message=>events.push(message)}),error=>{
    assert.equal(error.code,cancellation?'TURN_CANCELLED':'TURN_TIMEOUT');assert.equal(error.interruption.terminalObserved,true);
    assert.equal(events.at(-1).method,'turn/completed');assert.equal(events.length,4);
    assert.equal(error.output.observedMessages,events.length);
    assert.equal(error.output.observedBytes,events.reduce((sum,message)=>sum+Buffer.byteLength(JSON.stringify(message)),0));
    assert.equal(retired,true);return true;
  });
});

test('early completed turn cannot mask an activity persistence failure',async t=>{
  const {client,runTurn}=await setup(t,'turn-activity');
  await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture',onEvent:()=>{throw new Error('fixture lost activity');}}),/fixture lost activity/);
});

test('completion in the start acknowledgement microtask cannot mask lost activity',async()=>{
  const {runTurn}=await import('../foundation/turn.mjs');let notify;
  const client={onFailure(){return()=>{};},onNotification(fn){notify=fn;return()=>{};},request(method){
    if(method==='turn/start')return new Promise(resolve=>setImmediate(()=>{
      resolve({turn:{id:'turn'}});
      queueMicrotask(()=>notify({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed',items:[{id:'answer',type:'agentMessage',text:'ACCEPTED'}]}}}));
    }));
    return Promise.resolve({});
  }};
  await assert.rejects(runTurn(client,{threadId:'thread',prompt:'fixture',onEvent(){throw Object.assign(new Error('Persistence failed'),{code:'REVIEW_PERSISTENCE'});}}),{code:'REVIEW_PERSISTENCE'});
});

test('terminal item collections exclude raw reasoning from activity and returned evidence',async()=>{
  const {runTurn}=await import('../foundation/turn.mjs');let notify;const observed=[];
  const client={onFailure(){return()=>{};},onNotification(fn){notify=fn;return()=>{};},async request(){
    notify({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed',items:[{id:'reason',type:'reasoning',content:['RAW_REASONING']},{id:'answer',type:'agentMessage',text:'Answer'}]}}});
    return{turn:{id:'turn'}};
  }};
  const result=await runTurn(client,{threadId:'thread',prompt:'fixture',onEvent:event=>observed.push(event)});
  assert.equal(result.text,'Answer');assert.doesNotMatch(JSON.stringify({result,observed}),/RAW_REASONING/);
});

test('steering targets the confirmed active turn and rejects stale or retired identity',async t=>{
  const {client,runTurn}=await setup(t,'turn-steer');
  const module=await import('../foundation/turn.mjs');assert.equal(typeof module.steerTurn,'function');
  let confirm;const ready=new Promise(resolve=>{confirm=resolve;});
  const running=runTurn(client,{threadId:'one',prompt:'fixture',timeoutMs:1500,onActive:confirm});
  const identity=await ready;
  await assert.rejects(module.steerTurn(client,{...identity,turnId:'stale',text:'Change direction'}),{code:'CONTROL_TURN'});
  assert.deepEqual(await module.steerTurn(client,{...identity,text:'Return STEERED'}),{turnId:identity.turnId});
  assert.equal((await running).text,'STEERED');
  await assert.rejects(module.steerTurn(client,{...identity,text:'Too late'}),{code:'CONTROL_TURN'});
});

test('failed terminal turn is never an accepted result', async t => {
  const { client, runTurn } = await setup(t, 'turn-failed');
  await assert.rejects(runTurn(client, { threadId: 'one', prompt: 'fixture' }), error => {
    assert.equal(error.code, 'TURN_FAILED');
    assert.match(error.message, /runner pipe-in/);
    assert.doesNotMatch(error.message, /REVIEW_SECRET_SENTINEL|private@example/);
    return true;
  });
});

test('connection loss rejects a running turn without waiting for its deadline', async t => {
  const { client, runTurn } = await setup(t, 'turn-exit');
  await assert.rejects(runTurn(client, { threadId: 'one', prompt: 'fixture', timeoutMs: 2000 }), { code: 'SERVER_EXIT' });
});

for (const [mode, terminalObserved] of [['turn-hang', true], ['turn-hang-ignore', false]]) {
  test(`turn deadline retains timeout and reports interruption evidence for ${mode}`, async t => {
    const { client, runTurn } = await setup(t, mode);
    await assert.rejects(runTurn(client, { threadId: 'one', prompt: 'fixture', timeoutMs: 100, interruptTimeoutMs: 100 }), error => {
      assert.equal(error.code, 'TURN_TIMEOUT');
      assert.equal(error.interruption.terminalObserved, terminalObserved);
      return true;
    });
  });
}

test('already cancelled turn does not dispatch or reserve the thread', async t => {
  const {client,runTurn}=await setup(t);
  await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture',signal:AbortSignal.abort()}),{code:'TURN_CANCELLED',notStarted:true});
  assert.equal((await runTurn(client,{threadId:'one',prompt:'fixture'})).text,'one');
});

test('late start acknowledgement cannot dispatch interruption after the cancellation deadline', async t=>{
  const {client,runTurn}=await setup(t,'turn-late-start');
  const abort=new AbortController();
  t.after(client.onNotification(message=>{if(message.method==='turn/started')abort.abort();}));
  await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture',signal:abort.signal,interruptTimeoutMs:50}),error=>{
    assert.equal(error.code,'TURN_CANCELLED');assert.equal(error.interruption.terminalObserved,false);return true;
  });
  assert.equal(await client.request('interrupt-count',{}),0);
  await client.request('echo',{delay:350,value:'past delayed acknowledgement'});
  assert.equal(await client.request('interrupt-count',{}),0);
  await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture'}),{code:'THREAD_BUSY'});
});

for(const [mode,terminalObserved] of [['turn-hang',true],['turn-delayed-start',true],['turn-hang-ignore',false],['turn-hang-complete',true]]) {
  test(`cancellation interrupts the confirmed turn and retains evidence for ${mode}`,async t=>{
    const {client,runTurn}=await setup(t,mode);
    const abort=new AbortController();
    const unsubscribe=client.onNotification(message=>{if(message.method==='turn/started')abort.abort();});
    t.after(unsubscribe);
    await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture',signal:abort.signal,timeoutMs:1500,interruptTimeoutMs:150}),error=>{
      assert.equal(error.code,'TURN_CANCELLED');
      assert.equal(error.interruption.terminalObserved,terminalObserved);
      assert.equal(error.interruption.terminalStatus,terminalObserved?(mode==='turn-hang-complete'?'completed':'interrupted'):null);
      assert.equal(error.interruption.descendants,'notVerified');
      return true;
    });
    if(!terminalObserved)await assert.rejects(runTurn(client,{threadId:'one',prompt:'fixture'}),{code:'THREAD_BUSY'});
  });
}
