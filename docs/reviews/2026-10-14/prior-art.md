# Prior art and remaining workflow functions

Coordinator qualification: the captured audit omitted the canonical [official Claude 2.1.296 observation][L-native-reference]. The budget/nesting rows and G5/G8 below now include it. This is a versioned original inspection record, not a current public API or cross-version guarantee. The retained original capture is unchanged.

Review date: 2026-10-14 America/New_York; current-source retrieval: 2026-10-15 UTC. Local baseline: published 0.3.5, `ca0e8b73f4af142a9035e29f709483af94ab28f2`. This is a source/documentation review, not new runtime acceptance.

Agent Workflow already supplies the core durable executor: separate QuickJS evaluation, native Codex workers, ordered replay, saved definitions, isolated writer captures, authenticated controls, selected native skills and a live dashboard. The most useful additions are trustworthy delivery/checkpoint records, stronger verification recipes, and pre-run inspection. Exact stock-host UI, shared token accounting and provider-cache equivalence remain unresolved requirements; an ordinary plugin cannot claim them from community examples. Preserve the owner's Windows deployment, retained runtime/data consumers, managed ChatGPT authentication and CLI/dashboard architecture.

## Evidence boundaries and native skill invocation

- Read repository `AGENTS.md`, `.testing/risk.yml` and `.agents/review-inputs/2026-10-14/manifest.json`. All seven manifest snapshots matched SHA-256. `git --no-optional-locks rev-parse HEAD` returned the baseline above; the scoped source diff for `engine`, `foundation`, `bin`, `skills`, `workflows` and `docs/codex-parity.md` was empty.
- Genuine executor `skills.list` was paginated with its returned native cursors through the final page. Selected IDs `wiki-core` and `wiki-search` returned the expected `wiki-master:wiki-maintainer` and `wiki-master:wiki-search` names. Genuine `skills.read`, using each returned package and main_resource, returned the exact original roots `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\wiki-master\0.41.1\skills\wiki-maintainer` and `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\wiki-master\0.41.1\skills\wiki-search`. Native main reads and the core's in-package `references/access.md` and `references/evidence.md` reads completed without pagination or reference failures. Duplicate packages under the parent plugin root were not substituted for these IDs.
- The four published Agent Workflow skills were also read using their catalog-returned native package/main_resource under original root `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\agent-workflow\0.3.5\skills\{agent-workflow,workflow-authoring,workflow-mode,workflow-setup}`. Each native read returned the matching root and no next cursor. Repository/cache hashes matched for all four. These reads supplied comparison evidence; no setup, mode, launch or workflow command was executed.
- **Procedure deviation:** a subsequent shell line-count check used `Get-Content` on those four repository `SKILL.md` files and emitted counts only. This exceeded the requested prohibition on shell skill-body reads. The native activations were already complete; the count operation did not substitute for them. No further shell skill-body reads were used.
- Several initial broad file/search reads were tool-truncated under the requested output cap. Narrow exact-path views supplied the passages used below. Uninspected tails are not complete-read evidence; no full-vault or exhaustive source-coverage claim follows from them.
- Frozen `prior-art-wiki.json` reports `tier: hybrid`, 102 checked entries, candidate-validated freshness, zero modified/removed, two returned raw hits, and **first 100 of 273 candidates validated**. Its `citation-targets-not-resolved` statuses do not establish a complete provenance walk. The plugin-manifest clipping is an explicitly unresolved citation. This review used that frozen lookup, not a new live hybrid search or index refresh.
- Exact canonical/source pages read first: `wiki/authored/agent-workflow/notes/dynamic-workflow-parity-research.md`, `wiki/authored/agent-workflow/notes/task-decomposition-spike.md`, `wiki/sources/claude-code-dynamic-workflows.md`, and `wiki/sources/ultracode-codex-plugin-static-review.md`, under the known vault root. Exact raw headers/passages were inspected only at the frozen evidence paths for the official workflow guide, Claude changelog, Just Every repository overview and PabloNAX skill clipping. No `.recycle` content was searched or read.
- Frozen release, architecture and backlog snapshots distinguish shipped 0.3.5 from historical failures. The overview's opening “current 0.3.1” statement is stale relative to the explicit 0.3.5 release note and baseline. The architecture also retains earlier-runtime paragraphs; those are not proof that their quota/stall behavior exists in this rebuild.
- No installs, additional model calls, application/service/browser launches, workflow controls, publication or Git mutations were performed. No fresh tests, Windows native-host probes or external implementations were run. Historical 506-test and 81-render-check claims belong to the frozen release note, not this review or coordinator acceptance here.

## Current primary sources and frozen comparisons

