# Upgrade an installed runtime

Use the exact host data directory obtained from setup-info or host diagnostics. Inspect `<dataDir>/runtime.json` and `<dataDir>/service.json` before executing setup. Missing files mean there is no recorded selected runtime or supervisor; do not start a supervisor merely to shut it down.

For an existing instance, read `runtime.json.path` as the retained old runtime directory. Verify that it is a direct child of `<dataDir>/runtime`, has no symlink/junction traversal, and contains the installed CLI. Reject malformed or escaping paths. The changed package's `launch.mjs` refuses launch before dispatch, including `shutdown`; call the retained runtime's CLI directly instead:

```text
node "<retained-old-runtime>/bin/agent-workflow.mjs" doctor --data-dir "<exact-host-dataDir>"
node "<retained-old-runtime>/bin/agent-workflow.mjs" list --data-dir "<exact-host-dataDir>"
node "<retained-old-runtime>/bin/agent-workflow.mjs" shutdown --data-dir "<exact-host-dataDir>"
```

`doctor` reads without starting a supervisor. Only use `list`/`shutdown` after doctor confirms a healthy existing service. Let active work finish, or use stop/drain controls when already authorized; do not silently interrupt another workflow to install an update. A shutdown response acknowledges the request, not completed drain. Wait for successful supervisor exit and removal of its service record; a failed drain blocks replacement and remains evidence to review.

Now execute setup and doctor from the updated package using that same explicit data directory. Inspect their results, reconnect MCP, and read `workflow_list` before claiming the new tools are connected. Keep retained runtime directories: a paused run requires its matching runtime identity and may need its old CLI to resume. Installing an update does not migrate paused script semantics, reconcile effects or trust hooks.

For PowerShell, use the call operator when the executable is a quoted path:

```powershell
& '<node-executable>' '<plugin-root>/bin/setup.mjs' '--data-dir' '<exact-host-dataDir>'
```

The returned `setupCommand`/`verifyCommand` argument arrays are data, not shell-escaped command text. Do not pass JSON string escaping such as `\"` through to the shell.
