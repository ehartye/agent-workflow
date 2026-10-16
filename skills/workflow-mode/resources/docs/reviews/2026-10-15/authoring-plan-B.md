# Compact run navigation and visible failure reasons: authoring and recovery plan

This is an executable procedure for a future authorized coordinator, not a workflow execution receipt. The present evaluation authorizes only this Markdown file. No workflow, test, installation, dashboard, browser, service, worker, recovery control or integration is being executed. The historical facts below remain historical facts, not observations made by this author.

The intended order is two independent source reviews, one UI writer, coordinator review and integration, then a new independent combined verifier. The supplied history prevents automatic dispatch of the UI replacement and its dependent verification. This plan preserves that block, useful independent reviews, the separate accepted writer, and missing render acceptance. A complete plan does not imply a completed product deliverable.

## 1. Establish authority, sources and retained objectives

1. Read the assigned checkout's `AGENTS.md`, the complete `authoring-scenario.md` and `authoring-rubric.json`. Those were read in this evaluation. Repository API and source at the exact launch checkout describe current behavior; historical reports and copied cache bodies cannot override them. The evaluation's read/write restrictions override general instructions to discover, ingest or update the wiki. No wiki or external write belongs to this evaluation. A future coordinator can separately authorize wiki work; it must have its own external path ownership and cannot be smuggled into a project capture.

2. Activate the selected authoring skills through the native executor. This author invoked genuine `skills.list({authority:{kind:'executor'}})`, followed its returned catalog cursors through the last page, and invoked `skills.read` using the returned package and main resource for each selected identity:

   | Selected identity | Enabled catalog name | Returned `skill_root`, confirmed against the selection |
   | --- | --- | --- |
   | `workflow-candidate` | `agent-workflow:agent-workflow` | `C:\Users\ehart\repos\agent-workflow-worktrees\review-run-picker\skills\agent-workflow` |
   | `authoring-candidate` | `agent-workflow:workflow-authoring` | `C:\Users\ehart\repos\agent-workflow-worktrees\review-run-picker\skills\workflow-authoring` |

   Both returned main reads completed with `next_cursor:null`. Their front-matter names were `agent-workflow` and `workflow-authoring`. The same-name cached installation was not selected. Package resources were read through native `skills.read`: the workflow runtime API, worker prerequisites and controls; authoring large inputs/batches, worker admission/replay, complete-plan acceptance and delivery contract. Their returned reference reads had no continuation. Out-of-package public repository documentation was read as ordinary documentation in the assigned checkout, not by inventing a native resource URI. No shell read of a skill body substituted for activation. These are this plan author's activation observations; they are not activation evidence for any future worker.

3. Retain these objective IDs through reports, revisions and acceptance:

   | Objective ID | Required result |
   | --- | --- |
   | `compact-navigation` | Compact, understandable run navigation, preserving run identity, selection and stale-data safeguards. |
   | `visible-failure-reasons` | Readable, actionable failure/unknown reasons and missing coverage, without treating an unknown result as success. |
   | `fresh-combined-checks` | Independent verification of the exact coordinator-integrated source and tests, with the full test/check/smoke gates. |
   | `render-acceptance` | Actual painted dashboard inspection at agreed desktop and narrow viewports, in required states; browser/transport readiness and evidence are required. |

   Preserve original engine status, declared task outcome, capture integrity, integration status and accepted verification separately. Neither a model's final answer nor engine `completed` establishes any of these objectives. This procedure's final output must remain incomplete while a required objective lacks acceptance.

## 2. Resolve coordinator inputs before dependent commands

4. The following values are unresolved. The coordinator must resolve and record them from its actual session, installation and saved records before the indicated commands. Angle brackets, null provenance and descriptive references are never real IDs or proof.

   | Value | Required evidence and dependent use |
   | --- | --- |
   | `$OriginSession` | Actual originating coordinator identity from its session context, or verified `CODEX_THREAD_ID`. Never borrow this evaluation child's identity. Required for starts, observer identity, controls and dashboard creation. |
   | `$Project`, `$Data`, `$CombinedCheckout`, `$EvidenceDir` | Canonical absolute paths to a stable reviewed launch checkout, the one explicit data instance, a dedicated stable combined checkout and coordinator-owned evidence storage. Verify ownership and absence of filesystem links. `$Project` is the exact source for delivery; `$CombinedCheckout` is the exact source for verification. |
   | `$Node`, `$Toolchain` | Coordinator-verified `C:/Program Files/nodejs/node.exe`, actual v24+ version and file hash. `$Toolchain` is `{node:{path,version,sha256}}` with those actual values and is passed to workers as an identity to verify, not as a passed-readiness claim. This is the only Node executable named by this evaluation. Verify the path in the eventual coordinator and each worker environment rather than assuming presence proves admission. |
   | `$NpmCmd` | Verified absolute `npm.cmd` paired with that Node installation. Required only for coordinator test gates, not a guessed `npm.ps1`. |
   | `$PluginRoot`, `$Cli` | Exact installed plugin source and public `bin/launch.mjs`, runtime/source/dependency identities and setup receipt. New starts use that explicitly installed package; old IDs use their retained runtime. Do not equate the candidate skill checkout with an installed runtime. |
   | `$ParentAccessFile` | Coordinator-owned current six-field permission snapshot described below. It is not supplied or attested by this child. |
   | `$BundleFile` | Immutable reviewed public version-1 role bundle, original resource hashes and actual local readiness observations. Resolve `beautiful`, `tdd`, `test-strategy` before any worker selects them. |
   | `$Script`, `$DeliverArgsFile`, `$VerifyArgsFile` | Coordinator-owned files materialized from the literal script and small JSON construction below. Only the Markdown exists in this evaluation. Argument files here are local preparation files read by PowerShell, not the candidate CLI `--args-file` flag. |
   | `$SourceSnapshot` | Frozen input manifest reference/hash, actual launch-source file hashes and known test baseline. It must exclude uncertain historical effects. Workers verify their assigned bytes before interpreting them. |
   | `$AffectedTests`, `$RedEvidenceRef` | Existing invariant/test owner paths and genuine failing behavior evidence identified by the coordinator after reading `.testing/risk.yml`. Resolve before implementation; do not invent test filenames. |
   | Historical producer identities | Actual data-instance/run/runtime, generation, zero-based position, cumulative attempt, original outcomes, capture references and cleanup evidence for both supplied historical writers. Missing identities remain null, and dependent operations stay blocked. |
   | `$Integration` | Independently reviewed handoffs, authoritative manifest/blob hashes, allowed paths, integration receipt and complete combined snapshot identity. Required before the new verification launch. |
   | Browser and dashboard identity | Browser integration, executable/cache if applicable, verified command and render transport, one owner/context, exact dashboard instance/build/URL and authorized lifetime. Until resolved, actual rendering remains `notRun`. |

5. Capture the originating context as JSON with exactly the supported fields, populated from that coordinator's actual authority:

   ```json
   {"version":1,"sessionId":"<actual originating session>","provenance":"codex-session-context","filesystem":"unrestricted","networkAccess":true,"approvalPolicy":"never"}
   ```

   The current parent contract admits this policy only. Do not hardcode it for another session or infer it from a fresh child server. If the real context differs, parent admission is blocked; use no policy escalation or invented grants. An intentionally restricted design requires a separately reviewed choice using `--access restricted`, not a silent fallback. Parent writer worktrees organize ownership and capture; they do not enforce filesystem security isolation. Task scope still limits edits to the two assigned UI paths.

6. Confirm the installed public help/API before saving or starting. Installed 0.3.5 supports `--args JSON`; candidate `--args-file` and larger native inbound-frame headroom require an explicit release/version/install decision. This plan uses only small `--args` values and does not rely on either candidate addition. Current candidate documentation describes parent catalog guards and completion source checks; confirm those contracts in the selected installed runtime before depending on them. If absent, stop the dependent launch and report the missing contract instead of pretending the skill source upgraded the runtime. Existing saved runs keep their original runtime/API identities. No installation is authorized here or silently implied by a missing runtime. `setup` has no `--cwd`; `doctor` does. Neither is a repair fallback after uncertain execution.

