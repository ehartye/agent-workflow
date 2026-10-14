// Pinned raw Responses items are an experimental observation source. These
// projections report tool status, never artifact acceptance or reconciled effects.
import {createHash} from 'node:crypto';
import {isAbsolute,resolve} from 'node:path';
export const TOOL_METHOD='rawResponseItem/completed';
export const TOOL_LIMIT=256;
export const EARLY_TOOL_LIMIT=512;
const counters=['malformed','duplicate','conflicting','discarded','overflow','unconfirmedDiscarded','foreign','unsupported','missingCall','missingOutput'];
const outcomes=new Set(['unknown','reportedSucceeded','reportedFailed','reportedRejected']);
const variants=new Map([['custom_tool_call',['call','custom']],['custom_tool_call_output',['output','custom']],['function_call',['call','function']],['function_call_output',['output','function']]]);
// Codex 0.162.1 code-mode-protocol/src/lib.rs names exec and wait. Script wrappers
// belong to these public tools, never to an underlying tool such as apply_patch.
const codeModeTools=new Set(['exec','wait']);
const plainTools=new Set([...codeModeTools,'apply_patch']);
// Verified native function calls use namespace skills with name list/read.
// Canonical retained IDs are not accepted as raw unnamespaced tool names.
const skillTools=new Set(['skills.list','skills.read']);
const supportedTools=new Set([...plainTools,...skillTools]);
const OUTPUT_LIMIT=1024*1024;
export const boundedToolId=value=>typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=200;

const boundedHandle=value=>typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=8192&&!/[\u0000-\u001f\u007f]/.test(value);
function sourcePath(value){
  if(!boundedHandle(value)||value.length>4096||!isAbsolute(value)||/^[/\\]{2}/.test(value)||value.replaceAll('\\','/').split('/').some(part=>part==='.'||part==='..'))return null;
  const path=resolve(value).replaceAll('\\','/');return process.platform==='win32'?path.toLowerCase():path;
}
// Only original resource metadata is fingerprinted. Skill bodies/arguments and
// their hashes are never retained. A native response is reported read evidence,
// not certification that every page was read or its instructions followed.
export function skillRootIdentity(value){const path=sourcePath(value);return path?createHash('sha256').update(path).digest('hex'):null;}
function boundedJson(value){
  if(typeof value!=='string'||Buffer.byteLength(value)>OUTPUT_LIMIT)return null;
  try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;}catch{return null;}
}
function skillStart(value){
  const args=boundedJson(value);
  if(!args||Object.keys(args).some(key=>!['package','resource','cursor'].includes(key))||!boundedHandle(args.package)||!args.package.startsWith('skill://')||
    args.resource!=null&&(!boundedHandle(args.resource)||!args.resource.startsWith('skill://'))||args.cursor!=null&&!boundedHandle(args.cursor))return null;
  return args.cursor==null;
}
function skillResponse(value){
  const output=boundedJson(value);
  if(!output||Object.keys(output).some(key=>!['resource','contents','skill_root','next_cursor'].includes(key))||!Object.hasOwn(output,'next_cursor')||
    typeof output.contents!=='string'||!boundedHandle(output.resource)||output.next_cursor!==null&&!boundedHandle(output.next_cursor))return null;
  const root=sourcePath(output.skill_root),resource=/^skill:\/\/[^/]+\/(.+)$/.exec(output.resource);
  if(!root||!resource)return null;
  const path=sourcePath(resource[1]);if(!path)return null;
  return{root:skillRootIdentity(output.skill_root),main:path===sourcePath(`${root}/SKILL.md`)};
}

function reportedOutcome(output){
  // Pinned core/src/tools/code_mode/output.rs inserts a header-only first part;
  // mod.rs appends errors as body parts. Admit the observed two-text shape only.
  // Header-only, media and additional body parts remain unknown coverage.
  if(!Array.isArray(output)||output.length!==2||output.some(part=>!part||Array.isArray(part)||
    part.type!=='input_text'||typeof part.text!=='string'||!Object.hasOwn(part,'type')||!Object.hasOwn(part,'text')||Object.keys(part).length!==2)||
    output.reduce((bytes,part)=>bytes+Buffer.byteLength(part.text),0)>OUTPUT_LIMIT)return 'unknown';
  const text=output[0].text,body=output[1].text;
  // output.rs:31 uses one decimal; :64 uses three decimals with optional timing
  // overhead. Quantization can produce negative overhead. Require the whole
  // first part: script-provided text cannot extend or masquerade as its wrapper.
  const wrapper=/^(Script completed|Script failed)\r?\nWall time (?:[0-9]+\.[0-9] seconds|[0-9]+\.[0-9]{3} seconds \(code-mode [0-9]+\.[0-9]{3} seconds; overhead -?[0-9]+\.[0-9]{3} seconds\))\r?\nOutput:\r?\n/.exec(text.slice(0,512));
  if(!wrapper||wrapper[0].length!==text.length)return 'unknown';
  // Refuse competing status anywhere in the bounded body. No raw bytes, input
  // or secondary hashes are retained, and a wrapper never proves nested effects.
  if(/Script (?:completed|failed|running with cell ID|terminated)/.test(body))return 'unknown';
  if(wrapper[1]==='Script completed')return /Script error:/.test(body)?'unknown':'reportedSucceeded';
  if(!/^Script error:\r?\n\S/.test(body))return 'unknown';
  return /^Script error:\r?\npatch rejected:/.test(body)?'reportedRejected':'reportedFailed';
}

