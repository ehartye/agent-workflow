# Large-input writer evidence — 2026-10-14

Status: reported source checkpoint, not coordinator acceptance. Assigned worktree only; existing reviewed UI/dependency state preserved. No Git metadata changes, installs, real backend/inference, services, browser, nested workers, publication or GitHub Actions dispatch/re-enablement.

Coordinator follow-up: independent review found that metadata is absent from the evaluator body but duplicated alongside full source in saved headers. A 600000-character metadata description plus 1500000-character args passed evaluator preflight and failed the header only after binding/backend creation. Meaningful RED receipts retained `Workflow record exceeded its limit` at header save. The fix checks known persisted input fields through the shared record serializer before CLI binding and before new-run controller state creation. Both foreground and detached CLI cases now refuse without bind/backend sentinel activity; direct controller admission leaves no run directory. Two targeted regressions passed, including existing large-Unicode snapshot/replay coverage. Exact full header/detached limits remain enforced; this added check is a lower bound and does not pre-accept later runtime/workspace overhead. Full combined gates are recorded in the coordinator ledger.

## Native skill evidence

Genuine executor `skills.list` traversed returned cursors `aaebabed575b6177:20:48000` through `:180:48000` to the final page. For each selected ID, genuine `skills.read` used that page's returned full package and main_resource. All returned `next_cursor:null` and the expected name/root:

