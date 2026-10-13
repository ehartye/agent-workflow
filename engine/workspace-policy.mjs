import {isAbsolute,resolve} from 'node:path';
import {fault} from '../foundation/client.mjs';

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
