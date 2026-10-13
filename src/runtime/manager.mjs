import { randomUUID, createHash } from "node:crypto";
import { readFile, access, lstat, realpath, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { Journal, atomicJson, atomicText } from "./journal.mjs";
import { evaluate } from "./evaluator.mjs";
import {
  parseScript,
  validateSchema,
  assertText,
  SCRIPT_LIMIT,
} from "./script.mjs";

const DEFAULT_PERMISSIONS = Object.freeze({
  sandbox: "read-only",
  networkAccess: false,
  approvalPolicy: "never",
});
const terminal = new Set(["completed", "failed", "stopped", "paused"]);
const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();
const require = createRequire(import.meta.url);

async function installedVersion(name) {
  let directory = path.dirname(require.resolve(name));
  while (true) {
    try {
      const metadata = JSON.parse(
        await readFile(path.join(directory, "package.json"), "utf8"),
      );
      if (metadata.name === name && typeof metadata.version === "string")
        return metadata.version;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(directory);
    if (parent === directory)
      throw new Error(
        `Installed runtime dependency version is unavailable: ${name}`,
      );
    directory = parent;
  }
}

async function runtimeIdentity() {
  const implementation = await readdir(new URL("./", import.meta.url));
  const filenames = implementation
    .filter((name) => name.endsWith(".mjs"))
    .sort();
  const hashes = await Promise.all(
    filenames.map(async (name) => [
      name,
      createHash("sha256")
        .update(await readFile(new URL(name, import.meta.url)))
        .digest("hex"),
    ]),
  );
  const dependencies = Object.fromEntries(
    await Promise.all(
      ["quickjs-emscripten", "quickjs-emscripten-core", "acorn", "ajv"].map(
        async (name) => [name, await installedVersion(name)],
      ),
    ),
  );
  return createHash("sha256")
    .update(JSON.stringify({ dependencies, implementation: hashes }))
    .digest("hex");
}
function failure(message, code = "WORKFLOW_ERROR", outcome = "failed") {
  return Object.assign(new Error(message), { code, outcome });
}
function errorJson(error) {
  return {
    message: String(error.message ?? error),
    code: error.code ?? "WORKFLOW_ERROR",
    outcome: error.outcome ?? "failed",
  };
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, stable(value[k])]),
    );
  return value;
}
function usage(value = {}) {
  const result = { inputTokens: 0, outputTokens: 0 };
  const aliases = {
    input_tokens: "inputTokens",
    output_tokens: "outputTokens",
    cached_input_tokens: "cachedInputTokens",
    reasoning_output_tokens: "reasoningOutputTokens",
    total_tokens: "totalTokens",
  };
  for (const [key, number] of Object.entries(value ?? {}))
    if (typeof number === "number" && Number.isFinite(number))
      result[aliases[key] ?? key] = Math.max(0, number);
  if (value?.observed !== undefined) result.observed = Boolean(value.observed);
  return result;
}
function integer(value, fallback, min, max, label) {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`${label} must be an integer from ${min} to ${max}`);
  return n;
}
function writer(permissions) {
  return permissions.sandbox !== "read-only";
}
function potentialEffects(event) {
  if (!["item/started", "item.started", "tool-started"].includes(event?.type))
    return false;
  const kind = event.params?.item?.type ?? event.item?.type ?? event.toolType;
  return [
    "commandExecution",
    "fileChange",
    "mcpToolCall",
    "dynamicToolCall",
    "collabToolCall",
    "collabAgentToolCall",
    "subAgentActivity",
    "command_execution",
    "file_change",
    "mcp_tool_call",
    "dynamic_tool_call",
    "collab_tool_call",
    "collab_agent_tool_call",
    "sub_agent_activity",
  ].includes(kind);
}
function reducePermissions(base, requested) {
  if (requested === undefined) return clone(base);
  if (!requested || typeof requested !== "object" || Array.isArray(requested))
    throw failure("Agent permissions must be an object", "INVALID_OPTIONS");
  if (
    Object.keys(requested).some(
      (key) => !["sandbox", "networkAccess", "approvalPolicy"].includes(key),
    )
  )
    throw failure("Unknown agent permission", "INVALID_OPTIONS");
  const result = { ...base, ...requested };
  if (
    !["read-only", "workspace-write"].includes(result.sandbox) ||
    typeof result.networkAccess !== "boolean" ||
    !["never", "on-request"].includes(result.approvalPolicy)
  )
    throw failure("Unsupported agent permissions", "INVALID_OPTIONS");
  if (
    (base.sandbox === "read-only" && result.sandbox !== "read-only") ||
    (!base.networkAccess && result.networkAccess) ||
    (base.approvalPolicy === "never" && result.approvalPolicy !== "never")
  )
    throw failure(
      "Agent permissions cannot raise run authorization",
      "PERMISSION_ESCALATION",
    );
  return result;
}

