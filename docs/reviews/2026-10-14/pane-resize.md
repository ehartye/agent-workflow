# Pane resize and host preferences — authoring evidence

Date: 2026-10-14. Assigned worktree: `workflow-135d96f8-716f-4602-9031-8bf95a9cd9f6`. This is a scoped implementation handoff, not rendered verification or acceptance.

## Scope and behavior

Only `engine/monitor/index.html`, `engine/monitor/style.css`, `engine/monitor/app.mjs`, `test/engine-monitor-ui.test.mjs`, `docs/monitor-design.md` and this report were edited. Existing header, semantic blue/amber/teal groups, navigation, polling and read/control behavior were retained. No backend, authentication-storage, CI, dependency or Git metadata changes; no browser, service, real workflows, nested workers, installs, project commits, pushes or publication.

Two slim handles resize the Worker details inspector and enclosing Run menu, including its controls and records. Separator labels, controls, vertical orientation, tab order, numeric bounds and current width are exposed. Drag left widens; Right narrows. Keyboard Left/Right adjusts 16px, Home/End selects limits. Pointer capture, unrelated pointer filtering, cancel/lost-capture rollback and Escape are handled without replacing pane content. Page hiding/leaving, closing and viewport changes also cancel an unfinished drag. Completed resizing saves each width independently. Polling during dragging retains map/detail nodes, focus, draft text and scroll state in the DOM fixture.

Inspector default/min/max: 300/260/600px. Menu: 430/300/720px. Dynamic maxima reserve 330px outside the inspector (including the 10px handle) and 280px outside the overlay menu. Both use the available work-area/window width and re-clamp responsively without erasing the saved larger preference. At 700px the inspector maximum is 370px; at 600px the menu maximum is 320px. Below 600px handles are hidden, disabled and untabbable; inline widths are removed so the existing full-width drawer and 57% inspector sheet apply. Actual page/controls containment is still a rendered check.

Host-only cookies fix the changing-dashboard-port storage-origin problem for appearance. Only enum theme and bounded scalar pane widths are stored, using the `agent-workflow.monitor.theme` and `.width.inspector`/`.width.menu` keys, `Path=/; SameSite=Lax; Max-Age=31536000`, with no Domain attribute. Cookie values override stale per-port localStorage; valid legacy values migrate to cookies. Invalid/decode-failing preferences fall back to valid localStorage/defaults. Cookie/storage exceptions are contained. System still tracks OS preference. Auth tokens never enter these cookies; sessionStorage and fragment removal are unchanged. Host aliases/browser profiles remain separate.

The independently reported P2 navigation race reproduced with a pending catalog GET, Manual polling and Show hidden toggles. A pending flag now tracks only whether the latest requested scope differs from the in-flight scope. After settlement it requests one fresh first page for that scope through existing guards. Rapid changes coalesce; no duplicate in-flight query, timer or POST is introduced. Hidden, disposed and authentication-loss cases are exercised; the closed guard remains explicit in the shared entry path.

## Native skills and prerequisites

Genuine `skills.list({authority:{kind:"executor"}})` catalog snapshot `7b0c24d706888feb` was traversed with its returned cursors (20 through 180). Each selected ID then used its returned package and main_resource in genuine `skills.read`; every read returned `next_cursor: null`. Returned front-matter names and skill_root matched:

