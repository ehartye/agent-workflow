# Native skill resource packaging repair

Task identity: `skill-resource-packaging-task.json`, 8035 bytes, SHA-256 `9ecb5f9f5ff76e5bd35ebccbc4367842d584d6e717cbdf7bb4f82151880b11a1`. All readiness, diagnosis, native receipt and pinned Rust source references were byte/hash verified before use.

Native activation: executor catalog cursor pages 0 through 140 exposed the selected retained identities. Genuine main reads of agent-workflow, workflow-authoring, yoda, systematic-debugging, test-driven-development and test-strategy returned the exact expected retained skill roots with no continuation. Duplicate h-superpowers names were resolved against admitted `c1aa8089...`, not `b9d862a3...`. A genuine within-package authoring `references/worker-admission-and-replay.md` read also succeeded at the expected retained root with no continuation. The separate test-strategy shared `references/craft.md` native read failed: `skill environment is not available for this callback`. No manual main activation, cache mutation, grant expansion or runtime launch substitutes for that missing reference. These observations are reported from this worker's actual native calls; the coordinator's retained transcript owns their independent capture.

Root cause: pinned native catalog source binds an additional resource only beneath the selected package's identifier and physical skill directory. Native read has no environment for the unbound shared resource. The coordinator's paired probe confirms main/control reads succeeded and outside-package shared-file read failed, with unforced owned-job cleanup. Complete parent package retention does not change that boundary.

Before implementation, a read-only link inventory traversed the four actual entry mains, their canonical references, shared docs, linked evidence reports and text recipes. Entry links currently escape to sibling skill mains, shared docs and sibling references. The closure reaches API, verification, capabilities, session delivery, admission/replay, command/delivery controls and supporting historical text evidence. Executable command examples are instructions for the real plugin root, not generated execution roots.

Implemented one explicit deterministic generator, one public subprocess/temporary-tree invariant owner, and a checked per-skill closure under `resources/` preserving repository-relative source paths. Canonical references stay in place. Cross-skill main links become genuine native role activation instructions, never copied main bodies. References to the current package's main link back to that actual main. All four mains distinguish native resource reads from execution at the real two-parent plugin root. No root configuration, dependency, package or version changes. Wiki discovery/ingest/mutation and paired model efficacy runs are outside this independent assignment; supplied diagnosis is the scoped native failure evidence.

## Regeneration and checking

From the source checkout, the root coordinator and later canonical API/authoring-document writer must run:

```text
node scripts/package-skill-resources.mjs
node scripts/package-skill-resources.mjs --check
```

Use the verified Node executable for the actual environment; this worker used `C:\Program Files\nodejs\node.exe` (v24.18.0), verified against the task. From another cwd, pass the exact source checkout explicitly:

```text
node <checkout>/scripts/package-skill-resources.mjs --root <checkout>
node <checkout>/scripts/package-skill-resources.mjs --root <checkout> --check
```

The default root comes from the generator's location, never the caller's cwd. Generation writes only the four owned mains and their `resources/` trees. It validates every source and existing generated tree before any writes, writes changed bytes only, removes safe stale generated text files and empty directories, and refuses unsafe assets instead of deleting them. File/directory conflicts fail before mutation. `--check` performs no writes, rejects entry drift, stale canonical content, missing/extra files and extra directories. There is no retry or recovery wrapper around a failed generation. Keep the checkout stable during generation/checking; there is no concurrent-edit lock or rollback promise for an I/O failure during writes.

The checked closure permits ordinary single-link UTF-8 `.md`, `.txt`, `.json`, `.js`, `.mjs`, `.yml` and `.yaml` resources. Per file: 2 MiB. Source inventory: 512 files / 32 MiB. Each generated tree is bounded to 512 files / 32 MiB and 4096 directories; individual directory enumeration is bounded to 20,000 names. Symlinks, junctions/reparse aliases, hardlinks, parent escapes, case aliases/collisions, reserved Windows names, alternate streams, short-name aliases, percent-encoded local paths and private `.git`/`node_modules`/`.local`/control directories fail closed. Non-ASCII local resource names are explicitly unsupported rather than approximating Windows Unicode path comparisons; UTF-8 document contents remain supported. No binary/native executable assets are traversed.

Markdown support covers balanced inline/image destinations, angle destinations with spaces, quoted inline titles, reference definitions and full/collapsed/shortcut uses, fragments, HTTP(S)/mailto URLs and native opaque `skill:` identifiers. Fenced, indented and inline code examples retain their bytes. Unmatched bare brackets remain ordinary prose. HTML href/src, wiki links, local autolinks, unsupported URL schemes, malformed/unresolved explicit references and cross-skill-main reference definitions are rejected with a source diagnostic. A cross-skill main should use an inline role link. JS/MJS/JSON/YAML resources are inert text copies: imports, executable paths and JSON literals are not interpreted as Markdown edges. CLI scripts and recipes still execute from their original plugin runtime paths. Remote resources are never fetched.

## Identities and evidence

Each `resources/manifest.json` records the final entry identity and every canonical source/output path, byte length and SHA-256. It has no timestamps or machine-specific paths. The manifests themselves have these identities:

