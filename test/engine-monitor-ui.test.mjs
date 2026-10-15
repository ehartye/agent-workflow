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
async function monitor({ hash = '#token=fixture-token', savedToken, savedTheme, savedPolling, savedWidths = {}, cookieJar = new Map(), cookiesBlocked = false, storageBlocked = false, width = 1200, run = {}, response, light = false, phone = false } = {}) {
  const { document, window } = parseHTML(html);
  const cookieWrites=[];
  Object.defineProperty(document,'cookie',{get(){if(cookiesBlocked)throw Error('blocked');return [...cookieJar].map(([key,value])=>`${key}=${value}`).join('; ');},set(value){if(cookiesBlocked)throw Error('blocked');cookieWrites.push(value);const [key,encoded]=value.split(';')[0].split('=');cookieJar.set(key,encoded);}});
  // LinkeDOM omits these browser interfaces; implement their DOM semantics.
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {configurable:true,
    get() { return [...this.options].find(option => option.hasAttribute('selected'))?.value ?? this.options[0]?.value ?? ''; },
    set(value) { for (const option of this.options) option.toggleAttribute('selected', option.value === value); },
  });
  let focused = document.body;
  const scrolls = [];
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => focused });
  Object.defineProperty(window.HTMLElement.prototype, 'open', { configurable:true, get() { return this.hasAttribute('open'); }, set(value) { this.toggleAttribute('open',Boolean(value)); } });
  window.Element.prototype.focus = function() { focused = this; };
  window.Element.prototype.scrollIntoView = function(options) { scrolls.push({ element: this, options }); };
  window.Element.prototype.scrollTo = function({ left, top }) { this.scrollLeft = left; this.scrollTop = top; };
  let viewportWidth = width;
  Object.defineProperty(window, 'innerWidth', { configurable:true, get:()=>viewportWidth });
  Object.defineProperty(document.querySelector('.work-area'), 'clientWidth', { get:()=>viewportWidth });
  const captures = new Map(), mediaListeners = [], themeListeners=[];
  window.Element.prototype.setPointerCapture = function(id) { captures.set(id,this); };
  window.Element.prototype.hasPointerCapture = function(id) { return captures.get(id)===this; };
  window.Element.prototype.releasePointerCapture = function(id) { captures.delete(id); };
  Object.defineProperty(document, 'hidden', { value: false, writable: true });
  const calls = [], history = [], session = new Map(savedToken ? [['agent-workflow.monitor.token', savedToken]] : []);
  const local = new Map(savedTheme ? [['agent-workflow.monitor.theme', savedTheme]] : []), timers = new Map();
  if(savedPolling!==undefined)local.set('agent-workflow.monitor.polling',savedPolling);
  for(const [pane,value] of Object.entries(savedWidths))local.set(`agent-workflow.monitor.width.${pane}`,value);
  let timerId = 0, snapshot = { generation: 4, status: 'running', acceptingControls: true, resumable: false, meta: { name: 'Fixture workflow' }, concurrency: 2, attempts: 2, workers: [worker(0), worker(1, 'running')], coverage: { requested: 2, completed: 1, failed: 0, unknown: 0, cached: 0 }, updatedAt: '2026-10-13T12:00:00Z', ...run };
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) });
  const context = vm.createContext({ document, window, URLSearchParams, AbortController, location: { hash, pathname: '/', search: '' },
    history: { replaceState: (...args) => history.push(args) }, sessionStorage: storage(session), localStorage: storageBlocked ? {getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}} : storage(local),
    matchMedia: query => query.includes('max-width') ? { get matches(){return phone;}, addEventListener(type,listener){mediaListeners.push(listener);} } : { get matches(){return light;},addEventListener(type,listener){themeListeners.push(listener);} }, confirm: () => false,
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
  const click = async element => { assert.ok(element, 'Requested user control exists'); element.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true})); await flush(); };
  return { document, window, context, get, calls, history, session, local, timers, scrolls, flush, click,
    captures,cookieJar,cookieWrites,
    osTheme: nextLight => {light=nextLight;for(const listener of themeListeners)listener();},
    pointer: (element,type,clientX,pointerId=7,button=0) => { assert.ok(element,'Resize separator exists');const event=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{clientX,pointerId,button});element.dispatchEvent(event); },
    resize: (nextWidth,nextPhone=nextWidth<600) => { viewportWidth=nextWidth;phone=nextPhone;window.dispatchEvent(new window.Event('resize'));for(const listener of mediaListeners)listener(); },
    tick: async delay => { const entry=[...timers.entries()].find(([,timer])=>timer.delay===delay);assert.ok(entry,`Automatic ${delay}ms poll scheduled`);timers.delete(entry[0]);entry[1].callback();await flush(); },
    key: async (element,key) => { const event=new window.Event('keydown',{bubbles:true,cancelable:true});event.key=key;element.dispatchEvent(event);await flush(); },
    escape: async () => { const event = new window.Event('keydown'); event.key = 'Escape'; document.dispatchEvent(event); await flush(); },
    refresh: async () => { await click(get('refresh')); },
    change: async (id, value) => { get(id).value = value; get(id).dispatchEvent(new window.Event('change')); await flush(); },
    update: value => { snapshot = { ...snapshot, ...value }; },
  };
}

