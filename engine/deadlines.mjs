import {fault} from '../foundation/client.mjs';

export const DEFAULT_RUN_TIMEOUT_MS=null;
export const MAX_RUN_TIMEOUT_MS=86400000;
export const DEFAULT_WORKER_TIMEOUT_MS=null;
export const MAX_WORKER_TIMEOUT_MS=Number.MAX_SAFE_INTEGER;

// Wall budgets include broker waits; they never replace the evaluator CPU limit.
export function resolveDeadlines(input={},previous={}){
  const timeoutMs=input.timeoutMs===undefined?(previous.timeoutMs??DEFAULT_RUN_TIMEOUT_MS):input.timeoutMs;
  const workerTimeoutMs=input.workerTimeoutMs===undefined?(previous.workerTimeoutMs===undefined?DEFAULT_WORKER_TIMEOUT_MS:previous.workerTimeoutMs):input.workerTimeoutMs;
  if(timeoutMs!==null&&(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>MAX_RUN_TIMEOUT_MS)||workerTimeoutMs!==null&&(!Number.isSafeInteger(workerTimeoutMs)||workerTimeoutMs<1))throw fault('RUN_INPUT','Run deadline must be null or 1–86400000 ms; worker deadline must be null or positive safe milliseconds');
  return{timeoutMs,workerTimeoutMs};
}
