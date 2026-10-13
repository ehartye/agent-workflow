# Agent Workflow

Script durable Codex work with parallel workers, item-local pipelines, bounded loops, named child workflows, ordered replay, and a local control desk. The supervisor persists prompts, attempts, approvals, usage, results, errors, and artifacts outside the installed plugin cache.

This is a regular Codex plugin with an owned runtime. Native composer controls, task-panel rendering, live parent grants/history, and a native shared token pool remain host capabilities; see [limitations](docs/limitations.md).

## Install and set up

Requirements: Node **24+** with npm, and an authenticated Codex installation/account for real workers. The package pins its runtime dependencies and Codex adapter version. Setup uses `npm ci --ignore-scripts`; it does not install global packages or modify global AGENTS/config.

Clone the public repository, using the release tag for a fixed package version:

```sh
git clone --branch v0.1.1 https://github.com/ehartye/agent-workflow.git
codex plugin marketplace add ./agent-workflow
codex plugin add agent-workflow@agent-workflow-local
```

Then run the installed plugin's `workflow-setup` skill as described below. This GitHub release supports manual/local installation; it is not a public Plugins Directory submission.

The repository includes root `plugin.json`, portable `mcp.json`, compatibility manifests, and a local marketplace at `.agents/plugins/marketplace.json`. Add this repository as a local marketplace with `codex plugin marketplace add <repository-path>`, then install with `codex plugin add agent-workflow@agent-workflow-local` or the local source in the supported Codex/ChatGPT desktop Plugins Directory. Restart/refresh the host as required by its plugin UI. A cached plugin is a copy: changing this checkout does not establish that the installed copy changed.

Run the plugin’s `workflow-setup` onboarding skill. It executes the equivalent of:

```text
node "<installed-plugin-root>/bin/setup.mjs" --data-dir "<plugin-data-directory>"
node "<installed-plugin-root>/bin/launch.mjs" doctor --data-dir "<plugin-data-directory>"
```

The host provides `PLUGIN_ROOT` and `PLUGIN_DATA` to plugin subprocesses. Portable MCP arguments/environment/cwd use those exact placeholders. Before setup, the MCP server connects through a dependency-free read-only bootstrap offering `workflow_setup_info`. It returns the exact host-resolved paths and structured setup/verification commands, even when native Codex uses a hashed data directory. Execute setup explicitly, then reconnect to load the normal workflow tools. The parent agent’s ordinary shell may not have these variables and should not guess another data directory.

Setup copies an immutable runtime and installs dependencies under `<plugin-data-directory>/runtime/`; prompts, runs and mode settings stay in persistent data. A changed package returns setup-info again and requires explicit setup; launch never silently updates. The bootstrap never installs or launches workflows. Drain an existing supervisor before switching runtime versions for new work.

For an update, follow [upgrade and drain instructions](skills/workflow-setup/references/upgrades.md) before setup. Use the retained old runtime CLI with the exact data directory to inspect/drain its supervisor; the changed-package launcher rejects commands until explicit setup. Retain old runtimes for paused runs requiring their recorded runtime identity.

Outside a plugin host, state defaults to `%LOCALAPPDATA%/agent-workflow` on Windows or `~/.local/share/agent-workflow` elsewhere. `--data-dir` or `AGENT_WORKFLOW_DATA_DIR` selects another instance. Keep this directory outside the plugin package.

Hook trust is **separate** from installation. The optional `UserPromptSubmit` hook is skipped until the host user reviews and trusts its current definition. Manual workflow tools work without hooks. Hook-bearing plugins are currently for manual/local desktop installation and are ineligible for the public directory. Web installation does not deploy local scripts.

## Use

Ask Codex to create/run a durable Agent Workflow, use the plugin’s `agent-workflow` skill, or call the `workflow_*` MCP tools directly. Authoring guidance loads the [exact runtime API](skills/agent-workflow/references/runtime-api.md). Scripts start with literal `export const meta`, execute in an async QuickJS context, and can use a top-level `return`; they are not importable ES modules.

`workflow_start` returns a persisted run ID immediately. Poll compact `workflow_status`, `workflow_events`, and `workflow_result`; use `workflow_worker` for a deliberate bounded worker detail read. Full prompts/events/results remain in the authenticated dashboard and JSON artifact paths. Admission is not completion, and a completed script can still report incomplete task coverage.

