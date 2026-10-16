# Offline release-protection preflight

The helper prepares and checks restoration evidence before an owner-authorized
release exception. It never contacts GitHub. The default and only planning mode
is `dryRun:true`; there is no apply flag or network transport.

The canonical `release-protection-restoration` backlog records a PATCH after
DELETE returning 404, a request containing both checks and contexts returning
422, and a later subresource PUT returning 404. Restoration must target the full
branch-protection endpoint. The owner retains the existing release procedure and
its separate live restoration gate.

The three stages are snapshot, preflight and verify. Inputs and receipts are
local evidence, with an explicit repository, branch, API version, capture time
and provenance. Fixture agreement is not live restoration. A new unknown setting
blocks a complete plan until its request mapping is reviewed.

## Commands

Run from the source package with Node 24+. These commands read local files and
exclusively create their output. They launch no subprocess, call no API and
change no Git metadata, protection, signing configuration, Actions or firewall.

```powershell
$node = 'C:\Program Files\nodejs\node.exe'
& $node scripts/release-protection.mjs snapshot --input original-get.json --output snapshot.json
& $node scripts/release-protection.mjs preflight --snapshot snapshot.json --repository example/workflow --branch main --output restore-plan.json
& $node scripts/release-protection.mjs verify --snapshot snapshot.json --observed fresh-get.json --output verification.json
```

`example/workflow` is a fixture identity. Substitute the exact owner-authorized
repository and branch, without shell expression construction. Unknown,
duplicate, missing and apply/network arguments are rejected. `main(argv)`
returns the written record; direct CLI execution exits 1 for blocked preflight,
failed verification or input/output failure, and 0 for a written snapshot, ready
offline plan or matching fixture verification. CLI exit 0 never establishes a
live setting change. No stdout manifest or token is emitted.

Inputs must be ordinary single-link files with directory ancestors and no
redirected canonical path. The helper checks file type, link count, symbolic
links and canonical spelling before opening, compares the opened handle's
identity, then rechecks pathname identity and handle metadata after reading.
Physical hardlink and linked-ancestor regressions exercise refusal without
creating a receipt. Reads use
a single checked handle, limit+1 bounded
reads and fatal UTF-8 decoding, and recheck identity/metadata. JSON inputs are at
most 1 MiB; depth is at most 48 and visited values at most 50,000. Duplicate
object names, prototype keys, non-JSON objects, proxies and accessors are rejected.
Arrays must have their exact ordinary prototype and dense numeric indices with
no additional properties. Validation checks descriptors before normalization or
hashing, including already rehashed snapshots and the public command argv. Pure
APIs enforce the same value bounds. Output is at most 1 MiB, opened with
exclusive-create and private mode where supported, then flushed. No directory
creation is implicit. These path checks are admission checks within the owner’s
filesystem authority, not an OS sandbox against a concurrent malicious writer.

An existing output is preserved and returns `PROTECTION_OUTPUT_EXISTS`. Inspect
that receipt. A failed write can leave a partial receipt: retain it and reconcile
the failure before any further action. The helper never deletes, overwrites,
retries or selects another output automatically. Diagnostics use fixed codes
and omit raw paths, settings, credentials and native errors.

## Evidence format and integrity

The input to `snapshot --input` is an owner-supplied envelope around GET evidence.
It has exactly these fields. The example is synthetic and does not describe the
repository’s current settings:

```json
{
  "schemaVersion": 1,
  "repository": "example/workflow",
  "branch": "main",
  "apiVersion": "2022-11-28",
  "capturedAt": "2026-10-15T10:00:00.000Z",
  "provenance": {
    "kind": "fixture",
    "source": "owned offline GET fixture",
    "observationId": "before"
  },
  "state": "protected",
  "protection": {
    "required_status_checks": {
      "strict": true,
      "contexts": ["verify"],
      "checks": [{"context": "verify", "app_id": 15368}]
    },
    "enforce_admins": {"enabled": true},
    "required_pull_request_reviews": null,
    "restrictions": null,
    "required_linear_history": {"enabled": true},
    "allow_force_pushes": {"enabled": false},
    "allow_deletions": {"enabled": false},
    "block_creations": {"enabled": false},
    "required_conversation_resolution": {"enabled": false},
    "lock_branch": {"enabled": false},
    "allow_fork_syncing": {"enabled": false}
  }
}
```

