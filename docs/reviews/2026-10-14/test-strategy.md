# Test audit and strategy — 2026-10-14

The existing Windows merge and release protection should remain. This static audit supports six additive subject-ownership rewrites, no pruning, and conservative edit-time selection. It does not establish fresh runtime acceptance, test performance or statistical flakiness. No tests, source, risk map or CI configuration were changed.

## Scope and provenance

- Assigned checkout: `C:\Users\ehart\repos\agent-workflow-worktrees\workflow-90449efd-72b0-4fdb-8f8c-03e654a2a16c`.
- `git --no-optional-locks rev-parse HEAD` returned `ca0e8b73f4af142a9035e29f709483af94ab28f2`, the supplied published 0.3.5 baseline. This is source identity, not a new acceptance result.
- Read repository `AGENTS.md`, `.testing/risk.yml`, `package.json`, `.github/workflows/ci.yml`, and the assigned snapshot manifest. All seven snapshot hashes matched that manifest. Used bounded passages from the overview, architecture, roadmap, release-0-3-5 acceptance, Map + inspector design and helper-diagnostics backlog. Historical passages and stale overview release labels do not supersede the explicit 0.3.5 acceptance snapshot or current source/risk map.
- Source inspection stayed within the assigned test, engine, foundation, bin, scripts, hooks, workflows and documentation paths, plus the explicitly assigned package/CI/risk inputs. No search of dependency trees, `.git`, `.local` or recycled vault content was performed. The required managed scanner's own Git history analysis is reflected in its output; Git metadata was not changed.
- Read-only wiki snapshots supplied project intent. Live wiki discover/ingest and roadmap writes were not performed: this assignment permits authoring only inside this worktree. Coordinator follow-ups are listed below; they are not claimed as filed or accepted.

## Capability readiness — independently observed

The genuine `skills.list({authority:{kind:"executor"}})` catalog was traversed using its returned cursors through the terminal page. Same-name parent packages were not substituted for the selected role IDs.

| Selected ID | Returned name / enabled catalog identity | Native main read and returned root |
|---|---|---|
| `test-audit` | `agent-tests:test-audit`; present in executor catalog, no catalog warning | Read returned package `skill://test-audit/C:/Users/ehart/.codex/plugins/cache/hartye-plugins/agent-tests/0.4.1/skills/test-audit` and its returned `main_resource` ending `/SKILL.md`; `skill_root` exactly `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\agent-tests\0.4.1\skills\test-audit` |
| `test-strategy` | `agent-tests:test-strategy`; present in executor catalog, no catalog warning | Read returned package `skill://test-strategy/C:/Users/ehart/.codex/plugins/cache/hartye-plugins/agent-tests/0.4.1/skills/test-strategy` and its returned `main_resource` ending `/SKILL.md`; `skill_root` exactly `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\agent-tests\0.4.1\skills\test-strategy` |

Both native reads completed with `next_cursor:null` and the expected main names. The catalog did not expose a separate enabled boolean; successful selected-package reads establish accessibility, not an invented enabled-state field. No SKILL.md was loaded through the shell. No native skill/reference read failed, and no package boundary was widened.

After native activation, the five explicitly authorized out-of-package reference documents were hash-checked at the original `agent-tests\0.4.1\references` root. All matched the supplied SHA-256 values: architecture-cost `ceae4fc5…ca06b`, candidate-evidence `59e7b6f5…aa0b4`, craft `aff2ee60…e30ad8`, doctrine `4f99126c…11a745`, node-profiling `177a5872…06273`. Architecture-cost and candidate-evidence were read; relevant craft/doctrine passages informed the seam and cost review. The profiling document was hash-checked only; no profile was requested or run. These authorized reference reads are separate from native activation.

Used exactly the verified executable `C:\Program Files\nodejs\node.exe` and launcher `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\agent-tests\0.4.1\scripts\run-managed.js`, passed as separate PowerShell arguments in a non-login shell, with no named environment overrides:

