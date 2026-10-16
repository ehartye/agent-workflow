# Frozen foundation and declared-step visibility review

The frozen candidate has seven blocking findings: five P1 correctness/integrity issues and two P2 issues. F7 has coordinator follow-up verification on later source; it remains present in this reviewed snapshot. This report completes the assigned source review, not shipment acceptance. No implementation, test, Git metadata, external wiki, runtime, dashboard, network or publication changes were made by this reviewer.

## Evidence and scope

Task: `foundation-review-task.json`, 5,309 bytes, SHA-256 `47f22f9adb00b714be8ce47d07246b0b02f08e0f1557ece26ea36939b07db506`.

Read and parsed the complete hash-bound snapshot before selecting candidate files. Snapshot: 546,553 bytes, SHA-256 `f810a0d86a448524be1d9078ed362796cb7aa616bbcf4f25daab6683028845ca`. Reviewed actual source under `C:/Users/ehart/repos/agent-workflow-worktrees/composition-foundation-validation-01`, restricted to `snapshot.sourceFiles`; verified those candidate byte counts and SHA-256 identities against that manifest before source inspection. Snapshot source identity is `d936631ee3a22b2d08387bc52e773d783cf611bda675a1e574bc2e7ca288b018`; validation identity is `8429ded45a58266a054b79327648755a908137a73da055157557ff98dc8d2d35`. All candidate file:line references below refer to validation01, not the mutable integration checkout or a later validation checkout.

Verified both retained capture files against the task's exact size/hash references. Core capture is run `7f7fdf20-a3c1-4607-8ffc-135692a1fc10`, generation 2, position 1, attempt 1; UI capture is that run/generation, position 2, attempt 1. Checked relevant captured postimages against the frozen candidate and retained preimage identities. Capture cleanup reports server exit, an empty owned Windows job and empty native-terminal inventory, while out-of-job descendants remain `notVerified`; this is retained producer evidence, not new native qualification. Capture summaries are claims, not substitutes for source review.

Read repository AGENTS.md, the owner-confirmed production risk map and project metadata. Compared the relevant source and test seams to all four hash-bound plan/design/review documents supplied in the task, including composition identity/replay/control requirements and plan section 4.6. Artifact/refinement/native asset providers are explicitly unavailable at this foundation checkpoint; their absence is not counted as a newly discovered implementation defect.

### Genuine native skill activation

Used genuine executor `skills.list` with returned cursor pagination, then genuine `skills.read` with catalog-returned package/main_resource identities. Returned frontmatter names and `skill_root` values matched the selected retained identities. Same-name alternatives were resolved by admitted package root, not name alone.

All roots below are under `C:/Users/ehart/AppData/Local/agent-workflow/runs-v2/7f7fdf20-a3c1-4607-8ffc-135692a1fc10/source-packages-v1/packages/`:

| Selected ID | Catalog name / returned frontmatter name | Matched retained root suffix |
| --- | --- | --- |
| workflow | agent-workflow:agent-workflow / agent-workflow | `81ccc0f85f118deb57143c4b066129c44397f15f1af3e81aab6e0e280f65a13e/skills/agent-workflow` |
| authoring | agent-workflow:workflow-authoring / workflow-authoring | `81ccc0f85f118deb57143c4b066129c44397f15f1af3e81aab6e0e280f65a13e/skills/workflow-authoring` |
| debug | h-superpowers:systematic-debugging / systematic-debugging | `c1aa80898169b589a8c1c575c308bf417e1d5e488567771540d03c2cbfd086f7/skills/systematic-debugging` |
| test-strategy | agent-tests:test-strategy / test-strategy | `4cc697b3411bf70b4f2658e9219a54f919f2b3292dea38e977ea08ad6c1359de/skills/test-strategy` |
| beautiful | hartye-skills:beautiful / beautiful | `2be52948d661a65e0eec8837f4de49934e4cf62ee1c97cf2a0539b568beb8d3d/skills/beautiful` |

