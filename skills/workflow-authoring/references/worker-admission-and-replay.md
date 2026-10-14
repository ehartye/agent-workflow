# Worker admission and replay

Use the public `node <plugin-root>/bin/launch.mjs` entrypoint. An existing run selects its recorded runtime; a new run uses the explicitly installed current source. No installation occurs during a read/start. The following is the current candidate contract; do not apply it retroactively to older recorded runtimes.

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

Record `worker ID → required skills → required tools → owned paths`. Parent catalog provisioning supplies availability automatically; do not require activating every discovered skill. Explicit `agent(...,{skills:[declared IDs],requireTools:[declared IDs]})` selections require a validated immutable new-run bundle. Native skill names and tool IDs come from actual installation/metadata; example IDs are not installed resources.

A request for FULL Agent Meshes includes its installed authoring, believable construction, build, quality review, rigging and setup skills, plus actual managed CLI/Blender readiness for the assigned operations. Select the needed engine/testing skills too. Assign asset writes to one writer; source scouts cannot generate models just because parent execution is unrestricted.

Each selected skill must invoke genuine executor `skills.list`, then `skills.read` with the returned package/main_resource and original root. Use the native cursor for pages and native resource identity for files inside that package. Never copy/load `SKILL.md` manually as activation. An out-of-package document needs coordinator-declared original-path/hash evidence and an authorized ordinary read after genuine activation; do not invent a `skill://` URI or widen roots. If the task permits no such read, report the document missing.

Required source/environment/readiness checks run under the actual worker policy before dependent inference. Passing Node/CLI/setup checks does not prove browser rendering, Blender startup or artifact quality. Keep those observations separate. JavaScript orchestration tools may lack `process`/`require`; invoke verified executables through the command tool rather than assuming those globals.

## Required package disappears during a run

Preserve the original activation failure and model/effect evidence. `CAPABILITY_NATIVE_SKILLS` reports missing selected main reads; `CAPABILITY_SOURCE_CHANGED` reports persistent selected source removal/change after the model; `CAPABILITY_SOURCE_UNVERIFIED` retains a missing/unknown completion check. Admission passing earlier cannot override these failures.

Stop dependent work. Do not silently replace the package, copy its instructions, hot-grant a missing root, rewrite saved bindings or retry. The coordinator must inspect terminal outcome, owned cleanup and possible effects, then prepare a fresh current bundle/run only after reconciliation. A positive job drain alone does not prove effects safe to repeat. Retain the failed historical slot.

## Parent catalog changes before resume

`PARENT_CAPABILITIES_CHANGED` blocks missing, incomplete or changed parent catalog identity before generation mutation or worker dispatch. Ordinary resume/restart cannot silently rerun completed writers under different plugins. Never edit saved header/context/bindings to pass the guard. Reconcile the old outcomes and captures, preserve completed artifacts, and prepare a new explicitly admitted run for remaining work with current identities.

## Handoff and verification

Dependencies order calls; they do not transfer predecessor edits. Review producer run/generation/position/attempt, positive drain, authoritative capture manifest/blob hashes, allowed paths and acceptance before integration. Build a fresh stable combined checkout for a new verification run. Missing checks/captures stay missing; cached results and worker JSON are not fresh acceptance.

Immediately attach an observer to the detached receipt's exact `watch.argv`, confirm its `attached` record and retain the processed cursor through terminal. Report failure/unknown and advisory idle events without treating them as retry permission. Dashboard Close and workflow Stop are separate controls.
