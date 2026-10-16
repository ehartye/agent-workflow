# Artifact edit, export and blind-review refinement

Status: proposed implementation contract, 2026-10-16. All APIs, schemas and domain states introduced here are proposed, not callable in 0.5.0. Read with [child composition](2026-10-16-workflow-composition-design.md), whose exact primitive/ref types, JSON rejection rules, authority and broker/schema budgets apply, and the [coordinated implementation plan](../plans/2026-10-16-composition-refinement-implementation.md).

## Outcome, baseline and architecture

Provide reusable editing, exporting, independent review and iteration within one root run. The root owns iteration, resource accounting, domain acceptance and controls; producer and reviewer workflows are depth-1 siblings. Proposed `refineArtifact(config)` is a trusted root controller state machine driven by validated declarative JSON. It is not a child workflow, does not evaluate guest JavaScript in the host, and consumes no composition depth or extra native-worker slot. Calling it in a child rejects. Generic fixed/bounded JavaScript loops over `agent`, `workflow` or single-round `refineArtifact` calls remain valid.

The author inspected 0.5.0 source/contracts listed in the composition spec, including `workspaces.mjs` capture/blob/tree/diff checks, `workspace-run.mjs` baseline reuse, controller drain and replay, numeric-mode `command-jobs/snapshot.mjs`, strict checkpoints/acceptance and the existing map/inspector. Current writers receive original captured inputs; dependencies do not transfer bytes. Current recipe `loop-until-dry` is not this feature, and a worker's changed/passed Boolean is not an asset acceptance receipt. Current tool observation reports skills/code-mode facts and explicitly treats media/unsupported output as unknown. Native image-read qualification must be added and independently proved; none is claimed here. Historical Beeps nonrendering acceptance and the sprite export EACCES failure cannot qualify these new loops.

The coordinator's source/version/runtime snapshot is normative design input as recorded in the composition spec. Subscription authentication, native role skills, captured parent/restricted policy, saved runtime and catalog identities stay unchanged. Organizational worktrees under inherited parent authority do not establish filesystem security isolation. Whole-application integration, publication and shipment remain coordinator-owned even after a domain candidate passes.

## Approaches and chosen design

1. Let one long-lived agent edit, export, score itself and decide when to stop.
   - **Time:** quickest prototype; later review cannot recover an independent baseline from its conversation.
   - **Risk:** high likelihood of self-confirmation or wrong-candidate review; severe false acceptance.
   - **Complexity:** simple script, implicit provenance and stop rules.
   - **Best practice:** inadequate separation of production and independent acceptance.
   - **Maintainability:** prompts carry hidden state and recipes diverge.
2. Run the loop inside a reusable child that launches producer/reviewer children.
   - **Time:** attractive reuse initially; nested scheduling/recovery adds substantial lag.
   - **Risk:** violates initial depth 1 and can deadlock nested pools.
   - **Complexity:** grandchildren and recursively owned control state.
   - **Best practice:** conflicts with the admitted composition boundary.
   - **Maintainability:** helper reuse would force deeper nesting throughout the engine.
3. **Chosen: root helper, sibling children, immutable derived inputs and evidence-bound acceptance.**
   - **Time:** provenance/ledger work now; reusable producer/review stages later.
   - **Risk:** transfer, identity and control races remain critical and have explicit rejection/crash tests.
   - **Complexity:** typed manifests and one root state machine; two independently bounded existing-worker/child-lifetime pools.
   - **Best practice:** separates safe byte handoff, independent quality judgment and whole-delivery acceptance.
   - **Maintainability:** one domain protocol works for sprites, models and other project/export artifacts.

## Exact public request

All record fields below are required; the only public omission allowed is the agent options extension described later. `Id`, `Sha`, `Path`, `OwnedPath`, `RunRef`, `WorkerRef`, `ChildRef`, `BlobRef`, `PageRef`, `FaultRef` and `Count` use the composition spec. All arrays are unique unless stated; order is preserved where meaningful. Object/array/schema/byte/path checks happen before admission, not in a model prompt.

```text
RefineRequestV1 = {
  schemaVersion:1, id:Id,
  baseline:{kind:"captured"}|InputRef,
  ownedSourcePaths:OwnedPath[1..256],
  ownedExportPaths:OwnedPath[1..256],
  rubric:{path:Path,sha256:Sha,bytes:integer 1..1048576},
  producer:{alias:Id,workerId:Id,args:object},
  exporter:null|{alias:Id,workerId:Id,args:object,handoff:"verified-derived-input"},
  reviewers:ReviewerRole[1..16],
  critic:{alias:Id,workerId:Id},
  blinding:"packet-context"|"proved-read-isolation",
  policy:LoopPolicy,
  reuseReviews:"never"|"exact-failed-round",
  toolRequirements:Id[0..16]
}
ReviewerRole = {id:Id,alias:Id,workerId:Id,criterionIds:Id[1..64]}
LoopPolicy = {
  mode:"exactlyN",rounds:integer 1..1000,
  maxRounds:null|integer 1..1000,
  noProgressRounds:null|integer 1..1000
} | {
  mode:"untilPass",rounds:null,
  maxRounds:null|integer 1..1000,
  noProgressRounds:null|integer 1..1000
}
InputRef = {
  kind:"input-snapshot",run:RunRef,id:Sha,manifest:PageRef,
  baselineId:Sha,policyHash:Sha,catalogHash:Sha
}
CandidateRef = {kind:"candidate",run:RunRef,id:Sha,manifest:PageRef}
PacketRef = {kind:"review-packet",run:RunRef,id:Sha,manifest:PageRef}
RubricRef = {kind:"rubric",run:RunRef,id:Sha,manifest:PageRef}
ReviewRef = {kind:"review",run:RunRef,id:Sha,manifest:PageRef}
```

Config has a complete compact serialized bound of 65,536 bytes, plus unchanged broker/start/schema bounds. Role args individually are at most 16,384 bytes and satisfy their retained workflow declaration's argsSchema after engine fields are added. Config cannot embed script source, rubric text, provider functions, commands, credentials or executable paths. Required tools must be declared in the admitted bundle and available for the producing role; toolRequirements does not grant them. `id` is unique among root helper requests. An identical logical invocation can replay; another call with the same id and different key rejects.

Artifact ownership has an immutable admission ceiling, rather than being self-authorized by a child result. Proposed new-run `--artifact-scope-file FILE` reads once a regular single-link UTF-8 JSON file `{schemaVersion:1,ownedPaths:OwnedPath[1..256]}` (at most 65,536 bytes), validates it against the actual authorized writable launch cwd, and persists `{scope,scopeHash:H(C(scope))}` in launch state before execution. The coordinator authors it from the owner's exact approved artifact scope. It is a session-bound coordinator authorization assertion, not cryptographic proof of owner intent. Composition-only runs may omit it; refinement without it rejects. Resume/restart retain it and refuse replacement; changing scope requires a new admitted run. Source/export ownership together must fit this ceiling; neither child args nor live controls can widen it. RootContext supplies these verified authorityOwnedPaths to providers. Raw workflow child writes still follow their original task/authority contract.

