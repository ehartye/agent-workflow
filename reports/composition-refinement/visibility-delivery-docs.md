# Candidate documentation and skill delivery

Completed the assigned documentation, skill pointers and public packaging gate against the exact coordinator-reviewed prerequisite overlay. This is delivery of the assigned source changes, not acceptance of the entire candidate, a new release, or native qualification.

## Inputs and scope

- Task: `visibility-delivery-docs-task.json`, 7,290 bytes, SHA-256 `e7a5c119b1d091dda42ad591b28eb5612655a373c74370ac3249a20c576567e5`.
- Overlay: 290,910 bytes, SHA-256 `e7d9be1f6412790de21a92570e34b7275104eb208a5977c52206940f1a56ebc0`. The exact helper verified 651 files and applied 317 reviewed postimages before authoring. [Receipt](baseline-overlay-receipt.json) records baseline content hash `a2c840f878ebf3539525540b47f6c394b18ac6782e01efadfcd20fe17403a96f`.
- Verified the specified Node, overlay helper, test helper, dependency seed and Git-readiness file sizes/hashes. Used only `C:/Program Files/nodejs/node.exe` and the coordinator's exact test helper; no install or alternate toolchain.
- Read local AGENTS.md and `.testing/risk.yml`: production, existing packaging invariant owner, merge lane. No wiki/network/external writes, workflow launches, delegation, commit, publication, policy changes or project Git metadata changes.

## Genuine native skills

Used actual executor `skills.list` with native cursor pagination, then `skills.read` with each catalog-returned package and main_resource. Resolved the parent catalog entries by admitted root rather than inventing aliases. All four returned skill_root values exactly matched the selected run-retained roots:

| Role | Catalog name | Retained package / skill suffix |
| --- | --- | --- |
| workflow | agent-workflow:agent-workflow | `81ccc0f85f118deb57143c4b066129c44397f15f1af3e81aab6e0e280f65a13e/skills/agent-workflow` |
| authoring | agent-workflow:workflow-authoring | same package, `skills/workflow-authoring` |
| yoda | hartye-skills:yoda | `2be52948d661a65e0eec8837f4de49934e4cf62ee1c97cf2a0539b568beb8d3d/skills/yoda` |
| test-strategy | agent-tests:test-strategy | `4cc697b3411bf70b4f2658e9219a54f919f2b3292dea38e977ea08ad6c1359de/skills/test-strategy` |

The common root is the admitted run's `source-packages-v1/packages/`, under run `7f7fdf20-a3c1-4607-8ffc-135692a1fc10`. Also read the workflow runtime reference natively. This is observed invocation/root matching, not proof of all references, automatic triggers, tool execution or general skill effectiveness.

The native test-strategy craft read outside that selected skill directory returned **“skill environment is not available for this callback”**. No shell SKILL.md read, fabricated resource root or copied skill body substituted for activation. That craft reference remains missing.

## Changes

Focused docs describe actual parseScript, schema, composition/provider, controller, CLI, monitor/network and test contracts: literal steps before workers, bounded associations and scoped identities, display versus scheduling dependencies, dynamic/appended workers, Planned live/Incomplete terminal including blocked, bounded read-only pages and unsupported old runtimes. Composition covers source/path/hash freezing, schema-checked strict JSON, depth one, independent FIFO child lifetime permits versus shared worker permits, root budgets/controls, complete journal/result/replay validation and explicit revision/drain gates. Artifact/refinement providers remain unavailable.

LAN guidance uses exact assigned RFC1918 interfaces, port 0, startup interface/receipt rechecks, original session ownership, token/Host/Origin checks, manual Close and an exact authenticated close command. Trusted-LAN bearer authority and deferred second-device/phone painted acceptance stay explicit. No continuous interface-monitoring or native concurrency/performance claim is made.

All worker roles require deliberate skill/tool selection. The docs distinguish 128 references per skill, 512 discovery entries per skill, 512 checked skill files/64 MiB in aggregate, and separate tool caps. Stdin source readiness avoids Windows argv payload overflow without changing fingerprints/aggregate ceilings. Generated same-package reference closures never activate another main or provide an executable package copy.

The public check imports the existing resource generator and calls `packageSkillResources({root:pluginRoot,check:true})`; it does not regenerate. Existing manifest, CLI, dependency, recipe and source checks remain. No generator production code changed.

Exact changed primary paths:

```text
scripts/check-plugin.mjs
test/skill-resource-packaging.test.mjs
README.md
docs/api.md
docs/workflow-composition.md
docs/workflow-steps.md
docs/dashboard-lan.md
skills/agent-workflow/SKILL.md
skills/workflow-authoring/SKILL.md
skills/workflow-setup/SKILL.md
skills/workflow-mode/SKILL.md
skills/agent-workflow/references/runtime-api.md
skills/workflow-authoring/references/complete-plan-acceptance.md
skills/workflow-authoring/references/worker-admission-and-replay.md
skills/workflow-setup/references/upgrades.md
```

In addition, 105 generated paths changed only under the four authorized resources prefixes. [Final byte audit](test-evidence/ownership-final.json) lists every change and verifies all 385 unowned baseline files unchanged. The prerequisite receipt, this report and evidence files are separately authorized outputs. Frozen design/plan/review docs, verification/parity docs, manifests, versions, core, recipes and retained inputs were preserved.

## Generated manifests

