# Character assets and registration

## Install the intended character pack

1. Download the GLB/GLTF version of the [Ultimate Modular Men Pack](https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ).
2. Choose or assemble the desired model and export a browser-ready GLB as `public/assets/characters/ultimate-modular-men/model.glb`.
3. Keep embedded animation names intact, or update the logical clip mappings in `src/characters/characters.ts`.
4. Run the game and select **Modular Man**. The selector reports load state; missing models or clips produce development warnings and a visible placeholder rather than stopping the game.

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

## Consumption contract

Player and NPC spawning systems should read a `CharacterDefinition` from `CharacterSelectionReader` or their own authored choice, then call `CharacterLoader.instantiate(definition)`. They own the returned `LoadedCharacter` and must call `dispose()` when despawning it. They may add `root` to a `GameObject`, inspect `animationClips` by logical name, and log `warnings` during development.

Do not add the cached result of `GameAssetLoader.loadGltf()` directly to the scene. It is loader-owned source data. `instantiateModel()` and `CharacterLoader.instantiate()` return independent scene hierarchies while sharing immutable GPU resources owned by the loader cache.
