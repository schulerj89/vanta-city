# Playable browser smoke tests

The Playwright suite validates the integrated debug district through deterministic state snapshots, keyboard input, and existing debug commands. Screenshots supplement state assertions; they are not test oracles.

## Install and run

```sh
pnpm install
pnpm test:e2e:install
pnpm test:e2e
```

Run `pnpm test:e2e:debug` for Playwright Inspector. Failure traces, screenshots, video, page errors, and the HTML report are written beneath `test-results/` and `playwright-report/`. Open the report with `pnpm exec playwright show-report`.

The suite starts Vite on `127.0.0.1:4174`. It uses one Chromium worker and condition-based polling for game readiness, grounding, movement, character loading, and interaction selection. The one bounded 350 ms observation verifies that a paused simulation remains stationary.

Chromium launches with ANGLE SwiftShader (`--use-angle=swiftshader`, `--use-gl=angle`) and `LIBGL_ALWAYS_SOFTWARE=1`, matching CI's software-rendered WebGL configuration. Tests use the generated placeholder character and a deliberately unknown logical asset ID, so no external network asset is required.

## Development-only bridge

The test API is installed as `window.__VANTA_TEST__` only when both conditions are true:

1. Vite is running a development build (`import.meta.env.DEV`).
2. The URL contains `?e2e=1`.

It is dynamically imported after development tools are enabled and is removed during hot disposal. Production builds do not install the bridge or register the invalid character fixture.

`snapshot()` reads public APIs from the runtime, renderer, level, collision, player, character visual, camera, interaction system, character selection, help overlay, and runtime error reporter. `executeDebugCommand()` delegates to `DebugRegistry.executeCommand`; it does not write private fields. The bridge reports current state, the authoritative binding/help metadata, level and collision readiness, player transform/velocity/grounding/run mode, selected and loaded characters, one-shot action state, fallback source, world-space visual bounds, camera safety data, help focus/open state, interaction selection/completion/scoring/LOS diagnostics, and unhandled runtime errors.

Picker observability includes registered/available/unavailable IDs, focus, draft selection, confirmed selection, open state, and preview loading state. Gameplay smoke starts with `?e2e=1` and opens the picker through `ui.open-character-picker` so both direct district startup and in-place picker transitions are covered.

Assertions include explicit messages for startup and floor failures. Coverage exercises `Q`/`E` keyboard orbit, `R` run toggling, the remapped interaction and shoulder actions, both characters' alternating punch/kick clips and locomotion restoration, rapid action-lock rejection, mixer completion, the repeatable sparring-target toggle/reset/reaction lifecycle, accessible help focus/closing, modal-state isolation, and named curb/ramp/stair grounding locations. `collision-geometry.spec.ts` repeats the rotated service-door/alley route three times, checks foot clearance and capsule wall clearance, forces a wall contact, and repeats camera obstruction/recovery three times. It attaches screenshots of the visible tight-passage and obstruction states while using state/geometry tolerances as the actual oracle. A startup exception prevents the playing-ready bridge condition, while a player below `world.floorHeight` fails with its measured height and expected floor.

`interaction-reliability.spec.ts` opts into the development-only competing/occluded target fixture. It verifies deterministic candidate switching, authoritative obstruction rejection and blocker ids, prompt replacement, repeated interaction input, and a clean runtime-error snapshot. Conversation coverage separately repeats Talk, restores gameplay after pause/dialogue, and verifies movement controls.
