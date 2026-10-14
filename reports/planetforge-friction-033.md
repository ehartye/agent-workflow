# PlanetForge workflow friction: 0.3.3 candidate

This records bounded local acceptance on Windows with Node 24.18.0 and pinned Codex 0.162.1. Publication still requires Windows PR/tag checks. Private receipts retain exact session ownership, commands and authenticated dashboard URLs; those values are excluded here.

## Resulting behavior

The published 0.3.2 Session 0 work is preserved. The reviewed Windows helper source is packaged as a Microsoft Public Trust signed x64 executable. Startup verifies source/binary identities, architecture, approved profile-specific EKU and a trusted timestamp before launch. It never compiles an unsigned replacement or weakens Smart App Control. Owned-job and native terminal cleanup remain separate from protocol completion.

New runs default to explicit captured parent execution authority. The supported current context is unrestricted filesystem, network allowed and approval never, tied to the originating session. It is a coordinator assertion, not cryptographic host attestation. Original enabled native plugin/skill roots are provisioned automatically; task instructions and worktree ownership still bound authorized work. Full-access worktrees organize review rather than enforce filesystem isolation. Host-only app connections and histories are not cloned.

Explicit selected skills now require observed initial native main-resource reads matching each original root. A paired error output cannot satisfy that requirement. One post-model command rechecks the selected source/reference identities; persistent disappearance/change rejects completion and preserves the model attempt/effects. Parent catalog identity is persisted separately and must match before resume/restart can advance a generation or dispatch another worker. These checks detect drift; they do not prevent host cache deletion or authorize retries/substituted packages.

Captured bytes and each retained diff now allow 512 MiB. Metadata and previews retain 32 MiB bounds. Real Git verification exercised a 129 MiB binary with a diff larger than 32 MiB, verified collection/replay and rejected tampering and a 512 MiB+1 input. Larger captures require more memory/disk/time; this is a bound, not a throughput guarantee.

## Native evidence

The current command-only parent catalog inspected 32 plugins, 201 skills and 51 original roots, with zero missing and 24 visible warnings. Fresh direct native acceptance observed ten list and eight read pairs for engine-r3f, test-strategy and all six Meshes skills. Required/observed sets matched all eight; missing, ambiguity and observation counters were zero. Selected source checks passed before and after the model, required managed version/setup JSON checks passed, and owned-job/native cleanup was positive.

This proves initial main-response/root metadata and managed readiness. Full pagination, instruction compliance, generated models, rendering and artifact quality remain separate. A command-only full-policy probe independently started Blender; the later model worker reported Blender 5.2.2, but its retained command summary does not independently attribute that argv/output. The earlier restricted failure and removed test-strategy 0.4.0 resource remain historical evidence; the fresh bundle uses verified current 0.4.1 resources.

## Authoring case study

Two same-prompt paired dry runs used the genuine original feature-tree workflow-authoring skill versus no skills. The first exposed cross-root native reference failures and omitted recovery cases. Moving current admission/replay guidance into an in-package reference corrected native reference access and the exact context/CLI plan in the second run. Both pairs had positive cleanup; the candidates' original main reads and source checks were observed.

Planning acceptance still failed: the candidate omitted both requested recovery cases and referred to an absent continuation. Retained final-answer metadata showed no truncation. The baselines also proposed invalid changed-catalog resume behavior. Neither draft is execution-ready, neither is used for game delivery, and no general skill-quality benefit is claimed. Deterministic runtime guards enforce the admitted recovery boundaries independently of model prose.

All nine PlanetForge objectives remain unaccepted. Scouting, native access/readiness and tool verification are prerequisites, not implementation or game acceptance.

## Local release gates

The later local rerun including the Windows short-name regression passed all 483 tests, with zero failures, skips or cancellations, in 118.78 seconds. Package checks, offline smoke, clean production-only installation and the production dependency audit passed; the audit reported zero vulnerabilities. The installed candidate's public parent-policy doctor passed with zero inference requests, normal server exits and empty owned Windows jobs.

An earlier run passed 479 of 482 tests: three real-process fixtures exceeded their outer 10-second test runner timeout. The runner now allows 60 seconds; production worker, protocol, readiness, Git and cleanup deadlines are unchanged. The following 482-test rerun took 888.35 seconds under this host's slow verification conditions. Neither duration is a runtime performance guarantee. Windows PR and release-tag gates remain required before publication.

Windows PR verification initially failed seven catalog tests and three helper/host-context tests. A real local 8.3 alias regression confirmed that spelling equality rejected valid original roots; filesystem identity now admits those aliases while still rejecting junctions. All ten catalog tests also passed with temporary directories using a real short-name ancestor. The CI alias attribution remains pending diagnostics. Signed and unsigned helper verification both reached the 15-second PowerShell deadline; that does not establish a bad signature or helper execution. Bounded failure-only CI diagnostics distinguish startup, signature processing and projection without changing trust policy or production deadlines. Publication remains held while those runner failures are unresolved.
