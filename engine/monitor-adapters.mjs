import {readdir,realpath,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {paths,readJson,noLinks,resolveRun} from '../bin/managed-runtime.mjs';
import {readLifecycle,readLifecycleReceipt,requestLifecycle,planPrune,applyPrune} from './run-lifecycle.mjs';
import {fault} from '../foundation/client.mjs';
import {supportsDeadlineSnapshot} from './monitor/services.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const moduleAt=(owner,name)=>import(pathToFileURL(join(owner.runtime.path,'engine',name)).href);

// The current monitor supplies presentation and visibility metadata only. Native
// reads and execution controls are loaded from each verified retained runtime.
export async function createSessionServices({dataDir,sessionId,pinnedRunId}){
  // Canonical identity may expand a Windows 8.3 alias or normalize case. Keep
  // the admitted spelling for retained records, which validate exact paths.
  const root=resolve(dataDir);await noLinks(root);const canonical=await realpath(root);
  const identity=await lstat(root,{bigint:true});
  const dataInstanceId=createHash('sha256').update(JSON.stringify([process.platform==='win32'?canonical.toLowerCase():canonical,String(identity.dev),String(identity.ino),String(identity.birthtimeNs)])).digest('hex');
  const owner=await resolveRun({dataDir:root,id:pinnedRunId,sessionId});
  const binding={version:1,scope:'session',dataInstanceId,originatingSessionId:sessionId,pinnedRunId,runtimeId:owner.runtime.id};
  const ref=owner=>({dataInstanceId,runId:owner.id,runtimeId:owner.runtime.id});
  const resolveOwner=runId=>resolveRun({dataDir:root,id:runId??pinnedRunId,sessionId});
  const previews=new Map();let previewBytes=0;
  const unavailable=owner=>({sessionId,status:'unavailable',generation:null,workers:[],availability:{status:'unavailable',reason:'Saved execution data is unavailable. Original records were preserved.'},
    meta:{name:owner.id},lifecycle:{available:false,visibilityKnown:false,reason:'Execution data is unavailable; lifecycle changes are disabled.'},experience:{run:ref(owner),phases:[],workers:[]}});
  async function read(owner,options={}){
    const retained=await moduleAt(owner,'monitor-data.mjs');
    if(options.kind==='messages'){
      const activity=await moduleAt(owner,'activity.mjs');
      if(typeof activity.readCompletedMessages!=='function'){
        const raw=await retained.monitorData(owner.runDir,{...options,kind:'activity',runRef:ref(owner)});
        if(!Number.isSafeInteger(raw.observed)||raw.observed<0)throw fault('ACTIVITY_CORRUPT','Retained raw history coverage is unavailable');
        return{available:false,coverage:'legacyRawOnly',priorActivityUncovered:raw.observed,records:[],nextCursor:options.after??0,hasMore:false,sourceGeneration:raw.sourceGeneration,sourcePosition:raw.sourcePosition};
      }
    }
    let result;
    try{result=await retained.monitorData(owner.runDir,{...options,runRef:ref(owner)});}
    catch(error){if(!options.kind||options.kind==='summary')return unavailable(owner);throw error;}
    if(options.kind==='messages'&&typeof result?.available!=='boolean')throw fault('MONITOR_UNAVAILABLE','Retained runtime message reader is unsupported');
    if(options.kind&&options.kind!=='summary')return result;
    if(result.sessionId!==sessionId)throw fault('MONITOR_OWNERSHIP','Saved execution differs from originating session');
    const lifecycle=await readLifecycle(owner.runDir);
    const controls=await moduleAt(owner,'controls.mjs');
    const available=typeof controls.requestControl==='function'&&typeof controls.validateDeadlineChange==='function'&&typeof controls.assertWorkerTarget==='function'&&(result.workers??[]).some(supportsDeadlineSnapshot);
    const {projectMonitorExperience}=await import('./monitor/experience.mjs');
    // Older bounded snapshots may omit task schemas. Such reports remain
    // unverified; no filename or worker self-report supplies acceptance proof.
    return{...result,deadlineControls:{available,receipts:typeof controls.readControl==='function',reason:available?null:'Retained runtime does not expose verified deadline controls.'},lifecycle:{...lifecycle,available:true},experience:result.experience?.run?.runtimeId===owner.runtime.id?{...result.experience,run:ref(owner)}:projectMonitorExperience({run:ref(owner),summary:result,workers:result.workers??[]})};
  }
  async function targetOwner(target){
    if(!target||target.dataInstanceId!==dataInstanceId)throw fault('MONITOR_TARGET','Control target belongs to another data instance');
    const owner=await resolveOwner(target.runId);
    if(target.runtimeId!==owner.runtime.id)throw fault('MONITOR_TARGET','Control target runtime changed');
    const snapshot=await read(owner);
    if(snapshot.availability?.status==='unavailable')throw fault('MONITOR_UNAVAILABLE','Saved execution data is unavailable; controls are disabled');
    if(target.generation!==snapshot.generation)throw fault('REPLAY_GENERATION','Run generation changed; refresh before continuing');
    return{owner,snapshot};
  }
  const services={
    async readSteps({runId,...options}){const owner=await resolveOwner(runId);let module;try{module=await moduleAt(owner,'steps.mjs');}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')throw fault('STEP_UNSUPPORTED','Recorded runtime has no step provider');throw error;}if(typeof module.readStepsAt!=='function')throw fault('STEP_UNSUPPORTED','Recorded runtime step provider is unavailable');return module.readStepsAt({runDir:owner.runDir,run:ref(owner),...options});},
    async readChildren({runId,...options}){const owner=await resolveOwner(runId);let module;try{module=await moduleAt(owner,'composition-store.mjs');}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')throw fault('COMPOSITION_UNSUPPORTED','Recorded runtime has no child provider');throw error;}if(typeof module.readChildrenAt!=='function')throw fault('COMPOSITION_UNSUPPORTED','Recorded runtime child provider is unavailable');return module.readChildrenAt({runDir:owner.runDir,run:ref(owner),...options});},
    async domainControl({runId,request}){const owner=await resolveOwner(runId),module=await moduleAt(owner,'controls.mjs');if(typeof module.requestDomainControl!=='function')throw fault('COMPOSITION_UNSUPPORTED','Recorded runtime domain controls are unavailable');return module.requestDomainControl({dataDir:root,run:ref(owner),sessionId,request});},
    async readDomainControl({runId,requestId}){const owner=await resolveOwner(runId),module=await moduleAt(owner,'controls.mjs');if(typeof module.readDomainControl!=='function')throw fault('COMPOSITION_UNSUPPORTED','Recorded runtime domain receipts are unavailable');return module.readDomainControl({dataDir:root,run:ref(owner),sessionId,requestId});},
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
    async controlRun({target,action,text,deadline,reconciliation}){
      const {owner,snapshot}=await targetOwner(target);
      if(['resume','restart'].includes(action)){
        if(snapshot.lifecycle.run.pruned||snapshot.lifecycle.workers.some(w=>w.pruned)||snapshot.lifecycle.counts.uncertainPrunes)throw fault('REPLAY_PRUNED','Retired or uncertain lifecycle evidence prevents reuse');
        const retained=await moduleAt(owner,'background.mjs');
        return retained.startBackground({runDir:owner.runDir,sessionId,resume:true,expectedGeneration:target.generation,...(action==='restart'?{restart:{position:target.position,attempt:target.attempt,reconciliation}}:{})});
      }
      if(!['pause','stop','steer','cancel-worker','worker-deadline'].includes(action))throw fault('HTTP_INPUT','Unsupported execution control');
      const retained=await moduleAt(owner,'controls.mjs');
      if(action==='worker-deadline'){
        if(snapshot.deadlineControls?.available!==true||typeof retained.validateDeadlineChange!=='function'||typeof retained.assertWorkerTarget!=='function')throw fault('MONITOR_UNAVAILABLE','Retained runtime deadline controls are unsupported');
        deadline=retained.validateDeadlineChange(deadline);
        retained.assertWorkerTarget(snapshot.workers.find(worker=>worker.position===target.position),{action,attempt:target.attempt,turnId:target.turnId,deadline});
      }else if(deadline!==undefined)throw fault('CONTROL_INPUT','Deadline fields require a worker-deadline action');
      return retained.requestControl(owner.runDir,{sessionId,generation:target.generation,action,...(target.position===undefined?{}:{position:target.position,attempt:target.attempt,turnId:target.turnId}),...(text===undefined?{}:{text}),...(deadline===undefined?{}:{deadline})});
    },
    async readControlReceipt({runId,receiptId,generation}){
      if(typeof receiptId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(receiptId)||!Number.isSafeInteger(generation)||generation<1)throw fault('HTTP_INPUT','Invalid control receipt identity');
      const owner=await resolveOwner(runId),snapshot=await read(owner),retained=await moduleAt(owner,'controls.mjs');
      if(!Number.isSafeInteger(snapshot.generation)||snapshot.generation<generation)throw fault('REPLAY_GENERATION','Receipt generation is outside the saved run');
      if(typeof retained.readControl!=='function')throw fault('MONITOR_UNAVAILABLE','Retained control receipt reader is unsupported');
      const receipt=await retained.readControl(owner.runDir,receiptId);
      if(receipt?.id!==receiptId||receipt.generation!==generation||Buffer.byteLength(JSON.stringify(receipt))>40000)throw fault('MONITOR_RECEIPT','Retained control receipt identity or bounds differ');
      return receipt;
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
