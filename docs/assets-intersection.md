# Ashfall Junction environment assets

The intersection uses seven selected models from Quaternius's [Post Apocolypse Pack](https://poly.pizza/bundle/Post-Apocolypse-Pack-jg0We8Clu0) on Poly Pizza. The bundle mixes licenses, so Vanta City intentionally excludes its characters, animals, weapons, and vehicles. Each selected model page identifies the model as **CC0 1.0**; attribution is not legally required, but source records are retained here and in the level asset manifest. See the [CC0 legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en).

| Local file            | Model page                                         | SHA-256                                                            |  Bytes | Meshes / triangles | Source bounds (m)  |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------ | -----: | -----------------: | ------------------ |
| `crosswalk.glb`       | [Cross walk](https://poly.pizza/m/9zxw2NmVI6)      | `3c74672173a90e6f957fb9d2082cc9d51d0a7d975c5a22f55249ea58532a97e9` | 18,540 |            1 / 188 | 8.0 × 0.10 × 8.0   |
| `traffic-light.glb`   | [Traffic Light](https://poly.pizza/m/apWcPbwhlq)   | `95c345e7ed3a906facbef94d64c0f213bc48611e3491cd7c98e8812def186f2d` | 44,940 |            1 / 849 | 1.51 × 4.66 × 1.51 |
| `street-light.glb`    | [Street Light](https://poly.pizza/m/0lxF8Dl1jU)    | `38b165340c9037a2f42ac379dbf99901b56b03c313c054c9723e34cf2176e7f9` | 23,324 |            1 / 426 | 0.36 × 6.64 × 2.93 |
| `fire-hydrant.glb`    | [Fire Hydrant](https://poly.pizza/m/DKkMQbEklp)    | `15a7d2d6f462b2d819b0c8df22980a91e04233499b49b4c908b934df672a09cc` | 45,216 |            1 / 976 | 0.52 × 0.77 × 0.40 |
| `plastic-barrier.glb` | [Plastic Barrier](https://poly.pizza/m/QAiXMsbWRc) | `69b52543e2b8620ae87301c95c126ab0a9f92706d785ed2cb552e6c6d12102ea` | 46,016 |            1 / 852 | 1.04 × 0.60 × 0.33 |
| `broken-pallet.glb`   | [Pallet Broken](https://poly.pizza/m/dGcOK3Azfl)   | `ab76bec38409bfa03e759da2fa6f50efb6b30db16c34425886b1237ef2709919` | 23,472 |            1 / 216 | 0.92 × 0.16 × 1.22 |
| `trash-bags.glb`      | [Trash Bags](https://poly.pizza/m/eitNk4I4R1)      | `01fdade3dd549fcaa0715134f42bc049a12e478659599afcf7ef541bd5a42cca` | 79,540 |          1 / 2,088 | 0.91 × 0.53 × 0.52 |

The files are the browser-ready GLBs provided by Poly Pizza. Together they are 281,048 bytes, seven meshes, 5,595 triangles, and seven embedded textures. No conversion was necessary and no external URI remains. Their source scale is already meters after applying each file's authored node transform. Runtime instances use the level's logical asset IDs, positions, and rotations; the shared loader owns cached geometry/material/texture resources and disposes them when the application asset loader is disposed. Level unload removes cloned instances without disposing shared cache resources.

To update an asset, verify the individual model page's license, download its static GLB, record its hash/measurements here, add a logical descriptor to `testDistrict.assets`, and reference only that logical ID from the environment definition. Run the asset and level consistency tests before committing.
