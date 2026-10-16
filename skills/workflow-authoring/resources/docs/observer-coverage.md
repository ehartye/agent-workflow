# Consumer observation coverage

The CLI `watch` stream remains read-only and never sends execution controls. Its successful stdout writes do not prove the parent processed records. `engine/observer-coverage.mjs` supplies a consumer-owned version1 receipt for the coordinator or host adapter that actually handles those records.

Open `openObserverCoverage(absoluteFile, {runId,generation,observer,launchedAt}, {after})` before connecting. The parent directory must already exist. `after` must equal the existing receipt's actual `lastProcessedCursor`, or be the deliberately chosen baseline for a new receipt. Call `await receipt.processed(record)` only **after** that named consumer processes each JSONL record. Do not acknowledge ahead, derive the cursor from unread output, or treat a child writing stdout as parent consumption. Call `finish('terminal'|'disconnected'|'aborted'|'observation-error')` after observation ends; terminal requires an acknowledged durable run-terminal record. The same file cannot reopen after acknowledged terminal.

Resolve and validate the consumer's owned absolute receipt path and module loading before describing it as pre-armed. A relative path rejects before connection. Prepare its parent directory explicitly. On Windows, absolute ESM imports need file URLs. These checks need no worker launch. Once the actual startup receipt arrives, use its exact watch argument array; only a consumed `attached` record establishes attachment. A failed pre-armed helper leaves a real coverage gap even when the workflow itself continues normally. Preserve that failure before repairing the read-only observer.

The receipt preserves launch, connection start, consumed attachment, exact last processed sequence, terminal status and observed consumer close time. Every connection explicitly records missing continuous preattachment coverage. Terminal already present at attachment is labeled replay. A later terminal is labeled observedAfterAttachment, not proof of uninterrupted host chat delivery. A prior unclosed connection is retained as unknown on reconnect with `closedDetectedAt` naming the later detection time; its actual disconnect time remains unknown and `closedAt` is absent. Reconnect retains a missing gap rather than backfilling continuous coverage.

Receipts retain at most32 connection intervals and65536UTF-8 bytes, with explicit dropped and unclosed counters. They exclude prompts, output payloads, raw reasoning, credentials and cleanup bodies. Durable notifications and original run records remain the authoritative execution evidence. Files are separate from run databases, so recording consumption cannot mutate or retry a workflow. Invalid identity/cursor/corrupt existing files fail without resetting evidence. Each mutation uses an exclusive adjacent lock and atomic same-directory replacement; an orphaned lock requires inspection, never automatic clearing. One named owner writes a receipt. Old retained runtimes without watch remain missing that surface.

Example inside a coordinator's JSONL consumer (after actual handling):

```js
import {resolve} from 'node:path';
const ownedFile = resolve(coordinatorEvidenceDirectory, 'observation.json');
const coverage = await openObserverCoverage(ownedFile, identity, {after: lastProcessed});
for await (const record of parsedWatchRecords) {
  await handleNotice(record);
  await coverage.processed(record);
}
await coverage.finish(terminalSeen ? 'terminal' : 'disconnected');
```

The helper does not launch a process or add a second worker manager. Physical disconnection, consumer crash and native host delivery still have distinct evidence boundaries.
