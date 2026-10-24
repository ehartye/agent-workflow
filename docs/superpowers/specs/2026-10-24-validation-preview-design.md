# Exact schema budgets in inert workflow plans

## Problem and scope

The current CLI already supports `validate --summary`: exact source identity and declaration counts without printing workflow prompts. Inert `plan` inspection does not reveal the schema compiler's actual serialized-result byte allowance. Authors can therefore plan responses that dispatch rejects with `RESULT_LIMIT`. Help also groups `setup` with doctor's `--cwd`, although setup correctly rejects it.

Deliver an additive plan field and accurate setup help. Retain full validation and summary behavior, managed runtime selection, schema limits, and evaluator isolation. No workflow execution, native worker launch, persisted-data migration, new permission or source evaluation is needed for planning.

## Decision

Each recognized agent call site gains `resultBudget`, containing `status`, `maxSerializedBytes`, and `code`. Other call sites have no added field. Status is `known` for an explicitly supplied JSON-literal schema compiled successfully by `compileSchema`; its byte count is exactly `compiled.limits.maxSerializedBytes`. Status is `unstructured` when a statically known options object omits schema, with null byte count/code. Status is `unknown` for dynamic options/schema expressions or exhausted inspection bounds, with null count and a diagnostic code. Status is `invalid` for a literal schema rejected by the current compiler, with null count and the original bounded `SCHEMA_*` code. An invalid call can lie in an unexecuted branch; the plan remains a description, not dispatch admission.

Read only literals, arrays, ordinary unique noncomputed object properties and signed finite numeric literals from the AST. Never resolve identifiers, evaluate expressions, invoke accessors or call workflow functions. Preserve existing shadowing, multiplicity, offsets, unknowns and truncation. Use a per-preview cache and a maximum of 64 unique schema inspections; static extraction is independently bounded by depth and node count. Oversized/deep/dynamic structures retain unknown status instead of a guessed limit. The existing 512 KiB output bound still applies.

The number limits UTF-8 serialized JSON under schema validation. It does not promise that a response is valid or fits lower task/native limits, and is not a maximum-width inference from JSON Schema.

## Alternatives and implications

1. **Use the existing compiler during inert inspection (selected).** Time: one bounded local preflight, no later manual arithmetic. Risk: static extraction could misattribute dynamic data; reject it as unknown and exercise hostile expressions. Complexity: a small AST data reader and bounded cache. Best practice: reuse the dispatch invariant. Maintainability: compiler changes automatically change preview limits.
2. **Document manual budget calculations.** Time: smaller initial edit, repeated author work later. Risk: arithmetic can drift from dispatch. Complexity: no runtime addition, duplicated knowledge. Best practice: weaker than machine-checked preflight. Maintainability: every compiler change needs synchronized instructions.

## Acceptance

- Literal schema limits equal dispatch's compiler and validate at the exact byte boundary, including multibyte data and complexity-reduced budgets.
- Dynamic identifiers, calls, spreads, computed/accessor/duplicate keys and shadowed agents never receive a falsely known limit; hostile code never runs.
- Invalid literal schemas retain the compiler's error category. Schema inspection and existing output bounds remain explicit and finite.
- Real public `plan --script` output exposes the field, without evaluating the body; saved/current/retained routing stays covered by its existing owner.
- Existing concise/full validation remains covered. Help lists `setup` and `doctor [--cwd path]` separately and parser behavior agrees.
- Full merge/release checks, clean-package installation, production audit, source PR/tag/release and wiki publication provide final evidence.
