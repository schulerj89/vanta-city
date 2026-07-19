# World levels

Levels are immutable data modules registered before the runtime starts. `LevelSystem` is a normal lifecycle system: `init()` loads the selected level, `load(id)` replaces it, and `dispose()`/`unload()` removes its root and disposes all generated geometry and materials.

## Definition contract

Each `LevelModule` exports a `definition` and logical `assets` manifest. A definition separates:

- `environment`: rendered glTF instances or generated box primitives;
- `staticCollision`: physics-neutral oriented boxes with optional gameplay tags;
- `spawns`: named player and NPC transforms, with exactly one default player spawn;
- `locations`: named interaction and mission positions;
- `zones`: named axis-aligned gameplay regions with optional overlap priority;
- `landmarks`: named radius-based points of interest with optional vertical tolerance and priority;
- `triggers`: non-rendered box volumes for later overlap systems;
- `cinematicAnchors`: camera transforms, look-at targets, and optional fields of view.
- `mapPresentation` (optional): north-up playable bounds plus layer references to authored box geometry, landmarks, interactions, and spawns.
- `streaming` (optional): deterministic sectors containing only authoritative environment/static-collision entry IDs plus a focus, load distance, unload distance, and optional always-loaded infrastructure flag.

## Sector streaming contract

Ashfall Junction is partitioned into `sector.core`, four quadrant sectors, and the WORLD-001 `sector.east-quay` expansion without copying any road, building, prop, collision, spawn, location, or minimap transform. Validation requires every rendered/collision entry to have exactly one sector owner, rejects missing or duplicate references, and requires `unloadDistance > loadDistance`.

Initial readiness uses the public player-position source (or the default spawn before one is attached). The core plus every sector inside its 26m load radius must finish before `level:loaded` and the loading screen's world-ready stage. The four quadrant sectors retain ownership until the focus exceeds 32m, preventing boundary thrash. Each reconciliation marks all desired inactive sectors `requested`, loads them in authored order (`loading` → `active`), then unloads no-longer-desired sectors in logical-ID order (`unloading` → `inactive`). This load-before-unload order keeps collision coverage continuous. A failed initial sector rejects level initialization and follows normal runtime rollback. A later failure records `failed` and the public error while protected active coverage remains resident and unrelated stale sectors still unload; leaving and re-entering the radius permits another request.

Each active sector owns one scene root, generated geometry/material set, and cloned `ModelInstance` set. Unload emits the collision fact first, detaches/clears the root, disposes cloned instances and generated resources, then records the inactive state. `LevelSystem.dispose()` deterministically unloads every sector before the existing `level:unloaded` event. Cached texture/glTF source assets intentionally remain loader-owned until `ThreeAssetLoader.dispose()`; diagnostics call this a stable source-reference proxy, not disposed sector memory.

Three.js frustum culling remains enabled on sector meshes. Building roof/cornice detail is hidden beyond 24m as the first distance-LOD policy; the authoritative building shell and collision remain unchanged. The full immutable `LevelDefinition`, `LevelLocations`, location resolver, minimap/full-map facts, and level loaded/unloaded events stay coherent regardless of active visual sectors.

Future consumers:

- `WORLD-001` extends the same sector list and references each spline-derived road visual/collision ID once; the map UI continues reading the complete map presentation.
- `NPC-001` should associate actor definitions with authoritative spawn IDs and subscribe to sector lifecycle when mobile population ownership is introduced, rather than retaining scene objects outside their sector.
- `VEHICLE-001` should use sector events for parked/traffic instance residency while control ownership, dynamic collision, camera, and input remain in their existing systems. A controlled player vehicle's current sector must be retained until exit/handoff completes.

### Minimap presentation contract

`mapPresentation` is the only level-specific input to the compact minimap. Its bounds define the X/Z projection and playable edge. Its `geometry` and `markers` arrays contain logical entry IDs, not copied coordinates: road and structure references point to box, building, or spline-road entries in `environment`; landmark, interaction, and spawn markers point to their corresponding authored collections. Validation rejects missing, duplicate, or wrong-kind references. The HUD reads the referenced entries' authoritative transforms or sampled spline, so changing a road, curve, building, landmark, interaction, or spawn updates both world and map without a screenshot-shaped second dataset.

