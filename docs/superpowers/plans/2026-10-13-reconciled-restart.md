# Reconciled worker restart

Implement under the existing full worker-parity authorization. Restart must not silently replace a value already consumed by workflow JavaScript. Use a new generation with the identical saved script, arguments, backend/runtime and original session. Reuse only the completed prefix before the selected failed/unknown worker, then invalidate its entire suffix. Restart is available after the run settles; active workers can first be cancelled through their exact live control. This preserves unrelated in-flight work until it finishes.

Before starting, show affected workers and require a bounded nonempty user reconciliation note explicitly covering the suffix's external effects. Reconciliation cannot waive unverified termination: every dispatched affected worker must have confirmed owned-server exit, a scoped empty Windows job, and no native-terminal cleanup error. Earlier unknown/failed workers and stale generation/attempt requests reject. Completed-prefix identities must match before any dispatch. A second request for the old generation rejects, even if it raced with startup. Preserve the previous header if a detached start is abandoned before its execution handshake.

Keep previous worker rows immutable. Replacement workers carry references to earlier execution rows, cumulative attempts and observed usage; activity reads still identify their source generation. CLI and authenticated monitor allow deliberate historical worker inspection. A durable restart receipt stores the reconciliation and source/target generations. Shared lifetime attempt limits apply before replacement. An exhausted limit or missing cleanup never becomes an automatic retry.

- [x] Test restart admission, stale identity, missing reconciliation, unknown drain, suffix effects and preserved prefix.
- [x] Controller generation restart, immutable history, cumulative accounting, atomic receipt and abandoned-start rollback.
- [x] Detached launcher and CLI forwarding; exact source-generation historical reads.
- [x] Monitor preview/reconciliation, restart and earlier-attempt inspection.
- [x] Real cancelled worker restarts once under managed subscription auth; retained history and zero duplicate start verified.
- [x] Independent review, affected/full checks and wiki updates. Native report retained; full suite 265/265 plus package check and smoke passed. Pause fixture race replaced with an explicit gate.
- [x] Feature checkpoint pushed as `f6262ad`; continued with the writable-workspaces plan. Release integration remains part of the active goal.
