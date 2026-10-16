# Delivery acceptance

Current R4 recovery source: the six-file correction below runs in a new canonical 0.4.5 writer workspace. Earlier runtime, failure, partial-source and residue descriptions in this document are retained historical evidence. They are not the current workspace's state or new acceptance claims.

`assembleDeliveryAcceptance({dataDir,sessionId,request})` assembles saved evidence without creating or migrating storage, launching tests/jobs, integrating files or changing worker results. The request is exactly:

```js
{
  schemaVersion: 1,
  run: {dataInstanceId, runId, runtimeId},
  planHash,
  checkpointId,
  objectiveIds
}
```

It rejects additional fields, including `passed`, `complete` and arbitrary paths. The request is at most 65536 bytes and names at most 64 unique objectives. The run is resolved through its original authenticated session and byte-verified retained runtime. Its data-instance identity uses exactly the canonical root/device/inode/birth-time algorithm used by session adapters. Cross-run producer references are permitted only in that same data instance and originating session, preserving their actual original run/runtime IDs.

The response is `{schemaVersion,planHash,integrationCheckpointId,rows,missingObjectiveIds,removedObjectiveIds,complete}`. Rows contain `{objectiveId,status,producers,artifactRefs,checkReceiptIds,reasons}`. Status is accepted/missing/rejected/unknown. Every retained checkpoint objective is assembled even when a caller supplies a subset. Explicitly authorized removed scope is reported separately and never counted delivered. A missing checkpoint reports missing objectives; a malformed or forged request/reference is refused or rejected rather than disguised as missing. Unknown execution, inaccessible retained integrity and incomplete cleanup remain unknown. Reports are at most 1 MiB.

Assembly verifies the checkpoint's full immutable chain and plan/run binding. A checkpoint superseded by a coordinator revision is stale; advancing the chain during assembly also invalidates the result. Required unanswered ancestor questions remain open even when a later checkpoint omits them. Artifact-backed answers and scope authorizations are resolved as actual captures; a forged authorization cannot hide an objective as removed.

Producer resolution reads actual saved SQLite with no writes. It validates bounded generation/position/cumulative attempts, checks `attemptOffset + sessionAttempt.number`, follows `reusedFrom` and verifies `priorExecutions` identities. Traversal has a 1000-read ceiling and refuses cycles, forward lineage and changed origins/results. Cached implementation may resolve to its original producer; a cached verifier cannot supply a fresh check. A completed source producer must have its original raw result hash and positive owned cleanup/native-terminal evidence. Its declaration may be complete or partial. A partial declaration remains a limitation in the saved record and in accepted-row reasons; only the immutable objective requirements and independently resolved evidence establish completion. No English missing-string classification or caller Boolean discharges a requirement. Blocked, failed and unknown producers cannot establish completion. Fresh verifiers must declare complete with no missing evidence.

Artifacts resolve the saved workspace manifest identity (`captureId = manifestHash`), actual retained-runtime `verifyWorkspace` and `readWorkspacePatch` APIs, complete manifest entries, raw immutable blob hashes, reviewed paths and integrated file hashes. Existing captures use `size`; public refs use `bytes`. Binary bytes remain binary and partial previews do not become complete artifacts. Current capture verification also requires the original live workspace. A vanished workspace is unavailable integrity, not a pass; coordinator reconciliation must retain and qualify immutable capture evidence through a supported provider. This module does not reconstruct a patch or invent a replacement verifier.

Fresh verifier producers must be uncached and start after the selected integration checkpoint. The checkpoint names their exact original producers; their saved complete results, raw hashes and cleanup are verified independently. If a saved result supplies `verification:{integrationCheckpointId,planHash,sourceSnapshotSha256,verificationNonce}`, that binding must match. The compact pipeline schema need not gain new fields: exact executable/snapshot proof comes from the separately required authentic job checks. A generic `status:'complete'` result alone cannot satisfy the objective. Checkpoint selection of a verifier remains a coordinator assertion, not proof of every source read performed by that model.

Required executable checks come from immutable CheckReceipts recorded using actual same-run command-job IDs. Assembly rereads their authentic jobs through the retained provider and verifies invocation mapping, policy/runtime/dependency identity, actual execution, host cleanup, full before/after snapshots and retained output hashes/index. Native positive cleanup requires `serverExited:true`, `jobEmpty:true`, `forced:false`, `ownershipScope:'windows-job-members'` and the existing host facts `closeObserved:true,exitCode:0,signal:'none',receipt:'drained'`. A rejected-before-spawn host receipt cannot be successful execution. Failed check history remains retained. Unknown prior job effects do not disappear because a later command exits zero.

