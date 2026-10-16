// Explicit source packaging only. No installs, native callbacks or executable launches.
import {readFile, writeFile, readdir, lstat, realpath, mkdir, unlink, rmdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const skills = ['agent-workflow', 'workflow-authoring', 'workflow-setup', 'workflow-mode'];
const maxFile = 2 * 1024 * 1024, maxFiles = 512, maxBytes = 32 * 1024 * 1024;
const sha = data => createHash('sha256').update(data).digest('hex');
const fail = message => { throw new Error(message); };
const posix = path.posix;
const forbidden = new Set(['.git', 'node_modules', '.local', 'control', '.control', '.composition-refinement-fixtures']);
const textTypes = new Set(['.md', '.txt', '.json', '.js', '.mjs', '.yml', '.yaml']);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function safeParts(value) {
  if (!value || value.includes('\\') || value.startsWith('/') || /[:%?\x00-\x1f\x7f]/.test(value)) fail(`Unsafe local path: ${value}`);
  for (const part of value.split('/')) {
    if (part === '.' || part === '..') continue;
    // Restrict local resource names to ASCII: do not approximate Windows' Unicode
    // filename comparison rules with JavaScript case folding. UTF-8 contents are allowed.
    if (!part || /[^\x20-\x7e]/.test(part) || /[<>"|*~]/.test(part) || /[. ]$/.test(part)
      || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part) || forbidden.has(part.toLowerCase())) fail(`Unsafe/aliased path component: ${value}`);
  }
}

// Mask code, preserving offsets and line breaks. These are examples, not resource links.
function prose(source) {
  const chars = source.split('');
  const mask = (start, end) => { for (let i = start; i < end; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' '; };
  let offset = 0, fence;
  for (const line of source.split(/(?<=\n)/)) {
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      mask(offset, offset + line.length);
      if (opening && opening[1][0] === fence[0] && opening[1].length >= fence.length && /^\s*$/.test(line.slice(opening[0].length))) fence = undefined;
    } else if (opening) { fence = opening[1]; mask(offset, offset + line.length); }
    else if (/^(?: {4}|\t)/.test(line)) mask(offset, offset + line.length);
    offset += line.length;
  }
  if (fence) fail('Unsupported unclosed fenced example');
  let masked = chars.join('');
  for (const m of masked.matchAll(/<!--[^]*?-->/g)) mask(m.index, m.index + m[0].length);
  masked = chars.join('');
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] !== '`') continue;
    let end = i + 1;
    while (masked[end] === '`') end++;
    const ticks = masked.slice(i, end);
    let close = masked.indexOf(ticks, end);
    while (close >= 0 && (masked[close - 1] === '`' || masked[close + ticks.length] === '`')) close = masked.indexOf(ticks, close + ticks.length);
    if (close < 0) continue;
    mask(i, close + ticks.length); i = close + ticks.length - 1;
  }
  return chars.join('');
}

function destinationAt(source, start) {
  let i = start;
  if (source[i] === '<') {
    const end = source.indexOf('>', i + 1);
    if (end < 0 || /[\r\n]/.test(source.slice(i, end))) fail('Unsupported angle link destination');
    return {start: i + 1, end, after: end + 1, destination: source.slice(i + 1, end)};
  }
  let depth = 0;
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') fail('Unsupported escaped/backslash link destination');
    if (c === '(') depth++;
    if (c === ')') { if (!depth) break; depth--; }
    if (/\s/.test(c) && !depth) break;
  }
  if (depth || i === start) fail('Unsupported link destination');
  return {start, end: i, after: i, destination: source.slice(start, i)};
}

