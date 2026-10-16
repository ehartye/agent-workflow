# Observed workflow usage

`readUsageSummary({dataDir,runId,generation})` from `engine/usage-summary.mjs`
returns a promise of version 1 JSON. All three data properties are required;
unknown keys/accessors, non-absolute data directories, invalid run IDs and
non-positive or unsafe generations use `USAGE_INPUT`. Future generations use
`USAGE_GENERATION`. Path, ownership and record failures use bounded
`USAGE_PATH`, `USAGE_IDENTITY` and `USAGE_RECORD` messages.
The run ID must be a primitive string before any pattern check. Boxed/coercible
values are refused without invoking `toString` or `Symbol.toPrimitive`; caller
conversion errors cannot escape the bounded input refusal.
Proxy inputs, including revoked proxies, use `USAGE_INPUT` before any prototype,
key or descriptor trap can run.

The reader opens the existing `runs-v2/ID/runtime.json` and `run.sqlite`, checks
the saved run/session identity, refuses linked ancestors/files, and opens
SQLite read-only in a consistent read transaction. It creates no tables,
performs no migrations, and never starts execution or installs a runtime.
The managed launcher remains responsible for verifying and selecting the
recorded runtime; this module does not import arbitrary runtime code or switch
to the current installation. Direct fixtures can exercise the saved-record
reader without claiming native/runtime qualification.

The response has exactly `schemaVersion`, `run`, `generation`, `observedTotals`,
`threads`, `attemptCoverage`, `unknowns`, `inFlight` and `hardSpendingCap:false`.
`run` has `dataInstanceId`, `runId` and `runtimeId`. Data-instance identity uses
the monitor adapter's canonical-root/platform/device/inode/birth-time preimage.
No worker label or copied generation enters native thread identity.

All saved worker records up to the requested generation are read in generation
and position order. `reusedFrom` and `priorExecutions` must point to saved,
earlier records of the same origin with coherent cumulative attempts. Cached
usage must match its source exactly. Invalid or missing lineage is unknown;
its claimed copied usage cannot increase totals. Records never rewrite a
failed or unknown historical execution as successful.

Each thread entry has `run`, `threadId`, `observedTotals`, `coverage` and
`observations`. Stored copies and repeated cumulative samples count once in
totals. A later componentwise nondecreasing sample can replace the earlier
sample. A decreasing or incomparable sample produces an unknown and retains
the earlier verified lower bound. An unrelated worker claiming the same native
thread produces `threadIdentityConflict`. Observation counts include saved
copies; they are not counts of unique native usage notifications.

Token components are nonnegative safe integers: `inputTokens`,
`cachedInputTokens`, `outputTokens`, `reasoningOutputTokens`, `totalTokens` and
optional `cacheWriteInputTokens` (absent is zero, matching activity storage).
Unknown fields, missing required components or invalid subcounts are rejected
as observations. Aggregate worker `usage` without `usageByThread` does not
invent a native thread. Cached/reasoning components are reported separately;
they are never added as extra charges to `totalTokens`. Safe integer overflow
sets aggregate `observedTotals:null` with `totalOverflow`; it never wraps.

Attempt coverage rows report saved generation/position, cumulative `attempts`,
`attemptOffset`, cache/source identity, translated `observedAttempts`, coverage
and `allocatedTotals:null`. Local evidence attempt numbers are translated by
the saved offset. Cumulative samples do not identify verified per-attempt spend
boundaries, even when a thread appears in multiple attempts. Missing latest
usage is explicit. `inFlight` identifies active workers at the requested saved
generation; live samples can already be stale when returned.

A controller-created queued record can omit `attempts` before dispatch. The
reader projects that specific absent counter as zero, retaining the queued
worker in `inFlight` with `attempt:0`. Its coverage has `attempts:0`,
`attemptOffset:0`, `observedAttempts:[]` and `allocatedTotals:null`.
`missingLatestUsage` remains explicit; zero attempts do not produce
`missingUsage` for an execution that has not happened. No usage sample or token
spend is invented, and the saved record keeps its absent property. Other
statuses with missing counters and explicit invalid counters still fail the
existing record validation. Queued usage without an attempt remains invalid.

Missing/malformed samples do not mean zero spend. Totals are observed lower
bounds and may omit unknown work. They are neither billing nor a forecast.
`hardSpendingCap` is always false. There is no native hard spending cap, quota
waiting, guessed reset time, shared token pool, provider-cache equivalence or
nested runtime composition in this feature.

Limits: 10,000 saved records, lineage-reference visits and thread observations, 2 MiB per saved
record, 32 MiB combined selected worker JSON, 256 unknown entries and 1 MiB
response. Overflow returns bounded empty detail/null totals with an explicit
limit category; no partial detail is presented as complete. Original records
are retained. Ownership JSON is handle-read with fatal UTF-8 and a size bound.

## Retained producer validation evidence

