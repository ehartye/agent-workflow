/** @lane merge
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { RuntimeManager } from "../src/runtime/manager.mjs";

const meta =
  'export const meta={name:"test",description:"A real evaluator test"};\n';
async function setup(t, execute, options = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "workflow-runtime-"));
  const manager = new RuntimeManager({
    dataDir,
    backend: {
      execute,
      async shutdown() {},
      async steer() {
        return true;
      },
    },
    ...options,
  });
  t.after(async () => {
    await manager.shutdown();
    await rm(dataDir, { recursive: true, force: true });
  });
  return { manager, dataDir };
}
async function settled(
  manager,
  id,
  statuses = ["completed", "failed", "stopped", "paused"],
) {
  for (let i = 0; i < 400; i++) {
    const run = await manager.get(id);
    if (statuses.includes(run.status)) return run;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error("run did not settle");
}

test("manager bounds concurrency and persists every repeated invocation as a distinct worker", async (t) => {
  let active = 0,
    peak = 0,
    calls = 0;
  let releaseFirstPair;
  const firstPair = new Promise((resolve) => { releaseFirstPair = resolve; });
  const { manager } = await setup(t, async () => {
    calls++;
    peak = Math.max(peak, ++active);
    await firstPair;
    active--;
    return { value: "ok", usage: { outputTokens: 3, inputTokens: 1 } };
  });
  const run = await manager.start({
    script:
      meta +
      'return await parallel(Array.from({length:5},()=>()=>agent("same")));',
    cwd: process.cwd(),
    concurrency: 2,
  });
  let final;
  try {
    let admitted;
    for (let i = 0; i < 400; i++) {
      admitted = await manager.get(run.id);
      if (admitted.workers.length === 5 && calls >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(admitted.workers.length, 5, "Every invocation must reach admission while the first workers are held");
    assert.equal(calls, 2, "No third backend may dispatch while the first two workers are held");
    assert.equal(admitted.workers.filter((worker) => worker.status === "running").length, 2);
    assert.equal(admitted.workers.filter((worker) => worker.status === "queued").length, 3);
    releaseFirstPair();
    final = await settled(manager, run.id);
  }
  finally { releaseFirstPair(); }
  assert.equal(final.status, "completed");
  assert.equal(peak, 2);
  assert.equal(calls, 5);
  assert.equal(final.workers.length, 5);
  assert.equal(final.usage.outputTokens, 15);
  assert.deepEqual(final.result, ["ok", "ok", "ok", "ok", "ok"]);
  assert.equal(new Set(final.workers.map((w) => w.key)).size, 5);
  const stored = JSON.parse(await readFile(final.snapshotPath, "utf8"));
  assert.equal(stored.status, "completed");
});

test("matching ordered prefix reuses results, changed invocation invalidates completed suffix, cumulative spend persists", async (t) => {
  let calls = 0;
  const { manager } = await setup(t, async (request) => ({
    value: `${++calls}:${request.prompt}`,
    usage: { outputTokens: 1 },
  }));
  const first = await manager.start({
    script:
      meta + 'const a=await agent("a");const b=await agent("b");return [a,b];',
    cwd: process.cwd(),
  });
  await settled(manager, first.id);
  await manager.control(first.id, "resume", {
    script:
      meta +
      'const a=await agent("a",{label:"renamed"});const b=await agent("c");return [a,b];',
  });
  const final = await settled(manager, first.id);
  assert.equal(calls, 3);
  assert.deepEqual(final.result, ["1:a", "3:c"]);
  assert.equal(final.usage.outputTokens, 3);
  assert.equal(final.usage.attempts, 3);
});

test("schemas fail before dispatch and invalid results remain visible while parallel preserves null slots", async (t) => {
  let calls = 0;
  const { manager } = await setup(t, async () => {
    calls++;
    return { value: { x: "bad" }, usage: { outputTokens: 2 } };
  });
  const run = await manager.start({
    script:
      meta +
      'return await parallel([()=>agent("bad",{schema:{type:"object",properties:{x:{type:"integer"}},required:["x"]}}),()=>agent("invalid",{schema:{type:"string"}})]);',
    cwd: process.cwd(),
  });
  const final = await settled(manager, run.id);
  assert.deepEqual(final.result, [null, null]);
  assert.equal(calls, 1);
  assert.ok(final.workers.some((w) => w.error?.code === "SCHEMA_VALIDATION"));
  assert.equal(final.usage.outputTokens, 2);
});

test("nested workflows share scheduler and agent cap, and cannot nest a second level", async (t) => {
  let calls = 0;
  const { manager } = await setup(
    t,
    async (r) => ({
      value: `${++calls}:${r.prompt}`,
      usage: { outputTokens: 1 },
    }),
    {
      resolveWorkflow: async (name) => ({
        script:
          meta +
          (name === "deep"
            ? 'return await workflow("child");'
            : 'return await parallel([()=>agent("child1"),()=>agent("child2")]);'),
      }),
    },
  );
  const run = await manager.start({
    script:
      meta +
      'const a=await agent("parent"); return await workflow("child",{x:1});',
    cwd: process.cwd(),
    maxAgents: 2,
  });
  const final = await settled(manager, run.id);
  assert.equal(calls, 2);
  assert.deepEqual(final.result, ["2:child1", null]);
  const deep = await manager.start({
    script: meta + 'return await workflow("deep");',
    cwd: process.cwd(),
  });
  assert.match((await settled(manager, deep.id)).error.message, /nest/i);
});

test("budget guard retains spend across replay and does not dispatch beyond exhausted observed output tokens", async (t) => {
  let calls = 0;
  const { manager } = await setup(t, async () => ({
    value: "ok",
    usage: { outputTokens: ++calls * 2 },
  }));
  const run = await manager.start({
    script: meta + 'await agent("one");return await agent("two");',
    cwd: process.cwd(),
    budget: 2,
    concurrency: 1,
  });
  const final = await settled(manager, run.id);
  assert.equal(final.status, "failed");
  assert.equal(calls, 1);
  assert.equal(final.usage.outputTokens, 2);
  await manager.control(run.id, "resume");
  assert.equal((await settled(manager, run.id)).status, "failed");
  assert.equal(calls, 1);
});

test("pause drains active workers, blocks queued dispatch and resume reuses the completed prefix", async (t) => {
  let release;
  let calls = 0;
  const { manager } = await setup(t, async () => {
    calls++;
    if (calls === 1) await new Promise((r) => (release = r));
    return { value: "ok", usage: { outputTokens: 1 } };
  });
  const run = await manager.start({
    script: meta + 'return await parallel([()=>agent("a"),()=>agent("b")]);',
    cwd: process.cwd(),
    concurrency: 1,
  });
  while (!release) await new Promise((r) => setTimeout(r, 10));
  const draining = await manager.control(run.id, "pause");
  assert.equal(draining.status, "pausing");
  assert.equal(calls, 1);
  release();
  const paused = await settled(manager, run.id, ["paused"]);
  assert.equal(paused.workers[0].status, "completed");
  assert.equal(calls, 1);
  await manager.control(run.id, "resume");
  const final = await settled(manager, run.id);
  assert.equal(final.status, "completed");
  assert.equal(calls, 2);
  assert.deepEqual(final.result, ["ok", "ok"]);
});

test("cancelled writers preserve uncertain outcome and prohibit blind replay", async (t) => {
  let entered = false;
  const { manager } = await setup(t, async (_request, { signal }) => {
    entered = true;
    await new Promise((_, reject) =>
      signal.addEventListener(
        "abort",
        () =>
          reject(
            Object.assign(Error("Interrupted write"), { outcome: "unknown" }),
          ),
        { once: true },
      ),
    );
  });
  const run = await manager.start({
    script: meta + 'return await agent("write");',
    cwd: process.cwd(),
    permissions: { sandbox: "workspace-write" },
  });
  while (!entered) await new Promise((r) => setTimeout(r, 10));
  const active = await manager.get(run.id);
  await manager.control(run.id, "cancel-worker", {
    workerId: active.workers[0].id,
  });
  const final = await settled(manager, run.id);
  assert.equal(final.workers[0].status, "unknown");
  await manager.control(run.id, "resume");
  assert.equal(
    (await settled(manager, run.id)).error.code,
    "UNCERTAIN_EFFECTS",
  );
});

test("missing persisted result invalidates its prefix and completed suffix instead of using memory", async (t) => {
  let calls = 0;
  const { manager } = await setup(t, async () => ({
    value: ++calls,
    usage: { outputTokens: 1 },
  }));
  const run = await manager.start({
    script: meta + 'return [await agent("a"),await agent("b")];',
    cwd: process.cwd(),
  });
  const first = await settled(manager, run.id);
  await rm(first.workers[0].resultPath);
  await manager.control(run.id, "resume");
  const final = await settled(manager, run.id);
  assert.equal(calls, 4);
  assert.deepEqual(final.result, [3, 4]);
});

test("approval waits for durable explicit decision and denied scripts cannot raise permissions", async (t) => {
  let entered = false;
  const { manager } = await setup(t, async (_request, { onApproval }) => {
    entered = true;
    const decision = await onApproval({
      id: "rpc-1",
      method: "command",
      request: { command: "read" },
    });
    return { value: decision, usage: { outputTokens: 1 } };
  });
  const run = await manager.start({
    script: meta + 'return await agent("read");',
    cwd: process.cwd(),
    permissions: { approvalPolicy: "on-request" },
  });
  while (!entered) await new Promise((r) => setTimeout(r, 10));
  let pending;
  for (let i = 0; i < 100; i++) {
    pending = await manager.get(run.id);
    if (pending.approvals.length) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  await manager.approve(run.id, pending.approvals[0].id, "accept");
  assert.equal((await settled(manager, run.id)).result, "accept");
  const denied = await manager.start({
    script: meta + 'return await agent("bad",{sandbox:"danger-full-access"});',
    cwd: process.cwd(),
  });
  assert.equal(
    (await settled(manager, denied.id)).error.code,
    "INVALID_OPTIONS",
  );
});

test("exclusive ownership rejects a second controller and a fresh controller recovers durable completed cache", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "workflow-owner-"));
  let calls = 0;
  const backend = {
    execute: async () => ({ value: ++calls, usage: { outputTokens: 1 } }),
    async shutdown() {},
  };
  let third;
  const first = new RuntimeManager({ dataDir, backend });
  t.after(async () => {
    await first.shutdown().catch(() => {});
    await third?.shutdown();
    await rm(dataDir, { recursive: true, force: true });
  });
  const run = await first.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  await settled(first, run.id);
  const second = new RuntimeManager({ dataDir, backend });
  await assert.rejects(second.list(), /controller|ownership/i);
  await first.shutdown();
  third = new RuntimeManager({ dataDir, backend });
  await third.control(run.id, "resume");
  assert.equal((await settled(third, run.id)).result, 1);
  assert.equal(calls, 1);
});

test("failed invocation invalidates all subsequent completed siblings on resume", async (t) => {
  let calls = 0;
  let fail = true;
  const { manager } = await setup(t, async (request) => {
    calls++;
    if (request.prompt === "b" && fail)
      throw Object.assign(Error("failed b"), { outcome: "failed" });
    return { value: request.prompt, usage: { outputTokens: 1 } };
  });
  const run = await manager.start({
    script:
      meta +
      'return await parallel([()=>agent("a"),()=>agent("b"),()=>agent("c")]);',
    cwd: process.cwd(),
  });
  assert.deepEqual((await settled(manager, run.id)).result, ["a", null, "c"]);
  fail = false;
  await manager.control(run.id, "resume");
  assert.deepEqual((await settled(manager, run.id)).result, ["a", "b", "c"]);
  assert.equal(calls, 5);
});

test("restart read-only worker retains attempt cost and reuses its consumer without advancing invocation key", async (t) => {
  let calls = 0;
  let active;
  const { manager } = await setup(t, async (_request, { signal }) => {
    calls++;
    active = true;
    if (calls === 1) {
      await new Promise((_, reject) =>
        signal.addEventListener(
          "abort",
          () =>
            reject(
              Object.assign(Error("cancelled"), {
                outcome: "cancelled",
                usage: { outputTokens: 2 },
              }),
            ),
          { once: true },
        ),
      );
    }
    return { value: "restarted", usage: { outputTokens: 3 } };
  });
  const run = await manager.start({
    script: meta + 'return await agent("read");',
    cwd: process.cwd(),
  });
  while (!active) await new Promise((r) => setTimeout(r, 10));
  const snapshot = await manager.get(run.id);
  await manager.control(run.id, "restart-worker", {
    workerId: snapshot.workers[0].id,
  });
  const final = await settled(manager, run.id);
  assert.equal(final.result, "restarted");
  assert.equal(calls, 2);
  assert.equal(final.usage.outputTokens, 5);
  assert.equal(final.usage.attempts, 2);
  assert.equal(final.workers[0].attempt, 2);
});

test("saved editable script resumes from disk while immutable generation snapshots survive", async (t) => {
  let calls = 0;
  const { manager } = await setup(t, async () => ({
    value: ++calls,
    usage: { outputTokens: 1 },
  }));
  const run = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  const first = await settled(manager, run.id);
  assert.equal(
    await readFile(first.scriptPath, "utf8"),
    meta + 'return await agent("a");',
  );
  await writeFile(first.scriptPath, meta + 'return (await agent("a"))*10;');
  await manager.control(run.id, "resume");
  const final = await settled(manager, run.id);
  assert.equal(final.result, 10);
  assert.equal(calls, 1);
  assert.equal(
    JSON.parse(await readFile(first.scriptArtifactPath, "utf8")).script,
    meta + 'return await agent("a");',
  );
  assert.notEqual(first.scriptArtifactPath, final.scriptArtifactPath);
  assert.equal(JSON.parse(await readFile(final.resultPath, "utf8")).value, 10);
});

test("usage coverage retains cumulative normalized fields without counting repeated events twice", async (t) => {
  const { manager } = await setup(t, async (_r, { onEvent }) => {
    onEvent({
      type: "usage",
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        cachedInputTokens: 7,
        reasoningOutputTokens: 1,
        observed: true,
      },
    });
    onEvent({
      type: "usage",
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        cachedInputTokens: 7,
        reasoningOutputTokens: 1,
        observed: true,
      },
    });
    return {
      value: "ok",
      usage: {
        inputTokens: 10,
        outputTokens: 3,
        cachedInputTokens: 7,
        reasoningOutputTokens: 2,
        observed: true,
      },
    };
  });
  const run = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  const final = await settled(manager, run.id);
  assert.equal(final.usage.cachedInputTokens, 7);
  assert.equal(final.usage.reasoningOutputTokens, 2);
  assert.equal(final.usage.outputTokens, 3);
  assert.equal(final.workers[0].usageObserved, true);
  assert.equal(final.coverage.complete, true);
});

test("schema-invalid invocation remains a visible failed slot with incomplete coverage", async (t) => {
  const { manager } = await setup(t, async () => {
    throw Error("must not dispatch");
  });
  const run = await manager.start({
    script:
      meta +
      'return await parallel([()=>agent("bad",{schema:{type:"string"}})]);',
    cwd: process.cwd(),
  });
  const final = await settled(manager, run.id);
  assert.deepEqual(final.result, [null]);
  assert.equal(final.workers.length, 1);
  assert.equal(final.workers[0].error.code, "SCHEMA_INVALID");
  assert.equal(final.coverage.requested, 1);
  assert.equal(final.coverage.failed, 1);
  assert.equal(final.coverage.complete, false);
});

test("recovery verifies actual orphan drain but requires review of read-only abandoned effects before replay", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "workflow-orphan-"));
  const orphan = spawn(process.execPath, ["-e", "setInterval(()=>{},10000)"], {
    stdio: "ignore",
    windowsHide: true,
  });
  let recovered = 0;
  const backend = {
    execute: async () => ({ value: "safe", usage: { outputTokens: 1 } }),
    async shutdown() {},
    async recoverOrphan(record) {
      assert.equal(record.pid, orphan.pid);
      assert.deepEqual(record.processIdentity, { fixture: "owned" });
      recovered++;
      const exited = once(orphan, "exit");
      orphan.kill();
      await exited;
      return { drained: true, status: "drained" };
    },
  };
  let manager = new RuntimeManager({ dataDir, backend });
  t.after(async () => {
    await manager.shutdown().catch(() => {});
    orphan.kill();
    await rm(dataDir, { recursive: true, force: true });
  });
  const run = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  const first = await settled(manager, run.id);
  await manager.shutdown();
  const durable = JSON.parse(await readFile(first.snapshotPath, "utf8"));
  durable.status = "running";
  durable.workers[0].status = "running";
  durable.workers[0].pid = orphan.pid;
  durable.workers[0].processIdentity = { fixture: "owned" };
  await writeFile(first.snapshotPath, JSON.stringify(durable));
  manager = new RuntimeManager({ dataDir, backend });
  assert.equal((await manager.get(run.id)).workers[0].status, "unknown");
  assert.equal(recovered, 1);
  assert.ok(orphan.exitCode !== null || orphan.signalCode !== null);
  await manager.control(run.id, "resume");
  assert.equal(
    (await settled(manager, run.id)).error.code,
    "UNCERTAIN_EFFECTS",
  );
  await manager.control(run.id, "resume", { reconcileUnknown: true });
  assert.equal((await settled(manager, run.id)).result, "safe");
});

test("unverified orphan stays unknown, explicit reconciliation cannot bypass missing drain proof", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "workflow-unknown-"));
  const backend = {
    execute: async () => ({ value: "x", usage: { outputTokens: 1 } }),
    async shutdown() {},
  };
  let manager = new RuntimeManager({ dataDir, backend });
  t.after(async () => {
    await manager.shutdown().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  });
  const run = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  const first = await settled(manager, run.id);
  await manager.shutdown();
  const durable = JSON.parse(await readFile(first.snapshotPath, "utf8"));
  durable.status = "running";
  durable.workers[0].status = "running";
  await writeFile(first.snapshotPath, JSON.stringify(durable));
  manager = new RuntimeManager({ dataDir, backend });
  assert.equal((await manager.get(run.id)).workers[0].status, "unknown");
  await assert.rejects(
    manager.control(run.id, "resume", { reconcileUnknown: true }),
    /drain|orphan/i,
  );
});

test("backend profile fingerprint change invalidates the whole prefix and emits evidence", async (t) => {
  let calls = 0;
  let fingerprint = "a";
  const { manager } = await setup(t, async () => ({
    value: ++calls,
    usage: { outputTokens: 1 },
  }));
  manager.backend.executionFingerprint = async () => fingerprint;
  const run = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  await settled(manager, run.id);
  fingerprint = "b";
  await manager.control(run.id, "resume");
  const final = await settled(manager, run.id);
  assert.equal(final.result, 2);
  assert.equal(calls, 2);
  assert.equal(final.executionFingerprint, "b");
  assert.ok(final.events.some((e) => e.type === "replay-invalidated"));
});

test("failed agent usage remains visible through budget API even when its collection catches the failure", async (t) => {
  const { manager } = await setup(t, async () => {
    throw Object.assign(Error("bad"), {
      outcome: "failed",
      usage: { outputTokens: 4 },
    });
  });
  const run = await manager.start({
    script:
      meta +
      'await parallel([()=>agent("a")]);return {spent:budget.spent(),remaining:budget.remaining()};',
    cwd: process.cwd(),
    budget: 10,
  });
  const final = await settled(manager, run.id);
  assert.deepEqual(final.result, { spent: 4, remaining: 6 });
});

test("one-level child uses its own declared phases while sharing run caps and cancellation", async (t) => {
  const { manager } = await setup(
    t,
    async (r) => ({ value: r.phase, usage: { outputTokens: 1 } }),
    {
      resolveWorkflow: async () => ({
        script:
          'export const meta={name:"child",description:"child",phases:[{title:"Child"}]};phase("Child");return await agent("a");',
      }),
    },
  );
  const run = await manager.start({
    script:
      'export const meta={name:"parent",description:"parent",phases:[{title:"Parent"}]};return await workflow("child");',
    cwd: process.cwd(),
  });
  assert.equal((await settled(manager, run.id)).result, "Child");
});

test("script permissions can reduce authorization and cannot raise the run ceiling", async (t) => {
  let permissions;
  const { manager } = await setup(t, async (r) => {
    permissions = r.permissions;
    return { value: "ok", usage: { outputTokens: 1 } };
  });
  const run = await manager.start({
    script:
      meta +
      'return await agent("a",{permissions:{sandbox:"read-only",networkAccess:false}});',
    cwd: process.cwd(),
    permissions: { sandbox: "workspace-write", networkAccess: true },
  });
  assert.equal((await settled(manager, run.id)).status, "completed");
  assert.deepEqual(permissions, {
    sandbox: "read-only",
    networkAccess: false,
    approvalPolicy: "never",
  });
  const raised = await manager.start({
    script:
      meta +
      'return await agent("a",{permissions:{sandbox:"workspace-write"}});',
    cwd: process.cwd(),
  });
  assert.equal(
    (await settled(manager, raised.id)).error.code,
    "PERMISSION_ESCALATION",
  );
});

test("stalled read-only attempts restart at most five times with retained cumulative spend", async (t) => {
  let calls = 0;
  const { manager } = await setup(t, async () => {
    calls++;
    throw Object.assign(Error("stalled"), {
      code: "STALLED",
      outcome: "cancelled",
      usage: { outputTokens: 1 },
    });
  });
  const run = await manager.start({
    script: meta + 'return await agent("a",{stallMs:10});',
    cwd: process.cwd(),
  });
  const final = await settled(manager, run.id);
  assert.equal(calls, 6);
  assert.equal(final.usage.attempts, 6);
  assert.equal(final.usage.outputTokens, 6);
  assert.equal(final.workers[0].attempts.length, 6);
  assert.equal(final.error.code, "STALLED");
});

test("unknown stalled effects are never automatically retried", async (t) => {
  let calls = 0;
  const { manager } = await setup(t, async () => {
    calls++;
    throw Object.assign(Error("stalled command"), {
      code: "STALLED",
      outcome: "unknown",
      usage: { outputTokens: 1 },
    });
  });
  const run = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  assert.equal((await settled(manager, run.id)).workers[0].status, "unknown");
  assert.equal(calls, 1);
});

test("quota wait uses only explicit reset metadata within configured bound", async (t) => {
  let calls = 0;
  const { manager } = await setup(t, async () => {
    calls++;
    if (calls === 1)
      throw Object.assign(Error("quota"), {
        code: "QUOTA",
        outcome: "not-started",
        resetAt: Date.now() + 20,
      });
    return { value: "after-reset", usage: { outputTokens: 1 } };
  });
  const run = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
    quotaWaitMs: 100,
  });
  const final = await settled(manager, run.id);
  assert.equal(final.result, "after-reset");
  assert.equal(calls, 2);
  assert.ok(final.events.some((e) => e.type === "worker-quota-wait"));
  calls = 0;
  manager.backend.execute = async () => {
    calls++;
    throw Object.assign(Error("quota without reset"), {
      code: "QUOTA",
      outcome: "not-started",
    });
  };
  const unknown = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
    quotaWaitMs: 100,
  });
  assert.equal((await settled(manager, unknown.id)).status, "failed");
  assert.equal(calls, 1);
});

test("simultaneous resume commands admit exactly one live replay controller", async (t) => {
  let calls = 0;
  const { manager } = await setup(t, async () => ({
    value: ++calls,
    usage: { outputTokens: 1 },
  }));
  const run = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  await settled(manager, run.id);
  const edited = meta + 'return await agent("changed");';
  const results = await Promise.allSettled([
    manager.control(run.id, "resume", { script: edited }),
    manager.control(run.id, "resume", { script: edited }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  await settled(manager, run.id);
  assert.equal(calls, 2);
});

test("parallel cache admission waits for earlier artifact checks before reusing any suffix", async (t) => {
  const dataDir = await mkdtemp(
    path.join(os.tmpdir(), "workflow-replay-prefix-"),
  );
  const missing = path.join(dataDir, "lost.json");
  await writeFile(missing, "{}");
  let calls = 0;
  const backend = {
    execute: async (r) => ({
      value: ++calls,
      usage: { outputTokens: 1 },
      artifacts: r.prompt === "a" ? [missing] : [],
    }),
    async shutdown() {},
  };
  const manager = new RuntimeManager({ dataDir, backend });
  t.after(async () => {
    await manager.shutdown();
    await rm(dataDir, { recursive: true, force: true });
  });
  const run = await manager.start({
    script: meta + 'return await parallel([()=>agent("a"),()=>agent("b")]);',
    cwd: process.cwd(),
  });
  await settled(manager, run.id);
  await rm(missing);
  await manager.control(run.id, "resume");
  const final = await settled(manager, run.id);
  assert.deepEqual(final.result, [3, 4]);
  assert.equal(calls, 4);
});

test("read-only orphan with observed external tool start stays unknown after verified drain until reviewed", async (t) => {
  const dataDir = await mkdtemp(
    path.join(os.tmpdir(), "workflow-tool-effects-"),
  );
  let calls = 0;
  const backend = {
    async execute(_r, { onEvent }) {
      calls++;
      await onEvent({
        type: "item/started",
        params: { item: { type: "mcpToolCall", tool: "external_mutation" } },
      });
      return { value: "done", usage: { outputTokens: 1 } };
    },
    async shutdown() {},
    async recoverOrphan() {
      return { drained: true, status: "drained" };
    },
  };
  let manager = new RuntimeManager({ dataDir, backend });
  t.after(async () => {
    await manager.shutdown().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  });
  const run = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  const first = await settled(manager, run.id);
  await manager.shutdown();
  const durable = JSON.parse(await readFile(first.snapshotPath, "utf8"));
  durable.status = "running";
  durable.workers[0].status = "running";
  delete durable.workers[0].potentialEffects;
  await writeFile(first.snapshotPath, JSON.stringify(durable));
  manager = new RuntimeManager({ dataDir, backend });
  assert.equal((await manager.get(run.id)).workers[0].status, "unknown");
  await manager.control(run.id, "resume");
  assert.equal(
    (await settled(manager, run.id)).error.code,
    "UNCERTAIN_EFFECTS",
  );
  assert.equal(calls, 1);
  await manager.control(run.id, "resume", { reconcileUnknown: true });
  assert.equal((await settled(manager, run.id)).result, "done");
  assert.equal(calls, 2);
});

test("runtime cancellation treats observed tool effects as unknown even under read-only filesystem permission", async (t) => {
  let entered = false;
  const { manager } = await setup(t, async (_r, { onEvent, signal }) => {
    await onEvent({ type: "item.started", item: { type: "mcp_tool_call" } });
    entered = true;
    await new Promise((_, reject) =>
      signal.addEventListener(
        "abort",
        () =>
          reject(
            Object.assign(Error("cancelled"), {
              code: "CANCELLED",
              outcome: "cancelled",
            }),
          ),
        { once: true },
      ),
    );
  });
  const run = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  while (!entered) await new Promise((r) => setTimeout(r, 10));
  await manager.control(run.id, "cancel-worker", {
    workerId: (await manager.get(run.id)).workers[0].id,
  });
  assert.equal((await settled(manager, run.id)).workers[0].status, "unknown");
});

test("new controller rejects a stored runtime identity mismatch before reconciliation, edits, or dispatch", async (t) => {
  const dataDir = await mkdtemp(
    path.join(os.tmpdir(), "workflow-runtime-identity-"),
  );
  let calls = 0;
  const backend = {
    async execute() {
      calls++;
      return { value: "done", usage: { outputTokens: 1 } };
    },
    async shutdown() {},
  };
  let manager = new RuntimeManager({ dataDir, backend });
  t.after(async () => {
    await manager.shutdown().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  });
  const run = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  const first = await settled(manager, run.id);
  assert.match(first.runtimeIdentity, /^[0-9a-f]{64}$/);
  await manager.shutdown();
  const durable = JSON.parse(await readFile(first.snapshotPath, "utf8"));
  durable.runtimeVersion = 1; // Same advertised version does not establish unchanged evaluator semantics.
  durable.runtimeIdentity = "0".repeat(64);
  durable.workers[0].status = "unknown";
  durable.workers[0].drainVerified = true;
  await writeFile(first.snapshotPath, JSON.stringify(durable));
  manager = new RuntimeManager({ dataDir, backend });
  await manager.get(run.id);
  const before = await readFile(first.snapshotPath, "utf8");
  const scriptBefore = await readFile(first.scriptPath, "utf8");
  await assert.rejects(
    manager.control(run.id, "resume", {
      reconcileUnknown: true,
      script: meta + 'return await agent("changed");',
    }),
    (error) => error.code === "RUNTIME_MISMATCH",
  );
  assert.equal(calls, 1);
  assert.equal(await readFile(first.snapshotPath, "utf8"), before);
  assert.equal(await readFile(first.scriptPath, "utf8"), scriptBefore);
  assert.equal((await manager.get(run.id)).workers[0].status, "unknown");
});

test("native collaboration and subagent activity cancellation preserves unknown external effects", async (t) => {
  for (const itemType of ["collabAgentToolCall", "subAgentActivity"]) {
    let entered = false;
    const { manager } = await setup(t, async (_r, { onEvent, signal }) => {
      await onEvent({
        type: "item/started",
        params: { item: { type: itemType } },
      });
      entered = true;
      await new Promise((_, reject) =>
        signal.addEventListener(
          "abort",
          () =>
            reject(
              Object.assign(Error("cancelled"), {
                code: "CANCELLED",
                outcome: "cancelled",
              }),
            ),
          { once: true },
        ),
      );
    });
    const run = await manager.start({
      script: meta + 'return await agent("a");',
      cwd: process.cwd(),
    });
    while (!entered) await new Promise((r) => setTimeout(r, 10));
    await manager.control(run.id, "cancel-worker", {
      workerId: (await manager.get(run.id)).workers[0].id,
    });
    assert.equal(
      (await settled(manager, run.id)).workers[0].status,
      "unknown",
      itemType,
    );
  }
});

test("queued resume is rejected without edits after shutdown closes the manager", async (t) => {
  let calls = 0;
  const { manager } = await setup(t, async () => ({
    value: ++calls,
    usage: { outputTokens: 1 },
  }));
  const run = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  const first = await settled(manager, run.id);
  const originalScript = await readFile(first.scriptPath, "utf8");
  const resume = manager.control(run.id, "resume", {
    script: meta + 'return await agent("changed");',
  });
  const shutdown = manager.shutdown();
  await assert.rejects(resume, (error) => error.code === "RUNTIME_CLOSED");
  await shutdown;
  assert.equal(calls, 1);
  assert.equal(await readFile(first.scriptPath, "utf8"), originalScript);
  assert.equal((await manager.get(run.id)).status, "completed");
});

test("run cannot persist terminal status until a dangling worker has drained", async (t) => {
  let entered = false,
    aborting = false,
    release;
  const { manager } = await setup(t, async (_r, { signal }) => {
    entered = true;
    return await new Promise((_, reject) =>
      signal.addEventListener(
        "abort",
        async () => {
          aborting = true;
          await new Promise((resolve) => (release = resolve));
          reject(Object.assign(Error("cancelled"), { outcome: "cancelled" }));
        },
        { once: true },
      ),
    );
  });
  t.after(() => release?.());
  const run = await manager.start({
    script:
      meta +
      'agent("dangling");for(let i=0;i<40;i++)await log("yield");return true;',
    cwd: process.cwd(),
  });
  while (!entered || !aborting)
    await new Promise((resolve) => setTimeout(resolve, 10));
  const durable = JSON.parse(await readFile(run.snapshotPath, "utf8"));
  try {
    assert.ok(
      !["completed", "failed", "stopped", "paused"].includes(durable.status),
      durable.status,
    );
    assert.equal(durable.workers[0].status, "running");
  } finally {
    release();
  }
  const final = await settled(manager, run.id);
  assert.equal(final.status, "completed");
  assert.equal(final.workers[0].status, "cancelled");
  assert.equal(final.coverage.complete, false);
});

test("terminal snapshot containing an active worker recovers unknown effects and preserves prior resolution", async (t) => {
  const dataDir = await mkdtemp(
    path.join(os.tmpdir(), "workflow-terminal-recovery-"),
  );
  let recovered = 0;
  const backend = {
    async execute() {
      return { value: "done", usage: { outputTokens: 1 } };
    },
    async shutdown() {},
    async recoverOrphan() {
      recovered++;
      return { drained: true, status: "drained" };
    },
  };
  let manager = new RuntimeManager({ dataDir, backend });
  t.after(async () => {
    await manager.shutdown().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  });
  const run = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  const first = await settled(manager, run.id);
  await manager.shutdown();
  const durable = JSON.parse(await readFile(first.snapshotPath, "utf8"));
  durable.workers[0].status = "running";
  await writeFile(first.snapshotPath, JSON.stringify(durable));
  manager = new RuntimeManager({ dataDir, backend });
  const recoveredRun = await manager.get(run.id);
  assert.equal(recovered, 1);
  assert.equal(recoveredRun.status, "stopped");
  assert.equal(recoveredRun.workers[0].status, "unknown");
  assert.equal(recoveredRun.coverage.complete, false);
  assert.equal(recoveredRun.recoveryPriorResolution.status, "completed");
  assert.equal(recoveredRun.recoveryPriorResolution.result, "done");
});

test("shutdown cancels deferred start fingerprint admission before any run or worker dispatch", async (t) => {
  let calls = 0,
    entered = false,
    release;
  const { manager } = await setup(t, async () => ({
    value: ++calls,
    usage: { outputTokens: 1 },
  }));
  manager.backend.executionFingerprint = () =>
    new Promise((resolve) => {
      entered = true;
      release = resolve;
    });
  const pending = manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  pending.catch(() => {});
  while (!entered) await new Promise((resolve) => setTimeout(resolve, 5));
  await manager.shutdown();
  const outcome = await Promise.race([
    pending.then(
      () => "accepted",
      (error) => error.code,
    ),
    new Promise((resolve) => setTimeout(() => resolve("unsettled"), 100)),
  ]);
  release("late");
  assert.equal(outcome, "RUNTIME_CLOSED");
  assert.equal(calls, 0);
  assert.deepEqual(await manager.list(), []);
});

test("shutdown cancels deferred resume fingerprint admission before source edits or fresh dispatch", async (t) => {
  let calls = 0,
    entered = false,
    release;
  const { manager } = await setup(t, async () => ({
    value: ++calls,
    usage: { outputTokens: 1 },
  }));
  const run = await manager.start({
    script: meta + 'return await agent("a");',
    cwd: process.cwd(),
  });
  const first = await settled(manager, run.id);
  const scriptBefore = await readFile(first.scriptPath, "utf8");
  manager.backend.executionFingerprint = () =>
    new Promise((resolve) => {
      entered = true;
      release = resolve;
    });
  const pending = manager.control(run.id, "resume", {
    script: meta + 'return await agent("changed");',
  });
  pending.catch(() => {});
  while (!entered) await new Promise((resolve) => setTimeout(resolve, 5));
  const closing = manager.shutdown();
  const outcome = await Promise.race([
    pending.then(
      () => "accepted",
      (error) => error.code,
    ),
    new Promise((resolve) => setTimeout(() => resolve("unsettled"), 100)),
  ]);
  release("late");
  await closing;
  assert.equal(outcome, "RUNTIME_CLOSED");
  assert.equal(calls, 1);
  assert.equal(await readFile(first.scriptPath, "utf8"), scriptBefore);
});

export { setup, settled, meta };
