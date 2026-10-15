# Worker output limits and artifact handoff

This source candidate raises the default inbound App Server JSON frame ceiling
from 1 MiB to **16 MiB (16,777,216 bytes)** in `foundation/client.mjs`.
The ceiling applies to each UTF-8 JSON line, excluding its LF delimiter, and to
the buffered unterminated line. It is not a cumulative turn-output allowance.
An explicit `maxMessageBytes` still selects a smaller ceiling.

The owner reported a Fallow read-only review ending unknown with `PROTOCOL_LIMIT`
after 2,070,688 observed bytes across 509 messages. Those are aggregate counters;
the offending frame was not retained. They do not establish its exact size or
prove that this candidate resolves that historical run. That unknown remains
unknown.

## Separate limits

These values were checked against source; only the first row changes here.
MiB means 1,048,576 bytes and KiB means 1,024 bytes.

| Boundary | Ceiling and scope | Source |
| --- | --- | --- |
| App Server inbound transport | Default 16 MiB per JSON line; explicit overrides retained | `foundation/client.mjs`, constructor and `#read` |
| Captured workspace files and diff | 512 MiB captured file bytes; separate 512 MiB patch ceiling; 20,000 files | `engine/workspaces.mjs`, `maxBytes`, `maxPatch`, `maxFiles` |
| Evaluator start input | 2 MiB serialized start envelope | `engine/evaluate.mjs`, `input` check |
| Persisted header/worker JSON | 2 MiB per serialized workflow record | `engine/controller.mjs`, `json`, `saveHeader` |
| Background launch request | 2 MiB serialized request | `engine/background.mjs`, `serialized` check |
| Evaluator broker traffic | 1 MiB per evaluator message or broker response | `engine/evaluate.mjs`, message handler and response check |
| Final answer | 512 KiB retained answer-text budget; exceeding it fails with `TURN_OUTPUT_LIMIT` | `foundation/turn.mjs`, `retain` |
| Retained turn previews | 1 MiB combined serialized item previews, at most 1,024 items; ordinary long fields previewed at 4,000 JS characters | `foundation/turn.mjs`, `itemPreview`, `retain` |
| Ordinary activity record | 16,000 serialized bytes, with field reduction; this is slightly less than 16 KiB | `engine/activity.mjs`, `normalized` loop; native tool projections use their own allowlisted bounds |

Transport headroom permits parsing a larger notification or terminal snapshot.
It does not enlarge any retention, answer, evaluator, capture, or activity budget.
Parsing may temporarily use more memory and CPU than the retained preview.
Total observed output can exceed a frame ceiling while every individual frame
remains below it.

## Failure semantics

An oversized framed or unterminated message produces `PROTOCOL_LIMIT` with the
configured ceiling in bytes and guidance to bound tool output and use file
artifacts for bulk results. The diagnostic contains no frame payload. The first
failure closes admission, rejects all pending and future requests, and does not
retry or reconnect. Caller-owned shutdown and separate cleanup evidence remain
required. Missing terminal observations and uncertain effects stay unknown;
positive fixture-child exit does not establish native Windows job drain.

## Recommended result handoff

Put bulk JSON or binary data in exact, pre-authorized owned files included in the
worker's retained capture. Return a small schema summary with relative paths,
SHA-256, bytes, record count, encoding/format, and bounded range references.
Existing source manifests can be read internally and summarized instead of
printed. Avoid large manifest dumps, raw stdout spooling, and oversized answers.

For example, an application-specific summary can describe an artifact as:

```json
{
  "outcome": "reported",
  "summary": "420 records produced; coordinator verification pending",
  "artifacts": [{
    "relativePath": "outputs/result.jsonl",
    "sha256": "<SHA-256 of the exact retained bytes>",
    "bytes": 98304,
    "recordCount": 420,
    "encoding": "utf-8",
    "format": "jsonl",
    "refs": [{"byteRange": [0, 2048], "recordRange": [0, 8]}]
  }]
}
```

This is an illustrative summary, not an existing broker API or a real artifact
claim. Ranges use zero-based, half-open bounds. A binary format must define its
record unit/count and decoding rules explicitly. Each selected range must stay
within declared byte and record counts and any required encoding boundaries.

The coordinator independently checks retained capture integrity, run/worker/
attempt and input identity, expected file scope, and artifact content before
bounded reads. Recompute hashes and sizes from the retained files; validate the
schema, encoding, actual record count, and range references. Reject missing
files, hash/size/count/range mismatches, changed captures, or stale replay inputs.
A path and hash assertion alone proves neither an artifact nor replay freshness.
Retain null result slots and unknown effects rather than inventing success or
automatically retrying effects. Keep large parsed data out of the evaluator
broker response; return only the bounded summary through that boundary.

Implications of this recommended handoff:

- **Time:** file capture and independent verification add I/O now; bounded reads
  avoid repeated bulk transfer through conversational output later.
- **Risk:** missing, altered, stale, or out-of-scope files must fail verification;
  summaries alone cannot establish correctness.
- **Complexity:** the application defines artifact schemas and range semantics;
  no new automatic output-artifact broker is introduced.
- **Best practice:** separate bulk evidence from small control/results messages
  and verify the exact retained bytes at the consumer boundary.
- **Maintainability:** explicit formats and provenance make later inspection
  repeatable, with schema/version and capture-identity checks still required.

This candidate does not change host workflow evaluation, streaming contracts,
signed helpers, MCP surfaces, or effect-retry behavior. Publication and explicit
installation are future work. Installed 0.3.5 remains unchanged. Local fixture
results and remaining limits are recorded in
[`output-headroom.md`](reviews/2026-10-14/output-headroom.md).
