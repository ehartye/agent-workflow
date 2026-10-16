# Reusable child workflows

Status: proposed implementation contract, 2026-10-16. None of the new APIs below is callable in 0.5.0. This specification and [artifact refinement](2026-10-16-artifact-refinement-design.md) form one design; the [implementation plan](../plans/2026-10-16-composition-refinement-implementation.md) assigns their integration owners.

## Scope and source baseline

The coordinator supplied baseline version 0.5.0, commit `3f97a9c3bfcac108221bda8975bc0596ca8b0d10`, delivery runtime `0.5.0-5b27fd662a38b8af-node24.18.0`. These identities are supplied design inputs, not a Git or installed-runtime verification performed by this author. Inspected `package.json` declares 0.5.0. All source inspection and authoring occurred in the assigned worktree.

Relevant current implementations are `engine/script.mjs` (literal metadata and module refusal), `evaluate.mjs` and `evaluator-child.mjs` (separate QuickJS/JSON broker), `controller.mjs` (workers, dispatch, prefix replay, cleanup), `append.mjs` (atomic global slots/attempt reservations), `restart.mjs`, `registry.mjs`, `background.mjs`, `cli.mjs`, `workspaces.mjs`, `workspace-run.mjs`, `stage-checkpoints.mjs`, `delivery-acceptance.mjs`, `monitor-data.mjs`, `monitor-server.mjs`, `monitor/services.mjs`, `monitor/experience.mjs`, and `monitor/app.mjs`. First-party contracts are the runtime API, worker capabilities, session delivery, live append, checkpoint, acceptance, verification and parity documents. Older limitation prose can lag current parent-access implementation; actual admission code and the current API govern.

Currently the guest exposes `agent`, `parallel`, `pipeline`, `phase`, `log`, and `args`. Only agent/phase/log cross the broker. Registry resolution captures the root script; replay chains worker invocations in their request order. Independent writer worktrees share captured baseline inputs, never predecessor edits. Child workflows, derived inputs, and domain refinement acceptance are absent. Existing delivery checkpoints are coordinator-owned evidence, not a generic worker self-acceptance API.

The new feature reuses one root run, supervisor, backend, scheduler, session, runtime, authority and immutable capability bundle. Child means a separate bounded QuickJS evaluation of retained source, not another workflow runtime or native delegated agent. Native agent threads remain the existing backend's responsibility. No host execution of user JavaScript, MCP server, API-key route, host conversation clone, shared parent spending budget, or full Claude/native host parity is implied.

## Approaches considered and decision

1. Inline reusable code into the root before execution.
   - **Time:** less initial process work; each recipe change requires root regeneration and later source attribution work.
   - **Risk:** medium likelihood of replay/source ambiguity; high impact if changed helper effects are reused.
   - **Complexity:** smaller runner, complicated source maps and shared guest globals.
   - **Best practice:** preserves guest isolation but weakens independently retained module identity.
   - **Maintainability:** generated roots and coupled helpers accumulate review cost.
2. Start a separate ordinary run for every child.
   - **Time:** startup/authentication and monitoring lag on every invocation.
   - **Risk:** high likelihood of split cancellation/caps; severe uncertain-effect duplication on recovery.
   - **Complexity:** multiple supervisors, ledgers, schedulers and authority bindings.
   - **Best practice:** unsuitable for this one-root requirement.
   - **Maintainability:** cross-run recovery becomes a permanent integration obligation.
3. **Chosen: retained child sources, separate evaluators, one root scheduler and journal.**
   - **Time:** more implementation and crash testing now; reusable admission and no second runtime later.
   - **Risk:** scheduler/replay races are material; transactional intents and process tests bound them.
   - **Complexity:** a bounded child lifetime pool, scoped identities and invocation records; no recursive supervisor tree.
   - **Best practice:** guest isolation, immutable provenance and centralized authority remain explicit.
   - **Maintainability:** one versioned provider contract supports raw loops and the root refinement helper.

## Normative data conventions

The following algebraic records define exact JSON shapes. Every listed field is required unless explicitly marked optional; objects reject additional fields. Unions are discriminated and reject mixed alternatives. `null` is accepted only where written. No coercion, defaults in JSON Schema, path normalization that hides aliases, or silent truncation. Missing, undefined, NaN, Infinity, bigint, sparse/named/subclass arrays, proxies, accessors, symbols, cycles and custom prototypes reject before callbacks/getters/toJSON. Native objects are checked through descriptors before serialization. Limits count compact serialized UTF-8 bytes, except display text and prompts where stated.