For a source checkout:

```powershell
npm ci --ignore-scripts
node bin/agent-workflow.mjs start
node bin/agent-workflow.mjs workflows --cwd C:/path/to/project
node bin/agent-workflow.mjs run plugin:item-audit --cwd C:/path/to/project --args '{"items":[{"id":"src","scope":"src/"}]}' --compact --wait
node bin/agent-workflow.mjs dashboard --open
```

For the installed package, replace the leading `node bin/agent-workflow.mjs` with `node "<installed-plugin-root>/bin/launch.mjs"` and append `--data-dir "<exact-host-dataDir>"` to every command. Use setup-info or host diagnostics for that exact directory; the parent shell may otherwise select a different default instance. Defaults are read-only workers, no network, and approvals never. Explicit authorized write work uses `--sandbox workspace-write`; network uses `--network true`; live approval waits use `--approvals on-request`. Run `help` for all controls.

Use `status ID --compact` and `list --compact` for routine CLI observation, and `events ID --compact --since N --limit 50` for cursor pages. `run --compact --wait` polls the summary view; run/control/approval compact output retains status, coverage and evidence paths. Default CLI reads still return full records. A newer source client can compact an older supervisor’s full reply locally; that compatibility path still transfers its full record, and event pages report `legacyFullRead:true`.

The monitor polls summary/monitor views, follows actual dispatch order and keeps tool failures visible beside the worker’s current status. Full worker/run/result/event records load deliberately, with retained observations timestamped. Truncated approval requests must be inspected before acceptance.

The service binds only `127.0.0.1` on an ephemeral port. API calls require a local bearer token and browser requests must have the service’s exact origin. `dashboard` puts the token in the URL fragment, which the page removes from the displayed URL and stores in tab session storage. Treat dashboard URLs and the local service/run directory as private.

## Bundled workflows

| Name | Arguments and behavior |
| --- | --- |
| `plugin:item-audit` | `items:[{id,scope}]`; audit items, independently verify each identified finding, retain missing/verifier slots |
| `plugin:fix-until-check-passes` | `task`, `check`, `maxRounds`; isolated rounds carry a cumulative patch, stop on pass or two no-progress rounds |
| `plugin:isolated-migration` | `migration`, `slices:[{id,scope}]`; disjoint worktrees produce patches/check evidence and an integration review |
| `plugin:changed-file-review` | `files`, optional `base`; parallel file review then reduction; failed files remain visible |
| `plugin:cross-source-research` | `question`, `sources:[{id,...}]`; collect and cross-check evidence; preserve inaccessible/missing sources |
| `plugin:loop-until-dry` | `question`, optional `scope`, `maxRounds`, `verify:true`; deduplicate all seen IDs including refuted items and stop after two dry rounds |

Writer recipes return patches/artifacts for explicit coordinated integration. They do not merge or publish. Each worker worktree starts from the captured source workspace; subsequent fix rounds explicitly apply the returned cumulative patch in the next worktree.

## Save and invoke a workflow

```powershell
node bin/agent-workflow.mjs validate C:/path/to/audit.js
node bin/agent-workflow.mjs save project:audit --script-path C:/path/to/audit.js --cwd C:/path/to/project --command
node bin/agent-workflow.mjs run project:audit --cwd C:/path/to/project --args '{"items":[]}'
```

Project lookup checks `.agents/workflows` from cwd up to the nearest git root, closest first; non-git lookup uses cwd only. Personal `~/.agents/workflows` follows, then bundled `workflows`. Prefix `project:`, `personal:`, or `plugin:` to choose a namespace. Symlink/junction paths are refused; bundled files are read-only. Existing scripts require `--overwrite` explicitly.

Optional `--command` (MCP `command:true`) creates a scoped `.agents/skills/workflow-<name>/SKILL.md` wrapper for `$workflow-<name>`. It points to the scoped saved workflow, uses the current project cwd, and preserves explicit permissions. Unrelated existing skills are never overwritten. Host skill discovery may require a new session/refresh. A saved JS file by itself is run through the tools or CLI rather than inventing a native host command.

## Control and recover

