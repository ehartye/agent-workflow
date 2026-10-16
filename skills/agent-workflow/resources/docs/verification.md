# Verification record

The 0.6.0 candidate contains declared-step visibility, depth-one composition, explicit trusted-LAN binding and complete skill-local resources. Final-source checks, native installed qualification and publication are recorded in [the 0.6.0 release evidence](https://github.com/ehartye/agent-workflow/releases/tag/v0.6.0), not inferred from this source note. Artifact/refinement providers are unavailable. Phone painting/keyboard hardening and second-device LAN acceptance remain unverified. GitHub Actions remains disabled by owner instruction; publication requires the authorized local verification gates.

Version 0.5.0 is the last published baseline at preparation of this candidate. Its [release](https://github.com/ehartye/agent-workflow/releases/tag/v0.5.0) supersedes the installation and publication statuses quoted in the historical entries below. Those entries retain their exact historical scope.

The isolated [retained preview rotation repair](../reports/retained-preview-rotation/report.json) has focused real-process fixture coverage in `test/codex-turn.test.mjs`. Optional diagnostic previews rotate in first-retained order within 1 MiB and 1024 items; updating a retained ID replaces its bytes without changing its order. Answer candidates remain pinned, with the 512 KiB text cap also checked after answer fragments are joined. Required answer items that exceed the retained byte/item budget still fail closed. A discarded diagnostic update removes its superseded outcome.

`output.evictedItems` and `output.evictedBytes` count removed or refused diagnostic preview occurrences and their serialized preview bytes, not unique IDs or raw output bytes. Terminal snapshots are processed in their supplied order: retained IDs update in place, evicted IDs can be admitted again and cause further eviction. No unbounded seen-ID history is kept. Command evidence covers retained items only; independent command event delivery and native tool observations are unchanged. Known agent phase/delivery metadata survives preview eviction and omitted snapshot fields through the existing separate, bounded 1024-ID metadata map; exceeding that lineage budget still fails closed rather than losing exclusion metadata. Answer phase/delivery counts describe retained messages only.

The repair's RED/GREEN logs cover byte/count pressure, terminal replay, omitted commentary/async metadata, answer updates, late failed commands, independent tool observations and answer-limit failures. These are simulated protocol fixtures using real Node child processes, not a new native-workload acceptance run. Full test/check/smoke, installed-runtime, browser and release acceptance remain coordinator work; the existing 16 MiB frame, authentication, source, schema and cleanup guards were not changed.

The **unpublished 0.4.0 candidate** has scoped [native live-control and append acceptance](../reports/native-live-controls-0.4.0.json). On source `a1aa023cd7b364e7397483fac14626dbc96e25cba44887a3ff772eacbf5dec7c`, two actual native read-only workers completed with two attempts, zero remaining reservations, same-turn deadline revisions 0→1→2→3, stale-control refusal and one idempotent append. Wrong-session/generation submissions were refused. Six command lifecycle facts were retained without drops, and worker/run ownership cleanup was positively unforced. The named consumer processed terminal cursor 3 while preserving an 11.313-second missing preattachment interval; this is not a native host-chat delivery claim. The [first probe](../reports/native-live-controls-0.4.0-initial.json) remains not accepted after an unsupported command-timeout requirement blocked it before controls.

The final canonical source digest is `967cd6160299faad254eee70618864b3be95716692051e652c78969791854ca5`. Relative to the native-tested package, only one CRLF in monitor HTML was normalized to LF (13,289→13,288 bytes; text unchanged); the other 96 runtime files were byte-identical. The native receipt is not relabeled as an execution of those final bytes. The [final canonical package gates](../reports/release-0.4.0-local.json) passed 622/622 tests, check, smoke, isolated clean installation and a zero-vulnerability production audit. Its command-only doctor passed with zero inference and positive unforced cleanup, preserving both earlier candidate runtimes and the owner's selected 0.3.6 installation. See [0.4.0 candidate status](releases/0.4.0.md) for scope and outstanding delivery requirements.

The [v2 authoring comparison](reviews/2026-10-15/authoring-v2/README.md) independently accepted both complete plans at 12/12. It establishes no score advantage, general causal benefit or automatic-trigger behavior; its released-0.3.6 planning scenario is separate from 0.4.0 native acceptance.

Version **0.3.6 is published and remains the owner's selected installation**, including the dashboard/input/output and final picker work. The [delivery receipt](../reports/release-0.3.6-delivery.json) records PR #11, tag `v0.3.6`, marketplace PR #173 and installed verification. GitHub Actions remains disabled by owner instruction. The explicit local-verification exception for 0.3.6 is historical and does not waive the next release's requirements. The earlier verification records below retain their historical scope.

The 0.3.5 candidate carries forward the reviewed 0.3.4 dashboard source. The 0.3.4 tag gate passed 505/506 tests and timed out in the existing PowerShell/COM short-alias fixture before catalog assertions. The corrected fixture uses native CMD expansion with the same deadline and identity/junction assertions; the failed tag was not moved or retried. Fresh release gates remain required for 0.3.5.

The dashboard case study records reviewed clean-writer capture, fresh independent verification, five meaningful failing regression checks before fixes, 42 affected monitor checks and 81 final painted-browser checks. See [the bounded delivery evidence](../reports/map-inspector-034.md) and [browser report](../reports/map-inspector-browser-034.json). Full release gates and installed verification remain separate from those observations.

Version 0.3.3 was published after 485/485 local tests, package checks, smoke, clean production installation, a zero-vulnerability production audit and Windows PR/tag verification. Its installed command-only parent-policy doctor passed with zero inference requests and confirmed owned-job cleanup. Earlier Windows runner failures produced verified short-path and PowerShell module-discovery fixes. The [PlanetForge friction report](../reports/planetforge-friction-033.md) records its scopes, earlier failures, native skill evidence and the unaccepted authoring drafts/game objectives.

Published [0.3.2](https://github.com/ehartye/agent-workflow/releases/tag/v0.3.2) records the earlier Windows Session 0 acceptance. The checkpoints below retain their original pre-release context; their pending statements are historical rather than the current release status.

## Earlier 0.3.1 checkpoints

Final local 0.3.1 verification passed 409/409 tests, package check, detached smoke, clean native installation and a zero-vulnerability production audit. Candidate runtime `0.3.1-1328c7d0988d380f-node24.18.0` passed real command-only doctor admission with zero inference requests and positive owned cleanup on this Windows host. The first full run passed 408/409: a preexisting five-second test precondition expired before capture. The corrected real-Git callback barrier explicitly establishes retry ordering and rejects an isolated missing-guard mutation (3 attempts versus 2), without a runtime budget change. Required Windows PR/tag gates and exact installed-package/native/browser acceptance remain pending.

The requested [live skill grant](../reports/live-skill-grants-native-boundary.md) remains blocked by the inspected pinned public native API. It is separate from startup skill provisioning and is not covered by successful native startup proofs.

These entries distinguish published 0.3.0, the then-current 0.3.1 candidate evidence and earlier acceptance records. They are not full Ultracode-parity certification or a reliability-rate claim. Required CI, tag verification, publication and exact published-version installation are separate gates.

## Session delivery candidate

Published 0.3.0 passed 246/246 tests, package checks, detached process smoke, clean native plugin discovery/installation and a production audit with zero vulnerabilities, followed by required Windows PR/tag and exact installed-release verification. The release assets retain [installed native acceptance](https://github.com/ehartye/agent-workflow/releases/download/v0.3.0/installed-release-verification.json) and [installed browser acceptance](https://github.com/ehartye/agent-workflow/releases/download/v0.3.0/session-dashboard-browser-installed.json).

The unpublished 0.3.1 candidate at source digest `33b2b029c748972e7d62127dcf5821bee59bd778d40c6f48b3190815089d2f21`, Node 24.18.0, passed 393/393 tests, package check and smoke before this documentation closeout and the subsequent terminal-notification/watch corrections. This includes shared readiness/task deadlines, verified invocation metadata, strict native resource identities and declared external references. Earlier 347-test and eight-view browser checkpoints remain historical evidence. Controlled load accepted 8,195 SQLite/QuickJS observations; it is not a throughput or reliability guarantee. Final package checks, clean installation, audit, Windows PR/tag gates and exact installed-release verification remain required after closeout.

[Public native skill proof](../reports/public-native-skill-tools.json), run `0cc2103c-babe-436b-b7d1-837477c0b3c0` on retained `b69cce4a7ac32e14`, observed genuine paired executor list/read calls, an independently matched hidden marker, zero model commands and positive owned-job/native drain. [Managed Beeps authoring](../reports/native-beeps-authoring.json), run `a5ec5b30-5892-4926-b491-08be8f42f2e5` on `33b2b029c748972e`, separately observed native skill calls and real init/new/list operations. Coordinator checks verified capture integrity, original input preservation and saved patch fields, with positive cleanup. Its accepted scope is nonrendering authoring; WAV render/export and listening remain unverified. Sprite export remains blocked by the observed loopback `EACCES` incident. See [the friction ledger](friction-delivery.md) for retained failed/partial outcomes; no later result rewrites them.

The Tidepool case study exercised real subscription-backed workers, retained failed/unknown outcomes and deliberately recovered only integrity-verified patches with positive native drain. The [delivery record](../.agents/workflows/session-plugin-delivery.md) records ownership, hashes, failures and coordinator integration. Tests reproduce evaluator lifetime, large-output retention, final-answer selection, immutable capture identity, visibility/retirement, retained-runtime routing and lost-response receipt failures before fixes. Independent review found and corrected aggregate-drain, queued-attempt and receipt-adapter mismatches.

The [session browser report](../reports/session-dashboard-browser-check.json) verifies the installed 0.2.1-labelled candidate presentation on a real retained run: eight viewport/theme combinations, phase connectors, session navigation, fragment removal and no page errors. This is bounded rendered acceptance, not model quality, final 0.3.0 installation or a destructive-prune test. Development pruning used disposable fixtures only. The repeatable harness is [check-monitor-browser.mjs](../scripts/check-monitor-browser.mjs); it requires explicit installed Playwright and authenticated loopback inputs and performs no execution/lifecycle mutations.

The separate [three-layout Sites report](../reports/dashboard-layout-options.json) records 139/139 local browser checks, six desktop/phone views, painted text review, keyboard focus and dependency routing, plus the publishing coordinator's exact source/deployment identity. The [published preview](https://agent-workflow-layout-options.ehartye.chatgpt.site) uses sample data; it is not a deployed replacement for the production monitor. The [original delivery failure](../reports/layout-failure-root-cause.md) remains unknown with an empty verified capture; direct coordinator authoring did not relabel it.

## Earlier 0.2.0 acceptance

The earlier candidate passed 166/166 tests, package check, process smoke, clean native plugin installation and a production audit with zero vulnerabilities. The following historical reports describe their recorded versions and dates; they do not verify later source changes.

## Fresh native evidence

| Evidence | What was observed |
| --- | --- |
| [Engine](../reports/engine-local-acceptance.json) | Two managed-ChatGPT file reads and completed-prefix replay with dispatch counts [2,0] |
| [Background lifecycle](../reports/background-local-acceptance.json) | Pause, saved-script resume and completed replay; attempts [1,2,2], cached [0,1,2] |
| [Structured output](../reports/structured-local-acceptance.json) | Successful command, exact JSON result, retained settings and replay [1,0] |
| [Activity](../reports/activity-local-acceptance.json) | Native command activity persisted during execution, 59 observed events, usage and cached evidence |
| [Individual controls](../reports/individual-controls-local-acceptance.json) | Exact-attempt steering/cancellation while sibling work continued; job-scoped cleanup |
| [Reconciled restart](../reports/reconciled-restart-native.json) | Replacement generation after cancellation, stale duplicate rejection, retained prior error/activity/usage and explicit reconciliation |
| [Writable workflow](../reports/native-writer-workflow.json) | Two separate worktrees with native patch edits and checks, unchanged source/index/config, retained patches and replay without more turns |
| [Final 0.2.0 candidate](../reports/managed-release-workflow.json) | Actual installed native command completed with expected marker; owned Windows job empty; saved workflow replay used no additional model turn; dashboard 401/200 |
| [Managed installed workflow](../reports/managed-install-workflow.json) | Saved generated command/named workflow, real marker read, original-session replay, dashboard unauthenticated 401/authenticated 200 |

The installed-workflow report is a **fresh-engine candidate checkpoint before the final package manifest/version cutover**. Its runtimeId starts with 0.1.1 because that was the package label at capture; the report explicitly says release:false. It proves the recorded installed engine path, not publication or verification of a final 0.2.0 artifact.

The current clean native plugin installation check passed without model inference. It exercised isolated plugin discovery/onboarding, production-only managed dependencies, CLI definitions/generated commands, mode/hook routing, unauthenticated account refusal and runtime upgrade boundaries. It does not prove trusted prompt-hook activation in every host or a completed model workflow. The final 0.2.0 candidate native report additionally verifies a completed model workflow from the installed package. Publication remains a separate gate.

## Boundaries and browser evidence

The [preexisting hardlink probe](../reports/workspace-preexisting-hardlink-limitation.json) **failed** its desired outside-write boundary with zero inference requests. A host-precreated hardlink permitted an outside target write. Preserve this failed evidence. Independent input copying and pre-dispatch link refusal mitigate it; [limitations](limitations.md) states the remaining boundary.

Separate [command](../reports/workspace-command-boundary.json) and [native patch](../reports/workspace-patch-boundary.json) checks record denied external writes. Cleanup establishes owned Windows job termination, not arbitrary descendants or external effects. Native terminal cleanup remains an independent requirement.

The [monitor browser check](../reports/monitor-browser-check.json) used explicit simulated workers to inspect light/dark themes, persisted preference, graph selection/dependencies, authentication fragment removal and a narrow viewport. The [activity browser check](../reports/activity-browser-check.json) inspected retained real native activity and cached source provenance, including command input/output/exit evidence. Its then-pending individual controls were added later; that earlier browser report does not verify those later controls.

## Skill evidence

The [fresh Yoda report](../reports/yoda-fresh-skills.md) records simultaneous with/without-skill agents across three realistic tasks and three near misses. The candidate supplied an executable workflow and correctly explained repeated suffix effects; both variants respected routing permission boundaries. Independent checks parsed command forms and executed the candidate script in separate QuickJS with a deliberately failed fixture verifier, retaining its null/unverified slot. No native model calls or configuration mutations were made by these probes. One pair per prompt cannot establish general superiority.

## Repeatable release checks

Run with Node 24+ on Windows:

```powershell
npm ci --ignore-scripts
npm test
npm run check
npm run smoke
node scripts/check-install.mjs
npm audit --omit=dev
```

The suite and smoke use deterministic offline fixtures and actual process/persistence boundaries. Native installation starts no inference and needs npm network access or cache. Managed-ChatGPT acceptance is separate, explicit and consumes subscription usage. Required Windows PR/tag verification gates publication. Do not replace current results with historical test counts.

Before claiming release complete, record the final full suite/check/smoke, clean package installation, production audit, required CI, published tag/version and installation of that exact version. The local native reports above remain useful but do not substitute for those gates. SSH acceptance is scoped in the Session 0 section below.

## Historical 0.1.x evidence

Earlier releases used RuntimeManager, a supervisor JSON journal and MCP surfaces. Their authenticated exec/app-server tests, MCP bootstrap/onboarding, 123/139-test counts, old dashboard observations and prior skill audit established behavior of that implementation at those checkpoints. They are **not fresh-engine verification**. Historical documentation remains available through repository history and [the earlier skill audit](skill-audit.md).

Existing 0.1.1 user data and matching runtime directories are preserved on disk; the new source package removes the custom MCP surface and does not migrate old runs automatically. Do not interpret preservation as a successful fresh-engine resume of a legacy run.

## Windows Session 0 compatibility

The 0.3.2 implementation adds explicit `--session0-desktop shared` to Windows MXC doctor and new runs. Omission preserves inherited desktop behavior. Native session lookup rejects nonzero or unavailable sessions before child creation. The fixed selection changes no token, desktop ACL, Codex binary or sandbox filesystem/network arguments. Saved runs retain the setting; the host application receipt is separate from command admission and real execution.

On HAL9000, Windows 26200.9711 x64, Node 24.21.0, the isolated candidate 0.3.1-5404faa80ae1e60b-node24.21.0 passed all six doctor admission stages under elevated OpenSSH Session 0. Real managed-subscription run dfae1f97-d03b-46ac-bc98-afd08fe06060 executed a Node marker, completed with one worker and no failed/unknown slots, recorded application on the worker, and confirmed empty owned jobs. The regular desktop Session 1 doctor passed with inherited selection. Detached writer run 4d7860a0-5fe5-43cf-882a-ec1a241588d1 also completed over SSH, created proof.txt only in its isolated worktree, consumed attached/terminal watch records and resumed with one cached worker and no new inference. Owned jobs drained in both generations. These are candidate receipts; final released-package acceptance is recorded separately.

Measured UI caveat: same-session owned window-process and global-atom lookup succeeded; the tested custom window message was denied. This is not UI isolation equivalence or a comprehensive security assessment. Non-admin tokens, other Windows builds and other service accounts remain unverified. Operational guidance is in [Session 0 compatibility](../skills/workflow-setup/references/session0-compatibility.md); architectural rationale and investigation evidence live in the owner wiki.