GitHub repository metadata and default-branch commit responses were retrieved directly from GitHub's API. All source links below are pinned to those returned identities. A current fetch proves the inspected bytes, not successful execution. Official public documentation defines published behavior; it does not expose every internal/native-host contract.

| Source | Current fetched identity | Relationship to frozen evidence |
|---|---|---|
| Just Every plugin | [`9dde0086e983413016bf62ab96ba6bb17b599fae`][J-commit], main; commit date 2026-07-09 | Same identity as the frozen static review. Freshly inspected source supports the specific observations below; prior static findings remain unexecuted. |
| hesreallyhim workflow collection | [`9b5404d11b885b28380d3eb17471ef7b17601b5e`][H-commit], main; commit date 2026-08-05 | Newly fetched comparison. Recipes, analysis tools and observer documentation; not an implementation of Claude's native runtime. |
| PabloNAX skill | [`bfa2d92488171651c6c9379a8b98f8a07d996d3c`][P-commit], main; commit date 2026-06-15 | Same identity as the frozen clipping. Explicitly a **skill-only** comparator, dependent on the current host's tools and rules. |
| Official Claude changelog | [`94506ff0d3bd9185f1752da36e968775021fb48f`][C-commit], main; commit date 2026-10-14 | Current fetched changelog begins at 2.1.300. This is distinct from the older captured changelog. |
| Official dynamic workflows guide | [Current guide][C-guide], retrieved 2026-10-15 UTC | Mutable page, no immutable documentation revision supplied. Frozen capture hash `4bd52a60ff58213b6cfbe28ed0d2fb34df32d8f9fa8c24dd506909a24679b0ef` identifies the old capture only; this review does not claim a byte-identical current page. |

The official guide documents background scripts, saved commands, structured results, phased progress, ordered replay, bounded fan-out and session controls. It explicitly disallows mid-run human input; stage sign-off uses separate runs. It also describes automatic stall restarts and conditional subscription-limit waits. Those last behaviors are **not adoption recommendations** for uncertain mutations. Its current guide does not establish the community `budget` or nested `workflow()` API contracts. [Official guide][C-guide]

The pinned official changelog records a separate Ultracode toggle, workflow progress/UI changes, and, at 2.1.300, a workflow-agent prompt/model rewrite hook. These are Claude host changes, not portable Codex APIs. The documentation changelog URL returned an internal retrieval error; the directly linked official GitHub changelog was successfully fetched. [Pinned official changelog][C-log]

Just Every's source compiles workflow bodies with host `AsyncFunction`, reuses a completed-worker map keyed by cache key, and creates nested contexts. Its engine offers pipeline, loop and adversarial verification helpers. The app-server catch path can fall through to exec unless strict mode is selected. These are current source observations at the frozen commit, not new reproductions. Its README's Codex goal recommendation is author guidance, not proof of native lifecycle continuity. [Runner][J-runner], [engine][J-engine], [README][J-readme]

The hesreallyhim collection provides criterion-level QA, skeptic panels, a lifecycle script that returns checkpoints/questions/state, and static topology tools. Its authoring document calls a session budget a hard ceiling; that remains a **community host-contract claim**, unverified here against an official native API. Its recipes call `workflow()` and `budget`, so copying them into our evaluator would fail. [Lifecycle recipe][H-sdlc], [QA recipe][H-qa], [bug panels][H-bugs], [authoring][H-authoring], [static diagrams][H-diagram]

PabloNAX describes packet ownership, parent integration, result files and eval contracts. It explicitly supplies no background service or runner. Its reported live test is the author's claim, not independently executed evidence. It is useful for task discipline, not a durable replay, accounting or host-surface comparator. [README][P-readme], [eval contracts][P-eval], [packet contract][P-packets]

## Feature matrix

**I = implemented**, **P = partial**, **M = missing**, **N/A = not applicable**, **U = unverified**. For Claude, I means documented public behavior. For external repositories, I means source implements the library/tool function, with execution unverified. For Agent Workflow, I means baseline implementation; historical acceptance remains scoped as above. “U” is not evidence of absence. Cells refer to sources in the rightmost column; none imply broad native-host parity.