Source/export ownership must be disjoint, including directory-prefix and case aliases, and contained in the coordinator-authorized writable scope. No `.git`, retained store, original source checkout or external destination is admitted. Child declaration permissions/capability ceilings cannot exceed the root. Producers/exporters must be designated isolated writers; reviewer/critic designated workers must use read-only roles and fresh native threads. All configured reviewers are required; duplicate reviewer IDs, zero assignments, unknown criteria, missing required criterion coverage, producer/reviewer worker identity overlap or ambiguous designated local workers reject. Every required criterion has at least one assigned required reviewer; each reviewer must answer exactly its assigned IDs. No silent N/default max/no-progress policy: absence rejects. ExactlyN with maxRounds below rounds rejects; null disables that domain bound, not root resource backstops. A configured no-progress limit can explicitly end exactlyN early, reported as an unmet round target.

Reviewer ID `critic` is reserved. The helper constructs the critic's internal ReviewerRole with id `critic`, configured critic alias/workerId and all rubric criterion IDs in sorted order when creating its packet. It does not require callers to invent another role record or relax createReviewPacket's signature.

`baseline:{kind:"captured"}` resolves the root's original immutable writer input capture (created and persisted before first producer admission), never recollects an existing capture. A supplied InputRef must resolve to an earlier committed same-run input snapshot with identical baseline/policy/catalog authority; caller hashes alone do not authenticate it. Policy/catalog mismatch, a foreign run, missing provider, unsupported schema version or retained runtime without these APIs refuses. Freeze request, rubric and all selected workflow source/declaration identities before the first round. Rubric path is read from the verified baseline captured blobs, not live cwd. Freeze all bytes; root args may contain paths/hashes but no bulk manifests.

## Frozen rubric and review obligations

The captured rubric file contains exactly:

```text
RubricV1 = {
  schemaVersion:1,id:Id,title:Text(500),
  criteria:Criterion[1..64],
  context:Text(8000),references:RubricAsset[0..64]
}
Criterion = {
  id:Id,required:boolean,description:Text(2000),
  evidence:"visual"|"file"|"visual-and-file",
  requiredExportPaths:Path[0..256],
  passRule:Text(2000)
}
RubricAsset = {path:Path,sha256:Sha,bytes:Count,mediaType:Text(100)}
```

Criterion IDs unique; at least one criterion is required. Context, passRule and references are neutral target criteria, never producer history, prior verdicts, expected numeric scores or instructions to agree. RequiredExportPaths are literal export names; visual criteria require at least one image path. Reference assets must exist in captured baseline and match bytes. RubricRef.id hashes the canonical rubric plus exact reference-file identities, not a title alone. Required review coverage is the frozen Cartesian set of (configured reviewer, assigned criterion); optional criteria never substitute for required ones. Rubric changes require a new helper identity and fresh review, not a limit control.

Review aggregation is conservative: criterion pass requires every assigned reviewer to have a verified pass with sufficient evidence and the completeness critic to confirm completeness. Any verified fail is retained and yields fail; contradictory pass/fail yields fail with original dissent. Missing/null/invalid/unverified rows or image-read evidence yield unverified, never pass. A model vote/average or lone true flag cannot accept an asset. Completeness and quality remain separate: the critic checks missing IDs/assets/evidence and dissent preservation; it cannot overrule a fail or create missing evidence.

## Root helper and child contracts

`await refineArtifact(request)` returns `RefineResultV1` below. Trusted helper code calls the existing composition adapter; it never runs dynamic callbacks. Each round uses a new producer child invocation. The default producer's single designated isolated worker edits **and exports** into its own worktree and writes a small captured claim manifest. Other producer tasks may be read-only scouts. Any extra writer in that child outside the designated producer rejects the round, even if its result sounds useful. Each native worker still activates selected skills itself through real executor list/read; the helper does not inject bodies.

The engine adds exact fields to producer child args: `{input:InputRef,round:positive integer,claimPath:Path,feedback:null|PageRef,ownedSourcePaths:OwnedPath[],ownedExportPaths:OwnedPath[],roleArgs:object}`. The first round's feedback is null; later feedback is the complete retained dissent/criteria remediation projection, with evidence refs. It never becomes another reviewer's packet. Producer source must accept exactly this args shape and return exactly `{producerWorkerId:Id,claim:{relativePath:Path,sha256:Sha,bytes:Count}}`. The configured workerId must match and resolve through authoritative child-worker records. Result JSON is a claim locator, not a trusted capture or supplied WorkerRef. Root resolves actual run/generation/global position/cumulative attempt and native thread.

Claim files have one exact administrative exception to export enumeration, avoiding a self-hash cycle. Require at least one ownedExportPaths directory prefix. Under its lexically first prefix the helper reserves `.workflow-claims/<id>/r<round>/producer.json` and, if used, `exporter.json`, passes the exact claimPath, verifies it was absent from input, and requires the returned locator to equal it. Path length still must fit Path; collisions/preexistence reject before production. Only these host-derived claim paths may be omitted from the source/export content projection; they remain in the complete authoritative capture and provenance. They never enter a reviewer packet or derived next input. No arbitrary caller-named file can use that exception. Other validationPaths must also be present in exportEntries as actual file-evidence exports; they cannot hide changed files. Packet selection includes only the exports required for the assigned criteria and neutral references, not unassigned tool logs.

For the default combined producer, captured `CandidateClaimV1` is `{schemaVersion:1,sourcePaths:Path[],exportEntries:ExportClaim[],exporter:ExporterClaim,validationPaths:Path[]}`. Max 20,000 combined source/export/validation entries and 32 MiB manifest; every included file is still within the global writer budget. ExportClaim is `{path:Path,mediaType:Text(100),criterionIds:Id[0..64]}`; ExporterClaim is `{toolId:Id,executableSha256:Sha,runtimeSha256:Sha,configSha256:Sha}`. Claim paths must be in the actual capture and the corresponding literal owned scope; sourcePaths must describe the complete remaining owned source tree, not just favorable changes. validationPaths are owned captured tool-output records; their contents are reports until independently resolved. MIME claims must match supported actual decoding and extension; initial visual decoder allows PNG/JPEG/WebP images, UTF-8 text/JSON for file evidence, and opaque binary source files. Unsupported formats need actual verified image exports; no visual pass from an unrendered GLB, sprite project or WAV.

