# Dashboard UI authoring and recovery plan

This is an unexecuted coordinator plan for compact run navigation and visible failure reasons. It does not authorize dispatch, installation, recovery, integration, or changes to an existing run. The only artifact produced by this authoring task is this document. No worker outcome, prerequisite, activation, capture, cleanup, rendering, or test success is asserted by its existence.

The requested logical tasks are exactly `review-ui`, `review-style`, `ui-write`, and `fresh-verify`. Two independent source reviews precede the one UI writer. The coordinator integrates reviewed artifacts into a stable combined checkout, runs the tests it owns, and starts a new independent verifier against that checkout. Browser acceptance is a separate coordinator obligation. Missing rendering and the historical writer with negative drain remain missing/unknown throughout the supplied scenario.

## 1. Establish the evidence boundary and unresolved inputs

The author read `AGENTS.md`, the complete scenario and rubric, `README.md`, `docs/api.md`, `docs/limitations.md`, and `docs/worker-capabilities.md`. The only launcher execution was public `--help` through `C:/Program Files/nodejs/node.exe`, with PowerShell `login:false`; it exited zero. Help exposed the launch-checkout candidate's flags. That does not establish an installed managed runtime, account readiness, or worker admission. No Agent Workflow skill or its references were activated or read. The executable listing of native skills below is a future coordinator/worker procedure, not evidence it happened during plan writing.

The exact launch checkout is the current source for this plan. Public API text explicitly identifies `--args-file` and the larger native inbound frame as later candidate additions. Installed 0.3.5 does not acquire them from a cache refresh or from this checkout's help. This plan uses small `--args JSON` descriptors and no candidate-only transport. Before dispatch, the coordinator must match selected source/runtime/dependency receipts to the installed help and validate the literal script below. If that installed API cannot validate it or lacks capability selection, stop that dependent admission; record the incompatibility and obtain an explicit version/install decision. Do not silently select another runtime. No installation command is part of this plan.

Resolve and retain the following **before their dependent commands**. All paths must be absolute, regular, nonlinked where required, and coordinator-owned or explicitly assigned. Empty values, placeholders, child-authored permission assertions, and guessed IDs are refusals, not defaults.

| Coordinator value | Required evidence and dependent work |
| --- | --- |
| `OriginatingSession` | Actual originating session from the real host context; match saved runs' original sessions. Needed for starts, watch, parent doctor, dashboard, and any separately authorized control. Never use an invented UUID or this evaluation worktree's identifier as a session. |
| `ProjectRoot` | Exact trusted source checkout for reviews and writer inputs, with captured source identities. This evaluation worktree is not automatically that future project. |
| `DataRoot` | Exact absolute instance directory; use `--data-dir` consistently for every command, including inspection. Do not infer it from `PLUGIN_DATA`. |
| `PluginRoot`, `Launcher` | Exact installed original package root and its `bin/launch.mjs`; prove version/source/runtime/dependency identity. A launcher in a cache is not the managed runtime it selects. |
| `Node` | `C:/Program Files/nodejs/node.exe`, verified by the coordinator as Node 24+, with version and exact byte hash. Do not substitute a PATH result. |
| `ParentAccessFile` | Frozen actual originating-context snapshot, with its hash/provenance, not a fabricated permission request. The supported parent shape is shown below. Only use it if its values describe the actual host. |
| Parent catalog identity | Complete actual enabled native catalog metadata and its admitted fingerprint. Retain the run's `parentCapabilitiesHash`; the child cannot attest the parent's grants. |
| `CapabilityFile` | Immutable version-1 role bundle with actual original sources, every exposed file/reference hash, exact tool identities if any, and a reviewed bundle hash. Deliberate role IDs are mapped in step 3. |
| `InputRoot`, `ScriptPath` | Coordinator-owned input/evidence locations and the literal saved script source. Saving definitions is future coordinator work, outside this authoring task. |
| Frozen source packet | Path/hash of a small manifest describing exact base inputs, both review scopes, accepted preserved work, read-only supporting documents, and allowed writer paths. Verify its referenced file hashes before and after each task. |
| Prerequisite observations | Actual command/process/cache/policy evidence for each worker role; include missing stages. Managed ChatGPT login, pinned App Server/backend, native skills availability, and positive cleanup must not be inferred from help. |
| Historical worker identities | Actual prior run ID, generation, position, cumulative attempt, originating session/runtime/data instance, output and cleanup/capture records for both supplied historical writers. No historical IDs were supplied here. |
| `ReviewPacket` | Only after reviews: coordinator-frozen, hash-verified review outputs and source identities, accepted/rejected findings, and exact producer identities. Not model self-acceptance. |
| `CombinedRoot`, `IntegrationPacket` | Only after capture review/integration: stable combined checkout, exact file/tree hashes, integrated producer identities, test receipt locations/hashes, and explicit missing rendering. |
| Browser/render prerequisites | Actual compatible browser executable/cache path, policy/transport/startup evidence and coordinator ownership. A browser version or directory listing is not render evidence. These are unresolved. |
| Observer and retention | Named owner `Dashboard UI coordinator observer`; durable location for sanitized receipts, consumed event cursors, gaps, terminal notifications, and prompt failure relay to the originating conversation. |

The parent snapshot schema is `{version:1, sessionId:ACTUAL_SESSION, provenance:"codex-session-context", filesystem:"unrestricted", networkAccess:true, approvalPolicy:"never"}`. This example is a schema, not a claim that a child can manufacture that authority. If the actual context does not match the supported parent contract, fail parent admission rather than widening permissions. The plan uses restricted review/verifier runs and an explicitly authorized parent writer; it never changes saved authority on replay. Worktrees organize ownership and capture; parent access is not filesystem security isolation.

The bounded evaluation permits no wiki access or writes. Future project intent/architecture decisions remain owned by the coordinator and the owner's wiki; do not turn this artifact into an instruction to discover or ingest outside the evaluation's read boundary. No product, selected skill, configuration, Git metadata, or wiki changes are authorized now.

## 2. Separate independent work from the recovery blockers

Create a coordinator decision ledger before any admission. Preserve original observed outcomes independently of task reports:

| Supplied fact | Retained interpretation | Allowed next work |
| --- | --- | --- |
| Historical isolated writer finished model output; `jobEmpty:false`; capture unverified | Model output exists. Process/effects are unsettled; files may have changed. Capture is not an accepted patch. Delivery coverage is `null`, with explicit unknown effects. | Read retained inspection evidence; preserve the workspace and diagnostics. No replacement writer, merge, resume, ordinary replay, deletion, or automatic fallback. |
| Separate completed writer has verified unchanged bytes and positive cleanup | Preserve its accepted work and original receipt. Do not erase it, reinterpret it as unknown, or rerun it as part of a suffix. | Use its exact accepted bytes in an independently verified baseline when their dependency/ownership is safe. |
| Browser prerequisite missing/unverified | Source work can be independently ready; rendered acceptance is `null`. | Both source reviews can proceed on trustworthy frozen inputs. Source authoring can proceed once its own recovery/integrity gates pass; no browser-dependent operation is admitted. |
| Required skill disappears after initial admission | Initial readiness/activation do not establish completion-source integrity. | Apply step 7; keep original attempt/effects and reject affected acceptance. |
| Saved parent replay sees a changed enabled catalog fingerprint | Saved parent execution identity no longer matches. | Apply step 8; no generation rewrite or dispatch through that saved replay. |

