import {DatabaseSync} from 'node:sqlite';
import {join,isAbsolute,resolve} from 'node:path';
import {lstat,realpath,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {paths,noLinks} from '../bin/managed-runtime.mjs';
import {fault} from '../foundation/client.mjs';

const keys = ['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens','cacheWriteInputTokens'];
const limit = {records:10000,observations:10000,rowBytes:2*1024*1024,inputBytes:32*1024*1024,responseBytes:1024*1024};
const uint = value => Number.isSafeInteger(value) && value>=0;
const id = value => typeof value==='string' && value.length>0 && value.length<=200 && !/[\u0000-\u001f]/u.test(value);
const object = value => !types.isProxy(value) && value && typeof value==='object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const same = (one,two) => JSON.stringify(one)===JSON.stringify(two);
function sample(value) {
  if (!object(value) || Object.keys(value).some(key=>!keys.includes(key)) || keys.slice(0,5).some(key=>!Object.hasOwn(value,key)) || keys.some(key=>value[key]!==undefined && !uint(value[key]))) return null;
  if (value.cachedInputTokens>value.inputTokens || value.reasoningOutputTokens>value.outputTokens) return null;
  return Object.fromEntries(keys.map(key=>[key,value[key]??0]));
}
function validateInput(input) {
  if (!object(input) || Reflect.ownKeys(input).length!==3 || !['dataDir','runId','generation'].every(key=>Object.getOwnPropertyDescriptor(input,key)?.enumerable && Object.hasOwn(Object.getOwnPropertyDescriptor(input,key),'value'))) throw fault('USAGE_INPUT','Usage requires data directory, run ID and generation');
  if (typeof input.dataDir!=='string' || !isAbsolute(input.dataDir) || typeof input.runId!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(input.runId) || !uint(input.generation) || input.generation<1) throw fault('USAGE_INPUT','Usage requires a saved run and positive safe generation');
}

// The managed launcher selects/verifies the recorded runtime. This reader never
// imports another runtime, installs dependencies, or changes execution records.
export async function readUsageSummary(input) {
  validateInput(input);
  try { return await readSavedUsage(input); }
  catch (error) {
    if (['USAGE_IDENTITY','USAGE_GENERATION','USAGE_RECORD','USAGE_PATH'].includes(error.code)) throw error;
    throw fault('USAGE_PATH','Saved usage paths are unavailable or unsafe');
  }
}

async function readSavedUsage({dataDir,runId,generation}) {
  await noLinks(dataDir);
  const root=resolve(dataDir), canonical=await realpath(root), identity=await lstat(root,{bigint:true});
  const dataInstanceId=createHash('sha256').update(JSON.stringify([process.platform==='win32'?canonical.toLowerCase():canonical,String(identity.dev),String(identity.ino),String(identity.birthtimeNs)])).digest('hex');
  const runDir = join(paths(dataDir).runs, runId);
  await noLinks(runDir);
  let owner;
  try {
    const ownerPath=join(runDir,'runtime.json'); await noLinks(ownerPath);
    const prior=await lstat(ownerPath,{bigint:true});
    const handle=await open(ownerPath,'r');
    try {
      const stat=await handle.stat({bigint:true});
      if (!stat.isFile() || stat.dev!==prior.dev || stat.ino!==prior.ino || stat.size>BigInt(limit.rowBytes)) throw Error('identity');
      const bytes=Buffer.alloc(limit.rowBytes+1); let size=0;
      while (size<bytes.length) { const part=await handle.read(bytes,size,bytes.length-size,null); if (!part.bytesRead) break; size+=part.bytesRead; }
      if (size>limit.rowBytes) throw Error('size');
      owner=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size)));
      const after=await lstat(ownerPath,{bigint:true}); await noLinks(ownerPath);
      if (after.dev!==stat.dev || after.ino!==stat.ino || after.size!==stat.size || after.mtimeNs!==stat.mtimeNs) throw Error('changed');
    } finally { await handle.close(); }
  }
  catch { throw fault('USAGE_IDENTITY','Saved run ownership is unavailable'); }
  if (owner?.schema!==2 || owner.id!==runId || !id(owner.runtime?.id) || typeof owner.sessionId!=='string' || !owner.sessionId) throw fault('USAGE_IDENTITY','Saved run ownership does not match');
  const run={dataInstanceId,runId,runtimeId:owner.runtime.id};
  const result = {schemaVersion:1, run, generation, observedTotals:null, threads:[], attemptCoverage:[], unknowns:[], inFlight:[], hardSpendingCap:false};
  const unknownKeys=new Set();
  const unknown = (code,record=null,threadId=null) => {
    const value={code,generation:record?.generation??null,position:record?.position??null,threadId};
    const key=JSON.stringify(value);
    if (unknownKeys.has(key)) return;
    if (result.unknowns.length>=255) {
      if (!unknownKeys.has('unknownLimit')) { result.unknowns.push({code:'unknownLimit',generation:null,position:null,threadId:null}); unknownKeys.add('unknownLimit'); }
      return;
    }
    unknownKeys.add(key); result.unknowns.push(value);
  };
  const bounded = code => { result.observedTotals=null; result.threads=[]; result.attemptCoverage=[]; result.inFlight=[]; result.unknowns=[]; unknownKeys.clear(); unknown(code); return result; };
  const path=join(runDir,'run.sqlite'); await noLinks(path);
  for (const suffix of ['-wal','-shm','-journal']) await noLinks(path+suffix);
  const before=await lstat(path,{bigint:true});
  if (!before.isFile()) throw fault('USAGE_PATH','Usage requires a regular saved database');
  const db = new DatabaseSync(path, {readOnly:true});
  try {
    db.exec('PRAGMA busy_timeout=1000;BEGIN');
    const headerSize=db.prepare('SELECT length(CAST(value AS BLOB)) AS bytes FROM header WHERE id=1').get();
    if (!headerSize || headerSize.bytes>limit.rowBytes) throw fault('USAGE_RECORD','Saved run header is missing or oversized');
    const header=JSON.parse(db.prepare('SELECT value FROM header WHERE id=1').get().value);
    if (!uint(header.generation) || header.generation<1 || header.sessionId!==owner.sessionId) throw fault('USAGE_IDENTITY','Saved run header identity does not match');
    if (generation>header.generation) throw fault('USAGE_GENERATION','Requested generation is not saved');
    const counts=db.prepare('SELECT count(*) AS records,coalesce(sum(length(CAST(value AS BLOB))),0) AS bytes,coalesce(max(length(CAST(value AS BLOB))),0) AS largest FROM workers WHERE generation<=?').get(generation);
    if (counts.records>limit.records) return bounded('recordLimit');
    if (counts.bytes>limit.inputBytes || counts.largest>limit.rowBytes) return bounded('recordByteLimit');
    const records=new Map(), threads=new Map(), origins=new Map(); let observations=0, lineageVisits=0;
    for (const row of db.prepare('SELECT generation,position,value FROM workers WHERE generation<=? ORDER BY generation,position').iterate(generation)) {
      let worker;
      try { worker=JSON.parse(row.value); } catch { unknown('invalidRecord',row); continue; }
      const coordinate=`${row.generation}:${row.position}`;
      // The controller persists a queued worker before reserving its first
      // attempt. Normalize that absent counter only in this read projection.
      if (object(worker) && worker.status==='queued' && !Object.hasOwn(worker,'attempts')) worker={...worker,attempts:0};
      if (!uint(row.generation) || row.generation<1 || !uint(row.position) || row.position>=1000 || !object(worker) || worker.position!==row.position || !uint(worker.attempts) || !uint(worker.attemptOffset??0) || (worker.attemptOffset??0)>worker.attempts) { unknown('invalidRecord',row); continue; }
      const coverage={generation:row.generation,position:row.position,attempts:worker.attempts,attemptOffset:worker.attemptOffset??0,cached:worker.cached===true,source:null,observedAttempts:[],allocatedTotals:null,coverage:'cumulativeOnly'};
      result.attemptCoverage.push(coverage);
      const entry={worker,generation:row.generation,position:row.position,root:coordinate,valid:true};
      records.set(coordinate,entry);
      const refs=[...(Array.isArray(worker.priorExecutions)?worker.priorExecutions:[]),...(worker.reusedFrom?[worker.reusedFrom]:[])];
      let valid=(worker.priorExecutions===undefined || Array.isArray(worker.priorExecutions)) && object(worker.origin) && (worker.cached===undefined || typeof worker.cached==='boolean');
      const origin=JSON.stringify(worker.origin);
      if (!origin || Buffer.byteLength(origin)>1024) valid=false;
      const sources=[];
      lineageVisits+=refs.length;
      if (lineageVisits>limit.records) return bounded('lineageLimit');
      for (const ref of refs) {
        if (!object(ref) || Object.keys(ref).length!==2 || !uint(ref.generation) || ref.generation<1 || ref.generation>=row.generation || !uint(ref.position) || ref.position>=1000) { valid=false; continue; }
        const source=records.get(`${ref.generation}:${ref.position}`);
        if (!source?.valid || !same(source.worker.origin,worker.origin)) valid=false;
        else sources.push(source);
      }
      if (sources.length) {
        entry.root=sources[0].root;
        if (sources.some(source=>source.root!==entry.root)) valid=false;
      }
      if (!sources.length && origins.has(origin)) valid=false;
      if (worker.cached!==true && (sources.length ? Math.max(...sources.map(source=>source.worker.attempts))!==coverage.attemptOffset : coverage.attemptOffset>0)) valid=false;
      if (worker.cached===true) {
        const source=worker.reusedFrom && records.get(`${worker.reusedFrom.generation}:${worker.reusedFrom.position}`);
        if (!source?.valid || source.worker.attempts!==worker.attempts || (source.worker.attemptOffset??0)!==coverage.attemptOffset || !same(source.worker.usageByThread,worker.usageByThread) || worker.sourceGeneration!==undefined && worker.sourceGeneration!==source.generation || worker.sourcePosition!==undefined && worker.sourcePosition!==source.position) valid=false;
      } else if (worker.reusedFrom!==undefined) valid=false;
      const attempts=worker.evidence?.attempts;
      if (attempts!==undefined && (!Array.isArray(attempts) || attempts.length>limit.observations || attempts.some(attempt=>!object(attempt) || !uint(attempt.number) || attempt.number<1 || attempt.number+coverage.attemptOffset>worker.attempts))) valid=false;
      const live=row.generation===generation && ['running','queued','pending','cancelling'].includes(worker.status) && worker.cached!==true;
      if (live) result.inFlight.push({generation:row.generation,position:row.position,attempt:worker.attempts,status:worker.status});
      if (!valid) { entry.valid=false; coverage.coverage='invalid'; unknown('invalidLineage',entry); continue; }
      origins.set(origin,entry.root);
      coverage.source=worker.reusedFrom??null;
      coverage.observedAttempts=Array.isArray(attempts)?attempts.map(attempt=>attempt.number+coverage.attemptOffset):[];
      const samples=worker.usageByThread;
      if (samples!==undefined && !object(samples)) { coverage.coverage='missing'; unknown('invalidUsage',entry); continue; }
      const entries=Object.entries(samples??{});
      if (entries.length && worker.attempts===0) { coverage.coverage='invalid'; unknown('invalidUsage',entry); continue; }
      observations+=entries.length;
      if (observations>limit.observations) return bounded('observationLimit');
      const accepted=new Set();
      for (const [threadId,value] of entries) {
        const usage=sample(value);
        if (!id(threadId) || !usage) { unknown('invalidUsage',entry,id(threadId)?threadId:null); continue; }
        const previous=threads.get(threadId);
        if (previous && previous.root!==entry.root) { unknown('threadIdentityConflict',entry,threadId); continue; }
        if (previous && keys.some(key=>usage[key]<previous.observedTotals[key])) {
          unknown(keys.some(key=>usage[key]>previous.observedTotals[key])?'incompatibleUsage':'decreasingUsage',entry,threadId); previous.coverage='partial'; continue;
        }
        threads.set(threadId,{run,threadId,observedTotals:usage,coverage:previous?.coverage??'observedLowerBound',observations:(previous?.observations??0)+1,root:entry.root});
        accepted.add(threadId);
      }
      if (!accepted.size && worker.attempts>0) { unknown('missingUsage',entry); coverage.coverage='missing'; }
      const latest=worker.activeTurn?.threadId ?? (Array.isArray(attempts)?attempts.at(-1)?.threadId:null);
      if (live || latest && !accepted.has(latest)) unknown('missingLatestUsage',entry,id(latest)?latest:null);
      if (Buffer.byteLength(JSON.stringify(result))>limit.responseBytes-4096) return bounded('responseLimit');
    }
    result.threads=[...threads.values()].map(({root:unused,...thread})=>thread);
    if (threads.size) {
      const totals=Object.fromEntries(keys.map(key=>[key,0])); let overflow=false;
      for (const thread of threads.values()) for (const key of keys) {
        if (thread.observedTotals[key]>Number.MAX_SAFE_INTEGER-totals[key]) overflow=true;
        else totals[key]+=thread.observedTotals[key];
      }
      if (overflow) unknown('totalOverflow'); else result.observedTotals=totals;
    } else unknown('noObservedUsage');
    if (Buffer.byteLength(JSON.stringify(result))>limit.responseBytes) return bounded('responseLimit');
    const after=await lstat(path,{bigint:true});
    if (after.isSymbolicLink() || before.dev!==after.dev || before.ino!==after.ino) throw fault('USAGE_PATH','Saved database identity changed');
    return result;
  } catch (error) {
    if (['USAGE_IDENTITY','USAGE_GENERATION','USAGE_RECORD','USAGE_PATH'].includes(error.code)) throw error;
    throw fault('USAGE_RECORD','Saved usage records are unavailable or invalid');
  } finally { db.close(); }
}
