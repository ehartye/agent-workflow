import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {dirname,resolve,isAbsolute} from 'node:path';
import {lstat,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fault} from './client.mjs';

const packagedRoot=fileURLToPath(new URL('./native/',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const field=(value,key)=>value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
const ownedFailures=new WeakSet();
const failure=(code,message)=>{const error=fault(code,message);ownedFailures.add(error);return error;};
const packageFailure=()=>failure('JOB_PACKAGE','Packaged Windows ownership host is missing or does not match its trusted manifest');
const signatureFailure=()=>failure('JOB_SIGNATURE','Packaged Windows ownership host does not have the required trusted signature');
const signatureCheckFailure=()=>failure('JOB_SIGNATURE_CHECK','Windows signature verification could not complete; artifact trust was not established');
const sameFile=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs&&b.nlink===1;

async function regularBytes(path,limit){
  const absolute=resolve(path);
  for(let parent=dirname(absolute);;parent=dirname(parent)){
    const stat=await lstat(parent);if(stat.isSymbolicLink()||!stat.isDirectory())throw packageFailure();
    if(dirname(parent)===parent)break;
  }
  const entry=await lstat(absolute);
  if(entry.isSymbolicLink()||!entry.isFile()||entry.nlink!==1||entry.size>limit)throw packageFailure();
  const handle=await open(absolute,'r');
  try{
    const before=await handle.stat();if(!sameFile(entry,before))throw packageFailure();
    const buffer=Buffer.alloc(before.size+1),{bytesRead}=await handle.read(buffer,0,buffer.length,0);
    if(bytesRead!==before.size||!sameFile(before,await handle.stat())||!sameFile(before,await lstat(absolute)))throw packageFailure();
    return buffer.subarray(0,bytesRead);
  }finally{await handle.close();}
}

// Fixed builtin-only script. The artifact path is data in a child-only variable,
// never interpolated into PowerShell source. No script file or policy override.
const signatureCommand=`$ErrorActionPreference='Stop';
$env:PSModulePath=$PSHOME+'\\Modules';
$s=Get-AuthenticodeSignature -LiteralPath $env:AGENT_WORKFLOW_VERIFY_FILE;
$signer=@(); $timestamp=@();
if($null -ne $s.SignerCertificate){$signer=@($s.SignerCertificate.Extensions | Where-Object {$_.Oid.Value -eq '2.5.29.37'} | ForEach-Object {$_.EnhancedKeyUsages} | ForEach-Object {$_.Value})};
if($null -ne $s.TimeStamperCertificate){$timestamp=@($s.TimeStamperCertificate.Extensions | Where-Object {$_.Oid.Value -eq '2.5.29.37'} | ForEach-Object {$_.EnhancedKeyUsages} | ForEach-Object {$_.Value})};
[pscustomobject]@{status=[string]$s.Status;signerEkus=$signer;timestampEkus=$timestamp;timestampPresent=($null -ne $s.TimeStamperCertificate)} | ConvertTo-Json -Compress -Depth 4`;

async function checkWindowsSignature(executable){
  const systemRoot=process.env.SystemRoot;
  if(!systemRoot||!isAbsolute(systemRoot))throw signatureCheckFailure();
  const command=join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  // Only vendor modules are needed. Pin both startup and effective search paths;
  // Windows PowerShell otherwise reconstructs broader module discovery roots.
  const env={AGENT_WORKFLOW_VERIFY_FILE:executable,PSModulePath:join(dirname(command),'Modules')};
  for(const name of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE'])if(process.env[name])env[name]=process.env[name];
  try{
    const {stdout,stderr}=await promisify(execFile)(command,['-NoLogo','-NoProfile','-NonInteractive','-Command',signatureCommand],{env,windowsHide:true,timeout:15000,maxBuffer:16384});
    if(stderr.trim())throw signatureCheckFailure();
    return JSON.parse(stdout.replace(/^\uFEFF/,''));
  }catch{throw signatureCheckFailure();}
}

// The production wrapper below fixes root and policy. The verifier is exported
// for nonexecuting package tests; it never starts the supplied executable.
export async function verifyJobHostPackage({nativeRoot,policy,platform=process.platform,arch=process.arch,signatureCheck=checkWindowsSignature}){
  if(platform!=='win32'||arch!=='x64')throw fault('JOB_PLATFORM','Windows job ownership requires Windows x64');
  try{
    const profile=field(policy,'profileEku');
    if(field(policy,'version')!==1||typeof profile!=='string'||!/^1\.3\.6\.1\.4\.1\.311\.97\.[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(profile)||profile.length>160||Object.keys(policy).sort().join(',')!=='profileEku,version')throw packageFailure();
    const folder=join(nativeRoot,'win32-x64'),executable=join(folder,'workflow-job-host.exe'),manifestPath=join(folder,'manifest.json'),sourcePath=join(nativeRoot,'JobHost.cs');
    const manifestBytes=await regularBytes(manifestPath,4096),manifest=JSON.parse(manifestBytes.toString('utf8'));
    if(Object.keys(manifest).sort().join(',')!=='arch,binarySha256,platform,profileEku,sourceSha256,version'||manifest.version!==1||manifest.platform!=='win32'||manifest.arch!=='x64'||manifest.profileEku!==profile||![manifest.sourceSha256,manifest.binarySha256].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)))throw packageFailure();
    const source=await regularBytes(sourcePath,1024*1024),binary=await regularBytes(executable,4*1024*1024);
    if(sha(source)!==manifest.sourceSha256||sha(binary)!==manifest.binarySha256||binary.length<64||binary.readUInt16LE(0)!==0x5a4d)throw packageFailure();
    const peOffset=binary.readUInt32LE(60);
    if(peOffset<64||peOffset>binary.length-6||binary.readUInt32LE(peOffset)!==0x4550||binary.readUInt16LE(peOffset+4)!==0x8664)throw packageFailure();
    let signature;try{signature=await signatureCheck(executable);}catch{throw signatureCheckFailure();}
    const signer=field(signature,'signerEkus'),timestamp=field(signature,'timestampEkus');
    if(field(signature,'status')!=='Valid'||field(signature,'timestampPresent')!==true||!Array.isArray(signer)||signer.length>32||!Array.isArray(timestamp)||timestamp.length>32||!signer.includes('1.3.6.1.5.5.7.3.3')||!signer.includes(profile)||!timestamp.includes('1.3.6.1.5.5.7.3.8'))throw signatureFailure();
    if(!(await regularBytes(manifestPath,4096)).equals(manifestBytes)||sha(await regularBytes(sourcePath,1024*1024))!==manifest.sourceSha256||sha(await regularBytes(executable,4*1024*1024))!==manifest.binarySha256)throw packageFailure();
    return executable;
  }catch(error){if(ownedFailures.has(error))throw error;throw packageFailure();}
}

// directory remains accepted for existing callers; runtime compilation is never
// a fallback. Release tooling builds and signs the packaged artifact explicitly.
export async function buildJobHost(directory){
  if(process.platform!=='win32'||process.arch!=='x64')throw fault('JOB_PLATFORM','Windows job ownership requires Windows x64');
  try{
    const policyPath=join(packagedRoot,'job-host-policy.json'),policyBytes=await regularBytes(policyPath,4096);
    const executable=await verifyJobHostPackage({nativeRoot:packagedRoot,policy:JSON.parse(policyBytes.toString('utf8'))});
    if(!(await regularBytes(policyPath,4096)).equals(policyBytes))throw packageFailure();
    return executable;
  }catch(error){if(ownedFailures.has(error))throw error;throw packageFailure();}
}
