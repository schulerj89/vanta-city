# Playable browser smoke tests

The Playwright suite validates the integrated debug district through deterministic state snapshots, keyboard input, and existing debug commands. Screenshots supplement state assertions; they are not test oracles.

## Install and run

```sh
pnpm install
pnpm test:e2e:install
pnpm test:e2e
```

Run `pnpm test:e2e:debug` for Playwright Inspector. Failure traces, screenshots, video, page errors, and the HTML report are written beneath `test-results/` and `playwright-report/`. Open the report with `pnpm exec playwright show-report`.

Run `pnpm exec playwright test e2e/district-location-hud.spec.ts` for the expansion alone. It attaches an overhead collision/spawn/trigger map, each outer landmark, the raised overlook, and a narrow health/location HUD layout to the report. Its route, grounding, resolver, camera-recovery, and UI-state checks use public snapshot polling rather than fixed delays.

The suite starts Vite on `127.0.0.1:4174`. It uses one Chromium worker and condition-based polling for game readiness, grounding, movement, character loading, and interaction selection. The one bounded 350 ms observation verifies that a paused simulation remains stationary.

Chromium launches with ANGLE SwiftShader (`--use-angle=swiftshader`, `--use-gl=angle`) and `LIBGL_ALWAYS_SOFTWARE=1`, matching CI's software-rendered WebGL configuration. Tests use the generated placeholder character and a deliberately unknown logical asset ID, so no external network asset is required.

## Development-only bridge

The test API is installed as `window.__VANTA_TEST__` only when both conditions are true:

1. Vite is running a development build (`import.meta.env.DEV`).
2. The URL contains `?e2e=1`.

It is dynamically imported after development tools are enabled and is removed during hot disposal. Production builds do not install the bridge or register the invalid character fixture.

`snapshot()` reads public APIs from the runtime, renderer, level, collision, player, character visual, camera, interaction system, character selection, help overlay, location HUD, and runtime error reporter. `executeDebugCommand()` delegates to `DebugRegistry.executeCommand`; it does not write private fields. The bridge reports current state, the authoritative binding/help metadata, level and collision readiness, player transform/velocity/grounding/run mode, selected and loaded characters, one-shot action state, fallback source, world-space visual bounds, camera safety data, location name/coordinates, help focus/open state, interaction selection/completion/scoring/LOS diagnostics, and unhandled runtime errors.

Picker observability includes registered/available/unavailable IDs, focus, draft selection, confirmed selection, open state, and preview loading state. Gameplay smoke starts with `?e2e=1` and opens the picker through `ui.open-character-picker` so both direct district startup and in-place picker transitions are covered.

Assertions include explicit messages for startup and floor failures. Coverage exercises `Q`/`E` keyboard orbit, `R` run toggling, the remapped interaction and shoulder actions, both characters' alternating punch/kick clips, explicit airborne/landing graph fallbacks, locomotion restoration, rapid action-lock rejection, animation-timed impact before mixer completion, the sparring eligibility visualization and repeatable target lifecycle, accessible help focus/closing, dialogue/modal-state isolation, and named curb/ramp/stair grounding locations. `collision-geometry.spec.ts` repeats the rotated service-door/alley route three times, checks foot clearance and capsule wall clearance, forces a wall contact, and repeats camera obstruction/recovery three times. It attaches screenshots of the visible tight-passage and obstruction states while using state/geometry tolerances as the actual oracle. A startup exception prevents the playing-ready bridge condition, while a player below `world.floorHeight` fails with its measured height and expected floor.

`interaction-reliability.spec.ts` opts into the development-only competing/occluded target fixture. It verifies deterministic candidate switching, authoritative obstruction rejection and blocker ids, prompt replacement, repeated interaction input, and a clean runtime-error snapshot. It also attaches Talk and prop screenshots outside, exactly at, and inside their authoritative helper rings, including the prop prompt at a narrow viewport. Conversation coverage separately repeats Talk, restores gameplay after pause/dialogue, and verifies keyboard/gamepad movement controls.

`performance-loading.spec.ts` uses development-only logical fault parameters to observe nonzero slow-load progress, selected-character failure and placeholder recovery, measured loading completion, zero in-flight work after disposal, lazy Help module timing, and a clean cold reload. It uses only checked-in assets and a fresh browser context; no request is redirected to an external runtime source.

`input-ownership-inspector.spec.ts` uses the bridge-controlled virtual standard gamepad and a controlled pointer-lock stub. It attaches four screenshots named `input-ownership-gameplay`, `input-ownership-help`, `input-ownership-picker`, and `input-ownership-dialogue`, while asserting device switching, simultaneous keyboard/gamepad state, modal rejection reasons, pause behavior, reduced-motion reflection, and disconnect/reconnect history.

`character-animation-lab.spec.ts` opens the normal development sandbox at `?sandbox=character-animation-lab`, switches through every registered playable/NPC/debug-target definition, selects logical and raw authored clips, verifies disposal and the fixed simulation origin, and exercises play/pause, normalized scrub, speed, loop/one-shot, action rejection, animation-timed impact, mixer completion, and visual-helper state. Two committed locator screenshots cover the deterministic DOM controls surface. Full WebGL captures for Casual, Punk, Animated Men, impact, bounds, and grounding are report attachments rather than pixel oracles because SwiftShader full-canvas capture can occasionally expose tiled compositor artifacts on macOS.

`equipment-actions.spec.ts` drives both playable models through the two-slot quickbar, handgun idle/fire/run, knife idle/slash, in-place roll, native death/reset, modal isolation, and narrow responsive layout. It also validates Mack as a shared NPC equipment owner and the invalid-asset fixture's reversible fade fallback. Full-page action, equipment, death, fallback, and narrow-layout captures are report attachments; state, socket compatibility, disposal counters, material restoration, grounding, and console errors remain the deterministic oracles.

`diagnostic-recorder.spec.ts` records a short movement → Mack interaction/dialogue → gameplay-camera restore path, freezes the bounded trace, exercises the user-initiated JSON download, reads the same versioned JSON back through the development bridge, and asserts that browser/page errors remain clean. The bridge methods serialize and validate through the recorder's public export/readback API; they do not expose recorder storage or any gameplay private field.