F is the immutable integrated source. Temp-producing checks execute V's code with the separately bound V snapshot and reviewed ephemeral prefixes; equality uses content/dependency bytes, not false equality of distinct root manifests. Assembly rechecks F independently before returning, including reports that already have missing evidence. It never substitutes cached checks or an old source manifest. Provider-dependent positive paths remain unqualified in this worktree.

Recovery preserves the original failed/unknown producer. If a previously selected uncertain producer is displaced, assembly requires a matching recovery record, consistent original outcome/cleanup facts and resolvable reconciliation plus fresh admission artifacts. Merely selecting a new worker or writing an explanation does not grant replacement eligibility. A properly reconciled replacement can eventually satisfy the objective; historical evidence remains unchanged.

The APIs and nested checkpoint records are documented in [stage-checkpoints.md](stage-checkpoints.md). CLI wiring belongs to the separate interfaces track. Old runtimes lacking these exports are unsupported and are never silently upgraded. This delivery stays on its recorded 0.4.1 runtime. The coordinator must use the approved separate zero-agent candidate recorder fixture, same data instance/session, and original cross-run producer refs for genuine new check recording. External passed JSON is not importable as an authentic command receipt.

Historical notes from the earlier FAILED position 11 candidate (preserved as history, not R3 acceptance):

| Check | Observed evidence |
| --- | --- |
| Spec integrity | Approval receipt SHA-256 `6d9b71fa14f9626f43c70ac115b7bff2a6cf544534017dde0dc0cf85511bc85b`; all 12 named references matched exact hashes and declared sizes. Approved R2 design/plan/machine manifest were read. |
| Initial RED | Explicit Node affected-tests command launched, exited 1; 0 passed/5 failed. `passed/complete` claims produced a missing-rejection assertion; missing history looked successful; the worker guard lacked rejection. |
| Refinement RED/GREEN | Nonempty references exposed a callback-argument validation bug; stale-checkpoint, unresolved-replacement and forged capture/authorization cases each failed meaningfully before their fixes. Fixture generation metadata was corrected after a test referenced generation 2 with a generation-1 header. |
| Current affected command | `& 'C:/Program Files/nodejs/node.exe' --test test/engine-stage-checkpoints.test.mjs test/engine-delivery-acceptance.test.mjs`, own workspace, non-login PowerShell; latest observed exit 0, 19 passed, 1 explicitly skipped, no cancellation. |
| Dependencies | Local tests use Node built-ins only. No npm install, network, native command owner, nested runtime, Git mutation or publication was performed. |
| Remaining acceptance | Actual providers/captures/recorded jobs, correct F/V/native/output identities, final-snapshot negative control, cross-process concurrency, full combined tests/check/smoke/clean install and candidate-recorder qualification require coordinator integration. The skipped test is a visible integration marker, not fabricated positive coverage. |

Reproduced tool friction and proposed owners:

| Reproduction | Effect and proposed owner |
| --- | --- |
| Executor catalog pagination initially returned `skills.list cursor is stale` after interleaving a file read. Restarting the read-only inventory reached its final page. | Discovery delay; native skills host should support stable ID/root filtering and durable pagination. No mutating retry occurred. |
| The complete fresh catalog included selected `tdd` at its exact original root and its main read succeeded. Neither selected `workflow` nor its parent package appeared. | Required workflow activation remains missing. Native capability/catalog owner must reconcile availability; no shell SKILL body, duplicate package or guessed activation was used. Independent TDD/source authoring continued. |
| Initial wide file reads were truncated; bounded follow-up slices recovered relevant full sections. Guessed `engine/store.mjs` and `engine/state.mjs` reads failed because those files do not exist. | Read-only commands executed nonzero, with no file mutations. Worker command guidance should inventory with `rg --files` first and budget each output below the native response cap. |
| Public shared receipt/capture contracts required consulting actual `foundation/client.mjs` and `engine/workspaces.mjs` field spellings. | Acceptance/jobs integration owner should retain the exact drain and argv/capture vectors as combined contract tests. Actual provider bytes are still absent here; source agreement does not prove positive check acceptance. |

Wiki discovery/ingest and roadmap updates remain coordinator-owned external writes under this fixed six-file scope. This worker's source/tests are retained for review; they do not close the acceptance objectives or establish host/native qualification.

## R3 correction evidence

