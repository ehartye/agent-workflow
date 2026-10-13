# Local workflow engine prototype

The fresh controller uses the foundation's native Codex App Server connection, a separate QuickJS evaluator, and SQLite. It imports none of the released runtime. It is CLI-first: an agent-workflow MCP server is not required. This slice is not installed or released and does not drive the existing monitor.

After `npm ci`, run the explicit acceptance check:

```powershell
node engine/check.mjs --codex "$PWD/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe" --backend mxc --output test-output/engine-proof.json
```

This uses the existing managed ChatGPT login and consumes subscription usage. Command-only admission must pass first. Two workers each read one generated file; a second controller replays the workflow and must dispatch zero workers. Temporary fixtures remain under the OS temporary directory. Reports omit account details, configuration and file markers. Output files are never overwritten. No API-key fallback or API-billed coordinator exists.

A workflow is ordinary JavaScript with literal metadata first:

```javascript
export const meta = {name: 'read-files', description: 'Read two files'};
await phase('Read');
return await parallel(args.map(file => () => agent(`Read ${file} and summarize it.`)));
```

Run it with an explicit project, run directory and originating session identity:

```powershell
node engine/cli.mjs --codex "$PWD/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe" --backend mxc --cwd "$PWD" --script ./workflow.js --run ./test-output/my-run --session local-session --args '["README.md","package.json"]'
```

Repeat with `--resume` to evaluate against the saved completed prefix. Inspect without Codex using `node engine/cli.mjs --status --run ./test-output/my-run`. The CLI exits unsuccessfully for missing coverage even when the script caught failures and returned normally.

The evaluator supports `agent`, ordered `parallel`, item-local `pipeline`, `phase`, `log` and JSON `args`. It has no Node imports, filesystem or network, a 32 MiB heap, 512 KiB stack, CPU interrupts and a wall deadline. Clock/random access is refused. Collections accept at most 4,096 entries. Agent calls share a concurrency limit (default 2, explicit 1–256) and at most 1,000 lifetime attempts. Options currently accept only `label`, `phase` and `timeoutMs` (1–120,000). Unsupported options fail explicitly.

Worker policy is read-only filesystem, no command network and no approvals. Child-process overrides disable inherited MCP servers, plugins, apps, hooks, notification commands, browser/computer tools, web search and nested agents. Effective config and each thread's disabled MCP inventory are checked before model execution. User settings are not edited. Account and provider routing must match the managed ChatGPT contract.

SQLite commits each result before returning it to the evaluator. Replay follows invocation order; the first changed or failed call invalidates its suffix. Effective timeout is part of the key; labels/phases are cosmetic. Changed backend config invalidates all cached calls. Session/runtime mismatch, corrupt/missing records and unknown execution refuse replay. Replay does not establish source-file freshness or exactly-once effects. A stale owner lock requires inspection.

Local acceptance on 2026-10-13 passed two file reads and replay with dispatch counts `[2, 0]`; see [the report](../reports/engine-local-acceptance.json). One earlier attempt failed command admission before inference; its cause was not captured, and admission failures now retain their stage report. This is bounded local evidence, not a reliability-rate claim. Another pre-model attempt refused the inventory until the checker distinguished disabled entries from active capabilities.

Owned App Server exit is verified separately; arbitrary descendants are not verified. Native interruption, background controls, schemas, writable workspaces, usage/quota handling, registry/skills, monitor and host integration remain open in [the parity ledger](../docs/codex-parity.md). SSH is deferred.
