import {fault} from '../foundation/client.mjs';

export const DEFAULT_RUN_TIMEOUT_MS=null;
export const MAX_RUN_TIMEOUT_MS=86400000;
export const DEFAULT_WORKER_TIMEOUT_MS=600000;
export const MAX_WORKER_TIMEOUT_MS=1800000;

// Wall budgets include broker waits; they never replace the evaluator CPU limit.
export function resolveDeadlines(input={},previous={}){
  const timeoutMs=input.timeoutMs===undefined?(previous.timeoutMs??DEFAULT_RUN_TIMEOUT_MS):input.timeoutMs;
  const workerTimeoutMs=input.workerTimeoutMs===undefined?(previous.workerTimeoutMs??DEFAULT_WORKER_TIMEOUT_MS):input.workerTimeoutMs;
  if(timeoutMs!==null&&(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>MAX_RUN_TIMEOUT_MS)||!Number.isInteger(workerTimeoutMs)||workerTimeoutMs<1||workerTimeoutMs>MAX_WORKER_TIMEOUT_MS)throw fault('RUN_INPUT','Run deadline must be null or 1–86400000 ms and worker deadline 1–1800000 ms');
  return{timeoutMs,workerTimeoutMs};
}
