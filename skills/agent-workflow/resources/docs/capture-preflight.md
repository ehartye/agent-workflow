# Capture preflight

`preflightCapture({source,capturePolicy:null})`, from
`engine/capture-preflight.mjs`, returns bounded admission metadata without creating
capture artifacts, Git objects/indexes, hook directories or writer worktrees.
`source` is an absolute repository-root path. Options accept only `source` and
`capturePolicy`; accessor properties and unknown keys are refused.

An explicit version 1 capture policy uses the existing capture-policy validator:
`{version:1,excludeDirs:['generated/'],protectedPaths:['engine/']}`. Literal
directory exclusions are coordinator choices, and may not overlap tracked files
(including locally deleted tracked files) or protected paths. Explicit policies
retain ignored source files. Nested `.git` administration is refused even below
an excluded prefix. Excluded payloads are never opened: only their bounded
directory/file metadata is observed.

For this read-only API, null/omitted policy selects legacy Git-ignore admission.
Excluded totals are unavailable in legacy mode, and coverage stays partial even
when admission is ready. Existing `captureInputs` callers still select legacy
admission by **omitting** the policy; an explicitly supplied null remains invalid.
No saved version 1/2 capture is reinterpreted or migrated.

## Report

Every report has exactly these fields:

```js
{
  schemaVersion: 1,
  status: 'ready' | 'blocked',
  policyHash: null | sha256,
  base: null | observedCommit,
  limits: {
    includedFiles: 20000, includedBytes: 536870912, patchBytes: 536870912,
    metadataBytes: 33554432, previewBytes: 33554432,
    excludedEntries: 100000, traversalEntries: 100000,
    excludedInventoryBytes: 16777216
  },
  included: {files: null | count, bytes: null | count},
  excluded: {
    entries: null | count, files: null | count, bytes: null | count,
    inventoryBytes: null | count
  },
  coverage: 'complete' | 'partial',
  failure: null | {stage, code, category},
  inferenceStarted: false,
  writerWorkspaceCreated: false
}
```

Unavailable totals are null. Observations in a blocked/partial report are lower
bounds, including size observations for a file refused before payload reads.
`inventoryBytes` includes the existing exclusion inventory's terminating newline.
Only a complete explicit-policy admission reports complete coverage. Source
enumeration is bounded, and included files are hashed with a reusable 1 MiB read
buffer. Partial admission never fabricates a total or silently truncates a list.

`ready` is an input observation. Output size and CRLF/base-diff expansion remain
unknown until actual capture; no hypothetical diff is created. A ready report's
null failure is not a prediction of later capture success. The CRLF fixture
demonstrates a later base patch larger than the raw local file while preserving
the raw input bytes. Each actual diff still has its independent 512 MiB bound.

## Failure interpretation

Preflight stages are policy/source/inventory/included/excluded/git/consistency.
Current enumeration failures use inventory; Git execution failures use git while
actual capture retains its original stage vocabulary. Categories are:

| Category | Meaning |
| --- | --- |
| policy | Invalid options/policy, or a tracked exclusion conflict |
| unsafePath | Unsafe, ambiguous, colliding, linked or special-file input |
| nestedGit | Nested Git administration below the source root |
| fileLimit / byteLimit | Included count or payload bound exceeded |
| inventoryLimit | Exclusion inventory or traversal bound exceeded |
| sourceChanged | Included bytes/identity, excluded metadata, paths or HEAD changed |
| gitLaunch | Local spawn failure, code WORKSPACE_GIT_LAUNCH |
| gitExit | Unsuccessful local exit, code WORKSPACE_GIT_EXIT |
| gitTimeout | Locally killed execution timeout, code WORKSPACE_GIT_TIMEOUT |
| gitBuffer | Node's bounded child-output overflow, code WORKSPACE_GIT_BUFFER |
| gitEncoding | Fatal UTF-8 decoding failure, code WORKSPACE_GIT_ENCODING |
| unknown | Other failures; no inference from stderr or error text |

Known Git failures originate at the local execFile boundary and carry privately
marked provenance plus constant sanitized fault messages. The existing foundation
diagnostic registry and controller persistence carry their fixed codes. Arbitrary
error messages, argv, stderr, credentials and filesystem error details are absent
from the public report. Unrecognized Git errors use WORKSPACE_GIT/unknown; other
untrusted errors use CHECK_FAILED/unknown. Nothing reconstructs historical causes.

Input failures retain outer WORKSPACE_INPUT. Failures after a writer's edits keep
the existing unknown-artifact outcome and retain the workspace. Neither clean
drain nor a ready preflight authorizes retry after uncertain effects.

