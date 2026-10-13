import {fault} from '../foundation/client.mjs';

const usageKeys=['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens','cacheWriteInputTokens'];
const methods=new Set(['item/started','item/completed','item/commandExecution/outputDelta','item/agentMessage/delta','turn/plan/updated','turn/diff/updated','thread/tokenUsage/updated','turn/completed']);
export function createActivityTable(db){
  db.exec('CREATE TABLE IF NOT EXISTS activity(seq INTEGER PRIMARY KEY,generation INTEGER NOT NULL,position INTEGER NOT NULL,value TEXT NOT NULL);CREATE INDEX IF NOT EXISTS activity_worker ON activity(generation,position,seq);CREATE INDEX IF NOT EXISTS activity_generation ON activity(generation,seq);CREATE TABLE IF NOT EXISTS activity_counts(generation INTEGER NOT NULL,position INTEGER NOT NULL,observed INTEGER NOT NULL,PRIMARY KEY(generation,position));');
}
function normalized(message,attempt){
  const {method,params={}}=message;
  if(!methods.has(method)||params.item?.type==='reasoning')return null;
  if(typeof params.threadId!=='string'||params.threadId.length>200||typeof(params.turnId??params.turn?.id)!=='string'||(params.turnId??params.turn.id).length>200)throw fault('ACTIVITY_INPUT','Activity requires bounded thread and turn identities');
  const record={method,threadId:params.threadId,turnId:params.turnId??params.turn.id,attempt,at:new Date().toISOString(),truncated:[]};
  const field=(key,value,limit=4000)=>{
    if(value===undefined||value===null)return;
    const text=typeof value==='string'?value:JSON.stringify(value);
    record[key]=text.slice(0,limit);if(text.length>limit)record.truncated.push(key);
  };
  const item=params.item;
  if(item){
    field('itemId',item.id,200);field('type',item.type,100);field('status',item.status??(method==='item/started'?'inProgress':'completed'),40);
    field('input',item.command??item.arguments??item.changes??item.query);field('cwd',item.cwd,500);
    field('output',item.aggregatedOutput??item.text??item.result??item.error);
    if(Number.isInteger(item.exitCode))record.exitCode=item.exitCode;
  }else if(method.endsWith('/delta')||method.endsWith('/outputDelta')){
    field('itemId',params.itemId,200);field('output',params.delta);record.status='inProgress';record.type=method.includes('commandExecution')?'commandExecution':'agentMessage';
  }else if(method==='turn/completed'){record.status=params.turn.status;record.type='turn';}
  else if(method==='turn/plan/updated'){record.type='plan';field('output',params.plan);}
  else if(method==='turn/diff/updated'){record.type='fileChange';field('output',params.diff);}
  else if(method==='thread/tokenUsage/updated'){
    const total=params.tokenUsage?.total;
    if(!total||usageKeys.some(key=>key!=='cacheWriteInputTokens'&&!Object.hasOwn(total,key)||total[key]!==undefined&&(!Number.isSafeInteger(total[key])||total[key]<0)))throw fault('USAGE_INVALID','Native usage must contain nonnegative integer totals');
    record.type='usage';record.usage=Object.fromEntries(usageKeys.map(key=>[key,total[key]??0]));
  }
  while(Buffer.byteLength(JSON.stringify(record))>16000){
    const key=Object.keys(record).filter(key=>typeof record[key]==='string'&&record[key].length>100).sort((a,b)=>record[b].length-record[a].length)[0];
    if(!key)throw fault('ACTIVITY_LIMIT','Activity record exceeded its limit');
    record[key]=record[key].slice(0,Math.floor(record[key].length/2));if(!record.truncated.includes(key))record.truncated.push(key);
  }
  return record;
}

// Caller owns the surrounding SQLite transaction when coupled to worker state.
export function recordActivity(db,{generation,worker,message}){
  const record=normalized(message,worker.attempts??0);if(!record)return;
  let usageByThread,usage;
  if(record.usage){
    const prior=worker.usageByThread?.[record.threadId];
    if(prior&&usageKeys.some(key=>record.usage[key]<prior[key]))throw fault('USAGE_INVALID','Native cumulative usage decreased');
    usageByThread={...worker.usageByThread,[record.threadId]:record.usage};
    const totals=Object.values(usageByThread);
    usage={observedThreads:totals.length,...Object.fromEntries(usageKeys.map(key=>[key,totals.reduce((sum,total)=>sum+total[key],0)]))};
    if(usageKeys.some(key=>!Number.isSafeInteger(usage[key])))throw fault('USAGE_INVALID','Aggregated usage exceeded its integer limit');
  }
  const seq=Number(db.prepare('INSERT INTO activity(generation,position,value) VALUES(?,?,?)').run(generation,worker.position,JSON.stringify(record)).lastInsertRowid);
  db.prepare('INSERT INTO activity_counts(generation,position,observed) VALUES(?,?,1) ON CONFLICT(generation,position) DO UPDATE SET observed=observed+1').run(generation,worker.position);
  db.prepare('DELETE FROM activity WHERE generation=? AND position=? AND seq < (SELECT seq FROM activity WHERE generation=? AND position=? ORDER BY seq DESC LIMIT 1 OFFSET 255)').run(generation,worker.position,generation,worker.position);
  db.prepare('DELETE FROM activity WHERE generation=? AND seq < (SELECT seq FROM activity WHERE generation=? ORDER BY seq DESC LIMIT 1 OFFSET 4095)').run(generation,generation);
  if(usage){worker.usageByThread=usageByThread;worker.usage=usage;}
  worker.activityCount=(worker.activityCount??0)+1;
  worker.activity={seq,at:record.at,method:record.method,type:record.type??'event',status:record.status??'updated',summary:(record.input??record.output??record.type??record.method).slice(0,180),truncated:record.truncated.length>0};
  return{seq,...record};
}

export function readActivity(db,{generation,position,after=0,limit=50,expectedObserved}){
  if(!Number.isInteger(generation)||generation<1||!Number.isInteger(position)||position<0||position>=1000||!Number.isSafeInteger(after)||after<0||!Number.isInteger(limit)||limit<1||limit>100)throw fault('ACTIVITY_INPUT','Activity paging requires a generation, worker and bounded cursor/limit');
  const count=db.prepare('SELECT observed FROM activity_counts WHERE generation=? AND position=?').get(generation,position)?.observed??0;
  const retained=db.prepare('SELECT count(*) AS n,min(seq) AS first FROM activity WHERE generation=? AND position=?').get(generation,position);
  if(!Number.isSafeInteger(count)||count<retained.n||expectedObserved!==undefined&&count!==expectedObserved)throw fault('ACTIVITY_CORRUPT','Activity coverage counters are missing or inconsistent');
  const rows=db.prepare('SELECT seq,value FROM activity WHERE generation=? AND position=? AND seq>? ORDER BY seq LIMIT ?').all(generation,position,after,limit+1);
  const records=rows.slice(0,limit).map(row=>({seq:row.seq,...JSON.parse(row.value)}));
  return{records,observed:count,retained:retained.n,dropped:count-retained.n,retainedFrom:retained.first,nextCursor:records.at(-1)?.seq??after,hasMore:rows.length>limit};
}
