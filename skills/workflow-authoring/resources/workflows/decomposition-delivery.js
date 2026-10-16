export const meta = {
  name: 'decomposition-delivery',
  description: 'Scout fixed task scopes, author isolated deliverables, then return coverage for coordinator integration and fresh verification.',
  phases: [{title: 'Scout'}, {title: 'Deliver'}, {title: 'Verify'}]
};

// This is an evidence-producing recipe, not an acceptance or replanning service.
// Receipt references in args are coordinator handoffs; the guest cannot authenticate them.
const options = args ?? {};
const limits = options.limits ?? {};
const maxTasks = limits.maxTasks ?? 32;
const maxRevisionRounds = limits.maxRevisionRounds ?? 2;
const stage = options.stage ?? 'deliver';
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function text(value, max = 2000) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
function id(value) { return text(value, 100) && /^[A-Za-z0-9_-]+$/.test(value); }
function list(value, max = 32) { return Array.isArray(value) && value.length <= max; }
function strings(value, max = 32) { return list(value, max) && value.every(item => text(item)); }
function runRef(value) { return value && ['dataInstanceId', 'runId', 'runtimeId'].every(key => text(value[key], 200)); }
function hash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function relativePath(value) {
  requireValue(text(value, 300) && !/^[\/]/.test(value) && !/[\\:*?"<>|\x00-\x1f]/.test(value), 'Scope paths must be literal repository-relative paths');
  const parts = value.replace(/\/$/, '').split('/');
  requireValue(parts.every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^\.git$/i.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)), 'Scope paths cannot traverse or name Git metadata or ambiguous Windows paths');
  return value.toLowerCase();
}
function pathList(value) {
  requireValue(list(value), 'Scope path inventory exceeds 32 entries');
  const keys = value.map(relativePath);
  requireValue(new Set(keys).size === keys.length, 'Scope path inventory contains colliding paths');
}
function contains(owner, candidate) { return owner === candidate || owner.endsWith('/') && candidate.startsWith(owner); }
function overlaps(a, b) {
  // A bare path and the same directory prefix also collide on Windows.
  return a.replace(/\/$/, '') === b.replace(/\/$/, '') || contains(a, b) || contains(b, a);
}
requireValue(Number.isInteger(maxTasks) && maxTasks >= 1 && maxTasks <= 64, 'maxTasks must be 1-64, chosen before dispatch');
requireValue(Number.isInteger(maxRevisionRounds) && maxRevisionRounds >= 1 && maxRevisionRounds <= 8, 'maxRevisionRounds must be 1-8, chosen before dispatch');
requireValue(stage === 'deliver' || stage === 'verify', 'stage must be deliver or verify');
const plan = options.planRevision;
requireValue(plan && plan.version === 1 && Number.isInteger(plan.revision) && plan.revision >= 1 && plan.revision <= maxRevisionRounds, 'A bounded PlanRevisionV1 is required');
requireValue(JSON.stringify(plan).length <= 128000, 'Plan revision exceeds the bounded argument contract');
requireValue(list(plan.objectives, 64) && plan.objectives.length > 0 && plan.objectives.every(objective => id(objective.id) && text(objective.description)), 'Objectives require stable IDs and descriptions');
const objectiveIds = plan.objectives.map(objective => objective.id);
requireValue(new Set(objectiveIds).size === objectiveIds.length, 'Objective IDs must be unique');
requireValue(list(plan.tasks, maxTasks) && plan.tasks.length > 0, 'Tasks exceed the declared limit or are missing');
requireValue(plan.revision === 1 ? plan.priorRun === null : runRef(plan.priorRun), 'Revisions require an explicit prior run; first revisions use null');
requireValue(list(plan.replacements, maxTasks), 'Replacement links are required, even when empty');
const taskIds = [];
const ownership = [];
for (const task of plan.tasks) {
  requireValue(id(task.id) && !taskIds.includes(task.id), 'Task IDs must be unique portable worker IDs');
  requireValue(strings(task.objectiveIds) && task.objectiveIds.length > 0 && new Set(task.objectiveIds).size === task.objectiveIds.length && task.objectiveIds.every(value => objectiveIds.includes(value)), 'Tasks must retain known objective IDs');
  requireValue(text(task.phase, 500) && strings(task.inputs), 'Each task requires a phase and bounded inputs');
  pathList(task.exclusions); pathList(task.readScope); pathList(task.writeOwnership);
  requireValue(list(task.dependsOn) && new Set(task.dependsOn).size === task.dependsOn.length && task.dependsOn.every(value => taskIds.includes(value)), 'Dependencies must name distinct earlier tasks, never imply file transfer');
  for (const value of task.writeOwnership) {
    const key = relativePath(value);
    requireValue(!ownership.some(prior => overlaps(key, prior.key)), 'Writer ownership overlaps; assign one owner to each source path and interface');
    requireValue(!task.exclusions.some(exclusion => overlaps(key, relativePath(exclusion))), 'Writer ownership conflicts with exclusions');
    ownership.push({key, taskId: task.id});
  }
  requireValue(list(task.artifactContract) && task.artifactContract.length > 0, 'Each delivery task needs at least one declared artifact');
  const claims = [];
  for (const artifact of task.artifactContract) {
    requireValue(id(artifact.claimId) && !claims.includes(artifact.claimId), 'Artifact claim IDs must be unique within the task');
    const key = relativePath(artifact.relativePath);
    requireValue(!artifact.relativePath.endsWith('/') && task.writeOwnership.some(owner => contains(relativePath(owner), key)), 'Artifact paths must be files inside writer ownership');
    claims.push(artifact.claimId);
  }
  requireValue(list(task.acceptanceChecks) && task.acceptanceChecks.length > 0 && task.acceptanceChecks.some(check => check.required === true), 'Declare at least one required acceptance check');
  const checkIds = [];
  for (const check of task.acceptanceChecks) {
    requireValue(id(check.id) && !checkIds.includes(check.id) && text(check.command) && typeof check.required === 'boolean', 'Checks require unique IDs, exact commands and required flags');
    checkIds.push(check.id);
  }
  requireValue(list(task.prerequisites), 'Prerequisites must be a bounded inventory');
  const prerequisiteIds = [];
  for (const prerequisite of task.prerequisites) {
    requireValue(id(prerequisite.id) && !prerequisiteIds.includes(prerequisite.id) && text(prerequisite.command) && (prerequisite.executablePath === null || text(prerequisite.executablePath, 500)) && (prerequisite.cachePath === null || text(prerequisite.cachePath, 500)) && ['authoring', 'verification'].includes(prerequisite.requiredFor), 'Prerequisites require IDs, commands, explicit executable/cache paths or null, and their dependent stage');
    prerequisiteIds.push(prerequisite.id);
  }
  requireValue(task.limits && (task.limits.timeoutMs === null || Number.isSafeInteger(task.limits.timeoutMs) && task.limits.timeoutMs >= 1), 'Choose no worker deadline with null or a positive safe millisecond budget');
  requireValue(JSON.stringify(task).length <= 14000, 'Task context exceeds 14,000 characters; split scope before dispatch');
  taskIds.push(task.id);
}
const replacementIds = [];
const authorityRequired = new Set();
for (const replacement of plan.replacements) {
  const prior = replacement.prior;
  requireValue(plan.revision > 1 && taskIds.includes(replacement.taskId) && !replacementIds.includes(replacement.taskId) && prior && runRef(prior.run) && ['dataInstanceId', 'runId', 'runtimeId'].every(key => prior.run[key] === plan.priorRun[key]) && id(prior.taskId), 'Replacement links must name an unfinished task in the recorded prior run');
  requireValue(Number.isInteger(prior.generation) && prior.generation >= 1 && Number.isInteger(prior.position) && prior.position >= 0 && Number.isInteger(prior.attempt) && prior.attempt >= 1 && ['failed', 'unknown', 'blocked', 'incomplete'].includes(prior.outcome) && ['none', 'uncertain', 'reconciled'].includes(prior.effects), 'Preserve exact prior generation, position, cumulative attempt, outcome and effects');
  if (prior.outcome === 'unknown' || prior.effects !== 'none') {
    // No trusted receipt resolver exists in this guest. Even nonempty receipt
    // references or a caller's "reconciled" classification cannot admit repetition.
    authorityRequired.add(replacement.taskId);
  }
  replacementIds.push(replacement.taskId);
}
requireValue(plan.revision === 1 || plan.replacements.length > 0, 'A revision must append explicit unfinished-task replacement links');

