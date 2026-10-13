import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {defaultDataDir} from './managed-runtime.mjs';
const lifecycleOptions=['session','generation','revision','target','worker-generation','position','attempt','reason'];
const commands={mode:['cwd','scope','session'],help:[],setup:[],doctor:['cwd','backend'],workflows:['cwd'],read:['cwd'],save:['cwd','script','command','overwrite'],validate:['script'],run:['cwd','session','script','args','concurrency','model','effort','max-attempts','writable','foreground','backend','run-timeout-ms','worker-timeout-ms','capture-policy'],list:['show-hidden'],status:[],result:[],worker:['position','generation','source-generation'],events:['position','generation','source-generation','after','limit'],patch:['position','generation','source-generation','basis'],dashboard:['session','current-ui'],resume:['session','script','generation','run-timeout-ms','worker-timeout-ms'],pause:['session','generation'],stop:['session','generation'],steer:['session','generation','position','attempt','turn','text'],'cancel-worker':['session','generation','position','attempt','turn'],'restart-worker':['session','generation','position','attempt','reconcile'],control:['receipt'],lifecycle:[],'lifecycle-receipt':['receipt'],hide:[...lifecycleOptions,'request'],archive:[...lifecycleOptions,'request'],restore:[...lifecycleOptions,'request'],'prune-plan':lifecycleOptions,prune:['session','plan','approved-plan-hash']};
const booleans=new Set(['help','command','overwrite','writable','foreground','show-hidden','current-ui']);
const runCommands=new Set(['status','result','worker','events','patch','dashboard','resume','pause','stop','steer','cancel-worker','restart-worker','control','lifecycle','lifecycle-receipt','hide','archive','restore','prune-plan','prune']);
const mutations=new Set(['dashboard','run','resume','pause','stop','steer','cancel-worker','restart-worker','hide','archive','restore','prune-plan','prune']);
export function parseCommand(tokens=process.argv.slice(2),env=process.env){
 const options=Object.fromEntries(['data-dir','help',...new Set(Object.values(commands).flat())].map(key=>[key,{type:booleans.has(key)?'boolean':'string'}]));
 const{values,positionals}=parseArgs({args:tokens,options,allowPositionals:true});const command=positionals.shift()??'help';if(!Object.hasOwn(commands,command))throw Error(`Unknown command: ${command}`);
 for(const key of Object.keys(values))if(!['data-dir','help',...commands[command]].includes(key))throw Error(`Option --${key} is not valid for ${command}`);
 const count=['mode','read','save','run','validate',...runCommands].includes(command)?1:0;if(positionals.length>count)throw Error('Too many command arguments');
 const id=positionals[0];if((runCommands.has(command)&&command!=='dashboard'||['read','save'].includes(command))&&!id&&!values.help)throw Error(`${command} requires an identifier`);
 const sessionId=values.session??env.CODEX_THREAD_ID;
 if(!values.help&&mutations.has(command)&&(!sessionId?.trim()||sessionId.length>256))throw Error('An originating Codex session is required: --session or CODEX_THREAD_ID');
 if(command==='mode'&&!['on','off','status'].includes(id))throw Error('mode requires on, off or status');
 if(env.AGENT_WORKFLOW_WORKER==='1'&&!['help','workflows','read','validate','list','status','result','worker','events','patch','control','lifecycle','lifecycle-receipt'].includes(command)&&!(command==='mode'&&id==='status'))throw Error('Worker processes cannot launch recursive workflows or mutate workflow state');
 return{command,id,values,sessionId,dataDir:resolve(values['data-dir']??defaultDataDir(env)),cwd:resolve(values.cwd??process.cwd()),runCommand:runCommands.has(command),mutation:mutations.has(command)};
}
export const help=`Agent Workflow — subscription-backed Codex workflows

mode on|off|status [--scope session|project] [--session ID] [--cwd path]
setup | doctor [--cwd path]
workflows | read [scope:]name | save [scope:]name --script file [--command] [--overwrite]
validate file | run [scope:]name [--script file] [--args JSON] [--writable]
list [--show-hidden] | status ID | result ID | dashboard [ID]
worker ID --position N --generation N
events ID --position N --generation N [--after N] [--limit N]
patch ID --position N --generation N [--basis inputs|base]
resume ID [--script file] | pause ID --generation N | stop ID --generation N
steer ID --generation N --position N --attempt N --turn ID --text instruction
cancel-worker ID --generation N --position N --attempt N [--turn ID]
restart-worker ID --generation N --position N --attempt N --reconcile note
control ID --receipt ID
lifecycle ID | lifecycle-receipt ID --receipt REQUEST_ID
hide|archive|restore ID --generation N --revision N --request REQUEST_ID [--reason note]
prune-plan ID --generation N --revision N --reason note
prune ID --plan reviewed.json --approved-plan-hash SHA256

Visibility and prune-plan default to --target run. Worker targets require --target worker
--worker-generation N --position N --attempt N (the recorded cumulative attempt).
Visibility can hide active/unknown work and preserves its execution status and identity.
List returns {runs,counts}; --show-hidden includes hidden/archived runs. Lifecycle reads
include hidden workers and unknown counts. Restore changes only visibility.
Prune retires eligible run/worker live payloads after exact plan review, retaining execution
rows, capture/runtime/Git evidence and tombstones. Retired execution cannot be resumed.
After a lost prune response inspect lifecycle-receipt using the plan ID; never resubmit.

New starts accept --capture-policy file with version 2 capture. The policy is persisted
before writer admission and resume/restart reject overrides.
Run/resume deadlines: --worker-timeout-ms 1..1800000 (default 600000); --run-timeout-ms 0..86400000 (default 0, completion/manual Stop). Saved deadlines persist on resume.

Use --data-dir path for explicit managed state. Controls, lifecycle mutations and starts
require the originating --session (defaults to CODEX_THREAD_ID). Workers use the installed
pinned Codex and existing ChatGPT login. Writes require --writable and remain in isolated
worktrees for review.
`;
