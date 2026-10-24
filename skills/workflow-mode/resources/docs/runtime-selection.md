# Prepared runtime selection

From 0.6.3, a new command uses the verified installation matching its caller package's version, complete source fingerprint and executing Node version. Another session can select a different package without forcing this caller to re-run setup or move the shared default backward. This behavior applies to launchers containing the new selector; older immutable launchers retain their original behavior.

The launcher reads the shared `runtime-v2.json` pointer and validates its current record's identity and managed path. If current already matches the caller, its existing direct source/native/dependency verification remains in use. Otherwise the launcher derives one existing runtime ID and reads that installation's `.runtime.json`. It verifies the full identity and source/native/dependency hashes, not just the shortened digest in the directory name. It does not scan versions or history, select another Node version, install, repair or fall back to another package.

Selection is read-only: the pointer, history, prepared installations and saved-run bindings remain unchanged. The recorded default can name another Node version; only the actual chosen installation is executed and fully verified for the executing Node. An unrelated default's files are not certified by a successful caller-specific selection. Invalid current-record metadata still fails closed.

## Saved runs and explicit setup

Run-bound reads and controls continue using their recorded runtime and original session rules. They never switch to the caller's matching installation. `dashboard --current-ui` explicitly chooses presentation from the caller package while controls remain bound to the saved runtime. Original Node requirements remain enforced for saved runs.

Setup explicitly installs/selects its caller package and changes the shared default. A changed caller with no matching prepared installation still requires setup. Removing or changing cache files does not rewrite saved data or authorize retry of uncertain work. This selection change does not supply a stable launcher outside the plugin cache or serialize simultaneous setup operations.

## Failure diagnostics

| Failure | Result and next action |
| --- | --- |
| Nondefault match has no receipt | `RUNTIME_MATCH_MISSING`; inspect the caller/recorded-default identities and run explicit setup from the intended clean caller package. Setup changes the shared default. |
| Nondefault match is unreadable, linked, malformed, mismatched or fails source/native/dependency integrity | `RUNTIME_MATCH_INVALID`; preserve the failed installation/evidence and reconcile a clean package before setup. There is no default-package fallback or automatic repair. |
| Already matching current installation fails verification | Existing direct verification category is preserved, including source, native and dependency integrity failures. |
| Saved run needs another Node version or session | Existing recorded-runtime/session refusal remains authoritative. Installing a new package does not reinterpret that run. |

New selection errors include bounded caller and recorded-default version/source/Node identities. Doctor returns the known code and `runtimeSelection: {reason,caller,selected}` for these runtime-stage failures. `reason` is `missing` or `invalid`; each identity contains `version`, full SHA-256 `digest`, and exact `node`. `selected` describes the recorded default, not verification of its unrelated files. Doctor omits malformed/oversized identities and reads data properties only; raw paths, nested causes, unknown fields and accessors are not serialized.
