import { fault, remoteDiagnostic } from './client.mjs';
import {createHash} from 'node:crypto';
import {TOOL_METHOD,EARLY_TOOL_LIMIT,boundedToolId,projectToolEvent,createToolObserver} from './tool-observation.mjs';

// One outstanding turn per thread. The caller owns the server and its shutdown.
// A terminal turn acknowledges harness completion, not arbitrary process drain.
const active = new WeakMap();
const confirmed=new WeakMap();
const activityMethods=new Set(['item/started','item/completed','item/commandExecution/outputDelta','item/agentMessage/delta','turn/plan/updated','turn/diff/updated','thread/tokenUsage/updated','turn/completed']);
const finalAnswer=item=>item.type==='agentMessage'&&item.delivery==null&&(item.phase==null||item.phase==='final_answer');
function itemPreview(item){
  if(finalAnswer(item))return item;
  const preview={...item},truncated=[];
  for(const key of ['command','cwd','aggregatedOutput','text','arguments','result','error','changes','delivery']){
    const value=preview[key];if(value===undefined)continue;
    const text=typeof value==='string'?value:JSON.stringify(value);
    if(text.length>4000){preview[key]=text.slice(0,4000);truncated.push(key);}
  }
  if(Buffer.byteLength(JSON.stringify(preview))>16000)return{id:item.id,type:item.type,status:item.status,exitCode:item.exitCode,
    ...(item.phase==null?{}:{phase:item.phase}),...(item.delivery==null?{}:{delivery:item.delivery==='async'?'async':'unsupported'}),
    preview:JSON.stringify(item).slice(0,4000),truncated:['item']};
  return truncated.length?{...preview,truncated}:preview;
}
export async function steerTurn(client,{threadId,turnId,text}){
  if(typeof text!=='string'||!text.trim()||text.length>8000)throw fault('CONTROL_INPUT','Steering requires bounded nonempty text');
  if(typeof turnId!=='string'||!turnId||confirmed.get(client)?.get(threadId)!==turnId)throw fault('CONTROL_TURN','Steering targets a stale or inactive turn');
  const result=await client.request('turn/steer',{threadId,expectedTurnId:turnId,input:[{type:'text',text}]});
  if(result?.turnId!==turnId)throw fault('CONTROL_TURN','Codex did not confirm the targeted turn');
  return{turnId};
}
export async function runTurn(client, { threadId, prompt, timeoutMs = 120000, interruptTimeoutMs = 3000, signal, model, effort, outputSchema, execution, onActive, onEvent }) {
  if (!boundedToolId(threadId) || typeof prompt !== 'string' || !prompt ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(interruptTimeoutMs) || interruptTimeoutMs <= 0) {
    throw fault('TURN_INPUT', 'A thread, prompt and positive deadlines are required');
  }
  if (signal?.aborted) throw Object.assign(fault('TURN_CANCELLED', 'Codex turn was cancelled before dispatch'), {notStarted:true});
  if (!active.has(client)) active.set(client, new Set());
  if(!confirmed.has(client))confirmed.set(client,new Map());
  const busy = active.get(client);
  if (busy.has(threadId)) throw fault('THREAD_BUSY', 'Only one turn per thread may run at once');
  busy.add(threadId);
  let turnId;
  let terminal;
  let resolveTerminal;
  let rejectFailure;
  let failureError;
  let timer;
  let start;
  let retired = false;
  let earlyBytes = 0,earlyTools=0,observedBytes=0,observedMessages=0,retainedBytes=0,answerBytes=0,answerEvidence;
  const tools=createToolObserver();
  const early = [];
  const items = new Map();
  const messageMetadata=new Map();
  const rememberMessageMetadata=item=>{
    if(item?.type!=='agentMessage'||typeof item.id!=='string')return;
    if(item.id.length>200)throw fault('TURN_PROTOCOL','Turn item identifier exceeded its bound');
    const metadata={...messageMetadata.get(item.id)};
    if(item.phase!=null)metadata.phase=['commentary','partial_answer','final_answer'].includes(item.phase)?item.phase:'unsupported';
    if(item.delivery!=null)metadata.delivery=item.delivery==='async'?'async':'unsupported';
    if(!Object.keys(metadata).length)return;
    if(!messageMetadata.has(item.id)&&messageMetadata.size>=1024)throw fault('TURN_OUTPUT_LIMIT','Agent message metadata exceeded its bounded limit');
    messageMetadata.set(item.id,metadata);
  };
  // Retain outcome metadata even when the turn never returns successfully. This
  // is the bounded retained-item view, not a complete command history.
  const output=()=>({observedBytes,observedMessages,retainedBytes,retainedItems:items.size,truncatedItems:[...items.values()].filter(item=>item.truncated?.length).length,
    commandEvidence:{coverage:'retainedItemsOnly',commands:[...items.values()].filter(item=>item.type==='commandExecution').map(item=>({status:['completed','failed','declined','inProgress'].includes(item.status)?item.status:'unknown',exitCode:Number.isInteger(item.exitCode)?item.exitCode:null}))},
    toolObservations:tools.snapshot(),...(answerEvidence?{answer:answerEvidence}:{})});
  const retain=item=>{
    if(!item||typeof item.id!=='string')return;
    if(item.id.length>200)throw fault('TURN_PROTOCOL','Turn item identifier exceeded its bound');
    const prior=items.get(item.id);
    // A terminal snapshot may omit metadata already supplied by item/completed.
    // Absence cannot turn known commentary into an unphased answer candidate.
    if(item.type==='agentMessage'){
      const metadata=messageMetadata.get(item.id);
      const phase=prior?.type==='agentMessage'?prior.phase??metadata?.phase:metadata?.phase;
      const delivery=prior?.type==='agentMessage'?prior.delivery??metadata?.delivery:metadata?.delivery;
      if(item.phase==null&&phase!=null)item={...item,phase};
      if(item.delivery==null&&delivery!=null)item={...item,delivery};
      rememberMessageMetadata(item);
    }
    const preview=itemPreview(item);
    const nextAnswerBytes=answerBytes-(prior&&finalAnswer(prior)?Buffer.byteLength(prior.text??''):0)+(finalAnswer(preview)?Buffer.byteLength(preview.text??''):0);
    const nextRetainedBytes=retainedBytes-(prior?Buffer.byteLength(JSON.stringify(prior)):0)+Buffer.byteLength(JSON.stringify(preview));
    if(nextAnswerBytes>512*1024||nextRetainedBytes>1024*1024||!prior&&items.size>=1024)throw fault('TURN_OUTPUT_LIMIT','Turn result or retained item previews exceeded their bounded limit');
    items.set(item.id,preview);answerBytes=nextAnswerBytes;retainedBytes=nextRetainedBytes;
  };
  const done = new Promise(resolve => { resolveTerminal = resolve; });
  const failure = new Promise((_, reject) => { rejectFailure = error => { failureError ??= error; reject(error); }; });
  const cancel = () => rejectFailure(fault('TURN_CANCELLED', 'Codex turn was cancelled'));
  signal?.addEventListener('abort',cancel,{once:true});
  // Subscribe before dispatch: notifications can precede the turn/start reply.
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(fault('TURN_TIMEOUT', 'Codex turn exceeded its deadline')), timeoutMs);
  });
  const stopFailure = client.onFailure(rejectFailure);
  const consume = (message,bytes=Buffer.byteLength(JSON.stringify(message))) => {
    const params = message.params;
    if(terminal)return;
    if((params.turnId??params.turn?.id)!==turnId){
      if(message.method===TOOL_METHOD)tools.discardForeign(params.turnId==null);
      return;
    }
    observedBytes+=bytes;observedMessages++;
    if(message.method===TOOL_METHOD){
      const toolObservation=tools.observe(params.projection);
      if(toolObservation)try{onEvent?.({method:TOOL_METHOD,params:{threadId,turnId,toolObservation}});}catch(error){rejectFailure(error);}
      return;
    }
    if(message.method==='turn/completed'){
      const toolObservationSummary=tools.finish();
      if(toolObservationSummary.observed||toolObservationSummary.counters.discarded)message={...message,params:{...params,toolObservationSummary}};
    }
    if(message.method==='item/started'||message.method==='item/completed')try{rememberMessageMetadata(params.item);}catch(error){rejectFailure(error);}
    try{onEvent?.(message);}catch(error){rejectFailure(error);}
    if (message.method === 'item/completed' && params.turnId === turnId && !terminal) {
      try{retain(params.item);}catch(error){rejectFailure(error);}
    }
    if (message.method === 'turn/completed' && params.turn?.id === turnId && !terminal) {
      terminal = params.turn;
      confirmed.get(client).delete(threadId);
      for (const item of terminal.items ?? [])try{retain(item);}catch(error){rejectFailure(error);}
      resolveTerminal(terminal);
    }
  };
  const stopNotifications = client.onNotification(message => {
    if(terminal||retired||message.params?.threadId!==threadId)return;
    let bytes;
    if(message.method===TOOL_METHOD){
      const projection=projectToolEvent(message);if(!projection)return;
      bytes=Buffer.byteLength(JSON.stringify(message));
      message={method:TOOL_METHOD,params:{threadId:projection.threadId,turnId:projection.turnId,projection}};
      if(!turnId&&earlyTools>=EARLY_TOOL_LIMIT){tools.discardUnconfirmed();return;}
      if(!turnId)earlyTools++;
    }else if(!activityMethods.has(message.method)||message.params?.item?.type==='reasoning')return;
    if(message.method==='turn/completed'&&Array.isArray(message.params.turn?.items))message={...message,params:{...message.params,turn:{...message.params.turn,items:message.params.turn.items.filter(item=>item.type!=='reasoning')}}};
    if (turnId) consume(message,bytes);
    else{
      earlyBytes+=Buffer.byteLength(JSON.stringify(message));
      if(earlyBytes>1024*1024){rejectFailure(fault('TURN_EARLY_LIMIT','Unconfirmed turn notification buffer exceeded its limit'));return;}
      early.push({message,bytes});
    }
  });
  try {
    start = client.request('turn/start', {
      threadId, input: [{ type: 'text', text: prompt }], approvalPolicy: 'never',
      sandboxPolicy: execution?.sandboxPolicy??{ type: 'readOnly', networkAccess: false },
      ...(execution?{cwd:execution.cwd,runtimeWorkspaceRoots:execution.runtimeWorkspaceRoots}:{}),
      ...(model===undefined?{}:{model}),...(effort===undefined?{}:{effort}),...(outputSchema===undefined?{}:{outputSchema}),
    }).then(started => {
      if (retired) return;
      if (!boundedToolId(started?.turn?.id)) throw fault('TURN_PROTOCOL', 'Codex did not return a bounded turn identifier');
      turnId = started.turn.id;
      confirmed.get(client).set(threadId,turnId);
      onActive?.({threadId,turnId});
      for (const {message,bytes} of early) consume(message,bytes);
      early.length = 0;
    });
    await Promise.race([start, failure, deadline]);
    await Promise.race([done, failure, deadline]);
    // Both promises may already be settled after a coalesced start/completion.
    // Preserve observation failure even when Promise.race selects completion.
    if(failureError)throw failureError;
    if (terminal.status !== 'completed') throw fault('TURN_FAILED', `Codex turn did not complete successfully: ${remoteDiagnostic(terminal.error)}`);
    const completedItems = [...items.values()];
    const explicit=completedItems.filter(item=>finalAnswer(item)&&item.phase==='final_answer');
    const messages=explicit.length?explicit:completedItems.filter(finalAnswer);
    const text=messages.map(item=>item.text).join('\n');
    const phases={final:0,commentary:0,unphased:0,other:0};
    const excludedDelivery={async:0,unsupported:0};
    for(const item of completedItems)if(item.type==='agentMessage')phases[item.phase==='final_answer'?'final':item.phase==='commentary'?'commentary':item.phase==null?'unphased':'other']++;
    for(const item of completedItems)if(item.type==='agentMessage'&&item.delivery!=null)excludedDelivery[item.delivery==='async'?'async':'unsupported']++;
    // Keep diagnostic counts and a fingerprint, never a second copy of answer text.
    answerEvidence={selection:explicit.length?'explicit':messages.length?'legacy':'none',selectedItems:messages.length,phases,...(excludedDelivery.async||excludedDelivery.unsupported?{excludedDelivery}:{}),bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')};
    return { threadId, turnId, status: terminal.status, text, items: completedItems,output:output() };
  } catch (error) {
    if (!terminal) {
      let interruptTimer;
      const interruptBy = performance.now() + interruptTimeoutMs;
      try {
        const bounded = new Promise((_, reject) => { interruptTimer = setTimeout(() => reject(fault('INTERRUPT_UNVERIFIED', 'Turn interruption was not observed')), interruptTimeoutMs); });
        await Promise.race([(async () => {
          // Cancellation may beat turn/start's reply. Wait for its confirmed ID
          // inside the same interruption budget; never guess which turn to stop.
          if(!turnId)await start;
          if (retired || performance.now() >= interruptBy || !turnId || terminal) return;
          await client.request('turn/interrupt', { threadId, turnId }, { timeoutMs: interruptTimeoutMs + 1000 });
          await done;
        })(), bounded]);
      } catch { /* Preserve the primary failure, with separate interruption evidence. */ }
      finally { clearTimeout(interruptTimer); }
      error.interruption = { terminalObserved: Boolean(terminal), terminalStatus: ['completed','failed','interrupted'].includes(terminal?.status) ? terminal.status : null, descendants: 'notVerified' };
    }
    // Interruption may add a native terminal observation. Snapshot only after
    // that bounded wait so protocol counts agree with the final observation.
    error.output=output();
    throw error;
  } finally {
    retired = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort',cancel);
    stopNotifications();
    stopFailure();
    confirmed.get(client).delete(threadId);
    // Unknown turn state must not permit another turn on this thread.
    if (terminal) busy.delete(threadId);
  }
}
