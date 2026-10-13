import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {fault} from './client.mjs';

// The release package will carry this tiny host. Building locally uses the
// Windows .NET Framework compiler; no PowerShell, package download, or shell.
export async function buildJobHost(directory){
  if(process.platform!=='win32')throw fault('JOB_PLATFORM','Windows job ownership requires Windows');
  const command=join(directory,'workflow-job-host.exe');
  const compiler=join(process.env.SystemRoot??'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  try{await promisify(execFile)(compiler,['/nologo','/optimize+','/target:exe','/platform:x64',`/out:${command}`,fileURLToPath(new URL('./native/JobHost.cs',import.meta.url))],{windowsHide:true,timeout:15000,maxBuffer:8192});}
  catch(error){throw fault('JOB_BUILD','Could not build the Windows worker ownership host',{cause:error});}
  return command;
}
