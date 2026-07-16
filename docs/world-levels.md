# World levels

Levels are immutable data modules registered before the runtime starts. `LevelSystem` is a normal lifecycle system: `init()` loads the selected level, `load(id)` replaces it, and `dispose()`/`unload()` removes its root and disposes all generated geometry and materials.

## Definition contract

Each `LevelModule` exports a `definition` and logical `assets` manifest. A definition separates:

- `environment`: rendered glTF instances or generated box primitives;
- `staticCollision`: physics-neutral oriented boxes with optional gameplay tags;
- `spawns`: named player and NPC transforms, with exactly one default player spawn;
- `locations`: named interaction and mission positions;
- `triggers`: non-rendered box volumes for later overlap systems;
- `cinematicAnchors`: camera transforms, look-at targets, and optional fields of view.

Runtime consumers use `LevelLocations` methods (`getSpawn`, `getLocation`, `getTrigger`, `getCinematicAnchor`, and `getStaticColliders`) instead of searching the Three.js scene. `level:loaded` and `level:unloaded` events publish lifecycle facts. Loading remains a direct command on the owning system.

`staticCollision` is deliberately plain data. The future game-owned physics adapter should convert each box's `position`, Euler `rotation`, and `size` to its native static-body representation. Player grounding/movement and camera obstruction can consume the same collider list without either system importing level-rendering internals. Static conversation NPCs may use small `npc-occupancy` boxes at their authored spawns; unloading the level clears those boxes with every other world collider.

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
    triggers: [],
    cinematicAnchors: [],
  },
} as const satisfies LevelModule;
```

Add `warehouseDistrict` to `new LevelRegistry([...])`. The registry merges its asset entries into the `ThreeAssetLoader` manifest. URLs remain in manifests; definitions and gameplay code refer only to logical asset IDs. The loader clones the cached glTF scene for level ownership, while `ThreeAssetLoader.dispose()` retains ownership of cached asset resources.

## Debug view

The backtick action toggles both the existing overlay and world helpers. Colors are: red collision, green player spawns, blue NPC spawns, yellow triggers, cyan interactions, pink mission locations, and purple cinematic anchors/look lines. Helpers live under `debug-helpers`; rendered geometry and hidden semantic data have separate groups.
