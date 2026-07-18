# Kenney Weapon pack equipment

These browser-ready GLB files are local conversions of two models from
Kenney's **Weapon pack**. The source asset page identifies the uploader and
author as Kenney, labels the pack CC0, and describes the pack as optimized
low-poly models containing pistols and knives:

- Source: <https://opengameart.org/content/weapon-pack>
- Creator credit in the included source license: Kenney Vleugels and Casper
  Jorissen (Kenney.nl)
- License: CC0 1.0 Universal
- License URL: <https://creativecommons.org/publicdomain/zero/1.0/>
- Downloaded archive: `weaponPack_assets.zip`, 2,412,550 bytes, SHA-256
  `048aab5f585e9dfc146ba70e49fa0c0007b536ed7335c5f67928472088f039b3`
- Conversion: `obj2gltf` binary GLB output; source MTL colors are embedded and
  no textures or external runtime resources are referenced.

| Runtime file  | Source files                                 |  Bytes | SHA-256                                                            | Meshes | Triangles | Materials | Textures | Source bounds (m)         |
| ------------- | -------------------------------------------- | -----: | ------------------------------------------------------------------ | -----: | --------: | --------: | -------: | ------------------------- |
| `handgun.glb` | `Models/pistol.obj` + `pistol.mtl`           | 24,164 | `d5d97d022b96d297171bce94dff5e8913230095c9271eec81133d6252dff66bd` |      2 |       350 |         3 |        0 | `0.009 × 0.036 × 0.0462`  |
| `knife.glb`   | `Models/knife_sharp.obj` + `knife_sharp.mtl` | 11,672 | `d2ed34ad2bc09f40f4f6918163dadcb34771a18764c67c99fa5cc38893cfd4c8` |      1 |        98 |         4 |        0 | `0.009 × 0.0552 × 0.0138` |

Source checksums:

| File              |  Bytes | SHA-256                                                            |
| ----------------- | -----: | ------------------------------------------------------------------ |
| `pistol.obj`      | 20,808 | `8f65f2d12b5050da9314bedbd756030b17e7cb63d5d34ff3235bb790b1f8733d` |
| `pistol.mtl`      |    428 | `2ce67f1d3aee0c1d9ed08a50888844cea3746f1ff7dd8d8a73483a2a8901003c` |
| `knife_sharp.obj` |  7,889 | `5a1ad8ce28dbc73ff62df8625152108dfca1b03a663f9a326e136119cfc832f8` |
| `knife_sharp.mtl` |    541 | `40af99b87442d7ffa2f4048d6e2d94ebce40c9d5043995817b612773dc8ebc2d` |

`LICENSE-CC0-1.0.txt` preserves the source license text with repository-standard
LF line endings and whitespace. Credit is not required by CC0, but the catalog
retains creator and source attribution.