`H(x)` is SHA-256. `C(x)` is recursively key-sorted JSON using JavaScript string order, array order preserved, UTF-8, no whitespace/newline. File hashes use exact file bytes instead. `Sha` is 64 lowercase hex characters; `Uuid` is lowercase UUID v4; `Count` is a nonnegative safe integer. `Id` matches `[A-Za-z0-9_-]{1,100}`; alias comparison is case insensitive and rejects `__proto__`, `constructor`, `prototype`. `Text(n)` is nonempty text of at most n UTF-16 code units without NUL. `Path` is a relative NFC slash-separated literal file path, at most 1,000 UTF-8 bytes: no absolute/UNC/drive path, backslash, empty/dot/dot-dot component, `.git` component, control character, Windows device component, trailing dot/space, wildcard or shell metacharacter. Component case aliases and file/directory prefix collisions reject. `OwnedPath` additionally permits one terminal slash to denote a directory prefix. Ownership comparisons are case insensitive on all platforms. IDs and physical positions are separate types.

| Type | Exact fields and bounds |
| --- | --- |
| `RunRef` | `{dataInstanceId:Text(200),runId:Uuid,runtimeId:Text(200)}`; must equal the resolved managed-run binding |
| `WorkerRef` | `{run:RunRef,generation:positive safe integer,position:integer 0..999,attempt:Count}`; attempt is actual cumulative attempt, never an authored guess |
| `ChildRef` | `{run:RunRef,generation:positive safe integer,invocationId:Id}` |
| `BlobRef` | `{kind:"blob",sha256:Sha,bytes:Count}`; engine resolves only inside this run's retained store; no caller path |
| `PageRef` | `{kind:"manifest",manifestId:Sha,sha256:Sha,bytes:Count,entries:Count}`; manifestId equals the canonical manifest hash; no arbitrary file access |
| `FaultRef` | `{code:Text(100),evidence:PageRef|null}`; evidence holds sanitized details and affected exact identities |
| `CapabilitiesCeiling` | `{skills:null|Id[0..32],tools:null|Id[0..16]}`; null inherits admitted selection ceiling, empty explicitly allows none; entries unique and declared |
| `NarrowPermissions` | null, or the existing permissions shape `{sandbox:"read-only"|"workspace-write",networkAccess:false,approvalPolicy:"never"}`; only a provable narrowing of captured authority |
| `Schema` | current `compileSchema` object-root subset; full limits below; no `$ref`, regex, format or executable values |

Providers use existing `RunRef`/`WorkerRef` records exactly when linking checkpoints; no versionless conversion of stored captures or snapshots. Source/hash identity is never a signature of a model's claim or semantic acceptance.

For every new domain/journal `policyHash`, use `H(C({accessPolicyHash,capturePolicyHash,artifactScopeHash}))`: accessPolicyHash is the verified saved access-policy fingerprint, capturePolicyHash is the saved capture-policy hash or explicit null for original version-1 inclusion, and artifactScopeHash is the frozen artifact-scope hash or null for composition-only runs. Missing access identity rejects new feature admission. Do not overwrite existing providers' raw capture-policy hashes with this composite value; adapters verify each raw hash separately before constructing domain proofs. `catalogHash` in domain/journal/ref records is the immutable native capability catalog fingerprint. Workflow source catalog descriptors explicitly carry their separate source-catalog hash. New proof normalization does not reinterpret a legacy capture or retrofit a descriptorless saved runtime.

## Public declaration and call

The first statement remains literal `export const meta = ...`. Add one optional field `workflows: WorkflowDeclaration[0..32]`; omission means `[]`. Existing metadata remains as accepted today. Each declaration is exactly:

```text
WorkflowDeclaration = {
  alias: Id,
  source: {kind:"registry",name:Text(110)} | {kind:"script",path:Path},
  argsSchema: Schema,
  resultSchema: Schema,
  capabilities: CapabilitiesCeiling,
  permissions: NarrowPermissions
}
```

