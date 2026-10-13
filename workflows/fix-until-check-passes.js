export const meta={name:'fix-until-check-passes',description:'Bounded isolated fix/check rounds, carrying the cumulative patch and stopping after two no-progress rounds.',phases:[{title:'Fix and check'}]};
const maxRounds=Math.min(10,Math.max(1,args.maxRounds||3));
if(!args.task||!args.check)throw new Error('args.task and args.check are required');
const schema={type:'object',properties:{passed:{type:'boolean'},changed:{type:'boolean'},fingerprint:{type:'string'},checkOutput:{type:'string'},patch:{type:'string'},summary:{type:'string'}},required:['passed','changed','fingerprint','checkOutput','patch','summary'],additionalProperties:false};
let patch='';let priorFingerprint=null;let noProgressRounds=0;const rounds=[];let stopReason='round-limit';
for(let round=0;round<maxRounds;round++){
 if(budget.remaining()<=0){stopReason='budget-exhausted';break;}
 let result;
 try{result=await agent('In your isolated worktree, apply the supplied cumulative patch first, implement only the requested fix, and run the exact check. Return the complete cumulative git diff as patch, a stable failure fingerprint, and actual check output. Do not publish or merge.\nTask: '+args.task+'\nCheck: '+args.check+'\nCumulative patch:\n'+patch,{label:'Round '+(round+1),phase:'Fix and check',isolation:'worktree',schema});}catch(error){rounds.push({round:round+1,result:null,error:String(error)});stopReason='worker-failed';break;}
 rounds.push({round:round+1,result});patch=result.patch;
 if(result.passed){stopReason='check-passed';break;}
 noProgressRounds=(!result.changed||result.fingerprint===priorFingerprint)?noProgressRounds+1:0;
 if(noProgressRounds>=2){stopReason='no-progress';break;}
 priorFingerprint=result.fingerprint;
}
return {passed:stopReason==='check-passed',stopReason,noProgressRounds,rounds,patch,expectedMaxRounds:maxRounds,attemptedRounds:rounds.length,completedRounds:rounds.filter(r=>r.result!==null).length,failedRounds:rounds.filter(r=>r.result===null).length,integration:'Patch remains for review; no merge or publication was performed by this workflow.'};
