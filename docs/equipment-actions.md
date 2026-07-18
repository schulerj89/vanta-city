# Equipment, quickbar, roll, and death

`CharacterEquipment` is a composition-owned loadout component. It stores an owner ID, authoritative item entitlements, and the currently equipped definition; emits typed ownership, `changed`, and `used` events; and accepts a `CharacterActionSink` or typed trigger callback. Catalog membership alone no longer means ownership, and equip/quickbar requests reject unowned items. The player starts with the knife while generic/NPC fixtures retain the prior full-catalog default. The fixed two-slot player quickbar renders unowned items as locked. Player and NPC owners use the same component; visual GLTF nodes never own inventory state. `EquipmentDefinition` separately owns item identity, label/icon, quickbar slot, fallback-prop type, local model transform, compatible action/locomotion names, and per-rig socket presentation. `EquipmentPresentation` is disposable and may be rebound when the owner's visual changes. See [player money and equipment acquisition](./player-money.md) for the test handgun purchase policy.

The player quickbar is a player-only projection of that shared loadout. It has exactly two non-blocking square slots: `1` Handgun and `2` Knife. Pressing a slot's number equips it; pressing the selected number again unequips it. `U` / gamepad RT uses the equipped item, and holding it repeats only Handgun shots. `T` / D-pad down reloads without stealing the `R` run toggle. `B` / gamepad LB requests Roll. These inputs are centralized named actions, so gameplay does not react while a text field or Help, picker, dialogue, cinematic, or pause owns input. The quickbar renders local CSS weapon silhouettes, exposes accessible item/ammunition labels, and shrinks below `560px` width or `500px` height.

## Definitions and presentation

The primary props are self-contained local low-poly GLBs with no textures or runtime network requests. Project-authored Three.js geometry and materials remain as the load-failure fallback and handgun muzzle flash.

| Item    | Slot | Use          | Equipped idle/run        | Rig socket and transform                                                                           |
| ------- | ---: | ------------ | ------------------------ | -------------------------------------------------------------------------------------------------- |
| Handgun |    1 | `gunFire`    | `gunIdle` / `gunRun`     | Ultimate Men `WristR`; position `(0.0002, 0.0002, -0.0008)`, rotation `(π/2, 0, π)`, scale `0.009` |
| Knife   |    2 | `knifeSlash` | `knifeIdle` / normal run | Ultimate Men `WristR`; position `(0.0001, 0.0003, -0.0012)`, rotation `(0, 0, π/2)`, scale `0.009` |
| Knife   |    2 | `knifeSlash` | NPC idle                 | Animated Men `PalmR`; position `(0, 0.0005, -0.0025)`, rotation `(0, 0, π/2)`, scale `0.024`       |

Both source armatures give their hand bones an inherited scale of approximately `100`; these explicit local transforms compensate for that convention without changing the authoritative character/world transform. Handgun is intentionally incompatible with the current Animated Men NPC rig until it receives a reviewed presentation and compatible native firearm clips. Incompatible or absent sockets report a visible debug fallback and create no prop. Every equip, unequip, character replacement, NPC removal, and disposal releases the model instance plus any generated fallback geometry and materials. A successful handgun use consumes one of 8 owner-persistent rounds and emits an 80 ms presentation-only muzzle flash. The `0.72s` repeat cadence is longer than the preferred native `0.6667s` shot clip, so every accepted animation completes before another begins. Release or modal entry disarms the hold instead of buffering it. Empty use emits one bounded typed dry-fire event without consuming below zero or playing a fake shot. Reload is rejected while a shot/hold is active and restores the equipped handgun to capacity. There are no pickups, projectiles, ballistics, recoil simulation, or enemy AI.

