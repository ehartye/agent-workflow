/** @lane merge
 * @subject engine/settings.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagedBackend} from '../engine/backend.mjs';
import {resolveAccess} from '../engine/access-policy.mjs';
test('writers reject an unverified sandbox backend before command or model admission',async()=>{
  await assert.rejects(createManagedBackend({executable:'not-launched',cwd:process.cwd(),backend:'configured',defaults:{permissions:{sandbox:'workspace-write'}}}),{code:'WORKSPACE_BACKEND'});
});
const catalog=[{id:'one',model:'model-one',isDefault:true,defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'medium'}]},{id:'two',model:'model-two',isDefault:false,defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'high'}]}];
const parent=()=>resolveAccess({sessionId:'s',parentAccess:{version:1,sessionId:'s',provenance:'codex-session-context',filesystem:'unrestricted',networkAccess:true,approvalPolicy:'never'}});
test('parent access is a real narrowable ceiling and workspace ownership is independent',async()=>{
 const create=await resolver(),settings=create({catalog,accessPolicy:parent()});
 assert.deepEqual(settings.resolve().permissions,{sandbox:'danger-full-access',networkAccess:true,approvalPolicy:'never'});
 assert.deepEqual(settings.resolve({permissions:{sandbox:'read-only'}}).permissions,{sandbox:'read-only',networkAccess:false,approvalPolicy:'never'});
 assert.equal(settings.resolve({workspace:'isolated'}).workspace,'isolated');
 assert.throws(()=>settings.resolve({workspace:'source'}),{code:'WORKER_SETTINGS'});
 assert.throws(()=>settings.resolve({permissions:{approvalPolicy:'on-request'}}),{code:'WORKER_SETTINGS'});
 const narrowed=create({catalog,accessPolicy:parent(),defaults:{permissions:{sandbox:'read-only'}}});
 assert.throws(()=>narrowed.resolve({permissions:{sandbox:'danger-full-access'}}),{code:'WORKER_SETTINGS'});
 assert.throws(()=>settings.resolve({permissions:{networkAccess:false}}),{code:'WORKER_SETTINGS'},'no pretend network restriction on dangerFullAccess');
});
async function resolver(){const module=await import('../engine/settings.mjs').catch(()=>null);assert.ok(module?.createSettings,'Settings resolver must exist');return module.createSettings;}
test('parent writer default assigns a worktree without narrowing access and read-only scouts drop inherited workspace',async()=>{
 const create=await resolver(),settings=create({catalog,accessPolicy:parent(),defaults:{workspace:'isolated'}});
 assert.equal(settings.resolve().workspace,'isolated');assert.equal(settings.resolve().permissions.sandbox,'danger-full-access');
 const scout=settings.resolve({permissions:{sandbox:'read-only'}});assert.equal(scout.workspace,undefined);assert.equal(scout.permissions.networkAccess,false);
 assert.throws(()=>settings.resolve({workspace:'isolated',permissions:{sandbox:'read-only'}}),{code:'WORKER_SETTINGS'});
 assert.throws(()=>create({catalog,accessPolicy:parent(),defaults:{workspace:'source'}}),{code:'WORKER_SETTINGS'});
});
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
