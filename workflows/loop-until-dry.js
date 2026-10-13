export const meta={name:'loop-until-dry',description:'Discover with all-seen deduplication, optional per-item verification, and two consecutive dry rounds.',phases:[{title:'Discover'},{title:'Verify'}]};
if(!args.question)throw new Error('args.question is required');
const maxRounds=Math.min(20,Math.max(1,args.maxRounds||5));
const schema={type:'object',properties:{items:{type:'array',items:{type:'object',properties:{id:{type:'string'},evidence:{type:'string'}},required:['id','evidence'],additionalProperties:false}},exhausted:{type:'boolean'},limitations:{type:'array',items:{type:'string'}}},required:['items','exhausted','limitations'],additionalProperties:false};
const verifySchema={type:'object',properties:{verdict:{type:'string',enum:['confirmed','refuted','unverified']},evidence:{type:'string'}},required:['verdict','evidence'],additionalProperties:false};
const seen=new Map();const rounds=[];let dryRounds=0;let stopReason='round-limit';
for(let round=0;round<maxRounds;round++){
 if(budget.remaining()<=0){stopReason='budget-exhausted';break;}
 let result;try{result=await agent('Discover additional evidence-backed items for this question. Exclude ALL seen IDs, including refuted and unverified items. Report accessible-scope exhaustion and limitations honestly. Do not modify files.\nQuestion: '+args.question+'\nScope: '+JSON.stringify(args.scope||null)+'\nSeen IDs: '+JSON.stringify(Array.from(seen.keys())),{label:'Discovery '+(round+1),phase:'Discover',schema});}catch(error){rounds.push({round:round+1,result:null,error:String(error)});stopReason='worker-failed';break;}
 const novel=[];for(const item of result.items){if(!seen.has(item.id)){seen.set(item.id,{...item,verification:null,status:'unverified'});novel.push(item);}}
 if(args.verify===true&&novel.length){const verified=await parallel(novel.map(item=>()=>agent('Independently verify this discovered item against actual evidence. Preserve confirmed/refuted/unverified distinctions. Do not modify files.\nQuestion: '+args.question+'\nItem: '+JSON.stringify(item),{label:item.id,phase:'Verify',schema:verifySchema})));novel.forEach((item,index)=>{const verification=verified[index]??null;seen.set(item.id,{...item,verification,status:verification?.verdict||'unverified'});});}
 dryRounds=novel.length===0?dryRounds+1:0;rounds.push({round:round+1,result,added:novel.length,dryRounds});
 if(dryRounds>=2){stopReason=result.exhausted?'exhausted':'no-progress';break;}
}
const items=Array.from(seen.values());
return {items,rounds,stopReason,dryRounds,complete:stopReason==='exhausted'&&(!args.verify||items.every(item=>item.status!=='unverified')),expectedVerifications:args.verify?items.length:0,completedVerifications:items.filter(item=>item.verification!==null).length,unverifiedItems:items.filter(item=>item.status==='unverified').length,unverifiedRounds:rounds.filter(r=>r.result===null).length,maxRounds};
