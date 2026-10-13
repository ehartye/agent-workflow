/** @lane merge
 * @subject engine/settings.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagedBackend} from '../engine/backend.mjs';
test('writers reject an unverified sandbox backend before command or model admission',async()=>{
  await assert.rejects(createManagedBackend({executable:'not-launched',cwd:process.cwd(),backend:'configured',defaults:{permissions:{sandbox:'workspace-write'}}}),{code:'WORKSPACE_BACKEND'});
});
const catalog=[{id:'one',model:'model-one',isDefault:true,defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'medium'}]},{id:'two',model:'model-two',isDefault:false,defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'high'}]}];
async function resolver(){const module=await import('../engine/settings.mjs').catch(()=>null);assert.ok(module?.createSettings,'Settings resolver must exist');return module.createSettings;}
test('worker settings override run defaults and inherit catalog reasoning for a changed model',async()=>{
  const create=await resolver();
  const settings=create({catalog,config:{model:'model-one',model_reasoning_effort:'low'},defaults:{model:'model-two'}});
  assert.deepEqual(settings.resolve({}),{model:'model-two',effort:'high',maxAttempts:5,permissions:{sandbox:'read-only',networkAccess:false,approvalPolicy:'never'}});
  assert.equal(settings.resolve({model:'model-one'}).effort,'low');
  assert.equal(settings.resolve({model:'model-one',effort:'medium',maxAttempts:2}).maxAttempts,2);
  assert.equal(create({catalog,config:{}}).resolve({}).model,'model-one');
});
test('invalid models reasoning attempt limits and broadened permissions reject before inference',async()=>{
  const create=await resolver(),settings=create({catalog,config:{}});
  for(const options of [{model:'missing'},{model:'model-one',effort:'high'},{maxAttempts:0},{maxAttempts:6},{maxAttempts:1.5},{permissions:{networkAccess:true}},{permissions:{sandbox:'workspace-write'}},{permissions:{approvalPolicy:'on-request'}},{permissions:{extra:true}}])assert.throws(()=>settings.resolve(options),{code:'WORKER_SETTINGS'});
  assert.throws(()=>create({catalog,config:{},defaults:{effort:'high'}}),{code:'WORKER_SETTINGS'});
  assert.throws(()=>create({catalog:[],config:{}}),{code:'MODEL_CATALOG'});
  assert.deepEqual(settings.resolve({permissions:{networkAccess:false}}).permissions,{sandbox:'read-only',networkAccess:false,approvalPolicy:'never'});
});

test('explicit writer ceiling allows isolated writes and worker settings can only narrow it',async()=>{
  const create=await resolver(),settings=create({catalog,defaults:{permissions:{sandbox:'workspace-write'}}});
  assert.deepEqual(settings.resolve({}).permissions,{sandbox:'workspace-write',networkAccess:false,approvalPolicy:'never'});
  assert.equal(settings.resolve({permissions:{sandbox:'read-only'}}).permissions.sandbox,'read-only');
  for(const permissions of [{sandbox:'danger-full-access'},{networkAccess:true},{approvalPolicy:'on-request'},{writableRoots:['/']}])assert.throws(()=>settings.resolve({permissions}),{code:'WORKER_SETTINGS'});
});
