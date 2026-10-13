# Runtime API

Scripts execute in a separate bounded QuickJS process. They are JS bodies in an async context, with a top-level return. They cannot import modules or use Node, filesystem, shell, host timers, network, process, or native host tools. Workers perform authorized external work through Codex. CPU/memory/schema/isolation failures fail closed.

The first statement is `export const meta = { name: '...', description: '...' };`. `meta` is a pure literal AST object: no functions, computed expressions, spreads, getters, calls, or references. Optional `whenToUse` is text. Optional `phases` is an array of literal `{title, detail?, model?}` entries; phase titles must match your calls. `args` is supplied JSON directly (undefined when omitted). Pass clock values or a deterministic seed in args: `Date.now`, `Math.random`, and argumentless `new Date` are unavailable.

```js
export const meta = {
  name: 'Inspect modules', description: 'Read each module, then verify its findings',
  phases: [{title:'Inspect'}, {title:'Verify'}]
};
const items = args.items;
const rows = await pipeline(items,
  (item, original, index) => agent('Inspect only this module: ' + JSON.stringify(original), {
    label: original.id, phase: 'Inspect', schema: {
      type:'object', properties:{findings:{type:'array',items:{type:'string'}}},
      required:['findings'], additionalProperties:false
    }
  }),
  (audit, original, index) => agent('Independently verify this module and the audit. Module: ' +
    JSON.stringify(original) + '\nAudit: ' + JSON.stringify(audit), {
    label: original.id, phase:'Verify', schema: {
      type:'object', properties:{verdict:{type:'string',enum:['confirmed','refuted','unverified']}},
      required:['verdict'], additionalProperties:false
    }
  })
);
return {expected:items.length, rows:items.map((item,index)=>({id:item.id,
  verification:rows[index]??null, status:rows[index]?'completed':'unverified'}))};
```

## `agent(prompt, options = {})`

Returns final text, or an independently schema-validated JSON object when `schema` is supplied. Supported options:

| Option | Meaning |
| --- | --- |
| `label` | Display label; does not change replay identity |
| `phase` | Explicit phase group; prefer this inside concurrent callbacks |
| `schema` | Shared bounded JSON Schema subset, object root/properties/required; regex/dynamic/reference/async features and `uniqueItems` are unavailable; supported contradictions reject before dispatch |
| `model` | Explicit Codex model identifier, capability validated by worker |
| `effort` | Supported Codex reasoning effort; Claude effort names are not automatic mappings |
| `agentType` | Configured worker profile; unknown profiles reject before dispatch |
| `isolation` | Requested worktree isolation; failure never falls back to a shared writer directory |
| `timeoutMs` | Worker timeout |
| `stallMs` | Progress-aware stall threshold |

The runtime assigns stable worker identity and tracks full prompts, options, attempts, usage, results, errors, backend thread/turn identifiers and artifacts. Worker permission defaults are read-only, no network, approvals never. Start permissions are an explicit authorized ceiling and can be further narrowed by backend configuration.

## `parallel(thunks)`

Accepts an array of zero-argument task thunks. Starts work under the shared concurrency guard and returns results in input order. Per-thunk failure becomes null. A barrier completes after all thunks have settled. An intentional duplicate prompt occupies a separate replay position.

```js
const outputs = await parallel(args.targets.map(target => () =>
  agent('Read: '+JSON.stringify(target), {label:target.id,phase:'Read'})));
return args.targets.map((target,index)=>({id:target.id,result:outputs[index],
  status:outputs[index]===null?'unverified':'completed'}));
```

## `pipeline(items, ...stages)`

Each stage receives `(previousResult, originalItem, index)`. At the first stage `previousResult` is the original item. An item advances without waiting for every other item to finish the prior stage. Results preserve item order. A thrown stage leaves null for that item and skips later stages; do not interpret null as a confirmed negative. Keep original IDs in a final mapping.

## `phase(title)`, `log(message)`

`phase` changes the current display group for subsequent calls; explicit `options.phase` avoids a concurrent shared-state race. `log` records narrator progress. Await them so the durable broker message is acknowledged before relying on ordering.

## `workflow(nameOrRef, childArgs)`

Invokes a saved child workflow inline and returns its result. Name lookup is closest project `.agents/workflows` within the nearest git root, then personal `~/.agents/workflows`, then plugin `workflows`. A non-git project uses cwd only. Prefix `project:`, `personal:` or `plugin:` to select the namespace. Only one nesting level is allowed: a child cannot invoke another child. Children share the run scheduler, concurrency, lifetime attempts, cancellation, observed budget and ordered replay prefix.

## `budget`

`budget.total` is the configured observed output-token scheduling guard, or null when absent. `budget.spent()` returns cumulative observed output usage; `budget.remaining()` is total minus spent, or Infinity without a target. Exhaustion prevents new dispatch and may cancel active work. Already-running workers can overshoot. This is not a shared native parent-turn token pool or total input/output dollar-cost cap.

## Flow, replay and results

Ordinary JS branches, loops, arrays, objects, strings, JSON, math and async functions are available. Bound rounds, fan-out, and discovery loops explicitly. Use unchanged stable prompts/options for reusable calls. Call identity chains the previous call key plus prompt and stable options; label/phase/stall timeout display changes do not create a new semantic result. Changed calls, failed calls and missing result artifacts invalidate the suffix, including later successful siblings. Changing only deterministic post-processing can reuse every completed worker.

Source/workspace freshness is not inferred from a matching prompt. Start a new run when underlying evidence changed. Stop/pause drains processes; it does not undo mutations. Errors, unknown outcomes and usage survive control/recovery. Never retry an uncertain mutating effect by switching transport or starting another worker.

After controller death every abandoned dispatched worker remains unknown, including read-only and drained workers: drain cannot prove prior external effects. Reconciliation requires explicit effects review plus verified drain. `run.json` is authoritative; missing/stale derived events rebuild from it, while ahead/conflicting event files block recovery and stay preserved for manual review.

Resume first checks recorded `runtimeIdentity` against exact runtime source hashes and installed QuickJS/core, Acorn and Ajv versions. Missing/mismatched identity rejects with `RUNTIME_MISMATCH` before edit, reconciliation, cache/generation mutation or dispatch. Use a matching immutable runtime or a new run. Backend/profile execution fingerprint changes independently invalidate the reusable prefix; they do not make external workspace evidence fresh.

Return JSON. For partial work include expected, attempted, completed, failed, unverified and skipped coverage where your task defines them. Use null for missing results, and distinguish confirmed/refuted/unverified verdicts. Keep individual findings and evidence attached to IDs rather than flattening them into a reassuring synthesis.
