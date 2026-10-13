---
name: workflow-authoring
description: Decompose an authorized Agent Workflow deliverable into bounded scouts, isolated writers, reviewed artifact handoffs and fresh verification. Use when authoring or revising a multi-worker workflow; ordinary direct edits stay in the conversation.
---

Author a saved script using the existing separate QuickJS evaluator. Read [the runtime API](../agent-workflow/references/runtime-api.md) and use [the main skill](../agent-workflow/SKILL.md) for validation, saving, starting and inspection. No planner service, custom MCP, host evaluation or new runtime API is needed.

Use the bundled [decomposition-delivery recipe](../../workflows/decomposition-delivery.js) when a fixed worklist needs actual deliverables after scouting. Read [the recipe contract](references/delivery-contract.md) for arguments, bounded result schemas and the coordinator acceptance gate. It has two explicit invocations: `deliver`, then `verify` from a coordinator-prepared integrated checkout. It never integrates files or decides to replan itself.

## Scope before dispatch

Retain the user's requested outcomes as objective IDs. Inventory enough real paths and prerequisites to choose a useful split. Give each task a stable ID, objective IDs, full phase label, inputs, exclusions, read scope, write ownership, prerequisites, dependency IDs, artifact contract, acceptance checks and timeout. Save this `PlanRevisionV1` in script arguments. Default to at most 32 tasks and two explicitly authored revision rounds; decide overrides before dispatch.

Shared interfaces, lockfiles and integration files each have one named writer. Several workers may read the same source; writers must have disjoint literal paths or directory prefixes, including case collisions on Windows. Reading a path is not permission to edit it. Reject overlapping ownership before dispatch. Do not assign the entire repository to every worker. The recipe refuses unsafe paths, forward dependencies and ownership overlaps.

Choose the shape that matches the work: independent readers can run in parallel; item-local transformation/checks can use `pipeline`; dependent calls need recorded `dependsOn` IDs; combined artifact integration needs a real barrier and coordinator review. A phase groups workers visually and conveys no dependency. Avoid splitting a change that requires simultaneous edits to the same interface.

## Scouts lead to deliverables

Scouts are read-only. Require bounded file/scope inventories, proposed independent slices, shared-interface ownership, prerequisite observations and uncertainties. Pass that JSON into the actual deliverable worker's prompt. Use file references instead of bulky source dumps. Scout suggestions cannot widen the fixed scope or invent more workers in this recipe; changed scope requires a reviewed new revision.

Separate prerequisites for source authoring from prerequisites for validation. Inspect tools in the actual isolated worker environment, using coordinator-verified executable/cache paths. Read [worker prerequisites](../agent-workflow/references/worker-prerequisites.md). Missing build, rendering or browser tools block those commands while useful authorized source work continues. Missing an authoring prerequisite blocks that task. A lost scout leaves a null task slot; it is not an empty successful inventory.

Return the exact blocked command, executable/cache path and observed evidence. A process that launched and exited nonzero may have mutated files. Call it `notStarted` only with explicit evidence that no process began. Do not silently install dependencies, change execution policy or permissions, or try an alternate mutating command after an uncertain effect. The coordinator prepares the toolchain and decides any authorized installation.

## Review, integrate, verify

Dependency completion orders calls. It does **not** transfer predecessor edits between isolated worktrees. JSON reports are context and artifact claims. A writer that needs predecessor bytes must stop that dependent portion and report it incomplete until a coordinator supplies a new verified snapshot. Do not reconstruct, copy or apply predecessor patches from prompt claims.

For each handoff, the coordinator records the producer run, generation, position and observed cumulative attempt, authoritative capture reference and hashes, allowed paths, and reviewed acceptance evidence. Resolve those identities from saved records rather than guessing dispatch positions. The evaluator does not expose them to scripts, so recipe `workerRef` fields stay null until the coordinator resolves them externally.

The coordinator checks verified drain, original outcome/effect reconciliation, manifest/blob integrity, source ownership and complete output scope before using retained artifacts. Review partial and binary artifacts too. A hash confirms bytes; it does not prove that an objective is satisfied. Worker ignores, prose, `delivered`, or a `passed` Boolean cannot supply authoritative capture or acceptance evidence.

After reviewed integration, prepare a dedicated checkout of the combined source and record its content identity. Start a **new** `verify` run there with the originating session and data instance, recording its selected runtime identity. Supply the reviewed producer handoffs and integration/snapshot references. Read-only workers inspect the launch checkout; the runtime does not create an isolated writer capture for them. Keep that checkout stable during verification and recheck its content identity before accepting results. Verification workers inspect actual files plus the required acceptance checks. Checks that mutate fixtures, require packages, start services or render in a browser remain coordinator work unless explicitly authorized elsewhere; absent prerequisites remain reported gaps. Cached replay results cannot establish freshness.

The recipe records supplied references as claims; it cannot authenticate them. It reports fresh checks as `reported` or `unverified`, never `accepted`. Its `complete` stays false and all unaccepted objective IDs remain missing. For the final user-facing completion decision, the coordinator must independently accept every retained objective, resolve captures and check receipts, finish integration, and pass all required fresh checks. Retain the recipe output unchanged and keep the authoritative acceptance report separate. Missing or null verifier slots, missing artifacts, failed checks and incomplete integration cannot be filled by synthesis or worker count.

## Revise explicitly

A revision appends replacement links for unfinished scope, names the prior run and exact generation/position/attempt, and preserves prior failed/unknown outcomes, usage, effects, artifacts and controls. Do not overwrite old execution evidence or silently drop objective IDs. Explicitly describe a user-authorized objective change rather than treating it as delivered.

This guest has no trusted receipt resolver. An uncertain-effect or unknown-outcome replacement is **coordinator-required and never dispatched**, even if JSON arguments contain nonempty reconciliation/drain references or label effects `reconciled`. Independent safe tasks can still proceed; dependencies of the blocked task retain null coverage. Native restart/recovery admission must be performed through the existing authenticated runtime outside this recipe. A revision, new task ID or new run is not a way to bypass that admission. Do not autonomously retry or replan after a failed or unknown worker.

When reporting progress, distinguish execution status, declared task outcome, artifact integrity, integration and accepted verification. A schema-valid blocked report can come from an engine-completed worker. Report all missing objective IDs, null reports, blocked commands and required coordinator actions explicitly.
