import {compileSchema} from './schema.mjs';

// AST data only. Identifiers, calls, getters, spreads and computed keys remain
// unknown, even when an expression looks constant. No workflow code is run.
function literal(node, state, depth=0) {
  if (!node || ++state.nodes>10000 || depth>64) throw 'schemaInspectionLimit';
  if (node.type==='Literal' && !node.regex && !node.bigint &&
      (node.value===null || ['string','boolean'].includes(typeof node.value) || Number.isFinite(node.value))) return node.value;
  if (node.type==='UnaryExpression' && ['+','-'].includes(node.operator) &&
      node.argument.type==='Literal' && Number.isFinite(node.argument.value)) {
    return node.operator==='-'?-node.argument.value:node.argument.value;
  }
  if (node.type==='ArrayExpression') return node.elements.map(child=>literal(child,state,depth+1));
  if (node.type==='ObjectExpression') {
    const value=Object.create(null);
    for (const property of node.properties) {
      if (property.type!=='Property' || property.computed || property.method || property.shorthand || property.kind!=='init') throw 'dynamicSchema';
      const key=property.key.name??property.key.value;
      // Object-initializer __proto__ changes the prototype rather than JSON data.
      if (typeof key!=='string' || key==='__proto__' || Object.hasOwn(value,key)) throw 'dynamicSchema';
      value[key]=literal(property.value,state,depth+1);
    }
    return value;
  }
  throw 'dynamicSchema';
}

export function createResultBudgetInspector() {
  const cache=new Map();
  const result=(status,maxSerializedBytes=null,code=null)=>({status,maxSerializedBytes,code});
  return options=>{
    if (!options) return result('unknown',null,'dynamicOptions');
    if (!options.has('schema')) return result('unstructured');
    let schema;
    try { schema=literal(options.get('schema'),{nodes:0}); }
    catch (code) { return result('unknown',null,code); }
    const key=JSON.stringify(schema);
    if (cache.has(key)) return cache.get(key);
    if (cache.size>=64) return result('unknown',null,'schemaInspectionLimit');
    let budget;
    try { budget=result('known',compileSchema(schema).limits.maxSerializedBytes); }
    catch (error) {
      if (!['SCHEMA_INVALID','SCHEMA_LIMIT','SCHEMA_UNSUPPORTED'].includes(error.code)) throw error;
      budget=result('invalid',null,error.code);
    }
    cache.set(key,budget);
    return budget;
  };
}
