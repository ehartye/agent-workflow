# Durable command jobs

The jobs module owns command execution separately from a model session. Its public
entry points are `startCommandJob`, `readCommandJob`, `readCommandJobOutput`,
`cancelCommandJob`, and `verifyIntegrationSnapshot`. Command vectors include the
absolute executable at index zero. Output and environment values remain private.

Admission binds the saved run, originating session, original access policy,
retained runtime, exact executable, cwd, effective environment and fixed deadline.
The deadline includes queue time. A request ID is an idempotency key, never a
retry instruction. An uncertain dispatch or owner claim cannot be adopted.

The detached owner uses the existing signed Windows host around AppServer and
`command/exec`; it never wraps the requested command directly or starts a model.
Terminal success requires a native command result, verified spools, and positive
unforced signed-host drain. A clean job does not reconcile external effects.

This is a source implementation with protocol-fixture coverage. Genuine managed
Windows qualification and reviewed provider integration remain required.

## Module contract

All five public functions are asynchronous and exported only from
`engine/command-jobs/index.mjs`. Starts, status, output and cancellation take the
saved `dataDir`, `runId` and originating `sessionId`. Starts additionally take:

```json
{
  "schemaVersion": 1,
  "requestId": "00000000-0000-4000-8000-000000000002",
  "command": ["C:/Program Files/nodejs/node.exe", "C:/owned/check.mjs", ""],
  "cwd": "C:/owned/validation",
  "environment": {"mode": "inherit"},
  "deadlineMs": 10000,
  "outputLimitBytes": 1048576,
  "kind": "normal",
  "verification": null
}
```

The first command element is the executable; check receipt `argv` is the remaining
array, including empty strings. No shell is inserted. The request has no access,
output-path, environment-value or outcome overrides. Unknown properties fail.
`outputLimitBytes` defaults to 1 MiB; it can be 1..16 MiB. Commands have at most
256 strings and 65,536 aggregate UTF-8 bytes. The serialized request is at most
2 MiB (2,097,152 bytes), including verification. The public options wrapper is
bounded separately at 2,162,688 bytes. Original arrays must be dense ordinary
arrays with only enumerable index data descriptors; trailing holes, subclasses,
named properties, accessors and proxies are refused before normalization. Exact
argv, empty strings and Unicode remain unchanged.
Environment inheritance captures the coordinator's actual environment
once; later status callers cannot replace it. Only its hash enters the receipt.

The explicit deadline range is 1..86,400,000 ms, independent of worker wall time.
R3 removes the temporary 20,000 ms start rejection. The root's hash-verified
signed-host parameter probe accepted native `timeoutMs:86400000` and RPC
`timeoutMs:86415000`, with a command lasting 32 seconds and positive unforced
owned drain. This supports the parameter range, not a 24-hour execution, execution
beyond 30 minutes, durable-job/native acceptance, cancellation, reconnect, owner
death or checkpoint acceptance. No caller assertion qualifies those separate
checks. Invalid deadlines still fail schema validation. A native worker's
`JOB_WORKER` refusal precedes validation and remains distinct from a deadline or
native qualification result.

`startCommandJob` returns a readable admitted receipt; it does not wait for command
completion. New jobs require a running or positively completed saved run. Reads
and explicit cancellation preserve existing receipts even if run status later
changes. Old runs lacking the original policy or matching retained runtime fail
closed. `AGENT_WORKFLOW_WORKER=1` blocks public mutations.

If no terminal owner observation exists more than30 seconds after the caller's
job deadline, reads project `unknown` / `JOB_OWNER_UNOBSERVED` for every remaining
nonterminal state, including admitted and queued jobs with no dispatch intent.
The30-second terminal-observation allowance is unchanged. This read does not
persist a new outcome, claim an owner, release a lease, dispatch a command or
certify cleanup. The original receipt and any later genuine owner evidence stay
intact; inspect/reconcile rather than redispatching after launcher or owner loss.

`readCommandJobOutput` takes `jobId`, `stream` (`stdout`/`stderr`), `after` (default
0) and `limitBytes` (default 65,536, range 1..65,536). It returns `dataBase64`, byte
`nextCursor`, `hasMore`, totals, truncation and coverage. A cursor cannot enter
dropped output. Splitting a UTF-8 character is valid at this binary boundary;
consumers decode only after joining bytes. Reads verify hashes on a stable open
file. A concurrent writer may make a read unavailable; that never cancels a job.

