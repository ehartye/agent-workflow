# Bounded capability source stdin transport

The complete repaired four-skill bundle is now selectable and source-admitted in a real worker subprocess. Bulk skill and tool descriptors use supported bounded stdin transport instead of Windows argv. The existing 30,000 conservative UTF-16 command budget, canonical selection identities, manifest formats and source guards remain intact. This delivers the assigned implementation; it does not accept native activation of the repaired packages or authorize shipment.

## Verified inputs and baseline

The supplied task is 7,033 bytes, SHA-256 `17cf3c614340c8cec28ec5f07ab85830ca1fbf65e54c1c018bd254f75114f1b9`. All task-referenced artifacts, verified Node executable, dependency seed, helper, overlay proofs and the subsequently supplied native stdin probe receipt matched their exact lengths/hashes. See [verified input identities](test-evidence/verified-inputs.json).

The verified overlay helper applied the reviewed prerequisite before edits: **307 files / 4,777,015 bytes**, with all **645 baseline files** verified. Overlay SHA-256 is `894726a464a10d5fddfaa7ced8d07640227a17d43684d23d5db045951ac9dd4e`; baseline content hash is `a114d2997132be1fe0457870cdab94a2ba462fcb20c1d6d417937acfa357ef03`. See [the prerequisite receipt](baseline-overlay-receipt.json). No live predecessor checkout supplied these bytes. Repository AGENTS.md and `.testing/risk.yml` were read; the existing capability-source test owner remains the critical merge-lane invariant owner.

Pinned primary protocol source: Codex commit `092d3acd6bec3e3a14bdc7e7a2810ab628ab759d`, `codex-rs/app-server-protocol/src/protocol/v2/command_exec.rs`, 8,395 bytes, SHA-256 `e655da7da2984ad6ea198b55829b21db01e05993725dea0f11e9e3de7fb66784`. The verified coordinator receipt identifies its provenance. It defines `processId`, `streamStdin`, streamed output notifications, `command/exec/write {processId, deltaBase64, closeStdin}` and `command/exec/terminate {processId}`. The final execution response follows process exit and output notifications. No initial stdin field was invented.

The coordinator's independently executed command-only probe receipt is 4,054 bytes, SHA-256 `4d9968f33633e67606be4338c78f419ca310423e6944944c8fed0e50a423fe75`, at `composition-refinement-control/attempt-01/native-command-stdin-probe/receipt.json`. It observed readiness before writes, 140,050 exact bytes in 18 acknowledged chunks of at most 8,192 bytes, matching final digest, zero inference and an unforced empty owned job. This supports the primitive and registration ordering. It is not a test of this production adapter or repaired skill acceptance; this worker did not duplicate or relabel it.

## Resulting behavior

Source commands carry only a fixed receiver, source kind, byte length and SHA-256 in argv. Serialized JSON is capped at the existing **256 KiB** manifest boundary. A source subprocess validates the binding before announcing `WORKER_CAPABILITY_INPUT_READY`, reads at most that exact length, requires EOF and the exact digest, decodes fatal UTF-8, parses JSON and runs the existing full source verifier. Only then does it emit the existing skill/tool source success marker. Ordinary readiness commands retain their existing arguments and whole-output marker/JSON checks.

Admission subscribes before dispatch, waits for the exact streamed readiness prefix and then sends sequential, acknowledged chunks of at most **8,192 raw bytes**. It explicitly closes stdin and requires the owned process's final exit response. A write request is under 12 KiB of JSON including base64. No descriptor is placed in argv, environment variables or temporary transport files. The existing command budget is checked both during selection and before a source dispatch. Oversized readiness argv still refuses before dispatch.

Output retains the existing 8,192-byte refusal threshold, with additional strict canonical base64, stream and UTF-8 checks. The receiver bounds allocation before readiness; the controller bounds each output frame and aggregate bytes before accumulation and caps output notifications at 256. Streamed final responses must have empty buffered stdout/stderr. Truncation, malformed frames, unexpected write/close/final responses, missing readiness, bad bindings, overflow, invalid UTF-8/JSON, premature EOF, cancellation, deadlines and lost execution/write responses all refuse admission and dispatch no inference.

One connection-scoped process ID owns execution, writes and termination. Execution rejection handlers are attached immediately, including while waiting for readiness or a write. Failure may request one supported termination and has separate bounded termination/settlement waits of at most one second each. Final exit observation, termination acknowledgment and unknown settlement remain distinct evidence. Lost or interrupted write acknowledgments remain diagnostic uncertainty even if process exit is later observed. There is no automatic repeat, retry or fallback, and no inference after refusal.

The canonical fingerprint expression and selected roots are unchanged. The complete production-copy fixture independently compares every copied file's length/hash with its reviewed source and every generated resource with its manifest, retaining all declared references. It admits **269 files / 3,596,371 bytes**, using **44,529 stdin descriptor bytes in six chunks**. It independently checks the preexisting canonical selection fingerprint, exact roots and all references in admission evidence. Corrupting a declared resource after selection makes the real source subprocess refuse it without a repeated command. Native invocation evidence remains `notObserved` in these source-only process tests.

Large real managed-tool descriptors also cross the old argv boundary and pass all **128** tool-file checks plus the actual managed readiness process. Small/optional tools, exact parent policy, retained-source mapping, environment/executable identity and readiness JSON/marker behavior remain covered. Existing tests preserve the 128-reference, 512-skill-file, 128-tool-file, 64-entry-per-tool-tree, 64 MiB skill aggregate, per-file, discovery, link, hardlink, path-alias and corruption guards.

## Genuine native skill activation

Actual executor `skills.list` ran through all ten native cursor pages with no warnings and a final null cursor. Duplicate names were resolved using the selected authority IDs and admitted roots. Native `skills.read` used each returned package and initial `main_resource`; all five returned the expected main name, exact selected `skill_root` and null continuation:

