---
name: workflow-mode
description: Enable, disable or inspect Agent Workflow ultracode-style routing when the user explicitly asks for workflow mode, ultracode mode, or persistent workflow routing for this session or project.
---

Use `workflow_mode` with `value: on/off/status`. Session mode requires the real host session ID; never invent one. Project mode uses the requested project cwd. If the user names a project, apply that scope. If a session ID is unavailable, report that session routing needs a real ID and use explicit workflow tools in the meantime.

Mode state is stored outside the plugin cache. It injects concise routing context through the trusted UserPromptSubmit hook and leaves ordinary questions/direct edits in the normal flow. Worker processes marked `AGENT_WORKFLOW_WORKER=1` and tool messages are excluded. No global AGENTS file is changed.

Enabling this mode grants no broader tool, file, network or publication permission. It is a plugin routing preference, not a native Codex effort slider, composer switch or hard shared token budget. Installing the plugin does not trust hooks; the user separately reviews the host’s hook definition before it can run.
