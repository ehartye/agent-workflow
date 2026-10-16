# Delivery inspection and durable command jobs

Use the public `node "<plugin-root>/bin/launch.mjs"` with a consistent explicit `--data-dir` when one was selected. Consult [command contracts](../../../docs/roadmap-command-contracts.md) for exact flags, providers, file limits and exit semantics. Saved-run operations resolve the recorded runtime. An older runtime missing an export is unsupported; do not install, substitute current providers or edit saved headers to make the operation appear available.

## Inspect without execution

`capture-preflight --cwd <project>` inventories capture readiness without creating a writer or starting inference. Read blocked categories and partial inventory honestly; it does not reserve inputs or prove later capture will succeed. See [capture preflight](../../../docs/capture-preflight.md).

`plan --script <absolute-file>` or `plan [scope:]name --cwd <project>` parses supported syntax without evaluating the workflow. Dynamic topology stays unresolved. A preview is not validation, execution or a graph of every possible task. See [plan preview](../../../docs/plan-preview.md).

`usage <run-id> --generation <N>` summarizes observed native usage, retaining missing evidence and replay lineage. It is not a hard shared token budget or a price estimate. See [usage](../../../docs/usage-summary.md).

## Run a command that outlives the waiting caller

Use durable jobs for authorized exact command vectors that need persistence and reconnection. They belong to an existing run and retain its runtime, original policy, originating session and data-instance identity. Workers cannot start recursive runs or mutate coordinator job/checkpoint state. Jobs do not grant access to missing executables, skills, external services or browser sessions.

1. Prepare an ordinary UTF-8 request file matching the [job schema](../../../docs/command-jobs.md), with a fresh request UUID, absolute executable as `command[0]`, literal argv, absolute cwd, inherited environment and an explicit command deadline. This command deadline is independent of the worker's wall budget and includes queue wait. Check prerequisites before dispatch; no implicit shell or installation.
2. Call `job-start <run-id> --session <origin> --request-file <absolute-file>`. Preserve the request and returned job ID before interpreting the result. A readable admitted/queued receipt and CLI exit0 establish admission only.
3. Reconnect with `job-status <run-id> --session <origin> --job-id <job-id>`. Read output through `job-output` with that ID, explicit stdout/stderr and byte paging. Retained bytes, dropped bytes and unknown transport coverage are different facts. Keep private command output out of public summaries unless authorized.
4. If cancellation is requested, use `job-cancel` with a fresh cancellation request UUID and the exact expected revision. Inspect the same recorded request after a lost response. Cancellation admission is not confirmation of command termination or owned process drain.

A missing response, nonzero CLI exit or disconnected reader does not prove the command never started. Preserve uncertain effects and reconcile the existing request/job before any further mutation. Do not repeat a job merely to obtain a nicer receipt. An observed command result, verified output and positive unforced owned cleanup are separate success requirements; the native containment receipt covers its declared ownership scope only.

## Record and accept delivery

Use [checkpoints](../../../docs/stage-checkpoints.md) to persist coordinator-reviewed objectives, exact producer/capture references, questions, recovery decisions and check requirements. `checkpoint-record` is a coordinator mutation with a request UUID and expected predecessor. Generated record IDs/hashes/times belong to the provider. Read or page existing records with `checkpoint`.

Freeze the complete reviewed source and prepared dependency identities before checks. Commands that create fixtures run in separately rooted validation copies with the same content and dependency identities, explicitly bound to the source checkpoint and declared temporary-prefix inventory. Verify source and validation identities before/after; preserve failed residue. Root-specific manifests differ even when content agrees. A new implementation, dependency, fixture exception or shared contract requires a reviewed revision and invalidates affected evidence.

`check-record` imports only an authentic internally recorded terminal job into its exact checkpoint/check requirement. Caller-supplied JSON cannot assert a positive outcome, executable hash, snapshot or cleanup fact. See [delivery acceptance](../../../docs/delivery-acceptance.md) for assembly with `acceptance <run-id> --session <origin> --request-file <absolute-file>`.

Accept only objectives proven by actual producers, strict reviewed artifact integrity, required independent reviews and fresh integrated checks. Engine completion, hash-valid source, skill activation, a screenshot, a green test or a report's `complete` declaration each has narrower scope. Preserve failed/partial/unknown/never-started slots and missing item IDs. Acceptance assembly exits1 for incomplete or rejected evidence; neither synthesis nor changing old history fills the gap.
