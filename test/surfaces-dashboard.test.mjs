/** @lane merge
 * @subject ui/app.js
 * @subject ui/index.html
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {URL} from 'node:url';
import { parseHTML } from 'linkedom';

// Execute owned dashboard code against its real HTML and a DOM implementation.
// Fetch/storage/dialog doubles model browser boundaries, not runtime behavior.
async function desk({hash='#token=fixture-token',stored=null,run={},source,truncatedApproval=false,truncatedResult=false,eventError=false,eventTimeline}={}) {
 const html=await readFile(new URL('../ui/index.html',import.meta.url),'utf8');
 const script=source??await readFile(new URL('../ui/app.js',import.meta.url),'utf8');
 const {document}=parseHTML(html);const calls=[],historyCalls=[],storage=new Map(stored?[['workflow-token',stored]]:[]);
 const record={id:'run-1',status:'failed',cwd:'fixture-project',createdAt:new Date(0).toISOString(),workers:[],approvals:[],...run};
 const monitor={...record,eventCount:eventTimeline?.length??3,lastEventSequence:eventTimeline?.at(-1)?.seq??3,result:truncatedResult?{preview:'First result excerpt',truncated:true,characters:5000}:{value:record.result??record.error,truncated:false,characters:20},error:{value:record.error,truncated:false,characters:20},workers:record.workers.map(w=>({id:w.id,label:w.label,phase:w.phase,status:w.status,toolFailures:w.toolFailures,lastToolFailure:w.lastToolFailure,error:{value:w.error,truncated:false,characters:20}})),approvals:record.approvals.map(a=>({id:a.id,status:a.status,request:truncatedApproval?{preview:'Request excerpt',truncated:true,characters:5000}:{value:a.request??a,truncated:false,characters:20}}))};
 const fullEvent={seq:3,type:'worker-event',workerId:'w-1',text:'Retained full event evidence'};
 const get=id=>document.getElementById(id);
 get('composer').showModal=()=>{get('composer').open=true;};get('composer').close=()=>{get('composer').open=false;};
 const context=vm.createContext({document,URLSearchParams,location:{hash,pathname:'/'},history:{replaceState:(...args)=>historyCalls.push(args)},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},localStorage:{getItem:()=>null,setItem:()=>{}},navigator:{clipboard:{writeText:async()=>{}}},confirm:()=>false,setInterval:()=>0,
   fetch:async(route,input)=>{if(hash)assert.equal(historyCalls.length,1,'Token fragment must be removed before the first request');calls.push({route,...input});if(eventError&&route.includes('/events?'))return {ok:false,json:async()=>({error:'Journal unavailable'})};let value=record;if(route.startsWith('/api/runs?')&&input.method==='GET')value=[monitor];else if(route==='/api/runs'&&input.method==='GET')value=[record];else if(route.endsWith('?view=monitor'))value=monitor;else if(route.includes('/workers/'))value={worker:record.workers.find(w=>route.endsWith('/'+w.id)),evidence:{}};else if(route.includes('/events?')){if(eventTimeline){const query=new URL(route,'http://fixture').searchParams,since=Number(query.get('since')||0),limit=Number(query.get('limit')||50),remaining=eventTimeline.filter(e=>e.seq>since),events=remaining.slice(0,limit);value={events,hasMore:remaining.length>limit,nextCursor:events.at(-1)?.seq??since,total:eventTimeline.length};}else value={events:[{seq:3,type:'worker-event',workerId:'w-1',event:{preview:'Event excerpt',truncated:true,characters:5000}}],hasMore:false,nextCursor:3,total:3};}else if(route.endsWith('/events/3'))value=fullEvent;else if(route.endsWith('/events'))value=[];else if(route.startsWith('/api/workflows?'))value=[];return {ok:true,json:async()=>structuredClone(value)};}});
 vm.runInContext(script,context,{filename:'ui/app.js',timeout:1000});
 const flush=()=>new Promise(resolve=>setImmediate(resolve));await flush();
 return {context,get,document,calls,historyCalls,storage,flush,advanceEvents:events=>{eventTimeline=events;monitor.eventCount=events.length;monitor.lastEventSequence=events.at(-1)?.seq??0;},select:async()=>{await vm.runInContext("selectRun('run-1')",context);},choose:(id,value)=>{const options=Array.from(get(id).children);for(const option of options)option.selected=false;options.find(option=>option.value===value).selected=true;}};
}

test('dashboard uses fragment/session credentials and removes the fragment before requests',async()=>{
 const h=await desk();assert.equal(h.storage.get('workflow-token'),'fixture-token');assert.deepEqual(h.historyCalls,[[null,'','/']]);assert.equal(h.calls[0].headers.authorization,'Bearer fixture-token');assert(!h.calls[0].route.includes('fixture-token'));
 const stored=await desk({hash:'',stored:'retained-token'});assert.equal(stored.calls[0].headers.authorization,'Bearer retained-token');
 const missing=await desk({hash:''});assert.equal(missing.calls.length,0);assert.match(missing.get('error').textContent,/authenticate/);
});

test('dashboard renders untrusted evidence as text and sends the explicit approval decision',async()=>{
 const payload='<img src=x onerror=alert(1)>';
 const h=await desk({run:{meta:{name:payload},error:payload,coverage:{completed:0,requested:1,cached:0,failed:0,unverified:1},workers:[{id:'w-1',status:'unknown',label:payload,prompt:payload,error:payload}],approvals:[{id:'approval-1',status:'pending',command:payload}]}});await h.select();
 assert.equal(h.get('run-name').textContent,payload);assert.equal(h.get('result').textContent,payload);assert.match(h.get('coverage').textContent,/1 unverified/);assert.match(h.get('trace').textContent,/unknown/);assert.equal(h.get('run-view').querySelectorAll('img,script').length,0);
 const deny=Array.from(h.get('approvals').querySelectorAll('button')).find(button=>button.textContent==='Deny');await deny.onclick();
 const request=h.calls.find(call=>call.route.endsWith('/approve'));assert.deepEqual(JSON.parse(request.body),{approvalId:'approval-1',decision:'decline'});
});

test('worker controls retain the selected worker and require confirmation before restart',async()=>{
 const h=await desk({run:{workers:[{id:'w-1',status:'running',label:'Worker'}]}});await h.select();await h.get('trace').querySelector('button').onclick();
 await h.get('cancel-worker').onclick();h.get('steer-text').value='  new direction  ';await h.get('steer-worker').onclick();
 h.get('restart-worker').onclick();await h.flush();assert.equal(h.calls.filter(call=>call.method==='POST').length,2);
 h.context.confirm=()=>true;h.get('restart-worker').onclick();await h.flush();
 assert.deepEqual(h.calls.filter(call=>call.method==='POST').map(call=>JSON.parse(call.body)),[{action:'cancel-worker',options:{workerId:'w-1'}},{action:'steer',options:{workerId:'w-1',text:'new direction'}},{action:'restart-worker',options:{workerId:'w-1'}}]);
});

test('composer sends explicit permissions, arguments and limits to run admission',async()=>{
 const h=await desk();await h.get('new-run').onclick();h.get('cwd').value='owned-project';h.get('script').value='owned script';h.get('args').value='{"items":["a"]}';h.get('concurrency').value='2';h.get('budget').value='12';h.get('network').checked=false;h.choose('sandbox','read-only');h.choose('approval-policy','never');
 await h.get('start-form').onsubmit({preventDefault(){}});const request=h.calls.find(call=>call.method==='POST');assert(request,h.get('error').textContent);
 assert.deepEqual(JSON.parse(request.body),{cwd:'owned-project',args:{items:['a']},concurrency:2,permissions:{sandbox:'read-only',approvalPolicy:'never',networkAccess:false},budget:12,script:'owned script'});assert.equal(h.get('composer').open,false);
 await h.get('new-run').onclick();h.get('cwd').value='owned-project';h.get('script').value='writer script';h.get('network').checked=true;h.choose('sandbox','workspace-write');h.choose('approval-policy','on-request');await h.get('start-form').onsubmit({preventDefault(){}});
 const changed=JSON.parse(h.calls.filter(call=>call.method==='POST').at(-1).body);assert.deepEqual(changed.permissions,{sandbox:'workspace-write',approvalPolicy:'on-request',networkAccess:true});assert.equal(changed.script,'writer script');
});

test('resume sends the edited script to the existing run instead of admitting another run',async()=>{
 const h=await desk({run:{script:'old script'}});await h.select();await h.get('edit-resume').onclick();h.get('script').value='edited script';await h.get('start-form').onsubmit({preventDefault(){}});
 const posts=h.calls.filter(call=>call.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].route,'/api/runs/run-1/control');assert.deepEqual(JSON.parse(posts[0].body),{action:'resume',options:{script:'edited script'}});
});

test('routine monitor refresh stays bounded and worker detail loads only after selection',async()=>{
 const h=await desk({run:{workers:[{id:'w-1',status:'unknown',label:'Capture',prompt:'Retained prompt'}]}});await h.select();
 assert(h.calls.some(call=>call.route==='/api/runs?view=summary'));
 assert(h.calls.some(call=>call.route==='/api/runs/run-1?view=monitor'));
 assert(!h.calls.some(call=>/\/events|\/workers\//.test(call.route)),'Routine polling must not pull full journals or worker bodies');
 await h.get('trace').querySelector('button').onclick();assert(h.calls.some(call=>call.route==='/api/runs/run-1/workers/w-1'));assert.match(h.get('detail').textContent,/Retained prompt/);
});

test('journal uses compact pages and full event loads only on deliberate disclosure',async()=>{
 const h=await desk();await h.select();const journal=h.get('event-journal');assert.equal(typeof journal.ontoggle,'function');journal.open=true;await journal.ontoggle();
 assert(h.calls.some(call=>call.route.includes('/events?')&&call.route.includes('view=compact')));assert(!h.calls.some(call=>call.route.endsWith('/events/3')));
 const row=h.get('events').querySelector('details');row.open=true;await row.ontoggle();assert(h.calls.some(call=>call.route.endsWith('/events/3')));assert.match(h.get('events').textContent,/Retained full event evidence/);
});

test('truncated approvals require deliberate full request inspection before acceptance',async()=>{
 const h=await desk({truncatedApproval:true,run:{approvals:[{id:'approval-1',status:'pending',request:{command:'Full command'}}]}});await h.select();
 const approve=()=>Array.from(h.get('approvals').querySelectorAll('button')).find(button=>button.textContent==='Approve');assert.equal(approve().disabled,true);
 const load=Array.from(h.get('approvals').querySelectorAll('button')).find(button=>/full request/i.test(button.textContent));assert(load,'Truncation needs an explicit full-request action');await load.onclick();assert.equal(approve().disabled,false);assert.match(h.get('approvals').textContent,/Full command/);
});

test('full result is deliberate, retained and timestamped while routine polling stays bounded',async()=>{
 const h=await desk({truncatedResult:true,run:{status:'completed',result:'Full retained result evidence'}});await h.select();assert.match(h.get('result').textContent,/First result excerpt/);assert(!h.calls.some(call=>call.route.endsWith('/result')));
 await h.get('load-full-result').onclick();assert.match(h.get('result').textContent,/Full retained result evidence/);await vm.runInContext('refresh()',h.context);assert.equal(h.calls.filter(call=>call.route.endsWith('/result')).length,1);
 assert.match(h.get('result-note').textContent,/observed|loaded/i,'Full evidence needs an observation timestamp');
});

test('opened full run evidence is retained across polls until explicitly refreshed',async()=>{
 const h=await desk();await h.select();const disclose=async()=>{const row=Array.from(h.get('detail').querySelectorAll('details')).find(d=>/Full run record/i.test(d.querySelector('summary').textContent));assert(row);row.open=true;row.setAttribute('open','');await row.ontoggle();};await disclose();await vm.runInContext('refresh()',h.context);await disclose();await vm.runInContext('refresh()',h.context);await disclose();
 assert.equal(h.calls.filter(call=>call.route==='/api/runs/run-1').length,1,'Open disclosure must not download the full run on each poll');
});

test('journal failures remain visible through successful status polling',async()=>{
 const h=await desk({eventError:true});await h.select();const journal=h.get('event-journal');journal.open=true;await journal.ontoggle();await vm.runInContext('refresh()',h.context);assert.match(h.get('error').textContent,/Journal unavailable/);assert.equal(h.get('error').hidden,false);
});

test('resume shows immutable run permissions and disables settings that cannot take effect',async()=>{
 const h=await desk({run:{script:'old script',concurrency:2,budget:12,permissions:{sandbox:'workspace-write',approvalPolicy:'on-request',networkAccess:true}}});await h.select();await h.get('edit-resume').onclick();
 for(const id of ['cwd','args','concurrency','budget','sandbox','approval-policy','network','saved'])assert.equal(h.get(id).disabled,true,id+' must not imply resume changes this setting');
 assert.equal(h.get('concurrency').value,'2');assert.equal(h.get('budget').value,'12');assert.equal(h.get('sandbox').value,'workspace-write');assert.equal(h.get('approval-policy').value,'on-request');assert.equal(h.get('network').checked,true);assert.equal(h.get('script').disabled,false);
 await h.get('close-composer').onclick();await h.get('new-run').onclick();for(const id of ['cwd','args','concurrency','budget','sandbox','approval-policy','network','saved'])assert.equal(h.get(id).disabled,false,id+' must be editable for a new run');
});

test('recovered tool failures remain visible beside the actual running worker status',async()=>{
 const h=await desk({run:{status:'running',workers:[{id:'w-1',status:'running',label:'Capture',toolFailures:4,lastToolFailure:{type:'commandExecution',sequence:8,message:{value:'Windows shell setup refresh had errors',truncated:false,characters:44}}}]}});await h.select();
 assert.match(h.get('trace').textContent,/4 tool calls failed/);assert.match(h.get('trace').querySelector('.badge').textContent,/running/);
 await h.get('trace').querySelector('button').onclick();assert.match(h.get('detail').textContent,/Windows shell setup refresh had errors/);assert.match(h.get('detail').textContent,/running/);
});

test('journal can page every retained event after more than one page arrives between polls',async()=>{
 const timeline=count=>Array.from({length:count},(_,i)=>({seq:i+1,type:'observed',event:{value:{seq:i+1},truncated:false,characters:10}}));
 const h=await desk({eventTimeline:timeline(100)});await h.select();h.get('event-journal').open=true;await h.get('event-journal').ontoggle();h.advanceEvents(timeline(250));await vm.runInContext('refresh()',h.context);
 for(let tries=0;tries<10&&!h.get('more-events').hidden;tries++)await h.get('more-events').onclick();
 const seen=Array.from(h.get('events').querySelectorAll('details')).map(d=>Number(d.dataset.event));assert.deepEqual(seen,Array.from({length:250},(_,i)=>i+1),'No retained range may become inaccessible after a live journal jump');
 assert(h.calls.filter(c=>c.route.includes('/events?')).every(c=>new URL(c.route,'http://fixture').searchParams.get('limit')==='50'),'Every page stays bounded');
});