If exporter is non-null, the producer contract instead returns the same claim locator with `exportEntries:[]`, `validationPaths:[]` and `exporter:null`; the claim schema is selected by this exact host mode. Root seals the drained producer project and derives a new verified input for the sibling exporter child. Exporter receives `{input:InputRef,round:positive integer,claimPath:Path,sourceCandidate:CandidateRef,ownedExportPaths:OwnedPath[],roleArgs:object}` and returns the same locator/workerId shape. Its claim has `sourcePaths:[]`, nonempty exportEntries and non-null ExporterClaim. Verify all source bytes unchanged across export; only owned exports/declared validation records and its exact administrative claim may change. This explicit verified handoff is mandatory. Dependency IDs, copying live writer trees or a prompt saying “use the previous export” cannot supply it. Exporting in a second task in the same child without this boundary is unsupported initially.

Reviewer child args are exactly `{packet:PacketRef,reviewerId:Id,nonce:Uuid}`. The root generates/stores nonce before dispatch; guest clock/random remains unavailable. It returns the small object-root `ReviewAnswerV1` directly, below. Root persists the bounded answer as immutable review evidence; reviewers have no output writer capture. Critic child likewise returns `CriticAnswerV1` directly. Each review child contains exactly one designated native agent with maxAttempts:1; schema-invalid answers do not spawn corrections that could import context. The producer may use configured existing bounded attempts, all globally accounted.

The reviewer/critic child schemas are generated from the frozen IDs within the existing compiled-schema work budget. If 64 criteria or long explanation text cannot fit the computed result bound, split reviewers into explicit disjoint criterion roles before admission; do not inflate caps or allow a truncated answer. Preflight the worst required answer skeleton and configured reason/evidence maxima, and reject a configuration whose minimum complete answer cannot fit. Each root child return remains within its own resultSchema and 1 MiB broker envelope.

## Immutable project/export manifests and derived inputs

Root providers resolve records themselves; no guest-supplied capture identity, cleanup Booleans or arbitrary path can become authoritative evidence. Existing capture file modes are strings `'100644'|'100755'`. FrozenSnapshotV1 uses numbers `100644|100755`; conversion is the explicit two-entry mapping only. Reject `'0644'`, stat bitmasks, other numbers/strings and coercions. Neither representation changes the current snapshot schema.

New domain manifests are immutable file-backed canonical JSON, each at most 32 MiB metadata and 20,000 file/operation entries; per-file/aggregate included bytes remain 512 MiB and each patch remains 512 MiB. PageRefs never inline detailed manifests into prompts/results. Their bytes and entries are exact; page reads obey the complete 1 MiB response bound, count 1..100 and a run/manifest/cursor-bound continuation. Oversized single records reject before commit. Keep existing 32 MiB preview and 16 MiB excluded inventory/100,000 traversal/excluded-entry budgets; no extra room from exclusions or the 2 MiB start envelope.

```text
CapturedFile = {path:Path,sha256:Sha,bytes:Count,mode:"100644"|"100755",blob:BlobRef}
Change = {
  path:Path,operation:"add"|"replace"|"delete",
  before:null|{sha256:Sha,bytes:Count,mode:"100644"|"100755"},
  after:null|CapturedFile
}
CaptureProof = {
  worker:WorkerRef,input:InputRef,captureId:Sha,
  manifest:BlobRef,inputTree:Text(64),outputTree:Text(64),
  inputPatch:BlobRef,basePatch:BlobRef,cleanup:BlobRef,
  policyHash:Sha,catalogHash:Sha
}
ProjectManifestV1 = {
  schemaVersion:1,baseline:InputRef,parent:InputRef,
  producer:WorkerRef,capture:CaptureProof,ownedPaths:OwnedPath[],
  files:CapturedFile[],changes:Change[],contentHash:Sha
}
ExportFile = {file:CapturedFile,mediaType:Text(100),criterionIds:Id[]}
ExportManifestV1 = {
  schemaVersion:1,projectHash:Sha,exporter:WorkerRef,
  capture:CaptureProof,exporterIdentity:ExporterClaim,
  files:ExportFile[],validation:BlobRef[],contentHash:Sha
}
CandidateManifestV1 = {
  schemaVersion:1,refinementId:Id,round:positive integer,
  baselineId:Sha,parentInputId:Sha,project:PageRef,exports:PageRef|null,
  policyHash:Sha,catalogHash:Sha,sourceIds:Sha[],candidateHash:Sha
}
DerivedInputManifestV1 = {
  schemaVersion:1,baseline:InputRef,parent:InputRef,candidate:CandidateRef,
  ownedSourcePaths:OwnedPath[],ownedExportPaths:OwnedPath[],
  producerProofs:CaptureProof[1..2],files:CapturedFile[],
  deletedPaths:Path[],inputTree:Text(64),inputIndex:BlobRef,
  policyHash:Sha,catalogHash:Sha,contentHash:Sha,manifestHash:Sha
}
```

Files/changes/owned/deletion lists are sorted by literal path, unique case-insensitively, with component alias/prefix collisions refused. Git tree IDs are exactly 40 or 64 lowercase hex characters, not any Text(64). `contentHash` hashes canonical sorted content tuples (path,hash,bytes,mode), excluding storage location; Project additionally binds complete changes; Export binds projectHash, MIME/criterion mapping and exporter config identity. CandidateHash/manifestHash hash the full record without their own hash; all lineage and proof refs remain in those preimages. InputRef.id equals manifestHash; CandidateRef.id equals candidateHash. An original InputRef is a registered adapter over verified existing capture version 1/2 with id=H(C({kind:"captured-input-v1",originalDescriptor,policyHash,catalogHash})); its baselineId equals itself. Its manifest contains the unchanged capture descriptor plus complete file refs. Derived manifests never masquerade as legacy `inputs.json`; an explicit provider discriminator dispatches them.

Change invariants: add has before:null and non-null after; replace has both; delete has non-null before and after:null. Before matches exact parent input preimage, mode and absence; rename is a delete plus add, never implicit. The complete project files projection includes unchanged owned source files and exactly the authorized additions/replacements/deletions. Exports likewise include the complete current owned export set. Deleted output paths disappear from the derived snapshot; stale images cannot survive by omission. No deletion of original baseline outside owned scope. Nested Git/submodule, symlink, junction, hardlink, special file, ancestor alias, out-of-scope file or ambiguous path rejects. Candidate claim must cover every changed path of each designated capture, including generated exports/validation records; extra changes reject rather than disappear under ignore rules. Capture exclusions cannot hide tracked or protected owned outputs.

