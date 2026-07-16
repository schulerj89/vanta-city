# Character assets and registration

## Playable selection path

The debug district uses one player simulation and one replaceable presentation path:

1. `CharacterSelectorSystem` writes the chosen registered ID to `CharacterSelectionStore`.
2. The store persists `{ version: 1, selectedCharacterId }` under `vanta-city:character-preference` in `localStorage`. Malformed, unsupported, or removed IDs are replaced with the registered default.
3. `CharacterPlayerVisual`, already owned by `PlayerControllerSystem`, observes the selection and asks `CharacterLoader` for its shared `CharacterDefinition`.
4. `CharacterLoader` resolves `modelAssetId` and optional animation asset IDs through the shared `AssetCatalog`/`ThreeAssetLoader`. URLs never enter the player controller.
5. The loaded scene is attached beneath the existing player transform. The controller continues to own movement, collision, spawning, facing, and camera tracking.
6. When a newer selection wins, the old `LoadedCharacter` is disposed. A monotonically increasing request version disposes late results instead of attaching them.

The placeholder is the selected visual for definitions without a model asset and the guaranteed fallback for missing or failed assets. While a replacement loads, the current visual remains attached and the selector/debug panel reports loading. Reloading or changing a character never recreates `GameRuntime` or `PlayerControllerSystem`.

`CharacterPlayerVisual` maps player movement to logical `idle`, `walk`, and `run` clips. Airborne and landing states use idle when available. A missing requested clip falls back to idle, then to a valid static pose. `CharacterLoader` reports every missing authored mapping. After each mixer update the definition's root offset is restored, so authored root-motion tracks cannot translate the visual away from the simulation transform.

With `?debug=1`, the Player group reports selected and loaded IDs, fallback state, load status, logical animation, scale, rotation, and vertical offset. **Cycle character** and **Reload character** exercise replacement without restarting the district.

## Install the intended character pack

1. Download the GLB/GLTF version of the [Ultimate Modular Men Pack](https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ).
2. Choose or assemble the desired model and export a browser-ready GLB as `public/assets/characters/ultimate-modular-men/model.glb`.
3. Keep embedded animation names intact, or update the logical clip mappings in `src/characters/characters.ts`.
4. Run the game with `?debug=1` and choose **Modular Man** or execute **Select character** with `modular-man`. The panel reports the complete visual state; missing models or clips produce development warnings without stopping the game.

The local asset directory is ignored. Do not commit downloaded files until their exact license and redistribution status have been reviewed.

## Register a model asset

Add one entry to `assetManifest` in `src/assets/catalog.ts`:

```ts
'character.example.model': {
  type: 'model',
  url: '/assets/characters/example/model.glb',
  optional: true,
  attribution: { title: 'Example', creator: 'Artist', license: 'License' },
},
```

URLs live only in the asset catalog. Gameplay and character definitions refer to the logical ID.

## Register a character

Add a `CharacterDefinition` to `src/characters/characters.ts`:

```ts
{
  id: 'example',
  displayName: 'Example Character',
  modelAssetId: 'character.example.model',
  animations: {
    idle: { clipNames: ['Idle'], required: false },
    walk: { clipNames: ['Walk', 'Walking'], required: false },
  },
  transform: { scale: 1, rotation: [0, Math.PI, 0] },
  fallback: 'placeholder',
}
```

`animations` maps game-facing names to candidate clip names. An `assetId` on a binding may point to a separate catalog entry of type `animation`. Attachments and material variations are descriptive data for later systems; this task does not apply them.

## Transform and foot-alignment corrections

Character transforms describe authored-model corrections, not player-body movement:

```ts
transform: {
  scale: 0.01,
  rotation: [0, 0, 0],
  forwardAxisCorrection: Math.PI,
  // Use only when this asset has a deliberately authored contact plane:
  verticalOffset: 0.025,
}
```

- `scale` accepts a uniform number or `[x, y, z]` correction.
- `rotation` is the model-authoring Euler correction.
- `forwardAxisCorrection` adds a yaw correction when the asset does not face local `+Z`.
- `offset` is an optional authored local translation. Its transformed Y value participates in bounds measurement; it is not a grounding override.
- `verticalOffset` explicitly replaces automatic foot alignment. Omit it for normal characters.

After the model and its corrections are fully loaded, the player visual measures its visible `Box3` once. With no explicit override, it applies `-bounds.min.y` to the dedicated alignment root, placing the lowest transformed point on the visual ground-contact plane. Bounds are measured again only when character selection produces a new model instance. Scale and rotation therefore affect the result correctly, and reset/teleport never accumulate alignment offsets.

The current generated placeholder measures approximately `2.280` units tall after its `0.6` scale, with minimum Y `-0.342` and automatic offset `+0.342`. Because the optional Modular Man GLB is not committed, its runtime fallback currently measures `3.800` units tall, minimum Y `-0.570`, and automatic offset `+0.570`; the installed GLB reports its own transformed values in the debug panel at runtime.

## Player transform hierarchy

```text
Player simulation transform (authoritative foot position)
└── Player visual root (facing rotation)
    └── Loaded character alignment root (one-time vertical alignment)
        └── Loaded model root (authored scale/rotation/translation)
            └── Meshes, skeleton, and animation bones
```

The collision body and simulation origin never move to compensate for asset authoring. Animation mixers must target only the loaded model subtree. Character loading removes translation tracks that directly target the loaded scene root because root-motion locomotion is not supported; child and bone translation tracks remain available. A future root-motion feature must explicitly feed displacement into movement simulation instead of translating any ancestor in this hierarchy.

In development, enable the **Character grounding / alignment** visual helper. It displays the simulation origin, collision capsule, visual root, transformed model bounds, calculated lowest point, and ground-contact plane. The Player debug group reports character ID/source, computed height, minimum Y, applied offset, and grounded state.

## Consumption contract

Player and NPC spawning systems should read a `CharacterDefinition` from `CharacterSelectionReader` or their own authored choice, then call `CharacterLoader.instantiate(definition)`. They own the returned `LoadedCharacter` and must call `dispose()` when despawning it. Grounded actors measure the returned transformed `root`, attach it beneath their own alignment root, and inspect `animationClips` by logical name. Non-grounded previews may display `root` directly. Consumers should log `warnings` during development.

Do not add the cached result of `GameAssetLoader.loadGltf()` directly to the scene. It is loader-owned source data. `instantiateModel()` and `CharacterLoader.instantiate()` return independent scene hierarchies while sharing immutable GPU resources owned by the loader cache.
