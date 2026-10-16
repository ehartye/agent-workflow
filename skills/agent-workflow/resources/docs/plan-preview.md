# Inert workflow plan preview

`previewPlan({script})` from `engine/plan-preview.mjs` returns synchronous JSON.
It calls the existing `parseScript` validator and traverses an Acorn syntax tree.
It never imports the workflow, invokes callbacks, starts inference or a writer,
or evaluates workflow code in Node or QuickJS. Existing `SCRIPT_SIZE`,
`SCRIPT_SYNTAX`, `SCRIPT_META` and `SCRIPT_MODULE` refusals remain intact.
The API accepts only the `script` data property; invalid API inputs use
`PLAN_INPUT`. Proxies, including revoked proxies, are rejected before prototype,
key or descriptor inspection can invoke caller traps.

The version 1 response has `schemaVersion`, the exact UTF-8 `sourceSha256`,
validated `meta`, `callSites`, `groups`, `dependencyEdges`, `unknowns` and
`truncated`. Offsets are Acorn UTF-16 source offsets, including the metadata
declaration. Each call site has `offsetStart`, `offsetEnd`, `api`, `literalId`,
`literalPhase` and `multiplicity:{min,max}`. A null maximum means repetition is
unknown. These are lexical possibilities assuming the surrounding code reaches
the site, not a guarantee of successful execution or a total agent forecast.

Only direct, unshadowed `agent`, `parallel`, `pipeline`, `phase` and `log` calls
are attributed to the broker. Bindings are collected before attribution, so
parameters, destructuring, catch bindings, lexical declarations and hoisted
`var`/function bindings shadow names even before their declaration. Aliases,
member calls and other callees produce `unsupportedCall`; shadowed broker names
produce `shadowedCall`. Optional calls have minimum zero and `optionalCall`.
Branches have minimum zero. Functions, callbacks and loops have minimum zero,
unknown maximum and `dynamicMultiplicity`; no callback is invoked to determine
its size. No general JavaScript constant folding is attempted.
Instance-field values also have minimum zero and unknown maximum. Computed
field keys and static-field values retain their surrounding class-evaluation
multiplicity. Function-body `var` bindings do not shadow parameter defaults;
switch-case lexical bindings do not shadow the switch discriminant.

Agent option literals provide IDs, phases and dependencies. Computed properties,
spreads, accessors and duplicate keys make options unknown (`dynamicOptions`).
Dynamic IDs/phases/dependencies remain explicit unknowns. IDs and phase strings
are bounded to 200 UTF-16 units. Dependencies are `{from,to}` literal IDs, only
when both are unique, the source call ends before the dependent call starts,
and neither site can repeat an
unknown number of times. Duplicate IDs invalidate all edges involving that ID;
forward or unresolved references have `unresolvedDependency`. This is source
inspection, not a change to runtime admission or dependency semantics.
Containing calls start earlier in source but their arguments run before their
admission. Overlapping/nested call ranges therefore remain unresolved in both
directions; the preview does not infer their evaluation order.

A group is `{literalPhase,callSites:[offsetStart,...]}`. A preceding direct
literal `phase` statement supplies lexical grouping in its statement list;
literal agent options can override it. Branches and helpers can change phases
at runtime, so group membership is only possible lexical membership. Groups
never create dependency edges or imply causality.

Limits are 1 MiB source, 200,000 AST nodes, depth 256, 4,096 call sites, 4,096
edges, 1,000 groups, 256 unknown entries and 512 KiB serialized output. Any cap
sets `truncated:true` and a fixed unknown category. An incomplete scope scan
returns no attributed graph, because unseen bindings could shadow names.
Truncation drops dependency edges rather than relying on an incomplete ID scan.
Output pressure drops groups and a suffix of call sites; metadata that cannot
fit with bounded coverage becomes null. Overflow is explicit through
`outputLimit` or already-saturated `unknownLimit` coverage. Unknown entries have fixed
`code`, `offsetStart`, `offsetEnd`, never extracted executable bodies.
An existing validator `RangeError` returns `validationLimit`, null metadata and
an empty graph. It cannot establish complete source validation. Ordinary
`SCRIPT_*` errors are still thrown unchanged.

The preview does not establish native tool readiness, permissions, effect
safety, reachable execution, successful dispatch or a spending quota.

## Retained producer validation evidence

