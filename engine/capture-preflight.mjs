import {inspectCaptureInputs} from './workspaces.mjs';

// Public metadata only. Inspection shares capture's admission and never invokes
// captureInputs, whose object/index/artifact writes are deliberately separate.
export async function preflightCapture(options){
  return (await inspectCaptureInputs(options)).report;
}
