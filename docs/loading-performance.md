# Loading and production performance

## Startup contract

The DOM-native loading screen is installed before runtime initialization. It is not timer-driven: the progress element is indeterminate until `ThreeAssetLoader` publishes a real request, then reflects the mean progress of requested assets. Copy names the currently loading logical asset. Ordered lifecycle observation marks the district ready after `LevelSystem` initializes and the character ready after `PlayerControllerSystem` initializes its visual.

Successful startup removes the screen before the initial character picker opens. If a startup asset fails but its owner supplies the existing primitive fallback, a dismissible status remains while gameplay and the picker continue. A non-recoverable initialization error leaves an alert with the underlying error and a reload action. Disposal unsubscribes from asset status and removes all loading DOM.

Missing optional or local character files never cause the loader to fetch a runtime CDN substitute. `CharacterLoader` continues to use the generated placeholder, preserving offline startup and deterministic browser tests.

## Bundle measurements

Measured with `pnpm build && pnpm size` from main commit `9326630` and this branch. Values are minified production output; gzip is computed by `scripts/report-bundle-size.mjs`.

| Output             | Before raw / gzip |  After raw / gzip | Startup effect                                                 |
| ------------------ | ----------------: | ----------------: | -------------------------------------------------------------- |
| Initial JavaScript | 731.4 / 186.1 KiB | 726.9 / 185.2 KiB | 4.5 KiB raw and 0.9 KiB gzip removed despite adding loading UI |
| Help overlay       |    included above |     4.9 / 1.4 KiB | fetched only when Help is first requested                      |
| CSS                |    12.7 / 3.2 KiB |    13.7 / 3.5 KiB | loading and fallback/error presentation                        |
| All JS + CSS       | 744.0 / 189.4 KiB | 745.5 / 190.1 KiB | total includes the optional Help chunk                         |

Source-map inspection attributes roughly 2.26 million source characters to Three.js core, renderer, and GLTF support versus roughly 0.32 million to application modules. Three.js remains in the initial graph because rendering, collision helpers, player/world objects, and the initially required character picker all use it. Splitting it would add a request without deferring work. The production graph no longer includes `SparringTargetSystem`; development tools, browser-test instrumentation, sandboxes, and sparring load only behind Vite's development branch.

The five checked-in playable/NPC GLBs total about 4.2 MiB and remain the largest startup transfer. They are local, cacheable, and loaded through logical asset demand. No service worker, deployment change, external runtime asset, or hard bundle-size gate is introduced.

## Measuring changes

Run:

```sh
pnpm build
pnpm size
pnpm preview
```

Use a cold browser context for startup checks. Confirm the initial entry and CSS load first, the Help chunk is absent until Help opens, asset progress changes only with actual loader events, the picker opens after readiness, and missing optional assets reach the playable fallback state.

## Development performance contract

Development builds expose rolling 120-sample diagnostics through the debug panel and browser-test bridge:

- Renderer: CPU render time min/average/max/p95, draw calls, triangles, live geometries/textures, device pixel ratio, and CSS/back-buffer viewport dimensions.
- Runtime: total update time plus update/late-update min/average/max/p95 for every system that ran in the window.
- Assets: cache entries, completed loads, in-flight loads, current failures, and disposal state.
- Loading: measured `preparingWorld`, `preparingCharacter`, `finalizing`, and total durations. These are lifecycle timestamps, not simulated estimates.

`performance.reset-windows` clears the renderer/runtime rolling windows. In production the dynamically imported collectors and their `performance.now()` calls are absent. The untimed runtime path retains its original loops and pays one disabled diagnostics branch per frame; renderer timing also uses one disabled branch. Asset/renderer counts are calculated only when a public snapshot is requested. Loading adds four startup clock reads.

### Controlled loading faults

Faults operate at the logical asset boundary and are development-only. They never replace asset URLs or request a remote resource:

```text
/?debug=1&loadDelayMs=900
/?debug=1&loadDelayMs=300&loadFail=character.casual.model
```

`loadDelayMs` is capped at 10 seconds and emits labelled simulated progress before the normal local backend runs. `loadFail` rejects only the exact logical ID, exercising the existing `AssetLoadError` and `CharacterLoader` placeholder path. The debug commands `loading.fault-reload` (`delay ms, optional logical asset id`) and `loading.fault-reset` reproduce or clear the URL harness with a cold reload. Disposal cancels pending fault timers and loading subscriptions.

### Diagnostics iteration bundle delta

Measured from merged main `3f86df1` before and after this iteration:

| Output             | Before raw / gzip |  After raw / gzip |
| ------------------ | ----------------: | ----------------: |
| Initial JavaScript | 741.4 / 189.1 KiB | 743.7 / 189.8 KiB |
| Initial CSS        |    14.9 / 3.7 KiB |    14.9 / 3.7 KiB |
| Lazy Help          |     6.4 / 1.9 KiB |     6.4 / 1.9 KiB |
| All JS + CSS       | 762.7 / 194.7 KiB | 765.0 / 195.4 KiB |

The 0.7 KiB gzip initial-JavaScript increase is the public snapshot seams, cache counters, and dormant timing branches. Rolling windows, fault simulation, performance formatting, and controls remain outside the production graph. `pnpm size` now labels initial versus lazy files and prints a separate initial total.