Use `status`, `events`, `result`, `pause`, `stop`, `resume`, `steer`, `cancel-worker`, `restart-worker`, and `approve`, or their dashboard/MCP equivalents. Pause/stop stops new dispatch and drains active workers. `--force` requests interruption and process drain. Neither action rolls back edits.

`resume ID --script-path edited.js` reuses only completed calls in the matching ordered prefix. A changed prompt/stable option, failed call, unknown outcome, or missing result artifact invalidates the suffix, including later successful siblings. Identical intentional prompts are separate positions. Post-processing changes can reuse the complete valid prefix. Workspace freshness is not inferred; start a new run when evidence changed.

Snapshots also record `runtimeIdentity`: exact runtime source hashes and installed QuickJS/core, Acorn and Ajv versions. Resume rejects a missing or mismatched identity with `RUNTIME_MISMATCH` before editing the script, changing generation/cache, reconciling effects, or dispatching workers. Resume through a matching immutable runtime or start a new run. Separately, changed backend/profile execution fingerprints invalidate the reusable prefix. These checks do not establish that external workspace evidence is fresh.

After controller death, every abandoned dispatched worker remains unknown, including read-only workers and workers whose process drain is verified. Process termination cannot establish what external tools already did. Review effects and artifacts before another attempt. `resume --reconcile-unknown` explicitly acknowledges reviewed unknown effects, while still requiring verified prior-process drain. Write-capable workers cannot be blindly restarted. There is no app-server-to-exec fallback after dispatch.

`run.json` is the sole authoritative atomic run commit. The event file is derived: a missing/stale copy is rebuilt from the committed run, while an ahead/conflicting copy blocks recovery and is preserved for manual evidence review. Do not delete conflicting or ownership records blindly to force replay.

Budget is a cumulative **observed output-token scheduling guard**, separate from concurrency and lifetime attempts. It prevents new dispatch after observed exhaustion; already-active workers can overshoot. Usage persists through replay/restarts and missing usage coverage is retained. It is neither a dollar-cost cap nor the parent turn’s native token pool.

Optional `--quota-wait <milliseconds>` (0–3,600,000, default 0) allows a bounded wait only for an exact structured quota error, no observed effects, and supported reset metadata for the exact exhausted quota window. No message-text reset guessing is used. `--stall-restarts <count>` (0–5, default 5) caps safe stall retries; 0 disables them. Known tools, compaction, sleep and user approval suspend the stall watchdog; the hard worker timeout remains active. Neither setting authorizes retrying uncertain mutating effects, and prior spend/attempts remain recorded.

## Workflow mode

Use `workflow_mode` or `mode on/off/status`. Session mode requires a real session ID (`--scope session --session ID`); project mode is explicit (`--scope project --cwd path`). The trusted prompt hook injects concise routing guidance for genuine user prompts; ordinary questions/small edits remain ordinary. It never edits global AGENTS. Worker processes marked `AGENT_WORKFLOW_WORKER=1` cannot recursively start/mutate workflows through MCP/CLI/setup, and the prompt hook excludes them.

## Develop and verify

```powershell
npm ci --ignore-scripts
npm test
npm run check
npm run smoke
node scripts/check-install.mjs
```

Tests use explicit offline fixture processes and test persistence, failure boundaries, approvals, MCP, replay, isolation and controls. Production selects the Codex backend by default; `--backend-fixture` is an explicit integration-test facility. `smoke` is offline and launches real fixture subprocesses. `check-install` installs into an isolated native Codex home, calls the cold setup-info tool through the native parent app-server, runs explicit setup at its exact host data path, reconnects production tools, checks custom CLI data without environment masking, and verifies the update boundary. It performs no model turn. Its npm install needs network or a populated npm cache.

Credentialed live smoke is separate and read-only; it is not hidden inside ordinary tests. Skill authoring evaluation evidence must distinguish validated API behavior from measured usefulness; a correct baseline does not establish a quality gain from the skill. The bundled Python skill validator needs PyYAML in a separate developer environment; Python is not a runtime dependency.

See [service/MCP API](docs/api.md), [host and runtime limits](docs/limitations.md), and the [implementation plan](docs/implementation-plan.md). As-built architecture/roadmap lives in the project’s wiki-master vault.

Release evidence is in [verification](docs/verification.md) and the [Yoda skill audit](docs/skill-audit.md).

Licensed under [MIT](LICENSE).
