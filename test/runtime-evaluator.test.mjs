import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../src/runtime/evaluator.mjs";

test("separate QuickJS evaluator exposes JSON broker, item-local pipelines and ordered parallel nulls", async () => {
  const calls = [];
  const value = await evaluate(
    {
      body: `
    const p = await parallel([() => agent('a'), () => {throw Error('missing')}, () => agent('c')]);
    const q = await pipeline([1,2], async (v,item,i) => { if(i===1) throw Error('bad'); return v+1; }, (v,item,i) => ({v,item,i}));
    return {p,q,host:[typeof process,typeof require,typeof fetch]};
  `,
    },
    async (message) => {
      calls.push(message);
      return { value: message.prompt, spent: 2 };
    },
  );
  assert.deepEqual(value, {
    p: ["a", null, "c"],
    q: [{ v: 2, item: 1, i: 0 }, null],
    host: ["undefined", "undefined", "undefined"],
  });
  assert.deepEqual(
    calls.map((x) => x.prompt),
    ["a", "c"],
  );
});

test("evaluator rejects clocks/randomness and terminates unbounded CPU, memory and unsettled work", async () => {
  for (const body of [
    "return Math.random();",
    "return Date.now();",
    "return new Date();",
    "return Object.getPrototypeOf(Date).now();",
    "return new Date(0).constructor.now();",
    "while(true) {}",
    'const a=[]; while(true) a.push("x".repeat(10000));',
    "return await new Promise(()=>{});",
  ]) {
    await assert.rejects(
      evaluate(
        { body, cpuMs: 60, wallMs: 300, memoryBytes: 4 * 1024 * 1024 },
        async () => null,
      ),
      /random|Date|interrupt|memory|wall|time|budget|function/i,
    );
  }
});

test("workflow cannot access private bridge, result callbacks, or original clock through evaluator lexical scope", async () => {
  const value = await evaluate(
    {
      body: "return [typeof rpc,typeof done,typeof failed,typeof RealDate,typeof dates,typeof __broker,typeof __finish,typeof __fail];",
    },
    async () => null,
  );
  assert.deepEqual(value, Array(8).fill("undefined"));
});

test("workflow result must serialize as JSON; functions and cycles are rejected", async () => {
  for (const body of ["return ()=>1;", "const a={};a.self=a;return a;"])
    await assert.rejects(
      evaluate({ body }, async () => null),
      /JSON|circular|cyclic|serialize/i,
    );
});
