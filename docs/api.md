# Fresh CLI and monitor API

This describes the 0.3.3 API, including parent access, automatic native catalog provisioning, signed packaged job ownership, 512 MiB capture and completion skill checks. The released 0.1.x RuntimeManager, supervisor JSON journal and workflow_* MCP contracts are not this runtime API. Use the public `node "<plugin-root>/bin/launch.mjs"` entrypoint so exact run IDs select their recorded runtime.

## CLI

All commands accept --data-dir. Otherwise state selection uses AGENT_WORKFLOW_DATA_DIR, then LOCALAPPDATA/agent-workflow or home .local/share/agent-workflow. PLUGIN_DATA is ignored for implicit selection.

| Command | Accepted task options |
| --- | --- |
| setup | Install/select pinned managed runtime |
| doctor | --cwd, --backend |
| workflows / read [scope:]name | --cwd |
| save [scope:]name | --script, --cwd, --command, --overwrite |
| validate file | Alternatively --script file |
| run [scope:]name | Alternatively --script file; --cwd, --session, --args JSON, --concurrency, --model, --effort, --max-attempts, --access parent\|restricted, --parent-access file, --writable, --foreground, --backend, --worker-timeout-ms, --run-timeout-ms, --capture-policy file, --worker-capabilities file |
| list / status ID / result ID | Inspect persisted runs; list accepts --show-hidden |
| watch ID | --session, --generation, --jsonl; optional --after, --idle-ms, --poll-ms |
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

Run defaults: concurrency 2 (range 1–256), `--access parent`. Parent access requires `--parent-access file` containing an explicit originating-session snapshot; missing or unsupported authority fails closed. The supported snapshot is `{version:1,sessionId,provenance:"codex-session-context",filesystem:"unrestricted",networkAccess:true,approvalPolicy:"never"}`. This is coordinator-supplied context, not independent verification by a child configuration. `--access restricted` explicitly retains read-only/no-network/never-approve execution. Doctor defaults restricted; parent doctor also requires the snapshot and originating session. Saved launch and run headers retain the normalized policy and fingerprint; resume/restart cannot replace it, and old runs with no policy remain legacy restricted.

Parent `--writable` defaults workers to `workspace:'isolated'` while retaining full parent execution permissions. Captured independent worktrees provide ownership, review and replay boundaries, not filesystem security isolation. Explicit worker read-only permissions narrow native execution and omit an inherited writer workspace; explicit read-only plus `workspace:'isolated'` is invalid. Restricted `--writable` retains the Windows MXC workspace-write ceiling. Native MCP/app connections may have independent authority; a narrowed command sandbox does not certify their external effects as read-only. Model/effort follow validated native catalog/configuration; `--max-attempts` is 1–5. Backend names are mxc and configured; Windows defaults mxc. A configured backend must independently pass admission. There is no automatic transport/backend fallback after dispatch.

Parent runs separately retain `parentCapabilitiesHash` from the admitted backend catalog. Fresh parent admission requires complete catalog metadata and a valid fingerprint. Resume/restart reject a missing or changed catalog with `PARENT_CAPABILITIES_CHANGED` before generation mutation or dispatch; generic backend cache invalidation cannot silently repeat completed writers under different plugins. Legacy restricted runs retain their original replay behavior. A new current-catalog run still requires prior-effect reconciliation; this guard grants no retry permission.

Worker deadlines default to 600,000 ms, with an explicit range of 1–1,800,000 ms. Overall run wall deadlines default to disabled (0), with an optional limit up to 86,400,000 ms. Completion/manual Stop owns the default run lifetime; evaluator CPU, memory and no-pending-work idle protections still apply. Persisted deadline values retain their original meaning on replay. Explicit capture policy is immutable after new-run admission; resume/restart reject policy overrides. See [capture and lifecycle](session-delivery.md) for policy syntax, inventories, exact revision targets and lost-response inspection.

Normal run returns a detached startup receipt. --foreground waits and returns a nonzero exit code unless the run completed with complete worker coverage. Read-only status exit zero means the read succeeded, not the run. result returns retained result/error; inspect status for coverage and cleanup.

## Attached observation

