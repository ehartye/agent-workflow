const $ = id => document.getElementById(id);
const themeKey = 'agent-workflow.monitor.theme';
let theme = 'system';
try { theme = localStorage.getItem(themeKey) || 'system'; } catch { /* System preference remains available. */ }
if (!['light', 'dark', 'system'].includes(theme)) theme = 'system';
const preferredTheme = matchMedia('(prefers-color-scheme: light)');
function setTheme() { document.documentElement.dataset.theme = theme === 'system' ? (preferredTheme.matches ? 'light' : 'dark') : theme; }
$('theme').value = theme; setTheme();
preferredTheme.addEventListener('change', setTheme);
$('theme').addEventListener('change', () => { theme = $('theme').value; try { localStorage.setItem(themeKey, theme); } catch { /* Persist for this page only. */ } setTheme(); });
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
let lastGood = 0, stale = true, listKey = '', detailKey = '', phaseKey = '', resultKey = '', receiptKey = '';
let extendedWorker, localReceipt, actionNotice = '', mapKey = '';
let activityHistory, activityLoading = false, activityFilter = 'tools';
let steerDraft;
let reconcileDraft,earlierEvidence;
const requests = new Set();
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = String(text);
  if (className) element.className = className;
  return element;
}
function valueText(value) { return typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
function activityType(value) { return ({commandExecution:'Command',agentMessage:'Response',userMessage:'Instruction',fileChange:'File change',mcpToolCall:'Tool call',webSearch:'Web search',usage:'Token usage',turn:'Worker turn',plan:'Plan'})[value]??value??'Event'; }
function activityStatus(value) { return ({inProgress:'running',completed:'completed',failed:'failed',updated:'updated'})[value]??value??'updated'; }
function dateText(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? 'Time unavailable' : date.toLocaleString(); }
function badge(element, status) { element.textContent = status; element.dataset.status = status; }
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function evidence(container, title, value, failure = false) {
  container.append(node('h3', title));
  const pre = node('pre', valueText(value), failure ? 'failure' : undefined);
  pre.tabIndex = 0;
  container.append(pre);
}
async function api(path, { method = 'GET', body, text = false } = {}) {
  const abort = new AbortController(); requests.add(abort);
  const timeout = setTimeout(() => abort.abort(), method === 'POST' ? 90000 : 10000);
  try {
    const response = await fetch(path, { method, credentials: 'omit', cache: 'no-store', signal: abort.signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.status === 401 || response.status === 403) {
      authenticated = false;
      throw new Error(authMessage);
    }
    if (!response.ok) {
      let message = `Request failed (${response.status}).`;
      try { const error = await response.json(); message = error.error?.message ?? error.message ?? message; } catch { /* Keep the HTTP status. */ }
      const error = new Error(message); error.status = response.status; throw error;
    }
    return text ? await response.text() : await response.json();
  } finally { clearTimeout(timeout); requests.delete(abort); }
}
function readError(error) {
  actionNotice = error.message + (error.status === 409 ? ' The run changed. Refresh, then open this evidence again.' : '');
  notice(actionNotice); updateButtons();
  if (error.status === 409) { stale = true; updateButtons(); poll(); }
}
function updateButtons() {
  const enabled = authenticated && !busy && !stale && snapshot;
  const accepts = enabled && snapshot.acceptingControls === true;
  $('pause').disabled = !accepts || snapshot.status !== 'running';
  $('stop').disabled = !accepts || !['running', 'pausing'].includes(snapshot.status);
  $('resume').disabled = !enabled || snapshot.resumable !== true;
  $('refresh').disabled = polling || busy || !authenticated;
  $('load-script').disabled = !authenticated || busy || !snapshot;
  const worker=snapshot?.workers.find(worker=>worker.position===selected);
  const workerEnabled=accepts&&snapshot.status!=='stopping'&&worker&&!worker.cancelRequested&&['queued','running'].includes(worker.status);
  if($('worker-cancel'))$('worker-cancel').disabled=!workerEnabled;
  if($('worker-steer'))$('worker-steer').disabled=!workerEnabled||!worker.activeTurn?.turnId||!$('steer-text')?.value.trim();
  if($('worker-restart'))$('worker-restart').disabled=!enabled||!snapshot.restartPreview?.eligible||snapshot.restartPreview.position!==selected||!$('reconcile-text')?.value.trim();
}
function renderWorkers() {
  const workers = snapshot.workers ?? [];
  const phases = [...new Set(workers.map(worker => worker.phase || worker.options?.phase || '').filter(Boolean))];
  const nextPhaseKey = JSON.stringify(phases);
  if (nextPhaseKey !== phaseKey) {
    phaseKey = nextPhaseKey;
    const current = $('phase-filter').value;
    $('phase-filter').replaceChildren(new Option('All phases', ''));
    for (const phase of phases) $('phase-filter').append(new Option(phase, phase));
    $('phase-filter').value = phases.includes(current) ? current : '';
  }
  const filtered = workers.filter(worker => (!$('status-filter').value || worker.status === $('status-filter').value) &&
    (!$('phase-filter').value || (worker.phase || worker.options?.phase || '') === $('phase-filter').value));
  if (!filtered.some(worker => worker.position === selected)) selected = filtered[0]?.position;
  const key = JSON.stringify([snapshot.generation, selected, filtered.map(worker => [worker.position, worker.status, worker.cached, worker.options?.label, worker.phase, worker.options?.phase])]);
  if (key !== listKey) {
    listKey = key;
    const focusPosition = document.activeElement?.dataset?.position;
    const children = filtered.map(worker => {
      const item = node('li');
      const button = node('button', undefined, 'worker');
      button.type = 'button'; button.dataset.position = worker.position;
      button.setAttribute('aria-pressed', String(worker.position === selected));
      const content = node('span');
      content.append(node('span', worker.options?.label || `Worker ${worker.position + 1}`, 'worker-name'),
        node('span', worker.phase || worker.options?.phase || 'No phase assigned', 'worker-phase'));
      const status = node('span', worker.status, 'worker-state'); status.dataset.status = worker.status;
      if (worker.cached) status.append(node('small', 'reused result'));
      button.append(node('span', String(worker.position + 1).padStart(2, '0'), 'slot'), content, status);
      button.addEventListener('click', () => { selected = worker.position; extendedWorker = undefined; renderWorkers(); renderDetail(); renderMap(); });
      item.append(button); return item;
    });
    $('worker-list').replaceChildren(...children);
    if (focusPosition !== undefined) [...$('worker-list').querySelectorAll('button')].find(button => button.dataset.position === focusPosition)?.focus({ preventScroll: true });
  }
  $('worker-count').textContent = `${filtered.length} of ${workers.length} recorded`;
  $('empty').hidden = filtered.length !== 0;
  $('empty').textContent = workers.length ? 'No workers match these filters.' : 'Workers appear here when the workflow requests them.';
}
function renderDetail() {
  const base = snapshot.workers?.find(worker => worker.position === selected);
  const worker = extendedWorker?.generation === snapshot.generation && extendedWorker.position === selected ? extendedWorker.worker : base;
  const history = activityHistory?.generation === snapshot.generation && activityHistory.position === selected ? activityHistory : undefined;
  const key = JSON.stringify([snapshot.generation, worker, history, activityLoading, activityFilter,snapshot.restartPreview,earlierEvidence, worker?.dependencies?.map(position => {
    const prerequisite = snapshot.workers.find(item => item.position === position);
    return [position, prerequisite?.status, prerequisite?.options?.label];
  })]);
  if (key === detailKey) return;
  detailKey = key;
  const focusedSteer=document.activeElement?.id==='steer-text',selectionStart=$('steer-text')?.selectionStart,selectionEnd=$('steer-text')?.selectionEnd;
  const focusedReconcile=document.activeElement?.id==='reconcile-text',reconcileStart=$('reconcile-text')?.selectionStart,reconcileEnd=$('reconcile-text')?.selectionEnd;
  const detail = $('detail'); detail.replaceChildren();
  $('detail-status').hidden = !worker;
  $('detail-heading').textContent = worker ? worker.options?.label || `Worker ${worker.position + 1}` : 'Worker details';
  if (!worker) { detail.append(node('p', 'Select a worker to read its prompt, result and execution evidence.', 'empty')); return; }
  badge($('detail-status'), worker.status);
  const meta = node('div', undefined, 'detail-meta');
  meta.append(node('span', `Slot ${worker.position + 1}`), node('span', worker.cached ? 'Result reused from saved evidence' : worker.status === 'queued' ? 'Awaiting dispatch' : 'Result not reused'));
  if (worker.startedAt) meta.append(node('span', `Started ${dateText(worker.startedAt)}`));
  if (worker.completedAt) meta.append(node('span', `Finished ${dateText(worker.completedAt)}`));
  detail.append(meta);
  const controls=node('section',undefined,'worker-controls');controls.append(node('h3','Worker controls'));
  const label=node('label','Steering instruction');label.htmlFor='steer-text';
  const input=node('textarea');input.id='steer-text';input.rows=3;input.maxLength=8000;
  input.value=steerDraft?.generation===snapshot.generation&&steerDraft.position===worker.position?steerDraft.text:'';
  input.addEventListener('input',()=>{steerDraft={generation:snapshot.generation,position:worker.position,text:input.value};updateButtons();});
  const steer=node('button','Send instruction');steer.id='worker-steer';steer.type='button';steer.addEventListener('click',()=>mutateWorker('steer'));
  const cancel=node('button',worker.cancelRequested?'Cancellation requested':'Cancel worker');cancel.id='worker-cancel';cancel.type='button';cancel.addEventListener('click',()=>mutateWorker('cancel-worker'));
  controls.append(label,input,steer,cancel);detail.append(controls);
  if(focusedSteer){input.focus({preventScroll:true});input.setSelectionRange?.(selectionStart,selectionEnd);}
  const restart=snapshot.restartPreview;
  if(restart?.position===worker.position){
    const section=node('section',undefined,'worker-controls');section.append(node('h3','Restart after review'));
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
    const section=node('section',undefined,'worker-controls');section.append(node('h3','Earlier executions'));
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
        if(snapshot.generation!==generation||selected!==position)return;
        earlierEvidence={generation,position,sourceGeneration,worker:historical};renderDetail();
      }catch(error){readError(error);}finally{load.disabled=false;}
    });
    section.append(label,select,load);
    if(earlier){
      const content=node('div');content.id='earlier-evidence';evidence(content,`Execution in generation ${earlier.sourceGeneration}`,earlier.worker);
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
    for (const prerequisite of prerequisites) list.append(node('li', `${prerequisite.options?.label || `Worker ${prerequisite.position + 1}`} · ${prerequisite.status}`));
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
        if (snapshot.generation !== generation || selected !== position) return;
        extendedWorker = { generation, position, worker: full, previewKey: JSON.stringify(base) };
        renderDetail();
      } catch (error) { readError(error); }
      finally { load.disabled = false; }
    });
    detail.append(load);
  }
  if (Object.hasOwn(worker, 'prompt')) evidence(detail, 'Prompt', worker.prompt);
  if (Object.hasOwn(worker, 'result')) evidence(detail, 'Accepted result', worker.result);
  else detail.append(node('h3', 'Accepted result'), node('p', worker.status === 'unknown' ? 'Outcome unknown. No result has been accepted.' : 'No result has been accepted.', 'muted'));
  if (worker.error) evidence(detail, 'Worker error', worker.error, true);
  if (worker.interruption) evidence(detail, 'Interruption evidence', worker.interruption);
  if (worker.evidence) evidence(detail, 'Execution evidence', worker.evidence);
  detail.append(node('h3', 'Activity'));
  if(worker.activity && typeof worker.activity==='object') {
    detail.append(node('p', `${activityType(worker.activity.type)} · ${activityStatus(worker.activity.status)}`, 'muted'),node('pre',worker.activity.summary));
  } else detail.append(node('p', 'No native activity has been recorded for this worker.', 'muted'));
  if(worker.usage && typeof worker.usage==='object')detail.append(node('p',`Observed tokens: ${worker.usage.inputTokens} input · ${worker.usage.outputTokens} output · ${worker.usage.totalTokens} total.`, 'muted'));
  const filterLabel=node('label','Show activity ', 'activity-filter'),filter=node('select');filter.id='activity-filter';
  filter.append(new Option('Tool activity','tools'),new Option('All events','all'));filter.value=activityFilter;
  filter.addEventListener('change',()=>{activityFilter=filter.value;renderDetail();});filterLabel.append(filter);detail.append(filterLabel);
  const historyPanel=node('div');historyPanel.id='activity-history';historyPanel.tabIndex=0;historyPanel.setAttribute('aria-label','Recorded activity history');detail.append(historyPanel);
  if(history){
    if(history.sourceGeneration!==undefined&&history.sourceGeneration!==snapshot.generation)historyPanel.append(node('p',`Recorded in generation ${history.sourceGeneration}; this result was reused.`, 'muted'));
    historyPanel.append(node('p', `${history.records.length} events displayed · ${history.retained} retained of ${history.observed} observed · ${history.dropped} older events discarded.`,history.dropped?'truncation':'muted'));
    if(history.displayDropped)historyPanel.append(node('p',`${history.displayDropped} previously loaded events left this bounded view.`, 'muted'));
    const visible=activityFilter==='all'?history.records:history.records.filter(record=>!['agentMessage','userMessage','usage','turn','plan'].includes(record.type));
    historyPanel.append(node('p',`${visible.length} matching events in the loaded history.`, 'muted'));
    for(const record of visible){
      const entry=node('details',undefined,'activity-record');
      entry.append(node('summary',`${activityType(record.type)} · ${activityStatus(record.status)} · attempt ${record.attempt} · ${dateText(record.at)}`));
      if(record.truncated?.length)entry.append(node('p',`Shortened: ${record.truncated.join(', ')}.`, 'truncation'));
      if(record.input!==undefined)evidence(entry,'Tool input',record.input);
      if(record.output!==undefined)evidence(entry,'Output',record.output);
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
      if(snapshot.generation!==generation||selected!==position)return;
      const records=[...(history?.records??[]),...page.records];
      activityHistory={...page,generation,position,records:records.slice(-256),displayDropped:(history?.displayDropped??0)+Math.max(0,records.length-256)};
    }catch(error){readError(error);}
    finally{activityLoading=false;renderDetail();}
  });
  detail.append(loadActivity);
  updateButtons();
}
function renderReceipts() {
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
  const workers = snapshot.workers ?? [], coverage = snapshot.coverage ?? {};
  const count = coverage.requested ?? workers.length, complete = coverage.completed ?? 0;
  const percent = count ? Math.floor(complete / count * 100) : snapshot.status === 'completed' ? 100 : null;
  const active = ['running', 'pausing', 'stopping', 'finishing'].includes(snapshot.status);
  const missing = `${workers.filter(worker => worker.status === 'running').length} active · ${workers.filter(worker => worker.status === 'queued').length} queued · ${coverage.failed ?? 0} failed · ${coverage.unknown ?? 0} unknown`;
  $('flow-progress').textContent = `${percent === null ? 'No workers discovered yet' : `${percent}% of discovered workers complete · ${complete} / ${count} accepted results`} · ${missing}${active ? '. The workflow can still discover more workers.' : ''}`;
  $('progress-fill').style.width = `${percent ?? 0}%`;
  if (percent === null) $('progress').removeAttribute('aria-valuenow');
  else $('progress').setAttribute('aria-valuenow', String(percent));
  $('progress').setAttribute('aria-valuetext', $('flow-progress').textContent);
  const displayed = workers.slice(0, 60);
  const unknownDependencies = displayed.filter(worker => !Array.isArray(worker.dependencies)).length;
  $('map-note').textContent = `Grouping does not imply execution order. ${unknownDependencies ? `Dependency evidence is unavailable for ${unknownDependencies} displayed workers.` : 'Arrows show recorded prerequisites.'}${workers.length > displayed.length ? ` Map shows the first ${displayed.length} of ${workers.length} workers; the full list is below.` : ''}`;
  const key = JSON.stringify([snapshot.generation, snapshot.status, selected, workers.map(worker => [worker.position, worker.status, worker.cached, worker.options?.label, worker.phase, worker.options?.phase, worker.dependencies,worker.activity])]);
  if (key === mapKey) return;
  mapKey = key;
  const groups = new Map();
  for (const worker of displayed) {
    const phase = worker.phase || worker.options?.phase || 'Unassigned phase';
    if (!groups.has(phase)) groups.set(phase, []);
    groups.get(phase).push(worker);
  }
  const placements = new Map(), groupLayouts = [];
  let y = 106;
  for (const [name, members] of groups) {
    const height = Math.ceil(members.length / 3) * 110 + 24;
    groupLayouts.push({ name, members, y, height });
    members.forEach((worker, index) => placements.set(worker.position, { x: 290 + index % 3 * 255, y: y + 13 + Math.floor(index / 3) * 110, worker }));
    y += height + 20;
  }
  const svg = svgNode('svg', { viewBox: `0 0 1080 ${Math.max(190, y)}`, role: 'group', 'aria-label': 'Workflow structure and recorded dependencies' });
  const defs = svgNode('defs');
  const marker = svgNode('marker', { id: 'dependency-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
  marker.append(svgNode('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'arrow-head' })); defs.append(marker); svg.append(defs);
  svg.append(svgNode('rect', { x: 24, y: 20, width: 240, height: 62, rx: 6, class: 'map-run' }),
    svgNode('text', { x: 40, y: 45, class: 'map-title' }, 'Workflow'),
    svgNode('text', { x: 40, y: 65, class: 'map-caption', 'data-status': snapshot.status }, `Generation ${snapshot.generation} · ${snapshot.status}`));
  for (const group of groupLayouts) {
    const allMembers = workers.filter(worker => (worker.phase || worker.options?.phase || 'Unassigned phase') === group.name);
    const phaseDone = allMembers.filter(worker => worker.status === 'completed').length;
    const phaseFailed = allMembers.filter(worker => worker.status === 'failed').length;
    const phaseUnknown = allMembers.filter(worker => worker.status === 'unknown').length;
    const phaseActive = allMembers.filter(worker => worker.status === 'running').length;
    const phaseStatus = phaseUnknown ? 'unknown' : phaseFailed ? 'failed' : phaseDone === allMembers.length ? 'completed' : phaseActive ? 'running' : 'queued';
    svg.append(svgNode('rect', { x: 16, y: group.y, width: 1048, height: group.height, rx: 6, class: 'map-group' }));
    svg.append(svgNode('path', { d: `M 35 82 V ${group.y + 40} H 60`, class: 'map-group-link' }));
    const groupLabel = svgNode('text', { x: 64, y: group.y + 43, class: 'map-phase' }, group.name.length > 24 ? group.name.slice(0, 23) + '…' : group.name);
    groupLabel.append(svgNode('title', {}, group.name));
    svg.append(groupLabel,
      svgNode('text', { x: 64, y: group.y + 64, class: 'map-caption', 'data-status': phaseStatus }, `${phaseStatus} · ${phaseDone}/${allMembers.length} complete`),
      svgNode('text', { x: 64, y: group.y + 82, class: 'map-caption' }, `${phaseFailed} failed · ${phaseUnknown} unknown`),
      svgNode('text', { x: 64, y: group.y + 100, class: 'map-caption' }, `${phaseActive} active`));
    for (const worker of group.members) {
      const point = placements.get(worker.position);
      svg.append(svgNode('path', { d: `M 270 ${group.y + 39} V ${point.y + 32} H ${point.x}`, class: 'map-group-link' }));
    }
  }
  for (const { x, y: workerY, worker } of placements.values()) {
    for (const dependency of worker.dependencies ?? []) {
      const start = placements.get(dependency);
      if (!start) continue;
      const sx = start.x + 226, sy = start.y + 33, ey = workerY + 33;
      svg.append(svgNode('path', { d: `M ${sx} ${sy} C ${sx + 36} ${sy - 42}, ${x - 36} ${ey - 42}, ${x - 5} ${ey}`, class: 'map-dependency', 'marker-end': 'url(#dependency-arrow)' }));
    }
  }
  for (const { x, y: workerY, worker } of placements.values()) {
    const label = worker.options?.label || `Worker ${worker.position + 1}`;
    const card = svgNode('g', { class: 'map-worker', tabindex: 0, role: 'button', 'aria-label': `${label}, ${worker.status}${worker.cached ? ', reused result' : ''}`, 'aria-pressed': String(selected === worker.position), 'data-position': worker.position });
    card.append(svgNode('rect', { x, y: workerY, width: 226, height: 86, rx: 5 }),
      svgNode('text', { x: x + 12, y: workerY + 25, class: 'map-worker-title' }, `${String(worker.position + 1).padStart(2, '0')}  ${label.length > 23 ? label.slice(0, 22) + '…' : label}`),
      svgNode('text', { x: x + 12, y: workerY + 48, class: 'map-caption', 'data-status': worker.status }, `${worker.status}${worker.cached ? ' · reused result' : ''}`));
    const activity=worker.activity?.summary;
    const caption=svgNode('text',{x:x+12,y:workerY+69,class:'map-caption'},typeof activity==='string'?(activity.length>28?activity.slice(0,27)+'…':activity):'No activity recorded');
    if(activity)caption.append(svgNode('title',{},activity));card.append(caption);
    const choose = () => { selected = worker.position; extendedWorker = undefined; $('status-filter').value = ''; $('phase-filter').value = ''; renderWorkers(); renderDetail(); renderMap(); $('detail-heading').scrollIntoView({ block: 'nearest', behavior: 'instant' }); };
    card.addEventListener('click', choose);
    card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
    svg.append(card);
  }
  if (!workers.length) svg.append(svgNode('text', { x: 290, y: 60, class: 'map-caption' }, 'Worker components appear as the workflow discovers them.'));
  const focusPosition = document.activeElement?.closest?.('.map-worker')?.dataset.position;
  $('workflow-map').replaceChildren(svg);
  if (focusPosition !== undefined) [...svg.querySelectorAll('.map-worker')].find(card => card.dataset.position === focusPosition)?.focus({ preventScroll: true });
}
function render() {
  $('run-title').textContent = snapshot.meta?.name || snapshot.meta?.title || 'Workflow run';
  $('description').textContent = snapshot.meta?.description || 'Inspect worker results and control this saved workflow.';
  $('generation').textContent = `Generation ${snapshot.generation} · ${snapshot.concurrency} worker slots`;
  badge($('run-status'), snapshot.status);
  const coverage = snapshot.coverage ?? {};
  $('completed').textContent = `${coverage.completed ?? 0} / ${coverage.requested ?? 0}`;
  $('cached').textContent = coverage.cached ?? 0;
  $('attempts').textContent = snapshot.attempts ?? 0;
  const cleanup = snapshot.cleanup;
  $('cleanup').textContent = cleanup ? `${cleanup.serverExited === true ? 'Owned server exited' : 'Server exit unverified'}${cleanup.forced ? ' · forced' : ''}. ${cleanup.jobEmpty===true?'Owned process group empty; external effects unverified.':`Descendant processes ${cleanup.descendants === 'notVerified' ? 'not verified' : 'not reported'}.`}` : 'Awaiting shutdown evidence';
  $('updated').textContent = `Run updated ${dateText(snapshot.updatedAt)}`;
  renderWorkers(); renderDetail(); renderMap(); renderReceipts();
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
          if (snapshot.generation !== generation) return;
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
    else output.append(node('p', 'No workflow result has been accepted.', 'muted'));
    if (snapshot.error) evidence(output, 'Run error', snapshot.error, true);
  }
  updateButtons();
}
async function poll() {
  clearTimeout(timer);
  if (disposed || polling || busy || !authenticated || document.hidden) return;
  polling = true; updateButtons();
  try {
    const next = await api('/api/run');
    if (!next || !Array.isArray(next.workers) || !Number.isInteger(next.generation)) throw new Error('The monitor received an invalid run snapshot. Refresh to try again.');
    if (snapshot?.generation !== next.generation || snapshot?.updatedAt !== next.updatedAt) extendedWorker = undefined;
    if (extendedWorker && extendedWorker.previewKey !== JSON.stringify(next.workers.find(worker => worker.position === extendedWorker.position))) extendedWorker = undefined;
    if (snapshot?.generation !== next.generation) { $('script').hidden = true; $('script').textContent = ''; activityHistory=undefined; }
    snapshot = next; lastGood = Date.now(); stale = false;
    $('connection').textContent = 'Connected · updates every second';
    notice(actionNotice); render();
  } catch (error) {
    stale = true;
    $('connection').textContent = authenticated ? 'Updates unavailable' : 'Authentication required';
    notice(`${error.message}${authenticated && lastGood ? ` Displaying the last snapshot from ${dateText(lastGood)}. Controls are disabled until a fresh snapshot arrives.` : ''}`);
  } finally {
    polling = false; updateButtons();
    if (!disposed && authenticated && !document.hidden) timer = setTimeout(poll, 1000);
  }
}
async function mutate(action) {
  if (busy || stale || !snapshot) return;
  if (action === 'stop' && !confirm('Stop this workflow? Active workers will be asked to interrupt. An uncertain outcome can prevent resume.')) return;
  const generation = snapshot.generation;
  busy = true; actionNotice = ''; clearTimeout(timer); updateButtons();
  try {
    const result = await api(action === 'resume' ? '/api/resume' : '/api/control', { method: 'POST', body: action === 'resume' ? { generation } : { generation, action } });
    if (action === 'resume') actionNotice = `Resume started generation ${result.generation}. Waiting for its persisted state.`;
    else { localReceipt = result; actionNotice = `${action === 'pause' ? 'Pause' : 'Stop'} requested. A pending receipt does not mean the workflow has finished.`; renderReceipts(); }
    notice(actionNotice);
  } catch (error) {
    actionNotice = `${error.message} The request was not retried. Refresh and inspect the run and control receipts before trying again.`;
    notice(actionNotice);
  } finally { busy = false; stale = true; updateButtons(); await poll(); }
}
async function mutateWorker(action){
  if(busy||stale||!snapshot)return;
  const worker=snapshot.workers.find(item=>item.position===selected);
  if(!worker||worker.cancelRequested||!['running','queued'].includes(worker.status))return;
  if(action==='cancel-worker'&&!confirm('Cancel this worker? Other workers will continue. An uncertain outcome can prevent restart.'))return;
  const body={generation:snapshot.generation,action,position:worker.position,attempt:worker.attempts??0,turnId:worker.activeTurn?.turnId??null,...(action==='steer'?{text:$('steer-text').value}:{})};
  busy=true;actionNotice='';clearTimeout(timer);updateButtons();
  try{
    localReceipt=await api('/api/control',{method:'POST',body});
    actionNotice=`${action==='steer'?'Steering':'Cancellation'} requested for worker ${worker.position+1}. Check its receipt for confirmation.`;
    if(action==='steer'){steerDraft=undefined;$('steer-text').value='';}renderReceipts();notice(actionNotice);
  }catch(error){actionNotice=`${error.message} The request was not retried. Inspect the worker and control receipts before trying again.`;notice(actionNotice);}
  finally{busy=false;stale=true;updateButtons();await poll();}
}
async function restartWorker(){
  const preview=snapshot?.restartPreview;
  if(busy||stale||!preview?.eligible||preview.position!==selected||!$('reconcile-text')?.value.trim())return;
  const body={generation:snapshot.generation,position:preview.position,attempt:preview.attempt,reconciliation:$('reconcile-text').value.trim()};
  if(!confirm(`Restart worker ${preview.position+1} and all later workers? This may repeat their external effects. Your reconciliation note will be saved.`))return;
  busy=true;actionNotice='';clearTimeout(timer);updateButtons();
  try{const result=await api('/api/restart',{method:'POST',body});reconcileDraft=undefined;actionNotice=`Restart started generation ${result.generation}. Earlier execution evidence is retained.`;}
  catch(error){actionNotice=`${error.message} The request was not retried. Refresh and inspect the generation before trying again.`;}
  finally{notice(actionNotice);busy=false;stale=true;updateButtons();await poll();}
}
for (const action of ['pause', 'stop', 'resume']) $(action).addEventListener('click', () => mutate(action));
for (const id of ['status-filter', 'phase-filter']) $(id).addEventListener('change', () => { if (snapshot) { renderWorkers(); renderDetail(); renderMap(); } });
$('refresh').addEventListener('click', () => { actionNotice = ''; poll(); });
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
  if (document.hidden) { stale = true; $('connection').textContent = 'Updates paused while hidden'; updateButtons(); }
  else poll();
});
window.addEventListener('pagehide', () => { disposed = true; clearTimeout(timer); for (const request of requests) request.abort(); });
window.addEventListener('pageshow', event => { if (event.persisted) { disposed = false; poll(); } });
if (authenticated) poll();
else { $('connection').textContent = 'Authentication required'; notice(authMessage); updateButtons(); }
