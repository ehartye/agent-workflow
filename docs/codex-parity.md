# Codex rebuild acceptance ledger

The owner's requirement is full Ultracode/dynamic-workflow feature parity with no API-key billing. Existing architecture may be discarded. This ledger describes the fresh rebuild, not features inherited from release 0.1.1. That release's host-UI and budget exceptions do not waive rebuild requirements.

Behavioral reference: [Claude dynamic workflows](https://code.claude.com/docs/en/workflows), captured in the wiki as `raw/clippings/Orchestrate subagents at scale with dynamic workflows.md`, hash `4bd52a60ff58213b6cfbe28ed0d2fb34df32d8f9fa8c24dd506909a24679b0ef`. Codex protocol reference: locally generated 0.162.1 App Server schema, plus the wiki's `codex-orchestration-best-practices` research. Research comparisons of PabloNAX/ultracode-skill, just-every/plugin-ultracode and YuanpingSong/ultracodex remain on the research branch; they are not copied into the new transport.

| Capability | Acceptance evidence required | Fresh rebuild status |
|---|---|---|
| Plan authentication | Managed ChatGPT sign-in, effective OpenAI route, no API credential fallback or API-billed coordinator | Passed locally for two turns; provider usage attribution not independently audited |
| Actual local worker execution | Two separately identified turns read independent unpredictable file markers, successful command items and exact answers | Passed with explicit MXC on Windows 26300.9550, Codex 0.162.1 |
| Admission without model spending | Readiness plus real buffered, streamed, PTY command checks and terminal cancellation | Passed MXC; configured backend fails closed before inference |
| Failure and lifecycle honesty | Bounded startup, disconnect and interrupt handling; primary errors retained; restart denied while old execution may remain | Protocol tests and native turn interruption pass; arbitrary descendants remain unverified |
| Script generation and opt-in | Human request/keyword triggers; substantive-task automatic mode; disabling, provenance and permission rules | Open |
| Plain JavaScript orchestration | Literal first `meta`, top-level await, loops, branching, variables, async functions and returned result | Fresh QuickJS engine implemented; two-worker native JS workflow passed |
| Isolated evaluator | No filesystem, shell or imports; time/random restrictions; bounded CPU, memory and pending promises | Separate child implemented; adversarial import, clock/random, infinite/unsettled work and JSON tests pass |
| Primitives | `agent`, ordered `parallel`, item-local `pipeline`, `phase`, `log`, structured `args`; documented failure/null behavior | Implemented and tested in the read-only slice; full worker options remain open |
| Structured results | Contradictory schemas rejected before dispatch; validated JSON; bounded configurable validation retries | Open |
| Worker policy | Model/effort inheritance and overrides, permission ceilings, tools, approvals, workspaces and nested delegation accounting | Read-only/never with inherited integrations disabled and verified; remaining policy open |
| Background lifecycle | Responsive host, durable admission, retained script, progress and terminal report delivery | Detached CLI runner, durable startup handshake, saved launch/script and completion receipts implemented; host notification delivery remains open |
| Concurrency and caps | Default CPU-aware limit up to 16; explicit 1–256; 4,096 batch items; 1,000 run agents; no silent loss | Shared scheduler and explicit caps implemented; default remains 2; CPU-aware default and scale acceptance open |
| Prefix cache behavior | Matching model/effort/tools/schema/cwd prefixes, bounded release after first response; expose Codex differences | Open; provider equivalence unverified |
| Ordered-prefix replay | Agent start order; completed prefix reused; first changed or failed call invalidates all later calls; in-flight calls restart | Completed-prefix SQLite replay passed with zero extra worker dispatches; changed/failed suffix tests pass; in-flight restart remains blocked on lifecycle proof |
| Session resume | Original session identity and saved results reused on reopening; fresh session starts new run; missing results fail visibly | Explicit CLI original-session resume implemented; automatic host identity and cloud restoration remain open |
| Pause/stop/restart | Whole-run and individual controls; admission stops; terminal execution proof precedes relaunch | Durable whole-run pause/stop implemented with bounded interruption and unknown replay refusal; individual controls and safe interrupted-worker restart remain open |
| Stall handling | Tool/quota waits excluded from inactivity; at most five restarts; attempt history/effects and spent usage retained | Open |
| Quota behavior | Structured limit/reset evidence; user-enabled wait, reset within 24 hours, maximum two waits, no bought credits/fallback | Open |
| Saved workflows | Project/personal/plugin scopes, closest-project precedence, namespacing, reload, arguments, symlink and collision rules | Open |
| Bundled research | Multi-angle source discovery, fetch, independent cross-check/vote, cited report; explicit invocation | Open |
| Monitor detail and controls | Phases/counts, prompts/results, tool input/output/status, tasks, filters, navigation and keyboard actions | Open; old monitor is not connected to the rebuild |
| Usage, scale and warnings | Per-agent/run usage, large-run advisory, size guidelines, configured effort/model accounting; shared budget semantics | Open; host/provider boundaries remain acceptance questions |
| Native host integration | Composer/mode controls, task panel, notifications and original-session restoration | Open; no ordinary-plugin equivalence claim |
| Distribution and migration | Version-pinned upgrades, skills and packaging, preservation of existing user data, reproducible install | Open; prototype uninstalled and unreleased |

Local evidence is in `reports/foundation-local-acceptance.json`. The six-stage probe used no inference. The two-thread check used two model turns, each with one successful command, in overlapping lifetimes (about 9.6 and 12.6 seconds). It proves local worker command execution, not arbitrary tree drain, a hard shared model budget or full product parity. SSH is deliberately deferred by the owner.

The fresh `engine/` slice passed two managed-ChatGPT file reads and completed-prefix replay with dispatch counts `[2, 0]`; see `reports/engine-local-acceptance.json`. Independent review and regression tests cover timeout identity, inherited external tools and corrupt persistence. The owner explicitly selected no custom MCP integration; CLI and dashboard are the intended surfaces. This evidence does not establish full parity or replace the installed plugin.

The native interruption check observed a real command startup marker, interrupted its model turn, and successfully reused the retained server for a command-only request. No command-completion item arrived. `reports/foundation-interruption-acceptance.json` therefore proves protocol interruption while retaining unverified descendant state; it does not establish safe restart.

The detached controller uses a generation/session-bound SQLite mailbox for pause/stop. It closes admission before acknowledging controls, drains active work, and records terminal state only after shutdown. Launcher abandonment before commit dispatches no workers. Stop shortens an existing pause deadline; every accepted control is settled before mailbox closure. Interrupted workers with uncertain effects remain blocked.

Native background acceptance passed pause, saved-script resume and completed replay with attempts `[1,2,2]` and cached results `[0,1,2]`; each generation recorded normal owned-server exit. See `reports/background-local-acceptance.json`. The checkpoint passes 192 tests, package check and smoke, with independent review. An earlier observation failed although the persisted run paused successfully; its cause remains unknown.

Next implementation gate: monitor integration and the remaining worker options, individual controls and parity ledger. Preserve the user's saved data; do not migrate or release it until the replacement passes its acceptance suite. No part of the old runtime is a required dependency.
