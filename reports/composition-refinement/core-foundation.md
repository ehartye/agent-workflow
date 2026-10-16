# CORE FOUNDATION provisional handoff

The foundation implementation is ready for coordinator source review and integration. This is not final source acceptance, native/artifact/UI acceptance, an installed-runtime qualification or release approval. The exact implemented host seam is [provider-contract.json](provider-contract.json); later owners must use its actual fields and refusals rather than infer private controller closures.

Task data was verified before consumption: coordinator core-foundation-task.json, 10,487 bytes, SHA-256 `7da2090b08d821d91d425c96534f15fdc860f3987e39588b534cfddbcab0a0b5`. Its four external reviewed plan/spec/review documents, exact Node executable, dependency seed, worker helper, native-source receipt and supplemental candidate-evidence reference matched task-bound hashes and byte counts. External inputs were read only. AGENTS.md and .testing/risk.yml were read; production engine/foundation/bin risk is critical. No delegation, real nested managed workflow/native model, package installation, assigned-project Git metadata change, external wiki edit or publication occurred. Test Git mutations and links stayed in authorized disposable fixtures. No predecessor or live dashboard/UI files were copied.

## Implemented behavior

Root and depth1 child evaluators execute in separate QuickJS processes through JSON-only broker messages. Children reuse the one admitted backend, native permit pool and lifetime slot/start/attempt ledger. A separate FIFO child lifetime pool has the same saved concurrency; waiting live children retain permits until evaluator exit and accepted descendant native promises settle. Root is outside that pool. Shared broker, pending, worker, attempt, child, source, step and response caps remain bounded; none was inflated.

All declared sources are frozen before backend/fork on public new admission. Script/registry sources are case-exact, regular, single-link, bounded and content-addressed. Resume verifies retained sources rather than rereading launch locations. Explicit generation/catalog/source-bound revisions invalidate no-agent and agent-bearing invocations. Replay validates complete current-generation journals, links, scopes, ancestors, actual workers and result blobs before new admission. The cutoff repeatedly closes over interleaved ancestors. Cached closed prefixes copy in original global order; root execution must consume exact cached links. Reconciled restart maps the physical worker to its child container and invalidates the affected suffix.

The coordinator's identity observation is covered by an actual process/persistence test: root agent → child with local agent → root agent → child with local agent. Workflow journal sequences are 2 and 5 while ChildRef IDs are `c_1` and `c_2`. Saved reads and resumed cached execution validate; four initial native fixture calls remain four after resume. Child creation and validation use the same child-only ordinal. Additional meaningful REDs exposed an earlier-generation child cursor being accepted and a rehashed child agent detached from its ancestor being accepted. Paging now binds its cursor to run, generation, source catalog and complete child identities; full history checks the ancestor/scope/actual-worker relationship. Existing interleaved revision, source corruption and beyond-page link checks remain green.

Declared steps are validated before execution, retained per root/child scope and associated with actual admitted workers through local presets or stepId. Display dependencies never schedule work. Full source/catalog/worker associations are checked before paging. Unassigned declarations remain planned at terminal execution; future dynamic coverage and artifact acceptance stay unknown/unverified. CLI and HTTP expose steps and child pages through recorded-runtime providers.

LAN is opt-in through dashboard --lan-bind privateIPv4. The exact validator checks canonical RFC1918 address, actual unique noninternal interface, contiguous netmask, bounded inventory and interface identity. Parent, child and server revalidate; ready/started/health agree on actual address, port, origin, token URL and service identity. Loopback default, exact Host/Origin checks, bearer authentication and manual authenticated Close remain. Same-host HTTP was exercised on an actual private interface. No firewall/configuration mutation, browser or second-device acceptance is claimed.

Domain-control services support preallocated UUIDs for Pause/Stop/cancel-child, exact binding/CAS and durable receipts. Legacy controls preserve their shape and gain optional preallocated identity lookup for lost responses. The contract identifies the separate legacy/domain shapes and ledgers. Managed-runtime domain mutation/receipt integration still needs coordinator coverage; it is not represented as a tested native operation.

Public validate file --summary uses the complete current source/schema parser and emits only `{valid:true,name,scriptBytes,scriptSha256,declaredWorkflows,declaredSteps}`. Byte count/hash cover exact original file bytes including line endings/BOM. Default validate retains `{valid:true,meta,body}`. Only validate accepts the boolean; duplicates, values and other commands reject it. A meaningful public RED preceded code, then actual command GREEN. CLI help includes the new flags. Docs owner remains responsible for front-loading summary validation and describing captured-stdout fallback on old runtimes. Large JSON manifests were parsed and field-projected, not bounded by head/line viewing.

## Native skills and reference boundary

