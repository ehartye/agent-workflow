# Test audit and strategy

## Graphical monitor reassessment

Agent-tests 0.3.2 inventories 26 files with no wiring or tier gaps. This delta reviews the changed controller and two new monitor owners. The 23 other files retain their preceding verdicts; this is not a new certification of released code. Shared controller imports cover different seams: direct scheduling invariants versus authenticated HTTP behavior. Fixed-database findings remain unique temporary fixtures.

| File | Tier | Verdict | Evidence | Estimated agent tokens | Churn/edits |
|---|---|---|---|---:|---|
| engine-controller.test.mjs | critical | keep | Adds stale-generation refusal under exclusive ownership, prerequisite ordering without occupying concurrency, failed/invalid prerequisite refusal and persisted edges. | 4,243 | 0/1 |
| engine-monitor.test.mjs | critical | keep | Actual loopback HTTP auth/host/origin/CSP, bounded versus deliberate evidence, durable controls and real detached monitor after launcher exit. | 1,565 | 0/0 |
| engine-monitor-ui.test.mjs | critical | keep | Executes actual HTML/app in LinkeDOM: themes/auth, text safety, graph and capped phase coverage, generation-specific evidence, truthful receipts and failed polling. | 3,301 | 0/0 |

Full merge verification passes **205/205** in one 45.2-second Windows run, with package check and smoke. Independent review found and regression tests fixed expanded results surviving generation changes and old pending receipts reappearing after persistence. UI tests also caught stale expanded worker status and misleading phase totals beyond the 60-node graph limit. The earlier full run caught the worker-status regression while this test/fix was being completed; the final suite includes the corrected behavior.

Actual browser checks cover light and dark themes, 390-pixel mobile layout without document overflow, removed auth fragment, node selection, three declared dependency arrows and changing discovered-worker percentage. These use explicitly simulated workers and do not establish native model/tool streaming. See `reports/monitor-browser-check.json`. Native execution evidence remains the separate foundation/engine/background reports. CSS has no automated visual-diff baseline.

No tests deleted, merged, demoted or quarantined; estimated tokens removed 0 and edit-lane demotions 0. The existing Windows PR platform exception remains. Statistical flakiness, CI cost and other operating systems remain unmeasured. Time: focused HTTP/UI tests are under one second each on this host; full checks remain at merge. Risk: DOM tests cannot certify browser CSP/layout, so actual browser inspection supplies distinct evidence. Complexity: use the existing Node/LinkeDOM tools. Best practice: real HTTP and process boundaries test auth and lifetime; DOM tests own display transitions. Maintainability: controller, HTTP and UI seams have separate owners and no legacy runtime imports.

## Background controls reassessment

Agent-tests 0.3.2 inventories 24 files with no wiring or risk-map gaps. The critical/merge controller owner now has 14 cases; the new background file has two static declarations expanded by Node into three cases. All 17 focused cases pass. They exercise real QuickJS, SQLite and detached processes with deterministic workers; native acceptance separately proves managed-ChatGPT execution. Independent review found and regression tests fixed pause-to-stop deadline escalation, incomplete mailbox settlement, and premature terminal publication on both success and failure.

| File | Tier | Verdict | Evidence | Estimated agent tokens | Churn/edits |
|---|---|---|---|---:|---|
| engine-controller.test.mjs | critical | keep | Durable controls, replay refusal after unknown execution or failed cleanup, bounded drain, late-write refusal and final publication. Both fixed-database findings are unique temporary directories, not shared paths. | 3,722 | 0/0 |
| engine-background.test.mjs | critical | keep | Real launcher exit, independent CLI pause/status, saved-script resume, precommit timeout and redacted startup failure without dispatch. | 1,093 | 0/0 |

The 22 unchanged files retain their preceding verdicts; this scoped reassessment does not recertify legacy code. No tests are removed, merged, demoted or quarantined: estimated tokens removed 0, edit-lane demotions 0. The Windows PR exception and previously reported agent-tests temporary-database false positive remain unchanged. Statistical flakiness, CI cost and other operating systems remain unmeasured.

