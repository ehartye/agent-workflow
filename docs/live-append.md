# Live append candidate

This source candidate adds independent tasks to an active workflow. Installed 0.3.6 and retained runtimes without append support do not provide these commands. This document is a development contract, not native acceptance or release evidence. The original writer receipt and its incomplete outcome are preserved in [the writer receipt](reviews/2026-10-15/live-append.md); subsequent coordinator integration and verification do not rewrite that attempt.

Use the public managed launcher with the run's original data directory and originating session:

```text
agent-workflow append RUN --session SESSION --generation N --request-id UUID --tasks-file tasks.json
agent-workflow append-receipt RUN --generation N --request-id UUID
```

Generate the request UUID before submitting. After a lost response, inspect that exact generation and request ID. Reusing an ID with the same normalized payload returns its retained admission; a different payload rejects. A new ID represents new work. Receipt inspection requires filesystem read access and does not grant execution authority.

The file must be regular, strict UTF-8 JSON, without a BOM, and at most 512 KiB. Its normalized payload has a separate 512 KiB ceiling. Supply exactly one top-level `tasks` property:

```json
{
  "tasks": [
    {"id": "review-logging", "prompt": "Review logging failure boundaries.", "options": {"label": "Logging review"}}
  ]
}
```

Supply 1–32 independent tasks. IDs are unique within the batch, nonempty and at most 200 UTF-16 units; prompts are nonempty and at most 65,536 UTF-16 units. `options` may be omitted. Its permitted keys are `label`, `phase`, `skills`, `requireTools`, `timeoutMs` and `schema`. Existing schema and capability selection rules apply. Tasks cannot set dependencies, model, permissions, workspace, retry settings, executables, plugin roots or installations. Each addition has one attempt and uses the original backend's model and workspace defaults.

Accepted tasks share the existing run's scheduler, concurrency and lifetime attempt budget. Guest calls and correction attempts spend capacity through the same SQLite ledger. Admission reserves an attempt; durable dispatch intent consumes it before native submission. Missing delivery evidence remains unknown. The controller never automatically resubmits a noncompleted addition during ordinary resume; use the existing reviewed physical-suffix restart after reconciling effects and verifying cleanup.

Receipts retain request and payload identities, original runtime/backend/access/capability/input identities, accepted positions, timestamps and task outcomes. Delivery states are `queued`, `active`, `settled`, `rejected` and `unknown`. Closed or exhausted admissions retain rejected receipts and create no workers. Invalid file/task/capability/schema inputs can reject before a receipt exists. Execution results remain explicit worker results. A failed addition fails the aggregate while preserving the original guest's `result`.

Default writers require the run's existing verified captured input manifest. Append rejects if that snapshot is missing or invalid; it does not capture newer source. Their identity is `originalCapturedInputs` with the retained manifest hash. Default readers retain `originalLiveDirectory` and the original launch directory. This describes input behavior and does not add a filesystem sandbox or widen the originating access policy.

Guest invocation ordinals are separate from physical slots. Worker origins identify either a guest ordinal or an originating generation/request/task tuple. Guest dependency hashes use those stable origins. Replay copies record `sourceGeneration`, `sourcePosition` and `reusedFrom`; physical slots can change. Restart previews retain every affected old physical suffix origin, including interleaved additions and later guests.

Normal completion closes admission transactionally after guest completion and accepted task settlement. An append admitted first joins the drain; an append arriving after closure rejects. Pause and Stop close admission in their request transaction. Pause permits accepted additions to settle. Stop interrupts active execution and retains cancelled or unknown evidence. Terminal publication follows owned backend cleanup.