export class RuntimeManager {
  constructor({ dataDir, backend, workflowsDir, resolveWorkflow }) {
    if (!dataDir || !backend?.execute)
      throw new Error("RuntimeManager requires dataDir and backend");
    this.backend = backend;
    this.workflowsDir = workflowsDir;
    this.resolveWorkflow = resolveWorkflow;
    this.journal = new Journal(dataDir);
    this.runs = new Map();
    this.executions = new Map();
    this.commands = new Map();
    this.admissions = new Set();
    this.lifecycle = new AbortController();
    this.closed = false;
    this.ready = this.initialize().catch(async (error) => {
      await this.journal.close().catch(() => {});
      throw error;
    });
    this.ready.catch(() => {});
  }
  async initialize() {
    this.runtimeIdentity = await runtimeIdentity();
    await this.journal.open();
    for (const run of await this.journal.load()) {
      if (!run.id || !Array.isArray(run.workers) || !Array.isArray(run.events))
        throw new Error("Invalid durable run journal");
      const activeWorkers = run.workers.filter((worker) =>
        ["running", "waiting-approval", "queued", "waiting-quota"].includes(
          worker.status,
        ),
      );
      if (!terminal.has(run.status) || activeWorkers.length) {
        const priorStatus = run.status;
        if (terminal.has(priorStatus))
          run.recoveryPriorResolution = {
            status: priorStatus,
            result: clone(run.result),
            error: clone(run.error),
            updatedAt: run.updatedAt,
          };
        for (const worker of run.workers)
          if (
            ["running", "waiting-approval", "queued", "waiting-quota"].includes(
              worker.status,
            )
          ) {
            const dispatched = !["queued", "waiting-quota"].includes(
              worker.status,
            );
            worker.potentialEffects = Boolean(
              worker.potentialEffects ||
                run.events.some(
                  (entry) =>
                    entry.workerId === worker.id &&
                    potentialEffects(entry.event),
                ),
            );
            worker.drainVerified = !dispatched;
            if (dispatched && this.backend.recoverOrphan) {
              try {
                const recovered = await this.backend.recoverOrphan({
                  pid: worker.pid,
                  processIdentity: worker.processIdentity,
                });
                worker.drainVerified = recovered?.drained === true;
                worker.recovery = clone(recovered);
              } catch (error) {
                worker.drainVerified = false;
                worker.recoveryError = errorJson(error);
              }
            }
            // Process drain cannot establish absence of external tool effects.
            worker.status = dispatched ? "unknown" : "cancelled";
            worker.error = {
              message: dispatched
                ? "Controller ended before completion; prior worker effects require review"
                : "Controller ended before dispatch",
              code: "ABANDONED_WORKER",
              outcome:
                worker.status === "unknown"
                  ? "unknown"
                  : dispatched
                    ? "cancelled"
                    : "not-started",
            };
            worker.updatedAt = now();
          }
        for (const approval of run.approvals)
          if (approval.status === "pending") approval.status = "abandoned";
        run.status = "stopped";
        run.error = {
          message:
            "Controller ended; recorded workers require review before replay",
          code: "ABANDONED_RUN",
          outcome: run.workers.some((w) => w.status === "unknown")
            ? "unknown"
            : "cancelled",
        };
        run.updatedAt = now();
        await this.persist(run, "run-recovered", {
          priorStatus,
          workerIds: activeWorkers.map((worker) => worker.id),
        });
      }
      this.runs.set(run.id, run);
    }
  }
  async source(input) {
    if (input.scriptPath) {
      assertText(input.scriptPath, "scriptPath");
      const filename = path.resolve(
        input.cwd ?? process.cwd(),
        input.scriptPath,
      );
      if ((await lstat(filename)).isSymbolicLink())
        throw new Error("Workflow script symlinks are refused");
      const buffer = await readFile(filename);
      if (buffer.length > SCRIPT_LIMIT)
        throw new Error("Disk script exceeds byte limit");
      return {
        script: buffer.toString("utf8"),
        scriptPath: await realpath(filename),
      };
    }
    if (input.script !== undefined) return { script: input.script };
    if (input.name) return this.resolve(input.name, input.cwd);
    throw new Error("Start requires script, scriptPath, or name");
  }
  async resolve(name, cwd) {
    assertText(name, "workflow name");
    if (this.resolveWorkflow)
      return this.resolveWorkflow(name, {
        cwd,
        workflowsDir: this.workflowsDir,
      });
    if (!this.workflowsDir || !/^[a-zA-Z0-9_-]+$/.test(name))
      throw new Error("Saved workflow resolver is unavailable");
    return this.source({
      cwd,
      scriptPath: path.join(this.workflowsDir, `${name}.mjs`),
    });
  }
  assertOpen() {
    if (this.closed)
      throw failure("Runtime is closed", "RUNTIME_CLOSED", "not-started");
  }
  waitWithSignal(operation, signal = this.lifecycle.signal) {
    return new Promise((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener("abort", abort);
        reject(
          signal.reason?.code
            ? signal.reason
            : failure(
                "Operation cancelled before admission",
                "CANCELLED",
                "not-started",
              ),
        );
      };
      signal.addEventListener("abort", abort, { once: true });
      Promise.resolve(operation)
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abort));
      if (signal.aborted) abort();
    });
  }
  trackAdmission(operation) {
    const admission = { run: null, promise: null };
    const promise = operation(admission).catch(async (error) => {
      if (
        this.closed &&
        admission.run &&
        !this.executions.has(admission.run.id)
      ) {
        admission.run.status = "stopped";
        admission.run.error = errorJson(error);
        await this.persist(admission.run, "run-admission-cancelled", {
          error: admission.run.error,
        });
      }
      throw error;
    });
    admission.promise = promise;
    this.admissions.add(admission);
    promise.finally(() => this.admissions.delete(admission)).catch(() => {});
    return promise;
  }
  start(input = {}) {
    return this.trackAdmission((admission) => this.startRun(input, admission));
  }
  async startRun(input = {}, admission) {
    await this.ready;
    this.assertOpen();
    if (input.resumeFromRunId)
      return this.control(input.resumeFromRunId, "resume", input);
    const cwd = path.resolve(assertText(input.cwd, "cwd"));
    const source = await this.waitWithSignal(this.source({ ...input, cwd }));
    this.assertOpen();
    const parsed = parseScript(source.script);
    const concurrency = integer(
      input.concurrency,
      Math.min(16, Math.max(2, os.availableParallelism() - 2)),
      1,
      256,
      "concurrency",
    );
    const maxAgents = integer(input.maxAgents, 1000, 1, 1000, "maxAgents");
    const stallRestarts = integer(
      input.stallRestarts,
      5,
      0,
      5,
      "stallRestarts",
    );
    const quotaWaitMs = integer(
      input.quotaWaitMs,
      0,
      0,
      3600000,
      "quotaWaitMs",
    );
    const timeoutMs = integer(
      input.timeoutMs,
      30 * 60 * 1000,
      1,
      24 * 60 * 60 * 1000,
      "timeoutMs",
    );
    if (
      input.budget !== undefined &&
      input.budget !== null &&
      (!Number.isFinite(input.budget) || input.budget < 0)
    )
      throw new Error("budget must be a nonnegative finite token target");
    const permissions = { ...DEFAULT_PERMISSIONS, ...input.permissions };
    if (
      !["read-only", "workspace-write"].includes(permissions.sandbox) ||
      typeof permissions.networkAccess !== "boolean" ||
      !["never", "on-request"].includes(permissions.approvalPolicy)
    )
      throw new Error("Unsupported run permissions");
    const id = randomUUID();
    const run = {
      id,
      status: "running",
      meta: parsed.meta,
      cwd,
      permissions,
      concurrency,
      maxAgents,
      stallRestarts,
      quotaWaitMs,
      budget: input.budget ?? null,
      timeoutMs,
      args: input.args ?? null,
      argsProvided: input.args !== undefined,
      workers: [],
      usage: { inputTokens: 0, outputTokens: 0, attempts: 0 },
      result: null,
      error: null,
      approvals: [],
      createdAt: now(),
      updatedAt: now(),
      script: parsed.script,
      scriptPath: path.join(this.journal.runDir(id), "workflow.mjs"),
      sourcePath: source.scriptPath ?? null,
      snapshotPath: this.journal.snapshotPath(id),
      artifactsPath: path.join(this.journal.runDir(id), "artifacts"),
      replay: [],
      generation: 0,
      events: [],
    };
    run.resultPath = path.join(this.journal.runDir(id), "result-g0.json");
    run.eventsPath = path.join(this.journal.runDir(id), "events.json");
    run.paths = {
      snapshot: run.snapshotPath,
      script: run.scriptPath,
      result: run.resultPath,
      events: run.eventsPath,
      artifacts: run.artifactsPath,
    };
    run.executionFingerprint =
      (await this.waitWithSignal(
        this.backend.executionFingerprint?.({ cwd, permissions }),
      )) ?? null;
    run.runtimeIdentity = this.runtimeIdentity;
    this.assertOpen();
    admission.run = run;
    this.runs.set(id, run);
    await this.persist(run, "run-started", { meta: run.meta });
    this.assertOpen();
    await atomicText(run.scriptPath, run.script);
    this.assertOpen();
    await atomicJson(path.join(this.journal.runDir(id), "script-g0.json"), {
      script: run.script,
      sourcePath: run.sourcePath,
    });
    run.scriptArtifactPath = path.join(
      this.journal.runDir(id),
      "script-g0.json",
    );
    await this.journal.write(run);
    this.assertOpen();
    this.launch(run, parsed.body);
    return clone(run);
  }
  async get(id) {
    await this.ready;
    await this.journal.queue;
    if (this.journal.failure) throw this.journal.failure;
    const run = this.runs.get(id);
    if (!run) throw failure("Unknown run", "RUN_NOT_FOUND");
    if (terminal.has(run.status)) await this.executions.get(id)?.promise;
    return clone(run);
  }
  async list() {
    await this.ready;
    await this.journal.queue;
    if (this.journal.failure) throw this.journal.failure;
    await Promise.allSettled(
      [...this.executions.values()]
        .filter((s) => terminal.has(s.run.status))
        .map((s) => s.promise),
    );
    return [...this.runs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }
  async events(id, since = 0) {
    const run = await this.get(id);
    return run.events.filter((event) => event.sequence > since);
  }
  async persist(run, type, data = {}) {
    run.updatedAt = now();
    if (type)
      run.events.push({
        sequence: run.events.length + 1,
        type,
        at: run.updatedAt,
        generation: run.generation,
        ...clone(data),
      });
    const replay = this.executions.get(run.id)?.nextReplay ?? run.replay;
    const slots = replay
      .map((entry) => run.workers.find((w) => w.id === entry?.workerId))
      .filter(Boolean);
    const unknown = run.workers.filter((w) => w.status === "unknown");
    run.coverage = {
      requested: replay.length,
      completed: slots.filter((w) => w.status === "completed").length,
      failed: slots.filter((w) => ["failed", "cancelled"].includes(w.status))
        .length,
      cached: run.events.filter(
        (e) => e.type === "worker-cached" && e.generation === run.generation,
      ).length,
      unverified: unknown.length,
      pending: slots.filter((w) =>
        ["queued", "running", "waiting-approval", "waiting-quota"].includes(
          w.status,
        ),
      ).length,
    };
    run.coverage.complete =
      run.status === "completed" &&
      run.coverage.failed === 0 &&
      run.coverage.unverified === 0 &&
      run.coverage.pending === 0;
    run.usageCoverage = {
      observed: run.workers.filter(
        (w) => w.attempt > 0 && w.usageObserved !== false,
      ).length,
      missing: run.workers.filter(
        (w) => w.attempt > 0 && w.usageObserved === false,
      ).length,
    };
    await this.journal.write(run);
  }
  launch(run, body) {
    this.assertOpen();
    const state = {
      run,
      controller: new AbortController(),
      active: new Map(),
      queue: [],
      admission: Promise.resolve(),
      cursor: 0,
      previousKey: "",
      prior: clone(run.replay),
      nextReplay: [],
      prefix: true,
      halt: null,
      draining: false,
      phase: null,
      approvalWaiters: new Map(),
      evaluators: new Set(),
    };
    this.executions.set(run.id, state);
    state.promise = this.finishExecution(state, body).finally(() => {
      if (this.executions.get(run.id) === state) this.executions.delete(run.id);
    });
    state.promise.catch(() => {});
  }
  cancelQueued(state) {
    for (const task of state.queue.splice(0)) {
      task.worker.status = "cancelled";
      task.worker.error = errorJson(
        failure("Run drained before dispatch", "NOT_DISPATCHED", "not-started"),
      );
      task.reject(
        failure("Run stopped before dispatch", "RUN_STOPPED", "not-started"),
      );
    }
    for (const [approvalId, resolve] of state.approvalWaiters) {
      const approval = state.run.approvals.find(
        (item) => item.id === approvalId,
      );
      if (approval?.status === "pending") {
        approval.status = "decided";
        approval.decision = "cancel";
      }
      resolve("cancel");
    }
  }
  async finishExecution(state, body) {
    const { run } = state;
    let result, error;
    try {
      result = await this.runEvaluator(
        state,
        body,
        run.argsProvided ? run.args : undefined,
        0,
      );
    } catch (caught) {
      error = caught;
    }
    state.draining = true;
    state.controller.abort();
    run.status =
      state.halt === "pause"
        ? "pausing"
        : state.halt === "stop"
          ? "stopping"
          : "draining";
    this.cancelQueued(state);
    for (const slot of state.active.values()) slot.controller.abort();
    await this.persist(run, "run-draining", {
      reason: state.halt ?? (error ? "failed" : "finished"),
    });
    await Promise.allSettled(
      [...state.active.values()].map((slot) => slot.promise),
    );
    await state.admission;
    run.replay = state.nextReplay;
    if (state.halt) {
      run.status = state.halt === "pause" ? "paused" : "stopped";
      await this.persist(run, `run-${run.status}`);
    } else if (error) {
      run.status = "failed";
      run.error = errorJson(error);
      await this.persist(run, "run-failed", { error: run.error });
    } else {
      await atomicJson(run.resultPath, {
        value: result,
        generation: run.generation,
      });
      run.result = result;
      run.status = "completed";
      run.error = null;
      await this.persist(run, "run-completed", { result });
    }
  }
  async runEvaluator(state, body, args, depth, meta = state.run.meta) {
    return evaluate(
      {
        body: `const meta=${JSON.stringify(meta)};\n${body}`,
        args,
        budget: state.run.budget,
        spent: state.run.usage.outputTokens,
        signal: state.controller.signal,
        wallMs: state.run.timeoutMs,
        onSpawn: (pid) => {
          state.evaluators.add(pid);
        },
      },
      async (request) => {
        try {
          return await this.broker(state, request, depth, meta);
        } catch (error) {
          error.spent = state.run.usage.outputTokens;
          throw error;
        }
      },
    );
  }
  async broker(state, request, depth, meta) {
    const run = state.run;
    if (this.closed || state.halt || state.draining)
      throw failure("Run is draining", "RUN_STOPPED", "cancelled");
    if (request.type === "agent")
      return {
        value: await this.agent(state, request, meta),
        spent: run.usage.outputTokens,
      };
    if (request.type === "log") {
      assertText(request.message, "log");
      await this.persist(run, "log", { message: request.message });
      return { value: null, spent: run.usage.outputTokens };
    }
    if (request.type === "phase") {
      assertText(request.title, "phase");
      if (
        meta.phases?.length &&
        !meta.phases.some((p) => p.title === request.title)
      )
        throw failure(
          "Phase title does not match advertised meta phase",
          "UNKNOWN_PHASE",
        );
      state.phase = request.title;
      await this.persist(run, "phase", { title: request.title });
      return { value: null, spent: run.usage.outputTokens };
    }
    if (request.type === "workflow") {
      if (depth >= 1)
        throw failure(
          "Workflow nesting is limited to one child level",
          "NESTING_LIMIT",
        );
      const source = await this.resolve(request.name, run.cwd);
      const parsed = parseScript(source.script);
      await this.persist(run, "workflow-started", {
        name: request.name,
        meta: parsed.meta,
      });
      const result = await this.runEvaluator(
        state,
        parsed.body,
        request.args,
        depth + 1,
        parsed.meta,
      );
      await this.persist(run, "workflow-completed", { name: request.name });
      return { value: result, spent: run.usage.outputTokens };
    }
    throw failure("Unknown broker request", "INVALID_BROKER");
  }
  async agent(state, { prompt, options = {} }, meta = state.run.meta) {
    const admitted = state.admission.then(() =>
      this.admitAgent(state, { prompt, options }, meta),
    );
    state.admission = admitted.then(
      () => undefined,
      () => undefined,
    );
    const result = await admitted;
    return result.completion;
  }
  async admitAgent(state, { prompt, options = {} }, meta = state.run.meta) {
    const run = state.run;
    if (this.closed || state.halt || state.draining)
      throw failure(
        "Run stopped before invocation admission",
        "RUN_STOPPED",
        "not-started",
      );
    const stableOptions = Object.fromEntries(
      Object.entries(options ?? {}).filter(
        ([key]) => !["label", "phase", "stallMs", "timeoutMs"].includes(key),
      ),
    );
    const key = createHash("sha256")
      .update(
        JSON.stringify([state.previousKey, prompt, stable(stableOptions)]),
      )
      .digest("hex");
    state.previousKey = key;
    const ordinal = state.cursor++;
    const prior = state.prior[ordinal];
    const createWorker = () => ({
      id: randomUUID(),
      ordinal,
      key,
      generation: run.generation,
      prompt,
      options: clone(options),
      label: options?.label ?? null,
      phase: options?.phase ?? state.phase,
      status: "queued",
      attempt: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      usageObserved: false,
      result: null,
      error: null,
      createdAt: now(),
      updatedAt: now(),
    });
    let validate, permissions;
    try {
      assertText(prompt, "agent prompt");
      if (!options || typeof options !== "object" || Array.isArray(options))
        throw failure("Agent options must be an object", "INVALID_OPTIONS");
      const allowed = new Set([
        "label",
        "phase",
        "schema",
        "model",
        "effort",
        "isolation",
        "agentType",
        "stallMs",
        "timeoutMs",
        "disallowedTools",
        "bashCommandClamp",
        "permissions",
      ]);
      for (const name of Object.keys(options))
        if (!allowed.has(name))
          throw failure(`Unknown agent option ${name}`, "INVALID_OPTIONS");
      if (options.schema !== undefined)
        try {
          validate = validateSchema(options.schema);
        } catch (error) {
          throw failure(error.message, "SCHEMA_INVALID");
        }
      permissions = reducePermissions(run.permissions, options.permissions);
      if (
        options.phase &&
        meta.phases?.length &&
        !meta.phases.some((p) => p.title === options.phase)
      )
        throw failure("Agent phase does not match meta", "UNKNOWN_PHASE");
    } catch (error) {
      state.prefix = false;
      const worker = createWorker();
      worker.status = "failed";
      worker.error = errorJson(error);
      run.workers.push(worker);
      state.nextReplay[ordinal] = { key, workerId: worker.id };
      await this.persist(run, "worker-rejected", {
        workerId: worker.id,
        ordinal,
        error: worker.error,
      });
      throw error;
    }
    const fingerprint =
      (await this.waitWithSignal(
        this.backend.executionFingerprint?.({
          cwd: run.cwd,
          permissions: run.permissions,
        }),
        state.controller.signal,
      )) ?? null;
    if (fingerprint !== run.executionFingerprint)
      throw failure(
        "Backend configuration changed during execution; start a fresh run",
        "FINGERPRINT_CHANGED",
      );
    if (state.prefix && prior?.key === key) {
      const worker = run.workers.find((w) => w.id === prior.workerId);
      if (worker?.status === "completed") {
        try {
          const result = JSON.parse(await readFile(worker.resultPath, "utf8"));
          if (options.schema && !validate(result.value))
            throw Error("Cached schema mismatch");
          for (const artifact of worker.artifactPaths ?? [])
            await access(artifact);
          state.nextReplay[ordinal] = { key, workerId: worker.id };
          await this.persist(run, "worker-cached", {
            workerId: worker.id,
            ordinal,
            key,
          });
          return { completion: Promise.resolve(result.value) };
        } catch {
          state.prefix = false;
        }
      } else state.prefix = false;
    } else state.prefix = false;
    if (run.workers.some((w) => w.ordinal >= ordinal && w.status === "unknown"))
      throw failure(
        "Uncertain worker effects require review; refusing blind replay",
        "UNCERTAIN_EFFECTS",
        "unknown",
      );
    if (this.closed || state.halt || state.draining)
      throw failure(
        "Run stopped before dispatch admission",
        "RUN_STOPPED",
        "not-started",
      );
    const worker = createWorker();
    worker.permissions = permissions;
    run.workers.push(worker);
    state.nextReplay[ordinal] = { key, workerId: worker.id };
    await this.persist(run, "worker-queued", {
      workerId: worker.id,
      ordinal,
      key,
    });
    if (this.closed || state.halt || state.draining) {
      worker.status = "cancelled";
      worker.error = errorJson(
        failure("Run drained before dispatch", "NOT_DISPATCHED", "not-started"),
      );
      await this.persist(run, "worker-cancelled", {
        workerId: worker.id,
        error: worker.error,
      });
      throw failure(
        "Run stopped before dispatch",
        "RUN_STOPPED",
        "not-started",
      );
    }
    const completion = new Promise((resolve, reject) => {
      state.queue.push({ worker, validate, resolve, reject });
      this.schedule(state);
    });
    completion.catch(() => {});
    return { completion };
  }
  schedule(state) {
    if (this.closed || state.halt || state.draining) return;
    while (state.active.size < state.run.concurrency && state.queue.length) {
      const task = state.queue.shift();
      const slot = {
        ...task,
        controller: new AbortController(),
        restart: false,
      };
      state.active.set(task.worker.id, slot);
      slot.promise = this.attempts(state, slot)
        .then(task.resolve, task.reject)
        .finally(() => {
          state.active.delete(task.worker.id);
          this.schedule(state);
          if (state.halt && !state.active.size) state.controller.abort();
        });
    }
  }
  async observe(run, worker, value) {
    if (!value) return;
    const next = usage(value);
    worker.attemptUsage ??= {};
    for (const [key, number] of Object.entries(next)) {
      if (key === "observed") {
        worker.usageObserved = number;
        continue;
      }
      const delta = Math.max(0, number - (worker.attemptUsage[key] ?? 0));
      worker.attemptUsage[key] = (worker.attemptUsage[key] ?? 0) + delta;
      worker.usage[key] = (worker.usage[key] ?? 0) + delta;
      run.usage[key] = (run.usage[key] ?? 0) + delta;
    }
  }
  async attempts(state, slot) {
    while (true) {
      try {
        return await this.execute(state, slot);
      } catch (error) {
        if (
          this.closed ||
          state.halt ||
          state.draining ||
          error.outcome === "unknown" ||
          !slot.worker.drainVerified ||
          writer(slot.worker.permissions ?? state.run.permissions)
        )
          throw error;
        const stalled =
          error.code === "STALLED" &&
          slot.worker.attempt <= (state.run.stallRestarts ?? 5);
        const resetAt =
          typeof error.resetAt === "number"
            ? error.resetAt
            : typeof error.resetAt === "string"
              ? Date.parse(error.resetAt)
              : NaN;
        const waitMs = Math.max(0, resetAt - Date.now());
        const quota =
          error.code === "QUOTA" &&
          error.outcome === "not-started" &&
          Number.isFinite(resetAt) &&
          (state.run.quotaWaitMs ?? 0) > 0 &&
          waitMs <= state.run.quotaWaitMs &&
          (slot.worker.quotaWaits ?? 0) < 1;
        if (!slot.restart && !stalled && !quota) throw error;
        if (quota) {
          slot.worker.quotaWaits = (slot.worker.quotaWaits ?? 0) + 1;
          slot.worker.status = "waiting-quota";
          await this.persist(state.run, "worker-quota-wait", {
            workerId: slot.worker.id,
            resetAt,
            waitMs,
          });
          try {
            await delay(waitMs, undefined, { signal: slot.controller.signal });
          } catch {
            throw failure("Quota wait cancelled", "CANCELLED", "cancelled");
          }
        }
        slot.restart = false;
        slot.controller = new AbortController();
        slot.worker.error = null;
        slot.worker.status = "queued";
        slot.worker.attemptUsage = {};
        slot.events = Promise.resolve();
        await this.persist(state.run, "worker-restarting", {
          workerId: slot.worker.id,
          attempt: slot.worker.attempt + 1,
        });
      }
    }
  }
  async execute(state, slot) {
    const { run } = state;
    const { worker, validate } = slot;
    if (run.usage.attempts >= run.maxAgents) {
      worker.status = "failed";
      worker.error = errorJson(
        failure("Shared agent cap exhausted", "AGENT_LIMIT"),
      );
      await this.persist(run, "worker-failed", {
        workerId: worker.id,
        error: worker.error,
      });
      throw failure(worker.error.message, worker.error.code);
    }
    if (run.budget !== null && run.usage.outputTokens >= run.budget) {
      worker.status = "failed";
      worker.error = errorJson(
        failure(
          "Observed output-token scheduling budget exhausted",
          "BUDGET_EXHAUSTED",
        ),
      );
      await this.persist(run, "worker-failed", {
        workerId: worker.id,
        error: worker.error,
      });
      throw failure(worker.error.message, worker.error.code);
    }
    worker.attempt++;
    run.usage.attempts++;
    worker.attemptUsage = {};
    worker.attempts ??= [];
    worker.status = "running";
    await this.persist(run, "worker-started", {
      workerId: worker.id,
      attempt: worker.attempt,
    });
    const request = {
      id: worker.id,
      runId: run.id,
      prompt: worker.prompt,
      cwd: run.cwd,
      timeoutMs: worker.options.timeoutMs ?? run.timeoutMs,
      ...worker.options,
      permissions: clone(worker.permissions ?? run.permissions),
    };
    try {
      if (
        this.closed ||
        state.halt ||
        state.draining ||
        slot.controller.signal.aborted
      )
        throw failure(
          "Run stopped before backend dispatch",
          "NOT_DISPATCHED",
          "not-started",
        );
      const response = await this.backend.execute(request, {
        signal: slot.controller.signal,
        onEvent: (event) => {
          const apply = async () => {
            if (event.usage) await this.observe(run, worker, event.usage);
            if (potentialEffects(event)) worker.potentialEffects = true;
            for (const key of ["pid", "processIdentity", "threadId", "turnId"])
              if (event[key] !== undefined) worker[key] = event[key];
            await this.persist(run, "worker-event", {
              workerId: worker.id,
              event,
            });
          };
          slot.events = (slot.events ?? Promise.resolve()).then(apply);
          slot.events.catch(() => {});
          return slot.events;
        },
        onApproval: (approval) => this.waitApproval(state, worker, approval),
      });
      await slot.events;
      await this.observe(run, worker, response.usage);
      worker.threadId = response.threadId ?? worker.threadId;
      worker.turnId = response.turnId ?? worker.turnId;
      if (validate && !validate(response.value))
        throw failure(
          `Worker result failed schema validation: ${JSON.stringify(validate.errors)}`,
          "SCHEMA_VALIDATION",
        );
      if (response.value === undefined)
        throw failure("Worker returned no JSON value", "MISSING_RESULT");
      const result = JSON.parse(JSON.stringify(response.value));
      worker.result = result;
      worker.artifacts = response.artifacts ?? null;
      worker.artifactPaths = this.artifactPaths(response.artifacts);
      worker.resultPath = path.join(run.artifactsPath, `${worker.id}.json`);
      await atomicJson(worker.resultPath, {
        value: result,
        usage: worker.usage,
        artifacts: worker.artifacts,
      });
      worker.status = "completed";
      worker.drainVerified = true;
      worker.error = null;
      worker.updatedAt = now();
      worker.attempts.push({
        attempt: worker.attempt,
        status: "completed",
        usage: clone(worker.attemptUsage),
        at: worker.updatedAt,
      });
      await this.persist(run, "worker-completed", {
        workerId: worker.id,
        result,
      });
      return result;
    } catch (error) {
      await slot.events;
      await this.observe(run, worker, error.usage);
      worker.error = errorJson(error);
      const interrupted =
        slot.controller.signal.aborted ||
        [
          "CANCELLED",
          "TIMEOUT",
          "STALLED",
          "PROCESS_EXIT",
          "PROTOCOL_ERROR",
        ].includes(error.code);
      if (
        error.outcome === "unknown" ||
        (interrupted &&
          (writer(worker.permissions ?? run.permissions) ||
            worker.potentialEffects) &&
          error.outcome !== "not-started")
      )
        worker.error.outcome = "unknown";
      worker.status =
        worker.error.outcome === "unknown"
          ? "unknown"
          : slot.controller.signal.aborted
            ? "cancelled"
            : "failed";
      worker.drainVerified =
        error.drainVerified !== false &&
        !["DRAIN_FAILED", "ORPHAN_UNVERIFIED"].includes(error.code);
      worker.updatedAt = now();
      worker.artifacts = error.artifacts ?? worker.artifacts ?? null;
      worker.artifactPaths = this.artifactPaths(worker.artifacts);
      worker.attempts.push({
        attempt: worker.attempt,
        status: worker.status,
        error: clone(worker.error),
        usage: clone(worker.attemptUsage),
        artifacts: clone(worker.artifacts),
        at: worker.updatedAt,
      });
      await this.persist(run, "worker-failed", {
        workerId: worker.id,
        error: worker.error,
      });
      throw Object.assign(error, { outcome: worker.error.outcome });
    }
  }
  artifactPaths(artifacts) {
    if (!artifacts) return [];
    if (Array.isArray(artifacts))
      return artifacts.flatMap((value) =>
        typeof value === "string" ? [value] : value?.path ? [value.path] : [],
      );
    return Object.entries(artifacts).flatMap(([key, value]) =>
      typeof value === "string" && /path$/i.test(key) ? [value] : [],
    );
  }
  async waitApproval(state, worker, request) {
    const approval = {
      ...clone(request),
      id: randomUUID(),
      backendApprovalId: String(request.id ?? ""),
      workerId: worker.id,
      status: "pending",
      createdAt: now(),
    };
    state.run.approvals.push(approval);
    worker.status = "waiting-approval";
    await this.persist(state.run, "approval-requested", { approval });
    if (state.run.permissions.approvalPolicy === "never") {
      approval.status = "declined";
      worker.status = "running";
      await this.persist(state.run, "approval-decided", {
        approvalId: approval.id,
        decision: "decline",
      });
      return "decline";
    }
    const decision = await new Promise((resolve) =>
      state.approvalWaiters.set(approval.id, resolve),
    );
    state.approvalWaiters.delete(approval.id);
    worker.status = "running";
    return decision;
  }
  async approve(id, approvalId, decision) {
    await this.ready;
    const run = this.runs.get(id);
    if (!run) throw failure("Unknown run", "RUN_NOT_FOUND");
    const approval = run.approvals.find((a) => a.id === approvalId);
    const state = this.executions.get(id);
    const normalized =
      { approve: "accept", reject: "decline" }[decision] ?? decision;
    if (!["accept", "decline", "cancel"].includes(normalized))
      throw new Error("Approval decision must be accept, decline, or cancel");
    if (
      !approval ||
      approval.status !== "pending" ||
      !state?.approvalWaiters.has(approvalId)
    )
      throw new Error("Approval is no longer pending");
    approval.status = "decided";
    approval.decision = normalized;
    approval.updatedAt = now();
    await this.persist(run, "approval-decided", {
      approvalId,
      decision: normalized,
    });
    state.approvalWaiters.get(approvalId)(normalized);
    return clone(run);
  }
  async control(id, action, options = {}) {
    if (["steer", "pause", "stop", "cancel-worker"].includes(action))
      return this.applyControl(id, action, options);
    const command = (this.commands.get(id) ?? Promise.resolve()).then(() =>
      action === "resume"
        ? this.trackAdmission((admission) =>
            this.applyControl(id, action, options, admission),
          )
        : this.applyControl(id, action, options),
    );
    this.commands.set(
      id,
      command.catch(() => {}),
    );
    return command;
  }
  async applyControl(id, action, options = {}, admission) {
    await this.ready;
    if (["resume", "restart-worker", "steer"].includes(action))
      this.assertOpen();
    const run = this.runs.get(id);
    if (!run) throw failure("Unknown run", "RUN_NOT_FOUND");
    const state = this.executions.get(id);
    if (action === "resume") {
      if (state && terminal.has(run.status)) await state.promise;
      else if (state)
        throw new Error(
          "Run still has an active controller; wait for drain before resuming",
        );
      const currentRuntimeIdentity =
        await this.waitWithSignal(runtimeIdentity());
      if (
        run.runtimeIdentity !== currentRuntimeIdentity ||
        this.runtimeIdentity !== currentRuntimeIdentity
      )
        throw failure(
          "Runtime implementation or evaluator dependencies changed; start a fresh run under the current service instead of resuming",
          "RUNTIME_MISMATCH",
          "not-started",
        );
      const uncertain = options.reconcileUnknown
        ? run.workers.filter((w) => w.status === "unknown")
        : [];
      if (options.reconcileUnknown) {
        if (uncertain.some((w) => !w.drainVerified))
          throw new Error(
            "Orphan worker drain is unverified; reconciliation cannot bypass process ownership",
          );
      }
      const fingerprint =
        (await this.waitWithSignal(
          this.backend.executionFingerprint?.({
            cwd: run.cwd,
            permissions: run.permissions,
          }),
        )) ?? null;
      const script =
        options.script ??
        (await this.waitWithSignal(readFile(run.scriptPath, "utf8")));
      const parsed = parseScript(script);
      this.assertOpen();
      admission.run = run;
      if (options.reconcileUnknown) {
        for (const worker of uncertain) {
          worker.status = "reconciled";
          worker.reconciliation = {
            at: now(),
            effectsReviewed: true,
            error: clone(worker.error),
          };
        }
        await this.persist(run, "uncertain-effects-reconciled", {
          workerIds: uncertain.map((w) => w.id),
        });
      }
      this.assertOpen();
      if (fingerprint !== run.executionFingerprint) {
        run.replay = [];
        await this.persist(run, "replay-invalidated", {
          reason: "backend-configuration-changed",
          previousFingerprint: run.executionFingerprint,
          nextFingerprint: fingerprint,
        });
        run.executionFingerprint = fingerprint;
      }
      this.assertOpen();
      run.script = parsed.script;
      run.meta = parsed.meta;
      run.generation++;
      run.status = "running";
      run.result = null;
      run.error = null;
      await atomicText(run.scriptPath, run.script);
      this.assertOpen();
      run.scriptArtifactPath = path.join(
        this.journal.runDir(id),
        `script-g${run.generation}.json`,
      );
      run.resultPath = path.join(
        this.journal.runDir(id),
        `result-g${run.generation}.json`,
      );
      run.paths = { ...run.paths, result: run.resultPath };
      await atomicJson(run.scriptArtifactPath, {
        script: run.script,
        sourcePath: run.sourcePath,
      });
      await this.persist(run, "run-resumed");
      this.assertOpen();
      this.launch(run, parsed.body);
      return clone(run);
    }
    if (!state) throw new Error("Run is not active");
    if (action === "pause" || action === "stop") {
      if (state.halt !== "stop") state.halt = action;
      run.status = state.halt === "pause" ? "pausing" : "stopping";
      this.cancelQueued(state);
      for (const slot of state.active.values())
        if (options.force || slot.worker.status === "waiting-quota")
          slot.controller.abort();
      if (!state.active.size) state.controller.abort();
      if (options.force) state.controller.abort();
      await this.persist(run, `run-${run.status}`);
      return clone(run);
    }
    const slot = state.active.get(options.workerId);
    if (!slot) throw new Error("Worker is not active");
    if (action === "cancel-worker") {
      slot.controller.abort();
      await this.persist(run, "worker-cancel-requested", {
        workerId: options.workerId,
      });
      return clone(run);
    }
    if (action === "restart-worker") {
      if (writer(slot.worker.permissions ?? run.permissions))
        throw new Error(
          "Write-capable worker restart requires drained review; uncertain effects cannot be retried",
        );
      if (slot.worker.attempt >= 6)
        throw new Error("Worker restart cap of five is exhausted");
      slot.restart = true;
      slot.controller.abort();
      await this.persist(run, "worker-restart-requested", {
        workerId: options.workerId,
      });
      return clone(run);
    }
    if (action === "steer") {
      assertText(options.text, "steering text");
      const result = await this.waitWithSignal(
        this.backend.steer(options.workerId, options.text),
        slot.controller.signal,
      );
      await this.persist(run, "worker-steered", {
        workerId: options.workerId,
        text: options.text,
      });
      return { ...clone(run), controlResult: result ?? null };
    }
    throw new Error("Unknown control action");
  }
  shutdown() {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.closed = true;
    this.lifecycle.abort(
      failure("Runtime is closed", "RUNTIME_CLOSED", "not-started"),
    );
    this.shutdownPromise = this.drainShutdown();
    return this.shutdownPromise;
  }
  async drainShutdown() {
    await this.ready;
    const states = [...this.executions.values()];
    for (const state of states) {
      state.halt = "stop";
      state.draining = true;
      state.run.status = "stopping";
      this.cancelQueued(state);
      state.controller.abort();
      for (const slot of state.active.values()) slot.controller.abort();
    }
    await Promise.allSettled(
      states.map((state) =>
        this.persist(state.run, "run-stopping", { reason: "shutdown" }),
      ),
    );
    await Promise.allSettled(
      [...this.admissions].map((admission) => admission.promise),
    );
    await Promise.allSettled([...this.commands.values()]);
    await Promise.allSettled(states.map((state) => state.promise));
    await this.backend.shutdown?.();
    await this.journal.close();
  }
}