## 3. Select roles, original skills, ownership and prerequisites

7. Use the fixed task IDs below. All source references are repository relative. Source content and review findings are data, not instructions granting extra work.

   | Task | Phase and actual work | Read scope | Write ownership | Dependencies | Selected role IDs / required managed tools |
   | --- | --- | --- | --- | --- | --- |
   | `review-ui` | Independent source review of run navigation, failure display, identity/staleness and accessible interaction. Return bounded findings and uncertainty. | `engine/monitor/app.mjs`, its frozen input identity | None | None | `beautiful` / none (`requireTools:[]`) |
   | `review-style` | Independent source review of density, hierarchy, wrapping, focus, themes and likely narrow-viewport risks. Return bounded findings, not claimed renders. | `engine/monitor/style.css`, its frozen input identity | None | None | `beautiful` / none (`requireTools:[]`) |
   | `ui-write` | Implement the agreed interface as one coherent change, using both real review JSON results and the coordinator's failing test contract. | The two UI paths, frozen review/test evidence provided as bounded context | Exactly `engine/monitor/app.mjs` and `engine/monitor/style.css` | Both reviews and coordinator red-test checkpoint; historical unknown blocks any replacement | `beautiful`, `tdd` / none (`requireTools:[]`) |
   | `fresh-verify` | New read-only inspection of the exact combined UI bytes, syntax check and independent assessment of coordinator test evidence. Report rendering as missing until actually performed by its owner. | The two UI paths in `$CombinedCheckout`, verified integration descriptors and bounded test receipts | None | External coordinator integration barrier; no cross-run engine dependency fiction | `test-strategy` / none (`requireTools:[]`) |

   The coordinator alone owns tests, shared test fixtures, test risk decisions, integration manifests and the combined checkout. It reads `.testing/risk.yml` before changing tests, extends the existing invariant owner, adds `@lane merge` in the first comment and `@subject` for DOM/subprocess subjects as needed, and demonstrates the failure before the UI writer runs. Temporary fixtures use port 0 and unique owned temporary directories. No writes to the real home directory. No lockfile, runtime, schema, package, hook, service or other product edits are assigned. The one UI writer owns the JS/CSS interface, selectors and failure copy together. Review suggestions cannot create additional writers or widen paths, including Windows case-equivalent paths.

8. Resolve role IDs to actual original sources before bundle admission. Catalog discovery in this evaluation made the following possible originals visible; the coordinator must verify its own current enabled catalog, returned identities, hashes and resources. These locations are discovery evidence, not already-admitted worker packages:

   | Role ID | Deliberate original selection to verify |
   | --- | --- |
   | `beautiful` | `hartye-skills:beautiful`, original `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\hartye-skills\0.4.0\skills\beautiful` |
   | `tdd` | `h-superpowers:test-driven-development`, original `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\h-superpowers\4.16.0\skills\test-driven-development`; deliberately distinguish the also-visible `h-superpowers-dev` copy. |
   | `test-strategy` | `agent-tests:test-strategy`, original `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\agent-tests\0.4.1\skills\test-strategy` |

   Do not fabricate `skill://beautiful` aliases or install/cache identities from these role names. Each future worker must call genuine `skills.list` with executor authority, consume its catalog pagination, select the returned package/main_resource by original identity, call genuine `skills.read`, check returned `skill_root`, and follow native resource/cursor pagination for required in-package references. If an exact identity is missing, disabled, ambiguous or mismatched, report that missing stage. No manual `SKILL.md` read, copied instruction body, CLI discovery or this author's activation substitutes. An out-of-package ordinary reference needs an explicitly declared original path/hash and authorized bounded read after activation; a skill cannot broaden task scope.

9. The coordinator constructs the bundle using the exact `docs/api.md` version-1 shape: `version:1`, `skills:[{id,name,root,path,sha256,references:[{path,sha256}]}]`, `tools:[]`. For each skill, `root` is its original source layout root, `path` is its absolute original main file, and reference paths are normalized within that root. Hash every exposed file beneath the exact selected skill directory, retaining layout and required ordinary references. No relocated skill copies, links, nested undeclared skills or blanket plugin-directory binding. Reject duplicate IDs/names/paths and unknown fields. Keep the bundle below 256 KiB and the documented per-skill scan/reference limits. The runtime derives exact local `selectedCapabilityRoots`; scripts select only bundle IDs.

   `tools:[]` is deliberate: these four roles need source/design/testing instructions and ordinary admitted file/Node operations, not a plugin-managed asset CLI. No required browser or asset tool is being made optional to bypass readiness. The browser is a required acceptance prerequisite for `render-acceptance`, but is not needed to produce source reviews or source code. If a later scope truly requires a managed CLI before inference, the coordinator must declare its actual Node/launcher/runtime/dependency/environment/receipt identity and reviewed nonmutating readiness stages, associate it with the skill IDs, and select it in `requireTools` in a newly admitted plan. Do not invent an arbitrary shell tool bundle or hot-grant one to an existing thread.

10. Record prerequisites in four distinct stages under each actual worker policy, not merely on the host:

    1. Executable/source discovery: exact Node, launcher, runtime/dependency and skill/reference paths and hashes; browser/cache installation separately if applicable.
    2. Command admission: a bounded authorized nonmutating command actually starts and exits under that worker's policy. Node presence/version on the host is insufficient. Reviewers need only admitted source reads. The writer/verifier's first Node check can be `& $Node --check engine/monitor/app.mjs` when applicable; record startup, exit and output independently.
    3. Browser installation: the actual browser package and binary exist at the selected verified cache, if that integration uses one. This alone proves no render.
    4. Render transport: that integration can launch, communicate with and paint the intended page in the eventual environment. Host render success or DOM availability alone is insufficient.

    In workers use PowerShell without profile loading (`login:false`; `-NoProfile -NonInteractive` for an explicitly launched PowerShell), the call operator for quoted executable paths and separate arguments. Use explicit UTF-8 and bounded reads. Use verified `npm.cmd` rather than `npm` resolving to an execution-policy-blocked script. Use `pathToFileURL(absolutePath).href` when an authorized Node ESM harness imports an absolute Windows path; a bare `C:\...` is not an ESM import URL. For example, an eventual coordinator harness can use `import {pathToFileURL} from 'node:url'; const subject = await import(pathToFileURL(process.argv[2]).href);` in its own ordinary test module. This is not permission to import a workflow script into Node: the saved workflow is evaluated only by the separate QuickJS evaluator.

    Missing render transport pauses rendering, not independent source work. Missing authoring source/skill readiness pauses that task. Failed commands are reported with exact executable, argv, cwd, package/cache path, stage, observed process-start evidence, exit or explicit unknown, sanitized evidence reference and dependent checks left unrun. A launched command that exits nonzero was executed and may have mutated files; `notStarted` requires explicit no-process evidence. No install, policy/global configuration change, alternate backend/version or potentially mutating retry follows. The coordinator reconciles uncertain effects first.

## 4. Freeze inputs, output contracts and budgets

11. Choose small inline JSON. The coordinator prepares the complete fixed four-task `PlanRevisionV1` and frozen source/integration descriptors. There is no bulk dataset, chunk expansion, invented task generator or unbounded reducer. Keep script below 32 KiB, prepared args below 24 KiB UTF-8, each final prompt below 24,000 UTF-16 code units and each worker result below 42,000 JSON characters. Native and evaluator limits are separate: 1 MiB script, precise 2 MiB combined evaluator envelope and separate 2 MiB header/detached records, 1 MiB broker/final messages, 65,536 UTF-16 prompt units, 512 KiB native answer and 1 MiB retained previews. Leave headroom for the bundle, catalog and saved metadata. A passing input preflight is not a promise that later admission records fit. Do not dump source files into args or return bulk input.

    The output choice is small schema results for readers/verifier and exactly two captured source files plus a small schema result for the writer. Detailed UI code belongs in those owned files. Each artifact claim gives relative path, exact byte hash/count and format through context; claims are independently checked against retained capture. This plan itself is a complete owned artifact limited to 80 KiB, not a conversational continuation.

