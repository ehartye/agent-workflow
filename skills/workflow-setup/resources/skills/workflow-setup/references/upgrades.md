# Managed updates and repair

Keep the same explicitly selected data directory throughout. Otherwise CLI/hooks share AGENT_WORKFLOW_DATA_DIR if set, then LOCALAPPDATA/agent-workflow (home .local/share/agent-workflow without LOCALAPPDATA). PLUGIN_DATA does not silently redirect state.

Fresh selection lives in runtime-v2.json, immutable versions in runtime-v2, and SQLite runs in runs-v2. From 0.6.3, [caller-specific prepared selection](../../../docs/runtime-selection.md) lets an unchanged caller use its exact verified version/source/Node installation while another package remains the shared default. Selection never writes the pointer or installs implicitly. Explicit setup still changes the default. Legacy release directories remain separate. Do not reinterpret old JSON runs as SQLite, move between namespaces or delete retained versions to hide integrity errors.

The 0.6 series includes [declared steps](../../../docs/workflow-steps.md), [depth-one composition](../../../docs/workflow-composition.md), [explicit LAN binding](../../../docs/dashboard-lan.md) and generated same-package skill references. Publication and native qualification are recorded in release evidence, not inferred from these docs. Inspect the recorded runtime before using new CLI flags/readers. `dashboard --current-ui` changes presentation only; unsupported steps/children/control providers remain unavailable. Setup does not retrofit catalogs, source descriptors or capabilities into a saved run.

Composition freezes declared child scripts/registry entries, args/result schemas, source IDs and catalog hashes. Saved replay uses those bytes, independent of current registry/cache edits, and requires original policy/backend/runtime identities. Explicit reviewed source revisions require exact generation/catalog/source identities and positively drained completed work. Missing/corrupt retained sources and unknown effects remain failures; installing current bytes cannot reconcile them or authorize retry. Child capability ceilings cannot grant a running worker new roots/tools.

Use complete frozen **clean plugin distribution roots** for explicit bundles, preserving `skills/`, `bin/` and CLI-relative layout. A managed runtime containing `node_modules` accidentally retains dependencies; a skill-only package root breaks relative CLI resolution. Keep native skill-directory selections inside that complete package. Preserve and reconcile failed capture evidence before new admission. Correcting accidental dependency inclusion needs no increase to the 512 MiB retention ceiling; genuine workload pressure requires separate evidence/review.

Native packages bind individual skill directories. The four shipped mains point to generated resource closures and their source/output hash manifests. After canonical documentation/main changes, regenerate with `node scripts/package-skill-resources.mjs` from the real source root and run `--check`; public `npm run check` also refuses stale/missing/extra resources read-only. Never copy or execute another SKILL.md as a replacement for native activation, or execute packaged CLI/recipe copies. Capability source limits and bounded stdin transport are recorded in the [API](../../../docs/api.md#worker-capability-bundle); the new transport preserves fingerprints and aggregate ceilings.

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
