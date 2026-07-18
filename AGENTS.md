# Vanta City Agent Operating Rules

These rules apply to the entire repository.

## Default delegation

- Act as the integration lead for substantial implementation, debugging, visual, integration, or test-performance work.
- Automatically delegate concrete, bounded work to sub-agents when the request has multiple independent workstreams or would benefit materially from a specialist review. The user does not need to ask for delegation explicitly.
- Prefer reusing a relevant idle worker context before starting a new worker. Do not steer a worker that is still active on another task.
- Use the smallest useful team. One coherent task normally gets one worker; use parallel workers only for genuinely independent ownership boundaries.
- Keep small edits, simple answers, read-only inspections, and tightly coupled one-file fixes in the primary session unless the user explicitly requests workers.
- The primary agent remains responsible for architecture decisions, overlap review, integration, validation, and the final report. Do not outsource integration judgment blindly.

## Worktree isolation

- Before delegating repository changes, inspect `git status`, `git worktree list`, active worker status, and relevant branches.
- Give each concurrent filesystem-editing worker a dedicated clean Git worktree and branch created from the current intended integration base.
- Use paths under `/Users/jschuler/Projects/vanta-city-worktrees/` and focused branch names such as `worker/<task-name>`.
- Tell every worker its exact worktree, branch, base commit, scope, validation requirements, and prohibition on editing or pushing `main`.
- Never edit a worktree owned by an active worker. Never remove a dirty or active worktree.
- Workers should make focused commits and report commit hashes, checks, decisions, screenshots when visual behavior changes, and remaining limitations.

## Session and disk tracking

- After creating, integrating, or cleaning workers, report the number of active Codex workers, registered Git worktrees, and which worktrees remain active.
- Periodically measure physical worktree usage with `du -sh`, calling out `node_modules`, generated reports, build output, and local asset downloads separately. Codex thread history is not the main repository disk cost; duplicated worktree dependencies usually are.
- Warn when more than six worktrees are registered (main plus five workers), total Vanta City worktree usage exceeds roughly 2 GiB, or a completed inactive worktree exceeds roughly 500 MiB.
- Recommend cleanup after a worker is integrated, but never remove an active or dirty worktree. Preserve its branch unless the user explicitly requests branch deletion.
- Keep resource reports concise: active/idle session counts, total worktree count, total measured size, the largest consumers, and safe cleanup candidates.

## Review and integration

- Do not merge a worker merely because it compiled independently. Review its history, changed files, public APIs, tests, and overlap with current `main` first.
- Prefer one authoritative concept over adapters between duplicate unshipped abstractions. Resolve terminology, lifecycle, input, transform, camera, collision, asset, HUD, and debug ownership deliberately.
- Integrate only completed, committed, clean worker results. Preserve unfinished work in its worktree.
- After integration, run validation proportional to risk. For gameplay or shared-system changes, run formatting, lint, type-checking, unit tests, character/asset validation, production build and size reporting, plus the full browser suite.
- For visual changes, inspect the live browser, console, and before/after screenshots rather than relying only on state assertions.
- Commit integration corrections separately when they express a distinct conflict-resolution decision.
- Push only when the user explicitly asks to push. Do not delete branches during routine worktree cleanup.

## Scheduled orchestration

- Treat `coordination/game-orchestrator.json` as the authoritative roadmap, performance budget, asset policy, and scheduled-worker contract.
- The hourly orchestrator may create or reuse bounded worker tasks using the model and effort declared in that file. It must not implement features or edit `main` itself.
- Because the saved Codex project root is `/Users/jschuler/Projects`, every scheduled prompt and worker handoff must explicitly change into `/Users/jschuler/Projects/vanta-city` or the assigned Vanta worktree and verify the Git root, branch, HEAD, and status before reading or editing.
- The hourly integrator may review, merge, commit, update roadmap execution state, and push `main` because the user explicitly authorized that recurring workflow.
- Stagger orchestration and integration runs. Never duplicate a roadmap task that already has an active task, worktree, branch, commit, or completed entry.
- Maintain four active workers when four independent dependency-ready tasks exist; use a fifth only when its ownership does not overlap. Never exceed five active workers.
- The hourly cleaner runs after integration and may remove only clean, inactive, integrated registered worktrees under the Vanta worktree root. Preserve branches and report, rather than delete, unregistered orphan directories.
- Hourly integration skips the complete E2E suite. Run changed-feature browser tests and smoke coverage; reserve full E2E for explicit release milestones or a separately approved scheduled gate.
- A map-expansion milestone grows measured playable area by 20–30% (target 25%). Unrelated feature iterations must not inflate the map merely to satisfy the percentage.
- Treat 900 MB as a tested hard memory ceiling, not a utilization goal. Performance, disposal, and leak checks block integration when budgets regress.
- New gameplay acceptance must use production-intended, locally stored assets with verified provenance. Synthetic placeholders remain limited to explicit failure-path tests.
- Development-time OpenAI image and ElevenLabs audio generation is authorized only within the provider/request limits in `coordination/game-orchestrator.json`. Read credentials from the ignored `.env`, never print or stage them, use official provider endpoints, keep accepted assets local with provenance, and never expose secrets to browser runtime.
- Provider workers in Git worktrees must read approved values from `/Users/jschuler/Projects/vanta-city/.env` by absolute path because ignored files are not copied to worktrees. Never copy the file or values into a worktree or task prompt.
- Radio-host TTS remains blocked until `ELEVENLABS_RADIOGUY_VOICE_ID` is accessible to the configured account. ElevenLabs theme generation and audio-pipeline implementation may proceed; character dialogue voice-over remains prohibited.

