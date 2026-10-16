# Checkpoint pagination correction

The list implementation selected a count-sized slice, then bounded only its item
array. Three individually valid approximately 440 KB records therefore caused
`CHECKPOINT_LIMIT` instead of returning a smaller page. The response envelope was
also absent from append admission and list sizing.

The supplied reproduction was verified as 2,996 bytes with SHA-256
`371d9de6e65a0e5ce66987aa3c3740a3ed3db6cad82bd91ca97ddc4e58e3a706`.
The supplied baseline metadata also matched its expected size/hash. Actual
retained runs, runtimes, databases and captures were not opened or changed.

First RED, before production edits, used the admitted Node executable with:

```text
node --test test/engine-stage-checkpoints.test.mjs test/engine-delivery-acceptance.test.mjs
```

It exited 1: one wrapper passed and one failed. The stage child suite ran 21
tests: 20 passed and the new large-record public-list regression failed with
`CHECKPOINT_LIMIT` / `Delivery checkpoint limit` at its default list call, after
all three real owned SQLite appends succeeded. The existing isolated fixture
realm and actual worker mutation guard were preserved.

Before production edits, the additional one-byte-over envelope regression also
failed: append unexpectedly succeeded (`Missing expected rejection`). That RED
ran 22 stage child tests: 20 passed and the two new regressions failed.

The fix sizes the complete response envelope and returns the largest prefix
fitting both bounds. New records must fit a final one-item envelope before stage
insertion. Historical replay stays ahead of this check; hash preimages, the
1 MiB cap and 1024-record quota are unchanged. Full chain and saved ceiling
validation still happen before page selection.

## Consumer amendment and evidence

The coordinator extended ownership to the acceptance implementation and its
existing invariant owner. The old consumer followed `hasMore`/`nextCursor` but
stopped after eleven pages, assuming count-sized pages. The stale-checkpoint
owner was extended to twelve real 600,000-byte checkpoints, one per byte-limited
page. Before consumer production edits, the same affected command exited 1:
the stage wrapper passed; the acceptance child had 20 passes, two failures and
one existing integration skip. The twelve-page regression failed with
`ACCEPTANCE_LIMIT` / `Delivery acceptance limit`. A duplicate-response control
failed with `Missing expected rejection: duplicatePage`.

Acceptance now traverses at most the existing 1024 records. Every page must be
nonempty, advance a valid cursor matching its last item, and contribute unique
IDs with continuous predecessor IDs/hashes. Empty, duplicate or inconsistent
pages fail explicitly. Record quota checks bound continuation even when every
page contains one record. The independent final history/source checks remain.

Final GREEN used the same admitted executable and exact affected arguments:

```text
node --test test/engine-stage-checkpoints.test.mjs test/engine-delivery-acceptance.test.mjs
```

Exit 0: **2 wrappers passed, 0 failed**. Existing wrappers suppress successful
child stdout; those are observed wrapper counts. The last RED child inventories
were 22 stage cases and 23 acceptance cases, including the existing opt-in
jobs/capture integration skip. The fixture realm, worker marker/session identity
and actual production worker mutation guard were preserved. Owned temporary
fixture directories were absent after execution.

## Reviewed scope and boundaries

All six owned paths (the final response retains the original four-path enum):

- `engine/stage-checkpoints.mjs`
- `test/engine-stage-checkpoints.test.mjs`
- `docs/stage-checkpoints.md`
- `reports/roadmap-pipeline/checkpoint-pagination.md`
- `engine/delivery-acceptance.mjs`
- `test/engine-delivery-acceptance.test.mjs`

Public SQLite checks cover three valid approximately 440 KB records returning
two then one, complete-envelope UTF-8 size, smaller count, cursor exhaustion and
invalid cursors/counts, no gaps/duplicates, independent unchanged hash checks,
and valid-JSON corruption in a later non-returned row. Boundary checks cover an
exact 1 MiB final page, atomic refusal one byte over, later continuation, original
request replay after chain advancement, and an older envelope-oversized record:
list fails explicitly while raw read/replay preserve its bytes and hash. The
consumer checks both stale and current checkpoints beyond eleven pages and
damaged duplicate/empty/cursor responses against real owned SQLite reads.

Only synthetic fixtures were mutated. No actual retained run/runtime/database/
capture was opened or changed, and no workflow, command job, install, Git write,
network operation, migration or runtime hotpatch was performed. All five selected
skills were genuinely activated through native executor list/read with matching
admitted roots. Test-audit review stayed within these critical merge-lane owners;
no whole-suite audit or managed audit command was run.

## Remaining gaps

Exact 1024-record/quota stress and full merge/release checks remain unrun here.
Authentic jobs-provider/capture integration retains its existing explicit skip;
actual retained data was intentionally excluded. Root owns stable combined-source
capture/review and fresh merge/release verification. This report is evidence,
not trusted delivery acceptance, release approval or all23 objective acceptance.