`watch ID --session SESSION --generation N --jsonl` attaches a read-only JSONL observer to the exact retained run. Detached startup receipts include `watch.required:true`, `attached:false`, the generation/cursor and copyable `argv`; returning that receipt does not attach an observer. The coordinator names an owner, starts the observer, confirms its `attached` record and retains the last completely written event cursor. Keep the same data directory and original session. Stop the observer with Ctrl+C without stopping or retrying workflow execution.

Terminal worker/run notifications are durable SQLite records written with their corresponding state transactions. A worker notification follows its settled execution/cleanup; a forced-drain unknown is deferred until aggregate close. The final run notification and header commit together after backend cleanup, preserving negative or unknown cleanup facts. Events include sequence, generation, kind, status/time, exact worker position/attempt when applicable, and bounded cleanup/error facts. They exclude prompts, raw outputs, account data and credentials. Worker failures remain replayable after a consumer disconnects. `--after` defaults to 0 and must be 0 or a retained event in the selected current generation; reconnect explicitly with the last received cursor. Generation changes require a refreshed exact target. The journal never silently drops earlier terminal events: its 100,000-event capacity reserves the generation's maximum worker count plus one before admission. Older runtimes without this contract remain unsupported rather than migrated.

Polling defaults to 500 ms (`--poll-ms` 100–10,000). `worker-progress` reports the latest safe completed-command/file-change fact, not a complete tool stream. An observer-local idle warning defaults to 60,000 ms (`--idle-ms` 1,000–86,400,000); commentary does not reset a running worker's idle clock. A warning occurs once until new actual progress, identifies the exact attempt and prompts inspection, not cancellation or retry. Watching has no execution controls and writes no run state. The `attached`, `worker-progress` and `idle-warning` records are live observer facts, separate from durable terminal notifications. A named attached coordinator observer relays them to the originating conversation; no native host push-delivery guarantee is claimed.

The observer drains available terminal pages before exit. Exit 0 means the observed run status is `completed`, or the output consumer disconnected; distinguish these cases from received records, never the exit code alone. Other terminal statuses exit 1, observation errors exit 2 and explicit observer cancellation exits 130. Completion does not certify task objectives or artifact acceptance. A lost/broken output pipe does not advance the consumer cursor past an incompletely written record or mutate the workflow. The coordinator still verifies effects, capture integrity and final coverage.

## Worker capability bundle

New runs accept `--worker-capabilities <file>`. The bounded UTF-8 JSON file declares an immutable ceiling; scripts select only declared IDs with `agent(prompt,{skills:['compose'],requireTools:['compose-cli']})`. Omission preserves existing behavior. Resume/restart reject bundle overrides, recheck original source identities and availability, and retain earlier failed/unknown rows. A changed source, receipt, dependency or capability fingerprint cannot reuse saved results. The resolver participates in runtime source identity.

The exact version 1 shape below lists required fields. Arrays may be empty for skills/tools; a declared tool requires nonempty skills, runtime/dependency files and readiness. `sha256` is a lowercase 64-character SHA-256 of actual file bytes. Values are coordinator-reviewed identities, not self-certifying JSON claims.

```javascript
{
  version: 1,
  skills: [{
    id: 'compose', name: 'plugin:compose',
    root: '<absolute original plugin directory>',
    path: '<absolute original skills/compose/SKILL.md>', sha256: '<digest>',
    references: [{path: 'scripts/usage.md', sha256: '<digest>'}]
  }],
  tools: [{
    id: 'compose-cli', skills: ['compose'],
    node: {path: '<absolute verified node.exe>', version: 'v24.18.0', sha256: '<digest>'},
    launcher: {root: '<absolute plugin directory>', path: '<absolute managed launcher>', sha256: '<digest>'},
    runtime: {
      root: '<absolute retained managed runtime>',
      files: [{path: 'cli.mjs', sha256: '<digest>'}],
      receipt: {path: 'receipt.json', sha256: '<digest>'}
    },
    dependencies: {
      root: '<absolute retained dependency directory>',
      files: [{path: 'package-lock.json', sha256: '<digest>'}],
      receipt: {path: 'receipt.json', sha256: '<digest>'}
    },
    environment: {AGENT_BEEPS_HOME: '<absolute managed home>', PLAYWRIGHT_BROWSERS_PATH: '<absolute browser cache>'},
    readiness: [{id: 'capabilities', args: ['capabilities'], marker: '<exact stdout marker>', timeoutMs: 5000}],
    guidance: '<task invocation constraints; use instructions returned by the native skill tool>'
  }]
}
```