12. Freeze a stable source after the coordinator finishes temp-producing tests and records the red baseline. No concurrent fixture creation/removal, dependency preparation or source edits may race input capture. Record manifest provenance, paths, SHA-256 and byte counts for assigned files, the full launch snapshot identity and any excluded/inaccessible inputs. A manifest path alone does not prove freshness. The two reviews each read only their assigned source; their JSON is passed into the actual writer prompt. They do not write producer files that the writer would need to inherit. If another producer's actual bytes are needed, stop that dependent portion until a coordinator supplies a newly verified launch snapshot.

13. Bound the complete lifetime, including corrections and every stage:

    | Stage | Batch size / concurrency | Calls and attempts | Worker deadline | Run wall deadline |
    | --- | --- | --- | --- | --- |
    | Delivery | One parallel batch of two reviews, then at most one writer; CLI concurrency 2 | At most 3 requests, `maxAttempts:1` each | Reviews 300,000 ms each; writer 900,000 ms | 1,800,000 ms including queueing/waits |
    | Fresh verification | One new verifier; CLI concurrency 1 | At most 1 request, `maxAttempts:1` | 600,000 ms | 1,200,000 ms |
    | This supplied blocked-history branch | Reviews only once independently admissible; writer/verifier slots null | At most 2 requests | Same review limits | Same delivery wall bound |

    At most two planned new starts across the full normal procedure and four lifetime worker starts/attempts; no automatic revision rounds, replacement workers, schema correction turns or self-replanning. There are fewer than 20 broker calls including phases/logs across both stages, far below 10,000, and at most two concurrent pending workers, below 4,096. A phase is display grouping, not a dependency. Concurrency does not bound total requests. The system cap of 1,000 requests/lifetime attempts is not this plan's budget.

    Readiness and task execution share each worker's deadline beginning immediately before readiness after App Server/thread startup. Remaining-time caps apply to every command/RPC; no later turn starts after expiry. Startup and owned cleanup have their separately enforced runtime bounds; timeout is not proof of successful drain. The 32 MiB QuickJS heap, 512 KiB stack, one-second CPU slices and five-second no-broker-work idle protection remain enabled. Observed usage is not a spending cap. Default unlimited run lifetime is deliberately replaced by the wall limits above; dashboard lifetime remains separately owned.

## 5. Prepare the fixed plan arguments

14. Before using the script or commands, the coordinator resolves the values in section 2. The following PowerShell constructs the complete small plan value; it is proposed authoring code, not executed by this evaluation. Standard `PlanRevisionV1` task fields hold ownership/checkpoints/prerequisites; custom orchestration selects skills directly on `agent`, not by pretending the bundled recipe forwards new task fields. Read-only tasks legitimately have no captured artifacts. This custom script does not invoke the stricter delivery recipe validator, which requires writer artifacts per task.

    ```powershell
    # All variables here must already be resolved by the originating coordinator.
    $UiPaths = @('engine/monitor/app.mjs', 'engine/monitor/style.css')
    $Objectives = @(
      @{id='compact-navigation'; description='Compact and safe run navigation'},
      @{id='visible-failure-reasons'; description='Visible failure and unknown reasons'},
      @{id='fresh-combined-checks'; description='Fresh combined verification and full gates'},
      @{id='render-acceptance'; description='Actual painted dashboard acceptance'}
    )
    $BrowserPrerequisite = @{
      id='browser-render'; command='Coordinator-owned painted dashboard inspection'
      executablePath=$null; cachePath=$null; requiredFor='verification'
    }
    $ReviewUi = @{
      id='review-ui'; objectiveIds=@('compact-navigation','visible-failure-reasons')
      phase='Independent source review'; inputs=@('Verify assigned input hash; review app source only; report bounded findings and missing rendering')
      exclusions=@('node_modules/','.git/','.local/'); readScope=@($UiPaths[0]); writeOwnership=@()
      prerequisites=@(); dependsOn=@(); artifactContract=@()
      acceptanceChecks=@(@{id='app-source-review'; command='Inspect assigned source with exact locations'; required=$true})
      limits=@{timeoutMs=300000}
    }
    $ReviewStyle = @{
      id='review-style'; objectiveIds=@('compact-navigation','visible-failure-reasons')
      phase='Independent source review'; inputs=@('Verify assigned input hash; review style source only; report source-supported layout risks, not a render')
      exclusions=@('node_modules/','.git/','.local/'); readScope=@($UiPaths[1]); writeOwnership=@()
      prerequisites=@(); dependsOn=@(); artifactContract=@()
      acceptanceChecks=@(@{id='style-source-review'; command='Inspect assigned source with exact locations'; required=$true})
      limits=@{timeoutMs=300000}
    }
    $UiWrite = @{
      id='ui-write'; objectiveIds=@('compact-navigation','visible-failure-reasons')
      phase='Owned UI implementation'
      inputs=@('Use both actual review JSON results', $RedEvidenceRef,
        'Early checkpoint: smallest working run selector and visible failure/unknown reason in the two owned files, then Node syntax check before polish',
        'Coordinator owns tests; no predecessor files transfer through dependsOn')
      exclusions=@('node_modules/','.git/','.local/'); readScope=$UiPaths; writeOwnership=$UiPaths
      prerequisites=@($BrowserPrerequisite); dependsOn=@('review-ui','review-style')
      artifactContract=@(
        @{claimId='ui-app'; relativePath=$UiPaths[0]},
        @{claimId='ui-style'; relativePath=$UiPaths[1]}
      )
      acceptanceChecks=@(
        @{id='app-syntax'; command='Verified Node --check engine/monitor/app.mjs'; required=$true},
        @{id='red-green'; command='Coordinator executes resolved affected invariant tests on exact source'; required=$true},
        @{id='painted-ui'; command='Coordinator-owned painted dashboard inspection'; required=$true}
      )
      limits=@{timeoutMs=900000}
    }
    $FreshVerify = @{
      id='fresh-verify'; objectiveIds=@('fresh-combined-checks','render-acceptance')
      phase='Fresh combined verification'; inputs=@('Inspect exact stable integrated bytes and coordinator check receipts; no cached replay acceptance')
      exclusions=@('node_modules/','.git/','.local/'); readScope=$UiPaths; writeOwnership=@()
      prerequisites=@($BrowserPrerequisite); dependsOn=@('ui-write'); artifactContract=@()
      acceptanceChecks=@(
        @{id='combined-source'; command='Verify actual integrated UI file hashes and inspect behavior'; required=$true},
        @{id='full-gates'; command='Coordinator npm.cmd test, run check, run smoke'; required=$true},
        @{id='painted-ui'; command='Coordinator-owned painted dashboard inspection'; required=$true}
      )
      limits=@{timeoutMs=600000}
    }
    $PlanRevision = @{
      version=1; revision=1; priorRun=$null; objectives=$Objectives
      tasks=@($ReviewUi,$ReviewStyle,$UiWrite,$FreshVerify); replacements=@()
    }
    # These are supplied scenario facts with unresolved record identities.
    # They must not be changed to null to unlock the writer.
    $History = @{
      unknownWriter=@{producer=$null; modelOutputFinished=$true; jobEmpty=$false; captureVerified=$false; effects='uncertain'}
      preservedWriter=@{producer=$null; bytesUnchangedVerified=$true; cleanupPositive=$true; acceptanceRef=$null}
      requiredPackageLoss=@{producer=$null; evidenceRef=$null}
      changedParentCatalog=@{run=$null; evidenceRef=$null}
    }
    $DeliverArgs = @{
      stage='deliver'; planRevision=$PlanRevision; inputSnapshot=$SourceSnapshot; toolchain=$Toolchain
      history=$History; integration=$null
    }
    $Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    $DeliverJson = ConvertTo-Json -InputObject $DeliverArgs -Depth 30 -Compress
    if ([System.Text.Encoding]::UTF8.GetByteCount($DeliverJson) -gt 24576) { throw 'Narrow inputs before launch' }
    [System.IO.File]::WriteAllText($DeliverArgsFile, $DeliverJson, $Utf8NoBom)
    ```

    `$SourceSnapshot` must contain `{ref,sha256,files:[{path,sha256,bytes}]}` with both UI paths and actual nonnegative byte counts/lowercase 64-hex hashes. The referenced snapshot manifest and test evidence are coordinator-owned immutable inputs. No placeholder strings are execution-ready. The history's producer nulls preserve missing identity; they must be resolved from retained evidence before historical inspection/integration, and their uncertainty block is independent of whether an ID is known. Do not populate `replacements` with a pretend recovery admission. A later explicitly authorized revision preserves every original objective and links exact historical identities without overwriting revision 1.

