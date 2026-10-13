# Saved workflows and release integration

Continue part 4 of the authorized release specification on the feature worktree. The writer checkpoint is `dc3dd0a`; installed 0.1.1 remains separate. Use the fresh engine through CLI/skills and its authenticated monitor. No custom MCP or API-key billing path.

## Definitions and commands

Implement a fresh definition registry with project, personal and bundled scopes. Search `.agents/workflows` from the current directory toward its nearest Git root, then the personal directory, then bundled definitions. Qualified `project:`, `personal:` and `plugin:` names select a scope. The nearest definition shadows more distant definitions; duplicate extensions or case-colliding names within one directory are errors. Each read reloads bounded regular files and validates the fresh JavaScript contract. Refuse links anywhere in discovery/save paths and path traversal names. Bundled definitions are read-only. Saving requires explicit overwrite for existing definitions; command generation cannot replace unrelated skills.

Expose list/read/validate/save through the CLI; start by path or resolved name with structured JSON arguments. Persist the selected script in the run so a later definition edit does not silently alter resume. Generated commands invoke the packaged CLI/skill, carry scope provenance, and inherit only authorized permissions. Tests use actual temporary trees and the CLI process boundary.

## Managed installation and migration

Replace the public entrypoint and setup/doctor with fresh-runtime packaging. Install exact production dependencies outside the mutable plugin cache and fingerprint the complete runtime inputs, including engine/foundation, monitor assets, recipes and native job-host source. The runtime must locate its own pinned native Codex executable. Use a separate new-run namespace and preserve old saved data plus its matching runtime directories. Record previous installed runtime references; never reinterpret old JSON runs as SQLite runs. Resume must retain its original session and reject incompatible runtime identities explicitly.

Remove custom MCP manifests/entrypoints and obsolete runtime dependencies from the new package. Update plugin manifests, onboarding, routing hooks/mode and generated commands together. Replace legacy-only verification with meaningful fresh install/run/monitor/upgrade checks; retain prior runtime files in existing installations, not the new source package. Verify clean native plugin discovery and exact-version installation without writing credentials into fixtures.

## Skills, verification and shipping

Rewrite all workflow skills and recipes around the fresh CLI/API. Run Yoda paired baselines and near misses; use agent-tests for the changed suite and risk map. Finish source/quality review, production dependency audit, full Windows tests, package smoke, clean installation and a real saved subscription-backed workflow invocation. Observe original-session resume and authenticated dashboard startup from that installation.

Fetch/rebase latest main, update the reviewable PR, wait for required Windows checks, squash-merge, publish a verified tag/version, update the shared marketplace, verify installation of that exact version and sync the main checkout. Existing user authorization covers this sequence. Mark the thread goal complete only after these release artifacts and all four parts are verified.

- [x] Fresh registry, named CLI starts and generated commands.
- [ ] Fresh managed setup/doctor/public entrypoint and version-pinned data boundaries.
- [ ] Updated manifest, hooks/mode, recipes, skills and Yoda evidence.
- [ ] Test audit, source review, full checks, clean installation and native saved-workflow proof.
- [ ] Required CI, squash merge, release, marketplace and installed-version verification.

Follow-up parity ledger requirements remain explicit in `docs/codex-parity.md`; this plan does not redefine those entries as complete. Early native patch errors are absent from ordinary file-change events; selective native tool-call/output observation is a recorded monitor enhancement, with raw reasoning excluded.

Registry checkpoint: `engine/cli.mjs` exposes `--list-workflows`, `--read-workflow`, `--save-workflow --script`, `--validate --script`, and `--workflow` for named starts. Project saves target the invocation cwd; personal saves target its home directory. `.js`/`.mjs` suffixes are accepted once; ambiguous repeated extensions are rejected so returned identifiers resolve consistently. Definitions support portable simple names; generated command skills additionally require lowercase-compatible hyphenated names within Codex's 64-character limit. Command generation delegates the installed workflow skill and does not embed an obsolete runtime path. Five tests cover real directory precedence/reload, collisions, preserved definitions/skills, links and actual CLI processes. The installed skill and public launcher still need replacement below; clean-install/native saved-workflow proof remains part of the release gate.
