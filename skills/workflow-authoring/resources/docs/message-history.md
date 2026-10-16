# Completed message history

Completed agent messages have a separate bounded local store. Raw activity keeps
its existing sequence, observed count, cursor and 256/4096 notification tails.
The new store retains terminal plain text only with exact worker, attempt,
thread, turn and item coordinates; deltas never establish a complete message.

Limits are 64 messages/1 MiB per worker and 256 messages/4 MiB per generation,
with 32768 UTF-8 text bytes and 36864 serialized bytes per record. Count limits
take precedence when both count and byte budgets overflow. Eviction removes the
oldest terminal sequence deterministically and charges the corresponding count
or byte reason to that worker. Record size includes its own exact serialized
`bytes` field. A page has at most the requested 1..100 records and 512 KiB of
record JSON, leaving response-envelope headroom below 1 MiB.

## Storage and provenance

The dashboard identifies each retained terminal text block by its validated
message ID. When polling updates the target worker, the open message keeps its
keyboard focus and horizontal/vertical text scroll, along with the panel scroll.
If the focused content leaves the bounded view, focus returns to the panel.

`createActivityTable` initializes separate `completed_messages` and
`completed_message_counts` tables in the current runtime's writer database.
Initialization snapshots existing `activity_counts.observed` per worker as
`priorActivityUncovered`, once. That number is raw notifications, not messages.
It never backfills terminal bodies from an already evicted raw tail.

Only observed `item/completed` notifications with an `agentMessage` and plain
well-formed text enter this store. The generation, physical worker position,
saved cumulative attempt, native thread/turn and item IDs must be exact and
bounded. An available active-turn identity must agree. The stable message ID
hashes those coordinates; it is an identity key, not acceptance evidence. Each
record contains exactly:

```text
id, terminalSeq, generation, position, attempt, threadId, turnId, itemId,
text, terminalObserved, complete, truncations, bytes
```

`terminalSeq` is the actually inserted raw activity sequence. Only an observed,
untruncated terminal plain-text body is complete. Truncation reasons distinguish
`sourceTruncated`, `textBytes` and `recordBytes`; the latter covers JSON escaping
that expands otherwise short text. Prefix trimming preserves Unicode code
points. A source that supplied shortened commentary or other terminal previews
continues to carry that loss; this store cannot recover omitted source text.
Deltas, later turn completion and similarly named items in another attempt or
turn never establish a complete message.

Repeated identical terminal observations are no-ops for message storage and
still produce their own raw activity records. A later terminal can replace an
explicitly incomplete prefix only when its text is consistent, its provenance
does not worsen, and it improves text/provenance. A contradictory terminal
refuses with `ACTIVITY_CORRUPT`; it cannot overwrite a complete answer. An
evicted identity observed again is a new insertion, with no lifetime-unique
message claim. Duplicate/conflict payload histories are not accumulated.

All storage mutations occur inside `recordActivity` and its caller-owned SQLite
transaction. They share the controller's existing clone/commit/rollback
boundary. No alternate writer or initialization from a reader was introduced.
Raw normalization, command facts, usage, activity count and 256-per-worker /
4096-per-generation raw tails keep their existing semantics.

## Reading and coverage

`readCompletedMessages(db,{generation,position,after=0,limit=50})` pages by
terminal sequence. `nextCursor` is the last returned terminal sequence or the
input cursor on an empty page. `hasMore` reflects the next retained row,
including a page split by the response byte budget. It never fabricates cursors
for dropped bodies.

For an available store the response has `schemaVersion:1`, `available:true`,
`coverage:'terminalNotificationsOnly'`, `limits`, `records`, `nextCursor`,
`hasMore` and these `counts`:

```text
terminalNotificationsObserved, insertions, replacements, duplicateNoops,
retained, evictedCountLimit, evictedByteLimit, retainedBytes,
priorActivityUncovered
```

The reader enforces:

```text
terminalNotificationsObserved = insertions + replacements + duplicateNoops
retained = insertions - evictedCountLimit - evictedByteLimit
```

The observed terminal count covers eligible terminal plain-text notifications,
including duplicate observations. It is not a unique message count. Prior raw
coverage and eligible observed terminal counts cannot exceed raw observations.
SQL validates actual UTF-8 serialized sizes and generation/worker retention
budgets before message bodies are materialized. Corrupt sizes, coordinates,
counter relationships, terminal provenance and false complete flags fail closed.

`monitorData` kind `messages` uses the same historical and cached source
generation/position/origin validation as activity. Authenticated GET routes are
`/api/messages` and `/api/runs/:id/messages`, with required generation/position,
optional earlier linked sourceGeneration, nonnegative after, and limit 1..100.
Unknown or repeated message query keys are refused. The monitor validates the
raw observed count against saved worker state independently, so retained
messages cannot conceal a reset raw counter or cursor.

When storage is absent the read-only response is:

```text
{available:false,coverage:'legacyRawOnly',priorActivityUncovered,
 records:[],nextCursor:after,hasMore:false}
```

A half-present schema is corruption. Reading never creates or alters a table.
For an older retained runtime the session adapter uses that runtime's own raw
activity reader to disclose uncovered notifications; it does not load new
execution code into that run or migrate the database. A missing/incompatible
reader remains unsupported. The worker Messages view presents bounded terminal
history separately and retains existing raw-fragment grouping with explicit
partialness. Missing coverage counters are an error, not a complete answer.

## Privacy and verification

This is private local message retention under the existing authenticated
dashboard contract. It stores the permitted user-visible message body; such
body text can itself contain sensitive material. It adds no authentication
token, prompt, raw reasoning, tool output, command body, private environment or
tool argument fields. It is not a public transcript export or command-check
receipt store.

Tests cover on-disk reopen, worker and generation count/byte eviction, duplicate
and replacement accounting, out-of-order deltas, cross-turn/attempt separation,
multibyte and JSON-expansion truncation, cursor paging, corrupt metadata/counts,
false completeness, and legacy read-only databases. The messages HTTP invariant
owner now retains a terminal record while resetting raw counters under tail
pressure, and proves its refusal assertion rejects a version with only the
messages raw-count validation removed. The mutation loads from memory and
changes no product files. Retained producer test claims remain historical;
current command results and missing independent/native/browser/integration
qualification are in [dashboard-deadlines.md](dashboard-deadlines.md).
