# Skills audit — 2026-10-14

The primary static failure modes are contradictory parent/restricted guidance, cross-package reading instructions that do not consistently explain native package boundaries, and a recipe described as having stricter input validation than its source implements. These are source/document findings, not observed model failures. **Effectiveness remains provisional pending the workflow's two simultaneous with/without-skill scenario pairs and independent grading.** This audit launches no scenarios, supplies no self-score, and makes no coordinator acceptance claim.

## Scope and provenance

- Baseline: `ca0e8b73f4af142a9035e29f709483af94ab28f2` (published 0.3.5). A read-only `git --no-optional-locks diff --no-ext-diff --name-status BASE -- <explicit audited paths>` exited 0 with no differences for AGENTS, risk map, the four skills, seven packaged references, hook, six directly linked docs, recipe and README listed below. This establishes those working-file contents against the supplied baseline, not installed-runtime identity.
- Read `AGENTS.md`, `.testing/risk.yml`, and `.agents/review-inputs/2026-10-14/manifest.json`. Production and retained workflow/API/runtime/data consumers remain declared obligations. Windows is the verified deployment platform; Linux/macOS are not substituted as the acceptance target.
- All seven snapshot SHA-256 values match the manifest. Consulted the supplied overview, release-0-3-5 acceptance, authoring/setup backlog, and bounded architecture/roadmap matches. The latter search was truncated; omitted snapshot history is unexamined. No original vault, recycled vault content, web links, private `.local` evidence, dependency trees or Git internals were searched.
- The supplied release note (`.agents/review-inputs/2026-10-14/notes/release-0-3-5-acceptance.md:14–26`) records publication/installation and preserves the original unknown writer and failed 0.3.4 tag. Those are supplied historical records, not freshly authenticated acceptance in this audit. The authoring/setup backlog records failed semantic planning acceptance; invocation proof does not repair it.
- Source read set: `skills/{agent-workflow,workflow-authoring,workflow-mode,workflow-setup}/SKILL.md`; the seven references inventoried below; `hooks/prompt-submit.mjs`; `docs/{api,worker-capabilities,session-delivery,verification,friction-delivery}.md`; `docs/superpowers/specs/2026-10-14-parent-worker-access.md`; the directly linked `workflows/decomposition-delivery.js`; and public CLI sections of `README.md`. Links from these documents were not recursively followed.
- Repository skill files were inspected as audit subjects, not activated as worker roles. No skill was rewritten. Only this report is authored. Wiki discover/ingest and roadmap writes are outside the explicit single-file authorization; findings can be handed back for authorized wiki maintenance.

### Genuine native role activation

| Stage | Observed evidence |
| --- | --- |
| Discovery | Genuine `skills.list({authority:{kind:"executor"}})`, followed through all ten native pages; warnings arrays empty. |
| Pagination | Returned cursor chain `2d6a4517b659c5c9:{20,40,60,80,100,120,140,160,180}:48000`, then `next_cursor:null`. Each actual returned cursor was used sequentially. |
| Identity selection | Selected authority ID **`yoda`**, not same-name authority `parent-2be52948d661a65e0eec8837f4de4993`. Catalog name `hartye-skills:yoda`; native body frontmatter `name: yoda`. |
| Main read | Genuine `skills.read` with returned package `skill://yoda/C:/Users/ehart/.codex/plugins/cache/hartye-plugins/hartye-skills/0.4.0/skills/yoda` and its returned `main_resource`, that exact package followed by `/SKILL.md`. Read completed with `next_cursor:null`. |
| Root verification | Returned `skill_root` exactly `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\hartye-skills\0.4.0\skills\yoda`, matching the selected identity. No shell substitute, copied activation body, guessed alias or invented resource was used. |
| Coverage | Native list/read were available and invoked for the sole selected role. Its optional evidence reference was not needed/read; no additional role activation is claimed. Catalog availability of the four workflow skills does not mean they were invoked. |

## Findings, ordered by failure mode

### F1 — Medium: restricted-only instructions can misstate the selected parent policy

**Verified contradiction.** `skills/workflow-setup/SKILL.md:28` requires readiness in “the actual restricted worker” without qualifying that rule to restricted runs. `skills/agent-workflow/references/runtime-api.md:25` says CLI `--writable` permits isolated Windows MXC writers without describing the parent branch. The linked API also describes required readiness as read-only/no-network in `docs/api.md:110`. In contrast, `skills/agent-workflow/SKILL.md:16`, `skills/workflow-authoring/SKILL.md:16–18`, `skills/agent-workflow/references/worker-prerequisites.md:3–5`, and `docs/api.md:37–39` distinguish unrestricted parent execution from explicitly restricted execution. The directly linked access contract maps parent readiness to `dangerFullAccess` and requires consistent policy across readiness/task execution (`docs/superpowers/specs/2026-10-14-parent-worker-access.md:47–54`).