`cancelCommandJob` takes `jobId`, a fresh cancellation `requestId`, and the observed
`expectedRevision`. Queued cancellation is durable without dispatch. A running
owner records `sent` before its single terminate RPC and confirms only an observed
response. Re-reading that cancellation request is safe; changed IDs/revisions
conflict. Unknown cancellation or command effects are never resent automatically.

Verification requests additionally bind `{checkpointId,checkId,snapshot}` to the
acceptance provider's immutable checkpoint. Executable/hash/argv/cwd/environment,
source and validation manifests, content and dependency identities must agree.
The command's canonical cwd must equal the verification snapshot's canonical root
at admission and on owner rechecks, even when the checkpoint names the same wrong
cwd. A checkpoint cannot authorize executing outside its validation snapshot.
The provider is dynamically resolved from this retained runtime. This baseline has
no `engine/stage-checkpoints.mjs`; dependent execution fails
`JOB_CHECK_PROVIDER_MISSING`. No provider bytes were copied from retained reports.

## Persistence and ownership

Each run owns `command-jobs-v1/jobs.sqlite`, private admission records and UUID
output directories. The data instance owns `command-jobs-v1/admission.sqlite`.
SQLite `BEGIN IMMEDIATE` transactions with an attached rollback-journal database
serialize heavy acquisition across owners. There is one heavy slot per data
instance, independently of model concurrency. Unknown owners retain their lease;
neither an expired timestamp nor PID absence grants takeover.

A launch nonce is reserved before the one detached Node spawn. The owner claims
it once, retaining its PID and process-start observation. Reconnect never launches
another owner. There is no lease-expiry adoption, periodic redispatch or public
reset API. After a fixed deadline and missing terminal observation, a read can
project `unknown`; it cannot fabricate drain or safe retry. Exact Windows process
creation-handle hardening and owner-death native qualification remain unverified.

There are at most 64 pending and 1,024 retained jobs per run. Retained evidence is
never erased to admit another job. Receipt metadata is limited to 64 KiB; complete
snapshots reside in immutable hash-addressed SQLite evidence rows. Expanded API
responses are bounded by 1 MiB and fail rather than truncate. The private admitted
record is bounded at 4 MiB, with its request bounded at 2 MiB and environment at
1 MiB. These limits apply on persistence writes and reads, including owner
handoff. Two complete snapshots can remain in private evidence even when their
public expansion exceeds 1 MiB and must be refused. Refusal preserves the durable
record and grants no redispatch. The private environment must never be included
in delivery output.
Directories/files request private filesystem modes, inheriting the existing
Windows account boundary without changing system ACLs or configuration.

AppServer is started through `buildJobHost` with the unchanged packaged signed
helper and the saved Session 0 selection. Existing managed ChatGPT account/config
checks precede execution; there are no model-turn RPCs, API-key billing fallback,
runtime installation or signing operations. Native `timeoutMs` is the remaining
admission deadline and the command RPC timer adds 15 seconds. Cancellation has a
separate 15-second observation timer. A host's exit is never the command exit.

Output notifications must match the native process ID, stream, canonical base64
and a 64 KiB decoded-frame ceiling. Synchronous bounded writes avoid an unbounded
asynchronous queue. After the combined retention cap, notifications still drain
and observed/dropped totals advance. Native cap/transport loss makes those totals
lower bounds. The chunk index groups each stream in blocks up to 4 KiB, ordered
by first observation; it does not promise original per-delta interleaving within
coalesced blocks. It has at most 8,192 entries / 1 MiB. Hashing and page reads use
bounded buffers. Corruption, write failure or lost transport yields unknown
acceptance and owned shutdown.

Only `observed` execution with native exit 0, verified spools/index, and
`serverExited:true`, `jobEmpty:true`, `forced:false`, exact drained host receipt,
host close/exit 0/signal `none` may become `succeeded`. The existing shared-Session-0
rejected-before-spawn receipt remains a blocked execution, despite its separate
cleanup predicate. Cleanup covers Windows job members; arbitrary external effects
and descendants outside that boundary remain unreconciled.

`verifyIntegrationSnapshot` reads the complete root inventory, explicit exclusion
metadata and file/tree dependency bytes. It checks canonical root/device/inode,
literal paths, ordering, case conflicts, link/hardlink refusal, content hash and
full manifest hash using the approved R1/R2 preimages. Snapshot and dependency-tree
file modes are exact JSON numbers `100644` or `100755`; capture mode strings stay
the acceptance provider's separate contract. Only root administrative `.git`
metadata and explicitly prepared `node_modules` payloads may be excluded. Every
excluded dependency entry requires a separately named complete dependency tree,
including when its directory row is absent. A rehashed exclusion cannot hide an
implementation, test, recipe, package, HTML/CSS or documentation input. It creates no
files, dependencies or Git objects. Validation copies keep their distinct root
manifest and must match source content/dependency identity.