// Supported: inline/image links, balanced destinations, optional quoted titles,
// reference definitions/full/collapsed/shortcut references and remote autolinks.
// HTML href/src, wiki links, local autolinks and ambiguous malformed links fail closed.
function links(source) {
  const masked = prose(source), result = [], definitions = new Map(), ranges = [];
  if (/<[^>]*\b(?:href|src)\s*=/i.test(masked) || /\[\[/.test(masked)) fail('Unsupported HTML/wiki resource link');
  for (const m of masked.matchAll(/^ {0,3}\[([^\]\n]+)\]:[ \t]*/gm)) {
    const d = destinationAt(source, m.index + m[0].length);
    const lineEnd = masked.indexOf('\n', d.after), end = lineEnd < 0 ? masked.length : lineEnd;
    const tail = source.slice(d.after, end).trim();
    if (tail && !/^(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\))$/.test(tail)) fail('Unsupported reference definition title');
    const id = m[1].trim().toLowerCase().replace(/\s+/g, ' ');
    if (definitions.has(id)) fail(`Duplicate reference definition: ${id}`);
    definitions.set(id, d); ranges.push([m.index, end]); result.push({...d, definition: true});
  }
  for (let i = 0; i < masked.length; i++) {
    const range = ranges.find(([start, end]) => i >= start && i < end);
    if (range) { i = range[1] - 1; continue; }
    if (masked[i] === '<') {
      const end = masked.indexOf('>', i + 1), value = masked.slice(i + 1, end);
      if (end >= 0 && /^(?:\.\.?\/|\/|[A-Za-z]:[\/\\])/.test(value)) fail('Unsupported local autolink');
    }
    if (masked[i] !== '[' || masked[i - 1] === '\\') continue;
    const start = i;
    let end = i + 1, depth = 1;
    for (; end < masked.length; end++) {
      if (masked[end - 1] === '\\') continue;
      if (masked[end] === '[') depth++;
      if (masked[end] === ']' && --depth === 0) break;
    }
    if (depth) fail('Unsupported unclosed Markdown label');
    const label = source.slice(start + 1, end);
    if (masked[end + 1] === '(') {
      let destStart = end + 2;
      while (/[ \t]/.test(source[destStart] ?? '') && destStart < source.length) destStart++;
      const d = destinationAt(source, destStart);
      let after = d.after;
      while (/[ \t]/.test(source[after] ?? '') && after < source.length) after++;
      if (source[after] === '"' || source[after] === "'") {
        const quote = source[after++], close = source.indexOf(quote, after);
        if (close < 0 || /[\r\n]/.test(source.slice(after, close))) fail('Unsupported inline title');
        after = close + 1;
        while (/[ \t]/.test(source[after] ?? '') && after < source.length) after++;
      }
      if (source[after] !== ')') fail('Unsupported inline resource link');
      result.push({...d, linkStart: start, linkEnd: after + 1, label}); i = after;
    } else {
      let id = label, explicit = false;
      if (masked[end + 1] === '[') {
        explicit = true;
        const close = masked.indexOf(']', end + 2);
        if (close < 0) fail('Unsupported reference use');
        id = source.slice(end + 2, close) || label; end = close;
      }
      // Unmatched bare brackets are ordinary CommonMark prose (for example arrays).
      if (explicit && !definitions.has(id.trim().toLowerCase().replace(/\s+/g, ' '))) fail(`Unsupported/unresolved Markdown reference: [${id}]`);
      i = end;
    }
  }
  return result.sort((a, b) => a.start - b.start);
}

