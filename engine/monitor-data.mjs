import {DatabaseSync} from 'node:sqlite';
import {lstat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {fault} from '../foundation/client.mjs';
import {readActivity} from './activity.mjs';
import {restartPreview} from './restart.mjs';
import {readWorkspacePatch} from './workspaces.mjs';

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
export async function monitorData(runDir,{kind='summary',generation,sourceGeneration,position,after=0,limit=50,basis='inputs',previewBytes=256*1024}={}){
  if(!isAbsolute(runDir)||!(await lstat(runDir)).isDirectory()||!(await lstat(join(runDir,'run.sqlite'))).isFile())throw fault('MONITOR_PATH','Monitor requires a regular saved run');
  const db=new DatabaseSync(join(runDir,'run.sqlite'),{readOnly:true});
  try{
    db.exec('PRAGMA busy_timeout=1000;BEGIN');
    const row=db.prepare('SELECT value FROM header WHERE id=1').get();
    if(!row)throw fault('MONITOR_MISSING','Saved run has no state');
    const state=JSON.parse(row.value);
    if(generation!==undefined&&state.generation!==generation)throw fault('REPLAY_GENERATION','Run generation changed; refresh before continuing');
    let historical;
    if(sourceGeneration!==undefined){
      if(!['worker','activity','patch'].includes(kind)||!Number.isInteger(sourceGeneration)||sourceGeneration<1||sourceGeneration>=state.generation)throw fault('HISTORY_INPUT','History requires a prior source generation');
      const current=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(state.generation,position);
      const worker=current?JSON.parse(current.value):null;
      const linked=worker?.priorExecutions?.some(ref=>ref.generation===sourceGeneration&&ref.position===position)||worker?.reusedFrom?.generation===sourceGeneration||state.restart?.sourceGeneration===sourceGeneration&&state.restart.affected.some(item=>item.position===position);
      if(!linked)throw fault('MONITOR_MISSING','Earlier execution is not linked to this worker');
      const row=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(sourceGeneration,position);
      if(!row)throw fault('MONITOR_MISSING','Earlier worker evidence is missing');historical=JSON.parse(row.value);
    }
    if(kind==='activity'){
      const row=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(state.generation,position);
      if(!row&&!historical)throw fault('MONITOR_MISSING','Worker does not exist in this generation');
      const worker=historical??JSON.parse(row.value),readGeneration=worker.reusedFrom?.generation??sourceGeneration??state.generation;
      if(!Number.isInteger(readGeneration)||readGeneration<1||readGeneration>state.generation||worker.reusedFrom&&(!worker.cached||worker.reusedFrom.position!==position||readGeneration===state.generation))throw fault('ACTIVITY_CORRUPT','Cached activity source is invalid');
      return{...readActivity(db,{generation:readGeneration,position,after,limit,expectedObserved:worker.activityCount??0}),sourceGeneration:readGeneration};
    }
    if(kind==='script')return state.script;
    if(kind==='result')return{result:state.result??null,error:state.error??null};
    if(kind==='patch'){
      const row=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(state.generation,position);
      if(!row&&!historical)throw fault('MONITOR_MISSING','Worker does not exist in this generation');
      const worker=historical??JSON.parse(row.value);
      return await readWorkspacePatch(worker.workspace,{basis,previewBytes});
    }
    if(kind==='worker'){
      if(historical)return{...historical,historyGeneration:sourceGeneration};
      const worker=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(state.generation,position);
      if(!worker)throw fault('MONITOR_MISSING','Worker does not exist in this generation');
      return JSON.parse(worker.value);
    }
    const output=preview(state,{meta:1200,status:40,generation:20,sessionId:200,createdAt:40,updatedAt:40,attempts:20,concurrency:20,acceptingControls:10,result:2000,error:1000,cleanup:1000,restart:4000});
    output.workers=[];
    const fullWorkers=[];
    for(const row of db.prepare('SELECT value FROM workers WHERE generation=? ORDER BY position').iterate(state.generation)){
      if(output.workers.length>=1000)throw fault('MONITOR_LIMIT','Saved worker count exceeded its limit');
      const worker=JSON.parse(row.value);fullWorkers.push(worker);
      output.workers.push(preview(worker,{position:20,prompt:600,options:800,phase:500,status:40,cached:10,reusedFrom:100,result:1000,error:700,interruption:300,startedAt:40,completedAt:40,evidence:800,dependencies:10000,activity:1200,activityCount:20,activeTurn:700,usage:1000,attempts:20,attemptOffset:20,priorExecutions:50000,cancelRequested:10,workspace:5000,workspaceError:1000}));
    }
    const workers=output.workers,completed=workers.filter(w=>w.status==='completed').length;
    output.coverage={requested:workers.length,completed,cached:workers.filter(w=>w.cached).length,failed:workers.filter(w=>w.status==='failed').length,unknown:workers.filter(w=>w.status==='unknown').length,complete:state.status==='completed'&&completed===workers.length};
    output.controls=db.prepare('SELECT value FROM controls WHERE generation=? ORDER BY rowid DESC LIMIT 32').all(state.generation).map(row=>JSON.parse(row.value));
    output.controlCount=db.prepare('SELECT count(*) AS count FROM controls WHERE generation=?').get(state.generation).count;
    output.resumable=Boolean(state.launch)&&state.cleanup?.serverExited===true&&!['running','pausing','stopping','finishing'].includes(state.status)&&!workers.some(w=>['running','unknown'].includes(w.status));
    output.restartPreview=state.launch?restartPreview({...state,workers:fullWorkers}):null;
    return output;
  }finally{db.close();}
}
