# Test audit and strategy

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
