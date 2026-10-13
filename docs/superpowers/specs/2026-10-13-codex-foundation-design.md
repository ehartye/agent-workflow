# Fresh Codex execution foundation

The owner approved proceeding after the Codex research and explicitly made the old architecture disposable. This first milestone proves the execution boundary before implementing workflow parity. It does not install a replacement or migrate saved runs.

Use the pinned Codex 0.162.1 App Server over stdio. A small independent client owns request IDs, notification routing, bounded protocol buffers and connection shutdown. The capability probe validates managed ChatGPT account/provider configuration, queries available Windows readiness, executes harmless commands using `command/exec`, and tests cancellation through `command/exec/terminate`. It creates no model turn. Never use the old adapter, CIM identity lookup, taskkill, or an automatic alternative transport.

Keep authentication data in memory. Reports contain account type only, effective restrictions, stage outcomes, bounded original errors and a separate server-exit result. Account identifiers, tokens, raw config and environment values are excluded. Successful server exit does not claim arbitrary descendant drain. The initial probe uses read-only/no-network commands, no permission escalation and no sandbox setup mutation.

The probe tests buffered and streamed/PTY commands independently. A failed stage stops dependent work. Protocol readiness is not command readiness; command readiness is not proof that model unified execution has the identical path. MXC may be selected explicitly after compatibility inspection; failure never silently relaxes restrictions. SSH tests require executing the same probe in the actual remote environment.

Tests use real fixture subprocesses for framing, out-of-order responses, timeout, malformed input, streamed output, cancellation and shutdown. Authentication tests reject API-key, missing account and effective provider overrides. Native checks follow only after these pass. Inference and workflow replacement remain later gates, contingent on readiness.

Time: one bounded foundation milestone. Risk: native sandbox failure may prevent admission. Complexity: one narrow protocol client and diagnostic contract. Best practice: published interfaces and observable failures. Maintainability: no coupling to old journal, service or worker lifecycle code.

Sources: [Codex integration](https://developers.openai.com/blog/codex-as-a-platform), [App Server](https://learn.chatgpt.com/docs/app-server), [Windows](https://learn.chatgpt.com/docs/windows/windows-sandbox), [wiki recommendation](C:/Users/ehart/.wiki-master-vault/wiki/authored/agent-workflow/backlog/codex-orchestration-foundation.md).
