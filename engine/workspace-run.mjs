import {mkdir,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {captureInputs,describeInputs,loadInputs,createWorkspace,assertWorkspaceReady} from './workspaces.mjs';
import {fault} from '../foundation/client.mjs';
import {validateCapturePolicy} from './workspace-policy.mjs';

export function runWorkspaces({runDir,source,inputs,capturePolicy,onInputs}){
  const frozen=capturePolicy===undefined?null:validateCapturePolicy(capturePolicy);
  let captured;
  const obtain=()=>captured??=(async()=>{
    if(inputs){
      const loaded=await loadInputs(inputs);
      if(await realpath(source)!==loaded.source)throw fault('WORKSPACE_INPUT','Resume must use the captured source checkout');
      if(frozen&&loaded.policyHash!==frozen.policyHash)throw fault('WORKSPACE_INPUT','Saved captures cannot be reinterpreted with another policy');
      return loaded;
    }
    if(typeof onInputs!=='function')throw fault('WORKSPACE_INPUT','New writer captures require durable input persistence before admission');
    const directory=join(runDir,'workspaces');await mkdir(directory,{recursive:true});
    const loaded=await captureInputs({source,artifactsDir:join(directory,'inputs-'+randomUUID()),...(frozen?{capturePolicy:frozen.policy}:{})});
    await onInputs(describeInputs(loaded));return loaded;
  })();
  return{async prepare({generation,position}){
    const capturedInputs=await obtain(),parent=join(runDir,'workspaces');await mkdir(parent,{recursive:true});
    const workspace=await createWorkspace({inputs:capturedInputs,artifactsDir:join(parent,`g${generation}-w${position}-${randomUUID()}`)});
    await assertWorkspaceReady(workspace);return workspace;
  }};
}
