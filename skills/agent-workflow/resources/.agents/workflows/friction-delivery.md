# Friction delivery scope

The owner requested remaining Workflow fixes/enhancements through a live workflow, including friction mined from Tidepool and earlier Workflow changes. The starting source is released 0.3.0, `17aae784e87c5d14a8db342cacec19f78d2a8713`. No historical run is rewritten or automatically retried.

## Retained objectives

- F1: Diagnose failed command-only admission through the public doctor, preserving trusted stages, safe command-result facts and owned cleanup without exposing arbitrary subprocess/account data.
- F2: Mine retained Tidepool, signage, PlanetForge and Workflow delivery evidence; classify shipped fixes, current defects, missing acceptance and external capability boundaries with exact references.
- F3: Deliver practical prerequisite and browser-owner handoffs. Distinguish executable discovery, admitted command execution, browser installation and sandbox transport. Keep independent authoring useful when verification is blocked.
- F4: Require rendered phone quality evidence (painted glyphs, clipping, simultaneous problem/keypad and DPR), rather than treating hitboxes as sufficient.
- F5: Reconcile retired connected-MCP bootstrap and whole-JSON snapshot backlog against current CLI/SQLite behavior, preserving unverified load/drain requirements.
- F6: Investigate rejected native tool observation against the pinned protocol and deliver a bounded safe implementation if the capability exists. Do not fabricate events or retain reasoning/credentials.
- F7: Verify current progress retention and cancellation/drain under a controlled load at least as large as the historical 7,327-event workload; report measured results and explicit drops without brittle elapsed-time assertions.
- F8: Review retained producer captures/drain/ownership, integrate source, verify combined behavior and skill effectiveness, complete required release checks, and update canonical wiki architecture/roadmap with honest remaining boundaries.
- F9: Retain final protocol observation counters after bounded interruption, including the persisted interrupted terminal event. Controlled load reproduced 8,195 durable events but only 8,194 reported protocol observations.

## First run

Run `eb82f036-a451-4f01-b059-5ac58c35a6ca` uses the published 0.3.0 runtime and actual originating session. Three initial workers: read-only friction scout, isolated doctor diagnostics writer, and read-only runtime scout. The friction scout JSON feeds a real isolated guidance writer. The coordinator owns dependency installation, integration, browser verification and acceptance.

Writer scopes are literal and disjoint. The doctor writer owns `bin/command.mjs`, optional `bin/doctor-diagnostics.mjs`, and existing `test/managed-entry.test.mjs`. Guidance owns the listed setup/authoring/prerequisite skill paths and `docs/friction-delivery.md`. Other production interfaces remain coordinator-owned until a new bounded writer is dispatched from reviewed scout findings.

Missing/null workers, blocked commands and unverified artifacts remain missing coverage. Historical status, effects, cleanup and capture evidence are retained. Native host composer/grant/accounting/cloud capabilities require a real host contract; owner-deferred SSH is not simulated or silently enabled.

## Reviewed integration checkpoints

Doctor writer position 1 in the first run failed `RESULT_JSON`; verified owned job/native drain and `verifyWorkspace` allowed deliberate source recovery without retry. Patch `9cd333a5f528b4eb4266497f83997a9c81a4835e6f40d4b4fdfa20156e5254dc`, manifest `25a0728e74c9f53ba4c4568a893995e31cf9bee24e5fcb21b0a523c2de564e62`. Coordinator corrected the Windows test hook operand to a file URL; 20 initial doctor checks passed. Meaningful public-launcher/Windows-job regressions then failed before their coordinator-owned integration fixes; all 24 managed-entry checks pass at that checkpoint.

Guidance, probe-facts and progress-load captures were independently verified and integrated with unchanged original outcomes. Probe position 0 in run `5b973ce7-e455-4b18-9688-d85bada3886b` also failed `RESULT_JSON` with two selected explicit final items; patch `f54e016fd99e2ffcac6227d8aa8ce97fd2d1c7ccae3cf2cfa1e59ec9fd6aeeeb`, manifest `bf7a5bb7286f385b8729a79706e006d70ea7b6d08f57026c434234d7b9e12987`. The failed status is retained. Integrated affected checks passed 135 cases before a review removed duplicated probe matrix branches; the narrowed foundation owner passes 47 cases.

The controlled 8,192-event harness initially observed its close barrier before durable interruption; the coordinator corrected that fixture assumption without changing required counts. A second run reached 8,195 durable SQLite observations with positive controlled-process cleanup, then exposed the stale 8,194 protocol diagnostic snapshot. Both failed synthetic reports/directories remain retained locally; neither establishes successful load acceptance or native Windows-job scale proof. F9 is assigned to the turn owner in active run `fd600c98-0981-4c79-898e-cc1e6dbb62a8`, alongside async answer isolation and safe raw tool observation. Its other writer owns every startup drain receipt and the raw-event opt-in.
