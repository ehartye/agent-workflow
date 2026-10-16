# Frozen visibility/core source re-review

The assigned source re-review is complete. **Two blocking findings remain: B1 (P1), missing required step associations pass validation; B2 (P2), terminal blocked runs label unassigned work Planned.** The seven original concrete triggers have source corrections and relevant regression assertions. Closing those original triggers does not close the two findings below or establish shipment acceptance.

This is independent static source review. No candidate tests, native workers, workflow/server/CLI launches, dependency preparation, installation, network, controls, Git commands/metadata changes, source fixes, delegation, wiki writes or publication were performed. Only this named report is authored in the assigned worktree. Findings below are established by source/data-flow inspection; their proposed falsifiers were not executed by this reviewer.

## Exact inputs and review boundary

Task `visibility-recheck-task.json`: 7,452 bytes, SHA-256 `396bcf38fe7f39f5c06877830c33dfa7b266dc6b24c3e1cdacbd121688a4564e`.

Snapshot `visibility-revision-join-intent.json`: 666,556 bytes, SHA-256 `425b9c2a62fded600ea99928cc6f4db8775d090efd69ee10ba1aaa4d3c267e41`.

Actual reviewed frozen candidate root, used for **every candidate file:line below**:

`C:/Users/ehart/repos/agent-workflow-worktrees/composition-visibility-revision-join-01`

Snapshot source identity: `c483ff3469369b04b2e04002c2f0a906b48048d18897980fdaea89bac0c43bbf`; validation identity: `f615f67faeb712fc8f847bad7861c23b7bc1ba55aaf7804031dccd60545322aa`.

Verified the task and all its bound review, capture, provider-contract, correction-report, joined-check and design/plan references against their exact byte counts and SHA-256 values. Verified ordinary candidate files against `snapshot.sourceFiles` at the snapshot's `validation` root before inspecting candidate contents. Did not inspect the independent dependency payload, substitute live integration/predecessor bytes, or overlay source onto this reviewer's original checkout. Read AGENTS.md and the production risk map; engine/foundation/CLI are critical areas with saved-run and prior-runtime consumers. Compared the relevant composition identity/replay provisions and plan section 4.6 with the implementation and test assertions.

The core correction capture identifies run `7f7fdf20-a3c1-4607-8ffc-135692a1fc10`, generation 2, position 6, attempt 1. Its retained positive owned-job/native-terminal cleanup does not prove this candidate's genuine native composition behavior; out-of-job descendants remain `notVerified`. Producer reports and receipts were treated as evidence of what was reported/executed, not substitutes for source judgment.

## Genuine native skills

Called genuine `skills.list({authority:{kind:"executor"}})` through all returned cursor pages. Selected exact IDs using native catalog metadata and admitted roots, then called genuine `skills.read` with each returned package and main_resource. All five returned frontmatter names and skill_root values matched the expected selected identities. Discovery alone was not counted as invocation.

All root suffixes below are under `C:/Users/ehart/AppData/Local/agent-workflow/runs-v2/7f7fdf20-a3c1-4607-8ffc-135692a1fc10/source-packages-v1/packages/`:

| Selected ID | Catalog name / returned name | Matched root suffix |
| --- | --- | --- |
| workflow | agent-workflow:agent-workflow / agent-workflow | `81ccc0f85f118deb57143c4b066129c44397f15f1af3e81aab6e0e280f65a13e/skills/agent-workflow` |
| authoring | agent-workflow:workflow-authoring / workflow-authoring | `81ccc0f85f118deb57143c4b066129c44397f15f1af3e81aab6e0e280f65a13e/skills/workflow-authoring` |
| debug | h-superpowers:systematic-debugging / systematic-debugging | `c1aa80898169b589a8c1c575c308bf417e1d5e488567771540d03c2cbfd086f7/skills/systematic-debugging` |
| test-strategy | agent-tests:test-strategy / test-strategy | `4cc697b3411bf70b4f2658e9219a54f919f2b3292dea38e977ea08ad6c1359de/skills/test-strategy` |
| beautiful | hartye-skills:beautiful / beautiful | `2be52948d661a65e0eec8837f4de49934e4cf62ee1c97cf2a0539b568beb8d3d/skills/beautiful` |

