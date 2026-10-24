# Validation Preview Implementation Plan

> Use h-superpowers:executing-plans inline. The user authorized specification, development, shipment and release.

**Goal:** Show exact schema-validation byte budgets before dispatch and align setup help with parsing.

**Architecture:** Extend the inert AST plan provider with a bounded literal-schema reader using the existing compiler. Keep CLI selection and dispatch unchanged.

**Tech Stack:** Node 24, ESM, Acorn, existing Ajv-backed schema compiler, node:test.

### Task 1: Characterize plan budgets

- [x] Extend `test/engine-plan-preview.test.mjs` with literal compiler agreement, exact UTF-8 boundary behavior, invalid/dynamic/hostile AST cases and finite inspection/output bounds. Extend existing `test/managed-entry.test.mjs` public-plan fixture to require the budget field and setup help/parser agreement.
- [x] Run `node --test test/engine-plan-preview.test.mjs test/engine-schema.test.mjs test/managed-entry.test.mjs`; retain the intended red assertions.

### Task 2: Implement inert inspection

- [x] Create `engine/plan-result-budget.mjs` with a per-preview inspector. Return `{status:'known',maxSerializedBytes:compileSchema(schema).limits.maxSerializedBytes,code:null}` for safe literal data. Return explicit null counts for unstructured, dynamic, invalid and bounded inspection failures.
- [x] Import the inspector in `engine/plan-preview.mjs`, create one per invocation and add `site.resultBudget=inspect(options)` only for recognized agent calls. Keep existing global output truncation.
- [x] Split the help lines in `bin/arguments.mjs` into `setup` and `doctor [--cwd path]`.
- [x] Run the affected tests, inspect the diff for unintended execution or dynamic inference, and commit the implementation with its regression tests.

### Task 3: Verify and release

- [x] Update repository API/verification documentation with the exact field meanings and limits. Regenerate skill reference resources using `node scripts/package-skill-resources.mjs` after checking its supported flags.
- [x] Update version manifests and lockfile consistently for the next patch release. Run `npm test`, `npm run check`, `npm run smoke`, clean-package `node scripts/check-install.mjs`, and `npm audit --omit=dev`; retain gate results without embedding local paths in public artifacts.
- Publication gate (recorded in the release receipt): Review against the specification, rebase onto current main, push a feature branch, open and squash-merge a PR through the repository's authorized release gates. Verify source/tag/release and any required marketplace update without silently altering protections or Actions policy.
- Wiki publication gate (recorded in the wiki operation): Publish wiki source discovery/ingestion, design, as-built architecture, roadmap and backlog dispositions with exact operation ledgers and verified upstream synchronization.