| ID | Name | Returned original skill_root |
| --- | --- | --- |
| tdd | test-driven-development | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\h-superpowers\4.16.0\skills\test-driven-development` |
| debug | systematic-debugging | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\h-superpowers\4.16.0\skills\systematic-debugging` |
| yoda | yoda | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\hartye-skills\0.4.0\skills\yoda` |
| test-strategy | test-strategy | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\agent-tests\0.4.1\skills\test-strategy` |
| authoring | workflow-authoring | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\agent-workflow\0.3.5\skills\workflow-authoring` |

The authoring package's `references/worker-admission-and-replay.md` was also read with its genuine native resource URI. The explicitly authorized outside-package `references/craft.md` matched SHA-256 `aff2ee60bb956372eb2c5e28b8ff6c6d7b74020f7f8eb68614a70c0192e30ad8`; bounded ordinary reads covered behavior seams, isolation, risk and fault injection after activation. No native reference read failed; no invented resource URI or shell SKILL.md activation was used. Repository AGENTS.md and `.testing/risk.yml` were read before test edits (production; existing declared consumers retained).

## Changes and existing invariant owners

- `bin/arguments.mjs`: new-run-only `--args-file`, mutual exclusion with inline args and public help.
- `bin/command.mjs`: existing bounded regular-file UTF-8 JSON reader, parsed-value snapshot and shared envelope preflight before binding/backend. Evaluator import is local to new-run handling so doctor fixtures remain independent.
- `engine/evaluate.mjs`: one exact 2 MiB start-envelope serializer reused by preflight and child evaluation. No host workflow evaluation or raised limits.
- `engine/controller.mjs`: retain `AGENT_INPUT` and the 65536-unit limit; expose specific UTF-16/file/hash/range guidance.
- `test/managed-entry.test.mjs`: real public launcher/command child chain with synthetic managed runtime/backend hooks; large Unicode args, persistence/replay after source change, conflicting flags, malformed JSON, invalid UTF-8, directory, raw oversize, combined-envelope oversize for file and inline, inline success and saved-command option rejection.
- `test/engine-evaluator.test.mjs`: exact combined-envelope boundary, UTF-8 byte accounting, overflow before broker calls and unchanged script size.
- `test/engine-controller.test.mjs`: oversized astral-character prompt retains code/guidance without backend execution.
- `docs/api.md`, `skills/agent-workflow/references/runtime-api.md`: public contract and current limits/freshness.
- `skills/workflow-authoring/SKILL.md`, `skills/workflow-authoring/references/large-inputs-and-batches.md`: required input decision, direct reference, frozen manifest/ranges, bounded rounds/budgets and genuine per-role skill/tool selection.
- `docs/reviews/2026-10-14/large-inputs.md`: this evidence and gaps.

## RED / GREEN receipts

Executable observed: `C:\Program Files\nodejs\node.exe`, version `v24.18.0`. Commands ran from the assigned worktree with PowerShell profiles disabled after read-only profile startup emitted Import-Clixml errors. No execution policy/global configuration was changed.

1. RED command: `node --test --test-name-pattern='public args-file' test/managed-entry.test.mjs` (tool chunk `8e8ed4`, exit 1): 1 test, 0 pass, 1 fail; child stderr exactly `Agent Workflow: Unknown option '--args-file'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--args-file"`.
2. RED command: `node --test --test-name-pattern='evaluator preflight|oversized worker prompt' test/engine-evaluator.test.mjs test/engine-controller.test.mjs` (chunk `0a2107`, exit 1): 2 tests, 0 pass, 2 fail. Preflight export was `undefined`, expected `function`; controller message was exactly `Unsupported agent prompt or options`, failing `/65536 UTF-16/`.
3. Initial implementation run (chunk `57bc99`, exit 1): evaluator/controller passed; synthetic CLI backend did not forward admitted access policy. Fixture corrected. Next run (`e23d52`, exit 1) exposed that the sentinel also counted allowed read-only runtime selection, corrected to record binding/backend only. Neither was a production-policy relaxation.
4. First GREEN checkpoint: `node --test --test-name-pattern='public args-file|evaluator preflight|oversized worker prompt' test/managed-entry.test.mjs test/engine-evaluator.test.mjs test/engine-controller.test.mjs` (chunk `11d4d5`, exit 0): 3 tests, 3 pass, 0 fail, 1441.7346 ms. Later refinement upgraded CLI coverage to the actual public launcher child chain and added combined script+inline/file overflow.
5. Affected-owner command: `node --test test/managed-entry.test.mjs test/engine-evaluator.test.mjs test/engine-controller.test.mjs` (initial chunk `1a977f`, completion `90093b`, exit 1). Static evaluator import broke existing doctor module fixtures; fixed by moving the import into new-run handling. Existing deadline parsing and runtime-install fixture tests hit `AGENT_WORKFLOW_WORKER` guards. Output was bounded/truncated; no passing-total claim is made for this attempt.
6. Follow-up owner selection used `--test-name-pattern='^(?!public CLI accepts explicit run and worker deadlines|public launcher selects the run-pinned runtime)'` (initial `88dcc0`, completion `a2a51d`, exit 1), but still reached the guarded tests. Treat this selection as ineffective, not missing execution. The install guard again reported `Worker processes cannot install runtimes`; no fallback/install was attempted. Subsequent selection must use Node's supported `--test-skip-pattern`, confirmed in local `node --help`.
7. Final affected-owner run: `node --test --test-skip-pattern='public CLI accepts explicit run and worker deadlines|public launcher selects the run-pinned runtime' test/managed-entry.test.mjs test/engine-evaluator.test.mjs test/engine-controller.test.mjs` (initial `013a14`, completion `18a33f`, exit 0): **79 tests, 79 pass, 0 fail**, 10175.7303 ms. The real launcher/command args-file regression passed in 2168.0915 ms. Node reported `skipped 0` because the skip-pattern excludes matching tests from execution/counting; the two explicit excluded cases are named below. No further broad failed selection was attempted.
8. `node --check` passed for all four edited source modules; owned-path `git diff --check` passed (chunks `823828`, `c51ba1`). These are syntax/whitespace checks, not integration acceptance.

## Source-verified limits