## Original producer checks and remaining acceptance

Preflight was executed as the exact Node/script argv in non-login PowerShell.
Both args-bound hashes matched: script
`12938acf530342c1090037501e9c19d1013c4fd06a8b887ef821b8263d466fc8`,
receipt `44536ae22cf28ec16e23e8e5f3ee1bfab12706e402b1d5d26dc9aec24aaefc7c`.
Node v24.18.0, Git 2.55.0.windows.3 and `npm.cmd` identity checks passed with no
installation. All four supplied approved documents were fully read and their
declared byte/hash identities matched. Published 0.4.3 is the source baseline.

Genuine executor catalog pagination located selected IDs `workflow`, `debug`,
`tdd`. Each `skills.read` used its returned package and `main_resource` and returned
the admitted run-retained root under run
`b978ff0f-91bb-4cf7-8c4c-72a0b8e48e13/source-packages-v1/packages/`:

- Workflow: `a8758a93bc0336e375755be6af7b7b3de76da8c9868c6e168b0c68122c63bd3e/skills/agent-workflow`.
- Debug/TDD: `c1aa80898169b589a8c1c575c308bf417e1d5e488567771540d03c2cbfd086f7/skills/systematic-debugging` and `skills/test-driven-development`.

No shell read substituted for activation. No nested workflow or delegation ran.
The retained jobs producer has no reusable implementation. The old acceptance
producer remains failed/partial; this code does not accept it.

The literal affected command is
`C:/Program Files/nodejs/node.exe --test test/engine-command-jobs.test.mjs`,
cwd this assigned worktree. Initial RED (exit 1, one failed test; tool chunk
`8cf7c1`) showed the missing durable implementation. The first reconnect GREEN
(exit 0, 1/1; `a3cebb`) exercised an actual detached owner after launcher exit.
The broader RED (`d773c6`, exit 1, 9/15) caught missing excluded-dependency
rejection, replay normalization and fixture cleanup ordering. GREEN `2df9b2`
passed 15/15. The malformed-frame control first failed `succeeded` versus
`unknown` (`3abc21`), then the real malformed protocol fixture exercised refusal.
The expanded GREEN `b3202b` passed 18/18 with no skips. Removing the complete
invocation replay-conflict guard made the idempotency test fail with “Missing
expected exception” (`427c58`, exit 1, 0/1); the guard was restored. GREEN
`58f218` passed 19/19 with zero failures/skips. A final transport-loss regression
first failed because `observed` start became `unknown` (`9d347a`); preserving the
observed start while retaining unknown effects fixed it. Final GREEN `6b4a3a`
passed 20/20 with no failures/skips plus all nine syntax checks. `5ec15e` also
passed all nine module,
test and fixture syntax checks and confirmed that all five helper source,
policy/manifest/binary/verifier hashes match the published baseline. These are
source/package equality checks, not a new Authenticode or native execution pass.

Protocol fixtures use real Node processes, real SQLite/files, actual JSON-RPC
transport and synthetic managed-account/config/host facts. Their receipts cannot
pass public retained-runtime admission. They prove persistence/protocol seams,
not a signed-host native execution or managed authentication acceptance.

Remaining coordinator checks are genuine signed-host/AppServer zero-model
execution (including >30 minutes and durable-job qualification), actual inherited
marker/argv/cwd/stderr/exit evidence, real owner death and descendant drain,
reconnect, native cancel/deadline, wrong-session/runtime/cwd controls, checkpoint
provider integration and validation-copy before/after checks. Full integrated
`npm test`, `npm run check`, `npm run smoke`, clean install and production audit
remain root-owned. No dependencies were needed for these builtin-only tests and
no npm install was attempted. Native process creation identity is not claimed as
an OS handle attestation.

## Friction and retained failures