// Run this BEFORE unconfirmed buffering. No reference to the raw item escapes.
export function projectToolEvent(message){
  if(message.method!==TOOL_METHOD)return null;
  const {params={}}=message,item=params.item;
  const variant=variants.get(item?.type);
  if(!variant)return null; // Reasoning, messages, encrypted/configuration fields.
  const [side,family]=variant;
  const skill=family==='function'&&item.namespace==='skills'&&(item.name==='list'||item.name==='read');
  const name=item.name==null?'absent':skill?`skills.${item.name}`:plainTools.has(item.name)?item.name:'unsupported';
  const namespace=skill?'skills':item.namespace!==undefined?'unverified':'absent';
  const malformed=!boundedToolId(params.threadId)||!boundedToolId(params.turnId)||!boundedToolId(item.call_id)||
    side==='call'&&(typeof item.name!=='string'||typeof (family==='custom'?item.input:item.arguments)!=='string')||
    side==='output'&&typeof item.output!=='string'&&!Array.isArray(item.output)||
    item.name!=null&&typeof item.name!=='string';
  const readStart=skill&&item.name==='read'&&side==='call'?skillStart(item.arguments):null;
  const readResponse=family==='function'&&side==='output'?skillResponse(item.output):null;
  return{threadId:boundedToolId(params.threadId)?params.threadId:null,turnId:boundedToolId(params.turnId)?params.turnId:null,
    callId:boundedToolId(item.call_id)?item.call_id:null,side,family,name,namespace,malformed,
    outcome:side==='output'&&family==='custom'?reportedOutcome(item.output):'unknown',
    ...(readStart!==null?{skillReadStart:readStart}:{}),...(readResponse?{skillReadRoot:readResponse.root,skillReadMain:readResponse.main}:{})};
}

// Copy only allowlisted facts again at the persistence boundary. Never spread a
// caller's object, even when it purports to already be a safe projection.
export function copyToolObservation(value){
  if(!value||!supportedTools.has(value.tool)||!boundedToolId(value.callId)||!['custom','function','ambiguous'].includes(value.family)||
    !['absent','skills','unverified'].includes(value.namespace)||!outcomes.has(value.outcome)||
    (skillTools.has(value.tool)?value.family==='custom'||value.namespace==='absent'||value.family==='ambiguous'&&!value.ambiguous:value.namespace==='skills')||
    ['callObserved','outputObserved','ambiguous'].some(key=>typeof value[key]!=='boolean')||
    !value.callObserved&&!value.outputObserved||
    (!codeModeTools.has(value.tool)||value.family!=='custom'||value.ambiguous||value.namespace==='unverified'||!value.callObserved||!value.outputObserved)&&value.outcome!=='unknown')return null;
  const read=value.skillRead;
  if(read!==undefined&&(value.tool!=='skills.read'||value.family!=='function'||value.namespace!=='skills'||value.ambiguous||
    !read||Object.keys(read).sort().join(',')!=='main,root,start'||!['start','main'].every(key=>read[key]===null||typeof read[key]==='boolean')||
    !(read.root===null||typeof read.root==='string'&&/^[a-f0-9]{64}$/.test(read.root))))return null;
  return{tool:value.tool,callId:value.callId,family:value.family,namespace:value.namespace,
    callObserved:value.callObserved,outputObserved:value.outputObserved,outcome:value.outcome,ambiguous:value.ambiguous,
    ...(read?{skillRead:{start:read.start,root:read.root,main:read.main}}:{})};
}
export function copyToolSummary(value){
  if(!value||value.source!==TOOL_METHOD||value.capability!=='unverified'||value.limit!==TOOL_LIMIT||
    ['observed','trackedIds','retained','paired'].some(key=>!Number.isSafeInteger(value[key])||value[key]<0)||
    value.trackedIds>TOOL_LIMIT||value.retained>value.trackedIds||value.paired>value.trackedIds||
    !value.counters||counters.some(key=>!Number.isSafeInteger(value.counters[key])||value.counters[key]<0))return null;
  if(value.observed<value.trackedIds||value.paired+value.counters.missingCall+value.counters.missingOutput!==value.trackedIds||
    value.counters.discarded<value.counters.overflow||value.counters.unconfirmedDiscarded>value.counters.overflow||
    value.counters.foreign>value.counters.discarded||['duplicate','conflicting','unsupported'].some(key=>value.counters[key]>value.observed))return null;
  return{source:TOOL_METHOD,capability:'unverified',limit:TOOL_LIMIT,observed:value.observed,trackedIds:value.trackedIds,
    retained:value.retained,paired:value.paired,counters:Object.fromEntries(counters.map(key=>[key,value.counters[key]]))};
}

