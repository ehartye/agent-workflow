import {fault,diagnostic} from '../foundation/client.mjs';
import {runTurn} from '../foundation/turn.mjs';
import {compileSchema} from './schema.mjs';
import {DEFAULT_WORKER_TIMEOUT_MS} from './deadlines.mjs';
import {createLiveDeadline} from './live-deadline.mjs';

export async function runWorkerSession(client,{threadId,prompt,schema,settings,execution,capabilities,timeoutMs=DEFAULT_WORKER_TIMEOUT_MS,deadline,liveDeadline,signal,reserveRetry,turn=runTurn,onActive,onEvent}){
  const compiled=schema===undefined?null:compileSchema(schema);
  const maxAttempts=compiled?settings.maxAttempts:1;
  if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5||timeoutMs!==null&&(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0)||deadline!==undefined&&!Number.isFinite(deadline))throw Object.assign(fault('WORKER_SETTINGS','Invalid worker attempt limit or deadline'),{notStarted:true});
  const evidence={commands:[],commandCoverage:'retainedItemsOnly',attempts:[]};
  const outputGuidance=compiled?`Schema validation accepts at most ${compiled.limits.maxSerializedBytes} UTF-8 bytes of serialized JSON; lower task or native limits still apply. Keep the answer concise and report missing coverage explicitly; never silently omit required items to fit.`:null;
  if(compiled)evidence.structuredOutputLimits=compiled.limits;
  if(capabilities)evidence.capabilities=structuredClone(capabilities);
  const ownedDeadline=!liveDeadline;
  let terminalObserved=false;
  try{
    if(!liveDeadline){
      const remaining=deadline===undefined?timeoutMs:deadline-performance.now();
      if(remaining!==null&&remaining<=0)throw fault('TURN_TIMEOUT','Worker exceeded its overall deadline');
      liveDeadline=createLiveDeadline(remaining===null?null:Math.ceil(remaining));liveDeadline.start();
    }
    if(['pending','closed'].includes(liveDeadline.snapshot().status))throw fault('DEADLINE_INACTIVE','Worker deadline must be active before dispatch');
    for(let number=1;number<=maxAttempts;number++){
      if(signal?.aborted)throw liveDeadline.signal.aborted?fault('TURN_TIMEOUT','Worker exceeded its live wall deadline'):fault('TURN_CANCELLED','Worker was cancelled');
      if(number>1){
        if(typeof reserveRetry!=='function')throw fault('AGENT_LIMIT','Additional attempt requires a durable reservation');
        await reserveRetry();
      }
      const remaining=liveDeadline.remaining();
      if(remaining<=0)throw fault('TURN_TIMEOUT','Worker exceeded its overall deadline');
      const attempt={number,status:'running'};evidence.attempts.push(attempt);
      terminalObserved=false;
      const taskPrompt=number===1?[prompt,capabilities?.instructions].filter(Boolean).join('\n\n'):'Correct your previous answer to match the supplied output schema. Return only the JSON object. Do not run commands or use tools; revise the answer from existing evidence.';
      const result=await turn(client,{threadId,prompt:[taskPrompt,outputGuidance].filter(Boolean).join('\n\n'),timeoutMs:remaining===Infinity?null:remaining,liveDeadline,signal,model:settings.model,effort:settings.effort,execution,...(compiled?{outputSchema:compiled.schema}:{}),onActive,onEvent});
      terminalObserved=true;
      attempt.turnId=result.turnId;
      if(result.output)attempt.output=result.output;
      evidence.commands.push(...result.items.filter(item=>item.type==='commandExecution').map(item=>({status:['completed','failed','declined','inProgress'].includes(item.status)?item.status:'unknown',exitCode:Number.isInteger(item.exitCode)?item.exitCode:null})));
      // Refusing a late result must not erase its already observed terminal facts.
      if(liveDeadline.remaining()<=0)throw fault('TURN_TIMEOUT','Worker exceeded its overall deadline');
      let value=result.text;
      if(compiled){
        let validationError;
        try{value=JSON.parse(result.text);if(!compiled.validate(value))validationError=fault('RESULT_SCHEMA','Worker result does not satisfy its declared schema');}
        catch(error){validationError=['RESULT_SIZE','RESULT_LIMIT','RESULT_JSON'].includes(error.code)?error:fault('RESULT_JSON','Worker did not return a JSON object');}
        if(validationError){
          attempt.status='invalid';attempt.error=diagnostic(validationError);
          if(number===maxAttempts)throw validationError;
          continue;
        }
      }
      attempt.status='completed';
      return{value,terminalObserved:true,evidence};
    }
  }catch(error){
    const last=evidence.attempts.at(-1);
    if(last&&error.output)last.output=error.output;
    if(last?.status==='running'&&Array.isArray(error.output?.commandEvidence?.commands))evidence.commands.push(...error.output.commandEvidence.commands.slice(0,1024).map(item=>({status:['completed','failed','declined','inProgress'].includes(item.status)?item.status:'unknown',exitCode:Number.isInteger(item.exitCode)?item.exitCode:null})));
    if(last?.status==='running'){last.status='failed';last.error=diagnostic(error);}
    error.evidence=evidence;
    if(evidence.attempts.length===0)error.noInference=true;
    if(terminalObserved)error.terminalObserved=true;
    throw error;
  }finally{if(ownedDeadline)liveDeadline?.close();}
}
