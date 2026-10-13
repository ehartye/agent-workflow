import {isAbsolute,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fault} from '../foundation/client.mjs';

// Coordinator-owned literal prefixes, never Git ignores or worker-supplied globs.
export function validateCapturePolicy(value){
  const reject=()=>{throw fault('WORKSPACE_POLICY','Capture policy requires bounded, unambiguous relative paths and disjoint source ownership');};
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==3||value.version!==1
    ||!Array.isArray(value.excludeDirs)||!Array.isArray(value.protectedPaths)||value.excludeDirs.length>256||value.protectedPaths.length>20000)reject();
  const normalize=(values,directories)=>{
    const normalized=Array.from(values,name=>{
      if(typeof name!=='string'||!name||Buffer.byteLength(name)>1024||directories&&!name.endsWith('/')
        ||name!==name.normalize('NFC')||/[\\:\x00-\x1f\x7f*?<>|"~]/.test(name)||name.startsWith('/'))reject();
      const parts=(name.endsWith('/')?name.slice(0,-1):name).split('/');
      if(parts.some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)||part.toLowerCase()==='.git'
        ||/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)))reject();
      return name;
    }).sort();
    const keys=new Set();
    for(const name of normalized){
      const key=name.replace(/\/$/,'').toLowerCase();if(keys.has(key))reject();keys.add(key);
    }
    for(const key of keys){const parts=key.split('/');for(let i=1;i<parts.length;i++)if(keys.has(parts.slice(0,i).join('/')))reject();}
    return Object.freeze(normalized);
  };
  const policy=Object.freeze({version:1,excludeDirs:normalize(value.excludeDirs,true),protectedPaths:normalize(value.protectedPaths,false)});
  for(const excluded of policy.excludeDirs){
    const a=excluded.slice(0,-1).toLowerCase();
    for(const protectedPath of policy.protectedPaths){
      const b=protectedPath.replace(/\/$/,'').toLowerCase();
      if(a===b||b.startsWith(a+'/')||protectedPath.endsWith('/')&&a.startsWith(b+'/'))reject();
    }
  }
  const json=JSON.stringify(policy);if(Buffer.byteLength(json)>1024*1024)reject();
  return{policy,policyHash:createHash('sha256').update(json).digest('hex')};
}

// Host supplies a canonical owned worktree. Workflow code cannot supply roots.
export function writerPolicy(cwd){
  if(typeof cwd!=='string'||!isAbsolute(cwd))throw fault('WORKSPACE_PATH','Writer policy requires an absolute owned workspace');
  const sandboxPolicy={type:'workspaceWrite',writableRoots:[],networkAccess:false,excludeTmpdirEnvVar:true,excludeSlashTmp:true};
  // Omit environments: [] selects no local execution environment and removes roots.
  const common={cwd,runtimeWorkspaceRoots:[cwd],approvalPolicy:'never'};
  return{
    // Trust only this owned cwd in the worker process. Native thread/start otherwise
    // persists project trust globally, changing replay identity after the first writer.
    launchArgs:['-c',`projects={${JSON.stringify(cwd)}={trust_level="trusted"}}`],
    thread:{...common,sandbox:'workspace-write',config:{sandbox_workspace_write:{writable_roots:[],network_access:false,exclude_tmpdir_env_var:true,exclude_slash_tmp:true}}},
    turn:{...common,sandboxPolicy},
  };
}
function samePath(a,b){return typeof a==='string'&&isAbsolute(a)&&(process.platform==='win32'?resolve(a).toLowerCase()===resolve(b).toLowerCase():resolve(a)===resolve(b));}
export function assertWriterThread(thread,cwd){
  const policy=thread?.sandbox,profile=thread?.activePermissionProfile;
  if(!thread||!samePath(thread.cwd,cwd)||!Array.isArray(thread.runtimeWorkspaceRoots)||thread.runtimeWorkspaceRoots.length!==1||!samePath(thread.runtimeWorkspaceRoots[0],cwd)
    ||thread.approvalPolicy!=='never'||policy?.type!=='workspaceWrite'||policy.networkAccess!==false||policy.excludeTmpdirEnvVar!==true||policy.excludeSlashTmp!==true
    ||!Array.isArray(policy.writableRoots)||policy.writableRoots.length||profile!=null&&(profile.id!==':workspace'||profile.extends!=null))throw fault('THREAD_POLICY','Writer thread did not confirm exactly the owned workspace and permission ceiling');
}
