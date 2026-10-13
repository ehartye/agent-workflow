# Fresh CLI and monitor API

This describes the 0.3.0 runtime. The released 0.1.x RuntimeManager, supervisor JSON journal and workflow_* MCP contracts are not this runtime API. Use the public `node "<plugin-root>/bin/launch.mjs"` entrypoint so exact run IDs select their recorded runtime.

## CLI

All commands accept --data-dir. Otherwise state selection uses AGENT_WORKFLOW_DATA_DIR, then LOCALAPPDATA/agent-workflow or home .local/share/agent-workflow. PLUGIN_DATA is ignored for implicit selection.

| Command | Accepted task options |
| --- | --- |
| setup | Install/select pinned managed runtime |
| doctor | --cwd, --backend |
| workflows / read [scope:]name | --cwd |
| save [scope:]name | --script, --cwd, --command, --overwrite |
| validate file | Alternatively --script file |
| run [scope:]name | Alternatively --script file; --cwd, --session, --args JSON, --concurrency, --model, --effort, --max-attempts, --writable, --foreground, --backend, --worker-timeout-ms, --run-timeout-ms, --capture-policy file |
| list / status ID / result ID | Inspect persisted runs; list accepts --show-hidden |
| worker ID | --position, --generation, optional --source-generation |
| events ID | --position, --generation, --source-generation, --after, --limit |
| patch ID | --position, --generation, --source-generation, --basis inputs or base |
| exclusions ID | --position, --generation, optional --source-generation, --stage inputs or outputs, --after, --limit |
| dashboard [ID] | --session, optional --current-ui; omitted ID selects newest recorded run in that session |
| resume ID | --session, optional --generation and edited --script |
| pause ID / stop ID | --session, --generation |
| steer ID | --session, --generation, --position, --attempt, --turn, --text |
| cancel-worker ID | --session, --generation, --position, --attempt, optional --turn |
| restart-worker ID | --session, --generation, --position, --attempt, --reconcile |
| control ID | --receipt |
| lifecycle ID / lifecycle-receipt ID | Visibility, exact targets and counts; receipt read requires --receipt |
| hide ID / archive ID / restore ID | --session, --generation, --revision, --request, optional --reason and exact --target worker identity |
| prune-plan ID / prune ID | Reviewed retirement; see [complete contracts](session-delivery.md) |
| mode on/off/status | --scope session or project, --session, --cwd |

Use exact returned IDs rather than relying on dashboard's convenience selection when inspecting a specific run. Starts, resume, pause, stop, steer, cancel, restart and dashboard require --session or CODEX_THREAD_ID; existing-run mutations must match its original identity. Worker positions are zero-based; generation is positive. Read status immediately before controls and use its observed attempt/turn. Events use after=0, limit=50 by default; limit is 1–100.

Run defaults: concurrency 2 (range 1–256), read-only/no-network/never-approve. --writable raises the ceiling to isolated workspace writes on Windows MXC. Model/effort follow validated native catalog/configuration; --max-attempts is 1–5. Backend names are mxc and configured; Windows defaults mxc. A configured backend must independently pass admission. There is no automatic transport/backend fallback after dispatch.

Worker deadlines default to 600,000 ms, with an explicit range of 1–1,800,000 ms. Overall run wall deadlines default to disabled (0), with an optional limit up to 86,400,000 ms. Completion/manual Stop owns the default run lifetime; evaluator CPU, memory and no-pending-work idle protections still apply. Persisted deadline values retain their original meaning on replay. Explicit capture policy is immutable after new-run admission; resume/restart reject policy overrides. See [capture and lifecycle](session-delivery.md) for policy syntax, inventories, exact revision targets and lost-response inspection.

Normal run returns a detached startup receipt. --foreground waits and returns a nonzero exit code unless the run completed with complete worker coverage. Read-only status exit zero means the read succeeded, not the run. result returns retained result/error; inspect status for coverage and cleanup.

