# Agent Workflow

Run durable JavaScript workflows with parallel Codex workers, ordered replay and an authenticated local monitor. Workers use the existing managed ChatGPT subscription through pinned native Codex App Server. The fresh runtime exposes CLI and dashboard surfaces; it has no custom MCP server or API-key fallback.

This is the **0.2.0 implementation**. Publication is recorded in [GitHub Releases](https://github.com/ehartye/agent-workflow/releases); broader Ultracode parity remains tracked separately. See [verification](docs/verification.md), [limits](docs/limitations.md) and the [acceptance ledger](docs/codex-parity.md).

## Install and start

Require Node 24+ with npm and an existing managed ChatGPT login. Install the version pinned by the shared marketplace:

```powershell
codex plugin marketplace upgrade hartye-plugins
codex plugin add agent-workflow@hartye-plugins
```

For development, native plugin installation from a local checkout is:

```powershell
codex plugin marketplace add C:/path/to/agent-workflow
codex plugin add agent-workflow@agent-workflow-local
```

Use the installed workflow-setup skill, or the installed package's public launcher:

```powershell
node "<plugin-root>/bin/launch.mjs" setup
node "<plugin-root>/bin/launch.mjs" doctor --cwd "C:/path/to/project"
node "<plugin-root>/bin/launch.mjs" workflows --cwd "C:/path/to/project"
```

Setup copies an immutable runtime outside the plugin cache and installs pinned production dependencies with npm lifecycle scripts disabled. Doctor performs command-only account, policy and native execution checks; it makes no model inference request. Neither edits global AGENTS/Codex settings. A copied plugin cache is not proof that setup or the installed version has changed.

State uses --data-dir when explicit, otherwise AGENT_WORKFLOW_DATA_DIR, then LOCALAPPDATA/agent-workflow or home .local/share/agent-workflow. Keep explicit overrides consistent. PLUGIN_DATA does not implicitly select another instance. New runtimes/runs use runtime-v2 and runs-v2; old 0.1.1 data and matching runtimes are retained separately, without automatic migration. Read [upgrade guidance](skills/workflow-setup/references/upgrades.md).

## Run and observe

Use the agent-workflow skill or CLI. Starts and mutating run controls, including dashboard creation, require the real originating --session or CODEX_THREAD_ID. Do not invent one.

```powershell
node "<plugin-root>/bin/launch.mjs" read plugin:item-audit --cwd "C:/path/to/project"
node "<plugin-root>/bin/launch.mjs" run plugin:item-audit --cwd "C:/path/to/project" --session "<originating-session>" --args '{"items":[{"id":"src","scope":"src/"}]}'
node "<plugin-root>/bin/launch.mjs" status "<returned-run-id>"
node "<plugin-root>/bin/launch.mjs" result "<returned-run-id>"
node "<plugin-root>/bin/launch.mjs" dashboard "<returned-run-id>" --session "<originating-session>"
```

Start returns durable admission while a detached local process continues. Inspect the actual status and coverage; admission is not completion. A successful status command can describe a failed run.

Workflows have no overall wall deadline by default; they continue until completion or manual Stop. Workers default to 10 minutes each, configurable up to 30 minutes with `--worker-timeout-ms`. Use `--run-timeout-ms` to opt into an overall wall limit (1–86,400,000 ms; 0 disables it). Both flags work with `run` and `resume`; saved limits carry forward on resume. Guest CPU, memory and idle-deadlock protection remain active. See the [runtime contract](skills/agent-workflow/references/runtime-api.md).

Open the **complete returned dashboard URL**, including its authentication fragment. The page removes that fragment from browser history and retains the token in tab session storage. Keep the URL private. Each monitor views one saved run and stays available until explicitly closed, including after a run finishes. Closing the browser tab does not stop the run or its monitor process. The workflow graph shows declared dependencies, worker states and accepted results among discovered workers. It does not invent per-worker completion percentages. The gear button selects System, Light or Dark theme.

Workers default to read-only, no network and approvals never. Authorized edits require --writable and the verified Windows MXC backend. Each writer gets a separate worktree from captured run inputs; dependencies do not import predecessor edits. Inspect returned patches before separately authorized integration. There is no automatic merge or publication.

## Saved scripts and recipes

Scripts begin with literal exported meta and run as an async body with top-level return in a separate bounded QuickJS process. Available APIs are agent, parallel, pipeline, phase, log and JSON args. See the [script contract](skills/agent-workflow/references/runtime-api.md).

```powershell
node "<plugin-root>/bin/launch.mjs" validate "C:/path/to/audit.mjs"
node "<plugin-root>/bin/launch.mjs" save project:audit --script "C:/path/to/audit.mjs" --cwd "C:/path/to/project" --command
node "<plugin-root>/bin/launch.mjs" run project:audit --cwd "C:/path/to/project" --session "<originating-session>" --args '{"items":[]}'
```

Discovery searches project .agents/workflows from cwd to the nearest Git root, then personal .agents/workflows, then bundled definitions. A non-Git directory searches only its cwd for project definitions. Use project:, personal: or plugin: to select a scope. Existing definitions require explicit --overwrite; bundled definitions are read-only. --command generates a scoped workflow-name skill delegating to the installed main skill; unrelated skills are never replaced.

| Bundled name | Inputs and behavior |
| --- | --- |
| plugin:item-audit | items:[{id,scope}]; audit and independently verify each finding |
| plugin:changed-file-review | files, optional base; parallel review and reduction |
| plugin:cross-source-research | question, sources; collect/cross-check accessible evidence and retain missing sources |
| plugin:fix-until-check-passes | task, check, maxRounds; bounded writer rounds carrying a cumulative patch |
| plugin:isolated-migration | migration, slices:[{id,scope}]; separate writer patches plus integration review |
| plugin:loop-until-dry | question, optional scope/maxRounds/verify; deduplicate and stop after two dry rounds |

Writer recipes need authorized --writable. Research is limited to worker-accessible evidence: network, browsing and external connectors are disabled. Failed/null/unknown slots remain visible; synthesis cannot supply absent evidence.

## Control and routing

Use [generation-bound controls](skills/agent-workflow/references/controls.md). Pause stops admission and drains active workers; stop also interrupts active turns. Control receipts distinguish acceptance from settlement. Steer/cancel target an observed worker attempt and active turn.

Resume uses the saved script, arguments, original session and original installed runtime. Only the matching completed invocation prefix replays. Changed/failed calls invalidate later reuse; cached evidence does not prove source freshness. Unknown outcomes or failed cleanup block ordinary replay. A reconciled restart repeats the earliest eligible failed/unknown worker **and every later worker**, including completed writes. Review that entire suffix first; a note cannot waive verified owned-job termination and native cleanup.

Workflow mode is optional, explicit opt-in:

```powershell
node "<plugin-root>/bin/launch.mjs" mode on --scope session --session "<originating-session>"
node "<plugin-root>/bin/launch.mjs" mode status --scope session --session "<originating-session>"
node "<plugin-root>/bin/launch.mjs" mode off --scope session --session "<originating-session>"
```

Project scope requires --scope project --cwd. Session settings take precedence over the nearest configured project setting. The prompt hook supplies routing context when the host permits it; runtime setup does not establish host hook trust. Mode grants no permissions, preserves the active objective during check-ins, and leaves ordinary questions/direct edits conversational.

## Develop

```powershell
npm ci --ignore-scripts
npm test
npm run check
npm run smoke
node scripts/check-install.mjs
npm audit --omit=dev
```

Tests and smoke use offline fixtures. Clean installation uses native plugin discovery and command-only admission with no model turn; it needs npm network access or cached packages. Subscription-consuming acceptance runs are separate and explicit. See [API](docs/api.md), [monitor design](docs/monitor-design.md) and [verification](docs/verification.md). Architecture and roadmap intent live in the owner's wiki-master vault.

Licensed under [MIT](LICENSE).
