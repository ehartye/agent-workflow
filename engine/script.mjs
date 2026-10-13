import { parse } from 'acorn';
import { fault } from '../foundation/client.mjs';

function literal(node, depth = 0) {
  if (!node || depth > 20) throw fault('SCRIPT_META', 'Metadata must be bounded JSON literals');
  if (node.type === 'Literal' && !node.regex && !node.bigint && (node.value === null || ['string', 'boolean'].includes(typeof node.value) || Number.isFinite(node.value))) return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map(value => literal(value, depth + 1));
  if (node.type === 'ObjectExpression') {
    const value = Object.create(null);
    for (const prop of node.properties) {
      if (prop.type !== 'Property' || prop.computed || prop.method || prop.shorthand || prop.kind !== 'init') throw fault('SCRIPT_META', 'Metadata cannot execute expressions');
      const key = prop.key.name ?? prop.key.value;
      if (typeof key !== 'string' || Object.hasOwn(value, key)) throw fault('SCRIPT_META', 'Metadata keys must be unique strings');
      value[key] = literal(prop.value, depth + 1);
    }
    return value;
  }
  throw fault('SCRIPT_META', 'Metadata must be literal data');
}

export function parseScript(script) {
  if (typeof script !== 'string' || Buffer.byteLength(script) > 1024 * 1024) throw fault('SCRIPT_SIZE', 'Script must be text under 1 MiB');
  let ast;
  try { ast = parse(script, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true }); }
  catch { throw fault('SCRIPT_SYNTAX', 'Workflow contains invalid JavaScript'); }
  const first = ast.body[0];
  const declaration = first?.declaration;
  if (first?.type !== 'ExportNamedDeclaration' || declaration?.kind !== 'const' || declaration.declarations.length !== 1 || declaration.declarations[0].id.name !== 'meta') {
    throw fault('SCRIPT_META', 'The first statement must export a literal const meta');
  }
  const meta = literal(declaration.declarations[0].init);
  if (!meta || typeof meta.name !== 'string' || !meta.name.trim() || meta.name.length > 200 || typeof meta.description !== 'string' || !meta.description.trim()) throw fault('SCRIPT_META', 'Metadata requires a name and description');
  const pending = [...ast.body.slice(1)];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (node.type?.startsWith('Import') || node.type?.startsWith('Export')) throw fault('SCRIPT_MODULE', 'Workflow module loading and additional exports are unavailable');
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) pending.push(...value);
      else if (value && typeof value === 'object') pending.push(value);
    }
  }
  return { meta: JSON.parse(JSON.stringify(meta)), body: script.slice(first.end) };
}
