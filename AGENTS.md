# Agent Workflow

The owner authorized replacing the old architecture. The 0.2.0 candidate uses the native Codex App Server through `foundation/`, the isolated SQLite-backed `engine/`, and public CLI/skills. Existing 0.1.1 installations/data remain separate. Managed ChatGPT subscription authentication is required; no API-key billing fallback. `docs/codex-parity.md` records acceptance evidence and remaining host/parity boundaries. SSH verification is deferred.

The owner selected no custom MCP server. Use the CLI and authenticated dashboard as workflow surfaces. Do not reintroduce the removed `src/` runtime or MCP server. Prior runtime files remain in existing installations, not this package.

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

## Runtime and integration ownership

- `bin/launch.mjs` and `bin/agent-workflow.mjs` select a managed runtime; `bin/command.mjs` runs inside it. Explicit setup installs outside the plugin cache. Never silently install during a read or start.
- New state uses `runtime-v2`, `runs-v2` and `modes-v2`. Each run retains its runtime/dependency identity, Node version and originating session. Upgrade preserves earlier runtime directories and does not reinterpret old JSON runs.
- CLI and hooks share `AGENT_WORKFLOW_DATA_DIR` or the platform default; `PLUGIN_DATA` is not an implicit override. An explicit `--data-dir` must stay consistent across commands.
- Starts, controls and control-capable dashboard URLs require the originating session. Inspection of a saved run uses its recorded runtime; new runs use the explicitly installed current package.
- Run scripts execute only in the separate QuickJS evaluator. See `skills/agent-workflow/references/runtime-api.md` for supported APIs and schema limits.
- Windows MXC writers have independent worktrees from captured inputs; dependencies do not transfer predecessor edits. Diff capture/replay requires verified drain and artifact integrity. No automatic merge or uncertain-effect retry.