The historical unknown writer is **not** `ui-write`'s permission to redo work elsewhere. Until the coordinator proves the relevant effects/ownership settled, the new writer command remains guarded. Merely choosing a new run ID, worktree, catalog, or capability bundle does not reconcile it. Stop cannot undo its effects; a note cannot turn `jobEmpty:false` into a positive drain.

Known independent source reviews may proceed only on a trusted, hash-verified baseline that neither consumes the unknown capture nor depends on its unfinished files. Check for active external mutation and compare inputs before/after; if stability cannot be established, pause those reads too. Preserve accepted completed work byte-for-byte. Existing accepted work is not a reason to replay the old failed/unknown suffix. Safe prerequisite investigation and this source plan can continue without dispatching any replacement.

## 3. Freeze role ownership, skill identities, and readiness

One writer owns the shared UI interface and both files. Reviews are independent; each reports against its own source scope and the frozen source identities, without editing either path. The coordinator resolves conflicting recommendations before handing a review packet to the writer. It owns test files and shared acceptance/interface decisions.

| Task ID | Source/output ownership | Explicit native skill IDs | Required tool IDs in this source-only script | Dependencies |
| --- | --- | --- | --- | --- |
| `review-ui` | Read `engine/monitor/app.mjs`; bounded findings only | `beautiful` | `[]` | Trusted frozen baseline only; independent of `review-style` |
| `review-style` | Read `engine/monitor/style.css`; bounded findings only | `beautiful` | `[]` | Same baseline; independent of `review-ui` |
| `ui-write` | Sole source writer: `engine/monitor/app.mjs`, `engine/monitor/style.css` | `beautiful`, `tdd` | `[]` | Both accepted review reports; preserved baseline; historical-effects release; coordinator's failing test evidence |
| `fresh-verify` | Read the stable combined checkout and test receipts; no product/test edits | `test-strategy` | `[]` | Accepted capture, positive cleanup, deliberate integration, exact combined hashes, coordinator test gates |

These are portable **role IDs**, not native packages or fabricated aliases. Candidate original sources visible in the parent context are `hartye-skills:beautiful` under `C:/Users/ehart/.codex/plugins/cache/hartye-plugins/hartye-skills/0.4.0/skills/beautiful`, `h-superpowers:test-driven-development` under one actually enabled original `h-superpowers` root, and `agent-tests:test-strategy` under `C:/Users/ehart/.codex/plugins/cache/hartye-plugins/agent-tests/0.4.1/skills/test-strategy`. There are same-name development and marketplace Superpowers candidates. The coordinator must resolve `tdd` to the actual enabled original source from native metadata; neither folder ordering nor its displayed label decides. Paths here are candidate identities supplied in context, not hash/admission evidence. Do not bind a whole plugin to simplify selection, flatten its layout, copy `SKILL.md`, edit the selected sources, or treat background visibility as invocation.

Before actual dispatch, the coordinator uses genuine `skills.list({authority:{kind:"executor"}})`, follows all relevant catalog pages, selects the returned entry against the original root/native name and retained metadata, then uses genuine `skills.read({package:ENTRY.package, resource:ENTRY.main_resource})`. In an actual call, substitute the returned package and complete returned main resource, not the symbolic `ENTRY` notation. For same-name entries match the original root and native catalog provenance; ambiguity blocks selection. Retain hashes for every file exposed beneath the exact selected skill directory, required resources and original external references. Freeze the bundle once; bind `beautiful`, `tdd`, and `test-strategy` to those exact native names, original `SKILL.md` paths, source hashes, and references using the documented version-1 schema. All selected skill-directory files need declared identities; respect 512-entry/depth-6 discovery and per-skill limits. No placeholder hashes can enter an admitted bundle.

The worker must independently call genuine executor `skills.list` and then `skills.read` using that worker's returned package/main resource for **each selected role ID**. Verify returned `skill_root` against the declared exact original directory; use supported pagination, cursors, and resource locators for remaining content. The coordinator's earlier activation does not activate the child's skill. Instruction prompts do not preload bodies. References/manual filesystem reads, paired errors, continuation pages alone, wrong roots, a discovered CLI, or a copied skill body do not count. Exact verified ordinary external documents may be read after genuine activation only where the public native reference boundary requires it; do not use that exception to manually load another skill body. The native completion evidence must show required/observed/missing IDs; `body:'notVerified'` remains an evidence limit. `CAPABILITY_NATIVE_SKILLS` rejects completion when required activation is missing. Parent catalog availability never requires invoking every available skill.

Three independent checks must be kept apart:

1. **Readiness:** under the actual selected worker policy, executable/source/dependency/environment checks and all required nonmutating tool stages pass before tool-dependent inference. Host discovery alone is insufficient. Record exact Node path/version/hash, actual launcher/runtime/dependency receipts, named cache paths, process-start/exit/truncation facts and remaining deadline. A stage marker must equal all trimmed stdout; a JSON expectation must match declared own top-level scalars. A successful query proves only those fields.
2. **Activation/source integrity:** initial native main-resource reads of the selected original resources, plus the bounded post-model source/reference recheck, are necessary. Initial admission does not lock a mutable plugin cache.
3. **Acceptance:** exact authoritative output bytes, allowed paths, reviewed effects, positive cleanup, independent combined verification, full test gates and real rendering are separate. Passing readiness or returning `delivered:true` does not satisfy them.

The literal script intentionally selects no associated tool IDs for source-only roles. This is an explicit separation of source review/authoring from rendering, not downgrading a failed required browser gate to optional. `fresh-verify`'s source/test-receipt subcoverage is distinct from coordinator rendering, whose coverage remains null until verified. If its loaded skill actually requires another associated operation for the assigned source task, pause that dependent operation before inference: resolve an authentic supported tool declaration and a **new** immutable admission decision. Do not reinterpret `requireTools:[]` as passed tool readiness.

Do not invent a browser tool manifest using arbitrary Playwright commands: documented readiness executes exactly `[node.path, launcher.path, ...args]`. A future associated tool declaration needs its real documented managed launcher, original runtime/dependency files/receipts, allowed named environment (for example a verified `PLAYWRIGHT_BROWSERS_PATH`) and bounded nonmutating stages. No arbitrary environment inheritance, install, `npx` download, global configuration changes, sandbox weakening, backend fallback, shared service operation, interactive approval, or API-key billing fallback follows from a selected skill. Missing browser startup/transport pauses rendering only. An executed nonzero command can have mutated files; report `notStarted` only when explicit native evidence proves no process began.

## 4. Fix budgets and input/output boundaries

This is three explicitly gated new invocations of one saved script, not a nested workflow. Review and verifier invocations are restricted; only the writer has authorized parent `--writable`. There is no resume loop, task-discovery loop, correction loop, or automatic retry. Logical dependencies are encoded in the stage gates and frozen coordinator handoffs. A scheduling `dependsOn` within a run would not import files; across these new runs the coordinator barrier is mandatory.

