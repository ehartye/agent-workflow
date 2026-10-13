import {serveBackground} from '../../engine/background.mjs';
import {basename,join} from 'node:path';
import {writeFile} from 'node:fs/promises';
await serveBackground(process.argv[2],async({cwd})=>{
  if(basename(cwd)==='fail')throw new Error('REVIEW_SECRET_SENTINEL private@example.invalid');
  if(basename(cwd)==='slow')await new Promise(resolve=>setTimeout(resolve,200));
  return {
  identity:'background-fixture-v1',
  execute:({prompt,signal})=>new Promise((resolve,reject)=>{
    writeFile(join(cwd,'dispatched'),'yes').catch(reject);
    const cancel=()=>{clearTimeout(timer);reject(Object.assign(new Error('cancelled'),{interruption:{terminalObserved:true,terminalStatus:'interrupted',descendants:'notVerified'}}));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve({value:prompt,terminalObserved:true});},600);
    signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
  }),
  close:async()=>({serverExited:true,descendants:'notVerified'}),
};});
