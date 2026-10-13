# CLI and controls

Installed plugin: run `node "<plugin-root>/bin/launch.mjs" <command> --data-dir "<exact-host-dataDir>"`. Obtain that exact directory from the installed instance's setup-info or host diagnostics; use the packaged `workflow-setup` skill if it is unknown. The parent shell may lack the plugin subprocess's `PLUGIN_DATA`, and the platform default can target a different instance. Source checkout after `npm ci`: `node bin/agent-workflow.mjs <command>`. State lives in `PLUGIN_DATA` when supplied by the host, or `%LOCALAPPDATA%/agent-workflow` on Windows and `~/.local/share/agent-workflow` elsewhere. `AGENT_WORKFLOW_DATA_DIR` or `--data-dir` selects an explicit separate instance.

| Command | Purpose |
| --- | --- |
| `start` | Start detached loopback supervisor, wait for readiness |
| `run [name] --script-path path --cwd path --args '{...}'` | Durable admission; path takes precedence over name/script |
| `run ... --wait` | Poll until stopped/paused/terminal; deadline does not cancel the run |
| `status ID`, `list`, `events ID --since N`, `result ID` | Inspect full JSON records and outcomes |
| `status ID --compact`, `list --compact` | Routine bounded status/counts/coverage and evidence paths |
| `events ID --compact --since N --limit 50` | Bounded event preview page with cursor/hasMore; limit 1–100 |
| `pause ID`, `stop ID` | Block dispatch and drain according to runtime control semantics |
| `resume ID --script-path path` | Replay with edited script or resume unchanged |
| `steer ID --worker ID --text text` | Send direction to active worker |
| `cancel-worker ID --worker ID` | Cancel and drain a specific worker |
| `restart-worker ID --worker ID` | New attempt; check prior effects/unknown outcome first |
| `approve ID --approval ID --decision accept/decline/cancel` | Resolve an explicit pending approval |
| `validate path` | Parse script without workers |
| `save [project:/personal:]name --script-path path [--overwrite] [--command]` | Save safely; optional scoped `$workflow-name` skill; plugin namespace is read-only |
| `workflows --cwd path` | Names, namespaces and paths |
| `mode on/off --scope session --session ID` | Scoped opt-in routing |
| `mode on/off --scope project --cwd path` | Explicit project opt-in routing |
| `mode status`, `doctor` | Inspect configuration and installation |
| `dashboard [--open]` | Authenticated local dashboard URL |
| `shutdown` | Drain supervisor and stop service |
| `mcp` | MCP stdio protocol; no informational stdout |

Start flags: `--concurrency`, `--max-agents`, `--budget`, `--timeout`, `--quota-wait` (milliseconds, 0–3,600,000, default 0), `--stall-restarts` (0–5, default 5), `--sandbox read-only/workspace-write`, `--network true`, `--approvals never/on-request`. Quota waiting requires known backend reset metadata and a safe retry; uncertain effects never authorize it. Stall retries retain spend/attempts and do not retry an uncertain writer. Broader access requires user authorization. Defaults are read-only, no network and never approve.

Use `--compact` on run, list, status, approval or control responses to avoid printing full prompts/journals. `run --compact --wait` polls the summary view. It does not change admission, effects or permissions. Default reads remain full evidence. Against an older supervisor, the source client projects its full response locally; that still transfers the full record, and event pages label this `legacyFullRead:true`. Keep the matching old runtime for resumable runs; observation through a newer client does not authorize a runtime replacement.

The loopback HTTP API requires a local bearer token. Dashboard authentication uses a URL fragment; it is removed from the displayed URL and retained in tab session storage. Do not paste the token into shared reports. Service records/logs and run artifacts contain private prompts/results and remain in the selected local data directory.

For explicitly reviewed unknown effects, `resume` accepts `--reconcile-unknown`; the backend must still confirm process drain. Write-capable worker restart is always rejected; review and reconcile through resume instead. Read-only filesystem sandboxing does not fence configured MCP tool calls. Workers have explicit configuration and do not inherit live host scope.

Named agent profiles are data in project `.agents/agent-workflow.json`: `{ "agentProfiles": { "reviewer": { "model": "...", "effort": "high", "developerInstructions": "Read evidence without edits", "permissions": { "sandbox": "read-only", "networkAccess": false, "approvalPolicy": "never" } } } }`. Set `agentType:'reviewer'` in agent options. Unknown names reject; profiles can narrow the run’s permission ceiling. These are owned runtime profiles, separate from native host personas.

`--backend-fixture` is an explicit offline integration-test facility. Production always uses the Codex backend; no fixture or synthetic successful run is selected by default.
