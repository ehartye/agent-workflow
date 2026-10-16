# Complete authoring comparison v2

Both plans passed all 12 planning criteria: **activated A 12/12; baseline B 12/12**. Independent review accepted both scores without a material dispute. This pair shows no score advantage and establishes neither causality nor general skill effectiveness.

The [scenario](scenario.md) and [rubric](rubric.json) used released Agent Workflow 0.3.6. The native writers produced complete captured artifacts, and a separate blind grader reviewed anonymous full plans plus public API/source. The independent result was frozen before revealing the mapping; see [acceptance.json](acceptance.json) and [blinded outcome](independent-blinded-outcome.json).

| Condition | Anonymous plan | Original bytes | Original SHA-256 | Score |
| --- | --- | ---: | --- | ---: |
| Revised native skills | [A](anonymous-A.md) | 54,350 | `5fae5e02d73a6352c6526b15bbdd4172e073f6df75384b30afc43b5bb9da3501` | 12/12 |
| Baseline | [B](anonymous-B.md) | 81,389 | `9f3589219207e60b9a6fa8df9dafaa31983382b6d32e94bf096106fbfee95f33` | 12/12 |

Exact [activated](original-activated.md) and [baseline](original-baseline.md) originals, [anonymous manifest](anonymous-artifacts.json), and [native grade](blind-grade.json) are preserved. Only explicit condition disclosures were removed or neutralized for blinding; independent byte reconstruction verified those transformations. Reviewed public inputs are copied under reviewed-public with their exact original bytes and indexed in [evidence-files.json](evidence-files.json).

The grader's sole 56,170-byte output passed recorded-runtime workspace integrity, literal ownership, result/manifest/patch hashes, two genuine selected main-resource reads, source checks before and after, and positive unforced owned cleanup. Independent checks verified all 94 plan excerpts and 32 public-reference excerpts by UTF-8 byte offset, all input identities, all contiguous declared read ranges, and all 13 referenced public file hashes. Both literal guest scripts pass the released parser; semantic review checked real thunk calls, checkout-scoped definitions, finite worker limits, both recovery closures, capture barriers and fresh verification. This was static plan acceptance, not execution of the proposed workflows.

The earlier [v1 assessment](../authoring-coordinator.md) remains unchanged: baseline raw 11/12 and activated raw 9/12, with one rejected deadline penalty that would restore activated to 10/12; neither plan was accepted. V2 clarified the common rubric and allowed the grader public API/source access. These changes prevent attributing the difference to revised skills alone. No follow-up checkpoint steer was planned for v2, unlike the shared steer in v1.

Observation preserves its gaps. The pair consumer attached at 04:57:05.644Z after a corrected local relative-path error; it consumed terminal cursor 3. The grader consumer attached at 05:12:46.714Z and consumed terminal cursor 2. Both exited 0, without restarting workers. Native command history is retained-items-only; main-resource metadata is proven, body comprehension and full catalog pagination are not independently proven. The pair watch contains a baseline completed file-change fact timestamped 04:56:31.491Z and no activated file-change record. That is telemetry, not proof of first useful disk write or failure to write early: command writes and missing initial coverage limit inference.

Manual dashboard Close and an explicitly owned no-wall-limit policy are valid planning choices. These plans correctly choose the finite worker API actually available in 0.3.6; they do not claim acceptance of later candidate-only lifetime features. Missing renderer checks remain unaccepted in the hypothetical delivery.
