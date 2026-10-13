import { fault, remoteDiagnostic } from './client.mjs';

// One outstanding turn per thread. The caller owns the server and its shutdown.
// A terminal turn acknowledges harness completion, not arbitrary process drain.
const active = new WeakMap();
const confirmed=new WeakMap();
const activityMethods=new Set(['item/started','item/completed','item/commandExecution/outputDelta','item/agentMessage/delta','turn/plan/updated','turn/diff/updated','thread/tokenUsage/updated','turn/completed']);
const finalAnswer=item=>item.type==='agentMessage'&&(item.phase==null||item.phase==='final_answer');
function itemPreview(item){
  if(finalAnswer(item))return item;
  const preview={...item},truncated=[];
  for(const key of ['command','cwd','aggregatedOutput','text','arguments','result','error','changes']){
    const value=preview[key];if(value===undefined)continue;
    const text=typeof value==='string'?value:JSON.stringify(value);
    if(text.length>4000){preview[key]=text.slice(0,4000);truncated.push(key);}
  }
  if(Buffer.byteLength(JSON.stringify(preview))>16000)return{id:item.id,type:item.type,status:item.status,exitCode:item.exitCode,preview:JSON.stringify(item).slice(0,4000),truncated:['item']};
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
  if (typeof threadId !== 'string' || !threadId || typeof prompt !== 'string' || !prompt ||
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
  let earlyBytes = 0,observedBytes=0,observedMessages=0,retainedBytes=0,answerBytes=0;
  const early = [];
  const items = new Map();
  const output=()=>({observedBytes,observedMessages,retainedBytes,retainedItems:items.size,truncatedItems:[...items.values()].filter(item=>item.truncated?.length).length});
  const retain=item=>{
    if(!item||typeof item.id!=='string')return;
    if(item.id.length>200)throw fault('TURN_PROTOCOL','Turn item identifier exceeded its bound');
    const prior=items.get(item.id),preview=itemPreview(item);
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
  const consume = message => {
    const params = message.params;
    if(terminal||(params.turnId??params.turn?.id)!==turnId)return;
    observedBytes+=Buffer.byteLength(JSON.stringify(message));observedMessages++;
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
    if (message.params?.threadId !== threadId || !activityMethods.has(message.method)||message.params?.item?.type==='reasoning') return;
    if(message.method==='turn/completed'&&Array.isArray(message.params.turn?.items))message={...message,params:{...message.params,turn:{...message.params.turn,items:message.params.turn.items.filter(item=>item.type!=='reasoning')}}};
    if (turnId) consume(message);
    else{
      earlyBytes+=Buffer.byteLength(JSON.stringify(message));
      if(earlyBytes>1024*1024){rejectFailure(fault('TURN_EARLY_LIMIT','Unconfirmed turn notification buffer exceeded its limit'));return;}
      early.push(message);
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
      if (typeof started?.turn?.id !== 'string' || !started.turn.id) throw fault('TURN_PROTOCOL', 'Codex did not return a turn identifier');
      turnId = started.turn.id;
      confirmed.get(client).set(threadId,turnId);
      onActive?.({threadId,turnId});
      for (const message of early) consume(message);
      early.length = 0;
    });
    await Promise.race([start, failure, deadline]);
    await Promise.race([done, failure, deadline]);
    // Both promises may already be settled after a coalesced start/completion.
    // Preserve observation failure even when Promise.race selects completion.
    if(failureError)throw failureError;
    if (terminal.status !== 'completed') throw fault('TURN_FAILED', `Codex turn did not complete successfully: ${remoteDiagnostic(terminal.error)}`);
    const completedItems = [...items.values()];
    const messages = completedItems.filter(finalAnswer);
    return { threadId, turnId, status: terminal.status, text: messages.map(item => item.text).join('\n'), items: completedItems,output:output() };
  } catch (error) {
    error.output=output();
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
