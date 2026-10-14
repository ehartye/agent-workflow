# Parent execution access for workflow workers

Status: authorized design and local policy resolver; backend, CLI, persistence and integration wiring remain separate delivery work. This document does not claim a published default change.

## Owner intent and evidence

The owner explicitly requested clean access to plugins, skills, scripts, CLIs and applications, preferring the parent session's access when per-tool grants create friction. New workflows therefore default to parent execution access; restricted execution remains an explicit choice. This is authorization for the originating parent's actual permissions, not a universal full-access assumption.

The current originating Codex context declares unrestricted filesystem access, enabled network access and approval policy `never`. A fresh command-only diagnostic using `dangerFullAccess` passed both Agent Meshes 0.15.0 setup and Blender 5.2.2 `--version`, with zero model requests and positive owned-job/server cleanup. Private evidence is `.local/planetforge-roadmap-20261014/modeling-parent-access-diagnostic.json`. It establishes those commands only: no export, rig, preview, asset quality or arbitrary descendant verification.

The earlier read-only Blender attempt remains failed with exit `0xC0000022`, empty stdout/stderr and positive owned-job/server cleanup. Its specific denied operation remains unknown. No separate application grant was identified. The new policy follows explicit owner intent; it does not reinterpret that failure or establish an ACL, code-integrity or DLL root cause.

## Policy admission

`resolveAccess({access, sessionId, parentAccess})` defaults an omitted `access` to `parent`. It accepts only `parent` and `restricted`. The session must be a nonempty string of at most 256 characters without ASCII control characters. Inputs must be plain records with known enumerable data fields; arrays, unknown keys, accessors, proxies and custom prototypes are rejected without invoking them.

The supported parent snapshot is exactly:

```json
{
  "version": 1,
  "sessionId": "<actual originating session>",
  "provenance": "codex-session-context",
  "filesystem": "unrestricted",
  "networkAccess": true,
  "approvalPolicy": "never"
}
```

The snapshot session must exactly match the admitted run session. Missing snapshots fail with `PARENT_ACCESS_REQUIRED`; unsupported, incomplete or mismatched snapshots fail with `PARENT_ACCESS_INVALID`. Invalid mode, envelope or session fails with `ACCESS_POLICY`. Unsupported parent profiles are not widened or silently converted. Only approval policy `never` is representable by this initial resolver.

`restricted` requires no parent snapshot and resolves to the existing read-only, network-disabled, approval-never profile. A nonnull parent snapshot supplied with restricted mode is rejected as ambiguous input. Workspace-write narrowing and ceilings remain integration work; this resolver does not add a new writable restricted mode.

The coordinator must obtain the snapshot from the actual host context and bind it to launch admission. A provenance string is not cryptographic authentication. Neither a fresh child App Server's `config/read` nor the user's general configuration establishes the originating host's effective policy. The resolver validates supplied context; it cannot independently discover or authenticate the host.

## Return value and native mapping

The resolver returns a detached, deeply frozen envelope:

```text
{policy: {version, access, sessionId, parentAccess, permissions},
 fingerprint, native: {launchArgs, thread, turn, command}}
```

`permissions` contains `sandbox`, `networkAccess` and `approvalPolicy`. `parentAccess` is the normalized six-field snapshot for parent mode, or null for restricted mode. `fingerprint` is SHA-256 over the fixed-order normalized policy, including session and provenance. Caller property ordering does not affect it; caller mutation cannot change the retained value.

| Boundary | Parent mode | Restricted mode |
|---|---|---|
| App Server launch arguments | `-c sandbox_mode="danger-full-access" -c approval_policy="never"` | `-c sandbox_mode="read-only" -c approval_policy="never"` |
| `thread/start` | `sandbox:"danger-full-access"`, `approvalPolicy:"never"` | `sandbox:"read-only"`, `approvalPolicy:"never"` |
| `turn/start` | `sandboxPolicy:{type:"dangerFullAccess"}`, `approvalPolicy:"never"` | `sandboxPolicy:{type:"readOnly",networkAccess:false}`, `approvalPolicy:"never"` |
| Readiness `command/exec` | `sandboxPolicy:{type:"dangerFullAccess"}` | `sandboxPolicy:{type:"readOnly",networkAccess:false}` |