`engine/script.mjs`: 1 MiB script; `engine/evaluate.mjs`: 2 MiB combined serialized start envelope, 1 MiB message/response, 10000 total broker calls and 4096 pending; `engine/evaluator-child.mjs`: 4096 `parallel`/`pipeline` entries; `engine/controller.mjs`: 65536 UTF-16 prompt units, maximum 1000 requested workers and cumulative starts/attempts. Concurrency remains 1–256, independent of batch size. These are different boundaries, not interchangeable quotas.

## Missing verification / unsupported contracts

Full suite, all affected owners outside this worker, integration/full gates, rendered verification, real native backend and real saved-runtime upgrades are root/coordinator-owned and were not claimed. Exactly two pre-existing tests were excluded from the final worker run: `public CLI accepts explicit run and worker deadlines for starts and resumes` (ambient recursive-workflow guard), and `public launcher selects the run-pinned runtime after upgrade and refuses foreign-session control` (runtime-install guard). No ambient `AGENT_WORKFLOW_WORKER` removal or policy change was made to pass these cases. The new synthetic CLI fixture removes that marker only in its own controlled child environment, as existing CLI fixtures already do; it admits no real backend or installer. The test uses synthetic admission/backend identity and real QuickJS/persistence; it does not prove native inference, Windows job drain, or exactly-once external effects.

Args-file is JSON value transport, not streaming/bulk storage. Paths in saved args are not content snapshots. Manifest/chunk immutability, range/count coverage and freshness are authored worker/coordinator obligations, not new automatic runtime verification. No filesystem API is added to the evaluator. Existing saved runtimes do not gain this flag retroactively, and runtime/API identity checks remain unchanged.

## Yoda bounded inspection

The failure mode addressed is missing input-transport/size/freshness decisions before workflow drafting. The new decision and direct reference are front-loaded; exhaustive limits/examples live one reference level below. The existing trigger remains scoped to authoring/revising multi-worker workflows, with ordinary edits explicitly outside it. Inspection of near-miss wording is not an observed triggering/effectiveness trial.

Structural/link/Unicode scan (`dd4776`, exit 0): authoring skill name matches its directory, description 244 characters, body/file 83 lines before the final wording clarification; new reference 94 lines, runtime API 79 lines and public API 173 lines at that checkpoint. All local Markdown links resolved. The four edited guidance documents contained zero Unicode format/invisible separator characters and zero positional argument placeholders. The JavaScript example passed the real `parseScript` validator without executing it. The reference treats input content as data, retains owned paths/permission ceilings, hashes/ranges and missing results, and grants no install/retry/delegation authority. These bounded checks cannot certify overall safety or skill effectiveness.

Final bounded scan after the release-boundary clarification (`eda4c7`, exit 0) again passed Unicode/placeholders/local links for all four guidance files and parsed the example without execution. Final line counts: authoring skill 83, new reference 94, runtime API 79, public API 175. Every document explicitly mentions installed 0.3.5. The updated help passed `node --check`; owned-path `git diff --check` passed. Scoped status shows only the twelve listed owned files changed/new; the two new artifacts are this report and `skills/workflow-authoring/references/large-inputs-and-batches.md`. Source is retained uncommitted for authoritative coordinator capture/review; this report is not a capture-integrity receipt.

Paired effectiveness remains **pending**: no new paired trial or nested worker was authorized. Root notes the older bundle comparison was qualified because both authoring texts hit a 10000-character cap; that comparison does not measure this new guidance. No self-score, measured improvement or acceptance claim is made. Public docs explicitly mark args-file as unreleased candidate-only until release/installation; installed 0.3.5 can already use small manifest references through inline args.

Wiki discover/ingest/roadmap updates outside the owned files are deferred to the coordinator; no external vault writes were made. Native catalog discovery required ten unfiltered pages to reach exact standalone IDs; a future ID/root filter would reduce discovery output, but no plugin tool/catalog change is in this writer's scope. One exploratory read-only command exited nonzero because guessed `engine/background-worker.mjs` does not exist; it was not an implementation prerequisite and no file was created. Managed test-cli readiness/static report was not independently established; no installation was attempted.
