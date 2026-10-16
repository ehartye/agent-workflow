# Dashboard access through an authorized SSH tunnel

The dashboard listens on **127.0.0.1 and an OS-assigned ephemeral port** on the
machine running Workflow. An owner-authorized SSH local forward can carry that
same loopback origin to a second client. The dashboard has no public/LAN bind
option. It requires its exact Host and, when present, exact Origin, plus the
bearer token obtained from the original URL fragment. No firewall edit is needed
for the dashboard port in this model.

This is supported connection guidance, not a new second-client acceptance
receipt. No remote login or browser operation was performed for this document.

## Obtain and preserve the binding

On the Workflow host, use the public installed launcher and the actual run’s
originating session and data directory:

```powershell
& $node $launch dashboard $runId --session $originatingSession --data-dir $dataDir
```

All variables must come from the authenticated run/installation records. Use
the same explicit data-dir on related commands. The public launcher selects the
saved run’s recorded runtime. An owner may deliberately choose `--current-ui`
for a newer presentation; reads and controls still use each run’s original
verified runtime. Neither choice migrates execution or installs a runtime.

Retain the returned private `url`, `pid` and optional `sessionUrl`. A dashboard
receipt does not contain a trusted SSH hostname: the owner must supply that host,
account and SSH client identity separately. Authenticated `GET /api/health`
returns serviceInstanceId and service readiness. Separately read the authenticated
run response (`GET /api/run` for the pinned run) and verify its requested run,
recorded runtime and data-instance binding. Health remains available when a run
read fails, so a health response cannot supply that run binding. Keep an unavailable
run identity unknown and pause checks that depend on it; follow
[browser ownership](browser-ownership.md). Keep the full
URL/fragment secret in private control storage. Public notes contain the origin,
service identity and a receipt reference, without a token.

## Forward the exact origin

On the second client, use an already authorized SSH endpoint and client. This
PowerShell command shape is illustrative; it does not fabricate a reachable
host or authorize a login:

```powershell
# $dashboardUrl is the exact private URL from the host's dashboard receipt.
# $sshClient is the approved SSH executable; $sshTarget is the owner-approved
# account@host (or explicitly configured SSH alias), obtained separately.
$dashboardUri = [uri]$dashboardUrl
if ($dashboardUri.Scheme -ne 'http' -or $dashboardUri.Host -ne '127.0.0.1') {
  throw 'Inspect the original dashboard binding before forwarding.'
}
$port = $dashboardUri.Port
$forward = '127.0.0.1:{0}:127.0.0.1:{0}' -f $port
& $sshClient -N -T -o ExitOnForwardFailure=yes -L $forward $sshTarget
```

Keep that owned foreground tunnel alive. Open the **original** fragment URL in
the designated client browser tab, with its original path and port. For example,
the `/runs/ID` path must survive forwarding. The browser removes the fragment
after taking its token into tab session storage; do not reinsert tokens into
query parameters or request logs.

The local and remote ports must match. A different client port changes Host and
Origin and will be rejected by the existing server. `localhost`, a LAN IP,
rewritten proxy origin and an arbitrary hostname also differ from 127.0.0.1.
If the exact port is occupied on the client, stop this connection attempt and
report the conflict. A deliberate new dashboard instance can be created by its
owner after reconciliation, producing a new port/token/service identity; do not
silently replace the target or disable Host/Origin validation. Closing a client
tunnel is not dashboard shutdown.

Do not bind the local forward on 0.0.0.0, add SSH remote forwarding, change server
bind addresses, expose token-bearing URLs on a LAN, adjust firewall rules or
weaken authentication as part of these instructions. Any deployment beyond this
existing loopback/tunnel model needs a separate assignment and acceptance.

## Session 0 is a separate execution choice

[Verification](verification.md#windows-session-0-compatibility) records elevated
OpenSSH Session 0 doctor, real managed-subscription workflow, detached writer,
reconnect/replay and owned-job cleanup on the named Windows build/account.
Those observations establish that tested host scope; they do not establish an
arbitrary SSH account, non-admin token, second-client dashboard, phone or Linux/
macOS acceptance.

`--session0-desktop shared` is explicit opt-in for Windows MXC doctor/new runs in
native Session 0. Default `inherit` preserves existing behavior. The flag changes
no token, ACL, firewall or configured filesystem/network policy and does not
move work onto the user’s interactive desktop. The ownership host’s requested/
applied evidence after actual process creation is separate from a requested
option and from a successful command. Null application remains unverified.
Saved runs retain their original selection; resume/restart do not change it.
Use the [existing setup reference](../skills/workflow-setup/references/session0-compatibility.md)
for its measured shared-UI visibility caveat. Tunnel creation is not permission
to enable this option, repair machine configuration or retry uncertain work.

## Controls, shutdown and missing evidence

Changing a view is a read. Deliberately selecting a current run controls only
the fresh matching identity exposed by that retained runtime; a stale target or
revision conflict requires inspection. An unknown control response is preserved,
not automatically posted again. Capability absence remains unsupported.

**Close** shuts down the owned dashboard instance. **Stop** changes workflow
execution. Closing a tab or dropping SSH does neither by itself. Keep one named
browser owner, explicitly hand off the tab/context and record authenticated Close
and independent shutdown observations before release of ownership. Never close
another instance because its port looks familiar.

The existing [monitor tests](../test/engine-monitor.test.mjs) own loopback HTTP
authentication, hostile Host/Origin rejection and monitor shutdown behavior.
The [UI tests](../test/engine-monitor-ui.test.mjs) own DOM behavior; neither proves
second-client painting. A fresh owner-authorized remote pass must retain the
actual SSH/client/host identities, exact original origin, authenticated same
serviceInstanceId, run/runtime/data-dir binding, browser and served-asset hashes,
desktop/390px light/dark/keyboard observations and owned shutdown evidence. That
acceptance remains unperformed here.
