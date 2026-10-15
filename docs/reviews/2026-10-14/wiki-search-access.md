# Wiki Search worker access: limited observed comparison

The tested way to provision Wiki Search is a new parent-access run with its actual originating-session snapshot, native wiki role selection at worker startup, and no narrowing worker permission override. Search tasks do not need `--writable`. Native skill access and the search helper's execution channels are separate requirements.

These are limited diagnostics on this Windows host using the recorded 0.3.5 runtime, Node24.18.0 and Codex0.162.1. The originally reported error was unavailable and is not claimed reproduced or root-caused.

| Run / worker | Recorded effective policy | Native selected main reads | Actual retrieval outcome |
| --- | --- | --- | --- |
| `1d26a15b-8c18-421e-bf74-08c8e42dd5e2`, g1/w0 | danger-full-access, network true, approval never | wiki-core and wiki-search observed | Two completed commands exit0; worker reported query `hybrid`, matching overview/architecture paths, and conditional health with reachable Ollama/model. Freshness warnings remained. |
| Same run, g1/w1 | read-only, network false, approval never | Both observed | Its outer inline wrapper failed SyntaxError before Wiki Search launched. Not a permission-denial reproduction; dependent channels untested. |
| `9c81e7fa-0501-4edf-9dfd-c4898c4d0916`, g1/w0 | read-only, network false, approval never | Both observed | Prepared literal-argv helper and conditional health each exited0. Retained compact result reports `identity-only`, keyword CLI exit1 and Ollama unreachable from this worker. Health reports lexical tier, unreachable model endpoint and stale index. |

All three worker executions have positive server/job/native-terminal inventory cleanup, no forced termination and `windows-job-members` ownership scope. Arbitrary descendants remain unverified. These were read-only queries; no repair, installation, index refresh, policy mutation, service start or uncertain-effect retry was performed. The fresh narrowed run followed explicit evidence that the first wrapper never started search.

The fixed probe is [the prepared diagnostic](../../../.agents/diagnostics/wiki-search-query.mjs), called by [its saved workflow](../../../.agents/workflows/wiki-search-fixed-probe.js). Its literal argv invokes the original Wiki Search CLI after genuine native role activation. It emits compact exit, tier, paths and diagnostics; it does not emit full passages. The initial probe used [this two-condition workflow](../../../.agents/workflows/wiki-search-admission-probe.js).

## Provisioning guidance

- Use the public launcher with `--access parent --parent-access <captured-originating-context.json>` and the same explicit data directory. Capture actual parent authority; do not invent a snapshot or grant wider permissions than that parent.
- Select the declared bundle's `wiki-core` and `wiki-search` IDs in `agent` options. These are this workflow's IDs, not universal native package aliases. Workers call genuine executor `skills.list` and `skills.read` with returned package/resource/cursor metadata. Parent catalog provisioning and deliberate role selection are distinct.
- Omit the worker `permissions` override to inherit the admitted parent filesystem/network policy. A read-only task instruction describes the authorized operation; `permissions:{sandbox:'read-only',networkAccess:false}` additionally narrows execution and can affect outside-project helpers, Obsidian and loopback search dependencies.
- Inspect helper status/tier/channel/freshness diagnostics even on exit0. Identity-only or lexical output is not equivalent to healthy hybrid retrieval. Stale candidates are a separate coverage limitation, not proof of missing permissions.
- Skill selection grants no filesystem/network/application authority. Existing workers retain immutable launch/catalog identities; steering does not add privileges or replace missing bindings. Create a correctly provisioned fresh worker only within authorized, reconciled scope; preserve uncertain earlier effects.

Parent mode worked for this query; the narrower mode degraded. This comparison does not establish the least possible permission set, prove a globally stopped Ollama daemon, or isolate keyword exit1 to a particular sandbox denial. Do not recommend installation or host-wide policy changes from these observations.

## Observation limits and tool friction

Observers consumed actual attached records through each durable terminal event, and independently retained applied policy, native main-read metadata, command exit counts and cleanup. Native main-read pairing does not certify full bodies or instruction adherence.

Earlier full command input/output payloads had already left the bounded activity window. Exact query/channel details above come from the worker's retained structured JSON, corroborated by command exits and the fixed helper's source, rather than independently preserved original command payloads. A separate paired skill evaluation showed the same eviction pattern; the fixed wiki probe also lost early command details during rapid output. This is an observation gap, not evidence of success or failure beyond the retained facts.

Roadmap request: retain bounded command-start/completion evidence separately from high-volume output/answer deltas, or coalesce deltas so a short final response cannot evict the entire executed-command record before inspection. Keep bounded storage and payload privacy; do not replace this with unlimited logging. The inline-wrapper failure also supports preparing literal-argv scripts for diagnostic operations rather than nesting shell and Node code strings.
