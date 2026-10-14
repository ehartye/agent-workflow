# Live worker skill grants: native boundary

The owner asked about granting a previously unavailable skill to an already-running worker, with genuine native `skills.list` / `skills.read`. **This capability is not implemented or supported by the inspected public native contract.** After reviewing the limitation, the owner selected publication of completed fixes, explicit startup skill selection in workflow-authoring, and no tracked live-grant work. This is retained boundary research, not a planned deliverable. No successful grant probe, worker restart, global config change or inference was performed during this investigation.

The pinned Codex release is `rust-v0.162.1`, commit `092d3acd6bec3e3a14bdc7e7a2810ab628ab759d`. GitHub's primary release API also reported it as the latest published release at inspection, published October 9, 2026. [Release](https://github.com/openai/codex/releases/tag/rust-v0.162.1).

## Decisive contract evidence

- The exact [thread schema](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L152) accepts `selectedCapabilityRoots` on thread creation. Thread settings and resume have no corresponding update field.
- The exact [running-turn schema](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/app-server-protocol/src/protocol/v2/turn.rs#L40) rejects unknown settings and provides no root or skill grant.
- The [loaded-thread resume processor](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/app-server/src/request_processors/thread_processor.rs#L4348) preserves active rejoin semantics and ignores incompatible overrides. Its idle cold-reload path is not an in-place running-worker grant.
- The [catalog processor](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/app-server/src/request_processors/catalog_processor.rs#L595) exposes global host extra-root discovery and persisted enabled toggles. These have no worker/thread/turn target and do not grant a selected executor root.

Internal Rust environment-readiness methods exist, but there is no corresponding inspected public App Server setter. That distinction is an integration boundary, not proof of universal native impossibility. A new native API or a separately maintained runtime change would need its own verification.

Selecting another skill ID inside Workflow's frozen bundle still requires adding that worker's native root. New ceiling entries additionally require separately authorized, append-only manifests and hashes. Preselecting every root and later authorizing it in prose does not prove an actual grant of a previously unavailable skill. Steering an existing worker does not alter its selected roots.

## What a native contract would need

The control must have a caller-generated request ID, exact session/generation/position/attempt/thread/turn target, base effective-selection hash, serialized source/readiness admission, and a durable receipt before applying the native effect. Record an effective grant only after the native acknowledgement; lost or ambiguous outcomes remain unknown and are not automatically retried. Keep the original ceiling immutable and retain separately authorized extensions without rebinding IDs.

A positive acceptance would have to establish that marker skill B is initially unavailable, grant it while the same turn remains active, then observe genuine native list/read pairs and independently match B's hidden marker. It would need unchanged worker/thread/turn identity, unchanged sibling permissions, no restart or manual file substitute, and positive owned cleanup, plus stale-target, source-drift, cancellation, ceiling and lost-response cases. These are explanatory conditions, not a worklist or completed evidence.