| Stage | Fixed batch / concurrency | Worker deadline | Run wall deadline | Maximum admitted task attempts |
| --- | --- | --- | --- | --- |
| `reviews` | Two source scopes in one batch; concurrency 2 | 600,000 ms each | 1,500,000 ms | 2 total, one for each review |
| `write` | One task; concurrency 1 | 900,000 ms | 1,200,000 ms | 1 |
| `verify` | One fresh task; concurrency 1 | 600,000 ms | 900,000 ms | 1 |

All starts use `--max-attempts 1`. Four initial worker starts/attempts are the entire campaign's task budget, spread across three runs. Source drift, transport loss, oversized/invalid output, task failure, and missing activation do not authorize a fifth start. Agent calls total four; parallel handles two fixed entries; broker activity remains far below 10,000. No round is created by appending tasks to a mutable manifest. Reconcile a failed campaign and obtain a new explicit bounded decision before any later attempt; never automatically replay successful writers.

Run deadlines total 3,600,000 ms (60 minutes). Coordinator inspection/integration/testing has a separate 30-minute active-work checkpoint; rendering has a separate 30-minute active-work checkpoint, pending readiness. At either checkpoint, report exact unfinished coverage and the next decision; do not silently extend budgets or convert a timeout to success. Machine/account availability and observer ownership must cover detached execution. Worker readiness, task turns, any correction, and post-model source checks share the worker deadline after App Server/thread startup; no command or new task turn follows expiry. Startup, queueing, and source/capture work also need run-wall headroom. Cleanup has the runtime's separate bounded drain; it must finish positively even if task time expired. The documented 15-second post-readiness inventory maximum stays inside the worker deadline, and is not a substitute for that drain. There is no invented `stallMs`, dollar budget, hard shared token budget, or unbounded default run lifetime here.

Allocate the coordinator's 30 minutes as five minutes for inspection/integration, five for affected tests, fifteen for full tests, two for check, and three for smoke. Allocate the rendering window as ten minutes for prerequisites, fifteen for the actual render inspection, and five for owned monitor/browser cleanup. Enforce each command's allocated remaining time through the coordinator's verified owned-process execution facility; the PowerShell blocks below specify argv, not an extra timeout CLI flag. Confirm that facility and its finite cleanup/drain bounds before starting dependent commands. A command deadline stops further dependent admission and produces a timeout/effects inspection, never an automatic retry or a success. If owned process termination cannot be established, retain unknown effects. There are at most four coordinator test commands and one render session, with no repetitions in this campaign. The observer covers each run through terminal notification and bounded cleanup, then closes; its disconnection is reported rather than silently extending execution. Record the selected runtime's actual finite drain bounds in the prerequisite ledger instead of assuming a numeric private setting or treating its 15-second inventory cap as total cleanup.

Input descriptors contain only `{path,sha256}` and small fixed metadata. Each descriptor path is at most 4,096 characters and digest is lowercase SHA-256. Frozen manifests include exact bytes/hashes/counts and assigned ranges (one source file per review, exactly two writer paths), not mutable directory scans. Workers verify the descriptor hash and referenced records under actual command policy; the QuickJS evaluator cannot read files. Recheck before/after reads and edits; a path or cached result is not source freshness. Large future evidence must be a separate hash-verified manifest/chunk handoff; do not enlarge args or feed arbitrary bulk records to this fixed campaign.

Keep each serialized CLI args value under 12 KiB and each model prompt below 8,000 UTF-16 code units here. Each task returns at most five concrete findings/changes, with references and unverified gaps; no secrets, raw configs or source dumps. The script retains at most 8 KiB of JSON-serialized report evidence per task and under 64 KiB overall. An oversized or missing value becomes a null coverage slot with a reason; authoritative worker records still retain their original result/error. The script does not truncate evidence into a successful report.

Public ceilings are separate: script 1 MiB; start envelope and persisted records 2 MiB each with metadata/escaping/launch overhead; broker messages/results 1 MiB; prompts 65,536 UTF-16 code units; collection 4,096 entries; lifetime worker requests/attempts 1,000; native answer 512 KiB; retained previews 1 MiB. Leave headroom. The capability bundle is at most 256 KiB and has its own skill/tool/file/readiness limits; a valid bundle can still exceed Windows encoded argument limits. Default capture includes ignored outputs and is capped at 20,000 files, 512 MiB captured bytes, 512 MiB diff, with 32 MiB metadata/patch-preview bounds. This UI writer needs none of that bulk. Do not use generated dependency trees or exclusions to conceal unauthorized paths; no capture-policy file is selected for this two-path source task. Any admission/capture size refusal remains a refusal, not an invitation to retry.

## 5. Save this literal QuickJS workflow after coordinator resolution

Materialize the following literal source at the coordinator's `ScriptPath`, validate it, then save it under `project:dashboard-ui-plan`. It has first exported literal metadata, no imports/additional exports, no filesystem/shell/host execution, and uses only JSON arguments, `agent`, and `parallel` in the separate bounded QuickJS evaluator. Do not import it into Node to execute it. The current authoring task has not validated or saved this source. Installed validation is a hard gate, not assumed compatibility proof; do not bypass a rejection with private API calls.

Logical task IDs below are report/ownership IDs, not invented native run IDs. Exact native identities come from actual receipts and zero-based worker positions. `reviews` maps its two admitted workers in request order to `review-ui` and `review-style`; the other stages request one worker. Confirm the observed mapping, including any missing admission, from status/worker records rather than inferring actual execution from an array slot. No unsupported agent `taskId`, cross-run `dependsOn`, permission, grant, or tool-path option is invented. Dependencies are explicit JSON in the bounded result and are enforced by stage control and the coordinator's handoff.

