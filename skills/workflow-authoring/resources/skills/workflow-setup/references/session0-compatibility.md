# Windows Session 0 compatibility

This is an explicit launch option for Windows MXC workers started in native Session 0, including the tested Windows OpenSSH context. Default behavior inherits the existing desktop. It is independent of workflow routing mode and worker skill/tool bundles.

## Selection and authorization

If doctor reports a Session 0 command startup failure such as 0xC0000142, explain this option using the measured host context; that status alone does not identify a cause. SSH environment variables are diagnostic hints, not the session authority. Do not enable compatibility automatically or retry uncertain work. Existing owner authorization covers repeated use; do not ask again for an already accepted setting.

Shared desktop compatibility starts workers on WinSta0\Default within Session 0. It preserves configured filesystem and network restrictions. It permits some visibility of other UI objects in that session: controlled tests resolved an owned window's process ID and a global atom, while a tested custom window message was blocked. It does not move the worker onto the user's interactive desktop. These observations are not a comprehensive security assessment or proof of equivalent UI isolation.

Use the explicit option on doctor and every authorized new run:

```text
node "<plugin-root>/bin/launch.mjs" doctor --cwd "<project>" --backend mxc --session0-desktop shared
node "<plugin-root>/bin/launch.mjs" run "<scope:name>" --cwd "<project>" --session "<originating-session>" --backend mxc --session0-desktop shared
```

Keep the same explicit --data-dir where selected. Omission or --session0-desktop inherit preserves the default. There is no global machine preference or Codex configuration edit. Carry the authorized option into new runs in this context; do not silently apply it to other hosts or users. The native host rejects shared mode if its session is nonzero or unavailable, before starting a server. Other backends and platforms reject the option. It never grants desktop ACLs, changes tokens, selects arbitrary desktop names, or falls back to another launch method.

## Evidence and retained runs

A run saves session0Desktop in its launch record. Resume/restart inherit it and reject CLI overrides; changing the selection requires a new run. Old runs remain bound to their original runtime and launch behavior.

Doctor exposes desktopCompatibility.requested and applied. Applied comes from the ownership host after successful process creation, assignment and resume; it is not inferred from the CLI flag. False records rejection before launch; null means application is unverified. Admission stages separately establish buffered, streamed, PTY and cancellation results. Worker cleanup receipts retain the same application evidence. A doctor pass makes zero inference requests and does not establish real workflow execution or all possible child UI behavior.

Preserve failure and cleanup evidence. Access denial, unknown application or unverified job drain is not permission to adjust ACLs, bypass sandboxing, change authentication, or retry uncertain mutations. A normal interactive desktop should use inherit.
