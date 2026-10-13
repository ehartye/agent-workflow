# Functional dynamic workflow parity

Approved boundary: ordinary Codex plugin + local runtime + owned dashboard. Research and precise contract are in the agent-workflow wiki. This plan's acceptance checks drive implementation; no native composer, native shared budget, cloud VM or provider cache equivalence is claimed.

## Tasks and ownership

- [x] Runtime: `src/runtime/{manager,journal,script,evaluator}.mjs`, `test/runtime*.test.mjs`. Test first: bounded fan-out, item-local pipelines, schemas, pure meta, zero host APIs, CPU termination, unique repeated calls, changed-prefix replay, failed suffix, nested shared caps, cancellation/drain, restart persistence, cumulative budget/attempts.
- [x] Workers: `src/workers/{codex,exec,app-server,process,worktrees}.mjs`, `test/workers*.test.mjs`. Test actual child-process fixtures before implementations; verify protocol handshake/stream/schema/approval/steering, Windows-safe launch and process-tree drain, transient vs unknown outcome, worktree failure closed and untracked patches. Verify one real authenticated read-only Codex run.
- [x] Surfaces: `bin/agent-workflow.mjs`, `src/{service,client,mcp,registry}.mjs`, `ui/*`, `skills/*`, `hooks/*`, manifests/examples/checker. Test first: detached supervisor, authenticated loopback APIs, control actions, saved workflow precedence and symlink refusal, MCP protocol, hook mode isolation and worker recursion prevention, no install-cache state.
- [x] Integration: full suite, installed-package checks, six task-shape journeys, crash/resume/control journeys, browser inspection and paired authoring evaluation. Independent spec review then code-quality review; fix every material finding.
- [x] Documentation: README installation/usage, API/limitations, verified wiki architecture/roadmap and plugin enhancement notes. Commit feature work locally; retain the feature worktree for handoff.

## Runtime interface

See AGENTS.md for manager and backend types. `agent`, `parallel`, `pipeline`, `phase`, `log`, `args`, `budget` and one-level `workflow` are exposed only inside the evaluator. Parse meta as a literal AST. Atomically store commands, ordered cache identities, attempts, usage and immutable results before advancing. Controller locks prohibit two live owners; recovery classifies abandoned writes as uncertain.

## Control desk design

Use a dense, calm operations desk: navy/slate background, cool cyan for live activity, amber for waiting and red for failures. A persistent run list, actual phase/worker timeline and evidence/detail pane encode the real execution state. Typography uses Segoe UI Variable for controls and Cascadia Code for scripts/data, with readable fallbacks. The signature element is the execution trace: every cached, live, failed and unverified item remains visible. No synthetic analytics or fake sample runs.

## Commands

`npm ci`, `npm test`, `npm run check` and `npm run smoke` are the final repeatable checks. Fixture process tests run without credentials. The live smoke is separately documented and bounded to read-only output.

## Final disposition

All acceptance lanes passed on Windows: 118 offline tests, package checks, process smoke, native cold/warm installation, bounded authenticated worker/replay runs, official skill validation and independent specification/code-quality review. The approved regular-plugin boundary is retained; native UI/shared budgeting, live parent context, hook trust and broader OS verification remain explicit limits. Save locally on feat/dynamic-workflows and retain the sibling feature worktree for handoff.
