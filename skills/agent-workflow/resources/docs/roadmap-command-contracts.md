# Roadmap command contracts

This candidate extends the published 0.4.5 CLI. The approved R2 design, R3 nested acceptance contracts, retained-source continuation and reviewed R4 clarifications govern provider contracts. Interfaces owns parsing, bounded input, dispatch and documentation; provider acceptance waits for reviewed combined integration.

All commands use `node "<plugin-root>/bin/launch.mjs"` and accept `--data-dir` and `--help`. No command installs a runtime implicitly. Run-bound commands use the run's recorded runtime. A missing module/export is unsupported; it never selects current code as a fallback.

| Command | Additional options | Authority |
| --- | --- | --- |
| capture-preflight | --cwd, --capture-policy | Current runtime, read-only |
| plan [scope:]name | --cwd, --script (exclusive with name) | Current runtime, inert |
| usage ID | --generation | Recorded runtime, read-only |
| acceptance ID | --session, --request-file | Origin session, read-only assembly |
| checkpoint-record ID | --session, --request-file | Coordinator mutation |
| checkpoint ID | --checkpoint-id OR --after/--limit | Recorded runtime, read-only |
| check-record ID | --session, --checkpoint-id, --check-id, --job-id | Coordinator imports internally recorded check |
| job-start ID | --session, --request-file | Coordinator mutation, original policy |
| job-status ID | --session, --job-id | Origin session, read-only reconnect |
| job-output ID | --session, --job-id, --stream, --after, --limit-bytes | Origin session, bounded private bytes |
| job-cancel ID | --session, --job-id, --request-id, --revision | Coordinator mutation |

Request files are bounded regular single-link UTF-8 files with no linked ancestors. Acceptance is limited to 65,536 bytes, checkpoints to 1,048,576, command jobs to 2,097,152, capture policy to 2,097,152 and plan source to 1,048,576. Files are read through one handle with pathname/handle device, inode, mode, link count, size and nanosecond timestamp checks before and after reading. A link count other than one or detected drift refuses input before provider import. Provider schemas remain authoritative, including nested keys and snapshot/check identities.

R4 changes only the job request file and serialized `CommandJobRequestV1` ceiling from 131,072 to 2,097,152 bytes (2 MiB), including its snapshot. Snapshots remain limited to 1 MiB; literal command vectors remain at most 256 strings and 65,536 aggregate UTF-8 bytes. The jobs provider independently enforces the 2,162,688-byte public options wrapper and 4,194,304-byte private ledger record. Those bounds do not expand public responses (1 MiB) or receipt metadata (65,536 bytes), and private environment/ownership fields are never returned. Provider integration must verify all envelopes together.

`engine/cli.mjs --inspect` maps only plan, capture-preflight, usage, acceptance, checkpoint, job-status and job-output through `bin/command.mjs.main`. Use `--run-id` for saved reads and the public command's exact options. A positional name is allowed only for plan. Raw `--run`, start/control flags, duplicate options and arbitrary forwarding reject before dispatch. This path does not select another runtime: use the public launcher when the saved runtime differs.

## Provider agreement

| Command | Exact provider export and arguments |
| --- | --- |
| capture-preflight | `engine/capture-preflight.mjs`: `preflightCapture({source,capturePolicy})` |
| plan | `engine/plan-preview.mjs`: `previewPlan({script})` |
| usage | `engine/usage-summary.mjs`: `readUsageSummary({dataDir,runId,generation})` |
| acceptance | `engine/delivery-acceptance.mjs`: `assembleDeliveryAcceptance({dataDir,sessionId,request})` |
| checkpoint-record | `engine/stage-checkpoints.mjs`: `recordStageCheckpoint({dataDir,runId,sessionId,expectedPreviousId,requestId,record})` |
| checkpoint | Same module: `readStageCheckpoint({dataDir,runId,id})` or `listStageCheckpoints({dataDir,runId,after,limit})` |
| check-record | Same module: `recordVerificationCheck({dataDir,runId,sessionId,checkpointId,checkId,jobId})` |
| job-start | `engine/command-jobs/index.mjs`: `startCommandJob({dataDir,runId,sessionId,request})` |
| job-status | Same barrel: `readCommandJob({dataDir,runId,sessionId,jobId})` |
| job-output | Same barrel: `readCommandJobOutput({dataDir,runId,sessionId,jobId,stream,after,limitBytes})` |
| job-cancel | Same barrel: `cancelCommandJob({dataDir,runId,sessionId,jobId,requestId,expectedRevision})` |

