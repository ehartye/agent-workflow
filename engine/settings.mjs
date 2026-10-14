import {fault} from '../foundation/client.mjs';
import {selectCapabilities} from './worker-capabilities.mjs';
import {validateAccessPolicy} from './access-policy.mjs';

const limits=Object.freeze({sandbox:'read-only',networkAccess:false,approvalPolicy:'never'});
const invalid=()=>fault('WORKER_SETTINGS','Worker model, reasoning, attempt count or permissions are invalid');

export function createSettings({catalog,config={},defaults={},workerCapabilities,accessPolicy}){
  const admitted=accessPolicy===undefined?undefined:validateAccessPolicy(accessPolicy);
  if(!Array.isArray(catalog)||!catalog.length||catalog.length>1000||catalog.some(model=>typeof model.model!=='string'||!model.model||!Array.isArray(model.supportedReasoningEfforts)||!model.supportedReasoningEfforts.length||model.supportedReasoningEfforts.some(option=>typeof option.reasoningEffort!=='string')||!model.supportedReasoningEfforts.some(option=>option.reasoningEffort===model.defaultReasoningEffort))||new Set(catalog.map(model=>model.model)).size!==catalog.length)throw fault('MODEL_CATALOG','Codex model catalog is missing or malformed');
  if(!defaults||typeof defaults!=='object'||Array.isArray(defaults)||Object.keys(defaults).some(key=>!['model','effort','maxAttempts','permissions','workspace'].includes(key))||defaults.workspace!==undefined&&defaults.workspace!=='isolated')throw invalid();
  const configuredModel=config.model??catalog.find(model=>model.isDefault)?.model;
  function permissions(value,maximum){
    const ranks={'read-only':0,'workspace-write':1,'danger-full-access':2};
    if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([key,item])=>!Object.hasOwn(limits,key)||(key==='sandbox'?!Object.hasOwn(ranks,item)||ranks[item]>ranks[maximum.sandbox]:key==='networkAccess'?typeof item!=='boolean'||item&&!maximum.networkAccess:item!=='never'))))throw invalid();
    const result={...maximum,...value};
    if(value?.sandbox&&value.sandbox!==maximum.sandbox&&value.networkAccess===undefined)result.networkAccess=false;
    if(result.sandbox==='danger-full-access'&&!result.networkAccess||result.sandbox==='workspace-write'&&result.networkAccess)throw invalid();
    return result;
  }
  const ceiling=permissions(defaults.permissions,admitted?.policy.access==='parent'?admitted.policy.permissions:{...limits,sandbox:defaults.permissions?.sandbox==='workspace-write'?'workspace-write':'read-only'});
  function resolve(options={}){
    selectCapabilities(workerCapabilities,options);
    if(options.workspace!==undefined&&options.workspace!=='isolated')throw invalid();
    const model=options.model??defaults.model??configuredModel;
    const selected=catalog.find(item=>item.model===model);
    if(!selected)throw invalid();
    const effort=options.effort??defaults.effort??(model===config.model?config.model_reasoning_effort:undefined)??selected.defaultReasoningEffort;
    const maxAttempts=options.maxAttempts??defaults.maxAttempts??5;
    if(!selected.supportedReasoningEfforts.some(item=>item.reasoningEffort===effort)||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5)throw invalid();
    const effectivePermissions=permissions(options.permissions,ceiling);
    if(options.workspace==='isolated'&&effectivePermissions.sandbox==='read-only')throw invalid();
    const workspace=options.workspace??(effectivePermissions.sandbox==='read-only'?undefined:defaults.workspace);
    return{model,effort,maxAttempts,permissions:effectivePermissions,...(workspace?{workspace}:{})};
  }
  resolve();
  return{resolve};
}
