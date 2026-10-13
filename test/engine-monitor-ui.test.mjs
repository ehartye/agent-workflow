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
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {configurable:true,
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
      const value = path === '/api/run' ? snapshot : path === '/api/health' ? {serviceInstanceId:'fixture-service',status:'available'} : path === '/api/control' ? { id: 'receipt-1', generation: 4, action: JSON.parse(input.body).action, status: 'pending', requestedAt: snapshot.updatedAt } : path === '/api/resume' ? { generation: 5 } : {};
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

test('phone-game membership starts at its phase anchor without fabricating a dependency',async()=>{
  const view=await monitor({run:{workers:[worker(0,'completed',{phase:'Build Tidepool',options:{label:'phone-game'},dependencies:[]})]}});
  const anchor=view.get('workflow-map').querySelector('.map-phase-anchor');assert.ok(anchor);
  const link=view.get('workflow-map').querySelector('.map-membership');assert.ok(link);
  assert.equal(link.getAttribute('data-position'),'0');
  assert.ok(link.getAttribute('d').startsWith(`M ${anchor.getAttribute('cx')} ${anchor.getAttribute('cy')} `));
  assert.equal(view.get('workflow-map').querySelectorAll('.map-dependency').length,0);
  assert.match(view.get('detail').textContent,/No prerequisites declared/);
});

test('delivery, cleanup and dashboard health remain separate and a healthy failed read retains stale evidence',async()=>{
  let unreadable=false;
  const view=await monitor({run:{status:'failed',cleanup:{serverExited:true,jobEmpty:true},workers:[worker(0,'completed',{result:'E_BROWSER_MISSING'})]},response:path=>path==='/api/health'?{ok:true,json:async()=>({serviceInstanceId:'service',status:'available'})}:path==='/api/run'&&unreadable?{ok:false,status:500,json:async()=>({error:{message:'Saved evidence unavailable'}})}:undefined});
  assert.equal(view.get('run-status').textContent,'failed');assert.match(view.get('cleanup').textContent,/Owned worker App Server exited/);assert.match(view.get('cleanup').textContent,/Owned Windows job empty/);
  assert.match(view.get('detail').textContent,/Task outcome.*unverified/i);assert.match(view.get('connection').textContent,/Dashboard connected/);
  unreadable=true;await view.refresh();assert.match(view.get('connection').textContent,/Dashboard connected; run data unavailable/);assert.equal(view.get('stop').disabled,true);assert.equal(view.get('run-status').textContent,'failed');
});

test('visibility filtering preserves counts and discloses hidden prerequisites; missing lifecycle is unavailable',async()=>{
  const view=await monitor({run:{workers:[worker(0,'unknown',{dependencies:[],attempts:1}),worker(1,'queued',{dependencies:[0]})],lifecycle:{schema:1,revision:2,workers:[{target:{kind:'worker',generation:4,position:0,attempt:1},visibility:'hidden'}]}}});
  assert.equal(view.get('worker-list').children.length,1);assert.match(view.get('visibility-count').textContent,/1 hidden.*1 unknown/);
  assert.match(view.get('map-note').textContent,/omitted prerequisite/);assert.equal(view.get('hide-run').disabled,true);assert.match(view.get('lifecycle-reason').textContent,/unavailable/i);
  view.get('show-hidden').checked=true;view.get('show-hidden').dispatchEvent(new view.window.Event('change'));await view.flush();assert.equal(view.get('worker-list').children.length,2);
});

test('manual Close calls only authenticated close, and unavailable navigation cannot imply another run',async()=>{
  const view=await monitor();assert.equal(view.get('run-picker').disabled,true);assert.match(view.get('navigation-reason').textContent,/unavailable/i);
  view.context.confirm=()=>true;await view.click(view.get('close-monitor'));
  assert.equal(view.calls.filter(call=>call.method==='POST').length,1);assert.equal(view.calls.find(call=>call.method==='POST').path,'/api/close');
});

test('following a replacement changes viewing without arming Stop and keeps the original draft',async()=>{
  const a={dataInstanceId:'data',runId:'original',runtimeId:'runtime-a'},b={...a,runId:'replacement',runtimeId:'runtime-b'};
  const capabilities={sessionNavigation:true,lifecycle:false,scopedControls:true};
  const current={generation:4,status:'running',acceptingControls:true,meta:{name:'Original'},workers:[worker(0,'running',{attempts:1,activeTurn:{turnId:'turn-a'}})],monitor:{run:a,pinnedRunId:a.runId,capabilities}};
  const replacement={...current,meta:{name:'Replacement'},workers:[worker(0,'running',{attempts:2,activeTurn:{turnId:'turn-b'}})],monitor:{run:b,pinnedRunId:a.runId,capabilities}};
  const view=await monitor({run:current,response:(path,input)=>path.startsWith('/api/session/runs')?{ok:true,json:async()=>({items:[{ref:b,title:'Replacement',createdAt:'2026-10-13T13:00:00Z',disposition:'visible'},{ref:a,title:'Original',createdAt:'2026-10-13T12:00:00Z',disposition:'visible'}],nextCursor:null,hiddenCount:2,unknownCount:1})}:path==='/api/runs/replacement/run'?{ok:true,json:async()=>replacement}:path==='/api/runs/original/run'?{ok:true,json:async()=>current}:input.method==='POST'?{ok:true,json:async()=>({id:'receipt',generation:4,status:'pending'})}:undefined});
  view.get('steer-text').value='Original draft';view.get('steer-text').dispatchEvent(new view.window.Event('input'));
  view.get('follow-run').checked=true;view.get('follow-run').dispatchEvent(new view.window.Event('change'));await view.flush();await view.flush();
  assert.equal(view.get('run-title').textContent,'Replacement');assert.equal(view.get('stop').disabled,true);assert.match(view.get('control-target').textContent,/original/);assert.match(view.get('session-counts').textContent,/2 hidden runs.*1 unknown runs/);
  view.context.confirm=()=>true;await view.click(view.get('stop'));assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
  await view.click(view.get('arm-control'));await view.click(view.get('stop'));
  const posted=view.calls.find(call=>call.method==='POST');assert.equal(posted.path,'/api/runs/replacement/control');assert.deepEqual(JSON.parse(posted.body).target,{...b,generation:4});
  view.get('follow-run').checked=false;await view.change('run-picker','original');await view.flush();assert.equal(view.get('steer-text').value,'Original draft');assert.equal(view.get('stop').disabled,true);
});

test('active visibility stays reversible and settled pruning preserves exact preview and unknown receipts',async()=>{
  const ref={dataInstanceId:'data',runId:'original',runtimeId:'runtime'},posts=[];let revision=0,visibility='visible',settled=false;
  const run=()=>({generation:4,status:settled?'completed':'running',acceptingControls:!settled,meta:{name:'Original'},workers:[worker(0,settled?'completed':'unknown',{attempts:1})],monitor:{run:ref,pinnedRunId:ref.runId,capabilities:{lifecycle:true,lifecycleReceipt:true}},lifecycle:{schema:1,available:true,revision,run:{visibility},workers:[]}});
  const view=await monitor({run:run(),response:(path,input)=>{
    if(path==='/api/run')return{ok:true,json:async()=>run()};
    if(input.method==='POST'){
      const body=JSON.parse(input.body);posts.push(body);
      if(body.action==='planPrune')return{ok:true,json:async()=>({preview:{id:'reviewed',planHash:'a'.repeat(64),candidates:[{path:'owned/eligible'}],blocked:[]}})};
      if(body.action==='applyPrune')return{ok:true,json:async()=>({receipt:{id:'prune',runId:ref.runId,outcome:'unknown'}})};
      visibility=body.action==='restore'?'visible':body.action==='archive'?'archived':'hidden';revision++;return{ok:true,json:async()=>({receipt:{id:'visibility',runId:ref.runId,outcome:'applied'}})};
    }
  }});
  await view.click(view.get('hide-run'));assert.equal(posts[0].action,'hide');assert.equal(view.get('run-status').textContent,'running');assert.match(view.get('visibility-count').textContent,/run hidden/);
  await view.click(view.get('restore-run'));assert.match(view.get('visibility-count').textContent,/run visible/);
  settled=true;await view.refresh();
  await view.click(view.get('review-prune'));assert.equal(posts.length,3);assert.ok(view.get('apply-prune'));assert.equal(posts[2].action,'planPrune');
  view.context.confirm=()=>true;await view.click(view.get('apply-prune'));
  assert.equal(posts[3].planId,'reviewed');assert.equal(posts[3].approvedPlanHash,'a'.repeat(64));assert.equal(posts[3].expectedRevision,2);assert.equal(view.get('apply-prune').disabled,true);assert.match(view.get('lifecycle-reason').textContent,/unknown/);
  await view.click(view.get('apply-prune'));assert.equal(posts.length,4,'Unknown effects cannot be submitted again');
});

test('a reviewed zero-candidate retirement remains actionable with explicit tombstone consequence',async()=>{
  const ref={dataInstanceId:'data',runId:'settled',runtimeId:'runtime'};
  const view=await monitor({run:{status:'completed',monitor:{run:ref,pinnedRunId:ref.runId,capabilities:{lifecycle:true}},lifecycle:{available:true,revision:1,workers:[]}},response:(path,input)=>input.method==='POST'?{ok:true,json:async()=>({preview:{id:'retirement',planHash:'b'.repeat(64),candidates:[],blocked:[]}})}:undefined});
  await view.click(view.get('review-prune'));assert.ok(view.get('apply-prune'));assert.equal(view.get('apply-prune').disabled,false);assert.match(view.get('lifecycle-preview').textContent,/tombstone.*audit/i);assert.match(view.get('lifecycle-preview').textContent,/no retained files/i);
});

for(const action of ['hide','applyPrune'])test(`lost ${action} response retains the exact durable receipt identity without resubmitting`,async()=>{
  const ref={dataInstanceId:'data',runId:'settled',runtimeId:'runtime'},posts=[];let committed;
  const view=await monitor({run:{status:'completed',monitor:{run:ref,pinnedRunId:ref.runId,capabilities:{lifecycle:true,lifecycleReceipt:true}},lifecycle:{available:true,revision:0,workers:[]}},response:(path,input)=>{
    if(input.method==='POST'){
      const body=JSON.parse(input.body);posts.push(body);
      if(body.action==='planPrune')return{ok:true,json:async()=>({preview:{id:'exact-prune-plan',planHash:'b'.repeat(64),candidates:[],blocked:[]}})};
      committed={id:action==='applyPrune'?body.planId:body.requestId,runId:ref.runId,outcome:'applied'};throw new Error('Response lost after commit');
    }
    if(path.startsWith('/api/lifecycle/receipts/'))return{ok:true,json:async()=>({receipt:committed})};
  }});
  if(action==='applyPrune'){await view.click(view.get('review-prune'));view.context.confirm=()=>true;await view.click(view.get('apply-prune'));}else await view.click(view.get('hide-run'));
  const count=posts.length;assert.match(view.get('lifecycle-reason').textContent,/unknown/);await view.click(view.get('inspect-lifecycle'));
  assert.ok(view.calls.some(call=>call.path===`/api/runs/${ref.runId}/lifecycle/receipts/${committed.id}`||call.path===`/api/lifecycle/receipts/${committed.id}`));
  assert.equal(posts.length,count);assert.match(view.get('lifecycle-receipt').textContent,/applied/);assert.doesNotMatch(view.get('lifecycle-reason').textContent,/confirmation is unknown/);
});

test('restart shows suffix scope, retains reconciliation and exposes immutable earlier execution',async()=>{
  const view=await monitor({run:{status:'failed',acceptingControls:false,workers:[worker(0,'unknown',{attempts:1})],restartPreview:{eligible:true,position:0,attempt:1,affected:[{position:0,status:'unknown'},{position:1,status:'completed'}]}},response:path=>path==='/api/restart'?{ok:true,json:async()=>({generation:5})}:path.includes('sourceGeneration=3')?{ok:true,json:async()=>({position:0,status:'unknown',historyGeneration:3,error:{code:'TURN_CANCELLED'},prompt:'Earlier prompt'})}:undefined});
  assert.match(view.get('detail').textContent,/worker 1 and all later workers/i);
  assert.equal(view.get('worker-restart').disabled,true);
  view.get('reconcile-text').value='Reviewed the affected external effects';view.get('reconcile-text').dispatchEvent(new view.window.Event('input'));
  await view.refresh();assert.equal(view.get('reconcile-text').value,'Reviewed the affected external effects');
  view.context.confirm=()=>true;await view.click(view.get('worker-restart'));
  const posted=view.calls.find(call=>call.path==='/api/restart');assert.deepEqual(JSON.parse(posted.body),{generation:4,position:0,attempt:1,reconciliation:'Reviewed the affected external effects'});
  view.update({workers:[worker(0,'completed',{attempts:2,priorExecutions:[{generation:3,position:0}]})],restartPreview:null});await view.refresh();
  await view.click(view.get('load-earlier'));
  assert.match(view.get('earlier-evidence').textContent,/Earlier prompt/);assert.match(view.get('earlier-evidence').textContent,/TURN_CANCELLED/);
  assert.equal(view.get('worker-cancel').disabled,true);
});

test('writer diffs disclose bounded text only on request and bind current and historical artifacts to their generations', async () => {
  const payload = '+<img src=x onerror=alert(1)>';
  let releasePatch;
  const workspace = { cwd: 'C:/owned/writer', changedFiles: ['src/<script>.mjs'], patchPath: 'C:/owned/changes.patch', basePatchPath: 'C:/owned/from-base.patch', patchHash: 'a'.repeat(64), basePatchHash: 'b'.repeat(64) };
  const view = await monitor({ run: { workers: [worker(0, 'completed', { workspace, priorExecutions: [{ generation: 3, position: 0 }] })] }, response: path => {
    if (path.startsWith('/api/patch/')) {
      const result = { ok: true, json: async () => ({ basis: path.includes('basis=base') ? 'base' : 'inputs', patch: payload + (path.includes('sourceGeneration=3') ? ' earlier change' : ' current change'), sha256: 'a'.repeat(64), bytes: 400000, cwd: workspace.cwd, changedFiles: workspace.changedFiles, truncated: true }) };
      return path.includes('generation=6&') ? new Promise(resolve => { releasePatch = () => resolve(result); }) : result;
    }
    if (path.startsWith('/api/worker/') && path.includes('sourceGeneration=3')) return { ok: true, json: async () => worker(0, 'failed', { workspace, historyGeneration: 3 }) };
  } });
  assert.match(view.get('detail').textContent, /C:\/owned\/writer/);
  assert.match(view.get('detail').textContent, /src\/<script>\.mjs/);
  assert.equal(view.calls.filter(call => call.path.startsWith('/api/patch/')).length, 0);
  const current = () => view.get('detail').querySelector('.workspace-review');
  await view.click(current().querySelector('[data-basis="inputs"]'));
  assert(view.calls.some(call => call.path === '/api/patch/0?generation=4&basis=inputs'));
  assert.match(current().textContent, /Preview truncated.*400000 bytes/);
  assert.match(current().textContent, /Full artifact SHA-256/);
  assert.match(current().textContent, /current change/);
  assert.equal(current().querySelectorAll('img,script').length, 0);
  await view.click(current().querySelector('[data-basis="base"]'));
  assert(view.calls.some(call => call.path === '/api/patch/0?generation=4&basis=base'));
  await view.click(view.get('load-earlier'));
  const earlier = view.get('earlier-evidence').querySelector('.workspace-review');
  await view.click(earlier.querySelector('[data-basis="inputs"]'));
  assert(view.calls.some(call => call.path === '/api/patch/0?generation=4&basis=inputs&sourceGeneration=3'));
  assert.match(view.get('earlier-evidence').textContent, /earlier change/);
  view.update({ generation: 5 }); await view.refresh();
  assert.doesNotMatch(view.get('detail').textContent, /current change|earlier change/);
  assert.equal(view.calls.filter(call => call.path.startsWith('/api/patch/')).length, 3, 'A refresh must not fetch full artifacts automatically');
  view.update({ generation: 6 }); await view.refresh();
  await view.click(current().querySelector('[data-basis="inputs"]'));
  view.update({ generation: 7 }); await view.refresh();
  releasePatch(); await view.flush();
  assert.doesNotMatch(view.get('detail').textContent, /current change/, 'Late patch responses cannot appear under a newer generation');
});

test('workspace previews and unfinished patch capture do not imply a reviewable diff exists', async () => {
  const view = await monitor({ run: { workers: [worker(0, 'running', { workspace: 'Workspace preview…', truncations: ['workspace'] })] } });
  assert.match(view.get('detail').textContent, /Load worker details.*workspace|workspace.*Load worker details/i);
  assert.equal(view.get('detail').querySelectorAll('[data-basis]').length, 0);
  view.update({ workers: [worker(0, 'unknown', { workspace: { cwd: 'C:/owned/writer' }, workspaceError: { code: 'WORKSPACE_CAPTURE', message: '<script>capture failed</script>' } })] });
  await view.refresh();
  assert.match(view.get('detail').textContent, /Diff not available/);
  assert.match(view.get('detail').textContent, /WORKSPACE_CAPTURE/);
  assert.equal(view.get('detail').querySelectorAll('[data-basis]').length, 0);
  assert.equal(view.get('detail').querySelectorAll('script').length, 0);
  assert.equal(view.calls.filter(call => call.path.startsWith('/api/patch/')).length, 0);
});

test('explicit capture exclusions are deliberate paged metadata and never a payload-integrity claim',async()=>{
  const workspace={version:2,cwd:'C:/owned/worker',policyHash:'a'.repeat(64),excludedInventory:{entryCount:51,fileCount:50,bytes:900000000}};
  const view=await monitor({run:{workers:[worker(0,'completed',{workspace})]},response:path=>path.startsWith('/api/exclusions/')?{ok:true,json:async()=>({policyHash:workspace.policyHash,inventoryHash:'b'.repeat(64),entries:[{name:path.includes('after=50')?'generated/last.bin':'generated/<img>.bin',size:128}],entryCount:51,fileCount:50,bytes:900000000,nextAfter:path.includes('after=50')?null:50})}:undefined});
  assert.match(view.get('detail').textContent,/Excluded payload bytes are not retained/);assert.equal(view.calls.filter(c=>c.path.startsWith('/api/exclusions/')).length,0);
  await view.click(view.get('detail').querySelector('[data-exclusions="outputs"]'));
  assert.match(view.get('detail').textContent,/generated\/<img>\.bin/);assert.equal(view.get('detail').querySelectorAll('img').length,0);
  await view.click(view.get('detail').querySelector('[data-exclusions-next="outputs"]'));assert.ok(view.calls.some(c=>c.path.includes('after=50')));assert.match(view.get('detail').textContent,/generated\/last.bin/);
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
  assert.equal(view.calls.length,2,'Summary and health polling leave history deliberate');
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
  assert.equal(view.calls.length, 2, 'Polling reads a summary and service health, without fetching large evidence');
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