| Skill | Manifest bytes | Manifest SHA-256 |
| --- | ---: | --- |
| agent-workflow | 32919 | `8f7c1a371e57a88a0133e8a902b07644ff4b23240cbb2fe8d5e44e5225d1db1f` |
| workflow-authoring | 31695 | `5479eda371e49f347226e93c4301afbcb545adef5717e37543010fc1833e840c` |
| workflow-setup | 30017 | `567b46406cd95f5d66cbc075098999cbeeb6c03cccabc749d5bdf5ffcccd5dc9` |
| workflow-mode | 736 | `8d0d16082ca452bc6217f393311af226a826031cbb4f0bf0a11c6ad65ccab340` |

Final generator/test/main/manifest identities are retained in [the source identity ledger](test-evidence/final-source-identities.json). Supplied task, prerequisite, diagnostic and source references are recorded in [verified inputs](test-evidence/verified-inputs.json). These are content identities, not an authoritative changed-file count or accepted controller capture.

All affected tests ran through the exact hash-verified coordinator helper with `AGENT_WORKFLOW_WORKER=1` preserved in real subprocess environments. Every fixture used a unique temporary source tree beneath the helper's `.composition-refinement-fixtures` root. Fixture links and targets stayed within the same fixture; fixtures removed themselves and checked absence. The helper made independent dependency copies, with no installation or cache mutation. Full stdout/stderr, intents, exit/signal and output hashes are file-backed:

| Receipt | Actual outcome and significance |
| --- | --- |
| [packaging-red](test-evidence/packaging-red-receipt.json) | Executed, exit 1. Actual production main failed on `../workflow-authoring/SKILL.md` escaping its selected package. Missing-generator errors in other tests are distinct from this meaningful regression. |
| [implementation-01](test-evidence/packaging-implementation-01-receipt.json) | Executed, exit 1. Fixture checks exposed cross-skill manifest idempotence drift, subsequently fixed. |
| [prose-red](test-evidence/packaging-prose-red-receipt.json) | Executed, exit 1. Reproduced over-rejection of ordinary array prose; corrected without rewriting code examples. |
| [refusal-red](test-evidence/packaging-refusal-red-receipt.json) | Executed, exit 1. Reproduced unsupported Unicode path acceptance and removal of an executable-shaped stale output inside fixtures. Both now refuse before writes. |
| [output-shape-red](test-evidence/packaging-output-shape-red-receipt.json) | Executed, exit 1. Reproduced extra-empty-directory acceptance and partial fixture writes on a generated file/directory conflict. Original effects remained in the log; fixture teardown confirmed removal. Both now fail preflight. |
| [output-bound-red](test-evidence/packaging-output-bound-red-receipt.json) | Executed, exit 1. Reproduced generated text exceeding its per-file limit after cross-skill rewriting; output limits now also apply before writes. |
| [final affected GREEN](test-evidence/packaging-accepted-source-green-receipt.json) | Executed, exit 0; eight tests passed, no skips, stderr empty, complete untruncated output. The helper label is a command identifier, not coordinator acceptance. |

The suite covers actual production packaging of all four skills, temporary nested/cyclic closure, source/output identities, read-only missing/stale/extra checks, deterministic byte/mtime idempotence, cross-skill activation text without any copied mains, current-main backlinks, Markdown/code/fragments/opaque identifiers, binary/oversize refusal, Windows path/case/escape/link boundaries and preflight mutation refusal. Windows junction/hardlink checks ran; the case-sensitive-host collision branch is not exercised on Windows. Source checks do not establish native callback success, native instruction adherence or paired skill efficacy.

The exact affected invocation in this worktree was the verified Node executable plus the coordinator helper `run packaging-accepted-source-green test/skill-resource-packaging.test.mjs`; its full intent/receipt lives beside the log. A normal prepared source checkout can use `node --test test/skill-resource-packaging.test.mjs`. Syntax checks of the generator and test passed. Final read-only packaging-check and dependency-cleanup evidence are retained beside the test receipts. Cleanup is performed only by the verified helper, which checks dependency identities and an empty fixture root before removal; see `dependencies-cleaned.json` for its observed result.

## Handoff limits

The repair is source work for review, not shipment or an upgrade of the currently retained 0.5.0 packages. No native workflow/model/server, delegation, live grant, package installation, Git metadata change, publication or external wiki write was performed. An independent filesystem scan found no generated `SKILL.md` files; native recursive discovery was not invoked on these outputs. This does not prove repaired native resource reads.

The coordinator still owns capture integrity/drain review, allowed-path integration, regeneration after later canonical document edits, and fresh combined `npm test`, `npm run check`, `npm run smoke` checks. Clean-package installation/release/audit checks are unrun here. A fresh admitted package must genuinely list/read each repaired main and required local resources with native cursor pagination, match returned skill roots, and separately activate cross-skill roles. Existing immutable workers must not be hot-granted or have their retained sources changed for that qualification. The failed Agent Tests shared reference remains missing; repairing that other plugin is outside ownership. Root owns acceptance and any wiki roadmap follow-up for this packaging convention.
