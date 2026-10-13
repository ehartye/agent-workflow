#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseCommand,help} from './arguments.mjs';
import {pluginRoot,paths,noLinks,installRuntime,selectRuntime,resolveRun} from './managed-runtime.mjs';
export async function main(tokens=process.argv.slice(2)){
 const parsed=parseCommand(tokens);if(parsed.command==='help'||parsed.values.help){process.stdout.write(help);return 0;}
 if(parsed.command==='setup'){console.log(JSON.stringify(await installRuntime({dataDir:parsed.dataDir}),null,2));return 0;}
 let runtime;
 if(parsed.runCommand){
  if(parsed.command==='dashboard'&&!parsed.id){
   const root=paths(parsed.dataDir).runs;await noLinks(root);const candidates=[];
   for(const entry of await readdir(root,{withFileTypes:true})){if(!entry.isDirectory())continue;const owner=join(root,entry.name,'runtime.json');await noLinks(owner);try{const record=JSON.parse(await readFile(owner,'utf8'));if(record.createdAt&&record.sessionId===parsed.sessionId)candidates.push({id:entry.name,createdAt:record.createdAt});}catch(e){if(e.code!=='ENOENT')throw e;}}
   candidates.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));if(!candidates.length)throw Error('No saved runs; start a workflow first');parsed.id=candidates[0].id;tokens=[...tokens,parsed.id];
  }
  runtime=(await resolveRun({dataDir:parsed.dataDir,id:parsed.id,...(parsed.mutation?{sessionId:parsed.sessionId}:{})})).runtime;
 }else{
  try{runtime=await selectRuntime({pluginRoot,dataDir:parsed.dataDir});}catch(e){if(e.code==='ENOENT')throw Error(`Managed runtime is missing. Run node "${join(pluginRoot,'bin','launch.mjs')}" setup --data-dir "${parsed.dataDir}"`);throw e;}
 }
 return await new Promise((done,reject)=>{
  const child=spawn(process.execPath,[join(runtime.path,'bin','command.mjs'),...tokens],{env:{...process.env,AGENT_WORKFLOW_DATA_DIR:parsed.dataDir},windowsHide:true,stdio:'inherit'});
  const handlers=['SIGINT','SIGTERM'].map(signal=>[signal,()=>child.kill(signal)]);for(const[signal,handler]of handlers)process.once(signal,handler);
  const cleanup=()=>{for(const[signal,handler]of handlers)process.removeListener(signal,handler);};
  child.once('error',error=>{cleanup();reject(error);});child.once('exit',code=>{cleanup();done(code??1);});
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().then(code=>{process.exitCode=code;},error=>{console.error(`Agent Workflow: ${error.message}`);process.exitCode=1;});