The full suite passes **192/192** in one 43.2-second Windows run; package check and smoke pass. Native background acceptance records pause/resume/replay attempt counts `[1,2,2]`, cached counts `[0,1,2]` and normal owned-server exit in each generation. An earlier observation failed despite a retained paused run; its original cause remains unknown. Native checks remain explicit and outside CI.

Keep the controller/background files together for control edits. Time: one observed 2.4-second focused run, with full checks before pushing. Risk: fixtures cannot certify native interruption or descendant containment, which remain separately qualified. Complexity: no additional test runner or selection cache. Best practice: actual process and durable state boundaries own these regressions. Maintainability: these tests import no released runtime and survive its replacement.

The subsequent cancellation delta adds six real-subprocess turn cases: pre-cancelled calls, running interruption, delayed start acknowledgement, missing terminal acknowledgement, acknowledgement arriving after the interruption deadline, and natural completion racing cancellation. The late-acknowledgement case reproduced and fixed a protocol action after the caller had returned. These extend the existing critical turn-test owner; no parallel test framework or new native CI dependency is added. The explicit one-turn native check requires command startup and terminal status `interrupted`, then verifies retained-server usability. No command-completion item arrived, so descendant state remains unverified.

This cancellation checkpoint passes **181/181** full tests in one 48.6-second Windows run, package validation and smoke. Independent review found no remaining important/critical issue for the slice. Agent-tests still inventories 23 files with no wiring/risk gaps; the turn file is kept at critical/merge, approximately 1,165 tokens and 0/0 recorded churn. Existing shared-subject and temporary database findings retain their documented verdicts.

## Fresh engine reassessment

The checked agent-tests 0.3.2 runtime inventories 23 files. The owner-approved critical runtime tier extends to `engine/**`. This delta audit inspected all three new files and their subjects. The 20 unchanged files retain their preceding verdicts; five unflagged existing files remain kept without reopening. New coverage uses real QuickJS children and temporary SQLite databases, with a deterministic backend fake. Explicit native acceptance separately owns actual Codex behavior.

| File | Tier | Verdict | Evidence | Estimated agent tokens | Churn/edits |
|---|---|---|---|---:|---|
| engine-controller.test.mjs | critical | keep | Ordered dispatch, concurrency, durable replay, changed timeout/failure suffixes, ownership and corrupt/unknown records. `worktree.fixed-db-file` is a false positive: each database is beneath a unique `mkdtemp` run directory. | 1,458 | 0/0 |
| engine-evaluator.test.mjs | critical | keep | Actual isolated child proves pipeline independence, ordered null slots, forbidden host/import/clock access and bounded failing evaluation. | 689 | 0/0 |
| engine-policy.test.mjs | critical | keep | Effective capability rejection, disabled versus active MCP inventory, safe keyed overrides and stable backend identity. | 697 | 0/0 |

All 13 new cases passed. The full suite passed **175/175** in one 41.0-second Windows run; package check and offline smoke passed. Independent review found no remaining important/critical issue for this slice. Native acceptance passed two exact file reads and replay with zero further worker dispatches. One prior native attempt failed admission before inference without sufficient stage detail; the backend now retains admission diagnostics. No claim of statistical reliability follows from these runs.

No risk-map or wiring gaps were reported. Existing shared-subject and temporary `.git` findings retain prior verdicts; the Windows PR exception remains. No deletion, merger, demotion or quarantine: tokens removed 0, edit-lane demotions 0. CI cost, statistical flakiness and other operating systems remain unmeasured.

Keep direct selection of the three engine files during edits, adding foundation files when transport changes. Time: approximately 1.5 seconds for the observed engine check, with full checks at merge. Risk: the native canary protects the real integration boundary that fakes cannot prove. Complexity: no new test-selection framework. Best practice: one owner per protocol, isolation, persistence and policy seam. Maintainability: the fresh engine has no released-runtime imports; its tests can survive removal of that architecture.

