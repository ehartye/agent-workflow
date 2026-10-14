// Backend-only controlled stdio fixture. No native executable, compiler, installed
// dependencies, real run data or model inference. All files live in the test cwd.
import {createInterface} from 'node:readline';
import {appendFileSync,readFileSync} from 'node:fs';
import {writeFile,readdir,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import childProcess from 'node:child_process';
import {registerHooks,syncBuiltinESMExports} from 'node:module';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';

const mode=process.argv[2],self=fileURLToPath(import.meta.url);
const secret='BACKEND_SECRET_SENTINEL private@example.invalid';
const config={model_provider:'openai',forced_login_method:'chatgpt',approval_policy:'never',sandbox_mode:'read-only',model:'fixture-model',model_reasoning_effort:'low',
  features:Object.fromEntries(['apps','hooks','codex_hooks','remote_plugin','multi_agent','browser_use','browser_use_external','browser_use_full_cdp_access','computer_use'].map(key=>[key,false])),
  agents:{enabled:false},allow_login_shell:false,web_search:'disabled',notify:[]};

if(mode==='cli'){
  if(process.argv[3]==='--version')process.stdout.write('codex-cli 0.162.1\n');
  else if(process.argv.slice(3).join(' ')==='login status'){
    const login=JSON.parse(readFileSync('scenario.json','utf8')).login;
    if(login==='absent'){process.stderr.write('Not logged in\n');process.exitCode=1;}
    else if(login==='warning-absent'){process.stderr.write(`WARNING: ${secret}\nNot logged in\n`);process.exitCode=1;}
    else if(login==='unknown'){process.stderr.write(secret);process.exitCode=1;}
    else if(login==='wrong-exit'){process.stderr.write('Not logged in\n');process.exitCode=2;}
    else if(login==='timeout')setInterval(()=>{},1000);
    else process.stdout.write('Logged in using ChatGPT\n');
  }
  else throw Error('Unexpected CLI request');
}else if(mode==='server'){
  const stage=process.argv[3],all=JSON.parse(readFileSync('scenario.json','utf8')),scenario=all[stage]??{};
  const commands=new Map();let experimentalApi=false;
  const send=message=>process.stdout.write(JSON.stringify(message)+'\n');
  const reply=(id,result)=>send({id,result});
  const notify=(method,params)=>send({method,params});
  const fail=id=>send({id,error:{code:-32000,message:secret}});
  createInterface({input:process.stdin}).on('line',line=>{
    const request=JSON.parse(line),{id,method,params}=request;
    if(method==='initialized')return;
    appendFileSync('trace.jsonl',JSON.stringify({stage,method,...(method==='thread/start'?{experimentalRawEvents:params.experimentalRawEvents===true,experimentalApi,roots:params.selectedCapabilityRoots??[]}:{}) ,...(method==='turn/start'?{inputTypes:params.input.map(item=>item.type),nativeSkillGuidance:params.input.some(item=>item.type==='text'&&item.text.includes('skills.list')&&item.text.includes('skills.read'))}:{})})+'\n');
    if(scenario.requestFailure===method)return fail(id);
    if(method==='initialize'){experimentalApi=params.capabilities.experimentalApi;return reply(id,{userAgent:'fixture/0.162.1'});}
    if(method==='config/read')return reply(id,{config:{...config,...(stage==='worker'&&all.nativeSkills?{features:{...config.features,code_mode:{direct_only_tool_namespaces:['skills']}}}:{}),...(scenario.badIntegration?{mcp_servers:{'bad\nidentifier':{enabled:true}}}:{})},layers:[{config:{}}]});
    if(method==='account/read')return reply(id,{account:{type:'chatgpt',email:secret}});
    if(method==='windowsSandbox/readiness')return reply(id,{status:'ready'});
    if(method==='model/list')return reply(id,{data:scenario.badCatalog?null:[{model:'fixture-model',isDefault:true,defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low'}]}],nextCursor:null});
    if(method==='command/exec'){
      if(params.sandboxPolicy.type!=='readOnly'||params.sandboxPolicy.networkAccess!==false)throw Error('Probe broadened permissions');
      if(params.processId.startsWith('capability-')){
        if(scenario.sourceFailure)return reply(id,{exitCode:7,stdout:secret,stderr:secret});
        promisify(childProcess.execFile)(params.command[0],params.command.slice(1),{cwd:params.cwd,env:process.env,windowsHide:true,timeout:params.timeoutMs,maxBuffer:8192}).then(result=>setTimeout(()=>reply(id,{exitCode:0,...result}),scenario.sourceDelayMs??0),error=>reply(id,{exitCode:Number.isInteger(error.code)?error.code:1,stdout:'',stderr:''}));return;
      }
      const cancel=params.processId.startsWith('cancel-');
      if(params.streamStdoutStderr)notify('command/exec/outputDelta',{processId:params.processId,stream:'stdout',deltaBase64:Buffer.from(cancel?'READY\n':'FOUNDATION_OK\n').toString('base64'),capReached:false});
      if(cancel){commands.set(params.processId,id);return;}
      return reply(id,{exitCode:0,stdout:'FOUNDATION_OK\n',stderr:''});
    }
    if(method==='command/exec/terminate'){reply(id,{});return reply(commands.get(params.processId),{exitCode:1,stdout:'',stderr:''});}
    if(method==='thread/start'){
      if(!experimentalApi||params.experimentalRawEvents!==true)return fail(id);
      return reply(id,{thread:{id:'fixture-thread'},modelProvider:'openai',approvalPolicy:'never',sandbox:{type:'readOnly',networkAccess:false},model:params.model,reasoningEffort:params.config.model_reasoning_effort});
    }
    if(method==='mcpServerStatus/list'&&scenario.inventoryDelayMs)return setTimeout(()=>reply(id,{data:[],nextCursor:null}),scenario.inventoryDelayMs);
    if(method==='mcpServerStatus/list'||method==='thread/backgroundTerminals/list')return reply(id,{data:[],nextCursor:null});
    if(method==='turn/start'){
      reply(id,{turn:{id:'fixture-turn'}});
      if(all.nativeSkills){
        const calls=scenario.nativeCalls??'paired';
        if(calls==='paired'||calls==='unpaired')for(const name of ['list','read']){
          notify('rawResponseItem/completed',{threadId:params.threadId,turnId:'fixture-turn',item:{type:'function_call',call_id:`native-${name}`,namespace:'skills',name,arguments:'PRIVATE_NATIVE_SKILL_INPUT'}});
          if(calls==='paired'||name==='list')notify('rawResponseItem/completed',{threadId:params.threadId,turnId:'fixture-turn',item:{type:'function_call_output',call_id:`native-${name}`,output:'PRIVATE_NATIVE_SKILL_BODY'}});
        }
        if(calls==='execOnly'){
          notify('rawResponseItem/completed',{threadId:params.threadId,turnId:'fixture-turn',item:{type:'custom_tool_call',call_id:'exec-only',name:'exec',input:'PRIVATE_MANUAL_CLI_INPUT'}});
          notify('rawResponseItem/completed',{threadId:params.threadId,turnId:'fixture-turn',item:{type:'custom_tool_call_output',call_id:'exec-only',output:'PRIVATE_MANUAL_CLI_OUTPUT'}});
        }
        if(['forgedCustom','forgedAlias','unsupportedReuse'].includes(calls))for(const name of ['list','read']){
          const callId=`native-${name}`;
          if(calls==='unsupportedReuse')notify('rawResponseItem/completed',{threadId:params.threadId,turnId:'fixture-turn',item:{type:'function_call',call_id:callId,namespace:'other',name:'read',arguments:'PRIVATE_NATIVE_SKILL_INPUT'}});
          const item=calls==='forgedCustom'?{type:'custom_tool_call',call_id:callId,namespace:'skills',name,input:'PRIVATE_NATIVE_SKILL_INPUT'}:
            {type:'function_call',call_id:callId,...(calls==='forgedAlias'?{name:`skills.${name}`}:{namespace:'skills',name}),arguments:'PRIVATE_NATIVE_SKILL_INPUT'};
          notify('rawResponseItem/completed',{threadId:params.threadId,turnId:'fixture-turn',item});
          notify('rawResponseItem/completed',{threadId:params.threadId,turnId:'fixture-turn',item:{type:calls==='forgedCustom'?'custom_tool_call_output':'function_call_output',call_id:callId,output:'PRIVATE_NATIVE_SKILL_BODY'}});
        }
        if(calls!=='paired')notify('item/completed',{threadId:params.threadId,turnId:'fixture-turn',item:{id:'manual',type:'commandExecution',command:'manual file/CLI imitation',status:'completed',exitCode:0}});
      }
      notify('item/completed',{threadId:params.threadId,turnId:'fixture-turn',item:{id:'answer',type:'agentMessage',phase:'final_answer',text:'BACKEND_OK'}});
      return notify('turn/completed',{threadId:params.threadId,turn:{id:'fixture-turn',status:'completed',items:[]}});
    }
    throw Error('Unexpected protocol method');
  }).on('close',()=>{
    // A controlled receipt tests backend proof handling. This is not a native
    // Windows job containment test (owned by windows-job.test.mjs).
    if(process.platform==='win32'&&scenario.close!=='unverified')process.stderr.write('WORKFLOW_JOB_READY\nWORKFLOW_JOB_DRAINED\n');
  });
}else if(mode==='construct'){
  const scenario=JSON.parse(process.argv[3]);
  await writeFile('scenario.json',JSON.stringify(scenario));
  await writeFile('trace.jsonl','');
  let workerCapabilities,selectedRoot;
  if(scenario.nativeSkills){
    selectedRoot=join(process.cwd(),'selected-skill');await mkdir(selectedRoot);
    const path=join(selectedRoot,'SKILL.md'),body='Opaque native fixture skill';await writeFile(path,body);
    workerCapabilities={version:1,skills:[{id:'native-fixture',name:'fixture:skill',root:process.cwd(),path,sha256:createHash('sha256').update(body).digest('hex'),references:[]}],tools:[]};
  }
  const connections=[],closeCalls={},stageByClient=new WeakMap();let connecting;
  const {AppServer,diagnostic,fault}=await import('../../foundation/client.mjs');
  const nativeConnect=AppServer.connect.bind(AppServer),nativeClose=AppServer.prototype.close;
  const execFile=childProcess.execFile;
  // Only replace native executable preflight with real, deterministic Node CLI
  // subprocesses; AppServer spawn and its protocol/close transport stay real.
  childProcess.execFile=(command,args,options,callback)=>{
    if(command!==process.execPath||!['--version','login'].includes(args[0]))throw Error('Unexpected preflight executable');
    if(args[0]==='login'&&scenario.login==='missing')return execFile(join(process.cwd(),'missing-native.exe'),args,options,callback);
    return execFile(process.execPath,[self,'cli',...args],{...options,...(args[0]==='login'&&scenario.login==='timeout'?{timeout:50}:{})},callback);
  };
  childProcess.execFile[promisify.custom]=(...args)=>new Promise((resolve,reject)=>{
    childProcess.execFile(...args,(error,stdout,stderr)=>error?reject(Object.assign(error,{stdout,stderr})):resolve({stdout,stderr}));
  });
  syncBuiltinESMExports();
  AppServer.connect=async options=>{
    const stage=['discovery','admission','setup'][connections.length]??'worker';connections.push(stage);connecting=stage;
    appendFileSync('trace.jsonl',JSON.stringify({stage,method:'launch',directSkills:options.args.includes('features.code_mode.direct_only_tool_namespaces=["skills"]')})+'\n');
    const client=await nativeConnect({...options,command:self,args:['server',stage],jobHost:options.jobHost?process.execPath:undefined,...(!options.jobHost?{command:process.execPath,args:[self,'server',stage]}:{}),requestTimeoutMs:scenario.timeoutMs?scenario.timeoutMs+1000:1000,shutdownMs:100});
    stageByClient.set(client,stage);return client;
  };
  AppServer.prototype.close=async function(){
    const stage=stageByClient.get(this)??connecting,control=scenario[stage]??{};
    closeCalls[stage]=(closeCalls[stage]??0)+1;
    const receipt=await nativeClose.call(this); // positively drain the real fixture
    if(control.close==='throw')throw Error(secret);
    if(control.close==='unverified')receipt.serverExited=false;
    if(control.close==='job-false')receipt.jobEmpty=false;
    if(control.close==='job-missing')delete receipt.jobEmpty;
    if(control.close==='server-missing')delete receipt.serverExited;
    if(control.close==='error')receipt.error=Error(secret);
    if(control.forced)receipt.forced=true;
    if(control.extra)Object.assign(receipt,{stdout:secret,account:{email:secret}});
    return receipt;
  };
  globalThis.backendFixtureBuild=async directory=>{
    if(scenario.buildFailure)throw fault('JOB_BUILD','Controlled job-host build failure');
    const host=join(directory,'fixture-host');await writeFile(host,'owned fixture storage');return host;
  };
  registerHooks({load(url,context,nextLoad){
    if(url===new URL('../../foundation/windows-job.mjs',import.meta.url).href)return{format:'module',source:'export const buildJobHost=globalThis.backendFixtureBuild;',shortCircuit:true};
    // Schemas are not exercised by this owner. Keep the actual worker session
    // and turn transport, and fail if a test ever tries schema validation.
    if(url===new URL('../../engine/schema.mjs',import.meta.url).href)return{format:'module',source:'export function compileSchema(){throw Error("Schema validation is outside this dependency-free fixture");}',shortCircuit:true};
    return nextLoad(url,context);
  }});
  const {createManagedBackend,workerCleanup}=await import('../../engine/backend.mjs');
  let report;
  if(scenario.operation==='workerCleanup'){
    const native={error:{code:'TERMINAL_REMAINING',message:'Native terminals remain'},descendants:'notVerified'};
    report={cleanup:workerCleanup({serverExited:true,jobEmpty:true,descendants:'notVerified'},native,true),unverified:workerCleanup({serverExited:true,jobEmpty:false},undefined,true)};
  }else{
    let backend;
    try{
      backend=await createManagedBackend({executable:process.execPath,cwd:process.cwd(),workerCapabilities});
      if(scenario.operation==='readiness-restart'){
        const {runWorkflow,readRun}=await import('../../engine/controller.mjs');
        const {restartPlan,restartPreview}=await import('../../engine/restart.mjs');
        const runDir=join(process.cwd(),'run');
        await runWorkflow({runDir,sessionId:'fixture',backend,workerCapabilities,script:'export const meta={name:"Readiness recovery",description:"Fixture failure and explicit restart admission"};return await agent("Controlled fixture answer",{skills:["native-fixture"]});'});
        const state=await readRun(runDir),request={position:0,attempt:1};
        let restart,withoutReconciliation;
        try{restartPlan(state,request);}catch(error){withoutReconciliation=diagnostic(error);}
        try{restart={plan:restartPlan(state,{...request,reconciliation:'Reviewed the failed read-only readiness command and verified native and owned-job drain.'})};}
        catch(error){restart={error:diagnostic(error)};}
        report={ok:true,state,preview:restartPreview(state),restart,withoutReconciliation,unchanged:JSON.stringify(await readRun(runDir))===JSON.stringify(state)};
      }else{
      const result=scenario.execute?await backend.execute({prompt:'Controlled fixture answer',position:0,options:{...(scenario.nativeSkills?{skills:['native-fixture']}:{}),...(scenario.timeoutMs?{timeoutMs:scenario.timeoutMs}:{})}}):undefined;
      const closing=backend.close(),again=backend.close();
      report={ok:true,admission:backend.admission,value:result?.value,workerEvidence:result?.evidence,cleanup:await closing,sameClose:closing===again};
      }
    }catch(error){
      const {doctorFailure}=await import('../../bin/doctor-diagnostics.mjs');
      report={ok:false,primary:diagnostic(error),cleanup:error.cleanup,evidence:error.evidence,admission:error.admission,noInference:error.noInference,noProcessStarted:error.noProcessStarted,notStarted:error.notStarted,doctor:doctorFailure(error,{stage:'backend',backend:'configured'})};
      if(backend)report.aggregate=await backend.close();
    }
  }
  const trace=readFileSync('trace.jsonl','utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  process.stdout.write(JSON.stringify({...report,connections,closeCalls,trace,selectedRoot,directories:await readdir(process.cwd())})+'\n');
}else throw Error('Unexpected fixture mode');