Native reference reads succeeded for workflow `references/runtime-api.md`, authoring `references/worker-admission-and-replay.md`, and debugging `root-cause-tracing.md`. The test-strategy shared `references/craft.md` native read returned exactly `skill environment is not available for this callback`. That reference remains missing. No manual SKILL.md read or copied skill body substituted for native activation/reference access. Applied the skills within the source-only task ceiling: trace source causes, preserve evidence boundaries, extend existing invariant owners in proposed verification, and evaluate truthful UI state/interaction rather than invent a redesign.

## Verified source findings

These findings are established by control/data-flow inspection. Except for F7's supplied root execution evidence, their triggers were not executed by this reviewer. The verification proposals below are requested falsifiers for the implementation owner, not passing test claims.

### F1 — P1: Any root text edit discards the entire reusable invocation prefix

**Candidate:** `engine/composition.mjs:21`, `engine/composition.mjs:24`, `engine/composition.mjs:45`; controller integration at `engine/controller.mjs:558`.

**Trigger:** Complete a composed run containing an earlier root worker and a later child. Resume with an edited root that only adds a comment, changes a cosmetic label, or adds an unused workflow declaration. Existing declarations and all effective executed calls can remain identical.

**Cause and impact:** `previous.script !== script` unconditionally sets `cutoff=1`; the copied prefix becomes empty. Earlier completed workers run again, consuming lifetime attempts and potentially repeating external effects. The subsequent per-invocation comparison cannot save them because it is only used before the cutoff. This defeats composition-spec lines 124–132: cosmetic changes remain cosmetic, unused declarations affect subsequent calls, and invalidation starts at the earliest changed invocation with ancestor closure. Whole-root arguments also take this unconditional path even when the earlier calls' effective arguments are unchanged.

**Correction:** Determine reuse from verified effective invocation identities and selected source revisions, then close the changed suffix over ancestors. Preserve the unchanged prefix. Keep root execution/authority changes explicit and fail closed when matching cannot safely establish reuse; do not silently reinterpret a cosmetic edit as permission to repeat completed writers.

**Meaningful verification:** Extend `test/engine-controller.test.mjs`. Complete a real evaluator/controller run with two observed worker effects. Resume after only a root comment/label edit and after adding an unused alias; assert no new effects, intact cached source refs and unchanged lifetime consumption. Separately change the later effective call and assert only its affected suffix/ancestors execute. Include an explicit child-source revision control.

### F2 — P1: A completed agent's journal result is not bound to its authoritative worker result

**Candidate:** `engine/composition-store.mjs:42`, `engine/composition-store.mjs:44`, `engine/composition.mjs:72`.

**Trigger:** In a disposable persisted run with two different completed agent results, replace the first invocation's `result` BlobRef/resultHash with the second invocation's valid retained result reference and recompute only that invocation's record_hash. Leave its worker result, worker resultHash, prompt/options, key and links unchanged.

**Cause and impact:** History validation checks the worker's result against its own hash, and the invocation blob against its own hash, independently. It never compares the invocation result with that worker's authoritative result. The valid but foreign result therefore passes those checks. Cached agent replay returns the invocation blob, while worker inspection still reports the original result. A source/result mismatch can change downstream decisions without any new worker execution or integrity refusal. This violates complete journal/worker/result binding, including replayed parent validation.

**Correction:** For agent records, verify the canonical result bytes/value against the resolved worker result, together with its execution identity and applicable schema. Do not directly equate the two existing hashes: worker resultHash uses ordinary JSON serialization while invocation blobs use canonical serialization. Validate reused lineage consistently as well.

**Meaningful verification:** Extend the existing persisted corruption cases in `test/engine-controller.test.mjs` with the valid-foreign-result substitution above. Require both saved reads and resume to reject `COMPOSITION_CORRUPT` before generation/attempt changes or backend effects. An unmodified control must still replay both results correctly.

### F3 — P1: Self-consistent step catalogs can contradict their retained script

**Candidate:** `engine/steps.mjs:22`, `engine/steps.mjs:26`, `engine/steps.mjs:29`; callers at `engine/controller.mjs:89` and `engine/steps.mjs:57`.

