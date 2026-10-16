# Stage checkpoints

Current R4 source correction: `FrozenSnapshotV1.files[].mode` is the JSON number enum `100644 | 100755`. String modes in snapshots are refused even when the caller recomputes both hashes. Capture manifests retain their independent string enum; acceptance bridges those two validated representations explicitly. The nonempty R4 content preimage hashes to `2d103b96bdce4e1a5286bab791c1e57b7a56a6c37294003866f031c163883dd2`. This vector proves schema/hash agreement only; filesystem verification still requires the actual retained jobs provider.

This track implements explicit coordinator mutations in a separate per-run `delivery-v1/stages.sqlite`. Inspection is read-only. Request replay compares the exact validated caller payload before generating identifiers or testing the current predecessor. Each immutable record hashes its predecessor hash and all persisted fields except `recordHash`.

Checkpoints are coordinator assertions, not host attestations; captured producer evidence and fresh integrated checks are still required. Same-user disk access is not a cryptographic trust boundary.

Canonical comparisons also accept inert null-prototype dictionaries returned by the verified jobs provider. Caller request/record shapes remain ordinary JSON objects; this is not permission for exotic objects or coercion. Arrays must use the ordinary Array prototype, dense index data descriptors and no additional properties before any `map` or species callback can run. A real nonempty jobs snapshot and explicit overridden-map/species negatives exercise the shared codec boundary; that local evidence is separate from authentic native checkpoint/check qualification.

All exported functions are asynchronous:

```js
recordStageCheckpoint({dataDir,runId,sessionId,expectedPreviousId,requestId,record})
readStageCheckpoint({dataDir,runId,id})
listStageCheckpoints({dataDir,runId,after:null,limit:50})
recordVerificationCheck({dataDir,runId,sessionId,checkpointId,checkId,jobId})
```

Mutations refuse `AGENT_WORKFLOW_WORKER=1` at the API boundary. They resolve the saved originating session and byte-verified retained runtime through `resolveRun`. No current-runtime substitution or installation is performed. Inspection needs the run ID and opens only existing storage with SQLite `readOnly:true`. Missing storage returns `null` for a single record, or `{available:false,items:[],nextCursor:null,hasMore:false}` for a list. A present database with missing tables is refused as corrupt; inspection never initializes it.

The caller record has exactly these fields:

```text
schemaVersion originRun planHash parentPolicyHash parentCatalogHash
objectives artifacts answers outstandingQuestions nextTasks recovery
scopeChanges integration checkRequirements
```

`schemaVersion` is 1. `originRun` is `{dataInstanceId,runId,runtimeId}`, using the monitor's canonical data-root/device/inode/birth-time hash algorithm. The three hash fields are lowercase SHA-256. UUID v4 request IDs and nullable `expectedPreviousId` are method arguments. Caller-supplied IDs, predecessor fields, timestamps and `recordHash` are refused.

The nested v1 records used by this module are:

| Record | Fields and meaning |
| --- | --- |
| Objective | `{id,artifactRefs,checkIds,verifiers}`; verifier entries are exact ProducerRef or null. All artifact refs must also be in the checkpoint artifact inventory; all check IDs must have immutable requirements. |
| ProducerRef | `{run,generation,position,attempt}`; cumulative attempt, never a session-local attempt number. |
| ArtifactRef | `{producer,captureId,relativePath,sha256,bytes}`; `captureId` is the actual workspace `manifestHash`. Paths are literal portable relative paths; case collisions are refused within a producer/capture. |
| Question | `{id,text,state}`; state is `required` or `optional`. Answering uses a separate record. |
| Answer | `{checkpointId,questionId,answer,source}`; source is `{kind:'coordinator',reference:string}` or `{kind:'artifact',reference:ArtifactRef}`. Coordinator source text is an assertion from the authenticated recorder, not independent host evidence. |
| Next task | `{id,objectiveIds,ownedPaths,dependsOn,roleSelections}`; selections are `{skills,requireTools}`. These retained descriptors do not dispatch work or confer permissions. |
| Scope change | `{addedObjectiveIds,removedObjectiveIds,authorization:ArtifactRef}`. Omission alone cannot remove an earlier objective. Assembly resolves the authorization evidence. |
| Recovery | `{producer,outcome,effects,cleanup,reconciliationRefs,replacementEligible,admissionRefs}`. Outcome is failed/unknown/cancelled/completed; effects are knownNone/reconciled/unknown. Cleanup has `{serverExited,jobEmpty,forced,ownershipScope}`. Eligibility requires positive owned cleanup, non-unknown effects and nonempty reconciliation/admission references, then assembly independently resolves those references and compares original facts. |
| Integration | null or `{snapshot,reviewedProducers,integratedArtifacts,verificationNonce}`. The snapshot is the complete shared FrozenSnapshotV1, validated by the actual retained jobs provider. |

