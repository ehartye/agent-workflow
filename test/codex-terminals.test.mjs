/** @lane merge
 * @subject foundation/terminals.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {AppServer} from '../foundation/client.mjs';
import {fileURLToPath} from 'node:url';

async function setup(t,mode='terminals'){
  const client=await AppServer.connect({command:process.execPath,args:[fileURLToPath(new URL('./fixtures/foundation-server.mjs',import.meta.url)),mode],experimentalApi:true,shutdownMs:100});t.after(()=>client.close());
  const module=await import('../foundation/terminals.mjs').catch(()=>null);assert.equal(typeof module?.cleanupTerminals,'function');return{client,cleanupTerminals:module.cleanupTerminals};
}
test('native terminal cleanup targets only listed handles and retains its limited acknowledgement evidence',async t=>{
  const {client,cleanupTerminals}=await setup(t);
  const evidence=await cleanupTerminals(client,'thread');
  assert.equal(evidence.observed,2);assert.equal(evidence.acknowledged,2);assert.equal(evidence.inventoryEmpty,true);assert.equal(evidence.descendants,'notVerified');
});
test('malformed inventory and remaining native terminals fail cleanup explicitly',async t=>{
  for(const mode of ['terminals-bad','terminals-remain']){
    const {client,cleanupTerminals}=await setup(t,mode);
    await assert.rejects(cleanupTerminals(client,'thread'),{code:mode==='terminals-bad'?'TERMINAL_PROTOCOL':'TERMINAL_REMAINING'});
  }
});