WORLD-001 keeps the existing `navigation` HUD zone, north-up hierarchy, layer controls, Ashfall tokens, 10Hz public-pose sampling, hidden accessible status, and desktop/narrow/pause/dialogue behavior. Its only new presentation state is a stroked spline-road path sourced from the level definition; it adds no input, focus, pointer, camera, motion, font, icon, live-region, or network ownership. Acceptance requires the curve and ten structure footprints to remain legible at 1280×720 and 390×720 without HUD overlap, with day, night, pause, and dialogue screenshots and zero console/runtime errors.

The orientation is deliberately `north-up`: world +Z is map north/top, +X is east/right, and the public player forward vector rotates the player arrow clockwise from north. This matches the player/camera yaw convention where yaw zero faces +Z. An SVG keeps the small number of primitives inspectable and deterministic for accessibility and browser tests; it has no map tiles or runtime network dependency.

Future districts opt in by supplying `orientation: 'north-up'`, finite ordered `bounds`, and only the references useful at HUD scale. Omit `mapPresentation` to hide the minimap for a level that is not ready. Keep ordinary player spawns or development fixtures off the default marker list unless they are genuinely useful; layers can be exposed through development toggles without changing the runtime map contract.

Runtime consumers use `LevelLocations` methods (`getSpawn`, `getLocation`, `getTrigger`, `getCinematicAnchor`, `getStaticColliders`, and `resolveLocation`) instead of searching the Three.js scene. `level:loaded` and `level:unloaded` events publish lifecycle facts. Loading remains a direct command on the owning system.

## Cross-level replacement

`LevelSystem` stages and commits registered destinations without exposing partial ownership:

```ts
const travel = await levels.prepare('test-district', 'spawn.player-default');

await travel.commit(async ({ level, spawn, onRollback }) => {
  // Existing owners perform grounding and destination readiness here.
  const priorPose = player.getWorldPose();
  onRollback(() => player.teleport(priorPose.position, priorPose.yaw));
  player.teleport(new Vector3(...spawn.position), spawn.rotation?.[1]);
  await destinationReadiness(level.id);
});
```

Preparation builds the destination's initially desired sector set at the named spawn under a detached root. Until commit, `activeLevel`, `LevelLocations`, scene roots, collision, sector/level events, lighting, maps, NPCs, and traffic remain source-owned. `cancel()` disposes staged models and generated resources without events. A handle is single-use; concurrent newer preparation makes older asynchronous work stale and disposes it when it resolves.

Commit event order is source `sector:unloaded` in authored order, source `level:unloaded`, destination `sector:loaded` in authored order, then destination `level:loaded`. Source colliders are therefore gone before destination colliders publish, and only the destination root is attached. The optional landing callback receives immutable authored level/spawn data rather than roots. It registers external-owner restoration through `onRollback` before mutating player, camera, mission, or other state; these operations run in reverse order after the source world is restored. If player grounding or any later required readiness step throws, the inverse lifecycle runs and the source root, sectors, collision, semantic consumers, and registered external state are restored. On success the retained source resources are finalized and disposed.

`getPreparationSnapshot()` exposes only stable diagnostic facts (`generation`, lifecycle state, source/destination/spawn IDs, initial sector IDs, and error). A failed destination prepare or landing can be retried with a new `prepare` call. Normal completion, confirmed skip, and cinematic failure should all call this same public transaction; skip cancellation before commit calls `cancel()`.

`resolveLocation(position)` applies deterministic metadata rules: a containing landmark wins first, followed by a containing zone, a landmark within the 10m nearby threshold, then the level name. Landmark ties use priority, distance, and logical ID. Zone ties use priority, smaller volume, and logical ID. Boundaries are inclusive. This resolver powers the location HUD and is available to mission, interaction, and dialogue systems without UI or scene-graph knowledge.

