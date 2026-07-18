# Local Codex supervisor

Vanta City uses one local `launchd` service to coordinate continuous development. The service calls the documented non-interactive `codex exec` interface; it does not depend on the Codex Desktop saved-project or private thread-control catalogs that previously returned empty or unavailable responses.

Official references:

- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Codex scheduled tasks](https://learn.chatgpt.com/docs/automations)
- [Codex worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
- [Codex multi-agent guidance](https://learn.chatgpt.com/docs/agent-configuration/subagents)

## Ownership model

The local service is deliberately split into model judgment and deterministic control:

1. At or after minute `05`, an ephemeral `gpt-5.6-sol` xhigh planner reads the dependency-ready roadmap and selects at most four independent tasks.
2. The supervisor validates task IDs, dependencies, duplicate keys, branches, worktree paths, matching commits, and available capacity before creating Git state.
3. Up to four `gpt-5.6-sol` medium workers edit isolated APFS-cloned worktrees. Nested multi-agent delegation is disabled. Workers cannot stage, commit, merge, or push.
4. The supervisor rejects protected control-plane paths, secrets, symlinks, oversize files, dependency changes, empty diffs, or changed Git history. It creates the focused worker commit only after a valid structured completion.
5. At or after minute `50`, an ephemeral xhigh reviewer classifies completed workers read-only. Approved commits are cherry-picked by the supervisor into a dedicated integration worktree.
6. An xhigh integration pass resolves conceptual overlap and updates roadmap state without touching Git metadata. The supervisor independently reruns formatting, linting, type-checking, unit tests, relevant asset validators, production build, bundle-size reporting, task-mapped browser checks, and smoke coverage.
7. Only after all checks pass does the supervisor commit integration corrections, verify that clean `main` has not moved, fast-forward it, push the exact expected SHA, fetch to confirm the remote SHA, and record the result.
8. At or after minute `58`, deterministic cleanup removes only exact-ledger, clean, inactive worktrees whose worker and integration commits are verified on `origin/main`. Worker and integration branches remain recoverable.

The four-worker limit is hard. The maximum total concurrent Codex process count is five: four medium workers plus one xhigh planner or integrator. A single lease serializes planning, integration, and cleanup, so a long run cannot overlap another control-plane mutation.

## Native Codex schedules

The local service replaces these Desktop schedules:

- `vanta-city-hourly-orchestrator`
- `vanta-city-hourly-integrator`
- `vanta-city-hourly-worktree-cleaner`

They must be paused before installing the LaunchAgent. The installer fails closed while any is still active.

Old Desktop results can remain visible as pending-review inbox items after their schedules are paused. They are immutable historical reports, not live worker state. Their statements describe the repository at the report timestamp and must not be combined with current LaunchAgent status. `pnpm automation:doctor` is authoritative for schedule ownership; `pnpm automation:status` is authoritative for current workers, worktrees, `main`, and roadmap state.

These Desktop schedules remain native and active:

- `vanta-city-playtest-recorder`
- `vanta-city-nightly-release-gate`

The recorder remains a policy-driven no-op until `QA-PLAYBOT-001` ships `playtest:bot`. The nightly gate remains a policy-driven no-op until `TEST-001` is completed and `origin/main` has changed since its last successful gate.

## State and disk use

Runtime state is shared by all Git worktrees under:

`/Users/jschuler/Projects/vanta-city/.git/vanta-orchestration/`

It contains the atomic task ledger, exclusive lock, hourly-attempt ledger, bounded Codex JSONL and validation logs, LaunchAgent output, and a private pinned pnpm tool install. It is never committed. The cleaner retains the newest 40 run directories.

Each worker receives an APFS clone of main's `node_modules`. This avoids the correctness risk of a writable shared symlink while sharing unchanged physical disk blocks. Workers may not run dependency installation. Completed worktrees are removed after verified integration; dirty, failed, blocked, interrupted, and ambiguous worktrees are preserved and count against capacity.

## Commands

```sh
pnpm automation:doctor
pnpm automation:dry-run
pnpm automation:status
pnpm automation:install
pnpm automation:uninstall
```

Manual one-shot operations use the same locks and safety checks:

```sh
pnpm automation:orchestrate
pnpm automation:integrate
pnpm automation:clean
```

`automation:dry-run` does not invoke Codex or mutate Git. `automation:status` reports active/blocked tasks, worktrees, disk allocation, candidates, and recent runs.

Cleaner reports always identify `controlPlane.authoritative: launchd-codex-exec`, distinguish live worker processes from occupied or historical tasks, and exclude Desktop pending-review counts. Cleanup first requires a clean synchronized `main`. It runs `git worktree prune` only when the preceding dry-run finds stale metadata; a no-op dry-run correctly produces `prune.ran: false` with an explicit reason.

## Adding and discovering work

User requests remain the highest-priority input. Add durable work to `coordination/game-orchestrator.json` with a stable ID, source, priority, duplicate key, owner, dependencies, bounded acceptance criteria, production-asset policy, validation, screenshots, and performance requirements.

The xhigh planner may select only tasks whose roadmap status is `ready` and whose dependencies are `completed`. When the dependency-ready queue falls below the configured threshold, the existing continuous-discovery policy calls for a bounded medium backlog-curation worker using explicit user direction and retained `reports/playbot/` evidence. The planner itself never edits the roadmap.

## Failure recovery

- A failed 20-second direct-exec preflight creates no supervisor lock, branch, or worktree. The next hourly slot may try again.
- Malformed or live lock ownership fails closed. Dead locks are reaped only after the configured stale interval with an ownership token.
- Worker failures preserve their worktree and count against capacity; they are never silently retried on top of ambiguous changes.
- Integration failures preserve the dedicated integration worktree and record `integration-blocked` state. Resolve it explicitly before resuming automation.
- After local main fast-forward, the ledger records the exact pending push SHA and expected remote base. Recovery pushes only that SHA, only if the remote has not moved, and verifies `origin/main` afterward.
- Cleaner never force-removes, deletes branches, or deletes unregistered directories.

Use `pnpm automation:status` first when the daemon stops progressing. LaunchAgent diagnostics are available through `launchctl print gui/$(id -u)/com.vantacity.codex-supervisor` and the bounded logs in the runtime-state directory.
