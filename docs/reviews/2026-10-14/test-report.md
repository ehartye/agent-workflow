# Test audit evidence

- Runner: node:test
- Phase: production
- Risk map: present
- Test files: 32

**How to read this.** Findings are evidence, not verdicts: judge each one against the risk map and the test itself.
Files are ranked with unparsed files first, then opaque registration candidates, then by distinct finding rules, total findings and agent tokens.
Agent is the estimated tokens in the file. Churn/edits counts edits that touched the test without the code it covers, over all edits that modified it; n/a means no git history or no resolvable subject.
Wait time and CI minutes need a timed run and are not in this report.
Flags: tautological, snapshot-only, mock-only, no-direct-assertions (possibly assertions in a helper), unparsed.
Recognized declarations are static calls, not native expanded case counts. A count marked +? has opaque helper registration candidates; inspect their provider before treating it as complete.

## Findings by category

| Category | Count |
|---|---|
| redundancy | 11 |
| shim | 6 |
| worktree | 47 |
| wiring | 8 |
| frequency | 1 |

## Project findings (9)

- `LICENSES` **wiring.drift**: Directory matches no risk-map area. Add it with a tier.
- `bin` **wiring.drift**: Directory matches no risk-map area. Add it with a tier.
- `engine` **wiring.drift**: Directory matches no risk-map area. Add it with a tier.
- `foundation` **wiring.drift**: Directory matches no risk-map area. Add it with a tier.
- `hooks` **wiring.drift**: Directory matches no risk-map area. Add it with a tier.
- `reports` **wiring.drift**: Directory matches no risk-map area. Add it with a tier.
- `skills` **wiring.drift**: Directory matches no risk-map area. Add it with a tier.
- `workflows` **wiring.drift**: Directory matches no risk-map area. Add it with a tier.
- `.github/workflows/ci.yml` **frequency.ci-on-pull-request**: A pull_request workflow runs on windows-latest, which bills at a higher rate than Linux, and a path filter does not change that. Keep Windows and macOS off the pull-request path. Evidence: `on: pull_request`.

## Test files (top 32 of 32, most evidence first)