`staticCollision` is deliberately plain data. The game-owned adapter converts each box's `position`, supported rotation, and `size` into the authoritative query model. Ordinary boxes may be axis-aligned or yaw-rotated; tagged ramps may use pitch but not yaw or roll. Validation rejects other combinations so rendering and collision cannot silently disagree. Movement, grounding, step/head probes, interaction visibility, and gameplay/directed camera obstruction consume the same loaded shapes. Camera casts use the full oriented thickness of pitched ramps rather than omitting them. Static conversation NPCs may use small `npc-occupancy` boxes at their authored spawns; those shapes block movement and camera but are ignored as visibility occluders so their own Talk target remains reachable. Unloading clears every representation together.

The default test level is **Ashfall Junction**, a hand-authored 70m × 56m district with 3,920m² of measured playable bounds. Its baseline four-way intersection is joined by the East Quay cubic road corridor. The curve is tangent to the baseline road at entry and the east edge at exit; its render strip, eight overlapping oriented walkable boxes, two traffic paths, and minimap path all sample `eastQuayCurvedRoad` rather than maintaining parallel coordinates. Traffic paths apply the baseline 3m body-clearance inset from the same sampled endpoint. Ten production Ashfall shells include two new outer-edge buildings with a tested 4m pedestrian band. Visible 1.3m perimeter barriers close X=-27.5/+41.5 and Z=±27.5. Source-of-truth dimensions and transforms live in `intersectionLayout.ts`; the [SVG map](world/ashfall-junction-map.svg) and [ASCII recipe](world/ashfall-junction-map.txt) are validated against them.

The current WORLD-004 authored footprint is centered at `(7, 0)`, spans X
`[-47.6875, 61.6875]` and Z `[-43.75, 43.75]`, and measures 109.375m × 87.5m
= 9,570.3125m². It retains the baseline geometry as historical construction,
adds four straight road continuations, 37 catalog buildings, two sector-owned
enterable room shells, 22 sectors, and exact map/traffic/collision agreement.
Its perimeter is authored as 12 contiguous visual/collider pairs with one
nearby protected sector owner per pair, keeping every outer-corner footprint
inside the adaptive policy's 28m hard-near radius. The unsplit west continuation
belongs to `sector.west-rim-north` for the same guarantee while the map retains
its ten logical roads. The machine-readable authority and architectural
decisions are documented in `docs/world/plans/world-004-four-side-interiors.json`
and `docs/world/world-004-four-side-interiors.md`.

### WORLD-001 acceptance evidence

The measured area uses the roadmap's playable-bounds convention: `(42 - (-28)) × (28 - (-28)) = 70 × 56 = 3,920m²`. Growth is `3,920 - 3,136 = 784m²`, and `784 / 3,136 × 100 = 25%`, inside the required 3,763–4,077m² gate. The north and south expansion shells are flush with X=42; spline-sampled road-edge clearance is 4.000m and 6.117m respectively, so the minimum continuous pedestrian band is exactly 4m.

The July 18, 2026 1280×720 dedicated capture recorded 32 streamed draw calls, 7,581 triangles, 39 geometries, 20 textures, 550.8 uncapped RAF FPS capacity, 163.9 FPS one-percent-low proxy, 4.9ms RAF frame-time p95, 4.5ms renderer CPU p95, and a 39.6MB peak JS-heap proxy. These pass the 50 FPS, 45 FPS one-percent-low, 20ms p95, and 900MB proxy gates; the heap value is not claimed as total browser working set. Three post-prime streaming cycles returned exactly 96 scene objects, 101 owned resources, five sector model instances, 15 cached source references, and six live asset instances without retained growth. The capture and leak record are in [`screenshots/perf-001`](screenshots/perf-001/); curve evidence is [day overhead](screenshots/world-001/curve-day-overhead.png), [day street](screenshots/world-001/curve-day-street.png), and [night street](screenshots/world-001/curve-night-street.png).

The previous sprawling market/yard/overlook assembly was removed rather than retained under the new art. Ashfall Junction has one district zone, four approach landmarks, Signal Corner, a default north spawn, four named approaches, four corner spawns, and a non-NPC `interaction.signal-controller`. Seven selected CC0 Quaternius street props are local GLBs; hashes, triangle counts, sizes, and provenance are recorded in [the intersection asset note](assets-intersection.md).

## Location HUD

