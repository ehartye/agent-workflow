# Select an installed runtime for the caller package

## Problem and scope

An unchanged launcher currently verifies the shared current runtime, then rejects when that runtime's source fingerprint differs from its own package. This prevents concurrent package versions or source fingerprints from using their already installed runtimes and misleadingly says the plugin changed. Running setup selects the old package globally and disrupts another session's default.

Resolve package-specific selection for callers containing this change. Older released launchers keep their original code and behavior. Existing saved runs still use their recorded runtime and exact Node/session identity. This does not introduce a stable external shim, change the runtime schema, install implicitly or serialize simultaneous setup operations.

## Selection contract

1. Read the existing pointer and validate its schema/current-record identity and expected managed path. The unrelated current record may name another Node version; that is recorded identity, not permission to execute it under the caller's Node.
2. Calculate the caller's source digest and package version, with the current process's exact Node version. Derive the existing deterministic runtime ID and path.
3. If current has that exact ID, preserve its existing full verification path. Otherwise read only the expected installation's `.runtime.json`, never enumerate directories, choose a similar version, or use another history entry.
4. Verify the chosen runtime's source/native/dependency hashes, path and exact Node, then require the complete version/digest/Node identity to equal the caller. A short digest prefix in the directory name is not enough.
5. Return the verified installation without writing the pointer, history, runtime receipt or any saved run. A separately changed shared pointer does not change this invocation's caller identity.

No missing or invalid match falls back to the selected default, runs setup, repairs data or retries effects. A missing nondefault matching receipt yields `RUNTIME_MATCH_MISSING`; an unreadable, malformed, mismatched or integrity-failed nondefault match yields `RUNTIME_MATCH_INVALID`. The already matching current record retains its existing direct verification error categories. New selection errors include bounded caller and recorded-default version/source/Node identities with actionable setup/preservation guidance. They do not claim the unrelated default's files were verified. Doctor retains the known error categories and bounded data-only selection identities, excluding paths, causes, arbitrary nested data and accessors.

## Alternatives and implications

1. **Deterministic matching-installation lookup (selected).** Time: one caller hash and one actual installation verification; no re-setup. Risk: selecting wrong bytes is severe, so require full identity and integrity, not only a directory prefix. Complexity: reuse the existing ID/receipt/verification owner. Best practice: choose immutable prepared execution without mutating shared preferences. Maintainability: no new index, persistent schema or migration.
2. **Reselect current through setup.** Time: repeated source/dependency verification and disruption to concurrent sessions. Risk: global selection oscillates and may move backward. Complexity: no lookup code but more coordinator reconciliation. Best practice: explicit setup remains useful for installing/selecting, not routine reads. Maintainability: preserves the existing friction.

## Acceptance

- Two versions, and two fingerprints with the same version, can select their exact prepared installations while the newer pointer bytes stay unchanged.
- Real concurrent public launcher processes execute the correct prepared command. An authorized new run is bound to the older caller's exact runtime; pre-existing bindings and foreign-session refusals remain unchanged.
- A different-Node recorded default does not prevent selection of a matching installation for the executing Node. The chosen installation and saved runs still enforce exact Node identity.
- Missing, malformed, escaped/linked, modified source/native/dependency and full-identity-mismatched matching installations fail before command dispatch, with no fallback or writes.
- Pointer metadata remains fail-closed. Diagnostics are bounded and doctor never invokes nested accessors or exposes raw causes/paths.
- Clean-package public validation works from the original retained launcher after an explicit upgraded selection, without changing that selection or installing dependencies again.
- Full local test/check/smoke/clean-install/audit gates, independent review, exact canonical/tag/archive verification, source and marketplace publication, and wiki design/roadmap updates complete the release under standing authorization with Actions disabled.
