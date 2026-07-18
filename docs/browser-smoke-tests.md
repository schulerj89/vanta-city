# Playable browser smoke tests

The Playwright suite validates the integrated debug district through deterministic state snapshots, keyboard input, and existing debug commands. Screenshots supplement state assertions; they are not test oracles.

## Install and run

```sh
pnpm install
pnpm test:e2e:install
pnpm test:e2e:smoke
```

The browser suite has five local lanes. They partition by intent without deleting or weakening the full suite:

- `pnpm test:e2e:smoke` runs the tagged cross-system readiness checks. Use it for the fastest broad signal after the unit suite.
- `pnpm test:e2e:feature e2e/<changed-owner>.spec.ts` requires an explicit spec or `--grep` selection and runs it with one worker. The caller owns selecting every browser spec affected by the patch; the command refuses an accidental all-suite run.
- `pnpm test:e2e:visual` runs screenshot-heavy visual/composition owners. Run it only when rendering, layout, camera composition, animation presentation, or a committed visual oracle changes.
- `pnpm test:e2e:performance` runs the sector streaming/leak test and the opt-in 20-second warmup/60-second performance capture with `VANTA_PERF=1`. It is a dedicated performance milestone gate, not ordinary changed-feature validation.
- `pnpm test:e2e:full` (and the compatibility alias `pnpm test:e2e`) retains every behavioral, smoke, visual, and performance-file owner. The timed capture remains skipped unless performance mode is enabled. Reserve this lane for final integration or a release milestone.

Run `pnpm test:e2e:debug` for Playwright Inspector. Failure traces, screenshots, video, page errors, and the HTML report are written beneath `test-results/` and `playwright-report/`. Open the report with `pnpm exec playwright show-report`.

Use `pnpm test:e2e:profile` for a one-worker JSON profile and `pnpm test:e2e:profile:parallel` for the same suite with two workers. The profiler selects an isolated port unless `VANTA_E2E_PORT` is set, reports actual wall time rather than summed worker time, and prints the ten slowest test attempts. Additional Playwright arguments are forwarded, so `pnpm test:e2e:profile -- --grep @smoke --repeat-each=3` is the short reliability profile. Compare matched warm samples under similar machine load; there is intentionally no timing gate.

Run `pnpm exec playwright test e2e/district-location-hud.spec.ts` for Ashfall Junction alone. It attaches all four approaches, Signal Corner and its coordinate HUD, an overhead collision/spawn/trigger view, and a narrow health/location HUD layout. Its grounding, resolver, signal-interaction, default-NPC-absence, camera-recovery, pause/help, and responsive-layout checks use public snapshot polling rather than fixed delays.

The suite starts Vite on `127.0.0.1:4174`. It deliberately defaults to one Chromium worker. A July 18 TEST-001 profile on the reference Apple M5 passed the 69-test suite at one worker in 366.87 seconds. The identical SwiftShader suite at two workers took 313.18 seconds but failed four timing-sensitive equipment-action owners and increased many individual durations. Two workers therefore remain an opt-in diagnostic measurement, not a validation gate.

Readiness and positive progress use bridge snapshots or DOM assertions: bridge availability, rendered state, movement distance, camera transition, interaction selection, animation state, and heading changes. Bounded waits remain only when elapsed time is the behavior under test (paused/input/depleted-state immobility, release suppression, or a deliberately timed visual capture). Trace, screenshot, and video retention on failure remain enabled; those artifacts cost some passing-run setup time but are important for diagnosing software-WebGL failures.

The readiness smoke check does not reload after proving startup. Cold reload and disposed-loading replacement are owned by `performance-loading.spec.ts`; selection persistence and accessibility-preference persistence retain their separate reloads because those reloads are their behavioral assertions. The animation lab waits for model readiness and two rendered frames before captures instead of sleeping for a fixed compositor delay.

## July 2026 efficiency profile

The suite contains 47 tests in 16 files: 4 smoke, 38 feature, and 5 visual. Each test retains a fresh Playwright page and browser context. Startup helpers poll the public game-state, renderer, grounding, model, or loading-readiness snapshots rather than assuming that navigation implies asset readiness. There are three intentional same-page reloads for loading-state replacement, character-selection persistence, and accessibility-preference persistence, plus one fault-recovery navigation. Sharing a page across tests was rejected because it would couple local storage, debug fixtures, input state, and runtime disposal.

The fixed-wait inventory fell from 11 calls / 3.96 seconds to 8 calls / 2.46 seconds. The remaining waits assert real elapsed behavior: input suppression while typing, paused/dialogue/depleted immobility, held gamepad-repeat suppression, post-release fire suppression, and one deliberately timed mid-roll capture. They are not readiness polling and should remain inside their owning sequential interaction flows.

