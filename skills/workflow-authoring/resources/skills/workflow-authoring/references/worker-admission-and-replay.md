# Worker admission and replay

Use the public `node <plugin-root>/bin/launch.mjs` entrypoint. An existing run selects its recorded runtime; a new run uses the explicitly installed current source. No installation occurs during a read/start. The following is the current candidate contract; do not apply it retroactively to older recorded runtimes.

## Retained execution roots

From 0.4.3, new public runs retain verified complete source packages in their own `source-packages-v1/`. The saved descriptor maps logical original IDs/catalog provenance to admitted retained execution roots. Match the native read's returned `skill_root` to that mapping. Cache eviction alone does not require restoring an old cache or replacing selected sources. Retained source loss/corruption, drift or changed replay backend/configuration still refuses admission. External managed homes, runtimes, caches and services have separate readiness/lifetime requirements; a source copy does not retain them. Descriptorless older runs keep their original checks and failures; do not retrofit retention into saved context.

## Capture the actual parent context

The coordinator writes the following JSON from its actual originating session, without asking the owner to invent grants. Never infer authority from a new child's configuration.

```json
{"version":1,"sessionId":"<actual originating session>","provenance":"codex-session-context","filesystem":"unrestricted","networkAccess":true,"approvalPolicy":"never"}
```

Only this supported policy is currently admitted for parent mode. Missing, mismatched or unsupported context fails closed. This is a coordinator assertion tied to the session; it is not cryptographic host attestation. Parent access includes filesystem/network authority and original enabled native plugin/skill roots. Host-only app connections and histories are not cloned.

```text
node <plugin-root>/bin/launch.mjs run project:<saved-name> --cwd <checkout> --session <actual-session> --parent-access <context.json> --worker-capabilities <role-bundle.json> --writable --data-dir <same-data-directory>
```

This argv shows supported fields, not execution-ready paths or a fabricated manifest. Verify prerequisites and exact files before dispatch. `--access parent` is the new-run default; `--access restricted` explicitly selects restricted execution and does not need a parent-context file. Omit `--writable` for source readers. Parent writers use separate organizational worktrees with full parent permissions, not filesystem security isolation. A read-only task description alone does not narrow command policy.

## Select each role before dispatch

For writer tests, explicitly authorize each temporary fixture area before dispatch. The candidate worker instructions permit Git metadata changes only in coordinator-authorized temporary fixture repositories inside the assigned worktree. Filesystem links require the same explicit authorization, with both link and target inside one owned fixture directory; linking project source, retained inputs or another workspace remains forbidden. This instruction exception grants no additional OS/tool permissions. Retained older runtimes can still forbid fixture links: leave that dependent check to the coordinator, rather than trying to override a running worker's developer instructions. Bind cleanup and failure-residue rules to the check; a fixture exception is not permission to change the project's Git metadata or publish.

Record `worker ID → required skills → required tools → owned paths`. Parent catalog provisioning supplies availability automatically; do not require activating every discovered skill. Explicit `agent(...,{skills:[declared IDs],requireTools:[declared IDs]})` selections require a validated immutable new-run bundle. Native skill names and tool IDs come from actual installation/metadata; example IDs are not installed resources.

A request for FULL Agent Meshes includes its installed authoring, believable construction, build, quality review, rigging and setup skills, plus actual managed CLI/Blender readiness for the assigned operations. Select the needed engine/testing skills too. Assign asset writes to one writer; source scouts cannot generate models just because parent execution is unrestricted.

Each selected skill must invoke genuine executor `skills.list({authority:{kind:'executor'}})`, then `skills.read` with the returned package/main_resource and admitted execution root. Resolve duplicate names with native metadata and that exact root, retaining original roots as provenance. Use native cursors for pages and resource identities inside that package. Never copy/load `SKILL.md` manually as activation. An out-of-package document needs coordinator-declared admitted path/hash evidence and an authorized ordinary read after genuine activation; do not invent a `skill://` URI or widen roots. If the task permits no such read, report the document missing.

Required source/environment/readiness checks run under the actual worker policy before dependent inference. Passing Node/CLI/setup checks does not prove browser rendering, Blender startup or artifact quality. Keep those observations separate. JavaScript orchestration tools may lack `process`/`require`; invoke verified executables through the command tool rather than assuming those globals.

Keep three readiness records: selected native catalog/main reads at the admitted roots; actual CLI/runtime/dependency/cache readiness in the worker; and authorized tool execution with retained output. None substitutes for another. Activating a setup skill grants no installation, network, delegation or policy change. Stop only the work that needs a missing prerequisite and return its exact command/path and observed failure.

## Read recorded results and source proofs

Public status is a bounded overview. A worker's `result` there can be a truncated string preview, even when the original result is an object. Inspect type and truncation metadata; do not parse the preview as complete JSON or infer omitted findings, missing checks or files. Use the recorded runtime's public `worker RUN_ID --generation GENERATION --position POSITION --data-dir SAME_DATA_DIRECTORY` read, with the actual saved identity and admitted launcher. Resolve replay/source-generation identities from saved records rather than guessing. Read the full result fields within bounded output pages; a tool-output truncation needs further bounded reads, not a new worker call.

When a coordinator supplies retained evidence instead, verify its exact run/generation/position/attempt, raw record and summary hashes/lengths, and that the complete findings/missing/file projection matches that record. Preserve the original result and failed native reference reads. Full reports establish what was reported; capture integrity, source ownership, cleanup, semantics and acceptance still need independent review.