Repository must be a literal `OWNER/REPO`; branch must be a literal bounded Git
branch name. Time is canonical ISO UTC, including milliseconds. Provenance kind
is `fixture` or `ownerObservation`; source is a bounded private evidence reference,
and observationId identifies that capture. Never put an access token in source.
Preserve original GET bytes/headers separately under owner control. The helper
cannot authenticate their acquisition or interpret an HTTP 404 as proof that
protection is absent: authorization failure can also hide a repository. Only an
owner-confirmed absent observation uses `state:"absent", protection:null`.

`snapshot` adds three lowercase SHA-256 fields:

| Field | Exact preimage |
| --- | --- |
| evidenceSha256 | Raw bytes of the input envelope file |
| settingsSha256 | Canonical JSON of the raw protection value, including null |
| snapshotSha256 | Canonical JSON of the complete snapshot with only snapshotSha256 omitted |

Canonical JSON sorts object keys recursively, preserves array order and uses
UTF-8 with no whitespace or trailing newline. Both pure APIs revalidate snapshot
hashes before using settings. These hashes establish consistency of supplied
bytes; they do not authenticate a GET or prevent a same-user rewrite with new
hashes. Repository/branch/API-version mismatches refuse verification. Preflight
also requires the literal repository and branch to match the snapshot.

## Request mapping and fail-closed behavior

The fixture adapter is explicitly pinned to API version `2022-11-28`. Other
well-formed versions may be retained in a snapshot, but block preflight and
comparison as unknown. There was no live API/schema qualification in this task.
The canonical backlog and repository release receipts establish the full-endpoint
route and restored verify/app15368, strict, admin and linear-history requirements;
they do not supply a new current API-version receipt. The release owner must
review the actual captured headers and supported request schema before using a
plan in the existing live procedure. A complete offline mapping does not waive
that gate.

`buildProtectionRestorePlan({snapshot,repository,branch})` is pure and returns
`dryRun:true`, `complete`, exact method/path/headers/body or a null restoration,
missing/unknown paths and GET verification requirements. A protected snapshot
uses **PUT /repos/OWNER/REPO/branches/ENCODED_BRANCH/protection**. It never PATCHes
or PUTs a deleted required-status-check subresource. An absent snapshot instead
plans DELETE of the full endpoint with a null body; this is a plan only. An
explicit `disabled` state is retained distinctly and blocks planning because
this classic-protection adapter has no qualified disable operation. Individual
`enabled:false` flags remain protected-state settings and are preserved as false.

| Response evidence | Restoration request / comparison |
| --- | --- |
| required_status_checks | null, or strict plus checks-only `{context,app_id}`; contexts-only when no checks representation was captured |
| checks and contexts together in GET | checks win only when context sets agree; disagreement blocks the entire plan |
| app_id:null | Explicit unbound check, represented by request app_id:-1; never guessed as a particular app |
| enforce_admins, required_linear_history, conversation resolution, force pushes, deletions, block creations, lock branch, fork syncing | Explicit GET enabled wrappers become PUT booleans |
| required_pull_request_reviews | Preserve null, or dismiss_stale_reviews, require_code_owner_reviews, required_approving_review_count (0..6), require_last_push_approval |
| dismissal_restrictions / bypass_pull_request_allowances | Preserve present users/login, teams/slug and apps/slug sets; preserve absence of optional objects |
| restrictions | Preserve null or exact users/login, teams/slug and apps/slug sets |

The four required setting groups and seven flags are checked explicitly; the
code’s REQUIRED inventory lists the exact keys. URLs and named actor profile
metadata are response metadata. A top-level URL, if supplied, must match the
declared branch endpoint. Unknown settings, unknown nested settings, malformed
wrappers, duplicate actors/checks, ambiguous identities or missing required
settings block the **whole** operation; no partial body is offered. Required
signatures, rulesets and other settings with separate restoration APIs are
unrestorable here and remain unknown rather than silently disappearing. No live
transport is included to apply even a complete plan.

## Exact verification and freshness