Native reference reads succeeded for authoring `references/worker-admission-and-replay.md` and debugging `root-cause-tracing.md`. The test-strategy shared `references/craft.md` native read returned exactly **`skill environment is not available for this callback`**. That reference stage remains missing. No command/manual SKILL.md read, copied body or CLI activation substituted for it. This is observed plugin friction for the coordinator's roadmap; external wiki writes were prohibited here.

Applied the skills within the source-only task: trace each defect through public/provider boundaries before proposing correction; preserve retained identities and unknown effects; assess behavior/assertions under existing test owners; assess truthful graph structure, status, focus and copy without inventing a redesign or painted-browser evidence.

## Confirmed remaining blockers

### B1 — P1: Missing required StepRef is accepted as dynamic work

**Frozen locations:** `engine/steps.mjs:74`, `engine/steps.mjs:77`; required association resolver at `engine/steps.mjs:49`; admission at `engine/controller.mjs:416` and `engine/controller.mjs:429`. Saved-read/replay consumers: `engine/controller.mjs:89`, `engine/controller.mjs:269`; summary consumer: `engine/monitor-data.mjs:102`.

**Concrete trigger:** Finish an ordinary or composed run whose declaration has `worker:{id:"reader"}` and whose actual agent has `id:"reader"`; alternatively use an unbound declared step with actual `options.stepId`. In a disposable saved database, remove only that worker's `step` property (or set it to null). Keep its options, origin, journal, key, result, catalog, worker count and admission evidence intact. This mutation does not require rehashing any invocation or catalog.

**Cause:** `projectSteps` first finds workers by their already-stored StepRef. It recomputes `associateStep` only for those matches. Its final rejection loop also runs only when `w.step` is truthy. A worker with a deleted StepRef therefore bypasses both checks even though its options and exact scope require a binding. `validateStepWorkerSet` checks counts/status/cache lineage, not that missing binding; composition journal validation does not bind the StepRef either.

**Impact:** The provider returns a valid-looking page with the declared step unassigned and the actual worker counted as dynamic. The summary emits a new supposedly verified stepsRevision over this contradiction. The UI can display both an incomplete plan node and the separate real worker instead of the one required logical association. Saved reads accept it; composed replay copies the missing association in `engine/controller.mjs:569` rather than refusing it. Source/catalog validation alone does not establish complete association integrity.

**Correction:** Validate each non-append worker against the catalog derived from its actual root/child origin, independently of whether `worker.step` exists. Recompute the expected association from the existing resolver and require exact equality to the stored association, including null/absence when truly dynamic. Retain append's explicit unbound rule. Make this complete validation common to summary, page/catalog reads, saved reads and replay before generation publication; do not repair corrupt saved evidence silently.

**Meaningful falsifier:** Extend the existing controller/monitor corruption owners, including the beyond-first-page assignment case in `test/engine-monitor.test.mjs:57`. Cover preset and explicit bindings in root and child scopes; delete/null only the StepRef with the selected step outside page one. Require `STEP_CORRUPT` from summary, page one, catalog/saved reads and resume, with unchanged generation/attempts and zero backend effects. Intact associations and genuinely unbound dynamic workers must remain valid. Existing catalog removal/replacement tests and assignment-change tests do not exercise this deletion.

### B2 — P2: Terminal blocked run keeps unassigned steps labeled Planned

**Frozen location:** `engine/monitor/app.mjs:498`. Actual terminal producer: `engine/controller.mjs:680`, published at `engine/controller.mjs:686`. Status consumers include the step list at `engine/monitor/app.mjs:572`, inspector at `engine/monitor/app.mjs:561` and map at `engine/monitor/app.mjs:1449`.

