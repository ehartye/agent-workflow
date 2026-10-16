# Dashboard worker deadlines

The selected worker's existing inspector has one **Deadline…** action. Its
dialog offers Set remaining, Extend remaining and Clear, with positive safe
integer milliseconds for Set and Extend. Extend requires a finite budget and
rejects overflow. Clear sends no `valueMs`. Closing the dialog cancels an unsent
draft; after sending, Close only dismisses the dialog.

This recovery adapts the retained dashboard candidate to canonical 0.4.5
(commit a76aa77ea7790927247388e907015e92e9397f6f). The hash-verified R2 design,
plan, machine specification, R3 nested contracts, retained continuation and
attempt-04 recovery plan remain normative. This source is offered for independent
review; it does not accept delivery or change a historical producer declaration.

## Identity and controls

Legacy `POST /api/control` and bound `POST /api/runs/:id/control` admit
`action: 'worker-deadline'` with only the existing worker fields and nested
`deadline: {operation, expectedRevision, valueMs?}`. The nested validator is the
existing engine validator. In bound mode the full target is
`{dataInstanceId,runId,runtimeId,generation,position,attempt,turnId}`. A nullable
turn must match exactly. The browser supplies no session; the authenticated
server retains the originating session. The retained runtime performs final
live-state/revision admission through its own `requestControl`.

The session adapter checks both the retained controls exports and an observed
deadline snapshot/revision. A runtime without those capabilities stays
read-only. No newer execution module is substituted into an old runtime.
`CONTROL_DEADLINE`, `DEADLINE_EXPIRED`, `DEADLINE_CLOSED` and
`DEADLINE_REVISION` are HTTP 409 conflicts; malformed deadline data is
`CONTROL_INPUT`/400. Existing worker, attempt, turn and generation conflicts
remain conflicts. Authentication, Host and Origin checks cover all routes.

Read a received ID with `GET /api/control/receipts/:id?generation=N` or
`GET /api/runs/:runId/control/receipts/:id?generation=N`. These authenticated,
bounded reads use retained `readControl` where available, and verify the exact
receipt ID and generation. An earlier generation's known receipt stays readable
after the run advances. Reading a receipt never applies a control.

The dialog freezes its original target and revision. Polling refreshes budget
evidence without replacing its form nodes, draft, focus or target. Remaining
time is explicitly labeled as a recorded snapshot, not a live countdown; a
same-revision poll does not imply a fresh deadline observation. A changed
run/runtime/generation/attempt/turn/revision disables submission. Pending
submission disables editable inputs and duplicate submission. Keyboard focus is
contained in the dialog; Escape returns to the initiating control when it still
exists.

A received control ID is retained before validation, rendering or subsequent
reads. Inspect received receipt reads that exact ID even after observation loss.
Pending/applying receipts do not establish completion. Applied/rejected/unknown
remain separate statuses. The inspector keeps unresolved receipt inspection
available after the worker completes, and the received ID is also retained in
the page's bounded Messages history. A changed budget is never attributed to a
request whose response was lost.

If no ID arrived, the outcome stays unknown. The page never invents an ID or
automatically repeats a POST. A bounded page-local registry (32 unresolved
worker requests, with no uncertain-entry eviction) retains that guard across
dialog close and polling. Reconciliation completed is an explicit operator
acknowledgment after saved-record/effect review; it creates no successful engine
receipt. Open Deadline again to review a fresh target after acknowledgment.
After page/service replacement, saved receipts and coordinator reconciliation
remain authoritative; this is not a new durable idempotency API.

## Presentation

The operator's job is to inspect worker evidence and deliberately adjust its
remaining time. The direction stays that of the existing instrument panel:
compact, legible, with the workflow map carrying the screen. Existing dark
tokens are ground `#08121e`, panel `#101e2e`, line `#30465b`, ink `#e0eaf3`, cyan
`#69d7e7` and focus amber `#ffc16a`; light mode uses its existing counterparts.
Bahnschrift headings, Segoe UI body text and Cascadia Mono utility figures keep
their established roles. A single cyan budget marker and tabular time figures
identify the time control. The initial header-based idea was discarded because
the brief reserves that space for the map and current run.

The inspector row opens a 420px dialog on desktop and a viewport-bounded bottom
dialog on phones. The header has a fixed short title and a nonshrinking Close
control. Full worker labels remain in wrapping context text beneath the header,
including unbroken labels on a phone. Focus styling, theme cookies/local preferences, pane widths,
57% phone inspector sheet, Map/tray layout and root 0.4.1 phase grouping remain
owned by the existing presentation. No new persistent header row or animation
was added. Unsupported controls have visible explanatory text. Manual Close
still closes the dashboard instance; Stop remains workflow interruption.

## Recovery verification, 2026-10-15

All commands executed in the assigned native writer workspace using non-login
PowerShell and the verified Node v24.18.0 executable. The exact attempt-04
preflight script (893 bytes, SHA-256
12938acf530342c1090037501e9c19d1013c4fd06a8b887ef821b8263d466fc8)
started and exited 0 before dependent work. It verified the admitted Node,
Git and npm executable identities. Authorized Node/npm-cli offline ci with
ignore-scripts started and exited 0, preparing 35 packages here. No other
runtime or dependency tree was used for execution.

