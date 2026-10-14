import {serveBackground} from '../../engine/background.mjs';
import {basename,join} from 'node:path';
import {writeFile,stat} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
await serveBackground(process.argv[2],async({cwd,defaults,session0Desktop,accessPolicy})=>{
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
  return {
  identity:'background-fixture-v1',
  ...(accessPolicy?{accessPolicy}:{}),
  // Synthetic catalog admission only; this fixture does not discover native plugins.
  ...(accessPolicy?.policy.access==='parent'?{parentCapabilities:{fingerprint:'a'.repeat(64),coverage:{complete:true}}}:{}),
  async execute({prompt,signal}){
    await writeFile(join(cwd,'dispatched'),'yes');
    const deadline=Date.now()+10000;
    while(prompt==='A'&&await stat(join(cwd,'hold-A')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;})){
      if(Date.now()>deadline)throw new Error('Fixture worker gate was not released');
      await delay(20,undefined,{signal});
    }
    await delay(30,undefined,{signal});
    return{value:prompt,terminalObserved:true};
  },
  close:async()=>({serverExited:true,descendants:'notVerified'}),
};});