| Operation | Observed result | Artifact / limitation |
|---|---|---|
| `capabilities` | Exit 0; `name:agent-tests`, `version:0.4.1`; commands `capabilities,risk-draft,scan,report` | Required launcher readiness passed. No installation/setup action was run. |
| `report --root <assigned-cwd> --max-files 200` | Exit 0; output exists and was inspected | [test-report.md](test-report.md), 18,426 bytes at capture |
| `scan --root <assigned-cwd>` | Exit 0; output parsed as JSON and was inspected | [test-scan.json](test-scan.json), 53,315 bytes at capture |

No unavailable required native catalog/read or tests-cli stage remains. Only the four advertised commands were treated as available; candidate recording/profiling commands discussed in reference documents were not inferred as launcher capabilities. No application, browser, service, real workflow control, test process or extra workflow runtime was launched. Some bounded shell display commands produced range/format errors or clipped output; corrected read-only windows supplied the cited evidence. Those display attempts were executed, not labeled `notStarted`, and were not acceptance checks.

## Audit quality and inventory

The scan finds **32 files: 30 critical and 2 standard, all tagged merge**. It recognizes **388 static test declarations**, not 388 expanded native cases. Parameterized loops and nested subtests can expand counts. There are **zero unparsed flags, zero opaque-registration flags and zero untiered discovered test files**. Absence of an opaque flag does not prove complete native discovery; no fresh runner inventory was executed.

There are **73 rule matches**: 64 per-file findings (47 worktree, 11 shared-subject, 6 shim) and 9 project findings (8 directory drift, 1 Windows-PR frequency). The highest-ranked files were opened first: `engine-workspaces`, `engine-monitor`, `managed-runtime`, then the remaining flagged files and shared-subject clusters. All 25 files with findings received bounded direct review against their setup, assertions and relevant source owners. This is not a line-by-line certification of every case.

**Keep unopened: 7 files.** They have no findings/flags, a resolved tier and an appropriate merge lane: the backend, activity, schema, check-install, evaluator, policy and mode test owners. They receive the skill's conservative keep verdict, not a claim of direct review or new execution. Nothing was kept unread despite a finding.

### Costs: estimates and historical measurements kept separate

| Evidence type | Value | Interpretation |
|---|---|---|
| Static agent estimate | 130,598 tokens across 32 test files | Scanner heuristic for reading cost, not runtime, model usage or money. |
| Churn estimate | Per-file `churn/edits` below | History-derived edits touching a test without its resolved subjects. Missing subprocess/recipe inputs can distort attribution. `0/0` supplies no change sample. |
| Current static invocation wall time | Tool wrapper observed report 0.6203 s, scan 0.6395 s | Includes launch/transport overhead; not a repeatable test profile or a speed comparison. |
| Historical release measurement | 506/506, zero skips, 138.206 s | Recorded by the supplied 0.3.5 acceptance snapshot. Not rerun here. |
| Historical Windows tag measurement | 4 m 17 s | Supplied historical measurement, not newly inspected CI timing or billed minutes. |
| Current suite/browser/CI durations and statistical flakiness | Unmeasured | No profile, full suite, repeated sample, billing query or browser launch authorized. |

Weights remain all 1. No aggregate score combines tokens, time, CI or churn. File length is not evidence that a file is slow. Parent-capabilities' `1/1` churn is a review prompt, not proof of waste or flakiness.

## Verdicts

Only the 25 nontrivial files are listed. All are critical by the current first-match/combined-subject classification; a mixed file containing low-tier CSS or standard recipes still protects critical runtime behavior. `rewrite` here means **add missing explicit subject metadata while retaining every existing behavioral assertion and merge execution**. These are recommendations, not applied changes. Rows prioritize actionable ownership gaps, then the largest review surfaces and remaining findings; no measured speed ranking is implied.

