import {DatabaseSync} from 'node:sqlite';
import {lstat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {fault} from '../foundation/client.mjs';

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
export async function monitorData(runDir,{kind='summary',generation,position}={}){
  if(!isAbsolute(runDir)||!(await lstat(runDir)).isDirectory()||!(await lstat(join(runDir,'run.sqlite'))).isFile())throw fault('MONITOR_PATH','Monitor requires a regular saved run');
  const db=new DatabaseSync(join(runDir,'run.sqlite'),{readOnly:true});
  try{
    db.exec('PRAGMA busy_timeout=1000;BEGIN');
    const row=db.prepare('SELECT value FROM header WHERE id=1').get();
    if(!row)throw fault('MONITOR_MISSING','Saved run has no state');
    const state=JSON.parse(row.value);
    if(generation!==undefined&&state.generation!==generation)throw fault('REPLAY_GENERATION','Run generation changed; refresh before continuing');
    if(kind==='script')return state.script;
    if(kind==='result')return{result:state.result??null,error:state.error??null};
    if(kind==='worker'){
      const worker=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(state.generation,position);
      if(!worker)throw fault('MONITOR_MISSING','Worker does not exist in this generation');
      return JSON.parse(worker.value);
    }
    const output=preview(state,{meta:1200,status:40,generation:20,sessionId:200,createdAt:40,updatedAt:40,attempts:20,concurrency:20,acceptingControls:10,result:2000,error:1000,cleanup:1000});
    output.workers=[];
    for(const row of db.prepare('SELECT value FROM workers WHERE generation=? ORDER BY position').iterate(state.generation)){
      if(output.workers.length>=1000)throw fault('MONITOR_LIMIT','Saved worker count exceeded its limit');
      output.workers.push(preview(JSON.parse(row.value),{position:20,prompt:600,options:800,phase:500,status:40,cached:10,result:1000,error:700,interruption:300,startedAt:40,completedAt:40,evidence:800,dependencies:10000}));
    }
    const workers=output.workers,completed=workers.filter(w=>w.status==='completed').length;
    output.coverage={requested:workers.length,completed,cached:workers.filter(w=>w.cached).length,failed:workers.filter(w=>w.status==='failed').length,unknown:workers.filter(w=>w.status==='unknown').length,complete:state.status==='completed'&&completed===workers.length};
    output.controls=db.prepare('SELECT value FROM controls WHERE generation=? ORDER BY rowid DESC LIMIT 32').all(state.generation).map(row=>JSON.parse(row.value));
    output.controlCount=db.prepare('SELECT count(*) AS count FROM controls WHERE generation=?').get(state.generation).count;
    output.resumable=Boolean(state.launch)&&state.cleanup?.serverExited===true&&!['running','pausing','stopping','finishing'].includes(state.status)&&!workers.some(w=>['running','unknown'].includes(w.status));
    return output;
  }finally{db.close();}
}