**User-visible hypothesis.** An author could narrow a parent task unnecessarily, misdescribe worktrees as a filesystem security boundary, or treat a restricted doctor result as proof of a different worker policy. No such failure was induced here. Doctor's documented restricted default is intentional, and explicitly narrowed recipe workers are intentional; neither should be removed by generic advice.

**Recommended correction:** qualify restricted-only statements, teach readiness under the actual admitted policy, and keep the independent tool/artifact gates. Preserve original parent authority, restricted opt-in, managed authentication and retained-run semantics. Exact selected skill roots not broadly activating MCP/apps is a valid separate boundary (`skills/workflow-setup/SKILL.md:24`); it does not contradict automatic parent catalog provisioning.

### F2 — Medium: filesystem-valid links are not uniformly actionable native reads

**Verified instruction gap.** The main skill directs a read of sibling `../workflow-authoring/SKILL.md` (`skills/agent-workflow/SKILL.md:8`). Authoring in turn points to the main skill and its runtime reference (`skills/workflow-authoring/SKILL.md:10`). These targets exist, but they are outside the individual selected skill package. The documented native contract allows verified ordinary **document** reads after activation and explicitly forbids substituting manual reads of another skill body (`docs/api.md:95`; `skills/workflow-authoring/references/worker-admission-and-replay.md:27`). Authoring correctly foregrounds a same-package admission reference at line 6, but the main skill does not explain the separate activation required by its sibling-skill link. Mode likewise links to a sibling package's Session 0 document (`skills/workflow-mode/SKILL.md:23`).

**User-visible hypothesis.** A worker may try an invented native URI, skip inaccessible guidance, or manually load the sibling skill as if that were activation. Whether a particular original parent plugin-root package exposes these paths depends on the actual catalog package; a successful filesystem link check cannot prove native resource reachability. The linked friction ledger already preserves an earlier native linked-reference problem (`docs/friction-delivery.md:25–27`); that is historical evidence, not a fresh reproduction.

**Recommended correction:** explicitly activate the sibling skill through genuine catalog/list/read using its original identity. For ordinary documents outside the returned package, require the declared original path/hash and authorized bounded read, or report missing coverage. Never relocate/copy skills or widen roots as recovery. Put essential next-step directions in the activating body or its immediate same-package reference.

### F3 — Low: “strict argument schema” overstates recipe input rejection

**Verified source behavior.** `skills/workflow-authoring/references/delivery-contract.md:5,89` calls the argument schema strict; `skills/workflow-authoring/SKILL.md:34,54` warns against adding fields. The recipe validates known input values using predicates (`workflows/decomposition-delivery.js:9–100`) but has no input-object unknown-key rejection. Its `additionalProperties:false` builder applies to worker **result** schemas (`workflows/decomposition-delivery.js:107–125`). The scout/writer/verifier option objects do not forward task `skills` or `requireTools` (`:149–151`, `:170–172`, `:196–198`). Extra task fields can remain in serialized task context while supplying no corresponding enforced agent selection.

**Implication, not an executed failure:** an author expecting unsupported selection fields to fail closed could get an accepted plan with those fields ineffective as runtime selections. The docs already warn that these fields are not forwarded; the mismatch is the claimed rejection contract, not evidence that the recipe promises capability forwarding or accepts objectives. Its `complete:false` and coordinator boundary remain explicit (`:218–227`).

**Recommended correction:** describe input validation and unsupported-field handling precisely. Capability-dependent work should use supported custom `agent` calls as the current docs instruct. If strict rejection becomes an intended runtime obligation, reproduce it in the existing recipe invariant tests before changing code; this audit authorizes neither implementation nor tests.

### F4 — Low: the compact CLI table is incomplete as an exact flag authority

**Verified documentation omission.** Authoring requires checking every flag against help/API (`skills/workflow-authoring/SKILL.md:20`). Yet `docs/api.md:24` lists only session/generation/script for resume, while the main skill, runtime reference and README explicitly support resume deadline flags (`skills/agent-workflow/SKILL.md:32`; `skills/agent-workflow/references/runtime-api.md:7`; `README.md:52`). The doctor row lists only cwd/backend (`docs/api.md:12`), while parent doctor context/session requirements occur at `:37`, and Session 0 flags at `:162–164`.