| File under `test/` | Tier | Verdict | Why: rule and direct evidence | Agent tokens, estimated | Churn/edits |
|---|---|---|---|---:|---|
| engine-recipes.test.mjs | critical | rewrite | Absolute-path hits at 93/95/122 are inert prerequisite report strings. Lines 27–29 load seven actual recipes through the registry; only decomposition-delivery has `@subject`. Add the other six recipe subjects. Keep lost-slot, invalid-report, permission and coordinator-required assertions. | 5,154 | 0/1 |
| engine-background.test.mjs | critical | rewrite | Fixed DB at 40 lives below a unique mkdtemp root. Add subjects for `test/fixtures/engine-background.mjs` and `engine-launch.mjs` reached through runnerPath/subprocess, including line 157. Keep detached lifetime, access, startup and saved-state boundaries. | 4,888 | 0/4 |
| engine-monitor.test.mjs | critical | rewrite | Fixed DB paths at 66/129/205 are under setup's unique run root; line 97's `C:/elsewhere` is rejected request data. Add `engine/cli.mjs` for real CLI patch/steer/dashboard subprocesses at 140/235/244. Shared controller import does not duplicate authenticated HTTP/session dispatch protection. | 6,086 | 0/1 |
| windows-job.test.mjs | critical | rewrite | Shared client/JobHost subjects protect distinct real owned-job termination and package-trust behavior. Add the protocol fixture at 112 and package inputs `foundation/native/job-host-policy.json`, `win32-x64/manifest.json`, `win32-x64/workflow-job-host.exe` as explicit non-imported subjects. Preserve actual helper exit/drain and signature verification. | 3,217 | 0/2 |
| engine-registry.test.mjs | critical | rewrite | `.git` at 13 is an owned temporary marker, with homeDir also under mkdtemp. Add `engine/cli.mjs` for line 45's public save/list/read child. Keep precedence, collision, reload and command ownership assertions. | 1,570 | 0/0 |
| codex-terminals.test.mjs | critical | rewrite | Shared client is transport, not duplicate terminal semantics. Add `test/fixtures/foundation-server.mjs`, reached by a child URL at 11. Keep exact inventory/acknowledgement and malformed/remaining-handle refusal. | 355 | 0/0 |
| engine-monitor-ui.test.mjs | critical | keep | 206/245/255 paths are display-only fixture payloads, not host writes. Executes actual HTML/app in a fresh LinkeDOM/VM with controlled transport, tests safe text, late responses and controls. HTML/app/CSS subjects already declared. CSS painting remains a separate gap. | 12,910 | 0/4 |
| engine-controller.test.mjs | critical | keep | All four DB findings use setup/input run roots. Trigger-injected activity failure at 219 checks transaction rollback; 469 checks corrupt replay rejects before dispatch; other cases protect durable controls and generation ownership. No cheaper mock-only replacement identified. | 12,164 | 0/3 |
| engine-workspaces.test.mjs | critical | keep | `.git` reads are in a newly initialized fixture repository, not checkout metadata; fixed DB at 369 belongs to that fixture's run. Legacy/v2 cases preserve saved captures and reject policy reinterpretation. Real Git, binary patches, aliases and independent writers have distinct protection. | 11,229 | 0/3 |
| managed-entry.test.mjs | critical | keep | 132/279 absolute paths are returned by an injected native locator and asserted as output. Actual CLI children run under owned temporary roots with runtime/backend seams replaced; no live installed data required. Doctor redaction and retained-runtime dispatch remain critical. | 8,054 | 0/4 |
| engine-run-lifecycle.test.mjs | critical | keep | DB and `.git` pointers are constructed beneath a unique repository-local fixture (21–56). Tests retain execution rows, verify drain/ownership and exact plan hashes, reject replay and preserve tombstones. This is current destructive-operation protection, not disposable history. | 7,486 | 0/0 |
| codex-turn.test.mjs | critical | keep | Shim title hits at 77/111/126 cover native omitted-phase metadata, async exclusion, deduplication and exact unsalvaged answer text. Source `foundation/turn.mjs` supports these current protocol variants; consumers are declared. | 7,213 | 0/2 |
| engine-worker-capabilities.test.mjs | critical | keep | Shared worker-session subject connects readiness/activation evidence to its caller. Separate assertions reject source drift, executed nonzero readiness, ambiguous/failed native reads and partial coverage. Node fixture processes replace external tool installations. | 5,976 | 0/1 |
| codex-foundation.test.mjs | critical | keep | Shared client serves distinct RPC framing, failure, launch environment and managed-ChatGPT admission seams. Controlled child protocol fixtures assert real observations; no API billing fallback or live account needed. | 5,202 | 0/4 |
| managed-runtime.test.mjs | critical | keep | Fake npm child creates fixture bytes only. 25's legacy-data case preserves declared prior runtimes/data; DBs use unique fixture roots. 58's common temp pathname is passed only to pure defaultDataDir, with no filesystem access. No shared-temp hazard established. | 4,498 | 0/2 |
| engine-parent-capabilities.test.mjs | critical | keep | 138's lexical fallback is current root version ordering, not an obsolete compatibility shim. Short-path test 59–81 uses CMD builtin expansion, exact identity and junction refusal, not PowerShell/COM startup. Its conditional 8.3 skip remains an environment coverage boundary. | 3,234 | 1/1 |
| engine-watch.test.mjs | critical | keep | Shared controller builds durable events; the owner tests observation cursors, EPIPE, paged terminal drain and idle semantics without issuing controls. Fake clock cases and real persisted disconnect case protect different seams. | 2,581 | 0/0 |
| engine-restart.test.mjs | critical | keep | Fixed DBs at 37/50 are under unique setup roots. Reconciled suffix execution preserves prefix/history/usage; changed cleanup rejects before generation advancement and dispatch. Keep unknown effects explicit. | 2,548 | 0/0 |
| engine-notifications.test.mjs | critical | keep | Nine DB hits all derive from unique root/run. Actual SQLite trigger failure, missing rows and malformed journals test rollback and truthful terminal publication after drain, distinct from watch output. | 2,488 | 0/0 |
| engine-worker-session.test.mjs | critical | keep | Shared client/session subjects guard JSON/schema correction, one shared deadline and retry reservation; transport loss never dispatches a correction. Controlled adapter seams complement real protocol child tests. | 2,004 | 0/2 |
| engine-access-policy.test.mjs | critical | keep | Shared access-policy import with settings does not duplicate its own exact parent/session mapping, descriptor refusal and immutable fingerprint contract. | 1,476 | 0/0 |
| engine-settings.test.mjs | critical | keep | Owns model/effort/default precedence and permissions narrowing after access admission; access-policy alone cannot catch an adapter that widens worker settings. | 1,318 | 0/1 |
| engine-workspace-policy.test.mjs | critical | keep | Absolute/`.git` strings at 25–27 are invalid input vectors. Tests current canonical policy identity, namespace ambiguity and writer-thread root refusal without touching those paths. | 1,077 | 0/1 |
| engine-writer-retirement.test.mjs | critical | keep | Shared controller/workspaces import is intentional. Real artifact write is held by a barrier; after the drain deadline, late completion cannot replace unknown persisted evidence. Restores patched fs methods in finally. | 880 | 0/0 |
| host-context.test.mjs | critical | keep | Shared JobHost covers parsing and privacy, local native facts, and explicit unavailable context. Job tests alone do not cover this adapter. Source now verifies a packaged helper rather than compiling, despite older test wording. | 802 | 0/0 |