| File | Tier | Lane | Tests | Asserts | Flags | Agent tokens | Churn/edits | Rules |
|---|---|---|---|---|---|---|---|---|
| test/engine-workspaces.test.mjs | critical | merge | 27 | 219 | - | 11229 | 0/3 | worktree.dot-git-dir x3, shim.title-marker, worktree.fixed-db-file |
| test/engine-monitor.test.mjs | critical | merge | 12 | 115 | - | 6086 | 0/1 | worktree.fixed-db-file x3, redundancy.shared-subject, worktree.absolute-path |
| test/managed-runtime.test.mjs | critical | merge | 8 | 84 | - | 4498 | 0/2 | worktree.fixed-db-file x3, shim.title-marker, worktree.shared-tmp |
| test/engine-run-lifecycle.test.mjs | critical | merge | 27 | 117 | - | 7486 | 0/0 | worktree.dot-git-dir x4, worktree.fixed-db-file x3 |
| test/engine-workspace-policy.test.mjs | critical | merge | 3 | 21 | - | 1077 | 0/1 | worktree.absolute-path x2, worktree.dot-git-dir |
| test/engine-notifications.test.mjs | critical | merge | 5 | 50 | - | 2488 | 0/0 | worktree.fixed-db-file x9 |
| test/engine-controller.test.mjs | critical | merge | 36 | 267 | - | 12164 | 0/3 | worktree.fixed-db-file x4 |
| test/engine-monitor-ui.test.mjs | critical | merge | 29 | 282 | - | 12910 | 0/4 | worktree.absolute-path x3 |
| test/codex-turn.test.mjs | critical | merge | 31 | 202 | - | 7213 | 0/2 | shim.title-marker x3 |
| test/engine-recipes.test.mjs | critical | merge | 15 | 127 | - | 5154 | 0/1 | worktree.absolute-path x3 |
| test/managed-entry.test.mjs | critical | merge | 24 | 124 | - | 8054 | 0/4 | worktree.absolute-path x2 |
| test/engine-restart.test.mjs | critical | merge | 7 | 49 | - | 2548 | 0/0 | worktree.fixed-db-file x2 |
| test/engine-worker-capabilities.test.mjs | critical | merge | 17 | 110 | - | 5976 | 0/1 | redundancy.shared-subject |
| test/codex-foundation.test.mjs | critical | merge | 17 | 86 | - | 5202 | 0/4 | redundancy.shared-subject |
| test/engine-background.test.mjs | critical | merge | 8 | 88 | - | 4888 | 0/4 | worktree.fixed-db-file |
| test/engine-parent-capabilities.test.mjs | critical | merge | 10 | 58 | - | 3234 | 1/1 | shim.title-marker |
| test/windows-job.test.mjs | critical | merge | 7 | 60 | - | 3217 | 0/2 | redundancy.shared-subject |
| test/engine-watch.test.mjs | critical | merge | 9 | 51 | - | 2581 | 0/0 | redundancy.shared-subject |
| test/engine-worker-session.test.mjs | critical | merge | 8 | 53 | - | 2004 | 0/2 | redundancy.shared-subject |
| test/engine-registry.test.mjs | critical | merge | 5 | 32 | - | 1570 | 0/0 | worktree.dot-git-dir |
| test/engine-access-policy.test.mjs | critical | merge | 6 | 33 | - | 1476 | 0/0 | redundancy.shared-subject |
| test/engine-settings.test.mjs | critical | merge | 6 | 26 | - | 1318 | 0/1 | redundancy.shared-subject |
| test/engine-writer-retirement.test.mjs | critical | merge | 1 | 7 | - | 880 | 0/0 | redundancy.shared-subject |
| test/host-context.test.mjs | critical | merge | 3 | 17 | - | 802 | 0/0 | redundancy.shared-subject |
| test/codex-terminals.test.mjs | critical | merge | 2 | 6 | - | 355 | 0/0 | redundancy.shared-subject |
| test/engine-backend.test.mjs | critical | merge | 35 | 304 | - | 7745 | 0/2 | - |
| test/engine-activity.test.mjs | critical | merge | 9 | 86 | - | 4114 | 0/1 | - |
| test/engine-schema.test.mjs | critical | merge | 6 | 19 | - | 1146 | 0/0 | - |
| test/check-install.test.mjs | standard | merge | 4 | 19 | - | 879 | 0/0 | - |
| test/engine-evaluator.test.mjs | critical | merge | 6 | 10 | - | 878 | 0/1 | - |
| test/engine-policy.test.mjs | critical | merge | 4 | 16 | - | 832 | 0/1 | - |
| test/engine-mode.test.mjs | standard | merge | 1 | 12 | - | 594 | 0/0 | - |

## Files sharing a subject

- `engine/access-policy.mjs` (unit): `test/engine-access-policy.test.mjs`, `test/engine-settings.test.mjs`
- `engine/controller.mjs` (unit): `test/engine-monitor.test.mjs`, `test/engine-watch.test.mjs`, `test/engine-writer-retirement.test.mjs`
- `engine/worker-session.mjs` (unit): `test/engine-worker-capabilities.test.mjs`, `test/engine-worker-session.test.mjs`
- `foundation/client.mjs` (unit): `test/codex-foundation.test.mjs`, `test/codex-terminals.test.mjs`, `test/engine-worker-session.test.mjs`, `test/windows-job.test.mjs`
- `foundation/native/JobHost.cs` (unit): `test/host-context.test.mjs`, `test/windows-job.test.mjs`

## Per-file findings

### redundancy.shared-subject

This file shares 1 subject with other test files. Check whether they assert the same behavior.