## Continuous task discovery

- User requests are the highest-priority source of new game tasks. Add them as bounded roadmap entries with acceptance criteria rather than leaving important direction only in task history.
- The local playtest recorder runs against clean `origin/main` and may write only ignored artifacts under `reports/playbot/`. It may capture video, screenshots, traces, public debug snapshots, browser errors, FPS, frame time, memory, state transitions, action seeds, and reproduction commands; it must not edit source, call paid APIs, read secrets, create worktrees, merge, commit, or push.
- Recorded exploration supplements deterministic tests. A bot run is evidence, not proof that a feature is correct, and it never replaces unit, targeted browser, visual, smoke, or release-level validation.
- Keep playtest artifacts bounded by `coordination/game-orchestrator.json`. Artifact pruning may delete only generated content below `reports/playbot/`; worktree cleanup and playtest artifact retention are separate responsibilities.
- When the dependency-safe ready queue falls below its configured threshold, or a critical reproducible defect appears, the xhigh orchestrator selects at most the configured number of proposals and dispatches a `gpt-5.6-sol` medium backlog-curation worker in a dedicated worktree. The orchestrator does not edit `main`.
- Backlog-curation workers must attach evidence and reproduction steps, check task IDs and duplicate keys against the roadmap, active tasks, worktrees, branches, commits, and recent integration history, and prefer extending an existing authoritative task over creating a parallel abstraction.
- The hourly integrator reviews roadmap additions like code: reject vague, duplicate, unbounded, unsupported, or product-divergent tasks. Autonomous discovery cannot authorize spending, credentials work, licensing exceptions, mature content, vision changes, or new external commitments; those require user direction.

## Efficient validation

- Match validation scope to the change while iterating. Run affected unit tests, targeted lint/format checks, and the relevant browser feature suite instead of repeatedly running every check after each small edit.
- Use three validation tiers:
  - Quick: affected unit tests plus targeted formatting/linting and type-checking when public TypeScript contracts changed.
  - Smoke: the complete unit suite plus the smallest critical browser path covering picker, gameplay readiness, movement, and interaction.
  - Full: repository formatting, linting, type-checking, unit tests, character/asset validation, production build and size reporting, and the complete browser suite.
- Run the full tier before integrating shared gameplay changes, before declaring a worker complete, and after combining branches whose contracts overlap. It is not required after every intermediate commit.
- Keep unit, browser, visual, and performance coverage distinct. Do not make fast unit checks launch a browser, and do not run screenshot-heavy visual harnesses unless the change affects rendering, layout, camera composition, animation, or another visual contract.
- Prefer deterministic readiness/state assertions over fixed sleeps. New browser tests must not add arbitrary `waitForTimeout` delays when a DOM state, test-bridge snapshot, event, animation state, or polling assertion can express readiness.
- Profile before changing concurrency. Preserve test isolation, and benchmark Playwright worker-count changes under the software-rendered WebGL configuration rather than assuming more workers are faster.
- Avoid duplicate compilation in a single validation sequence. If TypeScript has already passed unchanged, use the production bundling step that does not repeat the same type-check when an equivalent documented command exists.
- Never delete meaningful regression coverage solely to reduce file count or elapsed time. Consolidate only proven duplication and record the retained behavioral owner.

## User controls

- No trigger phrase is required for ordinary substantial requests; apply these delegation rules automatically.
- Phrases such as `parallelize this`, `use workers`, `use worktrees`, or `reuse Codex sessions` explicitly force delegation when safe.
- Phrases such as `do this directly`, `no workers`, `no sub-agents`, or `stay in this session` disable delegation for that request.
- If the user asks only for an explanation, audit, diagnosis, or status report, do not infer permission to modify files, merge, commit, or push.

## Scope and safety

- Preserve existing user changes and unrelated dirty files.
- Do not broaden gameplay scope beyond the request merely because another system has a convenient hook.
- Keep development helpers development-only and keep runtime assets local unless the user explicitly requests a network-backed design.
- Prefer public system APIs and composition over private-field access, duplicated event listeners, or visual nodes owning simulation state.