Genuine executor skills.list pages were followed through offset 140. Same-name packages were resolved by retained roots/native metadata. Genuine skills.read used returned package/main_resource and confirmed expected frontmatter names and skill_root values. Discovery was not counted as invocation. The retained prefix is:

`C:\Users\ehart\AppData\Local\agent-workflow\runs-v2\7f7fdf20-a3c1-4607-8ffc-135692a1fc10\source-packages-v1\packages\`

| Selected identity | Returned name | Returned skill_root below prefix |
| --- | --- | --- |
| workflow | agent-workflow | `81ccc0f85f118deb57143c4b066129c44397f15f1af3e81aab6e0e280f65a13e\skills\agent-workflow` |
| authoring | workflow-authoring | `81ccc0f85f118deb57143c4b066129c44397f15f1af3e81aab6e0e280f65a13e\skills\workflow-authoring` |
| debug | systematic-debugging | `c1aa80898169b589a8c1c575c308bf417e1d5e488567771540d03c2cbfd086f7\skills\systematic-debugging` |
| tdd | test-driven-development | `c1aa80898169b589a8c1c575c308bf417e1d5e488567771540d03c2cbfd086f7\skills\test-driven-development` |
| test-strategy | test-strategy | `4cc697b3411bf70b4f2658e9219a54f919f2b3292dea38e977ea08ad6c1359de\skills\test-strategy` |

The native runtime-api read succeeded. Native craft reference read failed: **skill environment is not available for this callback**. Exact resource identity:

`skill://parent-4cc697b3411bf70b4f2658e9219a54f9/C:/Users/ehart/AppData/Local/agent-workflow/runs-v2/7f7fdf20-a3c1-4607-8ffc-135692a1fc10/source-packages-v1/packages/4cc697b3411bf70b4f2658e9219a54f919f2b3292dea38e977ea08ad6c1359de/references/craft.md`

No shell read/copied body substituted for that operation. Separately admitted candidate-evidence was hash-verified and read as ordinary reference data. Main activation does not certify all references or native model/asset operations. Large catalog pagination, duplicate-root selection and native callback resolution are concrete tool friction for coordinator-owned follow-through. Wiki writes are excluded.

## Retained test evidence

Verified C:/Program Files/nodejs/node.exe v24.18.0 and exact coordinator helper were used for owner runs. Prepare materialized 1,868 independent dependency copies, 472,164,333 bytes, without npm/package/lock/runtime installation. Actual AGENT_WORKFLOW_WORKER=1 remains in helper/managed-entry real subprocesses and owned evaluator/background/monitor Node subprocess environments. Production mutation/install guards stay intact. The authorized SourceTextModule pattern has a frozen inert process facade only inside its isolated VM realm; real synthetic subprocesses retain the actual marker. Stage-checkpoints was read as a pattern, never imported/executed.

All intents, full stdout/stderr, exit/overflow facts and hash receipts remain under [test-evidence](test-evidence/). Counts overlap and must not be summed as unique tests.

| Evidence label | Actual result and interpretation |
| --- | --- |
| red-metadata-summary | Meaningful invalid-step/workflow/summary failures. Existing managed install guard failure was a prerequisite, not feature RED. |
| red-composition-network | Actual composition/association/LAN-origin/receipt failures. Missing-module prerequisite alone not counted as RED. |
| red-control-steps-routes | Duplicate Pause identity and HTTP steps404 failed; 62 passed. |
| red-source-admission | Missing source wrongly reached runner. Existing retained writer failure preserved separately. |
| red-integrity-boundaries | Corrupt link, wrong step source and missing explicit artifact refusal failed. |
| red-guest-json | Guest serialization executed an accessor; descriptor-first fix subsequently green. |
| red-composed-restart | Explicit composed restart rejected before implementation. |
| red-preview-composition | Inert workflow/refinement call-site preview missing. |
| red-child-cursor-ancestor | 50 passed, 2 meaningful integrity failures; requested interleaved-ID test already passed. |
| red-background-marker | Real synthetic child saw null instead of marker1; existing capture failure not recast as feature RED. |
| green-interleaved-persistence | **135 passed, 0 failed/skipped**: controller/evaluator/registry/append/workspaces/workspace-policy. Real processes, SQLite, links, Git captures, independent writers, large retained binary/diff and append races. Predates final integrity/marker fixes, checked afterward. |
| green-child-cursor-ancestor | **88 passed, 0 failed/skipped**: controller/evaluator/restart/monitor after integrity fixes. Requested root/child sequence, closed-prefix replay, no-agent revision, interleaved ancestors and full paged integrity pass. |
| green-restart-admission-entry | 88 passed, 1 existing writer fixture failure, 2 disclosed skips. Composed restart/preview/summary/owned launcher passed. Nonzero result preserved. |
| green-public-processes | Summary, owned managed-entry, all four monitor-launch/LAN checks and worker-session passed. Overall nonzero retained for marker teardown and long-path writer fixture, resolved below. |
| green-process-marker-fixtures | **27 passed, 0 failed/skipped**: final background/evaluator source. Actual marker retained; detached retained writer replay passes after fixture-only long-path config and positive synthetic-exit wait. |
| final-audit.json | Exact changed-source hashes, syntax checks on all31 modified implementation/test files, parsed contract, allowed-path audit, cleanup receipt identity and no remaining fixture roots. |