On the Apple M5 benchmark host, the clean one-worker baseline passed 47/47 in 252.60 seconds of Playwright-reported wall time (253.01 seconds measured outside the runner). Its slowest tests were the two-character equipment/action flow (19.53 seconds), four-direction rolls (17.58 seconds), conversation-camera restoration (16.80 seconds), keyboard/actions/help (14.32 seconds), and interaction range captures (14.17 seconds). The directly changed readiness smoke check fell from 2.58 to 1.50 seconds, and the animation visual check fell from 3.13 to 2.88 seconds in low-contention focused runs. A final post-change full suite passed 47/47 in 427.39 seconds while a sibling SwiftShader suite overlapped most of the run; that wall time is validation evidence, not a comparable after benchmark.

A three-repeat one-worker smoke profile passed 12/12 attempts in 52.16 seconds. A two-worker smoke stress profile also passed 12/12 attempts but took 106.85 seconds under simultaneous SwiftShader load from other worktrees. An earlier contended full-suite sample was discarded after GPU starvation inflated wall time to 493.08 seconds and caused a sparring readiness failure; that owner passed on focused rerun. This is why full-suite comparisons require an otherwise idle software-rendering host and why two workers remain opt-in.

Chromium launches with ANGLE SwiftShader (`--use-angle=swiftshader`, `--use-gl=angle`) and `LIBGL_ALWAYS_SOFTWARE=1`, matching CI's software-rendered WebGL configuration. Tests use the generated placeholder character and a deliberately unknown logical asset ID, so no external network asset is required.

## TEST-001 follow-up profile

The July 18, 2026 profile used macOS 26.5.2, Apple M5 (10 logical CPUs), 16 GiB RAM, Node 26.5.0, pnpm 11.9.0, Playwright 1.61.1, and the default SwiftShader launch configuration. The suite had grown to 69 tests in 24 files.

Three unit profile repetitions completed in 2.81, 2.23, and 2.33 seconds of profiler wall time (2.33-second median), with all 68 files / 339 tests retained. `storyBible.test.ts` was the recurring slow execution owner at 166–203 ms; startup/import/environment work remained the larger aggregate cost, but the unit suite was already well below its ten-second budget.

The clean one-worker full browser baseline passed 68 tests with the dedicated performance capture intentionally skipped in 366.87 seconds. Its slowest owners were the full two-character equipment/action flow (22.29 seconds), four-direction rolls (18.88 seconds), conversation-camera restoration (17.86 seconds), keyboard/actions/help (15.10 seconds), and exact interaction range edges (13.31 seconds). These are distinct behavioral owners, not duplicate checks, and remain in the full suite.

The former `test:e2e:feature` selected every non-smoke/non-visual test. Under sustained back-to-back software-rendered runs it selected 47 unrelated tests, took 593.37 seconds, and timed out four equipment-action owners. It was therefore a broad release partition rather than changed-feature validation. TEST-001 replaces that catch-all contract with mandatory explicit spec/grep selection; no test, assertion, reload, browser context, trace, video, screenshot, or failure artifact was removed.

After the split, three independent changed-feature runs selecting `player-money.spec.ts` passed in 12.43, 11.97, and 11.91 seconds of external command wall time. A three-repeat smoke stress run passed all 15 attempts in 52.75 seconds. The dedicated performance command passed both sector/leak and full timed-capture owners in 165.12 seconds. All three lanes remain below three minutes on the reference host, but performance stays separate because its fixed-duration measurements would consume nearly the entire ordinary feedback budget.

The fixed-wait audit still finds eight calls totaling 2.46 seconds. They continue to own elapsed behavior—input suppression, paused/dialogue/depleted immobility, held gamepad edge suppression, post-release fire suppression, and a deliberate mid-roll capture—so none were converted into readiness polling merely to improve the timing report. Positive readiness and progress continue to use DOM state or the public browser snapshot.

Use these tiers during development and integration:

1. `pnpm test` for deterministic state/DOM behavior.
2. `pnpm test:e2e:smoke` for the compact cross-system path.
3. `pnpm test:e2e:feature e2e/<changed-owner>.spec.ts` (plus every overlapping owner) for changed behavior; keep the combined selection below three minutes.
4. `pnpm test:e2e:visual` only for changed visual contracts and `pnpm test:e2e:performance` only for performance milestones.
5. `pnpm test:e2e:full` once at final integration/release, on an otherwise idle software-rendering host.

After `pnpm typecheck` succeeds without source changes, use `pnpm build:bundle` for production bundling. The standalone `pnpm build` deliberately retains `tsc -b && vite build` for CI and callers that have not already typechecked.

## Development-only bridge

The test API is installed as `window.__VANTA_TEST__` only when both conditions are true:

