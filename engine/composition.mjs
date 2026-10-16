import {mkdir,open,lstat,readdir,realpath} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {parseScript} from './script.mjs';
import {resolveWorkflow} from './registry.mjs';
import {compileSchema} from './schema.mjs';
import {strictJSON,exact,digest,sha256,canonicalJSON,validateWorkflowDeclarations,validateBlobRef,isSha,isText} from './composition-contracts.mjs';
import {fault} from '../foundation/client.mjs';
import {evaluate,preflightEvaluatorInput} from './evaluate.mjs';
import {createRootContext,assertRootContext,invocationRows,writeInvocation,validateInvocationHistory} from './composition-store.mjs';
import {retainStepCatalog,loadStepCatalogs} from './steps.mjs';

const runtimes=new WeakMap();
export async function invokeChild({context,alias,args,parentSeq=null,origin={kind:'guest'}}){assertRootContext(context);const runtime=runtimes.get(context);if(!runtime)throw fault('COMPOSITION_UNSUPPORTED','Composition controller is unavailable');return runtime.invoke(alias,args,parentSeq,origin);}
export async function resolveChildWorker({context,child,localId}){
 assertRootContext(context);if(!isText(localId,100)||canonicalJSON(child.run)!==canonicalJSON(context.run)||child.generation!==context.generation)throw fault('COMPOSITION_INPUT','Child worker target differs');await validateInvocationHistory({context});const r=invocationRows(context.db,context.generation).find(r=>r.child?.invocationId===child.invocationId);if(!r)throw fault('COMPOSITION_INPUT','Child was not admitted');const rows=context.db.prepare('SELECT value FROM workers WHERE generation=? ORDER BY position').all(context.generation).map(r=>JSON.parse(r.value)),matches=rows.filter(w=>w.origin?.kind==='child'&&w.origin.invocationId===child.invocationId&&w.options.id===localId);if(matches.length!==1)throw fault('COMPOSITION_INPUT','Designated child worker is missing or ambiguous');const record=matches[0];return{worker:{run:context.run,generation:context.generation,position:record.position,attempt:record.attempts??0},record};
}
export function createRefinementServices({context}){assertRootContext(context);return Object.freeze({invokeChild:input=>{if(input.context!==context)throw fault('COMPOSITION_INPUT','Foreign host context');return invokeChild(input);},resolveChildWorker:input=>{if(input.context!==context)throw fault('COMPOSITION_INPUT','Foreign host context');return resolveChildWorker(input);},resolveNativeAssetReads:input=>context.resolveNativeAssetReads(input),async reserveStage(){throw fault('REFINEMENT_UNSUPPORTED','Artifact stage reservations await reviewed provider integration');},async releaseStage(){throw fault('REFINEMENT_UNSUPPORTED','Artifact stage reservations await reviewed provider integration');}});}

