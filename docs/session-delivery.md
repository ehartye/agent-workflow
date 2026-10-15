# Session delivery, capture and retirement

Use [workflow-authoring](../skills/workflow-authoring/SKILL.md) to split an authorized objective into bounded scouts, disjoint writers, reviewed artifact integration and a fresh verification run. The bundled `plugin:decomposition-delivery` recipe retains incomplete objectives and treats supplied receipt references as claims. The coordinator makes the separate acceptance decision; the recipe does not authenticate receipt strings or automatically merge patches.

## Explicit writer capture policy

New starts may take `--capture-policy C:/path/to/policy.json`, including detached starts. For example:

```json
{"version":1,"excludeDirs":["node_modules/","dist/"],"protectedPaths":["src/","test/","package.json","package-lock.json"]}
```

The coordinator supplies the complete assigned source-output scope in `protectedPaths`. Paths are literal repository-relative names or directory prefixes, not globs. Traversal, absolute paths, Git metadata, ambiguous Windows names, case collisions, overlapping ownership and exclusions covering tracked or protected paths reject. A worker's edited ignore rules never become capture authority.

The canonical policy and hash persist before writer dispatch, participate in replay identity, and remain immutable for that run. Changing the policy requires a new run; it cannot repair or recollect an earlier failed capture. Existing runs without an explicit policy keep their recorded capture semantics. An explicit empty exclusion list includes ignored inputs and outputs.

Included files remain bounded at 20,000 files and 512 MiB total captured bytes, with a separate 512 MiB budget for each diff. Patch previews and capture metadata retain their 32 MiB limits. Large captures increase disk use, hashing/Git time and peak memory because file and diff verification currently buffers data; the capture budget is not a process-memory cap. Excluded entries have a separate complete metadata inventory bounded at 100,000 entries and 16 MiB; overflow fails instead of silently dropping records. The inventory records names, kinds, counts and omitted bytes. Its hash verifies metadata, **not excluded payload contents**. Missing assigned outputs remain explicit evidence, not delivery.

Keep active observer logs, dashboard receipts and coordinator gate files outside the captured source, including excluded directories. Exclusion avoids opening payloads; its complete metadata inventory is still enumerated and compared during capture. Changes to an excluded log's size or directory entries can therefore refuse a capture. Freeze the launch checkout and use a separate absolute coordinator-control directory. Input failures retain their sanitized `capture.stage` and `capture.cause` on the worker error; a pre-dispatch refusal remains failed/not-started, with no worker inference. These diagnostics do not recover a cause discarded by an older recorded runtime.

Inspect a finalized writer through the dashboard's Read excluded inputs/outputs buttons, or:

```text
exclusions RUN_ID --position 0 --generation 1 --stage outputs --after 0 --limit 50
```

Use the public launcher prefix and exact returned run ID. Pages contain `policyHash`, `inventoryHash`, `entryCount`, `fileCount`, `bytes`, `entries` and `nextAfter`; follow the returned cursor until null. `--source-generation` reads a linked historical execution. All reads verify the retained inventory identity. Earlier runtimes without explicit-policy support have no such inventory.

## Reversible visibility

`list` returns `{runs,counts}`; hidden and archived runs are omitted unless `--show-hidden` is supplied. `lifecycle RUN_ID` returns the revision, exact run/worker targets, visibility, original execution status, tombstones and counts. Hiding or archiving active, failed or unknown work is allowed and never changes status, evidence, ownership or control IDs. Show hidden and explicit hidden/unknown counts retain discoverability.

```text
hide RUN_ID --session SESSION --generation 1 --revision 0 --request unique-request-id
restore RUN_ID --session SESSION --generation 1 --revision 1 --request another-request-id
archive RUN_ID --session SESSION --generation 1 --revision 2 --request worker-request-id --target worker --worker-generation 1 --position 0 --attempt 0
lifecycle-receipt RUN_ID --receipt unique-request-id
```

Use the observed revision and exact cumulative attempt, including zero for an undispatched worker. Visibility transactions serialize independently of the live controller lock. After a lost response inspect the known request ID; do not blindly resubmit. Current session presentation can overlay older retained runs without replacing their execution runtime.

## Reviewed destructive retirement

Prune is separate from visibility. It retires eligible run/worker live workspace payloads and reuse, retaining execution rows, capture artifacts, runtime evidence, Git registration and durable tombstones. It does not erase historical attempts or delete a runtime. A settled read-only run may have no filesystem candidates and still receive a retirement tombstone.

```text
prune-plan RUN_ID --session SESSION --generation 1 --revision 0 --reason "Reviewed accepted output" > reviewed-plan.json
prune RUN_ID --session SESSION --plan reviewed-plan.json --approved-plan-hash EXACT_PLAN_HASH
```

Review all candidates, blockers, reference/ownership identities and the exact hash first. Admission revalidates generation, revision, session, runtime, complete historical references, artifact integrity, filesystem identity and bytes under exclusive execution ownership. Active, unknown, unreconciled, pinned, incomplete or referenced recovery data is ineligible. Each executed worker needs positive native-terminal and owned-job cleanup evidence; the run aggregate proves process/job cleanup. Separately evidenced pre-process failures do not invent terminal cleanup.

The retained runtime must declare `lifecycle-retirement-v1`, ensuring its controller refuses replay after retirement. Older immutable runtimes lacking that guard cannot be destructively retired through a newer dashboard. No historical runtime is patched to add support.

An applying receipt and tombstones become durable before the first exact-path deletion. No recursive wildcard deletion or filesystem retry occurs. Partial effects or an uncertain acknowledgement retain an unknown receipt. Inspect `lifecycle-receipt` using the **plan ID**, preserve the evidence and reconcile; never repeat the destructive request. The browser preserves this identity after lost responses too. Development acceptance pruned temporary fixtures only, never real session records.

## Session dashboard and evidence meanings

The dashboard offers stable `/runs/ID` views and `/session` navigation, scoped to the originating session and data instance. Switching views or following a replacement does not arm its Stop button; select the viewed run for control explicitly. Execution evidence reads and controls verify and dispatch through that run's retained runtime; presentation and visibility overlays use the current adapter. `dashboard ID --current-ui --session SESSION` explicitly uses the installed current presentation for an older run; default dashboard selection remains pinned.

Engine completion, declared task outcome, artifact integrity, acceptance and dashboard health are separate. Only a declared strict schema using `contract: "agent-workflow.task.v1"` and required `taskId`, `outcome`, `summary`, `blockers`, `artifacts`, `checks` is considered a typed task report. Outcomes are delivered/blocked/incomplete. Artifact claims contain claimId/relativePath/sha256/bytes; blocker/check references remain claims. Ordinary prose, other recipe schemas and self-reported passing checks stay unverified. The shipped adapter supplies no authenticated acceptance receipt service: it never upgrades those claims to accepted delivery. Deliberate diff/inventory reads verify their own retained hashes separately. Cached reports cannot prove current file freshness.

Phase membership links are grouping, while arrows represent only recorded dependencies. The independent health endpoint distinguishes a live dashboard from failed worker cleanup or an unavailable saved snapshot. The monitor has no default idle expiry; Close ends that dashboard instance, not the workflow. An overall workflow wall deadline is also opt-in; worker deadlines and evaluator CPU/memory/idle protections remain bounded.
