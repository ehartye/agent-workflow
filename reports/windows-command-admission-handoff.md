# Windows command-admission handoff

Owner-reported failure on 2026-10-14: Agent Workflow 0.3.0, pinned Codex 0.162.1, Windows 10.0.26200.0, Node 24.21.0 at `C:/Users/ehart/AppData/Roaming/fnm/node-versions/v24.21.0/installation/node.exe`.

Reproduction on that host: invoke the installed plugin's `bin/launch.mjs doctor` with that Node executable, `--data-dir C:/Users/ehart/AppData/Local/agent-workflow --cwd C:/Users/ehart/repos/agent-tests`. This is command-only; no inference is required.

Reported result: ChatGPT authentication and Windows sandbox readiness pass. The first buffered sandboxed Node marker command returns `-1073741502` with empty stdout and stderr; later stages are not reached. The diagnostic server exits normally and its owned Windows job is empty. Zero inference requests. Public 0.3.0 doctor reports only the generic admission failure.

Reported receipts: `C:/Users/ehart/repos/agent-tests/.local/workflow-030-setup/command-details.json` and `admission-details.json`. Neither receipt nor that fnm executable exists in this coordinator environment; the original failure is not independently reproduced here.

Independent inspection at 2026-10-14 01:57:16 UTC: this host is Windows 10.0.26300 with Node 24.18.0 at `C:/Program Files/nodejs/node.exe`. The existing pointer still selects `0.3.1-33b2b029c748972e-node24.18.0`, last written at 01:45:17.657 UTC. Runtime and checkout source digests both match `33b2b029c748972e7d62127dcf5821bee59bd778d40c6f48b3190815089d2f21`. Cached 0.3.0 and its retained runtime match `bbe067890672fcea5e1d78a88c986c1cca77e7ccfeaa497cac97c0140172d9fe`.

The unpublished candidate fixes the structured reporting gap and passes 393 tests here. That does not establish a startup repair on the failing host. The underlying startup cause remains unknown. Historical wiki evidence also records the same numeric failure under Node 26, so it is not established as Node-24.21-specific. No evidence here establishes another session reselected this pointer at 01:53:28.

Next investigation: read the original receipts on the failing host; retain its actual host/session identity, exact runtime/pointer identity and timestamp, command/result facts and cleanup receipts. Choose a discriminating command-only control from those facts. Coordinate any installation or pointer selection with other verification work. Preserve prior runs/runtimes and uncertain effects; no automatic retry, permission weakening or API-key fallback.

This inspection made no installation, doctor repetition, pointer selection, model request or saved-data change.
