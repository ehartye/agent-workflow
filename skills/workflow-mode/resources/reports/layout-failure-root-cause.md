# Layout delivery and missing notification

Run `0fef1914-48bb-475e-9149-1dc6f27e816b`, generation 1, worker 0 used retained runtime `0.3.1-33b2b029c748972e-node24.18.0`. Its authored deadline was 900,000 ms. The original outcome remains `unknown` / `TURN_TIMEOUT`; the run failed with incomplete coverage. It has not been restarted or relabeled.

## Observed delivery failure

The worker actually called native `skills.list` and `skills.read` at 01:46:25 and 01:46:29 UTC on October 14, 2026. One native `exec` call then wrapped two shell reads: `Get-Content README.md` and `rg --files`. Both completed with exit 0 by 01:46:34.528. No further supported tool calls, waits, or file changes were retained. The last commentary was at 01:54:35.913. Timeout interruption was observed at 02:01:21.350, after 6 minutes 45.437 seconds without activity. The measured worker lifetime was 15 minutes 0.951 seconds.

Independent workspace verification found identical input/result trees (`84a2ecd8ebf301ab6fc2393d724d528c2fc50769`), zero changed files, empty patch SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, and manifest SHA256 `5b9da3a81df000bcd9bcca068e5b63b3df06d2077c9c9494b8b7b38601be95b3`. Worker server exit, owned Windows job emptiness and native terminal inventory emptiness were positive and nonforced.

This establishes stalled executable delivery after successful initial reads, not a pending build, missing skill tool, or shell startup failure. The provider/model's internal reason is unknown. Zero reported reasoning tokens is not evidence that no hidden reasoning occurred. Of 285 observed activity events, 256 were retained and 29 dropped; no claim is made about dropped payloads.

The failed-session `commands: []` was also misleading: command aggregation previously happened only after a normal returned turn. Failure evidence now retains bounded command status/exit metadata, marked `commandCoverage: retainedItemsOnly`; an empty array must not establish that no commands occurred. A real subprocess regression test completes a command, stalls, times out, and checks that the command outcome survives without command/cwd/output contents.

## Owned notification gap

The coordinator starter launched the background CLI and exited after printing `running`. `startBackground` disconnected and unreferenced its child after acknowledgement; the child disconnected in `onReady`. Completion wrote a passive `finish-*.json` receipt. No watcher was attached to deliver that receipt into the originating conversation. The saved timeout was correct, but it could not notify the coordinator through a connection that did not exist. A visible dashboard and a passive result path do not establish delivery.

The correction requires durable terminal events, an explicit live observer, replay from a consumer-owned cursor, and early executable-progress warnings. It does not increase the worker timeout, automatically cancel/retry uncertain work, or fabricate native parent-chat push support. Writer guidance additionally requires a small first artifact before polishing. Concrete fix verification and release status belong in `docs/verification.md` and `docs/friction-delivery.md`.

## Sites recovery

After reviewing the original empty capture and positive cleanup, the coordinator directly authored the requested three new sample layouts in a separate Sites checkout. This is source delivery of the unfinished requirement, not a retry of the old worker or evidence that its failed run succeeded. Sites publication has its own exact source and deployment receipt.
