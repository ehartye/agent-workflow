# Finish the workflow release

> Execute through Agent Workflow with isolated writers and coordinator integration. Owner approved remaining development and shipment on 2026-10-15. Keep GitHub Actions disabled unless the owner explicitly changes that instruction. This scope is the current delivery batch, not every historical roadmap proposal.

**Goal:** Finish the next engine release after the dashboard/input/output and run-picker work shipped separately in 0.3.6. The remaining scope is live independent additions, durable command facts, consumer observation coverage, manual live worker deadlines, and authoring/recovery guidance with fresh evaluation.

**Architecture:** Existing QuickJS broker and native backend remain the only execution path. SQLite owns admission, persistence and uncertainty. Execution facts and consumer coverage have separate bounded records; neither promises unavailable command bodies or host chat delivery.

**Stack:** Node 24 ESM, SQLite, pinned Codex App Server 0.162.1, node:test, existing browser verification.

## As-built checkpoint — 2026-10-15

- **Shipped and installed:** original dashboard layout, input/output improvements and final run-picker refinements in 0.3.6, repository PR #11 / tag `v0.3.6`, marketplace PR #173. The owner selected a local-verification exception for that release; protection was restored and GitHub Actions remains disabled. The delivery receipt is `reports/release-0.3.6-delivery.json`. That exception is recorded history, not an invented hosted-CI pass or a blanket exception for the next release.
- **Implemented, affected-tested and independently reviewed; not released:** append admission/scheduling/replay, command facts, consumer receipts, and deadline core plus CLI controls. Section checkmarks below describe those bounded milestones, not combined release acceptance. Earlier incomplete producer reports and RED evidence remain preserved alongside coordinator integration results.
- **Authoring evaluation complete within scope:** v1 failed plan acceptance and remains preserved. V2 pair `525e0816…`, fresh blind grading and independent full-artifact review accepted both plans at 12/12. No score advantage, general causal benefit or automatic-trigger claim follows. Evidence is in `docs/reviews/2026-10-15/authoring-v2/`.
- **Native candidate acceptance complete within scope:** run `11684a6e…` verified same-turn deadline controls and one idempotent independent append with two actual native workers, retained command facts, consumed terminal and positive unforced cleanup. The earlier unsupported-timeout-field probe remains not accepted. Exact source and scope are in `reports/native-live-controls-0.4.0.json`.
- **Canonical package verified:** after the text-identical monitor newline normalization, 622/622 tests, check, smoke, isolated clean installation, production audit (zero vulnerabilities) and zero-inference parent-access doctor passed. Both earlier candidate runtimes and the owner-selected 0.3.6 installation were preserved. The native-tested and canonical digests remain distinct in `docs/releases/0.4.0.md` and `reports/release-0.4.0-local.json`.
- **Pending:** final reviewed source checkpoint/push/PR, publication/installation and canonical wiki closeout. The unpublished branch was rebased and 0.4.0 metadata prepared; refresh remote state before delivery.

## 1. Live independent additions — isolated writer

Own engine/controller.mjs, engine/controls.mjs, engine/restart.mjs, engine/background.mjs, bin/arguments.mjs, bin/command.mjs, new engine/append.mjs or focused admission modules, corresponding existing controller/background/managed-entry test owners and new append test if necessary. Own docs/live-append.md and a bounded implementation receipt. Do not edit activity/watch/UI/foundation/skill source. The approved full specification is docs/superpowers/specs/2026-10-14-live-run-append-design.md.

- [x] Public RED/GREEN coverage added for same-run dispatch, idempotent request receipts and wrong generation/session refusal.
- [x] Strict bounded task-file admission and transactional per-generation budget/slot ledger integrated with the existing scheduler and backend; shared concurrency and lifetime attempts retained.
- [x] Guest ordinal separated from physical slot, dependency origin and cached source position; interleaved guest/addition replay and suffix restart covered.
- [x] Admission versus completion/Pause/Stop, accepted queue drain, failure aggregation, unknown dispatch and capability/input ceilings covered without uncertain-effect retry.
- [x] Captures integrated, affected tests and independent spec/quality reviews completed. The original writer receipt in `docs/reviews/2026-10-15/live-append.md` remains its historical checkpoint, including then-pending work.
- [x] Shared `projectAdditionWorkers` read projection used by saved-run and monitor readers. Committed active intent without confirmed running evidence is unknown, not queued; row-count and 2 MiB-per-row guards reject corrupt/excess records before payload parsing. The focused projection review passed; the later shared-dispatch affected run passed 154/154, not the full combined suite.
- [x] Fresh native read-only append verified exact retained-runtime/session identity, actual overlap, duplicate request identity, wrong-session/generation refusal, two total starts and positive unforced owned cleanup. No task-specific skills were required or activated; this is not skill-grant or writer-append acceptance.

