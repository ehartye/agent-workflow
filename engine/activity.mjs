import {fault} from '../foundation/client.mjs';
import {createHash} from 'node:crypto';
import {TOOL_METHOD,boundedToolId,copyToolObservation,copyToolSummary} from '../foundation/tool-observation.mjs';

const usageKeys=['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens','cacheWriteInputTokens'];
const methods=new Set(['item/started','item/completed','item/commandExecution/outputDelta','item/agentMessage/delta','turn/plan/updated','turn/diff/updated','thread/tokenUsage/updated','turn/completed']);
const commandLimits=Object.freeze({workerRecords:128,workerBytes:65536,generationRecords:1024,generationBytes:524288,recordBytes:2048,hashInputBytes:65536});
export function createActivityTable(db){
  db.exec('CREATE TABLE IF NOT EXISTS activity(seq INTEGER PRIMARY KEY,generation INTEGER NOT NULL,position INTEGER NOT NULL,value TEXT NOT NULL);CREATE INDEX IF NOT EXISTS activity_worker ON activity(generation,position,seq);CREATE INDEX IF NOT EXISTS activity_generation ON activity(generation,seq);CREATE TABLE IF NOT EXISTS activity_counts(generation INTEGER NOT NULL,position INTEGER NOT NULL,observed INTEGER NOT NULL,PRIMARY KEY(generation,position));');
  db.exec(`CREATE TABLE IF NOT EXISTS command_facts(seq INTEGER PRIMARY KEY,generation INTEGER NOT NULL,position INTEGER NOT NULL,bytes INTEGER NOT NULL,value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS command_facts_worker ON command_facts(generation,position,seq);
    CREATE INDEX IF NOT EXISTS command_facts_generation ON command_facts(generation,seq);
    CREATE TABLE IF NOT EXISTS command_fact_counts(generation INTEGER NOT NULL,position INTEGER NOT NULL,observed INTEGER NOT NULL DEFAULT 0,evicted_count INTEGER NOT NULL DEFAULT 0,evicted_bytes INTEGER NOT NULL DEFAULT 0,uncovered_activity INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(generation,position));
    INSERT OR IGNORE INTO command_fact_counts(generation,position,uncovered_activity) SELECT generation,position,observed FROM activity_counts;`);
}
function commandOutcome(event,status,exitCode,timedOut){
  if(event==='started')return'unknown';
  if(timedOut||status==='timeout'||status==='timedOut')return'timedOut';
  if(['declined','interrupted','failed'].includes(status))return status;
  return exitCode===null?'unknown':exitCode===0?'succeeded':'failed';
}
function commandFact(message,worker,generation,record){
  const item=message.params?.item;
  if(item?.type!=='commandExecution'||!['item/started','item/completed'].includes(message.method))return null;
  if(!Number.isSafeInteger(generation)||generation<1||!Number.isInteger(worker.position)||worker.position<0||worker.position>=1000||
    !Number.isSafeInteger(record.attempt)||record.attempt<0||![item.id,record.threadId,record.turnId].every(boundedToolId))throw fault('ACTIVITY_INPUT','Command facts require exact bounded identities and attempt');
  let command={representation:'omitted',reason:'notProvided'};
  const value=item.command;
  if(value!==undefined&&value!==null){
    const encoding=typeof value==='string'?'utf8':Array.isArray(value)&&value.length<=256&&value.every(arg=>typeof arg==='string')?'argvJsonUtf8':null;
    if(!encoding)command={representation:'omitted',reason:'unsupportedShape'};
    else{
      const text=encoding==='utf8'?value:JSON.stringify(value),bytes=Buffer.byteLength(text);
      command=item.truncated?.includes('command')||item.truncated?.includes('item')?{representation:'omitted',reason:'sourceTruncated'}:
        bytes>commandLimits.hashInputBytes?{representation:'omitted',reason:'hashInputLimit',bytes}:
        {representation:'sha256',encoding,bytes,sha256:createHash('sha256').update(text).digest('hex')};
    }
  }
  const completed=message.method==='item/completed',exitCode=completed&&Number.isSafeInteger(item.exitCode)?item.exitCode:null;
  const status=['inProgress','completed','failed','declined','interrupted','timeout','timedOut'].includes(item.status)?item.status:'unknown';
  const event=completed?'completed':'started',timedOut=item.timedOut===true;
  return{generation,position:worker.position,attempt:record.attempt,threadId:record.threadId,turnId:record.turnId,itemId:item.id,at:record.at,event,command,status,exitCode,timedOut,outcome:commandOutcome(event,status,exitCode,timedOut)};
}
function retainCommandFact(db,fact,seq){
  const value=JSON.stringify({seq,...fact}),bytes=Buffer.byteLength(value);
  if(bytes>commandLimits.recordBytes)throw fault('ACTIVITY_LIMIT','Command fact exceeded its byte limit');
  db.prepare('INSERT INTO command_facts(seq,generation,position,bytes,value) VALUES(?,?,?,?,?)').run(seq,fact.generation,fact.position,bytes,value);
  db.prepare('UPDATE command_fact_counts SET observed=observed+1 WHERE generation=? AND position=?').run(fact.generation,fact.position);
  for(const scoped of [true,false]){
    const where=scoped?'generation=? AND position=?':'generation=?',args=scoped?[fact.generation,fact.position]:[fact.generation];
    for(;;){
      const totals=db.prepare(`SELECT count(*) AS n,coalesce(sum(bytes),0) AS bytes FROM command_facts WHERE ${where}`).get(...args);
      const countExceeded=totals.n>(scoped?commandLimits.workerRecords:commandLimits.generationRecords);
      if(!countExceeded&&totals.bytes<=(scoped?commandLimits.workerBytes:commandLimits.generationBytes))break;
      const victim=db.prepare(`SELECT seq,position FROM command_facts WHERE ${where} ORDER BY seq LIMIT 1`).get(...args);
      db.prepare('DELETE FROM command_facts WHERE seq=?').run(victim.seq);
      db.prepare(`UPDATE command_fact_counts SET ${countExceeded?'evicted_count=evicted_count+1':'evicted_bytes=evicted_bytes+1'} WHERE generation=? AND position=?`).run(fact.generation,victim.position);
    }
  }
}
const exact=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===fields.length&&fields.every(key=>Object.hasOwn(value,key));
function readCommandFact(row,generation,position){
  const corrupt=()=>fault('ACTIVITY_CORRUPT','Command fact record, coordinates or byte coverage are invalid');
  if(!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>commandLimits.recordBytes||typeof row.value!=='string'||Buffer.byteLength(row.value)!==row.bytes)throw corrupt();
  let value;try{value=JSON.parse(row.value);}catch{throw corrupt();}
  if(!exact(value,['seq','generation','position','attempt','threadId','turnId','itemId','at','event','command','status','exitCode','timedOut','outcome'])||value.seq!==row.seq||value.generation!==generation||value.position!==position||!Number.isSafeInteger(value.seq)||value.seq<1||!Number.isSafeInteger(value.attempt)||value.attempt<0||![value.threadId,value.turnId,value.itemId].every(boundedToolId)||typeof value.at!=='string'||value.at.length!==24||!Number.isFinite(Date.parse(value.at))||new Date(value.at).toISOString()!==value.at||!['started','completed'].includes(value.event)||!['inProgress','completed','failed','declined','interrupted','timeout','timedOut','unknown'].includes(value.status)||value.exitCode!==null&&!Number.isSafeInteger(value.exitCode)||typeof value.timedOut!=='boolean'||value.event==='started'&&value.exitCode!==null||value.outcome!==commandOutcome(value.event,value.status,value.exitCode,value.timedOut))throw corrupt();
  const command=value.command;
  if(command?.representation==='sha256'){
    if(!exact(command,['representation','encoding','bytes','sha256'])||!['utf8','argvJsonUtf8'].includes(command.encoding)||!Number.isSafeInteger(command.bytes)||command.bytes<0||command.bytes>commandLimits.hashInputBytes||typeof command.sha256!=='string'||!/^[a-f0-9]{64}$/.test(command.sha256))throw corrupt();
  }else if(command?.representation==='omitted'){
    const large=command.reason==='hashInputLimit';
    if(!exact(command,large?['representation','reason','bytes']:['representation','reason'])||!['notProvided','unsupportedShape','sourceTruncated','hashInputLimit'].includes(command.reason)||large&&(!Number.isSafeInteger(command.bytes)||command.bytes<=commandLimits.hashInputBytes))throw corrupt();
  }else throw corrupt();
  return value;
}
function readCommandFacts(db,generation,position,activityObserved){
  const counts=db.prepare('SELECT * FROM command_fact_counts WHERE generation=? AND position=?').get(generation,position);
  const invalidCounts=counts&&(['observed','evicted_count','evicted_bytes','uncovered_activity'].some(key=>!Number.isSafeInteger(counts[key])||counts[key]<0)||counts.observed+counts.uncovered_activity>activityObserved);
  if((!counts&&activityObserved>0)||invalidCounts)throw fault('ACTIVITY_CORRUPT','Command fact coverage counters are missing or invalid');
  // SQLite checks actual UTF-8 byte lengths before any value is materialized in JS.
  const totals=db.prepare('SELECT count(*) AS n,coalesce(sum(bytes),0) AS bytes,min(bytes) AS smallest,max(bytes) AS largest,coalesce(sum(CASE WHEN bytes != length(CAST(value AS BLOB)) THEN 1 ELSE 0 END),0) AS invalidBytes FROM command_facts WHERE generation=?').get(generation);
  const scoped=db.prepare('SELECT count(*) AS n,coalesce(sum(bytes),0) AS bytes FROM command_facts WHERE generation=? AND position=?').get(generation,position);
  if(totals.invalidBytes||!Number.isSafeInteger(totals.bytes)||totals.bytes<0||totals.n>commandLimits.generationRecords||totals.bytes>commandLimits.generationBytes||totals.n&&(totals.smallest<1||totals.largest>commandLimits.recordBytes)||!Number.isSafeInteger(scoped.bytes)||scoped.bytes<0||scoped.n>commandLimits.workerRecords||scoped.bytes>commandLimits.workerBytes)throw fault('ACTIVITY_CORRUPT','Command fact retention budgets are invalid');
  const rows=db.prepare('SELECT seq,value,bytes FROM command_facts WHERE generation=? AND position=? ORDER BY seq').all(generation,position);
  const observed=counts?.observed??0,evicted={countLimit:counts?.evicted_count??0,byteLimit:counts?.evicted_bytes??0};
  if(observed!==rows.length+evicted.countLimit+evicted.byteLimit)throw fault('ACTIVITY_CORRUPT','Command fact coverage counters are inconsistent');
  return{schemaVersion:1,coverage:'itemNotificationsOnly',priorActivityUncovered:counts?.uncovered_activity??0,limits:{...commandLimits},observed,retained:rows.length,dropped:observed-rows.length,evicted,retainedBytes:rows.reduce((sum,row)=>sum+row.bytes,0),records:rows.map(row=>readCommandFact(row,generation,position))};
}
function normalized(message,worker){
  const {method,params={}}=message;
  if(method===TOOL_METHOD&&!params.toolObservation)return null; // Never persist raw items.
  if((method!==TOOL_METHOD&&!methods.has(method))||params.item?.type==='reasoning')return null;
  if(typeof params.threadId!=='string'||params.threadId.length>200||typeof(params.turnId??params.turn?.id)!=='string'||(params.turnId??params.turn.id).length>200)throw fault('ACTIVITY_INPUT','Activity requires bounded thread and turn identities');
  const record={method,threadId:params.threadId,turnId:params.turnId??params.turn.id,attempt:worker.attempts??0,at:new Date().toISOString(),truncated:[]};
  if(method===TOOL_METHOD||params.toolObservationSummary!==undefined){
    if(!boundedToolId(record.threadId)||!boundedToolId(record.turnId)||worker.activeTurn?.threadId!==record.threadId||worker.activeTurn?.turnId!==record.turnId)throw fault('ACTIVITY_INPUT','Tool activity requires the confirmed worker turn');
    if(method===TOOL_METHOD){
      const observation=copyToolObservation(params.toolObservation);
      if(!observation)throw fault('ACTIVITY_INPUT','Tool activity requires allowlisted bounded observation facts');
      record.type='nativeTool';record.itemId=observation.callId;record.status=observation.outcome;record.toolObservation=observation;
      return record;
    }
    if(method!=='turn/completed')throw fault('ACTIVITY_INPUT','Tool coverage belongs to the native terminal notification');
    const summary=copyToolSummary(params.toolObservationSummary);
    if(!summary)throw fault('ACTIVITY_INPUT','Tool activity coverage requires bounded explicit counters');
    record.toolObservationSummary=summary;
  }
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
    if(item.type==='agentMessage'){
      field('phase',item.phase,40);
      if(item.delivery!=null)record.delivery=item.delivery==='async'?'async':'unsupported';
    }
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
  const record=normalized(message,worker);if(!record)return;
  const fact=commandFact(message,worker,generation,record);
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
  db.prepare('INSERT OR IGNORE INTO command_fact_counts(generation,position) VALUES(?,?)').run(generation,worker.position);
  if(fact)retainCommandFact(db,fact,seq);
  db.prepare('INSERT INTO activity_counts(generation,position,observed) VALUES(?,?,1) ON CONFLICT(generation,position) DO UPDATE SET observed=observed+1').run(generation,worker.position);
  db.prepare('DELETE FROM activity WHERE generation=? AND position=? AND seq < (SELECT seq FROM activity WHERE generation=? AND position=? ORDER BY seq DESC LIMIT 1 OFFSET 255)').run(generation,worker.position,generation,worker.position);
  db.prepare('DELETE FROM activity WHERE generation=? AND seq < (SELECT seq FROM activity WHERE generation=? ORDER BY seq DESC LIMIT 1 OFFSET 4095)').run(generation,generation);
  if(usage){worker.usageByThread=usageByThread;worker.usage=usage;}
  worker.activityCount=(worker.activityCount??0)+1;
  worker.activity={seq,at:record.at,method:record.method,type:record.type??'event',status:record.status??'updated',summary:(record.toolObservation?`${record.toolObservation.tool}: ${record.status}`:record.input??record.output??record.type??record.method).slice(0,180),truncated:record.truncated.length>0};
  return{seq,...record};
}