Unknown fields, duplicate IDs/names/paths, unsafe or linked paths, missing skill sources, changed bytes and plugin manifests in selected skill directories reject admission. References/files use normalized relative paths inside their declared original root; no traversal, filesystem links or relocated copies. Directory layout remains original. The coordinator must enumerate required references, tool sources and dependencies: the resolver verifies those files and receipt bytes, but cannot authenticate a receipt or discover an undeclared transitive dependency closure from JSON. A missing managed tool may remain unavailable for independent source authoring; identity mismatch/unsafe paths reject even when that tool is optional.

Every file exposed beneath an exact selected skill directory, including native discovery metadata and resources, must have a declared content identity. The scan is bounded at 512 entries and depth 6; nested undeclared skills, plugin manifests and descendant links reject. Linked documentation outside the native skill package may be declared by its original plugin-relative path and verified hash. If native resource access cannot reach it, an ordinary bounded read of that exact verified document is allowed only after genuine native skill activation; it cannot replace `skills.list`/`skills.read` or manually load another skill body. Windows native command arguments also have a pre-dispatch encoded-size guard; a valid manifest can still exceed that platform budget and be refused.

Bounds: manifest 256 KiB; 32 skills, 16 tools; portable IDs 1–100 characters, native names 1–200; paths at most 4,096. Each skill has at most 64 references; skill verification reads at most 128 files/64 MiB, with 1 MiB per SKILL.md and 16 MiB per reference. Each tool source check reads at most 128 files/512 MiB, with 256 MiB for Node and 16 MiB for other files. Each runtime/dependency tree has at most 64 files. Each tool declares at most eight readiness stages, each with at most 32 arguments (2,048 characters each/16,384 total) and timeout 1–20,000 ms. Readiness output is capped at 8,192 bytes and never retained. Readiness runs exactly `[node.path,launcher.path,...args]`, once per required stage. These commands must be reviewed nonmutating queries; instruction guidance is not an enforced executable allowlist. No setup/install/service/fallback/retry is synthesized.

Each readiness stage has exactly one expectation variant:

```js
{id: 'version', args: ['--version'], marker: '0.15.0', timeoutMs: 5000}
{id: 'discovery', args: ['--check', '--json'], json: {installed: true, version: '0.15.0'}, timeoutMs: 5000}
```

The command arguments and JSON field names above are illustrative; use the selected tool's verified interface. `marker` is a nonempty string of at most 200 characters, matched against the entire trimmed stdout, never a substring. `json` is a nonempty top-level object with at most 16 own property expectations. Keys match `[A-Za-z][A-Za-z0-9_-]{0,99}`; `prototype` and names owned by `Object.prototype`, including `constructor` and `__proto__`, are refused. Inherited properties, accessors and symbols are refused. Values are only null, booleans, finite numbers or strings up to 200 characters. The entire stdout must parse as a JSON object whose own expected fields equal the declared scalars without coercion; additional fields are allowed and not retained. Both variants require exit zero and output below the conservative 8,192-byte truncation boundary. Evidence reports `expectation: 'marker' | 'json'` and `matched`; text checks also preserve `markerObserved`. A match alone does not override a nonzero exit, truncation or expired deadline. Discovery fields cannot prove Blender startup, browser rendering or artifact production.

Worker skill access uses genuine pinned Codex 0.162.1 `skills.list`/`skills.read`. `thread/start.selectedCapabilityRoots` maps explicit role IDs to `{location:{type:'environment',environmentId:'local',path:dirname(SKILL.md)}}`; parent mode also provisions original enabled native catalog roots. Workers with any selected roots receive the validated process-local `features.code_mode.direct_only_tool_namespaces=["skills"]` override. Workers use the returned package/main_resource and native pagination, then associated CLI instructions from that read. There is no extraRoots registration, UserInput skill injection, copied body or fake skill server. Restricted role roots avoid broader plugin bundles; parent catalog availability has the explicitly captured parent authority.

