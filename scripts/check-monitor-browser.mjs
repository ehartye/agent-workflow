// Explicit rendered acceptance: caller-selected Playwright and authenticated
// loopback monitor. GET-only; no execution/lifecycle writes are ever submitted.
// Optional AGENT_WORKFLOW_BROWSER_REQUIRE_ADDITION / _DEADLINE=1 require fields.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const url=new URL(process.env.AGENT_WORKFLOW_MONITOR_URL??'');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const output=resolve(process.env.AGENT_WORKFLOW_BROWSER_REPORT??'reports/monitor-session-browser');await mkdir(output,{recursive:true});
const required=name=>process.env[`AGENT_WORKFLOW_BROWSER_REQUIRE_${name}`]==='1';
const browser=await chromium.launch({headless:true}),errors=[],observations=[],blocked=[],reads=new Set(),assets={};
const report={at:new Date().toISOString(),passed:false,observations,sourceSha256:assets,pageErrors:errors,blockedRequests:blocked,controlsMutated:false,pruned:false,fixture:process.env.AGENT_WORKFLOW_BROWSER_FIXTURE_LABEL??null,limitations:['GET-only presentation verification, not new native execution or task acceptance.','Phone viewports are emulated; 720×450 CSS viewport models zoom-equivalent layout, not an actual browser zoom control.']};
let latest;
const safeError=error=>String(error?.message??error).replaceAll(url.href,'[authenticated monitor]').replace(/https?:\/\/[^\s"'<>]+/g,'[URL]').slice(0,2000);
try{
 const page=await browser.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(safeError(error)));
 await page.route('**/*',route=>{const request=route.request(),target=new URL(request.url());if(request.method()!=='GET'||target.origin!==url.origin&&target.protocol!=='data:'){blocked.push({method:request.method(),path:target.pathname});return route.abort();}return route.continue();});
 page.on('response',response=>{
  const target=new URL(response.url());if(target.origin!==url.origin||response.status()!==200)return;
  const isRun=/^\/api\/(?:runs\/[^/]+\/)?run$/.test(target.pathname),asset=target.pathname.match(/\/(app\.mjs|style\.css)$/)?.[1];
  if(!isRun&&!asset&&response.request().resourceType()!=='document')return;
  const task=(async()=>{if(isRun){latest=await response.json();return;}assets[asset??'index.html']=createHash('sha256').update(await response.body()).digest('hex');})().catch(error=>errors.push(safeError(error))).finally(()=>reads.delete(task));reads.add(task);
 });
 const fresh=()=>page.waitForFunction(()=>document.querySelector('#connection')?.textContent.includes('run snapshot fresh'),null,{timeout:20000});
 const openMenu=async()=>{if(!await page.locator('#more-panel').isVisible())await page.locator('#more-toggle').click();};
 const closeMenu=async()=>{if(await page.locator('#more-panel').isVisible())await page.locator('#more-toggle').click();};
 const openPicker=async()=>{await closeMenu();await page.locator('#run-picker').click();await page.locator('#run-popover').waitFor();assert.equal(await page.locator('#run-popover').getAttribute('role'),'dialog');assert.equal(await page.locator('#run-popover').getAttribute('aria-modal'),'true');assert.equal(await page.evaluate(()=>document.activeElement?.id),'run-search');};
 await page.goto(url.href);await fresh();await Promise.all([...reads]);
 assert.equal(new URL(page.url()).hash,'');assert.ok(latest?.monitor?.run?.runId,'Authenticated run identity required');
 const originalRun=latest.monitor.run.runId;report.originalTitle=await page.locator('#run-picker-title').innerText();assert.ok(report.originalTitle.trim());await page.locator('.map-worker').first().waitFor();
 for(const [width,height,label]of [[1440,900,'desktop'],[1024,768,'compact'],[390,844,'phone'],[720,450,'200-percent-equivalent']]){
  await page.setViewportSize({width,height});
  for(const theme of ['light','dark']){
   await openMenu();if(!await page.locator('#settings-panel').isVisible())await page.locator('#settings-toggle').click();await page.locator('#theme').selectOption(theme);await page.locator('#close-monitor').scrollIntoViewIfNeeded();
   const close=await page.locator('#close-monitor').boundingBox();assert.ok(close&&close.width>0&&close.x>=0&&close.x+close.width<=width+1,'Close remains reachable inside Run menu');await closeMenu();await page.evaluate(()=>document.fonts.ready);
   const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,brand:document.querySelector('.brand-mark').getBoundingClientRect().toJSON(),header:getComputedStyle(document.querySelector('.run-bar')).backgroundColor,workers:document.querySelectorAll('.map-worker').length}));
   report.pendingLayout={label,theme,...layout};
   assert.ok(layout.scrollWidth<=width+1,`${label}/${theme} horizontal page overflow: ${layout.scrollWidth}`);
   // The current decorative, aria-hidden phone mark is 20px; it is not a hit target.
   assert.ok(layout.brand.x>=0&&layout.brand.y>=0&&layout.brand.width>=20&&layout.brand.right<=width);assert.ok(layout.workers>0);
   await page.screenshot({path:join(output,`${label}-${theme}.png`),fullPage:true});await openPicker();
   const dialog=await page.locator('#run-popover').boundingBox(),cancel=await page.locator('#close-run-picker').boundingBox();
   assert.ok(dialog&&dialog.x>=0&&dialog.x+dialog.width<=width+1&&dialog.y>=0&&dialog.y+dialog.height<=height+1,`${label}/${theme} picker exceeds viewport`);
   assert.ok(cancel&&cancel.x>=0&&cancel.y>=0&&cancel.x+cancel.width<=width+1&&cancel.y+cancel.height<=height+1,'Picker cancel is reachable');
   await page.screenshot({path:join(output,`${label}-${theme}-picker.png`),fullPage:true});await page.keyboard.press('Escape');assert.equal(await page.locator('#run-popover').isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement?.id),'run-picker');
   observations.push({label,theme,width,height,...layout,close,dialog,cancel});delete report.pendingLayout;
  }
 }
 const connections=await page.evaluate(()=>[...document.querySelectorAll('.map-membership')].map(path=>{
  const anchor=[...document.querySelectorAll('.map-phase-anchor')].find(node=>node.dataset.phase===path.dataset.phase),card=document.querySelector(`.map-worker[data-position="${path.dataset.position}"]`),start=path.getPointAtLength(0),end=path.getPointAtLength(path.getTotalLength());
  return{start:{x:start.x,y:start.y},anchor:anchor?{x:Number(anchor.getAttribute('cx')),y:Number(anchor.getAttribute('cy'))}:null,end:{x:end.x,y:end.y},card:card?{x:card.offsetLeft,y:card.offsetTop}:null};
 }));
 assert.ok(connections.length);for(const connection of connections){assert.deepEqual(connection.start,connection.anchor);assert.ok(connection.card);assert.equal(connection.end.x,connection.card.x);assert.equal(connection.end.y,connection.card.y+30);}report.connections=connections.length;
 const dependencies=await page.evaluate(()=>[...document.querySelectorAll('.map-dependency')].map(path=>{
  const from=document.querySelector(`.map-worker[data-position="${path.dataset.from}"]`),to=document.querySelector(`.map-worker[data-position="${path.dataset.to}"]`),start=path.getPointAtLength(0),end=path.getPointAtLength(path.getTotalLength());
  return{from:from?{x:from.offsetLeft,y:from.offsetTop,width:from.offsetWidth}:null,to:to?{x:to.offsetLeft,y:to.offsetTop,width:to.offsetWidth}:null,start:{x:start.x,y:start.y},end:{x:end.x,y:end.y},arrow:path.getAttribute('marker-end')};
 }));
 for(const edge of dependencies){assert.ok(edge.from&&edge.to);assert.equal(edge.start.y,edge.from.y+49);assert.equal(edge.end.y,edge.to.y+49);assert.ok([edge.from.x,edge.from.x+edge.from.width].includes(edge.start.x));assert.ok([edge.to.x-4,edge.to.x+edge.to.width+4].includes(edge.end.x));assert.equal(edge.arrow,'url(#dependency-arrow)');}
 report.dependencyConnections={observed:dependencies.length,coverage:dependencies.length?'visible-recorded-edges':'none-in-displayed-run'};
 await page.setViewportSize({width:1440,height:900});await openPicker();
 const choices=await page.locator('#run-options > button').evaluateAll(nodes=>nodes.map(node=>({value:node.dataset.runId,current:node.getAttribute('aria-current')==='true',label:node.getAttribute('aria-label')})));assert.ok(choices.length>=1);assert.ok(choices.every(choice=>choice.value&&choice.label));
 const current=choices.find(item=>item.current);assert.equal(current?.value,originalRun);report.sessionChoices=choices.length;
 const other=choices.find(item=>item.value!==current.value),select=async id=>{
  await page.locator('#run-options > button').evaluateAll((nodes,value)=>{const row=nodes.find(node=>node.dataset.runId===value);if(!row)throw Error('Requested run row missing');row.focus();},id);
  await page.keyboard.press('Enter');await page.locator('#run-popover').waitFor({state:'hidden'});await page.waitForFunction(id=>document.querySelector('#run-permalink').getAttribute('href')===`/runs/${encodeURIComponent(id)}`,id);await fresh();
 };
 if(other){await select(other.value);await openMenu();assert.ok((await page.locator('#control-target').innerText()).includes(other.value),'Deliberate choice selects the current control identity without another arm step');await closeMenu();await openPicker();await select(current.value);report.navigation={changedRun:true,returnedToOriginal:true,selection:'deliberate-row-immediate',controlsSubmitted:false};}
 else{await select(current.value);report.navigation={changedRun:false,currentRowSelected:true,selection:'deliberate-row-immediate',reason:'Only one choice in the loaded session pages',controlsSubmitted:false};}
 await Promise.all([...reads]);const card=page.locator('.map-worker').first();assert.equal(await card.evaluate(node=>node.tagName),'BUTTON');assert.ok(await card.getAttribute('aria-label'));await card.focus();await page.keyboard.press('Enter');assert.equal(await card.getAttribute('aria-pressed'),'true');assert.ok(await page.locator('#detail-heading').innerText());report.keyboardInspector=true;
 const featureFacts={addition:{required:required('ADDITION'),observed:0},deadline:{required:required('DEADLINE'),observed:0}};
 for(const worker of (latest?.workers??[]).filter(worker=>worker.origin?.kind==='append'||worker.deadline).slice(0,60)){
  const target=page.locator(`.map-worker[data-position="${worker.position}"]`);if(!await target.count())continue;await target.focus();await page.keyboard.press('Enter');
  if(worker.origin?.kind==='append'){assert.ok((await target.getAttribute('aria-label')).includes('added during run'));assert.ok((await page.locator('#detail .worker-origin').innerText()).includes(`task ${worker.origin.taskId}`));featureFacts.addition.observed++;}
  if(worker.deadline){const expected=worker.deadline.status==='expired'?'Worker deadline expired':worker.deadline.status==='closed'?'Worker deadline controls closed':worker.deadline.status==='active'&&worker.deadline.remainingMs===null&&worker.deadline.expiresAt===null?'No worker deadline':worker.deadline.status==='active'&&Number.isFinite(worker.deadline.expiresAt)?'Worker deadline at':'Worker deadline evidence unavailable';assert.ok((await page.locator('#detail .worker-deadline').innerText()).includes(expected));featureFacts.deadline.observed++;}
 }
 for(const [name,fact]of Object.entries(featureFacts))if(fact.required)assert.ok(fact.observed>0,`Required ${name} evidence was not supplied/displayed`);
 report.optionalWorkerEvidence=featureFacts;await Promise.all([...reads]);assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);report.passed=true;
}catch(error){report.error=safeError(error);throw new Error(report.error);}
finally{await Promise.all([...reads]);await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({passed:true,report:join(output,'report.json'),viewports:observations.length,connections:report.connections,sessionChoices:report.sessionChoices,optionalWorkerEvidence:report.optionalWorkerEvidence}));