Backend integration must use one admitted policy consistently across readiness and task execution, verify the returned thread policy, and preserve the snapshot/fingerprint in run identity. Experimental `activePermissionProfile`, where returned, supplies additional native provenance; it does not replace the parent-context snapshot. The resolver performs no launch, filesystem write, environment mutation or model request.

## Persistence and workspace ownership

Persist the resolved policy and fingerprint at admission. Resume/replay must compare retained authority and session without resolving an absent historical field through today's default. Existing runs retain their original runtime and restricted semantics. A policy change is a fresh admitted run, not an automatic retry of an unknown writer.

Parent-access workers retain independent worktrees for ownership and review, captured-input and output integrity checks, literal task ownership and coordinator integration gates. Under unrestricted filesystem permissions, these worktrees are organizational boundaries, not filesystem security isolation. Parent mode must not claim that workers cannot read or write source, siblings or unrelated host paths.

Signed owned-job process management, CPU/memory bounds for the separate QuickJS evaluator, cleanup barriers and no uncertain-effect retry remain. Owned-job evidence covers `windows-job-members`; arbitrary external processes, applications or effects do not become verified by changing permissions.

## Native integrations are a separate contract

Execution access does not manufacture a parent's tool catalog. Genuine native skill discovery and activation remain necessary. Installed plugin resources, native App Server integrations, managed tool readiness, and actual invocation evidence must stay distinct. Parent-host connectors, browser sessions and credentials may have no equivalent transport in an independently launched App Server. Missing capabilities must be reported, not replaced by copied skill prose or claimed as inherited.

The current blanket disabling of plugins/apps/MCP/browser tools requires a separately reviewed parent-mode integration policy. Preserve originating context and available native configuration without changing global configuration. In pinned Codex 0.162.1, `disabledPluginIds` is documented as not yet filtering plugin capabilities; it is not an isolation mechanism. This module neither enables nor disables integrations and does not prescribe a custom MCP server.

## Verification and source references

As built on 2026-10-14: parent launch/thread/turn/readiness wiring, CLI context admission, saved policy identity and separate catalog replay guards are implemented locally. The combined candidate passes 482 tests, package/smoke/clean-install checks and installed zero-inference doctor. A fresh native worker observed all eight selected initial main-resource reads with positive source checks and owned cleanup. Host-only connections, full pagination, model artifacts and game objectives remain separate acceptance. These are unpublished candidate facts; the earlier design boundaries below retain their original context.

The resolver's invariant-owner tests cover missing/foreign/unsupported authority, exact native mappings, explicit restricted behavior, accessor/proxy rejection, immutable snapshots and stable session-bound fingerprints. Backend integration still requires tests of saved identity, old-run replay, readiness/task consistency and native admission; pure resolver tests do not prove those behaviors.

Pinned official sources reviewed:

- [Codex thread protocol](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/app-server-protocol/src/protocol/v2/thread.rs): thread settings and experimental active permission provenance.
- [Codex turn protocol](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/app-server-protocol/schema/typescript/v2/TurnStartParams.ts): per-turn sandbox and approval settings.
- [Codex command execution](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/app-server-protocol/src/protocol/v2/command_exec.rs): standalone native command policy; experimental permission profiles are mutually exclusive with sandbox policy.
- [Codex permission conversion](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/protocol/src/permissions.rs): read-only root reads and unrestricted filesystem representation.
- [Codex MXC policy](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/mxc-sandbox/src/policy.rs): native read/write mappings and disabled DACL mutation.
- [Thread response contract](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/app-server-protocol/schema/typescript/v2/ThreadStartResponse.ts): disabled-plugin-ID limitation.

Wiki research used current hybrid results, including `wiki/authored/agent-workflow/backlog/meshes-environment-overrides.md`, `wiki/sources/codex-mxc-ui-policy.md` and `wiki/sources/codex-0-162-1-mxc-process-lifecycle.md`. Those earlier restricted-mode observations remain scoped evidence, not a claim that this new default has shipped.