Before tool-dependent inference, the owned restricted worker executes actual root/file/environment checks and every required readiness stage through native `command/exec` with read-only/no-network policy. Only explicit `AGENT_BEEPS_HOME`, `AGENT_SPRITES_HOME` and `PLAYWRIGHT_BROWSERS_PATH` values may be selected; conflicting tool environments reject. Parent managed homes are not inherited. Optional associated tools retain missing source/readiness stages. Schema correction repeats neither activation instructions nor readiness commands and asks only for an answer from existing evidence.

Readiness and task/correction execution share one worker deadline, starting immediately before readiness after existing App Server/thread startup. Native command and RPC timeouts are capped by the remaining budget; no later readiness command or model turn starts after expiry. Post-readiness inventory keeps its 15-second maximum within that budget. Cleanup has its separate bounded drain and must retain uncertainty after a lost response. Establishing the thread before readiness permits native inventory cleanup even when a known executed check fails with zero inference.

Only fully admitted required tools add verified invocation metadata to the initial task prompt: tool ID, absolute Node path/version, launcher path, named environment values and the exact readiness stages that passed. The bounded manifest supplies these values; skill bodies are not copied. Optional tools receive no passed-invocation claim. This metadata proves neither other operations nor artifact production, and is not an executable allowlist or broader permission grant.

Evidence distinguishes native direct-tool exposure, exact selected roots, source fingerprints, readiness facts and namespaced call/output pairs. Each explicit `skills` selection requires an initial native main-resource read matching that original directory. Bounded native JSON response metadata is reduced to a root identity and main-resource match before buffering; contents and request bodies are not retained. `native.activation` records required, observed and missing skill IDs, and `body:'notVerified'`. Failed reads, references alone, continuation pages alone, wrong roots, ambiguous/reused call IDs and incomplete observation cannot satisfy activation. `readRootMatch:'observedForSelectedMainReads'` describes reported initial main-response metadata, not full pagination or proof instructions were followed. Catalog contents remain unretained; task JSON cannot replace native evidence. Missing activation rejects completion with `CAPABILITY_NATIVE_SKILLS` and `missingSkills`. Parent catalog availability alone does not require invoking every discovered skill.

After the model finishes, one bounded command revalidates exact selected source/reference identities under the same worker policy and remaining deadline. `completionSources` is separate from initial admission. Known removal/change yields `CAPABILITY_SOURCE_CHANGED`; unavailable or unknown completion-check evidence yields `CAPABILITY_SOURCE_UNVERIFIED`. This detects persistent cache drift; it does not lock the host cache, prevent deletion or silently select a newer package. Reconcile outcomes and prepare a fresh current bundle before another run. Historical run status/evidence remain unchanged.

`noInference` means no task turn was dispatched; post-model source/activation rejection retains the observed model attempt without claiming no inference or no process startup. A lost readiness/completion response retains uncertainty and prevents ordinary replay. Cleanup remains independently required. Version/capabilities checks cannot certify render transport, artifacts or effects. Generated files must stay in assigned writer roots and pass capture integrity plus coordinator review. Parent native MCP/apps/browser availability depends on actual native configuration/authentication; host-only connections are not cloned. Fresh native skill/tool/artifact acceptance, combined verification and release belong to the coordinator.

The supported route is source-backed by [native skill tools](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/ext/skills/src/tools/mod.rs#L55), [executor skill tests](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/app-server/tests/suite/v2/executor_skills.rs#L306) and [DirectModelOnly exposure](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core/src/tools/spec_plan.rs#L541). [Native acceptance](verification.md) separately records genuine public-CLI skill calls and managed Beeps init/new/list with captured output review. WAV rendering/listening and sprite export remain unverified.

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

## Session 0 desktop compatibility

`doctor` and new `run` accept `--session0-desktop inherit|shared`, default `inherit`. `shared` requires Windows MXC and a native Session 0 launch. It is an explicitly authorized shared UI boundary, independent of routing mode and worker capability bundles. It changes no configured filesystem/network permissions.

New runs save `launch.session0Desktop: "shared"`; resume/restart inherit it and do not accept overrides. Default/older launch records omit the property. Doctor and cleanup evidence expose `desktopCompatibility: {requested: "shared", applied: true|false|null}`. True records a successful native host application, false rejection before launch, and null missing confirmation. Command admission, inference execution and cleanup remain separate checks. Detached backend failures retain bounded `admissionFailure` diagnostics in their finish receipt. See [operational guidance](../skills/workflow-setup/references/session0-compatibility.md).
