# Managed updates and repair

Keep the same explicitly selected data directory throughout. Otherwise CLI/hooks share AGENT_WORKFLOW_DATA_DIR if set, then LOCALAPPDATA/agent-workflow (home .local/share/agent-workflow without LOCALAPPDATA). PLUGIN_DATA does not silently redirect state.

Fresh selection lives in runtime-v2.json, immutable versions in runtime-v2, and SQLite runs in runs-v2. Legacy release directories remain separate. Do not reinterpret old JSON runs as SQLite, move between namespaces or delete retained versions to hide integrity errors.

Use the updated package's public launcher:

```text
node "<plugin-root>/bin/launch.mjs" setup --data-dir "<directory>"
node "<plugin-root>/bin/launch.mjs" doctor --cwd "<project>" --data-dir "<directory>"
node "<plugin-root>/bin/launch.mjs" list --data-dir "<directory>"
```

Setup fingerprints package inputs, installs pinned dependencies in staging and atomically selects the new runtime. Existing installation/update authorization covers this; no repeated confirmation is needed. It does not stop workers or migrate semantics. Keep prior versions: commands for an exact fresh run ID use its recorded original runtime, and mutations require its original session. The recorded Node version must match too.

After updating, inspect an existing run by exact ID. Resume only when requested and its state/cleanup permits it. Updating does not reconcile unknown effects or authorize repeating work. Legacy runs need their retained legacy runtime and original data; the fresh launcher does not import them.

Incomplete installs, changed fingerprints, missing dependencies and incompatible Node versions are evidence to preserve. Identify the affected runtime before repair. Do not overwrite integrity receipts or clear owner locks. If repair cannot preserve a run's original runtime, report that limitation rather than claiming a new installation makes it resumable.

For a0.4.3 retained-source run, inspect its saved source descriptor and run-owned `source-packages-v1/` separately from current plugin-cache selection. Original cache eviction alone does not lose admitted retained sources. Corrupt/missing retained storage or replay backend/configuration drift still blocks; never restore an original cache path, edit a binding or substitute a newer package as recovery. Preserve old failed/partial outcomes, reconcile effects, verify current identities and admit eligible unfinished work afresh. Review captures, integrate into a fresh stable snapshot and obtain new checks before acceptance. Positive owned-job drain does not reconcile all external effects.

Clean-install recipe checks belong to the coordinator's clean package workspace. After adding the two bounded recipes, verify the exact nine `scope:'plugin'` definitions and the owned saved `scope:'project'` fixture independently. Personal and unrelated project definitions must not change either expected inventory. Preserve upstream scope filtering; global nine/ten totals are insufficient. Package/lock and install-check implementation remain coordinator-owned, with meaningful RED/GREEN required there.

Runtime readiness, account admission, hook trust and completed model work are separate observations. Doctor is command-only with no inference; native workflow verification needs an authorized subscription-consuming run.

To view an older run in the newly installed session dashboard, explicitly use `dashboard RUN_ID --session SESSION --current-ui`. This changes presentation only: verified reads and execution controls still dispatch through the run's original runtime. Ordinary dashboard selection remains pinned. New destructive retirement requires that original runtime to declare `lifecycle-retirement-v1`; an older immutable controller without the replay guard cannot be pruned through a newer UI. Visibility overlays may still hide/archive/restore it without changing execution evidence.
