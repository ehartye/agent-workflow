# Finish the workflow release

> Execute through Agent Workflow with isolated writers and coordinator integration. Owner approved remaining development and shipment on 2026-10-15. Keep GitHub Actions disabled unless the owner explicitly changes that instruction. This scope is the current delivery batch, not every historical roadmap proposal.

**Goal:** Finish the next engine release after the dashboard/input/output and run-picker work shipped separately in 0.3.6. The remaining scope is live independent additions, durable command facts, consumer observation coverage, manual live worker deadlines, and authoring/recovery guidance with fresh evaluation.

**Architecture:** Existing QuickJS broker and native backend remain the only execution path. SQLite owns admission, persistence and uncertainty. Execution facts and consumer coverage have separate bounded records; neither promises unavailable command bodies or host chat delivery.

**Stack:** Node 24 ESM, SQLite, pinned Codex App Server 0.162.1, node:test, existing browser verification.

## As-built checkpoint — 2026-10-15

- **Shipped and installed:** original dashboard layout, input/output improvements and final run-picker refinements in 0.3.6, repository PR #11 / tag `v0.3.6`, marketplace PR #173. The owner selected a local-verification exception for that release; protection was restored and GitHub Actions remains disabled. The delivery receipt is `reports/release-0.3.6-delivery.json`. That exception is recorded history, not an invented hosted-CI pass or a blanket exception for the next release.
- **Implemented, affected-tested and independently reviewed; not released:** append admission/scheduling/replay, command facts, consumer receipts, and deadline core plus CLI controls. Section checkmarks below describe those bounded milestones, not combined release acceptance. Earlier incomplete producer reports and RED evidence remain preserved alongside coordinator integration results.
- **Authoring evaluation:** v1 failed plan acceptance; its complete artifacts, blind grade and coordinator findings remain in `docs/reviews/2026-10-15/authoring-coordinator.md`. At this coordinator checkpoint the fresh v2 pair `525e0816…` is active. No v2 acceptance, superiority or automatic-trigger claim is made.
- **Pending:** final combined gates and source checkpoint, fresh native candidate acceptance, complete v2 artifact/grading review, latest-main rebase, consistent 0.4.0 metadata, push/PR, publication/installation and canonical wiki closeout.

## 1. Live independent additions — isolated writer

Own engine/controller.mjs, engine/controls.mjs, engine/restart.mjs, engine/background.mjs, bin/arguments.mjs, bin/command.mjs, new engine/append.mjs or focused admission modules, corresponding existing controller/background/managed-entry test owners and new append test if necessary. Own docs/live-append.md and a bounded implementation receipt. Do not edit activity/watch/UI/foundation/skill source. The approved full specification is docs/superpowers/specs/2026-10-14-live-run-append-design.md.

- [x] Public RED/GREEN coverage added for same-run dispatch, idempotent request receipts and wrong generation/session refusal.
- [x] Strict bounded task-file admission and transactional per-generation budget/slot ledger integrated with the existing scheduler and backend; shared concurrency and lifetime attempts retained.
- [x] Guest ordinal separated from physical slot, dependency origin and cached source position; interleaved guest/addition replay and suffix restart covered.
- [x] Admission versus completion/Pause/Stop, accepted queue drain, failure aggregation, unknown dispatch and capability/input ceilings covered without uncertain-effect retry.
- [x] Captures integrated, affected tests and independent spec/quality reviews completed. The original writer receipt in `docs/reviews/2026-10-15/live-append.md` remains its historical checkpoint, including then-pending work.
- [x] Shared `projectAdditionWorkers` read projection used by saved-run and monitor readers. Committed active intent without confirmed running evidence is unknown, not queued; row-count and 2 MiB-per-row guards reject corrupt/excess records before payload parsing. The focused projection review passed; the later shared-dispatch affected run passed 154/154, not the full combined suite.
- [ ] Verify a fresh native candidate append with exact retained-runtime/session identity, genuine required skills and positive owned cleanup.

## 2. Durable command evidence — isolated writer

Own engine/activity.mjs, foundation/turn.mjs only if required for sanitized metadata, existing activity/turn tests and fixture additions that do not overlap the append writer; docs/durable-command-facts.md and bounded receipt.

- [x] Existing activity owner extended with failing pressure/persistence tests before implementation; early command lifecycle facts survive ordinary activity eviction.
- [x] Separate bounded sanitized facts integrated, including identity/fingerprint or explicit omission, reported exit/timeout outcome, count/byte budgets and durable eviction counters. No raw shell bodies, reasoning or credentials retained.
- [x] Facts exposed through the existing activity read contract; exact schema, coordinates, outcome consistency, stored byte sizes and aggregate budgets validate before records are exposed.
- [x] Affected activity/turn owners passed 57/57 after review corrections; independent spec and quality review completed. See `docs/durable-command-facts.md` and the historical source receipt `docs/reviews/2026-10-15/command-facts.md`.
- [ ] Complete combined candidate/native verification; retained command reports do not prove effects or recover missing old payloads.

## 3. Observer coverage — coordinator

Implemented in `engine/observer-coverage.mjs` with existing watch and dedicated receipt tests. The named coordinator/host consumer owns the receipt separately from execution data. Successful writes to watch stdout are not consumption acknowledgments.

