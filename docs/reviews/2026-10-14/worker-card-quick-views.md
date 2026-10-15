# Worker-card quick views and Current run — review handoff

Status: authored with two final RED cases; coordinator reconciliation and browser acceptance pending.

Scope is the six assigned files: `engine/monitor/app.mjs`, `engine/monitor/index.html`, `engine/monitor/style.css`, `test/engine-monitor-ui.test.mjs`, `docs/monitor-design.md` and this report. No backend, schema, authentication, dependency, foundation/output-transport or lifecycle changes were made. No commits, pushes, installs, Actions changes, browser launch, manual service launch, nested workflow or delegation were performed. The authorized HTTP tests start their own isolated services/processes. No uncertain prior startup operation was retried. No previous worker output was reconstructed.

## Owner steering incorporated

The original request adds vertical three-dot worker-card menus and useful read-only Actions & controls, Messages, Tool activity, Prompt & result and Workspace/evidence views. Separate sibling controls preserve card selection and keyed reconciliation. Overlays are outside the graph. Saved receipt/restart facts, explicit paging/coverage and bounded text replace generic raw-worker dumps. Workspace deep reads deliberately hand off to the existing inspector.

The first added priority puts actual primary error code/reason on failed/unknown cards and at the top of the selected inspector. Failure details is the first relevant menu item. It separates workspace errors, shows supplied execution/cleanup facts, keeps unknown outcomes and missing evidence explicit, and excludes arbitrary diagnostic fields. REQUEST_TIMEOUT with account/read and a 15000ms deadline, and PROTOCOL_LIMIT with an unknown outcome, are fixture examples, not fresh acceptance of those native runs. Their original failed startup was not retried.

The latest owner instruction replaces the separate view/select-for-control flow. Current run and Change run occupy the existing map toolbar. The searchable columnar modal retains filters, hidden-record discovery and pagination. Row selection immediately closes it and makes the selected run current via GET only; fresh matching run/runtime/data-instance identity supplies the observed generation to existing authorization gates. The separate arm button is removed. Two older tests were adapted because that UI obligation was explicitly superseded; their unavailable-state, Stop confirmation, preserved draft and exact target checks remain. The old assertion that the enclosing Run menu stays open was updated because Change run is now an independent modal.

## Genuine skill activation

`skills.list` used executor authority and every returned catalog cursor, through the selected-ID entries. `skills.read` used each returned package and `main_resource`; all four reads completed with no next cursor. Enabled names and returned `skill_root` matched:

- `beautiful`: `hartye-skills:beautiful`, `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\hartye-skills\0.4.0\skills\beautiful`.
- `tdd`: `h-superpowers:test-driven-development`, `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\h-superpowers\4.16.0\skills\test-driven-development`.
- `debug`: `h-superpowers:systematic-debugging`, `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\h-superpowers\4.16.0\skills\systematic-debugging`.
- `test-strategy`: `agent-tests:test-strategy`, `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\agent-tests\0.4.1\skills\test-strategy`.

No shell skill-body substitution or failed native-reference fallback was used. The separately authorized test-craft reference was read after activation. Repository AGENTS, production risk map, monitor design, current UI, authenticated activity/preview/receipt sources and the existing DOM owner were checked. Wiki writes were outside the six-file assignment and remain with the coordinator.

## RED/GREEN evidence

The only test command used was `node --test test/engine-monitor-ui.test.mjs test/engine-monitor.test.mjs`, from the assigned worktree, using prepared `C:\Program Files\nodejs\node.exe` v24.18.0 and existing LinkeDOM. All listed runs actually started and exited; none are described as notStarted.