Derivation is a trusted deterministic byte operation: load/reverify original retained baseline; load the complete prior candidate project/export manifests and parent lineage; verify actual capture manifest/blobs/tree/patch hashes, actual producer references and positive owned/native drain; compare parent preimages; compute cumulative authorized overlay/deletions against the original baseline; write new content-addressed blobs/index/tree into a new owned derived directory; verify every output byte/mode and absence, then sync and atomically register the new InputRef. Never mutate original captures, recollect source, reuse a live worker cwd, copy a tree that may still be changing, follow a filesystem link, or execute workflow text/patch hooks. All file operations resolve inside owned run storage/new writer destinations. Atomic file publication precedes SQL pointer publication; incomplete directories have no accepted identity and remain inspectable after failure.

`agent` gains optional `inputSnapshot:InputRef`. Omission retains existing baseline behavior. Supplying one requires a verified same-run registered input, `workspace:'isolated'`, and no reviewPacket. `runWorkspaces.prepare` loads the explicit input provider rather than `obtain()` recollection, creates a new independent worktree and invokes the same pre-dispatch byte/link/index checks. Read-only reviewer packet support is a different optional `reviewPacket:PacketRef`, mutually exclusive with inputSnapshot and writable/isolated options; backend sets cwd to an immutable read packet materialization. A worker's arbitrary JSON cannot register a snapshot or packet. Worker mutation APIs remain forbidden by the existing worker-role guards.

Positive handoff means source integrity, provenance, exact authorized scope and reconciled known effects; it is **not** human semantic approval. User-authorized exact scope may advance automatically round to round after those checks. Accepting a whole application, applying a patch to a coordinator checkout, installing tools or publishing is not an effect of derivation. Project-only candidates used for explicit export handoff have exports:null and cannot enter review/acceptance until a final export manifest is sealed.

## Packet blinding and independent evidence

```text
PacketManifestV1 = {
  schemaVersion:1,packetId:Sha,candidate:CandidateRef,
  exports:PageRef,rubric:RubricRef,reviewerId:Id,
  criterionIds:Id[],assets:PacketAsset[],
  blinding:"packet-context"|"proved-read-isolation",
  isolationProof:BlobRef|null,nonce:Uuid
}
PacketAsset = {neutralName:Path,source:BlobRef,sha256:Sha,bytes:Count,mediaType:Text(100)}
ReviewAnswerV1 = {
  schemaVersion:1,packetId:Sha,candidateId:Sha,exportHash:Sha,
  rubricId:Sha,reviewerId:Id,nonce:Uuid,
  criteria:CriterionAnswer[1..64]
}
CriterionAnswer = {
  criterionId:Id,outcome:"pass"|"fail"|"unverified",
  reason:Text(2000),observedAssetNames:Path[0..256]
}
CriticAnswerV1 = {
  schemaVersion:1,candidateId:Sha,exportHash:Sha,rubricId:Sha,
  nonce:Uuid,complete:boolean,missingCriterionIds:Id[0..64],
  missingAssetNames:Path[0..256],dissentPreserved:boolean,reason:Text(2000)
}
```

Packet contains exact exported assets and rubric/neutral reference assets, with sanitized neutral names assigned deterministically by sorted export order. No project source tree, producer conversation, prior verdict, previous round images, expected scores, filenames containing producer identity, arbitrary config args, or feedback enters reviewer args/prompts. Host holds candidate lineage privately. packetId hashes the record without itself; all candidate/export/rubric identities are bound in the manifest and answer, but prompts use opaque IDs. Materialize regular copies and verify hashes before/after review. The child script and designated reviewer prompt are part of the frozen role protocol and may only forward PacketRef, neutral rubric and activation/tool instructions. Inspector/report access for coordinator is unrestricted by the packet design.

A fresh reviewer means a new native thread/worker with no producer/correction/prior-review context. Independently resolve reviewer WorkerRef, threadId/turnIds, actual role selections and packet binding from controller records; never accept a model-authored WorkerRef. Distinct reviewer slots cannot reuse the producer or each other's native thread. The critic uses a fresh separate read-only worker and gets the neutral packet plus the complete current review matrix and original dissent, but no producer conversation/prior-round verdicts; its args are `{packet:PacketRef,reviews:ReviewRef[],nonce:Uuid}`. A critic can see current verdicts to check completeness; it is not counted as another blinded quality vote.

Blinding is **packet/context blinding** under inherited parent filesystem authority. It does not prevent a model from deliberately searching other accessible files. Record that boundary explicitly. For `proved-read-isolation`, admission requires a real supported read-policy boundary and retained proof tied to the packet materialization; current parent authority alone cannot prove it and must fail `REFINEMENT_ISOLATION_UNAVAILABLE` before review. Never silently downgrade the request or claim narrow prompts impose read isolation.

ReviewAnswer is a claim. Host must independently bind every observed asset to actual native read evidence and verified export bytes. New normalized `AssetObservationV1` is `{schemaVersion:1,worker:WorkerRef,threadId:Text(200),turnId:Text(200),callId:Text(200),packetId:Sha,asset:BlobRef,channel:"native-image"|"native-file",outcome:"observed"|"unknown",sourceEvent:BlobRef}`. It is created only by a pinned first-party event adapter from paired actual native call/output and exact packet asset mapping; caller/model fields cannot create it. Image evidence requires actual native image-bearing output tied to the asset, not version/hash/file presence, a shell message, skill read, a reviewer assertion, or a generic succeeded exec wrapper. Unsupported event/media forms, missing pairing, output loss/truncation, alternate path/bytes, wrong turn or unverified mapping yield unknown. Do not invent native endpoints or tool event variants. First inspect the pinned native source/schema, add only its observed supported event mapping, and require the native hidden-image-marker/foreign-image negative qualification in the plan. If that pinned version exposes no sufficient evidence, visual acceptance stays unverified and release of visual-pass claims is blocked; authoring/file-only work can continue.

`VerifiedReviewV1` is `{schemaVersion:1,candidate:CandidateRef,exports:PageRef,rubric:RubricRef,packet:PacketRef,reviewer:WorkerRef,threadId:Text(200),answer:BlobRef,observations:PageRef,criteria:[{criterionId:Id,outcome:"pass"|"fail"|"unverified",reason:Text(2000),evidenceIds:Sha[]}],complete:boolean,reusedFrom:ReviewRef|null}`. Root computes outcomes/completeness from answer schema, exact IDs, asset coverage, observations, capture integrity and actual worker success/drain. Provider answer inputs must equal the resolved full authoritative child/worker result, not a preview or replacement object; verify critic inputs the same way. Original answer and dissent remain immutable. Missing evidence produces unverified even when answer says pass. Credible fail without complete evidence is retained but the round remains unverified until all required coverage is established. No semantic acceptance from syntactic answer validity alone.

