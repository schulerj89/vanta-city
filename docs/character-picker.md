# Character picker

## Flow and ownership

The character picker opens before the normal debug district and can be reopened in-place with `K` or the development command `ui.open-character-picker`. It transitions the existing runtime into `character-select`, suspending simulation while rendering and picker input continue. Confirming or cancelling returns to the prior game state without creating another runtime, world, player, renderer, registry, or selection store.

The screen deliberately shows one focused character and one live 3D preview. Left and right cycle exactly Casual and Punk; there is no card grid. Focus and the draft choice are transient picker state. `CharacterSelectionStore` remains the only confirmed selection owner and persists only on confirmation. `CharacterPlayerVisual` keeps listening to that store, so cycling previews neither reloads nor moves the player simulation.

The preview owns a separate character instance, animation mixer, scene, camera, and low-power WebGL renderer. Replacing or closing a preview stops and uncaches its mixer, disposes its character instance, and rejects late async loads by disposing them. If local loading fails, the existing generated character fallback keeps startup usable but never becomes a selectable third character.

## Controls

| Action                    | Keyboard                         | Mouse                    |
| ------------------------- | -------------------------------- | ------------------------ |
| Open picker               | `K`                              | Development command      |
| Previous / next character | Left / right arrows or `A` / `D` | Large arrow buttons      |
| Preview next pose         | `Space`                          | Preview next pose button |
| Confirm and enter         | `Enter`                          | Enter button             |
| Return / cancel           | `Escape` or Backspace            | Cancel button            |

These are named actions in `defaultBindings`; a future gamepad implementation can map the same actions through `InputReader` without changing picker code.

## Local models and preview animations

Both choices use the committed local GLBs and make no runtime network requests:

- `casual`: `casual-character.glb`
- `punk`: `punk-character.glb`

The preview playlist uses the inspected embedded clips `CharacterArmature|Idle_Neutral`, `CharacterArmature|Wave`, and `CharacterArmature|Interact`, exposed as `previewIdle`, `wave`, and `interact`. Clips play once, hold briefly, then cycle. Space advances immediately. The preview restores the loaded model root after every mixer update, so authored translation cannot move the presentation stage. Missing preview clips fall back to logical `idle`, then a static pose.

Availability probes local model URLs before selection. Missing files, remote URLs, catalog mistakes, and development-server HTML fallbacks are reported without crashing the screen. The picker shows model name, registry ID, position, load/fallback status, and current pose.

## Browser-test observability

`window.__VANTA_TEST__.snapshot().picker` reports open state; exactly registered, available, fallback, and unavailable IDs; focused, draft, and confirmed IDs; and picker preview state. Its nested `preview` snapshot reports requested and loaded character IDs, asset/fallback source, current and available logical animations, and disposal count.

Development browser smoke runs with `?e2e=1`, opens the picker through its public debug command, verifies one preview/no cards, changes model and pose with the keyboard, checks that the player position remains unchanged, and confirms through the existing selection store.
