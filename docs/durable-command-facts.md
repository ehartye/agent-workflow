# Durable command facts

`readActivity(db, {generation, position, after, limit, expectedObserved})` adds a
separate `commandFacts` envelope. Ordinary activity paging and its 256 records per
worker / 4,096 records per generation remain unchanged. The envelope contains the
retained command lifecycle events for that generation and worker, regardless of
the activity cursor or page size. It survives ordinary activity eviction and a
database reopen.

Only `item/started` and `item/completed` notifications whose item type is
`commandExecution` enter this store. Output deltas, answers, reasoning, raw tool
bodies and terminal item snapshots do not enter it. The existing confirmed-turn
filter in `foundation/turn.mjs` remains the production admission boundary.

## Envelope schema (version 1)

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1` |
| `coverage` | `itemNotificationsOnly`; this is reported notification evidence |
| `priorActivityUncovered` | Number of ordinary activity events already present when fact tracking was initialized; their command coverage is unknown |
| `limits` | The fixed budgets below |
| `observed` | Accepted start/completion event count for this generation and worker |
| `retained` | Number of events in `records` |
| `dropped` | `observed - retained` |
| `evicted.countLimit` | Events removed because a worker or generation count limit was exceeded |
| `evicted.byteLimit` | Events removed because a worker or generation byte limit was exceeded |
| `retainedBytes` | Sum of UTF-8 bytes of the serialized records |
| `records` | Retained events, oldest activity sequence first |

The eviction fields count events, not bytes. Each eviction belongs to one reason;
count takes precedence when both budgets are exceeded. Evictions caused by other
workers in the same generation update the victim worker's counters.
`observed = retained + evicted.countLimit + evicted.byteLimit`. Missing or invalid
coverage counters fail with `ACTIVITY_CORRUPT` rather than imply complete history.

## Record schema

Every record has `seq`, `generation`, `position`, `attempt`, `threadId`, `turnId`,
`itemId`, `at`, `event`, `command`, `status`, `exitCode`, `timedOut` and `outcome`.

`seq` is the originating activity sequence; `at` is ingestion time in ISO format.
Generation, position and attempt are stored exactly. Identities must be nonempty
strings of at most 200 UTF-8 bytes. Invalid command identities or coordinates fail
with `ACTIVITY_INPUT`. `event` is `started` or `completed`. Events are independent:
duplicate notifications remain separate, and identical item IDs in different
attempts or turns are never collapsed. A retained completion does not prove its
start was observed or retained.

`command` is one of:

- `{representation: 'sha256', encoding: 'utf8' | 'argvJsonUtf8', bytes, sha256}`.
  Strings are hashed as supplied UTF-8 bytes. Arrays of at most 256 strings are
  hashed as UTF-8 `JSON.stringify(array)` bytes, preserving argument boundaries.
- `{representation: 'omitted', reason: 'notProvided' | 'unsupportedShape' |
  'sourceTruncated' | 'hashInputLimit', bytes?}`. `bytes` is included only for
  `hashInputLimit`. A supplied source truncation marker prevents hashing a prefix.

Only the notification's `item.command` is fingerprinted. There is no shell text,
argv, cwd, output, error text or arbitrary item field in a fact. A completion
without a command body remains `notProvided`, even if a start with the same ID
had one. Fingerprints identify supplied bytes; they do not prove process creation
or reconcile effects. Ordinary bounded activity previews retain their existing
input/output contract.

`status` is one of `inProgress`, `completed`, `failed`, `declined`, `interrupted`,
`timeout`, `timedOut`, or `unknown`. `exitCode` is the supplied safe integer on a
completion, otherwise `null`. `outcome` is `unknown` for starts; completions use:

1. `timedOut` for an explicit `timedOut: true`, `timeout` or `timedOut` status.
2. `declined` or `interrupted` for those explicit statuses.
3. `failed` for an explicit failed status, even if a contradictory zero exit is supplied; otherwise `succeeded` for exit zero and `failed` for nonzero exit.
4. `unknown` otherwise, including completed status without an exit code.

`timedOut` records whether the notification explicitly supplied `timedOut: true`; missing or other values are false. Reads validate the complete legal status/exit/flag/outcome combination, exact coordinates and allowed fields. SQLite checks actual UTF-8 value lengths against byte counters and budgets before JavaScript loads the fact values. Corrupt facts fail with `ACTIVITY_CORRUPT` without exposing their payloads.

Exit 124 alone is a failed exit, not proof of timeout. A turn deadline is not a
command timeout. No new inference about descendant drain or tool execution is
introduced.

## Budgets and persistence

| `limits` key | Bound |
| --- | ---: |
| `workerRecords` | 128 lifecycle events per generation/position |
| `workerBytes` | 65,536 serialized record bytes per generation/position |
| `generationRecords` | 1,024 lifecycle events per generation |
| `generationBytes` | 524,288 serialized record bytes per generation |
| `recordBytes` | 2,048 bytes per serialized record |
| `hashInputBytes` | 65,536 source bytes; larger commands are explicitly omitted |

Oldest events are evicted first. Byte budgets measure record JSON, including
sequence and coordinates; envelope keys, counters and array punctuation add a
small fixed overhead to the returned object. Counters and facts live in SQLite
`command_fact_counts` and `command_facts`. The caller continues to own the
surrounding transaction when activity is coupled to worker state. Failed writes
must not be retried without reconciliation.

Initializing these tables on an existing database records its prior ordinary
activity count as uncovered. It never reconstructs commands from retained
previews. Earlier retained runtime packages do not gain this envelope; their
missing command coverage stays unknown. Reading saved runs through their
recorded runtime and upgrading retained installations are outside this change.

## Verification boundary

The owned tests exercise real SQLite persistence, pressure and eviction, and a
local App Server protocol fixture through `runTurn`. These fixtures are not
native Codex acceptance. Native field availability, Windows sandbox/process
behavior, dashboard/CLI integration, old runtime selection and full release
verification remain coordinator-owned checks.
