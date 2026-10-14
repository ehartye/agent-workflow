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
const patchEvidence = new Map(), patchLoading = new Set();
let patchRevision = 0;
const requests = new Set();
let viewRun=/^\/runs\/([A-Za-z0-9][A-Za-z0-9._-]{0,199})$/.exec(location.pathname)?.[1]??null;
let controlTarget=null,autoArmed=false,navigation=[],nextRunCursor=null,navigationLoading=false,closed=false;
let navigationCounts=null;
let pruneReview=null,lifecycleReceipt=null,lifecycleUncertain=false;
const runDrafts=new Map();
const runKey=()=>viewRun??snapshot?.monitor?.run?.runId??'pinned';
const sameRun=(a,b)=>a?.dataInstanceId===b?.dataInstanceId&&a?.runId===b?.runId&&a?.runtimeId===b?.runtimeId;
function controlsMatch(){return snapshot&&!stale&&(!snapshot.monitor?.run?viewRun===null:sameRun(controlTarget,snapshot.monitor.run)&&controlTarget.generation===snapshot.generation);}
function scopedPath(path,runId=viewRun){return runId&&/^\/api\/(run(?:\?|$)|worker\/|patch\/|exclusions\/|activity(?:\?|$)|script(?:\?|$)|result(?:\?|$)|control$|resume$|restart$|lifecycle(?:\/|$))/.test(path)?`/api/runs/${encodeURIComponent(runId)}${path.slice(4)}`:path;}
function visibilityFor(worker){
  return snapshot.lifecycle?.workers?.find(item=>item.target?.generation===snapshot.generation&&item.target.position===worker.position&&item.target.attempt===(worker.attempts??0))?.visibility??'visible';
}
function visibleWorkers(){return(snapshot.workers??[]).filter(worker=>$('show-hidden').checked||visibilityFor(worker)==='visible');}
function phaseLabel(worker){const projection=snapshot.experience?.workers?.find(item=>item.ref.position===worker.position);return projection?snapshot.experience.phases.find(item=>item.key===projection.phaseKey)?.label??'':worker.phase||worker.options?.phase||'';}
function workerPhaseKey(worker){return snapshot.experience?.workers?.find(item=>item.ref.position===worker.position)?.phaseKey??(phaseLabel(worker)?JSON.stringify([snapshot.generation,phaseLabel(worker)]):null);}
function switchView(runId){
  if(busy||runId===viewRun)return;
  runDrafts.set(runKey(),{steerDraft,reconcileDraft,localReceipt,lifecycleReceipt,lifecycleUncertain,pruneReview});
  viewRun=runId;
  ({steerDraft,reconcileDraft,localReceipt,lifecycleReceipt,lifecycleUncertain=false,pruneReview}=runDrafts.get(runKey())??{});
  snapshot=undefined;selected=undefined;extendedWorker=undefined;activityHistory=undefined;earlierEvidence=undefined;
  patchEvidence.clear();patchLoading.clear();listKey=detailKey=mapKey=phaseKey=resultKey=receiptKey='';stale=true;
  $('script').hidden=true;$('script').textContent='';$('detail').replaceChildren(node('p','Waiting for a fresh run snapshot.'));
  $('run-title').textContent='Loading selected run';$('run-status').textContent='Loading';
  actionNotice='Viewing a different run. Select it explicitly for control.';updateButtons();void poll();
}
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = String(text);
  if (className) element.className = className;
  return element;
}
function valueText(value) { return typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
function activityType(value) { return ({commandExecution:'Command',agentMessage:'Response',userMessage:'Instruction',fileChange:'File change',mcpToolCall:'Tool call',nativeTool:'Native tool',webSearch:'Web search',usage:'Token usage',turn:'Worker turn',plan:'Plan'})[value]??value??'Event'; }
function activityStatus(value) { return ({inProgress:'running',completed:'completed',failed:'failed',updated:'updated',reportedRejected:'rejection reported',reportedFailed:'failure reported',reportedSucceeded:'success reported'})[value]??value??'updated'; }
function dateText(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? 'Time unavailable' : date.toLocaleString(); }
function badge(element, status) { element.textContent = status; element.dataset.status = status; }
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function evidence(container, title, value, failure = false) {
  container.append(node('h3', title));
  const pre = node('pre', valueText(value), failure ? 'failure' : undefined);
  pre.tabIndex = 0;
  container.append(pre);
}
async function api(path, { method = 'GET', body, text = false, runId = viewRun } = {}) {
  const selectedRun=viewRun,scoped=scopedPath(path,runId);path=scoped;
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
    const result=text ? await response.text() : await response.json();
    if(method==='GET'&&selectedRun!==viewRun&&path!=='/api/health'&&!path.startsWith('/api/session/')){const error=new Error('Viewed run changed; earlier read was discarded.');error.code='VIEW_CHANGED';throw error;}
    return result;
  } finally { clearTimeout(timeout); requests.delete(abort); }
}
function readError(error) {
  if(error.code==='VIEW_CHANGED')return;
  actionNotice = error.message + (error.status === 409 ? ' The run changed. Refresh, then open this evidence again.' : '');
  notice(actionNotice); updateButtons();
  if (error.status === 409) { stale = true; updateButtons(); poll(); }
}
function updateButtons() {
  const enabled = authenticated && !busy && !closed && controlsMatch()&&(!snapshot.monitor?.run||snapshot.monitor.capabilities?.scopedControls===true);
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
  $('close-monitor').disabled=closed||busy||!authenticated;
  $('arm-control').disabled=closed||!authenticated||busy||stale||!snapshot?.monitor?.run;
  $('run-picker').disabled=busy||!snapshot?.monitor?.capabilities?.sessionNavigation;
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
  if (!filtered.some(worker => worker.position === selected)) selected = filtered[0]?.position;
  const key = JSON.stringify([snapshot.generation, selected,snapshot.lifecycle, filtered.map(worker => [worker.position, worker.status, worker.cached, worker.options?.label,phaseLabel(worker)])]);
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
        node('span', phaseLabel(worker) || 'No phase assigned', 'worker-phase'));
      const status = node('span', worker.status, 'worker-state'); status.dataset.status = worker.status;
      if (worker.cached) status.append(node('small', 'reused result'));
      if(visibilityFor(worker)!=='visible')status.append(node('small',visibilityFor(worker)));
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
function renderWorkspace(container, worker, sourceGeneration) {
  if (!worker.workspace && !worker.workspaceError) return;
  const section = node('section', undefined, 'workspace-review');
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
          disclosure.append(node('p', patch.truncated ? `Preview truncated · full patch ${patch.bytes} bytes. Read the saved artifact for the complete diff.` : `Complete patch · ${patch.bytes} bytes.`, patch.truncated ? 'truncation' : 'muted'));
          const hash = node('p', undefined, 'patch-hash'); hash.append(node('span', 'Full artifact SHA-256'), node('code', patch.sha256));
          disclosure.append(hash, node('p', item.path, 'workspace-path'));
          const pre = node('pre', patch.patch || 'No differences recorded for this comparison.', 'patch-content'); pre.tabIndex = 0;
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
  const base = snapshot.workers?.find(worker => worker.position === selected);
  const worker = extendedWorker?.generation === snapshot.generation && extendedWorker.position === selected ? extendedWorker.worker : base;
  const history = activityHistory?.generation === snapshot.generation && activityHistory.position === selected ? activityHistory : undefined;
  const key = JSON.stringify([snapshot.generation, worker, history, activityLoading, activityFilter,snapshot.restartPreview,earlierEvidence,patchRevision,snapshot.experience,snapshot.lifecycle, Array.isArray(worker?.dependencies)?worker.dependencies.map(position => {
    const prerequisite = snapshot.workers.find(item => item.position === position);
    return [position, prerequisite?.status, prerequisite?.options?.label];
  }):null]);
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
  const task=snapshot.experience?.workers?.find(item=>item.ref.position===worker.position)?.task;
  const taskPanel=node('section',undefined,'task-evidence');taskPanel.append(node('h3','Task outcome'),node('p',`Execution: ${worker.status}. Task outcome: ${task?.declaredOutcome??'unverified'}. Verification: ${task?.verification??'unverified'}.`));
  taskPanel.append(node('p',task?.reason??'No validated task report. Execution completion does not establish delivery.','muted'));
  for(const artifact of snapshot.experience?.artifacts?.filter(item=>item.worker.position===worker.position)??[])taskPanel.append(node('p',`${artifact.claimId}: retained integrity ${artifact.integrity}; acceptance ${artifact.acceptance}.`));
  detail.append(taskPanel);
  const visibility=node('section',undefined,'worker-controls');visibility.append(node('h3','Record visibility'),node('p',`Disposition: ${visibilityFor(worker)}. Visibility preserves execution and historical evidence.`));
  for(const action of ['hide','archive','restore','planPrune']){const button=node('button',action==='planPrune'?'Review worker prune':action[0].toUpperCase()+action.slice(1)+' worker');button.type='button';button.dataset.workerLifecycle=action;button.addEventListener('click',()=>mutateLifecycle(action,{kind:'worker',generation:snapshot.generation,position:worker.position,attempt:worker.attempts??0}));visibility.append(button);}detail.append(visibility);
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
    for (const prerequisite of prerequisites) list.append(node('li', `${prerequisite.options?.label || `Worker ${prerequisite.position + 1}`} · ${prerequisite.status}${visibilityFor(prerequisite)!=='visible'?` · ${visibilityFor(prerequisite)}; use Show hidden to inspect`:''}`));
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
        if (snapshot?.generation !== generation || selected !== position) return;
        extendedWorker = { generation, position, worker: full, previewKey: JSON.stringify(base) };
        renderDetail();
      } catch (error) { readError(error); }
      finally { load.disabled = false; }
    });
    detail.append(load);
  }
  renderWorkspace(detail, worker);
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
  detail.append(loadActivity);
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
  const workers = snapshot.workers ?? [], coverage = snapshot.coverage ?? {};
  const count = coverage.requested ?? workers.length, complete = coverage.completed ?? 0;
  const percent = count ? Math.floor(complete / count * 100) : snapshot.status === 'completed' ? 100 : null;
  const active = ['running', 'pausing', 'stopping', 'finishing'].includes(snapshot.status);
  const missing = `${workers.filter(worker => worker.status === 'running').length} active · ${workers.filter(worker => worker.status === 'queued').length} queued · ${coverage.failed ?? 0} failed · ${coverage.unknown ?? 0} unknown`;
  $('flow-progress').textContent = `${percent === null ? 'No workers discovered yet' : `${percent}% of discovered workers complete · ${complete} / ${count} executions complete`} · ${missing}${active ? '. The workflow can still discover more workers.' : ''}`;
  $('progress-fill').style.width = `${percent ?? 0}%`;
  if (percent === null) $('progress').removeAttribute('aria-valuenow');
  else $('progress').setAttribute('aria-valuenow', String(percent));
  $('progress').setAttribute('aria-valuetext', $('flow-progress').textContent);
  const visible=visibleWorkers(),displayed = visible.slice(0, 60),positions=new Set(displayed.map(worker=>worker.position));
  const omittedEdges=displayed.flatMap(worker=>Array.isArray(worker.dependencies)?worker.dependencies.filter(position=>!positions.has(position)).map(position=>`Worker ${worker.position+1} depends on omitted prerequisite ${position+1}`):[]);
  const unknownDependencies = displayed.filter(worker => !Array.isArray(worker.dependencies)).length;
  $('map-note').textContent = `Grouping does not imply execution order. ${unknownDependencies ? `Dependency evidence is unavailable for ${unknownDependencies} displayed workers.` : 'Arrows show recorded prerequisites.'}${workers.length > displayed.length ? ` Map shows the first ${displayed.length} of ${workers.length} workers; Show hidden and the full worker list retain access.` : ''}${omittedEdges.length?` ${omittedEdges.length} omitted prerequisite links: ${omittedEdges.slice(0,8).join('; ')}${omittedEdges.length>8?'; additional links are disclosed in worker details.':''}.`:''}`;
  const key = JSON.stringify([snapshot.generation, snapshot.status, selected,$('show-hidden').checked,snapshot.lifecycle,snapshot.experience?.phases, workers.map(worker => [worker.position, worker.status, worker.cached, worker.options?.label, worker.phase, worker.options?.phase, worker.dependencies,worker.activity])]);
  if (key === mapKey) return;
  mapKey = key;
  const groups = new Map();
  for (const worker of displayed) {
    const phase=workerPhaseKey(worker);
    if (!groups.has(phase)) groups.set(phase,{name:phaseLabel(worker)||'Unassigned phase',members:[]});
    groups.get(phase).members.push(worker);
  }
  const placements = new Map(), groupLayouts = [];
  let y = 106;
  for (const [key,{name,members}] of groups) {
    const height = Math.ceil(members.length / 3) * 110 + 24;
    groupLayouts.push({key, name, members, y, height });
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
    const allMembers = workers.filter(worker => workerPhaseKey(worker)===group.key);
    const phaseDone = allMembers.filter(worker => worker.status === 'completed').length;
    const phaseFailed = allMembers.filter(worker => worker.status === 'failed').length;
    const phaseUnknown = allMembers.filter(worker => worker.status === 'unknown').length;
    const phaseActive = allMembers.filter(worker => worker.status === 'running').length;
    const phaseStatus = phaseUnknown ? 'unknown' : phaseFailed ? 'failed' : phaseDone === allMembers.length ? 'completed' : phaseActive ? 'running' : 'queued';
    svg.append(svgNode('rect', { x: 16, y: group.y, width: 1048, height: group.height, rx: 6, class: 'map-group' }));
    svg.append(svgNode('path', { d: `M 35 82 V ${group.y + 40} H 60`, class: 'map-group-link' }));
    svg.append(svgNode('rect',{x:60,y:group.y+18,width:190,height:94,rx:7,class:'map-phase-node'}));
    const groupLabel = svgNode('text', { x: 64, y: group.y + 43, class: 'map-phase' }, group.name.length > 24 ? group.name.slice(0, 23) + '…' : group.name);
    groupLabel.append(svgNode('title', {}, group.name));
    svg.append(groupLabel,
      svgNode('text', { x: 64, y: group.y + 64, class: 'map-caption', 'data-status': phaseStatus }, `${phaseStatus} · ${phaseDone}/${allMembers.length} complete`),
      svgNode('text', { x: 64, y: group.y + 82, class: 'map-caption' }, `${phaseFailed} failed · ${phaseUnknown} unknown`),
      svgNode('text', { x: 64, y: group.y + 100, class: 'map-caption' }, `${phaseActive} active`));
    svg.append(svgNode('circle',{cx:250,cy:group.y+39,r:5,class:'map-phase-anchor','data-phase':group.name}));
    for (const worker of group.members) {
      const point = placements.get(worker.position);
      svg.append(svgNode('path', { d: `M 250 ${group.y + 39} H 270 V ${point.y + 32} H ${point.x}`, class: 'map-group-link map-membership','data-position':worker.position,'data-phase':group.name }));
    }
  }
  for (const { x, y: workerY, worker } of placements.values()) {
    for (const dependency of Array.isArray(worker.dependencies)?worker.dependencies:[]) {
      const start = placements.get(dependency);
      if (!start) continue;
      const sx = start.x + 226, sy = start.y + 33, ey = workerY + 33;
      svg.append(svgNode('path', { d: `M ${sx} ${sy} C ${sx + 36} ${sy - 42}, ${x - 36} ${ey - 42}, ${x - 5} ${ey}`, class: 'map-dependency', 'marker-end': 'url(#dependency-arrow)' }));
    }
  }
  for (const { x, y: workerY, worker } of placements.values()) {
    const label = worker.options?.label || `Worker ${worker.position + 1}`;
    const card = svgNode('g', { class: 'map-worker', tabindex: 0, role: 'button', 'aria-label': `${label}, ${worker.status}${worker.cached ? ', reused result' : ''}`, 'aria-pressed': String(selected === worker.position), 'data-position': worker.position });
    card.append(svgNode('title',{},label));
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
  $('cleanup').textContent = cleanup ? `${cleanup.serverExited === true ? 'Owned worker App Server exited' : 'Owned worker App Server exit unverified'}${cleanup.forced ? ' · forced' : ''}. ${cleanup.jobEmpty===true?'Owned Windows job empty; external effects unverified.':`Descendant processes ${cleanup.descendants === 'notVerified' ? 'not verified' : 'not reported'}.`}` : 'Awaiting owned worker cleanup evidence';
  $('updated').textContent = `Run updated ${dateText(snapshot.updatedAt)}`;
  renderWorkers(); renderDetail(); renderMap(); renderReceipts();
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
    else output.append(node('p', 'No workflow result has been accepted.', 'muted'));
    if (snapshot.error) evidence(output, 'Run error', snapshot.error, true);
  }
  updateButtons();
}
function renderExperienceControls(){
  if(!snapshot)return;
  const ref=snapshot.monitor?.run;
  $('control-target').textContent=ref&&!snapshot.monitor.capabilities?.scopedControls?'Retained-runtime control adapter unavailable.':controlTarget?`Control target: ${controlTarget.runId} · ${controlTarget.runtimeId} · generation ${controlTarget.generation}${controlsMatch()?'':' · select a fresh viewed target before control'}`:ref?'Control target: select the viewed run explicitly':`Control target: this saved run · generation ${snapshot.generation}`;
  $('run-permalink').href=ref?`/runs/${encodeURIComponent(ref.runId)}`:'/';
  const navigationAvailable=snapshot.monitor?.capabilities?.sessionNavigation;
  $('navigation-reason').textContent=navigationAvailable?'Viewing and controlling are separate.':'Originating-session navigation adapter unavailable.';
  $('session-counts').textContent=navigationAvailable?`${navigationCounts?.hiddenCount??'Unavailable'} hidden runs · ${navigationCounts?.unknownCount??'unavailable'} unknown runs`:'Session counts unavailable';
  if(!navigationAvailable){$('run-picker').replaceChildren(new Option(snapshot.meta?.name??'This run',''));}
  else{
    const entries=[...navigation];if(ref&&!entries.some(item=>item.ref.runId===ref.runId))entries.unshift({ref,title:snapshot.meta?.name??ref.runId,disposition:snapshot.lifecycle?.run?.visibility??'visible'});
    $('run-picker').replaceChildren(...entries.map(item=>new Option(`${item.title} · ${item.disposition} · ${item.ref.runId}`,item.ref.runId)));
    $('run-picker').value=ref?.runId??viewRun??'';
  }
  $('more-runs').hidden=!nextRunCursor;
  const workers=snapshot.workers??[],hidden=workers.filter(worker=>visibilityFor(worker)==='hidden').length,archived=workers.filter(worker=>visibilityFor(worker)==='archived').length;
  $('visibility-count').textContent=snapshot.lifecycle?.visibilityKnown===false?`Visibility unavailable · ${workers.filter(worker=>worker.status==='unknown').length} unknown executions`:`${hidden} hidden · ${archived} archived · ${workers.filter(worker=>worker.status==='unknown').length} unknown · run ${snapshot.lifecycle?.run?.visibility??'visible'}`;
  $('lifecycle-reason').textContent=lifecycleUncertain?'Lifecycle confirmation is unknown. Inspect the receipt; this request will not be retried.':snapshot.monitor?.capabilities?.lifecycle&&snapshot.lifecycle?.available!==false?'Visibility preserves outcomes. Prune requires a separate reviewed storage plan.':snapshot.lifecycle?.reason??'Lifecycle adapter for engine/run-lifecycle.mjs unavailable.';
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
  const receiptPanel=$('lifecycle-receipt');receiptPanel.hidden=!lifecycleReceipt;
  if(lifecycleReceipt)receiptPanel.textContent=`Lifecycle receipt: ${valueText(lifecycleReceipt).slice(0,6000)}`;
  $('inspect-lifecycle').hidden=!lifecycleReceipt||!snapshot.monitor?.capabilities?.lifecycleReceipt;
}
async function loadNavigation(append=false){
  if(navigationLoading||!snapshot?.monitor?.capabilities?.sessionNavigation)return;
  navigationLoading=true;
  try{
    const page=await api(`/api/session/runs?limit=25&includeHidden=${$('show-hidden').checked}${append&&nextRunCursor?`&cursor=${encodeURIComponent(nextRunCursor)}`:''}`);
    if(!Array.isArray(page.items))throw new Error('Session navigation evidence unavailable.');
    navigationCounts=page;
    navigation=append?[...navigation,...page.items].slice(0,1000):page.items;nextRunCursor=page.nextCursor;
    if(snapshot)renderExperienceControls();
    if($('follow-run').checked&&!busy){const newest=[...navigation].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];if(newest&&newest.ref.runId!==snapshot?.monitor?.run?.runId)switchView(newest.ref.runId);}
  }catch(error){$('navigation-reason').textContent=error.message;}finally{navigationLoading=false;}
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
async function poll() {
  clearTimeout(timer);
  if (disposed || closed || polling || busy || !authenticated || document.hidden) return;
  polling = true; updateButtons();
  const viewed=viewRun;
  let health=false;
  try {
    const results=await Promise.allSettled([api('/api/run'),api('/api/health')]);
    health=results[1].status==='fulfilled'&&results[1].value?.status==='available';
    if(viewed!==viewRun)return;
    if(results[0].status!=='fulfilled')throw results[0].reason;
    const next=results[0].value;
    if (!next || !Array.isArray(next.workers) || !Number.isInteger(next.generation)) throw new Error('The monitor received an invalid run snapshot. Refresh to try again.');
    if (snapshot?.generation !== next.generation || snapshot?.updatedAt !== next.updatedAt) extendedWorker = undefined;
    if (extendedWorker && extendedWorker.previewKey !== JSON.stringify(next.workers.find(worker => worker.position === extendedWorker.position))) extendedWorker = undefined;
    if (snapshot?.generation !== next.generation) { $('script').hidden = true; $('script').textContent = ''; activityHistory=undefined; patchEvidence.clear(); patchLoading.clear(); }
    snapshot = next; lastGood = Date.now(); stale = false;
    if(!autoArmed&&snapshot.monitor?.run&&snapshot.monitor.run.runId===snapshot.monitor.pinnedRunId){controlTarget={...snapshot.monitor.run,generation:snapshot.generation};autoArmed=true;}
    $('connection').textContent = health?'Dashboard connected · run snapshot fresh':'Dashboard health unavailable · run snapshot fresh';
    if(!health)stale=true;
    notice(actionNotice); render();
    void loadNavigation();
  } catch (error) {
    if(viewed!==viewRun)return;
    stale = true;
    $('connection').textContent = authenticated ? health?'Dashboard connected; run data unavailable':'Dashboard connection unavailable' : 'Authentication required';
    notice(`${error.message}${authenticated && lastGood ? ` Displaying the last snapshot from ${dateText(lastGood)}. Controls are disabled until a fresh snapshot arrives.` : ''}`);
  } finally {
    polling = false; updateButtons();
    if (!disposed && authenticated && !document.hidden) timer = setTimeout(poll, 1000);
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
$('run-picker').addEventListener('change',()=>switchView($('run-picker').value));
$('follow-run').addEventListener('change',()=>{if($('follow-run').checked)void loadNavigation();});
$('more-runs').addEventListener('click',()=>loadNavigation(true));
$('arm-control').addEventListener('click',async()=>{
  const viewed=viewRun;if(busy||stale||!snapshot?.monitor?.run)return;
  try{const fresh=await api('/api/run');if(viewed!==viewRun)return;if(!fresh.monitor?.run||!Number.isInteger(fresh.generation))throw new Error('Fresh control identity unavailable.');snapshot=fresh;controlTarget={...fresh.monitor.run,generation:fresh.generation};actionNotice='Control target explicitly selected.';render();notice(actionNotice);}catch(error){readError(error);}
});
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
  closed=true;disposed=true;clearTimeout(timer);updateButtons();
  try{await api('/api/close',{method:'POST',body:{},runId:null});$('connection').textContent='Dashboard closed';notice('This dashboard instance was closed. Reopen from the CLI to inspect the run.');}
  catch(error){$('connection').textContent='Dashboard close confirmation unavailable';notice(`${error.message} Close was not retried. Inspect service availability before another request.`);}
});
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