## 2. Durable command evidence — isolated writer

Own engine/activity.mjs, foundation/turn.mjs only if required for sanitized metadata, existing activity/turn tests and fixture additions that do not overlap the append writer; docs/durable-command-facts.md and bounded receipt.

- [x] Existing activity owner extended with failing pressure/persistence tests before implementation; early command lifecycle facts survive ordinary activity eviction.
- [x] Separate bounded sanitized facts integrated, including identity/fingerprint or explicit omission, reported exit/timeout outcome, count/byte budgets and durable eviction counters. No raw shell bodies, reasoning or credentials retained.
- [x] Facts exposed through the existing activity read contract; exact schema, coordinates, outcome consistency, stored byte sizes and aggregate budgets validate before records are exposed.
- [x] Affected activity/turn owners passed 57/57 after review corrections; independent spec and quality review completed. See `docs/durable-command-facts.md` and the historical source receipt `docs/reviews/2026-10-15/command-facts.md`.
- [x] Combined pre-normalization gates and scoped native command-fact verification completed: six retained lifecycle facts for three observed commands, zero drops. Retained command reports do not prove arbitrary effects or recover missing old payloads; final canonical gates remain separate below.

## 3. Observer coverage — coordinator

Implemented in `engine/observer-coverage.mjs` with existing watch and dedicated receipt tests. The named coordinator/host consumer owns the receipt separately from execution data. Successful writes to watch stdout are not consumption acknowledgments.

- [x] RED/GREEN tests cover launch/consumed attachment, last actually processed cursor, terminal replay, disconnect/reconnect gaps, cancellation, bounded receipts and corruption refusal.
- [x] Versioned receipt written atomically only after the named consumer handles each record. Strict field/state/identity validation preserves prior unknown connections using detection time rather than fabricating disconnect time; preattachment intervals stay missing. Independent spec and quality review completed.
- [x] Public contract distinguishes `processed(record)` from a producer's stdout write, and terminal processing from host-message delivery. See `docs/observer-coverage.md`.
- [x] Fresh candidate consumer used exact watch arguments, consumed attachment and terminal cursor 3. The 11.313-second preattachment interval remains missing; no disconnect was recorded. Initial failed acceptance remains retained. Consumer processing does not certify host-chat delivery.

## 4. Run-picker error — coordinator

Own engine/monitor/app.mjs, index.html/style.css only as needed, existing monitor UI tests. Add a failed catalog-page read test while Change run is open; show the error in that dialog with a retry control and preserve modal focus/selection. Confirm failure before fix, then affected tests and painted phone/desktop verification.

- [x] Error visibility, exact failed-page retry across unrelated head polling, and focus before disabling/hiding Retry reproduced and corrected. Focused desktop/390px browser checks and 71 monitor checks passed.
- [x] Delivered with the separately verified 0.3.6 dashboard release. Its full local suite passed 544/544; earlier broad browser coverage and final picker checks retain their distinct source scopes. These results do not verify the subsequent engine changes.

## 5. Authoring/recovery evaluation — fresh workflow

Own skill authoring/setup references, docs/api.md, verification/review documents and evaluation inputs/results. Read Yoda before edits. Correct current-policy/setup/strict-key overclaims; require supported commands, genuine per-role selection, artifact checkpoint, capture review, coordinator integration, fresh verification, watch cursor and both missing-package/changed-catalog recovery decisions.

- [x] V1 complete artifacts, native activation/captures, blind grading and independent API checks retained. Both plans failed acceptance; no guidance-improvement claim follows from engine completion or the grade alone.
- [x] Targeted guidance revised for supported thunk calls, checkout-scoped definitions, complete recovery closure and deliberate lifetime policy. V2 pair `525e0816…` completed without follow-up steer.
- [x] Both v2 full captures passed exact path/blob/input/tree/patch/hash/byte checks, selected native main/source guards and positive owned cleanup. Baseline native activation was not observed; this cannot prove absence of every possible ordinary read. Original failed v1 remains unchanged.
- [x] Fresh blind grader `adf8732f…` and blinded independent coordinator review accepted both complete plans, 12/12 each, before revealing conditions. All byte ranges, 94 plan excerpts and 32 public-reference excerpts were checked. No score advantage or general causal/automatic-trigger claim follows. Full artifacts and qualified observer gaps are in `docs/reviews/2026-10-15/authoring-v2/`.

