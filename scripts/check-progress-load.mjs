// Explicit coordinator acceptance, outside merge-test timing budgets.
// Usage: node scripts/check-progress-load.mjs [--report repo-local.json] [--events 8192]
// Requires the coordinator's installed pinned dependencies and Node 24+; never installs.
// Real SQLite/controller/QuickJS evaluator and stdio process boundaries, with a
// SYNTHETIC native-protocol backend. No model, Windows job or arbitrary descendant proof.
// Watchdogs bound a stuck fixture; measured durations are not performance thresholds.
import assert from 'node:assert/strict';
import {mkdtemp,stat,lstat,realpath,rm,writeFile} from 'node:fs/promises';
import {basename,dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';

const self=fileURLToPath(import.meta.url),repository=resolve(dirname(self),'..');
const threadId='synthetic-load-thread',turnId='synthetic-load-turn';
const initialUsage={inputTokens:10,cachedInputTokens:2,outputTokens:3,reasoningOutputTokens:1,totalTokens:13,cacheWriteInputTokens:1};
const finalUsage={inputTokens:100,cachedInputTokens:20,outputTokens:400,reasoningOutputTokens:40,totalTokens:500,cacheWriteInputTokens:4};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const usageEvent=total=>({method:'thread/tokenUsage/updated',params:{threadId,turnId,tokenUsage:{total}}});
const progressEvent=index=>({method:'item/agentMessage/delta',params:{threadId,turnId,itemId:'progress',delta:'progress:'+index+':'+'x'.repeat(256)}});
const terminalEvent=status=>({method:'turn/completed',params:{threadId,turn:{id:turnId,status,items:[]}}});
const validCount=count=>Number.isSafeInteger(count)&&count>=8192&&count<=65536&&count%2===0;
async function bounded(promise,label){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Fixture watchdog expired: '+label),{code:'FIXTURE_WATCHDOG'})),180000);})]);}
  finally{clearTimeout(timer);}
}

// This branch loads only Node builtins. It never executes a workflow script.
async function fixture(count){
  assert.ok(validCount(count),'Fixture requires an even event count from 8192 to 65536');
  let started=false,interrupted=false,progressSent=0,usageSent=0,terminalSent=0,interruptRequests=0,activityBytesSent=0;
  const write=message=>new Promise((resolve,reject)=>process.stdout.write(JSON.stringify(message)+'\n',error=>error?reject(error):resolve()));
  const reply=(id,result)=>write({id,result});
  const event=async message=>{activityBytesSent+=bytes(message);await write(message);};
  for await(const line of createInterface({input:process.stdin})){
    const request=JSON.parse(line),params=request.params??{};
    switch(request.method){
      case 'initialize':await reply(request.id,{userAgent:'synthetic-progress-load-v1',pid:process.pid});break;
      case 'initialized':break;
      case 'turn/start':
        assert.equal(started,false);assert.equal(params.threadId,threadId);
        assert.equal(params.approvalPolicy,'never');assert.deepEqual(params.sandboxPolicy,{type:'readOnly',networkAccess:false});
        started=true;await reply(request.id,{turn:{id:turnId}});
        usageSent++;await event(usageEvent(initialUsage));break;
      case 'fixture/progress':
        assert.equal(started,true);assert.equal(interrupted,false);
        assert.ok([count/2,count].includes(params.through)&&params.through>progressSent);
        // Await stdout backpressure rather than queueing the entire workload.
        while(progressSent<params.through)await event(progressEvent(progressSent++));
        if(progressSent===count){usageSent++;await event(usageEvent(finalUsage));}
        await reply(request.id,{progressSent,usageSent,activityBytesSent});break;
      case 'turn/interrupt':
        assert.equal(params.threadId,threadId);assert.equal(params.turnId,turnId);
        assert.equal(progressSent,count);assert.equal(interrupted,false);
        interrupted=true;interruptRequests++;await reply(request.id,{});
        terminalSent++;await event(terminalEvent('interrupted'));break;
      case 'fixture/status':
        await reply(request.id,{pid:process.pid,progressSent,usageSent,terminalSent,interruptRequests,activityBytesSent});break;
      case 'fixture/late':
        assert.equal(interrupted,true);
        // A stale usage update, answer and completion must not promote unknown work.
        await write(usageEvent({...finalUsage,totalTokens:9999}));
        await write({method:'item/completed',params:{threadId,turnId,item:{id:'late-answer',type:'agentMessage',phase:'final_answer',text:'late success'}}});
        await write(terminalEvent('completed'));
        await reply(request.id,{lateEventsSent:3});break;
      default:throw new Error('Unexpected fixture method: '+request.method);
    }
  }
  // EOF permits a natural owned-process exit; there are no spawned descendants.
}

function options(argv){
  const result={events:8192,reportPath:null};
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--events'){assert.ok(argv[i+1]);result.events=Number(argv[++i]);}
    else if(argv[i]==='--report'){assert.ok(argv[i+1]);result.reportPath=resolve(argv[++i]);}
    else throw new Error('Usage: node scripts/check-progress-load.mjs [--report repo-local.json] [--events 8192]');
  }
  assert.ok(validCount(result.events),'--events must be an even integer from 8192 to 65536');
  return result;
}
function assertInside(root,path){
  const rel=relative(root,path);
  assert.ok(rel!==''&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../'),'Path must stay inside this repository: '+path);
}
async function reportTarget(path){
  if(!path)return;
  assertInside(repository,path);
  // Existing regular parents only; refuse symlink escapes and overwrites.
  const root=await realpath(repository),parent=await realpath(dirname(path));
  if(parent!==root)assertInside(root,parent);
  try{await lstat(path);throw new Error('Report already exists; choose a new report path: '+path);}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
async function databaseBytes(runDir){
  const result={};
  for(const [label,suffix]of [['database', ''],['wal','-wal'],['sharedMemory','-shm']]){
    try{result[label]=(await stat(join(runDir,'run.sqlite'+suffix))).size;}
    catch(error){if(error.code!=='ENOENT')throw error;result[label]=0;}
  }
  return{...result,total:result.database+result.wal+result.sharedMemory};
}

async function acceptance(config){
  const start=performance.now(),ready=deferred(),closing=deferred(),releaseClose=deferred();
  const report={schema:1,at:new Date().toISOString(),outcome:'unknown',synthetic:true,
    scope:{backend:'synthetic native-protocol stdio fixture',boundaries:['SQLite durable independent reads','workflow controller','separate QuickJS evaluator process','separate owned protocol fixture process'],
      realModel:false,windowsJob:false,arbitraryDescendants:'notVerified',historicalTimingEquivalence:'notEstablished'},
    node:process.version,platform:process.platform,executable:process.execPath,requestedProgressEvents:config.events,
    byteDefinitions:{database:'Physical SQLite database/WAL/SHM sizes, including allocation and free pages',
      responses:'UTF-8 bytes of JSON.stringify, excluding transport framing',retainedActivityResponse:'All retained records collected through bounded pages'},
    timingsMs:{},checkpoints:{},effects:{fixtureStartAttempted:false,fixtureConnected:false,controllerStarted:false,controllerSettled:false}};
  let stage='prerequisites',root,client,work,cleanup,closePromise,closeEnteredAt,exitAt,terminalAt,cancelAt,publicationAt,releaseAt;
  let dispatches=0,observedProgress=0,observedUsage=0,observedTerminal=0,lateEvent,lateActive,retry;
  const closeFixture=()=>closePromise??=(async()=>{
    const drainStart=performance.now();
    cleanup=await client.close();exitAt=performance.now();
    report.timingsMs.ownedBackendDrain=exitAt-drainStart;return cleanup;
  })();
  try{
    assert.ok(Number(process.versions.node.split('.')[0])>=24,'Node 24+ is required');
    // Resolve every evaluator/controller dependency before creating state or processes.
    report.dependencies={};
    for(const name of ['acorn','ajv','quickjs-emscripten'])report.dependencies[name]=import.meta.resolve(name);
    const {runWorkflow,readRun,requestControl,readControl}=await import('../engine/controller.mjs');
    const {monitorData}=await import('../engine/monitor-data.mjs');
    const {AppServer}=await import('../foundation/client.mjs');
    const {runTurn}=await import('../foundation/turn.mjs');
    stage='owned fixture setup';root=await mkdtemp(join(repository,'.progress-load-'));
    report.ownedDirectory=root;const runDir=join(root,'run');
    report.effects.fixtureStartAttempted=true;
    client=await AppServer.connect({command:process.execPath,args:[self,'--fixture',String(config.events)],cwd:root,requestTimeoutMs:180000,shutdownMs:5000,
      env:Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(SystemRoot|WINDIR|TEMP|TMP|PATH)$/i.test(key)))});
    report.effects.fixtureConnected=true;report.fixturePid=client.identity.pid;
    assert.ok(Number.isSafeInteger(client.identity.pid)&&client.identity.pid!==process.pid);
    const backend={identity:'synthetic-progress-load-v1',
      execute:async({signal,options,onEvent,onActive,reserveRetry})=>{
        dispatches++;lateEvent=()=>onEvent(progressEvent(config.events));lateActive=()=>onActive({threadId,turnId:'late'});retry=reserveRetry;
        try{
          const result=await runTurn(client,{threadId,prompt:'Synthetic controlled progress load',signal,timeoutMs:options.timeoutMs,interruptTimeoutMs:30000,
            onActive:identity=>{onActive(identity);ready.resolve(identity);},
            onEvent:message=>{
              onEvent(message);
              if(message.method==='item/agentMessage/delta')observedProgress++;
              if(message.method==='thread/tokenUsage/updated')observedUsage++;
              if(message.method==='turn/completed'){observedTerminal++;terminalAt=performance.now();}
            }});
          return{value:result.text,terminalObserved:true};
        }catch(error){error.evidence={scope:'synthetic native-protocol fixture',protocol:error.output??null};throw error;}
      },
      close:async()=>{closeEnteredAt=performance.now();closing.resolve();await releaseClose.promise;return closeFixture();}};
    const input={runDir,sessionId:'synthetic-progress-load-session',script:'export const meta={name:"progress-load",description:"Synthetic coordinator acceptance"};return await agent("Controlled progress");',
      timeoutMs:null,workerTimeoutMs:600000,drainTimeoutMs:30000};
    report.effects.controllerStarted=true;work=runWorkflow({...input,backend});
    work.then(()=>{report.effects.controllerSettled=true;},()=>{report.effects.controllerSettled=true;});
    stage='evaluator/backend admission';
    await bounded(Promise.race([ready.promise,
      closing.promise.then(()=>{throw new Error('Controller reached shutdown before fixture admission');}),
      work.then(run=>{throw new Error('Workflow settled before fixture admission: '+JSON.stringify(run.error));})]),stage);
    const checkpoint=async(label,expected,expectedUsage)=>{
      const readStart=performance.now(),run=await readRun(runDir);
      const summary=await monitorData(runDir,{generation:1});
      const worker=await monitorData(runDir,{kind:'worker',generation:1,position:0});
      const records=[],pages=[];let after=0,page;
      do{
        page=await monitorData(runDir,{kind:'activity',generation:1,position:0,after,limit:100});
        report.lastActivityRead={checkpoint:label,observed:page.observed,retained:page.retained,discarded:page.dropped,returned:page.records.length};
        assert.equal(page.observed,expected);assert.equal(page.retained,256);assert.equal(page.dropped,expected-256);
        assert.equal(page.sourceGeneration,1);assert.ok(page.records.length<=100);
        records.push(...page.records);pages.push(bytes(page));after=page.nextCursor;
        assert.ok(pages.length<=3,'Bounded retained history must not expand with observed progress');
      }while(page.hasMore);
      assert.equal(records.length,256);assert.equal(new Set(records.map(record=>record.seq)).size,256);
      assert.ok(records.every((record,i)=>!i||record.seq>records[i-1].seq));
      assert.equal(worker.activityCount,expected);assert.deepEqual(worker,run.workers[0]);
      assert.deepEqual(worker.usage,{observedThreads:1,...expectedUsage});
      assert.equal(worker.usageByThread[threadId].totalTokens,expectedUsage.totalTokens);
      assert.equal(summary.workers[0].activityCount,expected);assert.deepEqual(summary.workers[0].usage,worker.usage);
      assert.ok(bytes(run)<=128*1024);assert.ok(bytes(summary)<=128*1024);
      assert.ok(records.every(record=>bytes(record)<=16384));
      const observation={runStatus:run.status,workerStatus:worker.status,
        counts:{observed:page.observed,retained:page.retained,discarded:page.dropped,returned:records.length},
        firstSequence:records[0].seq,lastSequence:records.at(-1).seq,usage:worker.usage,
        bytes:{database:await databaseBytes(runDir),runResponse:bytes(run),monitorSummaryResponse:bytes(summary),workerResponse:bytes(worker),
          activityPageResponses:pages,retainedActivityResponse:bytes(records)},readMs:performance.now()-readStart};
      report.checkpoints[label]=observation;return{run,records};
    };
    stage='first progress half';const loadStart=performance.now();
    const midFixture=await client.request('fixture/progress',{through:config.events/2});
    assert.equal(midFixture.progressSent,config.events/2);
    stage='mid-run durable read';const mid=await checkpoint('midRun',config.events/2+1,initialUsage);
    assert.equal(mid.run.status,'running');assert.equal(mid.run.workers[0].status,'running');
    assert.equal(mid.run.cleanup,undefined);assert.deepEqual(mid.run.workers[0].activeTurn,{threadId,turnId});
    assert.ok(mid.records.every(record=>record.type!=='usage'),'Usage survives eviction of its activity record');
    assert.equal(mid.records[0].output,progressEvent(config.events/2-256).params.delta);
    assert.equal(mid.records.at(-1).output,progressEvent(config.events/2-1).params.delta);
    stage='second progress half';const loaded=await client.request('fixture/progress',{through:config.events});
    assert.equal(loaded.progressSent,config.events);assert.equal(loaded.usageSent,2);
    stage='pre-cancellation durable read';const before=await checkpoint('beforeStop',config.events+2,finalUsage);
    assert.equal(before.run.status,'running');assert.equal(before.run.workers[0].status,'running');
    assert.equal(before.records.at(-1).type,'usage');
    report.timingsMs.loadIncludingDurableReads=performance.now()-loadStart;
    stage='explicit Stop';cancelAt=performance.now();
    const receipt=await requestControl(runDir,{sessionId:input.sessionId,generation:1,action:'stop'});
    await bounded(Promise.race([closing.promise,work.then(()=>{throw new Error('Terminal published before controlled close barrier');})]),'controller interruption/drain');
    // Shutdown admission can enter before the interrupt notification and the
    // worker's terminal row settle. Observe those durable facts explicitly;
    // entering close is not evidence that execution has already drained.
    const interruptionDeadline=performance.now()+180000;
    while(true){
      const observed=await readRun(runDir),worker=observed.workers[0];
      if(worker?.status==='unknown'&&worker.activityCount===config.events+3&&worker.interruption?.terminalObserved===true)break;
      if(performance.now()>=interruptionDeadline)throw Object.assign(new Error('Fixture watchdog expired: durable interruption'),{code:'FIXTURE_WATCHDOG'});
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    stage='durable interruption before owned exit';const during=await checkpoint('draining',config.events+3,finalUsage);
    assert.equal(during.run.status,'stopping');assert.equal(during.run.acceptingControls,false);assert.equal(during.run.cleanup,undefined);
    assert.equal(during.run.workers[0].status,'unknown');assert.equal(during.run.workers[0].activeTurn,undefined);
    assert.equal(during.run.workers[0].notStarted,false);assert.equal(during.run.workers[0].noProcessStarted,false);
    assert.equal(during.run.workers[0].result,undefined);
    assert.deepEqual(during.run.workers[0].interruption,{terminalObserved:true,terminalStatus:'interrupted',descendants:'notVerified'});
    assert.equal(during.records.at(-1).status,'interrupted');
    report.control=await readControl(runDir,receipt.id);assert.equal(report.control.status,'applied');
    report.fixtureCounts=await client.request('fixture/status',{});
    assert.equal(report.fixtureCounts.progressSent,config.events);assert.equal(report.fixtureCounts.usageSent,2);
    assert.equal(report.fixtureCounts.terminalSent,1);assert.equal(report.fixtureCounts.interruptRequests,1);
    assert.equal(observedProgress,config.events);assert.equal(observedUsage,2);assert.equal(observedTerminal,1);
    report.protocol=during.run.workers[0].evidence.protocol;
    assert.equal(report.protocol.observedMessages,config.events+3);
    assert.equal(report.protocol.observedBytes,report.fixtureCounts.activityBytesSent);
    stage='late activity refusal while unknown';
    assert.throws(lateEvent,{code:'RUN_RETIRED'});assert.throws(lateActive,{code:'RUN_RETIRED'});await assert.rejects(retry(),{code:'RUN_STOPPED'});
    report.lateProtocol=await client.request('fixture/late',{});assert.equal(report.lateProtocol.lateEventsSent,3);
    assert.deepEqual(await readRun(runDir),during.run);
    releaseAt=performance.now();releaseClose.resolve();
    stage='positive owned exit and terminal publication';const done=await bounded(work,stage);publicationAt=performance.now();
    assert.equal(done.status,'blocked');assert.equal(done.cleanup.serverExited,true);assert.equal(done.cleanup.forced,false);
    assert.equal(done.cleanup.descendants,'notVerified');assert.equal(done.workers[0].status,'unknown');
    assert.equal(done.coverage.complete,false);assert.equal(done.coverage.unknown,1);assert.equal(done.attempts,1);
    assert.equal(done.workers[0].result,undefined);assert.ok(publicationAt>=exitAt);
    assert.equal(done.sessionId,mid.run.sessionId);assert.equal(done.runtimeIdentity,mid.run.runtimeIdentity);
    assert.equal(done.backendIdentity,mid.run.backendIdentity);assert.equal(done.generation,1);
    const terminal=await checkpoint('terminal',config.events+3,finalUsage);assert.deepEqual(terminal.run,done);
    assert.deepEqual(terminal.records,during.records);
    stage='retired writes, controls and unknown replay refusal';
    assert.throws(lateEvent,{code:'RUN_RETIRED'});assert.throws(lateActive,{code:'RUN_RETIRED'});
    await assert.rejects(requestControl(runDir,{sessionId:input.sessionId,generation:1,action:'stop'}),{code:'CONTROL_TERMINAL'});
    await assert.rejects(runWorkflow({...input,resume:true,backend:{identity:backend.identity,execute:async()=>{dispatches++;return{value:'forbidden replay',terminalObserved:true};},close:async()=>({serverExited:true,descendants:'notVerified'})}}),{code:'REPLAY_UNKNOWN'});
    assert.equal(dispatches,1);assert.deepEqual(await readRun(runDir),done);
    const unchanged=await monitorData(runDir,{kind:'activity',generation:1,position:0,limit:100});
    assert.equal(unchanged.observed,config.events+3);assert.deepEqual(unchanged.records,terminal.records.slice(0,100));
    report.identity={sessionId:done.sessionId,runtimeIdentity:done.runtimeIdentity,backendIdentity:done.backendIdentity,generation:done.generation};
    report.counts={progressObserved:observedProgress,usageObserved:observedUsage,terminalObserved:observedTerminal,totalObserved:observedProgress+observedUsage+observedTerminal,
      retained:256,discarded:config.events+3-256,dispatches,lateCallbackRefusalsWhileUnknown:3,lateCallbackRefusalsAfterPublication:2,
      lateProtocolIgnored:3,replayRefused:true};
    Object.assign(report.timingsMs,{cancelToDurableInterruption:terminalAt-cancelAt,cancelToCloseBarrier:closeEnteredAt-cancelAt,
      controlledCloseBarrierHeld:releaseAt-closeEnteredAt,cancelToOwnedExit:exitAt-cancelAt,cancelToTerminalPublication:publicationAt-cancelAt,wallToTerminalPublication:publicationAt-start});
    report.cleanup=done.cleanup;report.outcome='passed';
  }catch(error){
    report.outcome=stage==='prerequisites'?'blocked':'failed';
    report.error={stage,code:error.code??'ACCEPTANCE_FAILED',message:error.message};
    if(error.cleanup)cleanup=error.cleanup;
  }finally{
    releaseClose.resolve();
    // Close the one owned fixture once; never redispatch or repeat an uncertain Stop.
    if(client){
      try{await closeFixture();}catch(error){report.cleanupError={code:error.code??'CLEANUP_FAILED',message:error.message};report.outcome='failed';}
    }
    if(work&&!report.effects.controllerSettled){
      try{await bounded(work,'failure cleanup');}catch(error){report.settlementError={code:error.code??'SETTLEMENT_FAILED',message:error.message};}
    }
    report.counts={...report.counts,progressObserved:observedProgress,usageObserved:observedUsage,terminalObserved:observedTerminal,
      totalObserved:observedProgress+observedUsage+observedTerminal,dispatches};
    report.cleanup??=cleanup??null;
    // Failure evidence remains for coordinator reconciliation. Success deletes only
    // this mkdtemp directory after both controller settlement and positive owned exit.
    if(root){
      report.ownedDirectoryRemoved=false;
      if(report.outcome==='passed'&&report.effects.controllerSettled&&cleanup?.serverExited===true){
        try{
          assertInside(repository,root);assert.equal(dirname(root),repository);assert.ok(basename(root).startsWith('.progress-load-'));
          assert.equal((await lstat(root)).isDirectory(),true);assert.equal((await lstat(root)).isSymbolicLink(),false);
          await rm(root,{recursive:true,force:true});report.ownedDirectoryRemoved=true;
        }catch(error){
          report.outcome='failed';report.directoryCleanup={status:'unknown',code:error.code??'CLEANUP_FAILED',message:error.message};
        }
      }
    }
    report.timingsMs.wall=performance.now()-start;
  }
  return report;
}

if(process.argv[2]==='--fixture'){
  await fixture(Number(process.argv[3])).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
}else{
  try{
    const config=options(process.argv.slice(2));await reportTarget(config.reportPath);
    const report=await acceptance(config);
    if(config.reportPath)await writeFile(config.reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({...report,reportPath:config.reportPath},null,2));
    if(report.outcome!=='passed')process.exitCode=1;
  }catch(error){
    // An uncertain report write is never retried or redirected to another file.
    console.error(JSON.stringify({synthetic:true,outcome:'failed',code:error.code??'ACCEPTANCE_FAILED',message:error.message}));process.exitCode=1;
  }
}
