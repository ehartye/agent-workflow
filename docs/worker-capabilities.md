# Worker skills and associated tools

## Live grants remain unsupported

Skill roots are selected when a native thread starts. The pinned public App Server has no setter for a missing root on an existing worker, including an active turn. Steering, host extra-root discovery and global enabled toggles do not provide a live executor grant. Adding another predeclared ID still needs the missing native setter; pre-exposing all skills and authorizing them in prose is not a substitute. See the [exact native boundary and required acceptance](../reports/live-skill-grants-native-boundary.md). No live-grant ability is claimed by 0.3.1.

The 0.3.1 candidate implements immutable worker capability selection through the public CLI and evaluator. Pinned Codex 0.162.1 provides genuine executor `skills.list`/`skills.read` and exact local `selectedCapabilityRoots` binding. Windows/MXC acceptance records paired calls, an independently verified hidden marker, and separate real managed Beeps init/new/list operations with reviewed capture and positive cleanup. Rendering, listening and sprite export remain separate open checks; see [verification](verification.md). Reading files, discovering a CLI or deferring every asset operation to the coordinator cannot substitute for native invocation.

## Select from an immutable new-run bundle

Version 0.3.3 defaults new runs to explicitly captured parent authority and automatically provisions original enabled native plugin/skill roots. Explicit role selections remain useful for required activation and readiness. See [the current access contract](api.md#cli); older recorded runtimes retain their original behavior.

New runs accept `--worker-capabilities <JSON manifest file>` and bounded declared ID selections through `agent(prompt, {skills: [...], requireTools: [...]})`. Omitted input preserves existing behavior. The coordinator supplies a versioned validated bundle and fingerprint as an immutable run ceiling. Workers/scripts select IDs, not executable paths, skill sources, environment grants or host capability identifiers.

Use [the public manifest](api.md#worker-capability-bundle) and [runtime API](../skills/agent-workflow/references/runtime-api.md) for exact schema fields, bounds and supported CLI behavior before dispatch. Existing recipe prerequisite fields remain context, not native admission. Do not add undeclared fields to a recipe's strict argument schema; capability selections belong on supported `agent` options.

Resume/restart retain the original bundle. Source/bundle drift must fail admission and prevent stale cached reuse; a new bundle requires a new run. A new run, revision or selection cannot bypass uncertain-effect reconciliation or rewrite historical failed/unknown outcomes. Retain selected skill/tool/source fingerprints and actual admission/readiness facts in worker evidence and replay identity. The capability resolver must participate in runtime source identity.

Every explicitly selected skill requires an observed initial native read of its original main resource. Paired calls alone, error outputs, wrong roots, references alone and continuation-only reads cannot satisfy selection. Evidence lists each required/observed/missing ID without storing contents; full body pagination remains unverified. A single bounded post-model command also rechecks the selected source/reference hashes under the same worker policy/deadline. Removed or changed cache resources reject completion, retaining the model attempt and cleanup evidence. This detects drift rather than preventing host cache updates. Reconcile the old outcome before preparing a fresh bundle; do not substitute a newer version inside the existing run.

## Preserve sources and toolchain identity

The coordinator prepares the toolchain and declares these identities; each restricted worker must independently validate the inputs it needs:

| Declaration | Identity to retain |
| --- | --- |
| Skill ID | Expected native name, absolute original `SKILL.md` path, content identity and required reference identities. Native names may include a plugin namespace. |
| Tool ID | Exact Node executable and managed-launcher invocation, matching installed runtime/source/dependency receipts, explicit named managed-home/browser cache values, bounded nonmutating readiness commands and task invocation guidance. |

Preserve original plugin-relative layout, including references, scripts and assets. Flattening or copying only `SKILL.md` into a writer root loses that layout and cannot establish native activation. Reject unsafe/linked source paths, unknown fields, duplicate IDs, missing/disabled/mismatched skills and identity drift. Do not reinterpret a cache launcher as the managed runtime it selects, or a browser cache as rendering proof.

Explicit named values such as `AGENT_BEEPS_HOME`, `AGENT_SPRITES_HOME` and `PLAYWRIGHT_BROWSERS_PATH` require validated paths and public provisioning support. Arbitrary parent environment is not inherited. A supplied readiness Boolean cannot authenticate native acceptance. Coordinator-installed tools still need worker-local admission. Later successful setup does not erase earlier missing-runtime or unknown reports.

## Invoke native skill tools in the worker

The native mechanism is `thread/start.selectedCapabilityRoots`. Workflow binds each exact authorized skill directory with the declared stable `id` and `location` containing `type: "environment"`, `environmentId: "local"`, and `path` equal to its absolute original skill root. This is derived from the validated public bundle; scripts cannot supply arbitrary host roots.

These bindings make the native SkillsExtension executor query contribute genuine skill tools. The worker must:

For model catalogs advertising code-mode-only tools, the native process-local `features.code_mode.direct_only_tool_namespaces=["skills"]` setting exposes the genuine skills namespace directly and omits it from nested code-mode. It preserves the selected model and other tool policies. The passing pilot used this exact supported setting; disabling feature flags alone does not override a model's declared tool mode. Native full invocation tracing was not enabled because it writes raw payloads.

1. Invoke `skills.list({authority: {kind: "executor"}})` and resolve the selected skill from the actual returned catalog against its declared identity.
2. Invoke `skills.read` with `package` equal to that returned package. Use supported `resource`/`cursor` values when reading references or continuing bounded results. Native read returns `skill_root`; verify it against the authorized original root and preserve plugin-relative layout.
3. Use the loaded skill through those native tools, then perform its task-authorized associated operations after the separate tool readiness gates pass. Do not invent a package alias, duplicate skill bodies in prompts or use CLI discovery as skill invocation.

Host extraRoots excludes these native skill tools. Path-based UserInput and manual file reads cannot replace executor list/read. Baseline user/system skills remain visible; the plugin catalog is excluded unless provisioned, and selected roots do not establish an exclusive catalog. The native plugin provider skips an exact skill root lacking a plugin manifest, so binding that directory does not broadly activate MCP/apps. Do not bind the whole plugin directory as a shortcut.

Keep correction turns limited to correcting the answer from existing evidence. Do not reactivate selected skills or repeat tools to repair a schema answer. Keep catalog results, observed native list/read invocation and associated CLI readiness as separate evidence.

## Admit actual associated tool operations

Associated CLI tools use the existing native command facility under the unchanged task/permission ceiling. Required `requireTools` readiness must validate declared runtime/files/environment and bounded nonmutating commands inside the actual restricted worker before tool-dependent inference. A skill selected without required tools can support independent source authoring with unavailable/unverified tools reported. Optional operations still require readiness and task authorization before execution; making a required tool optional cannot bypass a failed gate.

Observe executable discovery, command admission, browser installation and sandbox render transport independently. A version/capabilities command cannot prove builds, loopback rendering, output artifacts or audible results. See [worker prerequisites](../skills/agent-workflow/references/worker-prerequisites.md) for failure reporting and browser ownership.

Readiness stages declare either `{id, args, marker, timeoutMs}` or `{id, args, json, timeoutMs}`, never both expectations. A text marker matches the entire trimmed stdout and is limited to 200 characters. For a tool that emits JSON, use a nonempty `json` object with at most 16 expected top-level fields, for example `json: {installed: true}` when that is the tool's documented output. Values must be null, booleans, finite numbers or strings of at most 200 characters. Keys are ASCII identifiers with optional hyphens, at most 100 characters; prototype names, control characters, inherited fields, accessors and symbols reject admission. The entire bounded stdout must parse as an object; each expected own field must match exactly, while unasserted fields are ignored. Malformed JSON, nonzero exit or output reaching the 8,192-byte cap fails the stage. Evidence retains expectation kind and matched status, plus legacy `markerObserved` for text, without raw output. Matching discovery metadata establishes only the asserted fields; actual executable startup still needs its own authorized check. See [the API](api.md) for exact key and stage bounds.

When admitted, workers perform actual authorized CLI/build/export operations and retain required PNG/atlas/WAV/measurement/config outputs inside their assigned writer roots. CLI/artifact facts and actual native list/read invocation are separate evidence. The coordinator prepares prerequisites, reviews integrity and effects, independently integrates artifacts, and owns actual render/listening acceptance. Tool status, hashes or a `delivered` claim alone cannot accept an objective.

No automatic dependency/browser installation, fallback version, global configuration change, permission escalation, shared service/session operation or uncertain mutating retry follows from a selection. Instruction-level operation guidance is not an enforced executable allowlist. Selecting capabilities grants no additional write, network, interactive or delegation authority. Managed ChatGPT authentication remains required, without API-key fallback. No custom MCP server or blanket host grants are introduced; native MCP/apps/browser/host-selected environment roots remain unavailable without a separately verified supporting contract.

## Evidence and remaining verification

Retain bounded sanitized stage, process-start, exit, marker, truncation and cleanup facts with selected identities and missing stages. An executed nonzero command may have changed files; `notStarted` requires explicit evidence that no process began. Keep raw outputs/configuration/secrets out of reports. Unknown or potentially mutating effects need coordinator reconciliation before any retry/fallback. Missing validation dependencies block those checks only; continue independent authorized authoring/review.

Current acceptance is scoped:

- **Implemented API:** validated public bundle, CLI/`agent` selections, background forwarding and immutable persistence/replay identity. Declared source drift and unsafe discovery roots fail closed.
- **Native skill tools:** public run `0cc2103c-babe-436b-b7d1-837477c0b3c0` observed genuine executor list/read pairs and independently matched its hidden marker. Metadata alone does not certify catalog contents or every returned root.
- **Associated authoring:** run `a5ec5b30-5892-4926-b491-08be8f42f2e5` invoked native skills and managed Beeps init/new/list; original input and supplied patch fields were preserved, captures verified and owned job/native inventory drained.
- **Open acceptance:** WAV render/export/listening and sprite export. Sprite build encountered loopback `EACCES`; no successful export is claimed. Full release gates and exact published-package installation remain separate from these candidate observations.

Every file beneath an exposed skill directory needs a declared hash; the bounded discovery scan rejects undeclared metadata/resources, nested skills, plugin bundles and links. Preserve declared external documents at their original plugin-relative paths. After genuine activation, an exact verified ordinary document read may cover an out-of-package reference the native callback cannot serve; it cannot become manual skill activation.

Readiness shares the task's worker deadline. Each stage and RPC is capped by remaining time, with no further command or task turn after expiry. Only passed required tools supply exact verified Node/launcher/environment/readiness metadata in the initial model prompt. Optional tools remain unverified. Neither metadata nor a passing version check establishes render transport or output acceptance.

A known, read-only compatibility error may be corrected narrowly after its effects and input contract are understood, retaining the original failure. Unknown or potentially mutating effects still require coordinator reconciliation before another attempt; no implicit fallback, install or permission change is allowed.
