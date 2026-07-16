# Character picker

## Flow and ownership

The character picker opens before the normal debug district and can be reopened in-place with `K` or the development command `ui.open-character-picker`. It transitions the existing runtime into `character-select`, which suspends simulation while rendering and picker input continue. Confirming or cancelling returns to the prior game state without creating another runtime, world, player, renderer, character registry, or selection store.

Picker focus and its draft choice are transient UI state. `CharacterSelectionStore` remains the only confirmed selection owner and persists its existing versioned preference only when the player confirms. `CharacterPlayerVisual` continues listening to that store, so confirmation replaces the player presentation through the established asynchronous, stale-load-safe path.

Development browser smoke runs with `?e2e=1`, which starts directly in the district so the existing gameplay smoke suite remains deterministic. The picker is then opened through its public debug command for dedicated coverage.

## Controls

| Action                   | Keyboard                         | Mouse                           |
| ------------------------ | -------------------------------- | ------------------------------- |
| Open picker              | `K`                              | Development command             |
| Previous / next          | Left / right arrows or `A` / `D` | Previous / Next buttons         |
| Select focused character | `Space`                          | Character card or Select button |
| Confirm and enter        | `Enter`                          | Enter button                    |
| Return / cancel          | `Escape` or Backspace            | Return / close button           |

These are named actions in `defaultBindings`; a future gamepad implementation can map the same actions through `InputReader` without changing picker code.

## Availability and previews

Every validated definition in `characterDefinitions` appears. Definitions without external models are immediately available. Model-backed definitions receive a local-only `HEAD` probe against their registered model asset. Missing files, HTML development-server fallbacks, wrong catalog types, and remote URLs produce an unavailable card without loading the full model or crashing the picker.

Only portraits are displayed in the grid and selected preview. No runtime screenshots are generated and the picker does not instantiate every model. Explicit portrait textures use normal browser caching; characters without one receive a deterministic generated silhouette and initials. The existing player visual and asset cache load only the confirmed character model.

The current catalog contains:

- `vanta-placeholder`: available, generated portrait.
- `modular-man`: generated portrait; available when its locally registered GLB is installed, otherwise visibly unavailable.

## Registering a portrait

First register a local texture in `src/assets/catalog.ts`:

```ts
'character.modular-man.portrait': {
  type: 'texture',
  url: '/assets/characters/ultimate-modular-men/portrait.webp',
},
```

Then reference its logical ID from the existing definition in `src/characters/characters.ts`:

```ts
{
  id: 'modular-man',
  displayName: 'Modular Man',
  portraitAssetId: 'character.modular-man.portrait',
  // existing model, animation, and transform fields…
}
```

Portrait URLs must remain local. Character asset validation checks that the referenced ID exists and is a texture. A missing or failed portrait falls back to the generated treatment while leaving model availability unchanged.

## Browser-test observability

`window.__VANTA_TEST__.snapshot().picker` reports:

- whether the picker is open;
- registered, available, and unavailable character IDs;
- focused, draft-selected, and confirmed character IDs;
- preview state: `idle`, `checking`, `loading`, `ready`, `unavailable`, or `failed`.