**Concrete trigger:** Declare an unassigned verification step, stop an active run, and retain an unknown worker interruption or unverified server exit. The controller settles that generation as `blocked` and records its run-terminal notification. Its execution admission is closed.

**Cause and impact:** The unassigned-step status function recognizes `completed`, `failed`, `stopped` and `unknown` as Incomplete, but omits the controller's actual terminal `blocked` status. It therefore renders Planned in the map, step list, accessible label and selected inspector, despite terminal execution and the coverage text saying that closed-admission unassigned work remains incomplete. This fails the explicit terminal-unassigned visibility requirement at the failure boundary where accurate incomplete coverage matters most.

**Correction:** Recognize terminal blocked execution in the shared unassigned-step presentation rule, retaining independent unknown worker evidence, unverified acceptance and disabled controls. Distinguish paused/live states according to their actual resumption semantics rather than assuming every closed admission is terminal.

**Meaningful falsifier:** Extend `test/engine-monitor-ui.test.mjs:154` with a `blocked`, closed-admission snapshot retaining an unknown actual worker and an unassigned declaration. Require Incomplete across map/list/inspector/accessible label, no synthetic worker/control, and unchanged unknown execution evidence. Bind a provider/DOM case to the existing stop/unknown controller owner (`test/engine-controller.test.mjs:726`) when implementing the repair. The current UI status case changes only to completed; the persisted-provider case also ends completed, so neither catches this omission.

## Original F1–F7 reassessment

These dispositions concern the earlier concrete triggers, not blanket correctness claims or reviewer-executed tests.

