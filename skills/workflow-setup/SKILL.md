---
name: workflow-setup
description: Install, repair or check the owned Agent Workflow runtime when the user asks to set up the plugin, the CLI reports a missing managed runtime, or a plugin update requires setup.
---

Use the packaged CLI without a custom MCP server. Resolve plugin-root from this installed skill: two parents above its directory. Require Node 24+ and npm. Setup copies a fingerprinted runtime outside mutable plugin cache, installs locked production dependencies with lifecycle scripts disabled, and selects it for new runs. Existing authorization to install/update covers these steps; do not ask again.

The shared CLI/hook data directory is explicit --data-dir, otherwise AGENT_WORKFLOW_DATA_DIR if set, then LOCALAPPDATA/agent-workflow (home .local/share/agent-workflow without LOCALAPPDATA). PLUGIN_DATA does not implicitly select another instance. Keep explicit data selection identical across setup, doctor, runs and mode; never store managed state in plugin cache.

```text
node "<plugin-root>/bin/launch.mjs" setup
node "<plugin-root>/bin/launch.mjs" doctor --cwd "<project>"
node "<plugin-root>/bin/launch.mjs" workflows --cwd "<project>"
```

Add --data-dir "<directory>" to each command when explicitly selected. In PowerShell keep executable/arguments separate and use the call operator for a quoted executable path. JSON escaping is not shell quoting.

Read [upgrades](references/upgrades.md) before updating/repairing existing state. Preserve old runtime versions/run data and active work. A missing/changed package requires explicit setup, never installation during dispatch.

Inspect setup and doctor JSON before claiming readiness. Doctor checks pinned native Codex and command-only admission with existing managed ChatGPT login; it makes no inference request. Incompatible account/provider routing fails. Do not introduce API keys or API-billed fallback, globally install dependencies or edit Codex settings. Do not run a model workflow merely to check installation unless that usage is authorized.

Report selected runtime, readiness and admission/cleanup errors. Mode stays off unless requested. Hook trust is separate from setup/manual CLI/dashboard; successful doctor does not establish trusted hooks. Windows MXC is the verified write platform; SSH verification is deferred.
