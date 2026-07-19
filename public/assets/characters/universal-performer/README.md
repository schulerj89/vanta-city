# Universal venue performer

This directory contains one unplaced specialty performer and its compatible
external animation library. It supplies the cast's honest chair transition and
genuine dance coverage; it is not an ambient street spawn.

| Local file                        |      Bytes | Triangles | Runtime meshes | Materials | Textures | Clips | SHA-256                                                            |
| --------------------------------- | ---------: | --------: | -------------: | --------: | -------: | ----: | ------------------------------------------------------------------ |
| `superhero-female.glb`            | 16,041,444 |    15,060 |              3 |         3 |        7 |     0 | `2adc1487aa6591c1c60d72a37d6ef660ad5636572a4b3b6f1a6ce38f4d79e27e` |
| `universal-animation-library.glb` |  7,618,436 |    13,744 |              1 |         2 |        0 |    43 | `69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997` |

The model validates at 1.775 m with scale `1`. The library is loaded through
the existing `CharacterLoader` external-animation binding; the animation
library's preview mesh is never instantiated.

Mapped production clips are exact upstream names:

- idle and locomotion: `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`
- chair sequence: `Sitting_Enter`, `Sitting_Idle_Loop`, `Sitting_Exit`
- genuine dance loop: `Dance_Loop`

The source model shipped as glTF plus local PNG/bin resources. It was packed
losslessly into one GLB so the browser and validator share a local-only asset;
geometry, textures, skeleton, material values, and node names were unchanged.
The source archive's incorrect eye-normal URI spelling was resolved while
packing against the included `T_Eye_Normal.png` file.

Sources:

- <https://quaternius.com/packs/universalbasecharacters.html>
- <https://quaternius.itch.io/universal-animation-library>

Creator: Quaternius

License: CC0 1.0 Universal. The official legal code is retained as
`LICENSE-CC0-1.0.txt`.

## Acquisition

- `universal-base-characters-standard.zip`, retrieved 2026-07-19, 128,968,391
  bytes, SHA-256
  `fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40`.
- `universal-animation-library-standard.zip`, retrieved 2026-07-19,
  15,904,933 bytes, SHA-256
  `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724`.