| Reproduction / observation | Effect class | Owner | Missing acceptance |
| --- | --- | --- | --- |
| Native `skills.list` required ten pages before the specifically selected retained IDs; duplicate skill names occurred earlier. | Read-only discovery friction. | Native executor skills catalog. | A selected-ID filter must return the same admitted package/resource/root without losing genuine activation evidence. |
| Initial read-only probes for guessed `bin/run-resolution.mjs` and `bin/resolve.mjs` failed; PowerShell literal wildcard arguments to `rg` produced OS error 123. Actual owner is `bin/managed-runtime.mjs`. | Failed read/search, no mutation or installation. | This worker's source navigation. | Use `rg --files` and directory search before choosing a file; no missing executable is inferred. |
| The first broader test run attempted temporary removal before closing SQLite handles and received Windows `EBUSY`. A later run observed terminal receipts before detached owner exit and also received `EBUSY`. | Executed local fixture mutations with failed cleanup; no retry of the failed trees. | Jobs test harness / coordinator reconciliation. | New fixtures observe owner exit before their first removal. Root must privately inspect/reconcile the seven original trees below; terminal command status alone is insufficient. |
| No checkpoint implementation exists in the assigned baseline; full native durable-job execution remains unqualified. | Missing provider/qualification, no dependent native execution attempted. R3 separately retains limited parameter-range evidence. | Acceptance writer and root native verifier. | Integrate reviewed provider bytes and obtain genuine recorder/native receipts. |

Retained failed cleanup roots are `.command-jobs-test-FS8OC1`,
`.command-jobs-test-H0tzhu`, `.command-jobs-test-J28Udn`,
`.command-jobs-test-tdUI6t`, `.command-jobs-test-v8g3if`,
`.command-jobs-test-NVkAKx`, `.command-jobs-test-YYC0Hb` in the original producer's private worktree/capture.
The first five can contain private fixture environment snapshots from the initial
test harness; **do not integrate or publish them**. They were not retried,
sanitized, moved or erased after uncertain cleanup. Root owns private
reconciliation and capture handling. These failures are not global evidence that
no external effects ever occurred. New `.command-jobs-test-` temporaries must be
added to the reviewed V-only fixture inventory before integrated frozen checks.
Wiki discovery/ingest and canonical roadmap updates remain root-owned under the
fixed writer scope; this ledger supplies the concrete reproduction and gaps.

## R3 correction handoff and checks

Task `correct-jobs-range` uses its actual assigned worktree
`workflow-da34569c-95ee-4f55-9f7b-74c596b836b3`, initially published 0.4.3.
This is an explicit external-file handoff. The original captured input identity,
producer outcomes and captures remain unchanged. No excluded test tree,
environment snapshot, database, spool, dependency payload or other provider was
read or copied. All ten destinations were absent, unambiguous paths. All ten
ordinary single-link source files matched the admitted hashes/lengths before
exclusive creation; all ten destination bytes then matched. Source manifest and
files were rechecked immediately after copying and at completion. The six frozen
provider files retain their handoff hashes. Only index, test, fixture and this
document changed after materialization.

Actual controlling inputs, fully read and verified as raw-byte SHA-256/length:

| Input | SHA-256 | Bytes |
| --- | --- | ---: |
| `attempt-03/correction-inputs-r3/jobs/manifest.json` | `a288831fb5cd9858c07e8d9d3f1e332245018af55d653e44a3e138e26a370aea` | 10512 |
| `attempt-03/correction-plan-r3.md` | `ed030c1d76ac148b6c899e3c9b22aee4a5bf9beba1ac11af1604b7a49e414ca2` | 12523 |
| R2 design | `f4a3abfb0ded0a032ce1feee37373b654f8eb9c3d0c33a7ea26b8be647eb744c` | 83785 |
| R2 plan | `90419e80840eaba4d9d080cc6bf980f472634159e50498d6871b0092df2264f2` | 54113 |
| R2 specification | `7eaace9e84673b17c3730a048ecfe18e7cceef7309021ca6572f4fad111cc396` | 100722 |
| Retained continuation | `9d94b004df346c028e87e0276ef9a66ff9cea510514cef3d8a66344dd61a2a90` | 13352 |
| Root `native-range-2026-10-15T18-16-11.831Z-ee02744e-ec25-46ac-869e-34787ea67817.json` | `5c66019e28cdc536168f89b5d67118cc95eed349afb228be6cd53d727ac1b917` | 2651 |

Exact preflight argv:
`["C:\\Program Files\\nodejs\\node.exe","C:\\Users\\ehart\\repos\\agent-workflow-worktrees\\roadmap-pipeline-control\\attempt-03\\preflight.mjs"]`.
The script/prerequisite hashes recorded above matched. Execution exited 0 and
verified Node/Git/npm identities. Workflow/debug/tdd were genuinely listed/read
using returned package/main-resource/root identities; catalog discovery again
required ten pages. No skill body was shell-loaded.

