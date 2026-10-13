# Candidate boundaries

The 0.2.0 candidate implements the fresh engine through CLI and dashboard. Full Ultracode parity remains an acceptance objective; the [ledger](codex-parity.md) records open work. Features from 0.1.1 are not implicitly inherited.

| Area | Current behavior and limit |
| --- | --- |
| Billing/account | Existing managed ChatGPT login and pinned native Codex App Server; incompatible account/provider routing fails. No custom MCP server, API-key fallback or API-billed coordinator. Subscription usage still applies. |
| Host integration | Owned local dashboard and opt-in prompt routing. No native composer slider, stock task panel, parent history/tool-grant inheritance or host notification-delivery equivalence is claimed. |
| Background execution | Detached local runner and SQLite persistence require the machine, account and runtime to remain available. No hosted execution or cloud restoration promise. |
| Usage/budget | Observed per-thread usage and retained cumulative attempts are evidence. No hard shared parent budget, dollar cap or provider-cache equivalence. Run-level quota waiting and stall retry policy remain open; legacy quota/budget flags do not apply. |
| Concurrency | Default 2, explicit 1–256; at most 4,096 collection entries and 1,000 lifetime attempts. These bounds are not large-scale throughput acceptance. |
| Evaluator | Separate QuickJS child, JSON-only broker, bounded memory/CPU and a no-pending-work idle watchdog; overall wall deadline is optional. No filesystem, shell, imports, host tools or clock/random access. General native process isolation under the same OS account is a separate boundary. |
| Worker permissions | Read-only/no-network/never-approve by default. Explicit authorized writers use Windows MXC worktrees. Broader network access and interactive approvals are unavailable. |
| External tools | Child configuration disables inherited MCP, plugins/apps/hooks, notification commands, browser/computer tools, web search and nested agents. Research recipes only inspect accessible evidence. |
| Writer integration | Each writer begins from captured source inputs in its own worktree. Dependencies schedule workers but do not transfer edits. Patches remain for reviewed integration; no automatic merge/publication. |
| Replay | Matching completed prefix only, with original runtime/session identity. Cached output does not establish current file freshness or exactly-once effects. |
| Unknown effects | Stop cannot roll back effects. Unknown work blocks ordinary resume. Explicit restart repeats the selected eligible worker and every later worker after suffix review and verified cleanup. No uncertain-dispatch retry/fallback. |
| Schemas | Bounded supported JSON Schema subset with independent validation. Unsupported keywords reject; contradiction checks are not a general satisfiability solver. Known invalid answers may be corrected within attempts/deadline; transport loss and unknown outcomes are not schema-retried. |
| Workflow nesting | Evaluator APIs are agent, parallel, pipeline, phase, log and args. Legacy child workflow(), agentType, stallMs and budget APIs are unavailable. |
| Installation | Explicit setup selects fingerprinted immutable runtimes outside cache. Exact run IDs retain old runtime ownership. Fresh SQLite and legacy JSON data remain separate; no automatic migration. |
| Mode/trust | Session/project routing is opt-in and grants no permissions. Host acceptance/trust of the prompt hook is separate from runtime setup and CLI correctness. |
| Platform | Local Windows MXC is the verified writer platform. SSH verification is deferred. Other platform guarantees require their own acceptance evidence. |

Worker prerequisite guidance now covers Windows executable selection, explicit offline package caches and Playwright cache discovery. Follow-up work is a coordinator-visible prerequisite report before dispatch, reusable authorized installation instructions, and explicit toolchain-path capture for later dashboard resume. These are roadmap items; the runtime does not automatically install dependencies or repair worker environments. A prerequisite failure pauses dependent execution while independent authorized authoring/review can continue.

Workspace capture includes all worker outputs, including ignored `node_modules` and `dist` files, so worker-edited ignore rules cannot hide effects. It is bounded at 20,000 files, 128 MiB of captured file bytes and 32 MiB per diff. In the Tidepool case study an authorized dependency installation/build added 4,097 untracked files totaling 188,632,310 bytes; the input-index and worktree-identity hashes still matched, but capture exceeded the byte limit. The worker's native turn and owned-job cleanup completed while its artifact outcome correctly remained unknown. Capture errors now retain the failing stage and a sanitized cause in `workspaceError.capture`; partial artifacts remain on disk. Future work is an explicit coordinator-owned immutable capture policy for generated dependencies/build outputs, with visible exclusions and integrity verification. Trusting worker-edited ignore rules or silently raising/removing capture limits is not an implemented workaround.

## Windows boundary evidence

Each native worker owns an App Server inside a non-breakaway, kill-on-close Windows job. Shutdown proof requires the owned job to reach zero and its retained root handle to signal exit. This covers associated job members, including nested jobs; it does not establish absence of external broker processes or external effects. Native terminal cleanup errors block replay even when the job is empty. Reports deliberately retain descendants:notVerified alongside job-scoped evidence.

A command-only adversarial check found that a **host-precreated hardlink inside an allowed workspace can modify its outside target**. See the [failed boundary report](../reports/workspace-preexisting-hardlink-limitation.json). Command creation of new hardlinks and tested source/sibling/temp/Git/junction writes were denied. The runtime mitigates preexisting links by independently copying inputs and refusing linked files before dispatch; this does not justify claiming a universal native hardlink boundary or immunity to same-user external races.

Separate [command](../reports/workspace-command-boundary.json) and [patch](../reports/workspace-patch-boundary.json) reports record tested denial cases. [Native writer acceptance](../reports/native-writer-workflow.json) records two distinct worktrees, retained patches, unchanged source/index/config and zero-additional-turn replay. These are bounded observations.

## Evidence limits

Readiness checks, offline process tests, rendered browser inspection and real subscription-backed runs answer different questions. A browser graph fixture is not proof of model quality; successful admission is not completed work; a completed script is not complete task coverage. Keep failed/null/unknown slots, missing usage and history truncation visible.

Earlier reports may describe capabilities as pending that later source changes added. Use their timestamps and stated scope; do not treat an old report as verification of later code. Final published-package, required CI, tag and installation verification remain separate release gates.
