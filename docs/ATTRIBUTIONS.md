# Asset attributions and licenses

| Runtime asset              | Creator                             | Source                                                                                      | License                                                                 | Repository status       |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------- |
| Casual Character           | Quaternius                          | [Ultimate Modular Men Pack](https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ) | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) | `casual-character.glb`  |
| Punk                       | Quaternius                          | [Ultimate Modular Men Pack](https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ) | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) | `punk-character.glb`    |
| Mack / Man in Long Sleeves | Quaternius                          | [Animated Men Pack model](https://poly.pizza/m/DLptRuewTn)                                  | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) | `mack-long-sleeves.glb` |
| Nox / Man (layered shirt)  | Quaternius                          | [Animated Men Pack model](https://poly.pizza/m/fjHyMd5Wxw)                                  | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) | `nox-layered-shirt.glb` |
| Raze / Man in Suit         | Quaternius                          | [Animated Men Pack model](https://poly.pizza/m/mQnGoME1ez)                                  | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) | `raze-suit.glb`         |
| Handgun / Pistol           | Kenney Vleugels and Casper Jorissen | [Kenney Weapon pack](https://opengameart.org/content/weapon-pack)                           | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) | `handgun.glb`           |
| Knife Sharp                | Kenney Vleugels and Casper Jorissen | [Kenney Weapon pack](https://opengameart.org/content/weapon-pack)                           | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) | `knife.glb`             |

Poly Pizza's bundle, individual model records, and download notices identify both source packs as CC0/Public Domain. Each downloaded ZIP passed integrity testing but contained no license document, so the official CC0 legal code is committed beside each reviewed runtime subset. Detailed acquisition records, archive hashes, file hashes, sizes, clip inventories, transforms, and validation results are recorded in the adjacent asset README files.

The Kenney Weapon pack page identifies Kenney as the author/uploader and labels
the pack CC0. Its downloaded archive also includes a license file naming Kenney
Vleugels and Casper Jorissen and explicitly applying CC0; that text is committed
with normalized whitespace beside the two converted GLBs. The adjacent equipment README records the
download and source hashes, conversion, bounds, mesh/triangle/material/texture
counts, and runtime hashes.

The primitive fallback character is generated entirely from Three.js geometry and project-authored material settings. It is not selectable and exists only to keep startup and model-load failures safe. NPC portrait IDs remain optional project paths with no committed third-party images.

# Ashfall building materials

The five Ashfall facade/roof textures are original project assets created with OpenAI image generation for this repository. They are not externally sourced and carry no third-party attribution requirement. The committed local files, generation date, source output filenames, intent, prompt constraints, conversion, dimensions, hashes, and runtime-network policy are documented in `public/assets/environment/ashfall-buildings/README.md`. Runtime code loads only the local 512×512 derivatives.

# Civilian traffic vehicles

- **Pickup Truck** and **Sports Car** by Quaternius, from the
  [Cars Pack](https://quaternius.com/packs/cars.html). Licensed CC0 1.0
  Universal. Individual sources: [Pickup Truck](https://poly.pizza/m/qn4grQgHm8)
  and [Sports Car](https://poly.pizza/m/OyqKvX9xNh). Local hashes and geometry
  details are recorded in the asset folder README.
