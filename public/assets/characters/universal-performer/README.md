# Industrial venue performer

This directory contains one unplaced specialty performer and its compatible,
animation-only Universal Animation Library derivative. Together they provide
the cast's honest chair transition and genuine dance coverage; they are not an
ambient street spawn.

| Local file                        |      Bytes | Triangles | Runtime meshes | Materials | Textures | Clips | SHA-256                                                            |
| --------------------------------- | ---------: | --------: | -------------: | --------: | -------: | ----: | ------------------------------------------------------------------ |
| `venue-performer-industrial.glb`  | 10,794,316 |    25,806 |             10 |         6 |       11 |     0 | `2f0a8c546b19ec43b80d8db5eea48d2d9176ecdba22f8f9f8a192ab71ec7f5ce` |
| `universal-animation-library.glb` |  7,014,344 |         0 |              0 |         0 |        0 |    43 | `720740678f474e26802f73bb4f7ad1d1ede4f79741def1bd0e2df497cddd2ab0` |

The composed model validates at 1.798 m with scale `1`. The library is loaded
through the existing `CharacterLoader` external-animation binding. Its unused
13,744-triangle mannequin, skin, inverse-bind accessor, and materials were
removed; only the named animation targets and 43 clips remain.

Mapped production clips are exact upstream names:

- idle and locomotion: `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`
- chair sequence: `Sitting_Enter`, `Sitting_Idle_Loop`, `Sitting_Exit`
- genuine dance loop: `Dance_Loop`

## Source composition and visual decision

All retained components are Quaternius CC0 assets:

- **Modular Character Outfits – Fantasy Standard:** female Ranger arms,
  clothed body, leggings, boots, and hood;
- **Universal Base Characters Standard:** the matching female head, eyes, and
  eyebrows on the identical 65-bone Universal skeleton;
- **Animated Women Pack:** one plum fringe primitive, converted from that
  pack's authored `0.38` presentation scale and rigidly weighted to the
  matching Head joint;
- **Universal Animation Library Standard:** exact external performance clips.

The production derivative removes the Ranger pauldrons, bracer, two separate
belt accessory nodes, the Universal Base undressed torso/limb geometry, and the
Animated Women scalp-cap primitive. It retains a complete face, hair, sleeves,
hands, torso, leggings, and boots from every view. The original green/brown
Ranger palette is multiplied to charcoal, oxblood, and deep plum with a rough,
low-metal response. In Ashfall's 1997 setting, the hood, subdued closures,
quilted hip layer, dark leggings, plum fringe, and tall oxblood boots read as
restrained industrial/goth stagewear rather than fantasy armor.

Source textures were packed locally at a maximum 1024-pixel runtime
resolution. Unreferenced geometry, accessors, images, and texture maps were
pruned before packing. There are no external URIs or runtime network
dependencies.

Sources:

- <https://quaternius.com/packs/modularcharacteroutfitsfantasy.html>
- <https://quaternius.com/packs/universalbasecharacters.html>
- <https://poly.pizza/bundle/Animated-Women-Pack-HHSKxnk1mY>
- <https://quaternius.itch.io/universal-animation-library>

Creator: Quaternius

License: CC0 1.0 Universal. The official legal code is retained as
`LICENSE-CC0-1.0.txt`.

## Acquisition

- `modular-character-outfits-fantasy-standard.zip`, retrieved 2026-07-19,
  294,347,394 bytes, SHA-256
  `c3468b18871cc8c8f05ab14df7712baf22cb9f389cbd870babf130e595187f70`.
- `universal-base-characters-standard.zip`, retrieved 2026-07-19, 128,968,391
  bytes, SHA-256
  `fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40`.
- `Animated Women Pack-glb.zip`, retrieved 2026-07-18, 736,622 bytes,
  SHA-256
  `df6121faa621a264cc35a57bf3f88a98d4372e0ac4586f65cb3c49afcd425a81`.
- `universal-animation-library-standard.zip`, retrieved 2026-07-19,
  15,904,933 bytes, SHA-256
  `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724`.
