---
name: workflow-mode
description: Enable, disable or inspect Agent Workflow routing when the user explicitly asks for workflow mode, ultracode mode, or persistent workflow routing for this session or project.
---

Use `node "<plugin-root>/bin/launch.mjs" mode on|off|status`. Resolve plugin-root from this installed skill, two parents above its directory. A request to run one workflow uses agent-workflow and does not enable persistent mode.

Packaged `resources/` copies are for native instruction/reference reads. Execute CLI commands from the real plugin-root resolved above, never a generated resource copy. Activate cross-skill roles through genuine executor `skills.list` and `skills.read` using returned package/main_resource; reference availability grants no permissions.

Default to session scope with the real Codex identity from context or CODEX_THREAD_ID; never fabricate one. For explicitly requested project routing, use that project's actual cwd:

```text
node "<plugin-root>/bin/launch.mjs" mode on --scope session --session "<originating-session>"
node "<plugin-root>/bin/launch.mjs" mode status --scope session --session "<originating-session>"
node "<plugin-root>/bin/launch.mjs" mode off --scope session --session "<originating-session>"
node "<plugin-root>/bin/launch.mjs" mode on --scope project --cwd "<project>"
node "<plugin-root>/bin/launch.mjs" mode status --scope project --cwd "<project>"
node "<plugin-root>/bin/launch.mjs" mode off --scope project --cwd "<project>"
```

Keep explicit --data-dir consistent. Otherwise CLI/hooks share AGENT_WORKFLOW_DATA_DIR if set, then LOCALAPPDATA/agent-workflow or home .local/share/agent-workflow. PLUGIN_DATA does not implicitly redirect it. Inspect the result before reporting the requested scope enabled/disabled. Use workflow-setup if installation is missing.

Mode is opt-in and persists outside plugin cache. The prompt hook supplies routing context for user prompts; ordinary questions and small direct edits stay conversational. Workers/tool messages are excluded. A status question or steering instruction does not replace the active user objective.

Mode does not activate worker skills or grant a running worker new capabilities. For every worker, select roles before startup and use genuine executor list/read against its admitted roots. For declared steps/child workflows, activate `agent-workflow:workflow-authoring`; for inspection or a LAN dashboard, activate `agent-workflow:agent-workflow` through native catalog/read, using returned package/main_resource. The candidate's [step visibility](resources/docs/workflow-steps.md), [composition](resources/docs/workflow-composition.md) and [LAN lifecycle](resources/docs/dashboard-lan.md) retain their own source, owner and verification boundaries.

Windows [Session 0 compatibility](resources/skills/workflow-setup/references/session0-compatibility.md) is a separate explicit launch selection. Mode on never enables it.

Mode grants no file, network, publication or installation permission, and adds no native composer control, effort slider or shared hard budget. Manual CLI/dashboard use does not require mode. Hook trust is separate; report runtime readiness and hook availability independently. Do not edit global AGENTS or Codex settings to imitate routing.
