# Declared steps and observed workers

Version 0.6.0 adds declared-step visibility for new runs. Publication and final native qualification are recorded separately in [the release evidence](https://github.com/ehartye/agent-workflow/releases/tag/v0.6.0). Declare the plan in literal `meta.steps` before requesting workers. The dashboard can then show work that has not started, including steps that never receive a worker.

```javascript
export const meta = {
  name: 'review-pair', description: 'Review then verify the finding',
  steps: [
    {id: 'review', label: 'Review the source', phase: 'Review', dependsOn: [], worker: {id: 'review-worker'}},
    {id: 'verify', label: 'Verify the finding', phase: 'Verify', dependsOn: ['review']}
  ]
};
const review = await agent('Review the assigned source; return a bounded finding.', {
  id: 'review-worker', label: 'Source reviewer', phase: 'Review',
  skills: [], requireTools: [], maxAttempts: 1
});
const verification = await agent('Verify this reported finding: ' + JSON.stringify(review), {
  id: 'verify-worker', stepId: 'verify', dependsOn: ['review-worker'],
  label: 'Finding verifier', phase: 'Verify', skills: [], requireTools: [], maxAttempts: 1
});
return {review, verification};
```

The empty selections above are deliberate for this source-only example. For each actual worker, choose the appropriate admitted skill IDs and required tools before startup; see the [authoring selection procedure](../skills/workflow-authoring/SKILL.md). Discovering a skill does not activate it.

## Declaration and association

A catalog is an array of at most 256 steps and 262,144 serialized UTF-8 bytes per scope. Each step requires exactly `id`, `label`, `dependsOn`, with optional `phase` and `worker:{id}`. IDs are 1–100 ASCII letters, digits, underscores or hyphens; `__proto__`, `constructor` and `prototype` are refused case-insensitively. Step IDs and declared worker IDs must be unique ignoring case within the scope. Labels and optional phases are nonempty strings of at most 500 characters with no NUL. Up to 255 distinct dependencies must name exact other step IDs in that scope; missing IDs, case aliases, self-edges and cycles reject. Forward display edges are allowed when acyclic.

A worker binds through its exact `id` matching `worker.id`, or an explicit `stepId`. If both select a step, they must agree. A step with a declared worker requires that exact worker ID even with `stepId`. A declared step has at most one logical worker. An undeclared `stepId`, conflicting association or duplicate assignment rejects. Worker IDs use the same portable ID bounds and are local to their root or child invocation. Worker `label`/`phase` are display strings of at most 500 characters; they do not bind a step.

Step `dependsOn` expresses a displayed plan relationship. It does not schedule execution. Worker `dependsOn` schedules against up to 256 distinct **earlier requested worker IDs in the same scope** and dispatches only after those workers complete successfully. A phase groups work visually. Ordinary JavaScript data dependencies are not inferred as graph edges.

`StepRef` contains `{run,generation,scope,stepId}`. A `run` identifies `{dataInstanceId,runId,runtimeId}`; scope is `{kind:'root'}` or `{kind:'child',invocation:ChildRef}`. A child ref includes its run, generation and invocationId. Identical local step IDs in root and child scopes remain distinct. Root declarations are retained before root evaluation; a child's declarations become visible when that child invocation is admitted, including while queued. The root generation permits at most 4,096 instantiated steps across all scopes.

## What the display proves

Unassigned steps remain **Planned** while the run is live and **Incomplete** when it is completed, failed, stopped, unknown or blocked. A blocked terminal run does not leave a planned promise of future execution. No placeholder worker, passing result or worker control is fabricated. Unassigned details provide plan relations; controls require an actual worker identity.

Assigned rows retain the actual execution state and worker coordinates; cached rows also identify their source worker. Acceptance remains `unverified`: completed execution alone is not accepted delivery. Workers without a declaration, including unnamed dynamic calls and appended tasks, remain actual dynamic workers. Appended tasks never attach themselves to an existing declared step. Coverage distinguishes declared/assigned/unassigned/dynamic counts and future workers `unknown` versus `executionClosed`.

The map previews at most 60 loaded nodes and discloses omitted edges. The Declared steps list retains loaded steps beyond that preview; Load more steps retrieves further pages. The UI bounds a refresh to 64 requests and 1 MiB per page, retains stale evidence explicitly after failure, and does not rebuild unavailable catalogs from raw metadata.

## Read-only inspection

```text
node "<plugin-root>/bin/launch.mjs" steps "<run-id>" --generation 1 --limit 50
node "<plugin-root>/bin/launch.mjs" steps "<run-id>" --generation 1 --limit 50 --after "<returned-nextCursor>"
node "<plugin-root>/bin/launch.mjs" children "<run-id>" --generation 1 --limit 50
```

Use the observed generation, exact run ID and the same explicit `--data-dir` throughout. These reads make no model call. Page size is 1–100, default 50; omit `--after` initially and pass the opaque returned cursor unchanged. Step pages return `schemaVersion`, `run`, `generation`, `available`, `items`, `nextCursor`, `hasMore` and `coverage`. Cursors bind the catalog sequence and generation. Restart paging after a conflict; do not splice pages from changed catalogs. Complete retained source/catalog and worker association validation precedes paging, so corruption outside the requested page still fails closed.

Authenticated HTTP equivalents are `GET /api/steps?generation=1&limit=50` and `GET /api/children?generation=1&limit=50`, or session-bound `/api/runs/:runId/steps` and `/api/runs/:runId/children` with the same query. Optional `after` is URL-encoded. Unknown/repeated query keys reject. Responses are bounded to 1 MiB. Reads do not pause, start or control workers. Step generation/cursor conflict returns 409; unsupported recorded providers return 503. A current reader of a run without step support reports `available:false`, rather than claiming its empty catalog is a complete plan. Older recorded runtimes may reject the CLI command entirely; `--current-ui` supplies presentation only and cannot add a provider.

See [composition](workflow-composition.md), [HTTP API](api.md#authenticated-session-http-monitor) and [LAN dashboard](dashboard-lan.md).
