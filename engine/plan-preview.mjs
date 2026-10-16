import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {parse} from 'acorn';
import {parseScript} from './script.mjs';
import {fault} from '../foundation/client.mjs';

const apis = new Set(['agent','parallel','pipeline','phase','log','workflow','refineArtifact']);
const limits = {nodes:200000,depth:256,calls:4096,edges:4096,groups:1000,unknowns:256,bytes:512*1024};
const isNode = value => value && typeof value.type === 'string';
const children = node => Object.values(node).flatMap(value => Array.isArray(value) ? value.filter(isNode) : isNode(value) ? [value] : []);
const text = node => node?.type === 'Literal' && typeof node.value === 'string' && node.value.length <= 200 ? node.value : null;
const plain = value => !types.isProxy(value) && value && Object.getPrototypeOf(value) === Object.prototype;

function bindPattern(pattern, scope) {
  const pending = [pattern];
  while (pending.length) {
    const item = pending.pop();
    if (!item) continue;
    if (item.type === 'Identifier') scope.names.add(item.name);
    else if (item.type === 'RestElement') pending.push(item.argument);
    else if (item.type === 'AssignmentPattern') pending.push(item.left);
    else if (item.type === 'ArrayPattern') pending.push(...item.elements);
    else if (item.type === 'ObjectPattern') pending.push(...item.properties.map(property => property.type === 'RestElement' ? property.argument : property.value));
  }
}
function shadowed(scope, name) {
  for (; scope; scope=scope.parent) if (scope.names.has(name)) return true;
  return false;
}
function literalOptions(node) {
  if (!node) return new Map();
  if (node.type !== 'ObjectExpression') return null;
  const values = new Map();
  for (const property of node.properties) {
    if (property.type !== 'Property' || property.computed || property.method || property.kind !== 'init') return null;
    const key = property.key.name ?? property.key.value;
    if (typeof key !== 'string' || values.has(key)) return null;
    values.set(key, property.value);
  }
  return values;
}