- `test/codex-foundation.test.mjs` `foundation/client.mjs: test/codex-terminals.test.mjs, test/engine-worker-session.test.mjs, test/windows-job.test.mjs`
- `test/codex-terminals.test.mjs` `foundation/client.mjs: test/codex-foundation.test.mjs, test/engine-worker-session.test.mjs, test/windows-job.test.mjs`
- `test/engine-access-policy.test.mjs` `engine/access-policy.mjs: test/engine-settings.test.mjs`
- `test/engine-monitor.test.mjs` `engine/controller.mjs: test/engine-watch.test.mjs, test/engine-writer-retirement.test.mjs`
- `test/engine-settings.test.mjs` `engine/access-policy.mjs: test/engine-access-policy.test.mjs`
- `test/engine-watch.test.mjs` `engine/controller.mjs: test/engine-monitor.test.mjs, test/engine-writer-retirement.test.mjs`
- `test/engine-worker-capabilities.test.mjs` `engine/worker-session.mjs: test/engine-worker-session.test.mjs`
- `test/engine-worker-session.test.mjs` `engine/worker-session.mjs: test/engine-worker-capabilities.test.mjs; foundation/client.mjs: test/codex-foundation.test.mjs, test/codex-terminals.test.mjs, test…`
- `test/engine-writer-retirement.test.mjs` `engine/controller.mjs: test/engine-monitor.test.mjs, test/engine-watch.test.mjs`
- `test/host-context.test.mjs` `foundation/native/JobHost.cs: test/windows-job.test.mjs`
- `test/windows-job.test.mjs` `foundation/client.mjs: test/codex-foundation.test.mjs, test/codex-terminals.test.mjs, test/engine-worker-session.test.mjs; foundation/native/JobHost.cs: test/h…`

### shim.title-marker

Test title names a legacy, compatibility or fallback path. Check that a consumer still needs it.

- `test/codex-turn.test.mjs:77` `` `async ${phase??'legacy'} notices cannot contaminate ${answerPhase??'legacy'} JSON answers` `` (Consumers declared in the risk map: Codex plugin installations, Saved workflows and commands, Persisted runs, Retained prior runtime directories and saved data. Check whether any still needs this path.)
- `test/codex-turn.test.mjs:111` `` `start-only ${phase} metadata cannot become a legacy answer after omission` `` (Consumers declared in the risk map: Codex plugin installations, Saved workflows and commands, Persisted runs, Retained prior runtime directories and saved data. Check whether any still needs this path.)
- `test/codex-turn.test.mjs:126` `legacy ordinary answers deduplicate by item ID and preserve exact text` (Consumers declared in the risk map: Codex plugin installations, Saved workflows and commands, Persisted runs, Retained prior runtime directories and saved data. Check whether any still needs this path.)
- `test/engine-parent-capabilities.test.mjs:138` `active root selection matches native build metadata total ordering and lexical fallback` (Consumers declared in the risk map: Codex plugin installations, Saved workflows and commands, Persisted runs, Retained prior runtime directories and saved data. Check whether any still needs this path.)
- `test/engine-workspaces.test.mjs:235` `workspace preparation freezes policies and refuses legacy or version two policy reinterpretation` (Consumers declared in the risk map: Codex plugin installations, Saved workflows and commands, Persisted runs, Retained prior runtime directories and saved data. Check whether any still needs this path.)
- `test/managed-runtime.test.mjs:25` `managed installation fingerprints fresh sources and preserves prior runtimes and legacy data` (Consumers declared in the risk map: Codex plugin installations, Saved workflows and commands, Persisted runs, Retained prior runtime directories and saved data. Check whether any still needs this path.)

### worktree.absolute-path

Absolute path into one checkout or machine; another worktree resolves elsewhere. Derive paths from the test file or repo root.

- `test/engine-monitor-ui.test.mjs:206` `const workspace = { cwd: 'C:/owned/writer', changedFiles: ['src/<script>.mjs'], patchPath: 'C:/owned/changes.patch', basePatchPath: 'C:/owned/from-base.patch',`
- `test/engine-monitor-ui.test.mjs:245` `view.update({ workers: [worker(0, 'unknown', { workspace: { cwd: 'C:/owned/writer' }, workspaceError: { code: 'WORKSPACE_CAPTURE', message: '<script>capture fai`
- `test/engine-monitor-ui.test.mjs:255` `const workspace={version:2,cwd:'C:/owned/worker',policyHash:'a'.repeat(64),excludedInventory:{entryCount:51,fileCount:50,bytes:900000000}};`
- `test/engine-monitor.test.mjs:97` `assert.equal((await post('/api/runs/replacement/lifecycle',{...value,runDir:'C:/elsewhere'})).status,400);`
- `test/engine-recipes.test.mjs:93` `requisites=[{id:'renderer',command:'render audio.wav',executablePath:'C:/verified/render.exe',cachePath:'C:/verified/render-cache',requiredFor:'verification'}];`
- `test/engine-recipes.test.mjs:95` `renderer',available:false,command:'render audio.wav',executablePath:'C:/verified/render.exe',cachePath:'C:/verified/render-cache',evidence:'Executable absent in`
- `test/engine-recipes.test.mjs:122` `lan.tasks[0].prerequisites=[{id:'source-generator',command:'generate source',executablePath:'C:/verified/generate.exe',cachePath:null,requiredFor:'authoring'}];`
- `test/engine-workspace-policy.test.mjs:25` `['../generated/'],['/generated/'],['C:/generated/'],['generated\\'],['generated'],`
- `test/engine-workspace-policy.test.mjs:27` `['generated /'],['nul/'],['con.txt/'],['a*/'],['a?/'],['a:/'],['a\n/'],`
- `test/managed-entry.test.mjs:132` `race,'native\\n');if(scenario.phase==='native')throw Object.assign(Error(${JSON.stringify(doctorSecret)}),scenario.error);return 'C:/private/native/codex.exe';}`
- `test/managed-entry.test.mjs:279` `eport,{status:'passed',inferenceRequests:0,node:process.version,codex:'C:/private/native/codex.exe',backend:'mxc',hostContext,admission,cleanup:doctorCleanup});`

