# Windows retained Git paths

Assigned repair: `windows-retained-git-paths`, run `7f7fdf20-a3c1-4607-8ffc-135692a1fc10`. Source changes are limited to `engine/workspaces.mjs`, `test/engine-workspaces.test.mjs`, and `test/engine-writer-retirement.test.mjs`. The reviewed prerequisite overlay is separate from these authored changes. No project/global Git configuration, commits, network, installation, workflow runtime, native worker, server, external wiki write, or delegation was used.

## Diagnosis and repair

Retained blob paths and private index paths can exceed 260 characters on Windows. The production Git helper omitted command-scoped long-path support. The supplied retained read-only control identified a 263-character blob: `hash-object --no-filters --stdin-paths` exited 128 with Filename too long; the same read with `-c core.longpaths=true` succeeded. That old fixture was never inspected, modified, or reused here.

The new regression uses an owned disposable repository with `core.longpaths=false`, separate retained artifact directories with legal components, and deliberately long blob/index paths. It exercises real capture, retained-input loading, writer creation/admission, collection, verification and patch replay. It checks original staged index bytes, unstaged source bytes, repository config, Git status/object identity, retained input tree/index, and SHA-256 identities for patches and manifest.

Before changing production, both affected files ran through the verified coordinator helper. The new case failed with `WORKSPACE_INPUT`, capture stage `tree`, cause `WORKSPACE_GIT_EXIT`. The retirement test independently reached the same early capture failure and failed with a diagnostic instead of deadlocking. Result: 33 pass, 2 fail, 0 cancelled, 0 skipped; exit 1. Complete RED output and receipt remain under `test-evidence/windows-paths-red*`. The tests completed and their owned temporary fixtures were absent before the production edit.

The production change adds `-c core.longpaths=true` to every Windows invocation of the existing Git helper. It preserves environment scrubbing, `--no-replace-objects`, no-hooks/fsmonitor settings, optional-lock suppression, private index environment, command timeout/buffer limits, path/link checks, full capture and integrity validation. It does not retry failed commands or change any persisted Git config.

The retirement test races expected patch entry against the existing positive backend-close event. Unexpected early close reports saved failure evidence; `finally` releases both gates, awaits work, restores filesystem exports and removes the owned fixture after checking containment. Its intended late artifact write, drain timeout, unknown worker and blocked-run assertions remain intact. The RED run exercised this failure/cleanup branch without adding a wall-clock escape. Production success must still execute the original late-write/drain scenario.

## Genuine native skills and boundaries

Called genuine executor `skills.list` through all ten cursor pages. Selected the explicit `workflow`, `authoring`, `debug`, `tdd`, and `test-strategy` catalog identities, then called genuine `skills.read` with each returned package and `main_resource`. All five returned frontmatter names and `skill_root` values exactly matched the admitted identities. Same-name parent packages were not substituted. Applied ownership/handoff rules, backward failure tracing, test-first repair, existing invariant owners and affected-file verification. Debugging `root-cause-tracing.md` also loaded through the native resource tool.

Native roots below share prefix `C:/Users/ehart/AppData/Local/agent-workflow/runs-v2/7f7fdf20-a3c1-4607-8ffc-135692a1fc10/source-packages-v1/packages/`:

| ID | Returned name | Verified root suffix |
| --- | --- | --- |
| workflow | agent-workflow | `81ccc0f85f118deb57143c4b066129c44397f15f1af3e81aab6e0e280f65a13e/skills/agent-workflow` |
| authoring | workflow-authoring | `81ccc0f85f118deb57143c4b066129c44397f15f1af3e81aab6e0e280f65a13e/skills/workflow-authoring` |
| debug | systematic-debugging | `c1aa80898169b589a8c1c575c308bf417e1d5e488567771540d03c2cbfd086f7/skills/systematic-debugging` |
| tdd | test-driven-development | `c1aa80898169b589a8c1c575c308bf417e1d5e488567771540d03c2cbfd086f7/skills/test-driven-development` |
| test-strategy | test-strategy | `4cc697b3411bf70b4f2658e9219a54f919f2b3292dea38e977ea08ad6c1359de/skills/test-strategy` |

The genuine shared test-strategy `references/craft.md` read returned `skill environment is not available for this callback`. That reference stage remains missing; no shell/manual/copy fallback was used. This is plugin friction for coordinator-owned roadmap follow-up. Beautiful is conditional on visibility work; this assignment changes no interface.

Read AGENTS.md and `.testing/risk.yml`: production phase, critical engine behavior, existing consumers. The task prohibits external wiki work, so discover/ingest/as-built/roadmap maintenance remains coordinator-owned.

