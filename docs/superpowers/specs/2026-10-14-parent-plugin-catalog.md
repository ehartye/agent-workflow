# Parent native plugin and skill catalog

The owner authorized workers to receive the available parent skills and plugins without hand-authoring hundreds of reference grants. This provisioner supplies original native capability roots. It does not copy skill text, inject skill bodies, clone a ChatGPT host tool registry, install plugins, or establish actual tool-use evidence.

`discoverParentCapabilities(client, {cwd, codexHome})` uses only the pinned App Server `plugin/installed({cwds:[cwd]})` and `skills/list({cwds:[cwd],forceReload:true})` RPCs. It does not use `plugin/read`, which can materialize package sources. Native inventory refresh behavior remains owned by App Server; these requests are not a promise that native internals never refresh their caches.

The result contains:

- `roots`: original `selectedCapabilityRoots` entries with a stable path-derived ID and `{type:'environment',environmentId:'local',path}`.
- `inventory.plugins`: bounded `id`, `origin`, `enabled`, `installed`, native `availability`/`disabledReason`, `rootId` and, for admitted packages, `manifestSha256`. Native unavailable packages remain inventoried without selected roots. Packages identified by enabled native `skills/list` entries but absent from `plugin/installed` use `origin:'skills/list'` and null installation/enablement/availability fields; their original cache root, manifest identity and skill ownership are verified without fabricating an installed-inventory response.
- `inventory.skills`: bounded `name`, original absolute `path`, `pluginId`, `enabled`, `scope`, and `rootId`.
- `inventory.missing`: fixed `{kind,id,code}` diagnostics, with no raw error messages or skill/plugin bodies.
- `inventory.warnings`: the same bounded shape for repeated display names and original resource trees deeper than native discovery depth. Different plugin identities/paths with the same display name remain available; workers select returned native package/resource IDs.
- `fingerprint`: SHA-256 of the canonical sanitized roots, inventory and coverage. It identifies this catalog snapshot and plugin manifests; it is not a recursive content hash or proof that files cannot change later.
- `coverage`: `complete`, `pluginCount`, `skillCount`, `rootCount`, `missingCount`, `warningCount`.

Callers must reject incomplete coverage before claiming or binding a complete parent catalog. RPC/source failures, duplicate identity metadata, native load errors and disabled skills beneath selected broad roots remain explicit missing coverage. Repeated display names at distinct original paths are warnings, not missing permissions. Unsafe/malformed public inputs and cardinality/response overflow throw `PARENT_CAPABILITIES`. Disabled and uninstalled plugins remain visible in inventory but receive no root. A disabled skill contained in an otherwise selected root prevents complete coverage because executor recursive discovery does not itself prove preservation of host skill disablement.

Installed plugin locations follow Codex 0.162.1's original cache convention under `CODEX_HOME/plugins/cache/<marketplace>/<plugin>/<active-version>`. The active selector prefers the directory `local`; otherwise it compares valid semantic versions, falling back to lexical comparison when either version is not semantic. Manifest versions and marketplace source paths are not installation-directory identities. Each selected root must have a recognized native plugin manifest whose name matches the inventory identity. Tool-only plugins follow the same route and do not require a skill entry. Standalone skill roots come from the directory of the native catalog's original `SKILL.md` path.

Path components and selected trees must be regular, original paths: no symlinks/junctions or hard-linked files. Limits are 128 roots, 2,048 plugins/skills/errors/warnings, 4 MiB per RPC result, 1 MiB per manifest, 2,048 candidate versions, 20,000 entries per selected tree, 100,000 entries total, and 32 directory levels for validating original resource trees. Native discovery's six-level cap is separately flagged as `NATIVE_DISCOVERY_DEPTH`; ordinary deeply nested templates are not treated as missing package sources. This metadata coverage does not certify that native recursive discovery exposed every resource: native catalog/read evidence remains a separate gate. Validation overflow never silently becomes complete coverage. The provisioner reads manifest bytes for identity and inspects filesystem metadata; skill bodies are not read or retained. These bounded snapshots do not eliminate a trusted host changing original files after discovery.

The backend binds these roots at thread startup, optionally deduplicating original paths with explicit role roots. Native managed policy, authentication, app configuration and tool startup still apply. Whole installed plugin roots may activate genuine native skills, plugin MCP servers and app declarations. Preserving parent-native configuration must not be represented as inheriting host-only connectors. Real model `skills.list`/`skills.read` call evidence remains a separate backend gate.

Tests use unique temporary homes and original files, including one owned child JSONL process for RPC transport. They cover active-version selection, a differing manifest version, tool-only packages, disabled/uninstalled entries, malformed/partial metadata, duplicates, missing/mismatched sources, root overflow, junction refusal and diagnostic privacy. They do not launch Codex or inspect the real home directory.

The retained 2026-10-14 command-only inventory exposed two resolver assumptions: `h-superpowers@h-superpowers-dev` was present in enabled native skill ownership but absent from installed-plugin UI inventory; both it and `h-superpowers@hartye-plugins` advertise the same skill display names. Sites and Browser had valid original manifests and ordinary resource directories beyond six levels, which this provisioner initially rejected. The original partial receipt remains historical evidence; tests reproduce these cases using temporary packages. No native retry or real-model acceptance is claimed by the fix.

Primary source, pinned to `092d3acd6bec3e3a14bdc7e7a2810ab628ab759d`:

- [Installed-version selection](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core-plugin-common/src/installed.rs)
- [Original plugin cache roots](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core-plugins/src/store.rs)
- [Pinned semver 1.0.27 total ordering, including build identifiers](https://github.com/dtolnay/semver/blob/1.0.27/src/impls.rs)
- [Genuine executor skill tool registration](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/ext/skills/src/tools/mod.rs)
- [Selected plugin capability stack tests](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/app-server/tests/suite/v2/selected_capability_stack.rs)