`compareProtectionSettings({expected,actual})` takes the hashed snapshot and a
fresh GET envelope with the same base format. The verify command reads those two
files and writes the comparison. Every normalized leaf has
`{path,expected,actual,match}`; set arrays sort by identity, while booleans and
other values remain exact. Unbound contexts and unbound checks compare
equivalently, but app15368, app999 and an unbound check remain distinct. Mismatched review actor
lists and every individual flag remain visible. The report includes missing and
unknown paths, raw expected/actual settings hashes, the snapshot hash, a
canonical observation hash and both provenance objects.

The actual capture must have a later capturedAt and a different observationId.
For `restored:true`, **both** captures must be ownerObservation and the fresh
provenance must additionally contain:

```json
{
  "snapshotSha256": "the exact 64-hex hash of the original snapshot",
  "afterRestoration": true
}
```

These fields supplement kind/source/observationId. They declare the owner’s
binding and acquisition after restoration; the helper cannot independently prove
that declaration. All settings must match and missing/unknown must be empty.
Otherwise restored is false. A fixture on either side yields `scope:"fixture"`
and restored false, even when matches is true and the command exits 0. Owner
agreement uses `scope:"ownerSuppliedObservation"` and explicitly reports
`authenticity:"ownerSuppliedNotIndependentlyVerified"`. Live operation receipts
and external-effect reconciliation remain the release owner’s responsibility.

## Verification evidence and remaining gates

The retained original maintenance producer reported the following history. Its
engine completion and partial declaration remain separate from semantic
acceptance; copying its verified source does not certify these historical test
claims or replace fresh checks. That producer ran exact Node 24.18.0 with
`--test test/release-protection.test.mjs`. Initial RED exited 1 on the missing
helper entrypoint; first GREEN passed 8/8. A subsequent three-case RED exposed
contexts/unbound-check comparison, nonenumerable accessors and duplicate JSON
names; all three assertions failed for the intended behavior. After the fixes,
GREEN passed 11/11, zero skips/failures. A final strict-input RED caught ignored
extra public API keys; input allowlists and own-command lookup were then added.
Final GREEN passed 12/12, zero skips/failures. Two temporary source mutants, leaving
production bytes unchanged, each exited 1 in the owning test: replacing admin
enforcement with true and emitting both checks and contexts. This supplies
behavioral negative controls beyond the initial missing-entrypoint RED.

Test audit: this file is the sole owner of the new offline helper, standard tier
under `.testing/risk.yml`, merge lane with explicit subprocess subject. It uses
real local CLI processes and JSON files, pure public API assertions and no live
transport. Existing HTTP/monitor/process tests retain their invariants. No tests
were deleted or demoted. These tests introduce transient prefix
`.release-protection-test-` under the owned repository; it must be added to the
coordinator’s reviewed validation-copy inventory before freezing checks. R4 now
explicitly admits this prefix only in the writer or assigned validation root,
bringing the reviewed inventory to eighteen; root must refresh its source hashes
before F0. Tests
remove only their own unique directories and never write to the real home.

No filesystem links were created under this assignment. Actual symlink/junction
and ancestor-swap execution coverage remains for an explicitly authorized fixture
owner; the helper includes refusal checks but those branches have no new live
filesystem acceptance here. Full integrated test/check/smoke, clean package,
production audit, live schema/restoration, remote and painted browser evidence
remain separate coordinator gates. The worker made no settings calls, login,
firewall edit, signing or global configuration change.

Tool friction observed: genuine executor catalog activation required eight
unfiltered pages before both matching retained debug/TDD roots appeared; the
test-audit root appeared on page two. Effect class: read-only discovery latency
and output cost. Owner: native skills catalog. Missing acceptance: a supported
ID/root filter must return the same package/main-resource/root and duplicate-name
semantics, then permit genuine native reads. Test-audit’s retained setup check
passed read-only; its whole-project managed scan/report was not run in this
bounded implementation. Scope and behavioral test review above are manual.

Large combined source searches also exceeded native exec output budgets during
inspection. Effect class: read-only output truncation; no command was retried for
external effects. The worker used bounded follow-up slices to read the approved
documents and narrowed source queries. Owner: this worker’s query construction;
missing acceptance: future bulk-read tooling should expose stable byte cursors
and explicit complete-range evidence instead of relying on one oversized result.
This is an output transport limitation, not evidence that an omitted source
range was read.

