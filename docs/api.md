# Service and tool API

The stable JS broker reference lives in [runtime-api.md](../skills/agent-workflow/references/runtime-api.md). It covers every evaluator API: `agent`, `parallel`, `pipeline`, `phase`, `log`, `args`, `budget`, and one-level `workflow`.

## Runtime manager

`RuntimeManager({dataDir, backend, workflowsDir?, resolveWorkflow?})` has async `start(input)`, `get(id)`, `list()`, `events(id,since=0)`, `control(id,action,options={})`, `approve(id,approvalId,decision)`, and `shutdown()`. Its `ready` promise establishes the exclusive journal/controller lock before the service advertises readiness. `start` returns after durable admission and executes the script in the background.

Start input: `{script?,scriptPath?,name?,args?,cwd,concurrency?,maxAgents?,budget?,permissions?,timeoutMs?,quotaWaitMs?,stallRestarts?}`. Path takes precedence over inline script/name. Permissions are `{sandbox:'read-only'|'workspace-write',networkAccess:boolean,approvalPolicy:'never'|'on-request'}`. Defaults are read-only/false/never. Unsupported values reject.

`quotaWaitMs` is 0–3,600,000 milliseconds, default 0: opt into a bounded quota-reset wait only when the backend supplies supported reset metadata and a retry is safe. It does not guess a reset or authorize retrying uncertain effects. `stallRestarts` is 0–5, default 5: the bounded cap for safe stall restarts, with cumulative usage/attempts retained. Set 0 to disable restarts. CLI flags are `--quota-wait` and `--stall-restarts`; MCP `workflow_start` exposes the same typed fields.

Snapshots contain identity/status/meta/cwd, explicit permissions, workers, cumulative usage and usage coverage, result/error, approvals, replay/generation, timestamps, coverage and artifact paths. `scriptPath` is the real editable script; `scriptArtifactPath` is immutable generation evidence. `snapshotPath`, `resultPath`, `eventsPath`, `artifactsPath`, and `paths` identify durable JSON evidence. Failed and unknown worker slots remain in snapshots. Full HTTP records intentionally include complete prompts/events/results for local inspection.

`runtimeIdentity` records exact runtime source hashes and installed QuickJS/core, Acorn and Ajv versions. Resume recomputes disk/controller identity and fails with `RUNTIME_MISMATCH` when stored identity is absent or differs, before any reconciliation/edit/generation/cache mutation or dispatch. The backend/profile execution fingerprint is separate: its change invalidates the ordered reusable prefix. Workspace evidence freshness remains an explicit task decision.

`run.json` is the sole authoritative atomic run commit. Derived `events.json` is rebuilt when missing/stale; an ahead/conflicting copy blocks recovery and remains intact for manual evidence review. Every abandoned dispatched worker is classified unknown, even if read-only or already drained, until explicit effects review and verified drain permit reconciliation.

Worker schemas use the shared bounded subset validated before dispatch and independently against results. Regex features, dynamic schema features, references/async validation and `uniqueItems` are unavailable. Required/property limits and supported type/`allOf` contradictions reject during preflight; unsupported schemas are not approximated or accepted as best-effort output.

Control actions: `pause`, `stop`, `resume`, `cancel-worker`, `restart-worker`, `steer`. Options include `workerId`, `text`, edited `script` for resume, `force` for pause/stop interruption, and `reconcileUnknown` for explicitly reviewed unknown effects on resume. Reconciliation cannot bypass unverified process drain. Approvals use `accept`, `decline`, or `cancel`; aliases accepted by the manager are a compatibility convenience.

## Authenticated HTTP

Service metadata is `service.json` in selected persistent data. It has URL, local token, PID, version and start metadata. Bind address is fixed at `127.0.0.1`; there is no public-bind option. Send `Authorization: Bearer <token>`. Host must exactly match the service endpoint and a browser Origin, when present, must match it. JSON bodies are capped at 1 MiB; malformed JSON rejects. Unknown routes/methods reject.