| Function | Official Claude | Just Every | hesreallyhim collection | PabloNAX skill only | Agent Workflow 0.3.5 | Evidence / boundary |
|---|---|---|---|---|---|---|
| Dynamic decomposition | I | P: author-guided | P: recipes/plans | P: guidance | P: real scouts + bounded fixed plan | [Guide][C-guide], [H lifecycle][H-sdlc], [delivery][L-delivery]; semantic task quality is not scheduler capability. |
| Replanning after results | P | P: script branches | P: state checkpoints | P: instructions | P: explicit revisions; uncertain replacements blocked | [H lifecycle][H-sdlc], [delivery][L-delivery], native authoring skill. No autonomous replanner or authenticated guest receipt resolver. |
| Saved scripts, arguments, discovery | I | P: limited scopes | I: distributed scripts | N/A: files describe work | I: project/personal/bundled, reread, saved commands | [J registry][J-registry], [local registry][L-registry], [launcher][L-launch]. No promise of identical slash-menu integration. |
| Separate bounded evaluator | P: isolation documented; CPU/memory U | M: separate boundary | U: relies on host | N/A | I: child QuickJS, JSON broker | [J runner][J-runner], [evaluator][L-evaluator], [broker][L-evaluate]. |
| Item pipelines and parallel barriers | I | I | I: recipes | N/A | I | [J runner][J-runner], [H QA][H-qa], [evaluator][L-evaluator]; item-local stages preserve null slots. |
| Independent panels / adversarial checks | I: documented pattern | I: helper | I: panel recipes | P: eval guidance | P: independent checks, limited recipe breadth | [J engine][J-engine], [H bugs][H-bugs], [item audit][L-audit], [research][L-research]. |
| Structured result admission | I | P: different validator/semantics | U: host dependent | P: contracts | I: bounded schema, same-thread correction | [J engine][J-engine], [worker session][L-worker], [parity ledger][L-parity]. Correction prompts forbid new tools; not arbitrary task retry. |
| Nested saved-workflow composition | P: one-level shared-context observation in official 2.1.296; current public API U | P: separate contexts/caps | P: recipes require host API | N/A | M: no guest primitive | [J runner][J-runner], [H lifecycle][H-sdlc], [evaluator API][L-evaluator]. A community function name does not establish official parity. |
| Concurrency, batch and lifetime caps | I | P: own caps | U: host enforcement | N/A | P: caps exist; CPU-aware default/scale evidence open | [controller][L-controller], [parity ledger][L-parity]. Default is 2; explicit range 1–256, batch 4,096, run cap 1,000. |
| Usage and budgeting | P: official 2.1.296 turn-wide output-token target; current enforcement U | P: local accounting | P: budget guards; native ceiling U | P: planning advice | P: worker usage; guest/shared budget M/U | [activity][L-activity], [evaluator][L-evaluator], [H budget claims][H-authoring]. Observed accounting is not a hard spending ceiling. |
| Human questions and stage sign-off | N/A: mid-run input unsupported | U: durable question contract | P: returned checkpoints | P: guidance | P: coordinator between runs; mid-run questions M | [H lifecycle][H-sdlc], [delivery][L-delivery], [native turn][L-turn]. Do not describe permission prompts as general human questions. |
| Ordered replay and retained runtime/data | I | P: key lookup | U: runtime external | N/A | I | [J runner][J-runner], [controller][L-controller], [managed runtime][L-runtime]. Cached checks do not establish current artifact freshness. |
| Provider prompt-prefix cache coordination | I | U | U | N/A | U | [Guide][C-guide], [parity ledger][L-parity]. Result replay and provider cache are different functions. |
| Artifacts, integrity, acceptance | P | P: journals/results | P: evidence-oriented QA | P: eval/packet files | P: captures + fresh verify; trusted acceptance assembly M | [H QA][H-qa], [P eval][P-eval], [workspaces][L-workspaces], [delivery][L-delivery]. Hashes, task reports and accepted outcomes are separate. |
| Worker skills, tools and readiness | P: subagents; exact discovery/readiness U | P: native environment | P: host agent definitions | P: host delegation | P: genuine native roles; broad apps/rendering U | [local policy][L-policy], [backend][L-backend], four native skill reads. This review exercised selected wiki skills, not every worker/tool contract. |
| Process and native terminal ownership | P: controls documented; OS extent U | P: liveness/lifecycle | U: host dependent | N/A | P: owned Windows jobs + terminal inventory; arbitrary descendants U | [J liveness][J-liveness], [native helper][L-job], [terminals][L-terminals], [restart][L-restart]. Inventory ACK is not OS drain. |
| Exact-attempt worker steering | U: full portable API not established | U: complete contract not established | U: relies on host | N/A | I | [controls][L-controls], [turn/steer][L-turn]. Selection/permissions cannot be expanded by steering. |
| Live UI and notification delivery | I | P: own dashboard | P: observer/statusline | N/A: report artifacts | P: map/inspector + durable watch; native push M/U | [H README][H-readme], [watch][L-watch], [notifications][L-notifications], [monitor][L-monitor]. An attached consumer is required. |
| Stock composer/task-panel integration | I | N/A: separate product UI | P: supplemental views | N/A | M: stock UI; native extension contract U | [Guide][C-guide], [parity ledger][L-parity]. Owner's CLI/dashboard choice stands; this remains a boundary, not a waived requirement. |
| Managed subscription-only routing | N/A: different host/provider | U: no reviewed equivalent guard | N/A: Claude host | U: host choice | I: enforced before inference | [launch][L-native-launch], [probe][L-probe], [J engine][J-engine]. No API-key fallback proposed. |