const stringSchema = {type: 'string', minLength: 1, maxLength: 2000};
const shortSchema = {type: 'string', minLength: 1, maxLength: 100};
const pathSchema = {type: 'string', minLength: 1, maxLength: 500};
const nullablePathSchema = {type: ['string', 'null'], minLength: 1, maxLength: 500};
function arrayOf(items, maxItems = 32) { return {type: 'array', maxItems, items}; }
function objectOf(properties) { return {type: 'object', properties, required: Object.keys(properties), additionalProperties: false}; }
const evidenceRefsSchema = arrayOf(stringSchema, 16);
const scoutSchema = objectOf({
  taskId: shortSchema,
  files: arrayOf(objectOf({relativePath: pathSchema, detail: stringSchema}), 64),
  proposedSlices: arrayOf(objectOf({id: shortSchema, readScope: arrayOf(pathSchema), writeOwnership: arrayOf(pathSchema)}), 8),
  interfaces: arrayOf(objectOf({name: shortSchema, ownerTaskId: shortSchema, detail: stringSchema}), 16),
  prerequisites: arrayOf(objectOf({id: shortSchema, available: {type: 'boolean'}, command: stringSchema, executablePath: nullablePathSchema, cachePath: nullablePathSchema, evidence: stringSchema})),
  uncertainties: arrayOf(stringSchema, 16)
});
const taskSchema = objectOf({
  contract: {type: 'string', const: 'agent-workflow.task.v1'},
  taskId: shortSchema,
  outcome: {type: 'string', enum: ['delivered', 'blocked', 'incomplete']},
  summary: {type: 'string', maxLength: 2000},
  blockers: arrayOf(objectOf({code: shortSchema, detail: stringSchema, evidenceRefs: evidenceRefsSchema}), 16),
  artifacts: arrayOf(objectOf({claimId: shortSchema, relativePath: pathSchema, sha256: {type: ['string', 'null'], minLength: 64, maxLength: 64}, bytes: {type: ['integer', 'null'], minimum: 0}})),
  checks: arrayOf(objectOf({checkId: shortSchema, status: {type: 'string', enum: ['passed', 'failed', 'notRun', 'unknown']}, evidenceRefs: evidenceRefsSchema}))
});
function schemaFor(schema, task) { return {...schema, properties: {...schema.properties, taskId: {type: 'string', const: task.id}}}; }
function context(value) {
  const result = JSON.stringify(value);
  requireValue(result.length <= 42000, 'Worker JSON handoff exceeds 42,000 characters; narrow scope in an explicit revision');
  return result;
}
function reportEvidence(task, report) {
  if (!report || report.taskId !== task.id || report.contract !== 'agent-workflow.task.v1') return 'missing';
  const unique = new Set(report.artifacts.map(artifact => artifact.claimId));
  if (unique.size !== report.artifacts.length || report.artifacts.some(artifact => !task.artifactContract.some(expected => expected.claimId === artifact.claimId && expected.relativePath === artifact.relativePath))) return 'missing';
  return task.artifactContract.every(expected => report.artifacts.some(artifact => artifact.claimId === expected.claimId && artifact.relativePath === expected.relativePath)) ? 'claimed' : 'missing';
}
const rows = plan.tasks.map((task, index) => ({
  taskId: task.id, objectiveIds: task.objectiveIds, workerId: null, workerRef: null,
  scout: null, report: null, outcome: null, artifacts: [], deliveryEvidence: 'missing',
  accepted: false, reason: authorityRequired.has(task.id) ? 'Coordinator required: prior unknown outcome or effects require authoritative reconciliation and drain admission outside this recipe; JSON receipt references cannot authorize repetition' : null, index
}));
const verificationRows = plan.tasks.map(task => ({taskId: task.id, workerId: null, workerRef: null, result: null, status: 'notRun'}));
let integration = {status: 'coordinatorRequired', receiptRef: null, snapshotRef: null, handoffs: [], reason: 'Review authoritative captures, integrate allowed paths, then start a new verification run from the verified snapshot.'};
const workerRules = 'Use only the assigned scope. Do not install dependencies, merge, commit, publish, start services, or repeat uncertain effects unless separately authorized by the coordinator. A command that exited nonzero was executed and may have changed files; notStarted requires proof no process began. Report the exact blocked command, executable/cache path and observed evidence. A missing prerequisite blocks dependent commands; continue independent authorized source authoring. No automatic retry or fallback after uncertain effects.';