`LocationHudSystem` is an `always` lifecycle observer and creates no render loop. It samples `WorldPoseSource.getWorldPose()` and `LevelLocations.resolveLocation()` at 10Hz, formats signed one-decimal X/Y/Z values, and disposes its DOM root with the runtime. It remains visible but noninteractive during gameplay, pause, dialogue, cinematics, and help; boot/loading and character selection hide it. Desktop layout uses the lower-left safe-area corner opposite the lower-right health HUD and anticipated centered quickbar. At narrow widths it moves to the upper-right safe area.

Development browser tests may use `camera.preview-anchor` and `camera.release-preview` to capture an authored camera anchor through the public camera ownership API. These commands and `window.__VANTA_TEST__` exist only in Vite development builds with `?e2e=1`; production exposes neither control.

`MinimapHudSystem` is a sibling `always` observer. It samples the same public pose and location APIs at 10Hz, retains north-up orientation, and renders only the level's referenced facts. Its accessible text reports district/location, X/Z position, cardinal heading, and map bounds. It remains visible through pause and dialogue like the location HUD, hides for boot and character selection, and disposes its SVG root with the runtime. Desktop places it directly above the lower-left location card; narrow layout separates the upper-left location card from the lower-left map. Dialogue and developer-panel layout reserve space rather than covering the map. Development toggles `minimap.layer.roads`, `.structures`, `.landmarks`, `.interactions`, and `.spawns` expose each layer independently.

Ordinary NPCs and the sparring target are absent from normal startup. Development/system coverage opts into Mack, Nox, and Raze with `?npcFixtures=1`; combat coverage separately opts into the stationary target with `?sparringFixture=1`. The level retains tagged spawn metadata for those explicit fixtures, but the runtime creates no actor, prompt, health bar, or occupancy until its development flag is present.

## Adding a district

Create a module under `src/world/levels` that satisfies `LevelModule`, then register it in the bootstrap registry. No `LevelSystem` or renderer changes are needed:

```ts
export const warehouseDistrict = {
  assets: {
    'environment.warehouse': {
      type: 'gltf',
      url: '/assets/environment/warehouse-district.glb',
    },
  },
  definition: {
    id: 'warehouse-district',
    name: 'Warehouse District',
    environment: [
      {
        id: 'v.warehouse-shell',
        kind: 'gltf',
        assetId: 'environment.warehouse',
        position: [0, 0, 0],
      },
    ],
    staticCollision: [],
    spawns: [
      {
        id: 'spawn.player-default',
        kind: 'player',
        default: true,
        position: [0, 0, 0],
      },
    ],
    locations: [],
    zones: [],
    landmarks: [],
    triggers: [],
    cinematicAnchors: [],
  },
} as const satisfies LevelModule;
```

Add `warehouseDistrict` to `new LevelRegistry([...])`. The registry merges its asset entries into the `ThreeAssetLoader` manifest. URLs remain in manifests; definitions and gameplay code refer only to logical asset IDs. The loader clones the cached glTF scene for level ownership, while `ThreeAssetLoader.dispose()` retains ownership of cached asset resources.

## Debug view

The backtick action toggles both the existing overlay and world helpers. Colors are: red collision, green player spawns, blue NPC spawns, yellow triggers, cyan interactions, pink mission locations, green zone bounds, gold landmarks, and purple cinematic anchors/look lines. Rotated red wireframes preserve the authored transform. The Collision / Physics panel also reports rotated-box count, last supporting shape, movement contacts, and the latest camera obstruction ID. Helpers live under `debug-helpers`; rendered geometry and hidden semantic data have separate groups.

Known limits: sectors currently stream level-owned visuals, static collision, and time-of-day emissive-material bindings. The bounded four-light rig and immutable lighting metadata remain full-definition consumers; sector load/unload events bind and release only materials belonging to resident fixture visuals. Semantic queries, minimap/full-map facts, actors, and traffic also remain full-definition consumers; later actor/vehicle milestones must adopt the events above. Curved roads use bounded spline strips plus overlapping oriented-box collision rather than arbitrary triangle collision. Moving platforms, dynamic bodies, navigation, controllable vehicles, destructibility, and arbitrary non-ramp pitch/roll remain outside this boundary. Ramps remain bounded planar height fields for character grounding; they do not add side-wall resolution. Teleports ground-probe the requested point but do not search for a nearby free position.