### Native recovery correction evidence

The maintenance correction matched run bc53e3e5-d39f-4b1d-a8fa-fd36584ce0bb,
generation 1 and the reviewed nonce to the actual start and frozen arguments.
The writer HEAD matched canonical a76aa77ea7790927247388e907015e92e9397f6f.
All five paths had absent upstream/base preimages and exact retained-candidate
mappings; no manual-three-way file was replaced. The original maintenance
producer b978ff0f-91bb-4cf7-8c4c-72a0b8e48e13/g1/p3/a1 remains declared partial
and unaccepted. Full mappings stay in the immutable per-track handoff,
`correction-source-maintenance-r4.json`, SHA-256
`b94e9f124a06a8a02a8050367432f1839c31e55da6d1fa1b03035d317a0f28c2`,
16298 bytes, under the admitted attempt-04 control root. Every path below has
upstream absent, base absent, mode 100644 and reviewed integration kind
exact-retained-source-copy. Candidate and handoff source bytes were identical
before these corrections; final writer hashes belong to its separate capture.

| Owned path | Original candidate SHA-256 | Bytes |
| --- | --- | --- |
| docs/browser-ownership.md | cd2058e4ab931c8657f372c086c499d19344ff2769e3fb062b81e49836c113c2 | 7596 |
| docs/release-protection.md | 8aa54cd05c5dbe4190745cd617f64df4614087f4984d0ffddb74c5231350946c | 13783 |
| docs/remote-dashboard.md | 50c62c566cac7daac9fad7d5e958d76989cbbdc327f1f4899f6aa2de4d42d58b | 6441 |
| scripts/release-protection.mjs | f338a7f43f3d0d6fc83a9c45266b3db9dfb690c7f70eebf0063dcc817f582f82 | 20164 |
| test/release-protection.test.mjs | c4d60f6202c9eb7427f8dfeb0047ca0b13346612b7055819055f125e73f3ec5d | 15880 |

Each original candidate is the same-named SHA-256 blob in capture
93d0faa0d2fac9343b5419dea2f7f95d66457b0566d2bb5f26263bdb5e153863,
under the producer's retained result/blobs root. Each reviewed handoff source
is its identical owned relative path under attempt-04/correction-inputs-r4.
No prior capture, private payload or old worker directory was modified.

Fresh Node 24.18.0 `--test test/release-protection.test.mjs` first exited 1:
named properties masked sparse context/actor arrays, proxy traps ran, and command
argv accepted an extra named property and created a fixture output. These were
executed, controlled fixture effects, not commands that failed to start. Owned
cleanup completed with no prefix residue before the fix. Dense-index/proxy
validation and validation of the original argv then passed all 20 native cases
(12 top-level tests and eight subtests), with no failures or skips. No dependencies
or installation were needed for these built-in-Node checks.

The app-binding owner now asserts matches:false and the exact checks mismatch
row for app15368 versus app999. Its temporary source mutation conflates app IDs;
the same oracle rejects that mutant. This strengthens the comparison assertion
without treating fixture restored:false as proof that IDs were compared.

The assigned-worktree policy forbids creating filesystem links. The required
real hardlink regression and link-count implementation remain blocked pending a
coordinator-provided admitted fixture; no link was created and no hardlink
acceptance is claimed. Symlink/junction and ancestor-swap checks remain missing.
Full integration, F0/final F/V checks, authentic candidate receipts and coordinator
acceptance were not performed by this writer. Old failed/partial/unknown records
and original data-instance identity remain unchanged.

Scoped audit verdict: retain and strengthen this standard-tier merge owner;
delete/merge savings and demotions are zero. No whole-project CLI scan, churn,
statistical flakiness or suite cost measurement was performed in this correction.
All three selected skills were activated through genuine executor list/read at
the exact retained roots. Ten unfiltered catalog pages were required; ID/root
filtering remains a coordinator roadmap follow-up. Wiki writes are outside this
assignment. Inspection output truncation was retained as a read-coverage limit,
not a failed process start or proof of absent effects.
