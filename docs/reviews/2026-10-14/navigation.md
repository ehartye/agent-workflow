# Navigation and data polling review

Assigned baseline: `ca0e8b73f4af142a9035e29f709483af94ab28f2` (published 0.3.5). This is an uncommitted UI writer checkpoint in the assigned worktree. No coordinator acceptance or new release evidence is claimed.

## Inputs and native activation

Read repository `AGENTS.md`, `.testing/risk.yml`, and `.agents/review-inputs/2026-10-14/manifest.json`. Read bounded project overview, architecture, roadmap, map-inspector design and release-0.3.5 acceptance snapshots; all five SHA256 hashes match the manifest. The production phase, retained runtime/data/API consumers and Windows ownership remain unchanged. Supplied snapshots are input evidence, not permission to search or modify the external vault.

Genuine executor `skills.list` traversed its native cursor pages from `7b0c24d706888feb:20:48000` through `:180:48000`. Selected authority IDs on the final page were activated with native `skills.read` using the returned package and main_resource; each main read returned `next_cursor: null` and the exact expected root:

| ID | Native name | Returned skill_root |
| --- | --- | --- |
| beautiful | hartye-skills:beautiful (`name: beautiful`) | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\hartye-skills\0.4.0\skills\beautiful` |
| tdd | h-superpowers:test-driven-development | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\h-superpowers\4.16.0\skills\test-driven-development` |
| debug | h-superpowers:systematic-debugging | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\h-superpowers\4.16.0\skills\systematic-debugging` |
| test-strategy | agent-tests:test-strategy | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\agent-tests\0.4.1\skills\test-strategy` |

No shell SKILL.md reads, copied activation bodies or substitute role packages were used. The owner-authorized out-of-package craft reference was read in a bounded form and SHA256 verified as `aff2ee60bb956372eb2c5e28b8ff6c6d7b74020f7f8eb68614a70c0192e30ad8`. Native main activation succeeded for all four roles. Native tool metadata search exposed no tests-cli/report/scan tool; its readiness remains unverified and no standalone static scan was invoked. The authorized affected Node test command supplies this checkpoint's verification.

## Behavior and effects

- Replaced the native run select with a nonmodal dialog picker, actual title, execution status, disposition and Created columns. The coordinator confirmed that the existing catalog exposes `createdAt`, not `updatedAt` or per-row unknown-worker counts. Created uses that existing field; absent times remain unavailable. No new API field is inferred.
- All, Active, Completed and Needs attention apply to loaded client pages. Completed means observed `completed`; Needs attention means observed `failed`, `unknown` or `unavailable`. The viewed context remains visible across filters and disappearance. More runs continues the existing cursor protocol; later loaded pages are retained across head refreshes with that refresh scope disclosed. Show hidden changes discard pagination from the prior query scope. The 1000-row bound remains.
- Existing viewing/control separation, scoped control identities, session/token handling, attempt preconditions, evidence reads and uncertain lifecycle receipts retain their owners. Selecting a row never submits a control request. Browsing also prevents the initial pinned-run admission from automatically arming a previously unavailable run that later recovers; explicit control selection remains required.
- Data polling defaults to two seconds, offers 1/2/5/10/30 seconds or Manual, and stores the choice in localStorage. Refresh now is accessible from the footer. Scheduling is single flight and settings replace the pending timer. Hidden, closed and unauthenticated states stop scheduling and keep controls closed.
- Run rows and local message rows use stable keys; map markup reconciles existing worker cards and its scroll container. Unchanged inspector content retains its existing render key. Polling reads data without document reload or replacing the application.
- Run menu preserves `more-toggle`, uses an ellipsis/down-chevron icon, a Run menu accessible label/title and truthful nonmodal dialog semantics. Labeled Browse, Run controls and Workspace & evidence sections use blue/cyan, amber and teal/green rails/surfaces in both themes. Headings, surrounding borders, separators and spacing convey the boundaries alongside color. Disabled buttons have dashed borders and reduced opacity; red stays destructive/error-specific and status chips retain execution colors. Existing local fonts, 44px light blue header, map geometry, 300px inspector and phone sheet remain.

Deliberate heading/surface pairs and calculated sRGB contrast:

