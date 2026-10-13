# Fresh local workflow controller

The owner authorized the rebuild and asked to get it working locally before SSH. The foundation milestone passed two actual ChatGPT worker reads with MXC. This continuation implements the next acceptance slice without importing the released runtime.

Design: a separate bounded QuickJS child evaluates plain workflow JavaScript. A small controller owns ordered calls, a shared concurrency limit and a per-run SQLite journal using Node's built-in driver. Worker transitions write individual rows; they do not rewrite the entire growing run history. A managed-ChatGPT App Server backend owns actual worker threads. Read-only execution is the first supported policy; unsupported options fail explicitly. Store results before returning them to the evaluator. Replay only a verified completed prefix within the same run; changed/failed positions invalidate the suffix. Unknown active workers prevent automatic replay. No automatic old-worker fallback or data migration.

- [x] Isolated evaluator: literal metadata, JSON bridge, agent/parallel/pipeline/phase/log/args, no imports or nondeterministic clocks, CPU/memory/wall bounds.
- [x] Controller: ordered call admission, bounded concurrency, durable result snapshots, completed-prefix replay and missing/unknown evidence refusal.
- [x] Fresh Codex backend and explicit local CLI: command admission before inference, separate threads on a retained server, managed ChatGPT only, read-only/no-network/never.
- [x] Tests first for failures and replay; run a tiny actual local JS workflow and prove its replay uses zero extra model calls.
- [x] Independent review, test-skill reassessment, wiki update and feature-branch checkpoint.

Following slices remain: durable background controls and native interruption, structured output and writer policies, monitor integration, registry/skills and all remaining items in `docs/codex-parity.md`. A passing slice does not establish full parity.