if (stage === 'deliver') {
  await phase('Scout');
  const scouts = await parallel(plan.tasks.map((task, index) => () => authorityRequired.has(task.id) ? null : agent(
    'Read-only scout. Enumerate bounded relevant files/scopes, independent slices, shared interfaces with one named owner, prerequisite evidence and uncertainties. Proposals do not change the fixed plan. Do not write or execute potentially mutating commands. ' + workerRules + '\nTask: ' + context(task),
    {id: 'scout-' + index, label: task.id, phase: 'Scout', permissions: {sandbox: 'read-only', networkAccess: false, approvalPolicy: 'never'}, schema: schemaFor(scoutSchema, task), maxAttempts: 1, timeoutMs: task.limits.timeoutMs}
  )));
  rows.forEach((row, index) => { row.scout = scouts[index] ?? null; });
  await phase('Deliver');
  // Explicit topological waves over the fixed worklist, never new tasks or retries.
  const finished = new Set();
  while (finished.size < rows.length) {
    const ready = rows.filter(row => !finished.has(row.taskId) && plan.tasks[row.index].dependsOn.every(value => finished.has(value)));
    requireValue(ready.length > 0, 'Fixed task graph cannot progress');
    const outputs = await parallel(ready.map(row => async () => {
      const task = plan.tasks[row.index];
      if (row.scout === null) { row.reason ??= 'Scout unavailable; no writer dispatched'; return null; }
      const prerequisites = task.dependsOn.map(value => rows.find(previous => previous.taskId === value));
      if (prerequisites.some(previous => previous.outcome !== 'delivered' || previous.deliveryEvidence !== 'claimed')) {
        row.reason = 'Prerequisite delivery missing or incomplete; no writer dispatched'; return null;
      }
      const unavailable = task.prerequisites.filter(prerequisite => prerequisite.requiredFor === 'authoring' && !row.scout.prerequisites.some(observed => observed.id === prerequisite.id && observed.available && observed.command === prerequisite.command && observed.executablePath === prerequisite.executablePath && observed.cachePath === prerequisite.cachePath && text(observed.evidence)));
      if (unavailable.length) { row.reason = 'Authoring prerequisite unavailable: ' + JSON.stringify(unavailable); return null; }
      row.workerId = 'deliver-' + row.index;
      const input = context({task, scout: row.scout, predecessorReports: prerequisites.map(previous => ({taskId: previous.taskId, report: previous.report})), replacement: plan.replacements.find(replacement => replacement.taskId === task.id) ?? null});
      return agent('Produce the actual declared deliverables in your isolated worktree using the fixed task contract and scout JSON. Read scope is not write ownership. Do not widen ownership from scout proposals. Dependency completion does not transfer predecessor files. Predecessor reports are JSON context and unverified claims; do not apply their files or patches. Work requiring those bytes must wait for coordinator-reviewed capture integration into a new verified snapshot. Return partial artifacts and blocked or incomplete work honestly. Native turn completion does not establish delivery. ' + workerRules + '\nHandoff: ' + input,
        {id: row.workerId, label: task.id, phase: 'Deliver', dependsOn: ['scout-' + row.index, ...prerequisites.map(previous => previous.workerId)], permissions: {sandbox: 'workspace-write', networkAccess: false, approvalPolicy: 'never'}, schema: schemaFor(taskSchema, task), maxAttempts: 1, timeoutMs: task.limits.timeoutMs});
    }));
    ready.forEach((row, index) => {
      row.report = outputs[index] ?? null;
      row.outcome = row.report?.outcome ?? null;
      row.artifacts = row.report?.artifacts ?? [];
      row.deliveryEvidence = reportEvidence(plan.tasks[row.index], row.report);
      row.reason ??= row.report === null ? 'Delivery unavailable; retain original execution status and inspect unknown effects before any replacement' : row.deliveryEvidence === 'missing' ? 'Required artifact claims missing or outside the contract' : 'Claims await retained capture integrity, integration and acceptance';
      finished.add(row.taskId);
    });
  }
} else {
  // The coordinator supplies a stable integrated checkout; read-only workers do not create writer captures.
  const supplied = options.integration;
  const valid = supplied && text(supplied.receiptRef) && text(supplied.snapshotRef) && hash(supplied.snapshotHash) && list(supplied.handoffs, maxTasks) && supplied.handoffs.length === rows.length && new Set(supplied.handoffs.map(handoff => handoff.taskId)).size === rows.length && plan.tasks.every(task => supplied.handoffs.some(handoff => {
    const producer = handoff.producer;
    return handoff.taskId === task.id && producer && runRef(producer.run) && Number.isInteger(producer.generation) && producer.generation >= 1 && Number.isInteger(producer.position) && producer.position >= 0 && Number.isInteger(producer.attempt) && producer.attempt >= 1 && text(handoff.captureRef) && hash(handoff.captureHash) && strings(handoff.acceptanceEvidenceRefs, 16) && handoff.acceptanceEvidenceRefs.length > 0 && list(handoff.allowedPaths) && handoff.allowedPaths.length === task.artifactContract.length && new Set(handoff.allowedPaths).size === handoff.allowedPaths.length && task.artifactContract.every(artifact => handoff.allowedPaths.includes(artifact.relativePath));
  }));
  if (!valid) {
    integration.reason = 'Fresh verification requires complete reviewed producer captures and a coordinator integrated snapshot; no verification dispatched';
    rows.forEach(row => { row.reason = integration.reason; });
  } else {
    integration = {status: 'recorded', receiptRef: supplied.receiptRef, snapshotRef: supplied.snapshotRef, snapshotHash: supplied.snapshotHash, handoffs: supplied.handoffs, reason: 'Coordinator references supplied; guest code cannot authenticate storage receipts or snapshot identity'};
    await phase('Verify');
    const results = await parallel(plan.tasks.map((task, index) => () => authorityRequired.has(task.id) ? null : agent(
      'Independently verify actual integrated artifacts and required acceptance checks against the coordinator-provided snapshot in this fresh run. Read-only; do not author replacements. First check that the actual launch checkout matches the reviewed handoff; report any inability to establish that identity. This read-only worker does not receive an automatic writer capture. Then check file existence and hashes separately from task acceptance. Do not accept cached checks, prose, passed booleans or worker claims as authoritative receipts. A check without inspectable evidence remains unverified. ' + workerRules + '\nVerification input: ' + context({task, integration: {receiptRef: supplied.receiptRef, snapshotRef: supplied.snapshotRef, snapshotHash: supplied.snapshotHash}, handoff: supplied.handoffs.find(handoff => handoff.taskId === task.id)}),
      {id: 'verify-' + index, label: task.id, phase: 'Verify', permissions: {sandbox: 'read-only', networkAccess: false, approvalPolicy: 'never'}, schema: schemaFor(taskSchema, task), maxAttempts: 1, timeoutMs: task.limits.timeoutMs}
    )));
    results.forEach((report, index) => {
      const task = plan.tasks[index];
      const row = rows[index];
      if (authorityRequired.has(task.id)) {
        verificationRows[index].status = 'coordinatorRequired';
        return;
      }
      row.workerId = 'verify-' + index;
      row.report = report ?? null; row.outcome = report?.outcome ?? null; row.artifacts = report?.artifacts ?? [];
      row.deliveryEvidence = reportEvidence(task, report);
      const claimedChecks = report?.checks ?? [];
      const supported = row.deliveryEvidence === 'claimed' && report.outcome === 'delivered' && report.blockers.length === 0 && report.artifacts.every(artifact => hash(artifact.sha256) && Number.isInteger(artifact.bytes) && artifact.bytes >= 0) && new Set(claimedChecks.map(check => check.checkId)).size === claimedChecks.length && task.acceptanceChecks.filter(check => check.required).every(check => claimedChecks.some(observed => observed.checkId === check.id && observed.status === 'passed' && observed.evidenceRefs.length > 0));
      verificationRows[index] = {taskId: task.id, workerId: row.workerId, workerRef: null, result: report ?? null, status: supported ? 'reported' : 'unverified'};
      row.reason = supported ? 'Fresh evidence reported; coordinator must resolve worker identity and authenticate capture/check receipts before acceptance' : 'Fresh required artifact/check evidence missing or incomplete';
    });
  }
}
await log('Fixed scope finished; claims and null coverage retained for coordinator acceptance. No integration, replanning or retry performed.');
return {
  planRevision: plan,
  expectedObjectiveIds: objectiveIds,
  rows: rows.map(({index, ...row}) => row),
  missingObjectiveIds: objectiveIds,
  integration,
  verification: {status: stage === 'verify' && integration.status === 'recorded' ? 'pendingAcceptance' : 'notRun', rows: verificationRows},
  complete: false,
  completionAuthority: 'coordinator',
  reason: 'The supported guest API cannot validate authoritative capture or acceptance receipts. Coordinator integration and acceptance of every retained objective are required; execution completion alone is insufficient.'
};
