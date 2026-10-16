import {DatabaseSync} from 'node:sqlite';
import {lstat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {fault} from '../foundation/client.mjs';
import {readActivity,readCompletedMessages} from './activity.mjs';
import {restartPreview} from './restart.mjs';
import {readWorkspacePatch,readWorkspaceExclusions} from './workspaces.mjs';
import {projectMonitorExperience} from './monitor/experience.mjs';
import {projectAdmission,projectAdditionWorkers} from './append.mjs';
import {validateStepBindings,validateStepWorkerSet,projectStepsRevision} from './steps.mjs';
import {contextRunRef,createRootContext,validateInvocationHistory} from './composition-store.mjs';
import {verifyWorkflowSources} from './composition.mjs';
import {canonicalJSON} from './composition-contracts.mjs';
export {projectMonitorExperience} from './monitor/experience.mjs';

function preview(record,fields){
  const output={truncations:[]};
  for(const [key,limit] of Object.entries(fields)){
    if(!Object.hasOwn(record,key))continue;
    const value=record[key],text=typeof value==='string'?value:JSON.stringify(value);
    output[key]=text.length>limit?text.slice(0,limit):value;
    if(text.length>limit)output.truncations.push(key);
  }
  return output;
}
export async function monitorData(runDir,{kind='summary',generation,sourceGeneration,position,after=0,limit=50,basis='inputs',stage='outputs',previewBytes=256*1024,runRef=null}={}){
  if(!isAbsolute(runDir)||!(await lstat(runDir)).isDirectory()||!(await lstat(join(runDir,'run.sqlite'))).isFile())throw fault('MONITOR_PATH','Monitor requires a regular saved run');
  const db=new DatabaseSync(join(runDir,'run.sqlite'),{readOnly:true});
  try{
    db.exec('PRAGMA busy_timeout=1000;BEGIN');
    const row=db.prepare('SELECT value FROM header WHERE id=1').get();
    if(!row)throw fault('MONITOR_MISSING','Saved run has no state');
    const state=projectAdmission(db,JSON.parse(row.value));
    if(generation!==undefined&&state.generation!==generation)throw fault('REPLAY_GENERATION','Run generation changed; refresh before continuing');
    let historical;
    if(sourceGeneration!==undefined){
      if(!['worker','activity','messages','patch','exclusions'].includes(kind)||!Number.isInteger(sourceGeneration)||sourceGeneration<1||sourceGeneration>=state.generation)throw fault('HISTORY_INPUT','History requires a prior source generation');
      const current=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(state.generation,position);
      const worker=current?JSON.parse(current.value):null;
      const references=[...(worker?.priorExecutions??[]),...(worker?.reusedFrom?[worker.reusedFrom]:[])].filter(ref=>ref.generation===sourceGeneration);
      if(state.restart?.sourceGeneration===sourceGeneration)for(const item of state.restart.affected??[]){
        if(worker?.origin&&item.origin?JSON.stringify(worker.origin)===JSON.stringify(item.origin):item.position===position)references.push({generation:sourceGeneration,position:item.position});
      }
      if(!references.length)throw fault('MONITOR_MISSING','Earlier execution is not linked to this worker');
      const sourcePosition=references[0].position;
      if(!Number.isInteger(sourcePosition)||sourcePosition<0||sourcePosition>=1000||references.some(ref=>ref.position!==sourcePosition))throw fault('HISTORY_INPUT','Earlier execution has inconsistent source coordinates');
      const row=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(sourceGeneration,sourcePosition);
      if(!row)throw fault('MONITOR_MISSING','Earlier worker evidence is missing');historical=JSON.parse(row.value);
      if(historical.position!==sourcePosition||worker?.origin&&historical.origin&&JSON.stringify(worker.origin)!==JSON.stringify(historical.origin))throw fault('HISTORY_INPUT','Earlier execution origin does not match the selected worker');
    }
    if(kind==='activity'||kind==='messages'){
      const row=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(state.generation,position);
      if(!row&&!historical)throw fault('MONITOR_MISSING','Worker does not exist in this generation');
      const worker=historical??JSON.parse(row.value),selectedGeneration=sourceGeneration??state.generation,readGeneration=worker.reusedFrom?.generation??selectedGeneration,readPosition=worker.reusedFrom?.position??worker.position;
      if(!Number.isInteger(readGeneration)||readGeneration<1||readGeneration>selectedGeneration||!Number.isInteger(readPosition)||readPosition<0||readPosition>=1000||worker.reusedFrom&&(!worker.cached||readGeneration===selectedGeneration||worker.sourceGeneration!==undefined&&worker.sourceGeneration!==readGeneration||worker.sourcePosition!==undefined&&worker.sourcePosition!==readPosition))throw fault('ACTIVITY_CORRUPT','Cached activity source is invalid');
      if(worker.reusedFrom){
        const sourceRow=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(readGeneration,readPosition);
        const source=sourceRow?JSON.parse(sourceRow.value):null;
        if(!source||source.position!==readPosition||JSON.stringify(source.origin)!==JSON.stringify(worker.origin))throw fault('ACTIVITY_CORRUPT','Cached activity source does not identify the selected worker origin');
      }
      const activity=readActivity(db,{generation:readGeneration,position:readPosition,after,limit,expectedObserved:worker.activityCount??0});
      return{...(kind==='messages'?readCompletedMessages(db,{generation:readGeneration,position:readPosition,after,limit}):activity),sourceGeneration:readGeneration,sourcePosition:readPosition};
    }
    if(kind==='script')return state.script;
    if(kind==='result')return{result:state.result??null,error:state.error??null,...(state.appendError?{appendError:state.appendError}:{})};
    if(kind==='patch'||kind==='exclusions'){
      const row=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(state.generation,position);
      if(!row&&!historical)throw fault('MONITOR_MISSING','Worker does not exist in this generation');
      const worker=historical??JSON.parse(row.value);
      return kind==='exclusions'?await readWorkspaceExclusions(worker.workspace,{stage,after,limit}):await readWorkspacePatch(worker.workspace,{basis,previewBytes});
    }
    if(kind==='worker'){
      if(historical)return{...historical,historyGeneration:sourceGeneration,historyPosition:historical.position};
      const worker=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(state.generation,position);
      const projected=projectAdditionWorkers(db,state,worker?[JSON.parse(worker.value)]:[]).find(item=>item.position===position);
      if(!projected)throw fault('MONITOR_MISSING','Worker does not exist in this generation');
      return projected;
    }
    const output=preview(state,{meta:1200,status:40,generation:20,sessionId:200,createdAt:40,updatedAt:40,attempts:20,reservedAttempts:20,workerCount:20,acceptingAdditions:10,admissionRevision:20,concurrency:20,acceptingControls:10,result:2000,error:1000,appendError:1000,cleanup:1000,restart:4000});
    output.workers=[];
    const fullWorkers=[];
    const savedWorkers=[];
    for(const row of db.prepare('SELECT value FROM workers WHERE generation=? ORDER BY position').iterate(state.generation)){
      if(savedWorkers.length>=1000)throw fault('MONITOR_LIMIT','Saved worker count exceeded its limit');
      savedWorkers.push(JSON.parse(row.value));
    }
    for(const worker of projectAdditionWorkers(db,state,savedWorkers)){
      if(output.workers.length>=1000)throw fault('MONITOR_LIMIT','Saved worker count exceeded its limit');
      fullWorkers.push(worker);
      output.workers.push(preview(worker,{position:20,origin:1000,sourceGeneration:20,sourcePosition:20,prompt:600,options:800,phase:500,status:40,cached:10,reusedFrom:100,result:1000,error:700,interruption:300,startedAt:40,completedAt:40,evidence:800,dependencies:10000,activity:1200,activityCount:20,activeTurn:700,deadline:700,usage:1000,attempts:20,attemptOffset:20,priorExecutions:50000,cancelRequested:10,workspace:5000,workspaceError:1000}));
      const item=output.workers.at(-1);
      if(worker.options&&typeof worker.options==='object'){
        item.options={};for(const key of ['id','label','phase'])if(typeof worker.options[key]==='string')item.options[key]=worker.options[key].slice(0,key==='id'?100:500);
      }
    }
    const workers=fullWorkers,completed=workers.filter(w=>w.status==='completed').length;
    if(state.stepsVersion===1){
      validateStepWorkerSet({db,state,workers});
      const run=await contextRunRef({runDir,sessionId:state.sessionId});if(runRef!==null&&canonicalJSON(runRef)!==canonicalJSON(run))throw fault('STEP_CORRUPT','Summary run binding differs from retained step source');
      const catalogs=await validateStepBindings({db,state,run,runDir});
      if(state.compositionVersion===1){const sources=await verifyWorkflowSources({runDir,descriptor:state.workflowSources}),context=createRootContext({db,runDir,run,generation:state.generation,sessionId:state.sessionId,state,sources,signal:new AbortController().signal,assertOwner:()=>{},transaction:()=>{throw fault('COMPOSITION_INPUT','Summary cannot publish records');},workspaceInputs:async()=>null,resolveWorker:async()=>null,resolveAuthority:()=>null});await validateInvocationHistory({context});}
      output.stepsRevision=projectStepsRevision({catalogs,workers,run,runDir,generation:state.generation,accepting:state.acceptingAdditions,status:state.status,acceptingControls:state.acceptingControls});
    }
    const added=workers.filter(worker=>worker.origin?.kind==='append');
    output.additions={requested:added.length,completed:added.filter(worker=>worker.status==='completed').length,failed:added.filter(worker=>worker.status==='failed').length,unknown:added.filter(worker=>worker.status==='unknown').length};
    output.coverage={requested:workers.length,completed,cached:workers.filter(w=>w.cached).length,failed:workers.filter(w=>w.status==='failed').length,unknown:workers.filter(w=>w.status==='unknown').length,complete:state.status==='completed'&&completed===workers.length};
    output.controls=db.prepare('SELECT value FROM controls WHERE generation=? ORDER BY rowid DESC LIMIT 32').all(state.generation).map(row=>JSON.parse(row.value));
    output.controlCount=db.prepare('SELECT count(*) AS count FROM controls WHERE generation=?').get(state.generation).count;
    output.resumable=Boolean(state.launch)&&state.cleanup?.serverExited===true&&!['running','pausing','stopping','finishing'].includes(state.status)&&!workers.some(w=>['running','unknown'].includes(w.status));
    output.restartPreview=state.launch?restartPreview({...state,workers:fullWorkers}):null;
    output.experience=projectMonitorExperience({run:runRef??{dataInstanceId:null,runId:null,runtimeId:null},summary:state,workers:fullWorkers});
    // Detect overlay availability inside this snapshot, without creating tables.
    // Storage owns schema/admission; missing integration never enables mutations.
    const visibilityTable=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lifecycle_visibility'").get();
    output.lifecycle={schema:1,revision:0,run:null,workers:[],available:false,visibilityKnown:!visibilityTable,reason:'Lifecycle storage adapter is unavailable.'};
    if(visibilityTable){
      // Do not guess another writer's SQLite serialization. The authenticated
      // experience adapter supplies readLifecycle projections after integration.
      output.lifecycle.reason='Lifecycle records exist; their read adapter is unavailable.';
    }
    return output;
  }finally{db.close();}
}