## Prioritized useful gaps

These are review recommendations, not approved scope or implementation estimates backed by a new experiment. Acceptance cases below are **proposed, not executed**. Extend each existing invariant owner; do not add duplicate tests that merely mirror the implementation. Retain production compatibility and Windows merge/release gates.

### G1 — Trusted delivery and criterion acceptance records (P1)

**Evidence.** `decomposition-delivery.js` leaves `workerRef` null, supplied receipts unauthenticated, verification `reported`/`unverified`, and `complete: false` (lines 139–144, 186–225). This is correct honesty, but assembly is manual. H's criterion decomposition and adversarial review of passing criteria, and P's eval contracts, offer useful patterns rather than authoritative receipts. [Local recipe][L-delivery], [H QA][H-qa], [P eval][P-eval]

**Benefit / dependency.** Add a read-only coordinator report builder that resolves actual run/generation/position/attempt, reviewed captures, allowed paths, integrated snapshot and fresh check receipts into an objective ledger. It must preserve the recipe output and require the coordinator's actual acceptance; no worker Boolean can grant it. Depends on existing workspace integrity, immutable producer identities, fresh-verification input identity and a specified acceptance-record format.

**Acceptance.** A schema-valid blocked worker cannot satisfy a criterion. Reject forged/cross-run captures, changed blobs, out-of-scope paths, stale/cached checks and a changed integration snapshot. Missing verifier slots stay missing. A valid reviewed handoff can be assembled without relaunching completed writers.

**Implications.** Time: medium implementation and real handoff validation. Risk: high consequence if claims become authority. Complexity: moderate, reusing retained records. Best practice: independent evidence before acceptance. Maintainability: one resolver/report contract instead of repeated prompt reconstruction.

### G2 — Persisted stage checkpoints and safe plan revisions (P1)

**Evidence.** H's lifecycle script returns questions, state and resume instructions, including handoff and budget checkpoints (lines 217–291); supplied completed artifacts are merged into state (187–194). Our delivery recipe accepts a bounded plan but explicitly cannot authenticate reconciliation and never dispatches uncertain replacements. [H lifecycle][H-sdlc], [local delivery][L-delivery], [restart admission][L-restart]

**Benefit / dependency.** Provide a coordinator-owned checkpoint document linking outstanding objectives, reviewed answers, artifacts and proposed next tasks across **new** runs. Offer a plan diff for unfinished safe scope. Keep runtime restart admission authoritative; unknown effects remain blocked. Depends on G1's identities, original-session authorization, original capability roots/catalog identity, and explicit package-loss/catalog-change recovery. The frozen authoring backlog records failed semantic coverage of those recovery cases despite successful native reads.

**Acceptance.** Losing a required skill package or changing the parent catalog yields a complete recovery decision, preserves completed work and never rewrites saved bindings. An answer advances only its intended checkpoint. An unknown writer blocks dependent replacements despite nonempty claimed reconciliation strings; independent authorized tasks can still proceed. Explicit objective removal is recorded as a scope change, not delivery.

**Implications.** Time: medium. Risk: high if state claims bypass reconciliation. Complexity: moderate cross-run links. Best practice: explicit checkpoints and immutable history. Maintainability: versioned, inspectable state; no autonomous retry service.

### G3 — Research discovery, criterion QA and bounded skeptic panels (P1/P2)

**Evidence.** Our `cross-source-research` requires explicit `args.sources` and uses one cross-check stage; `item-audit` and `loop-until-dry` retain missing results but do not provide the collection's full criterion/panel repertoire. H's bug recipe has bounded rounds, rotating lenses and a majority panel; its QA recipe challenges passing criteria. [Local research][L-research], [audit][L-audit], [dry loop][L-dry], [H bugs][H-bugs], [H QA][H-qa]

**Benefit / dependency.** Add optional discovery → primary-source reading → independent verification recipes and criterion QA with evidence-linked dissent. Panel agreement must not replace source evidence. Depends on genuinely available search/fetch tools, bounded worklists, explicit role selection and a total attempt envelope. External-source access failures and missing modalities remain visible.

