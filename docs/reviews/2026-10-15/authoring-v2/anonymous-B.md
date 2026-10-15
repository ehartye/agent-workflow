# Executable dashboard authoring and recovery plan

Planning only; nothing below has been run. This artifact uses released Agent Workflow **0.3.6** public documentation and public source. Proposed future native skill activation belongs to the admitted workers, with separate evidence. The 900,000 ms evaluation budget is for writing this artifact, not a new worker API or evidence of delivery.

## 1. Establish scope, truth, and ownership

The hypothetical objective is compact run navigation and visible, truthful failure reasons. Produce two independent source reviews, one UI writer, coordinator-owned tests and integration, then a fresh combined verifier. Keep these fixed task IDs across the ledger; an execution identity additionally includes its run and attempt.

| Task ID | Read scope and responsibility | Write ownership | Explicit selected IDs |
| --- | --- | --- | --- |
| review-ui | engine/monitor/app.mjs; navigation, diagnostics, focus, selection/control identity | None | beautiful |
| review-style | engine/monitor/style.css; compact layout, responsive overflow, themes, focus visibility | None | beautiful |
| ui-write | Both source files; incorporate both reviews and coordinator's failing tests | Only engine/monitor/app.mjs and engine/monitor/style.css, less any preserved accepted paths | beautiful, tdd |
| fresh-verify | Exact integrated source, coordinator tests and bounded check evidence | None; coordinator owns test files and evidence storage | test-strategy |

The writer alone owns the JS/CSS interface: existing DOM IDs, dynamic classes, diagnostic text placement and responsive states. Reviewers suggest changes without editing. The coordinator owns test inputs, fixtures, integration, capture acceptance, and final acceptance. No worker edits index.html, services.mjs, runtime APIs, recipes, package/dependency files, tests, Git metadata, or shared settings. If the two allowed paths cannot express the fix, report that boundary; do not silently expand ownership.

The released source already has a run picker, Current run handling, failureCallout, worker evidence views, navigation read errors, truncation disclosures, freshness checks and disabled controls on stale data. Review and improve those behaviors; do not assume the feature is absent or rewrite its authority model. Preserve run/runtime/data-instance/generation identity, execution versus delivery distinctions, unknown/null coverage, private authentication, bounded reads, and the absence of automatic mutation retries.

An accepted source improvement requires more than terminal model output: retained native activation, verified effects and owned cleanup, authoritative capture integrity, deliberate integration, fresh checks, and the applicable rendered acceptance. A successful status read, a typed "reported" result, or an overall completed run is not this acceptance.

## 2. Resolve all coordinator inputs before dependent commands

Every angle-bracket value below is UNRESOLVED, not a sample real ID. A child cannot manufacture parent authority. Resolve these into a coordinator-owned immutable execution record before running any dependent command:

| Input | Required evidence and dependent use |
| --- | --- |
| OriginSession | Actual originating Codex session, not a fabricated UUID or this writer's claimed context; all starts/watch/controls/dashboard |
| Project | Absolute canonical stable source checkout; Git project suitable for managed isolated writers; record actual source baseline and dirty source inputs |
| Combined | Absolute coordinator-owned combined checkout, frozen for verification, independent of old writer live directories |
| Data | Absolute data directory outside the writer project; use the same explicit --data-dir throughout |
| Node | C:/Program Files/nodejs/node.exe; coordinator confirms exact version >=24, actual executable bytes/hash and launchability |
| PluginRoot / Launcher | Exact installed original Agent Workflow package root and bin/launch.mjs; verify selected managed runtime is 0.3.6, receipts/dependencies and source identity |
| RetainedRuntimeRoot | Exact runtime root recorded for each producer; never infer an old run's runtime from current plugin cache |
| ParentContextFile | Genuine current originating-session context, its provenance and permission snapshot; also current complete enabled native catalog/fingerprint |
| RoleBundle | Immutable v1 worker-capabilities manifest resolved to original actual packages, source hashes and declared references; no invented executor packages |
| CapturePolicy | Immutable reviewed source-protecting policy below; no omission of either UI output |
| Script | Absolute coordinator-owned file containing exactly the literal script in section 7; record UTF-8 bytes and SHA-256 |
| InputManifest | Frozen regular-file source inventory with paths, byte lengths and SHA-256, plus bounded context/evidence references |
| RedTests | Coordinator-owned exact test paths, red-run evidence and hashes included in the writer's input snapshot before writer admission |
| Prerequisites | Observed worker-local native commands, executable/cache paths, started/not-started facts, exits, truncation, deadline and cleanup; browser transport separately |
| HistoricalUnknown | Actual data instance/run/runtime/generation/position/cumulative attempt, original outcome, owned job and native cleanup facts, workspace and unverified capture |
| AcceptedWork | Actual producer tuple, accepted paths/bytes/hashes and positive cleanup; immutable accepted evidence, not a replay target |
| Observer | Named owner DashboardDeliveryObserver in the originating coordinator, plus storage/relay consumer ready before startup |
| Integration record | Exact reviewed producer tuples, allowed paths, accepted-byte preservation map, original statuses, manifest/blob integrity and frozen combined inventory |
| Verification target | Hash/bytes of the combined inventory and coordinator test files; exact fresh script path, current context/bundle and verifier prerequisite observations |

Do not fabricate these values in the artifact. Coordinator obtains them from genuine current session and runtime evidence. The supported parent snapshot is version 1 with sessionId, provenance "codex-session-context", filesystem "unrestricted", networkAccess true, and approvalPolicy "never", ONLY if those are the actual context facts. Missing or unsupported context blocks parent admission; do not widen a restricted session to fit that shape. This snapshot is coordinator-supplied authority, not independent proof issued by the child.

Planning uses the permitted repository sources. Wiki ingestion or external project-roadmap updates are outside this evaluation's single-file boundary; do not execute them here. Later project work can record as-built changes under the owner's normal wiki process.

## 3. Choose the released runtime and execution policy

Use installed **0.3.6**, confirmed by the coordinator before dispatch, not candidate recipes or flags. Public bin/arguments.mjs and engine/controller.mjs support the options used here. Do not assume package-cache location proves runtime selection. A missing managed runtime is a blocked prerequisite: report exact launcher/runtime path and error; do not run setup/install automatically. Managed ChatGPT authentication is assumed but must pass command admission; no API-key billing fallback.

Selected policy: current parent catalog/context captured once per new run; explicit per-role skills; native command permissions narrowed per worker to read-only or workspace-write/no-network/never-approve. Parent catalog availability is broader than explicit selection and does not establish tool operation readiness. Worktrees provide ownership/review boundaries, not filesystem security isolation under parent access.

| Budget | Selected bound |
| --- | --- |
| Normal planned worklist | Exactly 4 role IDs; 2 review calls, at most 1 writer call, 1 fresh verifier in a separate run |
| Concurrency | 2 for review/author; 1 for write-only and verify; does not limit lifetime calls |
| Batches | One fixed review batch of 2 zero-argument thunks; writer batch of 1; verification batch of 1; no recursive decomposition or dynamic task additions |
| Attempts | maxAttempts:1 per call and --max-attempts 1; no schema correction or operational retries |
| Per-worker deadline | 600000 ms reviews; 1200000 ms writer; 1800000 ms verifier; all within 1..1800000 |
| Run lifetime | --run-timeout-ms 0: completion or coordinator manual Stop, no arbitrary retention/expiry requirement |
| Application lifetime budget | 4 starts/attempts in the normal path; one explicitly reviewed recovery revision may admit each unfinished ID once, at most 4 additional starts = 8 across this plan |
| Runtime hard ceilings | 1000 worker requests/lifetime attempts per run and 10000 broker calls; no public CLI max-agents flag is invented |
| Capacity/usage | No hard shared token/dollar/provider quota cap is promised; record observed cumulative attempts/usage including rejected/unknown attempts |
| Guest protection | Separate QuickJS; 32 MiB memory, 512 KiB stack, 1000 ms CPU slices and 5000 ms idle watchdog when no broker work is pending; never host-evaluate guest code |
| Drain | Retain the runtime's separate bounded cleanup (controller default 20000 ms); expiry is missing/unknown proof, not successful termination |
| Human checkpoints | Inspect early review/source artifacts promptly; at ~2 minutes require a useful inspectable checkpoint; advisory watch idle at 60000 ms, poll 500 ms; inspect rather than auto-cancel/retry |

The nominal model/readiness span is at most max(10,10)+20+30 = 60 minutes, excluding startup, cleanup and manual integration; those have no promised overall wall bound. The owner of run lifetime and observation is the coordinator, even while UI is closed. Crossing the application attempt budget pauses new dispatch for an explicit revised scope; never pretend concurrency limits total starts.

**Policy implications:** Time — bounded tasks may need a later deliberate revision; human integration can wait without an imposed expiry. Risk — timeouts can leave unknown effects, while a run without a wall deadline needs active ownership. Complexity — three stages and an explicit handoff, without a new scheduler. Best practice — supported finite workers and manual run lifecycle with truthful drain. Maintainability — saved deadlines and source identities remain inspectable.

