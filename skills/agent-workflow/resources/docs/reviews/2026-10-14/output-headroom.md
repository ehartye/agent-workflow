# Output headroom review handoff — 2026-10-14

Status: source candidate for coordinator review, not self-acceptance or a release.
Only the six assigned files were authored. No UI, argument, input-skill, signed
helper, package, installed runtime, or Git metadata edits were made.

## Source and authority

- HEAD observed: `ca0e8b73f4af142a9035e29f709483af94ab28f2`.
- `AGENTS.md` and `.testing/risk.yml` read before test edits. Phase is
  `production`; foundation and engine boundaries are critical. Declared consumers
  include plugin installations, saved workflows/commands, persisted runs, and
  retained prior runtime directories/data. Existing merge owners were extended.
- Initial status contained pre-existing staged `.playwright-mcp/` evidence and
  `dashboard-review.png` despite the clean-source description. These were left
  untouched; the coordinator must distinguish that initial state from this
  disjoint output capture.
- Native executor `skills.list` snapshot `9ef9edffe3330012` was paginated using
  returned cursors through offset 180. Native `skills.read` used each selected
  entry's returned package and `main_resource`; all three reads completed with
  `next_cursor: null`. Availability alone was not treated as activation.

| Selected authority ID | Enabled skill | Returned `skill_root` |
| --- | --- | --- |
| `tdd` | `h-superpowers:test-driven-development` | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\h-superpowers\4.16.0\skills\test-driven-development` |
| `debug` | `h-superpowers:systematic-debugging` | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\h-superpowers\4.16.0\skills\systematic-debugging` |
| `test-strategy` | `agent-tests:test-strategy` | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\agent-tests\0.4.1\skills\test-strategy` |

Names and roots matched the selected identities. No shell SKILL.md activation,
root widening, invented reference URI, delegation, or nested workflow was used.
After native activation, the authorized original `references/craft.md` was read
at the relevant integration-test section and its SHA-256 matched
`aff2ee60bb956372eb2c5e28b8ff6c6d7b74020f7f8eb68614a70c0192e30ad8`.

## Change and source limits

`foundation/client.mjs` changes only the default `maxMessageBytes` from
1,048,576 to 16,777,216 and the two oversize diagnostics. Both framed and
unterminated checks still use `>`; exactly the ceiling is allowed. The diagnostic
states the configured ceiling and bounded-output/file-artifact guidance without
including payloads. First-failure admission closure, copied errors, pending
rejection, future rejection, and caller-owned shutdown remain in place.

The limit inventory and recommended artifact handoff are in
[`worker-output-limits.md`](../../worker-output-limits.md). In particular:

- 512 MiB file capture and separate patch ceiling: `engine/workspaces.mjs:9`.
- 2 MiB evaluator start: `engine/evaluate.mjs:11`; 1 MiB evaluator message and
  broker response: lines 58 and 65.
- 2 MiB workflow/header JSON: `engine/controller.mjs:30`, header save at line 97;
  2 MiB background launch JSON: `engine/background.mjs:57`.
- 512 KiB retained answer text and 1 MiB combined previews:
  `foundation/turn.mjs:87`; 4,000-character ordinary field previews at lines 14–16.
- Ordinary activity serialization uses **16,000 bytes**, not exactly 16 KiB:
  `engine/activity.mjs:53`. Native tool projections have separate allowlisted
  normalization. None of these budgets changed.

## Executed RED / GREEN evidence

Verified executable: `C:/Program Files/nodejs/node.exe`, version `v24.18.0`.
Each run used only:

```powershell
& 'C:/Program Files/nodejs/node.exe' --test test/codex-foundation.test.mjs test/codex-turn.test.mjs
```

| Stage | Process exit | Results including subtests | Reported duration |
| --- | --- | --- | --- |
| RED, new fixture/tests before client edits | 1 | 107 tests; 103 pass, 4 fail; 0 skipped/cancelled | 5,823.3693 ms |
| Initial GREEN after client edits | 0 | 107 tests; 107 pass, 0 fail; 0 skipped/cancelled | 12,514.9596 ms |
| Refined GREEN after boundary-response and retained-history assertions | 0 | 108 tests; 108 pass, 0 fail; 0 skipped/cancelled | 12,989.0341 ms |

RED failed for the intended reasons:

1. Exactly 16 MiB and the 2 MiB tool-output turn both received `PROTOCOL_LIMIT`
   with `Codex message exceeded the bounded frame limit` under the old default.
2. Both over-bound cases rejected the old diagnostic because it lacked
   `16777216 bytes` and the required actionable guidance.

These failures are negative controls for the former default and diagnostic.
No giant fixture values were printed in assertions. The initial and refined
runs passed the existing split-UTF-8, approval denial, auth sanitization,
explicit 1,024-byte frame budget, final-answer failure, cancellation, and cleanup
coverage in the two authorized files.

The refined real-process coverage establishes:

- An exactly 16,777,216-byte UTF-8 JSON frame is delivered once; its request
  response and a later echo route normally.
- Valid 16,777,217-byte JSON with LF and without LF rejects both outstanding
  requests and a later request. Oversize notification delivery is zero and the
  failure callback fires once. An owned fixture journal contains exactly
  `server-start`, `initialize`, `initialized`, `hang`, `frame`: one request
  delivery, one server instance, no retry or later echo/interrupt transmission.
- A single 2,097,152-byte UTF-8 tool-output delta, completed command item, and
  completed turn snapshot pass with a short final answer. Unicode markers survive,
  output is truncated only in retained previews, command metadata remains, the
  serialized result stays under 32,000 bytes, and later routing works with zero
  interrupts. Aggregate observed bytes exceed 6 MiB; this is not a frame size.
- Timeout and oversize failures preserve known completed-command evidence and
  unknown terminal state, do not inherit another request's `notStarted`
  annotation, refuse thread reuse, and observe owned fixture-server exit.
- The existing 600,000-character final-answer fixture still fails with
  `TURN_OUTPUT_LIMIT`; increasing transport headroom does not accept it.

The fixture constructs LF-terminated versus unterminated streams; OS pipe chunk
boundaries are not controlled. The tests establish public rejection behavior,
not which private read branch first sees the excess byte.

## Remaining review and verification boundaries

The reported Fallow failure had aggregate observed bytes 2,070,688 and 509
messages, with no retained offending frame. The old Fallow unknown remains
unknown. No native App Server 2 MiB acceptance, Windows job membership/drain,
Session 0 acceptance, or recovery of historical effects is claimed. Fixture
cleanup positively observes the owned server child and explicitly reports
`descendants: notVerified`.

Only affected-file tests ran. Combined gates, independent capture/content and
replay-freshness checks, wiki reconciliation, native acceptance, publication,
and explicit installation belong to the coordinator. No full suite, install,
service, browser, Actions, commit, push, or runtime update ran. Installed 0.3.5
remains unchanged; this source needs future publication/install to take effect.
The artifact-summary recommendation adds no automatic output-artifact broker
API and grants no effect retries or output-budget bypass.

Read-only inspection friction: an early `rg` invocation used Windows-invalid
wildcard path arguments, and several guessed filenames did not exist; those
commands launched and reported read errors. File discovery resolved the names.
PowerShell profile initialization also emitted `Import-Clixml` warnings during
some reads; later reads used a non-login shell. These were inspection issues,
not blocked Node prerequisites or evidence of a test failing to start.