**Trigger:** Delete an unassigned verification step from the stored root catalog, keep sourceId equal to the unchanged retained root script hash, and recompute catalogHash. For a child, similarly edit its step list while retaining the correct invocation/sourceId binding. Use no assigned step in the removal so worker association validation is unaffected.

**Cause and impact:** Catalog loading verifies the record's own digest and declaration validity. Binding checks only that sourceId names the root script or child invocation's source. Neither compares `catalog.steps` with `parseScript(verifiedSource).meta.steps`. A validly rehashed truncated/replaced catalog is served with reduced exact coverage, hiding declared incomplete work while claiming authentic source binding. Full-page validation does not close this gap because every page trusts the same altered catalog.

**Correction:** Resolve the actual retained root/child source and compare the complete normalized declaration list against the persisted scope catalog. Bind scope multiplicity/order and the expected declaration digest to that source before projecting any page or authorizing replay. Preserve source IDs and original blobs.

**Meaningful verification:** Extend the existing `steps validate full source bindings before a paged response` case in `test/engine-controller.test.mjs`. Keep sourceId correct; remove/change an unassigned declaration, rehash the catalog and request page one with the altered entry outside that page. Both root and child variants must reject `STEP_CORRUPT`; the intact catalogs must retain exact counts and bindings.

### F4 — P1: Cancelling a queued child does not settle its admission promise

**Candidate:** `engine/composition.mjs:36`, `engine/composition.mjs:37`, `engine/composition.mjs:38`, `engine/composition.mjs:77`; acknowledgement at `engine/controller.mjs:326`.

**Trigger:** At concurrency 1, child A occupies the child lifetime permit while waiting for an intentionally unbounded agent. Child B is queued. Submit an authenticated exact-revision `cancel-child` for B while leaving A running.

**Cause and impact:** `cancelChild` aborts B's controller, but `acquire` installs no per-item abort listener. The queue is only drained by the root signal or `wake()` after a lifetime permit is released. Thus B's receipt becomes applied while its invocation and waiting root workflow promise remain unsettled indefinitely if A does not finish. B has no process, yet its cancellation depends on an unrelated sibling. This violates the subtree cancellation/queued-intent settlement contract and makes the control ineffective in the default manual-lifetime mode.

**Correction:** Make queued acquisition observe its own signal, remove that item and reject it immediately without borrowing/releasing an unacquired slot. Retain explicit no-process outcome facts; preserve sibling A and release active permits only after verified settlement/exit.

**Meaningful verification:** Extend the controller process/control owner using a held A fixture and queued B. Cancel B, read its same UUID receipt, and assert B reaches cancelled with no spawn before releasing A. Assert A remains active, FIFO admission for surviving siblings is unchanged, no permit leaks occur, and stale generation/revision and repeated-request controls retain their existing behavior.

### F5 — P1: A failed appended worker makes composed-run recovery unreachable

**Candidate:** `engine/restart.mjs:12`, `engine/restart.mjs:13`, `engine/restart.mjs:14`; opposite guard at `engine/background.mjs:45` / `engine/controller.mjs:261`.

**Trigger:** A composition-enabled run admits a live appended task while a root worker is active. The earlier root work completes and the appended worker fails with positive owned/native drain evidence. Request the existing reconciled physical-suffix restart for that append position and attempt.

**Cause and impact:** Append workers retain `origin.kind='append'` and do not have guest invocation records. The new unconditional composition branch nevertheless requires `worker.invocation.parentSeq` or `.seq`, returning `RESTART_DRAIN`. Ordinary resume independently refuses any noncompleted append with `APPEND_RECONCILE`. Both supported recovery paths therefore reject this valid, reconciled failure. Existing append support and shared accounting do not imply an invocation binding that the implementation never writes.

**Correction:** Handle append origins explicitly when constructing a composed physical-suffix restart. Resolve the affected guest/child invocation suffix and ancestor closure from authoritative records where applicable, while retaining the append origin, exact drain requirements, reconciliation and lifetime budget. Do not fabricate a guest invocation for an appended task or relax drain guards.