## 6. Live worker deadlines — core and coordinator integration

- [x] Core default changed to `null` for an unbounded worker wall budget; finite positive safe-integer budgets and explicit per-worker null overrides supported. Monotonic chunked timers avoid host timer overflow.
- [x] One handle spans readiness, model attempts and completion-source checks. Revisioned set/extend/clear refuses expired, closed or stale targets without changing initial options, replay identity or native turn dispatch. The late-terminal timeout race now preserves observed turn/output/command facts before refusing the result; independently rereviewed.
- [x] CLI `worker-deadline` implemented with originating session/generation/position/attempt/nullable turn/revision checks and committed applying intent before mutation. Snapshot or receipt persistence loss remains unknown and is not retried. Read-only monitor snapshots added; no HTTP deadline mutation or form is included.
- [x] Pause waits without a guessed worker lifetime; Stop, fatal cancellation and explicit run wall limits retain bounded drain. Startup, protocol, individual commands, interruption, evaluator safeguards and cleanup have their separate bounds.
- [x] Core/integration affected tests and independent spec/quality reviews completed; the frozen nine-owner integration run passed 183/183. Managed source identity includes `engine/live-deadline.mjs`. See `docs/worker-session-control.md`; the later shared read-projection change has separate review evidence.
- [x] Isolated native candidate accepted default-null and same-turn set/extend/clear with revisions 1/2/3, stale refusal and unchanged original options/replay identity. No live elapsed-timeout, Pause/Stop or restarted-worker acceptance is inferred. Owner-selected 0.3.6 remains unchanged.

## 7. Integrate, verify and ship — coordinator

- [x] Integrated producer captures were checked for native skill activation, selected-source guards, terminal/owned cleanup and exact artifact paths/hashes/preimages. Original incomplete/failed attempts remain distinct. The v2 planning evaluation has its own acceptance above; neither proves final combined runtime behavior.
- [x] Append/facts/observer/deadline implementation, shared CLI/source identity and read projections have meaningful affected coverage and independent reviews. Their receipts are component checkpoints; later edits require appropriate fresh verification.
- [x] Checkpointed exact reviewed source and prepared consistent 0.4.0 version metadata. Owner setup was rechecked separately: unchanged 0.3.6, zero-inference doctor passed, 29 earlier runtime directories retained.
- [x] Rebased the unpublished feature branch onto remote main `09bd255…`, preserving delivered 0.3.6 behavior and resolving documentation wording. Fetch again before push if remote changes.
- [x] Fresh combined 0.4.0 suite passed 622/622 with zero failures/skips; check, smoke, isolated clean native plugin installation and production audit passed (zero vulnerabilities). Existing browser harness was corrected with meaningful RED and real installed-dashboard GREEN; candidate-only presentation fields also passed a separately labeled GET fixture. Native acceptance below remains independent.
- [x] Bounded native append/deadline/observation acceptance completed on source `a1aa023cd7b364e7397483fac14626dbc96e25cba44887a3ff772eacbf5dec7c`; v2 authoring acceptance completed separately with both conditions at 12/12. Earlier failures remain preserved.
- [x] Canonical package gates passed for digest `967cd6160299faad254eee70618864b3be95716692051e652c78969791854ca5`: 622/622 tests, check, smoke, isolated clean installation, audit with zero vulnerabilities and zero-inference doctor with positive unforced cleanup. The only runtime-byte change after native acceptance is one CRLF→LF normalization in monitor HTML (13,289→13,288 bytes, text-identical); all other 96 runtime files are unchanged. The native report is not relabeled as another model execution.
- [ ] Commit only exact reviewed paths, push the feature branch and open the next PR. Squash merge only after applicable gates and any explicitly authorized release exception are recorded. Keep Actions disabled; do not infer permission to bypass protection from the historical 0.3.6 exception.
- [ ] Publish/install exact accepted version when release requirements are met; keep old runtimes and saved runs intact. Synchronize canonical wiki with actual delivered state and any remaining release blocker.