Registry names use the actual existing registry grammar/scopes (`project:`, `personal:`, `plugin:`), precedence, link and case/extension collision rules. Script declarations must name `.js` or `.mjs` files contained beneath the canonical root launch cwd. Absolute/dynamic paths and inline script text are refused. All declared sources, including unused aliases, resolve and validate before backend/root dispatch. Script resolution is anchored to root launch cwd, not a worker worktree or the child's directory. Opening a definition never installs tools or starts a run.

Every child must omit `meta.workflows` or set it to `[]`; nonempty children reject the whole new admission. Calling `workflow` or `refineArtifact` from depth 1 rejects even if metadata bypasses static detection. Self-reference, cycles, duplicate aliases, missing/linked/invalid UTF-8 source and unsupported schemas reject before inference. Depth is root 0, child 1; it is not inferred from source names.

Proposed `await workflow(alias, args)` requires exactly two arguments: a declared alias string and a plain JSON object satisfying argsSchema. It returns `{invocation:ChildRef,source:Sha,value:object,cached:boolean}`. `source` identifies the full retained source entry; `value` satisfies resultSchema. A completed zero-agent child has the same durable outcome shape. Failure throws a broker fault; `parallel` retains its existing null-slot behavior. A null slot is missing coverage, never an empty successful child. Calls do not accept raw paths/text, run/session settings, capability additions, concurrency, retries, or nested runtime requests. Required permissions/skills are validated at declaration and worker admission; null inheritance grants no extra authority. Each actual agent still selects its role skills/tools before startup.

Example after implementation (this script is proposed, not executable on 0.5.0):

```javascript
export const meta = {
  name: 'Reusable inspection', description: 'Call a retained child twice',
  workflows: [{
    alias: 'inspect', source: {kind: 'registry', name: 'project:inspect-one'},
    argsSchema: {type:'object',properties:{path:{type:'string',maxLength:1000}},
      required:['path'],additionalProperties:false},
    resultSchema: {type:'object',properties:{summary:{type:'string',maxLength:2000}},
      required:['summary'],additionalProperties:false},
    capabilities: {skills:[],tools:[]},
    permissions: {sandbox:'read-only',networkAccess:false,approvalPolicy:'never'}
  }]
};
const rows = await parallel(args.paths.map(path => () => workflow('inspect',{path})));
return {rows,missing:rows.map((row,index)=>row===null?index:null).filter(x=>x!==null)};
```

The saved `project:inspect-one` source has literal metadata, no child declarations, and calls `agent('Inspect '+args.path,{id:'reader',maxAttempts:1,skills:[],requireTools:[],permissions:{sandbox:'read-only',networkAccess:false,approvalPolicy:'never'}})`, returning `{summary}`. For a role needing skills, replace the explicit-none selection with IDs from the actual frozen role bundle. Workers discover with genuine executor `skills.list({authority:{kind:'executor'}})`, follow returned cursors, and `skills.read({package:entry.package,resource:entry.main_resource})`; compare returned skill_root to the admitted retained root. A copied SKILL body is never activation.

## Immutable sources and admission

Add `workflow-sources-v1/` inside private run storage, content-addressed regular single-link UTF-8 blobs and one catalog. No source links, imports, dependency installations or worker writes. SourceEntryV1 is exactly `{schemaVersion:1,alias:Id,declaration:WorkflowDeclaration,provenance:{kind:"registry",qualifiedName:Text(110),originalPath:Text(2000)}|{kind:"script",originalPath:Text(2000)},script:BlobRef,metaHash:Sha,argsSchemaHash:Sha,resultSchemaHash:Sha,sourceId:Sha}`. `sourceId=H(C(entry without sourceId))`; metaHash hashes parsed literal meta. Blob bytes include the metadata statement and original line endings. Catalog is `{schemaVersion:1,entries:SourceEntryV1[],catalogHash:Sha}`, sorted by alias, with catalogHash hashing the record without itself. It is bounded to 32 entries and 32 MiB of source blobs; catalog metadata to 4 MiB. These are private file bounds, never broker allowances. Header holds only `{schemaVersion:1,catalog:BlobRef,catalogHash:Sha}`.

