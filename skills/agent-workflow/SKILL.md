---
name: agent-workflow
description: Create, run, save, inspect or control Agent Workflow scripts when the user requests a saved workflow, durable parallel audit, workflow replay, pause/resume, or worker steering. Ordinary questions and small direct edits stay in the normal conversation.
---

Use `node "<plugin-root>/bin/launch.mjs" <command>`. Resolve plugin-root from this installed skill (two parents above its directory). Read [the runtime API](references/runtime-api.md) before writing scripts and [controls](references/controls.md) before changing a run.

For workers that need package managers, browsers or rendering tools, read [worker prerequisites](references/worker-prerequisites.md). Supply verified executable/cache paths and explicit install authorization; a missing prerequisite should not prevent independent authorized authoring.

1. Inspect definitions with `workflows --cwd "<project>"` and `read "<scope:name>" --cwd "<project>"`. Read the selected script before dispatch. Preserve the user's objective when incorporating follow-ups; a status question does not replace it.
2. Write literal exported metadata first, then top-level async work and return. Run `validate "<script-file>"`. Save with `save "project:name" --script "<script-file>" --cwd "<project>"`; add `--command` for a requested reusable named skill and `--overwrite` only for authorized replacement.
3. Start with `run "<scope:name>" --cwd "<project>" --session "<originating-session>" --args '<JSON>'`, or replace the name with `--script "<script-file>"`. Use the real Codex session from context or CODEX_THREAD_ID; never invent one. Default to read-only. Add `--writable` only for authorized edits; each writer uses a separate Windows MXC worktree. Review patches before separately authorized integration; no automatic merge.
4. Capture the exact returned run ID. Inspect `status "<run-id>"` and `result "<run-id>"`. Call `dashboard "<run-id>" --session "<originating-session>"` and return the complete authenticated URL to the owner, including its fragment. Keep the token out of shared reports. A startup receipt or successful status command does not establish completion.
5. Report failed/unknown workers, null verifier slots and missing item IDs explicitly. Synthesis cannot fill missing evidence. Inspect controls and errors before replay or restart; never retry an uncertain dispatch merely because the CLI failed.

All commands accept --data-dir for explicitly selected state; keep it consistent. Otherwise use AGENT_WORKFLOW_DATA_DIR if set, then LOCALAPPDATA/agent-workflow (home .local/share/agent-workflow if LOCALAPPDATA is absent). PLUGIN_DATA does not implicitly select another instance. If installation is missing or changed, use workflow-setup.

Runs normally continue until script completion or manual Stop, and the dashboard stays available until explicitly closed. Do not infer that the host session ending stops either process. Workers have a 10-minute default deadline; `run`/`resume --worker-timeout-ms` can select 1–1,800,000 ms. For a deliberate overall wall limit use `--run-timeout-ms` (1–86,400,000; 0 removes it). Resume inherits saved limits unless overridden. CPU/memory limits and a no-broker-work idle watchdog remain enforced.

Workers use pinned native Codex App Server with existing managed ChatGPT login. There is no API-key fallback, custom MCP server, parent history/tool-grant inheritance, native composer switch or shared parent token budget. Observed usage is evidence, not a hard spending cap. Workflow mode grants no permissions. SSH verification remains deferred.