A requirement for workers with timeoutMs:0, null, or an unbounded worker deadline cannot be met by 0.3.6. Defer that requirement pending an explicit version/install decision and verified new public contract; do not reinterpret the evaluation's 15 minutes or the supported run timeout zero as an unbounded worker. Such an update would cost installation/acceptance time, introduce runtime compatibility risk and a new maintained boundary. This plan selects finite behavior and requires no update.

## 4. Resolve original skills, then prove activation separately

Coordinator maps declared IDs to original sources using genuine native discovery in its authorized context before admission. Metadata supplied with this scenario gives candidate original root families, not current availability or activation:

| Declared ID | Expected native skill identity | Original-root family to resolve |
| --- | --- | --- |
| beautiful | hartye-skills:beautiful | hartye-plugins/hartye-skills/0.4.0/skills/beautiful |
| tdd | h-superpowers:test-driven-development | The chosen original h-superpowers source; duplicate dev and hartye plugin catalogs must be disambiguated by root |
| test-strategy | agent-tests:test-strategy | hartye-plugins/agent-tests/0.4.1/skills/test-strategy |

The coordinator must record the actual absolute original plugin root, SKILL.md path and hash, actual native name, every exposed descendant/reference identity, and the chosen source among same-name entries. Do not infer a returned package string from these names. Preserve plugin-relative resources; do not copy/flatten skill bodies into a workflow prompt or writer checkout.

The reviewed RoleBundle file uses the documented shape:
~~~javascript
{
  version: 1,
  skills: [
    // Resolve three actual entries before admission:
    // {id, name, root, path, sha256, references:[{path,sha256}]}
  ],
  tools: []
}
~~~
The comments above describe construction, not a runnable empty manifest: all three resolved skill entries are mandatory for the supplied script. root is the original plugin directory; path is its actual absolute SKILL.md; references have original root-relative paths/hashes. Include every file exposed under each exact skill directory and required external references within supported limits. No links, nested undeclared skills or plugin manifests in selected skill directories. Freeze/hash the resulting JSON; unavailable required skills block affected calls. Select no additional skills simply because the parent catalog contains them.

In each actual worker, before doing role work, use the genuine native mechanism:
~~~javascript
const listed = await skills.list({authority: {kind: "executor"}});
// Follow returned pagination; match native name AND authorized original root.
// For each explicitly selected role skill:
await skills.read({
  package: matchedEntry.package,
  resource: matchedEntry.main_resource
});
// Follow the returned native cursor/resource to read needed continuation/reference pages.
~~~
matchedEntry denotes the actual returned catalog entry, not a fabricated alias or a script variable available inside QuickJS. These are future native worker calls, NOT workflow guest APIs and NOT calls made in this evaluation. Resolve same-name entries against original-root metadata. Verify returned skill_root/original main identity; an initial successful main read is required per selected ID. A reference-only read, continuation-only read, error output, manual SKILL.md read, CLI help, discovery metadata or copied skill text does not count.

Retain required/observed/missing ID sets and native initial main-resource/root-match evidence. Native activation evidence has body:"notVerified"; paired calls alone do not prove all pagination or compliance. The coordinator can separately review whether useful instructions informed the output. Completion source recheck must pass independently; a model answer after a missing-source check remains rejected. Do not change process-global flags to expose tools; supported runtime provisioning handles genuine executor roots.

## 5. Admit operations under actual authority; preserve missing rendering

Before dispatch, coordinator checks the verified Node executable, immutable runtime/dependency identity, native command admission, original sources, and actual permission context. Doctor checks command-only native account/policy/admission and cleanup, not model skill activation or render acceptance. Each worker independently checks relevant source hashes and operations under its actual native policy.

Use absolute executable arguments and explicit verified cache variables; do not depend on a friendly interactive shell's PATH, aliases or profile. PowerShell must use the call operator and separate arguments, as in section 8. Windows ESM imports use pathToFileURL, as in section 12. Report a blocked command with exact executable/cache path, stage, whether a process began, exit/error, bounded output/truncation and cleanup. An executed nonzero command may have changed files. Label notStarted only with explicit no-process evidence.

This plan's roles perform source review/authoring and source/check verification. Therefore their explicit requireTools arrays are empty: they do not claim a browser-associated CLI was admitted. This is a declared scope split before admission, not removal of a failed required gate. Ordinary authorized source commands still need working native command execution. The verifier's exact test operations are coordinator-resolved and must be ready, with any missing operation left notRun/unknown.

Browser readiness needs independent observed facts: exact executable and package/runtime/dependency/cache identities; actual launch in the authorized environment; authenticated loopback transport; ability to load these exact dashboard bytes; and actual painted evidence. A --version/capabilities result or installed browser directory is only discovery. Child inherited MCP/apps/browser tools are not assumed available; no host-only browser connection is cloned.

If a future associated CLI is required, coordinator must first resolve and declare its real public interface in a new immutable tool entry: id, associated skills, verified node path/version/hash, original launcher, managed runtime/dependency files and authenticated receipts, explicit named environment/cache, bounded readiness stages, and guidance. Stages run [node.path,launcher.path,...args] once, timeout 1..20000 ms, with exact entire trimmed marker OR documented scalar JSON expectations, exit 0, below 8192 bytes, within remaining worker deadline. Do not invent a browser readiness command or JSON field for an unknown tool. A host interactive browser capability cannot be smuggled into this Node-launcher contract.

Known missing browser blocks **rendering acceptance only**. Continue safe source reviews, source authoring after its other gates, coordinator tests, capture review and fresh source verification. Keep render result null/notRun and the missing executable/cache/transport facts. No install, permission escalation, global configuration change, service start or fallback is authorized by this plan-writing task. Any later rendering preparation is an explicit coordinator-owned task under real authority.

## 6. Sequence independent work and early artifacts

1. Register DashboardDeliveryObserver and the evidence ledger before any proposed start. Resolve section 2 inputs and confirm 0.3.6. Freeze a stable source manifest; block even read-only review if a historical uncontrolled process can still change those exact inputs.
2. Inspect HistoricalUnknown and AcceptedWork using read-only exact identities. Keep their original outcomes. Protect accepted paths/bytes against any new writer ownership. Do not start ui-write, replacement, merge, replay or resume of the negative-drain writer.
3. If the frozen review checkout is independent and stable, start stage:"reviews" with two independent read-only calls. No browser prerequisite is needed. Deliver bounded file/line findings, risks, failure cases, interface recommendations and missing evidence. Do not claim visual acceptance.
4. Early review checkpoint: each reviewer identifies the relevant existing code and a small prioritized list of changes, before exhaustive polish. Return references to source lines and actual observations; no invented run evidence.
5. Coordinator reads .testing/risk.yml (production consumers include installed plugins, saved workflows, persisted runs and retained runtimes), finds existing invariant owners and writes meaningful failing tests before feature code. Test files are coordinator-owned, tagged @lane merge in the first comment, with @subject engine/monitor/app.mjs and style.css when DOM/subprocess loading hides dependencies. Use unique temp roots/port 0; never real home. No legacy compatibility beyond declared consumers.
6. Before writer admission, integrate only the coordinator's test changes into a fresh stable author input checkout, record actual red failures and expected broken behavior, and freeze hashes. Reviewer source hashes must still match; if tests changed source or source drifted, do not reuse the reviews blindly.
7. Only after sections 10–11 reconcile historical effects and any source/catalog failures, start ui-write against that source/test snapshot, using stage:"write" and authenticated bounded review file references. Alternatively, with no preexisting independent review run, stage:"author" performs the two reviews then one writer in a single run. These are mutually exclusive launch paths; never run both for the same accepted review/writer work.
8. Writer's early checkpoint is an actual minimal coherent implementation in its two owned files: compact accessible run selection and plainly visible failed/unknown/missing-reason state, with syntax/basic source checks. Record those file hashes and completed command/file-change progress before visual polishing. Do not add checkpoint files outside ownership. Early hashes are inspectable intermediate evidence, not a finalized capture while the job is live.
9. Writer applies review findings, respects coordinator tests, runs affected checks only if admitted, and reports required missing render acceptance. It never writes tests, imports predecessor patches, changes ownership, integrates work, or verifies itself as accepted. It must not start a service/browser or nested worker.
10. Coordinator waits for actual terminal/cleanup evidence, reviews captures via section 12, preserves accepted independent work, deliberately integrates only reviewed paths, freezes the combined identity, and launches the separate fresh verifier via sections 13–14.
11. Complete all required full tests/check/smoke gates on those same bytes. Rendering stays explicitly unaccepted until an authorized verified renderer supplies fresh evidence. Retain historical unknown status even after a separate reconciliation record permits safe unfinished work.

Split-path implications: Time — an extra handoff; Risk — requires source identity checks at that handoff; Complexity — explicit manifest bookkeeping; Best practice — reconciled independent work; Maintainability — preserved ownership and provenance. The single-author path is available only with all gates already satisfied.

