// The doctor boundary accepts only known labels and scalar evidence. Never
// serialize source objects, messages, accessors or arbitrary nested diagnostics.
const stages=new Set(['authentication','windows-readiness','buffered-command','streamed-command','pty-command','cancellation']);
const codes=new Set([
 'CHECK_FAILED','ADMISSION_FAILED','AUTH_UNSUPPORTED','CONFIG_UNSUPPORTED','VERSION_UNSUPPORTED',
 'LAUNCH_INVALID','JOB_BUILD','JOB_PLATFORM','SANDBOX_NOT_READY','COMMAND_FAILED',
 'CANCEL_NOT_STARTED','CANCEL_EARLY_EXIT','CANCEL_UNVERIFIED','CLIENT_CLOSED',
 'SERVER_START','SERVER_EXIT','TRANSPORT_ERROR','PROTOCOL_ERROR','PROTOCOL_LIMIT',
 'REQUEST_LIMIT','REQUEST_TIMEOUT','RPC_ERROR','NOTIFICATION_ERROR','MODEL_CATALOG',
 'DISCOVERY_CLEANUP','ADMISSION_CLEANUP','SETUP_CLEANUP','WORKER_CAPABILITIES','WORKER_SETTINGS','WORKER_DRAIN','WORKER_CLEANUP',
 'WORKSPACE_BACKEND','WORKSPACE_POLICY',
]);
function field(source,key){
 if(!source||typeof source!=='object')return undefined;
 try{return Object.getOwnPropertyDescriptor(source,key)?.value;}catch{return undefined;}
}
function array(value){try{return Array.isArray(value);}catch{return false;}}
function record(value){try{return value!==null&&typeof value==='object'&&!Array.isArray(value);}catch{return false;}}
function errorSummary(source){
 const code=field(source,'code');
 return {code:typeof code==='string'&&code.length<=64&&codes.has(code)?code:'CHECK_FAILED'};
}
function boolean(source,target,key){const value=field(source,key);if(typeof value==='boolean')target[key]=value;}
function cleanupSummary(source){
 const exited=field(source,'serverExited'),summary={serverExited:typeof exited==='boolean'?exited:null,descendants:'notVerified'};
 boolean(source,summary,'forced');boolean(source,summary,'jobEmpty');
 if(field(source,'ownershipScope')==='windows-job-members')summary.ownershipScope='windows-job-members';
 const error=field(source,'error');if(error!==undefined)summary.error=errorSummary(error);
 return summary;
}
function startupSummary(source){
 const entries=field(source,'startup');if(!array(entries))return undefined;
 const count=field(entries,'length'),length=Number.isSafeInteger(count)&&count>=0?count:0,boundaries=[];
 for(let i=0;i<Math.min(length,3);i++){
  const entry=field(entries,String(i)),stage=field(entry,'stage');
  if(['discovery','admission','setup'].includes(stage))boundaries.push({stage,cleanup:cleanupSummary(field(entry,'cleanup'))});
 }
 return{boundaries,truncated:length>3};
}
function evidenceSummary(source,name){
 const summary={};
 if(name==='authentication'){
  if(field(source,'mode')==='chatgpt')summary.mode='chatgpt';
  if(field(source,'provider')==='openai')summary.provider='openai';
 }else if(name==='windows-readiness'){
  if(field(source,'status')==='ready')summary.status='ready';
  boolean(source,summary,'commandProven');
 }else{
  // Failure facts must be supplied by the probe. In particular, do not infer
  // an exit code or marker observation from COMMAND_FAILED or a message.
  const exitCode=field(source,'exitCode');
  if(Number.isInteger(exitCode)&&exitCode>=-2147483648&&exitCode<=4294967295)summary.exitCode=exitCode;
  boolean(source,summary,'markerObserved');boolean(source,summary,'outputTruncated');
  if(field(source,'marker')==='FOUNDATION_OK')summary.marker='FOUNDATION_OK';
  if(name==='cancellation'){
   boolean(source,summary,'terminalResponse');
   if(field(source,'descendants')==='notVerified')summary.descendants='notVerified';
  }else{
   const policy=field(source,'policy');
   if(field(policy,'type')==='readOnly'&&field(policy,'networkAccess')===false)summary.policy={type:'readOnly',networkAccess:false};
  }
 }
 return Object.keys(summary).length?summary:undefined;
}
function admissionSummary(source,admitted){
 if(!record(source))return undefined;
 const status=field(source,'status');
 const summary={status:status==='failed'||status==='running'||status==='passed'&&admitted?status:'unknown',inferenceRequests:0,runnerEquivalence:'notVerified',stages:[]};
 const entries=field(source,'stages');
 if(array(entries)){
  const count=field(entries,'length'),length=Number.isSafeInteger(count)&&count>=0?count:0;
  for(let i=0;i<Math.min(length,6);i++){
   const entry=field(entries,String(i)),name=field(entry,'name'),state=field(entry,'status');
   if(!stages.has(name))continue;
   const stage={name,status:['passed','failed','running'].includes(state)?state:'unknown'};
   const evidence=evidenceSummary(field(entry,'evidence'),name),error=field(entry,'error');
   if(evidence)stage.evidence=evidence;
   if(error!==undefined)stage.error=errorSummary(error);
   summary.stages.push(stage);
  }
  if(length>6)summary.stagesTruncated=true;
 }
 const error=field(source,'error');if(error!==undefined)summary.error=errorSummary(error);
 summary.cleanup=cleanupSummary(field(source,'cleanup'));
 return summary;
}

export function doctorFailure(error,{stage='backend',backend,admission,cleanup}={}){
 const phase=['runtime','backend','cleanup'].includes(stage)?stage:'backend';
 const source=admission??field(error,'admission'),summary=admissionSummary(source,phase==='cleanup');
 // The probe owns admission cleanup. A later backend close is a distinct
 // boundary; its ownership cannot be established from the probe receipt.
 const ownedCleanup=cleanup!==undefined?cleanup:field(error,'cleanup')!==undefined?field(error,'cleanup'):phase==='cleanup'?undefined:field(source,'cleanup');
 const startup=startupSummary(ownedCleanup);
 let failedStage=phase;
 if(phase==='backend'&&summary?.status==='failed'){
  failedStage=summary.stages.find(item=>item.status==='failed')?.name??(!summary.error&&summary.cleanup.serverExited===false?'cleanup':'admission');
 }else if(phase==='backend'&&startup?.boundaries.length)failedStage=startup.boundaries.at(-1).stage;
 return {status:'failed',inferenceRequests:0,...(['mxc','configured'].includes(backend)?{backend}:{}),stage:failedStage,error:errorSummary(error),...(summary?{admission:summary}:{}),cleanup:cleanupSummary(ownedCleanup),...(startup?{startup:startup.boundaries,...(startup.truncated?{startupTruncated:true}:{})}:{})};
}