Record size is at most 1 MiB, with at most 1024 checkpoints and 1024 check receipts per run. Objectives/check requirements/answers/questions/recovery/scope changes each have at most 64 entries; artifacts have at most 256, next tasks 32. Object depth and traversal are bounded. JSON accessors, exotic prototypes, sparse arrays, unknown fields, unsafe integers and nonfinite numbers are refused before getters or `toJSON` can execute. Lists apply both a count bound and a complete serialized response byte bound, as described below.

The persisted record adds `id,previousId,previousRecordHash,requestId,createdAt,recordHash`. Canonical hashing recursively sorts object keys using JavaScript string order, preserves arrays and hashes UTF-8 JSON without whitespace or a newline:

```text
requestHash = H(C({originRun,requestId,expectedPreviousId,record}))
recordHash = H(C(persistedRecord with only recordHash omitted))
```

An identical request replay returns its original record even after the chain advances. A changed request payload conflicts. A new request uses `BEGIN IMMEDIATE`, compares the current predecessor and appends atomically. Chain reads verify every predecessor, payload hash, generated-field shape and record hash. Answers target an exact existing ancestor checkpoint/question pair; duplicates and unknown targets fail. Omitting a required earlier question leaves it open in acceptance.

## Count and byte pagination

`listStageCheckpoints` returns `{available,items,nextCursor,hasMore}`. `limit` is an upper count bound, defaults to 50 and accepts integers from 1 through 100. Each page is also at most 1 MiB (1,048,576 UTF-8 bytes) of compact serialized JSON, including the complete response envelope. The largest contiguous prefix fitting both bounds is returned; records and their hashes are never shortened or rewritten. For example, three approximately 440 KB records return two records followed by one with the default count limit. `limit:1` returns one at a time.

`nextCursor` is the last returned checkpoint ID and `hasMore` indicates whether later records remain. Continue using that cursor until `hasMore` is false. An exhausted existing ledger returns an empty final page with the supplied cursor (or null for an empty ledger); a missing ledger has `available:false`. An unknown cursor is refused. A successful empty page is never returned while records remain. Every list call still validates the complete stored chain and saved role/policy/catalog ceiling, including records outside the returned prefix.

Before inserting a new checkpoint, append admission verifies that the generated record fits a complete one-item list response. It uses the larger final-page `hasMore:false` envelope, so a record at the exact boundary remains pageable after later appends. One byte over is refused with `CHECKPOINT_LIMIT` before stage insertion, with transaction rollback. The record cap, database quota, request hash and record hash preimages are unchanged. Exact historical request replay still precedes this new admission check. Older records remain readable and exactly replayable; if the next stored record cannot fit its current one-item page envelope, listing fails explicitly with `CHECKPOINT_LIMIT` rather than skipping it or returning an empty continuation. Inspection never migrates or repairs history.

Delivery acceptance follows `hasMore` and `nextCursor` through the existing 1024-record quota, including histories requiring more than eleven byte-limited pages. Each page must make progress with a cursor matching its last item; duplicate IDs, broken cross-page ancestry, empty pages and inconsistent cursors are refused with `ACCEPTANCE_CURSOR`. Total records and continuation remain bounded by the unchanged quota. The independent final history/source checks remain in place.

Local pagination evidence uses valid multibyte records and real disposable SQLite: a two-plus-one page split, the smaller count bound, exact 1 MiB and one-byte-over boundaries, atomic refusal, unchanged historical replay/hashes, and refusal of valid-JSON corruption in a later non-returned record. The acceptance owner exercises twelve real 600 KB checkpoints and damaged provider-response controls. The affected wrapper command passes both wrappers. See [the pagination report](../reports/roadmap-pipeline/checkpoint-pagination.md) for RED/GREEN evidence and remaining coordinator checks; this is not delivery or release acceptance.

`recordVerificationCheck` accepts only an internally resolved same-run `jobId`. It checks the job's checkpoint/check binding, executable/argv/cwd/environment/policy/runtime identity, full source and validation snapshots, output file hashes and exact host drain for positive outcomes. Command vectors are `[executable,...argv]`; a receipt's `argv` excludes the executable, preserving empty strings. No external outcome JSON is accepted. A failed job with fully verified snapshots/output may retain a failed CheckReceipt; later receipts append rather than overwrite it. Unknown or incomplete jobs retain their original job ledger evidence and cannot become positive checks. The provider's read contract remains responsible for validating its private admission/environment and invocation hash; acceptance does not reconstruct private job records.