Admission reads bounded handles with ancestor/link checks, verifies after reading, parses, validates declaration schemas and child depth, and stages blobs outside source. Sync immutable files, atomically publish catalog, then commit its descriptor with the run binding before admission opens. A partial staging failure has no execution authority; retained incomplete staging is inspectable, not automatically reused. Before root evaluation verify retained catalog/source hashes again. Current capability-source retention remains separate; both identities bind invocation keys.

Ordinary resume loads the saved catalog only; deletion or modification of a registry definition/cache cannot change that run's source. Retained source disappearance/corruption refuses before generation mutation. Updating the registry affects new runs only. An explicitly supplied edited root on resume may add/remove aliases, but an existing alias/source locator or declaration contract cannot silently reread or reinterpret its current definition. Proposed source replacement is an explicit coordinator revision: public `resume --workflow-revisions-file FILE` accepts `{schemaVersion:1,expectedGeneration:positive integer,expectedCatalogHash:Sha,reconciliation:Text(2000),replacements:[{alias:Id,expectedSourceId:Sha,source:{kind:"registry",name:Text(110)}|{kind:"script",path:Path}}]}` (1..32 unique aliases, at most 65,536 bytes). Resolve these exact sources once, retain a new catalog revision, and preview the full affected invocation/worker suffix. The effective declaration's source must equal its replacement locator; a supplied edited root must agree. No revision admission with active/unknown unreconciled effects. The input file is captured once, not reread on replay. Without this explicit revision, changed locators/declaration identities reject with `COMPOSITION_REVISION_REQUIRED`; a new run is also available. No old source entry is overwritten.

## Processes, scheduling and resource ceilings

Root controller owns all children and agents. A child is a fork of the evaluator under the same scrubbed environment and CPU/memory safeguards, never a call to `runWorkflow`, `startBackground`, CLI `run`, or another App Server supervisor. Source strings cross only the bounded evaluator start envelope. Broker method allowlist expands to workflow/refineArtifact; agent params add the verified inputSnapshot/reviewPacket options. The separately owner-requested literal meta.steps/agent stepId contract is frozen in plan4.6 and uses the same scoped identities. None of these accept executable callbacks or grant guest filesystem access.

Keep the existing native-worker permit pool unchanged, bounded by root concurrency. Add a separate FIFO child-evaluator lifetime pool with the same bound. Root evaluation is outside the child pool. Reserve a child slot before fork and retain it until the child process has exited and its invocation has settled. Every live child counts, including one waiting on an agent, broker reply or other promise. There can never be more than concurrency child evaluator processes, rather than up to 1,000 suspended heaps. A child waiting for an agent holds no native-worker permit; each actual agent acquires/releases the existing worker permit normally. Queued child requests have durable intents but no process. At concurrency 1 a child occupies the one child slot while its agent uses the one independent worker slot; depth-1 children cannot request further children, so this introduces no nested-pool deadlock.

Retain the current bounded QuickJS pump and JSON-only call/reply protocol; introduce no yield/resume-ack CPU-permit protocol or combined child/native queue. Validate method/id/size/depth and process exit before final child settlement. Pending broker work suspends the existing idle watchdog; a child with no broker work retains the 5-second no-progress guard and 1-second CPU slices. Pool waiting occurs before process creation, cannot trigger evaluator idle, and imposes no hidden worker or child wall deadline. Abort/Stop settles unstarted queued intents with explicit no-process facts; missing exit/drain evidence keeps the child slot unavailable and blocks dependent continuation.

Unchanged global ceilings: concurrency 1..256, default 2; 1,000 agent requests/physical positions per generation and 1,000 lifetime starts/structured attempts across replay/append/children; 10,000 total guest broker calls per generation across root and children and 4,096 pending across them. Each workflow/refineArtifact call counts once; internal helper child invocations count as workflow calls, and child agent/phase/log calls count too. Add a 1,000 child-invocation limit per generation, below the broker ceiling; no-agent children cannot evade it. No counter resets on a child or replay-created native attempt. Root admission ledger remains sole slot/attempt owner; overflow atomically refuses before dispatch. Explicit resource exhaustion is a separate stop outcome, not convergence or success.

