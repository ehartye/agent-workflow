import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
export const runtimeEntries=['package.json','package-lock.json','bin','src','ui','workflows','hooks'];
export async function sourceDigest(root){const hash=createHash('sha256');async function visit(relative){const file=path.join(root,relative);let s;try{s=await stat(file);}catch(error){if(error.code==='ENOENT')return;throw error;}if(s.isDirectory()){for(const name of (await readdir(file)).sort())await visit(path.join(relative,name));}else{hash.update(relative.replaceAll('\\','/'));hash.update(await readFile(file));}}for(const entry of runtimeEntries)await visit(entry);return hash.digest('hex');}
