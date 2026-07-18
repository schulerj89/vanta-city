# Playable browser smoke tests

The Playwright suite validates the integrated debug district through deterministic state snapshots, keyboard input, and existing debug commands. Screenshots supplement state assertions; they are not test oracles.

## Install and run

```sh
pnpm install
pnpm test:e2e:install
pnpm test:e2e:smoke
```

The browser suite has four local lanes. They partition by intent without deleting or weakening the full suite:

- `pnpm test:e2e:smoke` runs four tagged checks: playable readiness, keyboard-only picker confirmation, deterministic interaction selection, and asset-failure fallback. Use it for the fastest cross-system signal.
- `pnpm test:e2e:feature` runs the untagged feature/integration checks. Together, the disjoint smoke, feature, and visual lanes cover the full suite without running tagged smoke checks again in the feature lane.
- `pnpm test:e2e:visual` runs the camera-composition and character-animation visual tests, including all committed screenshot oracles.
- `pnpm test:e2e:full` (and the compatibility alias `pnpm test:e2e`) runs all tests. This is the required pre-merge browser lane.

Run `pnpm test:e2e:debug` for Playwright Inspector. Failure traces, screenshots, video, page errors, and the HTML report are written beneath `test-results/` and `playwright-report/`. Open the report with `pnpm exec playwright show-report`.

Use `pnpm test:e2e:profile` for a one-worker JSON profile and `pnpm test:e2e:profile:parallel` for the same suite with two workers. The profiler selects an isolated port unless `VANTA_E2E_PORT` is set, reports actual wall time rather than summed worker time, and prints the ten slowest test attempts. Additional Playwright arguments are forwarded, so `pnpm test:e2e:profile -- --grep @smoke --repeat-each=3` is the short reliability profile. Compare matched warm samples under similar machine load; there is intentionally no timing gate.

Run `pnpm exec playwright test e2e/district-location-hud.spec.ts` for Ashfall Junction alone. It attaches all four approaches, Signal Corner and its coordinate HUD, an overhead collision/spawn/trigger view, and a narrow health/location HUD layout. Its grounding, resolver, signal-interaction, default-NPC-absence, camera-recovery, pause/help, and responsive-layout checks use public snapshot polling rather than fixed delays.

The suite starts Vite on `127.0.0.1:4174`. It deliberately defaults to one Chromium worker. A two-worker profile was faster in one historical full run (269 seconds versus a 339-second one-worker median) but timed out a screenshot-heavy interaction test on repeat (324 seconds), while increasing individual SwiftShader test duration. Two workers therefore remain an opt-in measurement, not a stability gate.

Readiness and positive progress use bridge snapshots or DOM assertions: bridge availability, rendered state, movement distance, camera transition, interaction selection, animation state, and heading changes. Bounded waits remain only when elapsed time is the behavior under test (paused/input/depleted-state immobility, release suppression, or a deliberately timed visual capture). Trace, screenshot, and video retention on failure remain enabled; those artifacts cost some passing-run setup time but are important for diagnosing software-WebGL failures.

The readiness smoke check does not reload after proving startup. Cold reload and disposed-loading replacement are owned by `performance-loading.spec.ts`; selection persistence and accessibility-preference persistence retain their separate reloads because those reloads are their behavioral assertions. The animation lab waits for model readiness and two rendered frames before captures instead of sleeping for a fixed compositor delay.

## July 2026 efficiency profile

The suite contains 47 tests in 16 files: 4 smoke, 38 feature, and 5 visual. Each test retains a fresh Playwright page and browser context. Startup helpers poll the public game-state, renderer, grounding, model, or loading-readiness snapshots rather than assuming that navigation implies asset readiness. There are three intentional same-page reloads for loading-state replacement, character-selection persistence, and accessibility-preference persistence, plus one fault-recovery navigation. Sharing a page across tests was rejected because it would couple local storage, debug fixtures, input state, and runtime disposal.

The fixed-wait inventory fell from 11 calls / 3.96 seconds to 8 calls / 2.46 seconds. The remaining waits assert real elapsed behavior: input suppression while typing, paused/dialogue/depleted immobility, held gamepad-repeat suppression, post-release fire suppression, and one deliberately timed mid-roll capture. They are not readiness polling and should remain inside their owning sequential interaction flows.

On the Apple M5 benchmark host, the clean one-worker baseline passed 47/47 in 252.60 seconds of Playwright-reported wall time (253.01 seconds measured outside the runner). Its slowest tests were the two-character equipment/action flow (19.53 seconds), four-direction rolls (17.58 seconds), conversation-camera restoration (16.80 seconds), keyboard/actions/help (14.32 seconds), and interaction range captures (14.17 seconds). The directly changed readiness smoke check fell from 2.58 to 1.50 seconds, and the animation visual check fell from 3.13 to 2.88 seconds in low-contention focused runs. A final post-change full suite passed 47/47 in 427.39 seconds while a sibling SwiftShader suite overlapped most of the run; that wall time is validation evidence, not a comparable after benchmark.

A three-repeat one-worker smoke profile passed 12/12 attempts in 52.16 seconds. A two-worker smoke stress profile also passed 12/12 attempts but took 106.85 seconds under simultaneous SwiftShader load from other worktrees. An earlier contended full-suite sample was discarded after GPU starvation inflated wall time to 493.08 seconds and caused a sparring readiness failure; that owner passed on focused rerun. This is why full-suite comparisons require an otherwise idle software-rendering host and why two workers remain opt-in.

Chromium launches with ANGLE SwiftShader (`--use-angle=swiftshader`, `--use-gl=angle`) and `LIBGL_ALWAYS_SOFTWARE=1`, matching CI's software-rendered WebGL configuration. Tests use the generated placeholder character and a deliberately unknown logical asset ID, so no external network asset is required.

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
