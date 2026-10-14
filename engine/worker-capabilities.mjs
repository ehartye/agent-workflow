// Bounded source identities, native executor root selection and readiness.
// Hashes and protocol observations do not certify tool/artifact acceptance.
import {lstat,realpath,open,opendir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {isAbsolute,resolve,relative,parse,join,basename,dirname} from 'node:path';
import {fault} from '../foundation/client.mjs';
import {projectToolEvent,createToolObserver,EARLY_TOOL_LIMIT,skillRootIdentity} from '../foundation/tool-observation.mjs';

const MAX_FILES=128,MAX_BYTES=64*1024*1024;
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const bounded=value=>typeof value==='string'&&value.length>0&&value.length<=4096&&!/[\u0000-\u001f\u007f]/.test(value);
const absolute=value=>bounded(value)&&isAbsolute(value)&&!/^[/\\]{2}/.test(value)&&!(process.platform==='win32'&&/[<>:"|?*]/.test(value.slice(2)))&&!value.replaceAll('\\','/').split('/').some(part=>['.','..'].includes(part));
const pathKey=value=>process.platform==='win32'?resolve(value).toLowerCase():resolve(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const inside=(root,path)=>{const suffix=relative(root,path);return suffix!==''&&!isAbsolute(suffix)&&suffix!=='..'&&!suffix.startsWith('..\\')&&!suffix.startsWith('../');};
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

async function unlinked(path,directory=false){
  const target=resolve(path),base=parse(target).root;
  let current=base;
  const components=relative(base,target).split(/[\\/]/).filter(Boolean);
  for(const [index,component] of components.entries()){
    current=join(current,component);
    const info=await lstat(current);
    const leaf=index===components.length-1;
    if(info.isSymbolicLink()||(!leaf||directory?!info.isDirectory():!info.isFile()||info.nlink!==1)||pathKey(await realpath(current))!==pathKey(current)){
      throw fault('SKILL_SOURCE','Skill sources must use original regular unlinked files and directories');
    }
  }
  if(!components.length)throw fault('SKILL_SOURCE','A filesystem root is not a skill source root');
}

async function checkFile(path,expected,limit,budget){
  await unlinked(path);
  if(++budget.files>MAX_FILES)throw fault('SKILL_SOURCE','Skill source file count exceeded its limit');
  const handle=await open(path,'r');
  try{
    const before=await handle.stat();
    if(!before.isFile()||before.nlink!==1||before.size>limit||budget.bytes+before.size>(budget.maximum??MAX_BYTES))throw fault('SKILL_SOURCE','Skill source bytes exceeded the bounded limit');
    const hash=createHash('sha256'),buffer=Buffer.alloc(64*1024);let bytes=0;
    while(true){const {bytesRead}=await handle.read(buffer,0,buffer.length,null);if(!bytesRead)break;bytes+=bytesRead;if(bytes>limit||budget.bytes+bytes>(budget.maximum??MAX_BYTES))throw fault('SKILL_SOURCE','Skill source grew beyond the bounded limit');hash.update(buffer.subarray(0,bytesRead));}
    const after=await handle.stat(),entry=await lstat(path);
    if(bytes!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||entry.dev!==before.dev||entry.ino!==before.ino||entry.nlink!==1||entry.isSymbolicLink()||hash.digest('hex')!==expected){
      throw fault('SKILL_SOURCE','Skill source content identity changed or did not match');
    }
    // Recheck ancestor resolution after the bounded read. This does not protect
    // against a trusted host changing paths later; worker-local admission is separate.
    await unlinked(path);budget.bytes+=bytes;
  }finally{await handle.close();}
}

async function verifyDiscoveryRoot(skill){
  const root=dirname(skill.path),pending=[{path:root,depth:0}],declared=new Set([skill.path,...skill.references.map(reference=>resolve(skill.root,reference.path))].map(pathKey));let entries=0;
  while(pending.length){
    const {path,depth}=pending.pop();await unlinked(path,true);
    const directory=await opendir(path);
    for await(const entry of directory){
      if(++entries>512||depth>6)throw fault('SKILL_SOURCE','Native skill discovery exceeded its bounded directory scan');
      const child=join(path,entry.name),info=await lstat(child);
      if(info.isSymbolicLink())throw fault('SKILL_SOURCE','Native skill discovery cannot follow descendant links');
      if(info.isDirectory()){pending.push({path:child,depth:depth+1});continue;}
      if(!info.isFile()||info.nlink!==1)throw fault('SKILL_SOURCE','Native skill discovery requires regular unlinked files');
      const suffix=relative(root,child).replaceAll('\\','/');
      if(entry.name==='SKILL.md'&&pathKey(child)!==pathKey(skill.path)||
        suffix==='plugin.json'||/(?:^|\/)\.(?:codex|claude|cursor)-plugin\/plugin\.json$/.test(suffix)){
        throw fault('SKILL_SOURCE','Native discovery would expose an undeclared skill or plugin bundle');
      }
      if(!declared.has(pathKey(child)))throw fault('SKILL_SOURCE','Native skill metadata and resources require declared content identities');
    }
    await unlinked(path,true);
  }
}

export async function verifySkillSources(input){
  if(!Array.isArray(input)||input.length>32)throw fault('SKILL_MANIFEST','Provide at most 32 declared skill sources');
  const skills=structuredClone(input),ids=new Set(),names=new Set(),paths=new Set();
  for(const skill of skills){
    if(!exact(skill,['id','name','root','path','sha256','references'])||typeof skill.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(skill.id)||!bounded(skill.name)||!skill.name.trim()||skill.name.length>200||!absolute(skill.root)||!absolute(skill.path)||basename(skill.path)!=='SKILL.md'||!inside(skill.root,skill.path)||!sha(skill.sha256)||!Array.isArray(skill.references)||skill.references.length>64||ids.has(skill.id)||names.has(skill.name)||paths.has(pathKey(skill.path))){
      throw fault('SKILL_MANIFEST','Skill descriptors require distinct IDs native names and original SKILL.md identities');
    }
    ids.add(skill.id);names.add(skill.name);paths.add(pathKey(skill.path));
    const references=new Set([pathKey(skill.path)]);
    for(const reference of skill.references){
      if(!exact(reference,['path','sha256'])||!bounded(reference.path)||reference.path.includes('\\')||reference.path.includes(':')||reference.path.split('/').some(part=>!part||['.','..'].includes(part))||isAbsolute(reference.path)||!sha(reference.sha256))throw fault('SKILL_MANIFEST','References must declare bounded plugin-relative paths and identities');
      const path=resolve(skill.root,reference.path);
      if(!inside(skill.root,path)||references.has(pathKey(path)))throw fault('SKILL_MANIFEST','Duplicate or escaping skill reference');
      references.add(pathKey(path));
    }
  }
  const budget={files:0,bytes:0};
  try{
    for(const skill of skills){
      await unlinked(skill.root,true);
      // Native discovery recursively follows links and scans three plugin
      // manifest formats. Reject those expansions before selecting this root.
      await verifyDiscoveryRoot(skill);
      await checkFile(skill.path,skill.sha256,1024*1024,budget);
      for(const reference of skill.references)await checkFile(resolve(skill.root,reference.path),reference.sha256,16*1024*1024,budget);
    }
  }catch(error){if(error.code?.startsWith('SKILL_'))throw error;throw fault('SKILL_SOURCE','Declared skill source is unavailable or could not be verified');}
  return freeze({version:1,skills,fingerprint:createHash('sha256').update(canonical(skills)).digest('hex'),sourceChecks:{scope:'controller-filesystem',files:budget.files,bytes:budget.bytes}});
}

export const DIRECT_SKILLS='features.code_mode.direct_only_tool_namespaces=["skills"]';
export function assertDirectSkills(config){
  const namespaces=config?.features?.code_mode?.direct_only_tool_namespaces;
  if(!Array.isArray(namespaces)||namespaces.length!==1||namespaces[0]!=='skills')throw fault('CAPABILITY_EXPOSURE','Worker did not confirm the narrow native skills direct-tool exposure');
}

// Reuse the native tool invariant owner. An alternate parser must not turn
// custom calls, bare aliases or reused unsupported IDs into native skill proof.
export function observeNativeSkills(client,threadId,evidence,{skills=[]}={}){
  const observer=createToolObserver(),early=[];let activeTurn,closed=false;
  const apply=fact=>{
    if(fact.turnId!==activeTurn){observer.discardForeign(fact.malformed);return;}
    observer.observe(fact);
  };
  const unsubscribe=client.onNotification(message=>{
    if(closed||message.method!=='rawResponseItem/completed'||message.params?.threadId!==threadId)return;
    const fact=projectToolEvent(message);if(!fact)return;
    if(!activeTurn){if(early.length<EARLY_TOOL_LIMIT)early.push(fact);else observer.discardUnconfirmed();}else apply(fact);
  });
  return{confirm(turnId){
    if(closed)return;
    // Correction turns cannot overwrite the initial task's skill evidence.
    if(activeTurn&&activeTurn!==turnId)return;
    activeTurn=turnId;for(const fact of early.splice(0))apply(fact);
  },finish(){
    if(closed)return;closed=true;unsubscribe();for(const fact of early)observer.discardUnconfirmed();early.length=0;
    const snapshot=observer.snapshot();observer.finish();
    evidence.observations=snapshot.observations.filter(entry=>entry.tool==='skills.list'||entry.tool==='skills.read')
      .map(entry=>({turnId:activeTurn,callId:entry.callId,tool:entry.tool,callObserved:entry.callObserved,outputObserved:entry.outputObserved,ambiguous:entry.ambiguous||entry.family!=='function'||entry.namespace!=='skills',outcome:'notVerified'}));
    evidence.discarded=snapshot.counters.discarded;evidence.counters=snapshot.counters;
    evidence.coverage=snapshot.counters.overflow===0?'complete':'incomplete';
    for(const [key,tool] of [['catalog','skills.list'],['read','skills.read']]){
      const seen=evidence.observations.filter(entry=>entry.tool===tool);
      evidence[key]=evidence.coverage!=='complete'?'notObserved':seen.some(entry=>!entry.ambiguous&&entry.callObserved&&entry.outputObserved)?'callAndOutputObserved':seen.some(entry=>!entry.ambiguous&&entry.callObserved)?'callObserved':'notObserved';
    }
    evidence.catalogContents='notRetained';evidence.readRootMatch='notVerified';
    if(skills.length){
      const observed=skills.filter(skill=>evidence.coverage==='complete'&&snapshot.observations.some(entry=>entry.tool==='skills.read'&&entry.family==='function'&&entry.namespace==='skills'&&
        !entry.ambiguous&&entry.callObserved&&entry.outputObserved&&entry.skillRead?.start===true&&entry.skillRead.main===true&&entry.skillRead.root===skillRootIdentity(dirname(skill.path)))).map(skill=>skill.id);
      const missing=skills.filter(skill=>!observed.includes(skill.id)).map(skill=>skill.id);
      evidence.activation={status:missing.length?'incomplete':'complete',required:skills.map(skill=>skill.id),observed,missing,body:'notVerified'};
      if(!missing.length)evidence.readRootMatch='observedForSelectedMainReads';
    }
  }};
}
const environments=new Set(['AGENT_BEEPS_HOME','AGENT_SPRITES_HOME','PLAYWRIGHT_BROWSERS_PATH']);
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
const relativeFile=value=>bounded(value)&&!isAbsolute(value)&&!value.includes('\\')&&!value.includes(':')&&!value.split('/').some(part=>!part||['.','..'].includes(part));
const fileIdentity=value=>exact(value,['path','sha256'])&&relativeFile(value.path)&&sha(value.sha256);
const failManifest=()=>{throw fault('CAPABILITY_MANIFEST','Invalid bounded worker capability manifest');};
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');

function validateTree(tree){
  if(!exact(tree,['root','files','receipt'])||!absolute(tree.root)||!fileIdentity(tree.receipt)||!Array.isArray(tree.files)||!tree.files.length||tree.files.length>64||tree.files.some(item=>!fileIdentity(item))||new Set(tree.files.map(item=>item.path.toLowerCase())).size!==tree.files.length)failManifest();
  const receipt=tree.files.find(file=>file.path===tree.receipt.path);if(receipt&&receipt.sha256!==tree.receipt.sha256)failManifest();
}
function jsonExpectation(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
  const keys=Reflect.ownKeys(value);
  return keys.length>0&&keys.length<=16&&keys.every(key=>{
    if(typeof key!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(key)||key==='prototype'||Object.hasOwn(Object.prototype,key))return false;
    const entry=Object.getOwnPropertyDescriptor(value,key);
    if(!entry?.enumerable||!Object.hasOwn(entry,'value'))return false;
    const item=entry.value;
    return item===null||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item)||typeof item==='string'&&item.length<=200;
  });
}
export function validateCapabilities(input){
  if(!exact(input,['version','skills','tools'])||input.version!==1||!Array.isArray(input.skills)||input.skills.length>32||!Array.isArray(input.tools)||input.tools.length>16)failManifest();
  let manifest;
  try{
    // Check expectations before JSON serialization can erase undefined fields,
    // convert nonfinite numbers to null, or flatten inherited/accessor values.
    for(const tool of input.tools)if(Array.isArray(tool?.readiness))for(const stage of tool.readiness){
      if(stage&&Object.hasOwn(stage,'json')){
        const entry=Object.getOwnPropertyDescriptor(stage,'json');
        if(!Object.hasOwn(entry,'value')||!jsonExpectation(entry.value))failManifest();
      }
    }
    const serialized=JSON.stringify(input);if(Buffer.byteLength(serialized)>256*1024)failManifest();manifest=JSON.parse(serialized);
  }catch{failManifest();}
  const skillIds=new Set(manifest.skills.map(skill=>skill?.id)),toolIds=new Set();
  for(const tool of manifest.tools){
    if(!exact(tool,['id','skills','node','launcher','runtime','dependencies','environment','readiness','guidance'])||!id(tool.id)||toolIds.has(tool.id)||!Array.isArray(tool.skills)||!tool.skills.length||tool.skills.length>32||new Set(tool.skills).size!==tool.skills.length||tool.skills.some(value=>!skillIds.has(value))||!exact(tool.node,['path','version','sha256'])||!absolute(tool.node.path)||!/^v(?:2[4-9]|[3-9][0-9])\.\d+\.\d+$/.test(tool.node.version)||!sha(tool.node.sha256)||!exact(tool.launcher,['root','path','sha256'])||!absolute(tool.launcher.root)||!absolute(tool.launcher.path)||!inside(tool.launcher.root,tool.launcher.path)||!sha(tool.launcher.sha256)||!tool.environment||typeof tool.environment!=='object'||Array.isArray(tool.environment)||Object.entries(tool.environment).some(([key,value])=>!environments.has(key)||!absolute(value))||typeof tool.guidance!=='string'||!tool.guidance.trim()||tool.guidance.length>4000||!Array.isArray(tool.readiness)||!tool.readiness.length||tool.readiness.length>8)failManifest();
    toolIds.add(tool.id);validateTree(tool.runtime);validateTree(tool.dependencies);
    const stages=new Set();
    for(const stage of tool.readiness){
      const expectation=exact(stage,['id','args','marker','timeoutMs'])?bounded(stage.marker)&&stage.marker.length<=200:exact(stage,['id','args','json','timeoutMs'])&&jsonExpectation(stage.json);
      if(!expectation||!id(stage.id)||stages.has(stage.id)||!Array.isArray(stage.args)||stage.args.length>32||stage.args.some(value=>typeof value!=='string'||value.length>2048||/[\u0000-\u001f\u007f]/.test(value))||stage.args.join('').length>16384||!Number.isInteger(stage.timeoutMs)||stage.timeoutMs<1||stage.timeoutMs>20000)failManifest();
      stages.add(stage.id);
    }
  }
  return freeze(manifest);
}

export async function verifyToolSources(tool,{checkEnvironment=false}={}){
  const budget={files:0,bytes:0,maximum:512*1024*1024};
  try{
    await checkFile(tool.node.path,tool.node.sha256,256*1024*1024,budget);
    await unlinked(tool.launcher.root,true);await checkFile(tool.launcher.path,tool.launcher.sha256,16*1024*1024,budget);
    for(const tree of [tool.runtime,tool.dependencies]){
      await unlinked(tree.root,true);
      for(const file of [...tree.files,...(tree.files.some(file=>file.path===tree.receipt.path)?[]:[tree.receipt])])await checkFile(resolve(tree.root,file.path),file.sha256,16*1024*1024,budget);
    }
    for(const [key,value] of Object.entries(tool.environment)){
      await unlinked(value,true);
      if(checkEnvironment&&process.env[key]!==value)throw fault('CAPABILITY_SOURCE','Worker managed home/cache environment does not match its ceiling');
    }
    if(checkEnvironment&&(pathKey(process.execPath)!==pathKey(tool.node.path)||process.version!==tool.node.version))throw fault('CAPABILITY_SOURCE','Worker Node identity does not match its ceiling');
  }catch(error){
    if(error.code==='ENOENT')throw fault('CAPABILITY_UNAVAILABLE','Declared managed executable runtime dependency receipt or cache is missing');
    if(error.code==='CAPABILITY_SOURCE')throw error;
    throw fault('CAPABILITY_SOURCE','Declared tool files are unsafe unavailable or changed');
  }
  return{files:budget.files,bytes:budget.bytes,receiptAuthenticity:'notVerified'};
}

export async function freezeCapabilities(input){
  const manifest=validateCapabilities(input),sources=await verifySkillSources(manifest.skills),toolSources=[];
  for(const tool of manifest.tools){
    try{toolSources.push({id:tool.id,status:'verified',...await verifyToolSources(tool)});}
    catch(error){if(error.code!=='CAPABILITY_UNAVAILABLE')throw error;toolSources.push({id:tool.id,status:'unavailable'});}
  }
  return freeze({manifest,fingerprint:digest({manifest,directSkills:DIRECT_SKILLS}),sources:sources.sourceChecks,toolSources});
}

export async function readCapabilities(path){
  await unlinked(resolve(path));const handle=await open(resolve(path),'r');
  try{
    const buffer=Buffer.alloc(256*1024+1);let size=0;
    while(size<buffer.length){const {bytesRead}=await handle.read(buffer,size,buffer.length-size,null);if(!bytesRead)break;size+=bytesRead;}
    if(size>256*1024)failManifest();
    let input;
    try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size)));}catch{failManifest();}
    return await freezeCapabilities(input);
  }finally{await handle.close();}
}