| Selected ID | Name | Returned skill_root |
| --- | --- | --- |
| beautiful | beautiful | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\hartye-skills\0.4.0\skills\beautiful` |
| tdd | test-driven-development | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\h-superpowers\4.16.0\skills\test-driven-development` |
| debug | systematic-debugging | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\h-superpowers\4.16.0\skills\systematic-debugging` |
| test-strategy | test-strategy | `C:\Users\ehart\.codex\plugins\cache\hartye-plugins\agent-tests\0.4.1\skills\test-strategy` |

No SKILL.md was read through shell commands. The separately authorized `references/craft.md` was hash-checked (`aff2ee60bb956372eb2c5e28b8ff6c6d7b74020f7f8eb68614a70c0192e30ad8`) before bounded reference reading. Root `AGENTS.md` and `.testing/risk.yml` were read: production phase and existing merge-lane DOM owner were preserved. No risk-map or test-selection changes. Native catalog pagination has no selected-ID filter; a filter would reduce activation overhead. Filing plugin roadmap/wiki updates is outside this six-file assignment.

Node resolved to `C:/Program Files/nodejs/node.exe`; the existing `linkedom` dependency loaded successfully. No prerequisite install or fallback was attempted. One read-only PowerShell invocation emitted startup-profile `Import-Clixml`/`InvalidOperation` diagnostics but exited 0 and returned the requested reads. Later commands used non-login shells; no profile/configuration was changed.

## Exact RED/GREEN evidence

All commands below used `& 'C:/Program Files/nodejs/node.exe'` in the assigned worktree. Expected RED runs launched and exited nonzero; none is described as not started. Tests use in-memory GET fixtures/DOM storage adapters, never a running dashboard or real controls. Existing 36 tests were retained; seven new tests extend the same owner, whose `@lane merge` and all three DOM-loaded subject declarations remain.

| Stage | Arguments after executable | Exit | Exact observed result |
| --- | --- | --- | --- |
| Resize RED | `--test --test-reporter=spec test/engine-monitor-ui.test.mjs` | 1 | tests 39; pass 36; fail 3; duration_ms 858.126. Failures: `Worker details exposes a resize separator`; `Resize separator exists`; `Cannot read properties of null (reading 'getAttribute')` at the absent separator. |
| Host preference RED | `--test --test-reporter=spec --test-name-pattern='host preferences' test/engine-monitor-ui.test.mjs` | 1 | tests 2; pass 0; fail 2; duration_ms 235.5007. `Theme preference is host-persistent`: undefined vs `dark`; other test reached absent resize separator. |
| First working checkpoint GREEN | `--test --test-reporter=spec test/engine-monitor-ui.test.mjs` | 0 | tests 41; pass 41; fail 0; duration_ms 942.7361. |
| P2 navigation RED | `--test --test-reporter=spec --test-name-pattern='Manual navigation coalesces' test/engine-monitor-ui.test.mjs` | 1 | tests 1; pass 0; fail 1; duration_ms 200.7795. `Latest explicitly requested scope is read after the old GET settles`: 1 vs 2. |
| P2 navigation GREEN | `--test --test-reporter=spec test/engine-monitor-ui.test.mjs` | 0 | tests 42; pass 42; fail 0; duration_ms 993.3248. |
| Cancellation/migration refinement RED | `--test --test-reporter=spec --test-name-pattern='pane resize drags\|host preferences survive\|queued navigation scope' test/engine-monitor-ui.test.mjs` | 1 | tests 3; pass 1; fail 2; duration_ms 233.0906. `Escape cancels the current resize before closing its menu`: true vs false; `A valid legacy preference is promoted to host storage`: undefined vs `light`. Guard characterization passed. |
| Hidden-drag refinement RED | Same refinement command | 1 | tests 3; pass 2; fail 1; duration_ms 300.8594. `Hiding the page cancels resize capture`: 1 vs 0. Migration and Escape passed after their changes. |
| Cancellation/migration GREEN | `--test --test-reporter=spec test/engine-monitor-ui.test.mjs` | 0 | tests 43; pass 43; fail 0; duration_ms 1064.7577. |
| Final expanded assertions GREEN | `--test --test-reporter=spec test/engine-monitor-ui.test.mjs` | 0 | tests 43; pass 43; fail 0; duration_ms 1009.5942; cancelled/skipped/todo all 0. Added event-driven pointer extremes, phone pointer disabling, bounded-cookie, and DOM/draft/scroll/focus preservation assertions. |

The RED failures are negative controls against absent behavior; the P2 regression specifically fails at the missing second GET. Preferences also test valid reloads, stale local values, malformed percent encoding/NUL/unknown/empty cookies, blocked stores, System OS changes and independent widths. Assertions inspect events, assigned numeric dimensions, ARIA/state and stored values, with no CSS-literal assertions. LinkeDOM cannot prove painted dimensions or native cookie/capture behavior.

Final static checks: Node reports `v24.18.0`; `node --check engine/monitor/app.mjs` exited 0 with no output. `git diff --check --` followed by all six owned paths exited 0. Git emitted its CRLF-to-LF advisory for the existing HTML file; there were no whitespace errors and no broad line-ending rewrite was performed. The review note is a new retained artifact, so ordinary tracked `git diff --numstat` does not list it.

## Remaining coordinator checks

- Rendered desktop/tablet drag in both themes, slim grip discoverability/hit targets at top and after scrolling, real pointer capture/cancel, Escape and focus return, keyboard/screen-reader separator announcements.
- Map usability, viewport-contained Run controls and records, no page-wide overflow at minimum/maximum widths and text zoom; responsive shrinking/growing and phone full-width drawer/57% sheet with no horizontal handles.
- Real same-host distinct-port browser pages and browser restart sharing theme/width cookies, stale per-port localStorage precedence, OS changes in System, and actual blocked-cookie/storage behavior. Cookie fixture is not browser-cookie evidence.
- Independent fresh review, integration, rendered verification, full suite and all root-owned gates. No full suite, smoke/build/install/audit, tests-cli report/scan or CI was run. GitHub Actions remains untouched and disabled per owner instruction. Wiki discovery/ingest and vault authoring remain outside this assigned write scope.
