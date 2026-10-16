import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {compileSchema} from './schema.mjs';
import {fault} from '../foundation/client.mjs';

export const sha256=value=>createHash('sha256').update(value).digest('hex');
// Descriptor-first traversal: never invoke a getter, serializer or proxy trap.
export function strictJSON(value,{code='COMPOSITION_INPUT',maxBytes=1048576,maxDepth=32}={}){
 const seen=new Set();let nodes=0;
 function visit(v,depth){
  if(++nodes>200000||depth>maxDepth)throw fault(code,'JSON structure exceeds its bounded depth or node count');
  if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return v;
  if(typeof v!=='object'||types.isProxy(v)||seen.has(v))throw fault(code,'Only strict acyclic JSON data is supported');
  const array=Array.isArray(v),proto=Object.getPrototypeOf(v);
  if(array?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)throw fault(code,'Custom JSON prototypes are refused');
  seen.add(v);const ds=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(ds);
  if(keys.some(k=>typeof k!=='string'||!Object.hasOwn(ds[k],'value')||k!=='length'&&!ds[k].enumerable))throw fault(code,'JSON requires enumerable own data properties');
  let out;
  if(array){if(keys.length!==v.length+1||keys.some(k=>k!=='length'&&!/^(0|[1-9][0-9]*)$/.test(k)))throw fault(code,'Sparse or named arrays are refused');out=[];for(let i=0;i<v.length;i++){if(!Object.hasOwn(ds,String(i)))throw fault(code,'Sparse arrays are refused');out.push(visit(ds[i].value,depth+1));}}
  else{out={};for(const k of keys)Object.defineProperty(out,k,{value:visit(ds[k].value,depth+1),enumerable:true,writable:true,configurable:true});}
  seen.delete(v);return out;
 }
 const out=visit(value,0);if(Buffer.byteLength(JSON.stringify(out))>maxBytes)throw fault(code,'JSON byte limit exceeded');return out;
}
export function canonicalJSON(value){const v=strictJSON(value,{maxBytes:32*1024*1024});const c=x=>Array.isArray(x)?'['+x.map(c).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+c(x[k])).join(',')+'}':JSON.stringify(x);return c(v);}
export const digest=value=>sha256(canonicalJSON(value));
export function exact(value,required,optional=[],code='COMPOSITION_INPUT'){
 if(!value||typeof value!=='object'||Array.isArray(value)||required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!required.includes(k)&&!optional.includes(k)))throw fault(code,'Record has missing or unsupported fields');return value;
}
export const isSha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export const isCount=x=>Number.isSafeInteger(x)&&x>=0;
export const isText=(x,n)=>typeof x==='string'&&x.length>0&&x.length<=n&&!x.includes('\0');
export const isId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x.toLowerCase());
export const isUuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
export function validatePath(value){
 if(!isText(value,1000)||Buffer.byteLength(value)>1000||value!==value.normalize('NFC')||/[\\\x00-\x1f\x7f:*?"<>|;&`$!]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||p.toLowerCase()==='.git'||/[. ]$/.test(p)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p)))throw fault('COMPOSITION_SOURCE','Source requires a portable relative literal path');return value;
}
export function validateRunRef(reference){const v=strictJSON(reference);exact(v,['dataInstanceId','runId','runtimeId']);if(!isText(v.dataInstanceId,200)||!isUuid(v.runId)||!isText(v.runtimeId,200))throw fault('COMPOSITION_INPUT','Invalid RunRef');return v;}
export function validateChildRef(reference){const v=strictJSON(reference);exact(v,['run','generation','invocationId']);validateRunRef(v.run);if(!Number.isSafeInteger(v.generation)||v.generation<1||!isId(v.invocationId))throw fault('COMPOSITION_INPUT','Invalid ChildRef');return v;}
export function validateWorkerRef(reference){const v=strictJSON(reference);exact(v,['run','generation','position','attempt']);validateRunRef(v.run);if(!Number.isSafeInteger(v.generation)||v.generation<1||!isCount(v.position)||v.position>=1000||!isCount(v.attempt))throw fault('COMPOSITION_INPUT','Invalid WorkerRef');return v;}
export function validateBlobRef(reference){const v=strictJSON(reference);exact(v,['kind','sha256','bytes']);if(v.kind!=='blob'||!isSha(v.sha256)||!isCount(v.bytes))throw fault('COMPOSITION_INPUT','Invalid BlobRef');return v;}
export function validateWorkflowDeclarations(declarations){
 const rows=strictJSON(declarations);if(!Array.isArray(rows)||rows.length>32)throw fault('COMPOSITION_INPUT','At most 32 child declarations are supported');const aliases=new Set();
 for(const d of rows){exact(d,['alias','source','argsSchema','resultSchema','capabilities','permissions']);if(!isId(d.alias)||aliases.has(d.alias.toLowerCase()))throw fault('COMPOSITION_INPUT','Child aliases must be distinct portable IDs');aliases.add(d.alias.toLowerCase());
  if(d.source?.kind==='script'){exact(d.source,['kind','path']);validatePath(d.source.path);if(!/\.(mjs|js)$/.test(d.source.path))throw fault('COMPOSITION_SOURCE','Child scripts require .js or .mjs');}
  else if(d.source?.kind==='registry'){exact(d.source,['kind','name']);if(!isText(d.source.name,110))throw fault('COMPOSITION_SOURCE','Invalid saved source name');}else throw fault('COMPOSITION_SOURCE','Unsupported child source');
  try{compileSchema(d.argsSchema);compileSchema(d.resultSchema);}catch{throw fault('COMPOSITION_SCHEMA','Child args/result schema is unsupported');}
  exact(d.capabilities,['skills','tools']);for(const [key,max]of [['skills',32],['tools',16]]){const ids=d.capabilities[key];if(ids!==null&&(!Array.isArray(ids)||ids.length>max||ids.some(id=>!isId(id))||new Set(ids).size!==ids.length))throw fault('COMPOSITION_INPUT','Invalid child capability ceiling');}
  if(d.permissions!==null){exact(d.permissions,['sandbox','networkAccess','approvalPolicy']);if(!['read-only','workspace-write'].includes(d.permissions.sandbox)||d.permissions.networkAccess!==false||d.permissions.approvalPolicy!=='never')throw fault('COMPOSITION_INPUT','Child permissions must narrow authority');}
 }return rows;
}

export function validateArtifactScope(scope){const v=strictJSON(scope,{code:'ARTIFACT_INPUT',maxBytes:65536});exact(v,['schemaVersion','ownedPaths'],[],'ARTIFACT_INPUT');if(v.schemaVersion!==1||!Array.isArray(v.ownedPaths)||v.ownedPaths.length<1||v.ownedPaths.length>256)throw fault('ARTIFACT_INPUT','Artifact scope requires 1..256 owned paths');const paths=[];for(const path of v.ownedPaths){validatePath(typeof path==='string'&&path.endsWith('/')?path.slice(0,-1):path);const key=path.toLowerCase();if(paths.some(p=>key===p||key.startsWith(p.endsWith('/')?p:p+'/')||p.startsWith(key.endsWith('/')?key:key+'/')))throw fault('ARTIFACT_OWNERSHIP','Artifact ownership paths overlap or alias');paths.push(key);}return{scope:v,scopeHash:digest(v)};}
