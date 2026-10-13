---
name: workflow-setup
description: Install or check the owned Agent Workflow local runtime when setting up this plugin, when its MCP server says the managed runtime is missing, or after an explicit plugin update requires setup.
---

The installed plugin cache is read-only package content; installation does not imply Node dependencies were installed. This setup writes only the plugin’s persistent data directory and installs the package lock’s pinned dependencies with npm lifecycle scripts disabled.

Require Node 24+ and npm. Call `workflow_setup_info` first: before dependencies are installed, or when the package changed, a dependency-free read-only MCP bootstrap supplies the exact host-resolved `pluginRoot`, `dataDir`, `setupCommand` and `verifyCommand`. Execute those structured commands explicitly, then reconnect the MCP server. The bootstrap never installs, updates, starts a daemon or runs workers.

If the setup-info tool is unavailable, inspect the concrete CLI startup setup command or host diagnostics. If `PLUGIN_ROOT` and `PLUGIN_DATA` are available in the actual plugin subprocess, use those exact values. The parent agent’s ordinary shell may not have these host variables; do not substitute its default directory for the installed instance’s data. Native Codex may use a hashed plugin data directory, so do not guess it.

Locate this skill’s plugin root (two parent directories above this skill folder) when working from a source checkout. Outside a plugin host, use the explicit user-selected data directory or the normal Agent Workflow default. A custom CLI data directory is a separate instance unless it matches the host’s resolved `PLUGIN_DATA`.

Run:

```text
node "<plugin-root>/bin/setup.mjs" --data-dir "<plugin-data-directory>"
node "<plugin-root>/bin/launch.mjs" doctor --data-dir "<plugin-data-directory>"
```

Do not install globally or modify the host’s global AGENTS/config. Setup copies an immutable runtime version outside the plugin cache and atomically selects it. Existing run records stay in persistent data. It never silently updates at MCP launch; a changed package produces a useful explicit setup error. Inspect the actual command result before claiming setup is ready.

Reconnect the plugin MCP server after setup, then use `workflow_list` or `workflow_dashboard`. An existing supervisor can keep its prior runtime while its runs are active; drain it with `shutdown` before explicitly selecting another runtime.

Hook trust is separate from installing the plugin. The optional prompt hook only routes genuinely user-submitted prompts after `workflow_mode` opt-in; the host skips it until the user reviews and trusts the current hook definition. It is not required for manual workflow tools or dashboard use. Hook-bearing plugins are for manual/local Codex installation and are currently ineligible for the public directory.