Arguments are constructed individually. Providers are imported lazily from this selected runtime. Missing modules, transitive dependencies or exports produce a bounded `unsupported` result. They never trigger installation or selection of a different implementation. Provider errors are projected without native stderr, command bodies or private path diagnostics. Normal JSON responses are limited to 1 MiB; bulk output remains in retained files or pages.

Acceptance files have exactly `{schemaVersion:1,run,planHash,checkpointId,objectiveIds}`. The CLI compares `run` against the positional ID, recorded runtime and the monitor's canonical data-instance identity (platform-normalized realpath/device/inode/birthtime hash). It never trusts a submitted outcome. Checkpoint files have exactly `{schemaVersion:1,requestId,expectedPreviousId,record}`; generated ID/time/hash fields belong to the provider. Job files have exactly `{schemaVersion:1,requestId,command,cwd,environment,deadlineMs,outputLimitBytes?,kind,verification}`. The provider supplies the default output limit. Unknown root fields reject before import; nested provider schemas, UUIDs, exact original policy and ledger identity are still validated by the provider.

Job command argv includes its absolute executable as element zero. It is never shell-parsed. The job environment contract is `{mode:'inherit'}`; explicit job deadlines are 1..86,400,000 ms including queue time, independently of worker wall budgets. CLI flags cannot supply access, backend, current UI, private output paths, executable hashes or an asserted receipt. Output defaults are byte cursor 0 and page size 65,536; stream is explicitly stdout or stderr. Checkpoint listing defaults to after null and limit 50. Numeric flags use canonical safe decimal strings, without signs, exponent notation or leading zeroes.

## Exit and lost-response semantics

Successful reads and ready preflight exit 0. Blocked preflight exits 1. Acceptance exits 0 only for `complete:true`; partial, missing, rejected and unknown rows remain visible with exit 1. Malformed inputs, conflicts and unsupported providers exit 1.

Job-start and job-status exit 0 when their provider returns a readable admitted receipt, even when execution is queued, failed or unknown. Inspect state/outcome, output integrity and cleanup. CLI exit 0 never proves command execution succeeded. Job-cancel exits 0 only when the returned cancellation has the same request ID and recorded/sent/confirmed status; it does not prove drain. Check-record exits 0 only for a schema-v1 observed/passed exit-0 receipt with serverExited/jobEmpty true and forced false. The provider must authenticate its job/check/snapshot/output facts; the CLI cannot create positive evidence from caller JSON.

After lost stdout, inspect the same job/request/record rather than repeating a mutation. A process that exited nonzero was executed and may have effects. Positive owned job cleanup does not reconcile global external effects. Readable failed historical acceptance producers remain failed; capture integrity alone cannot accept them.

Source retention and native answer budgets from 0.4.3 remain unchanged. Canonical wiki discover/ingest, architecture/roadmap updates, package/lock/release metadata, clean-install checks and final acceptance belong to the coordinator. Preserve clean-install scope filtering: compare exact bundled plugin definitions separately from the owned project fixture, without counting personal definitions. The signed job helper is unchanged.

## Verification evidence

### Recovery R4 correction evidence — delivery remains unaccepted

This new native interfaces correction belongs to run `bc53e3e5-d39f-4b1d-a8fa-fd36584ce0bb`, generation 1, nonce `72cb5091-90ea-4896-865d-f5d612ebb5f0`. Actual start/launch routing, the reviewed source-corrections gate and its selected interfaces assignment matched before writes. The complete per-path upstream/base/candidate/producer mapping remains in the immutable `attempt-04/correction-source-interfaces-r4.json`, SHA-256 `6e7f22c1be896586891a592e6cf68c9c634b7d327c9a956de8d87f5ad0868413`, 22,121 bytes. Its original partial declarations and capture references were not rewritten. Seventy-two referenced descriptors passed the pre-materialization identity audit. This establishes input identity, not semantics or delivery acceptance.

The four manual-three-way paths used 16 exact canonical-to-reviewed-source textual hunks with verified preimages/postimages; they were not overwritten with old candidates. The other two paths used their declared verified copies. All six complete files first matched the reviewed handoff. The published 0.4.5 startup parser/default/zero/range/foreground checks, run/resume/restart forwarding, and MCP startup-plus-protocol/nativeInventory documentation remain present. Only these six owned paths changed; provider/shared implementations were not copied.

