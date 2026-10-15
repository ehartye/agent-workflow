# Workflow script contract

The first statement is `export const meta = {name: '...', description: '...'};` using bounded JSON literals. Both strings must be nonempty; name is at most 200 characters. Scripts are at most 1 MiB. Additional imports/exports are refused. The remaining async body supports top-level return in a separate QuickJS process.

Use only agent, parallel, pipeline, phase, log, JSON args and deterministic JavaScript. Omitted args are null. The evaluator has no Node, filesystem, shell, network or host tools; workers perform authorized external work. Clock/random calls are refused; supply timestamps/seeds in args. Results must be JSON. A 32 MiB heap, 512 KiB stack and 1-second CPU slices bound guest execution. With no outstanding broker calls, 5 seconds without progress terminates a deadlocked evaluator. Queued and active worker calls suspend that idle timer.

Version 0.3.6 supports mutually exclusive new-run `--args JSON` or `--args-file path`. Installed 0.3.5 supports `--args` (including small manifest path/hash/range references); `--args-file` requires an explicit update to 0.3.6 or later. The latter reads a regular UTF-8 JSON file once (at most 2 MiB raw bytes), resolving the path from the invoking process directory. The parsed value is saved as args; replay/resume never rereads that file. Malformed, invalid UTF-8, nonregular and oversized input reject before run binding/backend creation. Both forms use the same precise 2 MiB combined serialized evaluator start envelope, including script body, args and overhead. The 1 MiB script limit remains. No truncation, streaming or limit increase is implied, and saved runtime/API identities are retained.

Each broker message/response, including the final result message, is at most 1 MiB serialized UTF-8 bytes. Worker prompts are at most 65536 UTF-16 code units. `parallel`/`pipeline` collections allow 4096 entries, but runs allow at most 1000 worker requests and lifetime starts/attempts, plus 10000 total broker calls (at most 4096 pending). Plan strictly below the worker cap across all stages/rounds and attempt budgets. Concurrency is separate from records per batch. Keep bulk data in frozen hash-verified project manifests/chunks; args carry paths, hashes and assigned ranges. Workers verify bytes/counts and read only assigned records; the evaluator cannot read files. See [large inputs and bounded batches](../../workflow-authoring/references/large-inputs-and-batches.md) for the required choice, budgets and freshness contract. Cached replay does not establish external file freshness.

Runs have no overall wall deadline by default: they finish with the script or explicit Stop. The dashboard is a separate persistent process and remains inspectable after completion; this is not a guarantee of detecting the end of the host conversation. `run` and `resume` accept `--run-timeout-ms` (1–86,400,000 for an explicit wall limit; 0 removes it) and `--worker-timeout-ms` (1–1,800,000, default 600,000). The run wall limit includes queueing and worker waits. Limits are persisted; resume inherits them unless overridden and starts a fresh execution window. Restart-worker retains the saved limits. Old runs retain their original runtime and timeout behavior.

## Agent calls

`await agent(prompt, options = {})` returns text, or a validated object with schema.

| Option | Contract |
| --- | --- |
| label, phase | Display strings up to 500 characters; cosmetic for replay |
| id, dependsOn | Unique ID and IDs of earlier requested workers; wait for completed prerequisites |
| timeoutMs | Integer 1–1,800,000; overrides the run's worker default (600,000 ms / 10 minutes) |
| schema | Bounded JSON Schema subset with object root |
| model, effort | Codex catalog settings; account entitlement is still required |
| maxAttempts | Total structured-answer attempts, 1–5, default 5 |
| permissions | Narrow the run ceiling: sandbox read-only/workspace-write, networkAccess false, approvalPolicy never |
| skills | Up to 32 distinct IDs from the immutable new-run worker capability manifest |
| requireTools | Up to 16 distinct declared tool IDs associated with selected skills; require successful worker-local source and readiness checks before inference |

Legacy agentType, isolation, stallMs, budget and child workflow() APIs are unsupported. CLI --writable permits isolated Windows MXC writers; worker settings cannot raise a read-only run's ceiling. Model/effort/attempt settings resolve worker first, then run defaults, then effective Codex configuration as applicable.