## Fresh foundation reassessment

Agent-tests 0.3.2's checked runtime inventories 20 test files after the independent foundation work. The existing owner-approved production/consumer map applies; `foundation/**` has the same critical auth/execution tier as the worker boundary it will replace. The new tests are merge-lane subprocess contracts, not model calls. The scoped reassessment reads both new files and the existing flagged temporary `.git` fixtures; unchanged release files retain the prior audit below, rather than claiming another fresh review of every legacy seam.

| File | Tier | Verdict | Evidence | Estimated agent tokens | Churn/edits |
|---|---|---|---|---:|---|
| codex-foundation.test.mjs | critical | keep | Real stdio children exercise framing, request identity, auth/config gates, terminal cancellation and redacted failure reports. Shared client subject with turn tests protects a different seam. | 2,429 | 0/0 |
| codex-turn.test.mjs | critical | keep | Early events and overlapping threads must not cross-route results; failed turns, disconnects and unknown interruption state never become success. | 593 | 0/0 |

The 23 expanded new cases passed in about 3.4 seconds. The complete suite passed 162 cases in 39.3 seconds on this host; this is a single observation, not a benchmark. Package check and offline smoke passed. Separately, the explicit native acceptance check passed six zero-model stages and two managed-ChatGPT worker reads with MXC. Native checks consume subscription usage only when `model-check.mjs` is explicitly run; they are outside automated CI. Ordinary tests never read credentials or invoke Codex.

No missing tiers or wiring gaps were reported. Five unflagged existing files retain the earlier keep verdict without reopening: dashboard, observation, journal, worktrees and evaluator. The 13 flagged unchanged release files retain their prior reviewed verdicts; this delta audit does not newly certify them. The `.git` warnings are temporary fixtures, not reads of the real checkout's Git directory. The Windows PR frequency finding remains the existing verified-target exception. No tests were deleted, merged, demoted or quarantined: estimated tokens removed 0, edit-lane demotions 0. Statistical flakiness, CI minutes and full OS portability remain unmeasured.

Keep direct file selection for foundation edits and full merge checks before pushing. Time: about 3.4 seconds for the new seam versus one observed 39.3-second full run, with broad regression detection at merge. Risk: transport/probe/turn changes may share failure handling, so select both files together. Complexity: no new runner or cache. Best practice: fixture transport owns deterministic protocol failures; explicit native acceptance owns actual Codex behavior. Maintainability: the fresh transport has no legacy imports, so no need to preserve or optimize the failed architecture to test it. Review this decision when the fresh controller replaces released entrypoints.

## Released runtime audit

Agent-tests 0.3.2 audited the v0.1.0 release and the v0.1.1 monitor change using its checked managed runtime. The owner confirmed production, consumers of plugin installs, saved workflows/commands, persisted runs and MCP, and the tiers in [.testing/risk.yml](../.testing/risk.yml). Preserve these consumers when changing versions. The compact client's older-supervisor path protects an actual installed 0.1.0 controller; it does not replace the matching immutable runtime required by stored runs.

The monitor reassessment inventories 18 files with no missing tiers, shim or wiring findings. Keep the seven observation cases and 14 dashboard cases: they own bounded authenticated response/CLI contracts and actual HTML/app behavior, respectively. They caught real oversized metadata, lost journal ranges, hidden recovered failures and misleading resume controls. Shared-subject findings on existing manager/transport/integration files retain the earlier keep verdicts; their seams differ. The two `.git` warnings remain unique temporary repository fixtures. Windows PR execution remains the approved verified-target exception. No tests are removed, merged, demoted or quarantined.

A full Windows run exposed a cleanup race in the drain-failure test fixture: its harness had already verified and killed the child, while the parent attempted recovery again. The harness now reports its verified drain receipt; the parent asserts that receipt before skipping fallback cleanup. Production orphan recovery remains unchanged and still rejects absent roots. The observed-red receipt assertion, both transport fixtures and the subsequent full **139-test** run pass. The full run took 37.6 seconds on this host; it is one observation, not a statistical flakiness or speed claim. Clean native installation, package checks, smoke and production audit also pass. Browser rendering remains unverified without an attached surface.