## 7. Literal saved workflow script

Coordinator saves this exact text to Script as UTF-8. Its first statement is literal exported metadata. Run it only through the installed workflow launcher/QuickJS child. No imports, host filesystem, clock, random, child workflow API or custom MCP are used.

Inputs are small descriptors, never authority proofs. Coordinator authenticates their referenced storage before launch; workers recheck assigned bytes. input is a descriptor {path,sha256,bytes}; reviewRefs is exactly two {taskId,path,sha256,bytes}; checkpointRefs is a bounded list of coordinator evidence references. writePaths is a nonempty allowed subset of the two UI paths after accepted-path preservation. integrated describes a frozen combined manifest. Paths in descriptors must be visible in the launched worker's real source snapshot; copy reviewed JSON evidence deliberately before freezing it, not into shared live writer directories.

~~~javascript
export const meta = {
  name: 'dashboard-authoring',
  description: 'Two source reviews, one isolated UI writer, then a separate fresh combined verification invocation; acceptance remains coordinator-owned.',
  phases: [{title: 'Review'}, {title: 'Author'}, {title: 'Verify'}]
};

const cfg = args ?? {};
const ids = ['review-ui', 'review-style', 'ui-write', 'fresh-verify'];
const paths = ['engine/monitor/app.mjs', 'engine/monitor/style.css'];
const rows = ids.map(taskId => ({
  taskId, result: null, accepted: false, dispatch: 'notRequested',
  reason: 'Not dispatched in this stage'
}));
function need(ok, message) { if (!ok) throw new Error(message); }
function hash(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function descriptor(v) {
  return v && typeof v.path === 'string' && v.path.length > 0 &&
    v.path.length <= 1000 && hash(v.sha256) &&
    Number.isInteger(v.bytes) && v.bytes >= 0 && v.bytes <= 262144;
}
function shortList(v) {
  return Array.isArray(v) && v.length <= 8 &&
    v.every(x => typeof x === 'string' && x.length > 0 && x.length <= 300);
}
function context(v) {
  const value = JSON.stringify(v);
  need(typeof value === 'string' && value.length <= 10000, 'Narrow the JSON handoff');
  return value;
}
need(['reviews', 'author', 'write', 'verify'].includes(cfg.stage), 'Choose a supported stage');
const selectedReviews = cfg.reviewTaskIds ?? ['review-ui', 'review-style'];
need(Array.isArray(selectedReviews) && selectedReviews.length >= 1 &&
  selectedReviews.length <= 2 && new Set(selectedReviews).size === selectedReviews.length &&
  selectedReviews.every(id => ['review-ui', 'review-style'].includes(id)),
  'Select only fixed unfinished review IDs');
if (cfg.stage === 'author') need(selectedReviews.length === 2, 'Author requires both reviews');
need(descriptor(cfg.input), 'Require a frozen bounded input manifest descriptor');
need(shortList(cfg.checkpointRefs), 'Require bounded coordinator checkpoint references');
if (cfg.stage === 'author' || cfg.stage === 'write') {
  need(Array.isArray(cfg.writePaths) && cfg.writePaths.length > 0 &&
    cfg.writePaths.length <= 2 && new Set(cfg.writePaths).size === cfg.writePaths.length &&
    cfg.writePaths.every(p => paths.includes(p)), 'Writer owns only the allowed UI subset');
  need(descriptor(cfg.redTests), 'Coordinator red tests must be in writer input');
}
if (cfg.stage === 'write') {
  need(Array.isArray(cfg.reviewRefs) && cfg.reviewRefs.length === 2 &&
    new Set(cfg.reviewRefs.map(r => r.taskId)).size === 2 &&
    ['review-ui', 'review-style'].every(id => cfg.reviewRefs.some(r =>
      r.taskId === id && descriptor(r))), 'Require both reviewed source reports');
}
if (cfg.stage === 'verify') {
  need(descriptor(cfg.integrated), 'Require the frozen combined manifest');
  need(descriptor(cfg.checkPlan), 'Require exact coordinator check commands and targets');
}
need(JSON.stringify(cfg).length <= 16000, 'Arguments exceed this fixed plan budget');

const str = maxLength => ({type: 'string', maxLength});
const arr = (items, maxItems) => ({type: 'array', items, maxItems});
const obj = properties => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false
});
function resultSchema(taskId) {
  return obj({
    taskId: {type: 'string', const: taskId},
    outcome: {type: 'string', enum: ['reported', 'blocked', 'incomplete']},
    summary: str(600),
    findings: arr(str(180), 6),
    checks: arr(obj({
      id: str(80),
      status: {type: 'string', enum: ['passed', 'failed', 'notRun', 'unknown']},
      evidence: str(200)
    }), 8),
    artifacts: arr(obj({
      path: {type: 'string', enum: paths},
      sha256: {type: ['string', 'null'], minLength: 64, maxLength: 64},
      bytes: {type: ['integer', 'null'], minimum: 0}
    }), 2),
    missing: arr(str(160), 8)
  });
}
const readOnly = {sandbox: 'read-only', networkAccess: false, approvalPolicy: 'never'};
const rules =
  'Use only your assigned role and scope. First genuinely invoke executor skills.list ' +
  'and skills.read on each selected original main resource, resolving native package/main_resource ' +
  'from actual discovery and matching the admitted original roots. Read needed instructions. ' +
  'Availability, activation, command readiness, capture integrity and acceptance are separate. ' +
  'Verify supplied file hashes/bytes before use; supplied references are not self-authenticating. ' +
  'No installs, global configuration, Git changes, services, browser, workflow controls, nested agents ' +
  'or external messages. No retry/fallback after uncertain effects. An executed nonzero command ' +
  'may mutate; notStarted requires explicit no-process evidence. Report exact blocked executable/cache ' +
  'paths and stage facts. Preserve null/missing coverage and original failed/unknown outcomes. ' +
  'Return bounded JSON matching the schema, not logs, raw tool payloads or credentials. ' +
  'Do not claim task acceptance. Missing browser blocks rendering only.';

function record(taskId, result) {
  const row = rows.find(r => r.taskId === taskId);
  row.dispatch = 'requested';
  row.result = result ?? null;
  row.reason = result === null || result === undefined
    ? 'No usable result; inspect authoritative failed/unknown execution and cleanup before recovery'
    : 'Worker report only; capture, checks and coordinator acceptance remain separate';
}
function usableReview(value, taskId) {
  return value && value.taskId === taskId && value.outcome === 'reported';
}

let reviews = [null, null];
if (cfg.stage === 'reviews' || cfg.stage === 'author') {
  await phase('Review');
  reviews = await parallel([
    () => !selectedReviews.includes('review-ui') ? null : agent(rules +
      '\nRead-only independent review of engine/monitor/app.mjs. Review compact run navigation, ' +
      'visible failure reasons, truthful missing diagnostics, stale response/focus handling, ' +
      'and selected run/runtime/data-instance/generation control identity. Prioritize concrete ' +
      'file/line findings and tests. No visual acceptance. Early useful source findings before polish.\n' +
      context({input: cfg.input, checkpoints: cfg.checkpointRefs}),
      {id: 'review-ui', label: 'UI source review', phase: 'Review',
       skills: ['beautiful'], requireTools: [], permissions: readOnly,
       maxAttempts: 1, timeoutMs: 600000, schema: resultSchema('review-ui')}),
    () => !selectedReviews.includes('review-style') ? null : agent(rules +
      '\nRead-only independent review of engine/monitor/style.css. Review compact navigation, ' +
      'small screens, long names/reasons, scroll/overflow, light/dark themes, visible focus and ' +
      'non-color failure cues. Identify concrete file/line findings and checks. No visual acceptance. ' +
      'Early useful source findings before polish.\n' +
      context({input: cfg.input, checkpoints: cfg.checkpointRefs}),
      {id: 'review-style', label: 'Style source review', phase: 'Review',
       skills: ['beautiful'], requireTools: [], permissions: readOnly,
       maxAttempts: 1, timeoutMs: 600000, schema: resultSchema('review-style')})
  ]);
  if (selectedReviews.includes('review-ui')) record('review-ui', reviews[0]);
  if (selectedReviews.includes('review-style')) record('review-style', reviews[1]);
}

