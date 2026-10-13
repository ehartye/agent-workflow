// Explicit rendered acceptance: requires a caller-selected installed Playwright
// module and authenticated local monitor URL. No lifecycle/execution mutations.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const url=new URL(process.env.AGENT_WORKFLOW_MONITOR_URL??'');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const output=resolve(process.env.AGENT_WORKFLOW_BROWSER_REPORT??'reports/monitor-session-browser');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});const errors=[],observations=[];
try{
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url.href);await page.locator('#connection').filter({hasText:'run snapshot fresh'}).waitFor({timeout:20000});
 assert.equal(new URL(page.url()).hash,'');
 const original=await page.locator('#run-title').innerText();assert.match(original,/Workflow|Tidepool/i);
 for(const [width,height,label]of [[1440,900,'desktop'],[1024,768,'compact'],[390,844,'phone'],[720,450,'200-percent-equivalent']]){
  await page.setViewportSize({width,height});
  for(const theme of ['light','dark']){
   await page.locator('#settings-toggle').click();await page.locator('#theme').selectOption(theme);await page.keyboard.press('Escape');
   const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,brand:document.querySelector('.brand-mark').getBoundingClientRect().toJSON(),header:getComputedStyle(document.querySelector('.masthead')).backgroundColor,close:document.querySelector('#close-monitor').getBoundingClientRect().toJSON(),workers:document.querySelectorAll('.worker').length}));
   assert.ok(layout.scrollWidth<=width+1,`${label}/${theme} leaks horizontal page overflow: ${layout.scrollWidth}`);
   assert.ok(layout.brand.x>=0&&layout.brand.y>=0&&layout.brand.width>=24);assert.ok(layout.close.x>=0&&layout.close.right<=width+1);
   await page.screenshot({path:join(output,`${label}-${theme}.png`),fullPage:true});observations.push({label,theme,width,height,...layout});
  }
 }
 const connections=await page.evaluate(()=>[...document.querySelectorAll('.map-membership')].map(path=>{
  const phase=path.getAttribute('data-phase'),anchor=[...document.querySelectorAll('.map-phase-anchor')].find(node=>node.getAttribute('data-phase')===phase),card=document.querySelector(`.map-worker[data-position="${path.getAttribute('data-position')}"] rect`),start=path.getPointAtLength(0),end=path.getPointAtLength(path.getTotalLength());
  return{start:{x:start.x,y:start.y},anchor:{x:Number(anchor.getAttribute('cx')),y:Number(anchor.getAttribute('cy'))},end:{x:end.x,y:end.y},cardX:Number(card.getAttribute('x'))};
 }));
 assert.ok(connections.length);for(const connection of connections){assert.deepEqual(connection.start,connection.anchor);assert.equal(connection.end.x,connection.cardX);}
 await page.setViewportSize({width:1440,height:900});
 const choices=await page.locator('#run-picker option').evaluateAll(nodes=>nodes.map(node=>({value:node.value,text:node.textContent})));assert.ok(choices.length>=2);
 const current=await page.locator('#run-picker').inputValue(),other=choices.find(item=>item.value!==current);await page.locator('#run-picker').selectOption(other.value);
 await page.waitForFunction(value=>document.querySelector('#run-permalink').getAttribute('href').includes(value),other.value);
 assert.equal(await page.locator('#stop').isDisabled(),true);
 await page.locator('#run-picker').selectOption(current);await page.waitForFunction(value=>document.querySelector('#run-permalink').getAttribute('href').includes(value),current);
 await page.locator('.map-worker').first().focus();await page.keyboard.press('Enter');assert.ok(await page.locator('#detail-heading').innerText());
 assert.deepEqual(errors,[]);
 const report={at:new Date().toISOString(),origin:url.origin,originalTitle:original,observations,connections:connections.length,sessionChoices:choices.length,pageErrors:errors,controlsMutated:false,pruned:false,zoomEvidence:'720×450 CSS viewport models 200% browser zoom from 1440×900; not an OS/browser zoom control claim'};
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,report:join(output,'report.json'),viewports:observations.length,connections:connections.length,sessionChoices:choices.length}));
}finally{await browser.close();}