## Shared admission and integrity

`inspectCaptureInputs({source,capturePolicy:null})` in `engine/workspaces.mjs` is
the internal read-only admission primitive. Its `report` is the public shape;
successful internal results additionally hold the canonical source/common Git
directory, base, prospective sibling parent, frozen policy, bounded entries and
file hashes. Blocked results carry an internal cause and capture-stage mapping.
Consumers must expose only `report`, never serialize internal causes/inventories.

Inspection checks enumeration, raw included hashes and HEAD across independent
passes. Excluded file/directory metadata comparison includes device/inode, size,
mtime/ctime, mode and link count in a bounded transient inventory. This does not
alter the retained version 2 exclusion JSON schema. Metadata comparison detects
same-size edits that a path/size-only inventory would miss; it does not claim to
hash excluded payload bytes or defeat a malicious same-user writer.

Actual `captureInputs` consumes this primitive, then separately copies blobs,
compares inspected and copied identities, repeats enumeration/metadata/hash/HEAD
checks and constructs its private index/tree/manifest. Output capture retains
its independent consistency checks. Existing blob/index/manifest/path checks and
strict drain ownership remain intact. Read-only Git queries use optional-lock
avoidance, disabled fsmonitor and the existing inert hook path; no repository or
global configuration is changed by preflight.

## Track verification evidence (2026-10-15)

This subsection preserves the original producer's attributed evidence. Its cache
roots, command outcomes and 54-test result are historical observations; they are
not fresh verification of a later recovery workspace.

Native executor listing and main reads activated standalone `debug` and `tdd`;
the TDD testing-anti-patterns reference was also read through its native resource.
Returned roots exactly matched
`C:/Users/ehart/.codex/plugins/cache/hartye-plugins/h-superpowers/4.16.0/skills/`
plus `systematic-debugging` and `test-driven-development`. No shell skill-body
read or delegation was used. The approval receipt SHA-256
`6d9b71fa14f9626f43c70ac115b7bff2a6cf544534017dde0dc0cf85511bc85b`
and all 12 named reference hashes/available byte counts were verified. All three
full approved R2 artifacts, AGENTS.md and .testing/risk.yml were read. Canonical
wiki intent is supplied by that approved package; external wiki follow-through
belongs to the root coordinator.

Verified local execution paths and measured raw-byte SHA-256:

| Executable | SHA-256 |
| --- | --- |
| C:/Program Files/nodejs/node.exe (v24.18.0) | 9a4eb5f1c29c6a2e93852ead46b999e284a6a5ca8bab4d4e241d587d025a52de |
| C:/Program Files/nodejs/npm.cmd | 21b46c69ad6e2f231f02a9e120f4ba6c8e75fef5a45637103002eab99f888ab8 |
| C:/Program Files/Git/cmd/git.exe (2.55.0.windows.3) | 7b7971dd13f0c3a284e538601f2f9770b3a87dfaccb5fb52d68141c67ed22364 |

Non-login PowerShell used the explicit Node/npm.cmd paths, with verified Node/Git
directories first in the child test PATH. Authorized local
`npm.cmd ci --ignore-scripts --offline` exited 0, adding 35 packages. No online
install, npm.ps1, signing, remote request or permission/configuration change ran.
Git fixture initialization/configuration occurs only in owned temporary trees.

RED/GREEN observations:

1. Focused initial tests exited 1 (0/2): shared inspect export was missing and
   nested Git produced WORKSPACE_PATH rather than WORKSPACE_NESTED_GIT. After the
   first implementation the same command exited 0 (2/2).
2. New causal/policy/drift tests exited 1 (6 passed, 11 failed including subtests):
   generic Git failures, same-size excluded drift, tracked conflict projection and
   caller accessors exposed the intended missing behavior. After fixes the two
   affected files exited 0 (17/17).
3. The first broader run executed and exited 1 (23 passed, 23 failed). A moved
   mainRoot variable caused ReferenceError at repository preparation. Its existing
   reservation test waited for its 60-second fixture guard. Owned test temporaries
   were removed; the corrected check then passed the full three-file run (46/46),
   including the existing real 129 MiB binary and >32 MiB patch/replay invariant.
4. Explicit-null capture policy refusal had an observed RED (missing rejection)
   and was restored. A hidden array accessor had an observed RED (missing
   rejection) and was fixed without evaluating the accessor; policy tests then
   passed 4/4. These are current-input invariants, not old-format shims.
5. Added boundary/negative/CRLF/null cases passed 6/6. They exercise exactly
   512 MiB versus one byte over, controlled tracked-deletion inventory stdout at
   20,000 versus 20,001 entries, and actual raw CRLF input/output capture.
