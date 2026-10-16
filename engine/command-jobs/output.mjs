import {openSync,writeSync,fsyncSync,fstatSync,closeSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {safePath,fail,sha,bytesAt,integer,canonical,fileIdentity,verifiedPage,keys,terminal} from './contract.mjs';

export async function createOutput(directory,limitBytes){
  await safePath(directory,{directory:true,missing:true});await mkdir(directory,{mode:0o700});
  const streams={},entries=[],pending={};let total=0,closed=false;
  for(const name of ['stdout','stderr']){const path=join(directory,name+'.bin'),fd=openSync(path,'wx',0o600);streams[name]={fd,hash:createHash('sha256'),record:{path,receivedBytes:0,retainedBytes:0,droppedBytes:0,sha256:sha(Buffer.alloc(0)),capReached:false,coverage:'complete'}};}
  const indexPath=join(directory,'chunks.json'),indexFd=openSync(indexPath,'wx',0o600);
  const snapshot=()=>({limitBytes,stdout:{...streams.stdout.record},stderr:{...streams.stderr.record},chunkIndex:null});
  return {snapshot,
    append(params,processId){
      keys(params,['processId','stream','deltaBase64'],['capReached']);
      if(closed||params?.processId!==processId||!['stdout','stderr'].includes(params.stream)||typeof params.deltaBase64!=='string'||params.deltaBase64.length>87384||params.capReached!==undefined&&typeof params.capReached!=='boolean')fail('JOB_OUTPUT');
      const b=Buffer.from(params.deltaBase64,'base64');if(b.length>65536||b.toString('base64')!==params.deltaBase64)fail('JOB_OUTPUT');
      const {stream}=params,s=streams[stream],r=s.record;if(!integer(r.receivedBytes+b.length))fail('JOB_OUTPUT');r.receivedBytes+=b.length;r.capReached||=params.capReached===true;
      const keep=b.subarray(0,Math.max(0,limitBytes-total));
      if(keep.length){
        if(fstatSync(s.fd).size!==r.retainedBytes)fail('JOB_OUTPUT');
        let n=0;while(n<keep.length){const wrote=writeSync(s.fd,keep,n,keep.length-n,r.retainedBytes+n);if(wrote<=0)fail('JOB_OUTPUT');n+=wrote;}
        s.hash.update(keep);
        let offset=0;
        while(offset<keep.length){
          let entry=pending[stream];if(!entry||entry.bytes===4096){entry={seq:entries.length,stream,offset:r.retainedBytes+offset,bytes:0};entries.push(entry);pending[stream]=entry;}
          const count=Math.min(4096-entry.bytes,keep.length-offset);entry.bytes+=count;offset+=count;
        }
        r.retainedBytes+=keep.length;total+=keep.length;r.sha256=s.hash.copy().digest('hex');fsyncSync(s.fd);
      }
      r.droppedBytes=r.receivedBytes-r.retainedBytes;r.coverage=r.droppedBytes||r.capReached?'partial':'complete';
      return snapshot();
    },
    finish(unknown=false){
      if(closed)fail('JOB_OUTPUT');closed=true;
      try{
        for(const s of Object.values(streams)){fsyncSync(s.fd);if(fstatSync(s.fd).size!==s.record.retainedBytes)fail('JOB_OUTPUT');if(unknown)s.record.coverage='unknown';}
        const bytes=Buffer.from(canonical(entries));if(bytes.length>1048576||entries.length>8192)fail('JOB_OUTPUT');
        let n=0;while(n<bytes.length){const wrote=writeSync(indexFd,bytes,n,bytes.length-n,n);if(wrote<=0)fail('JOB_OUTPUT');n+=wrote;}fsyncSync(indexFd);
        return {...snapshot(),chunkIndex:{path:indexPath,sha256:sha(bytes),bytes:bytes.length,entries:entries.length}};
      }finally{for(const s of Object.values(streams))closeSync(s.fd);closeSync(indexFd);}
    }
  };
}
export async function verifyOutput(receipt,directory,{index=true,live=false}={}){
  const result={};
  for(const stream of ['stdout','stderr']){
    const r=receipt.output[stream];if(r.path!==join(directory,stream+'.bin')||r.sha256===null)fail('JOB_OUTPUT');
    if(live&&!terminal(receipt.state)&&receipt.output.chunkIndex===null){
      await verifiedPage(r.path,r,{limitBytes:1,maxBytes:receipt.output.limitBytes,allowAppend:true});
      result[stream]={path:r.path,bytes:r.retainedBytes,sha256:r.sha256};continue;
    }
    const identity=await fileIdentity(r.path,receipt.output.limitBytes);
    if(identity.bytes!==r.retainedBytes||identity.sha256!==r.sha256)fail('JOB_OUTPUT');result[stream]={path:r.path,...identity};
  }
  const ref=receipt.output.chunkIndex;
  if(index){
    if(!ref||ref.path!==join(directory,'chunks.json'))fail('JOB_OUTPUT');const bytes=await bytesAt(ref.path,1048576);
    if(bytes.length!==ref.bytes||sha(bytes)!==ref.sha256)fail('JOB_OUTPUT');
    let entries;try{entries=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('JOB_OUTPUT');}
    if(!Array.isArray(entries)||entries.length!==ref.entries||entries.length>8192)fail('JOB_OUTPUT');
    const offsets={stdout:0,stderr:0};for(const [seq,e]of entries.entries()){if(Object.keys(e).sort().join(',')!=='bytes,offset,seq,stream'||e.seq!==seq||!Object.hasOwn(offsets,e.stream)||e.offset!==offsets[e.stream]||!integer(e.bytes,1,4096))fail('JOB_OUTPUT');offsets[e.stream]+=e.bytes;}
    for(const s of ['stdout','stderr'])if(offsets[s]!==result[s].bytes)fail('JOB_OUTPUT');
  }
  return result;
}
export async function outputPage(receipt,directory,{stream,after=0,limitBytes=65536}){
  if(!['stdout','stderr'].includes(stream)||!integer(after)||!integer(limitBytes,1,65536))fail();
  const s=receipt.output[stream];if(after>s.retainedBytes||s.path!==join(directory,stream+'.bin'))fail('JOB_OUTPUT');
  const allowAppend=!terminal(receipt.state)&&receipt.output.chunkIndex===null;
  const bytes=await verifiedPage(s.path,s,{after,limitBytes,maxBytes:receipt.output.limitBytes,allowAppend}),nextCursor=after+bytes.length;
  return {schemaVersion:1,jobId:receipt.jobId,stream,after,dataBase64:bytes.toString('base64'),nextCursor,hasMore:nextCursor<s.retainedBytes,totals:{receivedBytes:s.receivedBytes,retainedBytes:s.retainedBytes,droppedBytes:s.droppedBytes},truncated:s.droppedBytes>0||s.capReached===true,coverage:s.coverage};
}