if (cfg.stage === 'author' || cfg.stage === 'write') {
  const ready = cfg.stage === 'write' ||
    usableReview(reviews[0], 'review-ui') && usableReview(reviews[1], 'review-style');
  if (!ready) {
    rows[2].reason = 'Required review absent/blocked; writer not dispatched; dependency coverage null';
  } else {
    await phase('Author');
    const handoff = cfg.stage === 'write'
      ? {reviewRefs: cfg.reviewRefs}
      : {reviewReports: reviews};
    const writerResults = await parallel([
      () => agent(rules +
        '\nYou alone own the declared writePaths; read other UI path without editing it if protected. ' +
        'Use beautiful and tdd instructions. Coordinator already owns failing tests in this frozen input: ' +
        'first reproduce and inspect those red failures, then minimally fix compact run navigation and ' +
        'visible truthful failure reasons. Do not edit tests. Preserve accepted work listed in the input. ' +
        'Create an inspectable minimal coherent JS/CSS checkpoint before polishing, with file hashes ' +
        'and actual completed command/file-change progress. A checkpoint is not final capture. ' +
        'Preserve existing DOM/service interfaces, safe text rendering, bounded previews, keyboard focus, ' +
        'run selection authority, unknown effects and missing rendering. Run admitted affected checks; ' +
        'do not install dependencies to make them pass. dependsOn does not transfer files. Review JSON ' +
        'is context only: do not apply predecessor patches. Return changed allowed paths/hashes/bytes, ' +
        'check evidence and missing rendering; never mark yourself accepted.\n' +
        context({input: cfg.input, writePaths: cfg.writePaths, redTests: cfg.redTests,
          checkpoints: cfg.checkpointRefs, ...handoff}),
        {id: 'ui-write', label: 'Sole UI writer', phase: 'Author',
         dependsOn: cfg.stage === 'author' ? ['review-ui', 'review-style'] : [],
         skills: ['beautiful', 'tdd'], requireTools: [],
         permissions: {sandbox: 'workspace-write', networkAccess: false, approvalPolicy: 'never'},
         workspace: 'isolated', maxAttempts: 1, timeoutMs: 1200000,
         schema: resultSchema('ui-write')})
    ]);
    record('ui-write', writerResults[0]);
  }
}

if (cfg.stage === 'verify') {
  await phase('Verify');
  const verification = await parallel([
    () => agent(rules +
      '\nFresh independent verification only. This is a new run against the frozen combined checkout, ' +
      'not a resumed/cached writer. Use test-strategy. Independently verify the actual cwd and every ' +
      'combined manifest path/hash/byte count, including coordinator tests, before and after checks. ' +
      'Read both UI sources and execute admitted exact checkPlan commands against these bytes. ' +
      'Evaluate navigation and visible failure/missing-reason behavior, source regressions and preserved ' +
      'control identity. Do not modify source/tests or accept cached results/self-reports. Read-only ' +
      'workers do not receive automatic writer captures. If checks need writes or a renderer, stop only ' +
      'those dependent checks and report notRun/unknown for coordinator execution. Missing browser ' +
      'means rendering remains null/unaccepted. Return fresh bounded evidence and limitations; ' +
      'the coordinator owns acceptance and full test/check/smoke gates.\n' +
      context({input: cfg.input, integrated: cfg.integrated,
        checkPlan: cfg.checkPlan, checkpoints: cfg.checkpointRefs}),
      {id: 'fresh-verify', label: 'Fresh combined verifier', phase: 'Verify',
       skills: ['test-strategy'], requireTools: [], permissions: readOnly,
       maxAttempts: 1, timeoutMs: 1800000, schema: resultSchema('fresh-verify')})
  ]);
  record('fresh-verify', verification[0]);
}

await log('Fixed stage ended; inspect persisted worker outcomes, capture and cleanup; no automatic integration or retry.');
return {
  stage: cfg.stage, expectedTaskIds: ids, rows,
  missingTaskIds: rows.filter(r => r.result === null).map(r => r.taskId),
  integration: 'coordinatorRequired',
  rendering: {result: null, accepted: false, reason: 'Requires separately verified browser and fresh painted evidence'},
  complete: false, completionAuthority: 'coordinator'
};
~~~

The exact worker position/attempt is resolved from persisted worker options.id and actual evidence, never hard-coded from row order. Script rows include every expected ID even when a stage intentionally omits it. Reviews used from another run remain explicit references; their corresponding result rows in a write-only run stay null. No synthesized positive result fills them. The coordinator ledger joins authenticated prior evidence by task ID and exact producer tuple.

For script failures, parallel returns null for a thrown thunk; it does not turn failed/unknown into success. Fatal admission errors may terminate the run before a final result, so inspect durable rows. A reviewer report must be usable for writer dispatch, but neither it nor review JSON asserts capture acceptance. Fresh verification is deliberately absent from an author run until coordinator integration.

## 8. Exact PowerShell validation, saving and first start

All commands in sections 8–14 are **proposed future coordinator operations**, not actions performed by this respondent. Run them in a verified non-login/non-profile PowerShell process. Do not paste unresolved tokens. Coordinator creates the input files/descriptors and the literal script only after resolving section 2; this evaluation creates none of them.

~~~powershell
# Replace each unresolved value from genuine coordinator evidence.
$Node = 'C:/Program Files/nodejs/node.exe'
$PluginRoot = '<absolute installed original plugin root>'
$Launcher = Join-Path $PluginRoot 'bin/launch.mjs'
$Project = '<absolute stable source checkout>'
$Combined = '<absolute coordinator combined checkout>'
$Data = '<absolute data directory outside project>'
$OriginSession = '<actual originating session>'
$ParentContextFile = '<absolute genuine current parent context JSON>'
$RoleBundle = '<absolute immutable resolved v1 capability bundle JSON>'
$CapturePolicy = '<absolute immutable capture-policy JSON>'
$Script = '<absolute dashboard-authoring.mjs>'
$ReviewArgsFile = '<absolute frozen reviews args JSON>'
$AuthorArgsFile = '<absolute frozen author args JSON>'
$WriteArgsFile = '<absolute frozen write-only args JSON>'
$VerifyArgsFile = '<absolute frozen verify args JSON>'

function Invoke-Aw {
  param([Parameter(Mandatory=$true)][string[]]$CommandArgs)
  & $Node $Launcher @CommandArgs '--data-dir' $Data
  if ($LASTEXITCODE -ne 0) {
    throw "Agent Workflow command exited $LASTEXITCODE; preserve evidence and inspect effects before another action."
  }
}
# Node and launcher/source hashes and selected runtime identity are checked first.
& $Node '--version'
if ($LASTEXITCODE -ne 0) { throw 'Node prerequisite failed; do not install or fall back.' }
Invoke-Aw -CommandArgs @('help')
Invoke-Aw -CommandArgs @(
  'doctor','--cwd',$Project,'--session',$OriginSession,
  '--access','parent','--parent-access',$ParentContextFile
)
Invoke-Aw -CommandArgs @('validate',$Script)
Invoke-Aw -CommandArgs @(
  'save','project:dashboard-authoring','--script',$Script,'--cwd',$Project
)
Invoke-Aw -CommandArgs @('read','project:dashboard-authoring','--cwd',$Project)
~~~

There is no CLI --version promise for Agent Workflow here: inspect exact selected runtime/package provenance plus its actual help; Node --version alone proves neither package version nor browser readiness. save is an explicit proposed project-definition write, not performed here. It creates a checkout-scoped definition; do not use --overwrite or --command casually. A save name collision requires inspecting existing bytes and choosing an explicit reviewed naming decision, not automatic replacement. Generated command skill creation is unnecessary.

The immutable capture policy JSON selected for writer starts is:
~~~json
{
  "version": 1,
  "excludeDirs": [],
  "protectedPaths": [
    "engine/monitor/app.mjs",
    "engine/monitor/style.css"
  ]
}
~~~
No installs/build outputs are part of writer scope. If the source input already exceeds capture limits, block writer admission until the coordinator reviews a new policy for a new run; never retroactively exclude unknown outputs or either protected source file. Runtime policy gives version 2 captures; the policy's own schema version remains 1.

ReviewArgsFile has stage:"reviews", reviewTaskIds:["review-ui","review-style"], input descriptor and checkpointRefs. AuthorArgsFile has stage:"author", the same source identity plus included red tests, redTests descriptor and writePaths. WriteArgsFile has stage:"write", input/redTests descriptors, writePaths and exactly the two accepted reviewRefs. VerifyArgsFile has stage:"verify", input/integrated/checkPlan descriptors. JSON descriptor hashes and byte counts are computed from real files; this plan supplies no dummy digests. Files are absolute/visible as appropriate and regular UTF-8 JSON. Args-file is snapshotted as a value; replay does not reread it.

In the supplied historical situation, start only known safe independent reviews first:
~~~powershell
$Startup = Invoke-Aw -CommandArgs @(
  'run','project:dashboard-authoring','--cwd',$Project,
  '--session',$OriginSession,'--access','parent',
  '--parent-access',$ParentContextFile,'--worker-capabilities',$RoleBundle,
  '--args-file',$ReviewArgsFile,'--concurrency','2','--max-attempts','1',
  '--worker-timeout-ms','600000','--run-timeout-ms','0'
) | ConvertFrom-Json
~~~
This review start is permitted only after the stable-source independence check, not simply because it is read-only. Immediately consume startup observation as section 9 requires. Startup.id and Startup.generation are the returned values; no expected UUID is inserted in this plan. If a start command fails or loses its response after possible admission, inspect the data instance/list/status and launch evidence; do not repeat the start. A command that began and failed is executed, not notStarted.

