# Codex rebuild acceptance ledger

The owner's requirement is full Ultracode/dynamic-workflow feature parity with no API-key billing. Existing architecture may be discarded. This ledger describes the fresh rebuild, not features inherited from release 0.1.1. That release's host-UI and budget exceptions do not waive rebuild requirements.

Behavioral reference: [Claude dynamic workflows](https://code.claude.com/docs/en/workflows), captured in the wiki as `raw/clippings/Orchestrate subagents at scale with dynamic workflows.md`, hash `4bd52a60ff58213b6cfbe28ed0d2fb34df32d8f9fa8c24dd506909a24679b0ef`. Codex protocol reference: locally generated 0.162.1 App Server schema, plus the wiki's `codex-orchestration-best-practices` research. Research comparisons of PabloNAX/ultracode-skill, just-every/plugin-ultracode and YuanpingSong/ultracodex remain on the research branch; they are not copied into the new transport.

| Capability | Acceptance evidence required | Fresh rebuild status |
|---|---|---|
| Plan authentication | Managed ChatGPT sign-in, effective OpenAI route, no API credential fallback or API-billed coordinator | Passed locally for two turns; provider usage attribution not independently audited |
| Actual local worker execution | Two separately identified turns read independent unpredictable file markers, successful command items and exact answers | Passed with explicit MXC on Windows 26300.9550, Codex 0.162.1 |
| Admission without model spending | Readiness plus real buffered, streamed, PTY command checks and terminal cancellation | Passed MXC; configured backend fails closed before inference |
| Failure and lifecycle honesty | Bounded startup, disconnect and interrupt handling; primary errors retained; restart denied while old execution may remain | Protocol tests pass; arbitrary descendants and native model interruption still unverified |
| Script generation and opt-in | Human request/keyword triggers; substantive-task automatic mode; disabling, provenance and permission rules | Open |
| Plain JavaScript orchestration | Literal first `meta`, top-level await, loops, branching, variables, async functions and returned result | Open |
| Isolated evaluator | No filesystem, shell or imports; time/random restrictions; bounded CPU, memory and pending promises | Open |
| Primitives | `agent`, ordered `parallel`, item-local `pipeline`, `phase`, `log`, structured `args`; documented failure/null behavior | Open |
| Structured results | Contradictory schemas rejected before dispatch; validated JSON; bounded configurable validation retries | Open |
| Worker policy | Model/effort inheritance and overrides, permission ceilings, tools, approvals, workspaces and nested delegation accounting | Read-only/never subset proved; remaining policy open |
| Background lifecycle | Responsive host, durable admission, retained script, progress and terminal report delivery | Open |
| Concurrency and caps | Default CPU-aware limit up to 16; explicit 1–256; 4,096 batch items; 1,000 run agents; no silent loss | Two concurrent outstanding turns proved; scheduler/caps open |
| Prefix cache behavior | Matching model/effort/tools/schema/cwd prefixes, bounded release after first response; expose Codex differences | Open; provider equivalence unverified |
| Ordered-prefix replay | Agent start order; completed prefix reused; first changed or failed call invalidates all later calls; in-flight calls restart | Open; mandatory, not an optional extension |
| Session resume | Original session identity and saved results reused on reopening; fresh session starts new run; missing results fail visibly | Open; cloud/session-host integration unverified |
| Pause/stop/restart | Whole-run and individual controls; admission stops; terminal execution proof precedes relaunch | Open; command-only cancellation and fixture turn interruption pass |
| Stall handling | Tool/quota waits excluded from inactivity; at most five restarts; attempt history/effects and spent usage retained | Open |
| Quota behavior | Structured limit/reset evidence; user-enabled wait, reset within 24 hours, maximum two waits, no bought credits/fallback | Open |
| Saved workflows | Project/personal/plugin scopes, closest-project precedence, namespacing, reload, arguments, symlink and collision rules | Open |
| Bundled research | Multi-angle source discovery, fetch, independent cross-check/vote, cited report; explicit invocation | Open |
| Monitor detail and controls | Phases/counts, prompts/results, tool input/output/status, tasks, filters, navigation and keyboard actions | Open; old monitor is not connected to the rebuild |
| Usage, scale and warnings | Per-agent/run usage, large-run advisory, size guidelines, configured effort/model accounting; shared budget semantics | Open; host/provider boundaries remain acceptance questions |
| Native host integration | Composer/mode controls, task panel, notifications and original-session restoration | Open; no ordinary-plugin equivalence claim |
| Distribution and migration | Version-pinned upgrades, skills and packaging, preservation of existing user data, reproducible install | Open; prototype uninstalled and unreleased |

Local evidence is in `reports/foundation-local-acceptance.json`. The six-stage probe used no inference. The two-thread check used two model turns, each with one successful command, in overlapping lifetimes (about 9.6 and 12.6 seconds). It proves local worker command execution, not arbitrary tree drain, a hard shared model budget or full product parity. SSH is deliberately deferred by the owner.

Next implementation gate: fresh workflow controller and evaluator over this transport, with ordered replay and truthful pause/stop state, then monitor integration. Preserve the user's saved data; do not migrate or release it until the replacement passes its acceptance suite. No part of the old runtime is a required dependency.