This section and the following approval/friction section preserve the original
producer's reported evidence. They are not fresh qualification of this recovery.

The owned test first failed on the missing module, then on the literal-agent
assertion (`[]` versus `['a','b']`) with the initial inert response. The minimal
literal implementation made that assertion green. Subsequent RED cases exposed
lexical shadowing, dynamic multiplicity, duplicate IDs, phase grouping, limits
and strict input handling before refinement. The hostile fixture includes a
file write and a throw; its marker stays absent. A controlled copy of this
module injects a host-side marker write, and the same absence assertion rejects
it without evaluating a workflow in the host process.

Affected command: `C:/Program Files/nodejs/node.exe --test
test/engine-plan-preview.test.mjs test/engine-usage-summary.test.mjs` from the
assigned worktree, using non-login PowerShell. Tests own unique root-local
`.controller-test-inspection-*` fixtures and remove them on teardown. Public
`plan --script`, saved-definition routing and full combined checks belong to
coordinator integration with the actual interfaces provider.

Final owned verification: **28/28 tests passed**, zero failures/skips/cancellations,
using Node v24.18.0. The final affected run took about 0.72 seconds. Response
trimming first failed in a dedicated pure parser child with `ETIMEDOUT` at its
explicit 3-second test bound, then completed in about 0.08 seconds after the fix.

## Approval identity and workflow friction

Receipt `attempt-02/spec-approved.json` SHA-256
`6d9b71fa14f9626f43c70ac115b7bff2a6cf544534017dde0dc0cf85511bc85b`
and all twelve named references matched hashes and declared sizes. The complete
R2 design, plan and specification JSON were read; their hashes are respectively
`f4a3abfb0ded0a032ce1feee37373b654f8eb9c3d0c33a7ea26b8be647eb744c`,
`90419e80840eaba4d9d080cc6bf980f472634159e50498d6871b0092df2264f2`,
`7eaace9e84673b17c3730a048ecfe18e7cceef7309021ca6572f4fad111cc396`.
Input integrity does not establish implementation/integration acceptance.

Native IDs `tdd` and `test-strategy` were genuinely listed and read using the
returned package/main-resource identities. Returned roots matched the requested
original `hartye-plugins/h-superpowers/4.16.0/skills/test-driven-development` and
`hartye-plugins/agent-tests/0.4.1/skills/test-strategy` roots. The hash-checked
out-of-package `references/craft.md` supplied function/feature testing guidance.
No shell-loaded skill body, duplicate-name substitution, delegation or nested
Workflow runtime was used. The controller fixture uses the local test evaluator
with a controlled backend and zero native model requests.

| Reproduction and observed effect | Proposed owner and acceptance |
| --- | --- |
| Native catalog required ten unfiltered pages to reach selected standalone IDs. | Native skills catalog host: exact ID/root filtering with honest pagination and duplicate-name identities. |
| A long-line 240-line specification read exceeded command/orchestration output budgets; complete contents were subsequently read in bounded character/line windows. | Worker command guidance: size reads by characters and both output budgets; verify complete ranges. |
| `rg` received the literal Windows operand `bin/runtime*.mjs` and reported OS error 123; explicit file reads supplied the contract. | Worker command guidance: use `rg -g` for globs or explicit PowerShell paths. No mutating effect occurred. |
| `parseScript(meta + 'const wide=[' + '0,'.repeat(150000) + '];')` throws `RangeError` at spread-based traversal in `engine/script.mjs:39`. | Workflow script-validator owner: bounded iterative traversal and its own regression. This unowned file stays intact; preview returns `validationLimit`. |
| One documentation patch failed verification on an incorrect context line. Read-only inspection showed all proposed edited regions still in their original state before corrected authoring. | This worker's patch guidance: verify exact anchors before editing; never describe a failed operation as notStarted without tool evidence. |

Canonical wiki discover/ingest and architecture/roadmap updates remain the root
coordinator's guarded external follow-through. No vault or remote writes were
made in this six-file assignment.

## Native recovery correction evidence

The recovery writer started at canonical 0.4.5 commit
`a76aa77ea7790927247388e907015e92e9397f6f` in
`workflow-ff5314a0-07bd-4af7-80c3-62b5bf1d80f6`. The six assigned seed entries
are all new files with explicit absent base/current identities. The exact
candidate/original blobs, selected source-map entries and both producer
manifest/patch hashes matched before exclusive materialization. No manual
three-way path, omitted payload, other track or upstream guard was changed.
Copying establishes byte lineage, not semantic acceptance.