If there were no historical independent review run and all authoring prerequisites were already met, the **single selected alternative** start would be:
~~~powershell
$Startup = Invoke-Aw -CommandArgs @(
  'run','project:dashboard-authoring','--cwd',$Project,
  '--session',$OriginSession,'--access','parent','--parent-access',$ParentContextFile,
  '--worker-capabilities',$RoleBundle,'--capture-policy',$CapturePolicy,'--writable',
  '--args-file',$AuthorArgsFile,'--concurrency','2','--max-attempts','1',
  '--worker-timeout-ms','1200000','--run-timeout-ms','0'
) | ConvertFrom-Json
~~~
Do not execute this alternative in addition to the split sequence. Its time/complexity benefit is one less handoff, its risk is premature writer admission if the coordinator gate is skipped, and its maintenance/best-practice obligations are identical to the split path.

## 9. Attach DashboardDeliveryObserver and carry processed cursors

Before dispatch, coordinator names **DashboardDeliveryObserver**, assigns its live consuming process/host channel and a durable sanitized ledger sink, and confirms it can relay to the originating conversation. This is coordinator activity, not delegated workflow work or an external message. Have the consumer ready for the startup receipt.

Startup watch.required:true and attached:false means no observer is attached yet. Validate returned watch.argv against the verified executable/launcher, exact run/session/generation/data-dir and expected watch-only operation, then invoke that exact argument vector in the observer's already prepared non-profile PowerShell:
~~~powershell
# Startup is handed intact to the named consumer; do not use Invoke-Expression.
[string[]]$WatchArgv = @($Startup.watch.argv)
$WatchExecutable = $WatchArgv[0]
[string[]]$WatchArguments = $WatchArgv[1..($WatchArgv.Length - 1)]
& $WatchExecutable @WatchArguments
# Consumer parses each complete JSONL record as it arrives.
~~~
The observer must actually read and retain the matching kind:"attached" record before saying attached. Record the actual run ID, generation, attachment cursor and time. Do not infer attachment from a launched PID, startup receipt, open dashboard or watch exit code.

For every fully processed durable event, retain its real seq as lastProcessedSeq after writing/relaying it successfully. Preserve exact position/cumulative attempt and status, failure/cleanup/unknown facts; relay worker failures, unknown outcomes and terminal status promptly. For live worker-progress/idle-warning records, retain their cursor and attempt but do not advance a durable acknowledgement beyond an event actually consumed. The ledger's cursor is a consumer-owned checkpoint, not an engine acknowledgement.

Watch defaults poll 500 ms and idle 60000 ms. Commentary is not completed-command/file-change progress. On idle, inspect status, exact worker events and deadline; report idle, do not automatically cancel/restart. On terminal, drain all available terminal pages, retain last processed seq, and confirm both run terminal evidence and cleanup. Watch exit 0 can mean consumer disconnect; it does not by itself mean completion.

On disconnect/error, record the observation gap and last processed cursor; execution may still be active. After deliberate read-only inspection, reattach the SAME generation from the actual recorded cursor:
~~~powershell
# Set these only from the consumer ledger and a fresh exact status read.
$RunId = '<observed run id>'
$Generation = '<observed current generation>'
$LastProcessedSeq = '<actual fully processed durable seq, or 0 if none>'
Invoke-Aw -CommandArgs @(
  'watch',$RunId,'--session',$OriginSession,'--generation',$Generation,
  '--after',$LastProcessedSeq,'--jsonl','--poll-ms','500','--idle-ms','60000'
)
~~~
Reattachment is an explicit observer recovery, not an execution retry. Never jump to a largest advertised/unprocessed cursor. Durable terminal events can replay; observer-local progress/idle facts lost during the gap remain missing. If generation changed or a cursor is refused, retain the old ledger/gap, refresh exact identity and establish a new-generation attachment from a valid cursor; do not imply continuous observation or erase missing history. No automatic retry of execution follows observer failure.

Inspection after each stage requires these resolved values first: RunId/Generation from that stage's actual Startup, Position from the exact task options.id in retained status/worker evidence, and ActivityCursor from that worker's consumed activity page (0 for its first page). Assign the returned identity, without guessing:
~~~powershell
$RunId = [string]$Startup.id
$Generation = [string]$Startup.generation
# Set Position and ActivityCursor from the evidence described above.
~~~
Then inspect:
~~~powershell
Invoke-Aw -CommandArgs @('status',$RunId)
Invoke-Aw -CommandArgs @('result',$RunId)
Invoke-Aw -CommandArgs @('worker',$RunId,'--generation',$Generation,'--position',$Position)
Invoke-Aw -CommandArgs @(
  'events',$RunId,'--generation',$Generation,'--position',$Position,
  '--after',$ActivityCursor,'--limit','50'
)
Invoke-Aw -CommandArgs @(
  'patch',$RunId,'--generation',$Generation,'--position',$Position,'--basis','inputs'
)
~~~
$Position and $ActivityCursor are separately observed worker position and processed activity cursor, not the watch cursor. Add --source-generation only for a genuine linked historical execution. Page events until hasMore false and retain dropped/truncated facts. Do not query a read-only reviewer for a nonexistent writer patch; retain that as inapplicable. A shortened preview is not a complete handoff.

## 10. Reconcile the historical negative-drain writer without erasing it

Supplied facts: the old writer finished model output, jobEmpty:false, and capture is unverified. It may have changed files. Classify its original task outcome/effects **unknown**, retain its original tuple and workspace, and leave its coverage null. Do not merge, dispatch a replacement, resume, repeat commands, or treat a completed model answer as a clean writer. Stop cannot roll back effects.

Coordinator's exact read-only inspection sequence uses its saved runtime routing:
~~~powershell
# All Historical* values come from genuine retained evidence.
Invoke-Aw -CommandArgs @('status',$HistoricalRunId)
Invoke-Aw -CommandArgs @(
  'worker',$HistoricalRunId,'--generation',$HistoricalCurrentGeneration,
  '--position',$HistoricalPosition
)
Invoke-Aw -CommandArgs @(
  'events',$HistoricalRunId,'--generation',$HistoricalCurrentGeneration,
  '--position',$HistoricalPosition,'--after',$HistoricalActivityCursor,'--limit','50'
)
~~~
If the producer is linked to an earlier generation, include --source-generation $HistoricalProducerGeneration for worker/events/patch and preserve that original tuple. The current UI slot is not automatically the producer.

Actual reconciliation requires coordinator/runtime-owned evidence of the owned server/root exit, job becoming empty with windows-job-members scope, successful native terminal inventory cleanup, and an inspection of local/external effects under the original authority. Use only a verified supported owned-cleanup mechanism; this plan invents no cleanup CLI, PID-killing recipe or database edit. If 0.3.6 cannot later establish those facts, the historical runtime replay remains blocked. Preserve workspace and partial artifacts; do not prune, clear locks or set cleanup fields by hand.

The coordinator must compare actual affected paths and inputs to frozen baselines, enumerate outside-scope/external effects rather than assuming none, resolve or quarantine unsafe artifacts, and document what can and cannot be proven. A free-text --reconcile note is not proof of owned termination. Negative job evidence and native terminal uncertainty are independent checks; fixing only one is insufficient.

Executable closure once genuine evidence exists:

1. Retain the original row as unknown with its original jobEmpty:false and unverified capture. Add a separate reconciliation record referencing the exact original producer and new genuine cleanup/effects evidence. Do not relabel history or reconstruct a fake final capture.
2. Protect the independently accepted writer by tuple/bytes/path inventory. Revalidate its unchanged actual bytes and positive cleanup before use; no restart of it.
3. Coordinator freezes a clean new authoring input that contains accepted bytes and excludes untrusted output. Reviews of the same source remain usable only after source identity checks; they do not authenticate unknown writer output.
4. If unfinished UI scope remains safe to admit, new stage:"write" starts only that role from this reviewed snapshot, using section 11's command. This is a new deliberate execution identity, not automatic replay of the old writer.
5. If accepted bytes already satisfy UI scope, skip ui-write and integrate them directly through the same capture barrier; the new run's writer result remains null with accepted prior evidence linked in the ledger.
6. If actual effect reconciliation is still unavailable, keep ui-write and dependent integration unrequested/null. Independent reviews, coordinator test design and accepted-byte preservation continue. This is a local dependency block, not a permanent global ban once genuine reconciliation later arrives.

Avoid restart-worker for this recovery because it repeats the selected earliest failed/unknown invocation **and every later invocation**, including completed writes. If ever independently selected, it would require exact current generation/attempt, settlement, verified cleanup of all affected executions, unchanged original runtime/bundle/parent catalog and a reviewed entire suffix plus real effect reconciliation. The public form is restart-worker ID --session S --generation G --position P --attempt A --reconcile NOTE; it is not a cleanup tool and no note waives the guard. This plan does not run it or use it to repeat accepted work.

## 11. Recover package loss and changed parent catalog completely

These are separate failures. Do not collapse them into a generic "try again" path.

