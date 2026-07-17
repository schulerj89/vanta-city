# Equipment, quickbar, roll, and death

`CharacterEquipment` is a composition-owned loadout component. It stores an owner ID and the currently equipped definition, emits typed `changed` and `used` events, and accepts a `CharacterActionSink` or typed trigger callback. Player and NPC owners use the same component; visual GLTF nodes never own inventory state. `EquipmentDefinition` separately owns item identity, label/icon, quickbar slot, generated-prop type, compatible action/locomotion names, and per-rig socket presentation. `EquipmentPresentation` is disposable and may be rebound when the owner's visual changes.

The player quickbar is a player-only projection of that shared loadout. It has exactly two non-blocking square slots: `1` Handgun and `2` Knife. Pressing a slot's number equips it; pressing the selected number again unequips it. `U` / gamepad RT uses the equipped item. `B` / gamepad LB requests Roll. These inputs are centralized named actions, so gameplay does not react while a text field or Help, picker, dialogue, or pause owns input. The quickbar uses live status semantics and shrinks below `560px` width or `500px` height.

## Definitions and presentation

The props use local Three.js low-poly geometry and materials. No model, texture, or runtime network request is involved.

| Item    | Slot | Use          | Equipped idle/run        | Rig socket and transform                                                                           |
| ------- | ---: | ------------ | ------------------------ | -------------------------------------------------------------------------------------------------- |
| Handgun |    1 | `gunFire`    | `gunIdle` / `gunRun`     | Ultimate Men `WristR`; position `(0.0002, 0.0002, -0.0008)`, rotation `(π/2, 0, π)`, scale `0.009` |
| Knife   |    2 | `knifeSlash` | `knifeIdle` / normal run | Ultimate Men `WristR`; position `(0.0001, 0.0003, -0.0012)`, rotation `(0, 0, π/2)`, scale `0.009` |
| Knife   |    2 | `knifeSlash` | NPC idle                 | Animated Men `PalmR`; position `(0, 0.0005, -0.0025)`, rotation `(0, 0, π/2)`, scale `0.024`       |

Both source armatures give their hand bones an inherited scale of approximately `100`; these explicit local transforms compensate for that convention without changing the authoritative character/world transform. Handgun is intentionally incompatible with the current Animated Men NPC rig until it receives a reviewed presentation and compatible native firearm clips. Incompatible or absent sockets report a visible debug fallback and create no prop. Every equip, unequip, character replacement, NPC removal, and disposal releases generated geometry and materials. A successful handgun use emits an 80 ms presentation-only muzzle flash; it does not create ammo, reload, projectiles, ballistics, or damage simulation.

## Native animation mappings and fallback

Casual and Punk embed the same inspected clips:

- `death` → `CharacterArmature|Death` (`1.0417s`)
- `roll` → `CharacterArmature|Roll` (`1.3333s`)
- `gunIdle` → `CharacterArmature|Idle_Gun` (`1.6667s`)
- `gunFire` → preferred `CharacterArmature|Idle_Gun_Shoot` (`0.6667s`), authored fallback `CharacterArmature|Gun_Shoot` (`0.5833s`)
- `gunRun` → `CharacterArmature|Run_Shoot` (`0.8333s`)
- `knifeIdle` → `CharacterArmature|Idle_Sword` (`1.6667s`)
- `knifeSlash` → `CharacterArmature|Sword_Slash` (`1.0s`)

The Animated Men NPC rigs embed `HumanArmature|Man_Death` (`2.0833s`) and `HumanArmature|Man_SwordSlash` (`1.0417s`); the latter is Mack's deterministic debug equipment fixture. Definitions map only native clips on their own rig; there is no cross-retargeting. Missing equipment idle/run clips fall back to normal idle/run, and missing use/roll clips reject through the existing action state. The animation graph gives depleted state priority over reactions, actions, and locomotion. Scene-root position tracks are stripped by the existing loader and the presentation root is restored each frame, so Roll is deliberately in place and grants no invulnerability.

Health depletion cancels the active action, halts horizontal player velocity, gates locomotion/equipment/actions, and selects a native death clip when present. A model without a mapped native death gets a deterministic 1.5 s blinking fade on cloned character presentation materials. Reset/revive, visual replacement, and disposal restore original material references and dispose the clones; equipped prop materials are separately owned and excluded from the death clone set. Development commands `player.health-deplete`, `player.health-reset`, `sparring-target.health-deplete`, and `sparring-target.reset` provide repeatable validation.

## Public and debug surfaces

- `CharacterEquipment.equip`, `unequip`, `toggleQuickbarSlot`, `use`, `useWithTrigger`, `getSnapshot`, and typed events are owner-agnostic.
- `PlayerControllerSystem.useEquippedItem`, `toggleQuickbarSlot`, and `triggerCharacterAction` enforce health/action gates.
- `NpcSystem.equip` and `useEquipment` validate shared ownership without adding navigation, combat AI, or inventory AI.
- Browser/debug snapshots expose loadout sequences, prop compatibility/socket/lifecycle, muzzle flash, animation graph, depleted state, native/fallback death materials, and quickbar state through existing registries.
