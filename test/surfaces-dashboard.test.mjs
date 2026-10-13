/** @lane merge
 * @subject ui/app.js
 * @subject ui/index.html
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

// Execute owned dashboard code against its real HTML and a DOM implementation.
// Fetch/storage/dialog doubles model browser boundaries, not runtime behavior.
async function desk({hash='#token=fixture-token',stored=null,run={},source}={}) {
 const html=await readFile(new URL('../ui/index.html',import.meta.url),'utf8');
 const script=source??await readFile(new URL('../ui/app.js',import.meta.url),'utf8');
 const {document}=parseHTML(html);const calls=[],historyCalls=[],storage=new Map(stored?[['workflow-token',stored]]:[]);
 const record={id:'run-1',status:'failed',cwd:'fixture-project',createdAt:new Date(0).toISOString(),workers:[],approvals:[],...run};
 const get=id=>document.getElementById(id);
 get('composer').showModal=()=>{get('composer').open=true;};get('composer').close=()=>{get('composer').open=false;};
 const context=vm.createContext({document,URLSearchParams,location:{hash,pathname:'/'},history:{replaceState:(...args)=>historyCalls.push(args)},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},localStorage:{getItem:()=>null,setItem:()=>{}},navigator:{clipboard:{writeText:async()=>{}}},confirm:()=>false,setInterval:()=>0,
   fetch:async(route,input)=>{if(hash)assert.equal(historyCalls.length,1,'Token fragment must be removed before the first request');calls.push({route,...input});const value=route==='/api/runs'&&input.method==='GET'?[record]:route.endsWith('/events')?[]:route.startsWith('/api/workflows?')?[]:record;return {ok:true,json:async()=>structuredClone(value)};}});
 vm.runInContext(script,context,{filename:'ui/app.js',timeout:1000});
 const flush=()=>new Promise(resolve=>setImmediate(resolve));await flush();
 return {context,get,document,calls,historyCalls,storage,flush,select:async()=>{await vm.runInContext("selectRun('run-1')",context);},choose:(id,value)=>{const options=Array.from(get(id).children);for(const option of options)option.selected=false;options.find(option=>option.value===value).selected=true;}};
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
 const h=await desk({run:{workers:[{id:'w-1',status:'running',label:'Worker'}]}});await h.select();h.get('trace').querySelector('button').onclick();
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