- Initial RED: 57/58 passed, exit 1. Every-card menu test found 0 menu buttons instead of 2.
- Failure-priority RED: 57/59 passed, exit 1. Cards lacked primary code/reason. Minimum working checkpoint: 59/59, exit 0.
- Log/full-read/race RED: 59/63 passed, exit 1. Filters had no records, explicit full-read control was absent, no owned activity GET existed to abort, and empty text was missing. GREEN: 63/63. One intermediate assertion incorrectly treated synthetic user-message input as tool-only content; the fixture was corrected to attach command input to tool records.
- Retention/diagnostic/focus RED: 62/65 passed, exit 1. Unrelated receipt totals rebuilt prompt DOM, stringified errors exposed extra fields, and tab selection moved focus to Close. GREEN: 65/65.
- Live-menu/coverage/restart RED: 64/67 passed, exit 1 after extending the receipt fixture. New failure items were missing, corrupt counts rendered unverified records, and suffix restart receipts were omitted. GREEN: 67/67. A further RED (66/67) caught shared menu-choice mutation after a failure resolved; copying choices fixed it.
- Current-run RED: 66/68 passed, exit 1, including the pending menu-choice regression and absent Current run panel. The new modal/selection test passed after implementation; remaining failures were obsolete separate-arm/enclosing-menu assertions, updated to the owner's replacement contract.
- Latest GREEN checkpoint: 68/68, exit 0. Includes keyboard menu/tab/escape/focus return, XSS text, no POST from quick views or selection, stale run/generation reads, aborted GETs, bounded six-page activity display, empty/corrupt/conflict evidence, exact full-preview cache guards, unchanged DOM/focus/scroll, phone-mode dialog context and the original resize/theme/selected-full-evidence owners.
- Final extended RED: 66/68, exit 1. Workspace capture lacks an explicit status-unverified sentence. Explicitly triggering automatic following while the selection dialog is open can issue a different run GET behind the dialog. The legacy navigation reason also still describes separate viewing/control; that assertion is behind the follow failure.

An attempted three-line application fix also contained an unrelated, unmatched CSS hunk. `apply_patch` failed verification on `engine/monitor/style.css`; this is a failed tool operation, not a successful edit or an unstarted shell command. A bounded subsequent read confirmed that all three intended `engine/monitor/app.mjs` replacements remain unapplied and the existing CSS line remains unchanged. No mutation retry or fallback followed. Coordinator reconciliation was requested as required by the worker's developer instruction. The pending app-only fix is concrete: append `Capture status: unverified` when no workspace status is supplied; replace the legacy separate-viewing wording; gate automatic following on the selection dialog being hidden. The last authorized diff whitespace check before those final test extensions passed, exit 0.

Timing targets were requested by the coordinator. No independent elapsed-time measurement establishes the eight-/25-minute targets; the checkpoints above are test evidence, not timing acceptance.

## Coordinator reconciliation

The producer remains engine-completed with task outcome **incomplete** and final66/68RED; the earlier68/68 checkpoint is not its terminal result. Root independently verified the four selected native main activations, before/after source guards, strict unforced owned-job/native-inventory cleanup and exact six-path capture. Native generic observation counters retain discarded2/unsupported2, with selected body `notVerified`; this is not a complete command-body trace. The authoritative patch SHA256 is `b78a9e6d085caef2bf0248279d63d4bfffb3a31d00e3a4bb6732c183485a739d`.

Root deliberately integrated that verified partial artifact. The integration helper's postimage assertion found that Git applied the patch but normalized one remaining HTML CRLF. Fresh exact six-file reads established five identical postimages and an HTML-only newline difference; root restored the exact hash-verified captured HTML bytes and verified reverse patch applicability. It did not blindly reapply the mutation. This coordinator-helper reconciliation does not change the producer's failed patch history.

Root reproduced the same twoREDs (66/68), inspected the actual missing code and applied only three app corrections: explicit unverified capture status, current-run navigation wording and prevention of automatic following while the selection dialog is open. A fresh affected UI/server run passed **68/68, zero skips**,1964.3184ms. Independent semantic review found no additional material blocker in those exact corrections. Real-browser and full combined acceptance remain separate; none of these results publish or install the candidate.

## Remaining acceptance

No real browser/native acceptance is claimed. The coordinator must inspect the combined source on desktop and a 390px phone in Light, Dark and System: three-dot visibility/hit targets, status/title wrapping, primary-error readability, graph selection/drag guards, pan/zoom anchoring, viewport clamping, scroll containment, bottom sheets, modal inert/backdrop/Tab behavior, screen-reader names, focus return and text scaling. Exercise real saved REQUEST_TIMEOUT and PROTOCOL_LIMIT evidence without retrying uncertain effects. Check current-run selection against stale/offline, mismatched or unauthorized references and unavailable catalog entries.

Full combined gates, installation/release checks and integration with the disjoint output-transport writer remain coordinator-owned. Existing older browser/native reports retain their original scope and do not accept this change. No self-acceptance or publication is asserted.
