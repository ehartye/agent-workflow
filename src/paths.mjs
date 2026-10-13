import path from 'node:path';
import os from 'node:os';
import { mkdir, writeFile, rename, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const pluginRoot = fileURLToPath(new URL('../',import.meta.url));
export function defaultDataDir(env=process.env) { return path.resolve(env.AGENT_WORKFLOW_DATA_DIR || env.PLUGIN_DATA || path.join(env.LOCALAPPDATA || path.join(os.homedir(),'.local','share'),'agent-workflow')); }
export function dataDirFromArgs(args,env=process.env){let selected;for(let index=0;index<args.length;index++){if(args[index]!=='--data-dir')continue;const value=args[++index];if(typeof value!=='string'||!value.trim()||value.startsWith('--'))throw new Error('Missing value for --data-dir');selected=value;}return path.resolve(selected??defaultDataDir(env));}
export async function atomicJson(file,value) { await mkdir(path.dirname(file),{recursive:true,mode:0o700}); const temp=`${file}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(temp,file); }
export async function assertNoSymlink(target) { let current=path.resolve(target); for(;;) { try { const stat=await lstat(current);if(stat.isSymbolicLink()) throw new Error(`Symlink paths are refused: ${current}`); } catch(error) { if(error.code!=='ENOENT') throw error; } const parent=path.dirname(current);if(parent===current) break;current=parent; } }