This section records the original usage producer's reported evidence from
run `4814c759-2fc4-40ba-beca-025fdde866f8`, generation 1, position 13,
attempt 1, runtime `0.4.1-1c58382054fe026c-node24.18.0`. The R3 correction
results follow separately below; its original completed outcome is preserved.

Initial RED: reopened replay expected 12 observed tokens and got null. Initial
GREEN deduplicated replay. Additional RED cases caught incorrect decreased
totals, copied spend from invalid lineage, thread identity conflicts, integer
overflow, absent coverage and unbounded observations. Real SQLite fixtures
close and reopen across corrections/restarts/cache copies. A controlled copy
of this module keyed by generation incorrectly reports 24 tokens for the same
12-token replay; the owning assertion rejects that mutation. Read-only checks
compare database bytes and directory inventory before and after a read.
The controller-backed fixture creates actual records for a completed cached
prefix, an explicitly reconciled restart of an unknown worker, a terminal
schema failure and its ordinary resume. It retains three native thread IDs
with 21 observed tokens across generations. Cached corrections retain their
offset; missing offsets, nonboolean cache markers and usage without an attempt
cannot add spend. Null evidence remains unknown while other lower bounds survive.

Fixture development correctly encountered `RESTART_WORKER` for restarting a
successful worker and `REPLAY_UNKNOWN` for automatic replay of an unknown worker.
These were test-authoring errors affecting owned disposable fixtures only; no
engine guard was weakened. Proposed owner: worker testing guidance should model
the existing explicit reconciliation boundary in restart fixtures. Teardown
left no retained temporary directories.

Affected command is documented in `plan-preview.md`. Dependency preparation
was the explicitly authorized local `C:/Program Files/nodejs/npm.cmd ci
--ignore-scripts --offline`: exit 0, 35 packages; no online install or scripts.
Public `usage ID --generation` and retained-runtime CLI acceptance await the
actual interfaces integration. Full test/check/smoke, clean install and fresh
combined/native acceptance remain coordinator-owned.
Final affected verification is **28/28 passing**, with no skips, on the explicit
Node v24.18.0 executable. See `plan-preview.md` for approval/skill identities and
workflow friction. These module checks require no new provider bytes from
another track; public command and full combined acceptance require reviewed
interfaces integration and the coordinator's F/V checks.

## R3 queued-work correction evidence

The correction uses the actual assigned worktree
`C:/Users/ehart/repos/agent-workflow-worktrees/workflow-1f1d1bae-caeb-4e80-8098-89abae78fbbe`
on the original published 0.4.3 input. R3 authorizes an external three-file
handoff for `correct-queued-usage`; it does not replace `originalCapturedInputs`
or claim that the slice is a different native snapshot.

Both selected skills were genuinely discovered with executor `skills.list`
(ten native cursor pages) and activated with `skills.read` using returned
package/main-resource identities. Names and returned roots matched the
admitted standalone `tdd` and `test-strategy` packages. The TDD anti-patterns
reference was also read natively. The separately admitted test-strategy
`references/craft.md` was SHA256-checked and read through bounded file reads;
no skill body was loaded through a shell. AGENTS.md and `.testing/risk.yml`
were read before changing tests. Engine coverage remains critical/merge.

The exact prerequisite and preflight identities were verified:

| Input | SHA256 | Bytes |
| --- | --- | ---: |
| attempt-03/prerequisites.json | `44536ae22cf28ec16e23e8e5f3ee1bfab12706e402b1d5d26dc9aec24aaefc7c` | 546 |
| attempt-03/preflight.mjs | `12938acf530342c1090037501e9c19d1013c4fd06a8b887ef821b8263d466fc8` | 893 |
| R2 design | `f4a3abfb0ded0a032ce1feee37373b654f8eb9c3d0c33a7ea26b8be647eb744c` | 83785 |
| R2 plan | `90419e80840eaba4d9d080cc6bf980f472634159e50498d6871b0092df2264f2` | 54113 |
| R2 specification | `7eaace9e84673b17c3730a048ecfe18e7cceef7309021ca6572f4fad111cc396` | 100722 |
| Retained continuation | `9d94b004df346c028e87e0276ef9a66ff9cea510514cef3d8a66344dd61a2a90` | 13352 |
| R3 correction addendum | `ed030c1d76ac148b6c899e3c9b22aee4a5bf9beba1ac11af1604b7a49e414ca2` | 12523 |
| correction-inputs-r3/usage/manifest.json | `5580b26686ab855c67db47671e1edd943606203eccc0b1c726aea79acff370c5` | 4699 |

Preflight argv was
`["C:\\Program Files\\nodejs\\node.exe","C:\\Users\\ehart\\repos\\agent-workflow-worktrees\\roadmap-pipeline-control\\attempt-03\\preflight.mjs"]`:
exit 0, exact Node v24.18.0, Git 2.55.0.windows.3 and npm executable hashes
passed. This verifies those executable identities, not native/browser acceptance.

Before copying, every selected file had the declared SHA256/length, regular
single-link identity, unlinked ancestors, unambiguous case and no existing
destination. `COPYFILE_EXCL` created exactly these files inside this worktree:

