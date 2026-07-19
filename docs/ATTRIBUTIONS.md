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

# Vanta City title and loading art

The Northbar title hero and Junction loading-road backgrounds are original
project assets created with OpenAI Image API model `gpt-image-2` for this
repository. They are not externally sourced and carry no third-party
attribution requirement. Accepted sources, local runtime derivatives, full
prompts, request settings, transformations, hashes, candidate decisions, and
originality review are documented in
`public/assets/presentation/vanta-title-loading/provenance.json`. Runtime uses
only the checked-in local JPEG derivatives.

# Civilian traffic vehicles

- **Pickup Truck, Sports Car, Sport Coupe, Family Sedan, Taxi Sedan, SUV, and
  Compact Wagon** by Quaternius, from the
  [Cars Bundle](https://poly.pizza/bundle/Cars-Bundle-FE5IWe6OMk) and original
  [Cars Pack](https://quaternius.com/packs/cars.html). Licensed
  [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
  The repository retains the complete legal code. Exact individual source
  records, original archive names, archive/file hashes, geometry counts,
  bounds, transforms, and the deliberate Police Car exclusion are recorded in
  `public/assets/vehicles/quaternius-cars/README.md`.

# Ashfall Night Service audio

The four radio music tracks are project-owner-created Suno outputs accepted for
Vanta City under the paid-plan creation timeline documented in
`public/assets/audio/ashfall-night-service/provenance.json`; they are not CC0.
The local station break is a project-configured ElevenLabs synthesis. Runtime
derivatives, source/runtime hashes, current terms evidence, technical findings,
and the non-warranty rights decision are documented beside the assets and in
`docs/audio/audio-001-downloaded-candidate-audit.json`. No provider credential
or configured voice identifier is committed.
