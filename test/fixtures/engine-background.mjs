import {serveBackground} from '../../engine/background.mjs';
import {basename,join,dirname} from 'node:path';
import {writeFile,stat,readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
await serveBackground(process.argv[2],async({cwd,defaults,session0Desktop,accessPolicy,runDir,workerCapabilities,capabilitySources,retainSources})=>{
  await writeFile(join(cwd,'backend-access.json'),JSON.stringify(accessPolicy??null));
  await writeFile(join(cwd,'backend-desktop.json'),JSON.stringify(session0Desktop??null));
  await writeFile(join(cwd,'backend-defaults.json'),JSON.stringify(defaults??null));
  if(basename(cwd)==='fail')throw Object.assign(new Error('REVIEW_SECRET_SENTINEL private@example.invalid'),{cleanup:{serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members',desktopCompatibility:{requested:'shared',applied:false},secret:'REVIEW_SECRET_SENTINEL',startup:[{stage:'discovery',cleanup:{serverExited:true,jobEmpty:true,desktopCompatibility:{requested:'shared',applied:false}}}]}});
  if(basename(cwd)==='unknown')throw Object.assign(new Error('REVIEW_SECRET_SENTINEL'),{cleanup:{serverExited:false,jobEmpty:false,desktopCompatibility:{requested:'shared',applied:null}}});
  if(basename(cwd)==='fail-plain')throw new Error('REVIEW_SECRET_SENTINEL private@example.invalid');
  if(basename(cwd)==='fail-evidence')throw Object.assign(new Error('REVIEW_SECRET_SENTINEL private@example.invalid'),{
    code:'ADMISSION_FAILED',
    admission:{status:'failed',inferenceRequests:0,account:'REVIEW_SECRET_SENTINEL',stages:[{name:'authentication',status:'passed',evidence:{mode:'chatgpt',provider:'openai',credential:'REVIEW_SECRET_SENTINEL'}},{name:'buffered-command',status:'failed',evidence:{exitCode:-1073741502,markerObserved:false,outputTruncated:false,stdout:'REVIEW_SECRET_SENTINEL',policy:{type:'readOnly',networkAccess:false}}}]},
    cleanup:{serverExited:false,jobEmpty:false,forced:false,startup:[{stage:'discovery',cleanup:{serverExited:true,jobEmpty:true}},{stage:'admission',cleanup:{serverExited:false,jobEmpty:false,secret:'REVIEW_SECRET_SENTINEL'}}],secret:'REVIEW_SECRET_SENTINEL'},
  });
  if(basename(cwd)==='slow')await new Promise(resolve=>setTimeout(resolve,200));
  const retention=basename(cwd)==='retention';
  if(retention){
    const {captureCapabilitySources}=await import('../../engine/capability-sources.mjs');
    const {freezeCapabilities}=await import('../../engine/worker-capabilities.mjs');
    if(capabilitySources===undefined){if(!retainSources)throw Error('Legacy fixture must not capture sources');capabilitySources=await captureCapabilitySources({runDir,manifest:workerCapabilities});}
    await freezeCapabilities(workerCapabilities,{runDir,capabilitySources});
  }
  const changed=retention&&await stat(join(cwd,'change-backend-identity')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
  // Synthetic process evidence only. Native owned-job containment is tested by
  // its existing Windows owner, not by this detached persistence fixture.
  const cleanup=retention?{serverExited:true,jobEmpty:true,ownershipScope:'windows-job-members',nativeTerminals:{inventoryEmpty:true}}:{serverExited:true,descendants:'notVerified'};
  return {
  identity:changed?'changed-fixture-identity':'background-fixture-v1',
  ...(retention?{capabilitySources}:{}),
  ...(accessPolicy?{accessPolicy}:{}),
  // Synthetic catalog admission only; this fixture does not discover native plugins.
  ...(accessPolicy?.policy.access==='parent'?{parentCapabilities:{fingerprint:'a'.repeat(64),coverage:{complete:true}}}:{}),
  async execute({prompt,signal,workspace}){
    if(retention){
      const path=join(dirname(cwd),'retention-calls.txt');
      const calls=await readFile(path,'utf8').then(Number,error=>{if(error.code==='ENOENT')return 0;throw error;});
      await writeFile(path,String(calls+1));await writeFile(join(workspace.cwd,'owned.txt'),`effect ${calls+1}\n`);
    }
    await writeFile(join(cwd,'dispatched'),'yes');
    const deadline=Date.now()+10000;
    while(prompt==='A'&&await stat(join(cwd,'hold-A')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;})){
      if(Date.now()>deadline)throw new Error('Fixture worker gate was not released');
      await delay(20,undefined,{signal});
    }
    await delay(30,undefined,{signal});
    return{value:prompt,terminalObserved:true,...(retention?{evidence:{cleanup}}:{})};
  },
  close:async()=>cleanup,
};});