export async function packageSkillResources({root = path.resolve(import.meta.dirname, '..'), check = false} = {}) {
  root = path.resolve(root);
  if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) fail('Root must be an ordinary canonical directory');
  const inventories = new Map(), inputs = new Map();
  let inputBytes = 0;
  async function entries(dir) {
    if (!inventories.has(dir)) {
      const names = await readdir(dir), aliases = new Set();
      if (names.length > 20000) fail(`Directory inventory limit: ${dir}`);
      for (const name of names) {
        const alias = name.normalize('NFC').toLowerCase();
        if (aliases.has(alias)) fail(`Windows case/path collision: ${dir}/${name}`);
        aliases.add(alias);
      }
      inventories.set(dir, names);
    }
    return inventories.get(dir);
  }
  async function inspect(rel, missing = false) {
    safeParts(rel);
    if (posix.normalize(rel) !== rel || rel.startsWith('../')) fail(`Noncanonical or escaping path: ${rel}`);
    let current = root, stat;
    for (const part of rel.split('/')) {
      const names = await entries(current);
      if (!names.includes(part)) {
        if (names.some(n => n.toLowerCase() === part.toLowerCase())) fail(`Windows case alias: ${rel}`);
        if (missing) return undefined;
        fail(`Missing resource: ${rel}`);
      }
      current = path.join(current, part); stat = await lstat(current);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || await realpath(current) !== current) fail(`Symlink/reparse/unsafe resource: ${rel}`);
      if (stat.isFile() && stat.nlink !== 1) fail(`Hardlinked resource: ${rel}`);
    }
    return stat;
  }
  async function text(rel) {
    if (inputs.has(rel)) return inputs.get(rel);
    const s = await inspect(rel);
    if (!s.isFile() || !textTypes.has(posix.extname(rel)) || s.size > maxFile) fail(`Not bounded ordinary text: ${rel}`);
    if (inputs.size >= maxFiles || (inputBytes += s.size) > maxBytes) fail('Source closure inventory limit exceeded');
    const bytes = await readFile(path.join(root, rel));
    if (bytes.length !== s.size || bytes.includes(0)) fail(`Binary/changed text: ${rel}`);
    let body;
    try { body = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes); } catch { fail(`Invalid UTF-8 text: ${rel}`); }
    const value = {bytes, body}; inputs.set(rel, value); return value;
  }
  function target(from, destination, skill) {
    if (!destination || destination.startsWith('#') || /^(?:https?:|mailto:|skill:)/i.test(destination)) return null;
    const hash = destination.indexOf('#'), local = hash < 0 ? destination : destination.slice(0, hash), anchor = hash < 0 ? '' : destination.slice(hash);
    safeParts(local);
    let rel = posix.normalize(posix.join(posix.dirname(from), local));
    if (rel === '..' || rel.startsWith('../')) fail(`Reference escapes repository: ${from} -> ${destination}`);
    const generated = `skills/${skill}/resources/`;
    if (rel.startsWith(generated)) rel = rel.slice(generated.length);
    if (/^skills\/[^/]+\/resources(?:\/|$)/.test(rel)) fail(`Reference to another generated closure: ${destination}`);
    safeParts(rel);
    return {rel, anchor};
  }
  const plans = [];
  for (const skill of skills) {
    const base = `skills/${skill}`, main = `${base}/SKILL.md`, prefix = `${base}/resources/`;
    const expected = new Map(), visited = new Set(), files = [];
    async function rewrite(rel, output) {
      const input = await text(rel), replacements = [];
      let references = [];
      if (posix.extname(rel) === '.md') {
        try { references = links(input.body); } catch (error) { fail(`${rel}: ${error.message}`); }
      }
      for (const l of references) {
        const dest = target(rel, l.destination, skill);
        if (!dest) continue;
        const {rel: next, anchor} = dest;
        if (posix.basename(next).toLowerCase() === 'skill.md') {
          if (next === main) {
            replacements.push({start: l.start, end: l.end, value: (posix.relative(posix.dirname(output), main) || 'SKILL.md') + anchor});
          } else {
            const role = /^skills\/([^/]+)\/SKILL\.md$/.exec(next)?.[1];
            if (!skills.includes(role)) fail(`Unknown cross-skill main: ${next}`);
            await text(next); // Validate existence/identity, never recurse into or copy a main.
            if (l.definition) fail(`Unsupported cross-skill main reference definition in ${rel}; use an inline role link`);
            replacements.push({start: l.linkStart, end: l.linkEnd, value: `${l.label} (activate \`agent-workflow:${role}\` through genuine \`skills.list\`/\`skills.read\` with the returned package and \`main_resource\`${anchor ? `; then read section \`${anchor}\`` : ''})`});
          }
        } else {
          const out = prefix + next;
          replacements.push({start: l.start, end: l.end, value: posix.relative(posix.dirname(output), out) + anchor});
          if (!visited.has(next)) {
            visited.add(next);
            const body = await rewrite(next, out);
            expected.set(out, Buffer.from(body));
            const source = await text(next);
            files.push({source: next, sourceBytes: source.bytes.length, sourceSha256: sha(source.bytes), output: `resources/${next}`, outputBytes: Buffer.byteLength(body), outputSha256: sha(Buffer.from(body))});
          }
        }
      }
      let body = input.body;
      for (const r of replacements.sort((a, b) => b.start - a.start)) body = body.slice(0, r.start) + r.value + body.slice(r.end);
      return body;
    }
    const entry = Buffer.from(await rewrite(main, main));
    const manifest = Buffer.from(JSON.stringify({schemaVersion: 1, skill, entry: {source: main, bytes: entry.length, sha256: sha(entry)}, limits: {maxFile, maxFiles, maxBytes}, files: files.sort((a, b) => compare(a.source, b.source))}, null, 2) + '\n');
    expected.set(prefix + 'manifest.json', manifest);
    if (entry.length > maxFile || expected.size > maxFiles || [...expected.values()].some(bytes => bytes.length > maxFile)
      || [...expected.values()].reduce((total, bytes) => total + bytes.length, 0) > maxBytes) fail(`Generated text inventory limit exceeded: ${skill}`);
    const existing = new Map(), directories = [];
    let generatedBytes = 0;
    async function walk(rel) {
      const s = await inspect(rel, true);
      if (!s) return;
      if (!s.isDirectory()) fail(`Generated root is not a directory: ${rel}`);
      if (directories.length >= maxFiles * 8) fail('Generated directory inventory limit exceeded');
      directories.push(rel);
      for (const name of await entries(path.join(root, rel))) {
        const child = `${rel}/${name}`, item = await inspect(child);
        if (item.isDirectory()) await walk(child);
        else {
          if (name.toLowerCase() === 'skill.md' || !textTypes.has(posix.extname(name)) || item.size > maxFile || existing.size >= maxFiles || (generatedBytes += item.size) > maxBytes) fail(`Unsafe/oversized generated output: ${child}`);
          const bytes = await readFile(path.join(root, child));
          if (bytes.length !== item.size || bytes.includes(0)) fail(`Binary/changed generated output: ${child}`);
          try { new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch { fail(`Invalid UTF-8 generated output: ${child}`); }
          existing.set(child, bytes);
        }
      }
    }
    await walk(prefix.slice(0, -1));
    const wantedDirectories = new Set([prefix.slice(0, -1)]);
    for (const out of expected.keys()) {
      const s = await inspect(out, true);
      if (s && !s.isFile()) fail(`Generated file/directory conflict: ${out}`);
      for (let dir = posix.dirname(out); dir.startsWith(prefix); dir = posix.dirname(dir)) wantedDirectories.add(dir);
    }
    plans.push({main, entry, expected, existing, directories, wantedDirectories, manifest: {skill, path: prefix + 'manifest.json', bytes: manifest.length, sha256: sha(manifest)}});
  }
  // All input and existing-output validation completes before any write/removal.
  const stale = [];
  for (const p of plans) {
    if (!(await text(p.main)).bytes.equals(p.entry)) stale.push(p.main);
    for (const [out, bytes] of p.expected) if (!p.existing.get(out)?.equals(bytes)) stale.push(out);
    for (const out of p.existing.keys()) if (!p.expected.has(out)) stale.push(out);
    for (const dir of p.directories) if (!p.wantedDirectories.has(dir)) stale.push(dir);
  }
  if (check && stale.length) fail(`Stale/missing/extra skill resources (${stale.length}): ${stale.slice(0, 12).join(', ')}`);
  if (!check) for (const p of plans) {
    for (const [out, bytes] of p.expected) if (!p.existing.get(out)?.equals(bytes)) {
      await mkdir(path.dirname(path.join(root, out)), {recursive: true}); await writeFile(path.join(root, out), bytes);
    }
    for (const out of p.existing.keys()) if (!p.expected.has(out)) await unlink(path.join(root, out));
    for (const dir of p.directories.sort((a, b) => b.length - a.length)) if (!(await readdir(path.join(root, dir))).length) await rmdir(path.join(root, dir));
    if (!(await text(p.main)).bytes.equals(p.entry)) await writeFile(path.join(root, p.main), p.entry);
  }
  return {status: check ? 'current' : 'generated', manifests: plans.map(p => p.manifest)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2); let root, check = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--check' && !check) check = true;
      else if (args[i] === '--root' && !root && args[i + 1]) root = args[++i];
      else fail('Usage: node scripts/package-skill-resources.mjs [--root <repository>] [--check]');
    }
    console.log(JSON.stringify(await packageSkillResources({root, check})));
  } catch (error) { console.error(`Skill resource packaging failed: ${error.message}`); process.exitCode = 1; }
}