Preserve 1 MiB messages/responses/final results; 2 MiB exact evaluator start `{kind:'start',body,args,cpuMs}`; 1 MiB scripts; 65,536 UTF-16-unit worker prompts; 32 MiB QuickJS heap, 512 KiB stack, 1-second CPU slices. Scope/depth/admission context is controller-owned, not a new guest scheduling protocol or bulk catalog in the start envelope. Recompute exact envelopes, never subtract guessed overhead. Schema caps remain 32,768 bytes, 512 nodes, depth 16, 100 properties/required names, 16 branches, 128 entries per enum/256 total, object root. Compile validation work remains `cost=nodes+enumEntries+literalBytes`, max result `min(1MiB,floor(8MiB/cost))`; prompts/results must fit this tighter computed bound. File-backed manifests are not larger worker answers. No worker wall deadline by default; current explicit timeout/null and independent startup/command/drain/run limits retain their meaning.

## Identity, journal and replay

Each scope has ordered local broker call numbers. Root scope is `root`; child IDs are deterministic `c_<rootWorkflowOrdinal>` (safe integer ordinal, at most 1000), not alias names. Logical worker identity is `{scopeId:"root"|Id,localId:Id|null,localOrdinal:Count}`. Persist `origin:{kind:"child",invocationId:Id,ordinal:Count}` for child workers; existing guest and append origins remain distinct. Physical position comes only from global `allocateSlot`; never concatenate into the existing 100-character local ID. Duplicate local IDs in one scope reject. Same local ID in different children is valid. `dependsOn` names earlier workers in the same scope only; cross-child causality is parent awaiting results or explicit helper transitions, not fabricated worker prerequisites or phase ordering.

Introduce versioned root invocation journal in run.sqlite, retaining the existing workers table. Exact table keys: `invocations(generation,seq,value,record_hash)` primary key `(generation,seq)`; `invocation_links(generation,scope_id,local_call,seq)` primary key `(generation,scope_id,local_call)`; `source_revisions(revision,catalog_hash,value)`; `domain_controls(request_id,request_hash,value)`. Each invocation value is exactly `{schemaVersion:1,seq:positive safe integer,parentSeq:positive integer|null,scopeId:Id|"root",localCall:Count,kind:"agent"|"workflow"|"refineArtifact",key:Sha,previousKey:Sha,status:"intent"|"running"|"completed"|"failed"|"unknown"|"cancelled",sourceId:Sha|null,argsHash:Sha,policyHash:Sha,catalogHash:Sha,capabilitiesHash:Sha|null,workerPosition:integer 0..999|null,child:ChildRef|null,result:BlobRef|null,resultHash:Sha|null,error:FaultRef|null,reusedFrom:{generation:positive integer,seq:positive integer}|null}`. Shape invariants enforce kind-specific bindings: agent has workerPosition and no child/sourceId; workflow has child and sourceId and no position; refineArtifact has neither and links its children. Agent argsHash hashes full effective prompt/options/input identity. Completed requires result and resultHash, failed/unknown require error, intent/running cannot claim result. Record hash is H(C(value)); lineage pointers validate before reuse. Phase/log remain journaled events, consume broker quota, but remain cosmetic for replay.

Controller serializes arrival/intents to assign monotonic `seq` in BEGIN IMMEDIATE. Child terminal does not consume a second invocation seq; its append-only terminal evidence goes to a separately sequenced event and updates the invocation atomically. ParentSeq links nesting, including helper-to-child causal links; child evaluation depth is still 1. A call key hashes `{previousKey,kind,sourceId,argsHash,policyHash,catalogHash,capabilitiesHash,effectiveSettings,inputSnapshotHash}` with explicit null for inapplicable fields. `catalogHash` here is the admitted native capability catalog, not the whole workflow source catalog: unrelated alias replacement must not invalidate earlier unrelated calls. Workflow keys additionally hash the selected declaration/source entry, parent scope and local call. The entire source catalog is independently integrity checked before evaluation.

Replay compares the global arrival-order invocation prefix and its parent/local-call links. Replaying a completed child must traverse/validate its retained nested invocation slice and worker results before returning its cached outcome; no new child process or native turn is necessary. A completed zero-agent child still has an invocation key and result. The first changed, failed, missing or non-reusable invocation invalidates that invocation and the complete later global suffix, including completed child containers, their workers, append-linked dependencies, derived artifacts and refinement decisions. Returning a cached parent cannot skip validating a changed child. Source replacement computes the earliest prior workflow invocation of each changed alias, even when that invocation had no agents; it invalidates from the minimum seq. A declaration unused in prior history affects only subsequent calls.