**Recommended correction:** make the per-command table complete or explicitly link its exceptions. Do not label the documented timeout or parent-doctor options unsupported because a synopsis omits them. Parser/help execution is unverified in this audit; the flag inventory below is the union of the inspected public contract, not a fresh parser test.

### F5 — Low: directly linked current guidance contains stale release-state headings

**Verified freshness mismatch.** `skills/workflow-authoring/SKILL.md:16` and the main skill at line 16 send readers to an access specification whose opening status says integration remains separate work and denies a published default change (`docs/superpowers/specs/2026-10-14-parent-worker-access.md:3`). Its later as-built paragraph records local implementation but calls it unpublished (`:72`). `docs/verification.md:3` still requires fresh 0.3.5 release gates. The supplied baseline and hash-verified release note identify published/installed 0.3.5 (`.agents/review-inputs/2026-10-14/notes/release-0-3-5-acceptance.md:14–18`).

**Recommended correction:** distinguish historical design/checkpoint status from the current public command contract with a dated pointer. Preserve failures and chronology; do not repeat completed publication/installation work to resolve stale prose. This is not independently verified release acceptance, nor a finding that the retained behavior changed.

## Well-formedness and tier placement

The four files each have a delimited frontmatter block with only `name` and `description`. Names are lowercase, hyphenated, and match their directory. Descriptions state capability and triggering conditions rather than an executable procedure. No missing description, duplicate local skill name, retired local target, `when_to_use`, `allowed-tools`, model override or fork-specific metadata was found. These are structural observations, not a native validator pass or proof of portable execution.

Measured using raw UTF-8 bytes and .NET regex/string counts. Metadata excludes delimiter lines; body begins immediately after the closing delimiter newline and includes its leading blank line. Lines count newline-terminated lines; words are `\S+` matches. Character counts are UTF-16 code units (all these metadata fields are ASCII). No model-token counts or current host metadata-budget measurement is claimed.

| Skill | Description chars | Metadata chars / bytes | Body chars / bytes | Body words / lines | Whole file bytes / lines |
| --- | ---: | ---: | ---: | ---: | ---: |
| agent-workflow | 251 | 285 / 285 | 8,180 / 8,188 | 1,031 / 30 | 8,482 / 34 |
| workflow-authoring | 244 | 282 / 282 | 16,895 / 16,899 | 2,183 / 76 | 17,190 / 80 |
| workflow-mode | 174 | 207 / 207 | 2,079 / 2,079 | 249 / 21 | 2,295 / 25 |
| workflow-setup | 176 | 210 / 210 | 7,265 / 7,265 | 862 / 36 | 7,484 / 40 |

| Direct packaged resource | Lines | Placement assessment |
| --- | ---: | --- |
| `skills/agent-workflow/references/runtime-api.md` | 74 | API/limits in tier 3; parent-policy qualifier needs F1 correction. |
| `skills/agent-workflow/references/controls.md` | 37 | Control flags and reconciliation belong in tier 3; body requires it before controls. |
| `skills/agent-workflow/references/worker-prerequisites.md` | 44 | Toolchain/transport details fit tier 3; also carries highly specific phone-game guidance at :44. |
| `skills/workflow-authoring/references/worker-admission-and-replay.md` | 45 | Critical admission/recovery is directly required at the top of the body. |
| `skills/workflow-authoring/references/delivery-contract.md` | 217 | Schemas/examples belong in tier 3; clarify F3 rather than move them into metadata. |
| `skills/workflow-setup/references/upgrades.md` | 23 | Upgrade-only variant loaded before repair/update. |
| `skills/workflow-setup/references/session0-compatibility.md` | 26 | Mutually conditional Windows variant correctly separate and explicitly selected. |

Tooling checked **44 local Markdown link occurrences** across the four skills, seven packaged references and hook: no missing target file. All **12 fragment links** in the packaged Markdown match target headings under the applied slug normalization. This does not validate every bare path, remote URL, historical receipt, native callback or transitive link.