// Parsing and data traversal only: no evaluator, runtime import or user callback.
export function previewPlan(input) {
  if (!plain(input) || Reflect.ownKeys(input).length !== 1 || !Object.getOwnPropertyDescriptor(input,'script')?.enumerable || !Object.hasOwn(Object.getOwnPropertyDescriptor(input,'script'),'value')) throw fault('PLAN_INPUT','Plan requires only a script value');
  const {script} = input;
  let meta;
  try { ({meta}=parseScript(script)); }
  catch (error) {
    if (!(error instanceof RangeError)) throw error;
    // The existing validator spreads wide child lists. A host stack limit
    // cannot establish source validity, bindings or an executable topology.
    return {schemaVersion:1,sourceSha256:createHash('sha256').update(script).digest('hex'),meta:null,callSites:[],groups:[],dependencyEdges:[],unknowns:[{code:'validationLimit',offsetStart:null,offsetEnd:null}],truncated:true};
  }
  const result = {schemaVersion:1, sourceSha256:createHash('sha256').update(script).digest('hex'), meta, callSites:[], groups:[], dependencyEdges:[], unknowns:[], truncated:false};
  const unknownKeys = new Set();
  const unknown = (code, node=null) => {
    const entry = {code,offsetStart:node?.start??null,offsetEnd:node?.end??null};
    const key = JSON.stringify(entry);
    if (unknownKeys.has(key)) return;
    if (result.unknowns.length >= limits.unknowns-1) {
      result.truncated = true;
      if (!unknownKeys.has('unknownLimit')) { result.unknowns.push({code:'unknownLimit',offsetStart:null,offsetEnd:null}); unknownKeys.add('unknownLimit'); }
      return;
    }
    unknownKeys.add(key); result.unknowns.push(entry);
  };
  const truncate = (code,node) => { result.truncated=true; unknown(code,node); };
  // Metadata can itself fill the response; retain no misleading partial meta.
  if (Buffer.byteLength(JSON.stringify(result)) > limits.bytes-4096) {
    result.meta = null; truncate('outputLimit'); return result;
  }
  const ast = parse(script, {ecmaVersion:'latest', sourceType:'module', allowReturnOutsideFunction:true});
  const root = {parent:null,names:new Set(),functionScope:true}, scopes = new WeakMap();
  const pending = [{node:ast,scope:root,depth:0}]; let visited=0, incomplete=false;
  while (pending.length) {
    const item = pending.pop(), {node,depth}=item; let {scope}=item;
    const enclosingScope=scope;let functionBodyScope;
    if (++visited > limits.nodes) { truncate('nodeLimit'); incomplete=true; break; }
    if (depth > limits.depth) { truncate('depthLimit',node); incomplete=true; continue; }
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') bindPattern(node.id,scope);
    if (['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type)) {
      scope={parent:scope,names:new Set(),functionScope:true};
      bindPattern(node.id,scope); for (const parameter of node.params) bindPattern(parameter,scope);
      // Body var bindings cannot shadow expressions in parameter defaults.
      functionBodyScope={parent:scope,names:new Set(),functionScope:true};
    } else if (['BlockStatement','CatchClause','ForStatement','ForOfStatement','ForInStatement','SwitchStatement','ClassDeclaration','ClassExpression','StaticBlock'].includes(node.type)) {
      scope={parent:scope,names:new Set(),functionScope:node.type==='StaticBlock'};
      if (node.type==='CatchClause') bindPattern(node.param,scope);
      if (node.type==='ClassExpression') bindPattern(node.id,scope);
    }
    scopes.set(node,scope);
    if (node.type==='VariableDeclaration') {
      let destination=scope;
      if (node.kind==='var') while (!destination.functionScope) destination=destination.parent;
      for (const declaration of node.declarations) bindPattern(declaration.id,destination);
    }
    const entries=children(node);
    for (let index=entries.length-1;index>=0;index--) {
      const child=entries[index];
      const childScope=node.type==='SwitchStatement'&&child===node.discriminant?enclosingScope:functionBodyScope&&child===node.body?functionBodyScope:scope;
      pending.push({node:child,scope:childScope,depth:depth+1});
    }
  }
  // Missing declarations could change name resolution, so no partial attribution.
  if (incomplete) return result;
  const sites = [], groups = new Map();
  const direct = node => node?.type==='CallExpression' && node.callee.type==='Identifier' && apis.has(node.callee.name) && !shadowed(scopes.get(node),node.callee.name);
  const addGroup = (literalPhase,site) => {
    if (literalPhase===null) return;
    if (!groups.has(literalPhase)) {
      if (groups.size===limits.groups) { truncate('groupLimit',site); return; }
      const group={literalPhase,callSites:[]}; groups.set(literalPhase,group); result.groups.push(group);
    }
    groups.get(literalPhase).callSites.push(site.offsetStart);
  };
  const walk = (node,context) => {
    if (!node) return;
    if (node.type==='PropertyDefinition') {
      // Computed keys run with class evaluation, while an instance value runs
      // only on construction, potentially zero or arbitrarily many times.
      if(node.computed)walk(node.key,context);
      walk(node.value,node.static?context:{...context,min:0,max:null});
      return;
    }
    if (node.type==='Program' || node.type==='BlockStatement' || node.type==='StaticBlock') {
      let current={...context};
      for (const statement of node.body) {
        walk(statement,current);
        let expression=statement.type==='ExpressionStatement'?statement.expression:null;
        if (expression?.type==='AwaitExpression') expression=expression.argument;
        if (direct(expression) && expression.callee.name==='phase') current={...current,phase:text(expression.arguments[0])};
        if (['ReturnStatement','ThrowStatement','BreakStatement','ContinueStatement'].includes(statement.type)) current={...current,min:0};
      }
      return;
    }
    let nested=context;
    if (['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ForStatement','ForInStatement','ForOfStatement','WhileStatement','DoWhileStatement'].includes(node.type)) nested={...context,min:0,max:null};
    if (['TryStatement','CatchClause','SwitchCase','ChainExpression'].includes(node.type)) nested={...nested,min:0};
    if (node.type==='IfStatement' || node.type==='ConditionalExpression') {
      walk(node.test,context); walk(node.consequent,{...context,min:0}); walk(node.alternate,{...context,min:0}); return;
    }
    if (node.type==='LogicalExpression') { walk(node.left,context); walk(node.right,{...context,min:0}); return; }
    if (node.type==='CallExpression') {
      if (!direct(node)) unknown(node.callee.type==='Identifier' && apis.has(node.callee.name)?'shadowedCall':'unsupportedCall',node);
      else if (result.callSites.length===limits.calls) truncate('callSiteLimit',node);
      else {
        const api=node.callee.name, options=api==='agent'?literalOptions(node.arguments[1]):new Map();
        if (!options) unknown('dynamicOptions',node);
        const id=options?.get('id'), phase=options?.get('phase');
        const literalId=api==='agent'?text(id):null;
        if (id && literalId===null) unknown('dynamicId',node);
        if (phase && text(phase)===null) unknown('dynamicPhase',node);
        if (api==='phase' && text(node.arguments[0])===null) unknown('dynamicPhase',node);
        if (node.optional) unknown('optionalCall',node);
        const site={offsetStart:node.start,offsetEnd:node.end,api,literalId,literalPhase:phase?text(phase):context.phase,multiplicity:{min:node.optional?0:context.min,max:context.max}};
        if (context.max===null) unknown('dynamicMultiplicity',node);
        result.callSites.push(site); sites.push({site,node,depends:options?.get('dependsOn')});
        if (api==='agent') addGroup(site.literalPhase,site);
      }
    }
    for (const child of children(node)) walk(child,nested);
  };
  walk(ast,{min:1,max:1,phase:null});
  result.callSites.sort((a,b)=>a.offsetStart-b.offsetStart);
  const ids=new Map();
  for (const entry of sites) if (entry.site.literalId!==null) {
    const prior=ids.get(entry.site.literalId);
    if (prior) { prior.duplicate=true; entry.duplicate=true; unknown('duplicateId',entry.node); }
    else ids.set(entry.site.literalId,entry);
  }
  const edges=new Set();
  for (const {site,node,depends} of sites) {
    if (!depends) continue;
    if (depends.type!=='ArrayExpression' || depends.elements.some(item=>text(item)===null)) { unknown('dynamicDependency',node); continue; }
    for (const item of depends.elements) {
      const source=ids.get(text(item)), target=ids.get(site.literalId);
      // A containing call begins earlier in source but is admitted only after
      // its arguments run. Require disjoint ranges; nested order stays unknown.
      if (!source || !target || source.duplicate || target.duplicate || source.site.offsetEnd>site.offsetStart) { unknown('unresolvedDependency',node); continue; }
      if (source.site.multiplicity.max!==1 || site.multiplicity.max!==1) { unknown('dynamicDependency',node); continue; }
      const edge={from:source.site.literalId,to:site.literalId}, key=JSON.stringify(edge);
      if (edges.has(key)) continue;
      if (result.dependencyEdges.length===limits.edges) { truncate('edgeLimit',node); break; }
      edges.add(key); result.dependencyEdges.push(edge);
    }
  }
  if (result.truncated) result.dependencyEdges=[];
  if (Buffer.byteLength(JSON.stringify(result))>limits.bytes) {
    truncate('outputLimit'); result.dependencyEdges=[]; result.groups=[];
    while (result.callSites.length && Buffer.byteLength(JSON.stringify(result))>limits.bytes) result.callSites.splice(Math.floor(result.callSites.length/2));
    if (Buffer.byteLength(JSON.stringify(result))>limits.bytes) result.meta=null;
  }
  return result;
}
