/** @lane merge
 * @subject engine/backend.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
test('empty owned job cannot override unresolved native terminal cleanup',async()=>{
  const {workerCleanup}=await import('../engine/backend.mjs');
  const native={error:{code:'TERMINAL_REMAINING',message:'Native terminals remain'},descendants:'notVerified'};
  const cleanup=workerCleanup({serverExited:true,jobEmpty:true,descendants:'notVerified'},native,true);
  assert.equal(cleanup.jobEmpty,true);assert.equal(cleanup.error.code,'TERMINAL_REMAINING');assert.equal(cleanup.nativeTerminals,native);
  const unverified=workerCleanup({serverExited:true,jobEmpty:false},undefined,true);assert.equal(unverified.error.code,'WORKER_DRAIN');
});