| Original finding | Corrected source and regression relevance |
| --- | --- |
| F1 — cosmetic edits repeat prefix | `engine/composition.mjs:21` removes whole-root text/args invalidation. Effective calls match at :54–59; label/phase are removed from agent effect identity at :82; phase/log do not consume local effect ordinals. Missing/mismatched cached root calls refuse at :55–56/:88. Controller :251–254 checks backend/deadline and re-resolved effective options before a generation. `test/engine-controller.test.mjs:145` asserts two effect counters stay unchanged through comment, label, phase/log and unused alias changes, changed call refusal, and explicit reconciled child replacement spending only its suffix. :177 covers cached child settings/default deadline changes before generation/effect mutation; :86 covers interleaved ancestor closure. Relevant falsifiers, rather than only cached flags. |
| F2 — valid foreign result accepted | `engine/composition-store.mjs:40–62` verifies canonical journal bytes, separately verifies ordinary worker JSON hash/schema, compares authoritative values and follows decreasing reused invocation/worker lineage. Full current history and links are visited at :65–72. `test/engine-controller.test.mjs:162` uses distinct noncanonical-insertion-order results, a successful replay control, then substitutes valid foreign result references into fresh and reused records. Saved read/resume must reject before generation/attempt/effect changes. The old independent-hash defect is addressed without incorrectly equating serialization hashes. |
| F3 — rehashed catalog contradicts source | `engine/steps.mjs:28–46` compares complete ordered root/child catalogs with parsed retained source and requires exact scope multiplicity/order, source IDs and bindings. :92/:98 validate before slicing/returning; controller :269 validates before replay generation publication. `test/engine-controller.test.mjs:126` removes/replaces declaration three with unchanged sourceId and recomputed catalogHash, removes scopes and changes source IDs in both root/child cases; page one and resume reject. Original declaration defect addressed. **B1 remains a separate association-completeness failure.** |
| F4 — queued cancellation waits for A | `engine/composition.mjs:43–47` installs per-item abort handling and removes/rejects only the queued item; :73 releases a slot only if acquired and records explicit no-process facts. `test/engine-controller.test.mjs:198` holds A, cancels B through an actual separate public-control client, requires B cancelled/applied and calls still only A before release, checks no B child spawn, retained noInference, C/D FIFO and live-count bounds. Stale generation/revision and UUID conflicts/duplicates are asserted. The original missing-listener trigger is addressed; backend cleanup remains synthetic qualification. |
| F5 — failed physical append unrestartable | `engine/restart.mjs:12–37` excludes physical append origins from fabricated invocation requirements, closes affected actual guest/child physical bindings, and retains per-affected positive drain/attempt/lifetime checks. Composition :30 closes journal cutoff over ancestors, including worker-free containers. `test/engine-restart.test.mjs:35` actually admits B while A runs, proves B has append origin and no invocation, then restarts B alone or B plus later child C while caching pure prefix. Unknown native drain refuses with generation/effects unchanged. Separate child restart/interleaving coverage remains. No native restart was performed here. |
| F6 — unchanged polls reload loaded pages | `engine/monitor-data.mjs:30–33` opens a single SQLite read snapshot; :97–102 verifies complete catalogs/workers/journal before deriving revision. `engine/steps.mjs:86–88` excludes activity/timestamps and includes actual catalog/assignment/attempt/status/source/admission inputs. UI :585–590 skips unchanged identity; changed/explicit refresh starts at head with bounded previous page count, 64-page/16 MiB limits, stale-run/generation checks and keyed rendering. `test/engine-monitor-ui.test.mjs:224`, :238 and :326 assert unchanged automatic polling, explicit refresh, child appearance and exhausted-budget behavior. The :111 persisted-provider case feeds actual monitorData stepsRevision and readStepsAt to DOM; unchanged provider revision causes no page reload and assignment/terminal change exactly one head refresh. `test/engine-monitor.test.mjs:30`, :46 and :57 isolate activity stability, worker-free scope changes and beyond-page assignments. Original repeated-unchanged-page defect addressed. These tests establish fixture/DOM scope only. |
| F7 — safe source diagnosis masked | `bin/command.mjs:78–79` maps only WORKFLOW_PATH to fixed CLI_FILE text, before bounded source read/provider import; other provider errors retain the generic privacy boundary at :135. `test/managed-entry.test.mjs:160–166` checks deterministic reader failures and actual physical-hardlink refusal for explicit and saved source. Retained host-r3 evidence is a real earlier host run; worker restrictions are not falsely relabeled native hardlink coverage. The corrected mapping is present in this frozen source and discloses no private path/provider message. |

## Other visibility and boundary observations

Root catalogs are retained at `engine/controller.mjs:309` before root evaluator admission; child catalogs and invocation intent publish in one transaction at `engine/composition.mjs:68` before child fork. Association writes accompany actual worker/journal intent. Exact run/generation/scope/step identities distinguish same-named child steps, real dynamic workers remain, and dependency declarations remain display-only. Keyed graph updates and selected inspector focus/scroll/pan preservation have relevant assertions at `test/engine-monitor-ui.test.mjs:177`, :195, :206 and :283. B1 and B2 limit the truthfulness claim.

Complete catalog/source/association projection occurs before page slicing. Limits remain 256 per scope, 4,096 instantiated declarations, 1 MiB UTF-8 response, bounded opaque catalog cursors and explicit corruption/conflict errors. `engine/monitor/app.mjs:823–828` reads both success/error streams through a fatal UTF-8 decoder and byte cap; duplicate/cyclic/mismatched/incomplete pages fail without inventing coverage. Client conflict recovery preserves a stale prefix and requires explicit refresh or a changed observation; it does not repeat a mutating action. Tests at UI :254/:264/:302/:311/:338 cover relevant public negatives. No absent artifact/refinement/native-image behavior is counted as a visibility defect.