Frozen checks bind equal source/validation manifests. Validation-copy checks bind distinct F and V manifests with equal content/dependency byte identities; the job cwd belongs to V. The source snapshot is checked again after output verification. No tests, jobs, captures, patch replay or integration operations run from either inspection API.

Local evidence: verified Node `C:/Program Files/nodejs/node.exe`, v24.18.0, non-login PowerShell. The initial affected command exited 1 with meaningful failures for forged acceptance, successful-looking missing history and an unguarded worker mutation. Later RED/GREEN cases covered replay payload conflicts, question targets, nonempty references, stale checkpoints and forged scope authorization. The final affected command is recorded in [delivery-acceptance.md](delivery-acceptance.md). Fixtures create only owned `test/.lifecycle-fixture-acceptance-*` directories, using the already reviewed `test/.lifecycle-fixture-` prefix. They use inert byte-verified managed-runtime files and real SQLite, with no native executable launch, installation, Git mutation or external call. The R3 test helper evaluates only owned source modules in an isolated fixture realm with an inert process facade. The actual worker environment is never changed; the actual production mutation guard remains enabled. All mutation targets are disposable synthetic fixture IDs and directories.

Coordinator checks still required: actual jobs-provider integration, real two-producer captures, cross-process predecessor contention, qualified failed/successful job imports, spool corruption, F/V drift and omission of the final snapshot check. Full-quota stress beyond the local pagination and boundary samples remains unverified. The literal approved checkpoint/snapshot hash vectors and independent generated-record hash calculation are covered locally; they are fixture data, never delivery evidence.

## R3 clarified behavior

Artifact captureId is a lowercase SHA256, bound to the saved finalized workspace manifestHash. Paths reject .git components and Windows aliases; planning alone permits a trailing directory slash. Shared directory spelling is consistent across owned paths. Plans retain unresolved dependencies as missing completion evidence and reject cycles; role selections must be inside the saved original manifest. They grant no tools or writes. Parent policy/catalog hashes cannot silently change between checkpoints, and saved hashes are checked where present. Reads check that same ceiling and never initialize tables.

FrozenSnapshot schema/hashes are validated before provider loading, including exact keys, complete sorted file metadata, exclusions hash, dependencies and the original R2 canonical preimages. Actual filesystem/dependency identity still requires the retained jobs provider. A valid schema or vector is not a verified snapshot. Proxy traps, getters, exotic objects, extra import outcome fields and caller-generated fields are refused.

Check recording rechecks executable bytes, runtime/Node identities, command-to-argv mapping, same-run ownership, exact requirement and F/V bindings, owned spool/index paths, retained bytes/hashes, host drain and a stable reread of the actual job. The private environment/invocation admission remains verified by the actual provider read contract; there is no undocumented provider export or caller-supplied environment/outcome override. Positive checks require observed/succeeded/passed/exit0 and exact unforced positive drain. Failed or unknown job history is never rewritten as success.

Initial ledger creation is an explicit coordinator mutation; existing legacy/missing-table stores are not silently initialized by check import or inspection. SQLite busy/locked conflicts are returned without retry. Cross-process tests use separate Node processes and unique owned SQLite fixtures. Historical notes above remain from the failed candidate, including earlier unverified items; the R3 evidence and remaining provider/native gates are in delivery-acceptance.md. Final artifact hashes are supplied by this task's final metadata and independently checked by root; this document does not invent a native capture ID.

## R4 local verification

The nonempty numeric-mode regression first failed with `CHECKPOINT_INPUT`. After the correction it reaches the deliberately absent fixture provider and returns `CHECKPOINT_UNSUPPORTED`, leaving no stage record. Rehashed string-mode snapshots are rejected before provider access. This exercises the public checkpoint recorder against a real owned SQLite fixture without manufacturing provider success.

The current direct affected suite passed 39 of 40 tests with one explicit provider integration skip. The ordinary Node test command passed both isolated-suite wrappers, including the cross-process predecessor test. Earlier failed/partial runs and the old fixture residue described in delivery-acceptance.md remain unchanged in their original roots. These new fixture checks confer no acceptance on those runs. Genuine nonempty provider integration, authentic check imports and final F/V qualification remain coordinator checks.
