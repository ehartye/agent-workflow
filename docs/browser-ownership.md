# Browser verification ownership

One named owner holds the browser tab/context and dashboard service for the
entire verification pass. A catalog entry, served-asset hash or DOM test does
not prove painting. This protocol is a coordinator record convention; it adds
no browser-lock daemon or automatic takeover mechanism.

## Acquire before using the browser

The coordinator first confirms the genuine supported browser integration is
connected and suitable for the authorized checks. Record its actual browser,
tab and context identities, rather than launching an alternate browser, changing
the user’s profile or installing a missing renderer. A busy integration is a
prerequisite report. Keep its known owner and do useful source/DOM work while
paint-dependent checks remain missing. Do not reset the session, close unrelated
tabs, kill a browser or steal a lock.

Keep records in an **external private coordinator-control directory**, outside
the captured/frozen source, its excluded log directories and the integrated
snapshot. A conventional layout is an exclusively created acquisition intent
plus immutable acquisition, evidence, handoff and release receipts keyed by a
unique leaseId. Creation collision means inspect the existing owner; elapsed
time, a stale-looking PID and lost connectivity do not transfer ownership. The
coordinator serializes acquisition and retains the history instead of deleting
the prior lock to obtain a clean run. No worker writes these files without an
explicit external-control assignment.

An acquisition record contains these facts, using actual values and null for
anything not yet observed:

| Field | Evidence required |
| --- | --- |
| leaseId, owner, acquiredAt, status | Named coordinator/worker, unique request identity, UTC time, held/handoffPending/released/unknown |
| originatingSessionId, dataInstanceId, runId, runtimeId, generation | Authenticated requested-run response plus originating-session records; retain the saved runtime even with a newer UI |
| serviceInstanceId, origin, privateDashboardReceiptRef | Authenticated health identity plus original loopback origin; secret URL stays private |
| sourceSnapshot, validationSnapshot | Exact root/content/manifest and dependency identities; distinguish source F and validation V |
| servedAssets | Actual requested URL path, SHA-256 and byte count for HTML, JS and CSS, with capture time |
| browserIntegration, browserId, tabId, contextId | Observed native IDs and profile/session scope without credentials |
| allowedActions | Explicit read/navigation/capture and any separately authorized owned-fixture control actions |
| serviceProcess | Launch receipt PID plus creation/owner evidence where observable; PID alone never proves ownership |
| pendingOperations, evidenceRefs, handoffRef, shutdown | Actual submitted IDs/unknowns, immutable receipts and unresolved checks |

No fabricated completed record is supplied as a template. A required null
identity blocks the dependent pass. A dashboard receipt’s pid/url alone cannot
fill serviceInstanceId or certify a process lifetime. The current launcher
returns pid/url/sessionUrl, while authenticated health supplies serviceInstanceId;
process-creation and shutdown evidence require their own owner observation.

## Perform one identified pass

Before the first action and after any reconnect/handoff, authenticate
`GET /api/health` and confirm service readiness, the same serviceInstanceId and
original origin. Separately obtain the authenticated requested-run response
(`GET /api/run` for the pinned run) and verify the selected run, its recorded
runtime and data instance against the acquisition record. Health contains no run
identity and can succeed while the run read fails; leave that binding unknown and
pause dependent actions if it cannot be read. Recheck expected snapshot/served
bytes from their own evidence. A replaced service or changed asset
set invalidates the pass; preserve the old observations and obtain a deliberate
new binding. Do not accept a cached screenshot as current evidence.

Use the assigned tab/context only. Record the tested viewport, theme, keyboard
path, screenshots, focus/overflow results, time and served identity. The required
dashboard pass covers desktop and 390x844, light/dark, keyboard submission/cancel,
finite/unbounded budgets and stale-target conflict. Keep Map/inspector space,
phone sheet behavior and data-only polling observable. Native deadline execution
needs its own authorized fixture/run and genuine control receipt; painting and
DOM tests cannot supply it. Do not use an unrelated live run as a fixture.

Record a returned control/request ID before further actions. If that response
is subsequently lost, inspect that exact ID. If no ID was received, retain an
unknown operation and reconcile it with the coordinator; do not post again,
guess an ID or infer success merely from a changed revision. Browser idle,
disconnect, workflow completion and positive owned-job cleanup do not reconcile
arbitrary external effects.

## Handoff without overlap

1. The current owner stops browser actions and records pending requests, capture
   teardown and any unknown response. It offers handoff to one named successor,
   retaining lease/service/tab/context/run/runtime/snapshot/served identities.
2. The coordinator reviews the handoff and resolves any operation that blocks
   safe continuation. The successor acknowledges the exact handoff receipt and
   allowed actions; an offer alone does not grant ownership.
3. The successor checks the same native tab/context and authenticated service
   binding before recording acquisition. Only then does the old owner release
   its action authority. Record both acknowledgements with UTC times and no
   interval of concurrent browser operation.

When the old owner is unreachable, preserve ownership as unknown. A coordinator
may reconcile and deliberately authorize a replacement pass, retaining failed
and partial evidence. There is no expiry-based adoption or automatic restart.

## Close and prove shutdown separately

At pass end the owner records pending operations and tears down its captures/
subscriptions. Use the authenticated **Close** action only for the bound dashboard
instance. Do not click **Stop** to clean up a browser: that controls the workflow.
Closing a tab is not service shutdown, and tunnel loss is not health-unavailable
evidence for the service host.

Retain the Close response if observed, then independently record an exact health
request becoming unavailable at the original origin and the owned service’s
process-exit/shutdown evidence, with identity and observation time. Distinguish
connection refusal from HTTP 401/403, unavailable saved run data and transport
loss; a healthy different service on a reused port is not the old service’s
shutdown receipt. A process PID disappearing alone is insufficient identity
proof. The launcher currently exposes no durable service-creation/shutdown
receipt API; retain the actual owner’s observation or leave that field unknown.

If Close times out or health cannot be reached, retain the instance and outcome
as unknown. Do not kill an unowned process, repeat Close automatically, remove
the acquisition history or mark release/shutdown complete. Ownership handoff may
be explicitly reconciled while the unresolved service outcome stays visible.

## Acceptance boundary

This maintenance task authors the protocol only. It acquired no browser, opened
no dashboard and made no remote/control request. Actual supported-integration
readiness, exclusive acquisition/handoff, served painting, native actions and
positive service shutdown remain missing until separately observed by the
designated owner. The existing [monitor](../test/engine-monitor.test.mjs) and
[UI](../test/engine-monitor-ui.test.mjs) tests keep HTTP/DOM invariant ownership;
their output cannot replace this pass. A saved typed task report or empty missing
array cannot authenticate browser evidence.