| Group | Light foreground / surface | Ratio | Dark foreground / surface | Ratio |
| --- | --- | --- | --- | --- |
| Browse | `#17477f` / `#f3f7fc` | 8.70:1 | `#8fc8ff` / `#142638` | 8.70:1 |
| Run controls | `#87520d` / `#fff8eb` | 6.13:1 | `#ffd18a` / `#2a251d` | 10.67:1 |
| Workspace & evidence | `#086756` / `#f0f9f5` | 6.35:1 | `#8cddc6` / `#122b2a` | 9.45:1 |

This is a targeted grouped-menu refinement after the working source checkpoint, with no extra header or dashboard tiles. Calculation is palette evidence only; disabled-state perception, actual font painting and compact phone geometry still require real rendering.

## Test-first checkpoints

Command: `C:/Program Files/nodejs/node.exe --test test/engine-monitor-ui.test.mjs test/engine-monitor.test.mjs`, non-login PowerShell. These are executed test processes with bounded output; all reported nonzero exits are executed RED runs.

| Checkpoint | Passed / total | Exact RED cause or result |
| --- | --- | --- |
| First RED before source edits | 42 / 45 | Missing columnar current-run row; undefined two-second polling setting; missing Run menu accessible label. |
| Filter RED before source edits | 42 / 46 | Above plus missing picker dialog semantics. |
| First working source | 46 / 46 | Green, exit 0. Observed before the 00:55:05 UTC clock checkpoint. Manifest captured at 00:49:42.744 UTC; no independent task-start timer was captured. |
| Changed-data and hidden-response RED | 46 / 48 | Unchanged map card was replaced; a late hidden response re-enabled Pause. |
| Refinement | 47 / 48 | Source fixes passed identity/hidden checks; a test's hardcoded UTC-hour display expectation failed in the actual local timezone. Corrected to compare retained time-node identity. |
| Coordinator Created correction RED | 47 / 48 | Actual rendered column still read Updated. |
| Corrected source checkpoint | 48 / 48 | Green, exit 0; zero skips/cancellations. |
| Health-auth and pruning-focus RED | 46 / 48 | A health 403 left connection text at Connecting; an unchanged pruning preview replaced its focused button. |
| Health-auth/pruning fixes | 48 / 48 | Green, exit 0. All 1/2/5/10/30 choices have timer coverage. |
| Semantic group refinement | 48 / 48 | Green after grouped surfaces/rails; palette contrast calculated separately. |
| Visibility-query pagination RED | 47 / 48 | Changing includeHidden retained the exhausted cursor from the prior query. |
| Visibility-scope fix | 48 / 48 | Green, exit 0. |
| Recovered initial-run viewing RED | 47 / 48 | Merely viewing a recovered initial run automatically armed Stop through the initial-admission branch. |
| Final source checkpoint | 48 / 48 | Green, exit 0, 36 UI tests plus 12 engine tests; zero skips/cancellations, 1.896 seconds. |

Final `node --check engine/monitor/app.mjs` and scoped `git diff --check` both executed successfully, exit 0. The new navigation report also passed an explicit trailing-whitespace scan (zero lines); Git diff does not include new untracked file contents. No other tests or merge/release gates were run.

SHA256 of the final tested source (documentation is outside this source digest):

| Path | SHA256 |
| --- | --- |
| engine/monitor/index.html | `575e86eaf9bcfff9fd2b190f6a85e4410cc1b86bd10690650541f3e49060d367` |
| engine/monitor/style.css | `7a42ffc57c2860ba2b1c5e0c9a64eecac39dbfc4ac4e6a5617911e78b80c0798` |
| engine/monitor/app.mjs | `825a51255fae479fc4330a51e447f7235bdfedd987ed4539b023c491cbb608eb` |
| test/engine-monitor-ui.test.mjs | `ee362b367485bd47c41808cdac36c46fbf789cdf97f63fb8f0cf1b845283c74e` |

Two apply_patch submissions were rejected by pre-write context verification (an exact navigation label and an obsolete select handler). The tool explicitly reported the missing context; bounded reads reconciled the unchanged portions before corrected patches. No uncertain mutating command was retried. Successful source edits and tests remain in the six assigned paths. Test subprocess fixtures are distinct from operating real workflows or launching the user's application.

## Missing verification

LinkeDOM/VM exercises actual owned HTML/application code and DOM identity, not painted browser output. Real desktop/phone rendering, font painting, clipping, scrolling, touch target measurement, zoom/text scaling, light/dark/System contrast and screen-reader behavior remain for the coordinator. Full merge/release gates and installed-runtime acceptance are not run or claimed. External wiki discover/ingest and updates are outside this writer's six-file scope. Prior installed 0.3.5 paint evidence does not verify these edits.
