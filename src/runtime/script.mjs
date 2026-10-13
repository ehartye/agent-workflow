import { parse } from "acorn";
import Ajv from "ajv";

const ajv = new Ajv({ strict: true, allErrors: true, validateSchema: true });
const forbiddenKey = new Set(["__proto__", "constructor", "prototype"]);
export const SCRIPT_LIMIT = 524288;

export function assertText(value, label = "text") {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(
      value,
    )
  ) {
    throw new Error(
      `${label} must be nonempty text without hidden control characters`,
    );
  }
  return value;
}

function literal(node) {
  if (node.type === "Literal" && !node.regex && typeof node.value !== "bigint")
    return node.value;
  if (
    node.type === "UnaryExpression" &&
    ["-", "+"].includes(node.operator) &&
    node.argument.type === "Literal" &&
    typeof node.argument.value === "number"
  ) {
    return node.operator === "-" ? -node.argument.value : node.argument.value;
  }
  if (node.type === "ArrayExpression" && node.elements.every(Boolean))
    return node.elements.map(literal);
  if (node.type === "ObjectExpression") {
    const result = {};
    for (const property of node.properties) {
      if (
        property.type !== "Property" ||
        property.computed ||
        property.method ||
        property.kind !== "init" ||
        property.shorthand
      )
        throw new Error("meta must contain only pure literal values");
      const key =
        property.key.type === "Identifier"
          ? property.key.name
          : property.key.value;
      if (
        typeof key !== "string" ||
        forbiddenKey.has(key) ||
        Object.hasOwn(result, key)
      )
        throw new Error("meta has an invalid or duplicate property");
      result[key] = literal(property.value);
    }
    return result;
  }
  throw new Error("meta must contain only pure literal values");
}

export function parseScript(source) {
  assertText(source, "script");
  if (source.length > SCRIPT_LIMIT)
    throw new Error(`Inline script exceeds ${SCRIPT_LIMIT} characters`);
  const script = source.replace(/\r\n/g, "\n");
  const ast = parse(script, {
    ecmaVersion: "latest",
    sourceType: "module",
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
  });
  const declaration = ast.body[0];
  const variable = declaration?.declaration;
  if (
    declaration?.type !== "ExportNamedDeclaration" ||
    variable?.type !== "VariableDeclaration" ||
    variable.kind !== "const" ||
    variable.declarations.length !== 1 ||
    variable.declarations[0].id.name !== "meta"
  ) {
    throw new Error("First statement must be export const meta = { ... }");
  }
  const meta = literal(variable.declarations[0].init);
  if (!meta || Array.isArray(meta) || typeof meta !== "object")
    throw new Error("meta must be a literal object");
  assertText(meta.name, "meta.name");
  assertText(meta.description, "meta.description");
  if (meta.whenToUse !== undefined)
    assertText(meta.whenToUse, "meta.whenToUse");
  if (
    meta.phases !== undefined &&
    (!Array.isArray(meta.phases) ||
      meta.phases.some(
        (p) => !p || typeof p.title !== "string" || !p.title.trim(),
      ))
  )
    throw new Error("meta.phases must contain titled phases");
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (/^(Import|Export)/.test(node.type ?? ""))
      throw new Error(
        "Modules and additional exports are unavailable in workflows",
      );
    for (const value of Object.values(node))
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") walk(value);
  }
  ast.body.slice(1).forEach(walk);
  return { meta, body: script.slice(declaration.end), script };
}

export function parseMeta(source) {
  return parseScript(source).meta;
}

const SCHEMA_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "allOf",
  "anyOf",
  "oneOf",
  "title",
  "description",
  "default",
  "$schema",
  "nullable",
]);
export function assertSafeSchema(schema) {
  const json = JSON.stringify(schema);
  if (!json || Buffer.byteLength(json) > 32768)
    throw new Error("Schema size exceeds bounded 32768-byte subset");
  let nodes = 0;
  function bounds(value, depth = 0) {
    if (depth > 16 || ++nodes > 4096)
      throw new Error("Schema structural complexity exceeds bounded subset");
    if (value && typeof value === "object")
      for (const child of Object.values(value)) bounds(child, depth + 1);
  }
  bounds(schema);
  let schemaNodes = 0;
  function subset(node, depth = 0) {
    if (!node || typeof node !== "object" || Array.isArray(node))
      throw new Error("Schema must be an object");
    if (depth > 16 || ++schemaNodes > 512)
      throw new Error("Schema structural complexity exceeds bounded subset");
    for (const key of Object.keys(node))
      if (!SCHEMA_KEYWORDS.has(key))
        throw new Error(
          `Unsupported schema keyword ${key}; regex and dynamic features are unavailable`,
        );
    for (const child of Object.values(node.properties ?? {}))
      subset(child, depth + 1);
    if (node.items) subset(node.items, depth + 1);
    if (typeof node.additionalProperties === "object")
      subset(node.additionalProperties, depth + 1);
    for (const name of ["allOf", "anyOf", "oneOf"])
      if (node[name]) {
        if (!Array.isArray(node[name]) || node[name].length > 8)
          throw new Error("Schema branches exceed bounded subset");
        node[name].forEach((child) => subset(child, depth + 1));
      }
  }
  subset(schema);
  return schema;
}
function checkSchema(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema))
    throw new Error("Schema must be an object");
  if (schema.$ref !== undefined || schema.$async !== undefined)
    throw new Error("Schema references and async validation are unavailable");
  if (
    schema.required?.some((key) => !Object.hasOwn(schema.properties ?? {}, key))
  )
    throw new Error("Schema required keys must appear in properties");
  if (
    schema.maxProperties !== undefined &&
    new Set(schema.required ?? []).size > schema.maxProperties &&
    schema.nullable !== true
  )
    throw new Error(
      "Contradictory schema: required property count exceeds maxProperties",
    );
  const possibleTypes = schemaTypes(schema);
  if (possibleTypes.size === 0)
    throw new Error(
      "Contradictory schema: allOf types have no compatible intersection",
    );
  for (const [low, high] of [
    ["minimum", "maximum"],
    ["minLength", "maxLength"],
    ["minItems", "maxItems"],
    ["minProperties", "maxProperties"],
  ]) {
    if (
      schema[low] !== undefined &&
      schema[high] !== undefined &&
      schema[low] > schema[high]
    )
      throw new Error(`Contradictory schema ${low}/${high}`);
  }
  for (const child of Object.values(schema.properties ?? {}))
    checkSchema(child);
  if (schema.items && !Array.isArray(schema.items)) checkSchema(schema.items);
  for (const name of ["allOf", "anyOf", "oneOf"])
    if (schema[name]) schema[name].forEach(checkSchema);
}

function schemaTypes(schema) {
  const allTypes = [
    "null",
    "boolean",
    "string",
    "integer",
    "number",
    "object",
    "array",
  ];
  const types =
    schema.type === undefined
      ? allTypes
      : Array.isArray(schema.type)
        ? schema.type
        : [schema.type];
  let candidates = new Set(
    types.flatMap((type) =>
      type === "number" ? ["number", "integer"] : [type],
    ),
  );
  if (schema.nullable) candidates.add("null");
  for (const child of schema.allOf ?? []) {
    const constraints = schemaTypes(child);
    candidates = new Set(
      [...candidates].filter((type) => constraints.has(type)),
    );
  }
  return candidates;
}

export function validateSchema(schema) {
  assertSafeSchema(schema);
  if (schema.type !== "object")
    throw new Error("Worker schema root must have type object");
  checkSchema(schema);
  return ajv.compile(schema);
}
