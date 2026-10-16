# Criterion review and captured research

These recipes review a fixed inventory through the separate QuickJS evaluator. They do not discover new sources, integrate artifacts or accept delivery. Every result retains `complete:false` and `completionAuthority:'coordinator'`.

The coordinator freezes literal evidence paths, SHA-256 and byte counts within the authorized read scope, chooses genuine skills and required tools for every role, and budgets every reviewer, independent skeptic and reducer before dispatch. A missing skeptic, changed file or unavailable modality leaves coverage missing. Worker hash statements remain claims until independently checked.

The native authoring reference [criterion and research recipes](../skills/workflow-authoring/references/criterion-and-research.md) contains complete field lists, limits, reporting rules and recovery guidance. It is inside the skill package so an activated worker can read it through that package's native resource identity. This repository document describes usage and the actual source-test evidence.

Use `plugin:criterion-review` for fixed criterion QA. Its exact root is `{version:1,criteria,artifactInventory,roleSelections,limits}`. A minimal argument shape is:

```json
{
  "version": 1,
  "criteria": [{"id":"criterion-a","text":"The retained artifact meets the stated requirement","evidenceRefs":[{"path":"inputs/artifact.txt","sha256":"<actual lowercase SHA-256>","bytes":123}]}],
  "artifactInventory": [{"path":"inputs/artifact.txt","sha256":"<same actual SHA-256>","bytes":123}],
  "roleSelections": {
    "reviewer": {"skills":[],"requireTools":[]},
    "skeptic": {"skills":[],"requireTools":[]},
    "reducer": {"skills":[],"requireTools":[]}
  },
  "limits": {"maxCriteria":32,"maxStarts":3,"maxRounds":1}
}
```

Replace the placeholder hashes/counts with independently frozen actual file identities before validation. Explicit empty role selections are appropriate only when no skill/tool is required. Nonempty arrays must use real admitted bundle IDs. No extra `model`, environment, permission or arbitrary option fields are forwarded.

The criterion start budget is `2*C*R+1`, including every independent skeptic and the final reducer. Thirty-two criteria with two rounds require129 starts and are refused by the128 maximum. Each criterion requires1–4 exact refs from an inventory of at most128 files. Each round retains both raw slots, including null. All slots must independently report the expected path/hash/bytes as verified before `reportedPass` or `reportedFail`. A report's own positive verdict cannot override missing evidence. `coveredIds` measures inspection coverage; it includes reported failures and says nothing about objective acceptance.

Use `plugin:evidence-research` for fixed captured sources and questions:

```json
{
  "version":1,
  "sources":[{"id":"source-a","path":"inputs/source.txt","sha256":"<actual lowercase SHA-256>","bytes":123,"modality":"text"}],
  "questions":[{"id":"question-a","text":"Which claim does this evidence support?"}],
  "roleSelections":{
    "reader":{"skills":[],"requireTools":[]},
    "skeptic":{"skills":[],"requireTools":[]},
    "reducer":{"skills":[],"requireTools":[]}
  },
  "limits":{"maxSources":64,"maxStarts":3,"maxRounds":1,"dryRoundLimit":2}
}
```

The research budget is `2*S*R+R`. Sixty-four sources with two rounds require258 starts and return `startBudget` without dispatch. There are1–64 source descriptors and1–32 questions. Modality is `text`, `image` or `document`; genuinely selected tools must support the operation. A missing image/document tool is inaccessible. Optional `selection:{disposition:'sampled'|'dropped',reason}` records an exclusion before calls; excluded descriptors retain IDs and counts and are never marked read. Optional `range:{start,end}` selects a half-open byte range with whole-file identity checks and partial coverage. No source can be appended by a reader or reducer.

Research reads an explicit pending list, skeptically inspects it and reduces each round. Only a verified partial read with `needsNextRound:true`, matching independent evidence and skeptic disposition `read` or `partial` can continue. This is a bounded planned continuation; failed/null/inaccessible slots are retained without automatic retry. An earlier verified round with no answer can lead to a later supported answer. Every retained slot must remain eligible, and every round claiming that answer must have independent support in that same round. Later null slots and unsupported claims cannot inherit earlier positive coverage. Dry rounds count rounds adding no supported questions. Exhausted inventory can contain failed/inaccessible sources and unresolved questions. Final dispositions are mutually exclusive `read`, `partial`, `inaccessible`, `failed`, `sampled`, `dropped`; `expected === accounted === sum(counts)`. `allSeenIds` records attempted IDs in inventory order. Reducers cannot change coverage, fill nulls or erase dissent. Later contradictory evidence removes earlier positive question coverage; independent contradictions across sources also leave the question missing and explicitly disputed.

