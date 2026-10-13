import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';

const git = promisify(execFile);
const module = await import('../src/workers/worktrees.mjs').catch(() => ({}));

test('worktree isolation carries local inputs and retains a binary patch containing new files', async t => {
  assert.equal(typeof module.createIsolatedWorkspace, 'function', 'Worktree isolation must be implemented');
  const temp = await mkdtemp(path.join(os.tmpdir(), 'agent-workflow-git-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const source = path.join(temp, 'fixture-repo'); await mkdir(source);
  await git('git', ['init', '-q', '-b', 'fixture'], { cwd: source });
  await writeFile(path.join(source, 'tracked.txt'), 'base\n');
  await git('git', ['add', 'tracked.txt'], { cwd: source });
  await git('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture base'], { cwd: source });
  await writeFile(path.join(source, 'tracked.txt'), 'local input\n');
  await writeFile(path.join(source, 'input.txt'), 'untracked input\n');
  const workspace = await module.createIsolatedWorkspace({ cwd: source, id: 'worker-one', isolation: 'worktree' });
  assert.equal(path.dirname(workspace.cwd), path.join(temp, 'fixture-repo-worktrees'));
  assert.equal(await readFile(path.join(workspace.cwd, 'tracked.txt'), 'utf8'), 'local input\n');
  assert.equal(await readFile(path.join(workspace.cwd, 'input.txt'), 'utf8'), 'untracked input\n');
  await writeFile(path.join(workspace.cwd, 'tracked.txt'), 'worker edit\n');
  await writeFile(path.join(workspace.cwd, 'new.bin'), Buffer.from([0, 1, 2, 255]));
  const artifacts = await module.collectArtifacts(workspace);
  assert(artifacts.untrackedFiles.includes('new.bin'));
  assert.equal(artifacts.worktreePath, workspace.cwd);
  const patch = await readFile(artifacts.patchPath, 'utf8');
  assert(patch.includes('worker edit'));
  assert(patch.includes('new.bin'));
  assert(patch.includes('GIT binary patch'));
  assert((await readFile(artifacts.manifestPath, 'utf8')).includes('new.bin'));
  await access(workspace.cwd);
  assert.equal(await readFile(path.join(source, 'tracked.txt'), 'utf8'), 'local input\n');
});

test('non-Git isolation fails closed before dispatch', async t => {
  assert.equal(typeof module.createIsolatedWorkspace, 'function');
  const temp = await mkdtemp(path.join(os.tmpdir(), 'agent-workflow-nongit-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await assert.rejects(module.createIsolatedWorkspace({ cwd: temp, id: 'worker', isolation: { type: 'worktree' } }), { code: 'ISOLATION_FAILED', outcome: 'not-started' });
  await assert.rejects(module.createIsolatedWorkspace({ cwd: temp, id: 'worker', isolation: 'cloud-vm' }), { code: 'ISOLATION_FAILED', outcome: 'not-started' });
});