**Acceptance.** Test inaccessible sources, duplicate claims, null panelists and contradictory citations. A missing panelist cannot count as a refutation or a successful quorum. A capped/budget-stopped search never reports exhausted coverage. A green criterion without check/source evidence remains unverified.

**Implications.** Time: small to medium for recipes, longer for actual research acceptance. Risk: correlated model mistakes and increased usage. Complexity: modest using existing primitives. Best practice: evidence-based independent checks. Maintainability: a small documented catalog with explicit stopping rules.

### G4 — Nonexecuting plan explanation and resource preview (P2)

**Evidence.** Our parser validates literal metadata/modules, while the controller's default concurrency is 2 and scale acceptance remains open. H's diagram tool statically parses source, marks barriers/fan-out/loops, and explicitly ignores runtime arguments rather than executing code. [Local parser][L-script], [controller][L-controller], [H diagram tool][H-diagram], [H AST contract][H-contract]

**Benefit / dependency.** Add an inspect/explain surface for saved scripts showing known call sites, dependencies, permission/capability needs, bounded/unknown multiplicity and advisory size. Show a pre-run map from verified static facts, without making inferred topology authoritative. Depends on a documented supported AST subset, registry resolution and bounds for untrusted source.

**Acceptance.** An infinite loop, dynamic fan-out, invalid metadata or filesystem attempt cannot execute during explanation. Dynamic widths display unknown or a justified bound; phases never imply dependencies. Warn on known ownership overlap and caps without inventing worker counts or silently changing concurrency.

**Implications.** Time: medium. Risk: misleading estimates; low execution risk with nonexecuting analysis. Complexity: bounded parser analysis. Best practice: inspectable plans and honest uncertainty. Maintainability: shared metadata/validation rules; no second evaluator.

### G5 — Run-level usage, advisory budgets and quota-aware admission (P1/P2; hard ceiling U)

**Evidence.** Local activity retains native usage and replay copies historical usage, but the guest API contains only args/agent/phase/log/parallel/pipeline. The parity ledger leaves aggregation, quotas, shared budget and provider-cache equivalence open. H's authoring page claims stronger budget enforcement than the official public guide establishes. The canonical official 2.1.296 inspection records budget.total/spent()/remaining(), null/Infinity without a target, and rejection of new agent calls after a turn-wide output-token target is exhausted. This narrows the unknown to current-host enforcement and transferability to Codex; it does not establish total input/output cost, an account-wide hard ceiling or zero in-flight overshoot. [Versioned native observation][L-native-reference]. [Activity][L-activity], [controller][L-controller], [evaluator][L-evaluator], [ledger][L-parity], [H authoring][H-authoring]

**Benefit / dependency.** First aggregate observed totals without double counting and expose predeclared advisory envelopes/remaining reservations. A safe admission gate can stop new work; it cannot guarantee an account-wide ceiling or zero overshoot. Only add structured quota waits when the pinned native protocol supplies reliable codes/reset facts and safe retry eligibility. Hard shared parent/worker accounting and provider caching require verified host/provider contracts, not a locally invented budget object.

**Acceptance.** Replayed workers add no new spend; corrections/restarts preserve all attempts. Missing/malformed usage remains unknown. Concurrent in-flight overshoot is disclosed. A quota/stream failure after possible mutation does not repeat work or switch transport; an unavailable reset fact cannot become a guessed countdown.

**Implications.** Time: medium for aggregation/advisories; indeterminate for host accounting. Risk: false spending guarantees or duplicate effects. Complexity: moderate locally, high at shared-host boundaries. Best practice: observed-versus-enforced accounting separated. Maintainability: pinned schemas and explicit unknowns.

### G6 — Reliable live-observer ownership and host notification adapter (P1 local; native push U)

**Evidence.** Local durable watch deliberately owns only a consumer cursor and sends no controls. The main skill requires a consumed `attached` record and continuous relay; ending the host session does not stop the run. H's polling observer/statusline offers a supplemental presentation pattern, not a Codex chat-delivery API. [Watch][L-watch], [notifications][L-notifications], [monitor][L-monitor], [H README][H-readme]

**Benefit / dependency.** Make observer ownership/reconnection coverage inspectable alongside execution state; improve unattended failure delivery when an authorized host adapter exists. Depend on a real coordinator communication mechanism and originating session identity. Native chat/task-panel push stays unverified until its supported contract and lifecycle are supplied. Do not introduce a custom MCP server or imitate stock-host messages.

**Acceptance.** A launch receipt alone never means monitored. Disconnect/reconnect from the last processed sequence preserves terminal/unknown events. An observer error exposes missing monitoring without cancelling workers. A retained runtime without watch support reports the missing surface and remains bound to its recorded runtime.