### worktree.dot-git-dir

In a linked worktree .git is a file, not a directory. Ask git (rev-parse --git-dir) instead of reading .git directly.

- `test/engine-registry.test.mjs:13` `(root,'home'),bundledDir=join(root,'bundled');for(const dir of [join(project,'.git'),cwd,homeDir,bundledDir])await mkdir(dir,{recursive:true});return{root,proje`
- `test/engine-run-lifecycle.test.mjs:42` `const {root,runDir}=f,source=join(root,'source'),common=join(source,'.git'),parent=join(root,'source-worktrees'),cwd=join(parent,'workflow-fixture'),artifactsDi`
- `test/engine-run-lifecycle.test.mjs:45` ``await writeFile(join(cwd,'.git'),`gitdir: ${registration}\n`);await writeFile(join(registration,'gitdir'),join(cwd,'.git')+'\n');await writeFile(join(registrati``
- `test/engine-run-lifecycle.test.mjs:52` `utIndexHash:input.inputIndexHash,gitPointerHash:hash(await readFile(join(cwd,'.git'))),patchPath,patchHash:hash('patch'),basePatchPath,basePatchHash:hash('base`
- `test/engine-run-lifecycle.test.mjs:171` `assert.deepEqual(await readdir(ws.cwd),['.git']);assert.ok(await readFile(ws.manifestPath));assert.ok(await readFile(ws.inputIndex));assert.ok(await readFile(jo`
- `test/engine-workspace-policy.test.mjs:26` `['generated//'],['generated/./'],['.git/'],['x/.GiT/'],['git~1/'],['generated./'],`
- `test/engine-workspaces.test.mjs:43` `const before=await git(source,'status','--porcelain=v1');const index=await readFile(join(source,'.git','index'));`
- `test/engine-workspaces.test.mjs:57` `assert.deepEqual(await readFile(join(source,'.git','index')),index);assert.equal(await git(source,'status','--porcelain=v1'),before);`
- `test/engine-workspaces.test.mjs:137` `await writeFile(join(source,'.git','info','exclude'),'private.txt\n');await writeFile(join(source,'private.txt'),'private ignored');await writeFile(join(source,`

### worktree.fixed-db-file

Fixed database file name: concurrent worktrees share or clobber it unless the path is unique per run.

- `test/engine-background.test.mjs:40` `const {DatabaseSync}=await import('node:sqlite'),db=new DatabaseSync(join(runDir,'run.sqlite'));`
- `test/engine-controller.test.mjs:59` `const db=new DatabaseSync(join(input.runDir,'run.sqlite'));`
- `test/engine-controller.test.mjs:219` `const db=new DatabaseSync(join(runDir,'run.sqlite'));`
- `test/engine-controller.test.mjs:469` `const db = new DatabaseSync(join(runDir,'run.sqlite')); db.exec(mutation); db.close();`
- `test/engine-controller.test.mjs:594` `const db=new DatabaseSync(join(runDir,'run.sqlite'));db.exec('BEGIN IMMEDIATE');`
- `test/engine-monitor.test.mjs:66` `const db=new DatabaseSync(join(runDir,'run.sqlite'));db.prepare('DELETE FROM header').run();db.close();`
- `test/engine-monitor.test.mjs:129` `const db=new DatabaseSync(join(runDir,'run.sqlite'));`
- `test/engine-monitor.test.mjs:205` `const db=new DatabaseSync(join(runDir,'run.sqlite'));`
- `test/engine-notifications.test.mjs:74` `const db=new DatabaseSync(join(input.runDir,'run.sqlite')),row=db.prepare("SELECT * FROM notifications WHERE kind='worker-terminal' AND position=0").get();`
- `test/engine-notifications.test.mjs:77` `finally{const restore=new DatabaseSync(join(input.runDir,'run.sqlite'));try{restore.prepare('INSERT INTO notifications(seq,generation,kind,position,attempt,stat`
- `test/engine-notifications.test.mjs:85` `input.onReady=()=>{const db=new DatabaseSync(join(input.runDir,'run.sqlite'));try{db.exec("CREATE TRIGGER reject_final BEFORE INSERT ON notifications WHEN NEW.k`
- `test/engine-notifications.test.mjs:92` `const db=new DatabaseSync(join(input.runDir,'run.sqlite'));`
- `test/engine-notifications.test.mjs:100` `await mkdir(input.runDir);let db=new DatabaseSync(join(input.runDir,'run.sqlite'));db.exec('CREATE TABLE header(id INTEGER PRIMARY KEY,value TEXT);');db.prepare`
- `test/engine-notifications.test.mjs:103` `db=new DatabaseSync(join(input.runDir,'run.sqlite'));const header=db.prepare('SELECT value FROM header WHERE id=1').get().value;`
- `test/engine-notifications.test.mjs:106` `db=new DatabaseSync(join(input.runDir,'run.sqlite'));db.prepare('UPDATE header SET value=?').run(header);db.close();`
- `test/engine-notifications.test.mjs:107` `db=new DatabaseSync(join(input.runDir,'run.sqlite'));db.prepare("DELETE FROM notifications WHERE kind='run-terminal'").run();db.close();`
- `test/engine-notifications.test.mjs:109` `db=new DatabaseSync(join(input.runDir,'run.sqlite'));db.prepare('UPDATE header SET value=?').run('{broken');db.close();`
- `test/engine-restart.test.mjs:37` `const db=new DatabaseSync(join(input.runDir,'run.sqlite'),{readOnly:true});`
- `test/engine-restart.test.mjs:50` `const db=new DatabaseSync(join(input.runDir,'run.sqlite'));try{const row=JSON.parse(db.prepare('SELECT value FROM workers WHERE generation=1 AND position=2').ge`
- `test/engine-run-lifecycle.test.mjs:32` `const db=new DatabaseSync(join(runDir,'run.sqlite'));`
- `test/engine-run-lifecycle.test.mjs:39` `function edit(runDir,callback){const db=new DatabaseSync(join(runDir,'run.sqlite'));try{callback(db);}finally{db.close();}}`
- `test/engine-run-lifecycle.test.mjs:40` `function raw(runDir){const db=new DatabaseSync(join(runDir,'run.sqlite'),{readOnly:true});try{return{header:db.prepare('SELECT value FROM header').all(),workers`
- `test/engine-workspaces.test.mjs:369` `const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(join(runDir,'run.sqlite'));`
- `test/managed-runtime.test.mjs:79` `const db=new DatabaseSync(join(owner.runDir,'run.sqlite'));db.exec('CREATE TABLE header(id INTEGER PRIMARY KEY,value TEXT); CREATE TABLE workers(generation INTE`
- `test/managed-runtime.test.mjs:145` `await writeFile(join(failed.runDir,'run.sqlite'),'invalid database bytes');`
- `test/managed-runtime.test.mjs:147` `assert.equal(await readFile(join(failed.runDir,'run.sqlite'),'utf8'),'invalid database bytes');`

### worktree.shared-tmp

Fixed temp path shared by every worktree and every parallel run. Use mkdtemp for a unique directory.

- `test/managed-runtime.test.mjs:58` `const base=join(tmpdir(),'workflow-default-data');assert.equal(defaultDataDir({LOCALAPPDATA:base,PLUGIN_DATA:join(base,'host-only')}),defaultDataDir({LOCALAPPDA`
