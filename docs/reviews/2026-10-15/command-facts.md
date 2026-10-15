# Command facts source checkpoint

Owned development only. This receipt does not certify native acceptance or release
readiness. See [the public schema and budgets](../../durable-command-facts.md).

## Changes

- `engine/activity.mjs`: independent SQLite command lifecycle retention and a
  `commandFacts` envelope on every activity page. Facts retain exact coordinates,
  bounded identities, a command fingerprint or explicit omission, and reported
  exit/timeout classification. There are independent worker and generation count
  and byte budgets, durable eviction counters, and fail-closed counter checks.
- `test/engine-activity.test.mjs`: extended the existing invariant owner with
  pressure, persistence/reopen, all four retention bounds, omissions, outcome
  classification, attempt separation, counter corruption, initialization coverage
  and process-fixture tests. Existing transaction rollback coverage now includes
  command fact insertion and counters.
- `test/fixtures/foundation-server.mjs`: one local protocol fixture mode emits
  early command start/completion, 2,500 answer/output deltas, a foreign command and
  excluded reasoning. It executes no supplied command.
- `docs/durable-command-facts.md`: exact public fields, limits, classification,
  transaction ownership and missing old-runtime coverage.

`foundation/turn.mjs`, `foundation/terminals.mjs` and
`foundation/tool-observation.mjs` were inspected. No foundation source change was
needed: the existing callback delivers original command items before preview
truncation. No controller, control, restart, background, CLI, notification, watch,
UI, shared API or skill files changed.

## Native skill activation evidence

Used genuine executor `skills.list` pagination through the returned cursors, then
`skills.read` with each returned package and `main_resource`. Returned names and
`skill_root` matched the selected identities:

| Selected ID | Returned name | Returned root |
| --- | --- | --- |
| `tdd` | `h-superpowers:test-driven-development` | `C:/Users/ehart/.codex/plugins/cache/hartye-plugins/h-superpowers/4.16.0/skills/test-driven-development` |
| `debug` | `h-superpowers:systematic-debugging` | `C:/Users/ehart/.codex/plugins/cache/hartye-plugins/h-superpowers/4.16.0/skills/systematic-debugging` |
| `test-strategy` | `agent-tests:test-strategy` | `C:/Users/ehart/.codex/plugins/cache/hartye-plugins/agent-tests/0.4.1/skills/test-strategy` |

Each native read completed with `next_cursor: null`. No skill body was loaded by
shell. Read `AGENTS.md` and `.testing/risk.yml` before test edits; the map is
production and marks engine/foundation critical. The authorized external
`craft.md` reference hash matched
`aff2ee60bb956372eb2c5e28b8ff6c6d7b74020f7f8eb68614a70c0192e30ad8`.

## Observed checks

All Node commands used `C:/Program Files/nodejs/node.exe`, observed version
`v24.18.0`.

1. Before source implementation:
   `--test --test-name-pattern='command facts survive' test/engine-activity.test.mjs`
   exited 1. The 3,000-delta pressure test failed at “Command facts have independent
   retention”: the envelope was absent after the early ordinary records were lost.
2. The initial two-file affected run exited 0: 52 tests passed.
3. The added corrupt-counter test failed with “Missing expected exception” before
   the fail-closed validation fix. The later focused run passed that test and the
   initialization coverage test. The native pressure test initially failed before
   its new fixture mode existed; this was a fixture-development failure, not a
   native acceptance result.
4. `--test test/engine-activity.test.mjs test/codex-turn.test.mjs` exited 0:
   **57 passed, 0 failed, 0 skipped**, reported duration 20,338.7246 ms. This includes
   all 42 existing turn tests covering cancellation, deadlines, interruption,
   retained output bounds, answer selection and privacy boundaries.
5. Four independent in-memory loader mutations raised worker record/byte or
   generation record/byte limits. Each targeted retention test exited 1 at the
   expected count/byte assertion. These mutations changed no source files on disk.
6. After the final source readability change and test strengthening:
   `--test test/engine-activity.test.mjs` exited 0: **15 passed, 0 failed, 0 skipped**,
   reported duration 4,721.5366 ms. This includes persisted nonzero eviction
   counters, exact command fingerprints and transactional rollback.

Persistence tests use unique directories inside the assigned worktree and remove
them during teardown. No command was reported notStarted. There are no observed
uncertain command effects; the intentionally failing checks above are retained as
failed evidence rather than acceptance claims.

Read-only Git status also showed inherited staged files outside this assignment.
They were not authored or modified by this writer. The changed files listed above
are the owned checkpoint; this receipt makes no clean-worktree claim.

## Coordinator-owned gaps

No full-suite, package check, smoke, audit, install, native Codex/sandbox acceptance,
browser, dashboard or CLI integration, retained-runtime selection, wiki, release,
Actions, Git mutation or external-message work was performed. No installations or
services were started. The managed tests CLI was not needed or invoked.

Only command lifecycle notifications supplied to activity are covered. Facts do
not recover unavailable bodies, inner commands inside raw `exec` scripts, evicted
facts, terminal-only snapshots or pre-initialization command history. Old recorded
runtimes keep their existing behavior; an absent envelope is missing coverage.
The coordinator must validate integration consumers against the additive envelope
and exercise the native event fields before claiming native acceptance.
