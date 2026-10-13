# Codex foundation implementation plan

**Goal:** independently prove the supported Codex execution boundary without model calls or modifying the installed plugin.

**Architecture:** fresh stdio client, strict managed-ChatGPT diagnostic gate, command-only capability probe. No imports from the current worker/runtime implementation. Node built-ins and pinned Codex 0.162.1.

**Execution:** inline under executing-plans and TDD; the owner's proceed instruction authorizes this design. Independent review before handoff.

- [x] Create sibling worktree `codex-foundation`, install pinned dependencies, run release baseline (`npm test`: 139 passed).
- [x] Add a failing real-subprocess protocol test in `test/codex-foundation.test.mjs` and fixture `test/fixtures/foundation-server.mjs`. Exercise out-of-order replies, UTF-8 framing, stream notifications, denied server requests, connection loss and bounded shutdown. Run `node --test test/codex-foundation.test.mjs` and retain red evidence privately.
- [x] Implement `foundation/client.mjs` from the tested protocol contract. Run the same test command to green.
- [x] Add authentication and probe-result tests, then implement `foundation/probe.mjs`. Test no inference dispatch, read-only/no-network policy, failed readiness, process-scoped cancellation and primary-versus-cleanup errors.
- [x] Add `foundation/check.mjs` with explicit cwd/native binary/backend inputs and JSON report output. Native checks use no model turns and report the exact bounded capability proved, not generalized readiness.
- [x] Record the complete parity ledger in `docs/codex-parity.md`. Native UI/budget differences remain open acceptance work.
- [x] Run native default sandbox probe. Inspect MXC availability using the documented no-model compatibility command; do not alter machine settings. A failed capability is evidence to choose a new foundation, not permission to spend model tokens or broaden execution.
- [x] Independently review; fix important findings with regression tests. Run `npm test`, `npm run check`, `npm run smoke`, diff checks. Commit the milestone on the feature branch and update the wiki with actual outcomes and remaining gates.

Native acceptance: account type ChatGPT and approved provider, command output/exit verified, streamed output correctly attributed, cancellation terminal response received, owned server exit observed. Unavailable capabilities stay failed/unknown; no whole-tree or model-runner guarantee inferred. Two concurrent inference tasks are admitted only after the preceding gates pass; SSH acceptance cannot be fabricated locally.

Local result: configured backend reported ready but failed buffered command admission. Explicit MXC passed all six stages; two subsequent ChatGPT model turns each completed one successful README read with exact unpredictable markers. Independent review passed after red/green privacy, cancellation and terminal-diagnostic regressions. Added foundation/turn.mjs and foundation/model-check.mjs for this model-backed proof. SSH is deferred by the owner. Full parity remains open in the ledger; this milestone is not installed or released.
