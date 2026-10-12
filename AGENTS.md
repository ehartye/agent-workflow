# Agent Workflow

Build option 1 from the approved wiki research: a Codex plugin with an owned local runtime and dashboard. Preserve the Claude-style JS broker API and ordered prefix replay. State native-host permission/UI/budgeting differences honestly.

- Node 24+, ESM, pinned dependencies, `node --test` meaningful behavior tests.
- Write the failing test before feature code. Test real processes, persistence and failure boundaries where relevant.
- Never evaluate workflow scripts in the host process. Use a separate QuickJS evaluator with JSON-only broker messages and bounded CPU/memory.
- Fail closed on isolation or schema validation failures. Preserve missing coverage and unknown outcomes. No retry/fallback after uncertain mutating effects.
- No default-branch commits. Worktrees belong under the sibling `agent-workflow-worktrees` directory.
- Wiki: `C:/Users/ehart/.wiki-master-vault/wiki/authored/agent-workflow/`. Keep as-built architecture and roadmap current.
- Ownership during initial build: runtime files belong to the runtime agent; worker files to the workers agent; surfaces/plugin/dashboard/CLI to the surfaces agent. Coordinate API changes before editing another agent's files.

## Initial integration contracts

`src/runtime/manager.mjs` exports `RuntimeManager`. Construct with `{ dataDir, backend, workflowsDir? }`. Methods: `start(input) -> Promise<runSnapshot>`, `get(id)`, `list()`, `events(id, since = 0)`, `control(id, action, options = {})`, `approve(id, approvalId, decision)`, `shutdown()`.

Start input: `{ script?, scriptPath?, name?, args?, cwd, concurrency?, maxAgents?, budget?, permissions?, timeoutMs? }`. Default permissions: `{ sandbox: 'read-only', networkAccess: false, approvalPolicy: 'never' }`. Budget is an observed output-token scheduling guard, not the parent turn's native pool. Snapshots include `id`, `status`, `meta`, `cwd`, `workers`, `usage`, `result`, `error`, `approvals`, `createdAt`, `updatedAt` and script/artifact paths. Controls: pause, stop, resume, cancel-worker, restart-worker, steer; options carry `workerId`, `text`, and optional edited `script` for resume.

`src/workers/codex.mjs` exports `createCodexBackend({ transport = 'app-server', executable?, config? })`. Backend: `execute(request, { signal, onEvent, onApproval }) -> Promise<{ value, usage, threadId?, turnId?, artifacts? }>`, `steer(workerId, text)`, `readRateLimits()`, `shutdown()`. Request: `{ id, runId, prompt, cwd, schema?, model?, effort?, agentType?, isolation?, permissions, timeoutMs?, stallMs? }`. Event callback receives JSON records including `type`, worker identity, tool/progress events, PID/thread/turn identifiers and usage. Approval callback returns an explicit backend decision. No automatic app-server-to-exec fallback after dispatch.

File storage and returned data are JSON. Surface-specific display adapters must not invent successful runs or hide failed worker slots.