## Round state machine, progress and acceptance

Domain ledger stores config, inputs, candidates, packets, reviews and controls with exact refs, not huge embedded blobs. State transitions are trusted deterministic provider code; guest JavaScript is confined to QuickJS children. Per-round states are `reserved → producing → sourceSealed → exporting? → candidateSealed → reviewing → critic → finalReview? → finalCritic? → completed`. Error branches are `failed`, `unknown`, `cancelled`, `unverified`, or `incompleteStop`; none increments completed. Optional exporting occurs only with the explicit exporter contract. A completed round requires all designated producer/export work succeeded and drained, manifests verified, all configured criterion reviews verified, and a complete critic with preserved dissent. Quality fail is a valid completed review round; execution failure or absent evidence is not.

Two independent bounded pools apply exactly as composition: existing native-worker permits unchanged, plus a child-evaluator **lifetime** pool sized to root concurrency. Every live child, including one waiting on agents, counts until exit/settlement. Root helper is outside this pool; its producer/review siblings queue fairly for it. Waiting child owns no native permit; depth 1 cannot recurse. At concurrency 1 a child can complete its agent and exit before the next child starts. Retain bounded QuickJS pump, memory/CPU/idle and JSON broker protections, no yield/resume-ack protocol, no hidden wall deadline. Root request/position/lifetime start/attempt/broker accounting includes all helper children, native reviews, critic and final checks; no per-round resets or hidden cap increase.

Policy semantics:

| Condition | Exact behavior |
| --- | --- |
| exactlyN | Seek exactly N completed rounds; a pass before N does not stop production/review. On N, assess the final round's candidate only; no automatic cherry-pick of an earlier passing candidate. Earlier passes remain inspectable. |
| untilPass | Stop at the first completed verified passing round, including its required fresh final panel. A preliminary pass is provisional. |
| maxRounds:null | No domain maximum. Existing root lifetime/request/broker caps, manual stop and explicit run timeout still apply. |
| explicit maxRounds | At the boundary after that many completed rounds, do not admit another producer; unmet acceptance is nonconvergence, not an engine failure. Unfinished failed/unknown rounds stop immediately, never consume this completed-round count. |
| noProgressRounds:null | Disable the dry-stop rule; never infer a default. |
| explicit noProgressRounds | Stop only after that many consecutive *completed verified failed* rounds satisfying the comparison below. |
| capacity unavailable | Do not start the next stage without global reservations; report capacityExhausted with exact missing stage/remaining counters, preserve any partial round, never call it completed/dry. |
| failure/unknown/unverified | Stop dependent continuation; preserve actual effects/missing evidence. No automatic producer replacement, schema retry of lost output, or review-null synthesis. |

Round review reuse is opt-in. Both request values must be explicit. `exact-failed-round` may reuse only a complete previously verified **failed** matrix for the identical CandidateRef and RubricRef, identical project/export bytes, required role/criterion map and capability/source identities, with no unknowns and valid original native observations. A new producer's byte-identical output has different provenance and is not an identical CandidateRef; do not retarget old answers to its new packet or nonce. Thus ordinary new production rounds are freshly reviewed; explicit reuse chiefly supports the same retained failed candidate during replay/manual reuse. Rehash actual assets and records; retain original packet/nonce and bind `reusedFrom`. Reuse supplies known negative feedback, never a pass or fresh final check. No new worker execution/usage is invented. The critic still verifies current identity/coverage. Any changed candidate/export/rubric/source invalidates reuse.

Whenever a round could terminate with pass (untilPass or the last exactlyN round), run a fresh final independent panel and critic on that exact current candidate. These are new threads/invocations, with no reused reviews and no earlier verdicts in their packets. They are stages of that round, not an extra completed round. The preliminary panel remains immutable. A final fail makes the round fail with both panels' dissent retained; untilPass continues to the next round if allowed. A final unverified/failure/unknown stops with that outcome and does not complete the round. Fresh required final checks cannot be waived by exact-byte reuse. For exactlyN ending with a failed candidate, no acceptance pass is claimed; optional earlier pass is only historical.

No-progress initially uses the explicit conservative rule `identical-reviewed-failure-v1` (fixed as part of protocol, not a caller plugin). The first complete failed round sets comparison baseline and dryStreak=0. A subsequent complete failed round increments dryStreak only after rereading/verifying the complete source/export projections and required criterion evidence, confirming exact source/export bytes/modes and rubric/coverage identity, and equal per-criterion verified fail/pass outcomes and observation projections. The exact comparison projection sorts by reviewerId/criterionId and contains outcome, the complete sorted observed asset hash/media/channel set, and answer reason normalized to NFC, LF line endings and trailing-whitespace removal per line. Thread/run/nonce/call IDs are provenance, not a substantive change. Compare the reconstructed records and actual bytes, not only hashes of this projection; a fingerprint, producer changed flag or identical claim manifest alone is insufficient. Missing/unverified review is not comparable and stops safely. Any changed candidate or differing verified criterion assessment resets dryStreak=0 and is labeled `changed-unclassified`, not proof of quality progress. A passing completed round resets it. This conservative rule can miss stagnation on varied outputs; null/unbounded modes and explicit maxima/manual controls make that visible rather than inventing subjective progress. Keep original dissent and the comparison inputs in a paged ProgressRecord `{previousRound:positive integer|null,currentRound:positive integer,rule:"identical-reviewed-failure-v1",classification:"baseline"|"identical-failure"|"changed-unclassified"|"pass",evidence:PageRef,dryStreak:Count}`.

Boundary priority after a completed round is: previously committed stop-after-round; satisfied exactlyN/verified untilPass goal; explicit maxRounds; explicit no-progress; global capacity for next stage. A concurrent control and next admission serialize in one transaction. Failure/unknown/unverified cannot be overridden by boundary priorities. A passing round stopped manually before the goal may be shown as a passing candidate, but helper goal remains interrupted and final delivery remains unaccepted.

```text
RefineResultV1 = {
  schemaVersion:1,id:Id,
  execution:"completed"|"failed"|"unknown"|"cancelled"|"stopped",
  goal:"satisfied"|"nonconverged"|"interrupted",
  acceptance:"pass"|"fail"|"unverified",
  stopReason:"roundTarget"|"verifiedPass"|"maxRounds"|"noProgress"|
    "stopAfterRound"|"userStop"|"cancelled"|"capacityExhausted"|
    "failure"|"unknownEffects"|"missingEvidence",
  counts:{requested:positive integer|null,started:Count,completed:Count},
  latestCandidate:CandidateRef|null,acceptedCandidate:CandidateRef|null,
  nextInput:InputRef|null,rounds:PageRef,
  finalReviews:ReviewRef[0..16],missing:PageRef|null,error:FaultRef|null
}
```