This source was explicitly materialized from the failed older candidate under R3; it does not replace originalCapturedInputs or pretend the native workspace began with these bytes. The assigned checkout was published 0.4.3. Old run 4814c759-2fc4-40ba-beca-025fdde866f8/g1/position11/attempt1 remains failed (CAPABILITY_SOURCE_CHANGED), with no accepted result. The newer position5 subset remains partial. Neither history nor any source/capture/control file was changed.

The exact selected workflow and tdd retained roots were activated with native executor skills.list pagination then skills.read of returned main_resource. Both returned roots matched the selected identities. No nested workflow, delegation, Git mutation, installation, online fallback, native job execution or owner API against real saved runs occurred. Tests need Node built-ins only. Synthetic runtime directories contain authored inert fixture files, never copied installed dependencies or credentials.

The handoff manifest was 7051 bytes, SHA256 7af0a6c0ae5c2c1fa1c606bf0ace59dbde170e776146fd2f865cf6cee81b90c9. All six source files were hash/length checked with ordinary single-link leaf and ancestor/realpath checks before any exclusive copy. Every destination was absent, and case/path checks completed before copying. Six COPYFILE_EXCL copies succeeded. The manifest and all six sources were rechecked after copying; completion recheck is required as a separate final step. All six copied files are mutable and changed; there are no untouched copied files. No excluded original payload was inspected or copied.

| Initial owned path | Handoff SHA256 | Bytes |
| --- | --- | ---: |
| docs/delivery-acceptance.md | 426376f2804cff9390e2bbf58d6bae8363f0ab8846ee088cf58a14cb2f07c8d3 | 9830 |
| docs/stage-checkpoints.md | 63f05a0086843bad2ae2beeb61887ead9aaaf962ad480202d5129e5b6710a07e | 8030 |
| engine/delivery-acceptance.mjs | a71f5798c834fa43d04a461f2c8f4cb421847c1e561d871ccb0e1d14bfd5ee30 | 23321 |
| engine/stage-checkpoints.mjs | 717b01bea57dfc847bef14b00cd33260c5e893d67932d74491de90554f88754f | 22670 |
| test/engine-delivery-acceptance.test.mjs | b78e3671d3cf32bdff61b7c1f29c8a01300e775c9d5a721562def309a21ed3d0 | 9254 |
| test/engine-stage-checkpoints.test.mjs | a0505e1dc59e7fdfb848b1844493fe2915bd7b5b12d8892480ae0ce9b8a9a691 | 12951 |

All commands use C:/Program Files/nodejs/node.exe from the actual assigned cwd and non-login C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe. The exact preflight argv was [C:/Program Files/nodejs/node.exe, C:/Users/ehart/repos/agent-workflow-worktrees/roadmap-pipeline-control/attempt-03/preflight.mjs], exit0. Its hash was 12938acf530342c1090037501e9c19d1013c4fd06a8b887ef821b8263d466fc8; prerequisite JSON hash 44536ae22cf28ec16e23e8e5f3ee1bfab12706e402b1d5d26dc9aec24aaefc7c. The exact executable identities passed, with no install.

Meaningful REDs used literal argv [--experimental-vm-modules,--test,--test-name-pattern,PATTERN,...FILES]. FILES was [test/engine-stage-checkpoints.test.mjs,test/engine-delivery-acceptance.test.mjs] unless stated otherwise:

| PATTERN / files | Actual first result |
| --- | --- |
| R3 / both | exit1, 0 pass/3 fail: partial source wrongly refused, forged capture accepted, planning prefix refused. Subsequent targeted GREEN exit0, 3 pass. |
| R3 / both after schema/role regressions | exit1, 5 pass/2 fail: malformed snapshot reached provider instead of schema refusal, unadmitted task skill accepted. |
| R3 producer attemptOffset\|R3 capture paths / delivery file | exit1, 0 pass/2 fail: unbacked offset accepted and a forged capture path became unknown. |
| R3 unresolved task / delivery file | exit1, 0 pass/1 fail: unresolved dependency was absent from completion gaps. |
| R3 schema refuses proxies / stage file | exit1, 0 pass/1 fail: a proxy trap ran. |
| R3 directory case / stage file | exit1, 0 pass/1 fail: directory case alias entered planning. |

Intermediate full checks also exposed exact-call fixture arguments and concurrent initial schema creation; those commands executed and failed, with owned fixture effects cleaned at their first scheduled teardown. Tests were corrected to use the exact public assembly signature. Initial competing schema creates use idempotent DDL only for a newly absent ledger; busy/locked SQLite results are bounded conflicts, without retry. No failed command was described as notStarted.

