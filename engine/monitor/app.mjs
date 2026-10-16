const $ = id => document.getElementById(id);
// Host-only harmless preferences survive dashboard port changes. Authentication stays in sessionStorage.
function readPreference(key,validate,fallback){
  try{
    const encoded=document.cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${key}=`))?.slice(key.length+1);
    if(encoded!==undefined){const value=decodeURIComponent(encoded);if(validate(value))return value;}
  }catch{ /* Malformed or blocked cookies leave local compatibility available. */ }
  try{const value=localStorage.getItem(key);if(validate(value))return value;}catch{ /* Use this page's default. */ }
  return fallback;
}
function savePreference(key,value){
  try{document.cookie=`${key}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=31536000`;}catch{ /* Retain the current page preference. */ }
  try{localStorage.setItem(key,value);}catch{ /* Cookies may still persist across ports. */ }
}
const themeKey = 'agent-workflow.monitor.theme';
let theme = readPreference(themeKey,value=>['light','dark','system'].includes(value),'system');
savePreference(themeKey,theme);
const preferredTheme = matchMedia('(prefers-color-scheme: light)');
function setTheme() { document.documentElement.dataset.theme = theme === 'system' ? (preferredTheme.matches ? 'light' : 'dark') : theme; }
$('theme').value = theme; setTheme();
preferredTheme.addEventListener('change', setTheme);
$('theme').addEventListener('change', () => { const value=$('theme').value;if(!['light','dark','system'].includes(value))return;theme=value;savePreference(themeKey,theme);setTheme(); });
function toggleSettings(open, restoreFocus = false) {
  $('settings-panel').hidden = !open;
  $('settings-toggle').setAttribute('aria-expanded', String(open));
  if (open) $('theme').focus();
  else if (restoreFocus) $('settings-toggle').focus();
}
$('settings-toggle').addEventListener('click', () => toggleSettings($('settings-panel').hidden));
document.addEventListener('click', event => {
  if (!$('settings-panel').hidden && !event.target.closest('.settings')) toggleSettings(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('settings-panel').hidden) { event.preventDefault(); toggleSettings(false, true); }
});
document.addEventListener('focusin', event => {
  if (!$('settings-panel').hidden && !event.target.closest('.settings')) toggleSettings(false);
});
const tokenKey = 'agent-workflow.monitor.token';
const fragment = new URLSearchParams(location.hash.slice(1));
let token = fragment.get('token');
if (token) {
  try { sessionStorage.setItem(tokenKey, token); } catch { /* The current page can still authenticate. */ }
  history.replaceState(null, '', location.pathname + location.search);
} else {
  try { token = sessionStorage.getItem(tokenKey); } catch { /* Show the authentication direction below. */ }
}
const authMessage = 'Open the dashboard URL from agent-workflow dashboard to authenticate.';
let snapshot, selected, timer, polling = false, busy = false, disposed = false, authenticated = Boolean(token);
const pollingKey='agent-workflow.monitor.polling',pollingChoices=['1','2','5','10','30','manual'];
let pollingChoice='2';
try{pollingChoice=localStorage.getItem(pollingKey)??'2';}catch{ /* Keep the default when storage is unavailable. */ }
if(!pollingChoices.includes(pollingChoice))pollingChoice='2';
$('poll-interval').value=pollingChoice;
function schedulePoll(){
  clearTimeout(timer);
  if(!disposed&&!closed&&authenticated&&!document.hidden&&!polling&&!busy&&pollingChoice!=='manual')timer=setTimeout(poll,Number(pollingChoice)*1000);
}
$('poll-interval').addEventListener('change',()=>{
  const choice=$('poll-interval').value;if(!pollingChoices.includes(choice))return;
  pollingChoice=choice;try{localStorage.setItem(pollingKey,choice);}catch{ /* Retain this page's choice. */ }
  schedulePoll();
});
let lastGood = 0, stale = true, listKey = '', detailKey = '', phaseKey = '', resultKey = '', receiptKey = '';
let extendedWorker, localReceipt, actionNotice = '', mapKey = '';
let activityHistory, activityLoading = false, activityFilter = 'tools';
let steerDraft;
let deadlineDialog=null;
const deadlineRequests=new Map();
let reconcileDraft,earlierEvidence;
const patchEvidence = new Map(), patchLoading = new Set();
let patchRevision = 0;
const requests = new Set();
let quickView=null;
const quickKinds=[['actions','Actions & controls'],['messages','Messages'],['tools','Tool activity'],['prompt','Prompt & result'],['workspace','Workspace/evidence']];
function savedDiagnostic(value){
  if(typeof value!=='string')return value;
  if(/^\s*[\[{]/.test(value)){try{return JSON.parse(value);}catch{return {message:'Primary diagnostic preview shortened; reason unverified. Read full worker evidence.'};}}
  return {message:value.split(/[\r\n]/,1)[0]};
}
function primaryFailure(worker){
  if(!worker)return '';
  const error=savedDiagnostic(worker.error);
  const capture=error?.capture??savedDiagnostic(worker.workspaceError)?.capture,cause=capture?.cause;
  return [error?.code,error?.message,cause?.code,cause?.message].filter(value=>typeof value==='string'&&value).join(' · ')||(['failed','unknown'].includes(worker.status)?'Primary error not retained; reason unverified.':'');
}
function quickText(value,limit=4000){return typeof value==='string'?value.slice(0,limit)+(value.length>limit?'… [preview shortened]':''):value===undefined?'unverified':String(value);}
function failureCallout(worker){
  const section=node('section',undefined,'worker-failure');section.setAttribute('aria-label','Primary worker failure');
  section.append(node('strong',`Execution ${worker.status} · ${quickText(primaryFailure(worker),800)}`));return section;
}
function quickOrigin(context=quickView){return context?document.querySelector(`.worker-menu-toggle[data-position="${context.position}"]`):null;}
function closeQuick(returnFocus=true){
  const context=quickView;quickView=null;
  context?.abort?.abort();
  context?.messageAbort?.abort();
  $('worker-card-menu').hidden=true;$('worker-card-menu').replaceChildren();
  $('worker-quick-view').hidden=true;$('worker-quick-body').replaceChildren();$('worker-quick-tabs').replaceChildren();
  for(const button of document.querySelectorAll('.worker-menu-toggle'))button.setAttribute('aria-expanded','false');
  if(returnFocus&&context&&context.run===runKey()&&context.generation===snapshot?.generation)quickOrigin(context)?.focus({preventScroll:true});
}
function positionQuick(){
  if(!quickView)return;
  const surface=$(quickView.tab?'worker-quick-view':'worker-card-menu'),origin=quickOrigin();
  const bounds=origin?.getBoundingClientRect?.();
  if(!bounds)return;
  const width=surface.offsetWidth||(quickView.tab?560:230),height=surface.offsetHeight||280;
  const viewportHeight=window.innerHeight||document.documentElement.clientHeight||800;
  surface.style.left=`${Math.max(8,Math.min(bounds.right-width,window.innerWidth-width-8))}px`;
  surface.style.top=`${Math.max(8,Math.min(bounds.bottom+6,viewportHeight-height-8))}px`;
}
function quickItems(worker){return primaryFailure(worker)?[['failure','Failure details'],...quickKinds]:quickKinds;}
function reconcileQuickChoices(container,worker,menu=false){
  const choices=[...quickItems(worker)];
  if(!menu&&quickView.tab==='failure'&&!choices.some(([kind])=>kind==='failure'))choices.unshift(['failure','Failure details']);
  for(const [index,[kind,title]] of choices.entries()){
    let button=[...container.children].find(item=>item.dataset.quickKind===kind);
    if(!button){
      button=node('button',title);button.type='button';button.dataset.quickKind=kind;
      button.id=`worker-${menu?'menu-item':'tab'}-${kind}`;button.setAttribute('role',menu?'menuitem':'tab');
      if(!menu)button.setAttribute('aria-controls','worker-quick-body');
      button.addEventListener('click',()=>openQuickTab(kind));
    }
    if(menu)button.tabIndex=-1;
    if(container.children[index]!==button)container.insertBefore(button,container.children[index]??null);
  }
  for(const button of [...container.children])if(!choices.some(([kind])=>kind===button.dataset.quickKind))button.remove();
}
function quickRestart(position){const saved=snapshot.restart;return saved&&typeof saved==='object'&&(saved.position===position||saved.affected?.some(item=>item.position===position))?saved:null;}
function openQuickMenu(position){
  if(!snapshot||!authenticated||closed||disposed)return;
  if(quickView?.position===position&&!$('worker-card-menu').hidden){closeQuick();return;}
  closeQuick(false);
  const worker=snapshot.workers.find(item=>item.position===position);if(!worker)return;
  quickView={run:runKey(),runIdentity:JSON.stringify(snapshot.monitor?.run??null),generation:snapshot.generation,position,tab:null};
  const menu=$('worker-card-menu');menu.setAttribute('aria-label',`Evidence for ${worker.options?.label||`Worker ${position+1}`}`);
  reconcileQuickChoices(menu,worker,true);
  quickOrigin()?.setAttribute('aria-expanded','true');menu.hidden=false;positionQuick();menu.firstElementChild?.focus({preventScroll:true});
}
function openQuickTab(kind){
  if(!quickView)return;
  const fromMenu=!$('worker-card-menu').hidden;
  quickView.tab=kind;quickView.renderKey='';$('worker-card-menu').hidden=true;quickOrigin()?.setAttribute('aria-expanded','false');
  $('worker-quick-view').hidden=false;renderQuick();positionQuick();
  (fromMenu?$('close-worker-quick'):$(`worker-tab-${kind}`))?.focus({preventScroll:true});
  if(['messages','tools'].includes(kind)&&!quickView.history&&!quickView.loading&&!quickView.error)void loadQuick('activity');
  if(kind==='messages'&&!quickView.messages&&!quickView.messagesLoading&&!quickView.messagesError)void loadCompletedMessages();
}
async function loadCompletedMessages(){
  const context=quickView;if(!context||context.messagesLoading||!authenticated||closed||disposed||document.hidden)return;
  const after=context.messages?.nextCursor??0;context.messageAbort=new AbortController();context.messagesLoading=true;context.messagesError=null;renderQuick();
  try{
    const value=await api(`/api/messages?generation=${context.generation}&position=${context.position}&after=${after}&limit=50`,{signal:context.messageAbort.signal});
    if(quickView!==context||context.messageAbort.signal.aborted||context.run!==runKey()||context.runIdentity!==JSON.stringify(snapshot?.monitor?.run??null)||context.generation!==snapshot?.generation)return;
    if(value.available===false&&value.coverage==='legacyRawOnly'&&Number.isSafeInteger(value.priorActivityUncovered)&&value.priorActivityUncovered>=0){context.messages=value;return;}
    const counts=value.counts;
    const fields=['terminalNotificationsObserved','insertions','replacements','duplicateNoops','retained','retainedBytes','evictedCountLimit','evictedByteLimit','priorActivityUncovered'];
    if(value.available!==true||value.coverage!=='terminalNotificationsOnly'||!counts||Object.keys(counts).length!==fields.length||!fields.every(key=>Number.isSafeInteger(counts[key])&&counts[key]>=0)||counts.retained>64||counts.retainedBytes>1048576||counts.terminalNotificationsObserved!==counts.insertions+counts.replacements+counts.duplicateNoops||counts.retained!==counts.insertions-counts.evictedCountLimit-counts.evictedByteLimit||!Array.isArray(value.records)||value.records.length>50||value.records.length>counts.retained||!Number.isSafeInteger(value.nextCursor)||value.nextCursor<after||typeof value.hasMore!=='boolean'||value.hasMore&&value.nextCursor<=after)throw Error('Completed message coverage is invalid.');
    let cursor=after;
    for(const record of value.records){
      if(!record||!Number.isSafeInteger(record.bytes)||record.bytes<1||record.bytes>36864||!Number.isSafeInteger(record.terminalSeq)||record.terminalSeq<=cursor||record.terminalSeq>value.nextCursor||typeof record.id!=='string'||!/^[a-f0-9]{64}$/.test(record.id)||typeof record.text!=='string'||record.text.length>32768||record.terminalObserved!==true||typeof record.complete!=='boolean'||!Array.isArray(record.truncations)||record.truncations.length>3||record.truncations.some(key=>!['sourceTruncated','textBytes','recordBytes'].includes(key))||record.complete!==(record.truncations.length===0)||![record.threadId,record.turnId,record.itemId].every(value=>typeof value==='string'&&value.length>0&&value.length<=200)||!Number.isSafeInteger(record.attempt)||record.attempt<0||record.generation!==(value.sourceGeneration??context.generation)||record.position!==(value.sourcePosition??context.position))throw Error('Completed message identity or terminal provenance is invalid.');cursor=record.terminalSeq;
    }
    if(value.nextCursor!==cursor)throw Error('Completed message cursor does not match its records.');
    const records=new Map((context.messages?.records??[]).map(record=>[record.id,record]));for(const record of value.records)records.set(record.id,record);
    const bounded=[...records.values()].sort((a,b)=>a.terminalSeq-b.terminalSeq);let bytes=bounded.reduce((sum,record)=>sum+record.bytes,0),discarded=0;
    while(bounded.length>64||bytes>1048576){bytes-=bounded.shift().bytes;discarded++;}
    context.messages={...value,records:bounded,displayDropped:(context.messages?.displayDropped??0)+discarded};
  }catch(error){if(quickView===context&&!context.messageAbort.signal.aborted)context.messagesError=error.message;}
  finally{if(quickView===context){context.messagesLoading=false;renderQuick();}}
}
function quickValue(value){
  if(value===undefined)return 'Not retained in this worker preview.';
  // Rendering stays bounded even after a deliberate full-worker read.
  if(typeof value==='string')return quickText(value);
  return quickText(JSON.stringify(value,null,2));
}
async function loadQuick(kind){
  const context=quickView;if(!context||context.loading||!authenticated||closed||disposed||document.hidden)return;
  const base=snapshot?.workers.find(item=>item.position===context.position);if(!base)return;
  const previewKey=JSON.stringify(base),after=context.history?.nextCursor??0;
  context.abort=new AbortController();context.loading=kind;context.error=null;renderQuick();
  try{
    const value=await api(kind==='activity'?`/api/activity?generation=${context.generation}&position=${context.position}&after=${after}&limit=50`:`/api/worker/${context.position}?generation=${context.generation}`,{signal:context.abort.signal});
    if(quickView!==context||context.abort.signal.aborted||context.run!==runKey()||context.runIdentity!==JSON.stringify(snapshot?.monitor?.run??null)||context.generation!==snapshot?.generation||previewKey!==JSON.stringify(snapshot.workers.find(item=>item.position===context.position)))return;
    if(kind==='activity'){
      if(!Array.isArray(value.records)||value.records.length>50||!Number.isSafeInteger(value.nextCursor)||value.nextCursor<after||typeof value.hasMore!=='boolean'||value.hasMore&&value.nextCursor<=after||![value.observed,value.retained,value.dropped].every(count=>Number.isSafeInteger(count)&&count>=0)||value.retained>256||value.observed-value.retained!==value.dropped||value.records.length>value.retained||value.records.some(record=>!record||!Number.isSafeInteger(record.seq)||record.seq<=after||record.seq>value.nextCursor))throw Error('Invalid activity page; coverage is unverified.');
      const records=[...(context.history?.records??[])];
      for(const record of value.records)if(!records.some(item=>item.seq===record.seq))records.push(record);
      context.history={...value,records:records.slice(-256),displayDropped:(context.history?.displayDropped??0)+Math.max(0,records.length-256),previewKey};
    }else{
      if(value.position!==context.position)throw Error('Worker identity did not match this view.');
      context.full={worker:value,previewKey};
    }
  }catch(error){if(quickView===context&&!context.abort.signal.aborted)context.error=error.message;}
  finally{if(quickView===context){context.loading=null;renderQuick();}}
}
function renderQuick(){
  const context=quickView;if(!context||!snapshot)return;
  const base=snapshot.workers.find(item=>item.position===context.position);
  if(context.run!==runKey()||context.runIdentity!==JSON.stringify(snapshot.monitor?.run??null)||context.generation!==snapshot.generation||!base||!quickOrigin()){closeQuick(false);return;}
  if(!context.tab){reconcileQuickChoices($('worker-card-menu'),base,true);positionQuick();return;}
  if(context.full&&context.full.previewKey!==JSON.stringify(base))context.full=null;
  const worker=context.full?.worker??base;
  const receipts=(snapshot.controls??[]).filter(item=>item.position===context.position&&item.generation===context.generation);
  const key=JSON.stringify([context.tab,worker,context.tab==='actions'?[receipts,snapshot.controlCount,snapshot.controls?.length,quickRestart(context.position),typeof snapshot.restart==='string']:null,context.history,context.loading,context.error,context.messages,context.messagesLoading,context.messagesError]);if(context.renderKey===key)return;context.renderKey=key;
  const title=quickItems(worker).find(([kind])=>kind===context.tab)?.[1]??'Worker evidence';
  $('worker-quick-heading').textContent=`${title} · ${worker.options?.label||`Worker ${worker.position+1}`}`;
  $('worker-quick-context').textContent=`Run ${context.run} · generation ${context.generation} · worker ${context.position+1} · attempt ${worker.attempts??'unverified'} · execution ${worker.status}`;
  reconcileQuickChoices($('worker-quick-tabs'),worker);
  for(const tab of $('worker-quick-tabs').children){tab.setAttribute('aria-selected',String(tab.dataset.quickKind===context.tab));tab.tabIndex=tab.dataset.quickKind===context.tab?0:-1;}
  const body=$('worker-quick-body'),scroll=body.scrollTop,focused=body.contains(document.activeElement)?document.activeElement:null;
  const textScroll=[...body.querySelectorAll('pre[id]')].map(pre=>({id:pre.id,top:pre.scrollTop,left:pre.scrollLeft}));
  body.setAttribute('aria-labelledby',`worker-tab-${context.tab}`);body.replaceChildren();
  if(context.error)body.append(node('p',`Evidence read failed: ${quickText(context.error)} No read was retried.`,'failure'));
  if(worker.truncations?.length)body.append(node('p',`Worker preview shortened: ${worker.truncations.join(', ')}.`,'truncation'));
  if(context.tab==='failure'){
    body.append(failureCallout(worker));
    const facts=node('dl',undefined,'quick-facts');
    const fact=(label,value)=>{facts.append(node('dt',label),node('dd',quickText(value)));};
    const workspaceError=savedDiagnostic(worker.workspaceError);
    fact('Workspace error',workspaceError?[workspaceError.code,workspaceError.message].filter(Boolean).join(' · '):'No workspace error retained; capture status unverified.');
    const error=savedDiagnostic(worker.error)??{};
    const capture=error.capture??workspaceError?.capture;
    if(capture){fact('Capture stage',capture.stage);fact('Capture cause',[capture.cause?.code,capture.cause?.message].filter(value=>typeof value==='string').join(' · '));}
    for(const field of ['stage','request','requestedAt','at','timeoutMs','attempt','noInference','notStarted','noProcessStarted'])fact(field,error[field]??worker[field]);
    fact('Started',worker.startedAt);fact('Completed',worker.completedAt);
    const cleanup=worker.evidence?.cleanup??worker.cleanup;
    fact('Owned server exited',cleanup?.serverExited);
    fact('Owned job empty',cleanup?.jobEmpty);fact('Ownership scope',cleanup?.ownershipScope);
    fact('Descendant drain',cleanup?.jobEmpty===true&&cleanup.ownershipScope==='windows-job-members'?'Owned Windows job empty; arbitrary descendants and external effects unverified':cleanup?.descendants??'unverified');
    fact('Native terminal inventory empty',cleanup?.nativeTerminals?.inventoryEmpty);
    fact('Cleanup error',cleanup?.error?.message);fact('Native cleanup error',cleanup?.nativeTerminals?.error?.message);
    body.append(facts,node('p','Only supplied facts are shown. Missing facts remain unverified.','muted'));
  }else if(context.tab==='actions'){
    body.append(node('p',`${receipts.length} worker-targeted receipts in this snapshot · ${snapshot.controls?.length??0} shown of ${snapshot.controlCount??snapshot.controls?.length??0} saved run receipts. This is a bounded snapshot, not full history.`,'muted'));
    if(!receipts.length)body.append(node('p','No worker-targeted control receipts retained in this snapshot. Earlier or missing receipts are unverified.'));
    for(const receipt of receipts.slice(-256)){
      const entry=node('article',undefined,'quick-record');entry.append(node('h3',`${quickText(receipt.action,100)} · ${quickText(receipt.status,100)}`),node('p',`Receipt ${quickText(receipt.id,200)} · attempt ${receipt.attempt??'unverified'} · ${quickText(receipt.requestedAt,100)}`));
      if(receipt.text)entry.append(node('pre',quickText(receipt.text)));
      if(receipt.error)entry.append(node('p',quickText(receipt.error.message)));
      body.append(entry);
    }
    if(worker.cancelRequested!==undefined)body.append(node('p',`Saved cancellation requested: ${worker.cancelRequested}`));
    const restart=quickRestart(worker.position);if(restart){body.append(node('h3','Saved restart including this worker'),node('pre',quickValue({receiptId:restart.receiptId,position:restart.position,attempt:restart.attempt,sourceGeneration:restart.sourceGeneration,reconciliation:restart.reconciliation})));}
    else body.append(node('p',typeof snapshot.restart==='string'?'Restart preview shortened; worker target unverified.':'No worker-targeted restart receipt retained in this snapshot.','muted'));
  }else if(['messages','tools'].includes(context.tab)){
    const history=context.history;
    if(context.tab==='messages'){
      const messages=context.messages;
      body.append(node('h3','Retained terminal messages'));
      if(messages?.available===false)body.append(node('p',`Legacy raw-only history: completed storage unavailable. ${messages.priorActivityUncovered} raw notifications are uncovered; no terminal messages were reconstructed.`,'truncation'));
      else if(messages?.available){
        const c=messages.counts;
        body.append(node('p',`${messages.records.length} loaded · ${c.retained} retained · ${c.terminalNotificationsObserved} terminal notifications observed (${c.insertions} insertions, ${c.replacements} improvements, ${c.duplicateNoops} duplicates). ${c.evictedCountLimit} count-limit and ${c.evictedByteLimit} byte-limit evictions. ${c.priorActivityUncovered} prior raw notifications uncovered.`,'muted'));
        if(messages.displayDropped)body.append(node('p',`${messages.displayDropped} messages left this bounded local view.`,'truncation'));
        if(messages.sourceGeneration!==undefined&&messages.sourceGeneration!==context.generation)body.append(node('p',`Retained source generation ${messages.sourceGeneration} · worker ${(messages.sourcePosition??context.position)+1}.`,'muted'));
        for(const record of messages.records){
          const article=node('article',undefined,'quick-record');article.append(node('h3',record.complete?'Terminal message · complete':'Terminal message · incomplete'),node('p',`Terminal event ${record.terminalSeq} · attempt ${record.attempt} · turn ${record.turnId}`,'utility'));
          if(record.truncations.length)article.append(node('p',`Shortened: ${record.truncations.join(', ')}. No complete text is implied.`,'truncation'));
          const text=node('pre',record.text);text.id=`quick-message-${record.id}`;text.tabIndex=0;article.append(text);body.append(article);
        }
      }else body.append(node('p',context.messagesLoading?'Reading terminal storage…':'Completed storage coverage unverified.','muted'));
      if(context.messagesError)body.append(node('p',`${context.messagesError} No read was retried. Raw evidence remains separately available.`,'truncation'));
      if(messages?.available!==false){const load=node('button',context.messagesLoading?'Reading…':messages?.hasMore?'Load next terminal page':'Check terminal messages');load.id='quick-load-messages';load.type='button';load.disabled=Boolean(context.messagesLoading);load.addEventListener('click',loadCompletedMessages);body.append(load);}
      body.append(node('h3','Raw message events'));
    }
    body.append(node('p','Filters apply to the loaded event pages only. Private reasoning is excluded.','muted'));
    if(history){
      body.append(node('p',`${history.records.length} loaded · ${history.retained??'unverified'} retained of ${history.observed??'unverified'} observed · ${history.dropped??'unverified'} older events discarded.`,history.dropped?'truncation':'muted'));
      if(history.displayDropped)body.append(node('p',`${history.displayDropped} previously loaded events left this bounded view. Limit: 256 records.`,'truncation'));
      body.append(node('p',history.hasMore?'More recorded events available.':'No more events in the recorded page; later activity requires a deliberate check.','muted'));
      if(history.sourceGeneration!==undefined&&history.sourceGeneration!==context.generation)body.append(node('p',`Source generation ${history.sourceGeneration}; reused worker evidence.`,'muted'));
      if(history.previewKey!==JSON.stringify(base))body.append(node('p','Worker preview changed. Loaded pages remain retained; check for new activity deliberately.','muted'));
      const tools=['commandExecution','fileChange','mcpToolCall','nativeTool','webSearch','dynamicToolCall','toolCall'];
      const filtered=history.records.filter(record=>context.tab==='messages'?['agentMessage','userMessage'].includes(record.type):tools.includes(record.type));
      const records=context.tab==='messages'?coalescedMessageRecords(filtered):filtered;
      if(!records.length)body.append(node('p',context.tab==='messages'?'No matching retained messages in the loaded pages.':'No matching tool events in the loaded pages.'));
      for(const record of records){
        const eventRange=record.firstSeq===undefined?`Event ${record.seq}`:`Events ${record.firstSeq}–${record.seq} · ${record.fragments} fragments`;
        const entry=node('article',undefined,'quick-record');entry.append(node('h3',`${activityType(record.type)} · ${activityStatus(record.status)}`),node('p',`${eventRange} · attempt ${record.attempt??'unverified'} · ${dateText(record.at)}`,'muted'));
        if(record.partialMessage)entry.append(node('p','Assembled from loaded fragments; completeness is unverified until the full message is recorded.','truncation'));
        if(record.truncated?.length)entry.append(node('p',`Shortened: ${record.truncated.join(', ')}.`,'truncation'));
        if(context.tab==='tools'&&record.input!==undefined)entry.append(node('h3','Input'),node('pre',quickValue(record.input)));
        if(record.output!==undefined)entry.append(node('h3',context.tab==='messages'?'Message':'Output'),node('pre',quickValue(record.output)));
        if(context.tab==='messages'&&record.type==='userMessage'&&record.input!==undefined)entry.append(node('pre',quickValue(record.input)));
        if(record.exitCode!==undefined)entry.append(node('p',`Exit code ${record.exitCode}`));
        if(context.tab==='tools'&&record.toolObservation)entry.append(node('pre',quickValue({threadId:record.threadId,turnId:record.turnId,...record.toolObservation})),node('p','Tool payloads omitted; reported outcomes do not establish reconciled effects.','muted'));
        body.append(entry);
      }
      const coverage=history.records.findLast(record=>record.toolObservationSummary)?.toolObservationSummary;
      if(context.tab==='tools'&&coverage)body.append(node('h3','Tool observation coverage'),node('pre',quickValue(coverage)));
    }else body.append(node('p',context.loading?'Reading retained event page…':'No event page loaded. Coverage unverified.'));
    const load=node('button',context.loading?'Reading…':history?.hasMore?'Load next event page':history?'Check for new activity':'Read event page');load.type='button';load.id='quick-load-activity';load.disabled=Boolean(context.loading);load.addEventListener('click',()=>loadQuick('activity'));body.append(load);
  }else if(context.tab==='prompt'){
    body.append(node('h3','Prompt'),node('pre',quickValue(worker.prompt)),node('h3','Worker result'),node('pre',quickValue(worker.result)),node('p','Worker output does not establish coordinator acceptance. Text previews are limited to 4000 characters each.','muted'));
    for(const pre of body.querySelectorAll('pre'))pre.tabIndex=0;
  }else if(context.tab==='workspace'){
    const workspace=worker.workspace;
    if(workspace&&typeof workspace==='object'){
      const facts={};for(const field of ['version','cwd','policyHash','patchHash','basePatchHash','patchPath','basePatchPath','status'])if(workspace[field]!==undefined)facts[field]=workspace[field];
      body.append(node('h3','Captured workspace identity'),node('pre',quickValue(facts)),node('p',`Capture status: ${typeof workspace.status==='string'?quickText(workspace.status,500):'unverified'}. Artifact integrity and coordinator acceptance are unverified in this view.`));
      const files=Array.isArray(workspace.changedFiles)?workspace.changedFiles:[];body.append(node('p',`${files.length} changed files recorded in this worker evidence; showing at most 50. Capture and artifact acceptance remain separate.`));
      const list=node('ul',undefined,'changed-files');for(const file of files.slice(0,50))list.append(node('li',quickText(file,500)));body.append(list);
      if(files.length>50)body.append(node('p',`${files.length-50} files omitted from this preview.`,'truncation'));
    }else body.append(node('p',workspace?'Workspace preview shortened; read worker evidence for retained capture facts.':'Workspace capture not retained; status unverified.'));
    if(worker.workspaceError)body.append(node('h3','Workspace error'),node('p',quickText([worker.workspaceError.code,worker.workspaceError.message].filter(Boolean).join(' · '))));
    const inspect=node('button','Open workspace & patch reads in inspector');inspect.type='button';inspect.id='quick-inspect-workspace';inspect.addEventListener('click',()=>{
      const origin=quickOrigin(),position=context.position,full=context.full;closeQuick(false);chooseWorker(position,origin);
      if(full){extendedWorker={generation:snapshot.generation,position,worker:full.worker,previewKey:full.previewKey};renderDetail();}
      const section=$('detail').querySelector('.workspace-review');if(section){section.open=true;section.querySelector('summary')?.focus({preventScroll:true});section.scrollIntoView({block:'nearest'});}
    });body.append(inspect,node('p','Patch and excluded-file reads remain explicit in the inspector.','muted'));
  }
  if(['failure','prompt','workspace'].includes(context.tab)&&!context.full){
    const load=node('button',context.loading?'Reading…':'Read full worker evidence');load.id='quick-load-worker';load.type='button';load.disabled=Boolean(context.loading);load.addEventListener('click',()=>loadQuick('worker'));body.append(load);
  }
  for(const saved of textScroll){const pre=$(saved.id);if(pre&&body.contains(pre)){pre.scrollTop=saved.top;pre.scrollLeft=saved.left;}}
  body.scrollTop=scroll;if(focused){const replacement=focused.id&&$(focused.id);(replacement&&body.contains(replacement)?replacement:body).focus({preventScroll:true});}
}
$('close-worker-quick').addEventListener('click',()=>closeQuick());
for(const id of ['worker-card-menu','worker-quick-tabs'])$(id).addEventListener('keydown',event=>{
  const items=[...$(id).children],index=items.indexOf(document.activeElement);let next;
  if(event.key==='ArrowDown'||event.key==='ArrowRight')next=(index+1)%items.length;
  if(event.key==='ArrowUp'||event.key==='ArrowLeft')next=(index+items.length-1)%items.length;
  if(event.key==='Home')next=0;if(event.key==='End')next=items.length-1;
  if(next!==undefined){event.preventDefault();items[next]?.focus({preventScroll:true});}
  if(['Enter',' '].includes(event.key)&&index>=0){event.preventDefault();openQuickTab(items[index].dataset.quickKind);}
});
document.addEventListener('click',event=>{if(quickView&&!event.composedPath().some(element=>element?.matches?.('#worker-card-menu,#worker-quick-view,.worker-menu-toggle')))closeQuick();});
window.addEventListener('resize',positionQuick);
document.addEventListener('scroll',positionQuick,true);
let viewRun=/^\/runs\/([A-Za-z0-9][A-Za-z0-9._-]{0,199})$/.exec(location.pathname)?.[1]??null;
let controlTarget=null,autoArmed=false,navigation=[],nextRunCursor=null,navigationLoading=false,navigationScopePending=false,closed=false;
let selectedRunAuthority=null;
let navigationCounts=null;
let runFilter='all',messageKey='',pruneKey='';
const runRows=new Map(),messageRows=new Map();
let navigationTail=[],tailCursor=null,navigationError='',navigationScope=false,navigationFailure=null;
let pruneReview=null,lifecycleReceipt=null,lifecycleUncertain=false;
const runDrafts=new Map();
const runKey=()=>viewRun??snapshot?.monitor?.run?.runId??'pinned';
const phoneLayout=matchMedia('(max-width: 599px)');
const paneSizes=[
  {name:'inspector',panel:$('inspector-panel'),handle:$('inspector-resize'),initial:300,min:260,max:600,reserve:330},
  {name:'menu',panel:$('more-panel'),handle:$('menu-resize'),initial:430,min:300,max:720,reserve:280},
];
let paneDrag=null;
for(const pane of paneSizes){
  pane.key=`agent-workflow.monitor.width.${pane.name}`;
  const valid=value=>typeof value==='string'&&/^\d{1,6}$/.test(value)&&Number(value)>0;
  pane.preferred=Number(readPreference(pane.key,valid,String(pane.initial)));
  pane.preferred=Math.max(pane.min,Math.min(pane.max,pane.preferred));
  savePreference(pane.key,String(pane.preferred));
}
function layoutPanes(){
  const available=Math.min(window.innerWidth,document.querySelector('.work-area').clientWidth||window.innerWidth);
  for(const pane of paneSizes){
    pane.limit=Math.max(pane.min,Math.min(pane.max,available-pane.reserve));
    pane.width=Math.round(Math.max(pane.min,Math.min(pane.limit,pane.preferred)));
    pane.panel.style.width=phoneLayout.matches?'':`${pane.width}px`;
    pane.handle.hidden=phoneLayout.matches||pane.panel.hidden;
    pane.handle.tabIndex=pane.handle.hidden?-1:0;
    pane.handle.setAttribute('aria-disabled',String(pane.handle.hidden));
    pane.handle.setAttribute('aria-valuemin',String(pane.min));
    pane.handle.setAttribute('aria-valuemax',String(pane.limit));
    pane.handle.setAttribute('aria-valuenow',String(pane.width));
    pane.handle.setAttribute('aria-valuetext',`${pane.width} pixels`);
  }
}
function finishPaneDrag(commit=false){
  if(!paneDrag)return;
  const {pane,pointerId,preferred}=paneDrag;paneDrag=null;
  if(commit){pane.preferred=pane.width;savePreference(pane.key,String(pane.preferred));}else pane.preferred=preferred;
  document.body.classList.remove('resizing-pane');
  if(pane.handle.hasPointerCapture(pointerId))pane.handle.releasePointerCapture(pointerId);
  layoutPanes();
}
for(const pane of paneSizes){
  pane.handle.addEventListener('pointerdown',event=>{
    if(event.button!==0||!Number.isFinite(event.clientX)||pane.handle.hidden||paneDrag)return;
    try{pane.handle.setPointerCapture(event.pointerId);}catch{return;}
    paneDrag={pane,pointerId:event.pointerId,x:event.clientX,width:pane.width,preferred:pane.preferred};
    pane.handle.focus({preventScroll:true});document.body.classList.add('resizing-pane');event.preventDefault();
  });
  pane.handle.addEventListener('pointermove',event=>{
    if(paneDrag?.pane!==pane||event.pointerId!==paneDrag.pointerId||!Number.isFinite(event.clientX))return;
    pane.preferred=Math.max(pane.min,Math.min(pane.limit,paneDrag.width+paneDrag.x-event.clientX));layoutPanes();
  });
  pane.handle.addEventListener('pointerup',event=>{if(paneDrag?.pane===pane&&event.pointerId===paneDrag.pointerId)finishPaneDrag(true);});
  for(const type of ['pointercancel','lostpointercapture'])pane.handle.addEventListener(type,event=>{if(paneDrag?.pane===pane&&event.pointerId===paneDrag.pointerId)finishPaneDrag();});
  pane.handle.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&paneDrag){event.preventDefault();finishPaneDrag();return;}
    if(pane.handle.hidden||event.altKey||event.ctrlKey||event.metaKey)return;
    const width=event.key==='Home'?pane.min:event.key==='End'?pane.limit:event.key==='ArrowLeft'?pane.width+16:event.key==='ArrowRight'?pane.width-16:null;
    if(width===null)return;event.preventDefault();finishPaneDrag();pane.preferred=Math.max(pane.min,Math.min(pane.limit,width));layoutPanes();savePreference(pane.key,String(pane.preferred));
  });
}
function resizePanes(){finishPaneDrag();layoutPanes();}
window.addEventListener('resize',resizePanes);phoneLayout.addEventListener('change',resizePanes);
layoutPanes();
let inspectorOrigin=null, trayOrigin='tray-toggle', drawerOrigin=null;
let currentNotice=null, messagesDropped=0;
let detailScope='';
const messageHistory=new Map();
function focusIdentity(element){
  if(element?.id)return {id:element.id};
  if(element?.dataset.graphKey)return {kind:'step',key:element.dataset.graphKey};
  if(element?.tagName==='SUMMARY'&&element.parentElement?.dataset.disclosure)return {kind:'disclosure',key:element.parentElement.dataset.disclosure};
  if(element?.dataset.prerequisite!==undefined)return {kind:'prerequisite',position:element.dataset.prerequisite};
  if(element?.dataset.messageKey)return {kind:'message',key:element.dataset.messageKey};
  if(element?.classList?.contains('map-worker'))return {kind:'map',position:element.dataset.position};
  if(element?.classList?.contains('worker'))return {kind:'tray',position:element.dataset.position};
  return null;
}
function restoreFocus(identity){
  if(identity?.kind==='tray')toggleTray(true, false);
  if(identity?.kind==='step'){
    const element=[...document.querySelectorAll('[data-graph-key]')].find(item=>item.dataset.graphKey===identity.key&&item.tagName==='BUTTON');
    (element??$('workflow-map')).focus({preventScroll:true});return;
  }
  const element=identity?.id?$(identity.id):identity?.kind==='disclosure'?[...$('detail').querySelectorAll('details[data-disclosure]')].find(item=>item.dataset.disclosure===identity.key)?.querySelector('summary'):identity?.kind==='prerequisite'?[...$('detail').querySelectorAll('[data-prerequisite]')].find(item=>item.dataset.prerequisite===identity.position):identity?.kind==='message'?[...$('message-history').querySelectorAll('button')].find(item=>item.dataset.messageKey===identity.key):identity?.kind?document.querySelector(`${identity.kind==='map'?'.map-worker':'.worker'}[data-position="${identity.position}"]`):null;
  (element??$('workflow-map')).focus({preventScroll:true});
}
function toggleDrawer(id,open){
  finishPaneDrag();
  const toggle=id==='more-panel'?'more-toggle':'messages-toggle';
  if(open){drawerOrigin={id:toggle};for(const other of ['more-panel','messages-panel']){if(other!==id)$(other).hidden=true;}toggleSettings(false);}
  if(id==='more-panel'&&!open||id==='messages-panel'&&open)toggleRunPicker(false);
  $(id).hidden=!open;
  layoutPanes();
  $('more-toggle').setAttribute('aria-expanded',String(!$('more-panel').hidden));
  $('messages-toggle').setAttribute('aria-expanded',String(!$('messages-panel').hidden));
  if(open)$(id==='more-panel'?'close-more':'close-messages').focus();
  else restoreFocus(drawerOrigin);
}
function toggleTray(open,focus=true,origin='tray-toggle'){
  $('worker-tray').hidden=!open;
  for(const id of ['tray-toggle','workers-toggle'])$(id).setAttribute('aria-expanded',String(open));
  if(open){trayOrigin=origin;if(focus)$('close-tray').focus();}
  else if(focus)$(trayOrigin).focus();
}
function chooseWorker(position,origin){
  if(!snapshot?.workers?.some(worker=>worker.position===position))return;
  if(origin)inspectorOrigin=focusIdentity(origin)??inspectorOrigin;
  selectedStep=null;selected=position;extendedWorker=undefined;activityHistory=undefined;earlierEvidence=undefined;
  $('status-filter').value='';$('phase-filter').value='';
  $('inspector-panel').hidden=false;
  layoutPanes();
  if(origin?.classList.contains('worker'))toggleTray(false,false);
  renderWorkers();renderDetail();renderMap();$('close-inspector').focus({preventScroll:true});
}
function closeInspector(){ finishPaneDrag();$('inspector-panel').hidden=true;layoutPanes();restoreFocus(inspectorOrigin); }
for(const [toggle,panel] of [['more-toggle','more-panel'],['messages-toggle','messages-panel']])$(toggle).addEventListener('click',()=>toggleDrawer(panel,$(panel).hidden));
$('close-more').addEventListener('click',()=>toggleDrawer('more-panel',false));
$('close-messages').addEventListener('click',()=>toggleDrawer('messages-panel',false));
for(const id of ['tray-toggle','workers-toggle'])$(id).addEventListener('click',()=>toggleTray($('worker-tray').hidden,true,id));
$('close-tray').addEventListener('click',()=>toggleTray(false));
$('close-inspector').addEventListener('click',closeInspector);
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||event.defaultPrevented)return;
  event.preventDefault();
  if(deadlineDialog)closeDeadline();
  else if(quickView)closeQuick();
  else if(!$('run-popover').hidden)toggleRunPicker(false,true);
  else if(!$('more-panel').hidden)toggleDrawer('more-panel',false);
  else if(!$('messages-panel').hidden)toggleDrawer('messages-panel',false);
  else if(!$('worker-tray').hidden)toggleTray(false);
  else if(!$('inspector-panel').hidden)closeInspector();
});
$('fit-map').addEventListener('click',()=>{ $('workflow-map').scrollTo({left:0,top:0,behavior:'instant'});$('announcement').textContent='Map origin. Scroll to inspect the remaining workers.'; });
$('focus-active').addEventListener('click',()=>{
  const worker=snapshot?.workers?.find(worker=>worker.status==='running');
  if(!worker){$('announcement').textContent='No running worker in the recorded snapshot.';return;}
  chooseWorker(worker.position,$('focus-active'));
  let target=document.querySelector(`.map-worker[data-position="${worker.position}"]`);
  if(!target){
    if(visibilityFor(worker)!=='visible'&&!$('show-hidden').checked){$('announcement').textContent=`Running worker has a ${visibilityFor(worker)} record; opened in the inspector. Show hidden retains list access.`;}
    else{toggleTray(true,false);target=document.querySelector(`.worker[data-position="${worker.position}"]`);$('announcement').textContent='Running worker is outside the map preview; opened in the full worker tray.';}
  }else $('announcement').textContent='Running worker selected in the map and inspector.';
  target?.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
});
phoneLayout.addEventListener('change',()=>{mapKey='';renderMap();});
const sameRun=(a,b)=>a?.dataInstanceId===b?.dataInstanceId&&a?.runId===b?.runId&&a?.runtimeId===b?.runtimeId;
function controlsMatch(){return snapshot&&!stale&&(!snapshot.monitor?.run?viewRun===null:sameRun(controlTarget,snapshot.monitor.run)&&controlTarget.generation===snapshot.generation);}
function scopedPath(path,runId=viewRun){return runId&&/^\/api\/(run(?:\?|$)|steps(?:\?|$)|worker\/|patch\/|exclusions\/|activity(?:\?|$)|messages(?:\?|$)|script(?:\?|$)|result(?:\?|$)|control(?:\/|$)|resume$|restart$|lifecycle(?:\/|$))/.test(path)?`/api/runs/${encodeURIComponent(runId)}${path.slice(4)}`:path;}

// The public catalog is independent of clipped run metadata and worker discovery.
// No declared step ever reserves or supplies a worker control identity.
let selectedStep=null,stepState=null;
const stepReadLimits={pages:64,bytes:16*1048576};
const jsonBytes=value=>encodeURIComponent(JSON.stringify(value)).replace(/%[A-F\d]{2}/g,'x').length;
const stepIdentity=ref=>JSON.stringify([[ref.run.dataInstanceId,ref.run.runId,ref.run.runtimeId],ref.scope.kind==='root'?'root':JSON.stringify(['child',ref.scope.invocation.invocationId]),ref.stepId]);
const stepScope=ref=>JSON.stringify([ref.run.dataInstanceId,ref.run.runId,ref.run.runtimeId,ref.generation,ref.scope.kind,ref.scope.invocation?.invocationId??null]);
const stepRun=()=>snapshot?.monitor?.run??snapshot?.experience?.run;
const stepItems=()=>stepState?.items??[];
const stepWorker=item=>item?.worker&&sameRun(item.worker.run,stepRun())&&item.worker.generation===snapshot.generation?snapshot.workers.find(worker=>worker.position===item.worker.position&&(worker.attempts??0)===item.worker.attempt):null;
const selectedStepNode=()=>stepItems().find(item=>stepIdentity(item.ref)===selectedStep);
const stepName=ref=>stepItems().find(item=>stepIdentity(item.ref)===stepIdentity(ref))?.label??`${ref.stepId} (not loaded)`;
const stepStatus=item=>stepState?.stale?'Unknown':item.binding==='assigned'?item.execution:['completed','failed','stopped','unknown','blocked'].includes(snapshot.status)?'Incomplete':'Planned';
function resetSteps(){stepState?.abort?.abort();stepState=null;}
function orderSteps(items,complete=false){
  const keyed=new Map(items.map((item,index)=>[stepIdentity(item.ref),{item,index,pending:0,next:[]}]));
  for(const entry of keyed.values())for(const ref of entry.item.dependencies){const dependency=keyed.get(stepIdentity(ref));if(!dependency){if(complete)throw Error('A complete step catalog contains an unavailable dependency.');continue;}entry.pending++;dependency.next.push(entry);}
  const ready=[...keyed.values()].filter(entry=>entry.pending===0),ordered=[];
  while(ready.length){const entry=ready.shift();ordered.push(entry.item);for(const next of entry.next)if(--next.pending===0){let low=0,high=ready.length;while(low<high){const mid=(low+high)>>>1;if(ready[mid].index<next.index)low=mid+1;else high=mid;}ready.splice(low,0,next);}}
  if(ordered.length!==items.length)throw Error('Step dependencies contain a cycle.');return ordered;
}
function validateStepPage(page,run,generation){
  const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
  const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!value.includes('\0');
  const id=value=>text(value,100)&&/^[A-Za-z0-9_-]+$/.test(value)&&!['__proto__','constructor','prototype'].includes(value.toLowerCase());
  const count=value=>Number.isSafeInteger(value)&&value>=0;
  const validRun=value=>exact(value,['dataInstanceId','runId','runtimeId'])&&Object.values(value).every(item=>text(item,200))&&sameRun(value,run);
  const positive=value=>Number.isSafeInteger(value)&&value>0;
  const ref=value=>exact(value,['run','generation','scope','stepId'])&&validRun(value.run)&&value.generation===generation&&id(value.stepId)&&
    (exact(value.scope,['kind'])&&value.scope.kind==='root'||exact(value.scope,['kind','invocation'])&&value.scope.kind==='child'&&exact(value.scope.invocation,['run','generation','invocationId'])&&validRun(value.scope.invocation.run)&&value.scope.invocation.generation===generation&&id(value.scope.invocation.invocationId));
  const worker=(value,current)=>exact(value,['run','generation','position','attempt'])&&validRun(value.run)&&positive(value.generation)&&(!current||value.generation===generation)&&Number.isInteger(value.position)&&value.position>=0&&value.position<1000&&count(value.attempt);
  const fault=value=>value===null||exact(value,['code','evidence'])&&text(value.code,100)&&(value.evidence===null||exact(value.evidence,['kind','manifestId','sha256','bytes','entries'])&&value.evidence.kind==='manifest'&&[value.evidence.manifestId,value.evidence.sha256].every(hash=>typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash))&&count(value.evidence.bytes)&&count(value.evidence.entries));
  const fail=()=>{throw Error('Step evidence is unavailable: invalid, stale or mismatched public projection.');};
  if(!exact(page,['schemaVersion','run','generation','available','items','nextCursor','hasMore','coverage'])||page.schemaVersion!==1||!validRun(page.run)||page.generation!==generation||typeof page.available!=='boolean'||!Array.isArray(page.items)||page.items.length>100||typeof page.hasMore!=='boolean'||!(page.nextCursor===null||text(page.nextCursor,200))||page.hasMore!==(page.nextCursor!==null))fail();
  const coverage=page.coverage;
  if(!exact(coverage,['declared','assigned','unassigned','dynamicWorkers','futureWorkers'])||!['declared','assigned','unassigned','dynamicWorkers'].every(key=>count(coverage[key]))||coverage.declared>4096||coverage.assigned+coverage.unassigned!==coverage.declared||coverage.dynamicWorkers>1000||!['unknown','executionClosed'].includes(coverage.futureWorkers))fail();
  if(!page.available&&(page.items.length||page.hasMore||coverage.futureWorkers!=='unknown'))fail();
  if(page.hasMore&&!page.items.length)fail();
  const seen=new Set(),bound=new Set();
  for(const item of page.items){
    if(!exact(item,['ref','label','phase','dependencies','binding','worker','sourceWorker','execution','displayBlockedBy','failure','acceptance'])||!ref(item.ref)||!text(item.label,500)||!(item.phase===null||text(item.phase,500))||!Array.isArray(item.dependencies)||item.dependencies.length>255||!Array.isArray(item.displayBlockedBy)||item.displayBlockedBy.length>255||!['unassigned','assigned'].includes(item.binding)||!['planned','queued','running','completed','failed','unknown'].includes(item.execution)||!['unverified','pass','fail'].includes(item.acceptance)||!fault(item.failure))fail();
    const identity=stepIdentity(item.ref);if(seen.has(identity))fail();seen.add(identity);
    const deps=new Set();
    for(const dependency of item.dependencies){if(!ref(dependency)||stepScope(dependency)!==stepScope(item.ref)||stepIdentity(dependency)===identity||deps.has(stepIdentity(dependency)))fail();deps.add(stepIdentity(dependency));}
    const blocked=new Set();for(const dependency of item.displayBlockedBy){if(!ref(dependency)||!deps.has(stepIdentity(dependency))||blocked.has(stepIdentity(dependency)))fail();blocked.add(stepIdentity(dependency));}
    if(item.binding==='unassigned'){if(item.worker!==null||item.sourceWorker!==null||item.execution!=='planned'||item.acceptance!=='unverified')fail();}
    else{if(!worker(item.worker,true)||item.sourceWorker!==null&&!worker(item.sourceWorker,false)||!stepWorker(item)||bound.has(item.worker.position))fail();bound.add(item.worker.position);}
  }
  return page;
}
function chooseStep(key,origin){
  const item=stepItems().find(item=>stepIdentity(item.ref)===key);if(!item)return;
  const worker=stepWorker(item);
  if(worker)chooseWorker(worker.position,origin);
  else{if(origin)inspectorOrigin=focusIdentity(origin);selected=undefined;extendedWorker=activityHistory=earlierEvidence=undefined;$('inspector-panel').hidden=false;layoutPanes();}
  selectedStep=key;renderWorkers();renderDetail();renderMap();updateButtons();$('close-inspector').focus({preventScroll:true});
}
function renderStepEvidence(container,item){
  container.append(node('p',stepState?.stale?'Step read failed; showing the previous step snapshot. Refresh to read current evidence.':'Declared plan relations are display evidence; no scheduler admission implied.','muted'));
  container.append(node('p',`Step ${item.ref.stepId} · ${item.phase??'No phase'} · ${item.ref.scope.kind==='root'?'root scope':`child ${item.ref.scope.invocation.invocationId}`}`));
  if(item.worker){
    const identity=ref=>`${ref.run.runtimeId} · generation ${ref.generation} · position ${ref.position} · attempt ${ref.attempt}`;
    container.append(node('p',`Worker target: ${identity(item.worker)}`));
    if(item.sourceWorker)container.append(node('p',`Cached source: ${identity(item.sourceWorker)}`));
  }else container.append(node('p','No worker assigned. Tool logs and execution evidence are unavailable.'));
  container.append(node('p',`Acceptance: ${item.acceptance}. Execution completion does not establish delivery.`));
  if(item.displayBlockedBy.length)container.append(node('p',`Waiting for ${item.displayBlockedBy.map(stepName).join(', ')}. Declared plan dependency incomplete; no scheduler admission implied.`));
  const list=node('ul');for(const dependency of item.dependencies){const entry=node('li');const button=node('button',stepName(dependency));button.type='button';button.disabled=!stepItems().some(candidate=>stepIdentity(candidate.ref)===stepIdentity(dependency));button.addEventListener('click',()=>chooseStep(stepIdentity(dependency),button));entry.append(button);list.append(entry);}if(item.dependencies.length)container.append(list);
  evidence(container,'Declared step identity and dependencies',{ref:item.ref,dependencies:item.dependencies,displayBlockedBy:item.displayBlockedBy,failure:item.failure});
}
function renderStepDetail(){
  const item=selectedStepNode(),key=JSON.stringify([selectedStep,item,stepState?.stale,snapshot.status,item?.dependencies.map(stepName)]);if(key===detailKey)return;
  const scope=JSON.stringify([runKey(),selectedStep]),sameScope=detailScope===scope,scroll=$('detail').scrollTop;
  const expanded=sameScope?[...$('detail').querySelectorAll('details[data-disclosure][open]')].map(element=>element.dataset.disclosure):[],focused=focusIdentity(document.activeElement);detailScope=scope;
  detailKey=key;$('detail').replaceChildren();$('detail-heading').textContent=item?.label??'Step evidence unavailable';$('detail-status').hidden=!item;
  if(item){badge($('detail-status'),stepStatus(item));renderStepEvidence($('detail'),item);}else $('detail').append(node('p','Selected step evidence is not loaded for this run and generation.'));
  for(const element of $('detail').querySelectorAll('details[data-disclosure]'))element.open=expanded.includes(element.dataset.disclosure);
  if(sameScope){$('detail').scrollTop=scroll;if(focused?.kind==='disclosure')restoreFocus(focused);}
}
function renderStepList(){
  const state=stepState,items=stepItems();
  textChanged($('step-coverage'),!state?.available?'Declared step evidence unavailable.':`${items.length} of ${state.coverage.declared} declared steps loaded · ${state.coverage.unassigned} unassigned · ${state.coverage.assigned} assigned · ${state.coverage.dynamicWorkers} dynamic workers.${state.coverage.futureWorkers==='unknown'?' Future workers unknown.':' Execution admission closed; unassigned steps remain incomplete.'}${state.stale?' Step refresh failed; previous snapshot retained.':''}${state.hasMore?' More step pages remain.':''}`);
  const limited=state?.hasMore&&state.pages>=stepReadLimits.pages;
  textChanged($('step-read-status'),state?.error??(limited?'Step browsing request limit reached; unloaded catalog coverage remains unknown.':''));
  $('load-more-steps').hidden=!state?.hasMore;$('load-more-steps').disabled=Boolean(state?.loading||state?.stale||limited);
  const list=node('ol');list.id='declared-step-list';list.setAttribute('aria-label','Loaded declared steps');
  for(const item of items){const worker=stepWorker(item);if(worker&&!$('show-hidden').checked&&visibilityFor(worker)!=='visible')continue;const entry=node('li');entry.dataset.graphKey=stepIdentity(item.ref);const button=node('button',`${item.label} · ${stepStatus(item)}`,'step-list-button');button.type='button';button.dataset.graphKey=stepIdentity(item.ref);button.setAttribute('aria-pressed',String(selectedStep===stepIdentity(item.ref)));button.addEventListener('click',event=>chooseStep(event.currentTarget.dataset.graphKey,event.currentTarget));entry.append(button);list.append(entry);}
  patchMapNode($('declared-step-list'),list);
}
async function loadSteps(append=false,{force=false}={}){
  const run=stepRun(),generation=snapshot?.generation;
  if(!run||!Number.isSafeInteger(generation)||generation<1){resetSteps();renderStepList();return;}
  if(!stepState||!sameRun(stepState.run,run)||stepState.generation!==generation){resetSteps();stepState={run,generation,items:[],pages:1,available:false,hasMore:false};}
  const state=stepState;if(state.loading||append&&(!state.hasMore||state.stale||state.pages>=stepReadLimits.pages))return;
  state.loading=true;state.abort=new AbortController();renderStepList();
  const current=()=>stepState===state&&snapshot?.generation===generation&&sameRun(stepRun(),run)&&!disposed&&!closed&&authenticated&&!document.hidden;
  const items=append?[...state.items]:[],cursors=new Set(append?state.cursors:[]);let cursor=append?state.nextCursor:null,page,coverage=append?state.coverage:null,loadedPages=0,bytes=append?state.bytes:0;
  const reads=append?1:state.pages;
  try{
    const revision=snapshot.stepsRevision;
    if(revision!==undefined&&(typeof revision!=='string'||!/^\s*[a-f0-9]{64}$/.test(revision)||revision.length!==64))throw Error('The recorded step revision is invalid.');
    // New runtimes bind this revision to the complete verified projection.
    // Older projections retain a conservative snapshot-based refresh key.
    const identity=JSON.stringify([run,generation,revision??[snapshot.updatedAt,snapshot.status,snapshot.acceptingAdditions,snapshot.admissionRevision,snapshot.workers.map(worker=>[worker.position,worker.attempts,worker.status,worker.cached,worker.reusedFrom,worker.error,worker.step])]]);
    if(!append&&!force&&state.readIdentity===identity)return;
    if(!append)state.readIdentity=identity;
    for(let index=0;index<reads;index++){
      if(cursor!==null){if(cursors.has(cursor))throw Error('Repeated step cursor.');cursors.add(cursor);}
      page=await api(`/api/steps?generation=${generation}&limit=100${cursor!==null?`&after=${encodeURIComponent(cursor)}`:''}`,{signal:state.abort.signal,maxBytes:1048576});
      loadedPages++;
      if(!current())return;validateStepPage(page,run,generation);
      bytes+=jsonBytes(page.items);if(bytes>stepReadLimits.bytes)throw Error('Step browsing memory limit reached; remaining catalog pages are unloaded.');
      if(coverage&&['declared','assigned','unassigned','dynamicWorkers','futureWorkers'].some(key=>coverage[key]!==page.coverage[key]))throw Error('Step coverage changed while paging. Refresh to read the catalog again.');
      coverage=page.coverage;items.push(...page.items);cursor=page.nextCursor;
      if(items.length>4096||items.length>coverage.declared||new Set(items.map(item=>stepIdentity(item.ref))).size!==items.length||new Set(items.filter(item=>item.worker).map(item=>item.worker.position)).size!==items.filter(item=>item.worker).length||cursor!==null&&cursors.has(cursor))throw Error('Invalid step pagination coverage.');
      const scopes=new Map();for(const item of items){const scope=stepScope(item.ref);scopes.set(scope,(scopes.get(scope)??0)+1);if(scopes.get(scope)>256)throw Error('Step scope limit exceeded.');}
      if(!page.hasMore)break;
    }
    if(!current())return;
    if(page.available&&!page.hasMore&&items.length!==coverage.declared)throw Error('Step catalog is incomplete.');
    orderSteps(items,!page.hasMore);
    const assigned=items.filter(item=>item.binding==='assigned').length;
    if(assigned>coverage.assigned||items.length-assigned>coverage.unassigned||page.available&&!page.hasMore&&assigned!==coverage.assigned)throw Error('Step association counts are inconsistent.');
    Object.assign(state,{items,coverage,available:page.available,nextCursor:cursor,hasMore:page.hasMore,stale:false,error:null,bytes,cursors:[...cursors],pages:append?state.pages+1:loadedPages});
    if(selectedStep)selected=stepWorker(selectedStepNode())?.position;
  }catch(error){if(!current())return;state.error=`Declared step evidence unavailable. ${error.message} Use Refresh now to read from the first page.`;state.stale=true;state.pages=1;}
  finally{state.loading=false;if(current()){renderStepList();renderWorkers();renderDetail();renderMap();updateButtons();}}
}
$('load-more-steps').addEventListener('click',()=>void loadSteps(true));
function visibilityFor(worker){
  return snapshot.lifecycle?.workers?.find(item=>item.target?.generation===snapshot.generation&&item.target.position===worker.position&&item.target.attempt===(worker.attempts??0))?.visibility??'visible';
}
function visibleWorkers(){return(snapshot.workers??[]).filter(worker=>$('show-hidden').checked||visibilityFor(worker)==='visible');}
function phaseLabel(worker){const projection=snapshot.experience?.workers?.find(item=>item.ref.position===worker.position);return projection?snapshot.experience.phases.find(item=>item.key===projection.phaseKey)?.label??'':worker.phase||worker.options?.phase||'';}
function workerPhaseKey(worker){return snapshot.experience?.workers?.find(item=>item.ref.position===worker.position)?.phaseKey??(phaseLabel(worker)?JSON.stringify([snapshot.generation,phaseLabel(worker)]):null);}
function switchView(runId,authority=null){
  if(busy)return;
  if(authority)selectedRunAuthority={...authority};
  if(runId===viewRun){if(authority){stale=true;updateButtons();void poll();}return;}
  closeQuick(false);
  // Initial pinned-dashboard admission must never run as a side effect of browsing.
  autoArmed=true;
  runDrafts.set(runKey(),{steerDraft,reconcileDraft,localReceipt,lifecycleReceipt,lifecycleUncertain,pruneReview});
  viewRun=runId;
  ({steerDraft,reconcileDraft,localReceipt,lifecycleReceipt,lifecycleUncertain=false,pruneReview}=runDrafts.get(runKey())??{});
  resetSteps();selectedStep=null;snapshot=undefined;selected=undefined;extendedWorker=undefined;activityHistory=undefined;earlierEvidence=undefined;
  patchEvidence.clear();patchLoading.clear();listKey=detailKey=mapKey=phaseKey=resultKey=receiptKey='';stale=true;
  $('script').hidden=true;$('script').textContent='';$('detail').replaceChildren(node('p','Waiting for a fresh run snapshot.'));
  $('run-title').textContent='Loading selected run';$('run-status').textContent='Loading';
  actionNotice='';updateButtons();void poll();
}
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = String(text);
  if (className) element.className = className;
  return element;
}
function textChanged(element,value){const text=String(value??'');if(element.textContent!==text)element.textContent=text;}
function attributeChanged(element,name,value){if(element.getAttribute(name)!==String(value))element.setAttribute(name,String(value));}
// Map listeners close over immutable worker positions; updating their markup keeps
// the current snapshot lookup, focus, and scroll containers intact.
function patchMapNode(target,source){
  if(target.nodeType===3){if(target.data!==source.data)target.data=source.data;return;}
  for(const attribute of [...target.attributes])if(!source.hasAttribute(attribute.name))target.removeAttribute(attribute.name);
  for(const attribute of source.attributes)if(target.getAttribute(attribute.name)!==attribute.value)target.setAttribute(attribute.name,attribute.value);
  const old=[...target.childNodes],used=new Set();
  const key=element=>element.nodeType===1&&element.dataset.graphKey?`step:${element.dataset.graphKey}`:element.nodeType===1&&element.classList.contains('map-card')?`worker:${element.dataset.position}`:element.nodeType===1&&element.id?`id:${element.id}`:null;
  for(const [index,child] of [...source.childNodes].entries()){
    const identity=key(child);
    const prior=identity?old.find(element=>key(element)===identity):old[index];
    const compatible=prior&&!used.has(prior)&&(!identity?!key(prior):true)&&prior.nodeType===child.nodeType&&prior.nodeName===child.nodeName;
    const next=compatible?prior:child;
    if(compatible){used.add(prior);patchMapNode(prior,child);}
    if(target.childNodes[index]!==next)target.insertBefore(next,target.childNodes[index]??null);
  }
  for(const child of old)if(!used.has(child)&&child.parentNode===target)child.remove();
}
function toggleRunPicker(open,returnFocus=false){
  $('run-popover').hidden=!open;$('run-picker').setAttribute('aria-expanded',String(open));
  $('run-dialog-backdrop').hidden=!open;
  for(const element of [document.querySelector('main'),document.querySelector('header')])element.toggleAttribute('inert',open);
  if(open){
    closeQuick(false);for(const id of ['more-panel','messages-panel'])$(id).hidden=true;
    for(const id of ['more-toggle','messages-toggle'])$(id).setAttribute('aria-expanded','false');layoutPanes();
    $('run-show-hidden').checked=$('show-hidden').checked;$('run-search').focus({preventScroll:true});
  }
  else if(returnFocus)$('run-picker').focus({preventScroll:true});
}
function visibleRunRows(){return [...$('run-options').children].filter(row=>!row.hidden);}
$('run-picker').addEventListener('click',()=>{if(!$('run-picker').disabled)toggleRunPicker($('run-popover').hidden);});
$('close-run-picker').addEventListener('click',()=>toggleRunPicker(false,true));
$('run-picker').addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)&&!$('run-picker').disabled){event.preventDefault();toggleRunPicker(true);}});
$('run-options').addEventListener('keydown',event=>{
  const rows=visibleRunRows(),index=rows.indexOf(document.activeElement);if(index<0)return;
  let next;
  if(event.key==='ArrowDown')next=Math.min(index+1,rows.length-1);
  if(event.key==='ArrowUp')next=Math.max(index-1,0);
  if(event.key==='Home')next=0;
  if(event.key==='End')next=rows.length-1;
  if(next!==undefined){event.preventDefault();rows[next].focus({preventScroll:true});rows[next].scrollIntoView({block:'nearest',inline:'nearest'});}
});
for(const button of $('run-filters').querySelectorAll('button'))button.addEventListener('click',()=>{
  runFilter=button.dataset.filter;for(const other of $('run-filters').querySelectorAll('button'))other.setAttribute('aria-pressed',String(other===button));renderRunPicker();
});
$('run-dialog-backdrop').addEventListener('click',event=>{if(event.target===$('run-dialog-backdrop'))toggleRunPicker(false,true);});
document.addEventListener('keydown',event=>{
  if($('run-popover').hidden||event.key!=='Tab')return;
  const controls=[...$('run-popover').querySelectorAll('button,input,[tabindex="0"]')].filter(element=>!element.disabled&&!element.closest('[hidden]'));
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
});
document.addEventListener('focusin',event=>{if(!$('run-popover').hidden&&!$('run-popover').contains(event.target))$('run-search').focus({preventScroll:true});});
$('run-search').addEventListener('input',renderRunPicker);
$('run-show-hidden').addEventListener('change',()=>{$('show-hidden').checked=$('run-show-hidden').checked;$('show-hidden').dispatchEvent(new window.Event('change'));});
function renderRunPicker(){
  const scrollTop=$('run-options').scrollTop,scrollLeft=$('run-options').scrollLeft;
  const ref=snapshot?.monitor?.run,current=ref?.runId??viewRun;
  const entries=[...new Map(navigation.map(item=>[item.ref.runId,item])).values()];
  if(ref&&!entries.some(item=>item.ref.runId===current))entries.unshift({ref,title:snapshot.meta?.name??snapshot.meta?.title??current,executionStatus:snapshot.status,disposition:snapshot.lifecycle?.run?.visibility??'disposition unavailable',createdAt:runRows.get(current)?.entry?.createdAt,context:true});
  const focused=document.activeElement,held=[...runRows.entries()].find(([,row])=>row===focused);
  if(held&&!entries.some(item=>item.ref.runId===held[0])&&held[1].entry)entries.push({...held[1].entry,context:true});
  const ids=new Set(entries.map(item=>item.ref.runId));
  for(const [id,row] of runRows)if(!ids.has(id)){row.remove();runRows.delete(id);}
  let matches=0;
  for(const [index,item] of entries.entries()){
    const id=item.ref.runId;let row=runRows.get(id);
    if(!row){
      row=node('button',undefined,'run-option');row.type='button';row.dataset.runId=id;
      const title=node('span',undefined,'run-option-title'),status=node('span',undefined,'run-option-state'),created=node('time',undefined,'run-option-time');
      status.append(node('span',undefined,'status-chip'),node('small'));
      title.append(node('strong'),node('small'));row.append(title,status,created);
      row.addEventListener('click',()=>{toggleRunPicker(false,true);switchView(row.dataset.runId,row.entry.ref);});runRows.set(id,row);
    }
    row.entry=item;
    textChanged(row.children[0].children[0],item.title??id);
    textChanged(row.children[0].children[1],id===current?item.context?'Viewing · outside loaded pages':'Viewing':item.context?'Outside loaded pages':'');
    textChanged(row.children[1].children[0],item.executionStatus??'status unavailable');attributeChanged(row.children[1].children[0],'data-status',item.executionStatus??'unavailable');
    textChanged(row.children[1].children[1],item.disposition??'disposition unavailable');
    textChanged(row.children[2],item.createdAt?dateText(item.createdAt):'Time unavailable');
    attributeChanged(row.children[2],'title',item.createdAt??'Created time unavailable');
    attributeChanged(row,'aria-current',id===current);
    attributeChanged(row,'aria-label',`${item.title??id}, ${item.executionStatus??'status unavailable'}, record ${item.disposition??'disposition unavailable'}, created ${item.createdAt?dateText(item.createdAt):'time unavailable'}${id===current?', viewing':''}${item.context?', outside loaded pages':''}`);
    const query=$('run-search').value.trim().toLowerCase();
    const match=(!query||`${item.title??id} ${id} ${item.executionStatus??''} ${item.disposition??''}`.toLowerCase().includes(query))&&(runFilter==='all'||runFilter==='active'&&['queued','running','pausing','paused','stopping','finishing'].includes(item.executionStatus)||runFilter==='completed'&&item.executionStatus==='completed'||runFilter==='attention'&&['failed','unknown','unavailable'].includes(item.executionStatus));
    if(match)matches++;
    const hidden=!match&&id!==current&&row!==focused;if(row.hidden!==hidden)row.hidden=hidden;
    if($('run-options').children[index]!==row)$('run-options').insertBefore(row,$('run-options').children[index]??null);
  }
  if(held&&focused.isConnected&&document.activeElement!==focused)focused.focus({preventScroll:true});
  if($('run-options').scrollTop!==scrollTop)$('run-options').scrollTop=scrollTop;
  if($('run-options').scrollLeft!==scrollLeft)$('run-options').scrollLeft=scrollLeft;
  textChanged($('run-picker-title'),snapshot?.meta?.name??snapshot?.meta?.title??'This run');
  textChanged($('run-scope'),`${navigation.length} runs in loaded pages only. Search and filters apply to loaded pages. The current run stays visible; focused context is retained.${navigationTail.length?' Later loaded pages are retained; automatic polling refreshes the first page.':''}`);
  $('run-filter-empty').hidden=matches>0;
  $('more-runs').hidden=!nextRunCursor;
  if(!navigationError&&!$('run-picker-error').hidden&&$('run-picker-error').contains(document.activeElement))$('run-search').focus({preventScroll:true});
  $('run-picker-error').hidden=!navigationError;
  textChanged($('run-picker-error-text'),navigationError);
}
function valueText(value) { return typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
function activityType(value) { return ({commandExecution:'Command',agentMessage:'Response',userMessage:'Instruction',fileChange:'File change',mcpToolCall:'Tool call',nativeTool:'Native tool',webSearch:'Web search',usage:'Token usage',turn:'Worker turn',plan:'Plan'})[value]??value??'Event'; }
function activityStatus(value) { return ({inProgress:'running',completed:'completed',failed:'failed',updated:'updated',reportedRejected:'rejection reported',reportedFailed:'failure reported',reportedSucceeded:'success reported'})[value]??value??'updated'; }
function coalescedMessageRecords(records){
  const result=[],groups=new Map();
  for(const record of records){
    if(record.type!=='agentMessage'||!['item/started','item/completed','item/agentMessage/delta'].includes(record.method)||![record.threadId,record.turnId,record.itemId].every(value=>typeof value==='string'&&value.length)||!Number.isInteger(record.attempt)){
      result.push(record);continue;
    }
    const key=JSON.stringify([record.threadId,record.turnId,record.itemId,record.attempt]);
    let group=groups.get(key);
    if(!group){group={...record,output:'',firstSeq:record.seq,fragments:0,partialMessage:true,truncated:[]};groups.set(key,group);result.push(group);}
    group.seq=record.seq;group.at=record.at;group.truncated=[...new Set([...group.truncated,...(record.truncated??[])])];
    if(record.phase!==undefined)group.phase=record.phase;
    if(record.method==='item/agentMessage/delta'){
      group.fragments++;
      if(group.status!=='completed')group.output+=typeof record.output==='string'?record.output:'';
    }else if(record.method==='item/completed'){
      const final=typeof record.output==='string'?record.output:'';
      if(!(record.truncated??[]).includes('output')||!group.output.startsWith(final))group.output=final;
      group.partialMessage=(record.truncated??[]).includes('output')&&group.partialMessage;
    }
    if(record.status!==undefined&&group.status!=='completed')group.status=record.status;
  }
  return result;
}
function dateText(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? 'Time unavailable' : date.toLocaleString(); }
function badge(element, status) { element.textContent = status; element.dataset.status = status; }
function renderMessages(){
  const nextKey=JSON.stringify([...messageHistory.values()]);if(nextKey===messageKey)return;messageKey=nextKey;
  const focused=focusIdentity(document.activeElement);
  const records=[...messageHistory.values()];
  $('message-count').textContent=records.filter(record=>!record.dismissed).length;
  $('message-history-limit').textContent=`${records.length} retained local messages · ${records.filter(record=>record.dismissed).length} dismissed · ${messagesDropped} older messages discarded. Limit: 32 distinct messages for this page. Execution evidence and receipts remain in records.`;
  for(const [key,item] of messageRows)if(!messageHistory.has(key)){item.remove();messageRows.delete(key);}
  for(const [index,record] of records.slice().reverse().entries()){
    let item=messageRows.get(record.key);
    if(!item){
      item=node('li');item.append(node('p',record.message),node('small'));
      const dismiss=node('button','Dismiss message');dismiss.type='button';dismiss.dataset.messageKey=record.key;dismiss.addEventListener('click',()=>dismissMessage(record));item.append(dismiss);
      messageRows.set(record.key,item);
    }
    textChanged(item.children[1],`${record.run} · generation ${record.generation??'unavailable'} · ${record.dismissed?'Dismissed · retained in history':'Retained message'}`);
    if(record.dismissed)item.querySelector('button')?.remove();
    if($('message-history').children[index]!==item)$('message-history').insertBefore(item,$('message-history').children[index]??null);
  }
  if(focused?.kind==='message'){
    if(messageHistory.get(focused.key)?.dismissed)$('close-messages').focus({preventScroll:true});
    else restoreFocus(focused);
  }
}
function dismissMessage(record){
  record.dismissed=true;
  if(currentNotice===record.key)$('notice').hidden=true;
  renderMessages();$('announcement').textContent='Message dismissed locally; retained in Messages.';
}
$('dismiss-notice').addEventListener('click',()=>{const record=messageHistory.get(currentNotice);if(record)dismissMessage(record);$('messages-toggle').focus();});
function notice(message,identity=message) {
  currentNotice=message?JSON.stringify([runKey(),snapshot?.generation??null,identity]):null;
  if(message&&!messageHistory.has(currentNotice)){
    messageHistory.set(currentNotice,{key:currentNotice,message,run:runKey(),generation:snapshot?.generation,dismissed:false});
    if(messageHistory.size>32){messageHistory.delete(messageHistory.keys().next().value);messagesDropped++;}
  }
  $('notice-text').textContent=message??'';
  $('notice').hidden=!message||messageHistory.get(currentNotice)?.dismissed===true;
  renderMessages();
}
function disclosure(key,title,className){
  const section=node('details',undefined,className);section.dataset.disclosure=key;
  section.append(node('summary',title));return section;
}
function evidence(container, title, value, failure = false) {
  const section=disclosure(title==='Worker result'?'result':title.toLowerCase().replaceAll(' ','-'),title,'raw-evidence');
  const pre = node('pre', valueText(value), failure ? 'failure' : undefined);
  pre.tabIndex = 0;
  section.append(pre);container.append(section);
}
async function boundedJson(response,maxBytes){
  if(response.body?.getReader){
    const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,value='';
    try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maxBytes){await reader.cancel();throw Error('Step response exceeds the 1 MiB limit.');}value+=decoder.decode(chunk.value,{stream:true});}value+=decoder.decode();return JSON.parse(value);}finally{reader.releaseLock();}
  }
  const value=await response.json();if(jsonBytes(value)>maxBytes)throw Error('Step response exceeds the 1 MiB limit.');return value;
}
async function api(path, { method = 'GET', body, text = false, runId = viewRun, signal, maxBytes } = {}) {
  const selectedRun=viewRun,scoped=scopedPath(path,runId);path=scoped;
  const abort = new AbortController(); requests.add(abort);
  const relay=()=>abort.abort();if(signal?.aborted)abort.abort();else signal?.addEventListener('abort',relay,{once:true});
  const timeout = setTimeout(() => abort.abort(), method === 'POST' ? 90000 : 10000);
  try {
    const response = await fetch(path, { method, credentials: 'omit', cache: 'no-store', signal: abort.signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.status === 401 || response.status === 403) {
      authenticated = false;stale=true;clearTimeout(timer);
      textChanged($('connection'),'Authentication required');notice(authMessage);updateButtons();
      throw new Error(authMessage);
    }
    const bounded=maxBytes?await boundedJson(response,maxBytes):undefined;
    if (!response.ok) {
      let message = `Request failed (${response.status}).`;
      try { const error = maxBytes?bounded:await response.json(); message = quickText(error.error?.message ?? error.message ?? message); } catch { /* Keep the HTTP status. */ }
      const error = new Error(message); error.status = response.status; throw error;
    }
    const result=maxBytes?bounded:text?await response.text():await response.json();
    if(method==='GET'&&selectedRun!==viewRun&&path!=='/api/health'&&!path.startsWith('/api/session/')){const error=new Error('Viewed run changed; earlier read was discarded.');error.code='VIEW_CHANGED';throw error;}
    return result;
  } finally { clearTimeout(timeout); requests.delete(abort);signal?.removeEventListener('abort',relay); }
}
function readError(error) {
  if(error.code==='VIEW_CHANGED')return;
  actionNotice = error.message + (error.status === 409 ? ' The run changed. Refresh, then open this evidence again.' : '');
  notice(actionNotice); updateButtons();
  if (error.status === 409) { stale = true; updateButtons(); poll(); }
}
function deadlineSupported(worker){
  const value=worker?.deadline;
  return Boolean(snapshot?.deadlineControls?.available===true&&worker?.status==='running'&&!worker.cancelRequested&&value?.status==='active'&&Number.isSafeInteger(value.revision)&&value.revision>=0&&(value.remainingMs===null||Number.isSafeInteger(value.remainingMs)&&value.remainingMs>0));
}
function deadlineCurrent(context){
  if(!context||context.run!==runKey()||context.runIdentity!==JSON.stringify(snapshot?.monitor?.run??null)||snapshot?.generation!==context.body.generation)return null;
  const worker=snapshot.workers.find(item=>item.position===context.body.position);
  return worker&&(worker.attempts??0)===context.body.attempt&&(worker.activeTurn?.turnId??null)===context.body.turnId?worker:null;
}
function deadlineKey(position){return JSON.stringify([snapshot?.monitor?.run??runKey(),snapshot?.generation,position]);}
function openDeadline(position){
  const worker=snapshot?.workers.find(item=>item.position===position),key=deadlineKey(position),remembered=deadlineRequests.get(key);
  if(busy||!authenticated||closed||disposed||document.hidden||!controlsMatch()||!worker||!remembered&&!deadlineSupported(worker))return;
  if(!deadlineRequests.has(key)&&deadlineRequests.size>=32){notice('Deadline request history is full. Reconcile the retained requests before another action.');return;}
  const body={generation:snapshot.generation,action:'worker-deadline',position,attempt:worker.attempts??0,turnId:worker.activeTurn?.turnId??null};
  const target=snapshot.monitor?.run?{...controlTarget,position,attempt:body.attempt,turnId:body.turnId}:null;if(target)body.target=target;
  deadlineDialog=remembered??{key,body,revision:worker.deadline.revision,run:runKey(),runIdentity:JSON.stringify(snapshot.monitor?.run??null),runId:target?.runId??viewRun,receiptId:null,locked:false,pending:false,status:''};
  deadlineDialog.origin={position,run:runKey(),generation:snapshot.generation};
  $('deadline-operation').value='set';$('deadline-value').value='';
  $('deadline-heading').textContent='Worker deadline';
  $('deadline-context').textContent=`${worker.options?.label||`Worker ${position+1}`} · Run ${deadlineDialog.run} · generation ${body.generation} · worker ${position+1} · attempt ${deadlineDialog.body.attempt} · revision ${deadlineDialog.revision}`;
  $('deadline-backdrop').hidden=false;$('deadline-dialog').hidden=false;updateDeadlineDialog();$('deadline-operation').focus({preventScroll:true});
}
function closeDeadline(){
  const context=deadlineDialog;deadlineDialog=null;$('deadline-backdrop').hidden=true;$('deadline-dialog').hidden=true;
  if(context?.origin?.run===runKey()&&context.origin.generation===snapshot?.generation){
    if(context.origin.position===selected)$('worker-deadline')?.focus({preventScroll:true});
    else document.querySelector(`.worker-menu-toggle[data-position="${context.origin.position}"]`)?.focus({preventScroll:true});
  }
}
function updateDeadlineDialog(){
  const context=deadlineDialog;if(!context)return;
  const worker=deadlineCurrent(context),deadline=worker?.deadline;
  const current=Boolean(controlsMatch()&&deadlineSupported(worker)&&deadline.revision===context.revision);
  textChanged($('deadline-budget'),deadline?.remainingMs===null?'Recorded budget: no worker deadline · snapshot, not a live countdown':Number.isSafeInteger(deadline?.remainingMs)?`Recorded remaining: ${deadline.remainingMs} ms · revision ${deadline.revision} · snapshot, not a live countdown`:'Recorded budget unavailable for the original target');
  const operation=$('deadline-operation').value,clear=operation==='clear';
  $('deadline-value-label').hidden=clear;$('deadline-value').disabled=context.pending||clear;
  $('deadline-operation').disabled=context.pending;
  textChanged($('deadline-cancel'),context.locked?'Close':'Cancel');
  const extend=[...$('deadline-operation').options].find(item=>item.value==='extend');if(extend)extend.disabled=deadline?.remainingMs===null;
  $('deadline-submit').disabled=busy||context.locked||!current;
  $('deadline-inspect').hidden=!context.receiptId;$('deadline-inspect').disabled=context.pending||busy||snapshot?.deadlineControls?.receipts!==true;
  $('deadline-reconcile').hidden=!context.unknown;$('deadline-reconcile-help').hidden=!context.unknown;
  $('deadline-reconcile').disabled=busy||!controlsMatch();
  const changed=!current&&!context.locked?'The worker, run or deadline revision changed. Close and open Deadline again. ':'';
  textChanged($('deadline-status'),changed+context.status);
}
function receiptMatches(context,receipt){
  return receipt?.id===context.receiptId&&receipt.action==='worker-deadline'&&receipt.generation===context.body.generation&&receipt.position===context.body.position&&receipt.attempt===context.body.attempt&&receipt.turnId===context.body.turnId&&JSON.stringify(receipt.deadline)===JSON.stringify(context.body.deadline)&&['pending','applying','applied','rejected','unknown'].includes(receipt.status);
}
$('deadline-form').addEventListener('submit',async event=>{
  event.preventDefault();const context=deadlineDialog;if(!context||busy||context.locked)return;
  const worker=deadlineCurrent(context),operation=$('deadline-operation').value,text=$('deadline-value').value;
  const reject=message=>{context.status=message;updateDeadlineDialog();};
  if(!controlsMatch()||!deadlineSupported(worker)||worker.deadline.revision!==context.revision){reject('Target changed. Close and open Deadline again.');return;}
  const valueMs=Number(text);
  if(!['set','extend','clear'].includes(operation)||operation!=='clear'&&(!/^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(valueMs))){reject('Enter a positive safe integer in milliseconds.');return;}
  if(operation==='extend'&&(worker.deadline.remainingMs===null||!Number.isSafeInteger(worker.deadline.remainingMs+valueMs))){reject('Extend requires a finite budget without overflow. Use Set remaining.');return;}
  context.body.deadline={operation,expectedRevision:context.revision,...(operation==='clear'?{}:{valueMs})};
  context.pending=true;context.locked=true;context.status='Sending deadline request…';deadlineRequests.set(context.key,context);
  busy=true;clearTimeout(timer);updateButtons();
  try{
    const receipt=await api('/api/control',{method:'POST',body:context.body,runId:context.runId});
    // Retain a received ID before validating, refreshing or rendering anything.
    if(typeof receipt?.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(receipt.id))context.receiptId=receipt.id;
    if(!receiptMatches(context,receipt))throw Error('Control confirmation did not match the original target.');
    context.receipt=receipt;localReceipt=receipt;context.status=`Receipt ${receipt.id} · ${receipt.status}. Inspect this ID for confirmation; no request is replayed.`;
    context.unknown=receipt.status==='unknown';
    if(['applied','rejected'].includes(receipt.status))deadlineRequests.delete(context.key);
    renderReceipts();notice(context.status);$('announcement').textContent=context.status;
  }catch(error){
    const refused=[400,409].includes(error.status)&&!context.receiptId;
    context.unknown=!refused;context.status=refused?`${error.message} Request rejected; close and open Deadline again.`:`Outcome unknown. ${context.receiptId?`Received receipt ID ${context.receiptId}.`:'No receipt ID reached this page.'} ${error.message} The request was not retried. Inspect and reconcile before another action.`;
    if(refused)deadlineRequests.delete(context.key);
    notice(context.status);
  }finally{context.pending=false;busy=false;stale=true;updateButtons();await poll();}
});
$('deadline-inspect').addEventListener('click',async()=>{
  const context=deadlineDialog;if(!context?.receiptId||busy)return;
  busy=true;updateButtons();
  try{
    const receipt=await api(`/api/control/receipts/${encodeURIComponent(context.receiptId)}?generation=${context.body.generation}`,{runId:context.runId});
    if(!receiptMatches(context,receipt))throw Error('Receipt does not match the original request.');
    context.receipt=receipt;localReceipt=receipt;context.status=`Receipt ${context.receiptId} · ${receipt.status}.`;context.unknown=receipt.status==='unknown';
    if(['applied','rejected'].includes(receipt.status))deadlineRequests.delete(context.key);
    renderReceipts();$('announcement').textContent=context.status;
  }catch(error){context.unknown=true;context.status=`Receipt ${context.receiptId} · ${error.message}. The read was not retried. Outcome remains unverified; inspect this same ID again.`;}
  finally{busy=false;updateButtons();schedulePoll();}
});
$('deadline-reconcile').addEventListener('click',()=>{const context=deadlineDialog;if(!context?.unknown||busy||!controlsMatch())return;deadlineRequests.delete(context.key);notice('Deadline request marked reconciled by the operator. Open Deadline again to review a fresh target.');closeDeadline();});
for(const id of ['deadline-close','deadline-cancel'])$(id).addEventListener('click',closeDeadline);
$('deadline-operation').addEventListener('change',()=>{if(deadlineDialog&&!deadlineDialog.locked)deadlineDialog.status='';updateDeadlineDialog();});
$('deadline-dialog').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();closeDeadline();return;}
  if(event.key!=='Tab')return;
  const items=[...$('deadline-dialog').querySelectorAll('button,input,select')].filter(item=>!item.disabled&&!item.hidden&&!item.closest('[hidden]'));
  const first=items[0],last=items.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
});
function updateButtons() {
  const enabled = authenticated && !busy && !closed && !disposed && !document.hidden && controlsMatch()&&(!snapshot.monitor?.run||snapshot.monitor.capabilities?.scopedControls===true);
  const accepts = enabled && snapshot.acceptingControls === true;
  $('pause').disabled = !accepts || snapshot.status !== 'running';
  $('stop').disabled = !accepts || !['running', 'pausing'].includes(snapshot.status);
  $('resume').disabled = !enabled || snapshot.resumable !== true;
  $('refresh').disabled = polling || busy || !authenticated || closed || disposed;
  $('load-script').disabled = !authenticated || busy || !snapshot || snapshot.availability?.status==='unavailable';
  const worker=snapshot?.workers.find(worker=>worker.position===selected);
  const workerEnabled=accepts&&snapshot.status!=='stopping'&&worker&&!worker.cancelRequested&&['queued','running'].includes(worker.status);
  if($('worker-cancel'))$('worker-cancel').disabled=!workerEnabled;
  if($('worker-steer'))$('worker-steer').disabled=!workerEnabled||!worker.activeTurn?.turnId||!$('steer-text')?.value.trim();
  if($('worker-restart'))$('worker-restart').disabled=!enabled||!snapshot.restartPreview?.eligible||snapshot.restartPreview.position!==selected||!$('reconcile-text')?.value.trim();
  if($('worker-deadline'))$('worker-deadline').disabled=worker&&deadlineRequests.has(deadlineKey(worker.position))?!(authenticated&&!busy&&!closed&&!disposed&&!document.hidden&&controlsMatch()):!accepts||snapshot.status==='stopping'||!deadlineSupported(worker);
  updateDeadlineDialog();
  $('close-monitor').disabled=closed||busy||!authenticated;
  $('run-picker').disabled=busy||closed||!authenticated||!snapshot?.monitor?.capabilities?.sessionNavigation;
  $('follow-run').disabled=$('run-picker').disabled;
  const lifecycle=Boolean(authenticated&&!busy&&!stale&&!lifecycleUncertain&&snapshot?.monitor?.capabilities?.lifecycle&&snapshot.lifecycle?.available!==false&&Number.isInteger(snapshot.lifecycle?.revision));
  for(const id of ['hide-run','archive-run','restore-run','review-prune'])$(id).disabled=!lifecycle;
  for(const button of document.querySelectorAll('[data-worker-lifecycle]'))button.disabled=!lifecycle;
  if($('apply-prune'))$('apply-prune').disabled=!lifecycle||!pruneReview?.preview?.planHash;
}
function renderWorkers() {
  if(!snapshot)return;
  const workers = snapshot.workers ?? [],visible=visibleWorkers();
  const phases = snapshot.experience?.phases?.map(phase=>phase.label)??[...new Set(workers.map(worker => worker.phase || worker.options?.phase || '').filter(Boolean))];
  const nextPhaseKey = JSON.stringify(phases);
  if (nextPhaseKey !== phaseKey) {
    phaseKey = nextPhaseKey;
    const current = $('phase-filter').value;
    $('phase-filter').replaceChildren(new Option('All phases', ''));
    for (const phase of phases) $('phase-filter').append(new Option(phase, phase));
    $('phase-filter').value = phases.includes(current) ? current : '';
  }
  const filtered = visible.filter(worker => (!$('status-filter').value || worker.status === $('status-filter').value) &&
    (!$('phase-filter').value || phaseLabel(worker) === $('phase-filter').value));
  if (!selectedStep&&!workers.some(worker => worker.position === selected)) selected = filtered[0]?.position;
  const key = JSON.stringify([snapshot.generation, selected,snapshot.lifecycle, filtered.map(worker => [worker.position, worker.status, worker.cached, worker.options?.label,phaseLabel(worker)])]);
  if (key !== listKey) {
    listKey = key;
    const focusPosition = document.activeElement?.closest?.('.worker')?.dataset?.position;
    const children = filtered.map(worker => {
      const item = node('li');
      const button = node('button', undefined, 'worker');
      button.type = 'button'; button.dataset.position = worker.position;
      button.setAttribute('aria-pressed', String(worker.position === selected));
      const content = node('span');
      content.append(node('span', worker.options?.label || `Worker ${worker.position + 1}`, 'worker-name'),
        node('span', phaseLabel(worker) || 'No phase assigned', 'worker-phase'));
      const status = node('span', worker.status, 'worker-state'); status.dataset.status = worker.status;
      if (worker.cached) status.append(node('small', 'reused result'));
      if(visibilityFor(worker)!=='visible')status.append(node('small',visibilityFor(worker)));
      button.append(node('span', String(worker.position + 1).padStart(2, '0'), 'slot'), content, status);
      button.addEventListener('click', () => chooseWorker(worker.position,button));
      item.append(button); return item;
    });
    $('worker-list').replaceChildren(...children);
    if (focusPosition !== undefined) [...$('worker-list').querySelectorAll('button')].find(button => button.dataset.position === focusPosition)?.focus({ preventScroll: true });
  }
  $('worker-count').textContent = snapshot.availability?.status==='unavailable'?'Worker counts unavailable':`${filtered.length} of ${workers.length} recorded`;
  $('tray-count').textContent=snapshot.availability?.status==='unavailable'?'?':workers.length;
  $('empty').hidden = filtered.length !== 0;
  $('empty').textContent = snapshot.availability?.status==='unavailable'?'Worker execution records are unavailable.':workers.length ? 'No workers match these filters.' : 'Workers appear here when the workflow requests them.';
}
function renderWorkspace(container, worker, sourceGeneration) {
  if (!worker.workspace && !worker.workspaceError) return;
  const section = disclosure(`workspace-${sourceGeneration??snapshot.generation}`,sourceGeneration?`Workspace & changes · generation ${sourceGeneration}`:'Workspace & changes','workspace-review');
  section.dataset.sourceGeneration = sourceGeneration ?? snapshot.generation;
  section.append(node('h3', sourceGeneration ? `Writer changes · generation ${sourceGeneration}` : 'Writer changes'));
  const workspace = worker.workspace;
  if (workspace && typeof workspace === 'object' && !Array.isArray(workspace)) {
    if (workspace.cwd) {
      section.append(node('p', 'Isolated workspace', 'muted'), node('p', workspace.cwd, 'workspace-path'));
    }
    if(workspace.version===2){
      section.append(node('p',`Frozen capture policy ${workspace.policyHash??'unavailable'}`,'workspace-path'),node('p','Excluded payload bytes are not retained. Inventory hashes verify metadata only.'));
      for(const stage of ['inputs','outputs']){
        const generation=snapshot.generation,position=worker.position,viewed=runKey(),workspaceKey=JSON.stringify(workspace),key=`${generation}:${position}:${sourceGeneration??generation}:exclusions:${stage}`;
        const saved=patchEvidence.get(key),page=saved?.workspaceKey===workspaceKey?saved.result:null;
        const load=async(after=0)=>{
          if(patchLoading.has(key))return;patchLoading.add(key);patchRevision++;renderDetail();
          try{
            const result=await api(`/api/exclusions/${position}?generation=${generation}&stage=${stage}&after=${after}&limit=50${sourceGeneration?`&sourceGeneration=${sourceGeneration}`:''}`);
            if(viewed!==runKey()||snapshot.generation!==generation||selected!==position)return;
            if(result.policyHash!==workspace.policyHash||!Array.isArray(result.entries)||result.entries.length>50||!/^[a-f0-9]{64}$/.test(result.inventoryHash??''))throw new Error('Invalid excluded inventory evidence');
            patchEvidence.delete(key);patchEvidence.set(key,{workspaceKey,result});while(patchEvidence.size>4)patchEvidence.delete(patchEvidence.keys().next().value);
          }catch(error){if(viewed===runKey())readError(error);}finally{patchLoading.delete(key);patchRevision++;renderDetail();}
        };
        const button=node('button',`Read excluded ${stage}`);button.type='button';button.dataset.exclusions=stage;button.disabled=patchLoading.has(key);button.addEventListener('click',()=>load());section.append(button);
        if(page){
          section.append(node('p',`${page.entryCount} excluded entries · ${page.fileCount} files · ${page.bytes} omitted bytes. Metadata SHA-256 ${page.inventoryHash}`,'workspace-path'));
          section.append(node('pre',valueText(page.entries),'patch-content'));
          if(page.nextAfter!==null){const next=node('button','Next inventory page');next.type='button';next.dataset.exclusionsNext=stage;next.disabled=patchLoading.has(key);next.addEventListener('click',()=>load(page.nextAfter));section.append(next);}
        }
      }
    }
    if (Array.isArray(workspace.changedFiles)) {
      const files = node('details');
      files.append(node('summary', `${workspace.changedFiles.length} files changed by this worker`));
      const list = node('ul', undefined, 'changed-files');
      for (const file of workspace.changedFiles) list.append(node('li', file));
      files.append(list); section.append(files);
    }
    const available = [
      { basis: 'inputs', label: 'Read worker-only diff', path: workspace.patchPath, hash: workspace.patchHash },
      { basis: 'base', label: 'Read diff from base', path: workspace.basePatchPath, hash: workspace.basePatchHash },
    ].filter(item => typeof item.path === 'string' && typeof item.hash === 'string');
    if (!available.length) section.append(node('p', 'Diff not available. Patch capture is pending or did not finish.', 'muted'));
    else {
      section.append(node('p', 'Worker-only compares this worker’s inputs with its result. From base also includes the local changes captured when the run started.', 'muted'));
      const generation = snapshot.generation, position = worker.position, workspaceKey = JSON.stringify(workspace);
      const buttons = node('div', undefined, 'button-row patch-actions');
      for (const item of available) {
        const key = `${generation}:${position}:${sourceGeneration ?? generation}:${item.basis}`;
        const saved = patchEvidence.get(key), patch = saved?.workspaceKey === workspaceKey ? saved.result : undefined;
        const load = node('button', patchLoading.has(key) ? 'Reading diff…' : item.label);
        load.type = 'button'; load.dataset.basis = item.basis; load.disabled = patchLoading.has(key);
        load.addEventListener('click', async () => {
          if (patchLoading.has(key)) return;
          patchLoading.add(key); patchRevision++; renderDetail();
          try {
            const result = await api(`/api/patch/${position}?generation=${generation}&basis=${item.basis}${sourceGeneration ? `&sourceGeneration=${sourceGeneration}` : ''}`);
            if (snapshot?.generation !== generation || selected !== position || sourceGeneration && earlierEvidence?.sourceGeneration !== sourceGeneration) return;
            if (typeof result.patch !== 'string' || result.basis !== item.basis || !/^[a-f0-9]{64}$/i.test(result.sha256 ?? '') || !Number.isSafeInteger(result.bytes) || result.bytes < 0) throw new Error('The monitor received invalid patch evidence. Refresh and read the diff again.');
            const bounded = { ...result, patch: result.patch.slice(0, 262144), truncated: result.truncated === true || result.patch.length > 262144 };
            patchEvidence.delete(key);
            patchEvidence.set(key, { workspaceKey, result: bounded });
            while (patchEvidence.size > 4) patchEvidence.delete(patchEvidence.keys().next().value);
          } catch (error) { readError(error); }
          finally { patchLoading.delete(key); patchRevision++; renderDetail(); }
        });
        buttons.append(load);
        if (patch) {
          const disclosure = node('details', undefined, 'patch-disclosure'); disclosure.open = true;
          disclosure.setAttribute('open', '');
          disclosure.append(node('summary', item.basis === 'inputs' ? 'Worker-only diff' : 'Diff from base'));
          const unavailable=patch.previewUnavailable==='non-utf8';
          disclosure.append(node('p', unavailable ? `UTF-8 text preview unavailable · full patch ${patch.bytes} bytes. The saved artifact preserves the original bytes.` : patch.truncated ? `Preview truncated · full patch ${patch.bytes} bytes. Read the saved artifact for the complete diff.` : `Complete patch · ${patch.bytes} bytes.`, unavailable||patch.truncated ? 'truncation' : 'muted'));
          const hash = node('p', undefined, 'patch-hash'); hash.append(node('span', 'Full artifact SHA-256'), node('code', patch.sha256));
          disclosure.append(hash, node('p', item.path, 'workspace-path'));
          const pre = node('pre', unavailable ? 'Read the saved byte artifact with an appropriate encoding. This preview cannot be used as an applicable text patch.' : patch.patch || 'No differences recorded for this comparison.', 'patch-content'); pre.tabIndex = 0;
          disclosure.append(pre); section.append(disclosure);
        }
      }
      section.insertBefore(buttons, section.querySelector('.patch-disclosure'));
    }
  } else if (workspace) section.append(node('p', 'Workspace preview shortened. Load worker details to inspect the workspace and available diffs.', 'truncation'));
  if (worker.workspaceError) evidence(section, 'Workspace capture error', worker.workspaceError, true);
  container.append(section);
}
function renderDetail() {
  if(!snapshot)return;
  if(selectedStep&&!stepWorker(selectedStepNode())){renderStepDetail();return;}
  const base = snapshot.workers?.find(worker => worker.position === selected);
  const worker = extendedWorker?.generation === snapshot.generation && extendedWorker.position === selected ? extendedWorker.worker : base;
  const history = activityHistory?.generation === snapshot.generation && activityHistory.position === selected ? activityHistory : undefined;
  const task=snapshot.experience?.workers?.find(item=>item.ref.position===worker?.position)?.task;
  const artifacts=snapshot.experience?.artifacts?.filter(item=>item.worker.position===worker?.position)??[];
  const restart=snapshot.restartPreview?.position===worker?.position?snapshot.restartPreview:undefined;
  const declaredStep=selectedStepNode();
  const key = JSON.stringify([snapshot.generation, worker, history, activityLoading, activityFilter,restart,earlierEvidence,patchRevision,declaredStep,stepState?.stale,
    [task?.declaredOutcome,task?.verification,task?.reason],artifacts.map(item=>[item.claimId,item.integrity,item.acceptance]),worker?visibilityFor(worker):null, Array.isArray(worker?.dependencies)?worker.dependencies.map(position => {
    const prerequisite = snapshot.workers.find(item => item.position === position);
    return [position, prerequisite?.status, prerequisite?.options?.label,prerequisite?visibilityFor(prerequisite):null];
  }):null]);
  if (key === detailKey) return;
  detailKey = key;
  const scope=selectedStep?JSON.stringify([runKey(),selectedStep]):JSON.stringify([runKey(),snapshot.generation,selected]);
  const sameScope=scope===detailScope;
  const expanded=sameScope?[...$('detail').querySelectorAll('details[data-disclosure][open]')].map(element=>element.dataset.disclosure):[];
  detailScope=scope;
  const focused=focusIdentity(document.activeElement);
  const focusedSteer=document.activeElement?.id==='steer-text',selectionStart=$('steer-text')?.selectionStart,selectionEnd=$('steer-text')?.selectionEnd;
  const focusedReconcile=document.activeElement?.id==='reconcile-text',reconcileStart=$('reconcile-text')?.selectionStart,reconcileEnd=$('reconcile-text')?.selectionEnd;
  const detail = $('detail'); detail.replaceChildren();
  $('detail-status').hidden = !worker;
  $('detail-heading').textContent = worker ? worker.options?.label || `Worker ${worker.position + 1}` : 'Worker details';
  if (!worker) { detail.append(node('p', snapshot.availability?.status==='unavailable'?'Worker evidence is unavailable. Original records were preserved.':'Select a worker to read its prompt, result and execution evidence.', 'empty')); return; }
  if(primaryFailure(worker))detail.append(failureCallout(worker));
  if(declaredStep)renderStepEvidence(detail,declaredStep);
  badge($('detail-status'), worker.status);
  const meta = node('div', undefined, 'detail-meta');
  meta.append(node('span', `Slot ${worker.position + 1}`), node('span', worker.cached ? 'Result reused from saved evidence' : worker.status === 'queued' ? 'Awaiting dispatch' : 'Result not reused'));
  if (worker.startedAt) meta.append(node('span', `Started ${dateText(worker.startedAt)}`));
  if (worker.completedAt) meta.append(node('span', `Finished ${dateText(worker.completedAt)}`));
  if(worker.origin?.kind==='append'){
    detail.append(node('p',`Added during run · task ${worker.origin.taskId}`,'worker-origin'));
    meta.append(node('span',`Addition request ${worker.origin.requestId} · generation ${worker.origin.generation}`));
  }
  if(worker.reusedFrom)meta.append(node('span',`Source generation ${worker.reusedFrom.generation} · slot ${worker.reusedFrom.position+1}`));
  if(worker.deadline||deadlineRequests.has(deadlineKey(worker.position))){
    const deadline=worker.deadline??{};
    const label=deadline.status==='expired'?'Worker deadline expired':deadline.status==='closed'?'Worker deadline controls closed':deadline.status==='active'&&deadline.remainingMs===null&&deadline.expiresAt===null?'No worker deadline · orchestrator controls this session':deadline.status==='active'&&typeof deadline.expiresAt==='number'&&Number.isFinite(deadline.expiresAt)?`Worker deadline at ${dateText(deadline.expiresAt)}`:'Worker deadline evidence unavailable';
    const row=node('div',undefined,'deadline-row');row.append(node('p',label,'worker-deadline'));
    const action=node('button','Deadline…');action.id='worker-deadline';action.type='button';action.setAttribute('aria-haspopup','dialog');action.setAttribute('aria-controls','deadline-dialog');
    action.title=deadlineRequests.has(deadlineKey(worker.position))?'Inspect the retained deadline request':deadlineSupported(worker)?'Change this worker’s remaining time':'Deadline controls unavailable for this retained runtime or worker';
    action.addEventListener('click',()=>openDeadline(worker.position));row.append(action);detail.append(row);
    if(!deadlineSupported(worker))detail.append(node('p','Deadline changes unavailable for this runtime or worker.','muted'));
  }
  const taskPanel=node('section',undefined,'task-evidence');taskPanel.append(node('h3','Task outcome'),node('p',`Execution: ${worker.status}. Task outcome: ${task?.declaredOutcome??'unverified'}. Verification: ${task?.verification??'unverified'}.`));
  const taskEvidence=disclosure('acceptance','Verification & acceptance evidence');
  taskEvidence.append(node('p',task?.reason??'No validated task report. Execution completion does not establish delivery.','muted'));
  for(const artifact of artifacts)taskEvidence.append(node('p',`${artifact.claimId}: retained integrity ${artifact.integrity}; acceptance ${artifact.acceptance}.`));
  detail.append(taskPanel);
  let resultPreview=worker.result;
  if(typeof resultPreview==='string'&&/^[\s]*[\[{]/.test(resultPreview)){
    try{resultPreview=JSON.parse(resultPreview);}catch{resultPreview={summary:'Structured result preview. Load worker details to read the complete evidence.'};}
  }
  const summary=typeof resultPreview==='string'?resultPreview:typeof resultPreview?.summary==='string'?resultPreview.summary:worker.activity?.summary??worker.prompt;
  const summaryText=typeof summary==='string'?summary.trim().replace(/\s+/g,' '):'';
  detail.append(node('p',summaryText?`${summaryText.slice(0,360)}${summaryText.length>360?'… Open the evidence below for the remaining text.':''}`:worker.status==='unknown'?'Outcome unknown. No worker result recorded.':worker.status==='queued'?'Waiting for dispatch.':'No worker summary recorded.','worker-summary'));
  const visibility=disclosure('visibility','Record visibility & pruning','worker-controls');visibility.append(node('p',`Disposition: ${visibilityFor(worker)}. Visibility preserves execution and historical evidence.`));
  for(const action of ['hide','archive','restore','planPrune']){const button=node('button',action==='planPrune'?'Review worker prune':action[0].toUpperCase()+action.slice(1)+' worker');button.type='button';button.dataset.workerLifecycle=action;button.addEventListener('click',()=>mutateLifecycle(action,{kind:'worker',generation:snapshot.generation,position:worker.position,attempt:worker.attempts??0}));visibility.append(button);}detail.append(visibility);
  const controls=disclosure('steering','Steering & cancellation','worker-controls');
  const label=node('label','Steering instruction');label.htmlFor='steer-text';
  const input=node('textarea');input.id='steer-text';input.rows=3;input.maxLength=8000;
  input.value=steerDraft?.generation===snapshot.generation&&steerDraft.position===worker.position?steerDraft.text:'';
  input.addEventListener('input',()=>{steerDraft={generation:snapshot.generation,position:worker.position,text:input.value};updateButtons();});
  const steer=node('button','Send instruction');steer.id='worker-steer';steer.type='button';steer.addEventListener('click',()=>mutateWorker('steer'));
  const cancel=node('button',worker.cancelRequested?'Cancellation requested':'Cancel worker');cancel.id='worker-cancel';cancel.type='button';cancel.addEventListener('click',()=>mutateWorker('cancel-worker'));
  controls.append(label,input,steer,cancel);detail.append(controls);
  if(focusedSteer){input.focus({preventScroll:true});input.setSelectionRange?.(selectionStart,selectionEnd);}
  if(restart?.position===worker.position){
    const section=disclosure('restart','Restart after review','worker-controls');
    if(!restart.eligible)section.append(node('p',restart.reason,'muted'));
    else{
      section.append(node('p',`Restart worker ${worker.position+1} and all later workers in a new generation. Completed earlier results stay cached. Review external effects before rerunning this work.`));
      const scope=node('details');scope.append(node('summary',`${restart.affected.length} affected workers`));const list=node('ul');
      for(const item of restart.affected)list.append(node('li',`Worker ${item.position+1} · ${item.status}`));scope.append(list);section.append(scope);
      const label=node('label','How did you reconcile the affected work?');label.htmlFor='reconcile-text';
      const text=node('textarea');text.id='reconcile-text';text.rows=3;text.maxLength=2000;
      text.value=reconcileDraft?.generation===snapshot.generation&&reconcileDraft.position===worker.position?reconcileDraft.text:'';
      text.addEventListener('input',()=>{reconcileDraft={generation:snapshot.generation,position:worker.position,text:text.value};updateButtons();});
      const button=node('button','Restart from this worker');button.id='worker-restart';button.type='button';button.addEventListener('click',restartWorker);
      section.append(label,text,button);detail.append(section);
      if(focusedReconcile){text.focus({preventScroll:true});text.setSelectionRange?.(reconcileStart,reconcileEnd);}
    }
    if(!restart.eligible)detail.append(section);
  }
  if(Array.isArray(worker.priorExecutions)&&worker.priorExecutions.length){
    const section=disclosure('earlier','Earlier executions','worker-controls');
    section.append(node('p',`${worker.attempts??0} total attempts at this position. Earlier evidence remains unchanged.`, 'muted'));
    const label=node('label','Generation'),select=node('select');select.id='earlier-generation';label.htmlFor=select.id;
    for(const source of [...worker.priorExecutions].reverse())select.append(new Option(`Generation ${source.generation}`,String(source.generation)));
    select.value=String(worker.priorExecutions.at(-1).generation);
    const earlier=earlierEvidence?.generation===snapshot.generation&&earlierEvidence.position===worker.position?earlierEvidence:null;
    if(earlier)select.value=String(earlier.sourceGeneration);
    const load=node('button','Read earlier execution');load.id='load-earlier';load.type='button';
    load.addEventListener('click',async()=>{
      const generation=snapshot.generation,position=worker.position,sourceGeneration=Number(select.value);load.disabled=true;
      try{
        const historical=await api(`/api/worker/${position}?generation=${generation}&sourceGeneration=${sourceGeneration}`);
        if(snapshot?.generation!==generation||selected!==position)return;
        earlierEvidence={generation,position,sourceGeneration,worker:historical};renderDetail();
      }catch(error){readError(error);}finally{load.disabled=false;}
    });
    section.append(label,select,load);
    if(earlier){
      const content=node('div');content.id='earlier-evidence';evidence(content,`Execution in generation ${earlier.sourceGeneration}`,earlier.worker);
      renderWorkspace(content, earlier.worker, earlier.sourceGeneration);
      if(earlier.activity){
        content.append(node('p',`${earlier.activity.retained} retained of ${earlier.activity.observed} observed events · ${earlier.activity.dropped} discarded.`, 'muted'));
        evidence(content,'Earlier activity page',earlier.activity.records);
      }
      const activity=node('button',earlier.activity?.hasMore?'Next earlier activity page':'Read earlier activity');activity.type='button';
      activity.addEventListener('click',async()=>{
        activity.disabled=true;const {generation,position,sourceGeneration}=earlier;
        const after=earlier.activity?.hasMore?earlier.activity.nextCursor:0;
        try{const page=await api(`/api/activity?generation=${generation}&position=${position}&sourceGeneration=${sourceGeneration}&after=${after}&limit=50`);
          if(earlierEvidence!==earlier||snapshot.generation!==generation||selected!==position)return;
          earlierEvidence={...earlier,activity:page};renderDetail();
        }catch(error){readError(error);}finally{activity.disabled=false;}
      });
      content.append(activity);section.append(content);
    }
    detail.append(section);
  }
  detail.append(node('h3', 'Prerequisites'));
  if (!Array.isArray(worker.dependencies)) detail.append(node('p', 'Prerequisite information was not declared or captured for this worker.', 'muted'));
  else if (!worker.dependencies.length) detail.append(node('p', 'No prerequisites declared.', 'muted'));
  else {
    const prerequisites = worker.dependencies.map(position => snapshot.workers.find(item => item.position === position) ?? { position, status: 'unavailable' });
    const pending = prerequisites.filter(item => item.status !== 'completed');
    if (worker.status === 'queued' && pending.length) detail.append(node('p', `Waiting for ${pending.map(item => item.options?.label || `Worker ${item.position + 1}`).join(', ')}.`, 'muted'));
    const list = node('ul');
    list.className='prerequisites';
    for (const prerequisite of prerequisites){
      const item=node('li'),button=node('button',`${prerequisite.options?.label || `Worker ${prerequisite.position + 1}`} · ${prerequisite.status}${visibilityFor(prerequisite)!=='visible'?` · ${visibilityFor(prerequisite)}`:''}`);
      button.type='button';button.dataset.prerequisite=prerequisite.position;
      button.disabled=!snapshot.workers.some(item=>item.position===prerequisite.position);
      button.addEventListener('click',()=>chooseWorker(prerequisite.position));item.append(button);list.append(item);
    }
    detail.append(list);
  }
  if (worker.truncations?.length) {
    detail.append(node('p', `Preview shortened: ${worker.truncations.join(', ')}.`, 'truncation'));
    const load = node('button', 'Load worker details'); load.type = 'button';
    load.addEventListener('click', async () => {
      const generation = snapshot.generation, position = worker.position;
      load.disabled = true;
      try {
        const full = await api(`/api/worker/${position}?generation=${generation}`);
        if (snapshot?.generation !== generation || selected !== position || JSON.stringify(snapshot.workers.find(item=>item.position===position))!==JSON.stringify(base)) return;
        extendedWorker = { generation, position, worker: full, previewKey: JSON.stringify(base) };
        renderDetail();
      } catch (error) { readError(error); }
      finally { load.disabled = false; }
    });
    detail.append(load);
  }
  renderWorkspace(detail, worker);
  if (Object.hasOwn(worker, 'prompt')) evidence(detail, 'Prompt', worker.prompt);
  if (Object.hasOwn(worker, 'result')) evidence(detail, 'Worker result', worker.result);
  else detail.append(node('h3', 'Worker result'), node('p', worker.status === 'unknown' ? 'Outcome unknown. No worker result recorded.' : 'No worker result recorded.', 'muted'));
  if (worker.error) evidence(detail, 'Worker error', worker.error, true);
  if (worker.interruption) evidence(detail, 'Interruption evidence', worker.interruption);
  const execution=disclosure('execution','Execution metadata & settings');execution.append(meta);
  if (worker.evidence) evidence(execution, 'Execution evidence', worker.evidence);
  else execution.append(node('p','Effective execution settings were not captured.','muted'));
  detail.append(execution,taskEvidence);
  const activityPanel=disclosure('activity','Tool activity & history');detail.append(activityPanel);
  if(worker.activity && typeof worker.activity==='object') {
    activityPanel.append(node('p', `${activityType(worker.activity.type)} · ${activityStatus(worker.activity.status)}`, 'muted'),node('pre',worker.activity.summary));
  } else activityPanel.append(node('p', 'No native activity has been recorded for this worker.', 'muted'));
  if(worker.usage && typeof worker.usage==='object')activityPanel.append(node('p',`Observed tokens: ${worker.usage.inputTokens} input · ${worker.usage.outputTokens} output · ${worker.usage.totalTokens} total.`, 'muted'));
  const filterLabel=node('label','Show activity ', 'activity-filter'),filter=node('select');filter.id='activity-filter';
  filter.append(new Option('Tool activity','tools'),new Option('All events','all'));filter.value=activityFilter;
  filter.addEventListener('change',()=>{activityFilter=filter.value;renderDetail();});filterLabel.append(filter);activityPanel.append(filterLabel);
  const historyPanel=node('div');historyPanel.id='activity-history';historyPanel.tabIndex=0;historyPanel.setAttribute('aria-label','Recorded activity history');activityPanel.append(historyPanel);
  if(history){
    if(history.sourceGeneration!==undefined&&history.sourceGeneration!==snapshot.generation)historyPanel.append(node('p',`Recorded in generation ${history.sourceGeneration}; this result was reused.`, 'muted'));
    historyPanel.append(node('p', `${history.records.length} events displayed · ${history.retained} retained of ${history.observed} observed · ${history.dropped} older events discarded.`,history.dropped?'truncation':'muted'));
    if(history.displayDropped)historyPanel.append(node('p',`${history.displayDropped} previously loaded events left this bounded view.`, 'muted'));
    const toolCoverage=history.records.findLast(record=>record.toolObservationSummary)?.toolObservationSummary;
    if(toolCoverage)evidence(historyPanel,'Tool observation coverage',toolCoverage);
    const visible=activityFilter==='all'?history.records:history.records.filter(record=>!['agentMessage','userMessage','usage','turn','plan'].includes(record.type));
    historyPanel.append(node('p',`${visible.length} matching events in the loaded history.`, 'muted'));
    for(const record of visible){
      const entry=node('details',undefined,'activity-record');
      entry.append(node('summary',`${activityType(record.type)} · ${activityStatus(record.status)} · attempt ${record.attempt} · ${dateText(record.at)}`));
      if(record.truncated?.length)entry.append(node('p',`Shortened: ${record.truncated.join(', ')}.`, 'truncation'));
      if(record.input!==undefined)evidence(entry,'Tool input',record.input);
      if(record.output!==undefined)evidence(entry,'Output',record.output);
      if(record.toolObservation){
        evidence(entry,'Native tool observation',{threadId:record.threadId,turnId:record.turnId,...record.toolObservation});
        entry.append(node('p','Tool payloads are omitted. Reported status does not establish artifact acceptance or reconciled effects.','muted'));
      }
      if(record.exitCode!==undefined)entry.append(node('p',`Exit code ${record.exitCode}`));
      if(record.usage)evidence(entry,'Native cumulative usage',record.usage);
      historyPanel.append(entry);
    }
  }
  const loadActivity=node('button',history?(history.hasMore?'Load next activity page':'Check for new activity'):'Load activity history');
  loadActivity.id='load-activity';loadActivity.type='button';loadActivity.disabled=activityLoading;
  loadActivity.addEventListener('click',async()=>{
    if(activityLoading)return;
    const generation=snapshot.generation,position=worker.position,after=history?.nextCursor??0;
    activityLoading=true;renderDetail();
    try{
      const page=await api(`/api/activity?generation=${generation}&position=${position}&after=${after}&limit=50`);
      if(snapshot?.generation!==generation||selected!==position)return;
      const records=[...(history?.records??[]),...page.records];
      activityHistory={...page,generation,position,records:records.slice(-256),displayDropped:(history?.displayDropped??0)+Math.max(0,records.length-256)};
    }catch(error){readError(error);}
    finally{activityLoading=false;renderDetail();}
  });
  activityPanel.append(loadActivity);
  detail.append(visibility,controls);
  for(const element of detail.querySelectorAll('details[data-disclosure]'))if(expanded.includes(element.dataset.disclosure))element.open=true;
  if(sameScope&&(focused?.id&&detail.querySelector(`#${focused.id}`)||['disclosure','prerequisite'].includes(focused?.kind)))restoreFocus(focused);
  if(focusedSteer)input.setSelectionRange?.(selectionStart,selectionEnd);
  updateButtons();
}
function renderReceipts() {
  if(!snapshot)return;
  const receipts = [...(snapshot.controls ?? [])];
  if (localReceipt && (localReceipt.generation !== snapshot.generation || receipts.some(receipt => receipt.id === localReceipt.id))) localReceipt = undefined;
  if (localReceipt) receipts.push(localReceipt);
  const key = JSON.stringify(receipts);
  if (key === receiptKey) return;
  receiptKey = key;
  $('receipt-empty').hidden = receipts.length > 0 && !(snapshot.controlCount > receipts.length);
  if (snapshot.controlCount > receipts.length) $('receipt-empty').textContent = `Showing ${receipts.length} of ${snapshot.controlCount} saved control receipts.`;
  $('receipt-list').replaceChildren(...receipts.slice().reverse().map(receipt => {
    const item = node('li', undefined, 'receipt');
    const action = node('span', receipt.action); action.append(node('small', `Generation ${receipt.generation}${receipt.position===undefined?'':` · worker ${receipt.position+1} · attempt ${receipt.attempt}`}`));
    const status = node('span', receipt.status, 'badge'); status.dataset.status = receipt.status;
    const descriptions = { pending: 'Waiting for the runner.', applying:'Waiting for native confirmation.', applied: 'Applied by the runner. Check the run state for completion.', rejected: 'The runner did not apply this request.',unknown:'Confirmation was not observed. Inspect the worker before sending another instruction.' };
    const explanation = node('span', descriptions[receipt.status] || 'Inspect the saved receipt.', 'receipt-note');
    explanation.append(node('small', dateText(receipt.appliedAt || receipt.requestedAt)));
    if(receipt.error)explanation.append(node('small',receipt.error.message));
    item.append(action, status, explanation); return item;
  }));
}
function svgNode(tag, attributes = {}, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}
function renderMap() {
  if(!snapshot)return;
  const actual=snapshot.workers??[],coverage=snapshot.coverage??{},bound=new Set(),planned=[];
  for(const item of stepItems()){
    const worker=stepWorker(item);if(worker)bound.add(worker.position);
    planned.push({...worker,position:worker?.position??stepIdentity(item.ref),status:worker?.status??stepStatus(item).toLowerCase(),options:{...worker?.options,label:item.label},phase:item.phase??'',dependencies:worker?.dependencies??[],planStep:item});
  }
  const workers=[...planned,...actual.filter(worker=>!bound.has(worker.position))];
  const mapPhase=worker=>worker.planStep?JSON.stringify([stepScope(worker.planStep.ref),worker.planStep.phase]):workerPhaseKey(worker);
  const mapPhaseLabel=worker=>worker.planStep?worker.planStep.phase??'':phaseLabel(worker);
  const visible=workers.filter(worker=>worker.planStep?.binding==='unassigned'||$('show-hidden').checked||visibilityFor(worker)==='visible');
  // Topological ordering is display-only; it cannot admit or block actual workers.
  const rank=new Map(orderSteps(stepItems()).map((item,index)=>[stepIdentity(item.ref),index]));
  const ordered=[...visible].sort((a,b)=>(a.planStep?rank.get(stepIdentity(a.planStep.ref)):4096)-(b.planStep?rank.get(stepIdentity(b.planStep.ref)):4096));
  const count=coverage.requested??actual.length,complete=coverage.completed??0;
  const percent=count?Math.floor(complete/count*100):null;
  const running=actual.filter(worker=>worker.status==='running').length;
  const queued=actual.filter(worker=>worker.status==='queued').length;
  const unavailable=snapshot.availability?.status==='unavailable';
  $('flow-progress').textContent=unavailable?'Execution data unavailable':`${complete} / ${count} complete · ${running} active`;
  $('coverage-breakdown').textContent=unavailable?'Worker counts and execution progress are unavailable.':`${queued} queued · ${coverage.failed??0} failed · ${coverage.unknown??0} unknown · ${coverage.cached??0} reused results. Completed execution is not coordinator acceptance.${['running','pausing','stopping','finishing'].includes(snapshot.status)?' The workflow can still discover more workers.':''}`;
  $('progress-fill').style.width=`${unavailable?0:percent??0}%`;
  if(percent===null||unavailable)$('progress').removeAttribute('aria-valuenow');else $('progress').setAttribute('aria-valuenow',String(percent));
  $('progress').setAttribute('aria-valuetext',$('flow-progress').textContent+' '+$('coverage-breakdown').textContent);
  const displayed=ordered.slice(0,60),positions=new Set(displayed.map(worker=>worker.position));
  const omittedEdges=displayed.flatMap(worker=>Array.isArray(worker.dependencies)?worker.dependencies.filter(position=>!positions.has(position)).map(position=>`Worker ${worker.position+1} depends on omitted prerequisite ${position+1}`):[]);
  const unknownDependencies=displayed.filter(worker=>!Array.isArray(worker.dependencies)).length;
  const hidden=actual.filter(worker=>visibilityFor(worker)!=='visible').length;
  $('map-note').textContent=`Grouping does not imply execution order. ${unknownDependencies?`Dependency evidence is unavailable for ${unknownDependencies} displayed workers.`:'Arrows show recorded prerequisites.'}${visible.length>displayed.length?` Map shows the first ${displayed.length} of ${visible.length} visible workers; ${workers.length} recorded in total.`:''}${hidden?` ${hidden} hidden or archived records; ${displayed.length} workers shown. Show hidden retains list access.`:''}${workers.length>displayed.length?' The full ordered worker tray retains access.':''}${omittedEdges.length?` ${omittedEdges.length} omitted prerequisite links: ${omittedEdges.slice(0,8).join('; ')}${omittedEdges.length>8?'; additional links are disclosed in worker details.':''}.`:''}`;
  if(stepItems().length){
    const keys=new Set(displayed.filter(worker=>worker.planStep).map(worker=>stepIdentity(worker.planStep.ref)));
    const omitted=displayed.flatMap(worker=>worker.planStep?.dependencies??[]).filter(ref=>!keys.has(stepIdentity(ref))).length;
    $('map-note').textContent=`Grouping does not imply execution order. Solid arrows show recorded worker prerequisites; dashed arrows show declared plan dependencies, not scheduler guarantees. Map shows the first ${displayed.length} of ${visible.length} loaded visible nodes; ${actual.length} actual workers recorded.${unknownDependencies?` Dependency evidence is unavailable for ${unknownDependencies} displayed workers.`:''}${hidden?` ${hidden} hidden or archived worker records; Show hidden retains access.`:''}${omittedEdges.length?` ${omittedEdges.length} worker prerequisite links omitted from this map; the worker tray retains evidence.`:''}${omitted?` ${omitted} declared links omitted from this map; dependencies remain in step details.`:''}${visible.length>60?' The Declared steps list retains loaded steps outside the first 60 map cards.':''}${stepState?.hasMore?' Further catalog pages and their edges are not loaded.':''}${stepState?.stale?' Step evidence is from the previous snapshot; current catalog coverage is unavailable.':''}`;
  }
  renderStepList();
  const compact=phoneLayout.matches;
  const key=JSON.stringify([compact,snapshot.generation,selected,selectedStep,stepState?.stale,$('show-hidden').checked,snapshot.lifecycle,snapshot.experience,workers]);
  if(key===mapKey)return;mapKey=key;
  const groups=new Map();
  for(const worker of [...ordered,...workers.filter(worker=>!visible.includes(worker))]){const phase=mapPhase(worker);if(!groups.has(phase))groups.set(phase,{name:mapPhaseLabel(worker)||'Unassigned phase',members:[]});groups.get(phase).members.push(worker);}
  const shownPhases=new Set(displayed.map(mapPhase));
  const placements=new Map(),width=compact?382:Math.max(800,shownPhases.size*210+40);
  let maxRows=1,column=0;
  for(const group of groups.values()){
    const members=group.members.filter(worker=>positions.has(worker.position));maxRows=Math.max(maxRows,members.length);
    members.forEach((worker,row)=>{const index=displayed.indexOf(worker);placements.set(worker.position,{worker,x:compact?18+index%2*183:28+column*210,y:compact?34+Math.floor(index/2)*132:80+row*132});});
    if(members.length)column++;
  }
  const height=compact?Math.max(530,Math.ceil(displayed.length/2)*132+90):Math.max(530,maxRows*132+140);
  const world=node('div',undefined,'graph-world');world.id='graph-world';world.style.width=`${width}px`;world.style.height=`${height}px`;
  const svg=svgNode('svg',{class:'map-edges',width,height,viewBox:`0 0 ${width} ${height}`,'aria-hidden':'true'});
  const marker=svgNode('marker',{id:'dependency-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto'});
  marker.append(svgNode('path',{d:'M 0 0 L 10 5 L 0 10 z',class:'arrow-head'}));const defs=svgNode('defs');defs.append(marker);svg.append(defs);world.append(svg);
  column=0;
  for(const group of groups.values()){
    const done=group.members.filter(worker=>worker.status==='completed').length,failed=group.members.filter(worker=>worker.status==='failed').length,unknown=group.members.filter(worker=>worker.status==='unknown').length,active=group.members.filter(worker=>worker.status==='running').length;
    const aggregate=`${group.name}: ${done}/${group.members.length} complete · ${failed} failed · ${unknown} unknown · ${active} active`;
    const members=group.members.filter(worker=>positions.has(worker.position));
    const heading=node('div',group.name,members.length?'map-phase':'sr-only');heading.style.left=members.length?`${28+column*210}px`:'0px';heading.title=aggregate;heading.append(node('span',aggregate,'sr-only'));world.append(heading);
    if(members.length){const first=placements.get(members[0].position),ax=compact?first.x-8:first.x+8,ay=compact?first.y-10:45;
      svg.append(svgNode('circle',{cx:ax,cy:ay,r:2,class:'map-phase-anchor','data-phase':group.name}));
      for(const worker of members){const p=placements.get(worker.position);svg.append(svgNode('path',{d:`M ${ax} ${ay} H ${p.x-8} V ${p.y+30} H ${p.x}`,class:'map-group-link map-membership','data-position':worker.position,'data-phase':group.name}));}
    }
    if(members.length)column++;
  }
  const cardWidth=compact?164:174;
  const declaredPlacements=new Map([...placements.values()].filter(p=>p.worker.planStep).map(p=>[stepIdentity(p.worker.planStep.ref),p]));
  for(const p of declaredPlacements.values())for(const ref of p.worker.planStep.dependencies){
    const start=declaredPlacements.get(stepIdentity(ref));if(!start)continue;
    const lane=Math.max(start.x,p.x)+cardWidth+12;
    svg.append(svgNode('path',{d:`M ${start.x+cardWidth} ${start.y+65} H ${lane} V ${p.y+65} H ${p.x+cardWidth+4}`,class:'map-plan-dependency','marker-end':'url(#dependency-arrow)','data-from-step':stepIdentity(ref),'data-to-step':stepIdentity(p.worker.planStep.ref)}));
  }
  for(const p of placements.values())for(const dependency of Array.isArray(p.worker.dependencies)?p.worker.dependencies:[]){
    const start=placements.get(dependency);if(!start)continue;
    const sy=start.y+49,ey=p.y+49;
    let d;
    if(compact){const same=start.x===p.x,lane=same?(start.x<100?7:375):191,sx=same?(start.x<100?start.x:start.x+cardWidth):(start.x<p.x?start.x+cardWidth:start.x),ex=same?(p.x<100?p.x-4:p.x+cardWidth+4):(start.x<p.x?p.x-4:p.x+cardWidth+4);d=`M ${sx} ${sy} H ${lane} V ${ey} H ${ex}`;}
    else if(start.x===p.x){const lane=p.x+cardWidth+15;d=`M ${start.x+cardWidth} ${sy} H ${lane} V ${ey} H ${p.x+cardWidth+4}`;}
    else {const forward=start.x<p.x,sx=forward?start.x+cardWidth:start.x,ex=forward?p.x-4:p.x+cardWidth+4,middle=(sx+ex)/2;d=`M ${sx} ${sy} C ${middle} ${sy}, ${middle} ${ey}, ${ex} ${ey}`;}
    svg.append(svgNode('path',{d,class:'map-dependency','marker-end':'url(#dependency-arrow)','data-from':dependency,'data-to':p.worker.position}));
  }
  for(const {worker,x,y} of placements.values()){
    const plan=worker.planStep,unassigned=plan&&!plan.worker;
    const label=worker.options?.label||`Worker ${worker.position+1}`,card=node('button',undefined,unassigned?'map-step':'map-worker');
    card.type='button';if(!unassigned)card.dataset.position=worker.position;if(plan)card.dataset.graphKey=stepIdentity(plan.ref);card.dataset.status=worker.status;card.style.left=`${x}px`;card.style.top=`${y}px`;card.style.width=`${cardWidth}px`;
    card.setAttribute('aria-pressed',String(plan?selectedStep===stepIdentity(plan.ref)||selected===worker.position:selected===worker.position));
    card.setAttribute('aria-label',`${label}, ${worker.status}${worker.cached?', reused result':''}${worker.origin?.kind==='append'?', added during run':''}, phase ${phaseLabel(worker)||'unassigned'}. ${Array.isArray(worker.dependencies)?worker.dependencies.length?`Prerequisites: ${worker.dependencies.map(position=>`worker ${position+1}${positions.has(position)?'':' omitted from map'}`).join(', ')}`:'No prerequisites declared':'Dependency evidence unavailable'}`);
    const top=node('span',undefined,'node-top');top.append(node('span',unassigned?'STEP':`${worker.origin?.kind==='append'?'ADDED':'WORKER'} ${worker.position+1}`,'node-role'),node('span',plan?stepStatus(plan):worker.status,'node-status'));
    const waiting=plan?.displayBlockedBy.length?`Waiting for ${plan.displayBlockedBy.map(stepName).join(', ')}`:'';
    card.append(top,node('strong',label,'map-worker-title'),node('span',primaryFailure(worker)||waiting||worker.activity?.summary||(unassigned?'No worker assigned':mapPhaseLabel(worker)||'No activity recorded'),primaryFailure(worker)?'node-note node-failure':'node-note'));
    if(primaryFailure(worker))card.setAttribute('aria-label',`${card.getAttribute('aria-label')}. ${primaryFailure(worker)}`);
    if(plan)card.setAttribute('aria-label',`${label}, ${stepStatus(plan)}, phase ${plan.phase??'unassigned'}, ${plan.ref.scope.kind==='root'?'root':plan.ref.scope.invocation.invocationId}. ${waiting}. ${primaryFailure(worker)||'Declared plan relation; no scheduler guarantee.'}`);
    card.title=primaryFailure(worker)?`${label}: ${primaryFailure(worker)}`:label;card.addEventListener('click',event=>plan?chooseStep(event.currentTarget.dataset.graphKey,event.currentTarget):chooseWorker(Number(event.currentTarget.dataset.position),event.currentTarget));
    const wrapper=node('div',undefined,'map-card');if(!unassigned)wrapper.dataset.position=worker.position;if(plan)wrapper.dataset.graphKey=stepIdentity(plan.ref);
    wrapper.append(card);world.append(wrapper);if(unassigned)continue;
    const menu=node('button',undefined,'worker-menu-toggle');menu.type='button';menu.id=`worker-menu-${worker.position}`;menu.dataset.position=worker.position;menu.style.left=`${x+cardWidth-30}px`;menu.style.top=`${y+3}px`;
    menu.setAttribute('aria-label',`Open evidence menu for ${label}`);menu.setAttribute('aria-haspopup','menu');menu.setAttribute('aria-controls','worker-card-menu');menu.setAttribute('aria-expanded',String(quickView?.position===worker.position&&!$('worker-card-menu').hidden));
    const icon=svgNode('svg',{width:4,height:16,viewBox:'0 0 4 16','aria-hidden':'true',focusable:'false'});for(const cy of [2,8,14])icon.append(svgNode('circle',{cx:2,cy,r:1.6}));menu.append(icon);
    menu.addEventListener('click',event=>openQuickMenu(Number(event.currentTarget.dataset.position)));menu.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openQuickMenu(Number(event.currentTarget.dataset.position));if(event.key==='ArrowUp')$('worker-card-menu').lastElementChild?.focus();}});
    wrapper.append(menu);
  }
  if(!workers.length)world.append(node('p',unavailable?'Worker execution data unavailable.':'Workers appear as the workflow discovers them.','empty'));
  const focused=focusIdentity(document.activeElement);
  const retained=$('graph-world');
  if(retained?.style.transform)world.style.transform=retained.style.transform;
  if(retained)patchMapNode(retained,world);else $('workflow-map').append(world);
  if(focused?.kind==='map'||focused?.kind==='step')restoreFocus(focused);
  if(quickView&&!quickOrigin())closeQuick(false);
  positionQuick();
}
function render(deferGraph=false) {
  const unavailable=snapshot.availability?.status==='unavailable';
  $('run-title').textContent = snapshot.meta?.name || snapshot.meta?.title || 'Workflow run';
  textChanged($('run-picker-title'),snapshot.meta?.name||snapshot.meta?.title||snapshot.monitor?.run?.runId||'Run unavailable');
  $('description').textContent = snapshot.meta?.description || 'Inspect worker results and control this saved workflow.';
  $('generation').textContent = unavailable?'Generation and worker slots unavailable':`Generation ${snapshot.generation} · ${snapshot.concurrency} worker slots`;
  badge($('run-status'), snapshot.status);
  const coverage = snapshot.coverage ?? {};
  $('completed').textContent = unavailable?'Unavailable':`${coverage.completed ?? 0} / ${coverage.requested ?? 0}`;
  $('cached').textContent = unavailable?'Unavailable':coverage.cached ?? 0;
  $('attempts').textContent = unavailable?'Unavailable':snapshot.attempts ?? 0;
  const cleanup = snapshot.cleanup;
  $('cleanup').textContent = cleanup ? `${cleanup.serverExited === true ? 'Owned worker App Server exited' : 'Owned worker App Server exit unverified'}${cleanup.forced ? ' · forced' : ''}. ${cleanup.jobEmpty===true?'Owned Windows job empty; external effects unverified.':`Descendant processes ${cleanup.descendants === 'notVerified' ? 'not verified' : 'not reported'}.`}` : 'Awaiting owned worker cleanup evidence';
  $('updated').textContent = unavailable?snapshot.availability.reason:`Run updated ${dateText(snapshot.updatedAt)}`;
  if(!deferGraph){renderWorkers();renderDetail();renderMap();}renderReceipts();renderQuick();
  renderExperienceControls();
  const key = JSON.stringify([snapshot.generation, snapshot.result, snapshot.error, snapshot.truncations]);
  if (key !== resultKey) {
    resultKey = key;
    const output = $('run-evidence'); output.replaceChildren();
    if (snapshot.truncations?.length) {
      output.append(node('p', `Snapshot shortened: ${snapshot.truncations.join(', ')}.`, 'truncation'));
      const load = node('button', 'Load full result'); load.type = 'button';
      load.addEventListener('click', async () => {
        const generation = snapshot.generation; load.disabled = true;
        try {
          const result = await api(`/api/result?generation=${generation}`);
          if (snapshot?.generation !== generation) return;
          const full = node('div');
          if (Object.hasOwn(result, 'result')) evidence(full, 'Full workflow result', result.result);
          if (result.error) evidence(full, 'Full run error', result.error, true);
          load.replaceWith(full);
        } catch (error) { readError(error); }
        finally { load.disabled = false; }
      });
      output.append(load);
    }
    if (Object.hasOwn(snapshot, 'result')) evidence(output, 'Workflow result', snapshot.result);
    else output.append(node('p', 'No workflow result recorded.', 'muted'));
    if (snapshot.error) evidence(output, 'Run error', snapshot.error, true);
  }
  updateButtons();
}
function renderExperienceControls(){
  if(!snapshot)return;
  const ref=snapshot.monitor?.run;
  $('control-target').textContent=ref&&!snapshot.monitor.capabilities?.scopedControls?'Retained-runtime control adapter unavailable.':controlTarget?`Control identity: ${controlTarget.runId} · ${controlTarget.runtimeId} · generation ${controlTarget.generation}${controlsMatch()?'':' · current-run identity or freshness unverified'}`:ref?'Controls unavailable until a selected current run has fresh authorized evidence.':`Control identity: this saved run · generation ${snapshot.generation}`;
  $('run-permalink').href=ref?`/runs/${encodeURIComponent(ref.runId)}`:'/';
  const navigationAvailable=snapshot.monitor?.capabilities?.sessionNavigation;
  textChanged($('navigation-reason'),navigationAvailable?navigationError||'Choose a run to inspect its workers and use its available controls.':'Originating-session navigation adapter unavailable.');
  $('session-counts').textContent=navigationAvailable?`${navigationCounts?.hiddenCount??'Unavailable'} hidden runs · ${navigationCounts?.unknownCount??'unavailable'} unknown runs · ${navigationCounts?.unavailableCount??'unavailable'} unavailable runs`:'Session counts unavailable';
  renderRunPicker();
  const workers=snapshot.workers??[],hidden=workers.filter(worker=>visibilityFor(worker)==='hidden').length,archived=workers.filter(worker=>visibilityFor(worker)==='archived').length;
  $('visibility-count').textContent=snapshot.lifecycle?.visibilityKnown===false?`Visibility unavailable · ${workers.filter(worker=>worker.status==='unknown').length} unknown executions`:`${hidden} hidden · ${archived} archived · ${workers.filter(worker=>worker.status==='unknown').length} unknown · run ${snapshot.lifecycle?.run?.visibility??'visible'}`;
  if(snapshot.availability?.status==='unavailable')$('visibility-count').textContent='Visibility and execution counts unavailable';
  $('lifecycle-reason').textContent=lifecycleUncertain?'Lifecycle confirmation is unknown. Inspect the receipt; this request will not be retried.':snapshot.monitor?.capabilities?.lifecycle&&snapshot.lifecycle?.available!==false?'Visibility preserves outcomes. Prune requires a separate reviewed storage plan.':snapshot.lifecycle?.reason??'Lifecycle adapter for engine/run-lifecycle.mjs unavailable.';
  const nextPruneKey=JSON.stringify([runKey(),pruneReview]);
  if(nextPruneKey!==pruneKey){
  pruneKey=nextPruneKey;
  const panel=$('lifecycle-preview');panel.replaceChildren();panel.hidden=!pruneReview;
  if(pruneReview){
    const preview=pruneReview.preview;panel.append(node('h3','Storage pruning review'),node('p',`Preview ${preview.id}; generation ${pruneReview.generation}; revision ${pruneReview.expectedRevision}.`));
    const list=node('ul');for(const candidate of (preview.candidates??[]).slice(0,100))list.append(node('li',typeof candidate==='string'?candidate:candidate.path??'Exact candidate details unavailable'));panel.append(list);
    for(const reason of (preview.blocked??[]).slice(0,100))panel.append(node('p',typeof reason==='string'?reason:valueText(reason),'failure'));
    if((preview.candidates?.length??0)>100)panel.append(node('p','Preview has additional candidates; request a bounded authoritative review before applying.'));
    if(/^[a-f0-9]{64}$/.test(preview.planHash??'')&&Array.isArray(preview.candidates)&&preview.candidates.length<=100&&Array.isArray(preview.blocked)&&!preview.blocked.length){
      if(!preview.candidates.length)panel.append(node('p','This plan removes no retained files. Applying it can retire the settled record through a retained tombstone and audit receipt.'));
      const apply=node('button',preview.candidates.length?'Apply reviewed prune':'Apply reviewed retirement');apply.id='apply-prune';apply.type='button';apply.className='danger';apply.addEventListener('click',()=>mutateLifecycle('applyPrune',pruneReview.target));panel.append(apply);
    }
    else panel.append(node('p','Pruning is unavailable for this review. No data was removed.'));
  }
  }
  const receiptPanel=$('lifecycle-receipt');receiptPanel.hidden=!lifecycleReceipt;
  if(lifecycleReceipt)textChanged(receiptPanel,`Lifecycle receipt: ${valueText(lifecycleReceipt).slice(0,6000)}`);
  $('inspect-lifecycle').hidden=!lifecycleReceipt||!snapshot.monitor?.capabilities?.lifecycleReceipt;
}
async function loadNavigation(append=false,retry=null){
  if(closed||disposed||document.hidden||!authenticated||!snapshot?.monitor?.capabilities?.sessionNavigation)return;
  const includeHidden=Boolean($('show-hidden').checked);
  if(navigationLoading){navigationScopePending=includeHidden!==navigationScope;return;}
  if(navigationScope!==includeHidden){navigationScope=includeHidden;navigationTail=[];tailCursor=null;nextRunCursor=null;append=false;navigationFailure=null;navigationError='';retry=null;}
  if(retry){if(retry.includeHidden!==includeHidden)return;append=retry.append;}
  const requestedCursor=retry?retry.cursor:append?nextRunCursor:null;
  navigationLoading=true;
  if(document.activeElement===$('retry-runs'))$('run-search').focus({preventScroll:true});
  $('retry-runs').disabled=true;
  try{
    const page=await api(`/api/session/runs?limit=25&includeHidden=${includeHidden}${requestedCursor?`&cursor=${encodeURIComponent(requestedCursor)}`:''}`);
    if(!Array.isArray(page.items))throw new Error('Session navigation evidence unavailable.');
    if(closed||disposed||document.hidden||!authenticated||Boolean($('show-hidden').checked)!==includeHidden)return;
    navigationCounts=page;
    if(!navigationFailure||navigationFailure.includeHidden===includeHidden&&navigationFailure.cursor===requestedCursor&&navigationFailure.append===append){navigationError='';navigationFailure=null;}
    if(append){navigationTail=[...new Map([...navigationTail,...page.items].map(item=>[item.ref.runId,item])).values()].slice(0,975);tailCursor=page.nextCursor??null;}
    const head=append?[...new Map([...navigation,...page.items].map(item=>[item.ref.runId,item])).values()]:page.items,headIds=new Set(head.map(item=>item.ref.runId));
    navigation=[...head,...navigationTail.filter(item=>!headIds.has(item.ref.runId))].slice(0,1000);
    nextRunCursor=navigationTail.length?tailCursor:page.nextCursor;
    if(snapshot)renderExperienceControls();
    if($('follow-run').checked&&!busy&&$('run-popover').hidden){const newest=[...navigation].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];if(newest&&newest.ref.runId!==snapshot?.monitor?.run?.runId)switchView(newest.ref.runId);}
  }catch(error){if(!navigationFailure||retry)navigationFailure={includeHidden,cursor:requestedCursor,append,error:error.message};navigationError=navigationFailure.error;textChanged($('navigation-reason'),navigationError);renderRunPicker();updateButtons();}finally{
    navigationLoading=false;
    $('retry-runs').disabled=false;
    if(navigationScopePending){navigationScopePending=false;void loadNavigation();}
  }
}
async function mutateLifecycle(action,target={kind:'run'}){
  if(busy||stale||!snapshot||lifecycleUncertain||!snapshot.monitor?.capabilities?.lifecycle)return;
  const ref={...snapshot.monitor.run,generation:snapshot.generation},key=runKey();
  const request={action,runTarget:ref,target,generation:snapshot.generation,expectedRevision:snapshot.lifecycle.revision,requestId:globalThis.crypto?.randomUUID?.()??`monitor-${Date.now()}-${Math.random().toString(36).slice(2)}`};
  if(action==='planPrune')request.reason=$('lifecycle-note').value.trim()||'Review dispensable data for this exact retained target';
  if(action==='applyPrune'){
    if(!pruneReview||!sameRun(pruneReview.runTarget,ref)||pruneReview.generation!==snapshot.generation||pruneReview.expectedRevision!==snapshot.lifecycle.revision){notice('Pruning review is stale. Obtain a new storage preview.');return;}
    Object.assign(request,{planId:pruneReview.preview.id,approvedPlanHash:pruneReview.preview.planHash});
    if(!confirm('Apply this exact reviewed pruning plan? Storage will recheck identity, references and eligibility before removing data.'))return;
  }
  if(key!==runKey()||snapshot.generation!==request.generation)return;
  busy=true;clearTimeout(timer);updateButtons();
  try{
    const result=await api('/api/lifecycle',{method:'POST',body:request,runId:ref.runId});
    lifecycleReceipt=result.receipt??result;
    if(result.preview){pruneReview={...request,preview:result.preview};actionNotice='Storage review received. No pruning has been applied.';}
    else if(result.receipt){lifecycleUncertain=!['applied','rejected','hidden','archived','restored'].includes(result.receipt.outcome??result.receipt.status);if(action==='applyPrune'&&!lifecycleUncertain)pruneReview=null;actionNotice='Lifecycle receipt received. Refreshing authoritative disposition.';}
    else{lifecycleUncertain=true;actionNotice='Lifecycle response has no receipt or preview. Inspect authoritative storage before another request.';}
  }catch(error){
    lifecycleUncertain=true;lifecycleReceipt={requestId:request.requestId,receiptId:action==='applyPrune'?request.planId:action==='planPrune'?null:request.requestId,runId:ref.runId,outcome:'unknown',diagnostic:error.message};
    actionNotice=`${error.message} The lifecycle request was not retried. Coordinator receipt inspection or reconciliation is required.`;
  }finally{busy=false;stale=true;notice(actionNotice);await poll();}
}
async function poll(forceSteps=false) {
  clearTimeout(timer);
  if (disposed || closed || polling || busy || !authenticated || document.hidden) return;
  polling = true; updateButtons();
  const viewed=viewRun;
  let health=false;
  try {
    const results=await Promise.allSettled([api('/api/run'),api('/api/health')]);
    health=results[1].status==='fulfilled'&&results[1].value?.status==='available';
    if(viewed!==viewRun||disposed||closed||document.hidden||!authenticated)return;
    if(results[0].status!=='fulfilled')throw results[0].reason;
    const next=results[0].value;
    const unavailable=next?.availability?.status==='unavailable'&&next.status==='unavailable'&&next.generation===null&&next.workers?.length===0;
    if (!next || !Array.isArray(next.workers) || !Number.isInteger(next.generation)&&!unavailable) throw new Error('The monitor received an invalid run snapshot. Refresh to try again.');
    if (snapshot?.generation !== next.generation) {extendedWorker = undefined;closeQuick(false);}
    if (extendedWorker && extendedWorker.previewKey !== JSON.stringify(next.workers.find(worker => worker.position === extendedWorker.position))) extendedWorker = undefined;
    if (snapshot?.generation !== next.generation) { $('script').hidden = true; $('script').textContent = ''; activityHistory=undefined; patchEvidence.clear(); patchLoading.clear(); }
    const deferGraph=Boolean(stepState&&snapshot?.generation!==next.generation);
    if(snapshot?.generation!==next.generation){resetSteps();if(selectedStep)selected=undefined;}
    snapshot = next; lastGood = Date.now(); stale = false;
    if(!unavailable&&!autoArmed&&snapshot.monitor?.run&&snapshot.monitor.run.runId===snapshot.monitor.pinnedRunId){selectedRunAuthority={...snapshot.monitor.run};autoArmed=true;}
    if(!unavailable&&health&&selectedRunAuthority&&sameRun(selectedRunAuthority,snapshot.monitor?.run))controlTarget={...snapshot.monitor.run,generation:snapshot.generation};
    $('connection').textContent = unavailable?health?'Dashboard connected; execution data unavailable':'Dashboard health and execution data unavailable':health?'Dashboard connected · run snapshot fresh':'Dashboard health unavailable · run snapshot fresh';
    if(!health)stale=true;
    if(actionNotice)notice(actionNotice);
    notice(snapshot.error ? valueText(snapshot.error) : actionNotice); render(deferGraph);
    await Promise.allSettled([loadNavigation(),loadSteps(false,{force:forceSteps===true})]);
    if(deferGraph&&viewed===viewRun)render();
  } catch (error) {
    if(viewed!==viewRun)return;
    stale = true;
    $('connection').textContent = authenticated ? health?'Dashboard connected; run data unavailable':'Dashboard connection unavailable' : 'Authentication required';
    notice(`${error.message}${authenticated && lastGood ? ` Displaying the last snapshot from ${dateText(lastGood)}. Controls are disabled until a fresh snapshot arrives.` : ''}`,error.message);
  } finally {
    polling = false; updateButtons();
    if(viewed!==viewRun&&!disposed&&!closed&&authenticated&&!document.hidden)void poll();else schedulePoll();
  }
}
async function mutate(action) {
  if (busy || !controlsMatch()) return;
  const generation = snapshot.generation;
  const target=snapshot.monitor?.run?{...controlTarget}:null,runId=target?.runId??viewRun;
  if (action === 'stop' && !confirm(`Stop ${target?`${target.runId}, runtime ${target.runtimeId}, generation ${generation}`:'this workflow'}? Active workers will be asked to interrupt. An uncertain outcome can prevent resume.`)) return;
  if(!controlsMatch()||snapshot.generation!==generation||target&&!sameRun(target,snapshot.monitor.run))return;
  busy = true; actionNotice = ''; clearTimeout(timer); updateButtons();
  try {
    const result = await api(action === 'resume' ? '/api/resume' : '/api/control', { method: 'POST',runId, body: {generation,...(action==='resume'?{}:{action}),...(target?{target}:{})} });
    if (action === 'resume') actionNotice = `Resume started generation ${result.generation}. Waiting for its persisted state.`;
    else { localReceipt = result; actionNotice = `${action === 'pause' ? 'Pause' : 'Stop'} requested. A pending receipt does not mean the workflow has finished.`; renderReceipts(); }
    notice(actionNotice);
  } catch (error) {
    actionNotice = `${error.message} The request was not retried. Refresh and inspect the run and control receipts before trying again.`;
    notice(actionNotice);
  } finally { busy = false; stale = true; updateButtons(); await poll(); }
}
async function mutateWorker(action){
  if(busy||!controlsMatch())return;
  const worker=snapshot.workers.find(item=>item.position===selected);
  if(!worker||worker.cancelRequested||!['running','queued'].includes(worker.status))return;
  const body={generation:snapshot.generation,action,position:worker.position,attempt:worker.attempts??0,turnId:worker.activeTurn?.turnId??null,...(action==='steer'?{text:$('steer-text').value}:{})};
  const target=snapshot.monitor?.run?{...controlTarget,position:body.position,attempt:body.attempt,turnId:body.turnId}:null,runId=target?.runId??viewRun;
  if(target)body.target=target;
  if(action==='cancel-worker'&&!confirm(`Cancel worker ${worker.position+1}${target?` in ${target.runId}`:''}? Other workers will continue. An uncertain outcome can prevent restart.`))return;
  if(!controlsMatch()||snapshot.generation!==body.generation||target&&!sameRun(target,snapshot.monitor.run))return;
  busy=true;actionNotice='';clearTimeout(timer);updateButtons();
  try{
    localReceipt=await api('/api/control',{method:'POST',body,runId});
    actionNotice=`${action==='steer'?'Steering':'Cancellation'} requested for worker ${worker.position+1}. Check its receipt for confirmation.`;
    if(action==='steer'){steerDraft=undefined;$('steer-text').value='';}renderReceipts();notice(actionNotice);
  }catch(error){actionNotice=`${error.message} The request was not retried. Inspect the worker and control receipts before trying again.`;notice(actionNotice);}
  finally{busy=false;stale=true;updateButtons();await poll();}
}
async function restartWorker(){
  const preview=snapshot?.restartPreview;
  if(busy||!controlsMatch()||!preview?.eligible||preview.position!==selected||!$('reconcile-text')?.value.trim())return;
  const body={generation:snapshot.generation,position:preview.position,attempt:preview.attempt,reconciliation:$('reconcile-text').value.trim()};
  const target=snapshot.monitor?.run?{...controlTarget,position:preview.position,attempt:preview.attempt}:null,runId=target?.runId??viewRun;
  if(target)body.target=target;
  if(!confirm(`Restart worker ${preview.position+1} and all later workers? This may repeat their external effects. Your reconciliation note will be saved.`))return;
  if(!controlsMatch()||snapshot.generation!==body.generation||target&&!sameRun(target,snapshot.monitor.run))return;
  busy=true;actionNotice='';clearTimeout(timer);updateButtons();
  try{const result=await api('/api/restart',{method:'POST',body,runId});reconcileDraft=undefined;actionNotice=`Restart started generation ${result.generation}. Earlier execution evidence is retained.`;}
  catch(error){actionNotice=`${error.message} The request was not retried. Refresh and inspect the generation before trying again.`;}
  finally{notice(actionNotice);busy=false;stale=true;updateButtons();await poll();}
}
for (const action of ['pause', 'stop', 'resume']) $(action).addEventListener('click', () => mutate(action));
$('follow-run').addEventListener('change',()=>{if($('follow-run').checked)void loadNavigation();});
$('more-runs').addEventListener('click',()=>loadNavigation(true));
$('retry-runs').addEventListener('click',()=>loadNavigation(false,navigationFailure));
$('show-hidden').addEventListener('change',()=>{if(snapshot){listKey=mapKey=detailKey='';render();void loadNavigation();}});
for(const action of ['hide','archive','restore'])$(`${action}-run`).addEventListener('click',()=>mutateLifecycle(action));
$('review-prune').addEventListener('click',()=>mutateLifecycle('planPrune'));
$('inspect-lifecycle').addEventListener('click',async()=>{
  const receiptId=lifecycleReceipt?.receiptId??lifecycleReceipt?.id;
  if(!receiptId){notice('The response was lost before a receipt ID was received. Ask the coordinator to reconcile the saved request ID; do not resubmit.');return;}
  const viewed=runKey();
  try{const result=await api(`/api/lifecycle/receipts/${encodeURIComponent(receiptId)}`);if(viewed!==runKey())return;lifecycleReceipt=result.receipt??result;lifecycleUncertain=!['applied','rejected','restored','hidden','archived'].includes(lifecycleReceipt.outcome??lifecycleReceipt.status);if(snapshot)renderExperienceControls();updateButtons();}catch(error){if(viewed===runKey())readError(error);}
});
$('close-monitor').addEventListener('click',async()=>{
  if(closed||busy||!authenticated||!confirm('Close this dashboard instance? The workflow runner and retained evidence remain available.'))return;
  closed=true;disposed=true;closeQuick(false);clearTimeout(timer);updateButtons();
  try{await api('/api/close',{method:'POST',body:{},runId:null});$('connection').textContent='Dashboard closed';notice('This dashboard instance was closed. Reopen from the CLI to inspect the run.');}
  catch(error){$('connection').textContent='Dashboard close confirmation unavailable';notice(`${error.message} Close was not retried. Inspect service availability before another request.`);}
});
for (const id of ['status-filter', 'phase-filter']) $(id).addEventListener('change', () => { if (snapshot) { renderWorkers(); renderDetail(); renderMap(); } });
$('refresh').addEventListener('click', () => { actionNotice = ''; poll(true); });
$('load-script').addEventListener('click', async () => {
  $('load-script').disabled = true;
  const generation = snapshot?.generation;
  try {
    const script = await api(`/api/script?generation=${generation}`, { text: true });
    if (snapshot?.generation !== generation) return;
    $('script').textContent = script; $('script').hidden = false;
  }
  catch (error) { readError(error); }
  finally { updateButtons(); }
});
document.addEventListener('visibilitychange', () => {
  clearTimeout(timer);
  if (document.hidden) { finishPaneDrag();stale = true; $('connection').textContent = 'Updates paused while hidden'; updateButtons(); }
  else if(pollingChoice!=='manual')poll();
});
window.addEventListener('pagehide', () => { finishPaneDrag();closeQuick(false);disposed = true; clearTimeout(timer); for (const request of requests) request.abort(); });
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    disposed = false;
    if(pollingChoice!=='manual')poll();
    else{stale=true;$('connection').textContent='Manual refresh · read fresh data to enable controls';updateButtons();}
  }
});
if (authenticated) poll();
else { $('connection').textContent = 'Authentication required'; notice(authMessage); updateButtons(); }
