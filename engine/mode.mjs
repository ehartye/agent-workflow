import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {atomicJson,defaultDataDir,readJson} from '../bin/managed-runtime.mjs';
const keyFor=value=>createHash('sha256').update(value).digest('hex');
const projectKey=cwd=>process.platform==='win32'?resolve(cwd).toLowerCase():resolve(cwd);
function location(dataDir,scope,key){return join(dataDir,'modes-v2',scope,keyFor(key)+'.json');}
async function setting(dataDir,scope,key){try{const value=await readJson(location(dataDir,scope,key));if(value.schema!==2||value.key!==key||typeof value.enabled!=='boolean')throw Error('Invalid workflow mode record');return value.enabled;}catch(e){if(e.code==='ENOENT')return undefined;throw e;}}
export async function readMode({dataDir=defaultDataDir(),cwd=process.cwd(),sessionId}={}){
 if(sessionId!==undefined&&(typeof sessionId!=='string'||sessionId.length>256))throw Error('Invalid session identity');
 const session=sessionId?await setting(dataDir,'sessions',sessionId):undefined;let project,projectPath;
 for(let cursor=resolve(cwd);;cursor=dirname(cursor)){project=await setting(dataDir,'projects',projectKey(cursor));if(project!==undefined){projectPath=cursor;break;}if(dirname(cursor)===cursor)break;}
 return{enabled:session??project??false,source:session!==undefined?'session':project!==undefined?'project':'default',session:session??null,project:project??null,projectPath:projectPath??null};
}
export async function setMode(value,{dataDir=defaultDataDir(),scope='session',sessionId,cwd=process.cwd(),env=process.env}={}){
 if(env.AGENT_WORKFLOW_WORKER==='1')throw Error('Worker processes cannot change workflow mode');if(!['on','off'].includes(value)||!['session','project'].includes(scope))throw Error('Mode requires on/off and session/project scope');
 if(scope==='session'&&(typeof sessionId!=='string'||!sessionId.trim()||sessionId.length>256))throw Error('Session mode requires an originating session');
 const key=scope==='session'?sessionId:projectKey(cwd);await atomicJson(location(dataDir,scope==='session'?'sessions':'projects',key),{schema:2,key,enabled:value==='on'});return{scope,configured:value==='on',...await readMode({dataDir,cwd,sessionId})};
}
export async function promptContext(input,{dataDir=defaultDataDir(),env=process.env}={}){
 if(env.AGENT_WORKFLOW_WORKER==='1'||!input||typeof input.prompt!=='string'||!input.prompt.trim()||(input.role&&input.role!=='user')||(input.input_source&&input.input_source!=='user'))return null;
 if(!(await readMode({dataDir,cwd:input.cwd??process.cwd(),sessionId:input.session_id??input.sessionId})).enabled)return null;
 return 'Agent Workflow mode is enabled for this session or project. For work that benefits from a durable multi-agent workflow, use the agent-workflow authoring skill and its packaged CLI. Keep ordinary questions and small direct edits in the current conversation. Continue the user’s active objective when they check in or steer the work. This mode grants no extra permissions; default to read-only and isolate explicitly authorized writes. Preserve the originating session, observed failures and unknown effects. Use the authenticated dashboard for activity and controls.';
}