## Historical failures and remaining acceptance

The supplied original full-suite receipt remains exit 1, with 907 pass / 1 interrupted failed / 2 skipped as recorded in the task. Its owned-test interruption and original retained fixture remain unchanged. This repair is a new, independent reproduction and does not recast that failure as a timeout or pass. The supplied visibility review's B1/B2 findings and all other disjoint work remain outside this repair.

Full combined `npm test`, `npm run check`, `npm run smoke`, clean-package install/audit, installed/recorded-runtime qualification, genuine native composition/cancellation/drain/replay, painted interaction, LAN and artifact/refinement/native-asset acceptance are not established by these targeted tests. Coordinator integration and fresh combined verification remain required. Native skill invocation is established separately from native workflow execution.

## Fresh verification

Used verified `C:/Program Files/nodejs/node.exe` and `worker-test-tools.mjs`, preserving the actual `AGENT_WORKFLOW_WORKER=1` marker. The helper materialized 1,868 verified independent dependency files (472,164,333 bytes), with no install or filesystem links. Its test invocations use `--test --test-concurrency=1` and owned unique fixtures. All logs below have complete, nonoverflowed coverage and empty stderr.

| Check | Result | Stdout bytes / SHA-256 |
| --- | --- | --- |
| `windows-paths-red`: workspaces + retirement before production fix | exit 1; 33 pass, 2 fail, 0 cancelled/skipped | 7,689 / `f4517e458a931d255f19abaae3c621d881277bfd7e0008619b9d5884ea532e44` |
| `windows-paths-green`: same files after production fix | exit 0; 35 pass, 0 fail/cancelled/skipped | 4,629 / `4b936c3c40c68624510ed06a917ccfa6a45581510fc2e33a0da0fb348a52d7cc` |
| `git-diagnostics-green`: existing `test/engine-capture-preflight.test.mjs` | exit 0; 21 pass, 0 fail/cancelled/skipped | 1,864 / `8eea08bf297170c73f15e8cec62febcac40a9b7852a8e4d69f110441b70319b8` |

The second GREEN suite retains real launch, exit, timeout, buffer, encoding and unknown-error classification, privacy/no-effects negatives, and unchanged admission bounds. `node --check` passed all three edited files. No source changes followed these checks.

The GREEN long-path case records a **337-character blob path** and **280-character input index path**. Exact identities from that disposable fixture:

| Identity | Value |
| --- | --- |
| Input tree | `2dccd0f3e26f3ed72688af0c0e8748c22c368d54` |
| Retained input index SHA-256 | `1f099d2d15223d27b88c9f982636fe8875ecb7c611261c589de991aac748efa6` |
| Original source index SHA-256 | `d6874478e68e90a85aad2155d254c0f392fc07e8d29f1c4e2f9d15c2331cd7ed` |
| Input-relative patch SHA-256 | `5fed3d4ec93c31cd39a6b9a583fe7fc29f5f5b06e02543ac3c294050e6fbb354` |
| Base-relative patch SHA-256 | `09bbc30a85ddc6b6d7b593841ac1c30557e51ec40289aab4b1a6ea1e7eec8594` |
| Result manifest SHA-256 | `acbb5d1faeb93ae3128e9bf08cd43c5f4a6853e1324a46c7d4c176d7c43966e6` |

Cleanup verified all dependency bytes against the seed before removing them, required the temporary root to be empty, and retained `dependencies-cleaned.json`. Both `node_modules` and `.composition-refinement-fixtures` are absent; no `.workspace-test-*` directories remain. A final file inventory found only the allowed report, prerequisite receipt and evidence extras. All 644 unowned baseline files match the reviewed overlay; exactly the three assigned source/test files differ.

## Exact provenance

Verified all supplied descriptor references before use and again after tests. The overlay helper fully preflighted ordinary before/postimage files, then applied 310 reviewed postimages and checked all 647 baseline files. Baseline content hash: `54d883900addc4645a3f75342c6fa069852363d24cd7eefb2eda39ebf5717710`. The overlay's three bound coordinator-proof files also matched their recorded byte counts and hashes. No live predecessor source was copied.