**Implications.** Time: small to medium locally; native timing unknown. Risk: missed or duplicated notices. Complexity: moderate ownership/cursor handling. Best practice: durable events with explicit consumers. Maintainability: adapter boundary rather than global settings changes.

### G7 — Windows helper failure-stage evidence (P1 hardening)

**Evidence.** Native terminal cleanup reports `descendants: notVerified`; job ownership is a separate signed Windows helper boundary. Its output pump catches `IOException`. The frozen helper-diagnostics backlog preserves the original unknown writer and explicitly says deeper C# stage diagnostics are open; its blocked-consumer fixture is a possible mechanism, not the historical cause. [Terminals][L-terminals], [helper][L-job], [helper package verification][L-job-package], frozen `backlog/job-helper-output-diagnostics.md`

**Benefit / dependency.** Add bounded failure-only stage and exit evidence so drain/capture failures are actionable without weakening success criteria. Depends on authorized Windows helper build/signing, package identity and actual output-consumer boundary checks. Existing retained handles must not be described as absent merely because broader descendant ownership remains unverified.

**Acceptance.** Distinguish failed output transfer, missing marker, process exit and nonempty owned job. Bound/redact diagnostics. Missing evidence remains unknown, capture/restart still fails closed, and the original failed attempt stays unchanged. No automatic cleanup retry.

**Implications.** Time: medium including signing/Windows verification. Risk: severe if diagnostics weaken drain admission. Complexity: focused native/JS evidence schema. Best practice: retained native ownership and positive drain proof. Maintainability: explicit failure stages instead of repeated causal guesses; no Linux process-tree substitution.

### G8 — Shared-context recipe composition (P2; versioned native evidence and community examples)

**Evidence.** H's lifecycle calls named child workflows; Just Every's nested runner passes numeric budget/cap settings into a newly created context. Our evaluator has no `workflow()` broker method. The canonical 2.1.296 reference records one-level inline workflow() composition sharing scheduler, agent counter, cancellation and budget. These are labeled observations of an official installed version, not solely community invention or a current public API guarantee. [Versioned native observation][L-native-reference]. [H lifecycle][H-sdlc], [J runner][J-runner], [local evaluator][L-evaluator]

**Benefit / dependency.** If catalog reuse warrants it, support bounded composition with shared scheduler, lifetime attempt budget, policy ceiling and ordered journal. Begin with explicit authored composition if that avoids another runtime feature. Depend on immutable transitive script identities, cycle/depth limits and registry rules. This has versioned official-native evidence and community examples; current public/cross-version API equivalence still requires separate verification.

**Acceptance.** A child cannot reset caps, escalate permissions, launch an independent runtime or bypass ownership overlap. Changed child bytes invalidate the relevant replay suffix. Reject cycles and ambiguous identities. Unknown child effects retain the same reconciliation rule.

**Implications.** Time: medium to large. Risk: multiplied caps and unsafe replay. Complexity: high relative to recipe reuse. Best practice: one execution/accounting boundary. Maintainability: transitive identities add cost; prioritize G1–G5 first.

### G9 — Reconcile the acceptance ledger with released evidence (P1 documentation)

**Evidence.** `docs/codex-parity.md` still describes 0.3.1 candidate gates and unpublished corrections, while the frozen 0.3.5 acceptance note names the selected Map + inspector release. Other ledger rows correctly remain open. The setup skill's restricted-worker wording and the authoring skill's parent-mode guidance retain the mismatch recorded in the frozen guidance backlog. [Ledger][L-parity], [setup source][L-setup-skill], [authoring source][L-authoring-skill], frozen `notes/release-0-3-5-acceptance.md` and `backlog/authoring-and-setup-guidance.md`

**Benefit / dependency.** Later update evidence rows by exact version, separating implemented behavior, historical acceptance, current gaps and native-host requirements. Align policy wording and require complete recovery plans. Depends on coordinator-verified receipts; this review cannot supply missing release/native acceptance by prose.

**Acceptance.** Every claimed release gate has an exact version/receipt. Preserve the failed 0.3.4 tag, original unknown writer and failed authoring evaluation. A native list/read success cannot pass missing semantic plan requirements. No “Open” row is closed solely because a later release exists.

**Implications.** Time: small for wording, variable for missing proof. Risk: overstated readiness. Complexity: low. Best practice: versioned acceptance evidence. Maintainability: one current ledger with preserved history.

## Adoption boundaries and remaining coverage

