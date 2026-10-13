---
name: agent-workflow
description: Create, run, save, inspect or control a scripted Agent Workflow when the user asks for durable workflows, parallel audit/verification, workflow replay, pause/resume, or a saved workflow. Applies to the Agent Workflow runtime; ordinary questions and small direct edits stay in the normal conversation.
---

Use the local workflow runtime for the requested orchestration. Read [the runtime API](references/runtime-api.md) before authoring a script; its top-level-return format is intentionally different from an importable JS module.

Use the available `workflow_*` MCP tools. If unavailable because setup is missing, use the packaged `workflow-setup` skill. CLI equivalents are in [controls](references/controls.md).

Write a literal `meta` declaration first, use only the supported broker APIs, and validate with `workflow_validate` before saving or starting. Pick a bundled recipe with `workflow_workflows`/`workflow_read` when it matches the requested task shape. Supply project cwd and explicit worker permissions within the user’s authorization. A routing mode or a workflow request does not authorize publishing, sending messages, installing global packages, or broader worker access.

`workflow_start` returns a durable run ID immediately. Inspect status/events/results afterward, or give the user the authenticated dashboard URL. Preserve failed/null/unknown verifier slots and item IDs in the result; a synthesis cannot fill missing coverage by assumption. Report actual run status rather than treating admission as completion.

On resume, completed calls can replay only through their matching ordered prefix. Editing a prompt or stable option invalidates the suffix. An unknown mutating outcome requires reconciliation before another attempt; restarting a writer can repeat effects. Read the recorded errors and attempts before selecting a control.

Host differences: this plugin owns its dashboard and supervisor. It does not add a native Codex composer switch or task-panel renderer, inherit the parent’s live tool grants/history, or share a native hard token pool. Its output-token budget observes worker usage and can overshoot with in-flight workers.