export function createToolObserver(){
  const entries=new Map(),counts=Object.fromEntries(counters.map(key=>[key,0]));let observed=0,closed=false;
  const increment=(key,n=1)=>{counts[key]=Math.min(Number.MAX_SAFE_INTEGER,counts[key]+n);};
  const observation=entry=>{
    const call=entry.call,output=entry.output;
    const tool=supportedTools.has(call?.name)?call.name:entry.tool;
    if(!tool)return null;
    const family=entry.familyConflict||call&&output&&call.family!==output.family?'ambiguous':call?.family??output.family;
    const namespace=entry.unverifiedNamespace||entry.skillsNamespace&&!skillTools.has(tool)?'unverified':entry.skillsNamespace?'skills':'absent';
    return{tool,callId:entry.callId,family,namespace,callObserved:entry.allowedCallObserved===true,outputObserved:Boolean(output),
      outcome:!entry.ambiguous&&namespace==='absent'&&family==='custom'&&codeModeTools.has(call?.name)&&output&&!output.malformed&&
        (output.name==='absent'||output.name===call.name)?output.outcome:'unknown',ambiguous:entry.ambiguous,
      ...(tool==='skills.read'&&!entry.ambiguous&&family==='function'&&namespace==='skills'&&(call?.skillReadStart!=null||output?.skillReadRoot!=null)?
        {skillRead:{start:call?.skillReadStart??null,root:output?.skillReadRoot??null,main:output?.skillReadMain??null}}:{})};
  };
  const summary=()=>{
    const states=[...entries.values()],values=states.map(observation).filter(Boolean);
    return{source:TOOL_METHOD,capability:'unverified',limit:TOOL_LIMIT,observed,trackedIds:entries.size,retained:values.length,
      paired:states.filter(entry=>entry.call&&entry.output).length,
      counters:{...counts,missingCall:states.filter(entry=>!entry.call&&entry.output).length,missingOutput:states.filter(entry=>entry.call&&!entry.output).length}};
  };
  const publish=entry=>{
    const value=observation(entry);
    const serialized=value?JSON.stringify(value):null;
    if(!value||serialized===entry.published)return null;
    entry.published=serialized;return value;
  };
  return{
    discardUnconfirmed(){if(closed)return;increment('unconfirmedDiscarded');increment('overflow');increment('discarded');},
    discardForeign(malformed=false){if(closed)return;increment(malformed?'malformed':'foreign');increment('discarded');},
    observe(projected){
      if(closed)return null;
      observed=Math.min(Number.MAX_SAFE_INTEGER,observed+1);
      if(projected.malformed)increment('malformed');
      if(!projected.callId){increment('discarded');return null;}
      const supported=supportedTools.has(projected.name);
      const unsupported=projected.name==='unsupported'||projected.side==='call'&&!supported;
      if(unsupported){increment('unsupported');increment('discarded');}
      let entry=entries.get(projected.callId);
      if(!entry){
        // Reserve unsupported identities too. Otherwise a later allowed call
        // could reuse the same ID and erase the conflicting first observation.
        // Never evict and then accidentally pair a late output with a new call.
        if(entries.size>=TOOL_LIMIT){increment('overflow');increment('discarded');return null;}
        entry={callId:projected.callId,tool:null,ambiguous:false,unverifiedNamespace:false};entries.set(projected.callId,entry);
      }
      const fact={family:projected.family,name:projected.name,namespace:projected.namespace,malformed:projected.malformed,outcome:projected.outcome,
        skillReadStart:projected.skillReadStart??null,skillReadRoot:projected.skillReadRoot??null,skillReadMain:projected.skillReadMain??null};
      const prior=entry[projected.side];
      if(prior){
        // Deduplication compares only projected facts, not secret-bearing bytes.
        increment('duplicate');
        // Request bodies are not retained, so identical projected read facts
        // cannot prove two occurrences requested the same package/resource.
        const repeatedRead=projected.side==='call'&&projected.name==='skills.read'&&(prior.skillReadStart!==null||fact.skillReadStart!==null);
        if(!repeatedRead&&Object.keys(fact).every(key=>fact[key]===prior[key]))return null;
        increment('conflicting');entry.ambiguous=true;
        if(fact.family!==prior.family)entry.familyConflict=true;
      }else entry[projected.side]=fact;
      if(supported)entry.tool??=projected.name;
      if(projected.side==='call'&&supported)entry.allowedCallObserved=true;
      if(projected.namespace==='unverified')entry.unverifiedNamespace=true;
      if(projected.namespace==='skills')entry.skillsNamespace=true;
      if(projected.malformed||unsupported)entry.ambiguous=true;
      if(entry.call&&entry.output&&(entry.call.family!==entry.output.family||
        supportedTools.has(entry.call.name)&&supportedTools.has(entry.output.name)&&entry.call.name!==entry.output.name)){
        if(!entry.ambiguous)increment('conflicting');entry.ambiguous=true;
      }
      return publish(entry);
    },
    finish(){closed=true;return summary();},
    summary,
    snapshot(){return{...summary(),observations:[...entries.values()].map(observation).filter(Boolean)};},
  };
}