## 6. Literal saved QuickJS workflow script

15. The coordinator materializes this whole block at `$Script`. Its first statement is literal exported metadata; the rest is the supported async body with top-level return. Do not import, `eval` or run this script in Node/PowerShell. Use the public validator and QuickJS workflow runtime. It uses no Node globals, clock/random, filesystem, shell, network, child workflow API or host evaluator.

    The script describes the normal authoring shape and enforces the supplied history's block. With section 5's history, it can request only the two independent reviews. It cannot authorize the proposed replacement even if someone supplies a nonempty reconciliation string. A future coordinator decision for remaining work requires a separately reviewed fresh admission after reconciliation, retaining the old history outside any new execution; clearing this argument, renaming a task or using the unused branch below is not that decision.

    ```javascript
    export const meta = {name:'compact-run-navigation',description:'Bounded source reviews and UI delivery, followed by coordinator-gated fresh verification'};

    const paths = ['engine/monitor/app.mjs','engine/monitor/style.css'];
    const expectedIds = ['review-ui','review-style','ui-write','fresh-verify'];
    const objectiveIds = ['compact-navigation','visible-failure-reasons','fresh-combined-checks','render-acceptance'];
    function requireValue(ok, message) { if (!ok) throw Error(message); }
    function digest(value) {
      return typeof value === 'string' && value.length === 64 &&
        value.split('').every(c => '0123456789abcdef'.includes(c));
    }
    function text(value, max) { return typeof value === 'string' && value.length > 0 && value.length <= max; }
    requireValue(args && (args.stage === 'deliver' || args.stage === 'verify'), 'Explicit stage required');
    requireValue(JSON.stringify(args).length <= 24000, 'Narrow the reviewed argument value');
    const plan = args.planRevision;
    requireValue(plan && plan.version === 1 && plan.revision === 1, 'Use the reviewed fixed revision');
    requireValue(Array.isArray(plan.tasks) && plan.tasks.length === 4, 'Exactly four task slots');
    requireValue(plan.tasks.every((t,i) => t.id === expectedIds[i]), 'Task identity/order mismatch');
    requireValue(Array.isArray(plan.objectives) && plan.objectives.length === 4 &&
      plan.objectives.every((o,i) => o.id === objectiveIds[i]), 'Retain every objective');
    requireValue(Array.isArray(plan.replacements) && plan.replacements.length === 0, 'No in-guest recovery admission');
    requireValue(plan.priorRun === null, 'Historical recovery is coordinator-owned, not guest replay');
    requireValue(args.history && Object.prototype.hasOwnProperty.call(args.history,'unknownWriter') &&
      Object.prototype.hasOwnProperty.call(args.history,'preservedWriter'), 'Retain supplied history');
    const toolchain = args.toolchain;
    requireValue(toolchain && toolchain.node &&
      toolchain.node.path === 'C:/Program Files/nodejs/node.exe' && digest(toolchain.node.sha256) &&
      text(toolchain.node.version,100) && Number(toolchain.node.version.replace('v','').split('.')[0]) >= 24,
      'Coordinator-verified Node identity required; worker admission is still separate');
    const snapshot = args.inputSnapshot;
    requireValue(snapshot && text(snapshot.ref,1000) && digest(snapshot.sha256) &&
      Array.isArray(snapshot.files) && snapshot.files.length === 2, 'Frozen source identity required');
    requireValue(snapshot.files.every((f,i) => f.path === paths[i] && digest(f.sha256) &&
      Number.isInteger(f.bytes) && f.bytes >= 0), 'Invalid assigned file identity');
    const unknownPrior = args.history.unknownWriter !== null;

    const findingSchema = {
      type:'object',properties:{
        path:{type:'string',enum:paths},line:{type:'integer',minimum:1,maximum:200000},
        detail:{type:'string',maxLength:600},check:{type:'string',maxLength:600}
      },required:['path','line','detail','check'],additionalProperties:false
    };
    const blockerSchema = {
      type:'object',properties:{
        code:{type:'string',maxLength:100},command:{type:'string',maxLength:1024},
        executable:{type:['string','null'],maxLength:1024},cache:{type:['string','null'],maxLength:1024},
        evidence:{type:'string',maxLength:1024}
      },required:['code','command','executable','cache','evidence'],additionalProperties:false
    };
    function resultSchema(id) {
      return {
        type:'object',properties:{
          contract:{type:'string',const:'compact-run.task.v1'},taskId:{type:'string',const:id},
          outcome:{type:'string',enum:['reported','blocked','incomplete']},
          summary:{type:'string',maxLength:2000},
          findings:{type:'array',maxItems:6,items:findingSchema},
          blockers:{type:'array',maxItems:4,items:blockerSchema},
          artifacts:{type:'array',maxItems:2,items:{
            type:'object',properties:{
              path:{type:'string',enum:paths},sha256:{type:['string','null'],maxLength:64},
              bytes:{type:['integer','null'],minimum:0,maximum:536870912}
            },required:['path','sha256','bytes'],additionalProperties:false
          }},
          checks:{type:'array',maxItems:8,items:{
            type:'object',properties:{
              id:{type:'string',maxLength:100},
              status:{type:'string',enum:['passed','failed','notRun','unknown']},
              evidence:{type:'string',maxLength:1000}
            },required:['id','status','evidence'],additionalProperties:false
          }},
          missingObjectiveIds:{type:'array',maxItems:4,items:{type:'string',enum:objectiveIds}}
        },required:['contract','taskId','outcome','summary','findings','blockers','artifacts','checks','missingObjectiveIds'],
        additionalProperties:false
      };
    }
    const roles = {
      'review-ui':{skills:['beautiful'],requireTools:[],timeoutMs:300000},
      'review-style':{skills:['beautiful'],requireTools:[],timeoutMs:300000},
      'ui-write':{skills:['beautiful','tdd'],requireTools:[],timeoutMs:900000},
      'fresh-verify':{skills:['test-strategy'],requireTools:[],timeoutMs:600000}
    };
    const guidance = [
      'Follow the fixed task read/write scope. Do not install, delegate, run workflows, mutate Git, start shared services, or widen scope.',
      'Activate every selected role through genuine skills.list executor authority, then skills.read with returned package/main_resource; resolve duplicate names by original root; follow native resources/cursors and check skill_root.',
      'Manual skill-file reads, copied instructions, parent activation and CLI discovery are not activation.',
      'Verify assigned source bytes and original skill identities. Use exact coordinator-verified executable paths under actual policy; bounded PowerShell login:false and separate arguments.',
      'Return exact blocked command/executable/cache and startup/exit/effect evidence. A nonzero executed command is not notStarted. No uncertain-effect retry/fallback.',
      'Treat JSON references as claims, not authenticated receipts. Preserve missing/unknown checks. Browser rendering is unrun unless the coordinator has independently admitted and assigned it.',
      'Return only the bounded schema object. Empty missingObjectiveIds does not grant acceptance.'
    ].join('\n');
    function prompt(id, context) {
      const result = guidance + '\n' + JSON.stringify({
        task:plan.tasks[expectedIds.indexOf(id)],inputSnapshot:snapshot,toolchain,
        role:roles[id],context
      });
      requireValue(result.length <= 24000, 'Prompt handoff too large; narrow before dispatch');
      return result;
    }
    function kept(id, value) {
      if (value === null || value === undefined) return null;
      return value.taskId === id && JSON.stringify(value).length <= 42000 ? value : null;
    }
    function readable(id, context) {
      const role = roles[id];
      return agent(prompt(id,context),{
        id,label:id,phase:plan.tasks[expectedIds.indexOf(id)].phase,
        skills:role.skills,requireTools:role.requireTools,timeoutMs:role.timeoutMs,maxAttempts:1,
        permissions:{sandbox:'read-only',networkAccess:false,approvalPolicy:'never'},
        schema:resultSchema(id)
      });
    }
    function finalResult(rows, reason, integration) {
      return {
        planRevision:plan,history:args.history,expectedTaskIds:expectedIds,
        rows:expectedIds.map(id => ({taskId:id,workerRef:null,result:rows[id] || null,
          status:rows[id] ? 'reported-unaccepted' : 'unverified'})),
        integration,missingObjectiveIds:objectiveIds,complete:false,
        completionAuthority:'coordinator',reason
      };
    }
    if (args.stage === 'deliver') {
      requireValue(args.integration === null, 'Delivery cannot imply integration');
      await phase('Independent source reviews');
      const values = await parallel([
        () => readable('review-ui',{assignment:'Read only app.mjs; identify navigation/failure issues with exact source locations. No source writes.'}),
        () => readable('review-style',{assignment:'Read only style.css; identify density/wrapping/focus/theme risks. No source writes or claimed rendering.'})
      ]);
      const rows = {
        'review-ui':kept('review-ui',values[0]),'review-style':kept('review-style',values[1]),
        'ui-write':null,'fresh-verify':null
      };
      if (unknownPrior) {
        await log('Historical uncertain writer blocks replacement; preserve reviews, writer null and verifier null.');
        return finalResult(rows,'Coordinator-required historical effect/drain/capture reconciliation; no replacement dispatched',null);
      }
      const reviews = [rows['review-ui'],rows['review-style']];
      if (reviews.some(r => r === null || r.outcome !== 'reported' || r.blockers.length !== 0)) {
        return finalResult(rows,'Missing or blocked review; dependent writer and verifier remain null',null);
      }
      await phase('Owned UI implementation');
      const writer = await parallel([() => agent(prompt('ui-write',{
        reviews,assignment:'Use both reviews and coordinator red-test contract. Own only the two UI files. Produce the early minimal working selector/failure-display checkpoint and first syntax check before polish. Report hashes/counts. Tests and actual rendering remain coordinator-owned.'
      }),{
        id:'ui-write',label:'ui-write',phase:'Owned UI implementation',
        dependsOn:['review-ui','review-style'],workspace:'isolated',
        skills:['beautiful','tdd'],requireTools:[],timeoutMs:900000,maxAttempts:1,
        schema:resultSchema('ui-write')
      })]);
      rows['ui-write'] = kept('ui-write',writer[0]);
      return finalResult(rows,'Capture review and coordinator integration required before any new verifier',null);
    }

    // A separate new run: engine IDs from another run cannot be dependsOn targets.
    // Structural checks below do not authenticate integration or recovery.
    const rows = {'review-ui':null,'review-style':null,'ui-write':null,'fresh-verify':null};
    if (unknownPrior) return finalResult(rows,'Historical uncertain scope cannot enter automatic verification',args.integration || null);
    const integration = args.integration;
    const handoffs = integration && integration.handoffs;
    const handoff = Array.isArray(handoffs) && handoffs.length === 1 ? handoffs[0] : null;
    const producer = handoff && handoff.producer;
    const validIntegration = integration && text(integration.receiptRef,1000) &&
      text(integration.snapshotRef,1000) && digest(integration.snapshotHash) &&
      Array.isArray(integration.files) && integration.files.length === 2 &&
      integration.files.every((f,i) => f.path === paths[i] && digest(f.sha256) && Number.isInteger(f.bytes) && f.bytes >= 0) &&
      handoff && handoff.taskId === 'ui-write' && text(handoff.captureRef,1000) && digest(handoff.captureHash) &&
      Array.isArray(handoff.allowedPaths) && JSON.stringify(handoff.allowedPaths) === JSON.stringify(paths) &&
      Array.isArray(handoff.acceptanceEvidenceRefs) && handoff.acceptanceEvidenceRefs.length > 0 &&
      handoff.acceptanceEvidenceRefs.length <= 8 && handoff.acceptanceEvidenceRefs.every(r => text(r,1000)) &&
      producer && producer.run && text(producer.run.dataInstanceId,1000) && text(producer.run.runId,1000) &&
      text(producer.run.runtimeId,1000) && Number.isInteger(producer.generation) && producer.generation > 0 &&
      Number.isInteger(producer.position) && producer.position >= 0 &&
      Number.isInteger(producer.attempt) && producer.attempt > 0;
    if (!validIntegration) return finalResult(rows,'Missing integration identity; fresh verifier not dispatched',integration || null);
    await phase('Fresh combined verification');
    const verified = await parallel([() => readable('fresh-verify',{
      integration,assignment:'Independently hash/read the actual integrated files and compare integration.files, not delivery input hashes. Inspect compact navigation, run/control identity and visible failure/unknown reasons. Run admitted Node syntax check. Assess coordinator full-gate receipts, retaining unrun rendering and all missing evidence. No edits.'
    })]);
    rows['fresh-verify'] = kept('fresh-verify',verified[0]);
    return finalResult(rows,'Fresh report is unaccepted until coordinator checks exact bytes, all gates and actual rendering',integration);
    ```

    `parallel` receives zero-argument thunks and preserves input-order slots; a thrown call yields null. Explicit schema bounds, one attempt, and post-return size checks never fill missing slots. The writer's actual `dependsOn` IDs refer to earlier requested workers. The separate verifier has no invented cross-run `dependsOn`; its dependency is the authenticated coordinator barrier, backed by saved producer records. Phase labels assert no graph edges. `workerRef:null` is intentional: `agent` returns a value, not authoritative run/generation/position/attempt. Resolve those externally.