Control input filenames in the table below are under `C:/Users/ehart/repos/agent-workflow-worktrees/composition-refinement-control/attempt-01/`, except the explicitly named Node executable. Full paths and identities, baseline comparison, verified test receipts and cleanup facts are retained in `test-evidence/final-verification.json` (8,657 bytes, SHA-256 `5a17e82899cbb35469b16651e0bd668114abc7124d43040f42f98718c86ef7e5`).

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| `windows-retained-git-paths-task.json` | 6,463 | `75495f135074872db0ad353a261c8912ef02b9f15b825f969a31cce75972a320` |
| `final-visibility-corrections-prerequisites/overlay.json` | 290,572 | `66ae9eda0dfea294457d0c2741425c11dcce535fb5050cc7b01a5f8c820f0e2c` |
| `worker-reviewed-overlay.mjs` | 5,026 | `415320165ce7d1eb147ad057e4ab904f5924ead503ca8c031897deb4df07dd21` |
| `visibility-recheck-capture/review.md` | 21,327 | `03906299bfdc33ade00fcb29e9eac3dcf8bc27f271db4c289daf3d8b1c250377` |
| `C:/Program Files/nodejs/node.exe` | 92,534,088 | `9a4eb5f1c29c6a2e93852ead46b999e284a6a5ca8bab4d4e241d587d025a52de` |
| `worker-test-tools.mjs` | 5,728 | `8e57860dd5f8bf1a921cec17ad3e935c68c74a35e4ab98f3a851e97018cc753a` |
| `test-dependency-seed.json` | 318,567 | `1e7d2ea52bd3f5808f50184b87f25135e22013769cadbedfee2daed26bab8b56` |
| `artifact-git-readiness.json` | 594 | `17c3a63bd7e9f2f458eca4126aa7c90d02086e670498ff1f495e039804e30274` |
| `owned-retirement-longpath-diagnosis.json` | 2,151 | `2125291cee0f1cf00298f41ac70f2797d69897a5a9e246787441ebe4f245209f` |
| `pre-artifact-full-test-receipt.json` | 980 | `3cd47f0e7e69465354268c07aef6260e43d4e474a5b0eafe57fb40b9b8de906a` |
| `retirement-test-interruption-receipt.json` | 162 | `3d8cee457b7292ce960de865626766ef8da575e16d7a49b765f3ccca7df1ba24` |

Verified Git executable: `C:/Program Files/Git/cmd/git.exe`, 46,920 bytes, SHA-256 `7b7971dd13f0c3a284e538601f2f9770b3a87dfaccb5fb52d68141c67ed22364`, matching both coordinator readiness and command resolution. It was used only in owned temporary repositories.

| Authored source/test | Before bytes / SHA-256 | Final bytes / SHA-256 |
| --- | --- | --- |
| `engine/workspaces.mjs` | 45,330 / `40b9682a4682d503cb5ad7b9f310529bf702b5deb868fa7e4584c42a41a5a3e5` | 45,556 / `a172944b3fce65582f6f038d9c0756ff3c6ae6ef0fff0a2fa35de4878ab1277e` |
| `test/engine-workspaces.test.mjs` | 53,236 / `ca59cf0017afdf7df8aa430faafad0c6660949262705a791be284e6894fffe79` | 56,941 / `904a3c509aba3aa6ded36fc62728d9793b4be9f55649be895fe03a356a967b76` |
| `test/engine-writer-retirement.test.mjs` | 3,520 / `9231661f869338207ccbd1553d8824804fa9ee1a9fff76c14aea1a6b29398708` | 4,131 / `ae8f0dcb45db47b9270b90140847fe580b2e7452c90f8b6e5d77a4912976be6c` |

The two final test hashes also identify the RED test inputs; the RED production input is the before hash above. GREEN uses all three final hashes.

| Retained receipt (relative to this report) | Bytes | SHA-256 |
| --- | ---: | --- |
| `baseline-overlay-receipt.json` | 1,477 | `b32474cc3389252e4912d7a64dc026ceafdcb795f4dd8e3c5c43d74e94a84c65` |
| `test-evidence/windows-paths-red-receipt.json` | 385 | `6a60e9ea08895a5329a6736195b9a585728df789c18a030800aad8d5221caf9e` |
| `test-evidence/windows-paths-green-receipt.json` | 385 | `87236b462693e42145b393ee5f344aadc578d029bdafd961e673f2e31a010411` |
| `test-evidence/git-diagnostics-green-receipt.json` | 385 | `63cbcd8a820b7e62fd194346bc6adfb502247fa7a6ba0c41a1fce3909d17479a` |
| `test-evidence/dependencies-cleaned.json` | 123 | `7666aa9be70ee22252549bb2b501ffa421e0c0902059687204d7d8d655ed4a6f` |

The assigned repair is complete. These targeted passes do not establish the combined acceptance items listed above or clear disjoint findings.