Requested is N for exactlyN, null for untilPass. Started increments with the first producer intent of a round; completed increments once only at its verified terminal boundary. acceptedCandidate is non-null only with fresh final pass, complete critic and matching immutable identities. Execution completed/goal satisfied for exactlyN may have acceptance fail; achieving the requested count does not guarantee quality. Execution completed with nonconverged describes max/noProgress/capacity stop, never silent success. Unknown effects use execution unknown; failed uses failure; manual stop/cancel use interrupted. Missing includes exact criterion/reviewer/stage IDs and nonconvergence explanation separately from execution error. `nextInput` is a safe registered handoff for manual/root continuation, not permission to retry unknown work. It remains null if derivation safety is unproved.

## Durable state, replay and revisioned controls

Add `refinements(id,generation,revision,value,record_hash)` with primary key `(generation,id)`; `refinement_rounds(generation,refinement_id,round,revision,value,record_hash)`; `artifact_records(id,kind,manifest_ref,value_hash)`; `refinement_events(generation,seq,refinement_id,value,record_hash)`. Immutable original records/results remain in prior generations. Mutable projections are revisioned, reconstructed from the event chain and compared on read. Every event includes previousEventHash, exact root/helper/child/worker bindings and hash of its payload. Provider writes are owner/session guarded, BEGIN IMMEDIATE, with bounded DB busy timeout and no cross-process polling locks held during inference or filesystem hashing.

RoundState is exactly `{schemaVersion:1,refinementId:Id,round:positive integer,revision:Count,stage:enum above,input:InputRef,producer:ChildRef|null,exporter:ChildRef|null,candidate:CandidateRef|null,packets:PacketRef[],reviews:ReviewRef[],critic:BlobRef|null,finalReviews:ReviewRef[],finalCritic:BlobRef|null,verdict:"pass"|"fail"|"unverified"|null,progress:ProgressRecord|null,completed:boolean,error:FaultRef|null}`; arrays use the configured role count, ≤16 for panels, ≤32 packets including final. RefinementState is `{schemaVersion:1,id:Id,generation:positive integer,revision:Count,config:BlobRef,policy:LoopPolicy,stopAfterRound:positive integer|null,counts:{requested:positive integer|null,started:Count,completed:Count},activeRound:positive integer|null,result:RefineResultV1|null}`. Each serialized projection/event ≤1 MiB; exact refs keep it small. Result completion transaction stores all final refs, counter changes, event, helper invocation result and next-stage admission closure together before replying.

Each stage first commits an intent keyed by helper invocation/round/stage/role and the full source/input/candidate/export/rubric/policy identity. Child/agent intents use the composition journal and global accounting. Files are sealed before references publish. A duplicate recovered completed transition returns its original refs; it cannot launch a new producer or increment counters twice. Lost reply after commit is read/replayed; crash after intent without complete outcome retains unresolved effects, not a fresh attempt. Cancel/drain, domain controls, child source replacement and artifact integrity changes participate in replay. An invalidated invocation suffix invalidates all derived states/acceptance descending from it; do not leave a stale acceptedCandidate while replaying changed production.

Domain control envelope (also used by cancel-child in composition):

```text
DomainControlRequest = {
  schemaVersion:1,requestId:Uuid,expectedGeneration:positive integer,
  action:"refinement-limits",payload:{refinementId:Id,expectedRevision:Count,
    maxRounds:null|integer 1..1000,noProgressRounds:null|integer 1..1000}
} | {schemaVersion:1,requestId:Uuid,expectedGeneration:positive integer,
  action:"refinement-stop-after",payload:{refinementId:Id,expectedRevision:Count,
    round:positive integer|null}}
  | {schemaVersion:1,requestId:Uuid,expectedGeneration:positive integer,
    action:"cancel-child",payload:{child:ChildRef,expectedRevision:Count}}
  | {schemaVersion:1,requestId:Uuid,expectedGeneration:positive integer,
    action:"pause"|"stop",payload:{expectedAdmissionRevision:Count}}
DomainControlReceipt = {
  schemaVersion:1,requestId:Uuid,requestHash:Sha,run:RunRef,
  generation:positive integer,action:enum above,
  status:"pending"|"applying"|"applied"|"rejected"|"unknown",
  targetRevision:Count|null,appliedRevision:Count|null,
  requestedAt:Text(40),settledAt:Text(40)|null,error:FaultRef|null
}
```

Request ≤16,384 bytes; receipt ≤40,000; at most 256 pending/applying across existing and new controls, and at most 10,000 domain requests retained per run (no eviction of pending identities). All new wrapper calls require resolved RunRef, originating session and same data instance. Hash = H(C({run,sessionId,request})). Look up requestId first after authority validation: identical hash returns original receipt even after later revisions; changed hash conflicts. New submissions compare generation, exact target/revision, state and admission under one transaction, register pending and close appropriate admission before ack. Application rechecks targets; source/candidate identities are immutable, not mutable control payload. Lost replies retain pending/applying/unknown outcome; read same requestId, do not allocate a replacement. Reject unsupported old runtimes instead of routing to an approximate legacy action.

Limit controls replace both nullable values atomically, preserving mode and exactlyN target. They cannot increase root concurrency/lifetime caps, add skills, change rubric/source/ownership, revive terminal/unknown work or clear effects. A finite max cannot be below completed or active round; exactlyN also requires max>=N. Stop-after round null clears a pending boundary; otherwise target must be >=active round or the next round when idle and <=N for exactlyN. If that boundary already completed but another round has not started, only an explicit stop at the current completed round is permitted and applies immediately; otherwise reject stale target. Updating limits takes effect for future admission; it does not expire an active worker. Each change increments target revision once. Pause/Stop close admission coherently across both pools, append and helper; Pause drains accepted work; Stop cancels/drains with unknown cleanup blocking dependent continuation. Child cancel interrupts that stage and stops helper continuation, not a completed/dry round. Worker same-turn deadline/steering menus retain their own exact position/attempt/turn/revision controls.

Proposed CLI services: `refinement RUN_ID --id ID --generation G` for a bounded state read; `refinement-rounds RUN_ID --id ID --generation G --after CURSOR --limit N`; `artifact-manifest RUN_ID --ref-file FILE --after CURSOR --limit N`; `domain-control RUN_ID --session SESSION --request-file FILE`; `domain-control-receipt RUN_ID --session SESSION --request-id UUID`. Ref-file is a bounded typed ref read once, not an arbitrary manifest location. All accept consistent --data-dir and use recorded runtime. HTTP equivalents within the existing authenticated dashboard are GET `/api/refinements/:id`, `/api/refinements/:id/rounds`, `/api/artifact-manifests/:id`, POST `/api/domain-controls`, GET `/api/domain-controls/:requestId`; query schemas bind exact run target, generation, manifest/after/limit and reject extra/duplicate keys. Requests use the existing 40,000-byte HTTP body cap; responses ≤1 MiB. Same-session authorization and read corruption checks apply to paged and single reads.