Tier 1 is compact. Tier 2 foregrounds launch identity, activation and recovery, with exhaustive tables in tier 3. Authoring is the densest body despite only 80 physical lines: long paragraphs encode many simultaneous constraints. Moving rare full-modeling, phone-game and installed-release case detail to narrowly named resources could reduce attention competition; whether that improves compliance is **untested**. Core permission, evidence and no-uncertain-retry rules should remain prominent. A short line count alone is not an effectiveness result. The two cross-skill body links form an intentional authoring/execution relationship but need F2's native navigation rule, not recursive manual skill loading.

### Per-skill assessment

| Skill | Static positives | Findings and provisional effectiveness concern |
| --- | --- | --- |
| `skills/agent-workflow/SKILL.md` | :3 excludes ordinary questions/direct edits; :6 fronts CLI/API/controls; :17–26 separates admission, actual attachment, cursors and completion. | F1 in runtime reference; F2 at :8; F4/F5 in linked authorities. :3 “Create” overlaps authoring's trigger; execution and decomposition should compose deliberately, not arbitrarily compete. No observed trigger failure. |
| `skills/workflow-authoring/SKILL.md` | :6–8 fronts admission and both recovery cases; :30 requires per-role activation; :60–78 preserves predecessor-byte, capture, fresh verification and repeated-suffix boundaries. | F2 at :10 and other cross-package references; F3 in recipe contract; F4/F5 via linked API/spec. Heavy constraint tracking may dilute attention; no measured effect here. |
| `skills/workflow-mode/SKILL.md` | :3 requires explicit persistent routing intent; :6 distinguishes a single run; :8–19 scopes real identity/data; :23–25 separates Session 0 and permissions. | No additional verified defect in the body. F2 applies to sibling Session 0 documentation. Actual hook routing/filter behavior is only partially inspectable in the assigned source set. |
| `skills/workflow-setup/SKILL.md` | :6–20 separates installation, verified executables, quoting, managed data and upgrades; :30–40 preserves updater uncertainty, doctor/no-inference, auth and cleanup evidence. | F1 at :28; F2 at external reference links; F4 in doctor table; F5 in acceptance pointers. “Repair or check” can overlap inspection; explicit command intent must determine whether any installation is authorized. |

## Security and portability checks

A first tooling pass scanned Unicode codepoints/categories and positional substitutions in the four skills, seven packaged references and hook (12 files). A second strict UTF-8 regex pass covered those plus all six linked docs, the recipe and README (20 files). It checked format/control characters except normal tab/CR/LF, non-ASCII separators, bidi/zero-width characters, Unicode Tags/supplementary variation selectors, BMP variation selectors, several invisible fillers and `$0`–`$9`/`$ARGUMENTS` forms. **No hits**; strict UTF-8 decoding succeeded. No malicious invisible payload or positional substitution hazard was detected by these checks. This is not a comprehensive security certification, provenance signature or future-cache integrity guarantee.

Source digests for the four audited files:

| Skill | SHA-256 |
| --- | --- |
| agent-workflow | `1b94938b86b4daa7f43035216df3d91bdc2891483ec9ac112c4503507a9a2ac4` |
| workflow-authoring | `916d816d46489a8d156720cdbf4ac727aa6bc7510a840663fb0016ce5593ba53` |
| workflow-mode | `aa6e81202549c7a5f6c37990ce21b2ef04f7b5d318c915827b24d9779bd3c16c` |
| workflow-setup | `09a49531584f00c76302fc9d261e53783919afd4cbd96c0fdb08c4eb5dafdde0` |

Shell examples quote plugin/project paths in the main/setup/mode skills; setup :16–18 explicitly separates argv from JSON escaping, requires the PowerShell call operator for quoted executables, verified `npm.cmd`, and profile-disabled execution. Admission reference :16 is explicitly schematic, not an execution-ready command (:19). The legacy positional-substitution scan is a portability check, not evidence that native Codex performs Claude-specific substitution. No shipped example imports a Windows drive path as an ESM module; the supplied backlog's file-URL guidance remains follow-up wording, not a reproduced defect in these examples.

Security-relevant boundaries are explicit: no API-key billing fallback/custom MCP; no host evaluation of workflow scripts; selected skills grant no new permissions; parent worktrees organize edits without enforcing filesystem isolation; shared Session 0 is explicitly authorized and not interactive-desktop equivalence; authenticated dashboard tokens stay out of shared reports; unknown mutations do not authorize fallback/retry. None of these boundaries was penetration-tested here.

