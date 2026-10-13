/** @lane merge
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseScript, validateSchema } from "../src/runtime/script.mjs";

test("literal meta is read without evaluating expressions and body permits top-level return", () => {
  const parsed = parseScript(
    'export const meta = { name: "one", description: "two", phases: [{title: "Read"}] };\nreturn args;',
  );
  assert.equal(parsed.meta.name, "one");
  assert.match(parsed.body, /return args/);
  for (const source of [
    'export const meta = {name: "x", description: process.env.SECRET}; return 1;',
    "export const meta = {...args}; return 1;",
    'log("before"); export const meta = {name:"x", description:"x"};',
    'export const meta={name:"x",description:"x"}; import x from "fs";',
  ])
    assert.throws(() => parseScript(source));
});

test("schema fails closed for invalid roots, unknown requirements and contradiction", () => {
  for (const schema of [
    { type: "string" },
    { type: "object", properties: { x: { type: "string" } }, required: ["y"] },
    {
      type: "object",
      properties: { x: { type: "integer", minimum: 10, maximum: 2 } },
    },
  ])
    assert.throws(() => validateSchema(schema));
  const validate = validateSchema({
    type: "object",
    properties: { x: { type: "integer" } },
    required: ["x"],
    additionalProperties: false,
  });
  assert.equal(validate({ x: 1 }), true);
  assert.equal(validate({ x: "1" }), false);
});

test("schema refuses regex CPU hazards and excessive structural complexity before worker dispatch", () => {
  for (const schema of [
    {
      type: "object",
      properties: { x: { type: "string", pattern: "^(a+)+$" } },
    },
    { type: "object", patternProperties: { ".*": { type: "string" } } },
    { type: "object", properties: { x: { type: "string", format: "email" } } },
    { type: "object", description: "x".repeat(40000) },
    {
      type: "object",
      properties: Object.fromEntries(
        Array.from({ length: 600 }, (_, i) => ["p" + i, { type: "string" }]),
      ),
    },
  ])
    assert.throws(
      () => validateSchema(schema),
      /schema|bounded|unsupported|complexity|size/i,
    );
});

test("schema rejects quadratic compound and prototype-sensitive primitive uniqueness before compiling a validator", () => {
  for (const items of [
    { type: "object" },
    { type: "array", items: { type: "string" } },
    { type: "string" },
    {},
  ]) {
    for (const maxItems of [undefined, 128]) {
      const array = { type: "array", items, uniqueItems: true };
      if (maxItems !== undefined) array.maxItems = maxItems;
      assert.throws(
        () => validateSchema({ type: "object", properties: { rows: array } }),
        /unsupported.*uniqueItems/i,
      );
    }
  }
});

test("schema refuses required property count and incompatible conjunction type contradictions", () => {
  for (const schema of [
    {
      type: "object",
      properties: { x: { type: "string" } },
      required: ["x"],
      maxProperties: 0,
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { x: { allOf: [{ type: "string" }, { type: "number" }] } },
      required: ["x"],
    },
  ])
    assert.throws(() => validateSchema(schema), /contradict/i);
  const validate = validateSchema({
    type: "object",
    properties: { x: { allOf: [{ type: "number" }, { type: "integer" }] } },
    required: ["x"],
  });
  assert.equal(validate({ x: 1 }), true);
  assert.equal(validate({ x: 1.5 }), false);
});