Ran the existing generator for all four closures, then `--check` reported current. Final manifests:

| Path under skills/ | Bytes | Resource files | SHA-256 |
| --- | ---: | ---: | --- |
| agent-workflow/resources/manifest.json | 34333 | 91 | `61a3315e86a126e143971c6836ac95de8900fef1d0092e4cb0cee93fb54fe4cd` |
| workflow-authoring/resources/manifest.json | 33109 | 87 | `ee975c4128af070326461d3f8bb96cce3dac2e6a09c72fa60a09a70726335604` |
| workflow-setup/resources/manifest.json | 31047 | 82 | `d7968ac43b627090a7e4ff759548380effc816f389c04bded2da87348e4b7bf9` |
| workflow-mode/resources/manifest.json | 31044 | 82 | `a14ba650886d6000076eba52eb143fe58ce04743ebfcc7d2d4832cb10e2726e0` |

The first audit is retained; the final audit includes the last README-only timeout wording correction and this report. That editorial correction changes no packaging/checker input or manifest; the subsequent generator check remained current.

## Validation and retained failures

- Meaningful RED: [confirmed output](test-evidence/packaging-red-confirmed.stdout.log) / [receipt](test-evidence/packaging-red-confirmed-receipt.json): 8 pass, 1 fail. The fixture's valid public check first passed, canonical docs then drifted, and the original public check incorrectly returned exit 0. This is the behavioral regression the production change fixes.
- The earlier [packaging-red output](test-evidence/packaging-red.stdout.log) failed on an incomplete fixture missing `reports/native-live-controls-0.4.0.json`; it is retained and is **not** the meaningful RED. The corrected fixture independently copies the manifests' canonical closure, with no project/dependency links or Git metadata mutation.
- GREEN: [final affected output](test-evidence/packaging-reviewed.stdout.log) / [receipt](test-evidence/packaging-reviewed-receipt.json): all **9 pass**, exit 0, no skipped/cancelled tests or truncated output. Includes actual public-process refusal of canonical drift and a missing packaged file, complete read-only snapshots, plus all existing generator behavior/negative controls. Prior green/final runs remain retained too.
- `node scripts/package-skill-resources.mjs --check`: current, all four manifests above. `node scripts/check-plugin.mjs` (the `npm run check` body): passed, including nine recipes and freshness enforcement.
- [Static documentation/skill inspection](test-evidence/documentation-inspection.json): all four JavaScript examples parsed by actual parseScript; sample child args/results satisfy their declared schemas; read-only steps/children flags parsed. No workflow body evaluated in the host.
- A read-only attempt to parse dashboard/resume/domain-control examples under preserved `AGENT_WORKFLOW_WORKER=1` exited 1 at the worker guard. No launch or prior write occurred. Mutation flags were reviewed against actual source; no marker override, fallback or execution. The static evidence records this limit.
- Yoda inspection: descriptions are 334/207/176/174 characters; mains are 47/103/55/30 lines. Triggers distinguish authoring, inspection, setup and routing; new prerequisite actions/pointers precede detailed procedures. No dollar-argument placeholders; the public check also scans invisible skill instructions. This is source inspection, not paired efficacy, automatic-trigger or comprehensive safety proof.
- Exact helper cleanup verified and removed all 1,868 temporary independent dependency files, with an empty fixture root. [Cleanup receipt](test-evidence/dependencies-cleaned.json). New public fixture cleanup checks canonical ownership before recursive removal. No test fixtures or node_modules remain.

A shell profile emitted Import-Clixml/index warnings during the final README editorial command; exit was 0, the intended README postimage was read back and verified, and the generator check succeeded. No profile/global configuration was changed.

## Coordinator steering and remaining gaps

Read the coordinator-supplied `native-composition-run/retention-diagnosis.json` and `native-composition-r2-reconciliation.json` (the latter is directly under `attempt-01`, not the diagnosis directory). They record an accidental 473,307,607-byte managed root plus 240,906,848-byte parent sources exceeding the 512 MiB retention ceiling before task inference. Prior partial source/owner effects and the unverified owned-job receipt remain preserved. Added concise admission/upgrades guidance: explicit bundles freeze a complete clean plugin distribution root preserving skills/bin/CLI-relative layout, neither a managed runtime containing node_modules nor a skill-only root. No ceiling or runtime code change was needed. The separate clean-source probe is not claimed as passed here.

Remaining coverage:

1. Native composition/permit/concurrency behavior, installed candidate qualification, second-device LAN reachability, phone/painted UI/control acceptance and exact service shutdown need coordinator-owned evidence. This worker launched none of those surfaces.
2. Full `npm test`, smoke, clean install, audit and release/native gates are coordinator-owned and were not run here. The coordinator reports 28 backend-fixture failures after the stdin protocol change; p15 owns that fixture/test correction. This worker did not reproduce, repair or claim resolution of them.
3. The outside-package craft reference remains unavailable. Paired with/without-skill effectiveness, automatic triggering and comprehensive skill safety remain untested; no delegation or model launches were authorized for them.
4. Mutation examples were source-reviewed/static only; worker policy intentionally blocks their invocation. Retained old-runtime readers and unavailable artifact/refinement providers retain their explicit unsupported boundaries.

These gaps do not turn the scoped packaging GREEN into full candidate acceptance. No unrelated source was changed to clear another owner's failures.
