# Live worker deadlines

This is the unpublished 0.4.0 candidate contract. The owner's selected 0.3.6 installation retains its recorded earlier behavior; it was not replaced by candidate verification.

The core worker wall budget defaults to `null` (unbounded). An explicitly supplied positive safe integer remains a finite budget in milliseconds; there is no 30-minute ceiling. A worker can still finish, fail, or be cancelled. This does not remove startup, protocol acknowledgement, individual command, interruption, or cleanup bounds.

## Core interface

`createLiveDeadline(configuredTimeoutMs, {clock}?)` in `engine/live-deadline.mjs` creates one worker-owned handle. The optional clock is an injectable monotonic scheduler for deterministic boundary tests; normal execution uses the system monotonic clock. Long budgets are scheduled in chunks no larger than 2,147,483,647 ms, avoiding host timer overflow.

The handle provides:

- `start()`: enter the active state once.
- `remaining()`: remaining milliseconds, or `Infinity` when unbounded.
- `snapshot()`: `{configuredTimeoutMs, revision, remainingMs, expiresAt, status}`. Unbounded `remainingMs` is `null`. `expiresAt` is a nullable numeric UTC epoch-millisecond estimate for presentation; elapsed time is monotonic. Status is `pending`, `active`, `expired`, or `closed`.
- `apply({operation, valueMs?, expectedRevision})`: change the active budget and return its new snapshot. `set` starts a finite budget from the current instant; `extend` adds milliseconds to a finite remaining budget; `clear` removes the wall budget and takes no value. Extending an unbounded budget is rejected; use `set` to make it finite.
- `subscribe(listener)`: receive snapshot changes; returns an unsubscribe function. This is an observation mechanism, not a durable control acknowledgement. Listener exceptions do not change execution.
- `signal`: aborts once on expiry with `TURN_TIMEOUT`.
- `close()`: release the timer and refuse further changes. Only the worker owner closes the handle.

Updates require an exact revision and own data fields. Accessors, proxies, unexpected fields, invalid milliseconds, stale revisions, inactive handles, and updates after expiry or close are refused. Expiry is checked against elapsed time before an update, so a delayed timer callback cannot allow revival. The original `configuredTimeoutMs` never changes. Live changes do not change worker options, replay keys, native thread/turn identity, or attempt counts.

## Execution boundary

`backend.execute({... , onDeadline})` creates and starts the handle after existing App Server/thread startup and immediately before readiness, then calls `onDeadline(handle)`. The same handle covers readiness, inventory, all permitted model attempts, and selected-source completion checks. `runWorkerSession` and `runTurn` accept this shared `liveDeadline`; legacy finite numeric timeout callers remain supported. Pending or closed handles cannot dispatch a model turn.

Live changes reschedule the local wall timer without restarting the native turn or submitting another model request. Expiry during a turn uses the existing bounded interruption path. Expiry while waiting for readiness or a completion command stops that wait; it does not assert the command never started or independently prove that process has exited. The backend still inventories the owned thread and closes the owned process/job boundary. Failed or missing drain proof remains failed or unknown under the existing classification.

The backend closes the handle before cleanup and retains a final snapshot as `evidence.deadline`. Cleanup has its own limits. Parent cancellation remains operational for an unbounded worker. Readiness and completion commands retain their independent 20-second command caps and bounded RPC acknowledgements; changing the worker wall budget cannot extend an already-submitted native command. Inventory acknowledgements retain their independent 15-second cap. No timeout change grants permissions, changes native skills, or retries uncertain effects.

## Public control and persistence

The CLI supports the following command through the saved run's recorded runtime:

```text
worker-deadline RUN --session S --generation N --position P --attempt A
  [--turn T] --deadline-revision R (--set-ms N | --extend-ms N | --clear)
```

Use the exact current originating session, generation, worker position, cumulative attempt, native turn and deadline revision from worker inspection. Omit `--turn` only when the observed active turn is null, such as during readiness. Exactly one deadline operation is required. Only a running worker with an active owned handle accepts the action; queued, expired, closed and settled targets cannot be revived. The session, generation, attempt, turn and revision are checked during admission, then the live worker identity and revision are checked again before application.

`requestControl` uses action `worker-deadline` with `deadline:{operation,expectedRevision,valueMs?}`. The durable receipt begins `pending`. The runner commits `applying` intent before invoking the handle outside the control transaction. The handle subscription writes `worker.deadline` snapshots in separate transactions, including expiry and close. An applied receipt includes `deadlineResult`. Refused changes are `rejected`; loss of confirmation after mutation is `unknown`. A failed snapshot write stops run admission and cancels active work; it cannot become a successful control acknowledgement. After a lost response inspect the existing receipt or saved controls, never automatically resubmit. An observer callback is not proof of host-message delivery.

Snapshots are also exposed in monitor worker previews. This slice provides CLI deadline changes and read-only dashboard data; it does not add an HTTP deadline mutation route or an interactive dashboard deadline form. Older retained runtimes may not support the command and are not upgraded in place.

New runs default to unbounded workers. `--worker-timeout-ms 0` maps to `null` for new runs and explicit resume overrides; positive safe integers preserve finite budgets, including budgets longer than 30 minutes. Omission on resume inherits the saved value. A worker or appended task's explicit `timeoutMs:null` overrides a finite global default. Live edits do not change initial options or replay keys; a cached completed worker retains its original deadline evidence rather than receiving an active handle.

Pause closes new admission and waits for accepted work to settle, without summing guessed worker lifetimes or imposing a default wait. Stop remains available while pausing and initiates bounded cancellation/drain. An explicitly configured run wall deadline still applies during Pause. Failure to settle inside Stop's drain bound remains unknown; late deadline observations cannot rewrite terminal evidence. Managed source identity includes `engine/live-deadline.mjs`.

## Verification scope

Tests use deterministic clock advancement for unbounded duration, large timer chunks, stale revisions, shortening, expiry and close. Existing process fixtures verify readiness changes, a single native turn surviving extend/clear, cancellation, expiry interruption, terminal evidence and positive owned cleanup. Controller tests use real SQLite and a separate evaluator, with a native protocol process fixture for same-turn controls. Controlled SQLite failures verify committed intent, unknown receipts and no repeated mutation. CLI tests verify exact arguments, runtime routing and durable pending receipts. These are synthetic protocol/process acceptance tests, not live model or installed-release evidence.

Separate [native candidate acceptance](../reports/native-live-controls-0.4.0.json), run `11684a6e-290c-4728-a9e2-17cf7484ea75`, observed one actual native turn with an initial null budget. Public controls set 240000 ms at revision 0, extended by 60000 ms at revision 1, and cleared at revision 2; all three durable receipts were applied and the final revision was 3. A deliberately stale clear was refused without a control row, extra revision or attempt. Original options, replay key and native turn identity remained unchanged. Both workers and the run ended with positive unforced owned cleanup; worker native-terminal inventories were empty.

The accepted scope is same-turn set/extend/clear on native-tested source `a1aa023cd7b364e7397483fac14626dbc96e25cba44887a3ff772eacbf5dec7c`. It does not establish live elapsed-timeout, Pause/Stop, restarted-worker or arbitrary-descendant behavior. The probe's explicit eight-minute run wall and six-minute operator Stop limit are acceptance safeguards, not default worker policy. Its reviewed helper bounded each read wait; native `yield_time_ms` was treated only as an observation wait, not an execution timeout. The [earlier unsupported-field refusal](../reports/native-live-controls-0.4.0-initial.json) remains not accepted. Final package and publication status are recorded in the [release checkpoint](releases/0.4.0.md).
