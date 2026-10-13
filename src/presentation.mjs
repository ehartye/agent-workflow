// Bounded observation is distinct from the retained full evidence.
export function preview(value,limit=4096){
 const full=typeof value==='string'?value:JSON.stringify(value);
 if(full===undefined)return {value:null,truncated:false,characters:0};
 return full.length<=limit?{value,truncated:false,characters:full.length}:{preview:full.slice(0,limit),truncated:true,characters:full.length};
}
export function allWorkers(run){return Array.isArray(run.workers)?run.workers:Object.values(run.workers||{});}
export function evidence(run){return {scriptPath:run.scriptPath,snapshotPath:run.snapshotPath,resultPath:run.resultPath,eventsPath:run.eventsPath,artifactsPath:run.artifactsPath,paths:run.paths};}
const label=(value,limit=240)=>{
 if(value==null)return value;
 const text=typeof value==='string'?value:JSON.stringify(value);
 return text.length>limit?text.slice(0,limit)+'…':text;
};
function metaView(meta={}){
 const phases=(meta.phases||[]).slice(0,30).map(p=>({title:label(p.title),detail:label(p.detail,1000),model:label(p.model)}));
 const result={name:label(meta.name),description:label(meta.description,2000),phases};
 return {meta:result,metaTruncated:JSON.stringify({...meta,phases:meta.phases||[]})!==JSON.stringify({...meta,...result})};
}
export function summary(run,{workerLimit=30}={}){
 const workers=allWorkers(run),counts={},cached=new Set();for(const w of workers)counts[w.status||'unknown']=(counts[w.status||'unknown']||0)+1;
 for(const e of run.events||[])if(e.type==='worker-cached'&&e.generation===run.generation)cached.add(e.workerId);
 const pending=(Array.isArray(run.approvals)?run.approvals:Object.values(run.approvals||{})).filter(a=>a.status==='pending');
 return {id:run.id,status:run.status,...metaView(run.meta),cwd:run.cwd,usage:run.usage,coverage:run.coverage,usageCoverage:run.usageCoverage,error:preview(run.error,1000),workerCounts:counts,workers:workers.slice(0,workerLimit).map(w=>({id:w.id,status:w.status,label:label(w.label),phase:label(w.phase),cached:!!w.cached||cached.has(w.id),attempt:w.attempt,usage:w.usage,error:preview(w.error,300)})),workersTruncated:workers.length>workerLimit,totalWorkers:workers.length,approvals:pending.slice(0,10).map(a=>({id:a.id||a.approvalId,status:a.status,request:preview(a.request||a,1500)})),approvalsTruncated:pending.length>10,createdAt:run.createdAt,updatedAt:run.updatedAt,evidence:evidence(run)};
}
export function monitorRun(run){
 const activity=new Map(),failures=new Map(),seenFailures=new Set();let index=0;
 for(const e of run.events||[]){
  index++;
  if(!e.workerId)continue;
  activity.set(e.workerId,{activity:label(e.event?.type||e.type),latestSequence:e.seq??e.sequence});
  const event=e.event||{},item=event.params?.item||event.item;
  if(!['item/completed','item.completed'].includes(event.type)||!item)continue;
  const exitCode=item.exitCode??item.exit_code;
  const failed=item.status==='failed'||item.result?.isError===true||['commandExecution','command_execution'].includes(item.type)&&typeof exitCode==='number'&&exitCode!==0;
  if(!failed)continue;
  const key=e.workerId+':'+(e.seq??e.sequence??index);
  if(seenFailures.has(key))continue;
  seenFailures.add(key);
  const content=Array.isArray(item.result?.content)?item.result.content.filter(c=>c?.type==='text').map(c=>c.text).join('\n'):undefined;
  const prior=failures.get(e.workerId),message=item.aggregatedOutput||item.aggregated_output||item.error?.message||content||item.result||item.error||'Tool reported failure; inspect the full event.';
  failures.set(e.workerId,{toolFailures:(prior?.toolFailures||0)+1,lastToolFailure:{type:label(item.type),sequence:e.seq??e.sequence,message:preview(message,1000)}});
 }
 const value=summary(run,{workerLimit:1000});
 return {...value,generation:run.generation,budget:run.budget,concurrency:run.concurrency,maxAgents:run.maxAgents,argsPreview:preview(run.args,2000),permissions:run.permissions,workers:value.workers.map(w=>({...w,...activity.get(w.id),toolFailures:0,...failures.get(w.id)})),eventCount:run.events?.length||0,lastEventSequence:run.events?.at(-1)?.seq??run.events?.at(-1)?.sequence??0,result:preview(run.result,12000)};
}
export function eventPage(events,{limit=50,since=0,total=events.length}={}){
 const page=events.slice(0,limit);
 return {events:page.map(e=>({seq:e.seq??e.sequence,type:e.type,workerId:e.workerId,event:preview(e,1500)})),hasMore:events.length>limit,nextCursor:page.at(-1)?.seq??page.at(-1)?.sequence??since,total};
}
