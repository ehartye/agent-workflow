/** @lane merge
 * @subject engine/monitor/app.mjs
 * @subject engine/monitor/index.html
 * @subject engine/monitor/style.css
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const html = await readFile(new URL('../engine/monitor/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../engine/monitor/app.mjs', import.meta.url), 'utf8');
const worker = (position, status = 'completed', extra = {}) => ({ position, status, prompt: `Prompt ${position}`, phase: 'Build', options: { label: `Task ${position}` }, ...extra });
async function monitor({ hash = '#token=fixture-token', savedToken, savedTheme, run = {}, response, light = false } = {}) {
  const { document, window } = parseHTML(html);
  // LinkeDOM omits these browser interfaces; implement their DOM semantics.
  for (const select of document.querySelectorAll('select')) Object.defineProperty(select, 'value', {
    get() { return [...this.options].find(option => option.hasAttribute('selected'))?.value ?? this.options[0]?.value ?? ''; },
    set(value) { for (const option of this.options) option.toggleAttribute('selected', option.value === value); },
  });
  window.Element.prototype.scrollIntoView = () => {};
  Object.defineProperty(document, 'hidden', { value: false, writable: true });
  const calls = [], history = [], session = new Map(savedToken ? [['agent-workflow.monitor.token', savedToken]] : []);
  const local = new Map(savedTheme ? [['agent-workflow.monitor.theme', savedTheme]] : []), timers = new Map();
  let timerId = 0, snapshot = { generation: 4, status: 'running', acceptingControls: true, resumable: false, meta: { name: 'Fixture workflow' }, concurrency: 2, attempts: 2, workers: [worker(0), worker(1, 'running')], coverage: { requested: 2, completed: 1, failed: 0, unknown: 0, cached: 0 }, updatedAt: '2026-10-13T12:00:00Z', ...run };
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) });
  const context = vm.createContext({ document, window, URLSearchParams, AbortController, location: { hash, pathname: '/', search: '' },
    history: { replaceState: (...args) => history.push(args) }, sessionStorage: storage(session), localStorage: storage(local),
    matchMedia: () => ({ matches: light, addEventListener() {} }), confirm: () => false,
    Option: function(text, value) { const option = document.createElement('option'); option.textContent = text; option.value = value; return option; },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; }, clearTimeout: id => timers.delete(id),
    fetch: async (path, input) => {
      if (hash) assert.equal(history.length, 1, 'Remove fragment before the first authenticated request');
      calls.push({ path, ...input });
      const override = await response?.(path, input);
      if (override) return override;
      const value = path === '/api/run' ? snapshot : path === '/api/control' ? { id: 'receipt-1', generation: 4, action: JSON.parse(input.body).action, status: 'pending', requestedAt: snapshot.updatedAt } : path === '/api/resume' ? { generation: 5 } : {};
      return { ok: true, status: 200, json: async () => structuredClone(value), text: async () => 'saved script' };
    },
  });
  vm.runInContext(script, context, { filename: 'engine/monitor/app.mjs', timeout: 1000 });
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
  await flush();
  const get = id => document.getElementById(id);
  const click = async element => { element.dispatchEvent(new window.Event('click')); await flush(); };
  return { document, window, context, get, calls, history, session, local, timers, flush, click,
    refresh: async () => { await click(get('refresh')); },
    change: async (id, value) => { get(id).value = value; get(id).dispatchEvent(new window.Event('change')); await flush(); },
    update: value => { snapshot = { ...snapshot, ...value }; },
  };
}

test('monitor removes token fragments before requests, restores session auth and persists accessible theme choice', async () => {
  const view = await monitor({ light: true });
  assert.deepEqual(view.history, [[null, '', '/']]);
  assert.equal(view.session.get('agent-workflow.monitor.token'), 'fixture-token');
  assert.equal(view.calls[0].headers.Authorization, 'Bearer fixture-token');
  assert.equal(view.document.documentElement.dataset.theme, 'light');
  await view.change('theme', 'dark');
  assert.equal(view.document.documentElement.dataset.theme, 'dark');
  assert.equal(view.local.get('agent-workflow.monitor.theme'), 'dark');
  const retained = await monitor({ hash: '', savedToken: 'saved', savedTheme: 'light' });
  assert.equal(retained.calls[0].headers.Authorization, 'Bearer saved');
  assert.equal(retained.document.documentElement.dataset.theme, 'light');
  const missing = await monitor({ hash: '' });
  assert.equal(missing.calls.length, 0);
  assert.match(missing.get('notice').textContent, /Open the dashboard URL from agent-workflow dashboard to authenticate/);
  assert.equal(missing.get('pause').disabled, true);
});

test('workflow graph separates declared dependencies from grouping and preserves failed or unknown phase coverage', async () => {
  const view = await monitor({ run: { workers: [worker(0, 'completed', { dependencies: [] }), worker(1, 'failed', { dependencies: [0] }), worker(2, 'unknown')], coverage: { requested: 3, completed: 1, cached: 0, failed: 1, unknown: 1 } } });
  assert.equal(view.get('workflow-map').querySelectorAll('.map-dependency').length, 1);
  assert.equal(view.get('workflow-map').querySelectorAll('.map-worker').length, 3);
  assert.match(view.get('map-note').textContent, /unavailable for 1/);
  assert.match(view.get('flow-progress').textContent, /33%.*1 \/ 3.*1 failed.*1 unknown/);
  assert.match(view.get('workflow-map').textContent, /1\/3 complete/);
  assert.match(view.get('workflow-map').textContent, /1 failed · 1 unknown/);
  const card = view.get('workflow-map').querySelectorAll('.map-worker')[1];
  await view.click(card);
  assert.equal(view.get('detail-heading').textContent, 'Task 1');
  assert.equal(view.get('detail-status').textContent, 'failed');
  assert.equal(view.get('progress').getAttribute('aria-valuenow'), '33');
  view.update({ workers: [worker(0, 'unknown'), worker(1, 'queued', { dependencies: [0] })] });
  await view.refresh();
  await view.click(view.get('workflow-map').querySelectorAll('.map-worker')[1]);
  assert.match(view.get('detail').textContent, /Waiting for Task 0/);
  assert.match(view.get('detail').textContent, /Task 0.*unknown/);
  view.update({ workers: [worker(0), worker(1, 'queued', { dependencies: [0] })] });
  await view.refresh();
  assert.doesNotMatch(view.get('detail').textContent, /Waiting for/);
  assert.match(view.get('detail').textContent, /Task 0.*completed/);
});

test('capped workflow map keeps phase aggregates truthful about workers outside its preview', async () => {
  const workers = Array.from({ length: 62 }, (_, i) => worker(i, i === 60 ? 'failed' : i === 61 ? 'unknown' : 'completed'));
  const view = await monitor({ run: { workers, coverage: { requested: 62, completed: 60, failed: 1, unknown: 1 } } });
  assert.equal(view.get('workflow-map').querySelectorAll('.map-worker').length, 60);
  assert.match(view.get('map-note').textContent, /first 60 of 62/);
  assert.match(view.get('workflow-map').textContent, /60\/62 complete/);
  assert.match(view.get('workflow-map').textContent, /1 failed · 1 unknown/);
});

test('live tool activity appears in graph and paged inspector without hiding discarded evidence',async()=>{
  const payload='<img src=x onerror=alert(1)>';
  const view=await monitor({run:{workers:[worker(0,'running',{activity:{seq:17,type:'commandExecution',status:'inProgress',summary:'Read README'},activityCount:270,usage:{inputTokens:20,outputTokens:4,totalTokens:24}})]},response:path=>path.startsWith('/api/activity?')?{ok:true,json:async()=>({records:[{seq:path.includes('after=17')?18:17,at:'2026-10-13T12:00:00Z',attempt:1,type:'commandExecution',status:'completed',input:'Read README',output:payload,truncated:['output']}],observed:270,retained:256,dropped:14,nextCursor:path.includes('after=17')?18:17,hasMore:!path.includes('after=17')})}:undefined});
  assert.match(view.get('workflow-map').textContent,/Read README/);
  assert.match(view.get('detail').textContent,/Read README/);
  assert.equal(view.calls.length,1,'History is loaded deliberately');
  await view.click(view.get('load-activity'));
  assert(view.calls.some(call=>call.path==='/api/activity?generation=4&position=0&after=0&limit=50'));
  assert.match(view.get('activity-history').textContent,/14.*discarded/);
  assert.match(view.get('activity-history').textContent,/Shortened: output/);
  assert.match(view.get('activity-history').textContent,/Read README/);
  assert.equal(view.document.querySelectorAll('img').length,0);
  await view.click(view.get('load-activity'));
  assert(view.calls.some(call=>call.path.includes('after=17')));
  assert.equal(view.get('activity-history').querySelectorAll('.activity-record').length,2);
  view.update({generation:5,workers:[worker(0,'running')]});await view.refresh();
  assert.doesNotMatch(view.get('detail').textContent,/14.*discarded|Read README|onerror/);
});

test('monitor sends explicit generation controls, confirms stop and keeps pending receipts distinct from run completion', async () => {
  const view = await monitor();
  await view.click(view.get('pause'));
  let posts = view.calls.filter(call => call.method === 'POST');
  assert.equal(posts.length, 1);
  assert.deepEqual(JSON.parse(posts[0].body), { generation: 4, action: 'pause' });
  assert.match(view.get('receipt-list').textContent, /pending.*Waiting for the runner/);
  assert.equal(view.get('run-status').textContent, 'running');
  view.update({ controls: [{ id: 'receipt-1', generation: 4, action: 'pause', status: 'applied', requestedAt: '2026-10-13T12:00:00Z' }] });
  await view.refresh();
  assert.match(view.get('receipt-list').textContent, /applied/);
  assert.doesNotMatch(view.get('receipt-list').textContent, /pending/);
  view.update({ controls: [] });
  await view.refresh();
  assert.doesNotMatch(view.get('receipt-list').textContent, /pending/, 'Observed persisted receipts must not return as old pending receipts when outside the latest page');
  await view.click(view.get('stop'));
  assert.equal(view.calls.filter(call => call.method === 'POST').length, 1);
  view.context.confirm = () => true;
  await view.click(view.get('stop'));
  posts = view.calls.filter(call => call.method === 'POST');
  assert.deepEqual(JSON.parse(posts[1].body), { generation: 4, action: 'stop' });
  view.update({ status: 'paused', acceptingControls: false, resumable: true });
  await view.refresh(); await view.click(view.get('resume'));
  assert.deepEqual(JSON.parse(view.calls.find(call => call.path === '/api/resume').body), { generation: 4 });
  view.update({ generation: 5, controls: [] });
  await view.refresh();
  assert.doesNotMatch(view.get('receipt-list').textContent, /pending|Generation 4/, 'A new generation must not retain a prior generation local receipt');
});

test('worker steering preserves its draft through activity refresh and sends exact worker identity',async()=>{
  const current=worker(0,'running',{attempts:2,activeTurn:{threadId:'thread',turnId:'turn'},dependencies:[]});
  const view=await monitor({run:{workers:[current]}});
  const input=view.get('steer-text');assert.ok(input,'Selected worker has steering input');
  input.value='Read the second line';input.dispatchEvent(new view.window.Event('input'));
  view.update({workers:[{...current,activity:{seq:1,summary:'Read marker'}}]});await view.refresh();
  assert.equal(view.get('steer-text').value,'Read the second line');
  await view.click(view.get('worker-steer'));
  assert.deepEqual(JSON.parse(view.calls.find(call=>call.method==='POST').body),{generation:4,action:'steer',position:0,attempt:2,turnId:'turn',text:'Read the second line'});
  await view.click(view.get('worker-cancel'));assert.equal(view.calls.filter(call=>call.method==='POST').length,1,'Cancellation requires confirmation');
  view.context.confirm=()=>true;await view.click(view.get('worker-cancel'));
  assert.deepEqual(JSON.parse(view.calls.filter(call=>call.method==='POST')[1].body),{generation:4,action:'cancel-worker',position:0,attempt:2,turnId:'turn'});
  view.update({workers:[{...current,cancelRequested:true}]});await view.refresh();
  assert.equal(view.get('worker-cancel').disabled,true);assert.equal(view.get('worker-steer').disabled,true);
});

test('untrusted evidence stays text and full worker, result and script reads are deliberate and generation-bound', async () => {
  const payload = '<img src=x onerror=alert(1)>';
  const view = await monitor({ run: { meta: { name: payload }, result: 'preview', truncations: ['result'], workers: [worker(0, 'unknown', { prompt: payload, error: payload, truncations: ['prompt'] })] },
    response: (path) => path.startsWith('/api/worker/') ? { ok: true, json: async () => worker(0, 'unknown', { prompt: payload + ' full', error: payload }) } : path.startsWith('/api/result?') ? { ok: true, json: async () => ({ result: payload + ' full result ' + (path.endsWith('=5') ? 'generation five suffix' : 'generation four suffix') }) } : undefined });
  assert.equal(view.get('run-title').textContent, payload);
  assert.equal(view.document.querySelectorAll('img').length, 0);
  assert.match(view.get('detail').textContent, /Preview shortened: prompt/);
  assert.equal(view.calls.length, 1, 'Polling must not fetch large evidence automatically');
  await view.click([...view.get('detail').querySelectorAll('button')].find(button=>button.textContent==='Load worker details'));
  await view.click(view.get('run-evidence').querySelector('button'));
  await view.click(view.get('load-script'));
  assert(view.calls.some(call => call.path === '/api/worker/0?generation=4'));
  assert(view.calls.some(call => call.path === '/api/result?generation=4'));
  assert(view.calls.some(call => call.path === '/api/script?generation=4'));
  assert.match(view.get('detail').textContent, /full/);
  assert.match(view.get('run-evidence').textContent, /full result/);
  assert.equal(view.document.querySelectorAll('img').length, 0);
  view.update({ workers: [worker(0, 'completed', { prompt: payload, result: 'Newly accepted result' })] });
  await view.refresh();
  assert.equal(view.get('detail-status').textContent, 'completed');
  assert.match(view.get('detail').textContent, /Newly accepted result/);
  view.update({ generation: 5 });
  await view.refresh();
  assert.doesNotMatch(view.get('run-evidence').textContent, /generation four suffix/, 'Equal bounded previews must not retain expanded evidence from an old generation');
  assert(view.get('run-evidence').querySelector('button'), 'New generation full result requires explicit disclosure');
  await view.click(view.get('run-evidence').querySelector('button'));
  assert(view.calls.some(call => call.path === '/api/result?generation=5'));
  assert.match(view.get('run-evidence').textContent, /generation five suffix/);
});

test('lost control responses are not retried and stale polling disables controls until fresh evidence arrives', async () => {
  let failRead = false;
  const view = await monitor({ response: (path, input) => {
    if (input.method === 'POST') throw new Error('Connection lost after request');
    if (failRead && path === '/api/run') throw new Error('Snapshot unavailable');
  } });
  await view.click(view.get('pause'));
  assert.equal(view.calls.filter(call => call.method === 'POST').length, 1);
  assert.match(view.get('notice').textContent, /not retried/);
  failRead = true; await view.refresh();
  assert.equal(view.get('pause').disabled, true);
  assert.match(view.get('notice').textContent, /last snapshot/);
  failRead = false; await view.refresh();
  assert.equal(view.get('pause').disabled, false);
  view.document.hidden = true;
  view.document.dispatchEvent(new view.window.Event('visibilitychange'));
  assert.equal(view.get('pause').disabled, true);
  assert.equal([...view.timers.values()].filter(timer => timer.delay === 1000).length, 0);
  view.window.dispatchEvent(new view.window.Event('pagehide'));
  assert.equal(view.timers.size, 0);
});
