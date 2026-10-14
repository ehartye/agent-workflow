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

Use coordinator-verified absolute Node/`npm.cmd`/PowerShell paths, bounded command time/output and profile loading disabled (`-NoProfile`) where supported. Use explicit UTF-8 decoding for bounded report reads. Follow [worker prerequisites](../agent-workflow/references/worker-prerequisites.md) to distinguish discovery, command admission, installed browsers and sandbox render transport; one passing stage does not establish another.

Read [upgrades](references/upgrades.md) before updating/repairing existing state. Preserve old runtime versions/run data and active work. A missing/changed package requires explicit setup, never installation during dispatch.

For worker skill/tool preparation, read [worker capabilities](../../docs/worker-capabilities.md). The coordinator prepares explicitly authorized toolchains and an immutable new-run bundle of declared skill/tool IDs. Preserve absolute original skill sources and their plugin-relative references/assets; verify exact Node/cache-launcher invocation, installed runtime/source/dependency receipts and named managed-home/browser cache values. Runtime setup or enabling a parent plugin does not establish worker native list/read invocation, associated CLI readiness or artifact production.

New runs accept `--worker-capabilities <JSON manifest file>` and per-worker `skills`/`requireTools` selections; use the [exact public schema](../../docs/api.md#worker-capability-bundle). Native `selectedCapabilityRoots` binds exact verified skill directories and exposes executor `skills.list`/`skills.read`; workers use returned packages without invented aliases or duplicate prompt bodies. Host extraRoots does not expose these tools. Resume/restart retain the saved bundle/runtime identity. Baseline user/system skills remain visible; exact skill roots do not broadly activate MCP/apps or host grants. Every exposed root file needs a declared identity. [Acceptance](../../docs/verification.md) covers native invocation and managed Beeps init/new/list; rendering/listening and sprite export remain unverified.

Only passed required tools supply exact verified Node/launcher/environment/readiness metadata to the initial task. Readiness and task execution share the worker deadline after startup. Native out-of-package documentation may be read ordinarily only at explicitly declared, hash-verified paths after genuine activation; this cannot replace skill invocation. Preserve unknown effects and original failures when addressing known read-only compatibility errors.

Verify required tool readiness nonmutatingly in the actual restricted worker before tool-dependent inference. Missing optional tools permit independent authoring with dependent operations explicitly unrun. When admitted, workers perform the task's authorized tool operations; root owns actual rendering/listening acceptance and reviewed integration. Do not automatically install, swap versions, widen permissions, change global policy or retry uncertain mutating effects. Setup/cache presence and capability/version output cannot prove render transport or artifact generation.

Before another updater action, inspect the selected installed package's version/source fingerprint, retained setup output and managed selection (`runtime-v2.json`) in the same data instance. Compare them with coordinator-verified release/tag identity; inspect saved-run runtime bindings separately. A checkout version or refreshed skill listing alone does not establish installed bytes. If refresh already installed/enabled the intended version, avoid a redundant plugin add. After an updater access-denied/uncertain result, preserve its evidence and inspect existing selection; further mutating action requires coordinator reconciliation, without clearing locks or changing permissions. The updater transaction belongs to the host integration; its locking cause may remain unknown.

The [0.3.0 friction/release ledger](../../docs/friction-delivery.md#installed-release-and-cache-identity) links the coordinator-supplied exact installed native/browser receipts. Package/source/runtime selection, doctor admission and exact installed-release acceptance are separate evidence. Keep older candidate reports and their chronology intact; do not substitute them for installed receipts or repeat completed release work.

Inspect setup and doctor JSON before claiming readiness. Doctor checks pinned native Codex and command-only admission with existing managed ChatGPT login; it makes no inference request. Incompatible account/provider routing fails. Do not introduce API keys or API-billed fallback, globally install dependencies or edit Codex settings. Do not run a model workflow merely to check installation unless that usage is authorized.

Doctor reports authentication, Windows readiness where applicable, buffered/streamed/PTY execution and cancellation, plus separate startup/cleanup evidence and zero inference requests. On failure, the public launcher and command emit bounded structured diagnostics: the failing stage, allowlisted error code, observed exit/marker/truncation facts when supplied, and ownership receipts. Missing facts remain unknown. Passing authentication/readiness cannot establish later command execution, and server exit alone cannot establish an empty owned Windows job. Preserve the report without raw account/configuration data or cleanup retries; the ledger records the historical diagnostic gap and current regression owners.

Report selected runtime, readiness and admission/cleanup errors. Mode stays off unless requested. Hook trust is separate from setup/manual CLI/dashboard; successful doctor does not establish trusted hooks. Windows MXC is the verified write platform; SSH verification is deferred.