1. Vite is running a development build (`import.meta.env.DEV`).
2. The URL contains `?e2e=1`.

It is dynamically imported after development tools are enabled and is removed during hot disposal. Production builds do not install the bridge or register the invalid character fixture.

`snapshot()` reads public APIs from the runtime, renderer, level, collision, player, character visual, camera, interaction system, character selection, help overlay, location HUD, and runtime error reporter. `executeDebugCommand()` delegates to `DebugRegistry.executeCommand`; it does not write private fields. The bridge reports current state, the authoritative binding/help metadata, level and collision readiness, player transform/velocity/grounding/run mode, selected and loaded characters, one-shot action state, fallback source, world-space visual bounds, camera safety data, location name/coordinates, help focus/open state, interaction selection/completion/scoring/LOS diagnostics, and unhandled runtime errors.

Picker observability includes registered/available/unavailable IDs, focus, draft selection, confirmed selection, open state, and preview loading state. Gameplay smoke starts with `?e2e=1` and opens the picker through `ui.open-character-picker` so both direct district startup and in-place picker transitions are covered. Tests requiring conversations add `npcFixtures=1`; combat tests add `sparringFixture=1`. A default-start smoke assertion requires zero NPC snapshots and an unloaded sparring target.

Assertions include explicit messages for startup and floor failures. Coverage exercises `Q`/`E` keyboard orbit, `R` run toggling, the remapped interaction and shoulder actions, both characters' alternating punch/kick clips, explicit airborne/landing graph fallbacks, locomotion restoration, rapid action-lock rejection, animation-timed impact before mixer completion, the sparring eligibility visualization and repeatable target lifecycle, accessible help focus/closing, dialogue/modal-state isolation, and road/sidewalk grounding. `collision-geometry.spec.ts` checks all four approaches, walks the north road, and repeats camera obstruction/recovery against the northwest ruin three times. Screenshots supplement public state/geometry tolerances. A startup exception prevents the playing-ready bridge condition, while a player below `world.floorHeight` fails with its measured height and expected floor.

`interaction-reliability.spec.ts` opts into the development-only competing/occluded target fixture. It verifies deterministic candidate switching, authoritative obstruction rejection and blocker ids, prompt replacement, repeated interaction input, and a clean runtime-error snapshot. It also attaches Talk and prop screenshots outside, exactly at, and inside their authoritative helper rings, including the prop prompt at a narrow viewport. Conversation coverage separately repeats Talk, restores gameplay after pause/dialogue, and verifies keyboard/gamepad movement controls.

`performance-loading.spec.ts` uses development-only logical fault parameters to observe nonzero slow-load progress, selected-character failure and placeholder recovery, measured loading completion, zero in-flight work after disposal, lazy Help module timing, and a clean cold reload. It uses only checked-in assets and a fresh browser context; no request is redirected to an external runtime source.

`input-ownership-inspector.spec.ts` uses the bridge-controlled virtual standard gamepad and a controlled pointer-lock stub. It attaches four screenshots named `input-ownership-gameplay`, `input-ownership-help`, `input-ownership-picker`, and `input-ownership-dialogue`, while asserting device switching, simultaneous keyboard/gamepad state, modal rejection reasons, pause behavior, reduced-motion reflection, and disconnect/reconnect history.

`character-animation-lab.spec.ts` opens the normal development sandbox at `?sandbox=character-animation-lab`, switches through every registered playable/NPC/debug-target definition, selects logical and raw authored clips, verifies disposal and the fixed simulation origin, and exercises play/pause, normalized scrub, speed, loop/one-shot, action rejection, animation-timed impact, mixer completion, and visual-helper state. Two committed locator screenshots cover the deterministic DOM controls surface. Full WebGL captures for Casual, Punk, Animated Men, impact, bounds, and grounding are report attachments rather than pixel oracles because SwiftShader full-canvas capture can occasionally expose tiled compositor artifacts on macOS.

`equipment-actions.spec.ts` drives both playable models through the two-slot quickbar, handgun idle/fire/run, knife idle/slash, in-place roll, native death/reset, modal isolation, and narrow responsive layout. It also validates Mack as a shared NPC equipment owner and the invalid-asset fixture's reversible fade fallback. Full-page action, equipment, death, fallback, and narrow-layout captures are report attachments; state, socket compatibility, disposal counters, material restoration, grounding, and console errors remain the deterministic oracles.

`diagnostic-recorder.spec.ts` records a short movement → Mack interaction/dialogue → gameplay-camera restore path, freezes the bounded trace, exercises the user-initiated JSON download, reads the same versioned JSON back through the development bridge, and asserts that browser/page errors remain clean. The bridge methods serialize and validate through the recorder's public export/readback API; they do not expose recorder storage or any gameplay private field.