## Verdicts

The initial static inventory found 16 files and 112 declarations; the native runner expanded them into 118 cases. The final inventory has 17 files and five additional dashboard cases. Shared imports identify candidates for inspection, rather than duplicate behavior. All flagged files and their exercised seams were inspected.

| File | Tier | Verdict | Evidence | Estimated agent tokens before changes | Churn/edits |
|---|---|---|---|---:|---|
| surfaces.test.mjs | critical | rewrite, then keep | Replace call-count-only forwarding with exact arguments and valid `decline`; verify auth, host and CSP. `.git` directory warnings are isolated temporary repository fixtures. | 1,393 | 0/0 |
| workers-recovery.test.mjs | critical | rewrite, then keep | Replace fixed fake Windows SystemRoot with a unique temporary fixture. Actual identity, descendants and failed drain checks remain. | 1,586 | 0/0 |
| runtime-manager.test.mjs | critical | keep | Scheduler, replay identity, durable admission, uncertain effects and permission ceilings own manager invariants. Integration/recipe tests exercise different contracts. | 9,703 | 2/2 |
| workers.test.mjs | critical | keep | Real child-process protocol adapters, approvals, quota and stall clocks own transport behavior. | 5,078 | 1/1 |
| surfaces-recipes.test.mjs | critical | keep | Execute bundled scripts through QuickJS; test recipe-specific lost slots and stopping rules rather than repeating manager internals. | 1,775 | 0/0 |
| workers-integration.test.mjs | critical | keep | Actual manager/backend quota boundary distinguishes verified reset from uncertain tool effects. | 939 | 0/0 |
| runtime-script.test.mjs | critical | keep | Schema and literal metadata rejection before dispatch; recipe parsing alone cannot replace these adversarial inputs. | 883 | 0/0 |
| surfaces-mcp.test.mjs | critical | keep | Real SDK stdio client tests compact/detail contracts, bounds and recursion. Add subjects for dynamically reached MCP/CLI code. | 852 | 0/0 |
| surfaces-bootstrap.test.mjs | critical | keep | Cold dependency-free onboarding and changed-runtime pointer preservation differ from warm launch selection. | 750 | 0/0 |
| surfaces-shutdown.test.mjs | critical | keep | Real pending HTTP steering request must not prevent worker drain. | 695 | 1/1 |
| surfaces-launcher.test.mjs | critical | keep | Installed CLI selects explicit data without host-variable masking, rejects missing values. | 483 | 0/0 |
| surfaces-command.test.mjs | critical | keep | Saved command refuses unrelated skill collision before any script write. | 324 | 0/0 |

Three unflagged, tiered files were kept without reopening during this audit: runtime-journal, runtime-evaluator and workers-worktrees. The daemon check was inspected and kept: it owns actual service lifecycle/receipt behavior. The new dashboard check was separately reviewed. No tests were deleted, merged, quarantined or demoted; estimated tokens removed: **0**, edit-lane demotions: **0**.

## Applied strategy

