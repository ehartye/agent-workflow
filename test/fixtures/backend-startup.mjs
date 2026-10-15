// Backend-only controlled stdio fixture. No native executable, compiler, installed
// dependencies, real run data or model inference. All files live in the test cwd.
import {createInterface} from 'node:readline';
import {appendFileSync,readFileSync,unlinkSync,writeFileSync} from 'node:fs';
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
  features:Object.fromEntries(['apps','hooks','codex_hooks','remote_plugin','multi_agent','multi_agent_v2','browser_use','browser_use_external','browser_use_full_cdp_access','computer_use'].map(key=>[key,false])),
  agents:{enabled:false},allow_login_shell:false,web_search:'disabled',notify:[]};

if(mode==='cli'){
  if(process.argv[3]==='--version'){
    const version=JSON.parse(readFileSync('scenario.json','utf8')).version;
    if(version==='failed'){process.stdout.write(secret);process.stderr.write(secret+'!');process.exitCode=7;}
    else process.stdout.write('codex-cli 0.162.1\n');
  }
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
  process.chdir(process.env.BACKEND_FIXTURE_ROOT??process.cwd());
  const stage=process.argv[3],all=JSON.parse(readFileSync('scenario.json','utf8')),scenario=all[stage]??{};
  const full=all.parentAccess&&!(stage==='worker'&&all.workerOptions?.permissions?.sandbox==='read-only');
  const sandboxPolicy=full?{type:'dangerFullAccess'}:{type:'readOnly',networkAccess:false};
  const commands=new Map();let experimentalApi=false,selectedRoots=[];
  const send=message=>process.stdout.write(JSON.stringify(message)+'\n');
  const reply=(id,result)=>send({id,result});
  const notify=(method,params)=>send({method,params});
  const fail=id=>send({id,error:{code:-32000,message:secret}});
  createInterface({input:process.stdin}).on('line',line=>{
    const request=JSON.parse(line),{id,method,params}=request;
    if(method==='initialized')return;
    appendFileSync('trace.jsonl',JSON.stringify({stage,method,...(method==='command/exec'?{commandTimeoutMs:params.timeoutMs}:{}),...(params.sandboxPolicy?{sandboxPolicy:params.sandboxPolicy}:{}),...(params.runtimeWorkspaceRoots?{cwd:params.cwd,runtimeWorkspaceRoots:params.runtimeWorkspaceRoots}:{}),...(method==='thread/start'?{sandbox:params.sandbox,experimentalRawEvents:params.experimentalRawEvents===true,experimentalApi,roots:params.selectedCapabilityRoots??[]}:{}) ,...(method==='turn/start'?{inputTypes:params.input.map(item=>item.type),nativeSkillGuidance:params.input.some(item=>item.type==='text'&&item.text.includes('skills.list')&&item.text.includes('skills.read'))}:{})})+'\n');
    if(scenario.requestFailure===method)return fail(id);
    if(method==='initialize'){experimentalApi=params.capabilities.experimentalApi;return reply(id,{userAgent:'fixture/0.162.1'});}
    if(method==='config/read')return reply(id,{config:{...config,sandbox_mode:full?'danger-full-access':'read-only',...(all.parentAccess?{plugins:{'fixture-plugin':{enabled:true,token:secret}},mcp_servers:{'fixture-server':{enabled:scenario.mcpEnabled!==false,token:secret,...(Object.hasOwn(scenario,'mcpStartupTimeoutSec')?{startup_timeout_sec:scenario.mcpStartupTimeoutSec}:{})}}}:{}),...(stage==='worker'&&(all.nativeSkills||all.parentAccess)?{features:{...config.features,code_mode:{direct_only_tool_namespaces:['skills']}}}:{}),...(scenario.integrationDrift?{apps:{'new-integration':{enabled:true}}}:{}),...(scenario.badIntegration?{mcp_servers:{'bad\nidentifier':{enabled:true}}}:{})},layers:[{config:{}}]});
    if(method==='account/read')return reply(id,{account:{type:'chatgpt',email:secret}});
    if(method==='windowsSandbox/readiness')return reply(id,{status:'ready'});
    if(method==='model/list')return reply(id,{data:scenario.badCatalog?null:[{model:'fixture-model',isDefault:true,defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low'}]}],nextCursor:null});
    if(method==='plugin/installed'){
      if(!experimentalApi)return fail(id);
      return reply(id,{marketplaces:[{plugins:[{id:'fixture-plugin@fixture-market',name:'fixture-plugin',enabled:true,installed:true,availability:'AVAILABLE',disabledReason:null,privateToken:secret}]}],marketplaceLoadErrors:[]});
    }
    if(method==='skills/list'){
      const pluginRoot=join(process.cwd(),'codex-home','plugins','cache','fixture-market','fixture-plugin','1.0.0');
      return reply(id,{data:[{cwd:params.cwds[0],skills:[{name:'fixture:parent-skill',path:join(pluginRoot,'skills','parent','SKILL.md'),pluginId:'fixture-plugin@fixture-market',enabled:true,scope:'user'},...(all.nativeSkills?[{name:'fixture:skill',path:join(process.cwd(),...(all.retainSources?['capability-plugin']:[]),'selected-skill','SKILL.md'),pluginId:null,enabled:true,scope:'user'}]:[])],errors:scenario.partialCatalog?[{message:secret}]:[]}]});
    }
    if(method==='command/exec'){
      if(JSON.stringify(params.sandboxPolicy)!==JSON.stringify(sandboxPolicy))throw Error('Command did not preserve admitted permissions');
      if(params.processId.startsWith('capability-')){
        if(params.processId.startsWith('capability-completion-')&&scenario.completionTransportFailure)return fail(id);
        if(scenario.sourceFailure)return reply(id,{exitCode:7,stdout:secret,stderr:secret});
        promisify(childProcess.execFile)(params.command[0],params.command.slice(1),{cwd:params.cwd,env:process.env,windowsHide:true,timeout:params.timeoutMs,maxBuffer:8192}).then(result=>setTimeout(()=>reply(id,{exitCode:0,...result}),scenario.sourceDelayMs??0),error=>reply(id,{exitCode:Number.isInteger(error.code)?error.code:1,stdout:error.stdout??'',stderr:error.stderr??''}));return;
      }
      const cancel=params.processId.startsWith('cancel-');
      if(params.streamStdoutStderr)notify('command/exec/outputDelta',{processId:params.processId,stream:'stdout',deltaBase64:Buffer.from(cancel?'READY\n':'FOUNDATION_OK\n').toString('base64'),capReached:false});
      if(cancel){commands.set(params.processId,id);return;}
      return reply(id,{exitCode:0,stdout:'FOUNDATION_OK\n',stderr:''});
    }
    if(method==='command/exec/terminate'){reply(id,{});return reply(commands.get(params.processId),{exitCode:1,stdout:'',stderr:''});}
    if(method==='thread/start'){
      if(!experimentalApi||params.experimentalRawEvents!==true)return fail(id);
      selectedRoots=params.selectedCapabilityRoots??[];
      return reply(id,{thread:{id:'fixture-thread'},cwd:params.cwd,runtimeWorkspaceRoots:scenario.wrongWorkspace?[]:params.runtimeWorkspaceRoots,modelProvider:'openai',approvalPolicy:'never',sandbox:scenario.wrongPolicy?{type:'readOnly',networkAccess:false}:sandboxPolicy,model:params.model,reasoningEffort:params.config.model_reasoning_effort});
    }
    if(method==='mcpServerStatus/list'&&scenario.inventoryDelayMs)return setTimeout(()=>reply(id,{data:all.parentAccess?[{name:'fixture-server',runtimeStatus:'ready',tools:{tool:{description:secret}},authStatus:'oAuth',auth:secret}]:[],nextCursor:null}),scenario.inventoryDelayMs);
    if(method==='mcpServerStatus/list'&&all.parentAccess)return reply(id,{data:[{name:'fixture-server',runtimeStatus:'ready',tools:{tool:{description:secret}},authStatus:'oAuth',auth:secret}],nextCursor:null});
    if(method==='mcpServerStatus/list'||method==='thread/backgroundTerminals/list')return reply(id,{data:[],nextCursor:null});
    if(method==='turn/start'){
      reply(id,{turn:{id:'fixture-turn'}});
      // The model has started after source admission. Change only this
      // subprocess fixture's declared original source, never an installed skill.
      const originalSelected=join(process.cwd(),...(all.retainSources?['capability-plugin']:[]),'selected-skill');
      if(scenario.completionSource==='missing')unlinkSync(join(originalSelected,'SKILL.md'));
      if(scenario.completionSource==='changed')writeFileSync(join(originalSelected,'SKILL.md'),'Changed after native admission');
      if(all.nativeSkills||all.parentAccess){
        const calls=scenario.nativeCalls??'paired';
        if(calls==='paired'||calls==='unpaired'){
          notify('rawResponseItem/completed',{threadId:params.threadId,turnId:'fixture-turn',item:{type:'function_call',call_id:'native-list',namespace:'skills',name:'list',arguments:'{}'}});
          notify('rawResponseItem/completed',{threadId:params.threadId,turnId:'fixture-turn',item:{type:'function_call_output',call_id:'native-list',output:'PRIVATE_NATIVE_SKILL_CATALOG'}});
          const selected=[['native-fixture',all.nativeSkills?(selectedRoots.find(root=>root.id==='native-fixture')?.location.path??originalSelected):join(process.cwd(),'codex-home','plugins','cache','fixture-market','fixture-plugin','1.0.0','skills','parent')]];
          if(all.twoSkills&&scenario.nativeRead!=='partial')selected.push(['native-second',join(process.cwd(),'selected-second')]);
          for(const [skillId,path] of selected){
            const root=path.replaceAll('\\','/'),packageUri=`skill://${skillId}/${root}`,callId=`native-read-${skillId}`;
            const argumentsValue={package:packageUri,...(scenario.nativeRead==='cursor'?{cursor:'opaque-native-cursor'}:{}),...(scenario.nativeRead==='reference'?{resource:packageUri+'/references/guide.md'}:{})};
            notify('rawResponseItem/completed',{threadId:params.threadId,turnId:'fixture-turn',item:{type:'function_call',call_id:callId,namespace:'skills',name:'read',arguments:JSON.stringify(argumentsValue)}});
            const output=scenario.nativeRead==='error'?{error:{code:'NOT_FOUND',message:'PRIVATE_NATIVE_READ_ERROR'}}:
              {resource:packageUri+(scenario.nativeRead==='reference'?'/references/guide.md':'/SKILL.md'),skill_root:scenario.nativeRead==='wrong-root'?root+'-unselected':root,contents:'PRIVATE_NATIVE_SKILL_BODY',next_cursor:null};
            if(calls==='paired')notify('rawResponseItem/completed',{threadId:params.threadId,turnId:'fixture-turn',item:{type:'function_call_output',call_id:callId,output:JSON.stringify(output)}});
          }
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
      const finishTurn=()=>{notify('item/completed',{threadId:params.threadId,turnId:'fixture-turn',item:{id:'answer',type:'agentMessage',phase:'final_answer',text:'BACKEND_OK'}});notify('turn/completed',{threadId:params.threadId,turn:{id:'fixture-turn',status:'completed',items:[]}});};
      if(scenario.turnDelayMs)return setTimeout(finishTurn,scenario.turnDelayMs);return finishTurn();
    }
    if(method==='turn/interrupt'){reply(id,{});const finish=()=>notify('turn/completed',{threadId:params.threadId,turn:{id:params.turnId,status:'interrupted',items:[]}});if(scenario.interruptDelayMs)return setTimeout(finish,scenario.interruptDelayMs);return finish();}
    throw Error('Unexpected protocol method');
  }).on('close',()=>{
    // A controlled receipt tests backend proof handling. This is not a native
    // Windows job containment test (owned by windows-job.test.mjs).
    const finish=()=>{
      appendFileSync(join(process.env.BACKEND_FIXTURE_ROOT,'trace.jsonl'),JSON.stringify({stage,method:'fixture/gracefulExit'})+'\n');
      if(process.platform==='win32'&&scenario.close!=='unverified')process.stderr.write('WORKFLOW_JOB_READY\nWORKFLOW_JOB_DRAINED\n');
    };
    if(scenario.closeDelayMs)setTimeout(finish,scenario.closeDelayMs);else finish();
  });
}else if(mode==='construct'){
  const scenario=JSON.parse(process.argv[3]);
  await writeFile('scenario.json',JSON.stringify(scenario));
  await writeFile('trace.jsonl','');
  let workspace;
  if(scenario.workspace){
    const source=join(process.cwd(),'source');await mkdir(source);
    const git=async args=>promisify(childProcess.execFile)('git',args,{cwd:source,windowsHide:true});
    await git(['init']);await writeFile(join(source,'owned.txt'),'Fixture source\n');
    await git(['add','owned.txt']);await git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Fixture']);
    const {captureInputs,createWorkspace}=await import('../../engine/workspaces.mjs');
    const inputs=await captureInputs({source,artifactsDir:join(process.cwd(),'inputs')});
    workspace=await createWorkspace({inputs,artifactsDir:join(process.cwd(),'outputs')});
    if(scenario.workspace==='tampered')workspace.gitPointerHash='0'.repeat(64);
  }
  let workerCapabilities,selectedRoot;
  if(scenario.parentAccess){
    const home=join(process.cwd(),'codex-home'),plugin=join(home,'plugins','cache','fixture-market','fixture-plugin','1.0.0');
    process.env.CODEX_HOME=home;
    await mkdir(join(plugin,'.codex-plugin'),{recursive:true});await mkdir(join(plugin,'skills','parent'),{recursive:true});
    await writeFile(join(plugin,'.codex-plugin','plugin.json'),JSON.stringify({name:'fixture-plugin'}));
    await writeFile(join(plugin,'skills','parent','SKILL.md'),'PARENT_SKILL_BODY_NOT_COPIED');
  }
  if(scenario.nativeSkills){
    const packageRoot=scenario.retainSources?join(process.cwd(),'capability-plugin'):process.cwd();
    selectedRoot=join(packageRoot,'selected-skill');await mkdir(selectedRoot,{recursive:true});
    const path=join(selectedRoot,'SKILL.md'),body='Opaque native fixture skill';await writeFile(path,body);
    workerCapabilities={version:1,skills:[{id:'native-fixture',name:'fixture:skill',root:packageRoot,path,sha256:createHash('sha256').update(body).digest('hex'),references:[]}],tools:[]};
    if(scenario.twoSkills){
      const second=join(process.cwd(),'selected-second');await mkdir(second);const path=join(second,'SKILL.md');await writeFile(path,body);
      workerCapabilities.skills.push({id:'native-second',name:'fixture:second',root:process.cwd(),path,sha256:createHash('sha256').update(body).digest('hex'),references:[]});
    }
  }
  const connections=[],closeCalls={},stageByClient=new WeakMap();let connecting;
  const {AppServer,diagnostic,fault}=await import('../../foundation/client.mjs');
  const nativeConnect=AppServer.connect.bind(AppServer),nativeClose=AppServer.prototype.close;
  const execFile=childProcess.execFile;
  // Only replace native executable preflight with real, deterministic Node CLI
  // subprocesses; AppServer spawn and its protocol/close transport stay real.
  childProcess.execFile=(command,args,options,callback)=>{
    if(command==='git')return execFile(command,args,options,callback);
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
    appendFileSync('trace.jsonl',JSON.stringify({stage,method:'launch',sandbox:options.args.filter(arg=>arg.startsWith('sandbox_mode=')).at(-1)?.split('=')[1].replaceAll('"',''),integrationsDisabled:options.args.includes('features.apps=false'),delegationDisabled:options.args.includes('agents.enabled=false'),directSkills:options.args.includes('features.code_mode.direct_only_tool_namespaces=["skills"]')})+'\n');
    // Real subprocess shutdown needs scheduling headroom during concurrent capture
    // tests. This changes only the fixture; native owned-job deadlines stay intact.
    const client=await nativeConnect({...options,env:{...options.env,BACKEND_FIXTURE_ROOT:process.cwd()},command:self,args:['server',stage],jobHost:options.jobHost?process.execPath:undefined,...(!options.jobHost?{command:process.execPath,args:[self,'server',stage]}:{}),requestTimeoutMs:scenario.timeoutMs?scenario.timeoutMs+1000:1000,shutdownMs:2000});
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
      if(scenario.retainSources)await mkdir(join(process.cwd(),'retained-run'));
      let accessPolicy;
      if(scenario.parentAccess){const {resolveAccess}=await import('../../engine/access-policy.mjs');accessPolicy=structuredClone(resolveAccess({sessionId:'fixture',parentAccess:{version:1,sessionId:'fixture',provenance:'codex-session-context',filesystem:'unrestricted',networkAccess:true,approvalPolicy:'never'}}));if(scenario.tamper==='native')accessPolicy.native.command.sandboxPolicy={type:'readOnly',networkAccess:false};if(scenario.tamper==='fingerprint')accessPolicy.fingerprint='0'.repeat(64);}
      backend=await createManagedBackend({executable:process.execPath,cwd:process.cwd(),workerCapabilities,accessPolicy,...(scenario.retainSources?{runDir:join(process.cwd(),'retained-run'),retainSources:true}:{})});
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
      let deadlineHandle,deadlineRegistered;
      const onDeadline=handle=>{deadlineHandle=handle;deadlineRegistered=handle.snapshot();if(scenario.liveChange){const apply=()=>handle.apply({...scenario.liveChange,expectedRevision:handle.snapshot().revision});if(scenario.liveChangeDelayMs)setTimeout(apply,scenario.liveChangeDelayMs);else apply();}};
      const result=scenario.execute?await backend.execute({onDeadline,onActive:()=>{if(scenario.activeChange)deadlineHandle.apply({...scenario.activeChange,expectedRevision:deadlineHandle.snapshot().revision});if(scenario.activeFailure)throw fault('CONTROL_FIXTURE','Controlled active registration failure');},prompt:'Controlled fixture answer',position:0,workspace,options:{...(scenario.nativeSkills?{skills:scenario.twoSkills?['native-fixture','native-second']:['native-fixture']}:{}),...(scenario.timeoutMs?{timeoutMs:scenario.timeoutMs}:{}),...scenario.workerOptions}}):undefined;
      const closing=backend.close(),again=backend.close();
      report={ok:true,effective:backend.resolveOptions(),parentCapabilities:backend.parentCapabilities,capabilitySources:backend.capabilitySources,admission:backend.admission,value:result?.value,workerEvidence:result?.evidence,deadlineRegistered,deadlineFinal:deadlineHandle?.snapshot(),cleanup:await closing,sameClose:closing===again};
      }
    }catch(error){
      const {doctorFailure}=await import('../../bin/doctor-diagnostics.mjs');
      report={ok:false,primary:diagnostic(error),cleanup:error.cleanup,evidence:error.evidence,admission:error.admission,noInference:error.noInference,noProcessStarted:error.noProcessStarted,notStarted:error.notStarted,executionUnknown:error.executionUnknown,doctor:doctorFailure(error,{stage:'backend',backend:'configured'})};
      if(backend)report.aggregate=await backend.close();
    }
  }
  const trace=readFileSync('trace.jsonl','utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  process.stdout.write(JSON.stringify({...report,connections,closeCalls,trace,selectedRoot,directories:await readdir(process.cwd())})+'\n');
}else throw Error('Unexpected fixture mode');
