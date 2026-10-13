# Local workflow engine prototype

The fresh controller uses the foundation's native Codex App Server connection, a separate QuickJS evaluator, and SQLite. It imports none of the released runtime. The owner selected CLI and dashboard surfaces with no custom MCP server. This slice is not installed or released and does not drive the existing monitor.

After `npm ci`, run the explicit acceptance check:

```powershell
node engine/check.mjs --codex "$PWD/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe" --backend mxc --output test-output/engine-proof.json
```

This uses the existing managed ChatGPT login and consumes subscription usage. Command-only admission must pass first. Two workers each read one generated file; a second controller replays the workflow and must dispatch zero workers. Temporary fixtures remain under the OS temporary directory. Reports omit account details, configuration and file markers. Output files are never overwritten. No API-key fallback or API-billed coordinator exists.

A workflow is ordinary JavaScript with literal metadata first:

```javascript
export const meta = {name: 'read-files', description: 'Read two files'};
await phase('Read');
return await parallel(args.map(file => () => agent(`Read ${file} and summarize it.`)));
```

Run it with an explicit project, run directory and originating session identity:

```powershell
node engine/cli.mjs --codex "$PWD/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe" --backend mxc --cwd "$PWD" --script ./workflow.js --run ./test-output/my-run --session local-session --args '["README.md","package.json"]'
```

The CLI returns a startup receipt while a hidden detached process continues the run. It retains an immutable launch request and a final receipt beside the database. Startup is acknowledged only after durable run ownership; the child requires the launcher's explicit commit before evaluating the script. A launcher timeout before that commit prevents dispatch. An uncertain acknowledgement after commit requires inspecting the saved run before retrying.

```powershell
node engine/cli.mjs --status --run ./test-output/my-run
node engine/cli.mjs --action pause --run ./test-output/my-run --session local-session --generation 1
node engine/cli.mjs --control <receipt-id> --run ./test-output/my-run
node engine/cli.mjs --resume --run ./test-output/my-run --session local-session
```

Use the generation from status, and `--action stop` for interruption. A control receipt starts as `pending` and becomes `applied` or `rejected`; applied does not mean workers have finished. Pause closes new admission, lets active workers finish, and retains results. Stop also interrupts active turns. Stop supersedes a pause and shortens its drain deadline. Late results cannot overwrite retained unknown outcomes. Closing control admission and settling all accepted receipts are one SQLite transaction.

Resume uses the saved script, arguments and launch settings. An explicit `--script` supplies an edited script. The original session is required, and unknown work, failed shutdown or stale ownership blocks resume. Status shows `finishing`, `pausing` or `stopping` until shutdown evidence is saved; `blocked` requires inspection. Read-only status/control commands never start Codex. Status inspection exits successfully even for a failed run; its JSON contains the actual run state. Use `--foreground` for synchronous diagnostics, whose exit code reflects complete coverage.

The evaluator supports `agent`, ordered `parallel`, item-local `pipeline`, `phase`, `log` and JSON `args`. It has no Node imports, filesystem or network, a 32 MiB heap, 512 KiB stack, CPU interrupts and a wall deadline. Clock/random access is refused. Collections accept at most 4,096 entries. Agent calls share a concurrency limit (default 2, explicit 1–256) and at most 1,000 lifetime attempts. Options currently accept only `label`, `phase` and `timeoutMs` (1–120,000). Unsupported options fail explicitly.

Worker policy is read-only filesystem, no command network and no approvals. Child-process overrides disable inherited MCP servers, plugins, apps, hooks, notification commands, browser/computer tools, web search and nested agents. Effective config and each thread's disabled MCP inventory are checked before model execution. User settings are not edited. Account and provider routing must match the managed ChatGPT contract.

SQLite commits each result before returning it to the evaluator. Replay follows invocation order; the first changed or failed call invalidates its suffix. Effective timeout is part of the key; labels/phases are cosmetic. Changed backend config invalidates all cached calls. Session/runtime mismatch, corrupt/missing records and unknown execution refuse replay. Replay does not establish source-file freshness or exactly-once effects. A stale owner lock requires inspection.

Local acceptance on 2026-10-13 passed two file reads and replay with dispatch counts `[2, 0]`; see [the report](../reports/engine-local-acceptance.json). One earlier attempt failed command admission before inference; its cause was not captured, and admission failures now retain their stage report. This is bounded local evidence, not a reliability-rate claim. Another pre-model attempt refused the inventory until the checker distinguished disabled entries from active capabilities.

Use `node engine/background-check.mjs` with the same Codex/backend/output flags for the separate detached acceptance check. It pauses after admitting the first of two real workers, resumes from the saved script, then replays both results without additional dispatch. The [local report](../reports/background-local-acceptance.json) records attempts `[1,2,2]`, cached results `[0,1,2]` and normal owned-server exit in all three generations. This is an explicit subscription-consuming check outside CI. An earlier check failed while observing a run that nevertheless paused successfully; its root cause was not captured. Subsequent diagnostics retain known native error codes. Passing checks do not establish a reliability rate.

Owned App Server exit is verified separately; arbitrary descendants are not verified. The backend forwards cancellation to native turn interruption; the explicit foundation canary observed an interrupted turn after command startup, without a command-completion record. Individual worker controls, safe interrupted-worker restart, schemas, writable workspaces, usage/quota handling, registry/skills, monitor and host integration remain open in [the parity ledger](../docs/codex-parity.md). SSH is deferred.