| Route | Method | Result |
| --- | --- | --- |
| `/api/health` | GET | Ready supervisor identity/version |
| `/api/runs` | GET / POST | Full snapshots / durable admission |
| `/api/runs/:id` | GET | Full snapshot |
| `/api/runs/:id/events?since=N` | GET | Full events after sequence cursor |
| `/api/runs/:id/result` | GET | Status/result/error/workers/usage |
| `/api/runs/:id/script` | GET | Recorded editable script and path; bounded/no symlinks |
| `/api/runs/:id/control` | POST | `{action,options}` forwarded to manager |
| `/api/runs/:id/approve` | POST | `{approvalId,decision}` explicit decision |
| `/api/workflows?cwd=...` | GET | Namespaces/paths/precedence |
| `/api/workflows` | POST | `{name,script,cwd,overwrite?,command?}` save |
| `/api/mode` | GET / POST | Scoped settings / `{value,scope,sessionId?,cwd?}` |
| `/api/shutdown` | POST | Drain and close supervisor |

Dashboard assets use a restrictive same-origin CSP, no external scripts/fonts, no framing, no-referrer, and no-store. Dynamic evidence is inserted as text rather than HTML.

## MCP stdio

The production server uses the pinned official SDK for initialization, tool discovery, schemas, cancellation/transport lifecycle and JSON-RPC framing. Before managed dependencies exist, or after a package change, a dependency-free bootstrap provides only the read-only `workflow_setup_info` tool over bounded JSON-RPC stdio. It returns exact host-resolved paths and structured commands for explicit setup/verification, without installing, starting a service or evaluating workflows. Reconnect after setup to load production tools. Bootstrap request lines are capped at 64 KiB.

Tool calls return JSON in text content; errors have `isError:true`. Start/control calls do not hold the MCP connection until workflow completion. The detached service survives MCP/CLI exit.

| Tool | Use |
| --- | --- |
| `workflow_setup_info` | Cold/changed runtime only: exact host data/plugin paths and explicit setup commands; read-only |
| `workflow_start` | Durable admission, compact snapshot/ID |
| `workflow_status` | Status, coverage, counts, bounded worker/error/approval summaries, evidence paths |
| `workflow_list` | Paginated compact runs (`offset`, `limit` ≤50) |
| `workflow_events` | Cursor page (`since`, `limit` ≤50), bounded event previews |
| `workflow_result` | Bounded final value, partial/failed slots and full evidence paths |
| `workflow_worker` | Deliberate single-worker prompt/result/error/attempt previews |
| `workflow_control`, `workflow_approve` | Explicit durable controls and approval decisions |
| `workflow_workflows`, `workflow_read` | Registry discovery and deliberate script read |
| `workflow_save`, `workflow_validate` | Parse/validate and save safely; optional scoped command wrapper |
| `workflow_mode` | Explicit session/project opt-in setting/status |
| `workflow_dashboard` | Private authenticated loopback URL |

Routine MCP responses omit full worker prompts/tool outputs. Previews expose `truncated`, original character count and evidence paths; paging exposes cursors/hasMore. Status shows at most 30 worker summaries and 10 pending approvals; complete records remain local. Result previews are at most 12,000 characters and individual worker/event previews are bounded. Neither truncation nor pagination invents successful coverage.

Worker-marked MCP/CLI processes refuse mutating workflow/start/mode/save/setup operations before daemon startup. Read-only tools may inspect an already-running service and do not create one. This prevents automatic recursive plugin dispatch outside the shared scheduler; it is not a general operating-system sandbox against a malicious process under the same user identity.

## Worker profiles

Project `.agents/agent-workflow.json` is a strict data-only roster: `{agentProfiles:{name:{model?,effort?,developerInstructions?,permissions?}}}`. A configured `agentType` resolves that named profile; unknown names reject before dispatch. Profile permissions can narrow the authorized run ceiling. Explicit backend configuration can supply/override profiles. There is no automatic native parent persona or grant inheritance.