`hooks/prompt-submit.mjs:1–3` imports `promptContext`, reads stdin with a 1 MiB byte threshold, emits `UserPromptSubmit.additionalContext` only for a truthy context, and reports caught errors with exit 1. The size-limit branch exits 0 without context. The hook itself contains no mode, role or small-task filter: those decisions are delegated. The assigned read set does not include the imported `engine/mode.mjs`; therefore “workers/tool messages excluded,” mode precedence and prompt classification are **not independently verified implementation behavior** in this audit. They remain documented contracts (`skills/workflow-mode/SKILL.md:21`; `README.md:102`). No host hook trust or actual hook invocation is claimed.

## Exact public command contract cross-check

These forms were inspected, never executed. All use the real packaged `node "<plugin-root>/bin/launch.mjs"` entrypoint; there is no guessed global alias. Keep `--data-dir` identical throughout; otherwise use `AGENT_WORKFLOW_DATA_DIR`, then the documented platform default. `PLUGIN_DATA` is not an implicit override.

| Task | Documented flags used or needed by these skills |
| --- | --- |
| Setup / doctor | `setup [--data-dir]`; doctor `--cwd`, `--backend`, optional explicit `--session0-desktop inherit\|shared`. Parent doctor additionally needs originating session and parent snapshot per `docs/api.md:37`. Setup is not documented to accept `--cwd`. |
| Definitions | `workflows/read --cwd`; `validate FILE` or `--script FILE`; `save NAME --script FILE --cwd PROJECT [--command] [--overwrite]`. |
| New run | Name or `--script`; `--cwd`, `--session`, `--args`, `--concurrency`, `--model`, `--effort`, `--max-attempts`, `--access parent\|restricted`, `--parent-access`, `--writable`, `--foreground`, `--backend`, `--worker-timeout-ms`, `--run-timeout-ms`, `--capture-policy`, `--worker-capabilities`; authorized Session 0 option separately documented. `--max-agents` is explicitly unsupported by authoring :20. |
| Watch | Exact returned `watch.argv`; `--session`, `--generation`, `--jsonl`, optional `--after`, `--poll-ms`, `--idle-ms`, same data instance. Poll 100–10,000 ms (500 default); idle 1,000–86,400,000 ms (60,000 default). |
| Inspection | `list/status/result`; `worker --position --generation`; `events` additionally `--after --limit`; `patch --basis inputs\|base`; retained worker/events/patch evidence can use `--source-generation`; exclusions include `--stage inputs\|outputs`. |
| Controls | `pause/stop --session --generation`; `resume --session [--generation] [--script]` with documented deadline overrides; `steer` adds position/attempt/turn/text; cancel adds position/attempt and active turn; restart adds position/attempt/`--reconcile`; receipt read uses `control --receipt`. Read exact observed state first. |
| Dashboard / mode | `dashboard ID --session [--current-ui]`; `mode on/off/status --scope session --session ID` or project scope with actual `--cwd`. Mode never grants launch/install/control authority. |

The body and control reference agree on zero-based positions, real originating session, immutable saved identities and status-read versus execution success. Preserve the installed runtime's version of these contracts. Current-ui presentation is not execution migration; older unsupported watch surfaces remain missing, with explicit status/result inspection rather than silent migration.

## Live observation and recovery

The static instructions are consistent across `skills/agent-workflow/SKILL.md:17–26`, authoring :56, admission reference :45 and `docs/api.md:49–55`:

1. A detached receipt with `attached:false` is not observation. Name an owner, consume a JSONL `attached` record, and remain attached through the durable run-terminal event. The coordinator itself observes if no collaboration observer is available; this audit starts neither.
2. Retain the last actually processed durable sequence. Reconcile saved state after disconnect, reconnect with that cursor and the same generation/session/data directory, and attach anew for a new generation. Never advance from unprocessed output.
3. Idle warnings measure completed command/file-change progress; commentary is not progress. Warnings, EPIPE, observer exit and a closed browser tab grant no cancellation/retry authority. Exit 0 alone may mean the output consumer disconnected (`docs/api.md:55`), so it is not terminal evidence.
4. Package disappearance: preserve activation/source failures and effects, stop dependent work, inspect cleanup, and admit a fresh current bundle/run only after reconciliation (`worker-admission-and-replay.md:31–35`). Changed parent catalog blocks resume/restart before generation mutation or dispatch (:37–39). Never edit retained context/bindings or substitute a package to pass a guard.
5. Restart repeats the chosen worker and the entire later suffix, including completed writers (`controls.md:31`; authoring :78). Verify effects and owned/native drain for that suffix. New task IDs, a positive drain alone or claimed reconciliation cannot waive uncertain effects.
6. Dependency JSON does not transfer files. Review capture identities, ownership, hashes and drain, integrate reviewed paths, then verify a new stable combined snapshot. Missing/null slots and unknown outcomes remain missing. Dashboard Close ends its instance; Stop controls execution.