Earlier green-core-first/green-core-routes receipts remain earlier evidence, not final-source claims. VM harness/CLI selection failures retain original labels and were not relabeled feature REDs. Full saved output was inspected, with field-projected diagnostics where raw bootstrap errors were large.

The background writer failure was WORKSPACE_INPUT, capture stage tree, cause WORKSPACE_GIT_EXIT, before synthetic native execution. Nested helper-owned Windows blob paths exceeded Git's default short-path boundary. Only the disposable fixture gained git config core.longpaths true; no assigned project/global config changed. Final owner run passed retained-source/deleted-cache/replay/no-redispatch behavior. No production capture guard changed.

Two existing managed-entry coverage boundaries remain: physical-hardlink subtest and real integrated managed-roadmap fixture skip under the worker boundary. The owned synthetic run-pinned runtime/upgrade fixture passes in the authorized VM pattern. Actual host installation/integrated source suites stay with root; no extra host-only retries here.

## Cleanup reconciliation

Initial launcher RED assertions preceded Close and leaked exact synthetic monitor PIDs46152 and19376. Coordinator verified executable/full command/creation time, stopped them and confirmed absence. Live dashboard/native workers were untouched. New launcher tests register authenticated Close immediately on receipt before assertions; loopback test positively observes actual process absence.

Coordinator retained original source-admission RED copies and reconciled their exact three-file cleanup. Reconciliation JSON SHA256: `7772427710bfb583e3a8a266eee15ca919b38f71731944389137915d46195368`. Worker PowerShell cleanup was rejected **before process start**, blocked by policy; no retry/fallback. Exact declined command is unavailable in retained coordinator observation and explicitly preserved as unavailable. Root independently verified files/backups/containment/zero matching Node processes and removed only three files/two empty dirs. Successful receipt:

`C:/Users/ehart/repos/agent-workflow-worktrees/composition-refinement-control/attempt-01/core-exact-fixture-cleanup-receipt.json`

Verified SHA256: `dce7722ab84cb0a9b6606ac44425943ac918f24f93b7699064cc9c69367aa87e`. Target absence rechecked. Original RED/cleanup evidence and coordinator backups remain.

The marker fixture initially returned before actual process exit, causing EBUSY teardown. Original RED/first GREEN remain. Inspection found only two known marker fixture dirs, exact three ordinary files each, zero matching Node processes. Copies, hashes, inspections and exact nonrecursive file/empty-dir cleanup receipts remain as background-marker-* and initial-marker-* evidence. Test now waits for positive exit; final owner run passes. This was a real test cleanup defect, not native evidence. First final audit correctly refused retained temporary files; inspection/reconciliation remain file-backed.

After checks, helper cleanup succeeded: all **1,868** dependency files verified before removal, temporary root verified empty, then dependencies/empty root removed. [dependencies-cleaned.json](test-evidence/dependencies-cleaned.json) retains proof. No other workspace, unknown process or live predecessor was cleaned.

## Explicit remaining boundaries

Artifact/refinement Candidate/Stage/Snapshot storage/derivation/merge, native asset observation and semantic acceptance are staged. refineArtifact, artifact agent inputs/review packets, native reads and stage reservations explicitly refuse. No absent future module is statically imported; artifactProviders is literally null. The concrete host seam accepts a branded context, but enabling a reviewed artifact factory/broker path still requires core-owned integration. Private composition blobs (32MiB) do not replace existing workspace captures (512MiB) or promise a final artifact store.

Contract records narrower review limits: managed domain mutation/receipt and artifact capture-service integration need coordinator coverage; unrelated old generations are not recursively revalidated beyond reused-row hash/key/status/result links; restricted runs without explicit native/bundle catalog retain null catalog evidence rather than fabricated observations; revision audit has no affected-child preview API. Successful synthetic dispatch is not native/catalog observation.

Independent UI rendering/focus/visibility, combined current-source acceptance, native craft callback, actual installed runtime/native execution, second-device/browser LAN, full test/check/smoke/package/install/audit and release gates remain coordinator/later-owner work. This provisional handoff makes no final source acceptance/publication claim.
