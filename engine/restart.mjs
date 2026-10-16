import {fault} from '../foundation/client.mjs';

export function restartPlan(state,request,{requireReconciliation=true}={}){
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(key=>!['position','attempt','reconciliation'].includes(key))||!Number.isInteger(request.position)||request.position<0||request.position>=1000||!Number.isInteger(request.attempt)||request.attempt<0||request.attempt>1000)throw fault('RESTART_INPUT','Restart requires an exact worker position and observed attempt');
  if(requireReconciliation&&(typeof request.reconciliation!=='string'||!request.reconciliation.trim()||request.reconciliation.length>2000))throw fault('RESTART_RECONCILE','Record how you reconciled external effects for this worker and every later worker');
  if(!state||state.acceptingControls||!['completed','failed','blocked','paused','stopped'].includes(state.status)||state.cleanup?.serverExited!==true||state.cleanup?.jobEmpty!==true||state.cleanup?.ownershipScope!=='windows-job-members')throw fault('RESTART_ACTIVE','Wait for the run to settle with verified owned-job termination before restarting');
  const worker=state.workers[request.position];
  if(!worker||!['failed','unknown'].includes(worker.status))throw fault('RESTART_WORKER','Restart requires a failed or cancelled worker');
  if((worker.attempts??0)!==request.attempt)throw fault('CONTROL_ATTEMPT','Restart targets an outdated worker attempt');
  if(state.workers.slice(0,request.position).some(worker=>worker.status!=='completed'))throw fault('RESTART_PREFIX','Restart the earliest unsuccessful worker first');
  let invocationSeq=null,firstAffectedPosition=request.position;
  if(state.compositionVersion===1){
    invocationSeq=worker.invocation?.parentSeq??worker.invocation?.seq;
    if(!Number.isSafeInteger(invocationSeq)||invocationSeq<1)throw fault('RESTART_DRAIN','Composed restart requires the actual invocation binding');
    let changed=true;while(changed){changed=false;for(const item of state.workers)if(item.invocation?.seq>=invocationSeq&&item.invocation.parentSeq!==null&&item.invocation.parentSeq<invocationSeq){invocationSeq=item.invocation.parentSeq;changed=true;}}
    firstAffectedPosition=Math.min(request.position,...state.workers.filter(item=>item.invocation?.seq>=invocationSeq).map(item=>item.position));
  }
  const affected=state.workers.slice(firstAffectedPosition);
  for(const item of affected){
    if(['running','unknown'].includes(item.status)&&!(item.attempts>(item.attemptOffset??0)))throw fault('RESTART_DRAIN','Unknown execution has no owned termination evidence');
    if((item.attempts??0)>(item.attemptOffset??0)){
      const cleanup=item.evidence?.cleanup;
      if(cleanup?.serverExited!==true||cleanup.jobEmpty!==true||cleanup.ownershipScope!=='windows-job-members'||cleanup.error||cleanup.nativeTerminals?.error||item.notStarted!==true&&cleanup.nativeTerminals?.inventoryEmpty!==true)throw fault('RESTART_DRAIN','Every affected execution must have verified owned-job termination and successful native cleanup');
    }
  }
  if(state.attempts>=state.maxAgents)throw fault('AGENT_LIMIT','No lifetime worker attempts remain for restart');
  return{position:request.position,attempt:request.attempt,...(invocationSeq===null?{}:{invocationSeq,firstAffectedPosition}),affected:affected.map(item=>({position:item.position,status:item.status,attempts:item.attempts??0,...(item.origin?{origin:structuredClone(item.origin)}:{})})),...(requireReconciliation?{reconciliation:request.reconciliation.trim()}:{})};
}

export function restartPreview(state){
  const position=state.workers.findIndex(worker=>['failed','unknown'].includes(worker.status));
  if(position<0)return null;
  const attempt=state.workers[position].attempts??0;
  try{return{eligible:true,...restartPlan(state,{position,attempt},{requireReconciliation:false})};}
  catch(error){return{eligible:false,position,attempt,reason:error.message,code:error.code};}
}
