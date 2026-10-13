import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, windowsHide: true, stdio: 'ignore' });
child.unref();
process.stdout.write(`${JSON.stringify({ childPid: child.pid })}\n`);
process.stdin.once('data', () => process.exit(0));
