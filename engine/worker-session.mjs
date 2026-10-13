import {fault,diagnostic} from '../foundation/client.mjs';
import {runTurn} from '../foundation/turn.mjs';
import {compileSchema} from './schema.mjs';

export async function runWorkerSession(client,{threadId,prompt,schema,settings,timeoutMs=120000,signal,reserveRetry,turn=runTurn,onActive,onEvent}){
  const compiled=schema===undefined?null:compileSchema(schema);
  const maxAttempts=compiled?settings.maxAttempts:1;
  if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw Object.assign(fault('WORKER_SETTINGS','Invalid worker attempt limit or deadline'),{notStarted:true});
  const evidence={commands:[],attempts:[]};
  const deadline=performance.now()+timeoutMs;
  let terminalObserved=false;
  try{
    for(let number=1;number<=maxAttempts;number++){
      if(signal?.aborted)throw fault('TURN_CANCELLED','Worker was cancelled');
      if(number>1){
        if(typeof reserveRetry!=='function')throw fault('AGENT_LIMIT','Additional attempt requires a durable reservation');
        await reserveRetry();
      }
      const remaining=deadline-performance.now();
      if(remaining<=0)throw fault('TURN_TIMEOUT','Worker exceeded its overall deadline');
      const attempt={number,status:'running'};evidence.attempts.push(attempt);
      terminalObserved=false;
      const result=await turn(client,{threadId,prompt:number===1?prompt:'Correct your previous answer to match the supplied output schema. Return only the JSON object. Do not run commands or use tools; revise the answer from existing evidence.',timeoutMs:remaining,signal,model:settings.model,effort:settings.effort,...(compiled?{outputSchema:compiled.schema}:{}),onActive,onEvent});
      terminalObserved=true;
      attempt.turnId=result.turnId;
      evidence.commands.push(...result.items.filter(item=>item.type==='commandExecution').map(item=>({status:['completed','failed','declined','inProgress'].includes(item.status)?item.status:'unknown',exitCode:Number.isInteger(item.exitCode)?item.exitCode:null})));
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
    if(last?.status==='running'){last.status='failed';last.error=diagnostic(error);}
    error.evidence=evidence;
    if(terminalObserved)error.terminalObserved=true;
    throw error;
  }
}