### 11.1 Required skill package disappears after initial admission

Before-task loss rejects affected admission. Post-model loss is detected by the completion source recheck: retain CAPABILITY_SOURCE_CHANGED (or CAPABILITY_SOURCE_UNVERIFIED if the recheck is unavailable), observed model attempt, source fingerprints and cleanup. Do not call it noInference/notStarted when inference already happened. Do not alter the old bundle path/hash, copy a replacement body into the old root, widen roots, or steer a missing skill into the existing worker: live native root grants are unsupported.

Inspect actual producer effects and cleanup exactly as in section 10; a rejected writer may already have edits. Preserve those artifacts for review without treating them as accepted. Other admitted source reviews whose required packages and inputs remain intact may finish; dependent writer/verification slots stay null when needed inputs are missing.

Coordinator closure:
1. Locate the exact original authenticated source/version again through current original-root discovery. An authorized tool owner may restore the exact package installation outside this evaluation; no automatic install is proposed.
2. If the exact original sources cannot be restored, record the affected scope as blocked until the coordinator explicitly selects an authentic new source/version for a **new** bundle and new run. That decision changes future provenance; it does not rewrite old bindings. Same-name discovery alone is insufficient.
3. Verify all current source/reference identities, runtime, actual parent context/catalog and operation prerequisites again. Retain the failed original attempt and any genuine reconciliation as a predecessor record.
4. After effects/drain reconciliation, admit only safe unfinished role scope. Reuse independently accepted bytes by their original producer tuple instead of rerunning their author. For unfinished ui-write use the write-only command below; for a missing review use the same literal script with stage:"reviews" and reviewTaskIds containing only its fixed ID. If neither review is accepted, select both. Preserve the other accepted result as a prior evidence reference; never redispatch it to populate this run.
5. Integrate only newly accepted captures and preserved accepted work, then launch a new stage:"verify" against exact combined bytes. Old package-loss failure remains visible even if the new work succeeds.

Concrete review-only closure uses the same saved script; no future code edit is required:
~~~powershell
# Resolve current context/bundle/Project and this frozen args file after reconciliation.
# ReviewRecoveryArgsFile has stage:"reviews", input/checkpointRefs and
# reviewTaskIds:["review-ui"] OR ["review-style"], exactly the unfinished role.
$Startup = Invoke-Aw -CommandArgs @(
  'run','--script',$Script,'--cwd',$Project,'--session',$OriginSession,
  '--access','parent','--parent-access',$ParentContextFile,
  '--worker-capabilities',$RoleBundle,'--args-file',$ReviewRecoveryArgsFile,
  '--concurrency','1','--max-attempts','1',
  '--worker-timeout-ms','600000','--run-timeout-ms','0'
) | ConvertFrom-Json
# Consume this Startup.watch.argv; skipped accepted review's new result stays null.
~~~
After it settles, coordinator authenticates that new review together with the preserved review, creates WriteArgsFile with both exact reviewRefs, and uses the write-only start below. If ui-write was already accepted, skip it and use the fresh-verification start. Every old failed/unknown row and binding remains unchanged.

### 11.2 Saved replay sees a changed enabled-parent catalog fingerprint

Expect PARENT_CAPABILITIES_CHANGED before generation mutation or dispatch on resume/restart. Record the actual refusal and whether evidence confirms no new process/attempt. Do not clear caches, edit the saved fingerprint, disable a plugin globally, swap source roots or rebuild the backend in a loop to evade it. Saved authority, capability bindings and runtime identity remain original.

Coordinator closure:
1. Read retained status/worker evidence under the original run/runtime and preserve its generation, completed/failed/unknown rows and effects.
2. Reconcile uncertain effects before any overlapping new work, even if the replay refusal itself was before dispatch.
3. Obtain genuine current parent context and complete enabled catalog; resolve current original skill sources, revalidate operation readiness and construct a separate new immutable RoleBundle/args record.
4. Reuse accepted source bytes through verified handoff; do not depend on cached replay for freshness. Determine exact unfinished role IDs from the original ledger, including blocked slots omitted by the script.
5. Start a **new current-catalog** run only for that admitted unfinished scope from a stable reviewed input, using absolute --script below. This does not automatically resume the old run or change its bundle. If no authoring remains, go directly to fresh verification.
6. Observe new admission, attach its own startup watch, validate capture/integration and run fresh verification. Preserve old catalog refusal and any observation gaps as historical evidence.

New-run write closure, used after either branch or section 10 only when all its gates are actually resolved:
~~~powershell
# Re-resolve these CURRENT inputs, not replacements inside an existing run:
# ParentContextFile, RoleBundle, Project, WriteArgsFile and the unchanged verified Script.
Invoke-Aw -CommandArgs @('validate',$Script)
$Startup = Invoke-Aw -CommandArgs @(
  'run','--script',$Script,'--cwd',$Project,'--session',$OriginSession,
  '--access','parent','--parent-access',$ParentContextFile,
  '--worker-capabilities',$RoleBundle,'--capture-policy',$CapturePolicy,'--writable',
  '--args-file',$WriteArgsFile,'--concurrency','1','--max-attempts','1',
  '--worker-timeout-ms','1200000','--run-timeout-ms','0'
) | ConvertFrom-Json
# Immediately hand the new Startup.watch.argv to DashboardDeliveryObserver.
~~~
The same literal script supports this closure; no promised future implementation is needed for ui-write or verification. Missing required skills still block this command. A new run is not a license to evade effect uncertainty. Never use a positional project:name together with --script.

**Recovery implications:** Time — actual source restoration/reconciliation can wait; safe independent tasks proceed. Risk — preserving originals prevents silent source or effect changes but cannot manufacture missing evidence. Complexity — each new run has explicit predecessor and source/context records. Best practice — fail closed at drift/unknown boundaries and accept exact bytes independently. Maintainability — accepted work survives without replay, and old failures remain auditable.

## 12. Review authoritative producer capture before any integration

The coordinator barrier is outside QuickJS. Dependencies carry only scheduling/report context; they never transplant writer worktrees. Read-only reviewers/verifiers have no automatic writer capture. A task's row index, last attempted worker or a cached current slot must not be used as a producer guess.

Resolve the exact identity:
(dataInstanceId, runId, runtimeId, producerGeneration, position, cumulativeAttempt).
Use real status/worker evidence, options.id, reusedFrom and linked priorExecutions to identify an original producer. Keep original status, error, source fingerprint, attempt, effect classification and any reconciliation reference. Current generation and producer/source generation can differ. Follow authorized history links; do not invent one.

Fetch and inspect exact evidence:
~~~powershell
Invoke-Aw -CommandArgs @('status',$ProducerRunId)
Invoke-Aw -CommandArgs @(
  'worker',$ProducerRunId,'--generation',$ProducerCurrentGeneration,
  '--position',$ProducerPosition
)
Invoke-Aw -CommandArgs @(
  'patch',$ProducerRunId,'--generation',$ProducerCurrentGeneration,
  '--position',$ProducerPosition,'--basis','inputs'
)
Invoke-Aw -CommandArgs @(
  'patch',$ProducerRunId,'--generation',$ProducerCurrentGeneration,
  '--position',$ProducerPosition,'--basis','base'
)
Invoke-Aw -CommandArgs @(
  'exclusions',$ProducerRunId,'--generation',$ProducerCurrentGeneration,
  '--position',$ProducerPosition,'--stage','outputs','--after','0','--limit','50'
)
~~~
Use --source-generation $ProducerGeneration on those worker/patch/exclusion commands when this is an actual linked original producer. Page exclusions with their own actual cursors. Exclusions apply to version 2 captures; none are expected under this policy, and excluded metadata never proves omitted payload bytes. These values must be observed before commands. CLI patch verifies its patch bytes/hash only; it does NOT independently certify every blob/live workspace. Status/worker previews may truncate, so use complete retained evidence.

Barrier checks, all required:
1. Runtime/session/data-instance and exact tuple match authoritative records. Recorded original status and original cleanup are retained, even on later recovery. Ordinary accepted writer must be completed with a finalized capture; unknown producer output is excluded here.
2. Positive owned cleanup at worker and settled aggregate: serverExited:true, jobEmpty:true, ownershipScope:"windows-job-members", no cleanup error. Independently require the worker's nativeTerminals.inventoryEmpty:true with no native terminal error; aggregate receipts do not promise that field. This proves owned job scope, not arbitrary descendants/external effects. No required missing fact is interpreted as true.
3. Verify original input manifest, base/input tree, private input-index hash, workspace/source/common identity and original capture policy. Compare writer input UI hashes to reviewed/red-test snapshot.
4. Verify result manifest exact bytes/hash, patch and from-base bytes/hashes, result tree, changedFiles, fileCount and totals. Verify **every included blob** regular-file identity, normalized path, mode, byte length/hash; reject links, traversal, case collisions, missing/changed blobs, unrelated metadata changes and source drift.
5. Review complete changed-path inventory against the sole writer's actual allowed subset of the two UI files and preserved accepted-path map. No untracked/unapproved files, test changes, package files, binaries, deletion of protected outputs or out-of-scope patch hunks.
6. Verify current retained writer bytes are still the captured bytes. A patch preview or writer-reported hash cannot stand in for manifest/blob/live-workspace checks. Store reviewed evidence without secrets.
7. Record one coordinator handoff per producer with original tuple/status, actual capture manifest/hash, accepted allowed-path hashes/bytes, positive cleanup and reviewed effects reference. Fail closed if any check is unknown.