Totals: **26 keep (19 opened + 7 unopened), 6 rewrite recommendations, 0 merge, 0 demote, 0 delete, 0 quarantine**. Estimated tokens removed through delete/merge: **0**. Edit-lane files demoted: **0**. No replacement is offered for deleting/merging/demoting because none is proposed; every rewrite retains the existing named owner and assertions.

## Invariant owners and protection boundaries

| Invariant / source seam | Owning evidence | Why overlap is necessary |
|---|---|---|
| Exact helper exit and Ready/Drained receipt; `foundation/client.mjs:236`, `native/JobHost.cs:134` | `windows-job` actual Windows job tests; `codex-foundation` controlled malformed/missing receipt tests | OS-owned job membership and protocol receipt parsing are different obligations. Neither proves arbitrary descendant cleanup. |
| Native terminal inventory; `foundation/terminals.mjs:5` | `codex-terminals` | Termination acknowledgement/inventory is independent of job-empty evidence. |
| Durable finalization, rollback and no late capture; `engine/controller.mjs:332`, `notifications.mjs`, `run-lifecycle.mjs:151` | Controller transaction/replay cases; notifications terminal journal; writer-retirement late-artifact barrier; lifecycle drain/refusal cases | Persistence and delayed writes can lie after an otherwise completed model turn. Synthetic cleanup objects in controller fixtures do not certify native OS drain. |
| Captured source/result identity and frozen policy; `workspace-run.mjs:8`, `workspaces.mjs` | `engine-workspaces` plus pure `engine-workspace-policy` | Real Git/index/patch and link behavior must remain; pure validation cannot replace it. Fixture Git metadata is permitted by project instructions. |
| Retained runtime/data/session selection; `bin/managed-runtime.mjs:16`, `:80` | `managed-runtime`, public launcher cases in `managed-entry` | Byte/directory preservation and actual entrypoint routing are separate public boundaries. Old 0.1.1 installations remain separate; no JSON reinterpretation migration is inferred. |
| Admission/readiness versus actual activation; `worker-capabilities.mjs:274`, `parent-capabilities.mjs:89`, `worker-session.mjs:6` | Parent catalog, worker capabilities, session tests | Catalog availability, executed command outcome and selected native main-read observation cannot stand in for one another. |
| Authenticated HTTP identity versus DOM state; `monitor-server.mjs:18`, monitor services/data, `monitor/app.mjs` | `engine-monitor`; `engine-monitor-ui`; retained-runtime adapter cases in `managed-runtime` | HTTP tests own auth and scoped dispatch; DOM tests own stale responses, focus and truthful display; actual browser painting is a third boundary. |
| Missing objective/report slots and coordinator integration; `workflows/decomposition-delivery.js:145` | `engine-recipes` executing real recipes through QuickJS/controller with deterministic workers | A completed worker report is not artifact acceptance or integration. Keep null/unknown coverage and maxAttempts 1. |