const skillSourceCommand=skills=>[process.execPath,'--input-type=module','-e',`const m=await import(${JSON.stringify(import.meta.url)});await m.verifySkillSources(JSON.parse(process.argv[1]));process.stdout.write("WORKER_SKILL_SOURCE_OK\\n");`,JSON.stringify(skills)];
const toolSourceCommand=tool=>[tool.node.path,'--input-type=module','-e',`const m=await import(${JSON.stringify(import.meta.url)});await m.verifyToolSources(JSON.parse(process.argv[1]),{checkEnvironment:true});process.stdout.write("WORKER_TOOL_SOURCE_OK\\n");`,JSON.stringify(tool)];
function assertCommandBudget(command){
  // Conservative UTF-16 ceiling, including worst-case Windows quoting and
  // separators. Refuse the selection before App Server or commands are started.
  if(command.reduce((size,arg)=>size+2*arg.length+3,0)>30000)throw fault('CAPABILITY_SELECTION','Selected capabilities exceed the bounded Windows command-line budget');
}

export function selectCapabilities(manifest,options={}){
  const skillIds=Object.hasOwn(options,'skills')?options.skills:[],toolIds=Object.hasOwn(options,'requireTools')?options.requireTools:[];
  if(!Array.isArray(skillIds)||skillIds.length>32||!Array.isArray(toolIds)||toolIds.length>16||[skillIds,toolIds].some(values=>values.some(value=>!id(value))||new Set(values).size!==values.length))throw fault('CAPABILITY_SELECTION','Selections require distinct declared skill and tool IDs');
  if(!manifest){if(skillIds.length||toolIds.length)throw fault('CAPABILITY_SELECTION','No worker capability bundle was declared');return null;}
  const skills=skillIds.map(value=>manifest.skills.find(skill=>skill.id===value));
  if(skills.some(skill=>!skill))throw fault('CAPABILITY_SELECTION','Worker selected an undeclared skill');
  const tools=manifest.tools.filter(tool=>tool.skills.some(value=>skillIds.includes(value)));
  if(toolIds.some(value=>!tools.some(tool=>tool.id===value)))throw fault('CAPABILITY_SELECTION','Required tools must be associated with selected declared skills');
  const environment={};
  for(const tool of tools.filter(tool=>toolIds.includes(tool.id)))for(const [key,value] of Object.entries(tool.environment)){
    if(environment[key]!==undefined&&environment[key]!==value)throw fault('CAPABILITY_SELECTION','Selected tools require conflicting managed home/cache values');environment[key]=value;
  }
  assertCommandBudget(skillSourceCommand(skills));
  for(const tool of tools.filter(tool=>toolIds.includes(tool.id))){
    assertCommandBudget(toolSourceCommand(tool));
    for(const stage of tool.readiness)assertCommandBudget([tool.node.path,tool.launcher.path,...stage.args]);
  }
  return freeze({fingerprint:digest({manifest,skillIds,toolIds,directSkills:DIRECT_SKILLS}),skills,tools,requireTools:toolIds,environment,
    roots:skills.map(skill=>({id:skill.id,location:{type:'environment',environmentId:'local',path:dirname(skill.path)}})),
    native:{catalog:'notObserved',read:'notObserved',exposure:skills.length?'requestedDirectModelOnly':'notSelected'},
    instructions:skills.length?`Use the genuine native skills.list tool with {authority:{kind:"executor"}}, then skills.read with the package and main_resource returned by that catalog. Use native resource/cursor pagination for references. Confirm the enabled expected skill names and returned skill_root against these selected identities: ${JSON.stringify(skills.map(skill=>({id:skill.id,name:skill.name,skill_root:dirname(skill.path)})))}. If native catalog/read is unavailable or mismatched, report that missing stage; do not imitate skill activation by reading SKILL.md with commands. Selecting a skill grants no additional write, network, interactive or delegation permissions. ${tools.map(tool=>`Tool ${tool.id} (${toolIds.includes(tool.id)?'required readiness':'readiness unverified'}): ${tool.guidance}`).join(' ')}`:''});
}