Recorded provider adapters load each verified run runtime, explicitly refuse absent step/child exports and do not migrate controls (`engine/monitor-adapters.mjs:62–64`). Pinned/scoped HTTP paging validates duplicate/unknown fields and exact generation (`engine/monitor/services.mjs:102–107`); CLI steps uses the same readStepsAt provider (`bin/command.mjs:203–204`). Missing old-runtime support remains unavailable instead of a reconstructed plan or enabled controls.

The script → steps → composition/store import cycle has no observed top-level invocation of unfinished imported functions; provider signatures at their call sites match the corrected async validators. This is static closure review, not a new module-load execution. Guest source still crosses a bounded envelope to `fork` in `engine/evaluate.mjs:20`, and QuickJS evaluates it in `engine/evaluator-child.mjs`; host parsing does not evaluate guest code. Unintegrated refinement/native-asset services refuse explicitly.

LAN selection still requires one exact canonical local private IPv4 interface and rechecks its identity before listen. `engine/monitor-server.mjs:30` checks exact Host/Origin, :34–35 requires bearer authentication for API reads/controls, and :91–95 retains selected-interface/actual port binding with loopback default and port 0. No new network/control authority was inferred from visibility. No LAN or second-device observation was made.

## Retained checks and explicit missing acceptance

Verified each supplied stdout against its receipt's byte count/hash before reading its outcome:

| Retained check | Result and exact scope |
| --- | --- |
| visibility-core-join | 175 passed, zero failed/cancelled/skipped, exit 0; stdout 18,645 bytes, SHA-256 `4918139ce0828db6845f2d0273d9b534425798f7e15bfba0814e27608375bd83`. Combined core/UI on source identity `5a322600e4eaf5caa28189e0173ed3407158b1ad0f954cd49e7fecb0e8a1cb36`, before the additional provider-to-DOM test. |
| visibility-revision-join | 89 passed, zero failed/cancelled/skipped, exit 0; stdout 9,534 bytes, SHA-256 `18c1ae31b47a3b1c7ac0bde11ff895164bec64fab97e86f982ea4ffcc17314b4`. UI owner on this task's exact frozen candidate, including the actual monitorData revision → DOM case. |
| foundation-host-r3 | 55 passed, zero failed/cancelled/skipped, exit 0; stdout 4,815 bytes, SHA-256 `1e6ce57fd8a47386635281c14da340f143a788a458257c636ad53b612d24e940`. Earlier host source identity `e3f33731dd40c65a6a668dbd3852941795864070947ed8c455089cebb752f334`, including F7 host correction; not full exact-current-candidate host acceptance. |

Receipts retain complete coverage, closed stdio, unchanged source/validation identities and readyToShip:false. None was rerun by this reviewer. Existing passes do not cover B1/B2 and are not proof that every frozen source behavior is correct.

**Unresolved acceptance questions:** The coordinator must obtain falsifying coverage and corrections for B1/B2, review integration, freeze the resulting candidate and bind fresh checks to it. This gate does not authorize ready-to-ship notification. Independent source review cannot answer whether real native cancellation/drain/pool/replay behavior or painted interaction meets the contract.

**Missing coverage, retained explicitly:** genuine native core/child/native-pool and concurrency-1 behavior; active/queued cancellation with real owned/native drain; native replay/crash/unknown negatives; full final `npm test`, `npm run check`, `npm run smoke`; clean-package `node scripts/check-install.mjs` and `npm audit --omit=dev`; installed/recorded-runtime qualification of the new seams; deferred painted desktop/phone/keyboard/focus and second-device LAN acceptance; artifact/refinement/native-image/asset observation/export/final semantic acceptance at its later checkpoint; the native shared craft reference. Source support and DOM assertions do not fill these gaps.

**Nonblocking follow-ups:** coordinator-owned wiki discover/ingest/as-built/roadmap work remains outside this task. Record the native shared-reference callback failure as plugin friction. Preserve the explicit unsupported artifact/refinement checkpoint and prior runtime boundaries; do not invent absent functionality to clear or enlarge this review gate.
