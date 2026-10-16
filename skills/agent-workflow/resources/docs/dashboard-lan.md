# Dashboard on a trusted LAN

Version 0.6.0 adds explicit LAN binding for new dashboard instances. The default remains `127.0.0.1` with an OS-assigned port (`listen(0, address)`). This is an HTTP bearer-control surface: use a trusted LAN and keep the full authenticated URL private. A holder can use the originating session's available run controls and session navigation, not merely view a picture. Do not publish it, forward the port, or include its fragment token in shared evidence.

## Launch and close

Choose the **exact currently assigned** private IPv4 address on the intended interface, then use:

```text
node "<plugin-root>/bin/launch.mjs" dashboard "<run-id>" --session "<originating-session>" --lan-bind "192.168.1.25"
```

`192.168.1.25` is illustrative: replace it with the verified address of this machine. Keep any explicit `--data-dir` identical to the run's. Omit `--lan-bind` for loopback; optionally add `--current-ui` to explicitly select current presentation for an old run. It still uses that run's verified original runtime for data and controls.

Open the exact returned `url` (or `sessionUrl`) including `#token=...` on the trusted device. The browser removes the fragment and stores the token in tab session storage. Do not reconstruct a port or strip the fragment before first open. Authentication failure is not permission to launch another server automatically. The startup receipt reports `network.selection`, actual `port`, exact `origin`, `serviceInstanceId` and `pid`; inspect it to identify this service.

Use the dashboard's **Close** button when finished. To close this exact instance programmatically from PowerShell using its retained full URL:

```powershell
$dashboardUrl = [Uri] '<exact returned authenticated URL>'
$dashboardToken = [Uri]::UnescapeDataString($dashboardUrl.Fragment.Substring(7))
Invoke-RestMethod -Method Post -Uri ($dashboardUrl.GetLeftPart([UriPartial]::Authority) + '/api/close') -Headers @{Authorization=('Bearer ' + $dashboardToken)} -ContentType 'application/json' -Body '{}'
```

The close request is authenticated `POST /api/close` with an empty JSON object. A nonempty target object rejects. A successful response is `{status:'closed'}`; retain shutdown evidence for the exact service instance. There is no public CLI `close` command. Closing a tab or ending the host conversation does not prove server exit. Close ends the monitor, while Stop controls workflow execution. No default inactivity expiry applies; name the person/coordinator responsible for manual Close.

## Network and owner checks

`--lan-bind` accepts only a canonical numeric RFC1918 address: 10/8, 172.16/12 or 192.168/16, assigned to exactly one noninternal local IPv4 interface. No wildcard, DNS name, public address, loopback-as-LAN, IPv6 or automatic best-interface selection is supported. Case/path source rules do not substitute for network admission. Interface name, MAC and contiguous mask/prefix are captured; network/broadcast addresses for prefixes up to /30 reject. Selection is rechecked in the child and again immediately before listen. Startup also verifies that ready/started receipts agree with selection, exact origin, port, URL path/token and service identity. This is a startup recheck, not continuous interface-change monitoring.

Creating a control-capable dashboard requires the real originating session and validated run/runtime/data ownership. Session navigation stays scoped to that session. Every request must have the exact selected `Host`; an `Origin` header, when present, must exactly match the HTTP origin. Run-data APIs require `Authorization: Bearer <token>`. Static assets contain no run data. There is no wildcard CORS or cross-origin control exception; a reverse proxy or alternate hostname does not bypass these checks. Control POSTs use JSON, exact target/generation/revision where required, and bounded bodies. Inspect a received receipt after a lost reply rather than repeating a mutation.

## Evidence limits

Automated local checks can validate selection/refusal, actual loopback HTTP authentication and routing, detached launch receipts, Close lifecycle and DOM behavior. They do not establish reachability or a painted phone browser on a second device. This delivery does not perform a LAN launch, firewall change, native workflow qualification or second-device acceptance. A coordinator must separately verify the exact candidate's interface/receipt, trusted-device rendering, authenticated controls and shutdown under authorized conditions. Localhost/DOM success must not be relabeled as that evidence.

See [API](api.md#authenticated-session-http-monitor), [declared steps](workflow-steps.md) and [upgrade behavior](../skills/workflow-setup/references/upgrades.md).
