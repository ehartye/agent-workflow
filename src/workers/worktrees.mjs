import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, realpath, lstat, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { workerError } from './shared.mjs';

const execute = promisify(execFile);
const git = async (cwd, args) => (await execute('git', args, { cwd, windowsHide: true, shell: false, maxBuffer: 32 * 1024 * 1024 })).stdout;
const files = text => text.split('\0').filter(Boolean);
function inside(root, target) { const relative = path.relative(root, target); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); }

async function regularFile(root, relative) {
  const file = path.resolve(root, relative);
  if (!inside(root, file)) throw new Error('Git file escaped the workspace');
  let current = root;
  for (const part of path.relative(root, file).split(path.sep)) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlink input/artifact refused: ${relative}`);
  }
  if (!(await lstat(file)).isFile() || !inside(root, await realpath(file))) throw new Error(`Non-regular input/artifact refused: ${relative}`);
  return file;
}

export async function createIsolatedWorkspace(request) {
  const isolation = typeof request.isolation === 'object' ? request.isolation?.type : request.isolation;
  if (isolation === undefined || isolation === 'none') return { cwd: request.cwd, isolated: false };
  if (isolation !== 'worktree') throw workerError('ISOLATION_FAILED', `Unsupported isolation: ${isolation}`, 'not-started');
  let workspace;
  try {
    const source = await realpath(request.cwd);
    const root = (await git(source, ['rev-parse', '--show-toplevel'])).trim();
    if (path.resolve(root).toLowerCase() !== path.resolve(source).toLowerCase()) throw new Error('Worktree isolation requires the repository root as cwd');
    const commonDir = (await git(source, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim();
    const mainRoot = path.dirname(commonDir);
    const worktreesRoot = path.join(path.dirname(mainRoot), `${path.basename(mainRoot)}-worktrees`);
    await mkdir(worktreesRoot, { recursive: true });
    const parent = await realpath(worktreesRoot);
    if (path.dirname(parent).toLowerCase() !== (await realpath(path.dirname(mainRoot))).toLowerCase()) throw new Error('Worktree parent must be a real sibling directory');
    const name = `${String(request.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}-${randomUUID().slice(0, 8)}`;
    workspace = path.join(parent, name);
    if (!inside(parent, workspace)) throw new Error('Worktree target escaped its parent');
    const untracked = files(await git(source, ['ls-files', '--others', '--exclude-standard', '-z']));
    for (const file of untracked) await regularFile(source, file);
    const patch = await git(source, ['diff', '--binary', 'HEAD', '--']);
    const modified = files(await git(source, ['diff', '--name-only', '-z', 'HEAD', '--']));
    const exactInputs = [];
    for (const file of modified) {
      try { exactInputs.push([file, await regularFile(source, file)]); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await git(source, ['worktree', 'add', '--detach', workspace, 'HEAD']);
    if (patch) {
      const patchPath = path.join(parent, `${name}.input.patch`);
      await writeFile(patchPath, patch);
      await git(workspace, ['apply', '--binary', patchPath]);
    }
    for (const [file, sourceFile] of exactInputs) {
      const destination = await regularFile(workspace, file);
      await copyFile(sourceFile, destination);
    }
    for (const file of untracked) {
      const destination = path.resolve(workspace, file);
      if (!inside(workspace, destination)) throw new Error('Untracked input escaped isolated workspace');
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(await regularFile(source, file), destination);
    }
    return { cwd: workspace, isolated: true, sourceCwd: source, artifactsDir: path.join(parent, `${name}.artifacts`) };
  } catch (error) {
    throw workerError('ISOLATION_FAILED', `Could not establish Git worktree isolation: ${error.message}`, 'not-started', workspace ? { artifacts: { worktreePath: workspace } } : {});
  }
}

export async function collectArtifacts(workspace) {
  const untrackedFiles = files(await git(workspace.cwd, ['ls-files', '--others', '--exclude-standard', '-z']));
  for (const file of untrackedFiles) await regularFile(workspace.cwd, file);
  if (untrackedFiles.length) await git(workspace.cwd, ['add', '--intent-to-add', '--', ...untrackedFiles]);
  const changedFiles = files(await git(workspace.cwd, ['diff', '--name-only', '-z', 'HEAD', '--']));
  const patch = await git(workspace.cwd, ['diff', '--binary', 'HEAD', '--']);
  await mkdir(workspace.artifactsDir, { recursive: true });
  const patchPath = path.join(workspace.artifactsDir, 'changes.patch');
  const manifestPath = path.join(workspace.artifactsDir, 'manifest.json');
  const artifacts = { worktreePath: workspace.cwd, sourceCwd: workspace.sourceCwd, patchPath, manifestPath, changedFiles, untrackedFiles };
  await writeFile(patchPath, patch);
  await writeFile(manifestPath, `${JSON.stringify(artifacts, null, 2)}\n`);
  return artifacts;
}