## 7. Validate, save, start and observe using exact public CLI forms

16. These are proposed commands for the eventual coordinator. They are not commands to execute during this evaluation. Resolve all section 2 values first. Capture exit/status evidence and stop dependent work on a failed prerequisite. If any start/control response is lost or nonzero after launch, inspect retained state; never issue the same mutation automatically.

    ```powershell
    # Tool calls executing these snippets use PowerShell login:false.
    $Node = 'C:/Program Files/nodejs/node.exe'  # Verify actual version/hash before use.
    $Cli = Join-Path $PluginRoot 'bin/launch.mjs'
    & $Node --version
    if ($LASTEXITCODE -ne 0) { throw 'Node prerequisite failed; dependent execution blocked' }
    # Record process-start/exit; mismatch blocks dependent commands.
    & $Node $Cli --help
    if ($LASTEXITCODE -ne 0) { throw 'Installed help unavailable; no assumed flag support' }
    # Compare every planned flag with actual installed help/API before continuing.
    & $Node $Cli doctor --cwd $Project --data-dir $Data
    if ($LASTEXITCODE -ne 0) { throw 'Doctor prerequisite failed; inspect evidence before any start' }
    # Doctor is command-only and defaults restricted; it is not proof of worker rendering.
    & $Node $Cli validate $Script --data-dir $Data
    if ($LASTEXITCODE -ne 0) { throw 'Validation failed; no save/start' }
    & $Node $Cli save 'project:compact-run-navigation' --script $Script --cwd $Project --data-dir $Data
    if ($LASTEXITCODE -ne 0) { throw 'Inspect save result; do not overwrite or retry automatically' }
    & $Node $Cli read 'project:compact-run-navigation' --cwd $Project --data-dir $Data
    if ($LASTEXITCODE -ne 0) { throw 'Saved-definition read failed; no launch' }
    # Read back the exact saved bytes/name. Existing-name collision requires review,
    # not an added --overwrite. No reusable command skill was requested.
    $DeliverJson = [System.IO.File]::ReadAllText($DeliverArgsFile, [System.Text.Encoding]::UTF8)
    $DeliverValue = ConvertFrom-Json -InputObject $DeliverJson
    if ($DeliverValue.stage -ne 'deliver' -or $null -eq $DeliverValue.history.unknownWriter) {
      throw 'Preserve the supplied unknown historical writer'
    }
    if ([System.Text.Encoding]::UTF8.GetByteCount($DeliverJson) -gt 24576) { throw 'Args too large' }
    # Only after the coordinator has independently admitted this stable safe snapshot:
    & $Node $Cli run 'project:compact-run-navigation' --cwd $Project --session $OriginSession --access parent --parent-access $ParentAccessFile --worker-capabilities $BundleFile --writable --concurrency 2 --max-attempts 1 --worker-timeout-ms 900000 --run-timeout-ms 1800000 --args $DeliverJson --data-dir $Data
    ```

    Each native executable receives separate PowerShell arguments. `ConvertTo-Json` creates a data argument, never shell source or an `Invoke-Expression` string. Capture the start's exact JSON receipt without losing its exit code, and assign `$RunId`, `$Generation` and `$StartReceipt` from actual returned fields. No example UUID or assumed dispatch position is supplied here. A receipt says durable admission, not completion. The source-only reviewers explicitly narrow to read-only execution despite delivery's run-wide `--writable`; the historical guard leaves the UI writer null. This invocation is not authority to replace the unknown writer. If even the independent snapshot cannot be separated from uncertain effects, keep this start unrun too.