## Exact provider seam and path ownership

Core owner holds all existing shared runtime/controller/evaluator/backend/CLI integration files. Artifact owner adds the modules below and does not modify core files concurrently. `RootContext` is the unforgeable host context from composition. `RefinementServices` is a trusted adapter with exactly `invokeChild`, `resolveChildWorker` (composition signatures), `resolveNativeAssetReads({context,worker:WorkerRef,packet:PacketRef}):Promise<PageRef>`, `reserveStage({context,refinementId:Id,round:positive integer,stage:Text(40),agents:integer 0..1000,brokerCalls:integer 0..10000}):Promise<{reservationId:Id}>`, and `releaseStage({context,reservationId:Id}):Promise<void>`. Artifact-inputs itself owns immutable snapshot registration under RootContext; there is no second caller-supplied registration service. Reservation uses the existing root admission ledger: stage reservations convert atomically into actual agent slot/start reservations, never double-count or create another attempt counter; unused reservations release once. Actual attempts remain solely in append admission. Reserve the known role work conservatively; arbitrary additional scout calls still need remaining root capacity and cannot borrow a promised final stage. A reservation is no increase/reset or promise that dynamic work can finish. Refine services never execute a caller function or accept a supplied authoritative result.

| Proposed module/export | Exact contract and effect |
| --- | --- |
| `engine/artifact-contracts.mjs` | synchronous `validateRefineRequest({request:RefineRequestV1,declarations:WorkflowDeclaration[],authorityOwnedPaths:OwnedPath[]}):RefineRequestV1`; `validateArtifactRef({reference:InputRef|CandidateRef|PacketRef|RubricRef|ReviewRef}):same type`; pure validation only |
| `engine/artifact-inputs.mjs` | `resolveBaseline({context,selection:{kind:"captured"}|InputRef}):Promise<InputRef>`; verifies/registers original capture, never recollects retained input |
| `engine/artifact-inputs.mjs` | `deriveArtifactInput({context,parent:InputRef,candidate:CandidateRef,ownedSourcePaths:OwnedPath[],ownedExportPaths:OwnedPath[]}):Promise<InputRef>`; verify and seal exact new snapshot; refuses unsafe effects |
| `engine/artifact-inputs.mjs` | `loadArtifactInput({context,input:InputRef}):Promise<{descriptor:InputRef,files:CapturedFile[],inputTree:Text(64),inputIndex:BlobRef}>`; verifies full immutable bytes for workspace creation; no live tree copy |
| `engine/artifact-candidates.mjs` | `sealArtifactCandidate({context,refinementId:Id,round:positive integer,input:InputRef,producer:ChildRef,workerId:Id,claim:{relativePath:Path,sha256:Sha,bytes:Count},ownedSourcePaths:OwnedPath[],ownedExportPaths:OwnedPath[],mode:"combined"|"project-only"}):Promise<CandidateRef>`; authoritative capture resolution and source/export sealing |
| `engine/artifact-candidates.mjs` | `sealArtifactExports({context,project:CandidateRef,exportInput:InputRef,exporter:ChildRef,workerId:Id,claim:{relativePath:Path,sha256:Sha,bytes:Count},ownedExportPaths:OwnedPath[]}):Promise<CandidateRef>`; new final candidate bound to identical source projection |
| `engine/artifact-reviews.mjs` | `freezeArtifactRubric({context,input:InputRef,source:{path:Path,sha256:Sha,bytes:Count}}):Promise<RubricRef>`; `createReviewPacket({context,candidate:CandidateRef,rubric:RubricRef,role:ReviewerRole,blinding:enum,nonce:Uuid}):Promise<PacketRef>` |
| `engine/artifact-reviews.mjs` | `verifyArtifactReview({context,candidate:CandidateRef,rubric:RubricRef,packet:PacketRef,reviewer:ChildRef,workerId:Id,answer:ReviewAnswerV1,observations:PageRef}):Promise<ReviewRef>`; resolves authoritative worker/native observations independently |
| `engine/artifact-reviews.mjs` | `aggregateArtifactReviews({context,candidate:CandidateRef,rubric:RubricRef,roles:ReviewerRole[],reviews:ReviewRef[],critic:{child:ChildRef,workerId:Id,answer:CriticAnswerV1}}):Promise<{verdict:"pass"|"fail"|"unverified",complete:boolean,evidence:PageRef}>`; preserve dissent, never accept a raw Boolean |
| `engine/refinement.mjs` | `runArtifactRefinement({context,request:RefineRequestV1,services:RefinementServices}):Promise<RefineResultV1>`; trusted root state machine, returns all terminal domain outcomes, throws only admission/corruption/ownership faults |
| `engine/refinement-store.mjs` | `readRefinement({dataDir,run:RunRef,sessionId,id:Id,generation:positive integer}):Promise<RefinementState>`; `listRefinementRounds({dataDir,run,sessionId,id,generation,after:Text(200)|null,limit:integer 1..100}):Promise<Page<RoundState>>`; `readArtifactManifest({dataDir,run,sessionId,reference:typed ref,after:Text(200)|null,limit:integer 1..100}):Promise<Page<manifest entries>>` |

Pages are exact `{items:T[],nextCursor:Text(200)|null,hasMore:boolean}`, complete response ≤1 MiB, no successful empty continuation while data remains. Cursors are opaque base64url encoding of `{id:Sha,offset:Count}`, bound by the selected saved run/manifest identity; reject foreign/unknown/out-of-range and one-item overflow. They are pagination positions, not authority tokens or evidence of consumed pages. Verify full record/hash/lineage integrity even beyond the returned prefix. Schema-specific entry rows are `{section:Text(40),index:Count,value:object}` with value equal to the exact corresponding manifest entry; no arbitrary projection can hide a missing requirement. Scalar/header page is one entry with section `header`, followed by sorted section arrays, preserving full reconstruction. Store reads do no jobs, models, integration, garbage collection or mutation. Domain records are immutable and inspectable after stop/failure; retirement later follows existing reviewed lifecycle rules and references protect dependencies.

