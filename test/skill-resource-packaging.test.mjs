/** @lane merge
 * @subject scripts/package-skill-resources.mjs
 * @subject skills/agent-workflow/SKILL.md
 * @subject skills/workflow-authoring/SKILL.md
 * @subject skills/workflow-setup/SKILL.md
 * @subject skills/workflow-mode/SKILL.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm, lstat, link, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, dirname, relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const repo = resolve(import.meta.dirname, '..');
const script = join(repo, 'scripts/package-skill-resources.mjs');
const names = ['agent-workflow', 'workflow-authoring', 'workflow-setup', 'workflow-mode'];
const run = (root, ...args) => spawnSync(process.execPath, [script, '--root', root, ...args], {
  cwd: repo, env: {...process.env}, windowsHide: true, encoding: 'utf8', timeout: 30000,
});
const ok = result => assert.equal(result.status, 0, result.stderr || result.stdout);
async function put(root, name, content) {
  await mkdir(dirname(join(root, name)), {recursive: true});
  await writeFile(join(root, name), content);
}
async function fixture(t, body = '[Guide](../../docs/guide.md#intro)\n') {
  const root = await mkdtemp(join(tmpdir(), 'skill-packaging-'));
  t.after(async () => { await rm(root, {recursive: true}); await assert.rejects(lstat(root), {code: 'ENOENT'}); });
  for (const name of names) await put(root, `skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: Fixture instructions for native resources.\n---\n\n${body}`);
  await put(root, 'docs/guide.md', '# Intro\n\n[Details](nested/detail.md#deep)\n');
  await put(root, 'docs/nested/detail.md', '# Deep\n\n[Cycle](../guide.md)\n');
  return root;
}
async function snapshot(root) {
  const files = [];
  async function walk(dir) {
    for (const name of (await readdir(dir)).sort()) {
      const file = join(dir, name), s = await lstat(file);
      if (s.isDirectory()) await walk(file);
      else files.push([relative(root, file), s.mtimeMs, createHash('sha256').update(await readFile(file)).digest('hex')]);
    }
  }
  await walk(root);
  return files;
}

test('production entry references stay in each of the four selected native skill roots', async () => {
  for (const name of names) {
    const root = join(repo, 'skills', name), body = await readFile(join(root, 'SKILL.md'), 'utf8');
    for (const match of body.matchAll(/\]\(([^)]+)\)/g)) {
      const destination = match[1].split('#')[0];
      if (!destination || /^[a-z]+:/i.test(destination)) continue;
      const rel = relative(root, resolve(root, destination));
      assert(!rel.startsWith('..'), `${name} has an out-of-package required reference: ${destination}`);
      assert((await lstat(resolve(root, destination))).isFile());
    }
  }
  ok(run(repo, '--check'));
});

test('fresh generation closes nested references, records identities, is deterministic and check is read only', async t => {
  const root = await fixture(t);
  const before = await snapshot(root);
  assert.notEqual(run(root, '--check').status, 0);
  assert.deepEqual(await snapshot(root), before);
  ok(run(root));
  const main = await readFile(join(root, 'skills/agent-workflow/SKILL.md'), 'utf8');
  assert(main.includes('resources/docs/guide.md#intro'));
  assert.equal(await readFile(join(root, 'skills/agent-workflow/resources/docs/guide.md'), 'utf8'), '# Intro\n\n[Details](nested/detail.md#deep)\n');
  assert.equal(await readFile(join(root, 'skills/agent-workflow/resources/docs/nested/detail.md'), 'utf8'), '# Deep\n\n[Cycle](../guide.md)\n');
  const manifest = JSON.parse(await readFile(join(root, 'skills/agent-workflow/resources/manifest.json')));
  assert.equal(manifest.skill, 'agent-workflow');
  const guide = manifest.files.find(f => f.source === 'docs/guide.md');
  assert.equal(guide.sourceSha256, createHash('sha256').update(await readFile(join(root, guide.source))).digest('hex'));
  assert.equal(guide.outputSha256, createHash('sha256').update(await readFile(join(root, 'skills/agent-workflow', guide.output))).digest('hex'));
  const generated = await snapshot(root);
  ok(run(root)); ok(run(root, '--check'));
  assert.deepEqual(await snapshot(root), generated, 'Idempotent generation must not rewrite unchanged files');
  await put(root, 'docs/guide.md', '# Changed canonical document\n');
  const stale = await snapshot(root);
  assert.notEqual(run(root, '--check').status, 0, 'Canonical drift must invalidate generated copies');
  assert.deepEqual(await snapshot(root), stale);
  ok(run(root)); ok(run(root, '--check'));
  await put(root, 'skills/workflow-mode/resources/extra.txt', 'unexpected');
  assert.notEqual(run(root, '--check').status, 0);
  ok(run(root)); ok(run(root, '--check'));
  await mkdir(join(root, 'skills/workflow-mode/resources/empty-extra'));
  assert.notEqual(run(root, '--check').status, 0, 'Unexpected empty directories also drift');
  ok(run(root)); ok(run(root, '--check'));
  await rm(join(root, 'skills/workflow-setup/resources/docs/guide.md'));
  assert.notEqual(run(root, '--check').status, 0);
});

test('generated file-directory conflicts are refused before any source or output mutation', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'skills/workflow-setup/resources/docs/guide.md'), {recursive: true});
  const before = await snapshot(root), result = run(root);
  assert.notEqual(result.status, 0);
  assert.deepEqual(await snapshot(root), before);
  assert.equal((await lstat(join(root, 'skills/workflow-setup/resources/docs/guide.md'))).isDirectory(), true);
  await assert.rejects(lstat(join(root, 'skills/agent-workflow/resources')), {code: 'ENOENT'});
});

test('cross-skill main links activate the named native role without copying any main', async t => {
  const root = await fixture(t, '[Authoring](../workflow-authoring/SKILL.md#scope) and [self](SKILL.md#here)\n[Guide](../../docs/guide.md)\n');
  await put(root, 'docs/guide.md', '[Main](../skills/agent-workflow/SKILL.md#live) [Authoring](../skills/workflow-authoring/SKILL.md#scope)\n');
  ok(run(root));
  const body = await readFile(join(root, 'skills/agent-workflow/SKILL.md'), 'utf8');
  assert(body.includes('agent-workflow:workflow-authoring'));
  assert(body.includes('skills.list') && body.includes('skills.read') && body.includes('main_resource'));
  assert(body.includes('#scope') && body.includes('(SKILL.md#here)'));
  const copied = await readFile(join(root, 'skills/agent-workflow/resources/docs/guide.md'), 'utf8');
  assert(copied.includes('[Main](../../SKILL.md#live)'));
  assert(copied.includes('agent-workflow:workflow-authoring') && copied.includes('skills.read'));
  for (const name of names) {
    for (const [file] of await snapshot(join(root, 'skills', name, 'resources'))) assert.notEqual(file.split(/[\\/]/).at(-1).toLowerCase(), 'skill.md');
  }
  ok(run(root, '--check'));
});

test('Markdown links preserve code examples, fragments, titles, reference definitions and opaque native IDs', async t => {
  const examples = '```md\n[example](../../missing.md)\n```\n\n    [indented](../../absent.md)\n\n`[inline](../../not-real.md)`\n\nStages run [node.path,launcher.path,...args] once; preserve missing[].\n';
  const root = await fixture(t, examples + '\n[anchor](#local) [web](https://example.com/a#b) [native](skill://opaque/pkg/ref)\n[guide][id]\n[id]: ../../docs/guide.md#intro "Title"\n[paren](../../docs/file(name).md "Other")\n[space](<../../docs/two words.md>)\n');
  await put(root, 'docs/file(name).md', '# Parentheses\n');
  await put(root, 'docs/two words.md', '# Spaces\n');
  ok(run(root));
  const body = await readFile(join(root, 'skills/agent-workflow/SKILL.md'), 'utf8');
  assert(body.includes(examples));
  assert(body.includes('[anchor](#local) [web](https://example.com/a#b) [native](skill://opaque/pkg/ref)'));
  assert(body.includes('[id]: resources/docs/guide.md#intro "Title"'));
  assert(body.includes('resources/docs/file(name).md "Other"'));
  assert(body.includes('<resources/docs/two words.md>'));
  ok(run(root, '--check'));
});

test('unsafe, missing, escaping, Windows alias and unsupported references fail before writing', async t => {
  const root = await fixture(t);
  const destinations = ['../../docs/missing.md', '../../../outside.md', '../../docs/Guide.md', '../../docs/guide.md.', '../../docs/guide.md:stream', '../../docs/CON.md', '../../docs/SHORT~1.md', 'C:/escape.md', '//server/share.md', '..\\..\\docs\\guide.md', '../../.git/secret.md', '../../node_modules/secret.md', '../../.local/private.md', '../../control/private.md', '../../docs/guide%2emd', '../../docs/image.png', '../../docs/guide.md?raw=1', '../../docs/café.md'];
  await put(root, '.git/secret.md', 'private');
  await put(root, 'docs/image.png', Buffer.from([0, 1, 2]));
  await put(root, 'docs/café.md', '# Unsupported non-ASCII Windows path\n');
  for (const dest of destinations) {
    await put(root, 'skills/agent-workflow/SKILL.md', `[Unsafe](${dest})\n`);
    const before = await snapshot(root), result = run(root);
    assert.notEqual(result.status, 0, dest);
    assert.deepEqual(await snapshot(root), before, `No writes after rejecting ${dest}`);
  }
  for (const body of ['<a href="../../docs/guide.md">HTML</a>\n', '[missing][unknown]\n']) {
    await put(root, 'skills/agent-workflow/SKILL.md', body);
    assert.notEqual(run(root).status, 0, 'Unsupported or unresolved links need an explicit diagnostic');
  }
});

test('source and generated hardlinks, directory junctions and case collisions are refused', async t => {
  const root = await fixture(t);
  await link(join(root, 'docs/guide.md'), join(root, 'docs/alias.md'));
  assert.notEqual(run(root).status, 0);
  await rm(join(root, 'docs/alias.md'));
  await symlink(join(root, 'docs'), join(root, 'linked-docs'), process.platform === 'win32' ? 'junction' : 'dir');
  await put(root, 'skills/agent-workflow/SKILL.md', '[Linked](../../linked-docs/guide.md)\n');
  assert.notEqual(run(root).status, 0);
  await rm(join(root, 'linked-docs'));
  await put(root, 'skills/agent-workflow/SKILL.md', '[Guide](../../docs/guide.md)\n');
  ok(run(root));
  const output = join(root, 'skills/agent-workflow/resources/docs/guide.md');
  await link(output, join(root, 'output-alias.md'));
  assert.notEqual(run(root, '--check').status, 0);
  assert.notEqual(run(root).status, 0);
  await rm(join(root, 'output-alias.md'));
  const junction = join(root, 'skills/agent-workflow/resources/linked-docs');
  await symlink(join(root, 'docs'), junction, process.platform === 'win32' ? 'junction' : 'dir');
  assert.notEqual(run(root, '--check').status, 0);
  assert.notEqual(run(root).status, 0);
  await rm(junction);
  await put(root, 'skills/agent-workflow/resources/native.exe', Buffer.from([0, 1, 2]));
  assert.notEqual(run(root).status, 0, 'Never read or remove an executable asset as stale text');
  await rm(join(root, 'skills/agent-workflow/resources/native.exe'));
  if (process.platform !== 'win32') {
    await put(root, 'docs/Guide.md', '# Case collision');
    assert.notEqual(run(root).status, 0);
  }
});

test('bounded ordinary UTF-8 text inventory refuses binary content and oversized files', async t => {
  const root = await fixture(t);
  for (const content of [Buffer.from([0xff, 0xfe, 0]), Buffer.from('text\0binary'), 'x'.repeat(2 * 1024 * 1024 + 1)]) {
    await put(root, 'docs/guide.md', content);
    assert.notEqual(run(root).status, 0);
  }
  const roleLink = '\n[Role](../skills/workflow-authoring/SKILL.md)\n';
  await put(root, 'docs/guide.md', 'x'.repeat(2 * 1024 * 1024 - roleLink.length - 5) + roleLink);
  assert.notEqual(run(root).status, 0, 'Rewriting must not produce text beyond the output limit');
});
