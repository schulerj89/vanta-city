# Character assets and registration

## Playable selection path

The debug district uses one player simulation and one replaceable presentation path:

1. `CharacterSelectorSystem` writes the chosen registered ID to `CharacterSelectionStore`.
2. The store persists `{ version: 1, selectedCharacterId }` under `vanta-city:character-preference` in `localStorage`. Malformed, unsupported, or removed IDs are replaced with the registered default.
3. `CharacterPlayerVisual`, already owned by `PlayerControllerSystem`, observes the selection and asks `CharacterLoader` for its shared `CharacterDefinition`.
4. `CharacterLoader` resolves `modelAssetId` and optional animation asset IDs through the shared `AssetCatalog`/`ThreeAssetLoader`. URLs never enter the player controller.
5. The loaded scene is attached beneath the existing player transform. The controller continues to own movement, collision, spawning, facing, and camera tracking.
6. When a newer selection wins, the old `LoadedCharacter` is disposed. A monotonically increasing request version disposes late results instead of attaching them.

Casual and Punk are the only selectable definitions, and both use committed local GLBs. The generated placeholder is not registered in character selection; `CharacterLoader` creates it only if a real model fails to load. While a replacement loads, the current visual remains attached and the selector/debug panel reports loading. Reloading or changing a character never recreates `GameRuntime` or `PlayerControllerSystem`.

`CharacterPlayerVisual` feeds movement and one-shot intent into the game-owned `CharacterAnimationStateMachine`. Its fixed priority is reaction, action, airborne/landing, then locomotion; it records every transition, fallback, and restoration while the visual remains responsible only for mixer playback. During running, the same graph selects forward/left/right locomotion from camera-relative input X. A side run enters at `|x| >= 0.50` and remains selected until `|x| < 0.30`, preventing keyboard and stick noise from flapping clips. Reversing across the enter threshold switches sides directly. A missing directional run falls back to normal `run` without restarting that already-playing clip; other missing requests fall back to idle, then to a valid static pose. `CharacterLoader` reports every missing authored mapping. After each mixer update the definition's root offset is restored, so authored root-motion tracks cannot translate the visual away from the simulation transform.

`PlayerControllerSystem.triggerCharacterAction(action, source)` is the small authoritative presentation hook for world interactions and animation-only player actions. It accepts `wave`, `interact`, `punchLeft`, `punchRight`, `kickLeft`, and `kickRight`, plays the selected definition's mapped one-shot above locomotion, restores the model root on every update, and returns to locomotion when complete. Keyboard `J` and `L` alternate accepted left/right requests deterministically. While a one-shot is busy, every additional request is rejected without interrupting, restarting, cross-fading, or queuing; rejected inputs do not advance alternation. Mixer `finished` is the authoritative release, with a duration fallback, and the completion event is published only after locomotion is restored. Debug/browser state exposes busy/rejection/completion sequences and the release source. The garage-door interaction calls `interact`; development command `player.play-character-action <name>` exercises the same API. See [Debug sparring target](sparring-target.md) for the opt-in presentation-only response hook.

With `?debug=1`, the Player group reports selected and loaded IDs, fallback state, load status, logical animation, scale, rotation, and vertical offset. **Cycle character** and **Reload character** exercise replacement without restarting the district.

## Included character pack subset

The repository includes only `Casual Character.glb` and `Punk.glb` from the [Ultimate Modular Men Pack](https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ), renamed to stable local URLs. Both are self-contained glTF 2.0 binaries with embedded buffers, color materials, skeletons, and 24 clips; they contain no images or external resource URLs. The adjacent asset README records the download archive, hashes, and CC0 verification.

Logical `idle`, `walk`, and `run` bindings resolve the exact embedded names `CharacterArmature|Idle`, `CharacterArmature|Walk`, and `CharacterArmature|Run` and are required. Directional `runLeft` / `runRight` resolve `CharacterArmature|Run_Left` / `CharacterArmature|Run_Right`. Both Casual and Punk contain identical directional track layouts: normal run offsets the animated `Body` toward authored +Z, while left and right are mirrored toward authored +X and −X respectively, confirming the direct logical side mapping under the models' facing convention. Preview/action mappings use inspected embedded names: `previewIdle` → `CharacterArmature|Idle_Neutral`, `wave` → `CharacterArmature|Wave`, `interact` → `CharacterArmature|Interact`, `punchLeft` / `punchRight` → `CharacterArmature|Punch_Left` / `CharacterArmature|Punch_Right`, and `kickLeft` / `kickRight` → `CharacterArmature|Kick_Left` / `CharacterArmature|Kick_Right`. Both GLBs expose the same names. Their measured model-root XZ displacement is at most `0.000006` units (validator tolerance `0.05`). The asset validator also exercises three clone/disposal preview cycles for each character.

Neither playable GLB contains an authored jump, fall, or landing clip. The graph therefore exposes `airborne` and `landing` as explicit states while resolving both to `idle`; it does not substitute the unrelated roll clip. Punch impacts occur at normalized clip time `0.55`, and kick impacts at `0.62`. The mixer `finished` event—not impact timing—continues to release the one-shot lock and restore the graph to the current movement state.

## Register a model asset

Add one entry to `assetManifest` in `src/assets/catalog.ts`:

```ts
'character.example.model': {
  type: 'model',
  url: '/assets/characters/example/model.glb',
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
  transform: { scale: 0.98, rotation: [0, Math.PI, 0] },
  fallback: 'placeholder',
}
```

`animations` maps game-facing names to candidate clip names. An `assetId` on a binding may point to a separate catalog entry of type `animation`. Attachments and material variations are descriptive data for later systems; this task does not apply them.

`portraitAssetId` remains optional definition metadata but is not used by the focused live 3D picker. See [Character picker](./character-picker.md) for current UI and lifecycle behavior.

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

The authored Casual model is `1.8235` units tall and uses scale `0.98`, producing a `1.7869`-unit visual with approximately `+0.0016` automatic foot offset. Punk is `1.9362` units tall and uses scale `0.92`, producing a `1.7813`-unit visual with approximately `+0.0040` automatic foot offset. Both therefore fit the player's `1.8`-unit-high, `0.38`-radius capsule while their transformed footprints remain within its `0.76`-unit diameter. Both use yaw rotation `[0, π, 0]` to match the player's local `+Z` facing convention; no manual vertical offset is needed.

The generated emergency placeholder remains covered by the same automatic bounds alignment path, but it is never presented as a picker choice.

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