## Risk gaps and project-level findings

**No missing tier among the 32 discovered test files.** That does not mean the risk map describes every executable/configuration input. The following paths exist and have no explicit matching area in the current map; list them **without assigning a verdict or inventing a tier**:

- `package.json`, `package-lock.json`, `plugin.json`, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`.
- `.github/workflows/ci.yml`, `.testing/risk.yml`, `test/fixtures/**`.

These inputs can change packaging, public discovery, verification selection or protocol fixtures. `scripts/check-plugin.mjs` reads manifests and recipe/skill files; `scripts/check-install.mjs` verifies packaged/native ownership; fixture children are real inputs. Existing coverage is not equivalent to explicit risk classification. Ask the risk-map owner to resolve these gaps in a separately authorized change; preserve current phase and consumers.

The eight `wiring.drift` directory findings (`LICENSES`, `bin`, `engine`, `foundation`, `hooks`, `reports`, `skills`, `workflows`) are not grounds to add broad duplicate areas: matching descendant areas already exist (`bin/**`, etc.), and the tool itself assigns concrete subjects their proper tiers. This is a directory-versus-descendant heuristic mismatch. The genuine config/fixture gaps above are separate. Static scan does not establish branch coverage or show that every critical source has a sufficient owning test; no new coverage run was made.

The `frequency.ci-on-pull-request` recommendation to remove Windows from PRs conflicts with explicit production Windows ownership. Retain required Windows PR checks, nightly Windows and release tags. The source workflow has tag-only push (`v*`), not duplicate branch-push jobs; draft PRs are skipped and newer PR jobs cancel older ones. It installs pinned dependencies with `npm ci --ignore-scripts` and npm cache, then test/check/smoke/clean-install/audit. No pretest/posttest repeats the suite and no watch command appears in the package scripts. The prompt hook routes context; it does not run the suite.

The workflow always reports its required job, then skips heavy steps for documentation-only PRs via an internal changed-path check. Replacing that with workflow-level path filters can leave a required check pending. Changes to recipes, HTML, scripts, tests, lockfiles and risk/CI inputs fall through to verification. Repository branch-protection settings were not queried; code and owner instructions describe the intended required gate, not newly confirmed server configuration. Linux/macOS remain follow-up coverage, not replacements for Windows.

### Actual lane selection

`npm test` is exactly `node --test --test-concurrency=2 test/*.test.mjs`: one invocation selects every matching file regardless of `@lane`. All 32 are currently merge owners. `.testing/risk.yml` records edit/merge/scheduled/release intent, but no package script selects those tags. CI repeats the complete scope on qualifying PRs, nightly and tags; it also currently runs clean-install/audit on qualifying PRs. This audit does not change that gate policy. Node's concurrency 2 is the existing baseline, not an optimization inferred from this review.

For edits, run explicitly affected owner files only after the change is authorized; include non-imported inputs. Keep full `npm test`, `npm run check`, `npm run smoke` before pushing, with clean installation and production dependency audit for release. No such runtime checks were run in this static assignment.

## Prioritized cost/protection strategy and architecture alternatives

### A. Preserve seam owners; complete input ownership first — recommended next change

Decision → evidence → cost → alternative → protection: six owners omit subprocess/recipe/package inputs in their subjects, although they execute them. Add the subjects named in the verdicts, record config/fixture risk decisions, and keep the current process/QuickJS/SQLite boundaries. This improves agent navigation and future selection without removing protection. The relevant maintainers are the CLI/registry, background/monitor, foundation and recipe owners; no new broad test framework is needed.

- **Time:** estimated 1–3 hours to annotate, review routes and run authorized affected checks later. No measured runtime reduction; prevents later selection/debugging lag. No failure detection deferred out of merge.
- **Risk:** additive metadata is low implementation risk, but incomplete routing has high consequence for replay, auth and stored data. Keep every current assertion and full merge gate; verify selection against each named missing input before relying on it.
- **Complexity:** small metadata/ownership update. Fixtures need classification; do not treat a common import as a reason to merge files.
- **Best practice:** follows the owner's one-owner-per-invariant, explicit `@subject` and production Windows rules. Generic pre-release Linux advice does not apply.
- **Maintainability:** future recipe and CLI changes have visible owners; six small updates and a reviewed risk-gap decision cost less than maintaining a second architecture. Review trigger: any new dynamic input or CLI child.

Priority protection follow-up within this option: retain a distinct final-package browser owner for CSS/layout/CSP/actual focus behavior, tied to exact served HTML/app/CSS hashes and the same owner attempt. `monitor-server.mjs:11–30` serves repository assets directly: there is no separate HTML build pipeline here to consolidate. LinkeDOM reads HTML and app, but does not load/style/paint CSS. Historical 81-check installed rendering is useful evidence of that release, not a new visual oracle for this tree. Do not replace HTTP or DOM regressions with a broad visual snapshot. Browser work is a separately authorized experiment, not performed here.

### B. Add a conservative explicit edit selector; keep merge and release complete

Decision → evidence → cost → alternative → protection: import graphs omit six recipe inputs, child scripts and binary/HTML assets. Introduce a small explicit owner map/selector for edit feedback only, using A's subjects plus conservative area routes. Changes to package/lock/config, controller runtime identity closure, toolchain, fixture ownership or unknown inputs should widen to all potentially affected owners. Measure the entire selector command, including graph collection, filesystem reads and smoke preparation, before calling it faster.

- **Time:** estimated 0.5–1.5 developer days to implement and validate after metadata review; savings unmeasured. Selected feedback may arrive sooner, but full merge/release detection is retained. No promised target seconds.
- **Risk:** moderate chance of an omitted edge and severe consequences if used as the merge gate. Full gates remain the replacement protection for selector omissions; require negative controls showing each recipe, HTML, fixture and binary change selects its owners.
- **Complexity:** adds one mapping and conservative fallback policy. Do not add a second runner, cached failure reruns or a global workflow service.
- **Best practice:** owner-approved explicit inputs and seam ownership govern selection. A lane tag, static declaration count, successful partial command or matching receipt cannot certify complete affected scope.
- **Maintainability:** one shared mapping has an ongoing obligation whenever inputs/producers change. Review trigger: any unmapped path, dynamic loader, packaging transform or mismatch against the complete lane.

### C. Reuse only immutable preparation inside one test process — conditional experiment

Decision → evidence → cost → alternative → protection: `engine-workspaces` repeatedly initializes tiny Git repositories; managed-entry/runtime construct fake dependency layouts; native host-context/job checks repeatedly verify the packaged signed helper. These are setup-cost hypotheses, not measured bottlenecks. If an authorized later profile shows preparation dominates, extract tiny local builders or reuse immutable bytes/templates within one owning test process. Each case still gets a fresh root, index, database, backend, server and mutable state. Keep real Git capture/patch replay and native trust/drain integration owners.

- **Time:** estimated 0.5–2 developer days including same-scope before/after timing and isolation checks; no measured saving. A failed baseline or fewer executed cases does not establish improvement.
- **Risk:** mutable Git/index/database sharing has high-severity contamination risk; trust-result caching could hide byte replacement. Likelihood rises with shared state. Retain independent roots, mutation/refusal cases and post-operation integrity checks; do not cache trust decisions or cleanup receipts across processes.
- **Complexity:** small fixture builders can reduce repeated reading; shared live processes, cross-worktree caches and a browser broker would add substantial lifecycle complexity and are not recommended by the evidence.
- **Best practice:** preserve real persistence/process boundaries and explicit teardown; controlled transport fakes are appropriate for third-party protocol variants. No automatic reruns, timeout inflation or installed-account dependency is introduced.
- **Maintainability:** a minimal immutable builder centralizes irrelevant boilerplate, while values/assertions remain local. Review trigger: hidden case-dependent setup, alias leak, reordered failure, signature-source change or worse complete-command timing.

### External fixtures and generated assets: findings behind those options

No unnecessary live network, renderer installation, managed account or global plugin cache dependency was established in the reviewed test fixtures. Foundation/session tests run owned Node protocol children; capability tests use owned fixture executables; managed-runtime/entry use an injected fake npm child, not a dependency download. Literal URLs and `C:/verified/...` prerequisite strings are data. Real Git is necessary for capture/index/worktree/patch semantics; it is not replaced with a mock merely to lower process count. Clean-install network/cache dependence belongs to the existing package gate and was not invoked.

Windows job/context tests deliberately use the actual packaged helper, platform signature verifier and host facts. `buildJobHost` now validates the package and returns its executable; it does not compile a helper, despite the historical name. The current short-alias fixture uses bounded native CMD expansion (10 seconds, 8 KiB) and checks identity/junction refusal. The removed PowerShell/COM fixture's failed 0.3.4 run is historical and must not be reintroduced, retried or called statistically flaky from one observation. Conditional skip when the fixture volume exposes no 8.3 alias remains missing coverage on that host.

The largest static files (UI/controller/workspaces) protect different contracts; size/shared imports do not earn consolidation. `check-plugin` parsing all recipes and `engine-recipes` executing behavior are producer/consumer checks with different oracles. Smoke's offline detached/replay/auth journey and clean-install's native package ownership are also distinct. No complete producer/input/output identity or measured setup attribution justifies removing any of them. Browser startup/context/assertion/capture/teardown phases are unmeasured, so no browser reuse saving is claimed.

## Missing evidence and coordinator follow-ups

- No new full suite, affected test execution, mutation trial, native test inventory, coverage run, Node profile, clean install, production audit, live host/MXC process test or browser capture. Source review supports verdicts; it cannot certify these runtime properties.
- No fresh PR/tag run, branch protection query, CI charge or statistical failure sample. The historical 506 tests/138.206 s and 4m17s tag run remain historical. This work is not coordinator acceptance.
- No complete dependency closure for an affected-only replacement: non-imported recipes, HTML/CSS, subprocess fixtures, manifests, native binary/policy and lockfile/toolchain identities need explicit ownership. Full gates remain.
- Job-member cleanup does not prove arbitrary descendant or external-effect cleanup. The original unknown writer's exact helper failure cause remains unknown. The assigned helper-diagnostics snapshot calls for failure-stage facts while preserving strict drain, payload privacy and uncertainty; it is not proof of an implemented C# fix.
- The tool's 8 directory drift false positives and blanket Windows-PR advice should be reported to the agent-tests roadmap by the coordinator. Enhancement: production/platform-aware frequency guidance, descendant-aware risk-directory matching, and explicit detection of missing known subprocess/asset subjects. This document records the requests locally; no external roadmap write is claimed.
- The snapshot overview still labels 0.3.1 as current while the architecture/roadmap/release note record 0.3.5. Coordinator wiki upkeep can reconcile the current label while retaining historical evidence. No vault changes were made here.

The three artifacts are a static audit handoff for review. Proposed rewrites and architecture alternatives remain unapplied; all declared production consumers, Windows gates and unknown outcomes are preserved.