export async function createCompositionRuntime({context,previous,previousContext,script,args,dispatch,copyWorker,admission,recordProcess,normalizeAgent,restart}){
 assertRootContext(context);const {db,generation,run}=context,old=previousContext?invocationRows(db,previousContext.generation):[];
 // Root text/args are not effect identities. Match the verified effective calls
 // below; an unmatched completed prefix refuses before any additional effect.
 let cutoff=restart?.invocationSeq??old.length+1;
 if(old.length&&previous.backendIdentity!==context.state.backendIdentity)throw fault('COMPOSITION_REPLAY_CHANGED','Completed composition requires its original backend identity');
 const sources=new Map(context.sources.entries.map(e=>[e.alias,e]));
 // Resolve source I/O before accepting calls. Once intent assigns a sequence,
 // publishing its catalog and joining the FIFO must not await a file read that
 // can reorder sibling admissions.
 const programs=new Map(await Promise.all(context.sources.entries.map(async source=>{const text=new TextDecoder('utf-8',{fatal:true}).decode(await readCompositionBlob({runDir:context.runDir,reference:source.script}));return[source.sourceId,{text,parsed:parseScript(text)}];})));
 if(previousContext){await validateInvocationHistory({context:previousContext});for(const r of old)if(r.kind==='workflow'&&!context.sources.entries.some(e=>e.sourceId===r.sourceId))cutoff=Math.min(cutoff,r.seq);for(const r of old)if(r.status!=='completed')cutoff=Math.min(cutoff,r.seq);let changed=true;while(changed){changed=false;for(const r of old)if(r.seq>=cutoff&&r.parentSeq!==null&&r.parentSeq<cutoff){cutoff=r.parentSeq;changed=true;}}}
 const prefix=old.filter(r=>r.seq<cutoff),oldByLink=new Map(old.map(r=>[r.scopeId+':'+r.localCall,r]));
 let seq=prefix.length,lastKey=prefix.at(-1)?.key??'',childCount=prefix.filter(r=>r.kind==='workflow').length,total=0,pending=0,live=0;const queue=[],scopes=new Map(),children=new Map(),observed=new Set();
 const rootCatalog=loadStepCatalogs(db,generation)[0];const rootScope={id:'root',depth:0,parentSeq:null,localCall:0,ordinal:0,phase:'',catalog:rootCatalog,signal:context.signal,workerIds:new Map()};scopes.set('root',rootScope);
 // A verified closed prefix is copied in original global arrival order. No
 // child process or native start occurs. Root calls must consume its exact links.
 if(prefix.length){
  const oldCatalogs=loadStepCatalogs(db,previous.generation);
  for(const c of oldCatalogs.filter(c=>c.scope.kind==='child')){const parent=old.find(r=>r.child?.invocationId===c.scope.invocation.invocationId);if(parent?.seq<cutoff)context.transaction(()=>retainStepCatalog({db,run,generation,scope:{kind:'child',invocation:{...c.scope.invocation,generation}},sourceId:c.sourceId,steps:c.steps}));}
  for(const r of prefix){let workerPosition=r.workerPosition;if(r.kind==='agent'){const prior=JSON.parse(db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(previous.generation,r.workerPosition).value);workerPosition=copyWorker(prior,r.key);}
   const next={...r,workerPosition,child:r.child?{...r.child,generation}:null,reusedFrom:{generation:previous.generation,seq:r.seq}};context.transaction(()=>writeInvocation(context,next,{insert:true}));}
 }
 function assertAdmission(){context.assertOwner();admission();if(context.signal.aborted)throw fault('RUN_STOPPED','Composition admission closed');}
 const wake=()=>{while(live<context.state.concurrency&&queue.length){const item=queue.shift();item.signal.removeEventListener('abort',item.cancel);if(item.signal.aborted){item.reject(fault('RUN_STOPPED','Queued child cancelled without a process'));continue;}live++;item.resolve();}};
 const acquire=signal=>new Promise((resolveSlot,reject)=>{
  assertAdmission();if(signal.aborted)throw fault('RUN_STOPPED','Queued child cancelled without a process');
  const item={signal,resolve:resolveSlot,reject,cancel:()=>{const index=queue.indexOf(item);if(index<0)return;queue.splice(index,1);signal.removeEventListener('abort',item.cancel);reject(fault('RUN_STOPPED','Queued child cancelled without a process'));}};
  queue.push(item);signal.addEventListener('abort',item.cancel,{once:true});wake();
 });
 async function finish(r,value,error,publish){context.assertOwner();if(error){r.result=null;r.resultHash=null;r.status=error.code==='RUN_STOPPED'||error.code==='EVALUATOR_ABORTED'?'cancelled':error.executionUnknown?'unknown':'failed';r.error={code:error.code??'COMPOSITION_UNKNOWN',evidence:null};}
  else{const b=Buffer.from(canonicalJSON(value));if(b.length>1048576)throw fault('COMPOSITION_LIMIT','Child result exceeds broker limit');r.result=await context.writeBlob({bytes:b});r.resultHash=sha256(b);r.status='completed';}
  context.transaction(()=>{publish?.();writeInvocation(context,r);db.prepare('INSERT INTO events(generation,value) VALUES(?,?)').run(generation,canonicalJSON({method:'invocation-terminal',seq:r.seq,status:r.status,...(error?.noProcessStarted===true?{notStarted:true,noProcessStarted:true,noInference:true}:{})}));});
 }
 function intent(scope,kind,effective,source=null){
  assertAdmission();const localCall=scope.localCall++,prior=oldByLink.get(scope.id+':'+localCall),argsHash=digest(effective);
  if(prior?.seq<cutoff){if(prior.kind!==kind||prior.argsHash!==argsHash||prior.sourceId!==(source?.sourceId??null))throw fault('COMPOSITION_REPLAY_CHANGED','Completed invocation prefix changed; inspect retained effects');observed.add(prior.seq);return{cached:JSON.parse(db.prepare('SELECT value FROM invocations WHERE generation=? AND seq=?').get(generation,prior.seq).value),prior};}
  if(prefix.some(r=>r.scopeId==='root'&&!observed.has(r.seq)))throw fault('COMPOSITION_REPLAY_CHANGED','Earlier root cached invocation has not been matched');
  if(kind==='workflow'&&childCount>=1000)throw fault('COMPOSITION_LIMIT','Root child invocation limit reached');
  const n=++seq,child=kind==='workflow'?{run,generation,invocationId:`c_${++childCount}`}:null;
  const r={schemaVersion:1,seq:n,parentSeq:scope.parentSeq,scopeId:scope.id,localCall,kind,key:digest({previousKey:lastKey,kind,sourceId:source?.sourceId??null,argsHash,policyHash:context.policyHash,catalogHash:context.catalogHash,capabilitiesHash:context.capabilitiesHash,effectiveSettings:effective.options??null,inputSnapshotHash:null,...(source?{declaration:source.declaration,parentScope:scope.id,localCall}:{})}),previousKey:lastKey,status:'intent',sourceId:source?.sourceId??null,argsHash,policyHash:context.policyHash,catalogHash:context.catalogHash,capabilitiesHash:context.capabilitiesHash,workerPosition:null,child,result:null,resultHash:null,error:null,reusedFrom:null};lastKey=r.key;return{record:r,prior};
 }
 async function invoke(alias,input,parentSeq,origin,scope=rootScope){
  if(scope.depth!==0)throw fault('COMPOSITION_DEPTH','Depth1 evaluators cannot compose');if(parentSeq!==null)throw fault('REFINEMENT_UNSUPPORTED','Host ancestor injection awaits integrated artifact providers');origin=strictJSON(origin);exact(origin,['kind']);if(origin.kind!=='guest')throw fault('REFINEMENT_UNSUPPORTED','Artifact composition origin awaits integrated providers');
  if(typeof alias!=='string'||!sources.has(alias))throw fault('COMPOSITION_INPUT','Workflow alias is not declared');const source=sources.get(alias),value=strictJSON(input);if(!value||Array.isArray(value)||typeof value!=='object'||!compileSchema(source.declaration.argsSchema).validate(value))throw fault('COMPOSITION_INPUT','Child args do not satisfy the retained schema');
  const effective={alias,args:value,origin},entry=intent(scope,'workflow',effective,source);
  if(entry.cached){const r=entry.cached,childValue=JSON.parse(await context.readBlob({reference:r.result}));return{invocation:r.child,source:r.sourceId,value:childValue,cached:true};}
  const r=entry.record,{text,parsed}=programs.get(source.sourceId);preflightEvaluatorInput(text,value);
  const controller=new AbortController(),signal=AbortSignal.any([context.signal,controller.signal]);const childScope={id:r.child.invocationId,depth:1,parentSeq:r.seq,localCall:0,ordinal:0,phase:'',signal,workerIds:new Map(),declaration:source.declaration};
  context.transaction(()=>{childScope.catalog=retainStepCatalog({db,run,generation,scope:{kind:'child',invocation:r.child},sourceId:source.sourceId,steps:parsed.meta.steps??[]});writeInvocation(context,r,{insert:true});});scopes.set(childScope.id,childScope);children.set(childScope.id,{controller,scope:childScope,record:r,work:new Set()});
  let acquired=false;
  try{await acquire(signal);acquired=true;assertAdmission();if(signal.aborted)throw fault('RUN_STOPPED','Child cancelled before fork');r.status='running';context.transaction(()=>writeInvocation(context,r));
   const result=await evaluate(text,{args:value,signal,call:(method,params)=>callIn(childScope,method,params),onProcess:event=>recordProcess({...event,child:r.child})});
   await Promise.allSettled([...children.get(childScope.id).work]);if(!compileSchema(source.declaration.resultSchema).validate(result))throw fault('COMPOSITION_SCHEMA','Child result does not satisfy retained declaration');await finish(r,result);return{invocation:r.child,source:r.sourceId,value:result,cached:false};
  }catch(error){if(!acquired)Object.assign(error,{notStarted:true,noProcessStarted:true,noInference:true});await Promise.allSettled([...children.get(childScope.id).work]);await finish(r,null,error);throw error;}finally{children.delete(childScope.id);if(acquired){live--;wake();}}
 }
 async function callIn(scope,method,params){
  assertAdmission();if(++total>10000||++pending>4096){pending--;throw fault('COMPOSITION_LIMIT','Root aggregate broker capacity exhausted');}
  try{
   params=strictJSON(params);if(method==='workflow'){exact(params,['alias','args']);return await invoke(params.alias,params.args,scope.parentSeq,{kind:'guest'},scope);}
   if(method==='refineArtifact'){if(scope.depth)throw fault('COMPOSITION_DEPTH','Depth1 evaluators cannot refine');throw fault('REFINEMENT_UNSUPPORTED','Artifact refinement providers are not integrated at this foundation checkpoint');}
   if(method==='phase'||method==='log'){if(method==='phase')scope.phase=params.title;return await dispatch({method,params,scope});}
   if(method!=='agent')throw fault('COMPOSITION_INPUT','Unsupported broker method');
   params=normalizeAgent(params,scope);const {label,phase,...effectiveOptions}=params.options;
   const entry=intent(scope,'agent',{...params,options:effectiveOptions});if(entry.cached){if(params.options?.id)scope.workerIds.set(params.options.id,entry.cached.workerPosition);scope.ordinal++;return JSON.parse(await context.readBlob({reference:entry.cached.result}));}
   const r=entry.record;let published=false;const work=dispatch({method,params,scope,journal:r,publishInvocation:async({value=null,error,publish})=>{await finish(r,value,error,publish);published=true;},prior:entry.prior?JSON.parse(db.prepare('SELECT value FROM workers WHERE generation=? AND position=?').get(previous.generation,entry.prior.workerPosition)?.value??'null'):null});children.get(scope.id)?.work.add(work);
   try{const result=await work;if(!published)await finish(r,result);return result;}catch(error){if(!published&&r.workerPosition!==null)await finish(r,null,error);throw error;}finally{children.get(scope.id)?.work.delete(work);}
  }finally{pending--;}
 }
 const runtime={invoke,call:(method,params)=>callIn(rootScope,method,params),rootScope,cancelChild(child){const active=children.get(child.invocationId);if(!active)throw fault('COMPOSITION_INPUT','Child is not active');active.controller.abort();},assertConsumed(){if(prefix.some(r=>r.scopeId==='root'&&!observed.has(r.seq)))throw fault('COMPOSITION_REPLAY_CHANGED','Saved root invocation prefix was omitted');},cutoff};runtimes.set(context,runtime);return runtime;
}