The full GREEN argv is [--experimental-vm-modules,--test,test/engine-stage-checkpoints.test.mjs,test/engine-delivery-acceptance.test.mjs]; final counts are recorded below after execution. The normal affected argv [--test,test/engine-stage-checkpoints.test.mjs,test/engine-delivery-acceptance.test.mjs] also exercises each suite in its explicit isolated fixture realm process. That wrapper preserves the actual worker environment. No test clears AGENT_WORKFLOW_WORKER. The actual API guard is separately exercised in this worker. Experimental VM-module warnings are expected test-tool warnings, not native qualification.

Broken-behavior controls load only in-memory test module copies: permitting .git paths admits a forbidden path and would fail the owning refusal assertion; restoring the old universal-complete predicate rejects a genuine persisted partial source and would fail the positive producer assertion. Neither control edits product bytes or supplies a fake provider. Real SQLite fixtures also exercise cross-process predecessor CAS, attemptOffset/priorExecutions, original cached provenance, failed/blocked/null/queued states, read-only absent/missing-table storage, manifest/blob corruption and unresolved questions/tasks. Fixture byte checks do not label the fixture a genuine native capture.

Provider-dependent completed-partial assembly is explicitly notRun until coordinator integration. The opt-in test consumes at most64KiB of references-only JSON in `AGENT_WORKFLOW_ACCEPTANCE_FIXTURE`, with exactly `dataDir`, `negatives`, `partialProducer`, `positive` and `sessionId`. It reads actual saved providers and evidence in the explicitly admitted original data instance; it never copies execution history, initializes storage or writes to the real home. Default writable test fixtures remain in their owned validation roots. It requires two producers, captured/integrated bytes, authentic checks, a real preserved partial producer and blocked/failed/null/cached/owned-gap/output-corrupt/snapshot-drift negatives with their actual refusal reasons. It accepts no submitted receipt or passed Boolean and stays disabled inside an actual worker. Root prepares genuine inner evidence before the outer test-check requirement, then binds the exact descriptor through that requirement's environmentHash and the job recorder's privately captured inherited environment. This avoids a circular snapshot dependency or a pre-created temporary prefix; it does not relabel inner checks as final F/V evidence. Platform admission/inheritance remains an actual qualification gate, not a promise every maximum-sized Windows environment value launches. No native receipt or positive import override was supplied by this source change.

Full combined test/check/smoke/install, signed-host jobs, fresh F/V checks and native/browser acceptance remain separate coordinator gates. Current independent tests do not claim those passed. Native catalog pagination was usable but lengthy; filtering by admitted ID/root would reduce discovery output. The inherited worker-marker deletion helper was unsafe for this context and was replaced before running inherited tests. The six-file scope permits no wiki writes; root retains wiki/friction follow-through.

Additional input verification (full bytes were read and hashed; no bodies copied):

| Input | SHA256 | Bytes |
| --- | --- | ---: |
| R2 design | f4a3abfb0ded0a032ce1feee37373b654f8eb9c3d0c33a7ea26b8be647eb744c | 83785 |
| R2 plan | 90419e80840eaba4d9d080cc6bf980f472634159e50498d6871b0092df2264f2 | 54113 |
| R2 specification.json | 7eaace9e84673b17c3730a048ecfe18e7cceef7309021ca6572f4fad111cc396 | 100722 |
| Retained continuation | 9d94b004df346c028e87e0276ef9a66ff9cea510514cef3d8a66344dd61a2a90 | 13352 |
| R3 correction plan | ed030c1d76ac148b6c899e3c9b22aee4a5bf9beba1ac11af1604b7a49e414ca2 | 12523 |
| R3 nested contracts | c6d2733cc036f9a29e352ca305df9f567a77159a45c10f4fb39b792ec6b4353e | 12676 |

Last observed direct GREEN: exit0, 37 tests, 36 passed, 1 explicit provider-dependent notRun, 0 failed/cancelled. Four owned JS syntax checks exited0. The ordinary command first exited1 (VM named export unavailable; no fixture code ran), then exited1 (2 wrappers passed, 2 unguarded tests failed). The wrapper was corrected to use namespace imports, guard all realm-only tests, remove only Node's internal NODE_TEST_CONTEXT runner channel from its child environment, and require actual nonempty suite output. Worker/session identity variables are retained; the real process environment is unchanged. The corrected wrapper has not yet been verified.

