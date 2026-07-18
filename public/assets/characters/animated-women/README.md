# Animated Women Pack pedestrian cast

Four browser-ready GLBs from Quaternius's **Animated Women Pack** are included
as the production ambient-pedestrian presentation library for Ashfall Junction.
They are locally hosted and never loaded from the network at runtime.

- Source: [Animated Women Pack on Poly Pizza](https://poly.pizza/bundle/Animated-Women-Pack-HHSKxnk1mY)
- Original creator: Quaternius
- License: CC0 1.0 Universal / Public Domain
- License verification: the source page labels the bundle `Public Domain (CC0)`
  and each of its four model cards `CC0`; the visible download notice permits
  personal and commercial use. A local copy of the CC0 1.0 legal code is
  stored as `LICENSE-CC0-1.0.txt`.

## Acquisition and files

The GLB archive was retrieved through Poly Pizza's visible **Download GLTF**
control on 2026-07-18. The received `Animated Women Pack-glb.zip` is 736,622
bytes with SHA-256
`df6121faa621a264cc35a57bf3f88a98d4372e0ac4586f65cb3c49afcd425a81`.
`unzip -t` passed for all four members.

| Local file     | Original archive member |   Bytes | SHA-256                                                            |
| -------------- | ----------------------- | ------: | ------------------------------------------------------------------ |
| `casual.glb`   | `Woman Casual.glb`      | 586,108 | `99c4df0aaabd19022809facc68f5fb5f564d35df3a9893c273a31fdaacf68e96` |
| `street.glb`   | `Woman.glb`             | 510,392 | `bae371b11e0dcd5dbd26442025567ca9f7041781f3410259d6ec379bffcbac27` |
| `tank-top.glb` | `Woman in Tank Top.glb` | 540,404 | `9809532f4562ebfd3976bd96eeebd1efc1008d781aa71a15048db5bf5ae7344c` |
| `dress.glb`    | `Woman in Dress.glb`    | 481,600 | `53db49ba84193beb60173e94396764c86f7805752582a81dfdfd7f0889a10783` |

No geometry, material, skeleton, or animation conversion was performed.
Modifications are limited to normalized local filenames. Each source GLB is a
self-contained glTF 2.0 file with embedded buffers and no external resource or
network URL.

## Embedded animations

All four files contain the same inspected clip inventory:

| Exact embedded name                 | Duration (seconds) |
| ----------------------------------- | -----------------: |
| `HumanArmature\|Female_Clapping`    |           1.666667 |
| `HumanArmature\|Female_Death`       |           2.083333 |
| `HumanArmature\|Female_Idle`        |           4.166667 |
| `HumanArmature\|Female_Jump`        |           1.041667 |
| `HumanArmature\|Female_Punch`       |           0.916667 |
| `HumanArmature\|Female_Run`         |           0.875000 |
| `HumanArmature\|Female_RunningJump` |           1.250000 |
| `HumanArmature\|Female_Sitting`     |           8.333333 |
| `HumanArmature\|Female_Standing`    |           0.833333 |
| `HumanArmature\|Female_SwordSlash`  |           1.041667 |
| `HumanArmature\|Female_Walk`        |           1.041667 |

Production mappings deliberately expose `Female_Idle` as logical `idle` and
the non-combat `Female_Clapping` clip as logical `gesture`, providing both
ambient and interaction coverage without adding dialogue, missions, or AI.

## Transform contract

The source models use Y-up, face source -Z, and are authored at approximately
4.64 source units tall. Each `CharacterDefinition` applies a uniform `0.38`
presentation scale and a `π` yaw correction, producing a game-facing +Z
orientation and a grounded height of approximately 1.76–1.77 m. The shared
visual-alignment root moves the transformed minimum Y to the contact plane;
the authoritative pedestrian world transform remains unchanged.

The character validator checks exact clip mappings, skeletons, finite bounds,
grounding, stationary animation roots, and three independent clone/disposal
cycles. The character animation lab exposes all four definitions with model,
animation, view, timeline, speed, loop, skeleton, bounds, alignment, and
persistent transform controls.
