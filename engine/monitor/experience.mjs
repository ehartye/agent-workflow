import {compileSchema} from '../schema.mjs';

const contract='agent-workflow.task.v1';
const fields=['contract','taskId','outcome','summary','blockers','artifacts','checks'];
const validators=new Map();
function validatorFor(schema){
  const key=JSON.stringify(schema);if(Buffer.byteLength(key)>32768)return null;
  if(validators.has(key))return validators.get(key);
  let validator=null;try{validator=compileSchema(schema);}catch{ /* Invalid retained schema remains unverified. */ }
  validators.set(key,validator);while(validators.size>64)validators.delete(validators.keys().next().value);
  return validator;
}
const sameRun=(a,b)=>a?.dataInstanceId===b?.dataInstanceId&&a?.runId===b?.runId&&a?.runtimeId===b?.runtimeId;
const exact=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&names.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>names.includes(key));
function taskReport(worker){
  if(worker.truncations?.includes('result')||worker.truncations?.includes('options'))return null;
  const schema=worker.options?.schema,value=worker.result;
  if(schema?.properties?.contract?.const!==contract||!schema.required?.includes('contract')||schema.additionalProperties!==false||!fields.every(key=>schema.required.includes(key)))return null;
  if(!exact(value,fields)||value.contract!==contract||typeof value.taskId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value.taskId)||!['delivered','blocked','incomplete'].includes(value.outcome)||typeof value.summary!=='string'||value.summary.length>2000)return null;
  if(!Array.isArray(value.artifacts)||value.artifacts.length>32||!Array.isArray(value.checks)||value.checks.length>32||!Array.isArray(value.blockers)||value.blockers.length>16)return null;
  const refs=value=>Array.isArray(value)&&value.every(ref=>typeof ref==='string');
  if(value.blockers.some(item=>!exact(item,['code','detail','evidenceRefs'])||typeof item.code!=='string'||typeof item.detail!=='string'||!refs(item.evidenceRefs)))return null;
  if(value.checks.some(item=>!exact(item,['checkId','status','evidenceRefs'])||typeof item.checkId!=='string'||!['passed','failed','notRun','unknown'].includes(item.status)||!refs(item.evidenceRefs)))return null;
  if(value.artifacts.some(item=>!exact(item,['claimId','relativePath','sha256','bytes'])||typeof item.claimId!=='string'||!item.claimId||typeof item.relativePath!=='string'||!item.relativePath||item.sha256!==null&&!/^[a-f0-9]{64}$/.test(item.sha256)||item.bytes!==null&&(!Number.isSafeInteger(item.bytes)||item.bytes<0)))return null;
  if(new Set(value.artifacts.map(item=>item.claimId)).size!==value.artifacts.length)return null;
  try{return validatorFor(schema)?.validate(value)?value:null;}catch{return null;}
}

// This projection accepts authoritative receipt evidence only. Worker results,
// workspace filenames and self-reported checks are claims, never receipts.
export function projectMonitorExperience({run,summary,workers,evidence=[]}){
  const phases=new Map(),artifacts=[];
  const projected=workers.map(worker=>{
    const ref={...run,generation:summary.generation,position:worker.position};
    const label=typeof worker.phase==='string'?worker.phase:typeof worker.options?.phase==='string'?worker.options.phase:null;
    const phaseKey=label?JSON.stringify([summary.generation,label]):null;
    if(phaseKey){if(!phases.has(phaseKey))phases.set(phaseKey,{key:phaseKey,label,members:[]});phases.get(phaseKey).members.push(ref);}
    const task={protocol:null,declaredOutcome:null,verification:'unverified',reason:'No validated task report. Execution completion does not establish delivery.',artifactIds:[]};
    const report=taskReport(worker);
    if(report){
      task.protocol=contract;task.declaredOutcome=report.outcome;task.reason='Authoritative artifact and acceptance receipts are unavailable.';
      const claims=report.artifacts.map((claim,index)=>{
        const matches=evidence.filter(item=>sameRun(item.worker,run)&&item.worker.generation===ref.generation&&item.worker.position===ref.position&&item.claimId===claim.claimId);
        const retained=matches.length===1?matches[0]:null,hasReceipt=retained?.evidenceRef&&typeof retained.evidenceRef==='object';
        const item={id:retained?.id??`${summary.generation}:${worker.position}:${index}`,worker:ref,claimId:claim.claimId,
          integrity:hasReceipt&&['unverified','verified','missing','mismatch','unavailable'].includes(retained.integrity)?retained.integrity:'unavailable',
          acceptance:hasReceipt&&['notRun','passed','failed','unknown'].includes(retained.acceptance)?retained.acceptance:'unknown',evidenceRef:hasReceipt?retained.evidenceRef:null};
        artifacts.push(item);task.artifactIds.push(item.id);return item;
      });
      if(claims.some(item=>['missing','mismatch'].includes(item.integrity)||item.acceptance==='failed')){task.verification='rejected';task.reason='Retained artifact or acceptance evidence rejects delivery.';}
      else if(report.outcome==='delivered'&&claims.length&&claims.every(item=>item.integrity==='verified'&&item.acceptance==='passed')&&!worker.cached){task.verification='verified';task.reason=null;}
      if(worker.cached&&task.verification!=='rejected'){task.verification='unverified';task.reason=`Cached evidence from generation ${worker.reusedFrom?.generation??'unknown'} does not verify current file freshness.`;}
    }
    const available=Array.isArray(worker.dependencies)&&worker.dependencies.every(value=>Number.isInteger(value)&&value>=0&&value<1000);
    return{ref,executionStatus:worker.status,phaseKey,dependencies:{available,prerequisites:available?worker.dependencies.map(position=>({...run,generation:summary.generation,position})):[]},task};
  });
  return{version:1,run,generation:summary.generation,executionStatus:summary.status,phases:[...phases.values()],workers:projected,artifacts};
}
