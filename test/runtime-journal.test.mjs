/** @lane merge
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { fork } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { Journal } from "../src/runtime/journal.mjs";

test("real concurrent controller processes cannot both claim stale ownership", async (t) => {
  const dataDir = await mkdtemp(
    path.join(os.tmpdir(), "workflow-journal-race-"),
  );
  const children = Array.from({ length: 2 }, () =>
    fork(
      fileURLToPath(
        new URL("./fixtures/runtime-journal-controller.mjs", import.meta.url),
      ),
      [],
      { stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true },
    ),
  );
  t.after(async () => {
    for (const child of children) child.kill();
    await Promise.all(
      children.map((child) =>
        child.exitCode === null && child.signalCode === null
          ? once(child, "exit")
          : undefined,
      ),
    );
    await rm(dataDir, { recursive: true, force: true });
  });
  const call = (child, message) => {
    const reply = once(child, "message");
    child.send(message);
    return reply.then(([value]) => value);
  };
  for (let round = 0; round < 30; round++) {
    const directory = path.join(dataDir, String(round));
    await mkdir(directory);
    await writeFile(
      path.join(directory, "controller.json"),
      JSON.stringify({ pid: 2147483647, nonce: "stale", createdAt: "x" }),
    );
    const results = await Promise.all(
      children.map((child) =>
        call(child, { type: "open", dataDir: directory }),
      ),
    );
    assert.equal(
      results.filter((result) => result.type === "opened").length,
      1,
      `Exactly one controller must own stale round ${round}`,
    );
    await Promise.all(children.map((child) => call(child, { type: "close" })));
  }
});

test("journal refuses writes after controller ownership changes", async (t) => {
  const dataDir = await mkdtemp(
    path.join(os.tmpdir(), "workflow-journal-owner-"),
  );
  const journal = new Journal(dataDir);
  await journal.open();
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  await writeFile(
    journal.lockPath,
    JSON.stringify({ pid: process.pid, nonce: "different" }),
  );
  await assert.rejects(journal.write({ id: "one", events: [] }), /ownership/i);
  await assert.rejects(journal.write({ id: "two", events: [] }), /ownership/i);
});

test("authoritative snapshot commits before derived event artifact failure", async (t) => {
  const dataDir = await mkdtemp(
    path.join(os.tmpdir(), "workflow-journal-atomic-"),
  );
  const journal = new Journal(dataDir);
  await journal.open();
  t.after(async () => {
    await journal.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const event = {
    sequence: 1,
    type: "worker-event",
    workerId: "worker",
    event: { type: "item/started", params: { item: { type: "mcpToolCall" } } },
  };
  const eventsPath = path.join(dataDir, "events-blocked");
  await mkdir(eventsPath);
  await assert.rejects(
    journal.write({
      id: "run",
      status: "running",
      workers: [],
      eventsPath,
      events: [event],
    }),
  );
  const snapshot = JSON.parse(
    await readFile(journal.snapshotPath("run"), "utf8"),
  );
  assert.deepEqual(snapshot.events, [event]);
});

test("ahead or conflicting derived event evidence refuses recovery and remains on disk", async (t) => {
  const dataDir = await mkdtemp(
    path.join(os.tmpdir(), "workflow-journal-ahead-"),
  );
  const journal = new Journal(dataDir);
  await journal.open();
  t.after(async () => {
    await journal.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const eventsPath = path.join(journal.runDir("run"), "events.json");
  const event = { sequence: 1, type: "run-started" };
  await journal.write({
    id: "run",
    status: "running",
    workers: [],
    eventsPath,
    events: [event],
  });
  const ahead = [
    event,
    {
      sequence: 2,
      type: "worker-event",
      workerId: "worker",
      event: {
        type: "item/started",
        params: { item: { type: "mcpToolCall" } },
      },
    },
  ];
  await writeFile(eventsPath, JSON.stringify(ahead));
  const before = await readFile(eventsPath, "utf8");
  await assert.rejects(journal.load(), /event.*ahead|ahead.*event/i);
  assert.equal(await readFile(eventsPath, "utf8"), before);
  await writeFile(
    eventsPath,
    JSON.stringify([{ sequence: 1, type: "different" }]),
  );
  await assert.rejects(journal.load(), /event.*conflict|conflict.*event/i);
});

test("missing or stale matching event artifacts rebuild from the authoritative snapshot", async (t) => {
  const dataDir = await mkdtemp(
    path.join(os.tmpdir(), "workflow-journal-derived-"),
  );
  const journal = new Journal(dataDir);
  await journal.open();
  t.after(async () => {
    await journal.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const eventsPath = path.join(journal.runDir("run"), "events.json");
  const events = [
    { sequence: 1, type: "run-started" },
    {
      sequence: 2,
      type: "worker-event",
      workerId: "worker",
      event: {
        type: "item/started",
        params: { item: { type: "mcpToolCall" } },
      },
    },
  ];
  await journal.write({
    id: "run",
    status: "running",
    workers: [],
    eventsPath,
    events,
  });
  await writeFile(eventsPath, JSON.stringify(events.slice(0, 1)));
  assert.deepEqual((await journal.load())[0].events, events);
  assert.deepEqual(JSON.parse(await readFile(eventsPath, "utf8")), events);
  await rm(eventsPath);
  await journal.load();
  assert.deepEqual(JSON.parse(await readFile(eventsPath, "utf8")), events);
});
