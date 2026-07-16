# Asset attributions and licenses

| Runtime asset    | Creator    | Source                                                                                      | License                                                                 | Repository status                  |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------- |
| Casual Character | Quaternius | [Ultimate Modular Men Pack](https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ) | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) | Included as `casual-character.glb` |
| Punk             | Quaternius | [Ultimate Modular Men Pack](https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ) | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) | Included as `punk-character.glb`   |

Poly Pizza's bundle and individual model records list both selected files as
CC0 1.0. The downloaded GLB ZIP passed integrity testing but did not contain a
license document; the official CC0 legal code is therefore committed as
`public/assets/characters/ultimate-modular-men/LICENSE-CC0-1.0.txt`. Detailed
archive and file hashes are recorded in the adjacent asset README.

The same source pack remains registered for optional Worker, Hoodie Character,
and Punk NPC models, but those separate NPC paths are not included by this
change and retain their generated fallback behavior.

The primitive fallback character is generated entirely from Three.js geometry
and project-authored material settings; it has no external asset dependency.
It is not a selectable character and exists only to keep startup and model-load
failure paths safe. NPC portrait IDs point to optional project paths with no
committed third-party images.
