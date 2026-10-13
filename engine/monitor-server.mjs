import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {monitorData} from './monitor-data.mjs';
import {requestControl} from './controls.mjs';
import {startBackground} from './background.mjs';
import {fault,diagnostic} from '../foundation/client.mjs';

const assets=new Map([['/',['index.html','text/html']],['/app.mjs',['app.mjs','text/javascript']],['/style.css',['style.css','text/css']]]);
async function body(request){
  if(request.headers['content-type']!=='application/json')throw fault('HTTP_INPUT','JSON content type is required');
  let size=0;const chunks=[];
  for await(const chunk of request){size+=chunk.length;if(size>40000)throw fault('HTTP_INPUT','Request body exceeded its limit');chunks.push(chunk);}
  try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw fault('HTTP_INPUT','Provide a JSON object');}
}
export async function createMonitor({runDir,start=startBackground,idleMs=30*60*1000}){
  await monitorData(runDir);
  const token=randomBytes(32).toString('base64url');let origin,busy=false,lastActivity=Date.now();
  const send=(response,status,value,type='application/json')=>{response.writeHead(status,{'Content-Type':`${type}; charset=utf-8`});response.end(type==='application/json'?JSON.stringify(value):value);};
  const server=createServer(async(request,response)=>{
    response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    try{
      if(request.headers.host!==new URL(origin).host||request.headers.origin&&request.headers.origin!==origin)return send(response,403,{error:{code:'HTTP_ORIGIN',message:'Local origin required'}});
      const url=new URL(request.url,origin),asset=assets.get(url.pathname);
      if(asset&&request.method==='GET')return send(response,200,await readFile(new URL(`./monitor/${asset[0]}`,import.meta.url),'utf8'),asset[1]);
      const provided=Buffer.from(request.headers.authorization??''),expected=Buffer.from(`Bearer ${token}`);
      if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return send(response,401,{error:{code:'HTTP_AUTH',message:'Open the dashboard URL from agent-workflow dashboard to authenticate.'}});
      lastActivity=Date.now();
      if(request.method==='GET'){
        if(url.pathname==='/api/run')return send(response,200,await monitorData(runDir));
        if(url.pathname==='/api/activity'){
          const integer=(name,fallback)=>{
            const value=url.searchParams.get(name);
            if(value===null&&fallback!==undefined)return fallback;
            if(!/^(0|[1-9][0-9]*)$/.test(value??''))throw fault('HTTP_INPUT','Activity reads require an observed generation, worker and bounded cursor');
            const parsed=Number(value);if(!Number.isSafeInteger(parsed))throw fault('HTTP_INPUT','Activity cursor exceeded its limit');return parsed;
          };
          const generation=integer('generation'),position=integer('position'),after=integer('after',0),limit=integer('limit',50);
          if(generation<1||position>=1000||limit<1||limit>100)throw fault('HTTP_INPUT','Activity paging exceeded its limits');
          return send(response,200,await monitorData(runDir,{kind:'activity',generation,position,after,limit,...(url.searchParams.has('sourceGeneration')?{sourceGeneration:integer('sourceGeneration')}:{})}));
        }
        const match=/^\/api\/(?:worker|patch)\/(0|[1-9][0-9]{0,3})$/.exec(url.pathname);
        const kind=match?(url.pathname.startsWith('/api/patch/')?'patch':'worker'):url.pathname==='/api/script'?'script':url.pathname==='/api/result'?'result':null;
        if(kind){
          const generation=Number(url.searchParams.get('generation'));
          if(!Number.isInteger(generation)||generation<1)throw fault('HTTP_INPUT','Observed generation is required');
          return send(response,200,await monitorData(runDir,{kind,generation,position:match?Number(match[1]):undefined,basis:url.searchParams.get('basis')??'inputs',...(url.searchParams.has('sourceGeneration')?{sourceGeneration:Number(url.searchParams.get('sourceGeneration'))}:{})}),kind==='script'?'text/plain':'application/json');
        }
      }
      if(request.method==='POST'&&['/api/control','/api/resume','/api/restart','/api/close'].includes(url.pathname)){
        const input=await body(request);
        if(url.pathname==='/api/close'){send(response,200,{status:'closed'});setImmediate(()=>close());return;}
        const allowed=url.pathname==='/api/control'?['generation','action','position','attempt','turnId','text']:url.pathname==='/api/restart'?['generation','position','attempt','reconciliation']:['generation','action'];
        if(!Number.isInteger(input.generation)||input.generation<1||Object.keys(input).some(key=>!allowed.includes(key)))throw fault('HTTP_INPUT','Provide the observed generation and supported control fields');
        const state=await monitorData(runDir,{generation:input.generation});
        if(url.pathname==='/api/control')return send(response,202,await requestControl(runDir,{...input,sessionId:state.sessionId}));
        if(busy)throw fault('MONITOR_BUSY','Resume admission is already pending');
        const restart=url.pathname==='/api/restart'?{position:input.position,attempt:input.attempt,reconciliation:input.reconciliation}:undefined;
        if(!restart&&!state.resumable)throw fault('REPLAY_UNKNOWN','Run execution is not verified for resume');
        busy=true;
        try{return send(response,202,await start({runDir,sessionId:state.sessionId,resume:true,expectedGeneration:input.generation,...(restart?{restart}:{})}));}finally{busy=false;}
      }
      return send(response,404,{error:{code:'HTTP_ROUTE',message:'Unknown monitor route'}});
    }catch(error){
      const conflict=['REPLAY_GENERATION','REPLAY_UNKNOWN','CONTROL_GENERATION','CONTROL_TERMINAL','CONTROL_ATTEMPT','CONTROL_TURN','CONTROL_WORKER','CONTROL_BUSY','RUN_LOCKED','MONITOR_BUSY','RESTART_ACTIVE','RESTART_WORKER','RESTART_PREFIX','RESTART_DRAIN','RESTART_CHANGED','AGENT_LIMIT'].includes(error.code);
      send(response,conflict?409:error.code==='MONITOR_MISSING'?404:['HTTP_INPUT','CONTROL_INPUT','ACTIVITY_INPUT','RESTART_INPUT','RESTART_RECONCILE','HISTORY_INPUT','PATCH_INPUT'].includes(error.code)?400:500,{error:diagnostic(error)});
    }
  });
  server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=1000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  const timer=setInterval(()=>{if(!busy&&Date.now()-lastActivity>idleMs)void close();},Math.min(idleMs,30000));timer.unref();
  let closing;
  function close(){clearInterval(timer);return closing??=new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
  return{url:`${origin}/#token=${token}`,close};
}