17. Name the live consumer **`CoordinatorObserver-compact-run`**, performed by the originating coordinator itself. It must not delegate to another worker/runtime in this evaluation. Before detaching attention, give it the exact receipt's `watch.argv`, run ID, generation, data instance and originating coordinator identity. Immediately consume the returned read-only command. The copyable form below illustrates a receipt that returns a complete executable argv; confirm its actual shape first:

    ```powershell
    $WatchArgv = @($StartReceipt.watch.argv)
    # Inspect this exact returned array; its executable must be the verified Node,
    # and its launcher/data/session/run/generation must match the receipt.
    $WatchExecutable = $WatchArgv[0]
    $WatchArguments = @($WatchArgv | Select-Object -Skip 1)
    & $WatchExecutable @WatchArguments
    ```

    Do not guess an array layout if the receipt differs. The equivalent documented explicit form, after matching it against the receipt, is:

    ```powershell
    & $Node $Cli watch $RunId --session $OriginSession --generation $Generation --after 0 --jsonl --data-dir $Data
    ```

    `watch.required:true,attached:false` does not prove observation. Confirm a consumed JSONL `attached` record for the exact target. Keep that consumer attached through the durable run-terminal record and final available terminal pages. Consume and relay worker failure/unknown, idle warnings, terminal status and negative/unknown cleanup promptly to the originating coordinator in the active collaboration/conversation channel; CLI does not push parent chat itself. Record actual durable `seq` only after processing the complete event, plus attachment time, progress facts and any relay failure. Do not advance from unread output, a startup cursor, a partial line or assumed event counts. `attached`, progress and idle warnings are observer-local facts, not fabricated durable cursors.

    Default 500-ms polling and 60,000-ms idle warnings are appropriate. Warnings reflect no newly observed completed command/file-change activity; commentary does not reset that clock. Warn and inspect boundedly; do not infer deadlock, cancel or retry. An observer error, EPIPE, Ctrl+C or host conversation ending does not stop a worker or dashboard. Exit zero alone can mean a disconnected output consumer, so require the terminal record and reconcile status.

18. After a dropped consumer, record the monitoring interval as a gap, inspect status, then reconnect to the same session/data/run/generation using the last durable event the consumer actually processed:

    ```powershell
    & $Node $Cli status $RunId --data-dir $Data
    & $Node $Cli watch $RunId --session $OriginSession --generation $Generation --after $LastProcessedSeq --jsonl --data-dir $Data
    ```

    `$LastProcessedSeq` starts at 0 only when no durable record was processed. Confirm a new attachment. Replayed terminal notifications can repair terminal-event knowledge; they cannot reconstruct unobserved live progress or erase the original attachment gap. A changed generation requires a newly observed exact target and fresh attachment. If the retained runtime lacks watch, report missing live coverage and inspect its supported status/result/events; do not migrate or retry it to gain a watcher. Keep observer ownership for a new verification run too, with a separate cursor keyed by run/generation.

19. Inspect exact saved evidence, not an inferred newest run. Resolve `$Position`, `$Attempt`, any `$SourceGeneration` and each activity cursor from status/worker records. Do not assume the writer is position 2 merely because it appears third in a worklist; blocked dispatch and historical generations matter.

    ```powershell
    & $Node $Cli status $RunId --data-dir $Data
    & $Node $Cli result $RunId --data-dir $Data
    & $Node $Cli worker $RunId --position $Position --generation $Generation --data-dir $Data
    & $Node $Cli events $RunId --position $Position --generation $Generation --after $ActivityCursor --limit 50 --data-dir $Data
    & $Node $Cli patch $RunId --position $Position --generation $Generation --basis inputs --data-dir $Data
    ```

    Add `--source-generation $SourceGeneration` only when saved evidence identifies it. Consume activity pages with returned cursors, truncation and missing history intact. Direct full result/worker/patch output to boundedly reviewed coordinator evidence storage when too large for chat; do not use nonexistent pagination flags on `patch` or silently clip required evidence. Status exit zero means a successful read, including reads of failed runs. A schema-valid `blocked` report may have engine status completed; both facts survive.

## 8. Execute independent safe work and the early checkpoint only when admissible

20. From a stable input demonstrably independent of the uncertain historical writer, the two reviewers can run concurrently. They activate only their selected original role sources and produce bounded schema findings. A lost or rejected reviewer remains null. Do not synthesize its missing inventory, run it again automatically, or send the writer merely because two worker records exist. Both actual reports must be source-supported and usable. Browser absence does not prevent these reviews; their inability to establish painted layout remains explicit.

21. In a normal newly authorized, reconciled delivery, the coordinator first reproduces the navigation/failure behavior in the existing appropriate tests. Require meaningful red evidence: the pre-change source fails for the intended behavior, not missing dependencies or broken command setup, and the invariant rejects a plausible broken navigation/reason implementation. The UI writer receives the failing contract as immutable context, not ownership of the test files. The coordinator freezes that input before capture.

    The writer creates the smallest useful owned checkpoint before design polish: a working compact selector exposing current run identity plus visible failure/unknown reason, with any minimal matching CSS in its two files, then its first admitted Node syntax check. Retain actual file-change/check facts and hashes at that point. Long analysis/commentary is not this checkpoint. Refine spacing, wrapping, focus/theme and failure copy after the checkpoint without widening paths. Do not auto-select or mutate a control target while merely opening/filtering navigation, and preserve stale generation/session guards. The installed-versus-candidate UI selection contract must be established from launch source, rather than assumed from a historical dashboard description.

    The coordinator runs the resolved affected tests against those exact candidate bytes in an owned validation checkout once capture/integration permits it, preserving the original red evidence and actual green result. The writer cannot certify coordinator tests with a Boolean. In the supplied history, step 21's replacement writer is **not dispatched**; the planned checkpoint is pending, not a claim that a file was produced.

