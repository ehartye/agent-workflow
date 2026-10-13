# Owned worker lifetime and restart gate

The source review of pinned Codex 0.162.1 and MXC found that normal MXC teardown can report a warning when job drain is not observed. Native terminal ACKs and inventory cannot supply a strict job-zero receipt. The wiki's `codex-0-162-1-mxc-process-lifecycle` source records exact revisions and evidence. The existing shared App Server therefore cannot provide an independent lifetime boundary for one worker.

## Decision

Use one native App Server per worker. On Windows start that server under a small owned Job Object host. Create suspended, assign to a non-breakaway kill-on-close job before resuming, and retain both process and job handles. Explicitly whitelist inherited stdio handles. The host proxies JSON-RPC bytes, discards native stderr, and reserves its own stderr for fixed bounded ownership receipts. On root exit or controller stdin closure, terminate the job, poll active job members to zero, await the retained root process handle, drain stdout, then issue the receipt and exit zero. Missing receipt, failed query or forced host termination never prove job drain.

The host is a process-lifetime boundary, not an adversarial sandbox. Codex/MXC still owns permissions. Job accounting includes nested member jobs but cannot prove termination of externally brokered processes or reconcile filesystem/service effects. Keep `jobEmpty`, `ownershipScope: windows-job-members`, native terminal evidence and general descendant uncertainty separate. Native cleanup errors continue to block replay even if job-empty is proven. Direct PID killing, CIM and taskkill remain absent.

Time: extra App Server startup per worker and one local host compilation per backend. Risk: nested-job incompatibility fails admission; a lost host receipt blocks replay. Complexity: one narrowly scoped native ownership component, with no model/tool orchestration in it. Best practice: retained creation-time handles and assign-before-execution rather than reopening PIDs. Maintainability: source is runtime-fingerprinted, real Windows tests cover lifetime paths, and release packaging must carry/reproduce the host.

## Implementation and evidence

- [x] Native host and Windows subprocess tests: normal root exit, detached child, stdin cancellation, abrupt host death, spawn failure and exact argv preservation.
- [x] Separate worker connections; whole-run close drains all connections, individual close does not affect siblings.
- [x] Per-consumer transport errors; a pre-start failure cannot mutate another worker's execution evidence.
- [x] Failed native cleanup keeps execution unknown and refuses automatic replay while preserving the primary error.
- [x] Local real Codex/MXC admission, steering/cancel canary, and structured read/replay under the owned host.
- [x] Two-worker native steering/cancel proof: sibling remains running and produces its exact marker; each owned job reaches zero.
- [ ] Restart request with explicit uncertain-effect reconciliation, exact generation/attempt identity, retained attempts/usage and downstream invalidation. Do not silently overwrite a result consumed by workflow JavaScript.
- [ ] Real eligible restart exactly once, plus rejection tests for unverified cleanup and missing reconciliation.
- [ ] Isolated writable workspaces and artifact review, then saved workflows and plugin/release integration.

Current native reports are bounded local acceptance. Earlier experimental reports that called general descendants verified predate the corrected ownership-scope field; use the reviewed individual-controls report for the current contract. SSH remains deferred.