Genuine executor discovery required ten catalog pages. Native main-resource reads activated exactly `workflow` and `tdd` at their admitted run-retained roots, with a native TDD anti-pattern reference read. The separately admitted retained Workflow API matched SHA-256 `6fc28214a46536f19cc1df44dba11dc387bca0e122129f6182920124399d0b42` (33,017 bytes). Availability, invocation, associated-tool readiness, semantic review and acceptance remain separate; required associated-tool IDs were empty.

Meaningful RED runs exposed the old 128 KiB refusal and missing link-count checks before the fixes. The first boundary assertion also produced a JSON-parse error on empty refusal stdout; it was corrected to assert the actual refusal, and the second RED retained the expected assertion failures. GREEN verifies 131,073-byte and exact 2 MiB job files reach honest missing-provider handling; one byte over refuses before import. This is raw CLI file-envelope evidence, not proof of a genuine large verification-snapshot job. Deterministic filesystem metadata fixtures verify linked pathname/handle/after-read refusal and changed-path identity refusal without creating links or supplying successful provider exports.

The final affected selection passed 14 tests, failed zero and skipped two. It includes the published detached startup forwarding/regression owner. An earlier expanded selection failed the existing deadline parser test because it implicitly inherited the worker environment; passing its explicit empty fixture environment corrected test isolation without disabling the production worker guard. The physical hardlink subtest is prepared but skipped under `AGENT_WORKFLOW_WORKER=1`, since this writer may not create filesystem links. The real integrated-provider public-read test is also prepared and skipped: its five required provider files are absent. It uses actual provider exports and isolated managed-runtime fixtures when admitted by the coordinator; its inert native scaffolding is never native job qualification. Full managed-entry execution, authentic mutation/receipt semantics, actual older-runtime unsupported behavior, physical link/reparse races and signed-host checks still require independent validation.

Actual command starts are recorded separately from source availability: the hash-verified literal preflight and authorized local offline npm preparation exited 0 (35 packages); four syntax commands, `npm run check` and the owned whitespace check exited 0. Five affected test commands exited `1,1,0,1,0` in that order. Read-only inspections also executed; one PowerShell inspection exited 1 on a parse error. A supplemental integrity helper exited 1 because it misinterpreted another track's exclusion-payload total as a descriptor's raw file length. The subsequent bounded diagnosis found the retained SHA-256 matched: `exclusions.json` was 251,084 bytes, while `bytes:472164333` described excluded payload. That failed helper remains a failed inspection, with no source-drift claim. No command in this correction was classified notStarted. Some earlier inspection responses were truncated; delivered files are complete.

Historical source/effect evidence remains separate and unchanged. The earlier acceptance/jobs source-loss failures, completed-partial producers, original slots 10/11/12 unknown and 16/17 never-started, acceptance strict-scope exception/private residue, and failed original read/Git commands retain their recorded meanings. Initial interfaces review's Git query executed and exited 128; it was not a notStarted event. Zero model inference never establishes zero process/command starts or global absence of effects. The original data instance, both package-loss/catalog-drift recovery cases, cumulative accounting, F0/V0-before-report and distinct final F/V ordering remain coordinator requirements. Full capture/drain review, combined providers/tests/check/smoke, clean-package verification, production audit, native/browser qualification and wiki synchronization remain pending. These files do not self-accept the delivery.

### Earlier retained producer evidence (unchanged)

Initial artifact: this command/authority table preceded implementation. Exact preflight argv used the admitted `C:/Program Files/nodejs/node.exe` and attempt-03 `preflight.mjs`; script SHA-256 `12938acf530342c1090037501e9c19d1013c4fd06a8b887ef821b8263d466fc8` and prerequisite receipt `44536ae22cf28ec16e23e8e5f3ee1bfab12706e402b1d5d26dc9aec24aaefc7c` matched args. Actual Node v24.18.0, Git 2.55.0.windows.3 and npm.cmd identities passed without installation. Authorized local `npm.cmd ci --ignore-scripts --offline` then exited 0, adding 35 packages. This is local dependency preparation, not managed setup or a new production audit.

