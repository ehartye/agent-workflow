# Verification record

This page describes evidence for the **fresh 0.2.0 candidate** as of 2026-10-13. It is not a release announcement, full Ultracode-parity certification or a reliability-rate claim. Local release checks passed: 166/166 tests, package check, process smoke, clean native plugin installation and a production audit with zero vulnerabilities. Required CI, publication and exact published-version installation remain pending.

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

Before claiming release complete, record the final full suite/check/smoke, clean package installation, production audit, required CI, published tag/version and installation of that exact version. The local native reports above remain useful but do not substitute for those gates. SSH is deferred.

## Historical 0.1.x evidence

Earlier releases used RuntimeManager, a supervisor JSON journal and MCP surfaces. Their authenticated exec/app-server tests, MCP bootstrap/onboarding, 123/139-test counts, old dashboard observations and prior skill audit established behavior of that implementation at those checkpoints. They are **not fresh-engine verification**. Historical documentation remains available through repository history and [the earlier skill audit](skill-audit.md).

Existing 0.1.1 user data and matching runtime directories are preserved on disk; the new source package removes the custom MCP surface and does not migrate old runs automatically. Do not interpret preservation as a successful fresh-engine resume of a legacy run.
