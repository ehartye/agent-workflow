# Explicit skill source admission repair

Completed the assigned source repair and affected-owner verification. This is a bounded source-admission adjustment for the observed repaired Workflow packages; it is not shipment or native qualification of those repaired packages.

Task: `packaging-admission-task.json`, 6586 bytes, SHA-256 `424e91f98bcf74fe0bc73c19d4af97f6638104e979b3471f4f2d3ea251abb466`. The task, prerequisite overlay/helper, packaging handoff, verified Node/test helper/dependency seed and three overlay proofs all matched their byte/hash identities. See [verified inputs](test-evidence/verified-inputs.json).

The reviewed overlay ran before authoring and applied 303 postimages (4,668,716 bytes), verifying the complete 643-file baseline. Its accepted prerequisite identity is `b0419cb95598f8956365f145cfe7fbcd5c6e4fe33a45a008812411f177d9fac4`; baseline content hash is `6eda1e7da148d9765e91fae67460de0d60591bcae772a3baeec6d156127fa0a7`. See [the prerequisite receipt](baseline-overlay-receipt.json). No live predecessor/source copy supplied the repair.

## Reproduction and resulting behavior

The public `verifySkillSources` boundary previously allowed 64 references per skill and 128 files across a bundle. Real production copies failed before any native exposure with the exact diagnostic:

```text
SKILL_MANIFEST: Skill descriptors require distinct IDs native names and original SKILL.md identities
```

The existing aggregate ceiling was independently reached using eight groups of distinct file identities, each below the old per-skill reference bound:

```text
SKILL_SOURCE: Skill source file count exceeded its limit
```

The repaired boundary permits at most 128 references per skill and 512 files across a skill bundle. Tool source verification has an explicitly separate 128-file budget. Its 64-entry per-tree descriptor limit remains unchanged. No manifest version, canonical fingerprint semantics or saved-runtime format changed.

The affected test copies all four exact production skill trees from the reviewed worktree into one owned temporary fixture, checks every source/copy byte count and hash, and declares every file, including originals, generated resources, metadata and the generated manifest itself. It independently checks every generated output against its manifest; no manifest substitutes for reading/hashing the full file inventory.

| Skill | Generated text resources | Declared references | All files | Manifest SHA-256 |
| --- | ---: | ---: | ---: | --- |
| agent-workflow | 87 | 92 | 93 | `8f7c1a371e57a88a0133e8a902b07644ff4b23240cbb2fe8d5e44e5225d1db1f` |
| workflow-authoring | 83 | 89 | 90 | `5479eda371e49f347226e93c4301afbcb545adef5717e37543010fc1833e840c` |
| workflow-setup | 79 | 82 | 83 | `567b46406cd95f5d66cbc075098999cbeeb6c03cccabc749d5bdf5ffcccd5dc9` |
| workflow-mode | 1 | 2 | 3 | `8d0d16082ca452bc6217f393311af226a826031cbb4f0bf0a11c6ad65ccab340` |

All four individual trees and the complete bundle now pass source verification: **269 files / 3,596,371 bytes**. `freezeCapabilities` also accepts their complete source identities. These source checks do not claim native `skills.read` or an associated tool operation.

Distinct, physically present identities exercise positive 128 references / negative 129 references and positive 512 files / negative 513 files. The 513-file case uses at most 64 references per skill, so a per-skill or duplicate-path rejection cannot conceal the aggregate check. Duplicate references have a separate invariant.

## Preserved guards

Only five production lines changed: separate skill/tool file ceilings, the shared counter's explicit budget, the skill reference ceiling, and the two budget initializations. The affected owner confirms:

- Exact 64 MiB skill aggregate admission and aggregate overflow refusal; 1 MiB main and 16 MiB reference overflow refusal.
- 32 skills accepted / 33 refused; complete discovery at 512 entries accepted / 513 refused; depth 6 accepted / depth 7 refused.
- Wrong hashes, missing and extra files, hardlinks, Windows path aliases and descendant junctions refuse. Even declared nested `SKILL.md` and all supported native plugin-manifest formats refuse.
- Tool verification accepts 128 checked files and refuses 129, while 64 tree entries validate and 65 refuse. This exercises behavior rather than snapshots of constants.
- Retained-source integrity, selected-root identity, immutable grants, environment/executable identity, managed readiness, parent policy, deadlines, uncertain-effect refusal and native observation guards remain covered.
- The Windows command-vector ceiling stays 30,000 conservative UTF-16 units. The complete repaired bundle still refuses selection when its command exceeds that budget; source admission does not authorize a larger command. The small mode selection retains its exact native root.

Writer capture, protocol, broker, envelope and command limits were not edited. Historical retained runtimes and source packages were not modified.

## Native activation

Actual executor `skills.list` pagination ran through all ten catalog pages, ending at cursor offset 180 with no continuation or warnings. Duplicate names were resolved against the selected retained identities, including `c1aa8089...` rather than the other h-superpowers package.

