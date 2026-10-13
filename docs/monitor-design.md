# Workflow monitor

The session monitor presents a selected persisted run: phase/worker graph, completed-worker counts, ordered worker list, selected evidence and control receipts. Session navigation retains exact run identities and separates the viewed run from the armed control target. It uses local assets and fonts, an upper-left brand mark and blue light-mode navigation; records are rendered as text. A gear button opens System, Light and Dark theme choices, with saved preference and keyboard focus returning to the button on Escape.

## Graph and progress

The map groups workers by phase and displays declared id/dependsOn edges. Grouping lines do not imply execution order, and JavaScript data dependencies are not inferred. The map shows at most 60 workers; the complete ordered list remains below it with state/phase filters.

Engine coverage means completed results divided by discovered workers. A running script may discover more, changing the denominator. No per-worker percentage is invented. Queued, running, completed, failed and unknown states stay explicit; a model's prose cannot overwrite recorded coverage. Engine completion, typed task reports, artifact integrity, acceptance and dashboard health are separate observations. Task reports remain unverified without authoritative acceptance receipts.

The layout pairs an ordered worker list with its inspector and stacks on narrow screens. A skip link, visible focus, text status labels, accessible settings controls and reduced-motion styling support navigation. [Browser evidence](../reports/monitor-browser-check.json) records tested desktop/narrow layouts; it is not a claim about all devices.

## Evidence and activity

Routine polling reads coherent bounded SQLite snapshots. Full worker, script, result, patch and activity reads are deliberate and tied to the observed generation. Cached workers disclose their source generation; prior execution evidence remains inspectable after restart.

The inspector exposes prompts, results, errors, effective settings, usage, workspace evidence and observed tool activity. Tool filters and paged events show command input/output/status; raw reasoning is excluded. History retains at most 256 records per worker, 4,096 per generation and 16 KiB per record. Discarded history and shortened fields are disclosed. Missing data remains missing; a preview is not presented as full evidence.

Tool failure and worker outcome are distinct: a failed command can precede a completed worker. Native patch evidence may differ from ordinary file-change events; show what was actually observed. Read errors remain visible even when later status polls succeed.

## Controls

Pause closes admission while active workers finish; stop requests interruption. Receipts distinguish pending, applied and rejected actions from final cleanup. Steering/cancellation targets an exact observed generation, worker position, attempt and active turn.

Resume uses the saved script and original runtime/session. The browser displays the saved script; edited-script resume uses the CLI. Restart shows the eligible suffix and collects an effects-reconciliation note. It repeats the selected worker and all later work, including completed writes. Unknown execution, stale identities or missing cleanup evidence cannot be hidden by retries. No control merges patches or rolls back external effects.

Authenticated mutation conflicts stay visible and require a fresh read. The browser must not automatically resend uncertain mutations. Run status and cleanup proof remain separate until terminal settlement.

## Authentication and lifecycle

The CLI requires originating-session ownership before creating the monitor. The returned loopback URL contains a bearer token in its fragment; the page captures it before API access, removes it from browser history and stores it in tab session storage. Return that complete URL to the owner and keep it out of shared reports.

The server binds only 127.0.0.1 on an ephemeral port, validates Host/Origin and uses a restrictive content security policy. APIs require authentication; static assets expose no run data. Each dashboard invocation creates an independent view, not another model run. There is no default monitor idle expiry; manual Close does not stop the runner. A new current presentation may inspect older retained runs, but every read/control still verifies their original runtime ownership. See [session delivery](session-delivery.md) for visibility, reviewed retirement and lost-response receipt contracts.

## Verification scope

Tests exercise the owned HTML/application and authenticated HTTP boundaries. Browser reports inspect actual rendered graph/theme behavior with simulated workers and retained native activity separately. Neither DOM tests nor a URL launch alone prove rendered layout. Native activity persistence during execution is covered by its own acceptance report; retained-history browser inspection proves only what was inspected. See [verification](verification.md) for current and historical evidence boundaries.
