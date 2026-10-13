# Bounded delivery recipe contract

`plugin:decomposition-delivery` uses only literal exported metadata, `agent`, `parallel`, `phase`, `log` and deterministic JSON processing in the supported evaluator. Importing it into Node or evaluating it in the host is unsupported. Validate it through the normal CLI before use. The coordinator authorizes writer execution with `--writable`; worker permissions cannot raise the run ceiling.

## Arguments and defaults

Arguments are `{stage, planRevision, limits?, integration?}`. `stage` defaults to `deliver`; the other mode is `verify`. `limits` defaults to `{maxTasks:32,maxRevisionRounds:2}`; explicit pre-dispatch overrides can select 1-64 tasks and 1-8 revision rounds. The recipe performs one scout pass in a delivery invocation. Extra rounds are separately authored revisions, never a loop that generates new scope.

The complete plan is limited to 128,000 JSON characters. Each task is limited to 14,000 characters; each worker's JSON handoff is limited to 42,000 characters. Exceeding a handoff bound leaves that slot null and requires a narrower explicit revision. These bounds do not change engine schema, memory, invocation or capture limits.

A small source-only argument example:

```json
{
  "stage": "deliver",
  "planRevision": {
    "version": 1,
    "revision": 1,
    "priorRun": null,
    "objectives": [
      {"id": "settings", "description": "Persist and display the requested settings"}
    ],
    "tasks": [
      {
        "id": "storage",
        "objectiveIds": ["settings"],
        "phase": "Build settings",
        "inputs": ["Read existing storage types and tests; preserve their public contract"],
        "exclusions": ["node_modules/", "dist/"],
        "readScope": ["app/", "test/"],
        "writeOwnership": ["app/settings-store.js", "test/settings-store.test.js"],
        "prerequisites": [],
        "dependsOn": [],
        "artifactContract": [
          {"claimId": "store", "relativePath": "app/settings-store.js"},
          {"claimId": "store-tests", "relativePath": "test/settings-store.test.js"}
        ],
        "acceptanceChecks": [
          {"id": "persistence", "command": "node --test test/settings-store.test.js", "required": true}
        ],
        "limits": {"timeoutMs": 600000}
      },
      {
        "id": "view",
        "objectiveIds": ["settings"],
        "phase": "Build settings",
        "inputs": ["Use the existing storage interface; storage report is JSON context only"],
        "exclusions": ["node_modules/", "dist/"],
        "readScope": ["app/"],
        "writeOwnership": ["app/settings-view.js"],
        "prerequisites": [
          {
            "id": "browser",
            "command": "coordinator browser validation",
            "executablePath": null,
            "cachePath": null,
            "requiredFor": "verification"
          }
        ],
        "dependsOn": ["storage"],
        "artifactContract": [
          {"claimId": "view", "relativePath": "app/settings-view.js"}
        ],
        "acceptanceChecks": [
          {"id": "view-behavior", "command": "coordinator browser validation", "required": true}
        ],
        "limits": {"timeoutMs": 600000}
      }
    ],
    "replacements": []
  }
}
```

`dependsOn` only names distinct tasks earlier in the list. The recipe gives calls internal IDs such as `scout-0` and `deliver-0`, declares their real engine dependencies, and passes predecessor reports as JSON. Task IDs retain the runtime's letters/digits/underscore/hyphen rules and 100-character bound. Neither phase membership nor array position implies file transfer. The example view task must report incomplete if it needs storage edits absent from its captured input.

Each task field in the example is required. Arrays of paths, inputs, prerequisites, artifact claims, acceptance checks and dependencies are bounded to 32 entries. Objectives are bounded to 64. At least one artifact and one required check are required per task. All declared artifact files must lie within that task's write ownership. Ownership paths cannot overlap, including case collisions, directory ancestors or an identical bare/directory path. Exclusions cannot overlap ownership. Use literal repository-relative paths with `/`; no globs, traversal, drive paths, Git metadata or ambiguous Windows names.

Prerequisites use `requiredFor:'authoring'|'verification'`. Scouts must report a matching ID, command and executable/cache paths with availability evidence for required authoring prerequisites. An absent or unavailable authoring prerequisite prevents that writer's dispatch. Verification prerequisites can remain missing while source authoring proceeds. Executable/cache discovery is an observation, not install authorization or proof that execution is permitted.

## Read-only scout result

Every field is required and every object rejects additional properties:

```text
{
  taskId,
  files: [{relativePath, detail}],
  proposedSlices: [{id, readScope: string[], writeOwnership: string[]}],
  interfaces: [{name, ownerTaskId, detail}],
  prerequisites: [{id, available: boolean, command, executablePath: string|null,
                   cachePath: string|null, evidence}],
  uncertainties: string[]
}
```

Bounds: 64 files, 8 proposed slices, 16 interfaces, 32 prerequisites, 16 uncertainties. Inventory details/evidence are at most 2,000 characters. Suggestions are advisory: changing ownership or adding a task requires the coordinator's new plan. The `taskId` must exactly match its assigned task.

## TaskReportV1

Delivery and verification use this bounded result schema. Every field is required, including empty arrays and explicit nulls. Every object uses `additionalProperties:false`.