Persist/replay order is controller-observed order, not wall-clock completion or graph layout. Cached workers retain source generation/position, attempts and usage. New native turns consume remaining lifetime reservations. Missing/corrupt links, source/result blobs, unexpected child prefixes, incomplete parents or unknown outcomes fail closed; never synthesize a success from workers.length. Runtime identity includes all new providers, evaluator protocol, schemas and lockfile. Old retained runtimes keep their old API and refuse new features; no hotpatch/migration of saved runtime identity.

For interleaved parallel children, invalidation also closes over ancestors: a completed parent cannot remain reusable when any required descendant lies in the invalidated global suffix. Compute this closure before returning cached parents, retain its exact affected parent/worker references in revision preview, and validate nested records even when their sequence numbers interleave other siblings. Replaying a cached child may mark its verified nested calls covered; it must not skip an unmatched earlier sibling call in the global prefix. A deterministic process/persistence fixture must exercise this interleaving and reject stale parent reuse after a sibling source revision.

Atomicity boundaries: invocation intent + global slot/reservation + admission revision commit before a native start; completed result hash + worker capture/drain facts + invocation terminal event commit together before replying. File artifacts are written/synced/verified first; the SQL transaction publishes immutable refs only. A crash after intent but before confirmed start is unresolved unless independently proven no process began. A crash after completion commit but before reply is recoverable by the same invocation identity without redoing effects. Orphan files are not accepted records. Controller ownership lease, optimistic revisions and old generation checks remain mandatory.

## Controls, failure and recovery

Pause/Stop close root admission in the same transaction as their receipt, covering root calls, child starts, child agent turns, append and refinement transitions. Pause preserves already accepted work and drains without an arbitrary worker deadline; Stop interrupts active native/evaluator work and uses existing bounded owned cleanup. No later round/child may slip through after closure. Child cancellation targets exact ChildRef and expected child revision; it closes that subtree before acknowledgement and cancels/drains its agents. It does not cancel unrelated siblings. Cancellation is execution outcome, not review failure or convergence. Cleanup must positively report owned server exit, jobEmpty, ownershipScope `windows-job-members`, and native terminal inventoryEmpty with no cleanup error; descendants outside the job and external effects remain notVerified.

All new controls use the idempotent domain-control envelope defined in the refinement spec, with action `cancel-child` and payload `{child:ChildRef,expectedRevision:Count}`. Receipt loss leaves a durable pending/applying outcome to read by requestId, not permission to submit a new request. Target/generation/session/revision mismatch is a conflict; an identical request returns its original receipt even after state advances. Existing non-idempotent legacy controls are not silently reclassified. The integration owner upgrades common Pause/Stop to accept optional preallocated requestId through the same new ledger when the new protocol is negotiated.

Error taxonomy: `COMPOSITION_INPUT` (shape/alias/args), `COMPOSITION_SOURCE` (read/UTF-8/path), `COMPOSITION_DEPTH`, `COMPOSITION_SCHEMA`, `COMPOSITION_LIMIT`, `COMPOSITION_CORRUPT`, `COMPOSITION_REVISION_REQUIRED`, `COMPOSITION_REPLAY_CHANGED`, `COMPOSITION_UNKNOWN`, `COMPOSITION_UNSUPPORTED`. Each diagnostic preserves missing stage and affected refs. Invalid admission is before root dispatch; a child failing after agent execution retains actual effects and drain evidence. A process that launched and exited nonzero is executed. `notStarted`/`noProcessStarted` require positive backend evidence, never an inferred error label.

Ordinary replay cannot clear unknown work. Coordinator reviews original outcome, every affected suffix worker/capture and owned/native drain, reconciles external effects, and explicitly admits replacement/restart only for safe unfinished scope. Source/capability package loss and native catalog drift preserve the old bindings and outcomes; recover through a fresh verified source/bundle and admitted remaining work, reviewed integration, frozen combined source and fresh checks. Never copy a skill body or rewrite a catalog to make replay succeed. Historical unknowns remain inspectable even after properly admitted recovery; they do not forbid unrelated independent work. A source revision is not reconciliation by itself.

## Provider contracts and ownership seam

