# Verification record

This is verification of the local plugin implementation against the approved regular-plugin boundary. It does not establish native Codex UI integration, inherited parent-session grants, or a shared hard token pool.

## Execution evidence

- Authenticated Codex 0.162.1 `exec` worker: strict JSON `{ok:true,note:"verified"}`, read-only filesystem, no network, approvals never, low effort; completed in about 4.5 seconds. Observed usage: 18,394 input and 19 output tokens.
- Authenticated default `app-server` worker: the same strict result and permissions; completed in about 5.8 seconds. Observed usage: 26,192 input and 19 output tokens.
- Authenticated detached-supervisor workflow: two strict app-server workers completed in parallel, then an edited post-processing return reused both calls with zero new attempts. The final integration completed in about 8 seconds; cumulative observed usage remained 52,538 input / 38 output tokens across replay, with both worker usage records observed.
- All six bundled task shapes ran through the actual separate-process QuickJS evaluator and manager with a deterministic failure backend. Audit, changed-file review and research retained failed slots. Fixing stopped after two consecutive no-progress rounds. Discovery stopped after two consecutive dry rounds and retained an ID of `__proto__` without collision. Migration requested separate worker worktrees; real Git/process tests verify the isolation mechanism independently.
- The fresh package-copy check starts without `node_modules`. The pinned native Codex CLI installs the local marketplace plugin in an isolated home; its parent app-server calls the dependency-free cold `workflow_setup_info` tool and supplies exact hashed host data paths. Explicit setup installs pinned dependencies outside the plugin cache. Reconnecting exposes production workflow tools. Portable SDK MCP, CLI fixture execution, custom `--data-dir` without host environment variables, and refusal of a changed package also pass. This check starts no model turn and does not trust hooks.
- Browser checks use actual persisted child-process fixture runs. Worker detail, script composer, pending approval and denial controls were exercised. Fixture runs are identified as fixtures, not model effectiveness measurements.

## Authoring evaluation

The same request for a file audit with independent finding verification was sent to Codex with and without the actual authoring skill and API reference. Both generated scripts ran through the actual evaluator. A missing audit and a failed verifier remained missing in each report. The skill-assisted script was shorter (about 6.3 KB versus about 11 KB); this pair does not establish a general quality advantage. An earlier default-configuration attempt stalled and was terminated; it is inconclusive, not a quality failure.

All three skills passed the official `skill-creator` validator. Its PyYAML prerequisite was installed into an isolated ignored development virtual environment; Python is not a plugin runtime dependency.

The pre-release [Yoda audit](skill-audit.md) covers all three skills, cross-skill triggers and directly linked references. Its corrections and matched actual-Codex dry-run control/setup/mode comparisons are recorded separately from the executed authoring and installation checks.

A separate authenticated routing check applied the actual skill to five requests. A programming explanation and one-label spelling fix stayed in normal conversation; saved-run inspection, reusable audit creation and pause/reconciliation routed to the workflow skill. All five matched the intended boundaries (18,923 input / 102 output tokens). This checks one model response, not a guaranteed classifier for every future prompt.

## Repeatable checks

Run from the repository with Node 24+:

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run smoke
node scripts/check-install.mjs
npm audit
```

The standard suite and smoke use local processes and Git fixtures without credentials. Authenticated model runs above are separate bounded checks, not part of the offline test suite. Detailed generated evidence is retained under ignored `test-output/` in the development worktree.

Final checks on Windows with Node 24.18.0 and pinned Codex 0.162.1: **118 tests passed** (49 runtime, 49 worker, 20 surface/recipe/bootstrap); plugin/schema checks, offline process smoke and native install checks passed; npm audit reported zero vulnerabilities. All three skills passed the official validator. Linux/Darwin recovery and native hook trust activation were not exercised.

Release checks exposed startup-sensitive test deadlines on a busy host: a fixture's first tool event arrived at 289 ms, beyond its original 100–150 ms guards. Test files now run with concurrency two, with fixture waits deliberately longer than the stall window and hard deadlines shorter than tool completion. Expected error/effect assertions are preserved; seven focused watchdog checks and the complete 118-test suite passed. Native installation additionally verifies the MIT notice is copied into managed runtimes; schema attribution and Apache 2.0 license are retained in the distribution.

The first hosted Windows CI run exposed two fixture assumptions: a 30 ms fake-worker delay did not guarantee overlap while journal writes ran, and the runner's temporary directory used an 8.3 short spelling while Git returned its long spelling. The concurrency fixture now holds the first pair until both have entered, and the worktree assertion compares real paths. Production concurrency, isolation and timeout behavior are unchanged.

## Review boundary

Independent specification review and subsequent code-quality review both passed after corrections. The quality reviewer independently reran six recovery, seven runtime and six service/daemon tests, including shutdown during an actual pending native steering request in about 497 ms. No material findings remained. The final full suite, install check and authenticated parallel/replay run passed after the lifecycle changes.

Review corrections include serialized resume/cache admission, stale-controller takeover, conservative abandoned-worker effects, authoritative atomic journal commits, semantic-runtime identity, native quota/reset integration, tool-aware stall clocks, finite drain failures, invalid usage, exact onboarding paths, partial-source coverage and installed CLI data-directory selection. The bounded schema subset excludes `uniqueItems`: an observed 248,901-byte / 20,000-object check blocked host validation for about 3.2 seconds, and repeated primitive `__proto__` values were incorrectly accepted by the installed validator. These cases now reject before worker dispatch.

Final lifecycle regressions establish that an absent parent PID cannot prove descendant drain; cancellation preempts a pending control request; shutdown closes admission and drains admitted operations; terminal status follows worker drain; and recovery inspects unfinished worker slots even in completed/failed snapshots. Recovery still cannot establish that detached processes or external effects have ended. Native lifetime handles and cross-platform verification remain documented follow-up work.
