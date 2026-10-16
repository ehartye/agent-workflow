import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {strictJSON,exact,isId,isText,digest,canonicalJSON,sha256 as digestSource} from './composition-contracts.mjs';
import {fault} from '../foundation/client.mjs';
import {parseScript} from './script.mjs';
import {verifyWorkflowSources,readCompositionBlob} from './composition.mjs';
import {invocationRows,contextRunRef,createRootContext,validateInvocationHistory} from './composition-store.mjs';
import {projectAdmission,projectAdditionWorkers} from './append.mjs';

export function validateStepCatalog({steps}){
 const rows=strictJSON(steps,{code:'STEP_INPUT',maxBytes:262144});if(!Array.isArray(rows)||rows.length>256)throw fault('STEP_INPUT','A scope permits at most 256 declared steps');
 const ids=new Map(),workers=new Set();
 for(const s of rows){exact(s,['id','label','dependsOn'],['phase','worker'],'STEP_INPUT');if(!isId(s.id)||ids.has(s.id.toLowerCase())||!isText(s.label,500)||s.phase!==undefined&&!isText(s.phase,500)||!Array.isArray(s.dependsOn)||s.dependsOn.length>255||s.dependsOn.some(id=>!isId(id))||new Set(s.dependsOn.map(id=>id.toLowerCase())).size!==s.dependsOn.length)throw fault('STEP_INPUT','Step IDs, labels and edges must be bounded and distinct');ids.set(s.id.toLowerCase(),s);
  if(Object.hasOwn(s,'worker')){exact(s.worker,['id'],[],'STEP_INPUT');if(!isId(s.worker.id)||workers.has(s.worker.id.toLowerCase()))throw fault('STEP_INPUT','Declared worker bindings must be unique local IDs');workers.add(s.worker.id.toLowerCase());}
 }
 const visited=new Set(),active=new Set();function walk(s){if(active.has(s.id))throw fault('STEP_INPUT','Declared step dependency cycle');if(visited.has(s.id))return;active.add(s.id);for(const id of s.dependsOn){const dep=ids.get(id.toLowerCase());if(!dep||dep.id!==id||id===s.id)throw fault('STEP_INPUT','Dependencies must name exact distinct IDs in this scope');walk(dep);}active.delete(s.id);visited.add(s.id);}for(const s of rows)walk(s);return rows;
}
export function createStepTables(db){db.exec('CREATE TABLE IF NOT EXISTS step_catalogs(generation INTEGER NOT NULL,ordinal INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(generation,ordinal));');}
export function retainStepCatalog({db,run,generation,scope,sourceId,steps}){
 steps=validateStepCatalog({steps});const all=loadStepCatalogs(db,generation),count=all.reduce((n,c)=>n+c.steps.length,0);if(count+steps.length>4096)throw fault('STEP_LIMIT','Instantiated step catalog exceeds 4096 declarations');
 const record={schemaVersion:1,run,generation,scope,sourceId,steps};record.catalogHash=digest(record);db.prepare('INSERT INTO step_catalogs VALUES(?,?,?)').run(generation,all.length,canonicalJSON(record));return record;
}
export function loadStepCatalogs(db,generation){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='step_catalogs'").get())return[];
 let count=0;const rows=db.prepare('SELECT ordinal,value FROM step_catalogs WHERE generation=? ORDER BY ordinal LIMIT 1002').all(generation);if(rows.length>1001)throw fault('STEP_CORRUPT','Too many instantiated catalogs');
 return rows.map((r,i)=>{try{const v=JSON.parse(r.value),{catalogHash,...base}=v;exact(v,['schemaVersion','run','generation','scope','sourceId','steps','catalogHash'],[],'STEP_CORRUPT');validateStepCatalog({steps:v.steps});if(i!==r.ordinal||v.schemaVersion!==1||v.generation!==generation||digest(base)!==catalogHash||! /^[a-f0-9]{64}$/.test(v.sourceId)||!v.scope||!['root','child'].includes(v.scope.kind)||(count+=v.steps.length)>4096)throw Error();return v;}catch{throw fault('STEP_CORRUPT','Retained catalog identity or complete contents are corrupt');}});
}
export async function validateStepBindings({db,state,run,runDir}){
 if(state.stepsVersion!==1)return[];
 try{
  // Load the actual complete persisted catalog and declarations from verified
  // source bytes. A caller's catalog or a self-consistent digest is no proof.
  const catalogs=loadStepCatalogs(db,state.generation),rootSteps=parseScript(state.script).meta.steps??[],children=state.compositionVersion===1?invocationRows(db,state.generation).filter(r=>r.kind==='workflow'):[];
  if(catalogs.length!==1+children.length||catalogs[0].scope.kind!=='root'||catalogs[0].sourceId!==digestSource(state.script)||canonicalJSON(catalogs[0].steps)!==canonicalJSON(rootSteps))throw Error();
  const sources=state.compositionVersion===1?await verifyWorkflowSources({runDir,descriptor:state.workflowSources}):null,scopes=new Set();
  for(const [index,c]of catalogs.entries()){
   const key=scopeKey(c.scope);if(scopes.has(key)||canonicalJSON(c.run)!==canonicalJSON(run))throw Error();scopes.add(key);
   if(index===0){exact(c.scope,['kind'],[],'STEP_CORRUPT');continue;}
   exact(c.scope,['kind','invocation'],[],'STEP_CORRUPT');const child=c.scope.invocation,r=children[index-1];
   if(c.scope.kind!=='child'||child?.generation!==state.generation||canonicalJSON(child.run)!==canonicalJSON(run)||r.sourceId!==c.sourceId||canonicalJSON(r.child)!==canonicalJSON(child))throw Error();
   const source=sources.entries.find(e=>e.sourceId===r.sourceId);if(!source)throw Error();
   const text=new TextDecoder('utf-8',{fatal:true}).decode(await readCompositionBlob({runDir,reference:source.script}));
   if(canonicalJSON(c.steps)!==canonicalJSON(parseScript(text).meta.steps??[]))throw Error();
  }
  return catalogs;
 }catch{throw fault('STEP_CORRUPT','Complete catalogs differ from their retained source declarations or scope bindings');}
}
const scopeKey=s=>canonicalJSON(s);
export function associateStep({catalog,options,workers}){
 if(options.id!==undefined&&catalog.steps.some(s=>s.worker&&s.worker.id.toLowerCase()===options.id.toLowerCase()&&s.worker.id!==options.id))throw fault('STEP_INPUT','Worker binding case alias is refused');
 const preset=catalog.steps.find(s=>s.worker&&s.worker.id===options.id),explicit=options.stepId===undefined?null:catalog.steps.find(s=>s.id===options.stepId);
 if(options.stepId!==undefined&&(!isId(options.stepId)||!explicit)||preset&&explicit&&preset.id!==explicit.id||explicit?.worker&&explicit.worker.id!==options.id)throw fault('STEP_INPUT','Worker step binding conflicts with the declared local scope');
 const s=explicit??preset;if(!s)return null;
 if(workers.some(w=>w.step&&scopeKey(w.step.scope)===scopeKey(catalog.scope)&&w.step.stepId===s.id))throw fault('STEP_INPUT','A declared step already has a logical worker');
 return{run:catalog.run,generation:catalog.generation,scope:catalog.scope,stepId:s.id};
}
export function validateStepWorkerSet({db,state,workers}){
 if(state.stepsVersion!==1)return;
 if(workers.length!==state.workerCount||workers.length>1000||workers.some((w,i)=>w.position!==i||!['queued','running','completed','failed','unknown'].includes(w.status)||!Number.isSafeInteger(w.attempts??0)||(w.attempts??0)<0||(w.attempts??0)>1000))throw fault('STEP_CORRUPT','Complete current workers differ from the admission ledger');
 try{for(const worker of workers){let current=worker,generation=state.generation;
  while(current.cached){
   exact(current.reusedFrom,['generation','position']);const ref=current.reusedFrom;
   if(current.status!=='completed'||!Number.isSafeInteger(ref.generation)||ref.generation<1||ref.generation>=generation||!Number.isInteger(ref.position)||ref.position<0||ref.position>=1000||current.sourceGeneration!==undefined&&current.sourceGeneration!==ref.generation||current.sourcePosition!==undefined&&current.sourcePosition!==ref.position)throw Error();
   const row=db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(ref.generation,ref.position),source=row?JSON.parse(row.value):null;
   if(!source||source.position!==ref.position||source.key!==current.key||source.status!=='completed'||source.attempts!==current.attempts||canonicalJSON(source.origin)!==canonicalJSON(current.origin)||digestSource(JSON.stringify(source.result))!==source.resultHash||digestSource(JSON.stringify(current.result))!==current.resultHash||canonicalJSON(source.result)!==canonicalJSON(current.result))throw Error();
   current=source;generation=ref.generation;
  }
 }}catch{throw fault('STEP_CORRUPT','Cached step worker source coordinates or authoritative result differ');}
}
export function projectSteps({catalogs,workers,run,generation,available,accepting,after=null,limit=50}){
 if(!Number.isSafeInteger(generation)||generation<1||!Number.isInteger(limit)||limit<1||limit>100||after!==null&&(typeof after!=='string'||after.length>200))throw fault('STEP_INPUT','Invalid step generation or bounded page');
 // Derive every expected binding from its actual execution scope, including
 // workers whose stored StepRef is absent. Validate before paging or revision.
 if(available)for(const w of workers){
  let expected=null;
  try{
   if(w.origin?.kind!=='append'){
    const scopes=catalogs.filter(c=>w.origin?.kind==='child'?c.scope.kind==='child'&&c.scope.invocation.invocationId===w.origin.invocationId:w.origin?.kind==='guest'&&c.scope.kind==='root');
    if(scopes.length!==1)throw Error();
    expected=associateStep({catalog:scopes[0],options:w.options,workers:[]});
   }
   if(canonicalJSON(w.step??null)!==canonicalJSON(expected))throw Error();
  }catch{throw fault('STEP_CORRUPT','Stored association does not match actual worker options and origin');}
 }
 const sequence=digest({run,generation,catalogs}),all=[],bound=new Set();
 for(const c of catalogs){if(canonicalJSON(c.run)!==canonicalJSON(run))throw fault('STEP_CORRUPT','Catalog belongs to another run');for(const s of c.steps){
  const ref={run,generation,scope:c.scope,stepId:s.id},matches=workers.filter(w=>w.step&&canonicalJSON(w.step)===canonicalJSON(ref));if(matches.length>1)throw fault('STEP_CORRUPT','Duplicate step assignment');const w=matches[0];if(w){let expected;try{expected=associateStep({catalog:c,options:w.options,workers:[]});}catch{throw fault('STEP_CORRUPT','Stored worker options conflict with its declared step');}if(canonicalJSON(expected)!==canonicalJSON(ref)||w.origin?.kind==='append'||w.origin?.kind==='child'&&(c.scope.kind!=='child'||w.origin.invocationId!==c.scope.invocation.invocationId)||w.origin?.kind==='guest'&&c.scope.kind!=='root')throw fault('STEP_CORRUPT','Stored association does not match actual worker options and origin');bound.add(w.position);}
  all.push({ref,label:s.label,phase:s.phase??null,dependencies:s.dependsOn.map(stepId=>({...ref,stepId})),binding:w?'assigned':'unassigned',worker:w?{run,generation,position:w.position,attempt:w.attempts??0}:null,sourceWorker:w?.cached?{run,generation:w.reusedFrom.generation,position:w.reusedFrom.position,attempt:w.attempts??0}:null,execution:w?.status??'planned',displayBlockedBy:[],failure:w?.error?{code:w.error.code??'WORKER_FAILED',evidence:null}:null,acceptance:'unverified'});
 }}
 for(const w of workers)if(w.step&&!bound.has(w.position))throw fault('STEP_CORRUPT','Worker refers to an absent catalog step');
 for(const n of all)n.displayBlockedBy=n.dependencies.filter(d=>!all.some(x=>canonicalJSON(x.ref)===canonicalJSON(d)&&x.execution==='completed'));
 let offset=0;if(after!==null){try{const v=JSON.parse(Buffer.from(after,'base64url').toString('utf8'));exact(v,['g','n','h'],[],'STEP_CONFLICT');if(Buffer.from(canonicalJSON(v)).toString('base64url')!==after||v.g!==generation||v.h!==sequence||!Number.isSafeInteger(v.n)||v.n<1||v.n>=all.length)throw Error();offset=v.n;}catch{throw fault('STEP_CONFLICT','Step catalog cursor changed; restart paging');}}
 const items=all.slice(offset,offset+limit),hasMore=offset+items.length<all.length,nextCursor=hasMore?Buffer.from(canonicalJSON({g:generation,n:offset+items.length,h:sequence})).toString('base64url'):null;
 const result={schemaVersion:1,run,generation,available,items,nextCursor,hasMore,coverage:{declared:all.length,assigned:bound.size,unassigned:all.length-bound.size,dynamicWorkers:workers.length-bound.size,futureWorkers:available&&!accepting?'executionClosed':'unknown'}};
 if(Buffer.byteLength(canonicalJSON(result))>1048576)throw fault('STEP_LIMIT','Complete step response exceeds 1 MiB');return result;
}
// Host projection only: source/catalog and journal verification must precede
// this call in the reader's SQLite snapshot. No persisted counter is trusted.
export function projectStepsRevision({catalogs,workers,run,runDir,generation,accepting,status,acceptingControls}){
 projectSteps({catalogs,workers,run,generation,available:true,accepting});
 return digest({schemaVersion:1,run,fixtureRun:run===null?runDir:null,generation,catalogs:catalogs.map(c=>c.catalogHash),workers:workers.map(w=>({position:w.position,step:w.step??null,attempt:w.attempts??0,status:w.status,failure:w.error?{code:w.error.code??'WORKER_FAILED',evidence:null}:null,cached:w.cached===true,reusedFrom:w.reusedFrom??null,sourceGeneration:w.sourceGeneration??null,sourcePosition:w.sourcePosition??null})),admission:{accepting:accepting===true,acceptingControls:acceptingControls===true,status}});
}
export async function readStepsAt({runDir,run,generation,after=null,limit=50}){
 const db=new DatabaseSync(join(runDir,'run.sqlite'),{readOnly:true});
 try{db.exec('PRAGMA busy_timeout=1000;BEGIN');const state=projectAdmission(db,JSON.parse(db.prepare('SELECT value FROM header WHERE id=1').get().value));if(state.generation!==generation)throw fault('STEP_CONFLICT','Observed generation changed');if(canonicalJSON(await contextRunRef({runDir,sessionId:state.sessionId}))!==canonicalJSON(run))throw fault('STEP_CORRUPT','Run binding differs');const catalogs=await validateStepBindings({db,state,run,runDir});await verifyStepHistory({db,state,run,runDir});const workers=projectAdditionWorkers(db,state,db.prepare('SELECT value FROM workers WHERE generation=? ORDER BY position LIMIT 1001').all(generation).map(r=>JSON.parse(r.value)));validateStepWorkerSet({db,state,workers});return projectSteps({catalogs,workers,run,generation,available:state.stepsVersion===1,accepting:state.acceptingAdditions,after,limit});}finally{db.close();}
}
async function verifyStepHistory({db,state,run,runDir}){
 if(state.compositionVersion!==1)return;
 const context=createRootContext({db,runDir,run,generation:state.generation,sessionId:state.sessionId,state,sources:await verifyWorkflowSources({runDir,descriptor:state.workflowSources}),signal:new AbortController().signal,assertOwner:()=>{},transaction:()=>{throw fault('COMPOSITION_INPUT','Step read cannot publish records');},workspaceInputs:async()=>null,resolveWorker:async()=>null,resolveAuthority:()=>null});await validateInvocationHistory({context});
}
export async function readStepCatalogs({dataDir,run,sessionId,generation}){const {resolveCompositionRun}=await import('./composition-store.mjs');const owner=await resolveCompositionRun({dataDir,run,sessionId});const db=new DatabaseSync(join(owner.runDir,'run.sqlite'),{readOnly:true});try{db.exec('BEGIN');const state=projectAdmission(db,JSON.parse(db.prepare('SELECT value FROM header WHERE id=1').get().value));if(state.stepsVersion!==1)throw fault('STEP_UNSUPPORTED','Recorded runtime has no declared catalog support');if(state.generation!==generation)throw fault('STEP_CONFLICT','Observed generation changed');const catalogs=await validateStepBindings({db,state,run,runDir:owner.runDir});await verifyStepHistory({db,state,run,runDir:owner.runDir});const workers=projectAdditionWorkers(db,state,db.prepare('SELECT value FROM workers WHERE generation=? ORDER BY position LIMIT 1001').all(generation).map(r=>JSON.parse(r.value)));validateStepWorkerSet({db,state,workers});projectSteps({catalogs,workers,run,generation,available:true,accepting:state.acceptingAdditions});db.exec('COMMIT');return catalogs;}finally{db.close();}}