Paths are literal, at most200 characters; hashes are lowercase64-hex and bytes safe integers0–512MiB. IDs are bounded unique strings and may include `__proto__`; maps/arrays retain them as data. Unknown root/nested keys, duplicate IDs/selections, invalid bounds and malformed refs reject before dispatch. Reports intentionally bound evidence/dissent/answers; full material belongs in captured files. The guest does not have filesystem access: it checks identities in returned observations, while workers must actually inspect authorized regular files and verify hashes before and after. Neither schema validation nor fixture respondents authenticate a native check receipt.

Prompts also declare a lower serialized UTF-8 report budget:4096 bytes per criterion role,1536 per research role. Oversized metadata becomes a null slot and an explicit `oversizeReports` record, retaining observed byte count and role identity. It is never trimmed into an apparently valid report or automatically retried; original engine worker results remain separate evidence. This leaves headroom for all slots at maximum admitted inventories/rounds and for the final broker envelope.

Choose snapshotted `--args-file` with the current installed CLI; check exact help for older recorded runtimes. Keep complete evidence in frozen files and metadata within the lowest task/schema/native budget. `parallel` receives thunks; scripts execute only in separate QuickJS. Do not import a recipe as a Node ESM module. A Windows document-reading tool may use `pathToFileURL` for authorized ESM imports. In PowerShell use a verified executable plus separate literal arguments, non-login execution and `npm.cmd`; JSON escaping is not shell quoting. Setup has no `--cwd`. The coordinator owns any launch; this implementation worker launched no nested workflow.

New0.4.3 runs retain complete source packages. Match genuine executor catalog/read roots to the admitted retained mapping and preserve original roots as provenance. Each selected role must perform its own native list/read with returned identities and cursors; discovery, activation, tool readiness, actual operation and acceptance are separate facts. A missing package/root blocks that role. Never shell-load SKILL.md as activation, swap a duplicate-name package, hot-grant a root, resurrect old caches or repair saved bindings. External managed homes/services/dependencies remain separate prerequisites.

Keep live controls, observer logs and immutable gate receipts outside captured source. Name an observer and retain processed attachment/cursor/gaps through terminal. Dependencies carry ordering and JSON, not predecessor files. The coordinator verifies full capture/blob/patch integrity, exact producer coordinates, owned drain and original outcomes/effects, then integrates reviewed bytes and obtains fresh checks against a stable combined snapshot. In the approved single-run pipeline, an external reviewed barrier admits fresh verifiers against exact F/V identities and checks. This differs from the bundled two-run decomposition recipe and supplies no guest receipt authority.