```javascript
export const meta = {
  name: "dashboard-ui-plan",
  description: "Two source reviews, one UI writer, and gated fresh combined verification"
};

const ids = ["review-ui", "review-style", "ui-write", "fresh-verify"];
const dependencies = {
  "review-ui": [],
  "review-style": [],
  "ui-write": ["review-ui", "review-style"],
  "fresh-verify": ["ui-write"]
};
const selections = {
  "review-ui": ["beautiful"],
  "review-style": ["beautiful"],
  "ui-write": ["beautiful", "tdd"],
  "fresh-verify": ["test-strategy"]
};
if (!args || typeof args !== "object" || Array.isArray(args)) {
  throw new Error("A resolved coordinator JSON argument object is required");
}
const stage = args.stage;
if (stage !== "reviews" && stage !== "write" && stage !== "verify") {
  throw new Error("Unknown stage; no worker admitted");
}
function descriptor(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof value.path !== "string" || value.path.length < 1 ||
      value.path.length > 4096 || typeof value.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.sha256)) {
    throw new Error("Missing frozen descriptor: " + name);
  }
  return {path: value.path, sha256: value.sha256};
}
const input = descriptor(args.input, "input");
let reviews = null;
let integration = null;
if (stage === "write") {
  reviews = descriptor(args.reviews, "reviews");
  if (args.reviewUiAccepted !== true || args.reviewStyleAccepted !== true ||
      args.historicalEffectsReleased !== true || args.failingTestReady !== true) {
    throw new Error("Coordinator writer barriers are not released");
  }
}
if (stage === "verify") {
  integration = descriptor(args.integration, "integration");
  if (args.integrationAccepted !== true || args.fullGatesPassed !== true) {
    throw new Error("Combined-byte integration/test barriers are not released");
  }
}
const common =
  "Use only your assigned scope and actual permission ceiling. " +
  "First use genuine skills.list with authority executor; resolve each selected " +
  "ID to the declared original source; skills.read its returned package and " +
  "main_resource. Do not invent packages or manually load skill bodies. " +
  "Verify the frozen input manifest hash and assigned source bytes before work " +
  "and again at the end. Input descriptor: " + JSON.stringify(input) + ". " +
  "No installs, global config, policy changes, git mutations, services, network, " +
  "nested agents/workflows, releases, retry or fallback after uncertain effects. " +
  "Record prerequisite failures with command/executable/cache, process-start " +
  "evidence and missing coverage. Continue only independent authorized source " +
  "work. Browser/render coverage is unavailable until the coordinator proves it. " +
  "Return bounded JSON: taskId, source identities, up to five concrete findings " +
  "or changes with path/line evidence, checks, and explicit gaps. No raw secrets " +
  "or full source dump. Your output is a claim, never acceptance or cleanup proof. ";
function boundedReport(value) {
  if (value === null || value === undefined) {
    return {value: null, reason: "No result; inspect original worker outcome"};
  }
  const encoded = JSON.stringify(value);
  if (typeof encoded !== "string" || encoded.length > 8192 ||
      encodeURIComponent(encoded).replace(/%[A-Fa-f0-9]{2}|./g, "x").length > 8192) {
    return {value: null, reason: "Report exceeds 8 KiB; inspect retained worker evidence"};
  }
  return {value: value, reason: null};
}
async function invoke(id, text, isolated) {
  const options = {skills: selections[id], requireTools: []};
  if (isolated) options.workspace = "isolated";
  try {
    const prompt = common + "Task ID: " + id + ". " + text;
    if (prompt.length > 8000) {
      return {taskId: id, report: {value: null, reason: "Prompt exceeds this plan's budget; no call made"}};
    }
    const value = await agent(prompt, options);
    return {taskId: id, report: boundedReport(value)};
  } catch (error) {
    return {taskId: id, report: {
      value: null,
      reason: "Invocation did not return an accepted report; inspect original status/error/cleanup"
    }};
  }
}
let rows;
if (stage === "reviews") {
  rows = await parallel([
    {id: "review-ui", scope: "engine/monitor/app.mjs"},
    {id: "review-style", scope: "engine/monitor/style.css"}
  ], async (item) => invoke(item.id,
    "Read-only independent source review of " + item.scope + ". " +
    "Assess compact run navigation and visible failure reasons, accessible " +
    "selection/focus, accurate failed/unknown/idle/terminal presentation, and " +
    "Close versus Stop. No edits. Do not await or invent the other review. " +
    "Separate source findings from unperformed rendered acceptance.", false));
} else if (stage === "write") {
  rows = [await invoke("ui-write",
    "You alone may edit engine/monitor/app.mjs and engine/monitor/style.css. " +
    "No test edits. Verify and consume the coordinator review packet: " +
    JSON.stringify(reviews) + ". It must identify both accepted review producers " +
    "and the current baseline. Verify coordinator-owned failing behavior tests " +
    "before feature changes; if absent, stop that change and report the gap. " +
    "Follow beautiful and tdd. Within the first three minutes save a useful " +
    "minimal coherent change in the two owned paths, with a bounded progress " +
    "report; leave inspectable source checkpoints during longer work. " +
    "Implement compact navigation and visible reasons without changing API, " +
    "controls, authentication or test ownership. Preserve accepted prior bytes " +
    "outside the deliberate reviewed delta. Do not integrate another workspace. " +
    "List changed paths and checks; leave rendering explicitly unverified.", true)];
} else {
  rows = [await invoke("fresh-verify",
    "Fresh independent read-only verification in the stable combined checkout. " +
    "Use test-strategy and verify the coordinator integration packet: " +
    JSON.stringify(integration) + ". Verify exact combined hashes before/after " +
    "inspection; inspect both UI files, preserved work, review findings and " +
    "coordinator failing/passing and full test/check/smoke receipts. Do not use " +
    "cached worker output or writer self-report as current acceptance. No source " +
    "or test edits. Independently assess unmet criteria and exact-byte coverage. " +
    "Do not claim rendered acceptance without actual coordinator render evidence; " +
    "mark it null if absent and retain the unknown historical writer.", false)];
}
const tasks = ids.map((id) => {
  const row = Array.isArray(rows) ? rows.find((entry) => entry && entry.taskId === id) : null;
  return {
    taskId: id,
    dependsOn: dependencies[id],
    skills: selections[id],
    requireTools: [],
    attemptLimit: 1,
    report: row ? row.report.value : null,
    gap: row ? row.report.reason : "Not requested in this stage; external barrier pending",
    accepted: null
  };
});
const result = {
  stage: stage,
  tasks: tasks,
  acceptance: null,
  renderAcceptance: null,
  historicalUnknownWriter: "unresolved; no replacement, merge or resume",
  nextOwner: "coordinator"
};
if (JSON.stringify(result).length > 65536) throw new Error("Bounded result exceeded");
return result;
```

The script intentionally does not infer native completed/failed/unknown status or attempt counts from exceptions or non-null reports. The actual run/worker records are authoritative. A caught call error preserves a null report and prevents the coordinator's next-stage release. A `parallel` result that contains a missing/null slot retains that gap; it cannot be synthesized into success. Task JSON `accepted:null` is deliberate: acceptance belongs outside the evaluator. The source packet and coordinator receipts are evidence to inspect, not permission tokens; the guard booleans alone cannot authorize any operation.

## 6. Prepare, validate, save, and admit only eligible work

All commands below are **future instructions**, not commands executed by this plan author. Use PowerShell with `login:false`. Use `&` and argument arrays, never a bare quoted executable path, shell concatenation, `cmd /c`, or string evaluation. Do not run an install, setup, or runtime service as an implicit prerequisite. No fallback after a command with uncertain effects is included.

After the step-1 values are resolved, bind them from the real coordinator context, not placeholder literals. Verify input files and their recorded hashes before these calls. `ScriptPath` contains exactly the literal source in step 5. `CapabilityFile` is the immutable genuine-source bundle from step 3. `ReviewArgsJson`, `WriteArgsJson`, and `VerifyArgsJson` are constructed as described below when their dependencies actually exist.