test('every map card offers a separate accessible evidence menu and readonly worker receipts',async()=>{
  const view=await monitor({run:{controls:[
    {id:'steer-1',generation:4,position:1,attempt:2,action:'steer',status:'applied',text:'Read <img src=x onerror=alert(1)>',requestedAt:'2026-10-14T12:00:00Z'},
    {id:'other',generation:4,position:0,action:'cancel-worker',status:'pending'},
  ],controlCount:12,restart:{position:0,attempt:1,sourceGeneration:3,receiptId:'saved-restart',affected:[{position:0},{position:1}],reconciliation:'Reviewed retained effects'}}});
  const buttons=[...view.document.querySelectorAll('.worker-menu-toggle')];assert.equal(buttons.length,2,'Each graph card has a menu');
  assert.equal(view.document.querySelectorAll('button button').length,0);
  const origin=buttons[1];assert.match(origin.getAttribute('aria-label'),/Task 1/);assert.equal(origin.getAttribute('aria-haspopup'),'menu');
  const selected=view.document.querySelector('.map-worker[aria-pressed="true"]').dataset.position;
  await view.click(origin);assert.equal(origin.getAttribute('aria-expanded'),'true');assert.equal(origin.getAttribute('aria-controls'),'worker-card-menu');
  const menu=view.get('worker-card-menu');assert.equal(menu.getAttribute('role'),'menu');assert.equal(view.get('graph-world').contains(menu),false);
  assert.equal(view.document.querySelector('.map-worker[aria-pressed="true"]').dataset.position,selected,'Menu does not select the worker');
  await view.key(view.document.activeElement,'End');assert.match(view.document.activeElement.textContent,/Workspace/);
  await view.key(view.document.activeElement,'Home');assert.match(view.document.activeElement.textContent,/Actions/);
  await view.key(view.document.activeElement,' ');
  const dialog=view.get('worker-quick-view');assert.equal(dialog.hidden,false);assert.equal(dialog.getAttribute('role'),'dialog');assert.equal(view.get('graph-world').contains(dialog),false);
  assert.match(dialog.textContent,/Task 1/);assert.match(dialog.textContent,/steer.*applied/s);assert.doesNotMatch(dialog.textContent,/cancel-worker/);assert.match(dialog.textContent,/12 saved|12 total/);
  assert.match(dialog.textContent,/saved-restart/);
  assert.equal(dialog.querySelector('img'),null);assert.match(dialog.textContent,/<img/);
  await view.escape();assert.equal(dialog.hidden,true);assert.equal(view.document.activeElement,origin);assert.equal(origin.getAttribute('aria-expanded'),'false');
  assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('failed and unknown workers surface actual primary errors without disclosing private diagnostics',async()=>{
  const view=await monitor({run:{workers:[worker(0,'failed',{attempts:1,error:{code:'REQUEST_TIMEOUT',message:'account/read exceeded 15000ms <img src=x>',stage:'startup',request:'account/read',timeoutMs:15000,stack:'PRIVATE_STACK'},workspaceError:{code:'CAPTURE',message:'Capture incomplete'},cleanup:{serverExited:true}}),worker(1,'unknown',{error:{code:'PROTOCOL_LIMIT',message:'Response exceeded retained protocol limit'}})]}});
  const card=view.document.querySelector('.map-worker[data-position="0"]');assert.match(card.textContent,/REQUEST_TIMEOUT.*account\/read exceeded 15000ms/s);
  const callout=view.get('detail').firstElementChild;assert.equal(callout.classList.contains('worker-failure'),true);assert.match(callout.textContent,/REQUEST_TIMEOUT.*account\/read/s);assert.equal(callout.closest('details'),null);
  await view.click(view.document.querySelector('.worker-menu-toggle[data-position="0"]'));
  assert.equal(view.get('worker-card-menu').firstElementChild.textContent,'Failure details');await view.key(view.document.activeElement,'Enter');
  const dialog=view.get('worker-quick-view');assert.match(dialog.textContent,/Capture incomplete/);assert.match(dialog.textContent,/account\/read/);assert.match(dialog.textContent,/15000/);assert.match(dialog.textContent,/Descendant.*unverified/i);assert.match(dialog.textContent,/notStarted.*unverified/i);assert.doesNotMatch(dialog.textContent,/PRIVATE_STACK/);assert.equal(dialog.querySelector('img'),null);
  await view.escape();await view.click(view.document.querySelector('.map-worker[data-position="1"]'));
  assert.match(view.get('detail').firstElementChild.textContent,/unknown.*PROTOCOL_LIMIT/s);assert.equal(view.get('detail-status').textContent,'unknown');
  assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('quick views filter retained messages and tools with bounded pagination and no private reasoning',async()=>{
  const view=await monitor({response:path=>{
    if(!path.startsWith('/api/activity?'))return;
    const after=Number(new URL(path,'http://fixture').searchParams.get('after'));
    const records=Array.from({length:50},(_,i)=>({seq:after+i+1,type:i===0?'reasoning':i===1?'agentMessage':i===2?'userMessage':['commandExecution','fileChange','mcpToolCall','nativeTool'][i%4],status:'completed',attempt:1,output:i===0?'PRIVATE_REASONING':`event ${after+i+1} <script>unsafe</script>`,input:i>2?'saved command':undefined,truncated:['output'],toolObservation:i===3?{tool:'apply_patch',callId:'call-1',outcome:'reportedRejected'}:undefined}));
    return{ok:true,json:async()=>({records,observed:320,retained:256,dropped:64,nextCursor:after+50,hasMore:after<250})};
  }});
  await view.click(view.document.querySelector('.worker-menu-toggle[data-position="1"]'));await view.click(view.get('worker-card-menu').querySelector('[data-quick-kind="messages"]'));
  const body=view.get('worker-quick-body');assert.equal(body.querySelectorAll('.quick-record').length,2);assert.match(body.textContent,/Response|Instruction/);assert.doesNotMatch(body.textContent,/PRIVATE_REASONING|saved command/);assert.equal(body.querySelector('script'),null);
  assert.match(body.textContent,/256 retained.*320 observed.*64.*discarded/s);assert.match(body.textContent,/more.*available/i);
  await view.click(view.get('worker-tab-tools'));assert.equal(body.querySelectorAll('.quick-record').length,47);assert.doesNotMatch(body.textContent,/PRIVATE_REASONING/);
  assert.match(body.textContent,/Shortened.*output/);assert.match(body.textContent,/call-1/);
  for(let i=0;i<5;i++)await view.click(view.get('quick-load-activity'));
  assert.ok(/256 loaded/.test(body.textContent),'Loaded records capped at 256');assert.ok(/44 previously loaded/.test(body.textContent),'Display eviction is disclosed');assert.ok(/No more.*recorded page/i.test(body.textContent));
  const reads=view.calls.filter(call=>call.path.startsWith('/api/activity?'));assert.equal(reads.length,6);assert.match(reads.at(-1).path,/position=1&after=250&limit=50/);
  assert.equal(view.get('detail-heading').textContent,'Task 0','Evidence target stays independent of inspector');assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('quick evidence preserves DOM through polls and guards explicit full reads by its own preview',async()=>{
  const current=worker(1,'unknown',{error:{code:'PROTOCOL_LIMIT',message:'Bounded frame limit'},truncations:['prompt','workspace','evidence']}),sibling=worker(0);
  let release;
  const view=await monitor({phone:true,width:390,run:{workers:[sibling,current]},response:path=>path.startsWith('/api/worker/1?')?new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({...current,prompt:'Full saved prompt',result:{summary:'Full saved result'},notStarted:false,noInference:false,noProcessStarted:false,evidence:{cleanup:{serverExited:true,jobEmpty:false,nativeTerminals:{inventoryEmpty:true}}},workspace:{cwd:'C:/owned/worker',changedFiles:['src/<img>.mjs'],patchHash:'a'.repeat(64)}})});}):undefined});
  await view.click(view.document.querySelector('.worker-menu-toggle[data-position="1"]'));await view.click(view.get('worker-card-menu').querySelector('[data-quick-kind="prompt"]'));
  const body=view.get('worker-quick-body');await view.click(view.get('quick-load-worker'));assert.equal(typeof release,'function');
  view.update({updatedAt:'later',workers:[{...sibling,activity:{seq:9,summary:'Sibling update'}},current]});await view.tick(2000);release();await view.flush();assert.match(body.textContent,/Full saved prompt/);
  const pre=body.querySelector('pre');pre.focus();pre.scrollTop=71;body.scrollTop=58;const tab=view.get('worker-tab-prompt');
  view.update({controlCount:99,controls:[{generation:4,position:0,action:'steer',status:'applied'}],lifecycle:{revision:12,workers:[]}});
  await view.tick(2000);assert.equal(body.querySelector('pre')===pre,true,'Unrelated receipts and projections retain evidence DOM');assert.equal(view.get('worker-tab-prompt')===tab,true);assert.equal(view.document.activeElement===pre,true);assert.equal(body.scrollTop,58);assert.equal(pre.scrollTop,71);
  await view.click(view.get('worker-tab-workspace'));assert.match(body.textContent,/C:\/owned\/worker/);assert.match(body.textContent,/Capture status: unverified/);assert.match(body.textContent,/src\/<img>.mjs/);assert.equal(body.querySelector('img'),null);assert.equal(view.calls.some(call=>call.path.includes('/api/patch/')),false);
  await view.click(view.get('worker-tab-failure'));assert.match(body.textContent,/noInferencefalse/);assert.match(body.textContent,/Descendant.*unverified/i);
  view.update({workers:[sibling,{...current,attempts:2,error:{code:'NEW_ATTEMPT',message:'New evidence'}}]});await view.tick(2000);assert.doesNotMatch(body.textContent,/noInferencefalse/);assert.match(body.textContent,/NEW_ATTEMPT/);
  await view.click(view.get('worker-tab-prompt'));await view.click(view.get('quick-load-worker'));release();await view.escape();await view.flush();assert.equal(view.get('worker-quick-view').hidden,true);
  assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('closing and generation or run changes abort quick GETs and ignore late responses',async()=>{
  for(const change of ['close','generation','run']){
    const ref=runId=>({dataInstanceId:'data',runId,runtimeId:'runtime'});let release,signal;
    const view=await monitor({run:{monitor:{run:ref('current'),capabilities:{sessionNavigation:true}}},response:(path,input)=>{
      if(path.startsWith('/api/session/runs'))return{ok:true,json:async()=>({items:[{ref:ref('next'),title:'Next run',status:'running'}]})};
      if(path==='/api/runs/next/run')return{ok:true,json:async()=>({generation:4,status:'running',workers:[worker(0)],coverage:{},monitor:{run:ref('next')}})};
      if(path.startsWith('/api/activity?')){signal=input.signal;return new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({records:[{seq:1,type:'agentMessage',output:'STALE_OUTPUT'}],observed:1,retained:1,dropped:0,nextCursor:1,hasMore:false})});});}
    }});
    await view.click(view.document.querySelector('.worker-menu-toggle'));await view.click(view.get('worker-card-menu').querySelector('[data-quick-kind="messages"]'));assert.equal(typeof release,'function');
    if(change==='close')await view.escape();
    if(change==='generation'){view.update({generation:5});await view.refresh();}
    if(change==='run')await view.click(view.document.querySelector('[data-run-id="next"]'));
    assert.equal(signal.aborted,true,`${change} aborts owned GET`);release();await view.flush();assert.equal(view.get('worker-quick-view').hidden,true);assert.doesNotMatch(view.get('worker-quick-body').textContent,/STALE_OUTPUT/);assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
  }
});

