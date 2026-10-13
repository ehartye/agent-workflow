# Worker capability parity and release specification

The owner authorized specification, planning, development, shipping and merging all four parts below. This is the release objective, not a claim that the existing prototype completes it. Continue on the feature worktree; the installed 0.1.1 runtime is separate. Keep subscription authentication, reject API-key fallback, omit custom MCP, preserve saved user data, and defer SSH.

## 1. Structured results and worker settings

`agent(prompt, {schema, model, effort, permissions})` returns validated JSON when a schema is supplied and text otherwise. Reject malformed, unsupported and provably contradictory schemas before any model dispatch. Bound schema size/depth and validation cost; unsupported keywords fail explicitly, never silently disappear. Native `turn/start.outputSchema` constrains generation; a separate local check owns result acceptance. Default structured output allows five total attempts, with an explicit bounded setting. Correction turns reuse the same thread and request correction of the final answer; every additional model turn consumes the shared lifetime-attempt budget and is persisted. Transport loss, cancellation and unknown terminal state never become validation retries. Final validation failure is known failure, not accepted text or a guessed JSON object.

Model/effort resolve from explicit worker settings, then run defaults, then effective Codex configuration/catalog. Check requested values against account model discovery before inference; preserve effective model/effort in evidence and replay identity. Do not equate catalog visibility with billing entitlement. Permission ceilings are explicit per run and may only narrow per worker. Start with read-only/no-network/never, then add isolated writer policy in part 3; no silent escalation. Keep inherited integrations disabled unless a later explicit policy enables a supported capability.

Acceptance: invalid/contradictory schema dispatches zero models; missing/wrong fields fail; valid object returns to JavaScript; retries are bounded and counted; unknown effects never retry; settings changes invalidate replay; unavailable model/effort and permission widening fail before inference. One real subscription-backed read returns an exact unpredictable marker in validated JSON with recorded effective settings, then completed replay dispatches zero models.

## 2. Live activity and individual controls

Route actual native item/turn/usage notifications to the correct worker and retain bounded durable history with explicit truncation and paging. Show tool input/output/status and current activity in the graph and inspector; do not infer progress percentages from elapsed time. Steering addresses the confirmed active turn. Individual cancellation closes that worker's admission/turn and preserves terminal and cleanup evidence. Restart requires verified termination and explicit reconciliation of uncertain effects; a timeout or interrupted model turn alone is insufficient. Keep attempts, earlier failures and usage visible. Whole-run controls continue to bound shutdown and preserve generation-specific receipts.

Acceptance: concurrent notifications cannot cross workers; stale control generations/turns fail; steering and cancellation are demonstrated locally; a deliberately uncertain worker cannot restart; an eligible cancelled worker restarts once with retained history. Native command lifetime evidence must match the restart claim, including relevant child processes. No replacement custom Windows process-tree architecture is assumed in advance.

## 3. Writable workspaces

Explicit writer authorization creates an isolated sibling Git worktree for each writer task. Capture the chosen base and permitted local inputs, prohibit automatic merge, and retain tracked diffs/untracked files as reviewable artifacts. Sandbox writable roots must match the owned worktree and permission ceiling; inability to isolate fails admission. Completion and interruption retain workspace evidence. Reviewable diffs remain available through the CLI and monitor.

Acceptance: two writers cannot overwrite each other's files or the main checkout; local intended inputs are visible; native sandbox blocks out-of-scope writes; successful and interrupted runs retain inspectable diffs; uncertain execution cannot release/reuse its workspace. A real local workflow reads, edits in isolation, validates and produces a diff without changing the source checkout.

## 4. Saved workflows, integration and distribution

Resolve project/personal/bundled workflows with documented precedence, namespacing, structured arguments, reload and collision/symlink rules. Expose CLI and skills for create/run/watch/control/save/mode, preserving original-session identity and runtime-pinned resume. Update all skills for the fresh runtime and run Yoda paired baselines and near-misses; use agent-tests for meaningful suite/risk review. Remove custom MCP from new plugin manifests/installation and remove superseded runtime entrypoints deliberately. Preserve old data and matching runtimes needed for existing saved runs; never reinterpret incompatible data silently.

Acceptance: clean installation uses only packaged production dependencies, setup/doctor and a saved workflow work under the subscription gate, the authenticated monitor opens, and a second invocation reuses saved definitions correctly. Required Windows CI, native end-to-end evidence, security/quality review and dependency audit pass. Rebase onto latest default branch, create/update a reviewable PR, squash-merge without bypassing protections, publish a verified version/tag, update the shared marketplace, verify installation of that exact version, and sync the main checkout. No release-complete claim until all these artifacts are verified.

## Evidence and scope

Use `docs/codex-parity.md` for the broader parity ledger and preserve remaining requirements there. Current evidence comes from the wiki's captured Claude workflow contract and Codex App Server docs plus the pinned executable's generated 0.162.1 schema. New research goes through wiki discover/ingest; implementation outcomes update the living architecture/roadmap. Protocol limitations remain explicit and cannot be waived by a passing mock test.