export function readActivity(db,{generation,position,after=0,limit=50,expectedObserved}){
  if(!Number.isInteger(generation)||generation<1||!Number.isInteger(position)||position<0||position>=1000||!Number.isSafeInteger(after)||after<0||!Number.isInteger(limit)||limit<1||limit>100)throw fault('ACTIVITY_INPUT','Activity paging requires a generation, worker and bounded cursor/limit');
  const count=db.prepare('SELECT observed FROM activity_counts WHERE generation=? AND position=?').get(generation,position)?.observed??0;
  const retained=db.prepare('SELECT count(*) AS n,min(seq) AS first FROM activity WHERE generation=? AND position=?').get(generation,position);
  if(!Number.isSafeInteger(count)||count<retained.n||expectedObserved!==undefined&&count!==expectedObserved)throw fault('ACTIVITY_CORRUPT','Activity coverage counters are missing or inconsistent');
  const rows=db.prepare('SELECT seq,value FROM activity WHERE generation=? AND position=? AND seq>? ORDER BY seq LIMIT ?').all(generation,position,after,limit+1);
  const records=rows.slice(0,limit).map(row=>({seq:row.seq,...JSON.parse(row.value)}));
  return{records,observed:count,retained:retained.n,dropped:count-retained.n,retainedFrom:retained.first,nextCursor:records.at(-1)?.seq??after,hasMore:rows.length>limit,commandFacts:readCommandFacts(db,generation,position,count)};
}
