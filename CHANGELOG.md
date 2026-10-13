# Changelog

## 0.1.0

Initial public release of the regular Codex plugin and local runtime.

- Create, validate, save and run reusable JavaScript workflows with parallel workers, item-local pipelines, bounded loops and one-level child workflows.
- Persist runs, usage, approvals and artifacts; edit scripts and reuse the matching ordered call prefix.
- Pause, stop, resume, steer and review uncertain effects through MCP, CLI and the authenticated local dashboard.
- Use explicit Codex permissions, strict structured results and retained Git worktrees for writer isolation.
- Install managed dependencies outside the plugin cache with exact cold MCP setup discovery.
- Enable opt-in session/project routing through a separately trusted prompt hook.
- Start with six bundled audit, fix, migration, review, research and discovery recipes.

Verified on Windows with 118 offline tests, actual Codex worker/replay checks, native cold/warm installation and independent specification/code-quality review. Yoda audits all three skills, including matched baseline evaluations. See [verification](docs/verification.md) and [limits](docs/limitations.md).
