# Depth-one workflow composition

Version 0.6.0 adds `await workflow(alias,args)`. [Release evidence](https://github.com/ehartye/agent-workflow/releases/tag/v0.6.0) records final native qualification and publication separately from these API contracts. A root declares all child sources before start; each invocation runs in a separate bounded QuickJS process under the root controller. Children share the run's journal, authority ceiling and worker scheduler, not a host JavaScript context or independent managed run.

## Declare and freeze sources

Save this root script with the child below at `workflows/check-child.mjs` relative to the launch `--cwd`:

```javascript
export const meta = {
  name: 'check-root', description: 'Call one declared source check',
  workflows: [{
    alias: 'check', source: {kind: 'script', path: 'workflows/check-child.mjs'},
    argsSchema: {type: 'object', properties: {subject: {type: 'string', minLength: 1}}, required: ['subject'], additionalProperties: false},
    resultSchema: {type: 'object', properties: {report: {type: 'string'}}, required: ['report'], additionalProperties: false},
    capabilities: {skills: [], tools: []},
    permissions: {sandbox: 'read-only', networkAccess: false, approvalPolicy: 'never'}
  }]
};
const result = await workflow('check', {subject: args.subject});
return result;
```

```javascript
export const meta = {
  name: 'check-child', description: 'Inspect the assigned source',
  steps: [{id: 'inspect', label: 'Inspect source', dependsOn: [], worker: {id: 'inspector'}}]
};
const report = await agent('Inspect only this assigned source: ' + args.subject, {
  id: 'inspector', skills: [], requireTools: [], maxAttempts: 1
});
return {report};
```

Empty selections deliberately mean no selected role skill/tool in this example. Make an explicit skill decision for **every** real scout, writer and verifier. List/read the genuinely selected native packages and check returned roots; see authoring (activate `agent-workflow:workflow-authoring` through genuine `skills.list`/`skills.read` with the returned package and `main_resource`). To use skills here, declare an admitted child ceiling and select those IDs on the child `agent` calls. `capabilities.skills` and `.tools` accept arrays (at most 32/16 distinct IDs) or `null` for no additional narrowing of the immutable root ceiling. `permissions:null` adds no child restriction; an object must use read-only/workspace-write, networkAccess false and approvalPolicy never. Neither null nor child selections grant new root authority, dependencies, live skill roots or host connections.

`meta.workflows` allows at most 32 exact records with `alias`, `source`, `argsSchema`, `resultSchema`, `capabilities`, `permissions`. Aliases use portable IDs (1–100 letters/digits/underscore/hyphen), distinct ignoring case; reserved prototype names reject. Schemas use the existing object-root subset (32 KiB, 512 nodes, depth 16). Unknown declaration fields reject.

Script sources require literal portable relative `.js` or `.mjs` paths: exact case, NFC, at most 1,000 characters and UTF-8 bytes; no traversal, empty components, backslashes, drive/UNC/absolute paths, `.git` components, Windows device names, trailing spaces/dots, control characters or shell metacharacters. The alternative is `{kind:'registry',name:'project:check-child'}` (bounded nonempty name, at most 110 characters), resolved through the normal launch-cwd registry. A script is regular single-link UTF-8 text, at most 1 MiB, with unlinked ancestors and stable pathname/handle identity. Child metadata cannot declare nonempty `workflows`; child calls to `workflow()` fail depth admission.

New-run source resolution freezes bytes into private content-addressed `workflow-sources-v1/` blobs before execution. Each entry records its declaration, locator provenance, script blob, metadata/schema hashes and sourceId. The sorted catalog has a catalogHash; source aggregate is at most 32 MiB and catalog at most 4 MiB. A sourceId identifies that full retained entry, not just script text. Missing/changed/unsafe sources reject. Later registry/file changes cannot retarget an admitted invocation.

## Lifetimes, results and replay

`workflow()` requires exactly alias and JSON object args satisfying the frozen args schema. It resolves to `{invocation,source,value,cached}`: invocation is the ChildRef, source is sourceId, value satisfies resultSchema, cached identifies reuse. Args/results cross JSON-only broker boundaries; functions, proxies, accessors, custom prototypes, cycles, sparse/named arrays, nonfinite numbers and other non-JSON values reject. Host validation bounds structure to depth 32/200,000 nodes and input to 1 MiB; the complete serialized broker response, including the envelope, is also at most 1 MiB. Leave headroom. No filesystem, Node, shell or network API is added to the evaluator.

Child evaluator permits are FIFO and held for each child's lifetime, including waits for workers and their settlement. Their pool is independent of worker permits; **each** has the root `--concurrency` capacity (default 2, range 1–256). Root and child workers compete for the same worker permits. A child waiting for a worker does not occupy that worker permit merely by existing. Child FIFO order is not a claim about native worker finish order or throughput. Queue cancellation records no child process only when confirmed before fork.

Budget the whole root: at most 1,000 child invocations, 1,000 worker requests and lifetime attempts including root/children/appends, 10,000 aggregate broker calls and 4,096 pending calls. `parallel`/`pipeline` still permit at most 4,096 entries; concurrency does not bound lifetime calls. Every evaluator has its own existing CPU/heap/stack/idle protections; outstanding broker work suspends its no-work idle timer. The optional run wall limit includes queueing and child waits. Worker deadlines, command/startup/drain protections remain separate. There is no public per-child timeout or concurrency option on `workflow()`.

The root owner retains all state and controls. Pause closes admission and drains accepted work; Stop aborts execution and queued children. An originating-session `cancel-child` domain request targets an observed ChildRef/revision and cancels that invocation's work; it is not a child-created control plane. Pending/applied/unknown receipts remain distinct from verified owned cleanup. Domain CLI uses `domain-control RUN --session SESSION --request-file FILE` and read-only `domain-control-receipt RUN --session SESSION --request-id UUID`. Request schema is `{schemaVersion:1,requestId,expectedGeneration,action:'cancel-child',payload:{child,expectedRevision}}`; use a preallocated lowercase UUID v4 and the exact observed revision. A lost reply requires reading the same receipt and reconciling effects before another mutation.

The global invocation journal links root/child local calls in recorded arrival order. Replay verifies complete links, source/result blobs, worker records, schema results and reuse lineage; corruption anywhere fails closed. Matching completed prefixes can be copied without starting child processes or native workers. Changed/failed source/call suffixes are not successful cached work. Effective args/options, policy, catalogs, capabilities and backend identities participate; labels/phases are cosmetic. A cached value does not prove external freshness or exactly-once effects. Unknown effects and failed drain cannot be repaired by editing a source locator or automatically retrying.

Resume retains the original source catalog. A reviewed replacement uses `resume RUN --session SESSION --generation N --script ROOT --workflow-revisions-file FILE`, where the file is at most 65,536 bytes and contains `{schemaVersion:1,expectedGeneration,expectedCatalogHash,reconciliation,replacements:[{alias,expectedSourceId,source}]}`. Reconciliation is nonblank and at most 2,000 characters; 1–32 replacements must match exact saved entries and the edited root locators. The controller additionally requires positively drained completed work and matching generation; text is not permission to bypass that gate. Keep historical outcomes. No source-store rewrite or automatic fallback is authorized.

## Inspect and preserve boundaries

`children RUN --generation N [--limit 1..100] [--after CURSOR]` uses the recorded runtime and returns `items,nextCursor,hasMore` (default 50, at most 1 MiB). Rows identify source, child revision, execution, worker positions, result BlobRef/error and reuse provenance. `waiting` is an observed child state, not completed delivery. Cursors bind the invocation sequence and catalog; restart paging when changed. Authenticated GET `/api/children` or `/api/runs/:runId/children` takes the same generation/limit/after fields. See [steps](workflow-steps.md) for scoped plans and paging.

An old runtime or noncomposition run can report `COMPOSITION_UNSUPPORTED`. Current presentation does not replace its execution providers. New-run setup does not reinterpret old data or retrofit catalogs. Child failures/null collection slots stay explicit missing coverage. Artifact/refinement input, review, asset and stage providers are unavailable in this baseline; no artifact/refinement helper module or public API is delivered here. Do not treat reserved broker names or design documents as implemented delivery services.