## 9. Make the historical recovery decisions without repeating effects

22. For the earlier isolated writer, preserve `model output finished`, `jobEmpty:false`, unverified capture and possible file mutation together. This is not `notStarted`, not a harmless schema failure, and not a delivered artifact. No replacement, ordinary resume, merge/integration, patch reconstruction, automatic retry or alternate backend is allowed for it. Do not recollect under a changed capture policy, remove its workspace or alter records to obtain a clean result. Independently safe reviews can proceed as in step 20; `ui-write` and its dependent `fresh-verify` retain null coverage in this historical branch.

    The coordinator must resolve and inspect that exact saved run/generation/position/cumulative attempt, active native turn/job ownership, root-handle exit, native inventory/cleanup, capture error and possible external/file effects. A later positive drain alone would not prove effects safe to repeat. Unknown inventory after a lost response remains unknown. Until the runtime's authenticated recovery boundary and the coordinator's effect reconciliation both admit a specific remaining action, no replacement is authored for dispatch. A supplied JSON string saying `effects:'reconciled'`, a new revision ID or a renamed task cannot supply that authority.

23. Preserve the separate completed writer with verified unchanged bytes and positive cleanup. Record its actual producer identity, accepted scope, capture hashes and acceptance evidence when resolved. Do not replay it simply because it lies later in a restart suffix. Native `restart-worker` repeats the selected worker **and every later worker**, including completed writers. Therefore ordinary resume/restart is not the recovery procedure here, and no such command is offered to bypass the block. Keep the accepted work unchanged, outside any uncertain replacement, and use it later only through its own verified allowed-path handoff. Its good result does not repair the unknown writer or cover an objective it did not deliver.

24. If a required selected skill package disappears after initial admission, stop that role's dependent work and preserve original model attempts, outputs, possible effects and cleanup. Initial admission does not survive disappearance by assertion:

    - Missing original initial native main read is `CAPABILITY_NATIVE_SKILLS` with required/observed/missing IDs.
    - Persistent source removal/change detected after the model is `CAPABILITY_SOURCE_CHANGED`.
    - A missing or unknown completion-source check is `CAPABILITY_SOURCE_UNVERIFIED`.

    Retain exact source/reference fingerprints, selected local roots, native invocation evidence and remaining deadline/cleanup observations. A post-model failure is not `noInference` or no-process startup. Do not copy instructions, silently choose a different version/root, install a package, hot-grant capabilities, steer new selections, rewrite bindings or retry. The coordinator reconciles effects and positive cleanup, verifies the current original sources, then prepares a fresh reviewed bundle and a newly admitted run for safe unfinished scope. Original rejected/null slots stay in the historical report. Unaffected safe tasks with intact sources may continue; dependencies of the affected role remain null. If the disappeared root is `beautiful`, both reviewers and the writer need that root; do not call them unaffected merely because their paths differ.

25. If saved replay encounters an enabled parent catalog fingerprint change, preserve `PARENT_CAPABILITIES_CHANGED`. The guard blocks before generation mutation/dispatch when the saved catalog identity is missing, incomplete or changed. Do not edit header/context/bindings, override the bundle, disable the guard or silently substitute a current catalog to resume completed writers. Verify the refusal's actual no-dispatch/no-generation-change evidence rather than assuming a generic error proves no process ever began. Inspect the original saved runtime and all outcomes/captures. After reconciliation, a fresh current-catalog admission may cover only independently safe unfinished work; it cannot erase old unknowns or repeat the accepted completed writer. Resume/restart retains the old identity and is not a migration mechanism.

    Both package loss and catalog change are admission/recovery decisions, not product regressions proved by an error label. Neither grants new filesystem, network, interactive, delegation or installation authority. If the evidence of refusal/startup is itself incomplete, retain that uncertainty before considering any next effectful action.

## 10. Review authoritative captures before deliberate integration

26. The originating coordinator owns this barrier. For each producer considered for integration, resolve the following from saved storage and independent review, not from model JSON or dispatch order:

    | Handoff field | Required verification |
    | --- | --- |
    | Producer identity | Data instance, run UUID, selected runtime/source/dependencies/Node identity, generation, zero-based position and observed cumulative attempt. Include source generation when records require it. |
    | Original outcome and effects | Preserve engine/declared task outcome, uncertain/partial effects, controls, errors and history. Reconcile before use; a later result cannot replace an earlier unknown. |
    | Owned cleanup | Positive owned-job zero membership **and** root process handle exit plus successful native terminal cleanup/inventory, with no negative or unknown cleanup facts. Retain `descendants:notVerified` where that is the runtime's evidence ceiling; job scope does not prove absence of external effects. |
    | Authoritative capture | Verified capture reference and manifest hash, every included blob hash/byte count, diff basis against captured inputs, complete expected source scope and no linked/unsafe paths. Inspect partial/binary/unexpected outputs as well. |
    | Allowed paths | Exactly the reviewed subset of `engine/monitor/app.mjs` and `engine/monitor/style.css` for `ui-write`; compare Windows case collisions and reject unrelated edits. A separate accepted historical producer keeps its own scope. |
    | Acceptance evidence | Source review, early checkpoint facts, actual checks and objective-specific coordinator judgment. A hash proves bytes, not behavior. `reported`, `delivered`, empty `missing[]` and paired native calls are not acceptance receipts. |

    Default capture includes ignored/untracked outputs. No dependency installation/build is assigned to this writer, so avoid creating `node_modules`, `dist` or other capture bulk. Current capture limits are 20,000 files, 512 MiB included bytes and 512 MiB per diff, with 32 MiB metadata/patch previews; confirm the retained runtime's limits. No worker ignore edit sets capture authority. If a future coordinator needs exclusions, it must freeze a supported immutable policy before a **new** launch, protecting every assigned source output; omitted-payload metadata is not verification of omitted bytes. This cannot repair the historical unverified capture.

27. Deliberately apply only accepted allowed bytes to a coordinator-owned integration checkout. This is coordinator integration, not automatic merge or worker-to-worker patch transfer. Read review reports as context; never reconstruct a missing producer artifact from prose. Reconcile original base/input hashes and any conflicts explicitly. Preserve the accepted completed writer's unchanged work. Reject any attempt to apply the unknown writer's unverified capture. No commit, merge, release or Actions execution is part of this evaluation or automatic in this plan.

    Finish coordinator tests/fixtures and dependency preparation before creating the final stable combined checkout. Record the integrated snapshot's full content-manifest hash, provenance, both UI byte hashes/counts, coordinator-owned test/source identities, Node/runtime/dependencies, integration receipt and accepted producer handoffs. The launch checkout must actually contain those combined bytes. Freeze it against all writers for the fresh-verification window, and rehash before acceptance. A reference or a successful prior capture does not establish that those bytes reached this checkout.

## 11. Launch a fresh independent verifier and run the full gates