Native executor catalog pagination selected IDs workflow and tdd, followed by genuine main-resource reads. Both returned exact admitted retained skill roots. The out-of-package Workflow API reference was hash-verified as `8fe615e191fb9c711e0365252fe206d98893c57a4a66cdeb102d081b4a6631f2`, matching the initial owned API document. Approved R2 design/plan/specification and continuation bytes matched their assigned hashes. Original 0.4.1 coordinates in R2 are provenance; the source baseline is published 0.4.3.

Observed RED: the first targeted parser test exited 1 with `Unknown command: capture-preflight`. After adding strict parsing, it passed. The new bounded-input process test then exited 1 because plan fell through to an absent owner rather than reading the file; exact bounded dispatch fixed it. Its GREEN covered invalid UTF-8, oversize/nonregular inputs, malformed/unknown request fields, run identity mismatch, inspect execution-flag refusal and honest missing-export output. The help/API test was RED on absent capture-preflight help before documentation was added.

Observed GREEN commands used `C:/Program Files/nodejs/node.exe --test --test-name-pattern=PATTERN test/managed-entry.test.mjs`: parser alone 1/1; parser plus bounded inputs 2/2; bounded inputs plus inspect normalization 2/2; help/API 1/1. These overlap and are not a full-suite total. Independent `--check` on all four changed JavaScript/test files and exact verified Git `--no-optional-locks diff --check` passed. Test source subjects include the legacy CLI and both owned documentation files.

The complete managed-entry suite is **not verified** in this worker. Its managed-runtime upgrade fixture directly calls `installRuntime`, which explicitly rejects the observed `AGENT_WORKFLOW_WORKER=1`; that guard was not cleared. The routing fixture is extended to cover every new command but awaits coordinator execution. A selected-suite command preserving that guard, with owned TEMP/TMP setup and cleanup, was rejected before process creation by automatic policy review. Exact requested executable/argv was `C:/Program Files/nodejs/node.exe --test --test-skip-pattern="public launcher selects the run-pinned runtime after upgrade" test/managed-entry.test.mjs`, inside non-login PowerShell `C:/Users/ehart/AppData/Local/Microsoft/WindowsApps/Microsoft.PowerShell_8wekyb3d8bbwe/pwsh.exe`. Tool evidence was `CreateProcess ... Rejected ... blocked by policy`, so this command was notStarted. No alternate shell, permission change or equivalent retry was attempted. The coordinator must run the affected file, including the retained-runtime fixture, in its admitted test workspace.

Provider-success checks are **not run** here: actual capture-preflight, inert preview topology, usage lineage, acceptance assembly, checkpoint persistence, job admission/output/cancel and authentic check-receipt exit semantics require the reviewed integrated provider files. Unsupported-export tests use an explicitly empty test-only module, not a synthetic successful provider. Full combined test/check/smoke, clean-package install, native model-free job qualification and fresh integrated acceptance remain coordinator gates. Physical link/reparse fixtures are not created under this assignment's no-filesystem-links constraint.

## Observed friction and missing acceptance

| Reproduction | Effect class | Owner | Missing acceptance |
| --- | --- | --- | --- |
| Selected standalone workflow/tdd IDs occur on the tenth unfiltered executor catalog page; duplicate-name parent packages occur earlier | Read-only discovery overhead; activation subsequently succeeded | Native skills catalog host | Supported ID/root filters preserving returned identities, pagination and duplicate semantics |
| Large independent file reads combined in one exec response exceeded its output budget and were truncated | Read-only output loss; no filesystem effects | Worker tool orchestration | Smaller bounded reads; never treat a truncated response as complete evidence |
| All new provider modules are absent from this 0.4.3 writer baseline; other tracks have separate worktrees | Dependent verification unavailable; independent CLI authoring proceeds | Root integration plus provider owners | Review exact retained providers, integrate them, then run genuine public command/return semantics and clean install |
| The selected managed-entry suite command with in-worktree temporary setup/cleanup receives CreateProcess rejection, reason "blocked by policy" | notStarted; no process or filesystem effects from that command | Host automatic execution-policy review plus root coordinator | Admit and execute the exact affected suite without weakening policy; preserve the rejection and untouched worker guard |

The retained handoff identifies capture position 10 and inspection position 13 as completed, acceptance position 11 as failed CAPABILITY_SOURCE_CHANGED with partial captured implementation, and jobs position 12 as failed with no reusable implementation. None is semantically accepted by this writer; completed capture/inspection writers were not repeated. No remote calls, signing, Git mutations, nested workflows or delegation were performed. Wiki follow-through stays with root under its separate scope.