export async function admitWorkerCapabilities(client,{cwd,selection,signal,deadline=Infinity,sandboxPolicy={type:'readOnly',networkAccess:false}}){
  if(!selection)return null;
  const evidence={fingerprint:selection.fingerprint,skills:selection.skills.map(skill=>({id:skill.id,name:skill.name,path:skill.path,sha256:skill.sha256,references:skill.references})),roots:selection.roots,native:{...selection.native},tools:[],instructions:selection.instructions};
  const stage=async(id,command,expectation,timeoutMs)=>{
    const text=typeof expectation==='string';
    const fact={id,status:'running',start:'unknown',exitCode:null,expectation:text?'marker':'json',matched:false,...(text?{markerObserved:false}:{}),outputTruncated:false};
    try{
      if(signal?.aborted){fact.start='notStarted';throw fault('CAPABILITY_CANCELLED','Worker capability admission was cancelled before command dispatch');}
      const remaining=Math.floor(deadline-performance.now());
      if(remaining<=0){fact.start='notStarted';throw fault('TURN_TIMEOUT','Worker exceeded its overall deadline');}
      timeoutMs=Math.min(timeoutMs,remaining);
      const result=await client.request('command/exec',{processId:`capability-${randomUUID()}`,command,cwd,sandboxPolicy,streamStdoutStderr:false,timeoutMs,outputBytesCap:8192},{timeoutMs:Math.min(timeoutMs+1000,remaining)});
      if(Number.isSafeInteger(result?.exitCode)){fact.start='observed';fact.exitCode=result.exitCode;}
      fact.outputTruncated=typeof result?.stdout!=='string'||typeof result?.stderr!=='string'||Buffer.byteLength((result?.stdout??'')+(result?.stderr??''))>=8192;
      if(text)fact.matched=fact.markerObserved=typeof result?.stdout==='string'&&result.stdout.trim()===expectation;
      else if(!fact.outputTruncated){
        try{
          const value=JSON.parse(result.stdout);
          fact.matched=Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(expectation).every(([key,item])=>Object.hasOwn(value,key)&&value[key]===item));
        }catch{fact.matched=false;}
      }
      if(fact.exitCode!==0||fact.outputTruncated||!fact.matched)throw fault('CAPABILITY_READINESS','Worker source or readiness command did not satisfy its bounded expectation');
      if(performance.now()>=deadline)throw fault('TURN_TIMEOUT','Worker exceeded its overall deadline');
      fact.status='passed';
    }catch{fact.status='failed';}
    return fact;
  };
  evidence.sources=await stage('skill-sources',skillSourceCommand(selection.skills),'WORKER_SKILL_SOURCE_OK',20000);
  const blocked=()=>{const executionUnknown=[evidence.sources,...evidence.tools.flatMap(tool=>tool.stages)].some(stage=>stage.status==='failed'&&stage.start==='unknown');throw Object.assign(fault('CAPABILITY_READINESS','Worker capability admission failed; no inference dispatched'),{capabilities:evidence,noInference:true,...(executionUnknown?{executionUnknown:true}:{})});};
  if(evidence.sources.status!=='passed')blocked();
  const externalDocuments=selection.skills.flatMap(skill=>skill.references
    .filter(reference=>reference.path.toLowerCase().endsWith('.md')&&basename(reference.path).toLowerCase()!=='skill.md'&&!inside(dirname(skill.path),resolve(skill.root,reference.path)))
    .map(reference=>({skill:skill.id,path:resolve(skill.root,reference.path),sha256:reference.sha256})));
  if(externalDocuments.length)evidence.instructions+=`\nVerified reference documents outside a selected native skill package: ${JSON.stringify(externalDocuments)}. Native skills.read only binds resources inside that exact package. Do not invent out-of-package resource URIs, widen roots or imitate another skill activation. After genuine native activation, these original hash-checked documents may be inspected through bounded read-only file tools within the task's authorized read scope. Preserve failed native reference reads as failed. No SKILL.md body may be loaded this way.`;
  for(const tool of selection.tools){
    const fact={id:tool.id,fingerprint:digest(tool),node:tool.node.path,launcher:tool.launcher.path,runtimeRoot:tool.runtime.root,dependencyRoot:tool.dependencies.root,environment:tool.environment,status:'notChecked',missing:['source','readiness'],stages:[],receiptAuthenticity:'notVerified'};evidence.tools.push(fact);
    if(!selection.requireTools.includes(tool.id))continue;
    fact.stages.push(await stage('tool-sources',toolSourceCommand(tool),'WORKER_TOOL_SOURCE_OK',20000));
    if(fact.stages.at(-1).status!=='passed'){fact.status='failed';blocked();}fact.missing=['readiness'];
    for(const readiness of tool.readiness){fact.stages.push(await stage(readiness.id,[tool.node.path,tool.launcher.path,...readiness.args],readiness.marker??readiness.json,readiness.timeoutMs));if(fact.stages.at(-1).status!=='passed'){fact.status='failed';blocked();}}
    fact.status='passed';fact.missing=[];
  }
  const admitted=selection.tools.filter(tool=>selection.requireTools.includes(tool.id)).map(tool=>({id:tool.id,node:{path:tool.node.path,version:tool.node.version},launcher:tool.launcher.path,environment:tool.environment,readiness:tool.readiness}));
  if(admitted.length)evidence.instructions+=`\nVerified worker tool invocation metadata: ${JSON.stringify(admitted)}. These exact executable paths, named environment values, source identities and listed readiness stages were checked in this worker. Invoke the Node executable and launcher as separate arguments, following the native skill instructions and authorized task scope. Other commands, render transport and artifact production remain unverified until executed and inspected. This metadata is not skill activation and grants no additional permissions.`;
  return evidence;
}
