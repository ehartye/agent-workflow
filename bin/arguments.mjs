import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {defaultDataDir} from './managed-runtime.mjs';
const lifecycleOptions=['session','generation','revision','target','worker-generation','position','attempt','reason'];
const commands={mode:['cwd','scope','session'],help:[],setup:[],doctor:['cwd','backend','session0-desktop'],workflows:['cwd'],read:['cwd'],save:['cwd','script','command','overwrite'],validate:['script'],run:['cwd','session','script','args','concurrency','model','effort','max-attempts','writable','foreground','backend','run-timeout-ms','worker-timeout-ms','capture-policy','worker-capabilities','session0-desktop'],list:['show-hidden'],status:[],result:[],watch:['session','generation','after','jsonl','idle-ms','poll-ms'],worker:['position','generation','source-generation'],events:['position','generation','source-generation','after','limit'],patch:['position','generation','source-generation','basis'],exclusions:['position','generation','source-generation','stage','after','limit'],dashboard:['session','current-ui'],resume:['session','script','generation','run-timeout-ms','worker-timeout-ms'],pause:['session','generation'],stop:['session','generation'],steer:['session','generation','position','attempt','turn','text'],'cancel-worker':['session','generation','position','attempt','turn'],'restart-worker':['session','generation','position','attempt','reconcile'],control:['receipt'],lifecycle:[],'lifecycle-receipt':['receipt'],hide:[...lifecycleOptions,'request'],archive:[...lifecycleOptions,'request'],restore:[...lifecycleOptions,'request'],'prune-plan':lifecycleOptions,prune:['session','plan','approved-plan-hash']};
commands.append=['session','generation','request-id','tasks-file'];
commands.validate.push('summary');
commands.dashboard.push('lan-bind');
commands.resume.push('workflow-revisions-file');
commands.run.push('artifact-scope-file');
commands.children=['generation','after','limit'];
commands.steps=['generation','after','limit'];
commands['domain-control']=['session','request-file'];
commands['domain-control-receipt']=['session','request-id'];
commands['append-receipt']=['generation','request-id'];
commands['worker-deadline']=['session','generation','position','attempt','turn','deadline-revision','set-ms','extend-ms','clear'];
commands.run.push('access','parent-access','args-file');
commands.doctor.push('access','parent-access','session');
for(const command of ['run','resume','restart-worker'])commands[command].push('startup-timeout-ms');
const roadmapCommands={
 'capture-preflight':['cwd','capture-policy'],plan:['cwd','script'],usage:['generation'],
 acceptance:['session','request-file'],'checkpoint-record':['session','request-file'],checkpoint:['checkpoint-id','after','limit'],
 'check-record':['session','checkpoint-id','check-id','job-id'],'job-start':['session','request-file'],
 'job-status':['session','job-id'],'job-output':['session','job-id','stream','after','limit-bytes'],
 'job-cancel':['session','job-id','request-id','revision'],
};
Object.assign(commands,roadmapCommands);
const sessionReads=new Set(['acceptance','job-status','job-output']);
const booleans=new Set(['help','command','overwrite','writable','foreground','show-hidden','current-ui','jsonl','clear','summary']);
const runCommands=new Set(['append','append-receipt','status','result','watch','worker','events','patch','exclusions','dashboard','resume','pause','stop','steer','cancel-worker','restart-worker','control','lifecycle','lifecycle-receipt','hide','archive','restore','prune-plan','prune']);
const mutations=new Set(['append','dashboard','run','resume','pause','stop','steer','cancel-worker','restart-worker','hide','archive','restore','prune-plan','prune']);
runCommands.add('worker-deadline');mutations.add('worker-deadline');
for(const name of ['children','steps','domain-control','domain-control-receipt'])runCommands.add(name);
mutations.add('domain-control');
sessionReads.add('domain-control-receipt');
for(const command of Object.keys(roadmapCommands))if(!['plan','capture-preflight'].includes(command))runCommands.add(command);
for(const command of ['checkpoint-record','check-record','job-start','job-cancel'])mutations.add(command);
function roadmapInput(command,id,values){
 const required=key=>{if(typeof values[key]!=='string'||!values[key].trim())throw Error(`--${key} is required`);};
 const number=(key,min,max,needed=false)=>{if(values[key]===undefined&&!needed)return;required(key);if(!/^(0|[1-9][0-9]*)$/.test(values[key])||!Number.isSafeInteger(Number(values[key]))||Number(values[key])<min||Number(values[key])>max)throw Error(`--${key} requires a safe decimal integer from ${min} to ${max}`);};
 if(command==='plan'){if(id&&values.script!==undefined)throw Error('Choose a saved workflow name or --script');if(!id)required('script');}
 if(command==='usage')number('generation',1,Number.MAX_SAFE_INTEGER,true);
 if(['acceptance','checkpoint-record','job-start'].includes(command))required('request-file');
 if(command==='checkpoint'){
  if(values['checkpoint-id']!==undefined){required('checkpoint-id');if(values.after!==undefined||values.limit!==undefined)throw Error('Choose --checkpoint-id or --after/--limit (mutually exclusive)');}
  if(values.after!==undefined)required('after');number('limit',1,50);
 }
 if(['check-record','job-status','job-output','job-cancel'].includes(command))required('job-id');
 if(command==='check-record'){required('checkpoint-id');required('check-id');}
 if(command==='job-output'){
  if(!['stdout','stderr'].includes(values.stream))throw Error('--stream requires stdout or stderr');
  number('after',0,Number.MAX_SAFE_INTEGER);number('limit-bytes',1,65536);
 }
 if(command==='job-cancel'){required('request-id');number('revision',0,Number.MAX_SAFE_INTEGER,true);}
}
export function parseDeadlineOptions(values){
 const selected=['set-ms','extend-ms','clear'].filter(key=>values[key]!==undefined);
 if(selected.length!==1)throw Error('Choose exactly one of --set-ms, --extend-ms or --clear');
 const number=(key,min)=>{const raw=values[key],value=Number(raw);if(typeof raw!=='string'||!/^\d+$/.test(raw)||!Number.isSafeInteger(value)||value<min)throw Error(`--${key} requires a safe integer of at least ${min}`);return value;};
 return{operation:values.clear?'clear':selected[0]==='set-ms'?'set':'extend',expectedRevision:number('deadline-revision',0),...(values.clear?{}:{valueMs:number(selected[0],1)})};
}
// This legacy diagnostic entrypoint has no independent saved-runtime selector.
// Normalize only these read operations, then let main enforce normal ownership.
export function inspectCommand(tokens){
 const allow={plan:['cwd','script'],'capture-preflight':['cwd','capture-policy'],usage:['generation'],acceptance:['session','request-file'],checkpoint:['checkpoint-id','after','limit'],'job-status':['session','job-id'],'job-output':['session','job-id','stream','after','limit-bytes']};
 const keys=['inspect','run-id','data-dir','help',...new Set(Object.values(allow).flat())];
 const {values,positionals,tokens:parsed}=parseArgs({args:tokens,allowPositionals:true,tokens:true,options:Object.fromEntries(keys.map(key=>[key,{type:key==='help'?'boolean':'string'}]))});
 const command=values.inspect;if(!Object.hasOwn(allow,command))throw Error('--inspect requires a supported read operation');
 const seen=new Set();for(const token of parsed)if(token.kind==='option'){if(seen.has(token.name))throw Error(`Duplicate inspect option --${token.name}`);seen.add(token.name);}
 const runBound=!['plan','capture-preflight'].includes(command),allowed=['inspect','data-dir','help',...(runBound?['run-id']:[]),...allow[command]];
 for(const key of Object.keys(values))if(!allowed.includes(key))throw Error(`Option --${key} is not valid for --inspect ${command}`);
 if(positionals.length>(command==='plan'?1:0))throw Error('Unexpected inspect argument');
 if(runBound&&!values['run-id']&&!values.help)throw Error('--inspect saved reads require --run-id');
 const result=[command,...(runBound&&values['run-id']?[values['run-id']]:positionals)];
 for(const key of ['data-dir','help',...allow[command]])if(values[key]!==undefined)result.push(`--${key}`,...(key==='help'?[]:[values[key]]));
 return result;
}
export function parseCommand(tokens=process.argv.slice(2),env=process.env){
 const options=Object.fromEntries(['data-dir','help',...new Set(Object.values(commands).flat())].map(key=>[key,{type:booleans.has(key)?'boolean':'string'}]));
 const{values,positionals,tokens:parsedTokens}=parseArgs({args:tokens,options,allowPositionals:true,tokens:true});const command=positionals.shift()??'help';if(!Object.hasOwn(commands,command))throw Error(`Unknown command: ${command}`);
 {const seen=new Set();for(const token of parsedTokens)if(token.kind==='option'){if(seen.has(token.name)&&(Object.hasOwn(roadmapCommands,command)||command==='validate'&&token.name==='summary'||command==='dashboard'&&token.name==='lan-bind'))throw Error(`Duplicate option --${token.name}`);seen.add(token.name);}}
 for(const key of Object.keys(values))if(!['data-dir','help',...commands[command]].includes(key))throw Error(`Option --${key} is not valid for ${command}`);
 if(values.args!==undefined&&values['args-file']!==undefined)throw Error('--args and --args-file are mutually exclusive');
 if(values['startup-timeout-ms']!==undefined){
  const raw=values['startup-timeout-ms'],value=Number(raw);
  if(!/^\d+$/.test(raw)||!Number.isSafeInteger(value)||value<0||value>2147483647)throw Error('--startup-timeout-ms requires an integer from 0 to 2147483647');
  if(values.foreground)throw Error('--startup-timeout-ms applies only to detached starts');
 }
 if(['run','doctor'].includes(command)){
  values.access??=command==='run'?'parent':'restricted';
  if(!['parent','restricted'].includes(values.access))throw Error('--access requires parent or restricted');
  if(values['parent-access']!==undefined&&values.access!=='parent')throw Error('--parent-access requires --access parent');
 }
 if(values['session0-desktop']!==undefined&&!['inherit','shared'].includes(values['session0-desktop']))throw Error('--session0-desktop requires inherit or shared');
 const count=['mode','read','save','run','validate','plan',...runCommands].includes(command)?1:0;if(positionals.length>count)throw Error('Too many command arguments');
 const id=positionals[0];if((runCommands.has(command)&&command!=='dashboard'||['read','save'].includes(command))&&!id&&!values.help)throw Error(`${command} requires an identifier`);
 const sessionId=values.session??env.CODEX_THREAD_ID;
 if(!values.help&&(mutations.has(command)||sessionReads.has(command)||command==='watch'||command==='doctor'&&values.access==='parent')&&(!sessionId?.trim()||sessionId.length>256))throw Error('An originating Codex session is required: --session or CODEX_THREAD_ID');
 if(!values.help&&Object.hasOwn(roadmapCommands,command))roadmapInput(command,id,values);
 if(command==='mode'&&!['on','off','status'].includes(id))throw Error('mode requires on, off or status');
 if(env.AGENT_WORKFLOW_WORKER==='1'&&!['help','workflows','read','validate','list','status','result','worker','events','patch','exclusions','control','append-receipt','lifecycle','lifecycle-receipt','capture-preflight','plan','usage','acceptance','checkpoint','job-status','job-output','children','steps','domain-control-receipt'].includes(command)&&!(command==='mode'&&id==='status'))throw Error('Worker processes cannot launch recursive workflows or mutate workflow state');
 return{command,id,values,sessionId,dataDir:resolve(values['data-dir']??defaultDataDir(env)),cwd:resolve(values.cwd??process.cwd()),runCommand:runCommands.has(command),mutation:mutations.has(command),sessionRead:sessionReads.has(command)};
}
export const help=`Agent Workflow — subscription-backed Codex workflows

mode on|off|status [--scope session|project] [--session ID] [--cwd path]
setup | doctor [--cwd path]
workflows | read [scope:]name | save [scope:]name --script file [--command] [--overwrite]
validate file [--summary] | run [scope:]name [--script file] [--args JSON | --args-file path] [--writable]
run ... --parent-access context.json [--access parent] | run ... --access restricted
list [--show-hidden] | status ID | result ID | dashboard [ID]
watch ID --session ID --generation N --jsonl [--after N] [--idle-ms N] [--poll-ms N]
worker ID --position N --generation N
events ID --position N --generation N [--after N] [--limit N]
patch ID --position N --generation N [--basis inputs|base]
exclusions ID --position N --generation N [--stage inputs|outputs] [--after N] [--limit N]
dashboard [ID] [--current-ui] [--lan-bind privateIPv4] --session ID
resume ID [--script file] [--workflow-revisions-file file] | pause ID --generation N | stop ID --generation N
steps|children ID --generation N [--after cursor] [--limit N]
domain-control ID --session ID --request-file file
domain-control-receipt ID --session ID --request-id UUID
New run artifact ownership: --writable --artifact-scope-file file (providers remain unavailable).
Detached run/resume/restart-worker: [--startup-timeout-ms N]
steer ID --generation N --position N --attempt N --turn ID --text instruction
cancel-worker ID --generation N --position N --attempt N [--turn ID]
worker-deadline ID --session ID --generation N --position N --attempt N [--turn ID] --deadline-revision N (--set-ms N | --extend-ms N | --clear)
restart-worker ID --generation N --position N --attempt N --reconcile note
control ID --receipt ID
append ID --session ID --generation N --request-id UUID --tasks-file FILE
append-receipt ID --generation N --request-id UUID
lifecycle ID | lifecycle-receipt ID --receipt REQUEST_ID
hide|archive|restore ID --generation N --revision N --request REQUEST_ID [--reason note]
prune-plan ID --generation N --revision N --reason note
prune ID --plan reviewed.json --approved-plan-hash SHA256
capture-preflight [--cwd path] [--capture-policy file]
plan [scope:]name [--cwd path] | plan --script file [--cwd path]
usage ID --generation N
acceptance ID --session ID --request-file file
checkpoint-record ID --session ID --request-file file
checkpoint ID [--checkpoint-id ID | --after ID --limit N]
check-record ID --session ID --checkpoint-id ID --check-id ID --job-id ID
job-start ID --session ID --request-file file
job-status ID --session ID --job-id ID
job-output ID --session ID --job-id ID --stream stdout|stderr [--after N] [--limit-bytes N]
job-cancel ID --session ID --job-id ID --request-id UUID --revision N

Roadmap commands are candidate interfaces; provider availability depends on the selected
runtime. Usage, acceptance, checkpoint/check and job commands select the saved run's
recorded runtime. Missing exports are unsupported with exit 1 and no installation or
current-runtime fallback. Acceptance and job reads require the originating session.
Workers can inspect but cannot record checkpoints/checks, start jobs or cancel jobs.
Plan accepts exactly one source and never executes workflow code. Capture preflight
performs read-only admission, with no inference or writer workspace creation.
Input files require regular single-link UTF-8 with no linked ancestors:
plan 1 MiB, policy 2 MiB, acceptance 65536 bytes, checkpoint 1 MiB, job request 2 MiB.
Usage generation is positive; output byte cursor is nonnegative and page size 1..65536.
Assembly complete:false and blocked preflight exit 1. Job-start/status exit 0 means a
receipt was read, never successful execution; cancellation receipt is not owned drain.
Inspect the same request/job after lost output; never automatically repeat a mutation.

Visibility and prune-plan default to --target run. Worker targets require --target worker
--worker-generation N --position N --attempt N (the recorded cumulative attempt).
Visibility can hide active/unknown work and preserves its execution status and identity.
List returns {runs,counts}; --show-hidden includes hidden/archived runs. Lifecycle reads
include hidden workers and unknown counts. Restore changes only visibility.
Prune retires eligible run/worker live payloads after exact plan review, retaining execution
rows, capture/runtime/Git evidence and tombstones. Retired execution cannot be resumed.
After a lost prune response inspect lifecycle-receipt using the plan ID; never resubmit.

Windows MXC doctor/new starts accept --session0-desktop inherit|shared (default inherit).
Shared requires native Session 0 and explicit owner authorization for shared UI visibility.
Saved runs retain the selection on resume/restart; routing mode does not enable it.

New runs default to --access parent and require --parent-access file containing the
originating session's explicit permission snapshot. Missing authority fails closed.
Use --access restricted for read-only/no-network execution. Doctor defaults restricted;
parent doctor requires --access parent, --parent-access file and an originating session.
Saved runs retain their exact access policy; resume/restart reject access overrides.
Parent --writable assigns independent worktrees for review while retaining parent
execution access. These worktrees do not enforce filesystem security isolation.
Restricted --writable uses the existing Windows MXC workspace-write ceiling.

New starts accept --args JSON or --args-file path (mutually exclusive).
The file must be regular UTF-8 JSON and is read once into saved args.
The 2 MiB combined evaluator envelope still applies; replay never rereads the file.

New starts accept --capture-policy file with version 2 capture. The policy is persisted
before writer admission and resume/restart reject overrides.
New starts accept --worker-capabilities file with a version 1 skill/tool manifest.
Workers select declared IDs using skills and requireTools. Saved bundles are immutable.
Parent mode provisions enabled original native plugin/skill roots automatically.
Explicit bundles remain supported for role selection and required readiness.
Native skills.list/read use genuine selected executor roots; host-only connections
are not manufactured or assumed available.
Run/resume deadlines: --worker-timeout-ms 0 or positive safe milliseconds (default 0, unbounded); --run-timeout-ms 0..86400000 (default 0, completion/manual Stop). Saved deadlines persist on resume; explicit 0 clears a saved budget.
Live worker-deadline controls require the exact observed revision and nullable turn.
Set replaces remaining wall time, extend adds to a finite budget, clear removes it.
Inspect the control receipt after a lost response; never automatically resubmit.
Startup, command, interruption and cleanup limits remain independent. Pause waits for
accepted work; Stop cancels it. An explicit run wall deadline still applies during Pause.
Detached startup has a separate per-invocation 60000 ms launcher budget. Set
--startup-timeout-ms 0 to remove that wall timer, or 1..2147483647 to choose it.
This budget includes backend admission and capability-source retention before ready;
it is not saved worker/run authority and is not inherited by resume/restart.
The flag is refused with --foreground. After timeout or a lost response inspect the
saved admission/start outcome and cleanup; never automatically repeat the launch.

Use --data-dir path for explicit managed state. Controls, lifecycle mutations and starts
require the originating --session (defaults to CODEX_THREAD_ID). Workers use the installed
pinned Codex and existing ChatGPT login. Use --writable for reviewed writer workspaces;
worker workspace:'isolated' also requests an assigned captured worktree.
`;
