# Codex foundation prototype

This independent diagnostic uses the supported Codex App Server protocol. It imports no existing worker, runtime, registry or dashboard code. It is not installed, released or connected to saved workflows.

After `npm ci`, run with the native pinned executable and an explicit project directory. On Windows:

```powershell
node foundation/check.mjs --codex "$PWD/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe" --cwd "$PWD" --output test-output/foundation-configured.json
```

Select `--backend mxc` only as an explicit alternative; there is no automatic backend fallback or machine setup. Existing output files are not overwritten. The command checks read-only login status before requesting `forced_login_method=chatgpt`, filters inherited provider credentials and rejects custom OpenAI routes. Account identity and raw config are not printed. This prototype supports managed ChatGPT only, not registered SIWC yet.

The probe makes no model requests. It checks account/configuration, Windows readiness, a buffered command, streamed command, PTY command and cancellation. Commands request read-only filesystem/no network. Failed stages stop dependent checks. No elevated setup, CIM or taskkill is invoked by this code.

`passed` means these specific protocol checks passed. It does not prove model entitlement, billing attribution for inference, identical unified-exec internals, descendant termination, remote SSH compatibility, or workflow parity. The owned App Server exit is reported separately from descendant state. Failure of either command execution or server shutdown fails the report without hiding the primary error.

Run `node --test test/codex-foundation.test.mjs` for the subprocess contract tests. Tests do not access your Codex credentials or invoke a model. The legacy test suite remains a packaging baseline, not evidence for this replacement.

For an explicit two-model-turn check using the existing managed ChatGPT login:

```powershell
node foundation/model-check.mjs --codex "$PWD/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe" --backend mxc --output test-output/model-check.json
```

This first reruns command admission without inference. If it passes, two ephemeral threads read separate temporary README files with unpredictable markers. The report requires successful command items and exact final answers. It records overlapping outstanding turns; it does not measure simultaneous shell execution. Temporary fixtures contain only generated markers and are retained under the OS temporary directory for inspection. The check consumes subscription usage. It provides no API-key or API-billed coordinator path; account billing attribution is not independently audited.

The turn runner subscribes before dispatch, routes by thread and confirmed turn identity, bounds retained evidence, and rejects failed turns or lost connections. Deadlines attempt bounded interruption. Unknown terminal state prevents another turn on that thread. Caller-owned server shutdown stays mandatory. Recognized startup errors survive through a sanitized signature; arbitrary remote error text, stderr and account identity are excluded from reports.

Local Windows build 26300.9550 acceptance on 2026-10-13: MXC passed all six no-model stages and both model reads. The configured backend reported readiness but rejected buffered execution. See [the committed evidence](../reports/foundation-local-acceptance.json) and [the parity ledger](../docs/codex-parity.md). SSH is deferred at the owner's request. This foundation is still separate from the installed plugin and monitor.