All functions below are proposed Promise-returning ESM exports unless marked synchronous. Provider input objects are exact. `RootContext` is a controller-created, unexported host object holding the owned db/lease, resolved RunRef, generation/session, immutable authority/capability descriptors and abort signal; it is never accepted from guest JSON or public caller fields. Providers receive it only after managed-run/session resolution. They cannot launch a second runtime. All functions throw a typed fault, never return a successful partial record on corruption.

| Owner/path | Exact proposed export contract |
| --- | --- |
| Core, `engine/composition.mjs` | `freezeWorkflowSources({runDir,cwd,declarations,previousCatalog:null|BlobRef,revisions:null|SourceRevisionRequest}):Promise<WorkflowSourceDescriptor>`; immutable source preflight/retention only, no backend creation |
| Core, `engine/composition.mjs` | `verifyWorkflowSources({runDir,descriptor:WorkflowSourceDescriptor}):Promise<WorkflowSourceCatalog>`; reads only retained bytes |
| Core, `engine/composition-store.mjs` | `validateInvocationHistory({context:RootContext}):Promise<{count:Count,lastKey:Sha|null}>`; validates complete bounded history; `readChild({context,child:ChildRef}):Promise<ChildState>`; `listChildren({context,after:Id|null,limit:integer 1..100}):Promise<Page<ChildState>>` |
| Core, controller adapter | `invokeChild({context,alias:Id,args:object,parentSeq:positive integer|null,origin:{kind:"guest"}|{kind:"refinement",refinementId:Id,round:positive integer,stage:"produce"|"export"|"review"|"critic"}}):Promise<WorkflowOutcome>`; only this adapter schedules children and commits journal/agent intents |
| Core, controller adapter | `resolveChildWorker({context,child:ChildRef,localId:Id}):Promise<{worker:WorkerRef,record:object}>`; returns authoritative complete worker record including result, input/capture and cleanup, resolving reused source coordinates |
| Core, `engine/controls.mjs` | `requestDomainControl({dataDir,run:RunRef,sessionId,request:DomainControlRequest}):Promise<DomainControlReceipt>` and `readDomainControl({dataDir,run:RunRef,sessionId,requestId:Uuid}):Promise<DomainControlReceipt>`; same atomic ledger used by refinement |

`WorkflowSourceDescriptor` is the exact header descriptor above; `WorkflowSourceCatalog` is the catalog above; `WorkflowOutcome` is the public call result. `ChildState` is `{child:ChildRef,alias:Id,sourceId:Sha,revision:Count,execution:"queued"|"running"|"waiting"|"completed"|"failed"|"unknown"|"cancelled",invocationSeq:positive integer,workerPositions:integer[0..1000],result:BlobRef|null,error:FaultRef|null,reusedFrom:ChildRef|null}`. Each worker position is unique and 0..999. Page is `{items:T[],nextCursor:Id|null,hasMore:boolean}` bounded by count and complete 1 MiB response. Cursor binds run/generation and cannot skip records; single records must fit or fail with a limit fault. Child lists use invocation order; verify history outside the returned page as well. The refinement provider receives these three controller services through a fixed adapter, not imports into the controller's private closures.

## Dashboard and acceptance

Extend existing map and inspector: collapsible child groups show alias, source identity, execution state and child-local phase; workers retain global target positions. Draw containment separately from true causal/dependency links. Phases group only. Helper/round links come from journal origin, not label parsing. Clicking a failed/unknown group opens exact retained error, worker and cleanup evidence in one action. Child completion does not imply accepted artifact delivery. Show discovered counts and resource exhaustion without a false fixed-total percentage.

Use existing bearer-authenticated dashboard services and run binding; new routes are local workflow routes, never invented native endpoints. Read-only data refresh must preserve selected run/group/worker, focus, scroll, disclosure state, inspector width and theme. Existing light blue navigation remains. Omit redundant default Visible disposition text in run-picker rows; preserve Hidden, Archived, unavailable and accessible identity/status. Do not add persistent header summaries for child/round controls; use inspector and worker menus.

Acceptance requires independent review of source/schema/ownership, meaningful failing process/persistence tests, native candidate runs with one supervisor and the two bounded pools, concurrency 1 deadlock control, suspended-child lifetime bounds, no-agent child source invalidation, exact replay and crash/unknown negatives, then full gates in the coordinated plan. This document records no test execution, native qualification or release approval.