Retain isolated QuickJS rather than copying host `AsyncFunction` evaluation. Retain ordered replay rather than prompt-key result caching. Retain explicit effects reconciliation and positive drain rather than copying automatic retries or catch-all app-server → exec fallback. Retain managed ChatGPT/provider admission rather than assuming an inherited login is subscription-only. No API-key fallback, custom MCP server, global policy edits, automatic merge, or Linux-first replacement is recommended. [Evaluator][L-evaluator], [controller][L-controller], [restart][L-restart], [auth probe][L-probe], [Just Every fallback path, lines 1167–1186][J-fallback]

The four skills span [execution/control][L-main-skill], [decomposition/delivery][L-authoring-skill], [routing][L-mode-skill] and [setup/runtime retention][L-setup-skill]. Their instructions are substantial, but the frozen failed authoring evaluation shows why instruction availability, native invocation, task adherence, tool execution and accepted artifacts must remain separate checks. This review's successful wiki activation cannot certify all worker root/reference pagination, connected apps, browser sessions, rendering/listening, export, or complete modeling toolchains.

No external repository tests were executed. Static source review was bounded to cited files and relevant sections, not exhaustive repository security review. No current Claude/Codex native-host runtime experiment was performed. Shared parent token enforcement, provider-cache hit behavior, cloud session restoration, general mid-run question delivery, stock composer/task-panel insertion, native push, arbitrary detached descendants, and broader OS behavior remain unverified or missing as marked. Existing Windows Session 0 owner choices and retained-data obligations are unchanged.

No wiki canonical/raw write, discover capture, ingest, log or index update occurred. The frozen search's candidate limit, unresolved citation and stale source summaries remain preserved. This file is the sole authored deliverable. Later discover/ingest should use the exact source set below and keep code observations separate from documentation claims.

## Exact source set for later discover/ingest

Repository identities: [Just Every commit][J-commit], [hesreallyhim commit][H-commit], [PabloNAX commit][P-commit], [official changelog commit][C-commit]. Their identities were obtained from `https://api.github.com/repos/{owner}/{repo}/commits/main` after resolving each repository's default branch. These API responses pin this retrieval; they do not pin mutable future default branches.

- Official: [dynamic workflows guide][C-guide]; [pinned changelog][C-log]. Failed page retrieval: `https://code.claude.com/docs/en/changelog`; successful primary source is the pinned GitHub file.
- Just Every: [README][J-readme], [runner][J-runner], [engine][J-engine], [workflow registry][J-registry], [app-server client][J-client], [compatibility layer][J-compat], [process liveness][J-liveness], [UI server][J-ui].
- hesreallyhim: [README][H-readme], [authoring guide][H-authoring], [lifecycle checkpoints][H-sdlc], [criterion QA][H-qa], [skeptic panels][H-bugs], [static diagram entry][H-diagram], [AST contract analysis][H-contract].
- PabloNAX, skill-only: [README][P-readme], [eval contracts][P-eval], [packet contract][P-packets]. The frozen captured skill URL is `https://github.com/PabloNAX/ultracode-skill/blob/bfa2d92488171651c6c9379a8b98f8a07d996d3c/ultracode/SKILL.md`; its original clipping remains historical evidence, not native activation of that skill here.

