# Structured Workers Implementation Plan

> Execute inline with h-superpowers:executing-plans under the owner's existing implementation authorization. Use independent code review before checkpointing.

**Goal:** Complete part 1 of the worker parity release specification and prove a real structured Codex workflow, while leaving parts 2–4 active.

**Architecture:** A bounded schema module and settings resolver validate before dispatch. The native turn runner forwards reviewed protocol fields. A worker session owns correction turns; controller callbacks reserve and persist every attempt. The controller validates accepted JSON independently and includes effective execution settings in cache keys.

**Tech Stack:** Node 24 ESM, pinned Codex 0.162.1 App Server, existing QuickJS/SQLite, pinned Ajv, Node behavior tests.

## Task 1: Schema admission and result validation

Files: create `engine/schema.mjs`, `test/engine-schema.test.mjs`; modify `engine/controller.mjs` and its existing tests.

- [x] Write failing schema tests through `compileSchema(schema)` returning `{schema, validate(value)}`. Valid nested object/array/enum/nullable cases pass; required keys forbidden by closed properties, inverted bounds, incompatible types, invalid keywords, excessive depth/size and malformed JSON fail with bounded diagnostics.
- [x] Run `node --test test/engine-schema.test.mjs` and observe missing implementation failures.
- [x] Implement strict bounded draft-07 subset compilation with no remote references, schema-generated regex, mutation, coercion or default insertion. Preserve supported semantics in the native schema. Diagnostics name keyword/path without exposing returned private data.
- [x] Extend controller tests: invalid schema invokes backend zero times; valid schema returns object; invalid returned object produces a failed slot; changed schema invalidates cached suffix. Run focused schema/controller tests.

## Task 2: Settings and native forwarding

Files: create `engine/settings.mjs`, `test/engine-settings.test.mjs`; modify `engine/backend.mjs`, `foundation/turn.mjs`, `test/codex-turn.test.mjs`, `test/fixtures/foundation-server.mjs`, CLI/background/controller.

- [x] Test explicit worker versus run defaults, catalog model/effort rejection and read-only permission narrowing. Invalid settings must fail before a fake native turn is admitted.
- [x] Generate protocol with `codex.exe app-server generate-json-schema --out test-output/protocol`; inspect `TurnStartParams`, `ThreadStartParams` and `ModelListResponse` rather than guessing names.
- [x] Add only documented `model`, `effort` and `outputSchema` fields to turn/start; extend fixture to echo/verify exact values and route early notifications unchanged.
- [x] Resolve catalog/config defaults once per backend, normalize per-worker settings, retain effective values, include them in replay identity, and add run CLI flags whose saved launch values survive resume.
- [x] Run settings, controller, turn and policy tests together.

## Task 3: Counted structured corrections

Files: create `engine/worker-session.mjs` and its focused test; modify backend/controller.

- [x] Test malformed then valid output, five-attempt exhaustion, explicit smaller count, cancellation/unknown-terminal refusal, and shared lifetime budget exhaustion before another turn starts.
- [x] Reuse the same native thread for JSON correction turns. Reserve/persist each extra attempt before inference; retain validation outcome and observed execution evidence. No transport fallback and no retry after uncertain execution.
- [x] Controller independently validates final backend value before saving completed. Known terminal validation failure stays failed; unknown native execution stays unknown.
- [x] Run all affected tests and review boundedness and failure evidence independently.

## Task 4: Native proof and checkpoint

Files: add `engine/structured-check.mjs`, acceptance report, update engine README/testing/parity docs and wiki.

- [x] Create an owned temporary marker file; run a schema-constrained subscription worker that reads it once and returns `{marker: string}`. Verify actual successful command evidence, exact marker, effective settings and owned-server exit.
- [x] Replay the same script with zero additional model dispatches. Retain a sanitized report, not account data or marker values.
- [x] Run `npm test`, `npm run check`, `npm run smoke`, agent-tests delta review and independent code review; update evidence and wiki, commit/push the feature branch.
- [ ] Continue parts 2–4 with their own concrete subsystem plans; do not merge/release or mark the goal complete based only on this checkpoint.
