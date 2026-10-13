/** @lane merge
 * @subject engine/schema.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

async function compiler(){const module=await import('../engine/schema.mjs').catch(()=>null);assert.ok(module?.compileSchema,'Bounded structured output compiler must exist');return module.compileSchema;}
const schema={type:'object',properties:{files:{type:'array',items:{type:'object',properties:{path:{type:'string',minLength:1},score:{type:['number','null'],minimum:0,maximum:1}},required:['path','score'],additionalProperties:false},maxItems:20},verdict:{enum:['pass','fail']}},required:['files','verdict'],additionalProperties:false};
test('structured results accept strict nested JSON without coercion or mutation',async()=>{
  const compile=await compiler(),compiled=compile(schema);
  const value={files:[{path:'src/a.mjs',score:0.7},{path:'b',score:null}],verdict:'pass'};
  const before=JSON.stringify(value);assert.equal(compiled.validate(value),true);assert.equal(JSON.stringify(value),before);
  for(const value of [{files:[],verdict:'maybe'},{files:[{path:'a',score:'0.5'}],verdict:'pass'},{files:[]},{files:[],verdict:'pass',extra:true}])assert.equal(compiled.validate(value),false);
});
test('contradictory or unsupported schemas reject before output generation',async()=>{
  const compile=await compiler();
  for(const bad of [
    {type:'object',properties:{},required:['missing'],additionalProperties:false},
    {type:'object',minProperties:2,maxProperties:1},
    {type:'object',properties:{x:{type:'string',minLength:3,maxLength:2}}},
    {type:'object',properties:{x:{type:'number',minimum:2,maximum:1}}},
    {type:'object',properties:{x:{allOf:[{type:'string'},{type:'number'}]}}},
    {type:'object',properties:{x:{type:'string',pattern:'(a+)+$'}}},
    {type:'object',$ref:'https://untrusted.invalid/schema'},
    {type:'array',items:{type:'string'}},
    {type:'object',properties:{x:{type:'string',enum:[1]}},required:['x']},
    {type:'object',properties:{x:{type:'integer',minimum:0.1,maximum:0.9}},required:['x']},
    {type:'object',additionalProperties:()=>false},
  ])assert.throws(()=>compile(bad),error=>error.code==='SCHEMA_INVALID'||error.code==='SCHEMA_UNSUPPORTED');
});
test('schema and result work are bounded and validation diagnostics omit private values',async()=>{
  const compile=await compiler();let deep={type:'string'};
  for(let i=0;i<25;i++)deep={type:'object',properties:{x:deep}};
  assert.throws(()=>compile(deep),{code:'SCHEMA_LIMIT'});
  assert.throws(()=>compile({type:'object',description:'x'.repeat(40000)}),{code:'SCHEMA_LIMIT'});
  const compiled=compile({type:'object',properties:{count:{type:'integer'}},required:['count']});
  assert.equal(compiled.validate({count:'PRIVATE_SENTINEL'}),false);
  assert.doesNotMatch(JSON.stringify(compiled.errors()),/PRIVATE_SENTINEL/);
  assert.throws(()=>compiled.validate({count:'x'.repeat(1024*1024)}),{code:'RESULT_SIZE'});
});

test('constraints reject only when every permitted type is impossible',async()=>{
  const compile=await compiler();
  const nullable={type:'object',properties:{value:{type:['number','null'],minimum:2,maximum:1}},required:['value']};
  assert.equal(compile(nullable).validate({value:null}),true);
  assert.throws(()=>compile({type:'object',properties:{value:{type:'number',allOf:[{minimum:3},{maximum:2}]}}}),{code:'SCHEMA_INVALID'});
  assert.throws(()=>compile({type:'object',allOf:[{required:['x']},{properties:{},additionalProperties:false}]}),{code:'SCHEMA_INVALID'});
  assert.throws(()=>compile({type:'object',properties:{x:{type:'number',allOf:[{exclusiveMinimum:1},{maximum:1}]}}}),{code:'SCHEMA_INVALID'});
});

test('enum admission and result work have deterministic cost bounds',async()=>{
  const compile=await compiler();
  assert.throws(()=>compile({type:'object',properties:{items:{type:'array',items:{enum:Array.from({length:6000},(_,i)=>i)}}}}),{code:'SCHEMA_LIMIT'});
  const compiled=compile({type:'object',properties:{items:{type:'array',items:{enum:Array.from({length:128},(_,i)=>i)}}}});
  assert.equal(compiled.validate({items:[1,2,3]}),true);
  assert.throws(()=>compiled.validate({items:Array(100000).fill(1)}),{code:'RESULT_LIMIT'});
});

test('non-JSON values are rejected without normalization',async()=>{
  const compile=await compiler();
  for(const value of [undefined,NaN,Infinity,()=>false,Symbol('x'),1n]){
    assert.throws(()=>compile({type:'object',const:{x:value}}),{code:'SCHEMA_INVALID'});
    assert.throws(()=>compile({type:'object'}).validate({x:value}),{code:'RESULT_JSON'});
  }
});