For a concrete non-guest integrity check, coordinator may save this helper outside product source after verifying the producer's exact retained runtime module. It uses the public 0.3.6 source export for full workspace verification, not a fictitious CLI verify-capture command. ProducerRecord is coordinator-resolved complete original worker evidence; its identity is authenticated against the CLI/retained runtime before invoking this helper:
~~~javascript
// verify-producer.mjs -- coordinator-side integrity only, not a workflow script.
import {readFile, lstat, realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const [runtimeRoot, producerRecordPath, declaredAllowedPath] = process.argv.slice(2);
const fail = message => { throw new Error(message); };
if (!runtimeRoot || !producerRecordPath || !declaredAllowedPath) fail('Three resolved inputs required');
const producer = JSON.parse(await readFile(producerRecordPath, 'utf8'));
const allowed = JSON.parse(await readFile(declaredAllowedPath, 'utf8'));
if (!Array.isArray(allowed) || allowed.length < 1 || allowed.length > 2 ||
    new Set(allowed).size !== allowed.length ||
    allowed.some(p => !['engine/monitor/app.mjs', 'engine/monitor/style.css'].includes(p))) {
  fail('Invalid owned path subset');
}
const worker = producer.worker;
if (!producer.identityAuthenticated || worker?.status !== 'completed' ||
    worker.attempts !== producer.cumulativeAttempt) fail('Unaccepted producer identity/outcome');
for (const cleanup of [worker.evidence?.cleanup, producer.aggregateCleanup]) {
  if (cleanup?.serverExited !== true || cleanup.jobEmpty !== true ||
      cleanup.ownershipScope !== 'windows-job-members' || cleanup.error) {
    fail('Positive worker and aggregate owned cleanup required');
  }
}
const nativeCleanup = worker.evidence.cleanup.nativeTerminals;
if (nativeCleanup?.inventoryEmpty !== true || nativeCleanup.error) fail('Worker native cleanup required');
const {verifyWorkspace} = await import(
  pathToFileURL(resolve(runtimeRoot, 'engine', 'workspaces.mjs')).href
);
await verifyWorkspace(worker.workspace);
const manifestBytes = await readFile(worker.workspace.manifestPath);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
if (sha(manifestBytes) !== worker.workspace.manifestHash) fail('Manifest drift');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (!Array.isArray(manifest.changedFiles) ||
    manifest.changedFiles.some(p => !allowed.includes(p)) ||
    (manifest.missingProtectedPaths?.length ?? 0) !== 0) fail('Out-of-scope or missing output');
const files = [];
for (const path of allowed) {
  const entry = manifest.files.find(item => item.name === path);
  if (!entry) fail('Owned source not retained');
  const stat = await lstat(entry.blobPath);
  if (!stat.isFile() || stat.nlink !== 1 ||
      await realpath(entry.blobPath) !== entry.blobPath) fail('Unsafe blob');
  const bytes = await readFile(entry.blobPath);
  if (bytes.length !== entry.size || sha(bytes) !== entry.sha256) fail('Blob drift');
  files.push({path, bytes: bytes.length, sha256: entry.sha256, blobPath: entry.blobPath});
}
console.log(JSON.stringify({producer: producer.identity,
  originalOutcome: worker.status, manifestHash: sha(manifestBytes), files,
  integrity: 'verified', acceptance: 'coordinatorReviewRequired'}));
~~~
identityAuthenticated is a coordinator assertion checked against real evidence before helper use, not an authenticated acceptance API. The helper cannot authenticate its own input. Coordinator must independently match the complete identity including generation/position/runtime, review allowed-path policy and actual patch content/effects. Source hash validation of the retained module/dependencies precedes import. It never imports or evaluates the guest workflow body.

Proposed invocation, only with resolved helper/runtime/record paths:
~~~powershell
& $Node $VerifyProducerHelper $ProducerRetainedRuntimeRoot $ProducerRecord $AllowedPathsFile
if ($LASTEXITCODE -ne 0) { throw 'Capture integrity failed; no integration or automatic fallback.' }
~~~
No copy/apply follows automatically from a passed helper: retain its evidence, complete human/source review, then pass the coordinator barrier. Capture size limits remain 20000 files, 512 MiB included bytes and each diff; metadata/preview limits are separate. Do not repair old unverified captures by silently raising limits or inventing a new manifest.

## 13. Deliberately integrate and freeze exact combined bytes

After the barrier, coordinator uses an independently owned combined checkout, never an active writer directory. Preserve accepted independent writer bytes and test ownership. Resolve all path/identity conflicts before mutation; two producers cannot silently own the same shared file. If the accepted writer covers an allowed path, remove it from new writePaths and require that accepted hash in integration. If the remaining objective needs changing protected accepted work, explicitly revise ownership/acceptance before dispatch rather than overwriting it under this plan.

Coordinator's exact integration operation is a reviewed copy of the verified full source blobs for approved paths, checked against the expected combined preimage, rather than an automatic merge or application of arbitrary patches:
~~~powershell
# Each scalar is taken from the reviewed handoff and expected combined preimage.
# Validate canonical target is inside Combined and RelativePath is in the allowed UI subset.
$Target = Join-Path $Combined $RelativePath
$ResolvedCombined = [IO.Path]::GetFullPath($Combined).TrimEnd('\','/')
$ResolvedTarget = [IO.Path]::GetFullPath($Target)
if (-not $ResolvedTarget.StartsWith($ResolvedCombined + [IO.Path]::DirectorySeparatorChar,
    [StringComparison]::OrdinalIgnoreCase)) { throw 'Integration target escapes combined checkout.' }
if (@('engine/monitor/app.mjs','engine/monitor/style.css') -notcontains $RelativePath) {
  throw 'Unowned integration target.'
}
# Coordinator also verifies no path component is a link and no accepted path is overwritten.
if ((Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedPreimageHash) {
  throw 'Combined preimage changed; inspect before writing.'
}
if ((Get-FileHash -LiteralPath $VerifiedBlob -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedOutputHash) {
  throw 'Verified producer blob changed.'
}
Copy-Item -LiteralPath $VerifiedBlob -Destination $Target -ErrorAction Stop
if ((Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedOutputHash) {
  throw 'Integration output mismatch; preserve uncertain copy and reconcile.'
}
~~~
Apply one reviewed record at a time; stop dependent work if a mutating operation fails or loses its response. Do not automatically repeat it. Length checks accompany hashes in the actual record. No commit, merge, Git metadata changes or filesystem links are part of this bounded proposal. Runtime-managed writer worktrees are managed by the supported engine, not child-authored Git commands.

Freeze a combined manifest including canonical checkout, actual baseline/source inventory, both UI files, all coordinator changed tests/fixtures, relevant public HTML/services/API inputs, script hash, dependency/runtime identity, accepted producer handoffs and capture policy. Compute exact file lengths/SHA-256 and manifest-byte SHA-256; keep it regular, bounded and visible to the verifier. Verify each input before and after checks. Stable checkout means no background writer, observer or renderer changing tracked inputs; generated evidence goes outside source under coordinator ownership. Any change invalidates pending acceptance and requires a new frozen identity/fresh verification, not relabeling earlier evidence.

Coordinator resolves checkPlan with exact argv/cwd/subjects and prerequisite paths. At minimum it covers affected behavioral tests and full gates below. Recheck preserved accepted bytes in the combined checkout. Native source selection and actual rendered application identity are separate from this file manifest.

## 14. Launch a fresh verifier from the combined checkout, then final gates

Resolve before this command: Combined, Script, VerifyArgsFile with actual integrated/checkPlan hashes, genuine current OriginSession/ParentContextFile, resolved RoleBundle, Node/Launcher/Data, and fresh worker prerequisite observations. Confirm producer reconciliation/integration barrier is complete. Do not reuse a saved author result or resume a verifier.

The project: definition saved under Project is checkout-scoped and is NOT assumed available under Combined. Use the absolute verified Script explicitly:
~~~powershell
Invoke-Aw -CommandArgs @('validate',$Script)
$Startup = Invoke-Aw -CommandArgs @(
  'run','--script',$Script,'--cwd',$Combined,'--session',$OriginSession,
  '--access','parent','--parent-access',$ParentContextFile,
  '--worker-capabilities',$RoleBundle,'--args-file',$VerifyArgsFile,
  '--concurrency','1','--max-attempts','1',
  '--worker-timeout-ms','1800000','--run-timeout-ms','0'
) | ConvertFrom-Json
# DashboardDeliveryObserver consumes this new startup watch.argv and confirms attached.
~~~
No --writable is used; read-only fresh-verify selects test-strategy and verifies source/check results without authoring. An explicitly saved definition in Combined would also be supported, but this plan chooses absolute --script to avoid additional definition state. That choice saves setup time, lowers checkout-resolution risk and maintenance complexity, and follows the documented resolution contract.

Coordinator records the fresh verifier's actual cwd, new run/generation/position/cumulative attempt, native initial test-strategy main read, current source recheck, command evidence, cleanup and actual source hashes before/after. No cached:true row is accepted as fresh verification. Worker self-report is reconciled with command/event evidence; missing native activation/check evidence remains null/unverified.

Coordinator extends existing tests, with one owner per invariant:
- Run navigation remains compact, keyboard-operable and responsive with empty/single/many runs, long Unicode names, filters, pagination errors and stable focus/scroll during polling.
- Deliberate selected run/runtime/data-instance/generation controls bind only after a fresh matching snapshot; auto-follow/filtering do not arm another run. Stale/out-of-order responses do not replace current identity.
- Failed/unknown outcomes have visible reason/code when supplied, and explicit missing/unverified reason text otherwise. Do not infer no-process/no-inference, successful drain, accepted delivery, or complete descendants from absent evidence.
- Diagnostics are text-safe and bounded; long/malformed reasons and truncated previews cannot inject HTML or hide coverage/failure. Auth tokens do not appear in rendered reasons/logs.
- Light/dark/narrow/zoom/focus presentation remains usable. Source/DOM checks cover structure and semantics; painted layout/contrast/focus visibility needs the missing renderer.

First reproduce meaningful red behavior before fixing; later check the new tests reject a plausible broken behavior (for example hiding failure text, accepting a stale selection, or clipping navigation focus). Do not add tests that merely mirror implementation details. Use actual DOM/process/persistence boundaries where relevant, and the existing production invariant owners. Tests/HTML/subprocess subjects stay in full merge coverage.

Full final commands are coordinator-owned, run in Combined under the verified matching npm executable and existing prepared dependencies. No installation is implied:
~~~powershell
$Npm = '<absolute coordinator-verified npm.cmd matching Node24>'
Push-Location -LiteralPath $Combined
try {
  & $Npm 'test'
  if ($LASTEXITCODE -ne 0) { throw 'npm test failed; preserve outputs and investigate effects.' }
  & $Npm 'run' 'check'
  if ($LASTEXITCODE -ne 0) { throw 'npm run check failed; preserve outputs and investigate effects.' }
  & $Npm 'run' 'smoke'
  if ($LASTEXITCODE -ne 0) { throw 'npm run smoke failed; preserve outputs and investigate effects.' }
} finally {
  Pop-Location
}
~~~
Affected test argv are resolved in checkPlan from existing owners before execution, using verified Node24 --test and exact test paths, not guessed filenames. A read-only verifier executes checks that are admitted in its environment. Tests needing temp/service/write operations that its policy cannot admit are marked notRun and executed by the coordinator under actual authority; the verifier then independently inspects exact retained evidence and rechecks source identity. Do not widen its sandbox silently or claim a full suite from only a subset. If a fresh rerun by the verifier is necessary for acceptance, budget/admit that as the single reviewed unfinished-scope revision rather than cached replay.

Do not automatically retry failed test/smoke commands: they can have effects. Inspect started/exited evidence and reconcile before any new attempt. Dependencies missing from the verified environment block those checks; no npm ci, browser install or cache fallback here. Coordinator rehashes the stable source/test inventory after all gates and before acceptance.

Rendering remains a separate required missing check. Once an actual authorized renderer is ready, use a fresh exact-source monitor/fixture under coordinator ownership with port 0 and the complete authenticated private URL, retain source/runtime/server identity, painted screenshots/measurements and keyboard/theme/viewport observations. Check 320/768/1440 widths, light/dark, zoom and long failure/navigation states without real mutating controls. A current installed dashboard does not automatically serve edited Combined source; establish the exact asset hashes through an explicitly reviewed source-preview or installed-version decision first. No server/browser operation is executed by this plan, and no historical browser report or source-only test accepts current paint.

These are feature verification gates, not a release. Clean-package installation, production audit, required Windows PR/tag checks and exact published-version installation would be additional release obligations under AGENTS.md. This task authorizes no release/Actions/publication.

## 15. Dashboard and run lifecycle are separate

Only after actual execution authorization and resolved IDs, coordinator may explicitly open:
~~~powershell
Invoke-Aw -CommandArgs @('dashboard',$RunId,'--session',$OriginSession)
~~~
Keep the complete returned URL including authentication fragment private; fragment removal/session storage is presentation behavior, not a permission grant. A viewed run is not automatically an armed control target. The monitor uses port 0 and can stay available indefinitely until manual Close; no artificial TTL is required.

**Close** ends the monitor service; closing only a browser tab does not stop the run or necessarily the service. It does not cancel workers or reconcile their effects. A lost Close response means inspect service availability, not auto-repeat. Dashboard health and selected run status remain separate.

**Stop** is an originating-session, generation-bound workflow control that stops admission and interrupts active work; await its receipt settlement and cleanup. It is not rollback. Exact proposed control:
~~~powershell
# Fresh status first; use only the newly observed generation.
Invoke-Aw -CommandArgs @('status',$RunId)
Invoke-Aw -CommandArgs @(
  'stop',$RunId,'--session',$OriginSession,'--generation',$Generation
)
# Set ControlReceiptId from that actual returned receipt, then:
Invoke-Aw -CommandArgs @('control',$RunId,'--receipt',$ControlReceiptId)
Invoke-Aw -CommandArgs @('status',$RunId)
~~~
A pending receipt is not settlement. A failed/lost control response requires inspecting receipt/status/effects without resubmitting. A stale generation must be refreshed and deliberately retargeted, never silently rewritten. Observer cancellation stops only observation; observer disconnection stops neither run nor dashboard.

## 16. Evidence ledger and honest completion boundary

Coordinator retains a compact ledger separate from public prose. For every expected task, record task ID; original and current producer tuples; runtime/Node/source/catalog/bundle hashes; selected/observed/missing native skills; readiness/execution/check facts; original outcome/error/effects; worker and aggregate cleanup; manifest/patch/blob hashes and bytes; accepted paths; integration snapshot; fresh check/render evidence; and explicit null coverage/reason. Keep each original failed/unknown attempt even if a later scope completes. Do not store tokens, raw account context, skill bodies or private dashboard URLs.

| Supplied situation / stage | Current planning truth | Evidence needed to change acceptance |
| --- | --- | --- |
| Historical writer with jobEmpty:false | Original unknown; unverified capture; no replacement/merge/replay | Genuine owned/native cleanup plus effect reconciliation, followed by safe new scope or verified accepted-byte handoff |
| Separate accepted writer | Preserve its verified unchanged bytes and positive cleanup | Revalidated actual tuple/bytes before integration; never repeat it just to populate a new run |
| Required package loss | Affected task rejected/blocked; effects may exist | Reconciliation and new authentic source/context admission; original bindings/outcome preserved |
| Changed parent fingerprint | Saved replay refuses before new dispatch; old generation retained | Genuine current catalog/context and new immutable run for unfinished scope; prior effects still reconciled |
| Two independent reviews | Planned, not performed by this artifact | Actual native reads, source findings and stable input identity |
| UI writer | Planned; source authoring can outlive missing renderer | Native beautiful+tdd, red-before-fix checks, clean capture and reviewed integration |
| Fresh combined verifier | Planned, not cached or self-reported acceptance | New run on exact stable bytes, test-strategy activation, actual fresh check evidence and cleanup |
| Full test/check/smoke | Not run here | Actual complete final gates on unchanged integrated source/tests |
| Rendering | Null / unaccepted while browser prerequisite missing | Verified real operation and exact-byte painted/interaction evidence |
| Whole objective | Incomplete until all required coverage is accepted | Coordinator acceptance across captures, fresh checks and rendering; no historical unknown erasure |

This file is the completed planning deliverable, including recovery continuations; it is not evidence the hypothetical product work happened. The initial useful artifact structure was written early and completed in the same sole owned file. No follow-up steering is assumed. Source authoring, readiness, native skill activation and rendering/delivery acceptance remain distinct.

## 17. Public contract anchors and authoring boundary

Sources checked: README.md; docs/api.md, worker-capabilities.md, limitations.md, verification.md; .testing/risk.yml; AGENTS.md; public workflows/decomposition-delivery.js; public bin argument/command/launcher source; public engine script/schema/evaluator/controller/settings/deadline/watch/capture/restart source; and the two assigned monitor sources. The API establishes exact CLI/bundle/native activation semantics; source confirms literal metadata, parallel(thunks), finite deadlines, original producer identities, capture checks and cursor behavior.

No sibling artifact, run/worker receipt, private mapping, historical score, other review directory, .agents, .local, .git or node_modules was read to author this artifact. No proposed workflow or product verification was executed.