test('quick views report empty logs and outside dismissal returns the connected menu origin',async()=>{
  const view=await monitor({response:path=>path.startsWith('/api/activity?')?{ok:true,json:async()=>({records:[],observed:0,retained:0,dropped:0,nextCursor:0,hasMore:false})}:undefined});
  const origin=view.document.querySelector('.worker-menu-toggle[data-position="1"]');await view.click(origin);await view.click(view.get('worker-card-menu').querySelector('[data-quick-kind="tools"]'));
  assert.match(view.get('worker-quick-body').textContent,/No matching tool events/);
  view.update({updatedAt:'later',workers:[worker(0),worker(1,'completed')]});await view.refresh();assert.equal(origin.isConnected,true);
  view.get('run-title').dispatchEvent(new view.window.Event('click',{bubbles:true}));await view.flush();assert.equal(view.get('worker-quick-view').hidden,true);assert.equal(view.document.activeElement===origin,true);
  assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('failure details use saved cleanup facts and shortened diagnostics stay bounded and safe',async()=>{
  const current=worker(0,'unknown',{attempts:2,error:JSON.stringify({code:'PROTOCOL_LIMIT',message:'Frame too large',stack:'PRIVATE_STACK',token:'PRIVATE_SECRET'}),evidence:{cleanup:{serverExited:true}},truncations:['error']});
  const view=await monitor({run:{workers:[current]}});
  const card=view.document.querySelector('.map-worker');assert.match(card.textContent,/PROTOCOL_LIMIT.*Frame too large/);assert.doesNotMatch(card.textContent,/PRIVATE_STACK|PRIVATE_SECRET/);
  await view.click(view.document.querySelector('.worker-menu-toggle'));await view.click(view.get('worker-card-menu').firstElementChild);
  let text=view.get('worker-quick-body').textContent;assert.match(text,/Owned server exitedtrue/);assert.match(text,/Descendant drainunverified/);assert.doesNotMatch(text,/PRIVATE_STACK|PRIVATE_SECRET/);
  view.update({workers:[{...current,error:'{"code":"REQUEST_TIMEOUT","message":"partial',truncations:['error']}]});await view.refresh();
  assert.match(view.get('detail').firstElementChild.textContent,/shortened.*unverified/i);assert.doesNotMatch(view.document.querySelector('.map-worker').textContent,/\{"code"/);
  await view.escape();assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('quick view tabs retain keyboard focus, workspace handoff reads no patches, and page exit clears evidence',async()=>{
  const workspace={cwd:'C:/owned/task',changedFiles:['one.mjs'],patchPath:'C:/retained/one.patch',patchHash:'a'.repeat(64)};
  const view=await monitor({run:{workers:[worker(0),worker(1,'completed',{workspace})]}});
  await view.click(view.document.querySelector('.worker-menu-toggle[data-position="1"]'));await view.click(view.get('worker-card-menu').querySelector('[data-quick-kind="workspace"]'));
  const tab=view.get('worker-tab-workspace');await view.key(tab,'Home');await view.key(view.document.activeElement,'ArrowRight');await view.key(view.document.activeElement,'End');await view.key(view.document.activeElement,'Enter');assert.equal(view.document.activeElement===tab,true,'Selecting a tab keeps focus on its tab');
  await view.click(view.get('quick-inspect-workspace'));assert.equal(view.get('worker-quick-view').hidden,true);assert.equal(view.get('detail-heading').textContent,'Task 1');assert.equal(view.get('detail').querySelector('.workspace-review').open,true);assert.equal(view.calls.some(call=>call.path.includes('/api/patch/')),false);
  await view.click(view.get('close-inspector'));assert.equal(view.document.activeElement,view.document.querySelector('.worker-menu-toggle[data-position="1"]'));
  await view.click(view.document.activeElement);await view.click(view.get('worker-card-menu').querySelector('[data-quick-kind="prompt"]'));
  view.window.dispatchEvent(new view.window.Event('pagehide'));assert.equal(view.get('worker-quick-view').hidden,true);assert.equal(view.get('worker-quick-body').textContent,'');assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('new failures update an open worker menu and readonly reads never arm a viewed run',async()=>{
  const ref={dataInstanceId:'data',runId:'unarmed',runtimeId:'runtime'},current=worker(1,'running');
  const view=await monitor({run:{workers:[worker(0),current],monitor:{run:ref,capabilities:{scopedControls:true}}}});
  assert.equal(view.get('stop').disabled,true);await view.click(view.document.querySelector('.worker-menu-toggle[data-position="1"]'));
  const actions=view.get('worker-card-menu').firstElementChild;actions.focus();view.update({workers:[worker(0),{...current,status:'failed',error:{code:'REQUEST_TIMEOUT',message:'account/read did not complete within 15000 ms'}}]});await view.tick(2000);
  assert.equal(view.get('worker-card-menu').firstElementChild.textContent,'Failure details');assert.equal(view.document.activeElement===actions,true,'Relevant insert retains the focused menu item');
  await view.click(view.get('worker-card-menu').querySelector('[data-quick-kind="prompt"]'));
  view.update({workers:[worker(0),current]});await view.tick(2000);view.update({workers:[worker(0),{...current,status:'unknown',error:{code:'PROTOCOL_LIMIT',message:'Frame ceiling'}}]});await view.tick(2000);
  assert.ok(view.get('worker-tab-failure'),'A new failure remains directly available from an open quick view');
  await view.click(view.get('worker-tab-failure'));view.update({workers:[worker(0),current]});await view.tick(2000);await view.escape();
  await view.click(view.document.querySelector('.worker-menu-toggle[data-position="1"]'));assert.equal(view.get('worker-card-menu').firstElementChild.textContent,'Actions & controls','Keeping an open failure tab does not add failure items to healthy cards');
  assert.equal(view.get('stop').disabled,true);assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('quick read conflicts and corrupt coverage stay explicit without automatic retry',async()=>{
  for(const kind of ['conflict','coverage']){
    const view=await monitor({response:path=>path.startsWith('/api/activity?')?(kind==='conflict'?{ok:false,status:409,json:async()=>({message:'Generation changed'})}:{ok:true,json:async()=>({records:[{seq:1,type:'agentMessage',output:'UNVERIFIED_RECORD'}],observed:0,retained:1,dropped:0,nextCursor:1,hasMore:false})}):undefined});
    await view.click(view.document.querySelector('.worker-menu-toggle'));await view.click(view.get('worker-card-menu').querySelector('[data-quick-kind="messages"]'));
    assert.match(view.get('worker-quick-body').textContent,/Evidence read failed/);assert.doesNotMatch(view.get('worker-quick-body').textContent,/UNVERIFIED_RECORD/);
    await view.tick(2000);assert.equal(view.calls.filter(call=>call.path.startsWith('/api/activity?')).length,1);assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
  }
});

test('Current run opens a searchable modal and a deliberate row selection becomes current with GETs only',async()=>{
  const ref=runId=>({dataInstanceId:'data',runId,runtimeId:'runtime'});
  const view=await monitor({phone:true,width:390,run:{monitor:{run:ref('first'),pinnedRunId:'first',capabilities:{sessionNavigation:true,scopedControls:true}}},response:path=>{
    if(path.startsWith('/api/session/runs'))return{ok:true,json:async()=>({items:[{ref:ref('first'),title:'First run',executionStatus:'running',createdAt:'2026-10-13T00:00:00Z'},{ref:ref('second'),title:'Second run',executionStatus:'running',createdAt:'2026-10-14T00:00:00Z'},{ref:ref('old'),title:'Old unavailable',executionStatus:'unavailable',disposition:'hidden'}],nextCursor:null})};
    if(path==='/api/runs/second/run')return{ok:true,json:async()=>({generation:6,status:'running',acceptingControls:true,workers:[worker(0)],meta:{name:'Second run'},coverage:{},monitor:{run:ref('second'),capabilities:{sessionNavigation:true,scopedControls:true}}})};
  }});
  assert.ok(view.get('current-run'),'Current run has a compact visible panel');assert.match(view.get('run-picker').textContent,/Change run/);assert.equal(view.get('arm-control'),null,'Selection has no second arming step');
  const graph=view.get('graph-world');await view.click(view.get('run-picker'));assert.equal(view.get('run-popover').getAttribute('aria-modal'),'true');assert.equal(view.document.activeElement,view.get('run-search'));assert.equal(view.document.querySelector('main').hasAttribute('inert'),true);
  view.get('run-search').value='Second';view.get('run-search').dispatchEvent(new view.window.Event('input'));assert.equal(view.document.querySelector('[data-run-id="old"]').hidden,true);assert.equal(view.get('graph-world')===graph,true);assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
  view.get('follow-run').checked=true;view.get('run-options').scrollTop=73;await view.tick(2000);assert.equal(view.get('run-options').scrollTop,73);assert.equal(view.get('run-search').value,'Second');assert.equal(view.document.activeElement,view.get('run-search'));assert.equal(view.get('graph-world')===graph,true,'Dialog polling cannot follow another run while choosing');
  view.get('follow-run').dispatchEvent(new view.window.Event('change'));await view.flush();await view.flush();assert.equal(view.calls.some(call=>call.path==='/api/runs/second/run'),false,'Following cannot change the current run behind the dialog');
  assert.doesNotMatch(view.get('navigation-reason').textContent,/Viewing and controlling are separate/);
  const lastRow=view.document.querySelector('[data-run-id="second"]');lastRow.focus();await view.key(lastRow,'Tab');assert.equal(view.document.activeElement,view.get('close-run-picker'));view.get('run-search').focus();
  view.get('run-show-hidden').checked=true;view.get('run-show-hidden').dispatchEvent(new view.window.Event('change'));await view.flush();assert.ok(view.calls.some(call=>call.path.includes('includeHidden=true')));
  await view.click(view.document.querySelector('[data-run-id="second"]'));await view.flush();assert.equal(view.get('run-popover').hidden,true);assert.equal(view.document.querySelector('main').hasAttribute('inert'),false);assert.match(view.get('current-run').textContent,/Second run/);assert.equal(view.get('stop').disabled,false,'Fresh deliberate selection supplies exact control identity');assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
  await view.click(view.get('stop'));assert.equal(view.calls.filter(call=>call.method==='POST').length,0,'Stop still requires confirmation');
  await view.click(view.get('run-picker'));await view.escape();assert.equal(view.document.activeElement,view.get('run-picker'));await view.click(view.get('run-picker'));view.get('run-dialog-backdrop').dispatchEvent(new view.window.Event('click',{bubbles:true}));assert.equal(view.get('run-popover').hidden,true);assert.equal(view.document.activeElement,view.get('run-picker'));
  view.update({status:'running'});view.document.hidden=true;view.document.dispatchEvent(new view.window.Event('visibilitychange'));assert.equal(view.get('stop').disabled,true);
});

test('pane resize drags persist independent widths and cancel releases capture without committing',async()=>{
  const view=await monitor(),inspector=view.get('inspector-resize'),menu=view.get('menu-resize');
  assert.ok(inspector,'Worker details exposes a resize separator');assert.ok(menu,'Run menu exposes a resize separator');
  await view.click(view.get('more-toggle'));
  const detail=view.get('detail').firstElementChild,map=view.get('workflow-map').firstElementChild;
  view.get('lifecycle-note').value='Keep this review draft';view.get('inspector-panel').scrollTop=56;view.get('run-options').scrollTop=42;
  for(const [handle,panel,initial,expected] of [[inspector,'inspector-panel',300,380],[menu,'more-panel',430,510]]){
    assert.equal(handle.getAttribute('role'),'separator');assert.equal(handle.getAttribute('aria-orientation'),'vertical');assert.equal(handle.getAttribute('aria-controls'),panel);
    assert.equal(Number.parseFloat(view.get(panel).style.width),initial);
    view.pointer(handle,'pointerdown',900);assert.equal(view.captures.get(7),handle);
    view.pointer(handle,'pointermove',820);assert.equal(Number.parseFloat(view.get(panel).style.width),expected);
    await view.tick(2000);
    assert.equal(view.get('detail').firstElementChild,detail);assert.equal(view.get('workflow-map').firstElementChild,map);assert.equal(view.get('lifecycle-note').value,'Keep this review draft');
    assert.equal(view.get('inspector-panel').scrollTop,56);assert.equal(view.get('run-options').scrollTop,42);assert.equal(view.document.activeElement,handle);
    view.pointer(handle,'pointerup',820);assert.equal(view.captures.size,0);
  }
  assert.equal(view.local.get('agent-workflow.monitor.width.inspector'),'380');assert.equal(view.local.get('agent-workflow.monitor.width.menu'),'510');
  view.pointer(menu,'pointerdown',820);view.pointer(menu,'pointermove',700);view.pointer(menu,'pointercancel',700);
  assert.equal(view.captures.size,0);assert.equal(Number.parseFloat(view.get('more-panel').style.width),510);assert.equal(view.local.get('agent-workflow.monitor.width.menu'),'510');
  view.pointer(menu,'pointerdown',820);view.pointer(menu,'pointermove',700);await view.key(menu,'Escape');
  assert.equal(view.get('more-panel').hidden,false,'Escape cancels the current resize before closing its menu');assert.equal(view.captures.size,0);assert.equal(Number.parseFloat(view.get('more-panel').style.width),510);
  view.pointer(inspector,'pointerdown',820);view.pointer(inspector,'pointermove',700);view.pointer(inspector,'lostpointercapture',700);
  assert.equal(Number.parseFloat(view.get('inspector-panel').style.width),380);
  view.pointer(inspector,'pointerdown',820);view.pointer(inspector,'pointermove',700);view.document.hidden=true;view.document.dispatchEvent(new view.window.Event('visibilitychange'));
  assert.equal(view.captures.size,0,'Hiding the page cancels resize capture');assert.equal(view.document.body.classList.contains('resizing-pane'),false);
  assert.equal(Number.parseFloat(view.get('inspector-panel').style.width),380);
  assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('pane resize keyboard bounds and viewport changes retain a usable map and phone sheets',async()=>{
  const view=await monitor(),handle=view.get('inspector-resize');assert.ok(handle,'Resize separator exists');
  handle.focus();await view.key(handle,'ArrowLeft');assert.equal(Number(handle.getAttribute('aria-valuenow')),316);
  await view.key(handle,'Home');assert.equal(Number(handle.getAttribute('aria-valuenow')),260);
  await view.key(handle,'End');assert.equal(Number(handle.getAttribute('aria-valuenow')),600);
  view.resize(700);assert.equal(Number(handle.getAttribute('aria-valuenow')),370);
  view.resize(390);assert.equal(handle.hidden,true);assert.equal(handle.tabIndex,-1);assert.equal(handle.getAttribute('aria-disabled'),'true');
  const saved=view.local.get('agent-workflow.monitor.width.inspector');await view.key(handle,'Home');assert.equal(view.local.get('agent-workflow.monitor.width.inspector'),saved);
  view.pointer(handle,'pointerdown',300);view.pointer(handle,'pointermove',0);view.pointer(handle,'pointerup',0);assert.equal(view.captures.size,0);assert.equal(view.local.get('agent-workflow.monitor.width.inspector'),saved);
  assert.equal(view.get('inspector-panel').style.width,'');assert.equal(view.get('more-panel').style.width,'');
  view.resize(1200);assert.equal(handle.hidden,false);assert.equal(Number(handle.getAttribute('aria-valuenow')),600);
  await view.click(view.get('close-inspector'));assert.equal(handle.hidden,true);
  await view.click(view.get('more-toggle'));const menu=view.get('menu-resize');menu.focus();
  await view.key(menu,'Home');assert.equal(Number(menu.getAttribute('aria-valuenow')),300);
  await view.key(menu,'ArrowRight');assert.equal(Number(menu.getAttribute('aria-valuenow')),300);
  await view.key(menu,'End');assert.equal(Number(menu.getAttribute('aria-valuenow')),720);
  view.resize(600);assert.equal(Number(menu.getAttribute('aria-valuenow')),320);assert.equal(Number.parseFloat(view.get('more-panel').style.width),320);
  view.pointer(menu,'pointerdown',100);view.pointer(menu,'pointermove',-9999);assert.equal(Number(menu.getAttribute('aria-valuenow')),320);view.pointer(menu,'pointerup',-9999);
  view.pointer(menu,'pointerdown',100);view.pointer(menu,'pointermove',9999);assert.equal(Number(menu.getAttribute('aria-valuenow')),300);view.pointer(menu,'pointerup',9999);
});

test('pane resize restores guarded preferences and survives unavailable storage',async()=>{
  const view=await monitor({savedWidths:{inspector:'NaN',menu:'99999'}});await view.click(view.get('more-toggle'));
  assert.ok(view.get('inspector-resize'),'Resize separator exists');
  assert.equal(Number(view.get('inspector-resize').getAttribute('aria-valuenow')),300);assert.equal(Number(view.get('menu-resize').getAttribute('aria-valuenow')),720);
  assert.equal(view.cookieJar.get('agent-workflow.monitor.width.menu'),'720','Only bounded scalar widths are persisted');
  const restored=await monitor({savedWidths:{inspector:'380',menu:'510'}});assert.equal(Number.parseFloat(restored.get('inspector-panel').style.width),380);assert.equal(Number.parseFloat(restored.get('more-panel').style.width),510);
  const blocked=await monitor({storageBlocked:true});await blocked.key(blocked.get('inspector-resize'),'ArrowLeft');assert.equal(Number.parseFloat(blocked.get('inspector-panel').style.width),316);
});

test('host preferences survive fresh port storage and cookie wins over stale local values',async()=>{
  const legacy=await monitor({savedTheme:'light',savedWidths:{menu:'510'}});
  assert.equal(legacy.cookieJar.get('agent-workflow.monitor.theme'),'light','A valid legacy preference is promoted to host storage');assert.equal(legacy.cookieJar.get('agent-workflow.monitor.width.menu'),'510');
  const first=await monitor();await first.change('theme','dark');
  assert.equal(first.cookieJar.get('agent-workflow.monitor.theme'),'dark','Theme preference is host-persistent');
  assert.ok(first.get('inspector-resize'),'Resize separator exists');await first.key(first.get('inspector-resize'),'ArrowLeft');
  const next=await monitor({cookieJar:first.cookieJar,savedTheme:'light',savedWidths:{inspector:'500'}});
  assert.equal(next.document.documentElement.dataset.theme,'dark');assert.equal(Number(next.get('inspector-resize').getAttribute('aria-valuenow')),316);
  for(const cookie of first.cookieWrites){assert.match(cookie,/; Path=\/; SameSite=Lax; Max-Age=31536000$/);assert.doesNotMatch(cookie,/Domain=|token|fixture/i);}
  await next.change('theme','system');next.osTheme(true);assert.equal(next.document.documentElement.dataset.theme,'light');next.osTheme(false);assert.equal(next.document.documentElement.dataset.theme,'dark');
});

test('malformed and blocked host preferences fall back safely without breaking theme or resize',async()=>{
  for(const encoded of ['%E0%A4%A','%00dark','unknown','']){
    const view=await monitor({cookieJar:new Map([['agent-workflow.monitor.theme',encoded],['agent-workflow.monitor.width.inspector',encoded]]),savedTheme:'light',savedWidths:{inspector:'380'}});assert.equal(view.document.documentElement.dataset.theme,'light');assert.equal(Number(view.get('inspector-resize').getAttribute('aria-valuenow')),380);
  }
  const view=await monitor({cookiesBlocked:true,storageBlocked:true,light:true});assert.equal(view.document.documentElement.dataset.theme,'light');await view.change('theme','dark');assert.equal(view.document.documentElement.dataset.theme,'dark');
  assert.ok(view.get('inspector-resize'),'Resize separator exists');await view.key(view.get('inspector-resize'),'ArrowLeft');assert.equal(Number(view.get('inspector-resize').getAttribute('aria-valuenow')),316);
});

test('Change run shows catalog failures and retries in the open selection dialog',async()=>{
  const ref={dataInstanceId:'data',runId:'current',runtimeId:'runtime'};let fail=true,hold=false,release;
  const view=await monitor({savedPolling:'manual',run:{monitor:{run:ref,capabilities:{sessionNavigation:true}}},response:async path=>{
    if(path.startsWith('/api/session/runs'))return fail?{ok:false,status:503,json:async()=>({error:'Catalog temporarily unavailable'})}:hold?new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({items:[],nextCursor:null})});}):{ok:true,json:async()=>({items:[],nextCursor:null})};
  }});
  await view.click(view.get('run-picker'));
  const error=view.get('run-picker-error');assert.ok(error,'Catalog error is inside Change run');
  assert.equal(error.closest('#run-popover'),view.get('run-popover'));assert.equal(error.hidden,false);assert.match(error.textContent,/unavailable|503/i);
  assert.equal(view.get('more-panel').hidden,true);assert.equal(view.document.activeElement,view.get('run-search'));
  fail=false;hold=true;view.get('retry-runs').focus();await view.click(view.get('retry-runs'));
  assert.equal(view.document.activeElement===view.get('run-search'),true,'Move focus before disabling the pending retry control');release();await view.flush();
  assert.equal(error.hidden,true);assert.equal(view.document.activeElement===view.get('run-search'),true,'Successful retry keeps focus in the open dialog');assert.equal(view.get('run-popover').hidden,false);assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('Change run retries the failed pagination page without losing loaded choices',async()=>{
 const ref=id=>({dataInstanceId:'data',runId:id,runtimeId:'runtime'});let fail=true;
 const view=await monitor({savedPolling:'manual',run:{monitor:{run:ref('current'),capabilities:{sessionNavigation:true}}},response:path=>{
  if(!path.startsWith('/api/session/runs'))return;
  if(path.includes('cursor=page-2'))return fail?{ok:false,status:503,json:async()=>({error:'Page unavailable'})}:{ok:true,json:async()=>({items:[{ref:ref('later'),title:'Later run',executionStatus:'failed'}],nextCursor:null})};
  return{ok:true,json:async()=>({items:[{ref:ref('current'),title:'Current run',executionStatus:'running'}],nextCursor:'page-2'})};
 }});
 await view.click(view.get('run-picker'));const current=view.document.querySelector('[data-run-id="current"]');
 await view.click(view.get('more-runs'));assert.equal(view.get('run-picker-error').hidden,false);
 fail=false;await view.click(view.get('retry-runs'));
 assert.ok(view.document.querySelector('[data-run-id="later"]'),'Retry loads the originally failed page');
 assert.equal(view.document.querySelector('[data-run-id="current"]'),current);assert.equal(view.get('run-popover').hidden,false);
});

test('automatic head polling preserves the exact failed page and visible retry',async()=>{
 const ref=id=>({dataInstanceId:'data',runId:id,runtimeId:'runtime'});let fail=true,headReads=0;
 const view=await monitor({run:{monitor:{run:ref('current'),capabilities:{sessionNavigation:true}}},response:path=>{
  if(!path.startsWith('/api/session/runs'))return;
  if(path.includes('cursor=page-2'))return fail?{ok:false,status:503,json:async()=>({error:'Page unavailable'})}:{ok:true,json:async()=>({items:[{ref:ref('recovered'),title:'Recovered original page',executionStatus:'completed'}],nextCursor:null})};
  return{ok:true,json:async()=>({items:[{ref:ref('current'),title:'Current run',executionStatus:'running'}],nextCursor:++headReads===1?'page-2':'new-head-page'})};
 }});
 await view.click(view.get('run-picker'));await view.click(view.get('more-runs'));assert.equal(view.get('run-picker-error').hidden,false);
 await view.tick(2000);assert.equal(view.get('run-picker-error').hidden,false,'Unrelated successful head refresh cannot hide failed-page evidence');
 fail=false;await view.click(view.get('retry-runs'));assert.ok(view.document.querySelector('[data-run-id="recovered"]'),'Retry uses the original failed cursor, not the refreshed head cursor');
 assert.equal(view.get('run-picker-error').hidden,true);
});

test('Manual navigation coalesces Show hidden changes during a pending GET into the latest scope',async()=>{
  const ref=runId=>({dataInstanceId:'data',runId,runtimeId:'runtime'});
  let release,active=0,peak=0;
  const view=await monitor({savedPolling:'manual',run:{monitor:{run:ref('current'),capabilities:{sessionNavigation:true}}},response:async path=>{
    if(!path.startsWith('/api/session/runs'))return;
    peak=Math.max(peak,++active);
    if(path.includes('includeHidden=false'))return new Promise(resolve=>{release=()=>{active--;resolve({ok:true,json:async()=>({items:[{ref:ref('old-scope'),title:'Old scope',disposition:'visible'}],nextCursor:null})});};});
    active--;return {ok:true,json:async()=>({items:[{ref:ref('hidden-run'),title:'Latest hidden record',disposition:'hidden'}],nextCursor:null})};
  }});
  assert.equal(typeof release,'function','Initial catalog GET is pending');
  for(const checked of [true,false,true]){view.get('show-hidden').checked=checked;view.get('show-hidden').dispatchEvent(new view.window.Event('change'));await view.flush();}
  assert.equal(view.calls.filter(call=>call.path.startsWith('/api/session/runs')).length,1,'No overlapping catalog GET');
  release();await view.flush();
  assert.equal(view.calls.filter(call=>call.path.startsWith('/api/session/runs')).length,2,'Latest explicitly requested scope is read after the old GET settles');
  assert.equal(peak,1);assert.match(view.get('run-options').textContent,/Latest hidden record/);assert.doesNotMatch(view.get('run-options').textContent,/Old scope/);
  assert.equal(view.calls.filter(call=>call.method==='POST').length,0);assert.equal(view.timers.size,0,'Manual does not schedule a poll');
});

test('queued navigation scope reads respect hidden, disposed and authentication guards',async()=>{
  for(const guard of ['hidden','disposed','authentication']){
    let release;
    const view=await monitor({savedPolling:'manual',run:{monitor:{capabilities:{sessionNavigation:true}}},response:path=>path.startsWith('/api/session/runs')?new Promise(resolve=>{release=()=>resolve(guard==='authentication'?{ok:false,status:401,json:async()=>({message:'Expired session'})}:{ok:true,json:async()=>({items:[],nextCursor:null})});}):undefined});
    view.get('show-hidden').checked=true;view.get('show-hidden').dispatchEvent(new view.window.Event('change'));
    if(guard==='hidden'){view.document.hidden=true;view.document.dispatchEvent(new view.window.Event('visibilitychange'));}
    if(guard==='disposed')view.window.dispatchEvent(new view.window.Event('pagehide'));
    release();await view.flush();
    assert.equal(view.calls.filter(call=>call.path.startsWith('/api/session/runs')).length,1,`${guard} prevents queued GET`);assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
  }
});

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

test('automatic polling retains unchanged navigation, messages, map and inspector DOM nodes',async()=>{
  const ref={dataInstanceId:'data',runId:'current',runtimeId:'runtime'};
  const view=await monitor({run:{monitor:{run:ref,pinnedRunId:'current',capabilities:{sessionNavigation:true,scopedControls:true}}},response:path=>path.startsWith('/api/session/runs')?{ok:true,json:async()=>({items:[{ref,title:'Current',executionStatus:'running',disposition:'visible',createdAt:'2026-10-13T12:00:00Z'}]})}:undefined});
  await view.click(view.get('more-toggle'));await view.click(view.get('run-picker'));
  const row=view.document.querySelector('[data-run-id="current"]');assert.ok(row,'Columnar current-run row exists');
  row.focus();view.get('run-options').scrollTop=87;view.get('workflow-map').scrollLeft=42;
  const map=view.get('workflow-map').firstElementChild,detail=view.get('detail').firstElementChild,messages=view.get('message-history').firstElementChild;
  await view.tick(2000);
  assert.equal(view.document.querySelector('[data-run-id="current"]')===row,true);
  assert.equal(view.get('workflow-map').firstElementChild===map,true);
  assert.equal(view.get('detail').firstElementChild===detail,true);
  assert.equal(view.get('message-history').firstElementChild===messages,true);
  assert.equal(view.document.activeElement===row,true);assert.equal(view.get('run-popover').hidden,false);
  assert.equal(view.get('run-options').scrollTop,87);assert.equal(view.get('workflow-map').scrollLeft,42);
  assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('changed polling metadata preserves unrelated map cards, real message rows and paged navigation',async()=>{
  const ref=id=>({dataInstanceId:'data',runId:id,runtimeId:'runtime'});let changed=false;
  const item=(id,status)=>({ref:ref(id),title:id,executionStatus:status,disposition:'visible',createdAt:'2026-10-13T12:00:00Z'});
  const view=await monitor({run:{workers:[worker(0,'completed',{truncations:['prompt']}),worker(1,'running')],monitor:{run:ref('current'),pinnedRunId:'current',capabilities:{sessionNavigation:true,scopedControls:true}}},response:path=>path.startsWith('/api/worker/')?{ok:false,status:503,json:async()=>({message:'Retain this actual message'})}:path.startsWith('/api/session/runs')?{ok:true,json:async()=>({items:path.includes('cursor=')?[item('paged','completed')]:changed?[item('other','running'),item('current','running')]:[item('current','running'),item('other','queued')],nextCursor:path.includes('cursor=')?null:'page-2'})}:undefined});
  await view.click([...view.get('detail').querySelectorAll('button')].find(button=>button.textContent==='Load worker details'));
  const message=view.get('message-history').firstElementChild;assert.ok(message);
  const card=view.get('workflow-map').querySelector('[data-position="0"]'),detail=view.get('detail').firstElementChild;
  await view.click(view.get('more-toggle'));await view.click(view.get('run-picker'));await view.click(view.get('more-runs'));
  const row=view.document.querySelector('[data-run-id="current"]'),paged=view.document.querySelector('[data-run-id="paged"]');assert.ok(paged);row.focus();const oldTime=row.querySelector('time').firstChild;
  changed=true;view.update({updatedAt:'2026-10-13T13:00:00Z',workers:[worker(0,'completed',{truncations:['prompt']}),worker(1,'running',{activity:{summary:'Changed activity'}})],error:{code:'FRESH',message:'A new message'}});
  await view.tick(2000);
  assert.equal(view.get('workflow-map').querySelector('[data-position="0"]')===card,true,'Unchanged map card is retained');
  assert.equal(view.get('detail').firstElementChild===detail,true,'Unchanged inspector is retained');
  assert.equal(message.isConnected,true,'Earlier message DOM remains when a new notice arrives');
  assert.equal(view.document.querySelector('[data-run-id="paged"]')===paged,true,'Loaded pagination stays available across head refresh');
  assert.equal(view.document.querySelector('[data-run-id="current"]')===row,true);assert.equal(view.document.activeElement===row,true);
  assert.equal(row.querySelector('time').firstChild===oldTime,true);assert.match(view.document.querySelector('[data-run-id="other"] .status-chip').textContent,/running/);assert.match(view.get('workflow-map').textContent,/Changed activity/);
});

test('unrelated experience and lifecycle polling retains focused inspector evidence while relevant changes render',async()=>{
  const projection=(outcome='reported',other='unverified',acceptance='unaccepted')=>({phases:[],workers:[{ref:{position:0},task:{declaredOutcome:outcome,verification:'unverified',reason:`Selected ${outcome}`}},{ref:{position:1},task:{declaredOutcome:other}}],artifacts:[{worker:{position:0},claimId:'selected-proof',integrity:'verified',acceptance},{worker:{position:1},claimId:'other-proof',integrity:other,acceptance:'unaccepted'}]});
  const lifecycle=(revision=1,selected='visible',other='visible')=>({available:true,revision,run:{visibility:'visible'},workers:[{target:{generation:4,position:0,attempt:0},visibility:selected},{target:{generation:4,position:1,attempt:0},visibility:other}]});
  const view=await monitor({run:{workers:[worker(0,'completed',{result:'Selected evidence\n'.repeat(100)}),worker(1,'running')],experience:projection(),lifecycle:lifecycle()}});
  const panel=view.get('detail').firstElementChild,disclosure=view.get('detail').querySelector('[data-disclosure="result"]'),pre=disclosure.querySelector('pre');
  disclosure.open=true;pre.focus();pre.scrollTop=71;pre.scrollLeft=29;view.get('inspector-panel').scrollTop=123;
  view.update({experience:projection('reported','completed'),lifecycle:lifecycle(2,'visible','hidden'),restartPreview:{position:1,eligible:false,reason:'Unrelated restart fact'}});
  await view.tick(2000);
  assert.equal(view.get('detail').firstElementChild===panel,true,'Unrelated projection changes retain the selected inspector');
  assert.equal(view.get('detail').querySelector('[data-disclosure="result"] pre')===pre,true);assert.equal(pre.isConnected,true);assert.equal(view.document.activeElement===pre,true);
  assert.equal(pre.scrollTop,71);assert.equal(pre.scrollLeft,29);assert.equal(view.get('inspector-panel').scrollTop,123);assert.equal(disclosure.open,true);
  view.update({experience:projection('complete','completed'),lifecycle:lifecycle(3,'hidden','hidden')});await view.tick(2000);
  assert.match(view.get('detail').textContent,/Selected complete/);assert.match(view.get('detail').textContent,/Disposition: hidden/);
  view.update({experience:projection('complete','completed','accepted')});await view.tick(2000);assert.match(view.get('detail').textContent,/selected-proof: retained integrity verified; acceptance accepted/);
  view.update({workers:[worker(0,'completed',{dependencies:[1]}),worker(1,'running') ]});await view.tick(2000);
  assert.match(view.get('detail').querySelector('[data-prerequisite="1"]').textContent,/hidden/);
  view.update({lifecycle:lifecycle(4,'hidden','visible')});await view.tick(2000);assert.doesNotMatch(view.get('detail').querySelector('[data-prerequisite="1"]').textContent,/hidden/);
  assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('loaded full evidence survives sibling timestamps and expires when its own preview changes',async()=>{
  const preview=worker(0,'completed',{truncations:['prompt','result']}),full=worker(0,'completed',{prompt:'Full prompt\n'.repeat(100),result:'Full result\n'.repeat(100)});
  const view=await monitor({run:{workers:[preview,worker(1,'running')]},response:path=>path.startsWith('/api/worker/0?')?{ok:true,json:async()=>full}:undefined});
  await view.click([...view.get('detail').querySelectorAll('button')].find(button=>button.textContent==='Load worker details'));
  const pre=view.get('detail').querySelector('[data-disclosure="result"] pre'),panel=view.get('detail').firstElementChild;assert.match(pre.textContent,/Full result/);
  pre.parentElement.open=true;pre.focus();pre.scrollTop=69;pre.scrollLeft=27;view.get('inspector-panel').scrollTop=121;
  view.update({updatedAt:'2026-10-13T14:00:00Z',workers:[preview,worker(1,'completed')]});await view.tick(2000);
  assert.equal(view.get('detail').firstElementChild===panel,true,'A global timestamp does not expire selected full evidence');
  assert.equal(view.get('detail').querySelector('[data-disclosure="result"] pre')===pre,true);assert.equal(pre.isConnected,true);assert.equal(view.document.activeElement===pre,true);
  assert.equal(pre.scrollTop,69);assert.equal(pre.scrollLeft,27);assert.equal(view.get('inspector-panel').scrollTop,121);
  view.update({updatedAt:'2026-10-13T15:00:00Z',workers:[{...preview,prompt:'New bounded prompt',result:'New bounded result'},worker(1,'completed')]});await view.tick(2000);
  assert.match(view.get('detail').textContent,/New bounded result/);assert.doesNotMatch(view.get('detail').textContent,/Full result/);
  assert.ok([...view.get('detail').querySelectorAll('button')].some(button=>button.textContent==='Load worker details'),'Changed selected preview requires a fresh full read');
  assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('a pending automatic poll stays single flight and late hidden responses cannot rearm controls',async()=>{
  let delayed=false,release;const view=await monitor({response:path=>delayed&&path==='/api/run'?new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({generation:4,status:'running',acceptingControls:true,workers:[worker(0)],meta:{name:'Late hidden response'}})});}):undefined});
  delayed=true;await view.tick(2000);assert.equal(view.calls.filter(call=>call.path==='/api/run').length,2);
  await view.change('poll-interval','1');assert.equal([...view.timers.values()].filter(timer=>timer.delay===1000).length,0);
  await view.refresh();assert.equal(view.calls.filter(call=>call.path==='/api/run').length,2);
  view.document.hidden=true;view.document.dispatchEvent(new view.window.Event('visibilitychange'));
  release();await view.flush();assert.equal(view.get('pause').disabled,true);assert.doesNotMatch(view.get('run-title').textContent,/Late hidden/);assert.equal(view.timers.size,0);
  await view.change('poll-interval','manual');const before=view.calls.length;view.document.hidden=false;view.document.dispatchEvent(new view.window.Event('visibilitychange'));await view.flush();assert.equal(view.calls.length,before,'Manual waits for explicit Refresh now after visibility return');
});

test('saved data polling choices reschedule once, Manual keeps Refresh now and hidden/auth states stop polling',async()=>{
  const view=await monitor();assert.equal(view.get('poll-interval')?.value,'2','Default polling is two seconds');
  for(const [choice,delay] of [['1',1000],['2',2000],['5',5000],['10',10000],['30',30000]]){await view.change('poll-interval',choice);assert.deepEqual([...view.timers.values()].map(timer=>timer.delay),[delay]);}
  await view.change('poll-interval','5');assert.equal(view.local.get('agent-workflow.monitor.polling'),'5');
  assert.deepEqual([...view.timers.values()].map(timer=>timer.delay),[5000]);
  await view.change('poll-interval','manual');assert.equal(view.timers.size,0);
  const calls=view.calls.length;await view.refresh();assert.ok(view.calls.length>calls);assert.equal(view.timers.size,0);
  view.window.dispatchEvent(new view.window.Event('pagehide'));const beforeRestore=view.calls.length;
  const restored=new view.window.Event('pageshow');restored.persisted=true;view.window.dispatchEvent(restored);await view.flush();
  assert.equal(view.calls.length,beforeRestore,'Manual remains explicit after a persisted-page restore');assert.equal(view.timers.size,0);
  assert.equal(view.get('pause').disabled,true,'Restored data stays stale until an explicit read');
  await view.refresh();assert.ok(view.calls.length>beforeRestore,'Manual Refresh now works after restore');
  const retained=await monitor({savedPolling:'30'});assert.equal(retained.get('poll-interval').value,'30');assert.deepEqual([...retained.timers.values()].map(timer=>timer.delay),[30000]);
  retained.document.hidden=true;retained.document.dispatchEvent(new retained.window.Event('visibilitychange'));assert.equal(retained.timers.size,0);
  const denied=await monitor({response:path=>path==='/api/health'?{ok:false,status:403,json:async()=>({})}:undefined});assert.equal(denied.timers.size,0);assert.equal(denied.get('pause').disabled,true);assert.match(denied.get('connection').textContent,/Authentication required/);assert.match(denied.get('notice').textContent,/authenticate/);
});

test('run menu is an accessible icon popover with Escape focus return',async()=>{
  const view=await monitor();assert.equal(view.get('more-toggle').getAttribute('aria-label'),'Run menu');
  assert.equal(view.get('more-toggle').getAttribute('aria-haspopup'),'dialog');assert.doesNotMatch(view.get('more-toggle').textContent,/More/);
  await view.click(view.get('more-toggle'));assert.equal(view.get('more-panel').getAttribute('role'),'dialog');
  await view.escape();assert.equal(view.get('more-panel').hidden,true);assert.equal(view.document.activeElement,view.get('more-toggle'));
});

test('run picker filters loaded pages truthfully and pins a disappeared viewed context with keyboard access',async()=>{
  const ref=id=>({dataInstanceId:'data',runId:id,runtimeId:'runtime'}),current=ref('current');let disappeared=false;
  const item=(id,status)=>({ref:ref(id),title:id==='failed'?'<img src=x onerror=alert(1)>':id,executionStatus:status,disposition:'visible',createdAt:'2026-10-13T12:00:00Z'});
  const view=await monitor({run:{monitor:{run:current,pinnedRunId:'current',capabilities:{sessionNavigation:true,scopedControls:true}}},response:path=>path.startsWith('/api/session/runs')?{ok:true,json:async()=>({items:path.includes('cursor=')?[{...item('paged','completed'),disposition:path.includes('includeHidden=true')?'hidden':'visible'}]:disappeared?[item('unknown','unknown')]:[item('current','running'),item('completed','completed'),item('failed','failed'),item('unknown','unknown'),item('unavailable','unavailable')],nextCursor:path.includes('cursor=')?null:'page-2'})}:undefined});
  await view.click(view.get('more-toggle'));await view.click(view.get('run-picker'));
  assert.equal(view.get('run-picker').getAttribute('aria-haspopup'),'dialog');assert.equal(view.get('run-popover').getAttribute('role'),'dialog');
  assert.match(view.get('run-scope').textContent,/loaded.*page/i);assert.equal(view.document.querySelectorAll('img').length,0);
  assert.match(view.get('run-popover').querySelector('.run-columns').textContent,/Created/);
  assert.equal(view.document.querySelector('[data-run-id="current"] time').textContent,new Date('2026-10-13T12:00:00Z').toLocaleString());
  const visible=()=>[...view.get('run-options').querySelectorAll('[data-run-id]')].filter(row=>!row.hidden).map(row=>row.dataset.runId);
  const filter=label=>view.click([...view.get('run-filters').querySelectorAll('button')].find(button=>button.textContent===label));
  await filter('Completed');assert.deepEqual(visible(),['current','completed']);
  await view.click(view.get('more-runs'));assert.deepEqual(visible(),['current','completed','paged']);
  await filter('Needs attention');assert.deepEqual(visible(),['current','failed','unknown','unavailable']);
  await filter('Active');assert.deepEqual(visible(),['current']);
  await filter('All');const row=view.document.querySelector('[data-run-id="completed"]');row.focus();
  await view.key(row,'ArrowDown');assert.equal(view.document.activeElement.dataset.runId,'failed');
  await view.key(view.document.activeElement,'Home');assert.equal(view.document.activeElement.dataset.runId,'current');
  disappeared=true;await view.tick(2000);assert.ok(visible().includes('current'));assert.equal(view.get('run-title').textContent,'Fixture workflow');
  await view.escape();assert.equal(view.get('run-popover').hidden,true);assert.equal(view.document.activeElement,view.get('run-picker'));assert.equal(view.get('more-panel').hidden,true,'Change run is independent of the closed Run menu');
  view.get('show-hidden').checked=true;await view.change('show-hidden','');
  await view.click(view.get('run-picker'));assert.equal(view.get('more-runs').hidden,false,'Changing includeHidden resets the pagination scope');
  await view.click(view.get('more-runs'));assert.match(view.document.querySelector('[data-run-id="paged"] .run-option-state').textContent,/hidden/);
  view.get('show-hidden').checked=false;await view.change('show-hidden','');assert.equal(view.document.querySelector('[data-run-id="paged"]'),null,'Pages from a different visibility query are discarded');
  assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
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

test('unavailable startup stays navigable without invented generation, counts or execution controls',async()=>{
 const ref={dataInstanceId:'data',runId:'startup',runtimeId:'retained'};
 const view=await monitor({run:{status:'unavailable',generation:null,availability:{status:'unavailable',reason:'Saved execution data is unavailable. Original records were preserved.'},workers:[],coverage:undefined,attempts:undefined,cleanup:undefined,monitor:{run:ref,pinnedRunId:'startup',capabilities:{sessionNavigation:true,scopedControls:false,lifecycle:false}},lifecycle:{available:false,visibilityKnown:false}},response:path=>path==='/api/runs/startup/run'?{ok:true,json:async()=>({generation:4,status:'running',acceptingControls:true,workers:[worker(0,'running')],monitor:{run:ref,pinnedRunId:'startup',capabilities:{sessionNavigation:true,scopedControls:true}}})}:path.startsWith('/api/session/runs')?{ok:true,json:async()=>({items:[{ref,title:'Startup',executionStatus:'unavailable',disposition:'visible'}],nextCursor:null,unavailableCount:1,hiddenCount:0,unknownCount:0})}:undefined});
 assert.equal(view.get('run-status').textContent,'unavailable');assert.match(view.get('generation').textContent,/unavailable/i);
 assert.doesNotMatch(view.get('generation').textContent,/Generation (null|0|1)/);
 for(const id of ['completed','attempts','cached'])assert.equal(view.get(id).textContent,'Unavailable');
 assert.match(view.get('flow-progress').textContent,/execution.*unavailable/i);assert.doesNotMatch(view.get('flow-progress').textContent,/0 failed|0 unknown/);
 assert.match(view.get('worker-count').textContent,/unavailable/i);assert.match(view.get('empty').textContent,/unavailable/i);
 assert.doesNotMatch(view.get('workflow-map').textContent,/Generation null/);assert.doesNotMatch(view.get('visibility-count').textContent,/0 unknown/);
 assert.match(view.get('session-counts').textContent,/1 unavailable/);assert.match(view.get('run-options').textContent,/unavailable/);
 assert.equal(view.get('run-picker').disabled,false);assert.equal(view.get('close-monitor').disabled,false);
 for(const id of ['pause','stop','resume','load-script','hide-run','archive-run','review-prune'])assert.equal(view.get(id).disabled,true,id);
 await view.click(view.get('more-toggle'));await view.click(view.get('run-picker'));await view.click(view.document.querySelector('[data-run-id="startup"]'));
 assert.equal(view.get('run-status').textContent,'running');assert.equal(view.get('arm-control'),null);
 assert.equal(view.get('stop').disabled,false,'Deliberate current-run selection uses the fresh authorized identity');assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('visibility filtering preserves counts and discloses hidden prerequisites; missing lifecycle is unavailable',async()=>{
  const view=await monitor({run:{workers:[worker(0,'unknown',{dependencies:[],attempts:1}),worker(1,'queued',{dependencies:[0]})],lifecycle:{schema:1,revision:2,workers:[{target:{kind:'worker',generation:4,position:0,attempt:1},visibility:'hidden'}]}}});
  assert.equal(view.get('worker-list').children.length,1);assert.match(view.get('visibility-count').textContent,/1 hidden.*1 unknown/);
  assert.match(view.get('map-note').textContent,/omitted prerequisite/);assert.equal(view.get('hide-run').disabled,true);assert.match(view.get('lifecycle-reason').textContent,/unavailable/i);
  view.get('show-hidden').checked=true;view.get('show-hidden').dispatchEvent(new view.window.Event('change'));await view.flush();assert.equal(view.get('worker-list').children.length,2);
  await view.click(view.get('workflow-map').querySelector('[data-position="1"]'));
  view.get('show-hidden').checked=false;view.get('show-hidden').dispatchEvent(new view.window.Event('change'));await view.flush();
  await view.click(view.get('detail').querySelector('[data-prerequisite="0"]'));
  assert.equal(view.get('detail-heading').textContent,'Task 0');
  assert.equal(view.get('detail-status').textContent,'unknown');
  assert.match(view.get('detail').textContent,/Disposition: hidden/);
  assert.equal(view.get('worker-list').children.length,1,'Navigation does not alter visibility');
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
  await view.click(view.get('run-picker'));await view.click(view.document.querySelector('[data-run-id="replacement"]'));await view.flush();await view.click(view.get('stop'));
  const posted=view.calls.find(call=>call.method==='POST');assert.equal(posted.path,'/api/runs/replacement/control');assert.deepEqual(JSON.parse(posted.body).target,{...b,generation:4});
  view.get('follow-run').checked=false;await view.click(view.get('run-picker'));await view.click(view.document.querySelector('[data-run-id="original"]'));await view.flush();assert.equal(view.get('steer-text').value,'Original draft');assert.equal(view.get('stop').disabled,false,'Explicit row selection makes the original run current again');
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
  const reviewed=view.get('apply-prune');reviewed.focus();await view.tick(2000);assert.equal(view.get('apply-prune')===reviewed,true,'Unchanged reviewed preview retains the actual focused control');assert.equal(view.document.activeElement===reviewed,true);
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
  assert.equal(view.get('flow-progress').textContent, '1 / 3 complete · 0 active');
  assert.match(view.get('coverage-disclosure').textContent, /1 failed.*1 unknown/);
  assert.match(view.get('coverage-disclosure').textContent, /discover more workers/);
  assert.match(view.get('workflow-map').textContent, /1\/3 complete/);
  assert.match(view.get('workflow-map').textContent, /1 failed · 1 unknown/);
  assert.equal(view.get('workflow-map').querySelectorAll('.map-run,.map-phase-node').length,0);
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
  await view.click(view.get('tray-toggle'));
  assert.equal(view.get('worker-list').children.length,62);
  for(const position of [60,61]){
    await view.click(view.get('worker-list').querySelector(`[data-position="${position}"]`));
    assert.equal(view.get('detail-heading').textContent,`Task ${position}`);
    assert.equal(view.get('inspector-panel').hidden,false);
  }
  assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('map inspector, More, Messages and worker tray restore rebuilt initiating controls without losing records',async()=>{
  const view=await monitor();
  const card=()=>view.get('workflow-map').querySelector('.map-worker[data-position="1"]');
  await view.click(card());
  assert.ok(view.get('inspector-panel'),'Closable inspector exists');
  assert.equal(view.get('inspector-panel').hidden,false);
  assert.equal(view.document.activeElement,view.get('close-inspector'));
  view.update({workers:[worker(0),worker(1,'running',{activity:{summary:'New evidence'}})]});await view.refresh();
  await view.escape();
  assert.equal(view.get('inspector-panel').hidden,true);
  assert.equal(view.document.activeElement,card());
  view.update({workers:[worker(0,'failed'),worker(1,'running',{activity:{summary:'Polling after closing'}})]});await view.refresh();
  assert.equal(view.document.activeElement===card(),true,'Polling retains focus on a rebuilt map control');
  for(const [toggle,panel,close] of [['more-toggle','more-panel','close-more'],['messages-toggle','messages-panel','close-messages'],['tray-toggle','worker-tray','close-tray']]){
    await view.click(view.get(toggle));assert.equal(view.get(panel).hidden,false);
    await view.refresh();await view.click(view.get(close));
    assert.equal(view.get(panel).hidden,true);assert.equal(view.document.activeElement,view.get(toggle));
    assert.equal(view.get('worker-list').children.length,2);
  }
  await view.click(view.get('workers-toggle'));
  await view.escape();
  assert.equal(view.get('worker-tray').hidden,true,'Escape closes the foreground tray before the inspector');
  assert.equal(view.get('inspector-panel').hidden,true);
  await view.click(card());await view.click(view.get('workers-toggle'));await view.escape();
  assert.equal(view.get('worker-tray').hidden,true);
  assert.equal(view.get('inspector-panel').hidden,false,'Closing the tray preserves the open inspector');
  assert.equal(view.document.activeElement,view.get('workers-toggle'));
  await view.click(view.get('workers-toggle'));
  const trayWorker=()=>view.get('worker-list').querySelector('[data-position="1"]');
  await view.click(trayWorker());await view.refresh();await view.escape();
  assert.equal(view.get('worker-tray').hidden,false);assert.equal(view.document.activeElement,trayWorker());
  assert.equal(view.get('run-title').closest('.run-bar')?.className,'run-bar');
  assert.equal(view.get('stop').closest('#more-panel')?.id,'more-panel');
  assert.equal(view.get('theme').closest('#more-panel')?.id,'more-panel');
  await view.click(view.get('more-toggle'));await view.click(view.get('settings-toggle'));
  assert.equal(view.document.activeElement,view.get('theme'));await view.escape();
  assert.equal(view.get('settings-panel').hidden,true);assert.equal(view.document.activeElement,view.get('settings-toggle'));
  assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('Fit scrolls origin and Active selects actual running evidence including outside the preview',async()=>{
  const view=await monitor({run:{workers:[worker(0),worker(1,'queued')]}});
  view.get('workflow-map').scrollLeft=220;view.get('workflow-map').scrollTop=330;
  await view.click(view.get('fit-map'));
  assert.equal(view.get('workflow-map').scrollLeft,0);assert.equal(view.get('workflow-map').scrollTop,0);
  await view.click(view.get('focus-active'));
  assert.match(view.get('announcement').textContent,/No running worker/);
  const workers=Array.from({length:62},(_,i)=>worker(i,i===61?'running':'completed'));
  view.update({workers});await view.refresh();await view.click(view.get('focus-active'));
  assert.equal(view.get('detail-heading').textContent,'Task 61');
  assert.equal(view.get('worker-tray').hidden,false);
  assert.equal(view.scrolls.at(-1).element.dataset.position,'61');
  view.update({workers:[worker(0,'running',{attempts:1})],lifecycle:{revision:1,workers:[{target:{generation:4,position:0,attempt:1},visibility:'hidden'}]}});await view.refresh();await view.click(view.get('focus-active'));
  assert.equal(view.get('detail-heading').textContent,'Task 0');
  assert.match(view.get('announcement').textContent,/hidden.*inspector/i);assert.equal(Boolean(view.get('show-hidden').checked),false);
});

test('phone map uses readable two-column cards across phases and a closable bottom sheet',async()=>{
  const view=await monitor({phone:true,run:{workers:[worker(0,'completed',{phase:'Discover'}),worker(1,'running',{phase:'Make'}),worker(2,'queued',{phase:'Verify'})]}});
  const cards=[...view.get('workflow-map').querySelectorAll('.map-worker')];
  assert.equal(cards[0].tagName,'BUTTON');
  assert.equal(cards[0].style.width,'164px');
  assert.equal(cards[0].style.top,cards[1].style.top);
  assert.notEqual(cards[0].style.left,cards[1].style.left);
  assert.notEqual(cards[1].style.top,cards[2].style.top);
  assert.equal(view.get('graph-world').style.width,'382px');
  await view.click(cards[1]);await view.click(view.get('close-inspector'));
  assert.equal(view.get('inspector-panel').hidden,true);assert.equal(view.document.activeElement,view.get('workflow-map').querySelector('.map-worker[data-position="1"]'));
  const css=await readFile(new URL('../engine/monitor/style.css',import.meta.url),'utf8');
  assert.match(css,/@media\s*\(max-width:\s*599px\)/);
  assert.match(css,/height:\s*57%/);assert.match(css,/font-size:\s*15px/);assert.match(css,/font-size:\s*23px/);
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

test('native tool inspector shows safe pair identity and terminal coverage under its tool filter',async()=>{
 const observation={tool:'apply_patch',callId:'call_fixture',family:'custom',namespace:'absent',callObserved:true,outputObserved:true,outcome:'reportedRejected',ambiguous:false};
 const coverage={source:'rawResponseItem/completed',capability:'unverified',observed:2,trackedIds:1,retained:1,paired:1,counters:{missingCall:0,missingOutput:0,discarded:0}};
 const view=await monitor({run:{workers:[worker(0,'completed')]},response:path=>path.startsWith('/api/activity?')?{ok:true,json:async()=>({records:[
  {seq:1,at:'2026-10-13T12:00:00Z',attempt:1,type:'nativeTool',status:'reportedRejected',threadId:'thread_fixture',turnId:'turn_fixture',toolObservation:observation},
  {seq:2,at:'2026-10-13T12:00:01Z',attempt:1,type:'turn',status:'completed',toolObservationSummary:coverage},
 ],observed:2,retained:2,dropped:0,nextCursor:2,hasMore:false})}:undefined});
 await view.click(view.get('load-activity'));
 const text=view.get('activity-history').textContent;
 assert.match(text,/Native tool.*rejection reported/i);assert.match(text,/call_fixture/);assert.match(text,/thread_fixture/);assert.match(text,/turn_fixture/);
 assert.match(text,/callObserved/);assert.match(text,/outputObserved/);assert.match(text,/Tool observation coverage/);assert.match(text,/missingOutput/);
 assert.equal(view.get('activity-history').querySelectorAll('.activity-record').length,1,'terminal coverage remains visible even though the turn is filtered');
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
  const result=view.get('detail').querySelector('[data-disclosure="result"]');assert.ok(result,'Raw worker output has deliberate disclosure');
  assert.equal(result.open,false);assert.equal(result.querySelector('summary').textContent,'Worker result');
  assert.match(view.get('detail').querySelector('.worker-summary').textContent,/Newly accepted result/);
  assert.doesNotMatch(view.get('detail').textContent,/Accepted result|No result has been accepted/);
  const steering=view.get('steer-text').closest('details');assert.ok(steering,'Steering is collapsible');
  steering.open=true;result.open=true;
  view.update({workers:[worker(0,'completed',{prompt:payload,result:'Newly accepted result',activity:{summary:'Later activity'}})]});await view.refresh();
  assert.equal(view.get('detail').querySelector('[data-disclosure="result"]').open,true,'Polling retains deliberate disclosure');
  view.update({ generation: 5 });
  await view.refresh();
  assert.doesNotMatch(view.get('run-evidence').textContent, /generation four suffix/, 'Equal bounded previews must not retain expanded evidence from an old generation');
  assert(view.get('run-evidence').querySelector('button'), 'New generation full result requires explicit disclosure');
  await view.click(view.get('run-evidence').querySelector('button'));
  assert(view.calls.some(call => call.path === '/api/result?generation=5'));
  assert.match(view.get('run-evidence').textContent, /generation five suffix/);
  assert.equal(view.get('detail').querySelector('[data-disclosure="result"]').open,false,'New generation does not retain raw-result expansion');
});

test('polling retains keyboard focus within disclosures, prerequisites and message history',async()=>{
  let readFailure=true;
  const view=await monitor({run:{workers:[worker(0,'running',{dependencies:[1]}),worker(1)]},response:path=>path==='/api/run'&&readFailure?{ok:false,status:503,json:async()=>({message:'Temporary snapshot failure'})}:undefined});
  readFailure=false;await view.refresh();
  const summary=()=>view.get('detail').querySelector('[data-disclosure="execution"] summary');
  summary().focus();view.update({workers:[worker(0,'running',{dependencies:[1],activity:{summary:'New command'}}),worker(1)]});await view.refresh();
  assert.equal(view.document.activeElement===summary(),true,'Disclosure focus survives polling');
  const prerequisite=()=>view.get('detail').querySelector('[data-prerequisite="1"]');
  prerequisite().focus();view.update({workers:[worker(0,'running',{dependencies:[1],activity:{summary:'Next command'}}),worker(1)]});await view.refresh();
  assert.equal(view.document.activeElement===prerequisite(),true,'Prerequisite focus survives polling');
  await view.click(view.get('messages-toggle'));
  const dismiss=()=>view.get('message-history').querySelector('button');
  dismiss().focus();await view.refresh();assert.equal(view.document.activeElement===dismiss(),true,'Message focus survives polling');
  await view.click(dismiss());assert.equal(view.document.activeElement,view.get('close-messages'),'Dismissal leaves focus in the message panel');
  assert.equal(view.calls.filter(call=>call.method==='POST').length,0);
});

test('late full worker reads cannot replace a newer attempt in the same generation',async()=>{
  let release;
  const view=await monitor({run:{workers:[worker(0,'completed',{attempts:1,result:'Short',truncations:['result']})]},response:path=>path.startsWith('/api/worker/')?new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>worker(0,'completed',{attempts:1,result:'Old full result'})});}):undefined});
  const pending=view.click([...view.get('detail').querySelectorAll('button')].find(button=>button.textContent==='Load worker details'));await view.flush();
  view.update({workers:[worker(0,'running',{attempts:2,result:undefined})]});await view.refresh();release();await pending;await view.flush();
  assert.equal(view.get('detail-status').textContent,'running');assert.doesNotMatch(view.get('detail').textContent,/Old full result/);
});

test('new run failures remain visible and retained after an earlier read notice',async()=>{
  const view=await monitor({run:{workers:[worker(0,'completed',{truncations:['prompt']})]},response:path=>path.startsWith('/api/worker/')?{ok:false,status:503,json:async()=>({message:'Earlier detail read failed'})}:undefined});
  await view.click([...view.get('detail').querySelectorAll('button')].find(button=>button.textContent==='Load worker details'));
  view.update({status:'failed',error:{code:'NEW_FAILURE',message:'New execution failure'}});await view.tick(2000);
  assert.match(view.get('notice').textContent,/New execution failure/);assert.match(view.get('message-history').textContent,/Earlier detail read failed/);assert.match(view.get('message-history').textContent,/New execution failure/);
});

test('structured worker previews show a concise summary while raw evidence stays available',async()=>{
  const view=await monitor({run:{workers:[worker(0,'completed',{result:JSON.stringify({summary:'Layout ready',checks:['<img src=x>']})})]}});
  assert.equal(view.get('detail').querySelector('.worker-summary').textContent,'Layout ready');
  assert.match(view.get('detail').querySelector('[data-disclosure="result"]').textContent,/checks/);
  view.update({workers:[worker(0,'completed',{result:'{"summary":"Long truncated',truncations:['result']})]});await view.refresh();
  assert.match(view.get('detail').querySelector('.worker-summary').textContent,/Structured result preview/);assert.equal(view.document.querySelectorAll('img').length,0);
});

test('lost control responses are not retried and stale polling disables controls until fresh evidence arrives', async () => {
  let failRead = false;
  let readMessage = 'Snapshot unavailable';
  const view = await monitor({ response: (path, input) => {
    if (input.method === 'POST') throw new Error('Connection lost after request');
    if (failRead && path === '/api/run') throw new Error(readMessage);
  } });
  await view.click(view.get('pause'));
  assert.equal(view.calls.filter(call => call.method === 'POST').length, 1);
  assert.match(view.get('notice').textContent, /not retried/);
  failRead = true; await view.refresh();
  assert.equal(view.get('pause').disabled, true);
  assert.match(view.get('notice').textContent, /last snapshot/);
  await view.click(view.get('dismiss-notice'));await view.refresh();
  assert.equal(view.get('notice').hidden,true,'Unchanged stale polls stay dismissed');
  assert.equal(view.get('pause').disabled,true,'Dismissal cannot arm stale controls');
  assert.match(view.get('message-history').textContent,/Dismissed.*Snapshot unavailable|Snapshot unavailable.*Dismissed/);
  assert.match(view.get('message-history-limit').textContent,/32/);
  readMessage='Distinct fresh read failure';await view.refresh();
  assert.equal(view.get('notice').hidden,false);assert.match(view.get('notice').textContent,/Distinct fresh read failure/);
  await view.click(view.get('dismiss-notice'));failRead=false;await view.refresh();failRead=true;await view.refresh();
  assert.equal(view.get('notice').hidden,true,'A later last-good timestamp does not revive the same dismissed error');
  await view.click(view.get('dismiss-notice'));view.update({generation:5});failRead=false;await view.refresh();
  failRead=true;await view.refresh();assert.equal(view.get('notice').hidden,false,'New generation has a distinct notice identity');
  failRead = false; await view.refresh();
  assert.equal(view.get('pause').disabled, false);
  view.document.hidden = true;
  view.document.dispatchEvent(new view.window.Event('visibilitychange'));
  assert.equal(view.get('pause').disabled, true);
  assert.equal([...view.timers.values()].filter(timer => timer.delay === 2000).length, 0);
  view.window.dispatchEvent(new view.window.Event('pagehide'));
  assert.equal(view.timers.size, 0);
});
