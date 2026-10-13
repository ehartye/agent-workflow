import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {startBackground} from '../../engine/background.mjs';
console.log(JSON.stringify(await startBackground(JSON.parse(await readFile(process.argv[2],'utf8')),{runnerPath:fileURLToPath(new URL('./engine-background.mjs',import.meta.url))})));