Before materialization, all 13 dashboard source entries were checked against
the root-verified source-seeds map, original source-map producer/capture records,
original manifest and raw patch hashes, actual input-tree base blobs (or absence),
canonical current files, and candidate bytes/modes. Only allowed source files
were materialized. The original static review tree was never executed.
App and UI test changes were applied as explicit nonoverlapping edits to current
0.4.5 files. The shipped 0.4.4 non-UTF-8 preview-unavailable branch and its
regression remain present. Other tracks, raw-patch capture, startup/inventory
guards, package, lock and check-install stay at canonical bytes.

The first owned artifacts were the existing activity/HTTP invariant-owner tests
and explicitly inserted UI tests, with additional regressions for the three
blocking review findings. Before production materialization the affected test
command started and exited 1 on missing completed storage, routes and controls.
After candidate adaptation the focused command started and exited 1: two tests
reproduced the actual same-revision budget wording and unbroken heading defects.
No source declaration or earlier test pass was treated as acceptance.

The corrected presentation labels remaining milliseconds as recorded snapshot
evidence. The full worker label is preserved below the short header. Its DOM
regression uses an unbroken 483-character label at the 390px fixture width;
it proves header structure, text preservation and Escape focus return, not paint.
The messages HTTP regression leaves the terminal record intact under 301 raw
observations, resets only the raw observed counter to 256, and requires
ACTIVITY_CORRUPT. A controlled in-memory module mutation skips raw validation
only for messages: the same assertion then fails. This proves the regression
detects the specific missing guard; no production file is mutated by the test.

An intermediate affected run started and exited 1 (109 of 111 passed). It
exposed an incorrect test header selector and an insufficient negative fixture:
resetting raw count to zero was already caught by terminal accounting. The
selector was corrected to the actual panel header, and raw-tail pressure made
the negative control isolate the messages raw-count boundary. The next focused
run started and exited 0 (3 passed). All failures were executed commands with
scoped fixture effects, not notStarted outcomes or uncertain retries.

Affected command:

    C:/Program Files/nodejs/node.exe --test test/engine-activity.test.mjs test/engine-monitor.test.mjs test/engine-monitor-ui.test.mjs

Final affected result: 111 passed, 0 failed, 0 skipped, exit 0. Final
syntax/diff/scope verification is recorded in the native writer completion
metadata. Real local HTTP/SQLite and bubbling DOM
checks qualify local behavior only. They do not authenticate App Server/native
execution, installed retained-runtime adapter behavior, or painted accessibility.

## Preserved history and remaining acceptance

The original run 4814c759-2fc4-40ba-beca-025fdde866f8 retains its failed
CAPABILITY_SOURCE_CHANGED records at acceptance position 11 and jobs position
12, completed retained capture/inspection work, queued never-started writers,
and missing/unknown raw-command coverage. Its old failed bindings are not
rewritten or resumed.

The later b978ff0f-91bb-4cf7-8c4c-72a0b8e48e13 run retains unknown review slots
10/11/12: readiness/source commands did execute before model inference failed.
Positive owned-job drain does not establish known native inventory or absence
of arbitrary external effects. Never-started reviews 16/17 stay separate.
Dashboard producer position 1 remains engine-completed/declared-partial, and
reviewer 14 remains engine-completed/declared-blocked. This recovery changes
neither row, nor any preserved receipt/capture. Copying bytes is not acceptance.

Missing: independently reviewed combined integration; actual current and older
retained-runtime createSessionServices qualification; the separately authorized
native deadline fixture and receipt evidence; exclusive browser desktop and
390x844 light/dark keyboard/long-label/overflow checks over exact served hashes;
fresh full tests/check/smoke, clean-package installation and production audit.
The coordinator owns these gates, wiki updates and release. Provider-dependent
checks remain missing until integration. No browser or native fixture was taken
over by this writer. F0/V0 reviews and final F/V candidate checks remain distinct;
no F0 check can be relabeled as final. Use the original data instance and retain
the fixed cumulative accounting in the recovery plan.

## Tool friction and wiki handoff

Genuine executor skills.list required ten unfiltered pages to reach the exact
selected beautiful/tdd IDs. A same-root parent Beautiful main read preceded
activation of the exact selected ID; it was not substituted for that activation.
Both selected main reads returned the admitted retained skill_root under
runs-v2/bc53e3e5-d39f-4b1d-a8fa-fd36584ce0bb/source-packages-v1/packages/:
2be52948d661a65e0eec8837f4de49934e4cf62ee1c97cf2a0539b568beb8d3d/skills/beautiful
and c1aa80898169b589a8c1c575c308bf417e1d5e488567771540d03c2cbfd086f7/skills/test-driven-development.
No shell skill-body reads or associated tool activation were used. Required
associated tools are explicitly none. Proposed host enhancement: native
selected-ID/root filtering while retaining genuine cursor/read semantics.

Some read-only diagnostic output exceeded tool output limits; hashes covered
complete input files, and relevant deltas were subsequently read separately.
No source artifact was shortened for that reason. Full actual owned files stay
in this workspace for native capture. Root should ingest the source behavior,
review corrections and catalog friction into the canonical wiki roadmap; this
writer has no wiki write scope.