A read-only inventory found one residual owned tree, test/.lifecycle-fixture-acceptance-JgrOy9, containing only data/runs-v2/55130f0d-7ce3-4c8b-a882-305acece244c/delivery-v1/stages.sqlite (28672 bytes; SHA256 68a0490510bb05e726900766bd85a5aef37d796ff0020f30f3aae2690ef80808). It holds one synthetic stage record created at 2026-10-15T19:13:07.893Z and no environment snapshot/credential payload. No matching Node test process was observed. Cause is not established; do not infer it from the wrapper failure. Further mutating verification and deletion are paused for coordinator reconciliation, as required by worker instructions. No removal or blind retry has occurred. Until reconciled and scope is rechecked, the exact-six-file capture requirement is not satisfied and owned task status remains partial.

## R4 owned source handoff

This is the separately authorized `acceptance` correction for run `bc53e3e5-d39f-4b1d-a8fa-fd36584ce0bb`, generation 1, launch nonce `72cb5091-90ea-4896-865d-f5d612ebb5f0`. The actual start, hash-bound launch inputs, reviewed publication, task roster, selected skills and per-track source bindings agreed. The new writer HEAD was `a76aa77ea7790927247388e907015e92e9397f6f` (0.4.5). All six destinations were absent. Source leaves were ordinary single-link files and matched complete hashes/lengths before exclusive copies. Source ancestor checks also passed. No provider, residual SQLite, private payload, dependency tree or Git metadata was copied.

The immutable complete mapping is `C:/Users/ehart/repos/agent-workflow-worktrees/roadmap-pipeline-control/attempt-04/correction-source-acceptance-r4.json`, SHA256 `c6f739aa960be62171ea4aba19f55845de1cbfa11b667344997361c0cef6abcd`, 20011 bytes. It preserves every original base/candidate, capture blob, producer and reviewed integration descriptor. All original bases are null, all canonical upstream paths are absent, and all strategies are `new-file`; there is no manual-three-way path in this track.

For every relative path in the table, the exact copied source is `C:/Users/ehart/repos/agent-workflow-worktrees/roadmap-pipeline-control/attempt-04/correction-inputs-r4/<path>`, and its exact original candidate is `C:/Users/ehart/repos/agent-workflow-worktrees/roadmap-pipeline-control/attempt-03/acceptance-provisional-r4-inputs/files/<path>`. The original blob is `C:/Users/ehart/AppData/Local/agent-workflow/runs-v2/b978ff0f-91bb-4cf7-8c4c-72a0b8e48e13/workspaces/g1-w9-57e11372-4472-4766-9f33-5a665923da42/result/blobs/<sha256>`. Original and copied bytes agreed. Mode is `100644` for each path.

| Relative path | Copied/original candidate SHA256 | Bytes |
| --- | --- | ---: |
| engine/delivery-acceptance.mjs | dea1f435ce88e8685101ddc0f4c18773a30309d8a2716e1e18539e5e1fc30ae1 | 26476 |
| engine/stage-checkpoints.mjs | b9b58bbb0e32d7216671b8a981f257601a2c21c1897db9ee5c79d12f13779926 | 29388 |
| test/engine-delivery-acceptance.test.mjs | 17850a58a2523cb8b0ee3ac3e31bbe8b843c58d819a0e1964b6ada5d40ae7cf8 | 19633 |
| test/engine-stage-checkpoints.test.mjs | 82390386f226454e8788f0567072bc865d37da59f7c5964222efc20b335e12d7 | 22522 |
| docs/delivery-acceptance.md | d5d8cc980050a297b4a57920b54fbe5c558900da839f1f8eeda5e12f1a721498 | 19414 |
| docs/stage-checkpoints.md | 8416e9b0f3ca54fe8d04a89b3f4ec7602cae1c88239f7639abcecbc4cff1a758 | 10473 |

The preserved producer is run `b978ff0f-91bb-4cf7-8c4c-72a0b8e48e13`, generation 1, position 9, attempt 1, runtime `0.4.3-d08985b358bf286d-node24.18.0`, append request `1ce842a4-592c-4291-949b-28c7a3132b1a`, task `complete-acceptance-r3`. Its capture ID is `27bf42b7f97ba1a98fa26582784db5575a04f467379e960a23a6907a08b6d5f9`. Engine completion and a partial declaration remain distinct. Its strict-scope exception and original private residue remain unchanged and unaccepted. Earlier failed acceptance source, newer partial subset, old unknown reader slots 10/11/12 and never-started slots 16/17 also retain their actual recorded outcomes. A lack of model inference in old readers does not imply that their readiness/source commands never started.

