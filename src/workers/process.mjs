import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readFile, readlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { workerError } from './shared.mjs';

const executeFile = promisify(execFile);

const require = createRequire(import.meta.url);
export function codexExecutable() {
  const platforms = {
    'win32-x64': ['win32-x64', 'x86_64-pc-windows-msvc'],
    'win32-arm64': ['win32-arm64', 'aarch64-pc-windows-msvc'],
    'linux-x64': ['linux-x64', 'x86_64-unknown-linux-musl'],
    'linux-arm64': ['linux-arm64', 'aarch64-unknown-linux-musl'],
    'darwin-x64': ['darwin-x64', 'x86_64-apple-darwin'],
    'darwin-arm64': ['darwin-arm64', 'aarch64-apple-darwin'],
  };
  const target = platforms[`${process.platform}-${process.arch}`];
  if (!target) throw new Error('Unsupported Codex platform');
  const root = path.dirname(require.resolve(`@openai/codex-${target[0]}/package.json`));
  const binary = path.join(root, 'vendor', target[1], 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
  if (!existsSync(binary)) throw new Error('Pinned Codex native executable is missing');
  return binary;
}

export function launch(executable, args, { cwd, env } = {}) {
  const child = spawn(executable, args, {
    cwd, env: { ...process.env, ...env, AGENT_WORKFLOW_WORKER: '1' },
    shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-65536); });
  const closed = new Promise(resolve => {
    child.once('error', error => resolve({ error, stderr }));
    child.once('close', (code, signal) => resolve({ code, signal, stderr }));
  });
  let stopping;
  return { child, closed, stderr: () => stderr, stop: () => stopping ||= terminateTree(child, closed) };
}

async function terminateTree(child, closed) {
  if (!child.pid) return closed;
  let timeout;
  try {
    await terminatePidTree(child.pid);
    return await Promise.race([closed, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Owned worker streams did not close after tree termination')), 10000); })]);
  } catch (error) { throw workerError('DRAIN_FAILED', `Could not verify worker process drain: ${error.message}`, 'unknown'); }
  finally { clearTimeout(timeout); }
}

async function terminatePidTree(pid) {
  if (process.platform === 'win32') {
    const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
    await new Promise((resolve, reject) => {
      killer.once('error', reject);
      killer.once('close', code => {
        if (code === 0) { resolve(); return; }
        try { process.kill(pid, 0); reject(new Error(`taskkill failed with exit code ${code}`)); }
        catch (error) { if (error.code === 'ESRCH') resolve(); else reject(error); }
      });
    });
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}

export async function readProcessIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid process identity PID');
  const hash = value => createHash('sha256').update(value).digest('hex');
  if (process.platform === 'win32') {
    const command = `$workerProcess = Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId = ${pid}'; if ($null -ne $workerProcess) { [PSCustomObject]@{ startIdentity = $workerProcess.CreationDate.ToUniversalTime().Ticks.ToString(); commandLine = $workerProcess.CommandLine; executablePath = $workerProcess.ExecutablePath } | ConvertTo-Json -Compress }`;
    const { stdout } = await executeFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command], { windowsHide: true, shell: false, timeout: 5000, maxBuffer: 65536 });
    if (!stdout.trim()) return undefined;
    const info = JSON.parse(stdout);
    if (!info.startIdentity || !info.commandLine || !info.executablePath) throw new Error('Process creation identity is unavailable');
    return { pid, platform: process.platform, startIdentity: info.startIdentity, fingerprint: hash(JSON.stringify([info.commandLine, info.executablePath.toLowerCase()])) };
  }
  if (process.platform === 'linux') {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
      if (fields[0] === 'Z') return undefined;
      const [commandLine, executablePath] = await Promise.all([readFile(`/proc/${pid}/cmdline`), readlink(`/proc/${pid}/exe`)]);
      return { pid, platform: process.platform, startIdentity: fields[19], groupId: Number(fields[2]), fingerprint: hash(Buffer.concat([commandLine, Buffer.from(executablePath)])) };
    } catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return undefined; throw error; }
  }
  throw new Error(`Reliable process identity inspection unsupported on ${process.platform}`);
}

export async function recoverOrphan(record) {
  try {
    const { pid, processIdentity: saved } = record;
    if (!saved || saved.pid !== pid || saved.platform !== process.platform || !saved.startIdentity || !saved.fingerprint) throw new Error('Recorded process identity is missing');
    const current = await readProcessIdentity(pid);
    if (!current) throw new Error('Recorded root process is absent; descendant drain cannot be established');
    if (saved.startIdentity !== current.startIdentity || saved.fingerprint !== current.fingerprint || (process.platform === 'linux' && current.groupId !== pid)) throw new Error('Live process creation identity does not match the orphan record');
    await terminatePidTree(pid);
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const remaining = await readProcessIdentity(pid);
      if (!remaining || remaining.startIdentity !== saved.startIdentity) return { drained: true, status: 'drained' };
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Matching orphan process did not drain');
  } catch (error) { throw workerError('ORPHAN_UNVERIFIED', `Refusing orphan replay: ${error.message}`, 'unknown'); }
}

export function emitProcessIdentity(pid, emit) {
  return readProcessIdentity(pid).then(identity => identity && emit({ type: 'process-identity', pid, processIdentity: identity })).catch(error => emit({ type: 'process-identity-unavailable', pid, reason: error.message }));
}

export function readLines(stream, receive, fail, maxBytes = 4 * 1024 * 1024) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > maxBytes) { fail(new Error('Worker protocol line exceeds limit')); return; }
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
      if (line) { try { receive(JSON.parse(line)); } catch (error) { fail(error); } }
    }
  });
  stream.on('end', () => { if (buffer.trim()) { try { receive(JSON.parse(buffer)); } catch (error) { fail(error); } } });
}
