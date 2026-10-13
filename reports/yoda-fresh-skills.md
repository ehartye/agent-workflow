# Fresh workflow skills: paired Yoda review

Date: 2026-10-13. Scope: all three shipped workflow skills and their three references. This is a review of instruction usefulness and contract accuracy, not a release acceptance or safety certification.

## Diagnosed failure

The existing bodies directed agents to retired workflow_* MCP tools, old start flags, old supervisor shutdown/upgrade behavior and unsupported evaluator options. A user following them against the fresh runtime would invoke unavailable entrypoints or give incorrect replay guidance. The old setup skill also selected state from PLUGIN_DATA, conflicting with the new shared CLI/hook location.

Replaced these with the public bin/launch.mjs CLI, managed ChatGPT-only worker contract, explicit mode opt-in, version-pinned run ownership, separate runtime-v2/runs-v2 storage, actual evaluator API and suffix reconciliation. Main skill links the API and controls directly; setup links upgrades directly. Descriptions distinguish orchestration, routing preference and runtime installation. Ordinary questions/direct edits remain outside all three.

## Paired protocol

Two independent agents were spawned in the same parent turn:

- Candidate: /root/release_skills/yoda_with, read all six candidate files.
- Baseline: /root/release_skills/yoda_without, prohibited from reading skills or implementation.

Both received the same Windows/Node 24 context, fake plugin/project paths, CODEX_THREAD_ID=thread-probe, managed ChatGPT subscription and fresh CLI help. Both were instructed to produce concrete scripts/commands or instructions without running models, installing software or editing configuration. The baseline received short skill descriptions solely for near-miss classification. No self-rating was requested or treated as evidence.

Realistic prompts, identical between variants:

1. “Save a reusable review-files workflow command and run it on README.md and package.json. Give me the dashboard; keep any failed verifier visible.” No edit authorization.
2. “Turn ultracode mode on for this session. Does that let workers edit files? Actually just tell me status now while continuing the review.”
3. “Install this updated plugin, already approved. Then resume run 00000000-0000-4000-8000-000000000001 from generation 2. Its worker 1 is unknown after stop and worker 2 had completed a write.”

Near misses: “What does a workflow mean?”, “Fix the README typo directly”, “Show existing workflow status”.

## Observed differences

| Case | Without skill | With candidate |
| --- | --- | --- |
| Author/save/run | Declined to invent a missing evaluator API and produced pseudocode, followed by valid-looking CLI commands | Produced exported literal metadata, agent/parallel calls, schemas, declared verifier dependencies and ordered per-file result rows |
| Failed verifier | Requested retaining failure in prose | Encoded a null verifier as unverified while preserving both file IDs; separately required reporting runtime failed/unknown workers |
| Dashboard | Requested returned URL but did not mention its authentication fragment | Explicitly required the complete returned URL including fragment |
| Session mode/steering | Read status, preserved review objective and stated no write grant | Same; also distinguished routing state from run state |
| Update/resume | Preserved uncertainty, but described the later completed write as preserved through ordered replay without explaining suffix re-execution | Preserved original runtime/session, blocked ordinary replay on unknown work, and explained restarting the unknown worker also repeats later completed writes |
| Near misses | No activation for definition/direct typo; workflow skill for run status | Same three classifications |

Verbatim baseline excerpts:

> “The supplied help documents the CLI but omits the workflow JavaScript API. I would first obtain that API before writing an executable script.”

> “Worker 2’s completed write must be preserved through ordered replay.”

The first is an appropriate refusal to guess, and demonstrates the missing authoring information supplied by the candidate. The second is incomplete advice for the restart scenario: the current restart contract repeats the selected worker and every later worker. The baseline did not actually issue a restart and did not claim unknown work was safe.

Verbatim candidate excerpts:

> “Restarting the earliest unknown worker would also repeat later workers, including worker 2’s completed write.”

> “A reconciliation note cannot replace confirmed owned-job termination or successful native cleanup.”

Both variants interpreted “Actually just tell me status now” as superseding the enable request while continuing the review. This prompt therefore verifies avoiding unwanted mode changes and preserving the review objective; it does not measure completing an unambiguous enable request. The candidate still supplied the conditional enable command.

## Independent checks

- Measured descriptions: agent-workflow 251 characters; workflow-mode 174; workflow-setup 176. All names match directories; all are below the portable 1,024-character limit.
- Bodies: 17, 24 and 23 lines respectively at initial verification, below 500 lines.
- Main-skill reference links resolve; three API/control/upgrade references are directly linked from applicable skill bodies.
- Scanned skill bodies for dollar-digit/ARG substitution and Unicode tag/bidi/zero-width ranges; no hits. This narrow scan does not establish provenance or full safety.
- Parsed the shipped JavaScript example with engine/script.mjs.
- Ran the candidate-generated two-file script through the actual separate QuickJS evaluator with a deterministic fixture broker, deliberately rejecting verify-1. Returned IDs were README.md and package.json; first row completed, second verifier null and row unverified; expected count remained 2.
- Parsed 13 candidate command forms through bin/arguments.mjs, including setup, registry operations, start/read/dashboard, mode status/on and generation-bound resume.
- No native model calls, configuration edits or installation were performed by these probes.
- git diff --check passed for skills.

The QuickJS check exercises the script's actual null/result semantics but substitutes broker replies, so it does not prove native schema handling or worker execution. The command check proves accepted argument forms, not mutation admission or successful CLI installation. Public launcher cutover and managed runtime acceptance remain the coordinating agent's release checks.

## Limits

This is one paired run per prompt and three near misses, with shared explicit CLI help. It provides bounded evidence that the candidate supplies usable authoring information and more complete replay/update guidance. It does not establish a reliability rate, safety certification, native host trigger behavior, or superiority across arbitrary tasks. Neither agent's self-assessment was used. No extra score is assigned.