The visible handgun and knife are local GLB instances from Kenney's CC0 Weapon
pack. The loader cache owns source geometry/materials; each presentation owns and
disposes only its cloned scene instance. While the model is loading—or if it
fails—the prior procedural mesh remains visible. Successful load swaps only the
presentation content, never the socket, character root, or simulation transform.
Asset-space alignment is explicit: handgun position `(0.04, -0.04, -0.215)`,
rotation `(0, 3.15, 1.5)`, scale `5`; knife position `(0.1, 0.105, 0.105)`,
rotation `(0.25, -0.05, 0)`, scale `6`. The source-centered meshes are thereby
rebased onto their grips. Full provenance, hashes, size, bounds, and mesh
metrics are recorded beside the files in
`public/assets/equipment/kenney-weapon-pack/README.md`.

## Native animation mappings and fallback

Casual and Punk embed the same inspected clips:

- `death` → `CharacterArmature|Death` (`1.0417s`)
- `roll` → `CharacterArmature|Roll` (`1.3333s`)
- `gunIdle` → `CharacterArmature|Idle_Gun` (`1.6667s`)
- `gunFire` → preferred `CharacterArmature|Idle_Gun_Shoot` (`0.6667s`), authored fallback `CharacterArmature|Gun_Shoot` (`0.5833s`)
- `gunRun` → `CharacterArmature|Run_Shoot` (`0.8333s`)
- `knifeIdle` → `CharacterArmature|Idle_Sword` (`1.6667s`)
- `knifeSlash` → `CharacterArmature|Sword_Slash` (`1.0s`)

The Animated Men NPC rigs embed `HumanArmature|Man_Death` (`2.0833s`) and `HumanArmature|Man_SwordSlash` (`1.0417s`); the latter is Mack's deterministic debug equipment fixture. Definitions map only native clips on their own rig; there is no cross-retargeting. Missing equipment idle/run clips fall back to normal idle/run, and missing use/roll clips reject through the existing action state. The animation graph gives depleted state priority over reactions, actions, and locomotion. Scene-root position tracks are stripped by the existing loader and the presentation root is restored each frame. Roll instead captures camera-relative movement intent at admission and locks that world direction; neutral input uses authoritative facing. The game-owned smoothstep curve travels up to `3m` over `0.75s` of the `1.3333s` clip through the existing swept character collision/grounding controller. A wall or loss of walkable ground ends translation early while the animation lock completes normally. It never translates from root motion and grants no invulnerability.

Health depletion cancels the active action, halts horizontal player velocity, gates locomotion/equipment/actions, and selects a native death clip when present. A model without a mapped native death gets a deterministic 1.5 s blinking fade on cloned character presentation materials. Reset/revive, visual replacement, and disposal restore original material references and dispose the clones; equipped prop materials are separately owned and excluded from the death clone set. Development commands `player.health-deplete`, `player.health-reset`, `sparring-target.health-deplete`, and `sparring-target.reset` provide repeatable validation.

## Public and debug surfaces

- `CharacterEquipment.equip`, `unequip`, `toggleQuickbarSlot`, `use`, `useWithTrigger`, `canUse`, `consume`, `getAmmunition`, `reload`, `resetAmmunition`, `getSnapshot`, and typed change/use/ammunition/reload/dry-fire events are owner-agnostic.
- `PlayerControllerSystem.useEquippedItem`, `reloadEquippedItem`, `toggleQuickbarSlot`, and `triggerCharacterAction` enforce health/state/action gates.
- `PlayerControllerSystem.getLocomotionSnapshot()` exposes the stable movement, facing, firearm readiness/firing state, action lock, and visual base/overlay projection used by weapon integration.
- `NpcSystem.equip` and `useEquipment` validate shared ownership without adding navigation, combat AI, or inventory AI.
- Browser/debug snapshots expose locked roll direction/distance/blocking, fire hold/cadence/shot count/rejection, ammunition/reload/dry-fire state, equipped label/icon, prop compatibility/socket/lifecycle, muzzle flash, animation graph, depleted state, native/fallback death materials, and quickbar state through existing registries.