Fixture environments now use owned temporary paths, the actual Node directory,
literal platform settings and a synthetic marker. They preserve the actual
worker mutation guard and inherit no caller PATH, TEMP, unrelated variables or
credentials. Every fixture subprocess uses that construction. Production jobs'
effective environment inheritance stays unchanged in frozen `context.mjs`.
Fixture run IDs are unique; the fixture data-instance hash derives from the owned
directory. No owner API targets real saved runs.

Teardown has one ordered hook: observe all registered fixture owners' actual exit,
close every parent store, then perform the first removal. The reconnect fixture
also observes owner exit and closes its SQLite reader before returning. Missing
exit or cleanup failure preserves the tree and fails the check, without removal
retry. The seven old private trees were never inspected or changed.

Commands used exact Node, literal argv and non-login PowerShell in the assigned
worktree. The executable for every row is `C:/Program Files/nodejs/node.exe`.

| Stage | Node argv (excludes executable) | Actual result |
| --- | --- | --- |
| RED before fixes | `["--test","--test-name-pattern=fixture seeding\u007cdeadline schema\u007cnative worker refusal\u007cpublic coordinator range","test/engine-command-jobs.test.mjs"]` | Exit 1; 2 passed, 1 failed, 1 skipped. Synthetic sentinel persisted in the private fixture ledger. |
| GREEN | `["--test","test/engine-command-jobs.test.mjs"]` | Exit 0; 25 passed, 0 failed, 1 skipped, including the pending-owner/SQLite teardown subtest. |
| Broken-behavior control | `["--test","--test-name-pattern=fixture seeding","test/engine-command-jobs.test.mjs"]`, test environment `COMMAND_JOBS_BROKEN_ENV_CONTROL=1` | Exit 1; expected sentinel assertion failed. Only a disposable fixture copy restored whole-environment inheritance; product/provider files stayed untouched. |

Range coverage includes 1, 20,000, 20,001 and 86,400,000 ms plus invalid boundaries.
Public worker calls actually returned `JOB_WORKER`. The separate coordinator-only
regression expects accepted ranges to reach ownership admission on an unbound
disposable target, without dispatch. It was skipped because this actual worker is
guarded. A positive public coordinator admission is **not claimed passed**. No
worker identity was cleared and no native qualification ran. The original schema
already admitted these deadlines; its passing boundary test alone does not prove
the former public start cap is removed.

That coordinator-only public range check is the remaining local verification gap.
Provider/native/integration/browser/install/release gates remain separate. No
positive job/checkpoint receipt was fabricated. No dependencies were needed or
installed. Final artifacts contain only the ten listed product/test/docs paths,
with no fixture databases, spools, controls or environment data. One documentation
patch failed anchor verification; its unchanged handoff hash was confirmed before
applying the corrected patch. No uncertain mutation was retried. Wiki updates
and catalog-filter improvements remain coordinator-owned.

Final read-only validation passed all nine JavaScript syntax checks. Git's
optional-lock-free status listed exactly the ten admitted files; all six frozen
providers matched their handoff hashes and no `.command-jobs-test-` tree remained.
The intentional RED/control failures each completed their single cleanup after
seed-process exit. No failed cleanup tree was retried, moved or deleted.

## R4 owned correction evidence

This section records the new native writer's work. Earlier producer declarations,
failures and unknown outcomes above remain historical evidence.

The published source gate was verified against actual start run
`bc53e3e5-d39f-4b1d-a8fa-fd36584ce0bb`, generation 1, nonce
`72cb5091-90ea-4896-865d-f5d612ebb5f0`. It selected `jobs` with exactly this track's
four ownership entries and three skills. Its independently approved review and
root-bound source/checkpoint descriptors matched their complete hashes/lengths.
The preflight's exact Node/script argv ran successfully in non-login PowerShell;
Node 24.18.0, Git and npm identities matched. Genuine executor catalog pagination
and main-resource reads activated workflow, systematic-debugging and
test-driven-development at the selected run-retained roots. No required
associated-tool IDs were selected. Discovery still took ten pages; a native
selected-ID filter remains a coordinator-owned plugin enhancement.