Genuine `skills.read` calls used each selected catalog package and its `main_resource`. All five returned the expected enabled main names, exact retained `skill_root` and `next_cursor:null`:

| Selected ID | Main name | Retained package digest / relative root |
| --- | --- | --- |
| workflow | agent-workflow | `81ccc0f85f118deb57143c4b066129c44397f15f1af3e81aab6e0e280f65a13e/skills/agent-workflow` |
| authoring | workflow-authoring | `81ccc0f85f118deb57143c4b066129c44397f15f1af3e81aab6e0e280f65a13e/skills/workflow-authoring` |
| debug | systematic-debugging | `c1aa80898169b589a8c1c575c308bf417e1d5e488567771540d03c2cbfd086f7/skills/systematic-debugging` |
| tdd | test-driven-development | `c1aa80898169b589a8c1c575c308bf417e1d5e488567771540d03c2cbfd086f7/skills/test-driven-development` |
| test-strategy | test-strategy | `4cc697b3411bf70b4f2658e9219a54f919f2b3292dea38e977ea08ad6c1359de/skills/test-strategy` |

The common retained prefix is `C:\Users\ehart\AppData\Local\agent-workflow\runs-v2\7f7fdf20-a3c1-4607-8ffc-135692a1fc10\source-packages-v1\packages\`. These are the admitted pre-repair packages, not a fresh activation of the repaired fixture copies. Native tool outputs in this worker's actual transcript own the invocation evidence; this report does not manufacture native receipts or claim body adherence.

The genuine shared test-strategy `references/craft.md` read failed with **`skill environment is not available for this callback`**. This remains missing. No manual skill-body read, copied activation, grant expansion, shell substitute or associated runtime launch replaced it.

## Executed verification and cleanup

All runs used the task-verified `C:\Program Files\nodejs\node.exe` and `worker-test-tools.mjs`, preserving `AGENT_WORKFLOW_WORKER=1` in real subprocesses. Exact argv/cwd/executable, exit/signal, full stdout/stderr and their hashes are retained beside these receipts; no output overflow occurred.

| Receipt | Observed result |
| --- | --- |
| [admission-red](test-evidence/admission-red-receipt.json) | Executed exit 1: real-package reference rejection and independent aggregate rejection. 36 passed / 6 failed, including enclosing test. |
| [admission-guards-red](test-evidence/admission-guards-red-receipt.json) | Executed exit 1: same regressions, with unchanged byte/discovery/tool guard checks passing. 44 passed / 6 failed. |
| [admission-green](test-evidence/admission-green-receipt.json) | Executed exit 1: source repair passed; one test incorrectly expected every larger individual package to exceed the Windows command budget. Corrected the assertion to the complete bundle without changing that guard. 49 passed / 1 failed. |
| [admission-final-green](test-evidence/admission-final-green-receipt.json) | Executed exit 0: 50 passed, zero failures/skips, stderr empty. |
| [admission-cleanup-green](test-evidence/admission-cleanup-green-receipt.json) | Final source, executed exit 0: 50 passed, zero failures/skips, stderr empty, after explicit owned-path assertions were added to fixture directory removal. |
| [syntax](test-evidence/syntax-receipt.json) | Both changed source files passed Node syntax checks. |
| [dependency cleanup](test-evidence/dependencies-cleaned.json) | All 1868 independent dependency copies reverified before removal; temporary fixture root empty and removed. |

Fixture roots are unique and inside the assigned worktree through the helper's temporary environment. Filesystem links and their targets stay within one owned fixture directory. A former cross-fixture link test now uses its own fixture's target. Top-level fixture cleanup asserts resolved ownership before recursive removal and checks absence afterward. No project Git metadata, installations, package/lock files or global configuration changed.

## Source handoff and missing gates

The [baseline scope ledger](test-evidence/baseline-scope.json) rechecked all 643 reviewed baseline files: 641 unchanged, with only these two source postimages changed:

| Source | Bytes | SHA-256 |
| --- | ---: | --- |
| engine/worker-capabilities.mjs | 28846 | `6bb5fb79904be06701e3c41c037a8e3a7ae7f19cc5cfe204149261cca24970cc` |
| test/engine-worker-capabilities.test.mjs | 45577 | `ce2d69700e29a0d272e0f9089251edbcacd93787fca548d33c890cf98b3fc09f` |

The final tested identities were recorded before the final cleanup-verification run in [its source ledger](test-evidence/before-cleanup-green-source-identities.json). Only the assigned report, prerequisite receipt and evidence prefix accompany those source changes beyond the reviewed overlay.

Coordinator-owned remaining coverage: fresh native qualification of the repaired package mains/resources and cross-skill activation in a new admitted worker; reviewed capture/drain/integration; combined `npm test`, `npm run check`, `npm run smoke`; clean-package install/release/audit gates where applicable. Linux/macOS branches were not exercised. The separate Agent Tests shared-reference failure and any wiki roadmap/discover/ingest work remain outside this assignment's write/network permissions. No native model/workflow/server qualification, live hot-grant, external write, publication, delegation, commit or merge occurred.