These are documented/source-aligned instructions. Native watcher reconnection, package-loss guards, catalog drift, terminal cleanup and host-chat relay were not exercised here.

## Effectiveness: bounded routing expectations, not graded results

Main “create” and authoring “author/revise a multi-worker workflow” overlap intentionally. Expected composition is authoring for decomposition/handoffs plus main for execution; setup is conditional on readiness/install need, and mode requires separate persistent-routing intent. No paired output here establishes whether the agent actually selects that composition or follows every instruction.

| Prompt | Expected routing and boundary |
| --- | --- |
| “Save a reusable workflow that audits these eight files.” | Main; authoring if multi-worker decomposition is chosen. Verify script/CLI; no persistent mode merely from saving. |
| “Run my saved project audit once.” | Main execution path; no mode change. Respect existing session/runtime and launch authorization. |
| “What does ordered replay mean?” | Direct explanation; no workflow dispatch, setup or mode mutation merely for a question. |
| “Plan scouts, two disjoint writers and fresh combined verification.” | Authoring plus main as needed; explicit role skills/tools and capture handoff. A planning request alone need not launch. |
| “Worker package disappeared; can we copy it and resume?” | Authoring recovery/main controls; preserve failed slot, no copied activation or resume bypass. |
| “Fix this typo in one doc.” | Direct edit in assigned scope; no multi-worker workflow. |
| “Turn ultracode mode on for this session.” | Mode, real session scope; no extra execution/install permissions. |
| “Is workflow mode enabled for this project?” | Mode inspection for actual cwd; no on/off mutation. |
| “Use ultracode-style reasoning on this answer.” | No persistent mode based solely on stylistic wording; resolve materially ambiguous routing intent before changing it. |
| “The managed runtime is missing; set it up.” | Setup under existing installation authorization; preserve retained runtimes/data; inspect JSON readiness. |
| “Check installation without model usage.” | Setup/doctor inspection path; no model workflow; no installation unless authorized/needed separately. |
| “An old writer is unknown; reinstall so it can rerun.” | Main recovery and upgrade guidance; setup success cannot reconcile old effects or authorize repetition. |

For both independent scenario pairs, retain prompt, input/source identity, activated package/root, selected skill IDs and missing native stages, each unmodified output, and independent rubric/grader result. Grade task completion, exact flags, both recovery cases, retained failures, reviewed integration/fresh verification, routing and permission boundaries from observable outputs. Mere discovery, native activation counts or a worker's `missing:[]` is insufficient. This report has no access to those outputs and assigns no effectiveness score or winner.

## Recommended follow-up and missing coverage

Recommend a focused documentation correction for F1–F5 after this audit, with source-backed wording and the independently graded scenario evidence. **Time:** focused edits and affected checks, without repeating release work. **Risk:** low edit risk, but overgeneralizing restrictions or inheritance can mislead production consumers. **Complexity:** clarify existing contracts without adding surfaces. **Best practice:** one current command/policy authority, genuine native activation and preserved uncertainty. **Maintainability:** fewer contradictory instructions across bodies/references; retain historical evidence with dated labels. No alternative architecture, new MCP service, legacy-data migration or skill rewrite is proposed or performed.

Completed checks: baseline path comparison; seven snapshot hashes; frontmatter/name/size counts; 44 file-link and 12 anchor checks; two Unicode/substitution scans; static recipe and hook inspection; public contract cross-check. Commands used non-login PowerShell and bounded displayed output. No command failed to start, no installation prerequisite was attempted, and no uncertain command was retried. Earlier oversized read results were truncated; relevant source gaps were subsequently read in smaller sections, while omitted architecture/roadmap search history remains unexamined.

Missing evidence remains explicit: native parser/help execution for all flag combinations; imported hook classification/mode implementation and host hook trust; native reference reachability/pagination for the four audited workflow packages; runtime watch/recovery/cleanup checks; associated CLI/render/export/listening operations; current installed-package identity; comprehensive security testing; and independently graded effectiveness outputs. No builds, tests, applications, services, browsers, live workflow controls, installs, commits, pushes or publication were run. This static report is not a release gate result or coordinator acceptance.
