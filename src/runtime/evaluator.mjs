import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

export function evaluate(options, broker) {
  return new Promise((resolve, reject) => {
    const child = fork(
      fileURLToPath(new URL("./evaluator-process.mjs", import.meta.url)),
      [],
      {
        stdio: ["ignore", "ignore", "pipe", "ipc"],
        serialization: "json",
        windowsHide: true,
        execArgv: ["--max-old-space-size=128"],
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          WINDIR: process.env.WINDIR,
        },
      },
    );
    let settled = false;
    let diagnostics = "";
    child.stderr.on("data", (chunk) => {
      diagnostics = (diagnostics + chunk).slice(-4096);
    });
    options.onSpawn?.(child.pid);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      child.kill();
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () =>
      finish(
        Object.assign(new Error("Evaluator cancelled"), { code: "CANCELLED" }),
      );
    const timer = setTimeout(
      () =>
        finish(
          Object.assign(new Error("Evaluator wall time limit exceeded"), {
            code: "EVALUATOR_TIMEOUT",
          }),
        ),
      options.wallMs ?? 30 * 60 * 1000,
    );
    child.on("error", (error) => finish(error));
    child.on("exit", (code, signal) => {
      if (!settled)
        finish(
          new Error(
            `Evaluator exited without a result (${code ?? signal}): ${diagnostics}`,
          ),
        );
    });
    child.on("message", (message) => {
      if (settled || !message || typeof message !== "object") return;
      if (message.type === "result") return finish(null, message.value);
      if (message.type === "error")
        return finish(
          Object.assign(
            new Error(message.error?.message ?? "Evaluator failed"),
            { code: message.error?.code ?? "EVALUATOR_ERROR" },
          ),
        );
      if (
        message.type !== "broker" ||
        typeof message.id !== "number" ||
        !message.request ||
        typeof message.request !== "object"
      )
        return finish(new Error("Invalid evaluator broker message"));
      Promise.resolve()
        .then(() => broker(message.request))
        .then(
          (value) => {
            if (!settled && child.connected)
              child.send({
                type: "reply",
                id: message.id,
                value: value ?? null,
              });
          },
          (error) => {
            if (!settled && child.connected)
              child.send({
                type: "reply",
                id: message.id,
                error: {
                  message: String(error.message),
                  code: error.code ?? "BROKER_ERROR",
                  spent: error.spent,
                },
              });
          },
        );
    });
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) return abort();
    child.send({
      type: "start",
      body: options.body,
      args: options.args,
      budget: options.budget ?? null,
      spent: options.spent ?? 0,
      cpuMs: options.cpuMs ?? 1000,
      memoryBytes: options.memoryBytes ?? 16 * 1024 * 1024,
    });
  });
}