The actual blocking review was `attempt-03/observer-worker-13-summary.json`,
SHA256 `2598e4d73879a1448285884c146407cb910bf7d563665b382ae9eed9605458df`
(6193 bytes). Its nested-call example was reproduced in the existing test owner:
`outer` starts earlier in source but is not admitted when `inner` evaluates its
dependency. RED emitted the forbidden `outer -> inner` edge. The regression also
retains the valid independent `prior -> inner` edge, so deleting all edges cannot
satisfy it. A reversed nested dependency remains explicitly unresolved.

The second RED in the existing usage validation owner observed a caller
conversion callback invoked once. The fix checks primitive-string type before
the UUID pattern. GREEN exercises throwing `toString` and `Symbol.toPrimitive`
callbacks, each remaining uncalled with bounded `USAGE_INPUT` refusal.

Actual commands started in this writer, with non-login PowerShell and literal
arguments (these results are distinct from historical source failures):

| Operation | Observed result |
| --- | --- |
| Exact hash/893-byte `attempt-04/preflight.mjs`, verified Node argv | exit 0; Node v24.18.0, Git/npm identities passed |
| Verified six-file exclusive materialization | exit 0; all six complete files created only in this writer |
| Node npm-cli `ci --ignore-scripts --offline` | exit 0; 35 local dependency packages added; package/lock unchanged |
| Node `--test --test-name-pattern 'nested calls\|generation and ownership validation' test/engine-plan-preview.test.mjs test/engine-usage-summary.test.mjs` | exit 1; two intentional assertion failures, 0 pass/2 fail |
| Node `--test test/engine-plan-preview.test.mjs test/engine-usage-summary.test.mjs` | exit 0; 30 pass, 0 fail/cancel/skip/todo; 1490.8678 ms |
| Node `--check` for both modules and both tests, four separate argv | exit 0 each |

Final read-only scope inspection reported exactly the six assigned new files,
no tracked package/lock delta and no remaining `.controller-test-inspection-*`
fixtures. Read-only Git tree checks also confirmed all six paths absent from
each original producer base/captured input tree and current canonical tree;
their original finalized manifest entries match the selected candidate bytes
and mode `100644`.

All command invocations issued here launched; the RED command executed and
owned its disposable fixture effects. No current command is classified
`notStarted`, and no uncertain mutating command was retried. Current input hashes
and selected native reads matched. Both skills were genuinely activated using
returned standalone `tdd`/`test-strategy` identities and the exact admitted
retained roots under run `bc53e3e5-d39f-4b1d-a8fa-fd36584ce0bb`. Original skill
roots remain provenance; no shell-loaded skill body or parent activation was used.

Historical source/effect inventory, preserved separately from those command starts:

| Retained evidence | Preserved limitation |
| --- | --- |
| Original run `4814c759-2fc4-40ba-beca-025fdde866f8`, positions 11/12 | Source guard failures remain failed; partial acceptance bytes are not accepted. This assignment selects preview position 13 instead. |
| Recovery plan's old reader positions 10/11/12 in run `b978ff0f-91bb-4cf7-8c4c-72a0b8e48e13` | Inventory failed before model inference, while readiness/source commands did execute. Positive owned drain and unknown native inventory do not prove no commands/effects. |
| Selected preview position 13 and corrected usage position 8 | Engine-completed producers and their original declarations/missing checks remain unchanged. Their captures supply source, not current acceptance. |

The approved specification/addenda, recovery plan and seed files were read and
their full supplied byte/hash identities checked. Native catalog discovery took
ten unfiltered pages; exact ID/root filtering with preserved duplicate identities
and cursor semantics remains a catalog-host enhancement. Some combined read
outputs truncated; bounded follow-up reads supplied the relevant contracts and
owned source. This is output friction, not a process-start failure.

Fresh public `plan --script`, saved-definition preview and retained-runtime
`usage` routing require the interfaces integration. Full combined test/check/smoke,
clean install, native/browser qualification, authoritative capture and independent
coordinator acceptance remain missing here. F0/V0 verification and later final
F/V authentic checks are distinct root-owned stages. No real original data
instance was mutated or recollected; fixtures used only this writer's local
temporary directories. Canonical wiki work remains coordinator-owned.
