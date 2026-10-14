// Command-only CI diagnostics. No trust, policy or runtime changes; no raw output.
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';

if(process.platform!=='win32')throw Error('Windows diagnostics require Windows');
const executable=fileURLToPath(new URL('../foundation/native/win32-x64/workflow-job-host.exe',import.meta.url));
const powershell=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
const minimal={AGENT_WORKFLOW_VERIFY_FILE:executable};
for(const key of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE'])if(process.env[key])minimal[key]=process.env[key];
const vendor={...minimal,PSModulePath:join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','Modules')};
const user={...vendor},machine={...vendor};
for(const key of ['APPDATA','LOCALAPPDATA','HOMEDRIVE','HOMEPATH'])if(process.env[key])user[key]=process.env[key];
for(const key of ['SystemDrive','ProgramFiles','ProgramFiles(x86)','ProgramW6432','ProgramData','CommonProgramFiles','CommonProgramFiles(x86)','CommonProgramW6432','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','OS'])if(process.env[key])machine[key]=process.env[key];
machine.PATH=[join(process.env.SystemRoot,'System32'),process.env.SystemRoot,join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0')].join(';');
machine.ComSpec=join(process.env.SystemRoot,'System32','cmd.exe');
const signature=`'SIGNATURE_PROBE_START';
$ErrorActionPreference='Stop';
$env:PSModulePath=$PSHOME+'\\Modules';
$s=Get-AuthenticodeSignature -LiteralPath $env:AGENT_WORKFLOW_VERIFY_FILE;
'SIGNATURE_RETURNED';
$signer=@(); $timestamp=@();
if($null -ne $s.SignerCertificate){$signer=@($s.SignerCertificate.Extensions | Where-Object {$_.Oid.Value -eq '2.5.29.37'} | ForEach-Object {$_.EnhancedKeyUsages} | ForEach-Object {$_.Value})};
if($null -ne $s.TimeStamperCertificate){$timestamp=@($s.TimeStamperCertificate.Extensions | Where-Object {$_.Oid.Value -eq '2.5.29.37'} | ForEach-Object {$_.EnhancedKeyUsages} | ForEach-Object {$_.Value})};
[pscustomobject]@{status=[string]$s.Status;signerEkus=$signer;timestampEkus=$timestamp;timestampPresent=($null -ne $s.TimeStamperCertificate)} | ConvertTo-Json -Compress -Depth 4;
'SIGNATURE_PROJECTED'`;
const trivial="'SIGNATURE_PROBE_START'; '{\"status\":\"TRIVIAL_OK\"}'; 'SIGNATURE_PROJECTED'";
async function probe(name,script,env,closeInput){
  const started=performance.now();
  return new Promise(done=>{
    const child=execFile(powershell,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{env,windowsHide:true,timeout:15000,maxBuffer:16384},(error,stdout,stderr)=>{
      const lines=stdout.replace(/^\uFEFF/,'').split(/\r?\n/).map(line=>line.trim());
      let status=null,codeSigning=false,timestamp=false;
      for(const line of lines){if(!line.startsWith('{'))continue;try{const parsed=JSON.parse(line);if(['TRIVIAL_OK','Valid','NotSigned','NotTrusted','HashMismatch','UnknownError','NotSupportedFileFormat','Incompatible'].includes(parsed.status))status=parsed.status;codeSigning=Array.isArray(parsed.signerEkus)&&parsed.signerEkus.includes('1.3.6.1.5.5.7.3.3');timestamp=parsed.timestampPresent===true&&Array.isArray(parsed.timestampEkus)&&parsed.timestampEkus.includes('1.3.6.1.5.5.7.3.8');}catch{}}
      const result={name,durationMs:Math.round(performance.now()-started),exitCode:error?.code??0,killed:error?.killed===true,signal:error?.signal??null,stdoutBytes:Buffer.byteLength(stdout),stderrBytes:Buffer.byteLength(stderr),started:lines.includes('SIGNATURE_PROBE_START'),signatureReturned:lines.includes('SIGNATURE_RETURNED'),projected:lines.includes('SIGNATURE_PROJECTED'),status,codeSigning,timestamp};
      console.log(JSON.stringify(result));done(result);
    });
    if(closeInput)child.stdin.end();
  });
}
console.log(JSON.stringify({node:process.version,architecture:process.arch,temporaryPathSpellingMatches:resolve(tmpdir()).toLowerCase()===(await realpath(tmpdir())).toLowerCase(),repositoryPathSpellingMatches:resolve(process.cwd()).toLowerCase()===(await realpath(process.cwd())).toLowerCase()}));
await probe('language-minimal-closed',trivial,minimal,true);
const fixed=await probe('signature-vendor-modules',signature,vendor,true);
if(fixed.exitCode!==0||fixed.killed||fixed.status!=='Valid'){
  const profile=await probe('signature-vendor-profile',signature,user,true);
  const system=await probe('signature-vendor-machine',signature,machine,true);
  if(profile.exitCode!==0||profile.killed||profile.status!=='Valid')if(system.exitCode!==0||system.killed||system.status!=='Valid')await probe('signature-vendor-union',signature,{...user,...machine},true);
}
