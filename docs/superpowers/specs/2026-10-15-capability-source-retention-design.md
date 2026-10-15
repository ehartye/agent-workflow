# Retain admitted capability packages for a run

The owner authorized fixing and deploying Workflow friction before continuing the roadmap pipeline. This design changes future admissions. It does not repair or relabel the already failed 0.4.1 worker.

## Evidence and cause

Run `4814c759-2fc4-40ba-beca-025fdde866f8`, generation 1, worker 12 passed selected-source admission, then failed completion with `CAPABILITY_SOURCE_CHANGED`. The assigned Workflow 0.4.1 cache root and main resources are absent; 0.4.2 is present. Worker cleanup confirms the owned job drained, without proving arbitrary descendants or external effects. Pause receipt `ddffc92b-ec9f-4ebe-bc85-12adc1907d2c` is applied; three previously admitted workers continue draining.

The source check is correct. The lifetime defect is binding a durable run directly to an evictable host cache. The host deletion actor and exact cache transaction are not established. The current implementation detects source loss rather than preventing it. Parent discovery already scans complete plugin layouts and admits exact native roots; no supported cache lease is present in the inspected integration.

## Alternatives

1. Retain verified complete source packages under the run directory, with explicit original-to-retained provenance. Recommended. Time: additional bounded copy/hash I/O at admission and verification. Risk: an incorrect mapping could expose different code; strict inventory/hash/path checks and native acceptance are release gates. Complexity: one storage/mapping boundary plus launch/replay forwarding. Best practice: immutable inputs owned for the consumer's lifetime. Maintainability: one versioned format, retired with the run.
2. Hold a host-cache lease. Time: unknown because the inspected native interface has no lease operation. Risk: inventing an OS lock could break plugin updates without guaranteeing all reads. Complexity: coordination with an external updater. Best practice: only suitable with an actual supported host lifetime contract. Maintainability: external dependency. Not selected.
3. Keep failing and create a new run after every cache change. Time: recurring reconciliation and repeated admission. Risk: lost continuity and accidental effect repetition. Complexity: little new code but more operational work. Best practice: preserves honest failures but does not resolve the lifetime defect. Maintainability: recurring owner friction. Not selected.

## Admission and storage

New public run admissions provide their bound `runDir` and an explicit fresh-only `retainSources` flag to the backend. Resume never enables capture. After original native catalog discovery and original explicit-manifest verification, capture all enabled parent roots plus explicit skill `root` packages. Coalesce overlapping roots so a skill and its plugin share one complete copy. Preserve every relative path, plugin manifest, reference, script and asset; do not flatten skill bodies or install dependencies. Compare each copied plugin manifest with the exact hash observed by native discovery.

Own `source-packages-v1/` beneath the bound run directory. Create it exclusively. Copy only ordinary singly linked files through bounded handles; reject ancestor/descendant links, escaping paths, concurrent source changes and partial inventories. Limits: 128 package roots, 100,000 entries, depth 32, 512 MiB total payload, and 8 MiB index. These are capacity guards, not worker wall deadlines. A failed capture starts no model and leaves its incomplete directory for diagnosis; no implicit retry or reuse.

Each package inventory records original root, deterministic retained root, sorted relative file paths, sizes, modes and SHA-256 hashes, plus a tree digest. Compare source inventories before and after copying; verify the retained tree against the same inventory. The atomically published index contains the original catalog and original explicit manifest, package inventories and provenance. A small launch descriptor binds the exact index bytes/hash/version and package fingerprint. The index lives outside the bounded run header.

Read/load derives the store path from the actual run directory, validates the descriptor and index strictly, then verifies every retained file and complete directory inventory. Original cache files need not remain present. Added, removed, changed or linked retained files fail closed. No source refresh, newer-version substitution, global cache mutation, silent installation or automatic garbage collection occurs.

## Native execution and identity

Keep the original manifest and catalog in provenance. The original bundle fingerprint remains the logical selection ceiling; the index SHA-256 separately binds the execution mapping and original catalog. Derive an execution manifest and catalog by mapping only paths within captured roots to their verified retained counterparts. Preserve native names, declared role IDs, plugin ownership and complete plugin-relative layout. Map declared structural source/tool paths and exact absolute readiness argument values when they fall inside a captured package; never rewrite opaque script text or embedded path strings. External managed runtimes, dependencies and caches retain their separately verified identities. Mutable managed homes inside a captured source root are unsupported and reject. No path outside the admitted original roots gains a binding.

Bind genuine `thread/start.selectedCapabilityRoots` to the retained directories. Workers still call actual executor `skills.list` and `skills.read`, check the returned retained root, and use associated admitted CLIs. Activation observation compares against the admitted retained main resource. Prompt metadata explains provenance without copying skill bodies or claiming tool readiness. Full plugin catalog availability and explicit required activation remain separate.

Backend identity includes the retained-package fingerprint. Before each native worker admission and after its model work, verify retained inventories; keep worker-local selected source/readiness checks and completion checks. File copies are not OS-enforced immutability: later mutation is rejected. Evidence records original source provenance, actual execution roots, source verification and native invocation separately. Source verification does not prove full-body consumption, associated operation correctness or artifact acceptance.

Retention does not redirect independently configured native MCP/plugin/app executables. Compare the actual `plugins`, `mcp_servers` and `apps` configuration identity with setup before thread/model admission and refuse drift. Backend replay still compares its complete existing configuration identity; any change on a retained-source run refuses replay before a new generation rather than invalidating and redispatching completed writers. External services, auth refresh, runtime pointers, connector sessions and arbitrary tool output are not frozen by copied packages. A passing readiness check does not establish an external runtime's future lifetime. Original auth/config/session directories are not capture roots; package files themselves are retained verbatim in private run storage and may be sensitive.

## Persistence and replay

Persist the descriptor in the run launch. Background, foreground, controller and replay all use the same original bundle plus verified retained bindings. A saved descriptor requires its exact store; missing or corrupt storage fails, without returning to the live host cache. Resume uses the saved admitted catalog, not a newly enabled catalog or a newer plugin version. Selection cannot expand the saved capability ceiling.

Old runtimes/runs without a descriptor preserve their original checks and failures. The controller rejects adding a descriptor to a descriptorless saved run before generation mutation or dispatch. Do not retrofit a snapshot onto the paused 0.4.1 run, rewrite its catalog, or resurrect its deleted cache. Reconcile all active/failed effects and verified captures before a fresh admitted continuation. Retention is source availability, not live grants, inherited connectors or relaxed access policy.

## Verification and delivery

Reproduce with real files/processes: capture a plugin with a skill, external reference and executable script; delete the source package; reload and execute the retained script and selected-source checks successfully. Reject retained changes, extra files, links, escaping/corrupt descriptors, partial publication and overlapping aliases. Exercise declared tool paths, complete parent plugin roots, controller persistence and detached resume. Existing old-format drift rejection remains covered.

Native acceptance must use genuine executor list/read at the retained root, independently verify a hidden marker, perform an authorized associated CLI operation from the preserved layout, remove only the owned original fixture package during the worker lifetime, and verify completion plus positive owned cleanup. Do not delete real plugin cache sources for testing. Count any new inference attempts in the cumulative case-study policy rather than resetting history.

Run affected tests, independent review, full `npm test`, `npm run check`, `npm run smoke`, clean-package `check-install` and production audit. Publish with Actions disabled under the standing local-verification exception and restore exact protections. Update the wiki with actual proof and limits. Only then admit fresh roadmap continuation; the approved R2 feature specification and existing accepted captures remain preserved.
