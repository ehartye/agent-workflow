import Ajv from 'ajv';
import {fault} from '../foundation/client.mjs';

const keywords=new Set(['type','title','description','properties','required','additionalProperties','items','minItems','maxItems','minProperties','maxProperties','minLength','maxLength','minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','enum','const','anyOf','oneOf','allOf']);
const types=new Set(['object','array','string','number','integer','boolean','null']);
const invalid=message=>fault('SCHEMA_INVALID',message);
function strictJson(value){
  return JSON.stringify(value,(_,item)=>{
    if(['undefined','function','symbol','bigint'].includes(typeof item)||typeof item==='number'&&!Number.isFinite(item))throw new Error('Not JSON');
    return item;
  });
}

function constraints(node){
  const parts=[];
  const flatten=part=>{parts.push(part);for(const child of part.allOf??[])flatten(child);};flatten(node);
  let allowed=new Set(types);
  for(const part of parts)if(part.type!==undefined){
    const selected=new Set(Array.isArray(part.type)?part.type:[part.type]);
    if(selected.has('number'))selected.add('integer');
    allowed=new Set([...allowed].filter(type=>selected.has(type)));
  }
  const lower=key=>Math.max(...parts.map(part=>part[key]??-Infinity));
  const upper=key=>Math.min(...parts.map(part=>part[key]??Infinity));
  if(lower('minLength')>upper('maxLength'))allowed.delete('string');
  if(lower('minItems')>upper('maxItems'))allowed.delete('array');
  const required=new Set(parts.flatMap(part=>part.required??[]));
  if(lower('minProperties')>upper('maxProperties')||required.size>upper('maxProperties')||parts.some(part=>part.additionalProperties===false&&([...required].some(key=>!Object.hasOwn(part.properties??{},key))||lower('minProperties')>Object.keys(part.properties??{}).length)))allowed.delete('object');
  if(lower('minimum')>upper('maximum')||lower('minimum')>=upper('exclusiveMaximum')||lower('exclusiveMinimum')>=upper('maximum')||lower('exclusiveMinimum')>=upper('exclusiveMaximum')){allowed.delete('number');allowed.delete('integer');}
  const integerMin=Math.max(Math.ceil(lower('minimum')),Math.floor(lower('exclusiveMinimum'))+1);
  const integerMax=Math.min(Math.floor(upper('maximum')),Math.ceil(upper('exclusiveMaximum'))-1);
  if(integerMin>integerMax)allowed.delete('integer');
  if(!allowed.size)throw invalid('Schema contains incompatible types, required properties or bounds');
}

export function compileSchema(input){
  let serialized;
  try{serialized=strictJson(input);}catch{throw invalid('Schema must be JSON');}
  if(typeof serialized!=='string')throw invalid('Schema must be an object');
  if(Buffer.byteLength(serialized)>32768)throw fault('SCHEMA_LIMIT','Schema exceeds 32 KiB');
  const schema=JSON.parse(serialized);
  if(!schema||Array.isArray(schema)||schema.type!=='object')throw invalid('Structured results require an object root');
  let nodes=0,enumEntries=0,literalBytes=0;
  const entries=[];
  function visit(node,depth=0){
    if(++nodes>512||depth>16)throw fault('SCHEMA_LIMIT','Schema exceeds its node or depth limit');
    if(!node||typeof node!=='object'||Array.isArray(node))throw invalid('Schema entries must be objects');
    entries.push(node);
    for(const key of Object.keys(node))if(!keywords.has(key))throw fault('SCHEMA_UNSUPPORTED',`Unsupported schema keyword: ${key.slice(0,80)}`);
    if(node.type!==undefined){const value=Array.isArray(node.type)?node.type:[node.type];if(!value.length||value.some(type=>!types.has(type))||new Set(value).size!==value.length)throw invalid('Schema type is invalid');}
    if(node.properties!==undefined){
      if(!node.properties||typeof node.properties!=='object'||Array.isArray(node.properties)||Object.keys(node.properties).length>100)throw invalid('Schema properties must be a bounded object');
      for(const child of Object.values(node.properties))visit(child,depth+1);
    }
    if(node.required!==undefined&&(!Array.isArray(node.required)||node.required.length>100||node.required.some(key=>typeof key!=='string')))throw invalid('Schema required must list property names');
    if(node.enum!==undefined){
      if(!Array.isArray(node.enum)||!node.enum.length)throw invalid('Schema enum must be a nonempty array');
      enumEntries+=node.enum.length;literalBytes+=Buffer.byteLength(JSON.stringify(node.enum));
      if(node.enum.length>128||enumEntries>256)throw fault('SCHEMA_LIMIT','Schema exceeds its enum limit');
    }
    if(Object.hasOwn(node,'const'))literalBytes+=Buffer.byteLength(JSON.stringify(node.const));
    if(node.items!==undefined)visit(node.items,depth+1);
    if(node.additionalProperties!==undefined&&typeof node.additionalProperties!=='boolean')visit(node.additionalProperties,depth+1);
    for(const key of ['allOf','anyOf','oneOf'])if(node[key]!==undefined){if(!Array.isArray(node[key])||!node[key].length||node[key].length>16)throw invalid('Schema branches must be a bounded nonempty array');for(const child of node[key])visit(child,depth+1);}
    constraints(node);
  }
  visit(schema);
  const ajv=new Ajv({strict:true,strictTypes:false,strictRequired:false,allowUnionTypes:true,allErrors:false,ownProperties:true,validateFormats:false,coerceTypes:false,useDefaults:false,removeAdditional:false});
  let validate;
  try{validate=ajv.compile(schema);}
  catch{throw invalid('Schema does not satisfy the supported JSON Schema contract');}
  // A finite domain anywhere in an intersection must contain a possible value.
  for(const node of entries){
    const parts=[];const flatten=part=>{parts.push(part);for(const child of part.allOf??[])flatten(child);};flatten(node);
    const finite=parts.find(part=>Object.hasOwn(part,'const')||part.enum!==undefined);
    if(finite){
      const candidates=Object.hasOwn(finite,'const')?[finite.const]:finite.enum;
      const check=ajv.compile(node);
      if(!candidates.some(candidate=>check(candidate)))throw invalid('Schema enum or const has no value compatible with its constraints');
    }
  }
  // Conservative work admission prevents large enum/branch validation from
  // monopolizing the controller's event loop and delaying stop controls.
  const cost=nodes+enumEntries+literalBytes;
  const maxResultBytes=1024*1024,maxValidationWork=8*1024*1024;
  const limits=Object.freeze({maxSerializedBytes:Math.min(maxResultBytes,Math.floor(maxValidationWork/cost))});
  return{
    schema,
    limits,
    validate(value){
      let text;try{text=strictJson(value);}catch{throw fault('RESULT_JSON','Structured result must be JSON');}
      if(text===undefined)throw fault('RESULT_JSON','Structured result must be JSON');
      if(Buffer.byteLength(text)>maxResultBytes)throw fault('RESULT_SIZE','Structured result exceeds 1 MiB');
      if(cost*Buffer.byteLength(text)>maxValidationWork)throw fault('RESULT_LIMIT','Structured validation exceeds its work limit');
      return validate(value);
    },
    errors:()=>validate.errors?.slice(0,8).map(error=>({path:error.instancePath.slice(0,300),keyword:error.keyword,message:error.message?.slice(0,300)}))??[],
  };
}
