/** @lane merge
 * @subject engine/access-policy.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const sessionId='originating-session';
const snapshot=()=>({version:1,sessionId,provenance:'codex-session-context',filesystem:'unrestricted',networkAccess:true,approvalPolicy:'never'});
async function resolver(){const module=await import('../engine/access-policy.mjs').catch(()=>null);assert.equal(typeof module?.resolveAccess,'function','Parent authority must be validated before native admission');return module.resolveAccess;}
test('retained access receipt validates exact native mapping and expected launch session without executing descriptors',async()=>{
 const {validateAccessPolicy}=await import('../engine/access-policy.mjs');
 assert.equal(typeof validateAccessPolicy,'function');
 const resolve=await resolver(),receipt=resolve({sessionId,parentAccess:snapshot()});
 assert.deepEqual(validateAccessPolicy(JSON.parse(JSON.stringify(receipt)),{sessionId}),receipt);
 assert.throws(()=>validateAccessPolicy(receipt,{sessionId:'foreign'}),{code:'ACCESS_POLICY'});
 for(const field of ['native','fingerprint','policy']){const changed=structuredClone(receipt);changed[field]=null;assert.throws(()=>validateAccessPolicy(changed),{code:'ACCESS_POLICY'});}
 let invoked=false;const accessor={...receipt,get policy(){invoked=true;return receipt.policy;}};
 assert.throws(()=>validateAccessPolicy(accessor),{code:'ACCESS_POLICY'});assert.equal(invoked,false);
});

test('default parent access requires exact originating authority and maps every native boundary consistently',async()=>{
  const resolve=await resolver(),result=resolve({sessionId,parentAccess:snapshot()});
  assert.equal(result.policy.access,'parent');
  assert.deepEqual(result.policy.permissions,{sandbox:'danger-full-access',networkAccess:true,approvalPolicy:'never'});
  assert.deepEqual(result.policy.parentAccess,snapshot());
  assert.deepEqual(result.native.launchArgs,['-c','sandbox_mode="danger-full-access"','-c','approval_policy="never"']);
  assert.deepEqual(result.native.thread,{sandbox:'danger-full-access',approvalPolicy:'never'});
  assert.deepEqual(result.native.turn,{sandboxPolicy:{type:'dangerFullAccess'},approvalPolicy:'never'});
  assert.deepEqual(result.native.command,{sandboxPolicy:{type:'dangerFullAccess'}});
});

test('missing mismatched or unrepresentable parent authority never becomes full access',async()=>{
  const resolve=await resolver();
  for(const parentAccess of [undefined,null])assert.throws(()=>resolve({sessionId,parentAccess}),{code:'PARENT_ACCESS_REQUIRED'});
  for(const patch of [{version:2},{sessionId:'another-session'},{provenance:'child-config-read'},{filesystem:'workspace-write'},{networkAccess:false},{approvalPolicy:'on-request'},{extra:'SECRET'}])assert.throws(()=>resolve({sessionId,parentAccess:{...snapshot(),...patch}}),{code:'PARENT_ACCESS_INVALID'});
  const incomplete=snapshot();delete incomplete.networkAccess;
  assert.throws(()=>resolve({sessionId,parentAccess:incomplete}),{code:'PARENT_ACCESS_INVALID'});
});

test('explicit restricted mode needs no parent snapshot and preserves read-only nonnetwork authority',async()=>{
  const resolve=await resolver(),result=resolve({access:'restricted',sessionId});
  assert.equal(result.policy.parentAccess,null);
  assert.deepEqual(result.policy.permissions,{sandbox:'read-only',networkAccess:false,approvalPolicy:'never'});
  assert.deepEqual(result.native.launchArgs,['-c','sandbox_mode="read-only"','-c','approval_policy="never"']);
  assert.deepEqual(result.native.thread,{sandbox:'read-only',approvalPolicy:'never'});
  assert.deepEqual(result.native.turn,{sandboxPolicy:{type:'readOnly',networkAccess:false},approvalPolicy:'never'});
  assert.deepEqual(result.native.command,{sandboxPolicy:{type:'readOnly',networkAccess:false}});
  assert.throws(()=>resolve({access:'restricted',sessionId,parentAccess:snapshot()}),{code:'ACCESS_POLICY'});
});

test('access policy refuses executable descriptors unknown fields and oversized identity without reading accessors',async()=>{
  const resolve=await resolver();let invoked=0;
  const getter={get sessionId(){invoked++;return sessionId;},access:'restricted'};
  const parentGetter={...snapshot(),get networkAccess(){invoked++;return true;}};
  const proxy=new Proxy(snapshot(),{ownKeys(){invoked++;throw new Error('must not inspect proxy');}});
  for(const input of [undefined,null,[],{sessionId,access:'full'},{sessionId,access:'restricted',extra:true},{sessionId:'x'.repeat(257),access:'restricted'},{sessionId:'bad\nidentity',access:'restricted'},getter])assert.throws(()=>resolve(input),{code:'ACCESS_POLICY'});
  for(const parentAccess of [parentGetter,proxy,Object.assign(Object.create({inherited:true}),snapshot())])assert.throws(()=>resolve({sessionId,parentAccess}),{code:'PARENT_ACCESS_INVALID'});
  assert.equal(invoked,0);
});

test('normalized policy is detached immutable and has stable session-bound replay identity',async()=>{
  const resolve=await resolver(),parentAccess=snapshot(),first=resolve({sessionId,parentAccess});
  const reversed=Object.fromEntries(Object.entries(snapshot()).reverse());
  assert.equal(first.fingerprint,resolve({access:'parent',parentAccess:reversed,sessionId}).fingerprint);
  assert.match(first.fingerprint,/^[a-f0-9]{64}$/);
  parentAccess.networkAccess=false;assert.equal(first.policy.parentAccess.networkAccess,true);
  for(const mutate of [()=>{first.policy.access='restricted';},()=>{first.policy.parentAccess.sessionId='changed';},()=>{first.native.turn.sandboxPolicy.type='readOnly';},()=>first.native.launchArgs.push('unsafe')])assert.throws(mutate,TypeError);
  assert.notEqual(first.fingerprint,resolve({access:'restricted',sessionId}).fingerprint);
  assert.notEqual(first.fingerprint,resolve({sessionId:'different',parentAccess:{...snapshot(),sessionId:'different'}}).fingerprint);
});
