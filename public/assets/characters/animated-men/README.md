# Animated Men Pack NPC subset

Exactly three browser-ready GLBs from Quaternius's **Animated Men Pack** are
included for the fixed debug-district NPC roster. This is a separate Poly Pizza
bundle from the playable-character **Ultimate Modular Men Pack**.

Source: [Animated Men Pack on Poly Pizza](https://poly.pizza/bundle/Animated-Men-Pack-DAC9SDgMQT)

Creator: Quaternius

License: CC0 1.0 Universal / Public Domain. The bundle page, every model card,
and Poly Pizza's download notice identify the assets as CC0. A local copy of
the CC0 1.0 legal code is stored as `LICENSE-CC0-1.0.txt`.

## Acquisition and selected files

The GLB archive was downloaded through Poly Pizza's visible **Download GLTF**
control on 2026-07-16. The received `Animated Men Pack-glb.zip` is 731,471
bytes with SHA-256
`cf86f44cd44ed816d8d198fffa4ba2727f6b162fff8be19673df4a02cf149410`.
`unzip -t` passed for all four members. The unused plain `Man.glb` is not
committed.

| NPC  | Local file              | Original archive member                                      |   Bytes | SHA-256                                                            |
| ---- | ----------------------- | ------------------------------------------------------------ | ------: | ------------------------------------------------------------------ |
| Mack | `mack-long-sleeves.glb` | [`Man in Long Sleeves.glb`](https://poly.pizza/m/DLptRuewTn) | 503,988 | `48536b0e0ea375f0831dbf5154b4c2eafda8b6c9c19ba0996dd298f2fcc9164c` |
| Nox  | `nox-layered-shirt.glb` | [`Man-fjHyMd5Wxw.glb`](https://poly.pizza/m/fjHyMd5Wxw)      | 498,160 | `40c62848350df6d13cc6eed20f30c3406a7761542236d8a9f6c3a4060d005e97` |
| Raze | `raze-suit.glb`         | [`Man in Suit.glb`](https://poly.pizza/m/mQnGoME1ez)         | 583,416 | `31ff1539e7a9a209d4eb1107e696d798fedc7e35d84a58bbabfdc0f1b8b73763` |

No conversion was performed: filenames were normalized only. Each source GLB
is self-contained glTF 2.0 with embedded buffers/materials, no images or
external resource URLs, 31 bones, and 11 embedded animation clips.

## Embedded clip inventory

All three selected files contain the same inspected clips:

| Exact embedded name | Duration (seconds) |
| ------------------- | -----------------: |
| `HumanArmature      |      Man_Clapping` | 1.666667 |
| `HumanArmature      |         Man_Death` | 2.083333 |
| `HumanArmature      |          Man_Idle` | 4.166667 |
| `HumanArmature      |          Man_Jump` | 1.041667 |
| `HumanArmature      |         Man_Punch` | 0.916667 |
| `HumanArmature      |           Man_Run` | 0.875000 |
| `HumanArmature      |   Man_RunningJump` | 1.250000 |
| `HumanArmature      |       Man_Sitting` | 8.333333 |
| `HumanArmature      |      Man_Standing` | 0.833333 |
| `HumanArmature      |    Man_SwordSlash` | 1.041667 |
| `HumanArmature      |          Man_Walk` | 1.041667 |

Normal NPC mappings deliberately use only `Man_Idle` and the non-combat
`Man_Clapping` conversation gesture. The optional debug sparring target reuses
the Long Sleeves model and idle, while compatible get-hit tracks are loaded
from the separately attributed local Ultimate Modular Men animation asset.
Animation mixers target model subtrees; NPC and target world transforms remain
authoritative and stationary.

## Runtime transforms and validation

| NPC  | Uniform scale | Yaw |     Height | Foot offset | Transformed XZ footprint |
| ---- | ------------: | --: | ---------: | ----------: | ------------------------ |
| Mack |       `0.370` | `π` | `1.780423` |  `0.001589` | `0.524302 × 0.336656`    |
| Nox  |       `0.368` | `π` | `1.782327` |  `0.001091` | `0.525531 × 0.302465`    |
| Raze |       `0.369` | `π` | `1.781637` |  `0.001119` | `0.523974 × 0.340119`    |

The character validator resolves both exact mappings, finds 5/9/7 skinned
meshes respectively, measures zero horizontal root-bone translation for idle
and clapping (tolerance `0.05`), confirms grounded minimum Y after the listed
visual-only offsets, and passes three independent clone/disposal cycles per
model. The runtime additionally restores each loaded model root after mixer
updates. No NPC world transform is adjusted for presentation.