[C-guide]: https://code.claude.com/docs/en/workflows
[C-commit]: https://github.com/anthropics/claude-code/commit/94506ff0d3bd9185f1752da36e968775021fb48f
[C-log]: https://github.com/anthropics/claude-code/blob/94506ff0d3bd9185f1752da36e968775021fb48f/CHANGELOG.md
[J-commit]: https://github.com/just-every/plugin-ultracode/commit/9dde0086e983413016bf62ab96ba6bb17b599fae
[J-readme]: https://github.com/just-every/plugin-ultracode/blob/9dde0086e983413016bf62ab96ba6bb17b599fae/README.md
[J-runner]: https://github.com/just-every/plugin-ultracode/blob/9dde0086e983413016bf62ab96ba6bb17b599fae/scripts/ultracode-script-runner.js
[J-engine]: https://github.com/just-every/plugin-ultracode/blob/9dde0086e983413016bf62ab96ba6bb17b599fae/scripts/ultracode-engine.js
[J-fallback]: https://github.com/just-every/plugin-ultracode/blob/9dde0086e983413016bf62ab96ba6bb17b599fae/scripts/ultracode-engine.js#L1167-L1186
[J-registry]: https://github.com/just-every/plugin-ultracode/blob/9dde0086e983413016bf62ab96ba6bb17b599fae/scripts/workflow-definitions.js
[J-client]: https://github.com/just-every/plugin-ultracode/blob/9dde0086e983413016bf62ab96ba6bb17b599fae/scripts/app-server-client.js
[J-compat]: https://github.com/just-every/plugin-ultracode/blob/9dde0086e983413016bf62ab96ba6bb17b599fae/scripts/claude-workflow-compat.js
[J-liveness]: https://github.com/just-every/plugin-ultracode/blob/9dde0086e983413016bf62ab96ba6bb17b599fae/scripts/process-liveness.js
[J-ui]: https://github.com/just-every/plugin-ultracode/blob/9dde0086e983413016bf62ab96ba6bb17b599fae/scripts/ultracode-ui-server.js
[H-commit]: https://github.com/hesreallyhim/ultracode-workflows/commit/9b5404d11b885b28380d3eb17471ef7b17601b5e
[H-readme]: https://github.com/hesreallyhim/ultracode-workflows/blob/9b5404d11b885b28380d3eb17471ef7b17601b5e/README.md
[H-authoring]: https://github.com/hesreallyhim/ultracode-workflows/blob/9b5404d11b885b28380d3eb17471ef7b17601b5e/plugins/ultracode-workflows/docs/AUTHORING.md
[H-sdlc]: https://github.com/hesreallyhim/ultracode-workflows/blob/9b5404d11b885b28380d3eb17471ef7b17601b5e/plugins/ultracode-workflows/workflows/sdlc-orchestrator.js
[H-qa]: https://github.com/hesreallyhim/ultracode-workflows/blob/9b5404d11b885b28380d3eb17471ef7b17601b5e/plugins/ultracode-workflows/workflows/acceptance-qa-deep.js
[H-bugs]: https://github.com/hesreallyhim/ultracode-workflows/blob/9b5404d11b885b28380d3eb17471ef7b17601b5e/plugins/ultracode-workflows/workflows/bug-hunt.js
[H-diagram]: https://github.com/hesreallyhim/ultracode-workflows/blob/9b5404d11b885b28380d3eb17471ef7b17601b5e/plugins/ultracode-workflows/scripts/diagram-workflow.mjs
[H-contract]: https://github.com/hesreallyhim/ultracode-workflows/blob/9b5404d11b885b28380d3eb17471ef7b17601b5e/scripts/workflow-contract.mjs
[P-commit]: https://github.com/PabloNAX/ultracode-skill/commit/bfa2d92488171651c6c9379a8b98f8a07d996d3c
[P-readme]: https://github.com/PabloNAX/ultracode-skill/blob/bfa2d92488171651c6c9379a8b98f8a07d996d3c/README.md
[P-eval]: https://github.com/PabloNAX/ultracode-skill/blob/bfa2d92488171651c6c9379a8b98f8a07d996d3c/ultracode/references/eval-contracts.md
[P-packets]: https://github.com/PabloNAX/ultracode-skill/blob/bfa2d92488171651c6c9379a8b98f8a07d996d3c/ultracode/references/packet-schema.md
[L-evaluator]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/evaluator-child.mjs
[L-evaluate]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/evaluate.mjs
[L-controller]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/controller.mjs
[L-worker]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/worker-session.mjs
[L-script]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/script.mjs
[L-registry]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/registry.mjs
[L-runtime]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/bin/managed-runtime.mjs
[L-launch]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/bin/launch-v2.mjs
[L-activity]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/activity.mjs
[L-delivery]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/workflows/decomposition-delivery.js
[L-audit]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/workflows/item-audit.js
[L-research]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/workflows/cross-source-research.js
[L-dry]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/workflows/loop-until-dry.js
[L-workspaces]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/workspaces.mjs
[L-policy]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/policy.mjs
[L-backend]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/backend.mjs
[L-controls]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/controls.mjs
[L-restart]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/restart.mjs
[L-turn]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/foundation/turn.mjs
[L-terminals]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/foundation/terminals.mjs
[L-job]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/foundation/native/JobHost.cs
[L-job-package]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/foundation/windows-job.mjs
[L-probe]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/foundation/probe.mjs
[L-native-launch]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/foundation/launch.mjs
[L-watch]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/watch.mjs
[L-notifications]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/notifications.mjs
[L-monitor]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/engine/monitor/app.mjs
[L-parity]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/docs/codex-parity.md
[L-main-skill]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/skills/agent-workflow/SKILL.md
[L-authoring-skill]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/skills/workflow-authoring/SKILL.md
[L-mode-skill]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/skills/workflow-mode/SKILL.md
[L-setup-skill]: https://github.com/ehartye/agent-workflow/blob/ca0e8b73f4af142a9035e29f709483af94ab28f2/skills/workflow-setup/SKILL.md

[L-native-reference]: ../../../.agents/review-inputs/2026-10-14/reference/claude-2-1-296-workflow-contract.md