```text
{
  contract: 'agent-workflow.task.v1',
  taskId,
  outcome: 'delivered'|'blocked'|'incomplete',
  summary,
  blockers: [{code, detail, evidenceRefs: string[]}],
  artifacts: [{claimId, relativePath, sha256: string|null, bytes: integer|null}],
  checks: [{checkId, status: 'passed'|'failed'|'notRun'|'unknown', evidenceRefs: string[]}]
}
```

Bounds: 2,000 summary characters, 16 blockers, 32 artifact claims, 32 checks and 16 evidence references per blocker/check. `taskId` has the assigned constant value. Hash claims use 64 characters; fresh reported evidence additionally requires lowercase hexadecimal SHA-256 and nonnegative byte counts. Claims are not resolved using caller-supplied absolute paths. The coordinator resolves them against authoritative retained captures.

The protocol marker is a required schema constant. Arbitrary prose or an object merely containing `outcome` cannot satisfy it. `maxAttempts:1` prevents corrective-answer retries in this recipe. A failed dispatch remains null with original execution evidence in the run; a missing artifact remains missing even when a worker declares `delivered`. Schema-valid `blocked` is a declared task outcome, not a rewrite of the engine's execution status.

## Coordinator integration and fresh verification

The delivery result always requires coordinator integration. No integration writer is dispatched automatically. Review all retained captures and claims, including unexpected outputs and missing declared files. Verify source/output scope, drain, original effects and included manifest/blob integrity. Then integrate only the reviewed allowed paths in an authorized coordinator workspace and prepare a dedicated checkout with a recorded content identity for a new run. Read-only verification uses that launch checkout rather than an automatic isolated writer capture; keep it stable and recheck its identity before accepting the results.

For `stage:'verify'`, retain the same objective/task contracts and provide:

```text
integration: {
  receiptRef,
  snapshotRef,
  snapshotHash,
  handoffs: [{
    taskId,
    producer: {
      run: {dataInstanceId, runId, runtimeId},
      generation, position, attempt
    },
    captureRef, captureHash,
    allowedPaths: string[],
    acceptanceEvidenceRefs: string[]
  }]
}
```

There must be exactly one handoff per task, with exact artifact paths, nonempty review references, valid hash shapes and exact producer identities. `attempt` is the persisted observed cumulative attempts value. Missing or structurally invalid integration metadata produces null verifier slots without dispatch. Supplying metadata is **not** proof: the coordinator must verify it against retained storage and ensure the new launch source is that snapshot. The guest has no trusted receipt resolver.

Verification workers receive only their own handoff and task. They are read-only, inspect actual integrated files, and report required checks with evidence. Reported artifact hashes and passed checks without evidence stay `unverified`. Full fresh reports are `reported` and still require authoritative coordinator acceptance. A lost verifier remains null. Original engine statuses, dependencies and historical records are never rewritten.

## Result and completion boundary

The result is:

```text
{
  planRevision, expectedObjectiveIds,
  rows: [{taskId, objectiveIds, workerId, workerRef: null,
          scout, report, outcome, artifacts, deliveryEvidence,
          accepted: false, reason}],
  missingObjectiveIds,
  integration,
  verification: {status, rows: [{taskId, workerId, workerRef: null, result, status}]},
  complete: false, completionAuthority: 'coordinator', reason
}
```

`deliveryEvidence` is `claimed` or `missing`. It is never a statement of integrity. `workerId` is the invocation ID; `workerRef` remains null because the supported `agent` API returns only the validated value, not authoritative dispatch identity. Resolve run/generation/position/attempt from saved records during review.

All objective IDs remain in `missingObjectiveIds` until separately accepted. The recipe deliberately cannot emit `complete:true`: authentication of receipts, integration and user acceptance belongs outside the guest. A coordinator completion report must cover every retained objective with accepted artifacts, complete integration and passed required fresh verification. Keep recipe records and unknown outcomes intact; do not edit this evidence object to make a saved run appear successful.

## Explicit revision links

A new revision uses the prior run reference and `replacements` entries:

```text
{
  taskId: 'replacement-task',
  prior: {
    run: {dataInstanceId, runId, runtimeId}, generation, position, attempt,
    taskId: 'original-task',
    outcome: 'failed'|'unknown'|'blocked'|'incomplete',
    effects: 'none'|'uncertain'|'reconciled'
  },
  admission: null
}
```

The prior outcome, cumulative attempt and run identity remain unchanged in the returned plan. Replacement links describe unfinished work; they do not retire or delete earlier evidence. Keep all retained objective IDs; append explicit scope-change evidence when the user authorizes a changed objective. New revisions require at least one replacement link and stay within the predeclared round limit.

For unknown prior outcomes or effects other than `none`, the recipe skips **all dispatch for that replacement task**, including scouts. Nonempty `reconciliationEvidenceRef`/`drainEvidenceRef` in `admission`, or the word `reconciled`, cannot unlock it. Other safe tasks still run; tasks depending on the blocked replacement remain null. Existing native restart/recovery must verify authority, reconciliation, identity and drain outside the recipe. There is no supported authority boundary here that can admit uncertain repetition. Preserve the block and hand it to the coordinator; do not rename the task or omit its history to evade it.
