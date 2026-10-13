import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export async function atomicText(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(value);
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(temporary, filename);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
export async function atomicJson(filename, value) {
  return atomicText(filename, JSON.stringify(value, null, 2));
}

export class Journal {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    this.lockPath = path.join(this.dataDir, "controller.json");
    this.owner = {
      pid: process.pid,
      nonce: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.queue = Promise.resolve();
  }
  async open() {
    await mkdir(this.dataDir, { recursive: true });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const lock = await open(this.lockPath, "wx", 0o600);
        try {
          await lock.writeFile(JSON.stringify(this.owner));
          await lock.sync();
        } finally {
          await lock.close();
        }
        this.owned = true;
        return;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        let owner;
        try {
          owner = JSON.parse(await readFile(this.lockPath, "utf8"));
        } catch {
          throw new Error(
            "Controller lock is unreadable; refusing concurrent ownership",
          );
        }
        if (!Number.isInteger(owner.pid) || owner.pid < 1)
          throw new Error("Controller lock is invalid");
        try {
          process.kill(owner.pid, 0);
          throw Object.assign(
            new Error("Another live controller owns this data directory"),
            { code: "CONTROLLER_LOCKED" },
          );
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
        // A second stale claimant must never unlink the replacement lock.
        // The recovery claim is intentionally not auto-reclaimed after a crash.
        const recoveryPath = path.join(
          this.dataDir,
          "controller-recovery.json",
        );
        let recovery;
        try {
          recovery = await open(recoveryPath, "wx", 0o600);
        } catch (error) {
          if (error.code === "EEXIST")
            throw new Error(
              "Another controller recovery claim exists; refusing ownership",
            );
          throw error;
        }
        try {
          await recovery.writeFile(JSON.stringify(this.owner));
          await recovery.sync();
          const again = JSON.parse(await readFile(this.lockPath, "utf8"));
          if (again.nonce !== owner.nonce)
            throw new Error("Controller ownership changed during recovery");
          await unlink(this.lockPath);
        } finally {
          await recovery.close();
          await unlink(recoveryPath);
        }
      }
    }
    throw new Error("Unable to acquire controller ownership");
  }
  runDir(id) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid run ID");
    return path.join(this.dataDir, "runs", id);
  }
  snapshotPath(id) {
    return path.join(this.runDir(id), "run.json");
  }
  write(run) {
    const snapshot = structuredClone(run);
    const write = this.queue.then(async () => {
      if (this.failure) throw this.failure;
      await this.assertOwnership();
      // One atomic snapshot is authoritative. The event file is a derived view.
      await atomicJson(this.snapshotPath(run.id), snapshot);
      if (snapshot.eventsPath)
        await atomicJson(snapshot.eventsPath, snapshot.events);
    });
    this.queue = write.catch((error) => {
      this.failure ??= error;
    });
    return write;
  }
  async assertOwnership() {
    if (!this.owned) throw new Error("Journal has no controller ownership");
    const owner = JSON.parse(await readFile(this.lockPath, "utf8"));
    if (owner.nonce !== this.owner.nonce || owner.pid !== this.owner.pid)
      throw new Error("Lost controller ownership; refusing journal writes");
  }
  async load() {
    const root = path.join(this.dataDir, "runs");
    await mkdir(root, { recursive: true });
    const entries = await readdir(root, { withFileTypes: true });
    const runs = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const snapshot = JSON.parse(
        await readFile(this.snapshotPath(entry.name), "utf8"),
      );
      if (!Array.isArray(snapshot.events))
        throw new Error("Authoritative journal events are invalid");
      let derived;
      try {
        derived = JSON.parse(
          await readFile(
            path.join(this.runDir(entry.name), "events.json"),
            "utf8",
          ),
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (derived !== undefined) {
        if (!Array.isArray(derived))
          throw new Error("Derived journal events are invalid");
        if (derived.length > snapshot.events.length)
          throw new Error(
            "Derived journal event evidence is ahead of the authoritative snapshot; refusing recovery",
          );
        if (
          derived.some(
            (event, index) => !isDeepStrictEqual(event, snapshot.events[index]),
          )
        )
          throw new Error(
            "Derived journal event evidence conflicts with the authoritative snapshot; refusing recovery",
          );
      }
      if (derived === undefined || derived.length < snapshot.events.length) {
        await this.assertOwnership();
        await atomicJson(
          path.join(this.runDir(entry.name), "events.json"),
          snapshot.events,
        );
      }
      runs.push(snapshot);
    }
    return runs;
  }
  async close() {
    await this.queue;
    if (!this.owned) return;
    const owner = JSON.parse(await readFile(this.lockPath, "utf8"));
    if (owner.nonce !== this.owner.nonce)
      throw new Error("Lost controller ownership");
    await unlink(this.lockPath);
    this.owned = false;
  }
}
