# Background workflow controls without MCP

The owner explicitly selected no custom MCP integration. Continue the fresh engine through a CLI and, later, its dashboard. Existing 0.1.1 data is outside this implementation. The wiki's captured Claude dynamic-workflow specification requires background execution, retained scripts/results and pause/stop/relaunch with truthful process state.

Use one detached Node controller per run, the existing separate QuickJS child and native App Server. SQLite remains the authority. A generation-bound control mailbox lets an independent CLI request pause or stop without a second server protocol. Persist control receipts and the run transition before acknowledging application. A hidden detached child acknowledges startup only after the run has durable ownership and state. Resume uses the saved launch request and script unless the owner explicitly supplies an edited script; it requires the original session and refuses uncertain execution.

Pause closes admission and stops script evaluation while allowing admitted workers to complete and persist results. Stop also requests native interruption. Neither an interrupted terminal nor server exit is descendant-drain evidence; unknown dispatched workers block relaunch. Terminal state is published after backend shutdown. A stale lock is never automatically taken over.

- [x] Controller pause/stop and durable generation/session-bound receipts, tested through real SQLite and QuickJS.
- [x] Detached runner startup/exit evidence and independent CLI start/status/control/resume, tested with real processes and an injected deterministic worker backend.
- [x] Native background acceptance without API-key billing, independent review, full checks, documentation/wiki and feature-branch checkpoint.

No new MCP server, compatibility shim or custom Windows token/process-tree launcher. Individual worker control, safe restart after uncertain interruption, schemas, writable workspaces, monitor and other ledger requirements remain subsequent work.
