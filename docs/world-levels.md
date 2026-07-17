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

Runtime consumers use `LevelLocations` methods (`getSpawn`, `getLocation`, `getTrigger`, `getCinematicAnchor`, `getStaticColliders`, and `resolveLocation`) instead of searching the Three.js scene. `level:loaded` and `level:unloaded` events publish lifecycle facts. Loading remains a direct command on the owning system.

`resolveLocation(position)` applies deterministic metadata rules: a containing landmark wins first, followed by a containing zone, a landmark within the 10m nearby threshold, then the level name. Landmark ties use priority, distance, and logical ID. Zone ties use priority, smaller volume, and logical ID. Boundaries are inclusive. This resolver powers the location HUD and is available to mission, interaction, and dialogue systems without UI or scene-graph knowledge.

`staticCollision` is deliberately plain data. The game-owned adapter converts each box's `position`, supported rotation, and `size` into the authoritative query model. Ordinary boxes may be axis-aligned or yaw-rotated; tagged ramps may use pitch but not yaw or roll. Validation rejects other combinations so rendering and collision cannot silently disagree. Movement, grounding, step/head probes, interaction visibility, and gameplay/directed camera obstruction consume the same loaded shapes. Camera casts use the full oriented thickness of pitched ramps rather than omitting them. Static conversation NPCs may use small `npc-occupancy` boxes at their authored spawns; those shapes block movement and camera but are ignored as visibility occluders so their own Talk target remains reachable. Unloading clears every representation together.

The default test level is **Ashfall Junction**, one hand-authored 56m × 56m four-way intersection centered at the origin. Two 12m roads cross between four 0.2m-raised sidewalk corners. Four ruin silhouettes provide readable corner massing and camera obstruction; four visible 1.3m-high perimeter barriers close the playable edge at X/Z ±27.5. Road, sidewalk, ruin, prop, pole, and boundary collision are authored separately from rendered primitives and imported art. The source-of-truth dimensions and transforms live in `intersectionLayout.ts`; the generated [SVG map](world/ashfall-junction-map.svg) and [ASCII recipe](world/ashfall-junction-map.txt) are validated against them.

The previous sprawling market/yard/overlook assembly was removed rather than retained under the new art. Ashfall Junction has one district zone, four approach landmarks, Signal Corner, a default north spawn, four named approaches, four corner spawns, and a non-NPC `interaction.signal-controller`. Seven selected CC0 Quaternius street props are local GLBs; hashes, triangle counts, sizes, and provenance are recorded in [the intersection asset note](assets-intersection.md).

## Location HUD

`LocationHudSystem` is an `always` lifecycle observer and creates no render loop. It samples `WorldPoseSource.getWorldPose()` and `LevelLocations.resolveLocation()` at 10Hz, formats signed one-decimal X/Y/Z values, and disposes its DOM root with the runtime. It remains visible but noninteractive during gameplay, pause, dialogue, cinematics, and help; boot/loading and character selection hide it. Desktop layout uses the lower-left safe-area corner opposite the lower-right health HUD and anticipated centered quickbar. At narrow widths it moves to the upper-right safe area.

Development browser tests may use `camera.preview-anchor` and `camera.release-preview` to capture an authored camera anchor through the public camera ownership API. These commands and `window.__VANTA_TEST__` exist only in Vite development builds with `?e2e=1`; production exposes neither control.

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

Known limits: static triangle meshes, compound curved shapes, moving platforms, dynamic bodies, navigation, vehicles, destructibility, and arbitrary non-ramp pitch/roll are outside this boundary. Ramps remain bounded planar height fields for character grounding; they do not add side-wall resolution. Teleports ground-probe the requested point but do not search for a nearby free position.