## Scripts, persistence and replay

The [script reference](../skills/agent-workflow/references/runtime-api.md) defines agent, parallel, pipeline, phase, log and JSON args. Literal first meta is required. Extra exports/imports and unsupported options reject. Scripts execute only in separate bounded QuickJS children; broker messages are JSON.

Registry lookup is closest project to Git root, then personal, then plugin. Saved definitions reload on read. Collision, traversal and link checks fail closed. A run captures its script, arguments and launch settings independently from later definition edits.

Managed state contains runtime-v2.json, fingerprinted runtime-v2 versions and runs-v2/<UUID>. Each run records original runtime/session ownership beside its SQLite database and launch/completion evidence. SQLite persists worker results before returning them to the evaluator. Do not edit records or clear locks to force recovery.

Replay retains only the matching completed invocation prefix. Stable execution settings, dependencies, schema and timeout participate; labels/phases are cosmetic. Unknown outcomes, missing evidence, failed cleanup and incompatible runtime/session block ordinary resume. Explicit restart requires settlement, eligible failed/unknown position, exact attempt and reconciliation of the entire repeated suffix. See [controls](../skills/agent-workflow/references/controls.md).

Worker evidence includes status, prompt/options, attempts, result/error, activity, observed usage, native thread/turn details and workspace artifacts when applicable. Coverage reports requested/completed/cached/failed/unknown; complete requires terminal completed state and all discovered workers completed. Script-level assertions of task coverage can still be incomplete.

## Authenticated session HTTP monitor

dashboard starts a separate loopback server bound to 127.0.0.1 on port 0. Its full URL includes a fragment token. API requests require Authorization: Bearer <token>, an exact Host, and an exact Origin when present. The browser removes the fragment and uses tab session storage. Static assets expose no run data. There is no default inactivity expiry; Close ends the monitor without stopping the workflow. Explicit --current-ui uses the selected current presentation while reads and controls retain each run's verified original runtime.

| Route | Method and contract |
| --- | --- |
| /api/run | GET coherent bounded current snapshot, coverage and recent control receipts |
| /api/worker/N | GET; generation required, optional sourceGeneration |
| /api/activity | GET; generation and position required, optional sourceGeneration/after/limit |
| /api/patch/N | GET; generation required, optional sourceGeneration and basis=inputs or base |
| /api/exclusions/N | GET; generation required, optional sourceGeneration, stage=inputs or outputs, after and limit=1..100 |
| /api/script | GET saved script text; generation required |
| /api/result | GET retained result/error; generation required |
| /api/control | POST generation/action and applicable position/attempt/turnId/text |
| /api/resume | POST generation; resume saved script |
| /api/restart | POST generation/position/attempt/reconciliation |
| /api/close | POST JSON object; close this monitor |

POST bodies require application/json and are capped at 40,000 bytes. Unknown fields on control/resume/restart reject. Generation conflicts return 409; malformed inputs return 400. Controls return receipts; resume/restart return startup acknowledgement. The authenticated monitor uses the run's recorded session after launcher ownership validation. Edited-script resume is a CLI operation.

Activity retains at most 256 records per worker and 4,096 per generation, each at most 16 KiB. Pages disclose discarded records and shortened fields; raw reasoning is excluded. Cached activity identifies its original source generation. Prior worker/patch/activity reads require a linked prior execution. Runtime inspection makes no model call.

Session-bound monitors additionally expose authenticated `/api/session/runs` and `/api/runs/ID/...` scoped reads/controls, lifecycle operations and receipt inspection. `/runs/ID` and `/session` are presentation routes; choosing a view does not arm execution controls. `/api/health` describes dashboard health independently of saved execution outcomes. The HTTP surface has no global workflow-start, configuration or approval service: worker policy remains approvals never. Typed task reports remain unverified claims without an authenticated acceptance receipt; see [evidence meanings](session-delivery.md#session-dashboard-and-evidence-meanings).