## R4 behavior and executed checks

Snapshots now require numeric modes. Captures independently require string modes. Acceptance uses only the explicit `100644`/`100755` enum pairs, rejecting malformed types without coercion. Integrated byte/mode mismatches are checked before a missing capture provider can hide that deterministic refusal. Correct fixture bytes still require genuine provider verification and remain unknown when it is unavailable.

`JOB_OUTPUT` becomes rejected `check_output`; `JOB_SNAPSHOT` becomes rejected `integration_snapshot_drift` for source verification or `check_snapshot` for a check. Transport, process and unclassified unavailable evidence remain unknown. This is a bounded error projection, not proof that a genuine provider path ran. Original arrays must have the exact Array prototype, dense ordered own indices and data descriptors. Sparse arrays with compensating named keys, subclasses, named properties, accessors and proxies fail `ACCEPTANCE_INPUT` before ownership resolution; getter/proxy callbacks stay uninvoked. The valid-input control reaches ownership.

Actual command starts in this correction are separate from historical source outcomes. The hash-verified literal attempt-04 preflight command launched and exited 0, admitting Node v24.18.0 and the specified Node/Git/npm identities. Read/hash validation commands and the read-only Git HEAD command launched successfully. No command here is described as `notStarted`.

All affected commands used the admitted `C:/Program Files/nodejs/node.exe`, the actual assigned cwd and non-login PowerShell. In the following table, FILES means `test/engine-stage-checkpoints.test.mjs test/engine-delivery-acceptance.test.mjs`.

| Literal Node argument sequence | Actual result |
| --- | --- |
| `--experimental-vm-modules --test --test-name-pattern R4 FILES` before fixes | exit 1; 0 passed, 3 failed for sparse-array admission, lost JOB_OUTPUT classification and numeric snapshot refusal |
| `--experimental-vm-modules --test --test-name-pattern "R4 snapshot/capture" test/engine-delivery-acceptance.test.mjs` before bridge fix | exit 1; one failure, deterministic mode mismatch was hidden by unavailable provider |
| `--experimental-vm-modules --test --test-name-pattern R4 FILES` after fixes | exit 0; 4 passed |
| `--experimental-vm-modules --test FILES` | exit 0; 40 tests, 39 passed, 1 explicit integration skip, 0 failed/cancelled |
| `--test FILES` | exit 0; both isolated-suite wrappers passed and ran their child suites |

These were five actual top-level Node test invocations, including two expected RED exits. Test runner, wrapper and predecessor-contention child processes also executed; top-level invocation counts are not complete process or inference inventories. Fixture directories were absent before each invocation. Tests used only current owned fixtures, with no automatic rerun of uncertain effects or deletion of historical residue. Experimental VM warnings are expected tool warnings. No npm preparation was needed for these built-in-only tests.

The existing opt-in genuine-provider regression now requires a nonempty numeric-mode snapshot and actual captured bytes in that snapshot. It still requires real two-producer evidence, authentic job/check receipts, preservation of the partial producer, and blocked/failed/null/cached/owned-gap/output-corrupt/snapshot-drift negatives. It remains explicitly unrun here: `engine/command-jobs/index.mjs` and the reviewed integrated capture/jobs implementation are not present in this writer. No foreign provider was copied or fabricated. Local real-SQLite/blob fixtures and category probes cannot replace that integration test.

Both selected skills were genuinely activated through executor catalog pagination and returned `skills.read` package/main_resource bindings at the exact admitted retained workflow and tdd roots. Catalog discovery required ten pages; stable admitted-ID/root filtering remains a useful native-tool enhancement. Required associated tool IDs are none. The six approved specification/recovery files matched their complete hashes and sizes; per-track source/checkpoint descriptors and the recovery plan's 23 descriptors were reverified without executing frozen source. Recovery from package loss and catalog drift still requires coordinator reconciliation and fresh admission; old bindings and unknowns are not rewritten.

Delivery remains unaccepted. Root owns combined provider validation, actual captures/check imports, stress/native/browser/full test/check/smoke/install gates, refreshed 18-prefix inventory, F0/V0 verification, clean final materializer capture, final F/V authentic checks, release and wiki/friction follow-through. F0 reports cannot be relabeled final F checks. The original data instance and all prior runtime/producer identities remain normative. This writer supplies the full six actual source files for independent review and capture; it does not self-accept them.
