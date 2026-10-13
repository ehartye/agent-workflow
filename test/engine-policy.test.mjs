/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';

test('worker restrictions disable individual inherited integrations and reject effective overrides', async () => {
  const policy = await import('../engine/policy.mjs').catch(() => null);
  assert.ok(policy?.restrictLaunch, 'Worker capability policy must exist');
  const original = {args: ['app-server'],env:{},cwd:'fixture'};
  const inherited = {mcp_servers:{'custom.name':{command:'secret'}},plugins:{'plugin@market':{enabled:true}}};
  const restricted = policy.restrictLaunch(original,inherited);
  assert.ok(restricted.args.includes('mcp_servers={"custom.name"={enabled=false}}'));
  assert.ok(restricted.args.includes('plugins={"plugin@market"={enabled=false}}'));
  assert.deepEqual(original.args,['app-server']);
  const config = {features:{},agents:{enabled:false},notify:[],allow_login_shell:false,web_search:'disabled',
    mcp_servers:{one:{enabled:false}},plugins:{one:{enabled:false}}};
  for (let i=1;i<restricted.args.length;i+=2) {
    const setting=restricted.args[i+1];
    if(setting.startsWith('features.')) config.features[setting.slice(9).split('=')[0]]=false;
  }
  assert.doesNotThrow(()=>policy.assertRestricted(config));
  for (const altered of [
    {...config,mcp_servers:{one:{enabled:false},added:{}}},
    {...config,plugins:{one:{enabled:true}}},
    {...config,features:{...config.features,apps:true}},
    {...config,notify:['command']},
    {...config,agents:{enabled:true}},
  ]) assert.throws(()=>policy.assertRestricted(altered),{code:'WORKER_CAPABILITIES'});
});

test('backend identity is independent of JSON object key order', async () => {
  const policy = await import('../engine/policy.mjs').catch(() => null);
  assert.ok(policy?.fingerprint, 'Stable backend fingerprint must exist');
  assert.equal(policy.fingerprint({a:1,b:{x:2,y:3}}),policy.fingerprint({b:{y:3,x:2},a:1}));
  assert.notEqual(policy.fingerprint({a:[1,2]}),policy.fingerprint({a:[2,1]}));
});

test('disabled MCP inventory is allowed but starting, unknown or callable servers are refused', async () => {
  const policy = await import('../engine/policy.mjs');
  assert.equal(typeof policy.assertDisabledInventory,'function');
  const disabled = {runtimeStatus:'disabled',tools:{},resources:[],resourceTemplates:[]};
  assert.doesNotThrow(()=>policy.assertDisabledInventory({data:[disabled],nextCursor:null}));
  for(const altered of [{...disabled,runtimeStatus:'starting'},{...disabled,runtimeStatus:null},{...disabled,tools:{write:{}}}]) {
    assert.throws(()=>policy.assertDisabledInventory({data:[altered],nextCursor:null}),{code:'WORKER_CAPABILITIES'});
  }
  assert.throws(()=>policy.assertDisabledInventory({data:[],nextCursor:'more'}),{code:'WORKER_CAPABILITIES'});
});