The new worktree started at canonical 0.4.5 commit
`a76aa77ea7790927247388e907015e92e9397f6f`. All ten destinations were absent;
every declared source was ordinary, single-link and hash/length verified before
exclusive creation. The exact complete per-path upstream/base/candidate,
producer/capture and reviewed-integration mapping remains in
`attempt-04/correction-source-jobs-r4.json`, SHA-256
`bee018b36d264133549075d2aa8767e4143e00dbab8229e7820cdaf055c1af21`,
33,801 bytes. All ten mappings have absent upstream/base and `new-file` strategy;
each copied source equals its declared retained candidate. No manual-three-way
path exists in this track. No private residual, dependency or provider payload
was copied. Copy integrity establishes provenance only.

The R4 shared revision, SHA-256
`93197c025355242c7b56d25f5e8bd4e5061330dade3d5889247df2710caf17fd`,
6,711 bytes, explicitly authorizes the current request/options/private bounds and
numeric snapshot modes. Its nonempty mode vector is exercised in the existing
jobs test owner. Snapshot/check/canonical-cwd contracts remain fail closed.

New regression failures preceded production fixes. The first focused execution
exited 1 with eight failing assertions/tests: trailing-hole and subclass commands
were accepted; the request envelope refused large input; a real nonempty snapshot
above 128 KiB was refused; rehashed implementation and unbound dependency-file
exclusions were accepted; wrong canonical cwd reached admission. After correcting
the request boundary, a second execution exposed the private-record cap in the
real near-limit persistence case. The subsequent focused run passed all twelve
tests. No failing fixture cleanup or uncertain subprocess outcome occurred in
these executions.

The full affected command was the verified Node executable with literal argv
`["--test","test/engine-command-jobs.test.mjs"]`, in this writer worktree. It
exited 0: 39 passed, zero failed, one skipped (40 including subtests). It covers
the existing real detached-process/SQLite/protocol checks plus original-array
rejection without callbacks, exact/one-over envelope bounds, a public read-boundary
refusal before storage access, valid near-limit nonempty snapshots, private
environment limits, persistence/reopen with two large snapshots, metadata bounds,
complete dependency identity and canonical-cwd refusal. The artificial payloads
used solely to reach otherwise unreachable outer-envelope ceilings are not
positive snapshot, launch-policy or check evidence. Large snapshot filesystem
validity is tested separately. The actual worker guard is preserved throughout.

The explicitly authorized local command
`["C:\\Program Files\\nodejs\\node.exe","C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js","ci","--ignore-scripts","--offline"]`
started and exited 0, preparing 35 packages only in this worktree. No online
installation or fallback was used. This is new preparation; it does not change
the earlier producers' no-install declarations.

Original/retained failures and actual command starts are separate inventories.
Original run slots 10/11/12 remain unknown after source/inventory readiness failed
before model inference; readiness/source commands did execute. Slots 16/17 remain
never-started reviews. The retained jobs producer remains engine-completed and
declared-partial; its seven failed cleanup roots remain untouched. The initial R4
read-only jobs reviewer retains its executed exit-1 identity-helper failure
(string/numeric mode comparison), missing-file read and other completed commands;
its selected-source before/completion checks passed. These facts are not
rewritten as no-command or notStarted outcomes. This writer actually started
preflight, read/hash/identity inspections, one source copy, offline preparation,
RED checks and GREEN checks. No candidate recorder, managed native job, model
qualification, signing, external write or project Git mutation was started here.

Remaining checks require reviewed combined integration: a valid immutable
checkpoint whose wrong cwd otherwise matches, positive saved-run public
admission/expanded-response refusal, wrong session/runtime, real owner death and
heavy concurrency across distinct run ledgers. Authentic signed-host/AppServer
environment/argv/streams, reconnect/cancel/deadline, descendant drain and execution
beyond 30 minutes remain unverified. The absent checkpoint provider was not
invented or copied. Full tests/check/smoke, clean package/audit, source capture and
drain acceptance remain coordinator gates. The original data instance, declared
18-prefix inventory and F0/V0 then final F/V ordering remain binding; existing F0
checks cannot be relabeled as final checks. Wiki discovery/ingest and roadmap
updates remain coordinator-owned under this writer's explicit no-wiki-write scope.

Final local validation also passed all nine owned JavaScript `--check` commands
and the exact verified Node/npm-cli `run check` command. Optional-lock-free Git
status listed exactly the ten owned source paths. All 76 distinct root-bound
handoff/recovery descriptors rechecked successfully; output, owner and child
fixture bytes still equal their retained source. No `.command-jobs-test-` tree
remained. No final native capture/drain or independent semantic acceptance is
claimed by these local checks.