- [x] RED/GREEN tests cover launch/consumed attachment, last actually processed cursor, terminal replay, disconnect/reconnect gaps, cancellation, bounded receipts and corruption refusal.
- [x] Versioned receipt written atomically only after the named consumer handles each record. Strict field/state/identity validation preserves prior unknown connections using detection time rather than fabricating disconnect time; preattachment intervals stay missing. Independent spec and quality review completed.
- [x] Public contract distinguishes `processed(record)` from a producer's stdout write, and terminal processing from host-message delivery. See `docs/observer-coverage.md`.
- [ ] Complete fresh candidate observation acceptance with exact watch arguments, consumed attachment, processed cursor, failures/unknowns and terminal; retain every real preattachment/reconnect gap.

## 4. Run-picker error — coordinator

Own engine/monitor/app.mjs, index.html/style.css only as needed, existing monitor UI tests. Add a failed catalog-page read test while Change run is open; show the error in that dialog with a retry control and preserve modal focus/selection. Confirm failure before fix, then affected tests and painted phone/desktop verification.

- [x] Error visibility, exact failed-page retry across unrelated head polling, and focus before disabling/hiding Retry reproduced and corrected. Focused desktop/390px browser checks and 71 monitor checks passed.
- [x] Delivered with the separately verified 0.3.6 dashboard release. Its full local suite passed 544/544; earlier broad browser coverage and final picker checks retain their distinct source scopes. These results do not verify the subsequent engine changes.

## 5. Authoring/recovery evaluation — fresh workflow

Own skill authoring/setup references, docs/api.md, verification/review documents and evaluation inputs/results. Read Yoda before edits. Correct current-policy/setup/strict-key overclaims; require supported commands, genuine per-role selection, artifact checkpoint, capture review, coordinator integration, fresh verification, watch cursor and both missing-package/changed-catalog recovery decisions.

- [x] V1 complete artifacts, native activation/captures, blind grading and independent API checks retained. Both plans failed acceptance; no guidance-improvement claim follows from engine completion or the grade alone.
- [x] Targeted guidance revised for supported thunk calls, checkout-scoped definitions, complete recovery closure and deliberate lifetime policy. V2 prompt/rubric and simultaneous conditions prepared; pair `525e0816…` is active at this checkpoint.
- [ ] Verify both v2 complete artifact captures, exact paths/hashes/bytes, native activation/source guards and positive cleanup after terminal. Do not replace the failed v1 record.
- [ ] Obtain and review fresh blind grading against the frozen v2 rubric and supported public API. Report missing criteria, budgets and limits; no general causality or automatic-trigger claim.

## 6. Live worker deadlines — core and coordinator integration

- [x] Core default changed to `null` for an unbounded worker wall budget; finite positive safe-integer budgets and explicit per-worker null overrides supported. Monotonic chunked timers avoid host timer overflow.
- [x] One handle spans readiness, model attempts and completion-source checks. Revisioned set/extend/clear refuses expired, closed or stale targets without changing initial options, replay identity or native turn dispatch. The late-terminal timeout race now preserves observed turn/output/command facts before refusing the result; independently rereviewed.
- [x] CLI `worker-deadline` implemented with originating session/generation/position/attempt/nullable turn/revision checks and committed applying intent before mutation. Snapshot or receipt persistence loss remains unknown and is not retried. Read-only monitor snapshots added; no HTTP deadline mutation or form is included.
- [x] Pause waits without a guessed worker lifetime; Stop, fatal cancellation and explicit run wall limits retain bounded drain. Startup, protocol, individual commands, interruption, evaluator safeguards and cleanup have their separate bounds.
- [x] Core/integration affected tests and independent spec/quality reviews completed; the frozen nine-owner integration run passed 183/183. Managed source identity includes `engine/live-deadline.mjs`. See `docs/worker-session-control.md`; the later shared read-projection change has separate review evidence.
- [ ] Verify the combined installed candidate and actual same-worker native live control before making release/native-acceptance claims. Installed 0.3.6 retains its earlier deadline contract.

## 7. Integrate, verify and ship — coordinator

- [x] Integrated producer captures were checked for native skill activation, selected-source guards, terminal/owned cleanup and exact artifact paths/hashes/preimages. Original incomplete/failed attempts remain distinct. This does not accept the active v2 authoring pair or prove final combined runtime behavior.
- [x] Append/facts/observer/deadline implementation, shared CLI/source identity and read projections have meaningful affected coverage and independent reviews. Their receipts are component checkpoints; later edits require appropriate fresh verification.
- [ ] Finish combined documentation/source checkpoint and consistent 0.4.0 version metadata. Do not label the installed 0.3.6 runtime as supporting these engine additions.
- [ ] Fetch/rebase latest and reconcile the already delivered 0.3.6 changes before final combined verification and push.
- [ ] Run fresh npm.cmd test, npm.cmd run check and npm.cmd run smoke, then clean-package node scripts/check-install.mjs and npm.cmd audit --omit=dev against the final combined bytes. Prior 544/544 release and component test counts do not satisfy this gate.
- [ ] Complete bounded native candidate append/deadline/observation acceptance with reviewed outputs and owned cleanup; complete v2 authoring evaluation separately.
- [ ] Commit only exact reviewed paths, push the feature branch and open the next PR. Squash merge only after applicable gates and any explicitly authorized release exception are recorded. Keep Actions disabled; do not infer permission to bypass protection from the historical 0.3.6 exception.
- [ ] Publish/install exact accepted version when release requirements are met; keep old runtimes and saved runs intact. Synchronize canonical wiki with actual delivered state and any remaining release blocker.