```powershell
# Required resolved variables before use:
# $Node, $Launcher, $ProjectRoot, $DataRoot, $OriginatingSession,
# $ParentAccessFile, $CapabilityFile, $ScriptPath, $SourcePacketPath,
# $SourcePacketSha256. $Node is C:/Program Files/nodejs/node.exe.
# Do not bind missing inputs to sample values or generate a new session.

function Invoke-WorkflowCli {
    param([string[]]$WorkflowCliArguments)
    $WorkflowOutput = & $Node $Launcher @WorkflowCliArguments
    $WorkflowExit = $LASTEXITCODE
    if ($WorkflowExit -ne 0) {
        # Retain bounded sanitized output/exit and command identity first.
        # A failed/lost start may already have effects: do not retry it.
        throw "Workflow CLI exited $WorkflowExit; inspect retained evidence before further dependent work"
    }
    $WorkflowOutput
}

& $Node --version
if ($LASTEXITCODE -ne 0) { throw 'Node prerequisite failed; no dependent admission' }
Get-FileHash -LiteralPath $Node -Algorithm SHA256
Invoke-WorkflowCli -WorkflowCliArguments @('--help', '--data-dir', $DataRoot)

Invoke-WorkflowCli -WorkflowCliArguments @(
    'doctor', '--cwd', $ProjectRoot, '--access', 'restricted', '--data-dir', $DataRoot
)
Invoke-WorkflowCli -WorkflowCliArguments @(
    'doctor', '--cwd', $ProjectRoot, '--session', $OriginatingSession,
    '--access', 'parent', '--parent-access', $ParentAccessFile, '--data-dir', $DataRoot
)
Invoke-WorkflowCli -WorkflowCliArguments @('validate', $ScriptPath, '--data-dir', $DataRoot)
Invoke-WorkflowCli -WorkflowCliArguments @(
    'save', 'project:dashboard-ui-plan', '--script', $ScriptPath,
    '--cwd', $ProjectRoot, '--data-dir', $DataRoot
)
Invoke-WorkflowCli -WorkflowCliArguments @(
    'read', 'project:dashboard-ui-plan', '--cwd', $ProjectRoot, '--data-dir', $DataRoot
)

$ReviewArgsJson = @{
    stage = 'reviews'
    input = @{path = $SourcePacketPath; sha256 = $SourcePacketSha256}
} | ConvertTo-Json -Depth 8 -Compress
if ([System.Text.Encoding]::UTF8.GetByteCount($ReviewArgsJson) -gt 12288) {
    throw 'Use the frozen manifest descriptor; do not send bulk args'
}

# Only after independent-baseline, skill, policy and observer readiness gates pass:
$ReviewStartReceipt = Invoke-WorkflowCli -WorkflowCliArguments @(
    'run', 'project:dashboard-ui-plan', '--cwd', $ProjectRoot,
    '--session', $OriginatingSession, '--data-dir', $DataRoot,
    '--access', 'restricted', '--worker-capabilities', $CapabilityFile,
    '--args', $ReviewArgsJson, '--concurrency', '2', '--max-attempts', '1',
    '--worker-timeout-ms', '600000', '--run-timeout-ms', '1500000'
)
```

Doctor is command-only admission, not inference, rendering, activation or objective acceptance. Run doctor for the actual intended access modes; an elevated host check cannot substitute for a restricted worker check. Inspect its structured facts as well as exit status. Do not add `--session0-desktop shared`: this requires separate explicit native Session-0/shared-UI authorization, which is not supplied. Use the existing default only if verified for the actual host; do not switch backend or desktop mode after failure.

The save omits `--command`, so it does not generate a delegating skill. A definition collision stops save; do not blindly overwrite it. Compare exact source first and obtain a deliberate definition decision if needed. `read` here is a future public CLI check of the coordinator's own saved definition, not this author reading a bundled skill or another evaluation output. Keep exact script bytes/hash alongside the save receipt.

Retain and inspect the actual returned startup receipt before proceeding. Populate `ReviewRunId` and `ReviewGeneration` from its real fields, retain its `watch.argv`, runtime/data/session identity, and confirm admission facts. Do not guess response property names, IDs, or generation `1`. A lost response or command timeout can follow a successful start; inspect retained state and reconcile before another start. `--foreground` is unnecessary; detached admission is not completion.

## 7. Handle a disappearing required skill without rebinding

This applies independently of the historical negative drain. Retain the selected role ID, native package/root, original source/reference hashes, bundle fingerprint, initial admission and native activation evidence, actual task attempt/turn state, and cleanup facts.

* If availability/source verification fails before a task turn, record the rejected admission/readiness stage. Only claim `noInference` when observed, and never claim no process started merely because no model turn ran: thread/readiness processes can already exist.
* If the package disappears after initial admission or a model turn, the completion-source command must recheck the **same** identities under the same worker policy and remaining deadline. A known missing/changed source is `CAPABILITY_SOURCE_CHANGED`; an unknown/unavailable completion check is `CAPABILITY_SOURCE_UNVERIFIED`. Keep the model attempt and output, original failure, possible writes, capture status and cleanup. Initial activation or a plausible artifact cannot override that failure.
* If a response was lost, effects/inventory can be unknown even with process exit. Do not rerun the source check or worker as an automatic fallback. The coordinator inspects the actual effect boundary first. Native cleanup must independently be positive.
* Do not patch the saved bundle, copy a replacement body into its old path, edit selected sources, install a new version on behalf of the run, widen roots or grants, or use a same-name package. Reconcile effects and obtain a deliberate new current-source bundle/new-run decision before any later eligible work. Preserve the failed row and null dependent coverage; neither source restoration nor a new manifest retrospectively repairs it.

If this affects one review, the other independent review can finish on its admitted trusted inputs. The coordinator may retain that report, but `ui-write` remains blocked because both reviews are required. If it affects the writer, do not integrate its unaccepted capture or start `fresh-verify` as acceptance of it. Independent prerequisite inspection and source analysis remain possible; all affected delivery slots stay null. No script exception handler performs recovery.

## 8. Handle changed saved parent-catalog identity

Before considering saved replay, inspect the saved parent policy/bundle/runtime/session/catalog identity and the actual enabled catalog. A missing/changed catalog fingerprint must reject resume/restart with `PARENT_CAPABILITIES_CHANGED` **before generation mutation or dispatch**. Preserve that refusal and compare observed generation/worker/attempt state to ensure it did not advance. Do not turn cache invalidation, toggling enabled plugins, an edited fingerprint, or a steering instruction into a live grant.

Even unchanged explicitly selected role roots do not waive the parent catalog guard. An existing native thread has no supported setter for a missing skill root; no live grant or pre-expose-everything workaround is allowed. A fresh run under the current parent catalog is a separate explicit admission after prior-effect reconciliation, not an automatic response to this error. It must not replay the accepted completed writer or the historical unknown suffix. Keep the original run and its cached/failed/unknown rows unchanged. Cached replay does not establish present source freshness.

No resume/restart command is prescribed for either supplied recovery case. The CLI's general reconciled restart repeats the selected failed/unknown position **and every later worker**, potentially including completed writes. A reconciliation note alone cannot waive positive owned-job termination/native cleanup, source integrity or entire-suffix review. Because those prerequisites are not established in this scenario, the safe decision is inspection and blocked recovery, with independent eligible work only.

## 9. Attach the named live observer and consume it

The owner is **Dashboard UI coordinator observer**, acting in the originating conversation. For each actual admitted run, immediately inspect the receipt's `watch.required:true, attached:false` and execute its returned watch argv with the same Node/launcher/data/session identity. Do not return a detached receipt and call it observed. The owner must consume the stream, see its `attached` record, retain exact target identity and the initial cursor, and relay meaningful events promptly. There is no native parent-chat push guarantee or persistent consumer acknowledgement service.

Once the actual receipt fields have supplied `$ObservedRunId` and `$ObservedGeneration`, the equivalent exact public commands are:

