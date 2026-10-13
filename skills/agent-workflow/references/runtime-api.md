# Workflow script contract

The first statement is `export const meta = {name: '...', description: '...'};` using bounded JSON literals. Both strings must be nonempty; name is at most 200 characters. Scripts are at most 1 MiB. Additional imports/exports are refused. The remaining async body supports top-level return in a separate QuickJS process.

Use only agent, parallel, pipeline, phase, log, JSON args and deterministic JavaScript. Omitted args are null. The evaluator has no Node, filesystem, shell, network or host tools; workers perform authorized external work. Clock/random calls are refused; supply timestamps/seeds in args. Results must be JSON. A 32 MiB heap, 512 KiB stack, CPU interrupts and wall deadline bound evaluation.

## Agent calls

`await agent(prompt, options = {})` returns text, or a validated object with schema.

| Option | Contract |
| --- | --- |
| label, phase | Display strings up to 500 characters; cosmetic for replay |
| id, dependsOn | Unique ID and IDs of earlier requested workers; wait for completed prerequisites |
| timeoutMs | Integer 1–120,000, default 120,000 |
| schema | Bounded JSON Schema subset with object root |
| model, effort | Codex catalog settings; account entitlement is still required |
| maxAttempts | Total structured-answer attempts, 1–5, default 5 |
| permissions | Narrow the run ceiling: sandbox read-only/workspace-write, networkAccess false, approvalPolicy never |

Legacy agentType, isolation, stallMs, budget and child workflow() APIs are unsupported. CLI --writable permits isolated Windows MXC writers; worker settings cannot raise a read-only run's ceiling. Model/effort/attempt settings resolve worker first, then run defaults, then effective Codex configuration as applicable.

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
