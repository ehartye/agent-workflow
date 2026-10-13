# Agent Workflow

Build option 1 from the approved wiki research: a Codex plugin with an owned local runtime and dashboard. Preserve the Claude-style JS broker API and ordered prefix replay. State native-host permission/UI/budgeting differences honestly.

- Node 24+, ESM, pinned dependencies, `node --test` meaningful behavior tests.
- Write the failing test before feature code. Test real processes, persistence and failure boundaries where relevant.
- Never evaluate workflow scripts in the host process. Use a separate QuickJS evaluator with JSON-only broker messages and bounded CPU/memory.
- Fail closed on isolation or schema validation failures. Preserve missing coverage and unknown outcomes. No retry/fallback after uncertain mutating effects.
- No default-branch commits. Worktrees belong under the sibling `agent-workflow-worktrees` directory.
- The owner's wiki-master vault, under `~/.wiki-master-vault/wiki/authored/agent-workflow/`, owns project intent. Keep its as-built architecture and roadmap current when working with that vault; repository API and verification documents describe shipped behavior.

## Testing rules (agent-tests)

- Read `.testing/risk.yml` before changing tests. Its production phase and consumers were confirmed by the owner.
- One owner per invariant: extend existing coverage before adding tests. Test public inputs, outputs, persistence and process boundaries, rather than private structure or mock calls alone.
- Add old-format compatibility only for declared obligations. Missing/invalid-input behavior is current behavior.
- Use port 0 and unique temporary directories; derive paths from the test or repository. Fixture `.git` markers are allowed inside owned temporary repositories. Never write tests into the real home directory.
- Declare `@lane merge` in the first comment. Add `@subject <repo-relative path>` for subprocess, network or DOM-loaded subjects that imports cannot reveal.
- Reproduce bugs with failing tests before fixes; check new tests reject a meaningful broken behavior.
- Run affected test files during edits. Before pushing, run `npm test`, `npm run check` and `npm run smoke`. Release additionally requires `node scripts/check-install.mjs` from a clean package and `npm audit --omit=dev`.
- Keep full merge coverage: scripts, subprocesses, HTML and recipe files are inputs that import-only selection misses. Lane tags document ownership; they do not select tests automatically.
- CI verifies Windows on PRs, nightly and release tags. This is the verified deployment platform; Linux/macOS coverage is follow-up work. Required PR checks and tag verification gate publication. Avoid duplicate branch-push jobs.

## Integration contracts

`src/runtime/manager.mjs` exports `RuntimeManager`. Construct with `{ dataDir, backend, workflowsDir? }`. Methods: `start(input) -> Promise<runSnapshot>`, `get(id)`, `list()`, `events(id, since = 0)`, `control(id, action, options = {})`, `approve(id, approvalId, decision)`, `shutdown()`.

Start input: `{ script?, scriptPath?, name?, args?, cwd, concurrency?, maxAgents?, budget?, permissions?, timeoutMs? }`. Default permissions: `{ sandbox: 'read-only', networkAccess: false, approvalPolicy: 'never' }`. Budget is an observed output-token scheduling guard, not the parent turn's native pool. Snapshots include `id`, `status`, `meta`, `cwd`, `workers`, `usage`, `result`, `error`, `approvals`, `createdAt`, `updatedAt` and script/artifact paths. Controls: pause, stop, resume, cancel-worker, restart-worker, steer; options carry `workerId`, `text`, and optional edited `script` for resume.

`src/workers/codex.mjs` exports `createCodexBackend({ transport = 'app-server', executable?, config? })`. Backend: `execute(request, { signal, onEvent, onApproval }) -> Promise<{ value, usage, threadId?, turnId?, artifacts? }>`, `steer(workerId, text)`, `readRateLimits()`, `shutdown()`. Request: `{ id, runId, prompt, cwd, schema?, model?, effort?, agentType?, isolation?, permissions, timeoutMs?, stallMs? }`. Event callback receives JSON records including `type`, worker identity, tool/progress events, PID/thread/turn identifiers and usage. Approval callback returns an explicit backend decision. No automatic app-server-to-exec fallback after dispatch.

File storage and returned data are JSON. Surface-specific display adapters must not invent successful runs or hide failed worker slots.
