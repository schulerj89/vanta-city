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

## Manual Codex workflow

- Vanta City has no scheduled orchestrator, integrator, cleaner, recorder, release gate, or local supervisor. Start Codex workers only in response to a user request in the active conversation.
- Treat `coordination/game-orchestrator.json` as a durable product roadmap, performance budget, asset policy, and source of bounded candidate tasks—not as permission to start work automatically.
- Before creating or reusing workers, inspect current Codex sessions, Git worktrees, branches, commits, and `main`; never duplicate work already active or completed.
- The primary conversation owns dispatch, progress reporting, architectural review, integration, validation, commits, pushes, and reviewed worktree cleanup.
- Workers must verify their assigned repository root, branch, base commit, and clean status before editing. They work only in their dedicated worktree and return a focused commit plus validation evidence.
- Do not infer that a worker, integration, cleanup, recorder, or release check is running in the background. Report only processes and worktrees verified during the current request.
- Use changed-feature tests while iterating and the full validation tier before integrating shared gameplay changes or declaring a substantial milestone complete.

## Product constraints

- A map-expansion milestone grows measured playable area by 20–30% (target 25%). Unrelated feature iterations must not inflate the map merely to satisfy the percentage.
- Treat 900 MB as a tested hard memory ceiling, not a utilization goal. Performance, disposal, and leak checks block integration when budgets regress.
- New gameplay acceptance must use production-intended, locally stored assets with verified provenance. Synthetic placeholders remain limited to explicit failure-path tests.
- Development-time OpenAI image and ElevenLabs audio generation is authorized only within the provider/request limits in `coordination/game-orchestrator.json`. Read credentials from the ignored `.env`, never print or stage them, use official provider endpoints, keep accepted assets local with provenance, and never expose secrets to browser runtime.
- Provider workers in Git worktrees must read approved values from `/Users/jschuler/Projects/vanta-city/.env` by absolute path because ignored files are not copied to worktrees. Never copy the file or values into a worktree or task prompt.
- Radio-host TTS remains blocked until `ELEVENLABS_RADIOGUY_VOICE_ID` is accessible to the configured account. ElevenLabs theme generation and audio-pipeline implementation may proceed; character dialogue voice-over remains prohibited.

## Task discovery

- User requests are the highest-priority source of new game tasks. Add durable direction as bounded roadmap entries with acceptance criteria rather than relying only on conversation history.
- Manual playtests and recorded exploration are evidence, not proof, and never replace unit, targeted browser, visual, smoke, or release-level validation.
- Review roadmap additions like code: reject vague, duplicate, unbounded, unsupported, or product-divergent tasks. New spending, credentials work, licensing exceptions, mature content, vision changes, and external commitments require user direction.

## UI design direction

- Use `/Users/jschuler/.codex/skills/vanta-ui-art-director/SKILL.md` whenever a task changes player-facing HUD, menus, prompts, dialogue, cinematics, maps, missions, loading, title, pause, death, vehicle presentation, shared UI styles, focus, accessibility, responsive behavior, typography, icons, or motion.
- Require an xhigh design brief or review before implementation when roadmap metadata contains `requiresUiDesign`. Medium workers implement and validate the approved brief in dedicated worktrees; the design reviewer does not silently rewrite the feature.
- One authoritative HUD layout owns screen-space zones, safe areas, stacking, collisions between regions, and state-driven visibility. Feature UI observes public snapshots and events and must not own simulation state, camera transforms, or duplicate input listeners.
- Add or extend the deterministic UI composition lab for components with multiple states or cross-region impact. Review real-game screenshots at the task's required viewports over bright, dark, and visually noisy backgrounds, including relevant enlarged-text and reduced-motion cases.
- Snapshot changes require a recorded design reason. Do not approve copied franchise presentation, inaccessible controls, private-field fixtures, overlapping HUD regions, unlicensed fonts or icons, or placeholder interface art as completed design.

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
