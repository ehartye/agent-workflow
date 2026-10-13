import {lstat,open} from 'node:fs/promises';
import {join} from 'node:path';
import {fault} from '../../foundation/client.mjs';
import {monitorData} from '../monitor-data.mjs';

const id=/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const unavailable=message=>fault('MONITOR_UNAVAILABLE',message);
const sameRef=(a,b)=>a?.dataInstanceId===b?.dataInstanceId&&a?.runId===b?.runId&&a?.runtimeId===b?.runtimeId;
export function validateMonitorBinding(binding){
  if(binding===null)return null;
  const keys=['version','scope','dataInstanceId','originatingSessionId','pinnedRunId','runtimeId'];
  if(!binding||typeof binding!=='object'||Array.isArray(binding)||Object.keys(binding).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(binding,key))||binding.version!==1||!['run','session'].includes(binding.scope)||['dataInstanceId','pinnedRunId','runtimeId'].some(key=>typeof binding[key]!=='string'||!id.test(binding[key]))||typeof binding.originatingSessionId!=='string'||!binding.originatingSessionId||binding.originatingSessionId.length>256)throw fault('HTTP_INPUT','Invalid coordinator monitor binding');
  return JSON.parse(JSON.stringify(binding));
}
async function assertBinding(runDir,binding,state){
  if(!binding)return;
  const path=join(runDir,'runtime.json'),info=await lstat(path);
  if(!info.isFile()||info.isSymbolicLink()||info.size>65536)throw fault('MONITOR_OWNERSHIP','Run ownership record is unavailable or unsafe');
  const file=await open(path,'r');let owner;
  try{const bytes=Buffer.alloc(65537),read=await file.read(bytes,0,bytes.length,0);if(read.bytesRead>65536)throw fault('MONITOR_OWNERSHIP','Run ownership record exceeds its limit');owner=JSON.parse(bytes.subarray(0,read.bytesRead).toString('utf8'));}finally{await file.close();}
  if(owner.schema!==2||owner.id!==binding.pinnedRunId||owner.runtime?.id!==binding.runtimeId||owner.sessionId!==binding.originatingSessionId||state.sessionId!==binding.originatingSessionId)throw fault('MONITOR_OWNERSHIP','Monitor binding differs from retained run/session/runtime ownership');
}
function integer(url,name,fallback){
  const value=url.searchParams.get(name);if(value===null&&fallback!==undefined)return fallback;
  if(!/^(0|[1-9][0-9]*)$/.test(value??''))throw fault('HTTP_INPUT','Provide an observed generation and bounded cursor');
  const parsed=Number(value);if(!Number.isSafeInteger(parsed))throw fault('HTTP_INPUT','Cursor exceeded its limit');return parsed;
}
function readOptions(path,url){
  if(path==='/run')return{};
  if(!['/activity','/script','/result'].includes(path)&&!/^\/(worker|patch|exclusions)\/(0|[1-9][0-9]{0,2})$/.test(path))return null;
  const generation=integer(url,'generation');if(generation<1)throw fault('HTTP_INPUT','Observed generation is required');
  const history=url.searchParams.has('sourceGeneration')?{sourceGeneration:integer(url,'sourceGeneration')}:{};
  if(history.sourceGeneration!==undefined&&history.sourceGeneration<1)throw fault('HTTP_INPUT','Invalid historical source generation');
  if(path==='/activity'){
    const position=integer(url,'position'),after=integer(url,'after',0),limit=integer(url,'limit',50);
    if(position>=1000||limit<1||limit>100)throw fault('HTTP_INPUT','Activity paging exceeded its limits');return{kind:'activity',generation,position,after,limit,...history};
  }
  const match=/^\/(worker|patch|exclusions)\/([0-9]+)$/.exec(path),kind=match?.[1]??path.slice(1),basis=url.searchParams.get('basis')??'inputs';
  if(kind==='exclusions'){
    const stage=url.searchParams.get('stage')??'outputs',after=integer(url,'after',0),limit=integer(url,'limit',50);
    if(!['inputs','outputs'].includes(stage)||limit<1||limit>100)throw fault('HTTP_INPUT','Invalid bounded exclusion inventory page');
    return{kind,generation,position:Number(match[2]),stage,after,limit,...history};
  }
  if(kind==='patch'&&!['inputs','base'].includes(basis))throw fault('HTTP_INPUT','Invalid patch comparison');
  return{kind,generation,...(match?{position:Number(match[2])}:{}),basis,...history};
}