| Selected identity | Main name | Retained digest / root suffix |
| --- | --- | --- |
| workflow | agent-workflow | `81ccc0f85f118deb57143c4b066129c44397f15f1af3e81aab6e0e280f65a13e/skills/agent-workflow` |
| authoring | workflow-authoring | `81ccc0f85f118deb57143c4b066129c44397f15f1af3e81aab6e0e280f65a13e/skills/workflow-authoring` |
| debug | systematic-debugging | `c1aa80898169b589a8c1c575c308bf417e1d5e488567771540d03c2cbfd086f7/skills/systematic-debugging` |
| tdd | test-driven-development | `c1aa80898169b589a8c1c575c308bf417e1d5e488567771540d03c2cbfd086f7/skills/test-driven-development` |
| test-strategy | test-strategy | `4cc697b3411bf70b4f2658e9219a54f919f2b3292dea38e977ea08ad6c1359de/skills/test-strategy` |

Their exact common retained prefix is `C:\Users\ehart\AppData\Local\agent-workflow\runs-v2\7f7fdf20-a3c1-4607-8ffc-135692a1fc10\source-packages-v1\packages\`. These are the admitted parent packages, distinct from the repaired source fixture. The actual native tool responses in this worker transcript own the invocation evidence; discovery alone, this report and process success markers do not certify native activation or body adherence.

Native reference reads of the TDD `testing-anti-patterns.md` and Workflow `references/worker-prerequisites.md` succeeded inside those exact packages. The native Agent Tests shared `references/craft.md` read failed with **`skill environment is not available for this callback`**. That shared-reference stage remains missing. No shell skill-body read, copied activation, alternate package or expanded root replaced it. The task excludes external/wiki work; its plugin roadmap update remains coordinator-owned.

## Executed verification

All tests used the verified `C:\Program Files\nodejs\node.exe` and task-verified `worker-test-tools.mjs`, preserving the actual `AGENT_WORKFLOW_WORKER=1`. The protocol-faithful test client starts real Node subprocesses, streams their real output, writes actual child stdin and closes it; it does not manufacture success markers. Fault injections alter the transport deliberately while retaining real receiver behavior. Exact commands, working directory, full stdout/stderr and hashes are retained with each receipt.

| Evidence | Executed result |
| --- | --- |
| [transport-red](test-evidence/transport-red-receipt.json) | Exit 1: 48 passed / 2 failed at the old Windows argv guard, including expected successful admission of the real full bundle. |
| [transport-first-green](test-evidence/transport-first-green-receipt.json) | Exit 1: 68 passed / 2 failed. Full source admission and transport fault checks passed; two older buffered test stubs lacked the required notification protocol. Their original failures are retained. |
| [transport-boundary-green](test-evidence/transport-boundary-green-receipt.json) | Exit 0: 77 passed, zero failures/skips, stderr empty, after replacing those stubs with real-process checks and adding exact input/output/protocol boundaries. |
| [transport-final-green](test-evidence/transport-final-green-receipt.json) | Final source: exit 0, **80 passed**, zero failures/skips, stderr empty. Includes large real tool descriptors and execution rejection during an actual stdin write. |
| [syntax and final source identities](test-evidence/syntax-and-source-identities.json) | Both changed source files passed `node --check`; stdout/stderr empty. |
| [dependency cleanup](test-evidence/dependencies-cleaned.json) | All 1,868 independent dependency copies reverified before removal; owned fixture root empty and removed. |
| [baseline scope](test-evidence/baseline-scope.json) | All 645 frozen baseline paths checked: only the two assigned source files differ; additional files stay within the assigned report/receipt/evidence scope. |

The exact 256 KiB JSON input boundary succeeds in a real Node receiver and a 256 KiB + 1 binding refuses before readiness. Failure coverage includes null write rejection, lost write acknowledgment, rejected execution while waiting for readiness and while writing, no EOF, invalid UTF-8 in both input and final output, noncanonical base64, notification flood, output truncation/overflow, unexpected streams/responses and pre-dispatch cancellation/expired deadlines. Tests assert one source dispatch and no repeated writes after uncertainty.

No broad merge/release suite was run: this assignment requires its affected existing owner. The preserved failures above were executed commands, not `notStarted` claims. Test corrections used known process outcomes and owned fixtures; no uncertain production command was repeated.

## Source handoff and remaining gates

| Source | Bytes | SHA-256 |
| --- | ---: | --- |
| engine/worker-capabilities.mjs | 38002 | `179a8ec4653573181ac5ce8863ec8f74b7fe3564f33d07e3106fe95c806fbfd6` |
| test/engine-worker-capabilities.test.mjs | 60003 | `bee3fc89ff3e65d207374586048aac59f5dc3b0a51572d557bf5304c141c6007` |

Only these two assigned source files and the assigned report/prerequisite receipt/evidence were authored beyond the reviewed overlay. Temporary dependencies and test fixtures were cleaned with the verified helper. No project Git metadata, package/lockfile, retained input/source package, backend/foundation/controller/UI/provider, generated resource, global setting or installation was changed by this repair. No network, native model/workflow/server qualification, delegation, commit, publication or merge occurred.

Remaining coordinator coverage: reviewed capture/drain/integration; fresh production-adapter qualification against pinned native command transport; native activation/resource pagination and cross-skill acceptance for all repaired packages in a newly admitted worker; combined `npm test`, `npm run check`, `npm run smoke` and any required clean-package/release/audit checks. Linux/macOS branches remain untested. The Agent Tests shared-reference failure and task-excluded wiki maintenance remain explicit gaps. Neither the coordinator's primitive probe nor these 80 process/source tests supply those acceptance stages.