- All files declare the merge lane. Subprocess and DOM-loaded subjects are explicit. Tags record ownership; the Node command runs the full merge scope.
- Five dashboard checks load actual HTML and execute owned app code against LinkeDOM. They cover fragment/session authentication, evidence rendered as text, approval denial, selected-worker controls and restart confirmation, explicit admission permissions/limits, and edited resume. Two deliberately broken variants (HTML insertion and omitted fragment cleanup) fail. These checks do not certify browser layout, CSP enforcement, clipboard permissions or native dialogs. Earlier real-browser fixture checks remain separate evidence. LinkeDOM is a pinned development dependency, excluded from the managed runtime install.
- A fresh native install first failed its new development-dependency exclusion assertion; setup was corrected to use `npm ci --omit=dev`, and the same isolated installation then passed. The project installation still includes development dependencies for tests.
- No missing tiers or uncovered-critical findings remain in the static inventory. This is subject association, not numerical code coverage. Setup/update checks additionally live in `scripts/check-install.mjs`, outside the unit inventory; skill behavior has its separate [Yoda audit](skill-audit.md).
- Windows is the verified deployment target, so its required PR observer is an explicit exception to agent-tests' Linux-default advice. Linux/macOS remain unverified. The generic Windows frequency warning remains; no private-repository billing estimate is applied to this public repository.
- Documentation-only PRs complete the required job without running the suite; filtering occurs inside the job because workflow-level filters leave required checks pending. Unknown paths conservatively run checks. Code PRs, nightly runs and release tags run tests, package validation, smoke, clean native installation and dependency audit. Superseded PR jobs cancel. There is no duplicate main-branch push job.
- Edit: run affected test files plus relevant package checks. Merge: full tests, check and smoke. Release: all of these plus clean native installation and production dependency audit; publish only after tag verification succeeds. Do not infer affected tests solely from imports: scripts, HTML, fixtures, recipes and manifests are non-imported inputs.

## Cost and architecture advisory

Static agent cost estimates are file token counts; wait/CI costs and statistical flakiness are not measured by agent-tests. A previous successful Windows CI run took about 154 seconds for the job, including 49 seconds for tests and 68 seconds for installation. These are single-run observations, not benchmarks or estimates of future speed. Earlier contention failures led to two test-file workers and startup headroom; no claimed speed gain is inferred from a failed baseline.

Retain the current manager/transport/recipe/surface boundaries and use direct file selection during edits.

- **Time:** no product redesign; short focused checks now, full regression detection before merge.
- **Risk:** incomplete import-only selection can miss HTML or subprocess inputs; full merge and installation checks retain protection.
- **Complexity:** one committed risk map and explicit subjects; no selection cache or extra runner framework.
- **Best practice:** public behavior has one owner at each seam; integration checks protect the connections.
- **Maintainability:** update the map and subjects with new entrypoints; preserve unique fixtures and bounded cleanup.

Move clean native installation to release-only only if measured PR cost later justifies delayed detection.

- **Time:** could avoid roughly one observed 68-second step per code PR; install failures would appear later. This is an estimate from one run.
- **Risk:** wrong data directories, onboarding or dependency-copy regressions could reach main; retain cold/warm launcher tests and require a clean-install result for the same commit before release.
- **Complexity:** adds conditional lanes and a release gate; currently unnecessary.
- **Best practice:** deferring a critical public installation contract needs evidence, so this remains advisory.
- **Maintainability:** more CI paths and ownership; reconsider after collecting several successful run timings.

Agent-tests currently scans ignored mutation probes if they use test filenames, although `npm test` includes only `test/*.test.mjs`. The evidence was corrected by renaming probes before the final scan. Its Windows warning does not account for repository visibility. These tool limitations belong in the agent-tests roadmap; neither justifies weakening coverage.

## Structured-worker checkpoint

The checked Agent-tests 0.3.2 runtime inventories 29 files after this delta, with no missing tiers, wiring or shim findings. Existing unchanged-file verdicts stand. The same Windows PR frequency exception applies. Four worktree warnings remain false positives: fixed SQLite filenames live inside unique `mkdtemp` roots, and the two `.git` directories are owned project fixtures. No test was removed, merged, demoted or quarantined; estimated tokens removed and edit-lane demotions are both zero.

