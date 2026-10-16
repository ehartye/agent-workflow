// Offline evidence only. Deliberately no child process, network or apply path.
import {createHash} from 'node:crypto';
import {open, lstat, realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve, dirname, parse, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {types} from 'node:util';

const LIMIT=1048576;
const API_VERSION='2022-11-28';
const FLAGS=['required_linear_history','allow_force_pushes','allow_deletions','block_creations',
  'required_conversation_resolution','lock_branch','allow_fork_syncing'];
const REQUIRED=['required_status_checks','enforce_admins','required_pull_request_reviews','restrictions',...FLAGS];
const ENVELOPE=['schemaVersion','repository','branch','apiVersion','capturedAt','provenance','state','protection'];
const SNAPSHOT=[...ENVELOPE,'evidenceSha256','settingsSha256','snapshotSha256'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const same=(a,b)=>canonical(a)===canonical(b);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const schema=()=>fail('PROTECTION_SCHEMA','Provide the documented evidence schema.');
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const isHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=1000&&!/[\x00-\x1f\x7f]/.test(v);
function json(value){
  let nodes=0;
  function visit(v,depth){
    if(++nodes>50000||depth>48)schema();
    if(types.isProxy(v))schema();
    if(v===null||typeof v==='boolean')return;
    if(typeof v==='string'){if(v.length>LIMIT)schema();return;}
    if(typeof v==='number'){if(!Number.isFinite(v))schema();return;}
    if(typeof v!=='object'||!(Array.isArray(v)?Object.getPrototypeOf(v)===Array.prototype:[Object.prototype,null].includes(Object.getPrototypeOf(v))))schema();
    const keys=Reflect.ownKeys(v);
    if(Array.isArray(v)){
      if(keys.length!==v.length+1)schema();
      for(let i=0;i<v.length;i++)if(keys[i]!==String(i))schema();
    }
    for(const key of keys){
      if(typeof key!=='string')schema();
      if(Array.isArray(v)&&key==='length')continue;
      const d=Object.getOwnPropertyDescriptor(v,key);
      if(key.length>200||['__proto__','prototype','constructor'].includes(key)||!Object.hasOwn(d,'value')||!d.enumerable)schema();
      visit(d.value,depth+1);
    }
  }
  visit(value,0);
  if(Buffer.byteLength(canonical(value))>LIMIT)fail('PROTECTION_LIMIT','Evidence exceeds the byte limit.');
}
function exact(value,required,optional=[]){
  if(!isObject(value)||required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!required.includes(k)&&!optional.includes(k)))schema();
}
function identity(repository,branch){
  if(typeof repository!=='string'||repository.length>201||!repository.split('/').every(s=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(s))||repository.split('/').length!==2)schema();
  if(typeof branch!=='string'||branch.length>255||!branch||branch==='@'||branch==='HEAD'||/[\x00-\x20\x7f~^:?*\[\\]/.test(branch)||branch.includes('..')||branch.includes('@{')||branch.includes('//')||branch.endsWith('.')||branch.split('/').some(s=>!s||s.startsWith('.')||s.endsWith('.lock')))schema();
}
const endpoint=(repository,branch)=>`/repos/${repository.split('/').map(encodeURIComponent).join('/')}/branches/${encodeURIComponent(branch)}/protection`;
function envelope(value,snapshot=false){
  json(value);exact(value,snapshot?SNAPSHOT:ENVELOPE);
  identity(value.repository,value.branch);
  if(value.schemaVersion!==1||!/^\d{4}-\d{2}-\d{2}$/.test(value.apiVersion)||typeof value.capturedAt!=='string'||!Number.isFinite(Date.parse(value.capturedAt))||new Date(value.capturedAt).toISOString()!==value.capturedAt)schema();
  const p=value.provenance;
  exact(p,['kind','source','observationId'],['snapshotSha256','afterRestoration']);
  if(!['fixture','ownerObservation'].includes(p.kind)||!text(p.source)||!text(p.observationId)||Object.hasOwn(p,'snapshotSha256')&&!isHash(p.snapshotSha256)||Object.hasOwn(p,'afterRestoration')&&typeof p.afterRestoration!=='boolean')schema();
  if(!['protected','absent','disabled'].includes(value.state)||value.state==='protected'&&!isObject(value.protection)||value.state!=='protected'&&value.protection!==null)schema();
  if(snapshot){
    if(![value.evidenceSha256,value.settingsSha256,value.snapshotSha256].every(isHash))schema();
    const {snapshotSha256,...unsigned}=value;
    if(hash(canonical(value.protection))!==value.settingsSha256||hash(canonical(unsigned))!==snapshotSha256)fail('PROTECTION_HASH','Snapshot integrity does not match.');
  }
  return value;
}
function makeSnapshot(value,evidenceSha256){
  envelope(value);
  const record={...value,evidenceSha256,settingsSha256:hash(canonical(value.protection))};
  return {...record,snapshotSha256:hash(canonical(record))};
}

// Every response-to-request conversion is explicit. Only named metadata may be
// ignored; an unknown setting disables the entire restoration operation.
function normalize(value){
  const missing=[],unknown=[];
  const result={state:value.state};
  const issue=(path)=>{unknown.push(path);return null;};
  function shape(v,required,optional,path){
    if(!isObject(v)){issue(path);return false;}
    for(const k of required)if(!Object.hasOwn(v,k))missing.push(path?path+'.'+k:k);
    for(const k of Object.keys(v))if(!required.includes(k)&&!optional.includes(k))issue(path?path+'.'+k:k);
    for(const k of optional)if(Object.hasOwn(v,k)&&k.endsWith('url')&&typeof v[k]!=='string')issue(path?path+'.'+k:k);
    return true;
  }
  function bool(v,path){return typeof v==='boolean'?v:issue(path);}
  function enabled(v,path){
    if(typeof v==='boolean')return issue(path); // GET uses wrappers, PUT booleans.
    if(!shape(v,['enabled'],['url'],path))return null;
    return bool(v.enabled,path);
  }
  function actors(v,path){
    if(!shape(v,['users','teams','apps'],['url','users_url','teams_url','apps_url'],path))return null;
    const out={};
    for(const kind of ['users','teams','apps']){
      const list=v[kind],key=kind==='users'?'login':'slug';
      if(!Array.isArray(list)||list.length>1000){out[kind]=issue(path+'.'+kind);continue;}
      const names=[];
      for(const actor of list){
        // Actor display/profile metadata is not a protection setting. IDs must
        // remain unambiguous; never accept a missing login/slug or an ID alone.
        const meta=['id','node_id','url','html_url','avatar_url','gravatar_id','followers_url','following_url',
          'gists_url','starred_url','subscriptions_url','organizations_url','repos_url','events_url','received_events_url',
          'type','site_admin','name','description','privacy','notification_setting','permission','permissions','members_url',
          'repositories_url','parent','owner','external_url','created_at','updated_at','client_id','installations_count'];
        if(!shape(actor,[key],meta,path+'.'+kind)||typeof actor[key]!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(actor[key])){issue(path+'.'+kind);continue;}
        names.push(actor[key]);
      }
      if(new Set(names).size!==names.length)issue(path+'.'+kind);
      out[kind]=names.sort();
    }
    return out;
  }
  function checks(v){
    const path='required_status_checks';if(v===null)return null;
    if(!shape(v,['strict'],['url','contexts_url','contexts','checks'],path))return null;
    const out={strict:bool(v.strict,path+'.strict')};
    let contexts;
    if(Object.hasOwn(v,'contexts')){
      if(!Array.isArray(v.contexts)||v.contexts.length>1000||!v.contexts.every(text)||new Set(v.contexts).size!==v.contexts.length)issue(path+'.contexts');
      else contexts=[...v.contexts].sort();
    }
    if(Object.hasOwn(v,'checks')){
      if(!Array.isArray(v.checks)||v.checks.length>1000){issue(path+'.checks');return null;}
      const list=[];
      for(const c of v.checks){
        if(!shape(c,['context','app_id'],[],path+'.checks')||!text(c.context)||c.app_id!==null&&(!Number.isSafeInteger(c.app_id)||c.app_id< -1)){issue(path+'.checks');continue;}
        list.push({context:c.context,app_id:c.app_id===null?-1:c.app_id});
      }
      list.sort((a,b)=>canonical(a)<canonical(b)?-1:canonical(a)>canonical(b)?1:0);
      if(new Set(list.map(canonical)).size!==list.length)issue(path+'.checks');
      if(contexts&&!same(contexts,[...new Set(list.map(c=>c.context))].sort()))issue(path+'.contexts');
      out.checks=list;
    }else if(contexts)out.contexts=contexts;
    else missing.push(path+'.checksOrContexts');
    return out;
  }
  function reviews(v){
    const path='required_pull_request_reviews';if(v===null)return null;
    const fields=['dismiss_stale_reviews','require_code_owner_reviews','required_approving_review_count','require_last_push_approval'];
    if(!shape(v,fields,['url','dismissal_restrictions','bypass_pull_request_allowances'],path))return null;
    const out={};
    for(const k of fields){
      out[k]=k==='required_approving_review_count'?
        Number.isInteger(v[k])&&v[k]>=0&&v[k]<=6?v[k]:issue(path+'.'+k):bool(v[k],path+'.'+k);
    }
    // GitHub omits these optional objects when no restrictions/allowances are
    // configured; retain their absence, and emit no guessed identity list.
    for(const k of ['dismissal_restrictions','bypass_pull_request_allowances'])if(Object.hasOwn(v,k))out[k]=actors(v[k],path+'.'+k);
    return out;
  }
  if(value.apiVersion!==API_VERSION)unknown.push('apiVersion');
  if(value.state==='disabled')unknown.push('state.disabled');
  if(value.state==='protected'){
    const v=value.protection;shape(v,REQUIRED,['url'],'');
    if(Object.hasOwn(v,'url')&&v.url!=='https://api.github.com'+endpoint(value.repository,value.branch))unknown.push('url.identity');
    result.required_status_checks=checks(v.required_status_checks);
    result.enforce_admins=enabled(v.enforce_admins,'enforce_admins');
    result.required_pull_request_reviews=reviews(v.required_pull_request_reviews);
    result.restrictions=v.restrictions===null?null:actors(v.restrictions,'restrictions');
    for(const k of FLAGS)result[k]=enabled(v[k],k);
  }
  return {settings:result,missing:[...new Set(missing)].sort(),unknown:[...new Set(unknown)].sort()};
}
export function buildProtectionRestorePlan(input){
  json(input);exact(input,['snapshot','repository','branch']);
  const {snapshot,repository,branch}=input;
  envelope(snapshot,true);identity(repository,branch);
  if(repository!==snapshot.repository||branch!==snapshot.branch)fail('PROTECTION_IDENTITY','Repository or branch does not match the snapshot.');
  const normalized=normalize(snapshot),complete=!normalized.missing.length&&!normalized.unknown.length;
  const {state,...body}=normalized.settings;
  return {schemaVersion:1,repository,branch,apiVersion:snapshot.apiVersion,snapshotSha256:snapshot.snapshotSha256,
    expectedSettingsSha256:snapshot.settingsSha256,dryRun:true,complete,
    restoration:complete?{method:state==='absent'?'DELETE':'PUT',path:endpoint(repository,branch),
      headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':snapshot.apiVersion},body:state==='absent'?null:body}:null,
    verification:{method:'GET',path:endpoint(repository,branch),snapshotSha256:snapshot.snapshotSha256,
      requireAllSettings:true,requireFreshOwnerObservation:true,requireAfterRestoration:true,
      absentRequiresOwnerConfirmation:true,authentication:'externalOwnerProcedure'},
    missing:normalized.missing,unknown:normalized.unknown};
}
function leaves(value,path='',output=new Map()){
  if(!isObject(value)){output.set(path,value);return output;}
  for(const k of Object.keys(value))leaves(value[k],path?path+'.'+k:k,output);
  return output;
}
function comparable(settings){
  const value=structuredClone(settings),checks=value.required_status_checks;
  if(checks&&Object.hasOwn(checks,'contexts')){
    checks.checks=checks.contexts.map(context=>({context,app_id:-1}));delete checks.contexts;
    checks.checks.sort((a,b)=>canonical(a)<canonical(b)?-1:canonical(a)>canonical(b)?1:0);
  }
  return value;
}
export function compareProtectionSettings(input){
  json(input);exact(input,['expected','actual']);const {expected,actual}=input;
  envelope(expected,true);envelope(actual);
  if(expected.repository!==actual.repository||expected.branch!==actual.branch||expected.apiVersion!==actual.apiVersion)fail('PROTECTION_IDENTITY','Observed identity does not match the snapshot.');
  const e=normalize(expected),a=normalize(actual),left=leaves(comparable(e.settings)),right=leaves(comparable(a.settings));
  const settings=[...new Set([...left.keys(),...right.keys()])].sort().map(path=>({path,
    expected:left.has(path)?left.get(path):null,actual:right.has(path)?right.get(path):null,
    match:left.has(path)&&right.has(path)&&same(left.get(path),right.get(path))}));
  const missing=[...e.missing.map(p=>'expected.'+p),...a.missing.map(p=>'actual.'+p)];
  const unknown=[...e.unknown.map(p=>'expected.'+p),...a.unknown.map(p=>'actual.'+p)];
  const fresh=Date.parse(actual.capturedAt)>Date.parse(expected.capturedAt)&&actual.provenance.observationId!==expected.provenance.observationId;
  if(!fresh)missing.push('freshObservation');
  const fixture=expected.provenance.kind==='fixture'||actual.provenance.kind==='fixture';
  if(!fixture&&(!actual.provenance.afterRestoration||actual.provenance.snapshotSha256!==expected.snapshotSha256))missing.push('freshObservation');
  const matches=settings.every(s=>s.match)&&missing.length===0&&unknown.length===0;
  return {schemaVersion:1,repository:expected.repository,branch:expected.branch,apiVersion:expected.apiVersion,
    scope:fixture?'fixture':'ownerSuppliedObservation',matches,restored:matches&&!fixture,
    settings,missing:[...new Set(missing)].sort(),unknown,
    hashes:{snapshotSha256:expected.snapshotSha256,expectedSettingsSha256:expected.settingsSha256,
      actualSettingsSha256:hash(canonical(actual.protection)),observationSha256:hash(canonical(actual))},
    provenance:{expected:expected.provenance,actual:actual.provenance},
    authenticity:'ownerSuppliedNotIndependentlyVerified'};
}

async function pathIdentity(path,leafRequired=true){
  const absolute=resolve(path),root=parse(absolute).root;
  const parts=absolute.slice(root.length).split(/[\\/]/).filter(Boolean);let current=root;
  const identities=[];
  const rootStat=await lstat(root);if(rootStat.isSymbolicLink()||!rootStat.isDirectory())fail('PROTECTION_INPUT','Unsafe evidence path.');
  for(let i=0;i<parts.length;i++){
    current=join(current,parts[i]);const last=i===parts.length-1;
    if(last&&!leafRequired)break;
    const s=await lstat(current);
    if(s.isSymbolicLink()||(!last&&!s.isDirectory())||(last&&leafRequired&&(!s.isFile()||s.nlink!==1)))fail('PROTECTION_INPUT','Use regular single-link evidence files without linked ancestors.');
    identities.push([current,String(s.dev),String(s.ino)]);
  }
  // A canonical spelling check also catches platform reparse redirects that
  // realpath exposes. These are admission checks, not an OS sandbox.
  const parent=leafRequired?absolute:dirname(absolute);
  if(resolve(await realpath(parent)).toLowerCase()!==parent.toLowerCase())fail('PROTECTION_INPUT','Unsafe evidence path.');
  return {absolute,identities};
}
async function recheck(identities){
  for(const [path,dev,ino] of identities){const s=await lstat(path);if(s.isSymbolicLink()||s.isFile()&&s.nlink!==1||String(s.dev)!==dev||String(s.ino)!==ino)fail('PROTECTION_INPUT','Evidence path changed.');}
}
function parseJson(source){
  const value=JSON.parse(source),stack=[];
  // Syntax is already validated. Scan quoted tokens without interpreting body
  // strings as keys; JSON.parse alone silently discards duplicate object names.
  for(const token of source.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]/g)){
    const word=token[0],top=stack.at(-1);
    if(word==='{')stack.push({keys:new Set(),key:true});
    else if(word==='[')stack.push({keys:null});
    else if(word==='}'||word===']')stack.pop();
    else if(word===','&&top?.keys)top.key=true;
    else if(word===':'&&top?.keys)top.key=false;
    else if(word.startsWith('"')&&top?.keys&&top.key){
      const key=JSON.parse(word);if(top.keys.has(key))fail('PROTECTION_INPUT','Duplicate JSON names are ambiguous.');
      top.keys.add(key);top.key=false;
    }
  }
  return value;
}
async function readJson(path){
  let handle;
  try{
    const {absolute,identities}=await pathIdentity(path);
    handle=await open(absolute,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    const before=await handle.stat();const leaf=identities.at(-1);
    if(!before.isFile()||before.nlink!==1||String(before.dev)!==leaf?.[1]||String(before.ino)!==leaf?.[2])fail('PROTECTION_INPUT','Evidence path changed.');
    if(before.size>LIMIT)fail('PROTECTION_LIMIT','Evidence exceeds the byte limit.');
    const buffer=Buffer.alloc(LIMIT+1);let bytes=0;
    while(bytes<buffer.length){const r=await handle.read(buffer,bytes,buffer.length-bytes,bytes);if(!r.bytesRead)break;bytes+=r.bytesRead;}
    if(bytes>LIMIT)fail('PROTECTION_LIMIT','Evidence exceeds the byte limit.');
    const after=await handle.stat();await recheck(identities);
    if(!after.isFile()||after.nlink!==1||before.mode!==after.mode||before.size!==after.size||bytes!==before.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)fail('PROTECTION_INPUT','Evidence changed during read.');
    const raw=buffer.subarray(0,bytes),value=parseJson(new TextDecoder('utf-8',{fatal:true}).decode(raw));
    json(value);return {value,sha256:hash(raw)};
  }catch(e){if(e.code?.startsWith('PROTECTION_'))throw e;fail('PROTECTION_INPUT','Cannot read regular bounded UTF-8 JSON evidence.');}
  finally{await handle?.close();}
}
async function writeJson(path,value){
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');
  if(bytes.length>LIMIT)fail('PROTECTION_LIMIT','Receipt exceeds the byte limit.');
  let handle;
  try{
    const {absolute,identities}=await pathIdentity(path,false);await recheck(identities);
    handle=await open(absolute,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);
    await recheck(identities);await handle.writeFile(bytes);await handle.sync();
  }catch(e){
    if(e.code==='EEXIST')fail('PROTECTION_OUTPUT_EXISTS','Output already exists; inspect the original receipt.');
    if(e.code?.startsWith('PROTECTION_'))throw e;
    fail('PROTECTION_OUTPUT','Output failed; inspect possible partial receipt before any further action.');
  }finally{await handle?.close();}
}
export async function main(argv){
  json(argv);
  if(!Array.isArray(argv)||!argv.every(v=>typeof v==='string'))schema();
  const [command,...tokens]=argv;
  const commands={snapshot:['input','output'],preflight:['snapshot','repository','branch','output'],verify:['snapshot','observed','output']};
  if(!Object.hasOwn(commands,command))fail('PROTECTION_ARGUMENTS','Use snapshot, preflight or verify with documented file arguments.');
  const flags=commands[command];
  const args={};
  for(let i=0;i<tokens.length;i+=2){
    const key=tokens[i].slice(2),value=tokens[i+1];
    if(!tokens[i].startsWith('--')||!flags.includes(key)||Object.hasOwn(args,key)||!value||value.startsWith('--'))fail('PROTECTION_ARGUMENTS','Unsupported or duplicate arguments.');
    args[key]=value;
  }
  if(flags.some(k=>!Object.hasOwn(args,k)))fail('PROTECTION_ARGUMENTS','All documented file arguments are required.');
  let result;
  if(command==='snapshot'){const input=await readJson(args.input);result=makeSnapshot(input.value,input.sha256);}
  else{
    const snapshot=(await readJson(args.snapshot)).value;
    result=command==='preflight'?buildProtectionRestorePlan({snapshot,repository:args.repository,branch:args.branch}):
      compareProtectionSettings({expected:snapshot,actual:(await readJson(args.observed)).value});
  }
  await writeJson(args.output,result);return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const result=await main(process.argv.slice(2));process.exitCode=result.complete===false||result.matches===false?1:0;}
  catch(e){const code=e.code?.startsWith('PROTECTION_')?e.code:'PROTECTION_INPUT';process.stderr.write(code+': Offline protection evidence could not be completed.\n');process.exitCode=1;}
}
