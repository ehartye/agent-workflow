# Workflow engine internals

The controller uses native Codex App Server connections, a separate QuickJS evaluator and SQLite. Public installation and commands are documented in [the README](../README.md) and [the skill API](../skills/agent-workflow/references/runtime-api.md). The direct `engine/cli.mjs` commands below are development/acceptance interfaces; installed users go through `bin/launch.mjs` to enforce runtime and session ownership. The 0.2.0 package is a release candidate; no custom MCP server is included.

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
node engine/cli.mjs --dashboard --run ./test-output/my-run
node engine/cli.mjs --action pause --run ./test-output/my-run --session local-session --generation 1
node engine/cli.mjs --control <receipt-id> --run ./test-output/my-run
node engine/cli.mjs --resume --run ./test-output/my-run --session local-session
```

Use the generation from status, and `--action stop` for interruption. A control receipt starts as `pending` and becomes `applied` or `rejected`; applied does not mean workers have finished. Pause closes new admission, lets active workers finish, and retains results. Stop also interrupts active turns. Stop supersedes a pause and shortens its drain deadline. Late results cannot overwrite retained unknown outcomes. Closing control admission and settling all accepted receipts are one SQLite transaction.

Resume uses the saved script, arguments and launch settings. An explicit `--script` supplies an edited script. The original session is required, and unknown work, failed shutdown or stale ownership blocks resume. Status shows `finishing`, `pausing` or `stopping` until shutdown evidence is saved; `blocked` requires inspection. Read-only status/control commands never start Codex. Status inspection exits successfully even for a failed run; its JSON contains the actual run state. Use `--foreground` for synchronous diagnostics, whose exit code reflects complete coverage.

The evaluator supports `agent`, ordered `parallel`, item-local `pipeline`, `phase`, `log` and JSON `args`. It has no Node imports, filesystem or network, a 32 MiB heap, 512 KiB stack, CPU interrupts and a wall deadline. Clock/random access is refused. Collections accept at most 4,096 entries. Agent calls share a concurrency limit (default 2, explicit 1–256) and at most 1,000 lifetime attempts. Options accept `label`, `phase`, `timeoutMs` (1–120,000), `schema`, `model`, `effort`, `maxAttempts` (1–5), `permissions`, and optional `id`/`dependsOn` dependency declarations. Unsupported options fail explicitly.

Structured workers return validated objects rather than JSON text:

```javascript
return await agent('Read the first line of marker.txt and return it as marker.', {
  schema: {type: 'object', properties: {marker: {type: 'string'}}, required: ['marker'], additionalProperties: false},
  maxAttempts: 2
});
```

The supported schema subset has an object root, nested properties/items, required/closed properties, JSON types including nullable unions, enum/const, bounded numeric/string/collection constraints, and anyOf/oneOf/allOf. References, regex, formats, coercion, inserted defaults and other keywords are refused. Admission rejects malformed schemas and detected contradictory constraints; it is not a general satisfiability solver. Schema size is at most 32 KiB, 512 schema nodes and depth 16; enums allow 128 values each and 256 total. Results are limited to 1 MiB and a conservative schema-cost × result-byte work budget of 8 MiB to keep validation from delaying controls. Excessive work fails explicitly.

The native harness receives the schema, and the engine independently validates the returned JSON before persistence or cache reuse. Invalid JSON/results permit up to five total attempts by default, or a smaller `maxAttempts`. Corrections use the same thread and request revision from existing evidence. Every extra turn reserves a durable lifetime attempt before dispatch; all attempts share the worker's original deadline. Transport loss, cancellation and unobserved native outcomes are never schema-retried. Known completed-but-invalid answers remain failed slots, with command/attempt evidence retained.

Model and reasoning choices resolve from worker options, then run defaults, then effective Codex configuration/model catalog. Catalog support does not establish account entitlement. Each thread must confirm its selected model, reasoning and read-only/never/no-network policy before inference. Explicit authorized workspace-write ceilings create isolated writer worktrees; read-only remains the default. CLI defaults use `--model`, `--effort` and `--max-attempts`; detached launch records retain them for resume. Resume overrides only the supplied fields and preserves the other saved defaults. Effective settings participate in replay identity.

Use unique identifiers (letters, digits, underscore or hyphen; at most 100 characters) for declared prerequisites. Dependencies must name earlier requested workers, at most 256 per call. A dependent waits without occupying a worker slot and dispatches only after every prerequisite has a completed result. A failed prerequisite prevents its dependent from dispatching. Edges participate in replay identity. Ordinary JavaScript control flow still works without declarations; its data dependencies are not automatically inferred.

```javascript
const read = agent('Read the source', {id: 'read', dependsOn: []});
const review = agent('Review the source', {id: 'review', dependsOn: ['read']});
return await Promise.all([read, review]);
```

The dashboard command returns an authenticated loopback URL and leaves a hidden monitor process running after the CLI exits. Open that complete URL to authenticate. Its fragment token is removed from browser history and kept in tab session storage. Each invocation creates an independent view of the same run; it does not start another workflow. Inactive monitors expire after 30 minutes. The monitor supports system/light/dark themes, a phase/worker graph, recorded dependency arrows, status filters, worker inspection, pause/stop receipts and saved-script resume. Grouping lines do not assert dependencies. Percent complete means accepted results divided by discovered workers; a running script may discover more. The map displays at most 60 workers, with the complete ordered list below it.

Routine polling uses bounded previews, including the latest native activity. The graph and worker inspector show tool activity; deliberate worker/script/result reads retrieve full persisted evidence for the observed generation. The inspector's tool filter and All events view expose paged command input/output/status and observed token usage. Activity history retains at most 256 records per worker and 4,096 per generation, each at most 16 KiB; discarded records and shortened fields are disclosed. Authenticated activity reads require the observed generation and worker position and accept at most 100 records per page. Cached workers retain their original evidence and identify its source generation. No per-worker percentage is invented. Resume checks generation again under exclusive run ownership. Stale reads and control errors stay visible and never cause automatic mutation retries. Inspection makes no Codex calls.

Worker policy is read-only filesystem, no command network and no approvals. Child-process overrides disable inherited MCP servers, plugins, apps, hooks, notification commands, browser/computer tools, web search and nested agents. Effective config and each thread's disabled MCP inventory are checked before model execution. User settings are not edited. Account and provider routing must match the managed ChatGPT contract.

SQLite commits each result before returning it to the evaluator. Replay follows invocation order; the first changed or failed call invalidates its suffix. Effective timeout is part of the key; labels/phases are cosmetic. Changed backend config invalidates all cached calls. Session/runtime mismatch, corrupt/missing records and unknown execution refuse replay. Replay does not establish source-file freshness or exactly-once effects. A stale owner lock requires inspection.

Local acceptance on 2026-10-13 passed two file reads and replay with dispatch counts `[2, 0]`; see [the report](../reports/engine-local-acceptance.json). One earlier attempt failed command admission before inference; its cause was not captured, and admission failures now retain their stage report. This is bounded local evidence, not a reliability-rate claim. Another pre-model attempt refused the inventory until the checker distinguished disabled entries from active capabilities.

Use `node engine/background-check.mjs` with the same Codex/backend/output flags for the separate detached acceptance check. It pauses after admitting the first of two real workers, resumes from the saved script, then replays both results without additional dispatch. The [local report](../reports/background-local-acceptance.json) records attempts `[1,2,2]`, cached results `[0,1,2]` and normal owned-server exit in all three generations. This is an explicit subscription-consuming check outside CI. An earlier check failed while observing a run that nevertheless paused successfully; its root cause was not captured. Subsequent diagnostics retain known native error codes. Passing checks do not establish a reliability rate.

The separate `node engine/structured-check.mjs` acceptance check uses the same Codex/backend/output flags. Its [local report](../reports/structured-local-acceptance.json) verifies one successful marker-read command, validated JSON, retained effective settings, replay dispatch counts `[1,0]` and normal owned-server exit. This real check consumed one managed-ChatGPT turn; schema-correction failure cases are exercised deterministically outside inference.

The extended structured check also validates persisted command activity while the worker is running, native usage and retained replay evidence. Its [activity report](../reports/activity-local-acceptance.json) passed with 59 observed events, one successful command and dispatch counts `[1,0]`. SQLite activity/usage updates commit together; callback failure cannot be masked by simultaneous completion. Raw reasoning blocks are excluded from public activity.

Individual steering and cancellation are available in the worker inspector and CLI. Requests bind the observed generation, worker position, attempt and active turn; steering receipts distinguish transmission from native confirmation. Cancelling queued work interrupts its dependency/concurrency wait immediately. Cancelling an active worker leaves siblings running. The gear button opens theme settings; preferences persist and Escape returns focus to the button.

Each native worker now owns a separate App Server. On Windows a small .NET Framework host creates it suspended, assigns a non-breakaway kill-on-close job, then resumes it. Only explicit child stdio handles are inherited. Shutdown requires job accounting to reach zero and the retained root handle to signal exit before issuing a private receipt. This proves termination of associated job members, including nested jobs; external broker processes and external effects remain outside that proof. Native terminal cleanup errors still block replay even when the owned job is empty. Primary errors and cleanup errors are preserved separately; transport errors are isolated per recipient.

Use `node engine/controls-check.mjs --codex <absolute native executable> --output <new report path>` for the explicit subscription-consuming two-worker steering/cancellation check. Offline tests cover Windows host exit, detached-child termination, cancellation, host death, failed spawn, and exact argument forwarding. The host builds using the Windows Framework compiler. Writers, scoped definitions, skills and managed installation are integrated; final release and remaining host/parity boundaries are tracked in [the parity ledger](../docs/codex-parity.md). SSH is deferred.

After a run settles, restart its earliest failed or unknown worker with an explicit reconciliation note. This starts a new generation, reuses the completed prefix, and repeats the selected worker **and every later worker**, including later successful work. Review that entire suffix's effects first. Restart requires confirmed owned-job termination and successful native terminal cleanup; a note cannot waive missing evidence. The saved script, arguments, settings and runtime must still match. There is no automatic restart or merge.

```powershell
node engine/cli.mjs --action restart-worker --run ./test-output/my-run --session local-session --generation 1 --position 0 --attempt 1 --reconcile 'Reviewed all affected effects; repeating this suffix is appropriate.'
node engine/cli.mjs --run ./test-output/my-run --worker 0 --generation 2 --source-generation 1
```

Worker positions are zero-based; use the exact generation and attempt from status. The monitor shows eligible restart scope and collects the same note. Earlier execution rows remain unchanged and can be inspected with their activity; cumulative attempts and usage survive restart and later resume. Stale requests cannot launch another replacement. `node engine/restart-check.mjs --codex <absolute native executable> --output <new report path>` runs the explicit subscription-consuming cancellation/restart acceptance check.