// The coordinator supplies these adapters after verifying originating session,
// data root and retained runtimes. No browser/IPC-selected adapter is loaded.
export async function createExperienceSurface({runDir,binding,services}){
  const initial=await monitorData(runDir);await assertBinding(runDir,binding,initial);
  const pinned=binding?{dataInstanceId:binding.dataInstanceId,runId:binding.pinnedRunId,runtimeId:binding.runtimeId}:null;
  const has=name=>Boolean(binding&&typeof services?.[name]==='function');
  const capabilities={sessionNavigation:binding?.scope==='session'&&has('listSessionRuns')&&has('readRun'),lifecycle:has('lifecycle')&&has('readRun'),lifecycleReceipt:has('readLifecycleReceipt'),scopedControls:has('controlRun')};
  let busy=false;
  function decorate(state,ref){return{...state,monitor:{run:ref,scope:binding?.scope??'run',pinnedRunId:binding?.pinnedRunId??null,capabilities,sessionUrl:capabilities.sessionNavigation?'/session':null}};}
  async function read(runId,options={}){
    const local=runId===null||runId===binding?.pinnedRunId;
    if(!local&&!capabilities.sessionNavigation)throw unavailable('Originating-session navigation adapter is unavailable.');
    if(local){const state=await monitorData(runDir,{...options,runRef:pinned});if(!options.kind)await assertBinding(runDir,binding,state);
      if(!has('readRun'))return!options.kind?decorate(state,pinned):state;
    }
    const targetId=local?binding.pinnedRunId:runId;
    const state=await services.readRun({runId:targetId,...options,kind:options.kind??'summary'});
    if(options.kind)return state;
    const ref=state?.experience?.run;
    if(state?.sessionId!==binding.originatingSessionId||ref?.runId!==targetId||ref?.dataInstanceId!==binding.dataInstanceId||!id.test(ref?.runtimeId??'')||local&&!sameRef(ref,pinned))throw fault('MONITOR_OWNERSHIP','Session adapter returned a different session/run/runtime');
    return decorate(state,ref);
  }
  async function observed(runId,input,target){
    const state=await read(runId);
    if(state.generation!==input.generation)throw fault('REPLAY_GENERATION','Run generation changed; refresh before continuing');
    const keys=['dataInstanceId','runId','runtimeId','generation','position','attempt','turnId'];
    if(!target||typeof target!=='object'||Array.isArray(target)||Object.keys(target).some(key=>!keys.includes(key))||!sameRef(target,state.monitor.run)||target.generation!==state.generation)throw fault('MONITOR_TARGET','Select the exact current run/runtime/generation for control');
    return state;
  }
  async function route({url,method,body}){
    const result=(value,status=200,type='application/json')=>({value,status,type});
    if(method==='GET'&&url.pathname==='/api/session/runs'){
      if(!capabilities.sessionNavigation)throw unavailable('Originating-session navigation adapter is unavailable.');
      const limit=integer(url,'limit',25),cursor=url.searchParams.get('cursor'),hidden=url.searchParams.get('includeHidden')??'false';
      if(limit<1||limit>100||cursor!==null&&cursor.length>1000||!['true','false'].includes(hidden))throw fault('HTTP_INPUT','Invalid session paging');
      const page=await services.listSessionRuns({cursor,limit,includeHidden:hidden==='true'});
      if(!page||!Array.isArray(page.items)||page.items.length>limit||page.nextCursor!==null&&(typeof page.nextCursor!=='string'||page.nextCursor.length>1000))throw unavailable('Session adapter returned invalid paging evidence.');
      const counts={};
      for(const key of ['hiddenCount','archivedCount','unknownCount','totalCount']){
        const value=page[key];if(value!==undefined&&value!==null&&(!Number.isSafeInteger(value)||value<0||value>1000000))throw unavailable('Session adapter returned invalid visibility counts.');counts[key]=value??null;
      }
      return result({items:page.items.map(item=>{
        if(item.ref?.dataInstanceId!==binding.dataInstanceId||!id.test(item.ref?.runId??'')||!id.test(item.ref?.runtimeId??''))throw fault('MONITOR_OWNERSHIP','Invalid retained navigation identity');
        return{ref:item.ref,title:String(item.title??item.ref.runId).slice(0,500),createdAt:item.createdAt,executionStatus:item.executionStatus,disposition:item.disposition,runUrl:`/runs/${encodeURIComponent(item.ref.runId)}`};
      }),nextCursor:page.nextCursor,...counts});
    }
    const scoped=/^\/api\/runs\/([A-Za-z0-9][A-Za-z0-9._-]{0,199})(\/.*)$/.exec(url.pathname),runId=scoped?.[1]??null,path=scoped?.[2]??url.pathname.slice(4);
    if(!scoped&&!url.pathname.startsWith('/api/'))return null;
    if(method==='GET'&&path.startsWith('/lifecycle/receipts/')){
      if(!capabilities.lifecycleReceipt)throw unavailable('Lifecycle receipt adapter is unavailable.');
      const receiptId=path.slice('/lifecycle/receipts/'.length);if(!id.test(receiptId))throw fault('HTTP_INPUT','Invalid receipt identifier');
      await read(runId);
      const targetRunId=runId??binding.pinnedRunId,value=await services.readLifecycleReceipt({runId:targetRunId,receiptId});
      if(value?.receipt?.runId!==targetRunId)throw fault('MONITOR_RECEIPT','Lifecycle receipt does not identify the exact requested run');
      return result(value);
    }
    if(method==='GET'&&(binding||scoped||path.startsWith('/exclusions/'))){
      const options=readOptions(path,url);if(options)return result(await read(runId,options),200,options.kind==='script'?'text/plain':'application/json');
    }
    if(method==='POST'&&path==='/lifecycle'){
      if(!capabilities.lifecycle)throw unavailable('Lifecycle adapter for engine/run-lifecycle.mjs is unavailable.');
      const input=await body(),allowed=['action','runTarget','generation','expectedRevision','requestId','target','reason','planId','approvedPlanHash'];
      if(Object.keys(input).some(key=>!allowed.includes(key))||!['hide','archive','restore','planPrune','applyPrune'].includes(input.action)||!Number.isInteger(input.generation)||input.generation<1||!Number.isInteger(input.expectedRevision)||input.expectedRevision<0||input.reason!==undefined&&(typeof input.reason!=='string'||input.reason.length>2000)||input.requestId!==undefined&&!id.test(input.requestId))throw fault('HTTP_INPUT','Lifecycle needs an exact target, revision and supported operation');
      const state=await observed(runId,input,input.runTarget),target=input.target;
      if(!target||!['run','worker'].includes(target.kind)||Object.keys(target).some(key=>!['kind','generation','position','attempt'].includes(key))||target.kind==='run'&&Object.keys(target).length!==1)throw fault('HTTP_INPUT','Invalid lifecycle target');
      if(target.kind==='worker'){
        const worker=state.workers.find(item=>item.position===target.position);
        if(target.generation!==input.generation||!worker||target.attempt!==(worker.attempts??0))throw fault('MONITOR_TARGET','Lifecycle worker generation/attempt changed');
      }
      if(input.action==='planPrune'&&(typeof input.reason!=='string'||!input.reason.trim()))throw fault('HTTP_INPUT','Record the reason for a pruning review');
      if(input.action==='applyPrune'&&(!id.test(input.planId??'')||!/^[a-f0-9]{64}$/.test(input.approvedPlanHash??'')))throw fault('HTTP_INPUT','Prune requires the exact reviewed preview identifier and hash');
      // Storage, rather than presentation, decides active/unknown visibility and
      // safe settled prune eligibility. Nothing here deletes files or rows.
      if(busy)throw fault('MONITOR_BUSY','A bound mutation is already pending');
      busy=true;
      try{
        const value=await services.lifecycle(input);
        if(value?.receipt&&value.receipt.runId!==input.runTarget.runId||!value?.receipt&&!value?.preview)throw fault('MONITOR_RECEIPT','Lifecycle mutation confirmation is unavailable for the exact run; inspect the saved request before another action');
        return result(value,202);
      }finally{busy=false;}
    }
    if(method==='POST'&&(binding||scoped)&&['/control','/resume','/restart'].includes(path)){
      if(!binding)throw unavailable('Scoped control binding is unavailable.');
      const input=await body(),allowed=path==='/control'?['generation','action','position','attempt','turnId','text','target']:path==='/restart'?['generation','position','attempt','reconciliation','target']:['generation','action','target'];
      if(!Number.isInteger(input.generation)||input.generation<1||Object.keys(input).some(key=>!allowed.includes(key)))throw fault('HTTP_INPUT','Provide observed generation and supported control fields');
      if(path==='/control'&&!['pause','stop','steer','cancel-worker'].includes(input.action))throw fault('HTTP_INPUT','Unsupported control action');
      const state=await observed(runId,input,input.target);
      if(input.position!==undefined){
        const worker=state.workers.find(item=>item.position===input.position);
        if(!worker||input.attempt!==(worker.attempts??0)||input.target.position!==input.position||input.target.attempt!==input.attempt||path==='/control'&&(input.target.turnId!==input.turnId||input.turnId!==(worker.activeTurn?.turnId??null)))throw fault('MONITOR_TARGET','Worker attempt/turn changed');
      }else if(['position','attempt','turnId'].some(key=>Object.hasOwn(input.target,key)))throw fault('HTTP_INPUT','Run controls cannot carry a worker target');
      if(!capabilities.scopedControls)throw unavailable('Retained-runtime control adapter is unavailable. Bound monitors require it for every target.');
      if(busy)throw fault('MONITOR_BUSY','A bound mutation is already pending');
      busy=true;
      try{return result(await services.controlRun({target:input.target,action:path==='/control'?input.action:path.slice(1),...(input.text!==undefined?{text:input.text}:{}),...(input.reconciliation!==undefined?{reconciliation:input.reconciliation}:{})}),202);}finally{busy=false;}
    }
    return null;
  }
  return{route,readPinned:()=>read(null),capabilities,get busy(){return busy;}};
}
