# CLI inspection and controls

Prefix commands with `node "<plugin-root>/bin/launch.mjs"`. Preserve explicit --data-dir. Use exact UUID run IDs returned by run, not workflow names or an inferred newest run. Starts, dashboard and mutating run controls require the original --session or CODEX_THREAD_ID. Never fabricate or borrow an identity.

| Command | Purpose |
| --- | --- |
| list | Saved fresh-engine runs, including unavailable evidence |
| status ID | State, generation, worker identities, bounded previews, coverage |
| result ID | Full retained result |
| worker ID --position N --generation N | Full worker evidence |
| events ID --position N --generation N --after N --limit N | Activity page, limit 1–100 |
| patch ID --position N --generation N --basis inputs | Writer patch against captured inputs; base also supported |
| exclusions ID --position N --generation N --stage outputs --after N --limit N | Explicit-policy excluded metadata page; not payload-content verification |
| dashboard ID --session ID | Authenticated monitor URL |
| dashboard ID --session ID --current-ui | Current installed presentation; execution still uses original retained runtime |
| pause ID --session ID --generation N | Close admission and drain active work |
| stop ID --session ID --generation N | Close admission and interrupt active turns |
| control ID --receipt ID | Pending/applied/rejected receipt |
| resume ID --session ID --generation N | Saved script and matching prefix |
| resume ID --session ID --generation N --script file | Explicit edited script |
| steer ID --session ID --generation N --position N --attempt N --turn ID --text instruction | Steer observed active turn |
| cancel-worker ID --session ID --generation N --position N --attempt N | Cancel queued/active work; include --turn for active turn |
| restart-worker ID --session ID --generation N --position N --attempt N --reconcile note | Reconcile and repeat eligible suffix |

Positions are zero-based. Read status immediately before controls and use its generation, position, attempt and turn. worker/events/patch accept --source-generation for retained earlier evidence. Stale responses require a fresh read, not an automatic mutation retry.

Pause lets active workers finish; stop interrupts them. Applied acknowledges control, not settlement. Inspect status until cleanup evidence and terminal state exist. Steering distinguishes sent from native-confirmed; report the actual receipt. Cancelling one worker leaves siblings running.

Resume retains saved arguments/settings and original runtime. Unknown work, failed native cleanup, missing shutdown evidence or stale ownership blocks ordinary replay. Do not delete locks, rewrite records or use a legacy reconciliation flag to force admission.

After settlement, restart the earliest eligible failed/unknown worker. It repeats that worker **and every later worker**, including later successful work. Inspect all affected attempts, patches and external effects first and supply a specific reconciliation note. Confirmed owned-job termination and successful native terminal cleanup remain mandatory; a note cannot waive missing evidence. No automatic restart, merge or external-effects rollback exists.

The monitor graph, inspector, tools/events and theme gear reflect persisted evidence. Grouping lines do not assert dependencies; declared arrows do. Engine coverage is completed results divided by discovered workers, which may grow. Typed task reports and artifact claims remain unverified without authoritative acceptance receipts. Show failures, unknown slots, truncation and unavailable evidence. Inspection makes no model calls. Dashboard creates a view of the same run, not another workflow. Session navigation changes the viewed run without arming its controls. Close ends only that dashboard; there is no default monitor idle expiry.

For reversible hide/archive/restore and separately reviewed destructive retirement, read the [session lifecycle contracts](../../../docs/session-delivery.md). Use exact observed revision/target identities. After a lost visibility response inspect its request ID; after a lost prune response inspect its plan ID. Never blindly repeat uncertain mutations. Hidden/archived work retains its true status, evidence and control IDs; Show hidden and counts preserve discoverability. Prune rejects active, unknown, incomplete, pinned or unsupported retained-runtime data.

Return the complete URL, including authentication fragment, directly to the owner; keep its token out of shared reports. Routine status is bounded; request full worker/result/event evidence deliberately. Status exit zero means inspection succeeded even when its JSON describes a failed run.