Before consuming a report, check whether status returned an object or a truncated preview string and obtain the full public worker result at its recorded identity. Before producer dispatch/freeze, review the exact shared provider types/envelopes, complete source/dependency inventory and declared validation temporaries. The [admission and source-proof procedure](../skills/workflow-authoring/references/worker-admission-and-replay.md#read-recorded-results-and-source-proofs) separates these gates from native activation and explains admitted coordinator proofs when direct Git metadata is unavailable. A missing provider blocks its dependent checks until reviewed integration; it does not authorize reconstructing that provider in a recipe writer.

Recovery preserves original failed/partial/unknown outcomes and independent completed writers. Inspect actual effects and cleanup, verify current admitted sources, then admit only eligible unfinished work. Capture/review/integrate replacements, freeze a new combined identity and obtain fresh independent checks before coordinator acceptance. Positive owned job cleanup is not global external-effect reconciliation. A launched nonzero process was executed and may have changed files; no automatic retry or fallback follows uncertain effects. Missing build prerequisites block their checks while independent source work continues. Report exact command, executable/cache and observed stage. Keep historical unknowns unchanged without treating their mere presence as a permanent block on reconciled recovery.

## Retained attempt-03 local evidence

Environment: assigned0.4.3 worktree, verified Node `C:/Program Files/nodejs/node.exe` v24.18.0, Git2.55.0.windows.3 and npm.cmd identities from attempt-03 preflight. Script SHA-256 `12938acf530342c1090037501e9c19d1013c4fd06a8b887ef821b8263d466fc8` and prerequisite JSON SHA-256 `44536ae22cf28ec16e23e8e5f3ee1bfab12706e402b1d5d26dc9aec24aaefc7c` matched args. Exact preflight argv executed exit0. Authorized `npm.cmd ci --ignore-scripts --offline` executed here, exit0,35 packages; no online fallback, package/lock edit or global setup. This says nothing about other workers' readiness.

The first useful artifact was this document, followed by tests before recipe code. Exact affected command was `[node.exe,"--test","test/engine-recipes.test.mjs"]`. Initial RED executed exit1:16 passed/9 failed, including the meaningful assertion `Missing criterion-review recipe`; the other new cases encountered `WORKFLOW_MISSING`. Existing recipe tests passed. After implementation the new QuickJS cases passed. A further RED test exposed sticky earlier question coverage: the later contradiction incorrectly yielded `missingQuestionIds:[]` instead of `["question"]`; it executed exit1, then passed after support was recomputed from every retained round.

Controlled evidence respondents read/hash real unique temporary files; missing/changed bytes are preserved as unverified. Dispatch passes through the actual separate QuickJS evaluator, and real schema compilation validates responses. Capability rejection uses the real `selectCapabilities` seam with no admitted bundle. Fixture model responses are an explicit substitute for native dispatch, not fabricated native operation. Negative controls execute altered guest source only in the separate evaluator: removing skeptic gating produces a false pass rejected by the owning assertion, and replacing accounted arithmetic with zero is rejected by the coverage assertion. Product files are not mutated for these controls.

Further focused REDs caught cross-source support hiding a verified contradiction and oversized UTF-8 metadata retaining a report instead of a null slot. Each executed exit1 before its fix; the final affected command covers both. The existing package check also caught noncanonical metadata names (`Criterion review` versus `criterion-review`); names now match filenames. All failures are retained as executed checks, not `notStarted` admissions.

| Check | Actual result |
| --- | --- |
| `["C:/Program Files/nodejs/node.exe","--test","test/engine-recipes.test.mjs"]` | Final GREEN exit0:33 passed,0 failed/skipped/cancelled;16555.9475ms. Includes original tests, separate QuickJS processes, real fixture hashes, actual capability selection rejection and both negative controls. |
| `["C:/Program Files/nodejs/npm.cmd","run","check"]` | RED exit1 on metadata name; final GREEN exit0: manifests, CLI entrypoints, skills, pinned dependencies and9 recipes verified. |
| Native role skills | Genuine catalog discovery and original main reads succeeded for authoring, yoda, test-strategy and tdd at the exact admitted retained roots. All three required authoring references were genuinely read through that package. No catalog `enabled` Boolean is exposed, and no complete body-adherence claim follows. |

Native activation mapping uses the common execution prefix `C:/Users/ehart/AppData/Local/agent-workflow/runs-v2/b978ff0f-91bb-4cf7-8c4c-72a0b8e48e13/source-packages-v1/packages/`:

| Selected ID / native name | Verified returned root suffix |
| --- | --- |
| authoring / workflow-authoring | `a8758a93bc0336e375755be6af7b7b3de76da8c9868c6e168b0c68122c63bd3e/skills/workflow-authoring` |
| yoda / yoda | `2be52948d661a65e0eec8837f4de49934e4cf62ee1c97cf2a0539b568beb8d3d/skills/yoda` |
| test-strategy / test-strategy | `4cc697b3411bf70b4f2658e9219a54f919f2b3292dea38e977ea08ad6c1359de/skills/test-strategy` |
| tdd / test-driven-development | `c1aa80898169b589a8c1c575c308bf417e1d5e488567771540d03c2cbfd086f7/skills/test-driven-development` |

Complete source/capture acceptance, combined full test/check/smoke, root-owned clean package recipe inventory, authentic provider/check receipts and native/tool operation acceptance remain coordinator-owned. The old acceptance producer remains failed/partial despite available bytes; no provider implementation was copied into this track. No new paired skill-efficacy or automatic-trigger result is claimed. Canonical wiki synchronization is a root-owned external operation. No smoke runtime, managed-runtime setup, signing, remote call or publication was launched by this worker.

## Initial attempt-04 correction evidence

This section retains the earlier `known-fix-recipes` producer's report (run `bc53e3e5-d39f-4b1d-a8fa-fd36584ce0bb`, generation1, position2, attempt1). Its RED/GREEN and reference-read claims describe that producer, not the later documentation correction below.

This correction starts from canonical0.4.5, commit `a76aa77ea7790927247388e907015e92e9397f6f`, in the newly assigned writer worktree. The complete approved specification, nested-contract, continuation, recovery-plan, prior-review and source-seed files were read and hash/byte checked at their admitted paths. Source-seeds SHA-256 is `9dc24ca4dd487cffb0c6a6fd895175f3e681304557a083528be2a7d96bbaaabc` (145552 bytes). All12 owned paths have exact original capture/candidate identities and either absent or unchanged canonical bases; no manual-three-way path belongs to this track. Base Git blob and input-tree identities, current bytes, original raw patch/manifest and candidate hash/size/mode/blob entries were checked. No private payload was copied. The original recipes producer remains engine-completed/declared-partial; copying its source is not acceptance.

The admitted893-byte preflight `attempt-04/preflight.mjs`, SHA-256 `12938acf530342c1090037501e9c19d1013c4fd06a8b887ef821b8263d466fc8`, executed with the literal verified Node path and exited0. It observed Node24.18.0 and the admitted Git/npm executable identities. Offline preparation used `["C:/Program Files/nodejs/node.exe","C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js","ci","--ignore-scripts","--offline"]` only in this writer workspace: exit0,35 packages. Package/lock and other tracks remain unchanged.

The restored affected suite first passed33 tests (70449.3716ms). Before behavior changes, three new real-QuickJS regressions reproduced review15's defects: a verified answer discovered in round2 stayed missing, and failed/inaccessible skeptics with matching identity evidence each dispatched6 calls rather than3. Exact focused command `[node.exe,"--test","--test-name-pattern","research covers an answer first|research does not continue after","test/engine-recipes.test.mjs"]` executed exit1,0 passed/3 failed. The corrected recipe then passed all12 research-focused cases.

Extending the existing later-skeptic invariant to contradicted/unverified/null outcomes exposed an additional boundary in the first correction: unverified later support inherited an earlier answer. Its focused command executed exit1,2 passed/1 failed. Requiring support in every round that actually claims the answer fixed that case while allowing earlier answer-free rounds. The final research-focused command executed exit0,14 passed/0 failed. Every source report and dissent remains retained; all results still require coordinator acceptance.

Native executor discovery took10 pages and initial main reads activated exactly `authoring`, `yoda`, `test-strategy`, `tdd`. The returned execution prefix is `C:/Users/ehart/AppData/Local/agent-workflow/runs-v2/bc53e3e5-d39f-4b1d-a8fa-fd36584ce0bb/source-packages-v1/packages/`; authoring uses `1c70e00f56675094a146c6b43e36db2f72a2e70e7fed76879ce004eccb7b827a/skills/workflow-authoring`, and the other three suffixes match the retained table above. Three authoring references were read through that same native package. These observations establish invocation and matching roots, not complete instruction adherence, paired skill efficacy or native recipe/tool operation.

The final full affected command `[node.exe,"--test","test/engine-recipes.test.mjs"]` executed exit0:38 passed,0 failed/skipped/cancelled (91966.9035ms), including existing null/contradiction, capability, budget and mutation controls. `[node.exe,npm-cli.js,"run","check"]` executed exit0 on0.4.5: manifests, entrypoints, skills, pinned dependencies and9 recipes verified. This is local writer evidence; root-owned scoped clean-install RED/GREEN, combined full test/check/smoke, provider/native qualification, painted browser checks and independent acceptance remain missing here. Root must integrate and review these bytes before provisional F0/V0 verification, then preserve those identities when producing separately frozen final F/V and authentic final checks in the original data instance. This writer performs no integration, runtime selection, historical-record mutation or wiki update.

## Reviewed R4 documentation correction

The new writer verified the actual run/generation/nonce and recipes eligibility against `source-corrections.json`, then checked75 relevant source/checkpoint descriptors and all12 canonical preimages/absences before copying. The exact per-path upstream/base/candidate and reviewed producer mapping remains in `attempt-04/correction-source-recipes-r4.json`, SHA-256 `fb13529db20f9068c3cffeaec248d397b7f0f7ed26aacda4d355a6a7b5b33972`,42488 bytes. All paths were ordinary single-link inputs and copy-eligible; no manual-three-way path was overwritten. Copying establishes byte provenance, not semantic acceptance.

All four selected skills were activated again through genuine executor catalog pagination and initial main reads at the admitted retained roots. The verified preflight and single authorized offline npm preparation executed exit0 in the assigned writer. The preserved recipes/test file passed the full affected command with38 tests, zero failures/skips/cancellations (16859.7344ms). No recipe behavior changed in this correction; the earlier meaningful REDs remain earlier evidence. The remaining work is documentation, reviewed with yoda's trigger/tier/link criteria and the existing package checks, without implementation-mirroring tests or another model workflow.

This inspection cannot establish paired skill efficacy, automatic triggering or general safety. Independent capture/drain/semantic review, integrated provider/native/browser checks, full tests/check/smoke, clean install, provisional F0/V0 and distinct final F/V checks remain coordinator-owned. Exact current check outcomes and command-start limitations are retained in [pipeline friction](pipeline-friction.md#r4-documentation-correction-command-evidence).