28. This step stays blocked for scope dependent on the supplied unresolved writer. Once the coordinator has independently reconciled and admitted safe remaining work through an explicitly reviewed fresh plan, use a **new** run from `$CombinedCheckout`, not saved replay/resume. Preserve history separately; this evaluation's script/history must not be cleared to manufacture permission. The complete nominal CLI shape is shown for that future admission, with every producer value resolved first:

    ```powershell
    # After authoritative review only. $Integration is NOT worker-supplied proof.
    # Required shape:
    # {receiptRef,snapshotRef,snapshotHash,files:[{path,sha256,bytes}],handoffs:[{
    #   taskId:'ui-write',producer:{run:{dataInstanceId,runId,runtimeId},generation,position,attempt},
    #   captureRef,captureHash,allowedPaths:[the two UI paths],acceptanceEvidenceRefs:[...]
    # }]}
    # A new reviewed plan/script must retain/link historical outcomes and admit only
    # reconciled unfinished scope. Do not mutate revision 1 or its saved bindings.
    # Materialize the entire verification value. For the supplied scenario this
    # retains the unknown history and therefore cannot dispatch a verifier.
    $VerifyArgs = @{
      stage='verify'; planRevision=$PlanRevision; inputSnapshot=$SourceSnapshot
      toolchain=$Toolchain; history=$History; integration=$Integration
    }
    $VerifyJson = ConvertTo-Json -InputObject $VerifyArgs -Depth 30 -Compress
    [System.IO.File]::WriteAllText($VerifyArgsFile, $VerifyJson, $Utf8NoBom)
    $VerifyJson = [System.IO.File]::ReadAllText($VerifyArgsFile, [System.Text.Encoding]::UTF8)
    $VerifyValue = ConvertFrom-Json -InputObject $VerifyJson
    if ($VerifyValue.stage -ne 'verify' -or $null -eq $VerifyValue.integration) { throw 'Missing reviewed verification inputs' }
    if ([System.Text.Encoding]::UTF8.GetByteCount($VerifyJson) -gt 24576) { throw 'Args too large' }
    & $Node $Cli run 'project:compact-run-navigation' --cwd $CombinedCheckout --session $OriginSession --access parent --parent-access $ParentAccessFile --worker-capabilities $BundleFile --concurrency 1 --max-attempts 1 --worker-timeout-ms 600000 --run-timeout-ms 1200000 --args $VerifyJson --data-dir $Data
    ```

    The JSON stage value is prepared from the same reviewed fixed plan with `stage:'verify'`, actual integration object and source descriptor, not guessed IDs. For revision 1 **retain `$History` exactly**, write that verify value to `$VerifyArgsFile`, and the literal script correctly returns a null verifier. It is permissible to validate/save the script as a complete plan; it is not permissible to claim this blocked invocation performed fresh verification. An actual later recovery admission needs its own validated/saved definition and retained history linkage; its name in a launch command must match that actual saved definition rather than this example's revision-1 name. This explicitly prevents a supplied integration reference from unlocking an unknown replacement inside the guest.

    For an ordinary first-time deliver/verify use with no uncertain predecessor, the same literal script supports both stages; the integration barrier remains external and mandatory. On this scenario's path there is no authorized shortcut to that branch.

29. A successfully admitted fresh verifier is read-only and examines the launch checkout; it does not get an isolated writer capture and cannot write tests or fix code. It independently computes actual UI hashes/counts against `integration.files`, checks source behavior and admitted syntax, and inspects the coordinator's check receipts. Original delivery input hashes are provenance, not expected final hashes. It reports failures, missing receipts and rendering `notRun` as such. Its result is `reported` or unverified until coordinator acceptance. A null verifier remains null. The coordinator rechecks the whole combined snapshot identity afterward; any drift invalidates acceptance and requires a new reviewed snapshot, not a re-label of cached results.

30. The coordinator owns and runs all final gates against these exact combined bytes, after prerequisite readiness and within its separately recorded check deadline (budget 20 minutes total; stop rather than silently extend/retry on expiry). The coordinator may run them before freezing the verifier checkout if they produce temporary files, then retain exact content identities/receipts and prevent concurrent fixture churn. If a test necessarily mutates verification inputs, prepare a fresh stable snapshot after the test and bind the verifier to it. Record command, cwd, Node/npm/runtime identity, start/end, process/exit and sanitized logs; rerun gates only when new edits/failures justify it.

    ```powershell
    Push-Location -LiteralPath $CombinedCheckout
    try {
      & $NpmCmd test
      if ($LASTEXITCODE -ne 0) { throw 'Full test gate failed; inspect effects, do not accept' }
      & $NpmCmd run check
      if ($LASTEXITCODE -ne 0) { throw 'Check gate failed; do not accept' }
      & $NpmCmd run smoke
      if ($LASTEXITCODE -ne 0) { throw 'Smoke gate failed; do not accept' }
    } finally {
      Pop-Location
    }
    ```

    Also run the resolved affected invariant test file(s) during authorized edits, preserving real red/green evidence. Full tests are not replaced by static imports, schema validation or a source review. No clean-install, audit, release tag, publication or GitHub Actions is requested here; those are separate release obligations, not falsely reported as passed gates.

31. Name **`CoordinatorBrowserOwner-compact-run`**, performed by the coordinator, as the sole browser/render owner. Before use, record the exact integration/context, dashboard instance and URL, selected current UI version, snapshot/build hash, viewports/device pixel ratios/themes, required product states and pending checks. Host-only browser/connector sessions are not cloned into native workers. Missing installation, command admission or render transport blocks this step; source work can remain reviewable. A busy/shared-lock result records its exact instance, known owner and missing handoff; serialize access rather than bypassing the lock.

    Once independently ready and authorized, inspect actual painted navigation and visible reasons in normal, empty, running, failed, unknown, long-text and disconnected/stale states, with keyboard/focus and narrow layout. Wait for fonts/assets to settle and retain readable glyph, clipping/wrapping/overlap evidence. DOM labels, nominal font size, hit targets or successful clicks alone do not establish readability. Confirm navigation does not accidentally send controls, hide the true current run or turn unknown/missing coverage into success. The source writer's opinion is not render acceptance. Hand off the exact instance/context/build and unfinished checks explicitly if ownership changes, then record its release. Until this happens, `render-acceptance` remains missing regardless of green test/check/smoke.

## 12. Own dashboard lifetime and final reporting

32. If the eventual coordinator elects to create a dashboard within its authorized execution scope, use the exact returned run ID and same originating session/data instance:

    ```powershell
    & $Node $Cli dashboard $RunId --session $OriginSession --data-dir $Data
    ```

    `CoordinatorBrowserOwner-compact-run` retains this exact persistent instance through inspection/verification and is its named closer. Keep the full authenticated URL, including its fragment, private and pass it only to the intended owner; never put its token in this shared plan or logs. Do not rely on omitted-ID newest-run convenience. Use `--current-ui` only after an explicit current-presentation decision; evidence/control runtime remains the original saved runtime. Track the actual control target/generation separately from simply viewing another run.

    Dashboard **Close** ends that dashboard process; it does not Stop workflow execution. Workflow **Stop** closes admission and interrupts active turns, then requires settlement/cleanup inspection; it does not imply the dashboard closed. A browser-tab close or end of the host conversation proves neither. No default monitor idle expiry is promised. Record Close/shutdown evidence when inspection finishes, or name who deliberately retains the instance and why. If a separately authorized Stop is needed later, read current status, use the actual generation/session in `stop ID --session SESSION --generation N --data-dir DATA`, inspect its control receipt and settled state; do not equate acknowledgement with drain or repeat after a lost response. No Stop/Close/control is executed by this evaluation.

33. The originating coordinator produces a separate acceptance ledger, preserving all original script/worker results unchanged. For each retained objective include actual source/capture identities, skill activation required/observed/missing IDs, actual-policy readiness, original effects/cleanup, integration identity, independent fresh check receipts and render evidence or explicit gaps. Keep the two review slots, writer slot and verifier slot even when null. Do not infer semantic acceptance from an empty `missing[]`, worker count, native paired-call counts, accepted startup or a successful status exit.

    The present scenario's required final state is: complete plan authored; independent reviews proposed and runnable only from an admitted safe stable snapshot; historical writer still unknown with negative drain and unverified capture; separate accepted writer preserved; package-loss and changed-catalog recovery blocked pending coordinator reconciliation/current admission; replacement UI writer and dependent verifier unrun/null; actual test/check/smoke and rendering unrun in this evaluation. List `compact-navigation`, `visible-failure-reasons`, `fresh-combined-checks` and `render-acceptance` as unaccepted until their real receipts exist. Do not claim the whole dashboard deliverable completed.

    This evaluation returns only the artifact path, SHA-256 of its exact saved bytes, byte count and a bounded summary. It supplies no self-score, historical score comparison or claim that activating a skill caused general effectiveness.
