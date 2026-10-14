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
const inherited={...process.env,AGENT_WORKFLOW_VERIFY_FILE:executable};
const signature=`$ErrorActionPreference='Stop';
Write-Output 'SIGNATURE_PROBE_START';
$s=Get-AuthenticodeSignature -LiteralPath $env:AGENT_WORKFLOW_VERIFY_FILE;
Write-Output 'SIGNATURE_RETURNED';
$signer=@(); $timestamp=@();
if($null -ne $s.SignerCertificate){$signer=@($s.SignerCertificate.Extensions | Where-Object {$_.Oid.Value -eq '2.5.29.37'} | ForEach-Object {$_.EnhancedKeyUsages} | ForEach-Object {$_.Value})};
if($null -ne $s.TimeStamperCertificate){$timestamp=@($s.TimeStamperCertificate.Extensions | Where-Object {$_.Oid.Value -eq '2.5.29.37'} | ForEach-Object {$_.EnhancedKeyUsages} | ForEach-Object {$_.Value})};
[pscustomobject]@{status=[string]$s.Status;signerEkus=$signer;timestampEkus=$timestamp;timestampPresent=($null -ne $s.TimeStamperCertificate)} | ConvertTo-Json -Compress -Depth 4;
Write-Output 'SIGNATURE_PROJECTED'`;
const trivial="Write-Output 'SIGNATURE_PROBE_START'; Write-Output '{\"status\":\"TRIVIAL_OK\"}'; Write-Output 'SIGNATURE_PROJECTED'";
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
await probe('trivial-minimal-open',trivial,minimal,false);
await probe('trivial-minimal-closed',trivial,minimal,true);
await probe('signature-minimal-open',signature,minimal,false);
await probe('signature-minimal-closed',signature,minimal,true);
await probe('signature-inherited-closed',signature,inherited,true);