A read-only worker may be unable to query Git metadata even when source files are readable. Preserve the executable/argv, exit and error category; do not add `safe.directory`, change ownership or widen policy. If already admitted, consume coordinator-provided self-contained raw commit/tree/blob proofs, verifying each Git object hash, the commit-to-root-tree chain, path membership/absence, modes and exact source bytes. Keep each owned path's upstream/base/candidate mapping and producer lineage. Missing proofs block the dependent identity check; do not invent a base or copy foreign provider source. A later verified proof does not turn the failed Git command into a passing command or prove that no command started.

## Review provider contracts and temporaries

Agree exact types and limits with each provider owner before dispatch, then recheck them before freeze. In the reviewed roadmap R4 contract, `FrozenSnapshotV1.files[].mode` and dependency content inventory modes are JSON numbers `100644|100755`; existing workspace capture modes are strings `'100644'|'100755'`. Validate both and bridge with the explicit two-entry enum mapping. Do not coerce malformed input or confuse these modes with filesystem stat bitmasks.

The same revision admits a 2 MiB serialized `CommandJobRequestV1`/job file, including a snapshot still bounded to 1 MiB; its public options wrapper is bounded to 2 MiB + 65536 bytes and its private ledger record to 4 MiB. Command argv stays literal and separately bounded. Public expanded responses stay at 1 MiB and receipt metadata at 65536 bytes. These are distinct envelopes: file input, private persistence, response and worker answer limits cannot be interchanged. Confirm the installed provider revision before using candidate bounds. Reject original sparse/named-property/subclass/accessor/proxy arrays before normalization or callbacks, and bind canonical command cwd to the admitted verification snapshot root before dispatch and on recheck. Keep one existing invariant/test owner per boundary; documentation does not establish a provider pass.

Freeze complete tracked/untracked source, tests, recipes, package/lock/plugin inputs, HTML/CSS and docs. Only admitted administrative Git metadata and explicitly prepared dependency payloads may be excluded here. Every excluded dependency needs a complete sorted, hash/mode/byte content inventory; a lockfile or version string alone is insufficient. Rehashing a manifest cannot authorize hiding implementation files. Verify ordinary single-link sources, ancestors, destination preimages/absences and the complete upstream/base/candidate mapping before an external source handoff. Apply reviewed textual hunks to manual-three-way paths; never overwrite them wholesale. A source copy supplies bytes, not semantics or provider availability in a sibling writer.

Derive the full temporary-prefix inventory from the actual test/scripts source before dispatch/freeze, including URL-relative fixtures. Bind its reviewed paths, source hashes and allowed validation roots to the snapshot and check requirements. The recovery run's reviewed eighteen prefixes are specific to that source revision, not a universal allowlist. A new prefix requires an explicit reviewed requirement revision. Only the worker's admitted fixture area or its assigned V0/V may create these temporaries, never frozen F0/F or a sibling verifier. Require absence before/after each check, preserve failure residue, and recheck all persistent source/dependency bytes. Equality before/after does not prove absence of transient writes. Keep receipts/control logs outside captured source, including excluded directories.

If other providers are absent from an isolated writer, leave dependent public/process checks unrun until the coordinator supplies reviewed combined source. Dependency completion transfers reports, not edits. Never fabricate an export, substitute an old provider or expand exclusions to obtain a green check. Keep provisional F0/V0 checks bound to those identities; separately freeze and verify final F/V in the original data instance after authorized report/version changes.

## Required package disappears during a run

Preserve the original activation failure and model/effect evidence. `CAPABILITY_NATIVE_SKILLS` reports missing selected main reads; `CAPABILITY_SOURCE_CHANGED` reports persistent selected source removal/change after the model; `CAPABILITY_SOURCE_UNVERIFIED` retains a missing/unknown completion check. Admission passing earlier cannot override these failures.

Stop dependent work. Do not silently replace the package, copy its instructions, hot-grant a missing root, rewrite saved bindings or retry. The coordinator must inspect terminal outcome, owned cleanup and possible effects, then prepare a fresh current bundle/run only after reconciliation. A positive job drain alone does not prove effects safe to repeat. Retain the failed historical slot.

After reconciliation, preserve completed captures, admit eligible unfinished work against verified current sources, review new full artifacts and integrate exact reviewed bytes. Freeze a new combined snapshot and obtain fresh independent checks before acceptance. Historical unknown outcomes stay unchanged; their presence alone does not block properly admitted independent recovery. An approved single-run external barrier must bind fresh verifier calls to the actual frozen combined checkout, not the workers' original inputs.

## Parent catalog changes before resume

`PARENT_CAPABILITIES_CHANGED` blocks missing, incomplete or changed parent catalog identity before generation mutation or worker dispatch. Ordinary resume/restart cannot silently rerun completed writers under different plugins. Never edit saved header/context/bindings to pass the guard. Reconcile the old outcomes and captures, preserve completed artifacts, and prepare a new explicitly admitted run for remaining work with current identities.

## Handoff and verification

Dependencies order calls; they do not transfer predecessor edits. Review producer run/generation/position/attempt, positive drain, authoritative capture manifest/blob hashes, allowed paths and acceptance before integration. Build a fresh stable combined checkout for a new verification run. Missing checks/captures stay missing; cached results and worker JSON are not fresh acceptance.

Immediately attach an observer to the detached receipt's exact `watch.argv`, confirm its `attached` record and retain the processed cursor through terminal. Report failure/unknown and advisory idle events without treating them as retry permission. Dashboard Close and workflow Stop are separate controls.
