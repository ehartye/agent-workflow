// Tool-observation-only transport fixture. No native tools or filesystem writes.
import {createInterface} from 'node:readline';
const mode=process.argv[2],threadId='thread',turnId='turn';let interrupts=0;
const reply=(id,result)=>process.stdout.write(JSON.stringify({id,result})+'\n');
const notify=(method,params)=>process.stdout.write(JSON.stringify({method,params})+'\n');
const secret='SECRET_CREDENTIAL Bearer private@example.invalid patch bytes';
const raw=(item,identity={})=>notify('rawResponseItem/completed',{threadId,turnId,...identity,item});
const call=(call_id,extra={})=>raw({type:'custom_tool_call',call_id,name:'exec',input:secret,...extra});
const success='Script completed\nWall time 0.1 seconds\nOutput:\n';
const failure='Script failed\nWall time 0.0 seconds\nOutput:\n';
// Pinned 092d3acd code_mode/output.rs:31 inserts a header-only first part.
// code_mode/mod.rs:290 appends the error as a separate body part.
const nativeOutput=(text=success,secondary=secret)=>[{type:'input_text',text},{type:'input_text',text:secondary}];
const rejection=nativeOutput(failure,'Script error:\npatch rejected: writing outside of the project; rejected by user approval settings\n'+secret);
const output=(call_id,text=success,extra={})=>raw({type:'custom_tool_call_output',call_id,output:typeof text==='string'?nativeOutput(text):text,...extra});
const complete=()=>notify('turn/completed',{threadId,turn:{id:turnId,status:'completed',items:[{id:'answer',type:'agentMessage',phase:'final_answer',text:'{"count":2}'}]}});
function pairs(){
  raw({type:'reasoning',encrypted_content:secret,summary:secret});raw({type:'message',content:secret});
  raw({type:'configuration',credentials:secret});
  raw({type:'__proto__',encrypted_content:secret});raw({type:'constructor',input:secret});
  raw({type:'custom_tool_call',call_id:'foreign',name:'apply_patch',input:secret},{turnId:'other'});
  raw({type:'custom_tool_call',call_id:'foreign',name:'apply_patch',input:secret},{threadId:'other'});
  call('reject');output('reject',rejection);call('reject');output('reject',rejection);
  output('reordered');call('reordered');
  call('conflict');output('conflict');output('conflict',rejection);output('conflict');output('conflict',rejection);
  call('orphan');output('outputOnly',success,{name:'apply_patch'});
  output('unnamedOrphan');
  call('namespaced',{namespace:secret});output('namespaced');
  call('contentArray');output('contentArray',[{type:'text',text:failure+secret}]);
  raw({type:'function_call',call_id:'function',name:'apply_patch',arguments:secret});
  raw({type:'function_call_output',call_id:'function',output:success});
  call('malformed');output('malformed',{secret});call('');call('x'.repeat(201));
  call('familyConflict');raw({type:'function_call_output',call_id:'familyConflict',output:success});
  call('toolConflict');output('toolConflict',success,{name:secret});
  call('reused',{name:secret});call('reused');output('reused');
  call('namespaceConflict');call('namespaceConflict',{namespace:secret});output('namespaceConflict');
  call('foreignOutput');raw({type:'custom_tool_call_output',call_id:'foreignOutput',output:success},{turnId:'other'});
  call('unrecognized');output('unrecognized',secret+'\n'+success);
  call('ambiguousOutput');output('ambiguousOutput',success+'\n'+failure);
  call('malformedInput',{input:{credentials:secret}});output('malformedInput',rejection);
  call('missingName',{name:undefined});
  call('failed');output('failed',nativeOutput(failure,'Script error:\ninvalid patch'));
  // output.rs:64 can expose timing overhead, including a quantization-negative value.
  call('overhead');output('overhead',success.replace('0.1 seconds','0.100 seconds (code-mode 0.101 seconds; overhead -0.001 seconds)'));
  call('directPatch',{name:'apply_patch'});output('directPatch',rejection);
  // wait is named by the pinned code-mode protocol; native wait acceptance is
  // separate from these synthetic transport fixtures.
  call('wait',{name:'wait'});output('wait',success,{name:'wait'});
  call('namedExec');output('namedExec',success,{name:'exec'});
  call('supportedConflict');output('supportedConflict',success,{name:'wait'});
  output('reorderedConflict',success,{name:'wait'});call('reorderedConflict');
  call('duplicateName');call('duplicateName',{name:'wait'});output('duplicateName');
  call('outputNamespace');output('outputNamespace',success,{namespace:secret});
  call('nullNamespace',{namespace:null});output('nullNamespace');
  output('execOutputOnly',success,{name:'exec'});
  call('waitOrphan',{name:'wait'});
  const boundaries={
    emptyArray:[],singlePart:[{type:'input_text',text:success}],
    extraPart:[...nativeOutput(),{type:'input_text',text:secret}],
    mixedContent:[{type:'input_text',text:success},{type:'input_image',image_url:secret}],
    missingText:[{type:'input_text',text:success},{type:'input_text'}],
    extraFields:[{type:'input_text',text:success,credentials:secret},{type:'input_text',text:secret}],
    secondaryFields:[{type:'input_text',text:success},{type:'input_text',text:secret,annotations:[secret]}],
    nullPart:[null,{type:'input_text',text:success}],
    reorderedHeader:nativeOutput(secret,success),
    secondaryHeader:nativeOutput(success,failure),
    latePrimaryHeader:nativeOutput(success+'\n'+secret.repeat(80)+'\nScript failed\n'),
    lateSecondaryHeader:nativeOutput(success,secret.repeat(80)+'\nScript failed\n'),
    embeddedPrimaryHeader:nativeOutput(success+' '+failure),
    embeddedSecondaryHeader:nativeOutput(success,secret+' '+failure),
    repeatedHeader:nativeOutput(success,success),
    secondaryRunning:nativeOutput(success,'Script running with cell ID '+secret),
    completedError:nativeOutput(success,'Script error:\n'+secret),
    combinedHeaderBody:nativeOutput(success+'\n{}'),
    extraHeaderNewline:nativeOutput(success+'\n'),
    missingFailureDetail:nativeOutput(failure,'Script error:\n'),
    missingFailurePrefix:nativeOutput(failure,secret),
    malformedOverhead:nativeOutput(success.replace('0.1 seconds','0.100 seconds (code-mode 0.101 seconds; overhead unknown seconds)')),
    malformedHeader:nativeOutput(success.replace('Wall time','Elapsed time')),
    running:nativeOutput('Script running with cell ID '+secret+'\nWall time 0.1 seconds\nOutput:\n\n'),
  };
  for(const [id,content] of Object.entries(boundaries)){call(id);output(id,content);}
  call('stringOutput');raw({type:'custom_tool_call_output',call_id:'stringOutput',output:success});
  call('crlf');output('crlf',success.replaceAll('\n','\r\n'));
  raw({type:'function_call',call_id:'functionExec',name:'exec',arguments:secret});
  raw({type:'function_call_output',call_id:'functionExec',output:nativeOutput()});
  raw({type:'custom_tool_call_output',call_id:'missingTurn',output:success},{turnId:undefined});
  raw({type:'custom_tool_call',call_id:'otherTool',name:secret,input:secret});
}
function skillPairs(){
  // Actual native pilot: function calls in skills namespace; unnamed string outputs.
  const skillCall=(call_id,name='read',extra={})=>raw({type:'function_call',call_id,name,namespace:'skills',arguments:JSON.stringify({package:secret}),...extra});
  const skillOutput=(call_id,extra={})=>raw({type:'function_call_output',call_id,output:JSON.stringify({contents:secret,skill_root:secret}),...extra});
  skillCall('skillList','list');skillOutput('skillList');
  skillOutput('skillRead');skillCall('skillRead');skillCall('skillRead');skillOutput('skillRead');
  skillCall('skillReuse','read',{namespace:secret});skillCall('skillReuse');skillOutput('skillReuse');
  raw({type:'custom_tool_call',call_id:'skillFamilyReuse',name:'read',namespace:'skills',input:secret});
  skillCall('skillFamilyReuse');skillOutput('skillFamilyReuse');
  skillCall('skillMismatch','list');skillOutput('skillMismatch',{name:'read',namespace:'skills'});
  skillCall('skillFamily');raw({type:'custom_tool_call_output',call_id:'skillFamily',output:secret});
  skillCall('skillOutputNamespace');skillOutput('skillOutputNamespace',{namespace:secret});
  skillCall('skillNoOutput');
  skillOutput('skillOutputOnly',{name:'read',namespace:'skills'});
  skillCall('skillForeign');raw({type:'function_call_output',call_id:'skillForeign',output:secret},{turnId:'other'});
  skillCall('skillWrapper');skillOutput('skillWrapper',{output:nativeOutput()});
  skillCall('skillBareList','list',{namespace:undefined});skillOutput('skillBareList');
  skillCall('skillPretendCanonical','skills.read',{namespace:undefined});skillOutput('skillPretendCanonical');
  raw({type:'custom_tool_call',call_id:'skillCustom',name:'read',namespace:'skills',input:secret});skillOutput('skillCustom');
}
createInterface({input:process.stdin}).on('line',line=>{
  const request=JSON.parse(line);
  if(request.method==='initialize')return reply(request.id,{userAgent:'codex/0.162.1'});
  if(request.method==='initialized')return;
  if(request.method==='interrupt-count')return reply(request.id,interrupts);
  if(request.method==='late-output'){output('orphan',rejection);return reply(request.id,{});}
  if(request.method==='turn/interrupt'){interrupts++;reply(request.id,{});return complete();}
  if(request.method==='turn/start'){
    const emit=()=>{
      if(mode==='pairs'||mode==='skill-pairs'){pairs();if(mode==='skill-pairs')skillPairs();}
      else if(mode==='foreign-only'){
        raw({type:'custom_tool_call',call_id:'foreign',name:'apply_patch',input:secret},{turnId:'other'});
        raw({type:'custom_tool_call_output',call_id:'foreign',output:success},{turnId:undefined});
      }
      else {for(let i=0;i<800;i++)call('overflow-'+i,{input:secret.repeat(1000)});output('overflow-799',success,{name:'exec'});}
      complete();
    };
    if(mode==='confirmed-overflow'){reply(request.id,{turn:{id:turnId}});return setTimeout(emit,10);}
    emit();return setTimeout(()=>reply(request.id,{turn:{id:turnId}}),10);
  }
  throw new Error('Unexpected tool fixture request');
}).on('close',()=>process.exit(0));
