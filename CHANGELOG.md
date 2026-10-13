# Changelog

## 0.2.0

- Replace the old supervisor/MCP runtime with a CLI and skill integration around pinned native Codex App Server workers, using managed ChatGPT subscription authentication.
- Add validated structured results, model/reasoning settings, live activity, exact-worker steering/cancellation, and explicitly reconciled suffix restart.
- Isolate authorized edits in sibling Git worktrees; preserve source inputs, reviewable diffs and historical artifacts.
- Show workflow phases, dependencies, discovered progress and status in an authenticated graph monitor. Put System/Light/Dark themes behind the gear button.
- Add scoped saved definitions and reusable commands, plus explicit session/project workflow mode.
- Install complete source/dependency fingerprints outside mutable caches; retain each run’s runtime and original session across upgrades. Preserve existing 0.1.x data/runtimes without interpreting them as new runs.
- Remove custom MCP configuration and obsolete source/dependencies. Rewrite all skills with paired Yoda checks and migrate all six recipes to the new evaluator.

Release availability and its pinned commit are recorded in GitHub Releases and the shared marketplace.

## 0.1.1

- Rework the workflow monitor with an Agent Marketing inspired navy/amber layout, dispatch rail and responsive evidence panes.
- Keep routine status and journal reads bounded; expose full retained evidence through deliberate inspection.
- Add CLI `--compact`, bounded waiting and compatibility with an existing 0.1.0 supervisor.
- Show recovered tool failures, timestamp full observations and gate truncated approval requests.
- Preserve access to every journal range when more than one page arrives between polls.
- Show actual immutable permissions and limits when editing a resumed run.

Developed against a real PlanetForge roadmap audit. Full authenticated evidence and default CLI/API response contracts remain available; old runs retain their matching runtime for resume. Rendered visual inspection is pending an attached browser.

## 0.1.0

Initial public release of the regular Codex plugin and local runtime.

- Create, validate, save and run reusable JavaScript workflows with parallel workers, item-local pipelines, bounded loops and one-level child workflows.
- Persist runs, usage, approvals and artifacts; edit scripts and reuse the matching ordered call prefix.
- Pause, stop, resume, steer and review uncertain effects through MCP, CLI and the authenticated local dashboard.
- Use explicit Codex permissions, strict structured results and retained Git worktrees for writer isolation.
- Install managed dependencies outside the plugin cache with exact cold MCP setup discovery.
- Enable opt-in session/project routing through a separately trusted prompt hook.
- Start with six bundled audit, fix, migration, review, research and discovery recipes.

Verified on Windows with 123 offline tests, actual Codex worker/replay checks, native cold/warm installation and independent specification/code-quality review. Yoda audits all three skills, including matched baseline evaluations. Agent-tests audits and strategy add the approved production risk map, dashboard regressions and CI lanes. See [verification](docs/verification.md), [testing](docs/testing.md) and [limits](docs/limitations.md).