Capability starts use `run ... --worker-capabilities bundle.json`. The [public manifest/API](../../../docs/api.md#worker-capability-bundle) defines the exact bounded version 1 JSON shape, original source/reference layout, Node/launcher/runtime/dependency/receipt identities, named managed homes/cache, reviewed nonmutating readiness stages and invocation guidance. Resume/restart retain that bundle and reject overrides or drift. Scripts cannot supply paths, environment variables, executable commands or native host grants through selections.

Selected skill directories bind native executor roots with the native `local` environment identity. Only those workers receive the narrow process-local direct-tool exposure for `skills`. Worker Codex invokes the genuine `skills.list({authority:{kind:'executor'}})` tool, then `skills.read` with returned package/main_resource/resource/cursor identifiers, and obtains associated tool instructions from that native read. Workflow does not manually parse/inject skill bodies, register extraRoots or inject UserInput skills. Selecting skills grants no network, write, interactive or delegation authority and does not enable broad plugins/MCP/apps. Baseline user/system skill visibility does not establish an exclusive catalog.

`skills` alone supports independent authoring with optional tool source/readiness explicitly missing. `requireTools` runs restricted source checks and exact declared readiness commands once before inference. Passed required tools provide exact verified Node/launcher/environment and readiness metadata to the initial task. A nonzero executed check remains executed, with `noInference` rather than a false no-process claim. Readiness and task/correction turns share one deadline beginning immediately before readiness; each command/RPC is capped by remaining time, without another dispatch after expiry. Existing startup and separate cleanup bounds remain.

Schema correction requests only an answer from existing evidence and adds no readiness or activation instructions. Native list/read pairs are metadata, not catalog/root-match certification or artifact acceptance. Inspect missing stages and cleanup; retain outputs in the assigned writer root for capture and coordinator review. Public native skill invocation and nonrendering Beeps authoring have [scoped acceptance](../../../docs/verification.md); WAV/listening and sprite export remain unverified. No automatic install, uncertain retry or policy change is authorized. A narrow correction to a known read-only compatibility failure requires understood effects and preserves the original failure.

Dependency IDs use letters, digits, underscore or hyphen, at most 100 characters. Up to 256 prerequisites may reference earlier requested IDs. A failed prerequisite prevents dispatch. The graph draws declared edges; ordinary JavaScript data dependencies are not inferred.

Schemas support properties/items, required, additionalProperties, JSON types including nullable unions, enum/const, bounded numeric/string/collection constraints and anyOf/oneOf/allOf. References, regex, formats, coercion, defaults and unsupported keywords fail admission. Limits: 32 KiB, 512 nodes, depth 16. Invalid answers may be corrected in the same thread within the original deadline and attempt limit; transport loss, cancellation and unknown outcomes are never schema-retried.

## Collections and coverage

parallel(thunks) runs zero-argument functions under shared concurrency and returns input-order results; thrown tasks become null. pipeline(items, ...stages) passes (previousResult, originalItem, index), initially the original item. Items advance independently. A thrown stage or null result stops that item's later stages and leaves null. Both accept at most 4,096 entries.

Preserve IDs and label null slots unverified:

```javascript
export const meta = {name: 'Inspect files', description: 'Inspect each requested file'};
await phase('Inspect');
const rows = await parallel(args.items.map(item => () =>
  agent('Read this file and report findings: ' + JSON.stringify(item.path), {
    label: item.id, phase: 'Inspect',
    schema: {
      type: 'object',
      properties: {findings: {type: 'array', items: {type: 'string'}}},
      required: ['findings'], additionalProperties: false
    }
  })));
return {
  expected: args.items.length,
  rows: args.items.map((item, index) => ({
    id: item.id, result: rows[index],
    status: rows[index] === null ? 'unverified' : 'completed'
  }))
};
```

Await phase(title) and log(message) for broker ordering. Use explicit per-agent phases in concurrent callbacks to avoid a shared phase race. Default concurrency is 2; CLI accepts 1–256. Lifetime attempts are capped at 1,000.

## Definitions and replay

Discovery searches .agents/workflows from cwd toward its nearest Git root, then home .agents/workflows, then bundled workflows. A non-Git project searches only cwd. project:, personal: and plugin: qualify names; nearest definitions shadow farther ones. Case/extension collisions and linked paths fail. Project saves target supplied cwd, personal saves target home, and bundled definitions are read-only.

save --command generates a scoped .agents/skills/workflow-name/SKILL.md that delegates to the installed main skill. Unrelated skills cannot be overwritten. Generated names require portable hyphenated names within the 64-character skill limit.

Runs capture script, args and launch settings; later registry edits do not change them. Replay follows invocation order; the first changed or failed call invalidates its suffix. Timeout, dependencies, schema, settings and backend identity participate; labels/phases are cosmetic. Cached results do not prove file freshness or exactly-once effects. Start a new run for fresh inspection unless replay is requested. Missing/corrupt records, unknown work, failed cleanup and incompatible session/runtime cannot be treated as successful replay.
