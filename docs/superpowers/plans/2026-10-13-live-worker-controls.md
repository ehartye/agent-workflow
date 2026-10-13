# Live worker activity and controls implementation plan

> Execute inline with h-superpowers:executing-plans under the owner's existing implementation authorization. Use independent code review before checkpointing. Continue the full release goal after this slice.

**Goal:** Display real worker tool activity and provide generation/attempt/turn-addressed steering, cancellation and verified restart.

**Architecture:** The native turn runner routes only confirmed thread/turn notifications. The engine stores bounded activity rows separately from worker snapshots, with explicit retained ranges and paging. Durable control receipts target exact worker attempts; the controller owns cancellation and replacement scheduling. Native background-terminal cleanup plus MXC containment evidence governs eligibility; interruption alone never does.

**Tech Stack:** Node 24, pinned Codex 0.162.1 JSON-RPC (reviewed experimental terminal methods), SQLite, existing authenticated monitor.

## 1. Native activity and steering

Files: `foundation/turn.mjs`, `engine/worker-session.mjs`, `engine/backend.mjs`, `test/codex-turn.test.mjs`, `test/fixtures/foundation-server.mjs`.

- [x] Add a subprocess regression sending interleaved early item starts/completions, output and usage from two threads. Assert each callback receives only its confirmed turn, including events arriving before the start response. Exclude raw reasoning events.
- [x] Expose `onActive({threadId,turnId})` and `onEvent({method,params})`; callback failure must reject and trigger bounded interruption. Preserve terminal behavior and output bounds.
- [x] Keep active native identities per worker in the backend. Implement `steer({position,turnId,text})` with `turn/steer.expectedTurnId`; reject mismatched/retired turns and verify the returned turn ID. Forward callbacks through schema correction turns without losing earlier activity.
- [x] Run `node --test test/codex-turn.test.mjs test/engine-worker-session.test.mjs`; inspect pinned generated protocol for every field.

## 2. Durable bounded observation

Files: create `engine/activity.mjs` and `test/engine-activity.test.mjs`; modify controller, monitor-data/server, their existing tests, and `engine/monitor/app.mjs`/HTML/CSS plus UI tests.

- [x] Test normalized command input/output/status, cumulative thread usage without double counting, truncation and refusal of invalid usage. Never retain raw reasoning blocks.
- [x] Persist activity in a separate SQLite table with monotonic cursor, generation/worker/attempt identity, at most 4,096 retained records per generation and 256 per worker. Bound each record to 16 KiB. Worker snapshots carry a compact latest-activity summary and total observed event count; paged reads disclose retention gaps.
- [x] Add authenticated `GET /api/activity?generation=G&position=P&after=S&limit=N`, with at most 100 records and required generation precondition. Test paging, missing rows/gaps, stale generation and bounded responses.
- [x] Show current tool/status in graph nodes and activity history/input/output/usage in the inspector. Use textContent, preserve light/dark/mobile layout, and expose missing/truncated evidence explicitly. Actual per-worker percentage remains absent unless there is a real denominator.

## 3. Individual durable controls

Files: `engine/controls.mjs`, controller/backend/CLI/monitor server/UI and their existing tests.

- [ ] Extend requests with `position`, `attempt`, `turnId` and bounded `text` for `steer`, `cancel-worker`, `restart-worker`. Persist pending/applying/applied/rejected receipts; reject stale generation/attempt/turn, duplicate replacement and terminal admission.
- [ ] Give each worker its own AbortController linked to whole-run stop. Individual cancellation must leave unrelated workers running. Preserve cancelled/unknown outcomes, complete attempt history and earlier usage.
- [ ] Restart only after the native cleanup evidence supports it and the user explicitly requests the action. Reserve shared budget before replacement, keep the same logical slot, and invalidate downstream consumption/replay as necessary; never silently replace a result already consumed by JavaScript.
- [ ] Test concurrent controls, cancellation during queue/start/correction, stale requests, rejected unknown restart and one eligible restart with retained attempts. Whole-run shutdown remains bounded.

## 4. Native containment proof and release evidence

Files: native lifecycle helper/check and sanitized report; engine README/parity/testing docs; wiki architecture/roadmap/backlog.

- [ ] Read the exact pinned MXC/process-manager source and ingest new lifecycle evidence into the wiki. Enable experimental protocol only for the reviewed terminal APIs.
- [ ] Run a bounded local worker that starts a command and child process, capture their identities, steer a confirmed active turn, cancel it, clean native background terminals and inspect termination. Keep the canary self-expiring so a failed cleanup leaves bounded work. Record actual outcomes and distinguish empty terminal inventory from descendant evidence.
- [ ] If the native proof is incomplete, keep restart ineligible for that execution and continue investigating the native lifecycle boundary; do not replace the required safe restart with unconditional retry or a mock-only claim.
- [ ] Demonstrate an eligible cancelled worker restart exactly once with retained evidence. Run browser inspection, affected tests, full suite/check/smoke, agent-tests delta review and independent review. Update wiki and push the checkpoint. Then proceed to isolated writable workspaces and distribution; do not mark the overall goal complete.