```powershell
Invoke-WorkflowCli -WorkflowCliArguments @('status', $ObservedRunId, '--data-dir', $DataRoot)

# Run in the observer's owned streaming command session. Consume JSONL as it arrives.
& $Node $Launcher watch $ObservedRunId --session $OriginatingSession `
    --generation $ObservedGeneration --jsonl --after 0 `
    --poll-ms 500 --idle-ms 60000 --data-dir $DataRoot

# Reconnect only after binding the last fully received AND processed event cursor:
& $Node $Launcher watch $ObservedRunId --session $OriginatingSession `
    --generation $ObservedGeneration --jsonl --after $LastProcessedCursor `
    --poll-ms 500 --idle-ms 60000 --data-dir $DataRoot
```

These streaming calls intentionally do not capture all output into a PowerShell variable (which would delay delivery). The observer consumes complete JSONL records. For each durable event: process/relay it, persist its actual generation/sequence and handling fact in the coordinator's consumer ledger, then advance `LastProcessedCursor`. Never advance from a partial line, a guessed count, watch launch, a file's apparent last byte, or a disconnected output pipe. Keep the last received/written cursor as a separate observation if receipt precedes processing. On crash after receipt but before handling, reconnect from the earlier processed cursor and tolerate duplicate handling by exact event identity; do not skip unhandled events.

On reconnect retain the disconnect interval/gap, exact previous target and last processed cursor. Use a retained event in that current generation, or zero only if no event was processed. If generation changed, refresh status and explicitly bind the new exact target rather than reusing a stale cursor. If the cursor is refused or evidence is missing, report the gap; read retained status/events without inventing continuous coverage. Durable worker/run terminal events survive disconnect and are drained before exit. Advisory attached/progress/idle records are local live observer facts; a reconnect cannot recreate a missing live stream.

Relay `worker-progress`, failures, unknown outcomes, idle warnings, controls settling if separately authorized, terminal worker events and final run state/cleanup. Idle means no completed-command/file-change progress for the configured interval; commentary does not reset it and it does not establish a hang. Inspect, do not cancel/retry automatically. Worker terminals follow settled cleanup; forced-drain unknown may be deferred until aggregate close. Final run terminal notification/header follows backend cleanup and can retain negative facts.

Watch exits: 0 can mean completed **or output consumer disconnected**; distinguish by received terminal record and status, not exit code. Other terminal states exit 1, observation errors 2, explicit observer cancellation 130. Ctrl+C closes observation, not the run. If observer prerequisites fail, retain `attached:false` and promptly tell the coordinator; do not pretend admission is live monitored. A run deadline still applies, but it is not an observer substitute.

Use the same observer procedure for review, writer and fresh verification runs. Inspection after each terminal is mandatory even if the script returned a JSON object or `status` exited zero.

## 10. Inspect reviews, obtain failing tests, and release only the writer's own gate

After observing review terminals, use actual run/generation/position/attempt mappings and retain both original outcomes. The public inspection sequence below is reused for every producer. Before each use, resolve `InspectedRunId`, `InspectedGeneration`, `InspectedPosition`, and (where linked prior evidence exists) `SourceGeneration` from current status/worker records. Positions are zero-based; attempts are cumulative observed attempts, never guessed from the plan's one-attempt budget.

```powershell
Invoke-WorkflowCli -WorkflowCliArguments @('status', $InspectedRunId, '--data-dir', $DataRoot)
Invoke-WorkflowCli -WorkflowCliArguments @('result', $InspectedRunId, '--data-dir', $DataRoot)
Invoke-WorkflowCli -WorkflowCliArguments @(
    'worker', $InspectedRunId, '--generation', $InspectedGeneration,
    '--position', $InspectedPosition, '--data-dir', $DataRoot
)
Invoke-WorkflowCli -WorkflowCliArguments @(
    'events', $InspectedRunId, '--generation', $InspectedGeneration,
    '--position', $InspectedPosition, '--after', $ActivityCursor,
    '--limit', '50', '--data-dir', $DataRoot
)
```

Initially `ActivityCursor` is zero; paginate using actual returned page cursors. Keep shortened/discarded activity facts. A linked cached/prior read must add its actual `--source-generation`; do not request an unrelated prior execution. CLI events/activity paging is not the same cursor as watch terminal notifications. Preserve each independently.

Review acceptance requires independent concrete findings against unchanged frozen inputs, genuine selected activation, completion-source checks, completed original execution, positive cleanup, and no unsupported effects. Record rejection reasons. Resolve a single UI contract: compact run selection remains read-only until the documented explicit selection step; show meaningful reasons for failed/unknown/admission/cleanup outcomes without exposing secrets; preserve focus/keyboard behavior, selected-run identity and generation-safe controls. Scope is presentation only in the two owned files. Do not modify HTTP/control/authentication semantics or silently implement candidate selection behavior on an installed 0.3.5 runtime.

The coordinator reads `.testing/risk.yml` **when subsequently authorized to own test work**, before modifying tests. It extends existing invariant owners rather than duplicating suites and writes meaningful failing behavior tests first. Use `@lane merge` in the first comment, and `@subject engine/monitor/app.mjs`/`@subject engine/monitor/style.css` for DOM/subprocess/network-loaded subjects imports cannot reveal. Test actual public behavior and meaningful broken variants: wrong run selected, hidden failure reason, unsafe control enabling, and confusing Close/Stop. Use port 0 and unique owned temporary directories, no real-home fixtures. Record why a failure demonstrates missing behavior rather than a missing package or syntax error. Do not ask the UI writer to own tests or reproduce a failing environment as a product regression.

Freeze the accepted review packet with both exact producer identities, baseline hashes, accepted/rejected recommendations, shared interface decision, and coordinator failing-test commands/outcomes. If required review coverage is missing, do not launch the writer. A missing browser does not block this source/TDD handoff. The historical negative-drain case is a separate blocker: set `historicalEffectsReleased` only after actual coordinator evidence settles relevant ownership/effects and permits this new work; with the supplied facts it remains false.