| Copied relative path | Actual input SHA256 | Bytes |
| --- | --- | ---: |
| docs/usage-summary.md | `e3c83b1543ac49eb800192a4f3f5e408fa8a152e0b6b9386e7934aa0359e7f2e` | 6634 |
| engine/usage-summary.mjs | `9aa06ea5a94d1f7807f946248a61782031c0bfc3cf6bc2c9cce8dbe7f2ef8ef9` | 13501 |
| test/engine-usage-summary.test.mjs | `08a789b3a02312efb6c913a831adf19e706e776e706c76466e1c567a6773c086` | 13794 |

Source identities and manifest/files were rechecked after copying. All three
are listed mutable paths and receive corrections; there are no additional
untouched copied files. No excluded plan-preview files, original test trees,
environment snapshots, dependencies, captures or other providers were copied.
The external originals and producer outcomes remain unchanged.

The new owning regression uses the real controller/evaluator with a controlled
backend, a unique repository-local fixture directory and run UUID. Concurrency
one holds the first worker live while its sibling remains queued. SQLite
reopen proves the queued record has no attempts/evidence/usage property.
Two summary reads must include both positions, preserve zero executed attempts
for the queued worker, report missing latest usage and retain null observed
totals/empty threads. Read-only SQL state, schema, directory inventory and
database/WAL bytes remain equal. Finally the held worker is released, the
same controller settles completed, backend close is observed and its owner
lock is absent before fixture removal. No real saved run, credentials, native
owner mutation API or worker-identity override is involved.

Commands ran with non-login PowerShell and literal arguments in this worktree:

| Stage | Exact argv | Observed result |
| --- | --- | --- |
| RED, before implementation | `["C:\\Program Files\\nodejs\\node.exe","--test","--test-name-pattern=controller queued work","test/engine-usage-summary.test.mjs"]` | exit 1; 0 pass/1 fail; `inFlight` contained running position 0 and omitted queued position 1 |
| GREEN, final test revision | `["C:\\Program Files\\nodejs\\node.exe","--test","test/engine-usage-summary.test.mjs"]` | exit 0; 19 pass, 0 fail/cancel/skip/todo; 808.2847 ms |
| Syntax | `["C:\\Program Files\\nodejs\\node.exe","--check","engine/usage-summary.mjs"]` and the same with `test/engine-usage-summary.test.mjs` | exit 0 each |

The GREEN command also executes a deliberate queued-omission mutation in a
disposable copied module within the fixture. That control returns only position
0; the same required `[0,1]` assertion rejects it with `ERR_ASSERTION`. Product
source is never patched for the control. The retained replay-deduplication
mutation also passes its owning rejection. Existing correction/restart/cache,
invalid-lineage, missing-usage, limits and overflow tests remain green.

Effects/friction: dependencies were initially absent; the explicitly authorized
`["C:/Program Files/nodejs/npm.cmd","ci","--ignore-scripts","--offline"]`
executed exit 0, adding 35 packages locally. Package/lock bytes were not edited.
A read-only search for a guessed `engine/store.mjs` path reported it missing;
SQLite persistence was then located directly in `engine/controller.mjs`.
No command-start failure, uncertain-effect retry or fallback install occurred.
Native skill discovery still requires ten unfiltered pages to reach selected
standalone IDs. Proposed catalog-host improvement: ID/root filtering retaining
duplicate-name and cursor semantics. Canonical wiki changes are root-owned.

Owned correction verification is complete. Public CLI/retained-runtime provider
integration, full combined test/check/smoke, strict authoritative capture,
independent review, native/browser/install/release acceptance and preserved
history verification remain separate coordinator checks and are not claimed
passed by this correction.

## Native recovery input correction

The later native recovery preserves every producer report above as historical
evidence. Its assigned canonical 0.4.5 worktree and current command/source
inventory are recorded in [plan-preview.md](plan-preview.md#native-recovery-correction-evidence).
Only the admitted selected position-8 usage source/test/docs blobs were copied;
old capture state, private payloads and source/runtime bindings stay unchanged.

Before the fix, the existing generation/ownership validation test submitted a
run ID object with a throwing conversion callback. RED observed one invocation
where zero was required. A primitive-string guard before `RegExp.test` closes
that boundary. GREEN verifies both `toString` and `Symbol.toPrimitive` remain
uncalled and return `USAGE_INPUT`. The valid saved-run read and its read-only
database/directory assertions remain in the same invariant owner.

The current affected command passed 30 tests across both inspection files,
including the real controller queued/replay/restart fixtures and their existing
replay-double-count, queued-omission and hostile-effect negative controls.
These fixtures use controlled local backends and do not claim native inference
or retained-runtime CLI acceptance. Per-attempt allocation stays null, observed
totals stay lower bounds and `hardSpendingCap` stays false. Public CLI, combined
checks, F0/final F qualifications and coordinator acceptance remain missing.