**Meaningful verification:** Extend `test/engine-restart.test.mjs` and its existing public controller boundary with a composed run plus a failed, positively drained append. Verify the exact failed append restarts once, earlier completed work remains reused unless genuinely in the affected closure, and unknown drain still refuses. Retain a separate child-worker restart control.

### F6 — P2: Every poll rereads every loaded step page, bypassing the browsing request bound

**Candidate:** `engine/monitor/app.mjs:1618`, `engine/monitor/app.mjs:582`, `engine/monitor/app.mjs:583`, `engine/monitor/app.mjs:587`; existing test gap at `test/engine-monitor-ui.test.mjs:247`.

**Trigger:** Load several step pages and leave the default periodic polling active, including after execution closes and the snapshot remains unchanged. Alternatively reach the 64-page browsing limit against a tiny-page provider.

**Cause and impact:** Every successful run poll unconditionally calls `loadSteps(false)`, which restarts at the head and reads `state.pages` pages. The page budget caps explicit Load more operations, not repeated automatic reads. An unchanged complete catalog is fetched again on every poll; reaching the request limit still allows another full batch each tick. Each actual provider page also invokes complete saved-state/catalog validation. This creates repeated potentially expensive reads, delays interaction/freshness and contradicts the required absence of repeated page fetches. The budget regression test selects manual polling, so it cannot expose the automatic path.

**Correction:** Retain loaded pages across unchanged snapshot/catalog identities and refresh them only when the relevant source/generation/association state changes or the user requests refresh. Track a real bounded refresh policy and preserve selection/focus/scroll/transform. A new scope or cursor conflict must explicitly restart at the head without silently dropping prior coverage or starting an unbounded request chain.

**Meaningful verification:** Extend the UI pagination owner with automatic timer ticks and an unchanged completed snapshot after loading multiple pages; assert no repeat continuation fetches or further reads after the budget is exhausted. Then change an association/add a child scope and assert one bounded refresh, stale-response rejection, exact coverage and stable selected DOM/focus/inspector/map state.

### F7 — P2: Saved-source refusal is masked as a provider failure in the frozen CLI

**Candidate:** `bin/command.mjs:76`, `bin/command.mjs:130`; source guard at `engine/registry.mjs:26`; observed failing assertion at `test/managed-entry.test.mjs:161`.

**Trigger:** Run `plan project:inert --cwd <owned fixture>` where the saved workflow is a physical hardlink. The strengthened registry now rejects the source before boundedText/provider import.

**Cause and impact:** The registry raises `WORKFLOW_PATH`, but the roadmap catch translates every non-CLI error into generic `CLI_PROVIDER`. The correct fail-closed single-link rejection remains, while its actionable input diagnosis is lost and the required host owner check fails. This is a diagnostic/public CLI regression, not evidence that hardlinks were accepted.

**Correction:** At saved plan-source resolution, map only the fixed allowlisted source error to a safe `CLI_FILE` message, preserving rejection and the provider privacy boundary. Keep actual host CLI execution native; retain the VM facade solely for guarded worker fixtures. Do not expose arbitrary source/provider messages or paths.

**Meaningful verification and current disposition:** Root's original combined check observed the physical-hardlink subtest failure and its parent failure. The later native host reproduction ruled out the earlier VM-realm diagnosis. The coordinator reports the narrow mapping correction and native-host harness adjustment; `foundation-host-r3-receipt.json` and its verified stdout attest 55 passed, zero failed/skipped on later validation03. That addresses this issue in coordinator follow-up, but those source bytes are outside this review's frozen candidate and have not replaced it here.

## Positive source observations and limits

The reviewed code uses a separate scrubbed QuickJS evaluator process, rejects depth-1 composition, and holds a separate FIFO child lifetime permit through evaluator exit and child work settlement. Native workers still use their existing independent permit pool. Source descriptors are frozen before public backend dispatch, and retained complete sources are verified before replay. Invocation ordering closes source-revision invalidation over ancestors. Root/child local worker IDs use separate scope maps; physical slots and lifetime attempts use the shared admission ledger. These are source observations, not native process qualification.

