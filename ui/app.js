const $ = id => document.getElementById(id);
let token = new URLSearchParams(location.hash.slice(1)).get('token') || sessionStorage.getItem('workflow-token');
if (token) {
  sessionStorage.setItem('workflow-token', token);
  history.replaceState(null, '', location.pathname);
}

let selectedId = null, selectedWorker = null, current = null, resumeId = null, detailText = '';
let refreshPromise = null, refreshRequested = false, workerEvidence = null, fullResult = null, fullRunEvidence = null;
let eventList = [], eventRanges = [], journalError = '';
const fullEvents = new Map(), fullApprovals = new Map(), expandedDetails = new Map();
let renderedDetailKey;
const text = value => value === undefined ? 'Not recorded' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const isPreview = value => value && typeof value === 'object' && typeof value.truncated === 'boolean' && 'characters' in value;
const previewText = value => isPreview(value) ? value.truncated ? `${value.preview}\n\nPreview truncated · ${Number(value.characters).toLocaleString()} characters retained in the full record.` : text(value.value) : text(value);
const previewValue = value => isPreview(value) ? value.value : value;
const runRoute = (id = selectedId) => 'runs/' + encodeURIComponent(id);
const list = value => Array.isArray(value) ? value : Object.values(value || {});

function el(tag, value, className) {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  if (className) element.className = className;
  return element;
}
function error(message) {
  $('error').textContent = message;
  $('error').hidden = !message;
}
async function api(route, body) {
  const response = await fetch('/api/' + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Request failed');
  return value;
}
function badge(status) {
  return el('span', status || 'unknown', `badge ${status || 'unknown'}`);
}
function workers() { return list(current?.workers); }

async function refresh() {
  if (refreshPromise) { refreshRequested = true; return refreshPromise; }
  refreshPromise = (async () => {
    do {
      refreshRequested = false;
      try {
        if (!token) throw new Error('Open the dashboard URL from agent-workflow dashboard to authenticate.');
        const runs = await api('runs?view=summary');
        $('connection').textContent = 'Local runtime connected';
        $('connection').dataset.state = 'connected';
        renderRuns(runs);
        if (selectedId) {
          const id = selectedId;
          const run = await api(runRoute(id) + '?view=monitor');
          if (id !== selectedId) { refreshRequested = true; continue; }
          current = run;
          renderRun();
          if ($('event-journal').open) await loadEvents();
        }
        error(journalError);
      } catch (e) {
        $('connection').textContent = 'Connection unavailable';
        $('connection').dataset.state = 'unavailable';
        error(e.message);
      }
    } while (refreshRequested);
  })();
  try { await refreshPromise; } finally { refreshPromise = null; }
}
function renderRuns(runs) {
  $('runs').replaceChildren();
  if (!runs.length) $('runs').append(el('p', 'No runs yet. Start a workflow.', 'footnote'));
  for (const run of runs) {
    const button = el('button', undefined, 'run-card' + (run.id === selectedId ? ' selected' : ''));
    button.setAttribute('aria-pressed', String(run.id === selectedId));
    button.append(el('strong', run.meta?.name || run.id), el('small', new Date(run.createdAt).toLocaleString()), badge(run.status));
    button.onclick = () => selectRun(run.id);
    $('runs').append(button);
  }
}
async function selectRun(id) {
  selectedId = id;
  selectedWorker = null;
  current = null;
  workerEvidence = null;
  fullResult = null;
  fullRunEvidence = null;
  eventList = [];
  eventRanges = [];
  journalError = '';
  fullEvents.clear();
  fullApprovals.clear();
  $('event-journal').open = false;
  await refresh();
}
function renderRun() {
  $('empty').hidden = true;
  $('run-view').hidden = false;
  $('run-id').textContent = current.id;
  $('run-name').textContent = current.meta?.name || 'Workflow';
  $('run-description').textContent = current.meta?.description || '';
  $('run-directory').textContent = current.cwd || '';
  $('run-status').replaceWith(Object.assign(badge(current.status), { id: 'run-status' }));
  renderUsage();
  renderTrace();
  renderDetail();
  renderResult();
  renderApprovals();
  $('event-count').textContent = `(${current.eventCount ?? 'not recorded'})`;
  const unknown = current.coverage?.unverified ?? workers().filter(w => w.status === 'unknown').length;
  $('run-notice').hidden = !unknown && !current.workersTruncated && !current.metaTruncated;
  $('run-notice').textContent = [
    unknown ? `${unknown} worker outcome${unknown === 1 ? ' is' : 's are'} unknown. Verify process drain and reconcile effects before resuming or restarting.` : '',
    current.workersTruncated ? `Showing ${workers().length} of ${current.totalWorkers} worker slots. Inspect the full run record for the remaining slots.` : '',
    current.metaTruncated ? 'Workflow description or phase details are shortened here. The full run record retains the complete metadata.' : '',
  ].filter(Boolean).join(' ');
}
function renderUsage() {
  $('usage').replaceChildren();
  const usage = current.usage || {};
  const labels = { inputTokens: 'input tokens', outputTokens: 'output tokens', attempts: 'worker attempts' };
  for (const [key, value] of Object.entries(usage)) {
    const item = el('span');
    item.append(el('b', typeof value === 'number' ? value.toLocaleString() : String(value)), document.createTextNode(' ' + (labels[key] || key)));
    $('usage').append(item);
  }
  if (!Object.keys(usage).length) $('usage').append(el('span', 'Usage has not been recorded yet'));
  $('usage').append(el('span', current.budget == null ? 'No output-token guard' : `Output-token guard ${current.budget.toLocaleString()}`));
  if (current.usageCoverage) $('usage').append(el('span', `${current.usageCoverage.observed} usage observed · ${current.usageCoverage.missing} missing`, current.usageCoverage.missing ? 'usage-gap' : ''));
}
function renderTrace() {
  const all = workers();
  const completed = all.filter(w => ['completed', 'cached'].includes(w.status)).length;
  const failed = all.filter(w => ['failed', 'unknown', 'interrupted'].includes(w.status)).length;
  const coverage = current.coverage;
  $('coverage').textContent = coverage ? `${coverage.completed}/${coverage.requested} completed · ${coverage.cached} cached · ${coverage.failed} failed · ${coverage.unverified} unverified` : `${completed}/${all.length} completed · ${failed} failed or unknown`;
  $('trace').replaceChildren();
  const phases = [...(current.meta?.phases || []).map(p => p.title), ...all.map(w => w.phase || 'Workers')];
  for (const name of new Set(phases)) {
    const group = el('div', undefined, 'trace-group');
    group.append(el('h3', name, 'phase-name'));
    const members = all.filter(w => (w.phase || 'Workers') === name);
    if (!members.length) group.append(el('p', 'No dispatch recorded', 'footnote'));
    for (const worker of members) {
      const status = worker.cached ? 'cached' : previewValue(worker.error)?.code === 'NOT_DISPATCHED' ? 'not-dispatched' : worker.status;
      const button = el('button', undefined, 'worker-row' + (selectedWorker === worker.id ? ' selected' : ''));
      button.dataset.state = status || 'unknown';
      button.setAttribute('aria-pressed', String(selectedWorker === worker.id));
      const label = el('span', worker.label || worker.id, 'label');
      label.append(el('small', `${worker.id} · attempt ${worker.attempt ?? 'not recorded'}`));
      if (worker.activity) { const activity = el('small', worker.activity, 'activity'); activity.title = worker.activity; label.append(activity); }
      if (worker.toolFailures > 0) {
        const warning = el('small', `${worker.toolFailures} tool call${worker.toolFailures === 1 ? '' : 's'} failed`, 'tool-warning');
        if (worker.lastToolFailure) warning.title = previewText(worker.lastToolFailure.message);
        label.append(warning);
      }
      button.append(label, badge(status));
      button.onclick = () => selectWorker(worker.id);
      group.append(button);
    }
    $('trace').append(group);
  }
  if (!all.length) $('trace').append(el('p', 'Worker dispatch has not started.', 'footnote'));
}
async function selectWorker(id) {
  selectedWorker = id;
  workerEvidence = null;
  renderTrace();
  renderDetail();
  await loadWorker();
}
async function loadWorker() {
  const id = selectedId, workerId = selectedWorker;
  try {
    const record = await api(runRoute(id) + '/workers/' + encodeURIComponent(workerId));
    if (selectedId !== id || selectedWorker !== workerId) return;
    workerEvidence = { ...record, loadedAt: new Date().toLocaleTimeString() };
    renderDetail();
  } catch (e) { error(e.message); }
}
async function loadRunEvidence(refresh = false) {
  const id = selectedId;
  if (!refresh && fullRunEvidence?.run.id === id) return fullRunEvidence;
  const run = await api(runRoute(id));
  if (selectedId !== id) return null;
  fullRunEvidence = { run, text: text(run), loadedAt: new Date().toLocaleTimeString() };
  return fullRunEvidence;
}
function rememberDetails() {
  if (renderedDetailKey) expandedDetails.set(renderedDetailKey, new Set(Array.from($('detail').querySelectorAll('details[open]')).map(d => d.querySelector('summary').textContent)));
}
function renderDetail() {
  rememberDetails();
  const summary = workers().find(w => w.id === selectedWorker);
  renderedDetailKey = current.id + ':' + (summary?.id || 'run');
  const opened = expandedDetails.get(renderedDetailKey);
  $('detail-title').textContent = summary ? (summary.label || summary.id) : 'Run record';
  $('worker-actions').hidden = !summary;
  $('detail').replaceChildren();
  const block = (label, value, defaultOpen = false) => {
    const d = el('details');
    d.open = opened ? opened.has(label) : defaultOpen;
    d.append(el('summary', label), el('pre', text(value)));
    $('detail').append(d);
    return d;
  };
  if (summary) {
    const facts = el('dl', undefined, 'run-facts');
    facts.append(el('dt', 'Live status'), el('dd', summary.status), el('dt', 'Recorded usage'), el('dd', text(summary.usage)), el('dt', 'Latest activity'), el('dd', summary.activity || 'Not recorded'));
    if (summary.toolFailures !== undefined) facts.append(el('dt', 'Tool calls failed'), el('dd', text(summary.toolFailures), summary.toolFailures ? 'tool-warning' : undefined));
    if (summary.lastToolFailure) {
      const failure = summary.lastToolFailure;
      facts.append(el('dt', 'Last tool failure'), el('dd', `${failure.type || 'Tool'} · event ${failure.sequence ?? 'not recorded'}\n${previewText(failure.message)}`, 'tool-warning'));
    }
    $('detail').append(facts);
    const reload = el('button', workerEvidence ? 'Refresh worker evidence' : 'Load worker evidence', 'quiet');
    reload.id = 'refresh-worker-evidence';
    reload.onclick = loadWorker;
    $('detail').append(reload);
    if (workerEvidence?.worker) {
      const worker = workerEvidence.worker;
      $('detail').append(el('p', `Full worker evidence loaded at ${workerEvidence.loadedAt}. Live status above refreshes separately.`, 'footnote'));
      detailText = text(worker);
      block('Prompt', worker.prompt, true);
      block('Result', worker.result ?? worker.value);
      block('Error', worker.error, !!worker.error);
      block('Permissions and drain', { permissions: worker.permissions, drainVerified: worker.drainVerified, potentialEffects: worker.potentialEffects });
      block('Usage', worker.usage);
      block('Replay and attempts', { cached: summary.cached, key: worker.key, ordinal: worker.ordinal, generation: worker.generation, attempts: worker.attempts });
      block('Evidence paths', workerEvidence.evidence);
      block('Full worker record', worker);
    } else {
      detailText = text(summary);
      if (previewValue(summary.error) != null || summary.error?.truncated) block('Error preview', previewText(summary.error), true);
      $('detail').append(el('p', 'Loading the retained worker record…', 'footnote'));
    }
  } else {
    detailText = text(current);
    const facts = el('dl', undefined, 'run-facts');
    for (const [label, value] of [['Status', current.status], ['Directory', current.cwd], ['Permissions', current.permissions], ['Coverage', current.coverage], ['Usage coverage', current.usageCoverage]]) facts.append(el('dt', label), el('dd', text(value)));
    $('detail').append(facts);
    if (previewValue(current.error) != null || current.error?.truncated) block('Run error', previewText(current.error), true);
    block('Evidence paths', current.evidence);
    const full = block('Full run record', fullRunEvidence?.text ?? 'Open to load the complete retained snapshot.');
    const note = el('p', fullRunEvidence ? `Full run evidence observed at ${fullRunEvidence.loadedAt}. Live status above refreshes separately.` : '', 'footnote');
    note.hidden = !fullRunEvidence;
    full.append(note);
    const reload = el('button', 'Refresh run evidence', 'quiet');
    reload.id = 'refresh-run-evidence';
    reload.hidden = !fullRunEvidence;
    const update = observation => {
      if (!observation) return;
      full.querySelector('pre').textContent = observation.text;
      if (selectedId === observation.run.id && !selectedWorker) detailText = observation.text;
      note.textContent = `Full run evidence observed at ${observation.loadedAt}. Live status above refreshes separately.`;
      note.hidden = false;
      reload.hidden = false;
    };
    if (fullRunEvidence) detailText = fullRunEvidence.text;
    full.ontoggle = async () => {
      if (!full.open) return;
      try { update(await loadRunEvidence()); }
      catch (e) { error(e.message); }
    };
    reload.onclick = async () => { try { update(await loadRunEvidence(true)); } catch (e) { error(e.message); } };
    full.append(reload);
  }
}
function renderResult() {
  $('result-state').textContent = current.status;
  const loaded = fullResult?.id === current.id;
  const value = loaded ? fullResult.result ?? fullResult.error : current.result?.truncated || previewValue(current.result) != null ? current.result : current.error;
  $('result').textContent = loaded ? text(value ?? 'No result recorded.') : value == null || previewValue(value) == null && !value?.truncated ? 'No result recorded.' : previewText(value);
  $('result-note').hidden = !loaded;
  $('result-note').textContent = loaded ? `Full result observed at ${fullResult.loadedAt}. Refresh full result to inspect a newer observation; live status updates separately.` : '';
  $('load-full-result').hidden = !loaded && !(current.result?.truncated || current.error?.truncated);
  $('load-full-result').textContent = loaded ? 'Refresh full result' : 'Load full result';
}
$('load-full-result').onclick = async () => {
  const id = selectedId;
  try { const record = await api(runRoute(id) + '/result'); if (id !== selectedId) return; fullResult = { ...record, loadedAt: new Date().toLocaleTimeString() }; renderResult(); }
  catch (e) { error(e.message); }
};

function renderApprovals() {
  const pending = list(current.approvals).filter(a => a.status === 'pending');
  $('approvals').hidden = !pending.length;
  $('approvals').replaceChildren(el('h2', 'Waiting for your decision'));
  if (current.approvalsTruncated) $('approvals').append(el('p', 'More pending decisions are retained in the full run record. This view shows the first 10.', 'footnote'));
  for (const approval of pending) {
    const id = approval.id || approval.approvalId;
    const key = current.id + ':' + id;
    const full = fullApprovals.get(key);
    const row = el('div', undefined, 'approval-row');
    row.append(el('pre', full ? text(full.request ?? full) : previewText(approval.request)));
    if (approval.request?.truncated && !full) {
      const load = el('button', 'Load full request');
      load.onclick = async () => {
        const runId = selectedId;
        try {
          const observation = await loadRunEvidence(true);
          if (runId !== selectedId) return;
          const found = list(observation?.run.approvals).find(a => (a.id || a.approvalId) === id && a.status === 'pending');
          if (!found) throw new Error('This request is no longer pending. Refresh the workflow.');
          fullApprovals.set(key, found);
          renderApprovals();
        } catch (e) { error(e.message); }
      };
      row.append(load);
    }
    for (const decision of ['accept', 'decline', 'cancel']) {
      const button = el('button', decision === 'accept' ? 'Approve' : decision === 'decline' ? 'Deny' : 'Cancel');
      button.disabled = decision === 'accept' && approval.request?.truncated && !full;
      button.onclick = async () => {
        if (button.disabled) return;
        try { await api(runRoute(current.id) + '/approve', { approvalId: id, decision }); await refresh(); }
        catch (e) { error(e.message); }
      };
      row.append(button);
    }
    $('approvals').append(row);
  }
}
function earlierEventCursor() {
  const gaps = [];
  let covered = 0;
  for (const range of eventRanges) {
    if (range.start > covered) gaps.push({ start: covered, end: range.start });
    covered = Math.max(covered, range.end);
  }
  const latest = current.lastEventSequence || 0;
  if (covered < latest) gaps.push({ start: covered, end: latest });
  const gap = gaps.at(-1);
  return gap ? Math.max(gap.start, gap.end - 50) : null;
}
function recordEventRange(start, end) {
  const merged = [];
  for (const range of [...eventRanges, { start, end }].sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  eventRanges = merged;
}
async function loadEvents(earlier = false) {
  const id = selectedId;
  const since = earlier ? earlierEventCursor() : Math.max(0, (current.lastEventSequence || 0) - 50);
  if (since === null) return;
  try {
    const page = await api(runRoute(id) + '/events?view=compact&since=' + since + '&limit=50');
    if (selectedId !== id) return;
    recordEventRange(since, page.nextCursor);
    const retained = new Map(eventList.map(e => [e.seq, e]));
    for (const event of page.events) retained.set(event.seq, event);
    eventList = [...retained.values()].sort((a, b) => a.seq - b.seq);
    journalError = '';
    renderEvents(page.total);
  } catch (e) { journalError = e.message; error(journalError); }
}
function renderEvents(total = current.eventCount) {
  const expanded = new Set(Array.from($('events').querySelectorAll('details[open]')).map(d => d.dataset.event));
  $('events').replaceChildren();
  $('event-note').textContent = `Showing ${eventList.length} of ${total ?? 'unrecorded'} events. Open an event to inspect its retained evidence.`;
  $('more-events').hidden = earlierEventCursor() === null;
  for (const event of eventList) {
    const d = el('details', undefined, 'event-row');
    d.dataset.event = String(event.seq);
    d.open = expanded.has(d.dataset.event);
    d.append(el('summary', `${event.seq ?? ''} ${event.type || 'event'} ${event.workerId || ''}`), el('pre', fullEvents.has(event.seq) ? text(fullEvents.get(event.seq)) : previewText(event.event)));
    d.ontoggle = async () => {
      if (!d.open || !event.event?.truncated || fullEvents.has(event.seq)) return;
      const id = selectedId;
      try { const record = await api(runRoute(id) + '/events/' + encodeURIComponent(event.seq)); if (selectedId !== id) return; fullEvents.set(event.seq, record); d.querySelector('pre').textContent = text(record); }
      catch (e) { error(e.message); }
    };
    $('events').append(d);
  }
}
$('event-journal').ontoggle = () => { if ($('event-journal').open && current) return loadEvents(); };
$('more-events').onclick = () => loadEvents(true);

async function control(action, options = {}) {
  try { await api(runRoute(current.id) + '/control', { action, options }); await refresh(); }
  catch (e) { error(e.message); }
}
for (const button of document.querySelectorAll('[data-control]')) button.onclick = () => control(button.dataset.control);
$('cancel-worker').onclick = () => control('cancel-worker', { workerId: selectedWorker });
$('restart-worker').onclick = () => { if (confirm('Restart this worker? A writer may repeat effects. Reconcile any unknown outcome first.')) return control('restart-worker', { workerId: selectedWorker }); };
$('steer-worker').onclick = () => { const value = $('steer-text').value.trim(); if (value) return control('steer', { workerId: selectedWorker, text: value }); };
$('inspect-run').onclick = () => { selectedWorker = null; workerEvidence = null; renderTrace(); renderDetail(); };
$('copy-detail').onclick = () => navigator.clipboard.writeText(detailText).catch(e => error(e.message));

async function composer(resume = false) {
  resumeId = resume ? current.id : null;
  $('composer-title').textContent = resume ? 'Edit and resume' : 'Start workflow';
  $('submit-workflow').textContent = resume ? 'Resume workflow' : 'Start workflow';
  $('cwd').value = resume ? current.cwd : localStorage.getItem('workflow-cwd') || '';
  $('script').disabled = false;
  $('script').value = '';
  for (const id of ['cwd', 'args', 'concurrency', 'budget', 'sandbox', 'approval-policy', 'network', 'saved']) $(id).disabled = resume;
  $('resume-note').hidden = !resume;
  const choose = (id, value) => { for (const option of $(id).children) option.selected = option.value === value; };
  if (resume) {
    $('args').value = previewText(current.argsPreview);
    $('concurrency').value = String(current.concurrency ?? '');
    $('budget').value = current.budget == null ? '' : String(current.budget);
    choose('sandbox', current.permissions?.sandbox);
    choose('approval-policy', current.permissions?.approvalPolicy);
    $('network').checked = current.permissions?.networkAccess === true;
  } else {
    $('args').value = '{}';
    $('concurrency').value = '4';
    $('budget').value = '';
    choose('sandbox', 'read-only');
    choose('approval-policy', 'never');
    $('network').checked = false;
  }
  if (resume) {
    try { $('script').value = (await api(runRoute(current.id) + '/script')).script; }
    catch (e) { error(e.message); return; }
  }
  $('composer').showModal();
  await loadWorkflows();
}
async function loadWorkflows() {
  if (!$('cwd').value) return;
  try {
    const workflows = await api('workflows?cwd=' + encodeURIComponent($('cwd').value));
    $('saved').replaceChildren(el('option', 'Write or paste a script'));
    $('saved').firstChild.value = '';
    for (const item of workflows) { const option = el('option', item.qualifiedName); option.value = item.qualifiedName; $('saved').append(option); }
  } catch (e) { error(e.message); }
}
$('new-run').onclick = () => composer();
$('empty-start').onclick = () => composer();
$('edit-resume').onclick = () => composer(true);
$('close-composer').onclick = () => $('composer').close();
$('cwd').onchange = loadWorkflows;
$('saved').onchange = () => { $('script').disabled = !!$('saved').value; };
$('refresh').onclick = refresh;
$('start-form').onsubmit = async event => {
  event.preventDefault();
  try {
    const cwd = $('cwd').value;
    localStorage.setItem('workflow-cwd', cwd);
    const script = $('script').value;
    let run;
    if (resumeId) run = await api(runRoute(resumeId) + '/control', { action: 'resume', options: { script: script || undefined } });
    else {
      const input = { cwd, args: JSON.parse($('args').value), concurrency: Number($('concurrency').value), permissions: { sandbox: $('sandbox').value, approvalPolicy: $('approval-policy').value, networkAccess: $('network').checked } };
      if ($('budget').value !== '') input.budget = Number($('budget').value);
      if ($('saved').value) input.name = $('saved').value;
      else input.script = script;
      run = await api('runs', input);
    }
    $('composer').close();
    await selectRun(run.id);
  } catch (e) { error(e.message); }
};

refresh();
setInterval(refresh, 1800);
