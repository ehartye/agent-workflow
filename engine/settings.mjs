import {fault} from '../foundation/client.mjs';

const limits=Object.freeze({sandbox:'read-only',networkAccess:false,approvalPolicy:'never'});
const invalid=()=>fault('WORKER_SETTINGS','Worker model, reasoning, attempt count or permissions are invalid');

export function createSettings({catalog,config={},defaults={}}){
  if(!Array.isArray(catalog)||!catalog.length||catalog.length>1000||catalog.some(model=>typeof model.model!=='string'||!model.model||!Array.isArray(model.supportedReasoningEfforts)||!model.supportedReasoningEfforts.length||model.supportedReasoningEfforts.some(option=>typeof option.reasoningEffort!=='string')||!model.supportedReasoningEfforts.some(option=>option.reasoningEffort===model.defaultReasoningEffort))||new Set(catalog.map(model=>model.model)).size!==catalog.length)throw fault('MODEL_CATALOG','Codex model catalog is missing or malformed');
  if(!defaults||typeof defaults!=='object'||Array.isArray(defaults)||Object.keys(defaults).some(key=>!['model','effort','maxAttempts','permissions'].includes(key)))throw invalid();
  const configuredModel=config.model??catalog.find(model=>model.isDefault)?.model;
  const ceiling={...limits,...defaults.permissions};
  function permissions(value,maximum){
    if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([key,item])=>!Object.hasOwn(limits,key)||(key==='sandbox'?!['read-only','workspace-write'].includes(item)||maximum.sandbox==='read-only'&&item!=='read-only':item!==limits[key]))))throw invalid();
    return{...maximum,...value};
  }
  permissions(defaults.permissions,{...limits,sandbox:'workspace-write'});
  function resolve(options={}){
    const model=options.model??defaults.model??configuredModel;
    const selected=catalog.find(item=>item.model===model);
    if(!selected)throw invalid();
    const effort=options.effort??defaults.effort??(model===config.model?config.model_reasoning_effort:undefined)??selected.defaultReasoningEffort;
    const maxAttempts=options.maxAttempts??defaults.maxAttempts??5;
    if(!selected.supportedReasoningEfforts.some(item=>item.reasoningEffort===effort)||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5)throw invalid();
    return{model,effort,maxAttempts,permissions:permissions(options.permissions,ceiling)};
  }
  resolve();
  return{resolve};
}
