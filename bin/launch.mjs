#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { dataDirFromArgs, pluginRoot, assertNoSymlink } from '../src/paths.mjs';
import { sourceDigest } from './runtime-install.mjs';
async function main(){
 const args=process.argv.slice(2);const dataDir=dataDirFromArgs(args);let record;
 const setupInfo=async reason=>{if(args[0]!=='mcp')return false;const {serveSetupInfo}=await import('./setup-info-mcp.mjs');serveSetupInfo({pluginRoot,dataDir,reason});return true;};
 try{record=JSON.parse(await readFile(path.join(dataDir,'runtime.json'),'utf8'));}
 catch(error){if(error.code!=='ENOENT')throw error;if(await setupInfo('missing-runtime'))return;throw new Error(`Managed runtime is not installed. Run node "${path.join(pluginRoot,'bin','setup.mjs')}" --data-dir "${dataDir}" to install pinned dependencies outside the plugin cache.`);}
 const runtimeRoot=path.join(dataDir,'runtime');const runtimePath=path.resolve(record.path);
 if(path.dirname(runtimePath)!==path.resolve(runtimeRoot))throw new Error('Managed runtime path escapes its data directory');
 await assertNoSymlink(runtimePath);try{await stat(path.join(runtimePath,'node_modules'));}catch(error){if(error.code!=='ENOENT')throw error;if(await setupInfo('missing-dependencies'))return;throw new Error(`Managed dependencies are missing. Run node "${path.join(pluginRoot,'bin','setup.mjs')}" --data-dir "${dataDir}".`);}
 if(record.digest!==await sourceDigest(pluginRoot)){if(await setupInfo('changed-runtime'))return;throw new Error(`Plugin changed. Run node "${path.join(pluginRoot,'bin','setup.mjs')}" --data-dir "${dataDir}" to explicitly install this version. Existing runs remain in ${dataDir}.`);}
 const child=spawn(process.execPath,[path.join(runtimePath,'bin','agent-workflow.mjs'),...args],{env:{...process.env,AGENT_WORKFLOW_DATA_DIR:dataDir},windowsHide:true,stdio:'inherit'});
 child.once('error',error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});child.once('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>child.kill(signal));
}
main().catch(error=>{process.stderr.write(`Agent Workflow: ${error.message}\n`);process.exitCode=1;});