export async function noCompositionLinks(path){for(let p=resolve(path);;p=dirname(p)){const s=await lstat(p);if(s.isSymbolicLink())throw fault('COMPOSITION_SOURCE','Linked source or retained paths are refused');if(dirname(p)===p)break;}}
export async function readCompositionFile(path,maxBytes=1048576,code='COMPOSITION_SOURCE'){
 try{await noCompositionLinks(path);const before=await lstat(path,{bigint:true});if(!before.isFile()||before.nlink!==1n||before.size>BigInt(maxBytes))throw Error();const file=await open(path,'r');
  try{const stat=await file.stat({bigint:true});if(stat.ino!==before.ino||stat.dev!==before.dev)throw Error();const b=Buffer.alloc(maxBytes+1);let bytes=0;while(bytes<b.length){const r=await file.read(b,bytes,b.length-bytes,null);if(!r.bytesRead)break;bytes+=r.bytesRead;}const after=await file.stat({bigint:true}),current=await lstat(path,{bigint:true});await noCompositionLinks(path);if(bytes>maxBytes||after.size!==BigInt(bytes)||['dev','ino','size','mtimeNs','ctimeNs','nlink'].some(k=>before[k]!==after[k]||after[k]!==current[k]))throw Error();return b.subarray(0,bytes);}finally{await file.close();}
 }catch(error){if(error.code===code)throw error;throw fault(code,'Regular single-link immutable file is missing, changed, unsafe or oversized');}
}
export async function putCompositionBlob({runDir,bytes}){
 if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);if(bytes.length>32*1024*1024)throw fault('COMPOSITION_LIMIT','Private composition blob exceeds 32 MiB');
 const dir=join(runDir,'workflow-sources-v1','blobs');await mkdir(dir,{recursive:true});await noCompositionLinks(dir);const ref={kind:'blob',sha256:sha256(bytes),bytes:bytes.length},path=join(dir,ref.sha256);
 let file;try{file=await open(path,'wx',0o600);}catch(e){if(e.code!=='EEXIST')throw e;const existing=await readCompositionBlob({runDir,reference:ref});if(!existing.equals(bytes))throw fault('COMPOSITION_CORRUPT','Existing content address disagrees');return ref;}
 try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}await readCompositionBlob({runDir,reference:ref});return ref;
}
export async function readCompositionBlob({runDir,reference}){
 try{validateBlobRef(reference);if(reference.bytes>32*1024*1024)throw Error();const b=await readCompositionFile(join(runDir,'workflow-sources-v1','blobs',reference.sha256),reference.bytes,'COMPOSITION_CORRUPT');if(b.length!==reference.bytes||sha256(b)!==reference.sha256)throw Error();return b;}catch{throw fault('COMPOSITION_CORRUPT','Retained composition blob is missing or corrupt');}
}
async function sourceEntry({runDir,cwd,declaration}){
 let bytes,provenance;
 if(declaration.source.kind==='registry'){
  const found=await resolveWorkflow(declaration.source.name,{cwd});bytes=await readCompositionFile(found.scriptPath);provenance={kind:'registry',qualifiedName:found.qualifiedName,originalPath:found.scriptPath};
 }else{
  const base=await realpath(cwd);let path=base;for(const part of declaration.source.path.split('/')){const entries=await readdir(path),matches=entries.filter(n=>n.toLowerCase()===part.toLowerCase());if(matches.length!==1||matches[0]!==part)throw fault('COMPOSITION_SOURCE','Source component case or alias differs');path=join(path,part);}
  if(relative(base,resolve(path)).startsWith('..'))throw fault('COMPOSITION_SOURCE','Child source escapes launch cwd');bytes=await readCompositionFile(path);provenance={kind:'script',originalPath:path};
 }
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw fault('COMPOSITION_SOURCE','Child source is not UTF-8');}
 const {meta}=parseScript(text);if(meta.workflows?.length)throw fault('COMPOSITION_DEPTH','Depth1 children cannot declare children');
 const entry={schemaVersion:1,alias:declaration.alias,declaration,provenance,script:await putCompositionBlob({runDir,bytes}),metaHash:digest(meta),argsSchemaHash:digest(declaration.argsSchema),resultSchemaHash:digest(declaration.resultSchema)};return{...entry,sourceId:digest(entry)};
}
export async function freezeWorkflowSources({runDir,cwd,declarations,previousCatalog=null,revisions=null}){
 declarations=validateWorkflowDeclarations(declarations);let entries=[];
 const previous=previousCatalog?await verifyWorkflowSources({runDir,descriptor:previousCatalog}):null;
 if(previous){
  const changed=new Map();if(revisions!==null){const r=strictJSON(revisions,{maxBytes:65536});exact(r,['schemaVersion','expectedGeneration','expectedCatalogHash','reconciliation','replacements']);if(r.schemaVersion!==1||r.expectedCatalogHash!==previous.catalogHash||!Number.isSafeInteger(r.expectedGeneration)||r.expectedGeneration<1||!isText(r.reconciliation,2000)||!r.reconciliation.trim()||!Array.isArray(r.replacements)||r.replacements.length<1||r.replacements.length>32)throw fault('COMPOSITION_REVISION_REQUIRED','Source revisions require exact catalog, generation and reconciliation');for(const item of r.replacements){exact(item,['alias','expectedSourceId','source']);const old=previous.entries.find(e=>e.alias===item.alias);if(!old||old.sourceId!==item.expectedSourceId||changed.has(item.alias))throw fault('COMPOSITION_REVISION_REQUIRED','Source revision expected entry differs');changed.set(item.alias,item);}}
  for(const d of declarations){const old=previous.entries.find(e=>e.alias===d.alias),replacement=changed.get(d.alias);if(replacement){if(canonicalJSON(d.source)!==canonicalJSON(replacement.source))throw fault('COMPOSITION_REVISION_REQUIRED','Edited root must agree with the explicit replacement locator');entries.push(await sourceEntry({runDir,cwd,declaration:d}));changed.delete(d.alias);}else if(old){if(canonicalJSON(d)!==canonicalJSON(old.declaration))throw fault('COMPOSITION_REVISION_REQUIRED','Existing declarations require explicit source revision');entries.push(old);}else entries.push(await sourceEntry({runDir,cwd,declaration:d}));}
  if(changed.size)throw fault('COMPOSITION_REVISION_REQUIRED','Replacement alias is absent from edited root');
 }else for(const declaration of declarations)entries.push(await sourceEntry({runDir,cwd,declaration}));
 entries.sort((a,b)=>a.alias<b.alias?-1:a.alias>b.alias?1:0);if(entries.reduce((n,e)=>n+e.script.bytes,0)>32*1024*1024)throw fault('COMPOSITION_LIMIT','Child source aggregate exceeds 32 MiB');
 const catalog={schemaVersion:1,entries};catalog.catalogHash=digest(catalog);const bytes=Buffer.from(canonicalJSON(catalog));if(bytes.length>4*1024*1024)throw fault('COMPOSITION_LIMIT','Source catalog exceeds 4 MiB');return{schemaVersion:1,catalog:await putCompositionBlob({runDir,bytes}),catalogHash:catalog.catalogHash};
}
export async function verifyWorkflowSources({runDir,descriptor}){
 try{
  const d=strictJSON(descriptor);exact(d,['schemaVersion','catalog','catalogHash']);if(d.schemaVersion!==1||!isSha(d.catalogHash)||d.catalog.bytes>4*1024*1024)throw Error();const c=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readCompositionBlob({runDir,reference:d.catalog})));exact(c,['schemaVersion','entries','catalogHash']);if(c.schemaVersion!==1||c.catalogHash!==d.catalogHash||digest({schemaVersion:c.schemaVersion,entries:c.entries})!==c.catalogHash||!Array.isArray(c.entries)||c.entries.length>32)throw Error();validateWorkflowDeclarations(c.entries.map(e=>e.declaration));let last='',total=0;
  for(const e of c.entries){exact(e,['schemaVersion','alias','declaration','provenance','script','metaHash','argsSchemaHash','resultSchemaHash','sourceId']);const {sourceId,...base}=e;if(e.schemaVersion!==1||e.alias!==e.declaration.alias||e.alias<=last||digest(base)!==sourceId)throw Error();last=e.alias;const b=await readCompositionBlob({runDir,reference:e.script});total+=b.length;if(total>32*1024*1024)throw Error();const {meta}=parseScript(new TextDecoder('utf-8',{fatal:true}).decode(b));if(meta.workflows?.length||digest(meta)!==e.metaHash||digest(e.declaration.argsSchema)!==e.argsSchemaHash||digest(e.declaration.resultSchema)!==e.resultSchemaHash)throw Error();compileSchema(e.declaration.argsSchema);compileSchema(e.declaration.resultSchema);}
  return c;
 }catch{throw fault('COMPOSITION_CORRUPT','Retained source catalog or complete source entries are missing or corrupt');}
}