Declared catalogs exist before root evaluation and child process admission, and actual associations are written with worker intent. Step projection checks complete stored catalogs/associations before slicing pages, binds cursors to run/generation/catalog sequence, and preserves dynamic workers and unassigned planned steps. The UI uses structured scoped keys, distinguishes dashed plan relations from worker dependencies, gives unassigned steps no worker menu, and keeps terminal unassigned steps incomplete. It includes run/generation stale-response checks, stream byte bounds for step success/error responses, keyed DOM updates and transform/focus preservation. F3 and F6 limit the completeness/performance claims these mechanisms can support.

LAN source retains loopback/port-0 defaults, requires one exact current canonical private IPv4 interface, revalidates the selection before listen, advertises that same address/actual port, and checks ready/started network/service identity. Host/Origin and bearer checks remain exact. Recorded-runtime step/child adapters refuse absent providers explicitly. No firewall, LAN service or second-device action was performed here.

## Retained root execution evidence and follow-up

Read `foundation-root-check-receipt.json` and the complete supplied stdout's relevant results. Verified stdout against the receipt: 44,997 bytes, SHA-256 `3ca4b082ee5742e2c6aeeba87cdedcff8676529071b6478d34606c09721a1563`. It records 351 tests, 349 passed, 2 failed, zero skipped; exit code 1, complete coverage/closed stdio, unchanged original source/validation identities. The two failures are the hardlink subtest and its parent, not two independent production failures. This is the coordinator's executed check; this reviewer did not rerun it.

Also read and verified stdout identities for the coordinator's later receipts:

| Follow-up | Actual retained result | Source binding / limitation |
| --- | --- | --- |
| `foundation-host-r3-receipt.json` | 55 passed, zero failed/skipped; exit 0; stdout 4,815 bytes, SHA-256 `1e6ce57fd8a47386635281c14da340f143a788a458257c636ad53b612d24e940` | Source `e3f33731dd40c65a6a668dbd3852941795864070947ed8c455089cebb752f334`, validation03. Coordinator follow-up to F7, not validation01 acceptance. |
| `visibility-provider-r2-receipt.json` | 87 passed, zero failed/skipped; exit 0; stdout 9,311 bytes, SHA-256 `3680aab611b0d0fd402b78a3719dba2be5593bb568ac82d465d9dba4ba5faff6` | Source `3139afbe017fc658486e4e6ad3dce38e98b5a148d4fade4b8546cca0156d7a2c`, visibility-provider-validation02. Includes the coordinator-reported persisted-provider/DOM handoff case; it does not certify the frozen UI or painted/native behavior. |

Coordinator's initial VM diagnosis is superseded by the native reproduction and fixed source-error mapping. Its initial asynchronous UI fixture wait failure remains retained historical evidence; the reported correction changes the harness wait, not production behavior. No later mutable candidate source was silently substituted during this review.

## Open questions and missing acceptance

- F1–F6 need implementation-owner falsifying tests and corrections; this source-only reviewer was expressly prohibited from executing tests or modifying code. Passing existing root tests does not cover these triggers.
- Final integration must freeze a new candidate containing accepted fixes and bind fresh verification to it. Later owner receipts do not retroactively make validation01 pass. A complete final merge/check/smoke, clean-package installation and audit/release gate set remains outside this review.
- Artifact derivation, refinement transitions/counters, native asset read evidence, generated/exported artifacts, blinded/final review acceptance and their integration remain unavailable/unqualified at this provisional checkpoint.
- Native candidate qualification of independent child/native pools, cancellation/drain, concurrency-1 behavior and replay/crash negatives remains missing. Synthetic backend cleanup in tests is not a genuine native drain observation.
- Real painted desktop/phone acceptance, keyboard/focus behavior in a browser, LAN access from a second device and any justified firewall operation remain missing. DOM and local HTTP source/tests do not supply them.
- Test-strategy's native shared craft reference failed with the exact callback error recorded above. External wiki follow-through belongs to the coordinator; this task authorized no wiki writes or discovery/ingest operations.

Only `reports/composition-refinement/foundation-visibility-review.md` is owned and authored by this review role. No commit, merge, delegation or workflow runtime launch was performed.
