# Historical 0.1.0 Yoda skill audit

The current 0.2.0 candidate audit is [the paired fresh-skills report](../reports/yoda-fresh-skills.md). The material below records the retired release contracts.

All three packaged skills were audited together before the 0.1.0 public release. Inspection covered descriptions, trigger overlap, instruction placement, direct references, CLI/MCP consistency, argument substitution and invisible Unicode. The official skill validator passed each skill; the separate reviewer found no remaining material inspection blocker after corrections.

## Findings and corrections

| User-visible failure | Mechanism | Correction |
| --- | --- | --- |
| Control-only requests could miss read-only unknown effects or attempt prohibited writer restart | Accurate recovery rules were in authoring references; the main body only named mutating outcomes and presented controls as CLI help | Require controls before control/approval operations; state all abandoned dispatched workers remain unknown, require reviewed effects plus verified drain, and reject writer restart; align MCP metadata |
| An update could select new runtime files while new clients still reused the old supervisor | Drain instructions appeared after setup | Put upgrade preflight before setup; directly link retained-runtime inspection/shutdown instructions because the changed-package launcher refuses commands |
| Installed CLI controls could use the platform default instead of the host instance | Ordinary parent shells may lack the plugin's hashed PLUGIN_DATA path | Carry explicit exact host dataDir in installed command examples; discover it rather than guess |
| A planned PowerShell setup command could contain literal backslash-escaped quotes | JSON escaping was treated as shell quoting in an initial assisted plan | State native argument quoting and provide a PowerShell call-operator example |

Names match directories. Descriptions are 300, 192 and 190 characters for authoring, setup and mode respectively. All references resolve directly, and the six skill/reference Markdown files are short. The Unicode scan found no hidden format/control/surrogate payloads or dollar-argument substitution hazards. These checks do not constitute a comprehensive safety certification.

## Matched model evidence

Actual pinned Codex 0.162.1 exec workers received the same request/context with and without each actual skill; both variants launched together, with read-only/no-network/never-approve permissions and low reasoning effort. These were dry-run plans, not executed setup or control actions. Root assessed the returned calls and explanations against the implementation rather than accepting model self-scores.

| Skill and request | Baseline | With corrected skill |
| --- | --- | --- |
| Resume a read-only unknown worker with verified drain but no effects review | Inspect worker/events/result and defer replay | Same correct behavior, with explicit reconciliation boundary |
| Update a healthy idle installed instance with a changed package | Setup/doctor/reconnect plan omitted old-supervisor drain | Retained-runtime inspection/shutdown, verified exit, exact data directory, setup/doctor/reconnect/list sequence |
| Enable session mode with no real session ID and an untrusted hook | Preserved missing ID, but incorrectly suggested setup commands could establish hook trust | No session mutation or scope substitution; separate hook trust; exact hypothetical project-off call |

The earlier matched authoring comparison executed both generated scripts through the actual QuickJS manager: both retained a missing audit and failed verifier; the assisted script was shorter. It does not establish a general quality advantage. An additional authoring comparison did not produce a complete usable pair after an evaluation-harness failure; it is excluded from benefit claims. Raw development evidence stays in ignored test-output directories.

A separate actual-Codex metadata routing check matched all 11 expected choices: authoring/run, missing-runtime/update setup, mode enable/status, and ordinary explanations, spelling edits, app dependency installation and native reasoning-effort changes. This includes five near misses that should remain normal conversation. It is one bounded classification sample, not guaranteed invocation behavior.

Installation, shutdown, routing state and orchestration have separate real-process tests. These samples support the observed corrections; they do not prove reliable triggering on every future prompt, end-to-end tool execution by a model, or universal multi-agent quality/cost improvement.