Provider error codes are fixed: `ARTIFACT_INPUT` (shape/version/JSON), `ARTIFACT_PATH`, `ARTIFACT_OWNERSHIP`, `ARTIFACT_PROVENANCE`, `ARTIFACT_INTEGRITY`, `ARTIFACT_DRAIN`, `ARTIFACT_EFFECTS_UNKNOWN`, `ARTIFACT_LIMIT`, `ARTIFACT_UNAVAILABLE`; `REFINEMENT_INPUT`, `REFINEMENT_CONFLICT`, `REFINEMENT_CORRUPT`, `REFINEMENT_UNSUPPORTED`, `REFINEMENT_ISOLATION_UNAVAILABLE`. Preflight faults reject before producer/reviewer admission. After execution, integrity/path/known invalid-output faults yield failed with original evidence; drain/effects uncertainty yields unknown; unavailable required evidence yields unverified/missingEvidence, with no completed/dry round. Authority/ownership/corrupt-ledger faults close admission and throw rather than publish a trustworthy-looking result. Existing underlying native failures and exact noProcessStarted/noInference facts remain retained; a sanitized domain category does not replace them.

## Supported proposed example and operational roles

After implementation, a root can declare producer/reviewer/critic sources using the composition WorkflowDeclaration shapes, then call the helper as follows. `args.refinement` must be a captured RefineRequestV1 with the exact role schemas above; literal declarations are authored before launch and are not runtime script text.

```javascript
export const meta = {
  name:'Sprite refinement',description:'Produce exports and independently review',
  workflows:[
    {alias:'spriteProducer',source:{kind:'registry',name:'plugin:artifact-producer'},
      argsSchema:{type:'object'},resultSchema:{type:'object'},
      capabilities:{skills:null,tools:null},permissions:null},
    {alias:'spriteReview',source:{kind:'registry',name:'plugin:artifact-review'},
      argsSchema:{type:'object'},resultSchema:{type:'object'},
      capabilities:{skills:null,tools:null},
      permissions:{sandbox:'read-only',networkAccess:false,approvalPolicy:'never'}},
    {alias:'completeness',source:{kind:'registry',name:'plugin:artifact-completeness'},
      argsSchema:{type:'object'},resultSchema:{type:'object'},
      capabilities:{skills:null,tools:null},
      permissions:{sandbox:'read-only',networkAccess:false,approvalPolicy:'never'}}
  ]
};
const result = await refineArtifact(args.refinement);
return {result};
```

These bundled recipe names are proposed additions in the plan. The broad object-root declaration schemas are supported for this compact example; the helper still enforces the exact mandatory role schemas above independently. Production recipes should publish expanded exact role schemas and check their compiled cost. `null` ceilings inherit only the already admitted bundle; recipe native agents must make the actual explicit role selections and readiness checks below.

Example request values: id `spritePass`, baseline `{kind:'captured'}`, ownedSourcePaths `['art/hero/']`, ownedExportPaths `['exports/hero/']`, producer `{alias:'spriteProducer',workerId:'producer',args:{brief:'hero idle'}}`, exporter null, reviewers `[{id:'craft',alias:'spriteReview',workerId:'reviewer',criterionIds:['silhouette','motion']},{id:'technical',alias:'spriteReview',workerId:'reviewer',criterionIds:['sheet']}]`, critic `{alias:'completeness',workerId:'critic'}`, blinding `packet-context`, policy `{mode:'untilPass',rounds:null,maxRounds:null,noProgressRounds:null}`, reuseReviews `never`, toolRequirements containing the actual preadmitted sprite managed tool ID. Rubric is the real captured file/hash/bytes, not a placeholder accepted by admission. For exactly four rounds choose `{mode:'exactlyN',rounds:4,maxRounds:4,noProgressRounds:null}`; it continues after early passes. These are values for the complete request schema, not an alternate abbreviated API.

The producer child uses the supported proposed option `agent(prompt,{id:'producer',workspace:'isolated',inputSnapshot:args.input,skills:[actualEditingId,actualExportId,actualVerificationId,actualCraftId],requireTools:[actualSpritesToolId],maxAttempts:1,timeoutMs:null})` and returns the captured claim locator. The reviewer child uses `agent(neutralPrompt,{id:'reviewer',reviewPacket:args.packet,skills:[actualReviewId,actualCraftId,actualVerificationId],requireTools:[],maxAttempts:1,permissions:{sandbox:'read-only',networkAccess:false,approvalPolicy:'never'},schema:exactReviewAnswerSchema})`. Names in these expressions are values resolved from the frozen capability bundle before startup, not magic IDs or host globals supplied by the runtime. The child source contains literal selected IDs after that authoring decision. Critic selects workflow/test-strategy roles for coverage as appropriate, with explicit none for unrelated tools.

Sprite roles require actual editing, export, verification and craft skills; activate using genuine executor catalog pagination and returned main_resource/root. Require actual worker-local CLI/runtime/native dependency readiness, then actual edit/export/image-read operations with retained assets. Files/hashes/version output alone do not prove export or native image interpretation. A requested FULL modeling plugin maps its complete installed authoring, believable construction, build, quality review, rigging and setup set, managed CLI/Blender/preview tools, and any requested engine integration to roles before startup. No reduction to one authoring skill or file access. Setup skill activation does not authorize installs. Missing prerequisites pause only dependent stages; report exact command/executable/cache and observed evidence, retain unknown effects and do not try alternate potentially mutating commands.

Prepare future qualification with verified Node `C:/Program Files/nodejs/node.exe`, non-login shell and npm through Node's verified npm-cli.js path, not npm.ps1. Actual originating session/authority/capability bundle and same explicit data-dir are required. Name an observer, consume its returned watch argv/attached record through terminal and retain processed cursor; retain dashboard until its owner explicitly Closes it. Ending chat/tab is not shutdown. No launches, tests, rendering, installation or native qualification were performed in this design task.

## UI and acceptance gates

Within existing map/inspector show helper/child groups, round number, stage, candidate/export/rubric identity, verified verdict, completed/requested counts and exact stop reason. Distinguish execution completed, accepted candidate, capacity exhaustion, nonconvergence, interrupted and unknown. Provide one-click failed/unknown evidence, required reviewer/criterion matrix, original dissent, source/export manifests and lineage. Use inspector round controls and existing worker menus; no header bloat or inferred phase dependencies. Preserve data-only refresh, focus/scroll, theme/resize, light blue navigation, and non-default Hidden/Archived/unavailable picker dispositions; omit redundant default Visible badges while retaining accessible identity.

Release requires meaningful failing tests at existing invariant owners, independent source and semantic review, native real producer→export→derived-input→fresh blind-review qualification on a new frozen candidate runtime, negative evidence cases and full package/release gates in the plan. The unavailable native test-strategy candidate-evidence reference is disclosed in the design-review report. It does not authorize fabricated native evidence or waiver of first-party candidate/source/semantic gates.