Only after all writer barriers are factually released, resolve `$ReviewPacketPath`, `$ReviewPacketSha256`, and `$WriterSourcePacketPath`/`$WriterSourcePacketSha256` (including the coordinator's test changes) and use:

```powershell
$WriteArgsJson = @{
    stage = 'write'
    input = @{path = $WriterSourcePacketPath; sha256 = $WriterSourcePacketSha256}
    reviews = @{path = $ReviewPacketPath; sha256 = $ReviewPacketSha256}
    reviewUiAccepted = $ReviewUiAccepted
    reviewStyleAccepted = $ReviewStyleAccepted
    historicalEffectsReleased = $HistoricalEffectsReleased
    failingTestReady = $FailingTestReady
} | ConvertTo-Json -Depth 8 -Compress
if (-not ($ReviewUiAccepted -and $ReviewStyleAccepted -and
          $HistoricalEffectsReleased -and $FailingTestReady)) {
    throw 'Writer remains blocked; no replacement or partial-dependency dispatch'
}
if ([System.Text.Encoding]::UTF8.GetByteCount($WriteArgsJson) -gt 12288) {
    throw 'Writer descriptor exceeds plan budget'
}
$WriteStartReceipt = Invoke-WorkflowCli -WorkflowCliArguments @(
    'run', 'project:dashboard-ui-plan', '--cwd', $ProjectRoot,
    '--session', $OriginatingSession, '--data-dir', $DataRoot,
    '--access', 'parent', '--parent-access', $ParentAccessFile, '--writable',
    '--worker-capabilities', $CapabilityFile, '--args', $WriteArgsJson,
    '--concurrency', '1', '--max-attempts', '1',
    '--worker-timeout-ms', '900000', '--run-timeout-ms', '1200000'
)
```

Attach/consume the actual returned watch immediately. The writer creates an early useful minimal source checkpoint within three minutes of admitted task work, then reports concrete changed-path progress at least every few minutes. An intermediate checkpoint is inspectable evidence, not permission for early integration while the job is still active. Failure to reach it is a coordinator inspection point, not an automatic replacement trigger. Dependencies or packets transfer reviewed information, never predecessor worktree edits. Preserve the original accepted writer's baseline and allow only this deliberate two-file delta.

## 11. Apply the authoritative artifact and cleanup barrier

The coordinator, never the writer's prose result, owns this barrier. Before opening/applying output bytes, bind all the following in one retained acceptance record:

1. Actual producer run ID, data instance, originating session, original runtime/source/dependency identity, generation, zero-based position, cumulative attempt and native turn identity. Distinguish current execution from any linked source generation. Keep original execution status/result/error, activation, completion-source and usage/missing-usage evidence.
2. Actual immutable input/base snapshot identity and manifest, output manifest, capture policy (default/no exclusions here), any exclusions inventory, capture success stage, and authoritative blob/diff locations advertised by the retained worker record. A model-supplied path/hash, patch preview, terminal message, or self-reported `delivered` value is not authority.
3. Independently verify raw manifest bytes and every required blob's SHA-256, length, type and advertised path against the captured input/output inventory. Reject missing/truncated blobs, changed bytes, symlinks/reparse points/hardlinks, traversal/absolute output paths, unknown exclusion effects, undeclared output files, binary surprises, or capture errors. Inspect additions/modifications/deletions, including ignored outputs. The only permitted source delta is in `engine/monitor/app.mjs` and `engine/monitor/style.css`; a deletion or mode/type change requires explicit review and is not assumed acceptable. No test, lockfile, dependency, `.git`, configuration or other product delta is allowed from this writer.
4. Positive owned cleanup: native cleanup/inventory succeeded, Windows job reached zero (`jobEmpty:true`), retained root handle signaled exit, and no native terminal cleanup error or unknown inventory remains. Job-scoped proof does not establish absence of external brokers/effects; keep `descendants:notVerified` and inspect any task-relevant external effects separately. Process exit alone, model completion, a pause/stop receipt, or an empty job with a native cleanup error does not pass.
5. Confirm baseline compatibility with the stable destination and accepted preserved work. Verify the producer's expected input hashes still match the intended preimage and no active writer can change the destination during integration. Keep ownership of test changes with the coordinator. Reconcile effects before any operation on a suspect artifact; do not retry a failed apply automatically.

Use the actual writer identity from step 10 and inspect these bounded public views:

```powershell
Invoke-WorkflowCli -WorkflowCliArguments @(
    'patch', $InspectedRunId, '--generation', $InspectedGeneration,
    '--position', $InspectedPosition, '--basis', 'inputs', '--data-dir', $DataRoot
)
Invoke-WorkflowCli -WorkflowCliArguments @(
    'patch', $InspectedRunId, '--generation', $InspectedGeneration,
    '--position', $InspectedPosition, '--basis', 'base', '--data-dir', $DataRoot
)
Invoke-WorkflowCli -WorkflowCliArguments @(
    'exclusions', $InspectedRunId, '--generation', $InspectedGeneration,
    '--position', $InspectedPosition, '--stage', 'outputs', '--after', $ExclusionCursor,
    '--limit', '50', '--data-dir', $DataRoot
)
```

Initialize `ExclusionCursor` to zero and page if needed; inspect input exclusions too if present. A bounded preview cannot verify an entire large diff; use the retained authoritative files identified by the actual manifest. Record exact advertised artifacts and verified bytes, not inferred storage filenames. Never edit a database, clear locks, prune, hide unknown work to imply completion, or fabricate an acceptance receipt. This runtime has no authenticated task-acceptance service: a coordinator ledger is identified as such and must cite the independent evidence behind it.

The historical writer's `jobEmpty:false` and unverified capture fail this barrier regardless of output quality. Do not use its bytes. The separate accepted completed writer's unchanged verified bytes and cleanup remain accepted, with their own receipt intact. If new capture fails, preserve partial artifacts and `workspaceError.capture` stage/cause; larger current capture limits or later clean drain cannot retroactively validate that failed capture.

## 12. Integrate deliberately into one stable combined checkout

After the entire barrier passes, the coordinator prepares `CombinedRoot` in its assigned integration scope. It incorporates preserved accepted work, coordinator-owned tests, and the reviewed new two-file UI delta with explicit preimage/postimage hash checks. This is a deliberate future integration operation, not an automatic merge, cherry-pick, workflow dependency, or writer instruction. No commit, branch mutation, publication, Actions run, or release is required by this plan. Integration technique must not modify Git metadata or create filesystem links; use inspected regular-file source deltas within the coordinator's authorized checkout. If a write/apply operation exits nonzero or loses its response, stop dependent integration, retain partial effects and reconcile before another method/attempt.

Verify exactly one stable combined byte set after integration. Retain the two source files' raw SHA-256/lengths, test files and relevant configuration identities, a bounded normalized manifest/tree digest, base and accepted producer mapping, and any unrelated preserved bytes. Ensure no worker can still mutate this checkout; maintain it unchanged through tests and fresh verification. Avoid launch-time changes to generated inputs or saved definitions that would retarget it. If relevant bytes change, invalidate downstream freshness; do not reuse a cached verifier as acceptance of the new tree.

Windows ESM uses real file URLs: future Node helpers that load a test subject must use `import(pathToFileURL(absolutePath).href)` from `node:url`, never `import('C:\\...')`, manual slash concatenation or unescaped path fragments. This is Node-side test/coordinator guidance, not an import in the QuickJS script. Keep PowerShell invocation with `& $Node`/argument arrays and `login:false`; literal spaces in executable/cache paths are expected. Any helper must stay in coordinator-owned scope and must not evaluate the workflow script in the host.

## 13. Run coordinator-owned gates, then fresh independent verification

First run the affected tests using the existing suite owners and exact Node24 path. Before these commands, resolve the actual affected test paths from the accepted coordinator test work, the real installed `npm-cli.js` path under the coordinator-verified Node installation, and dependency/cache readiness in `CombinedRoot`. No `npm ci`, lifecycle install, browser download, or `npx` is implicit. A missing executable, package, cache or command-admission prerequisite blocks only dependent checks; preserve the exact path/command and observed evidence.

```powershell
# Resolved beforehand: $CombinedRoot, $AffectedTestPaths (actual array),
# $NpmCli (verified existing npm-cli.js), $Node, and all test prerequisites.
Push-Location -LiteralPath $CombinedRoot
try {
    & $Node --test @AffectedTestPaths
    if ($LASTEXITCODE -ne 0) { throw 'Affected tests failed; preserve output and effects' }
    & $Node $NpmCli test
    if ($LASTEXITCODE -ne 0) { throw 'npm test failed; no dependent acceptance' }
    & $Node $NpmCli run check
    if ($LASTEXITCODE -ne 0) { throw 'npm run check failed; no dependent acceptance' }
    & $Node $NpmCli run smoke
    if ($LASTEXITCODE -ne 0) { throw 'npm run smoke failed; no dependent acceptance' }
}
finally { Pop-Location }
```

These are the required full `npm test`, `npm run check`, and `npm run smoke` gates, not import-only selection. Capture actual commands, working directory, Node/npm/dependency identity, start/exit/truncation/effects, test counts/failures and combined hashes before/after. Failed commands launched and may have changed files; `notStarted` needs explicit no-process evidence. Test-generated artifacts must remain inside owned temporary/output scope and must not alter relevant combined source identities. Do not repeat broad testing without a new change/failure reason. No release is proposed, so clean-package installation checks, audit/network, CI/Actions and publication remain outside this task; do not claim their acceptance.

Freeze `IntegrationPacket` after the successful full gates. Include exact combined source/test identities, reviewed artifact and cleanup evidence, actual test receipts and their hashes, review decisions, preserved accepted work, original unknown historical outcome, and explicit null rendering. Source/test acceptance can be assessed independently; do not label the whole UI delivered.

Only now resolve `$IntegrationPacketPath`, `$IntegrationPacketSha256`, `$CombinedSourcePacketPath`/`$CombinedSourcePacketSha256` and actual acceptance booleans. Start a **new** verifier run, never resume or reuse review/writer output. The verifier's source and test-receipt task is read-only; rendering is still the coordinator's blocked acceptance obligation.

```powershell
$VerifyArgsJson = @{
    stage = 'verify'
    input = @{path = $CombinedSourcePacketPath; sha256 = $CombinedSourcePacketSha256}
    integration = @{path = $IntegrationPacketPath; sha256 = $IntegrationPacketSha256}
    integrationAccepted = $IntegrationAccepted
    fullGatesPassed = $FullGatesPassed
} | ConvertTo-Json -Depth 8 -Compress
if (-not ($IntegrationAccepted -and $FullGatesPassed)) {
    throw 'Fresh verification remains blocked on integration/full gates'
}
if ([System.Text.Encoding]::UTF8.GetByteCount($VerifyArgsJson) -gt 12288) {
    throw 'Verifier descriptor exceeds plan budget'
}
$VerifyStartReceipt = Invoke-WorkflowCli -WorkflowCliArguments @(
    'run', '--script', $ScriptPath, '--cwd', $CombinedRoot,
    '--session', $OriginatingSession, '--data-dir', $DataRoot,
    '--access', 'restricted', '--worker-capabilities', $CapabilityFile,
    '--args', $VerifyArgsJson,
    '--concurrency', '1', '--max-attempts', '1',
    '--worker-timeout-ms', '600000', '--run-timeout-ms', '900000'
)
```

The verifier uses `run --script $ScriptPath`, which avoids relying on project registry lookup in another checkout. Recheck that `ScriptPath` still has the exact bytes validated and saved earlier; the saved review/writer definition and the verifier script must have matching identity. Attach and consume the returned watch, inspect actual worker outcome, activation, completion sources, cleanup, and result. Freshness requires verifier-observed hashes equal the frozen combined identities before/after inspection. The verifier uses `test-strategy` genuinely, examines the completed coordinator test evidence and assesses remaining gaps independently. It does not create test files or inherit the writer's acceptance claim.

If the fresh verifier finds a defect, retain failed/null acceptance and the exact finding. Do not auto-loop another writer into this four-attempt campaign. The coordinator must make a new bounded task decision with a failing behavior test, stable baseline and reconciled prior effects. Cached replay or the same writer verifying its own patch cannot substitute for this step.

## 14. Keep rendering and dashboard controls distinct

Rendering remains blocked until the coordinator verifies actual browser executable/cache availability, startup and transport under its intended policy. Do not install, start a dashboard/service or open a browser during this evaluation. For a future authorized render, use an owned local monitor on port 0 and the **complete returned authenticated dashboard URL**, including its fragment; keep the URL/token private. Resolve the exact run ID rather than selecting the newest run by convenience. Presentation changes may use a separately reviewed current-UI choice while every inspected run keeps its original runtime/control owner; do not infer saved execution success from dashboard health.

Future dashboard inspection, only after resolving `$DashboardRunId` and actual original session/runtime/data identity:

```powershell
Invoke-WorkflowCli -WorkflowCliArguments @(
    'dashboard', $DashboardRunId, '--session', $OriginatingSession, '--data-dir', $DataRoot
)
```

The coordinator's actual render acceptance must exercise compact navigation in narrow and ordinary widths, keyboard/focus/selection, theme/contrast, and visible failed, unknown, idle and terminal reasons with safe bounded text. Include a deliberately different run and verify viewing/filtering does not silently arm its controls; respect the installed published-versus-candidate selection behavior. Verify that failure/cleanup and delivery coverage remain truthful and secrets are not shown. Retain browser/version/policy, exact rendered source bytes, fixture/actual-state scope, measurements/screenshots and observed interactions. A graph fixture is bounded presentation evidence, not subscription/model quality or historical recovery proof.

**Close** stops the monitor; closing a browser tab alone stops neither monitor nor workflow. **Stop** is an execution control that interrupts active turns/stops admission and then must settle through cleanup. It cannot roll back file effects. Pause drains active work and is also not a rollback. Viewing/navigating is not a control mutation. Controls require the actual originating session plus freshly observed generation and, for worker controls, the actual position/attempt/turn. A control receipt acknowledges a request before settlement; inspect its receipt and final status/cleanup. No Stop/Pause/restart command is authorized or needed by this plan-writing task, and no automatic idle/unknown intervention is prescribed.

If rendering cannot run, record `renderAcceptance:null`, exact missing browser/cache/command/transport evidence, and the independent source/test checks that did pass. Do not substitute a browser directory listing, readiness query, screenshots from a different tree, a source reviewer, or cached output. Keep the required render acceptance open; no whole-deliverable completion claim is permitted.

## 15. Report exact coverage and retain the unresolved outcomes

At each gate the coordinator reports original run/generation/position/attempt identities, actual statuses, model attempts/observed usage, source/capability/catalog identities, readiness and activation separately, capture/integrity/cleanup, processed watch cursor and reconnect gaps, test receipts and combined hashes, and accepted/missing objective subcoverage. No reported status is upgraded because a CLI read exited zero or the evaluator returned a result.

The supplied facts currently support only a plan. Before hypothetical execution, all coordinator values remain unresolved, the historical writer still has `jobEmpty:false` with unverified capture, the separate completed writer's accepted unchanged bytes must be preserved, the skill-removal and catalog-change recovery paths remain fail-closed, and browser rendering is unverified. The numbered steps provide guarded authoring/integration/fresh-verification commands for later eligible work; they do not assert those guards were released. Safe independent reviews and prerequisite investigation may continue when their exact input/policy conditions are proved. Blocked dependencies retain null coverage.

The final coordinator delivery must distinguish source review acceptance, authored bytes, coordinator integration, full tests, fresh independent verification, rendered acceptance, and historical recovery. Leave every unknown/missing item explicit. This authoring artifact's own final response contains only its actual path, exact-byte SHA-256, byte count and a bounded summary; it supplies no self-score or efficacy claim.
