import http from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { atomicJson, defaultDataDir, pluginRoot, assertNoSymlink } from './paths.mjs';
import { listWorkflows, resolveWorkflow, saveWorkflow } from './registry.mjs';
import { readModes, setMode } from './mode.mjs';
const MAX_BODY=1048576;
function equalToken(actual,expected){const a=Buffer.from(actual||'');const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
async function body(req){let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>MAX_BODY){const error=new Error('Request exceeds 1 MiB');error.status=413;throw error;}chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{const error=new Error('Invalid JSON body');error.status=400;throw error;} }
export async function startService({manager,dataDir=defaultDataDir(),port=0,token=randomBytes(32).toString('hex')}={}) {
 await assertNoSymlink(dataDir);if(!manager){const [{RuntimeManager},{createCodexBackend}]=await Promise.all([import('./runtime/manager.mjs'),import('./workers/codex.mjs')]);manager=new RuntimeManager({dataDir:path.join(dataDir,'runs'),backend:createCodexBackend(),workflowsDir:path.join(pluginRoot,'workflows'),resolveWorkflow});}
 await manager.ready;
 let url;let closing=false;let closePromise;
 const server=http.createServer(async(req,res)=>{const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(closing?{connection:'close'}:{})});res.end(JSON.stringify(value));};try {
   if(req.headers.host!==new URL(url).host)return json({error:'Invalid host'},403);
   const route=new URL(req.url,url);if(req.headers.origin && req.headers.origin!==url)return json({error:'Origin refused'},403);
   if(closing)return json({error:'Service is shutting down'},503);
   if(route.pathname.startsWith('/api/')){if(!equalToken(req.headers.authorization?.replace(/^Bearer /,''),token))return json({error:'Authentication required'},401);
     if(route.pathname==='/api/health'&&req.method==='GET')return json({ok:true,pid:process.pid,version:'0.1.0'});
     if(route.pathname==='/api/runs'&&req.method==='GET')return json(await manager.list());
     if(route.pathname==='/api/runs'&&req.method==='POST')return json(await manager.start(await body(req)),202);
     if(req.method==='GET'&&/^\/api\/runs\/[^/]+\/script$/.test(route.pathname)){const id=decodeURIComponent(route.pathname.split('/')[3]);const run=await manager.get(id);if(!run)return json({error:'Run not found'},404);if(!run.scriptPath)throw new Error('Editable script path was not recorded');await assertNoSymlink(run.scriptPath);const script=await readFile(run.scriptPath,'utf8');if(Buffer.byteLength(script)>524288)throw new Error('Script exceeds 524288 bytes');return json({script,scriptPath:run.scriptPath});}
     const match=/^\/api\/runs\/([^/]+)(?:\/(events|result|control|approve))?$/.exec(route.pathname);
     if(match){const id=decodeURIComponent(match[1]);const op=match[2];if(req.method==='GET'){if(op==='events'){const since=Number(route.searchParams.get('since')||0);if(!Number.isSafeInteger(since)||since<0)throw Object.assign(new Error('Invalid event cursor'),{status:400});return json(await manager.events(id,since));}const run=await manager.get(id);if(!run)return json({error:'Run not found'},404);if(!op)return json(run);if(op==='result')return json({id,status:run.status,result:run.result,error:run.error,workers:run.workers,usage:run.usage});}if(req.method==='POST'&&op==='control'){const input=await body(req);if(!['pause','stop','resume','cancel-worker','restart-worker','steer'].includes(input.action))throw Object.assign(new Error('Unknown control action'),{status:400});return json(await manager.control(id,input.action,input.options||{}));}if(req.method==='POST'&&op==='approve'){const input=await body(req);return json(await manager.approve(id,input.approvalId,input.decision));}}
     if(route.pathname==='/api/workflows'&&req.method==='GET')return json(await listWorkflows({cwd:route.searchParams.get('cwd')||process.cwd()}));
     if(route.pathname==='/api/workflows'&&req.method==='POST'){const input=await body(req);return json(await saveWorkflow(input.name,input.script,input),201);}
     if(route.pathname==='/api/mode'&&req.method==='GET')return json(await readModes({dataDir}));
     if(route.pathname==='/api/mode'&&req.method==='POST'){const input=await body(req);return json(await setMode(input.value,{...input,dataDir}));}
     if(route.pathname==='/api/shutdown'&&req.method==='POST'){json({closing:true});setImmediate(()=>close().catch(()=>{}));return;}
     return json({error:'Unknown API route'},404);
   }
   if(req.method!=='GET')return json({error:'Method refused'},405);const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};const asset=assets[route.pathname];if(!asset)return json({error:'Not found'},404);const content=await readFile(path.join(pluginRoot,'ui',asset));res.writeHead(200,{'content-type':asset.endsWith('.js')?'text/javascript; charset=utf-8':asset.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",'x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(content);
 }catch(error){json({error:error.message},error.status|| (error.code==='ENOENT'?404:400));}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});url=`http://127.0.0.1:${server.address().port}`;await atomicJson(path.join(dataDir,'service.json'),{url,token,pid:process.pid,version:'0.1.0',startedAt:new Date().toISOString(),pluginRoot});
 function close(){
  if(closePromise)return closePromise;closing=true;
  const httpStopped=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  // Pending control requests can require worker cancellation before they finish.
  // Stop admission/listening first, then drain workers and HTTP responses together.
  const workersStopped=manager.shutdown().finally(()=>server.closeIdleConnections());
  closePromise=(async()=>{const results=await Promise.allSettled([httpStopped,workersStopped]);const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);if(errors.length)throw new AggregateError(errors,'Service shutdown could not complete');try{const current=JSON.parse(await readFile(path.join(dataDir,'service.json'),'utf8'));if(current.token===token)await rm(path.join(dataDir,'service.json'));}catch(error){if(error.code!=='ENOENT')throw error;}})();
  return closePromise;
 }
 return {url,token,server,manager,close};
}