| Reviewed file | Tier | Verdict | Ownership and evidence | Estimated tokens | Churn/edits |
|---|---|---|---|---|---|
| engine-controller.test.mjs | critical | keep | Actual evaluator/SQLite replay, known-invalid versus unknown outcomes and durable shared correction reservations; fixed-db warnings use unique roots. | 5384 | 0/2 |
| engine-worker-session.test.mjs | critical | keep | Same-thread corrections, exhaustion, cancellation/transport refusal and shared deadline. Shared-subject overlap with controller protects a different persistence seam. | 937 | 0/0 |
| codex-turn.test.mjs | critical | keep | Real subprocess protocol verifies schema/model/effort forwarding and exact thread/turn routing. | 1288 | 0/1 |
| engine-background.test.mjs | critical | keep | Actual detached resume retains defaults, including partial overrides preserving model/effort. | 1190 | 0/0 |
| engine-schema.test.mjs | critical | keep | Valid/invalid JSON, nullable contradictions, enum/integer constraints, strict serialization and deterministic work admission. | 1146 | 0/0 |
| engine-settings.test.mjs | critical | keep | Effective catalog/config/run/worker choices and refusal of unsupported settings or broader permissions. | 536 | 0/0 |

Counts and token estimates above are the static scan before the final partial-resume regression; they are not runtime cases or timing estimates. The added partial-override assertions first failed and then passed in the existing detached test. Final verification passed all 222 native-expanded cases in one observed 52.7-second run, plus package check and smoke. Independent review confirmed the resume fix and found no remaining important findings in this slice. Static tooling does not measure CI cost or statistical reliability.

The native `structured-check.mjs` separately proves one managed-ChatGPT command, exact validated JSON and zero-dispatch replay; its sanitized report is committed. Offline tests own correction/failure permutations so CI does not spend subscription usage. Independent review found and resolved nullable schema contradictions, silent non-JSON serialization, unconstrained enum work and partial-resume default loss. Keep the existing architecture advisory above: focused edit checks plus full merge checks, without a new selector/cache or duplicate native smoke calls.

## Live activity checkpoint

Agent-tests 0.3.2 inventories 30 test files with no missing tiers, wiring or shim findings. This delta retains the existing unchanged-file verdicts and the Windows PR exception. Six worktree warnings resolve to unique temporary roots or owned fixture `.git` markers. No tests were deleted, merged, demoted or quarantined; estimated tokens removed and edit-lane demotions remain zero. The existing cost/architecture advisory applies; no new runner, cache or duplicate native smoke was introduced.

| Reviewed file | Tier | Verdict | Ownership and evidence | Estimated tokens | Churn/edits |
|---|---|---|---|---|---|
| engine-controller.test.mjs | critical | keep | Real SQLite rollback cannot leak usage; cached evidence preserves original history and attempts; active state is observable before completion. Fixed database names are inside unique roots. | 6384 | 0/3 |
| engine-monitor.test.mjs | critical | keep | Actual authenticated HTTP paging, generation preconditions, bounded retention and corrupted counter rejection. Shared controller imports protect the HTTP seam. | 2061 | 0/0 |
| codex-turn.test.mjs | critical | keep | Real subprocess routing/steering plus deterministic microtask reproduction of a completion masking lost activity; raw reasoning excluded. | 2384 | 0/2 |
| engine-activity.test.mjs | critical | keep | In-memory SQLite owns normalization, bounded retention, pagination and monotonic per-thread usage. | Not ranked in abbreviated report | New file |
| engine-monitor-ui.test.mjs | critical | keep | Executed DOM app checks generation-bound history, graph activity, text-only evidence and disclosed omissions; distinct from layout verification. | Not ranked in abbreviated report | Existing file |

The final full suite passed 238 expanded cases in one observed 52.3-second run, plus package check and smoke. Independent review passed 59 affected cases and found no remaining important issues. Review regressions first failed for the terminal callback race, rollback leakage and inconsistent activity coverage, then passed after fixes. Static inventory does not measure CI cost, flakiness or numerical coverage.

The extended existing native check consumed one managed-ChatGPT turn, observed persisted command startup while the worker was running, retained 59 activity records and token usage, then reused them with no new dispatch. `reports/activity-local-acceptance.json` and `reports/activity-browser-check.json` separate execution proof from light/dark/mobile inspection. No native calls run in CI. Individual worker controls and descendant/restart proof remain separate work.
