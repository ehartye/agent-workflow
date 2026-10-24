# Package Runtime Selection Implementation Plan

> Execute inline with h-superpowers:executing-plans and test-driven-development. Standing authorization covers shipment with Actions disabled.

**Goal:** Let concurrent caller packages use their exact verified prepared runtimes without changing the shared selection.

**Architecture:** Derive one existing runtime ID from caller version/source/Node; reuse receipt and integrity validation. Extend bounded doctor diagnostics and existing process-boundary test owners. No new persisted schema.

**Tech Stack:** Node 24 ESM, filesystem receipts, node:test, existing managed launcher/installer.

### Task 1: Reproduce selection and refusal behavior

- [ ] Extend `test/managed-runtime.test.mjs`: two versions/same-version fingerprints, unchanged pointer and saved bindings, exact Node selection, missing/corrupt matching receipts and source/native/dependency tampering. Observe failing assertions before implementation.
- [ ] Extend the existing real public-launcher test in `test/managed-entry.test.mjs` with concurrent old/new caller processes and an actual bound run, while preserving all session/control assertions. Add doctor diagnostic filtering coverage to its existing owner.
- [ ] Update the existing clean-install invariant in `scripts/check-install.mjs`: changed caller refuses before setup, upgraded selection succeeds, and the original retained launcher validates its own package without changing the pointer.

### Task 2: Implement and verify

- [ ] In `bin/managed-runtime.mjs`, allow format/path-only validation of the recorded default's Node identity, derive the exact caller identity, select only its expected receipt when current differs, then call `verifyRuntime` and compare full identities. Use distinct bounded missing/invalid errors and no writes or fallback.
- [ ] In `bin/doctor-diagnostics.mjs`, allow the two known runtime error categories and sanitize selection identities through descriptor-only reads with strict limits.
- [ ] Run `node --test test/managed-runtime.test.mjs test/managed-entry.test.mjs`; investigate failures from evidence and preserve meaningful negative coverage. Commit the implementation and tests.

### Task 3: Qualification and publication

- [ ] Update API/setup/verification documentation and regenerate native-readable resource closures with `node scripts/package-skill-resources.mjs`.
- [ ] Synchronize patch version manifests/lockfile. Run `npm test`, `npm run check`, `npm run smoke`, clean-archive `node scripts/check-install.mjs`, and `npm audit --omit=dev`. Record exact tested source and receipts without private machine/project details in public artifacts.
- [ ] Obtain independent review, resolve important findings, rebase onto latest, push and squash-merge the source PR. Verify the canonical tree and downloaded tag/archive against qualification, publish the release, and pin the immutable marketplace source. Preserve disabled Actions and actual protection settings.
- [ ] Publish wiki evidence discovery/ingestion, design, architecture, roadmap and final backlog disposition through exact-scope wiki operations. Complete a requirement-by-requirement current-state audit before marking the goal achieved.
