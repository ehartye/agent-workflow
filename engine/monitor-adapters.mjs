import {readdir,realpath,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {paths,readJson,noLinks,resolveRun} from '../bin/managed-runtime.mjs';
import {readLifecycle,readLifecycleReceipt,requestLifecycle,planPrune,applyPrune} from './run-lifecycle.mjs';
import {fault} from '../foundation/client.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const moduleAt=(owner,name)=>import(pathToFileURL(join(owner.runtime.path,'engine',name)).href);

// The current monitor supplies presentation and visibility metadata only. Native
// reads and execution controls are loaded from each verified retained runtime.
export async function createSessionServices({dataDir,sessionId,pinnedRunId}){
  const root=await realpath(resolve(dataDir));await noLinks(root);
  const identity=await lstat(root,{bigint:true});
  const dataInstanceId=createHash('sha256').update(JSON.stringify([process.platform==='win32'?root.toLowerCase():root,String(identity.dev),String(identity.ino),String(identity.birthtimeNs)])).digest('hex');
  const owner=await resolveRun({dataDir:root,id:pinnedRunId,sessionId});
  const binding={version:1,scope:'session',dataInstanceId,originatingSessionId:sessionId,pinnedRunId,runtimeId:owner.runtime.id};
  const ref=owner=>({dataInstanceId,runId:owner.id,runtimeId:owner.runtime.id});
  const resolveOwner=runId=>resolveRun({dataDir:root,id:runId??pinnedRunId,sessionId});
  const previews=new Map();let previewBytes=0;
  async function read(owner,options={}){
    const retained=await moduleAt(owner,'monitor-data.mjs');
    const result=await retained.monitorData(owner.runDir,{...options,runRef:ref(owner)});
    if(options.kind&&options.kind!=='summary')return result;
    if(result.sessionId!==sessionId)throw fault('MONITOR_OWNERSHIP','Saved execution differs from originating session');
    const lifecycle=await readLifecycle(owner.runDir);
    const {projectMonitorExperience}=await import('./monitor/experience.mjs');
    // Older bounded snapshots may omit task schemas. Such reports remain
    // unverified; no filename or worker self-report supplies acceptance proof.
    return{...result,lifecycle:{...lifecycle,available:true},experience:result.experience?.run?.runtimeId===owner.runtime.id?{...result.experience,run:ref(owner)}:projectMonitorExperience({run:ref(owner),summary:result,workers:result.workers??[]})};
  }
  async function targetOwner(target){
    if(!target||target.dataInstanceId!==dataInstanceId)throw fault('MONITOR_TARGET','Control target belongs to another data instance');
    const owner=await resolveOwner(target.runId);
    if(target.runtimeId!==owner.runtime.id)throw fault('MONITOR_TARGET','Control target runtime changed');
    const snapshot=await read(owner);
    if(target.generation!==snapshot.generation)throw fault('REPLAY_GENERATION','Run generation changed; refresh before continuing');
    return{owner,snapshot};
  }
  const services={
    async readRun({runId,...options}){return read(await resolveOwner(runId),options);},
    async listSessionRuns({cursor=null,limit=25,includeHidden=false}={}){
      if(!Number.isInteger(limit)||limit<1||limit>100||typeof includeHidden!=='boolean'||cursor!==null&&!/^(0|[1-9][0-9]{0,4})$/.test(cursor))throw fault('HTTP_INPUT','Invalid bounded session page');
      const directory=paths(root).runs;await noLinks(directory);const entries=await readdir(directory,{withFileTypes:true});
      if(entries.length>10000)throw fault('MONITOR_LIMIT','Session discovery exceeded its complete inventory limit');
      const items=[];let hiddenCount=0,unknownCount=0,unavailableCount=0;
      for(const entry of entries){
        if(!entry.isDirectory()||!uuid.test(entry.name))continue;
        const runDir=join(directory,entry.name),record=await readJson(join(runDir,'runtime.json'));
        if(record.schema!==2||record.id!==entry.name)throw fault('MONITOR_OWNERSHIP','Invalid retained navigation ownership');
        if(record.sessionId!==sessionId)continue;
        // Listing exposes recorded ownership plus lifecycle status. Selecting an
        // item performs full runtime verification before any read/control.
        const item={ref:{dataInstanceId,runId:record.id,runtimeId:record.runtime?.id},createdAt:record.createdAt,title:record.id,executionStatus:'unavailable',disposition:'visible'};
        try{const view=await readLifecycle(runDir);item.title=view.run.title??record.id;item.executionStatus=view.run.executionStatus;item.disposition=view.run.visibility;if(view.counts.unknownWorkers>0||view.run.executionStatus==='unknown')unknownCount++;}catch{unavailableCount++;}
        if(item.disposition!=='visible')hiddenCount++;
        if(includeHidden||item.disposition==='visible')items.push(item);
      }
      items.sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??'')||a.ref.runId.localeCompare(b.ref.runId));
      const offset=Number(cursor??0);if(offset>items.length)throw fault('HTTP_INPUT','Session page cursor is outside the current inventory');
      return{items:items.slice(offset,offset+limit),nextCursor:offset+limit<items.length?String(offset+limit):null,hiddenCount,unknownCount,unavailableCount};
    },
    async controlRun({target,action,text,reconciliation}){
      const {owner,snapshot}=await targetOwner(target);
      if(['resume','restart'].includes(action)){
        if(snapshot.lifecycle.run.pruned||snapshot.lifecycle.workers.some(w=>w.pruned)||snapshot.lifecycle.counts.uncertainPrunes)throw fault('REPLAY_PRUNED','Retired or uncertain lifecycle evidence prevents reuse');
        const retained=await moduleAt(owner,'background.mjs');
        return retained.startBackground({runDir:owner.runDir,sessionId,resume:true,expectedGeneration:target.generation,...(action==='restart'?{restart:{position:target.position,attempt:target.attempt,reconciliation}}:{})});
      }
      if(!['pause','stop','steer','cancel-worker'].includes(action))throw fault('HTTP_INPUT','Unsupported execution control');
      const retained=await moduleAt(owner,'controls.mjs');
      return retained.requestControl(owner.runDir,{sessionId,generation:target.generation,action,...(target.position===undefined?{}:{position:target.position,attempt:target.attempt,turnId:target.turnId??null}),...(text===undefined?{}:{text})});
    },
    async lifecycle(input){
      const {owner}=await targetOwner(input.runTarget);
      if(input.generation!==input.runTarget.generation)throw fault('REPLAY_GENERATION','Lifecycle target generation changed');
      const request={sessionId,generation:input.generation,expectedRevision:input.expectedRevision,target:input.target,...(input.reason===undefined?{}:{reason:input.reason})};
      if(['hide','archive','restore'].includes(input.action))return{receipt:{...await requestLifecycle(owner.runDir,{...request,action:input.action,requestId:input.requestId}),runId:owner.id}};
      if(input.action==='planPrune'){
        const preview=await planPrune(owner.runDir,request),bytes=Buffer.byteLength(JSON.stringify(preview));
        if(previews.size>=32||previewBytes+bytes>32*1024*1024)throw fault('MONITOR_LIMIT','Prune preview storage is full; close this dashboard and review a fresh plan');
        previews.set(preview.id,{ownerId:owner.id,preview,bytes});previewBytes+=bytes;return{preview};
      }
      if(input.action==='applyPrune'){
        const saved=previews.get(input.planId);
        if(!saved||saved.ownerId!==owner.id||saved.preview.generation!==input.generation||saved.preview.lifecycleRevision!==input.expectedRevision||saved.preview.planHash!==input.approvedPlanHash||JSON.stringify(saved.preview.target)!==JSON.stringify(input.target))throw fault('PRUNE_APPROVAL','Review the exact current target and plan before applying');
        // A lost response never causes this process to repeat a destructive call.
        previews.delete(input.planId);previewBytes-=saved.bytes;
        return{receipt:{...await applyPrune(owner.runDir,{sessionId,plan:saved.preview,approvedPlanHash:input.approvedPlanHash}),runId:owner.id}};
      }
      throw fault('HTTP_INPUT','Unsupported lifecycle operation');
    },
    async readLifecycleReceipt({runId,receiptId}){const owner=await resolveOwner(runId);return{receipt:{...await readLifecycleReceipt(owner.runDir,receiptId),runId:owner.id}};},
  };
  return{binding,services};
}