6. Negative controls mutate only copied owned modules inside temporary fixtures.
   A preflight that calls actual capture fails the same full source/Git/root
   no-effects assertion. Removing the excluded comparison falsely returns ready;
   the expected sourceChanged assertion fails. Production files are not mutated
   by these controls. A further actual-capture case exercises its independent
   third inventory pass after shared inspection.
7. The expanded three-file run passed 53/53. Subsequent bounded-response review
   added a malformed-commit-output test: RED observed a non-null oversized public
   base. Validating a 40/64-character commit ID before assigning base produced
   GREEN (1/1); its failure remains sanitized WORKSPACE_GIT/unknown. Assertions
   use a bounded Boolean for that field so future failures do not dump payloads.

Git causal tests use real controlled child processes at the local execFile seam:
missing executable, nonzero exit with secret stderr, killed timeout, output-buffer
overflow, invalid UTF-8, and an arbitrary trusted-looking error. This qualifies
the local boundary/projection, not native AppServer or Session 0 behavior.

The exact affected command is the verified Node executable with argv:

```text
--test test/engine-workspaces.test.mjs test/engine-workspace-policy.test.mjs test/engine-capture-preflight.test.mjs
```

All six changed JavaScript modules also passed `node.exe --check`; the owned
tracked diff passed `git --no-optional-locks diff --check`. The final three-file
run against the final executable source exited **0: 54/54 passed**, with zero
failures, cancellations, skips or TODOs, in 90.163 seconds. Full merged
tests/check/smoke, public CLI wiring, frozen integration and independent fresh
acceptance remain coordinator gates. No release or native-job acceptance is
claimed by this source track.

## Recovery boundary coverage (2026-10-15, R4)

The reviewed source handoff preserves the published raw Git diff buffers, both
raw diff callers, non-UTF-8 unavailable-preview behavior and its existing
workspace regression owner. The recovery correction adds coverage in the
existing public preflight test owner; no additional production fix was needed.

The new cases admit exactly 100,000 excluded entries, exactly 100,000 nonexcluded
traversal entries, and exactly 16,777,216 serialized exclusion-inventory bytes.
Each refuses one entry or byte over with `WORKSPACE_LIMIT` / `inventoryLimit`,
partial coverage, unchanged observed base/policy identities, and false inference
and writer-workspace flags. Unavailable counts may remain null; any partial
counts must be truthful lower bounds. The byte case counts the terminating
newline and uses ordinary bounded path-component lengths.

Real temporary Git repositories, source hashes and both admission passes remain
in use. Controlled directory streams and corresponding file metadata supply the
large inventories. Each case compares the complete real fixture/source/Git
inventory before and after both outcomes. A copied module with its relevant
guard weakened by one admits the over-limit input and fails the same refusal
assertion. These observed negative controls establish regression sensitivity;
they do not claim an earlier production failure or physical 100,000-entry
filesystem qualification.

The fresh preflight/policy command passed 25/25:

```text
node --test test/engine-capture-preflight.test.mjs test/engine-workspace-policy.test.mjs
```

A separately selected workspace-regression command **executed and exited 1**
during module loading: `ERR_MODULE_NOT_FOUND` for `ajv` imported by
`engine/schema.mjs`. No workspace test case completed in that invocation, and
the command was not retried. Dependency preparation and the workspace suite,
including the retained 129 MiB replay regression, remain unverified in this
writer workspace. Full integrated tests, native cleanup, F0/final checks and
delivery acceptance remain coordinator responsibilities.

## Observed workflow/tool friction

| Reproduction | Effects and proposed owner | Falsifiable improvement |
| --- | --- | --- |
| First executor list page returned cursor c2d8e1f479685c1e:20:48000; its next request returned “cursor is stale” | Read-only discovery failed; restarting listing succeeded. Native skills catalog host owns cursor lifetime. | A returned cursor remains usable across immediate native calls, or returns a documented expiry/restart reason. |
| Selected standalone IDs required the full unfiltered 10-page catalog | Activation succeeded; repeated irrelevant pages increase context use. Native skills catalog host owns ID/root discovery. | Supported exact-ID/root filters retain duplicate-name provenance and genuine returned identities. |
| A combined spec/source read exceeded tool output bounds and was truncated | Read-only output loss; all required contents were subsequently read in bounded ranges. Worker command guidance owns chunk sizing. | Commands size reads below the output budget, detect truncation and consume every remaining range. |

The capture regression above is an implementation error, not attributed to the
workflow runtime. Existing terminal/unknown semantics and observer ownership were
not changed. Roadmap/wiki friction updates are root-owned external work.
