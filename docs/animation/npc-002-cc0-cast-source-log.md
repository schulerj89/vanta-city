# NPC-002 CC0 animated cast source and rejection log

Research and retrieval date: 2026-07-19. The acceptance gate was local CC0 or
public-domain provenance, a production-intended low-poly model, exact idle and
locomotion clips for every retained cast member, and cast-level chair
sit/hold/stand plus a real dance. Applause was never accepted as dance.

## Accepted

| Source                                          | Retained result                               | License evidence                                                             | Technical decision                                                                                                               |
| ----------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Quaternius Ultimate Modular Men                 | Business, Beach, Farmer, Hoodie, Worker       | Official Quaternius page and Poly Pizza bundle both identify the pack as CC0 | Five distinct modern/workwear silhouettes; self-contained GLB; 24 clips each; no retargeting                                     |
| Quaternius Modular Character Outfits – Fantasy  | Ranger clothing subset                        | Official Quaternius and itch pages identify the pack as CC0                  | Identical Universal skeleton; retained clothed arms/body/legs/feet/hood, removed pauldrons, bracer, and two belt accessory nodes |
| Quaternius Universal Base Characters Standard   | Female head, eyes, and eyebrows only          | Archive license and official pack page state CC0                             | Identical 65-bone rest transforms; undressed torso and limb geometry rejected and pruned                                         |
| Quaternius Animated Women Pack                  | `Woman` plum fringe primitive                 | Poly Pizza bundle and each model card identify the pack as CC0               | Existing local asset; scalp cap omitted; fringe converted to meter scale and rigid Head weighting                                |
| Quaternius Universal Animation Library Standard | animation-only `UAL1_Standard.glb` derivative | Archive license and official itch page state CC0                             | Exact `Dance_Loop`, `Sitting_Enter`, `Sitting_Idle_Loop`, and `Sitting_Exit`; preview mannequin removed                          |

The composed `cast-performer` is a complete 1997 industrial/goth stage
silhouette: charcoal/black hooded layers, oxblood boots and quilted hip layer,
deep-plum closures and fringe, readable face/eyes/eyebrows, sleeves, hands,
leggings, and footwear. The low-metal, rough material response and removal of
armor accessories keep the source topology grounded for Ashfall rather than
fantasy-coded. All textures are local and capped at 1024 pixels.

The five ambient candidates intentionally do not claim seated or dance
coverage they do not possess. Only `cast-performer` exposes those logical
animations and performance intents. None of the six definitions appears in
`npcDefinitions`, so this task adds no world placement or spawn behavior.

## Rejected after local inspection

| Candidate                                                           | Archive SHA-256                                                    | Reason rejected                                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Universal Base Superhero Female as a standalone performer           | `fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40` | Initial visual audit exposed a bald, undressed base. The runtime asset was removed; only its fully textured head/eye/eyebrow geometry survives inside the clothed model |
| RG Poly Cartoon City Massive Pack Characters Free                   | `c34b3449aa887e612ce65591f4710308fbaec14b275154f6b8bc461f86143188` | Strong modern silhouettes and compatible shared rig, but its 48-clip animation file has no chair sequence or dance; retaining it would not close the performance gap    |
| Universal Animation Library OpenGameArt mirror (2025 legacy export) | `18ff1a7215f4852b320203e8aaf02a1578b5c8eef9027fbaedfcedc7b85a3ac2` | Older `DEF-*` skeleton is incompatible with Ultimate Modular Men; rejected instead of unverified retargeting                                                            |
| KayKit Character Animations 1.1 Free                                | `65882f31f905ad2e953819648a59287cdeab8f623908d5ef701971d3758be20f` | Excellent chair clips but current standard has no dance clip and its rig does not match the grounded cast                                                               |
| KayKit legacy Character Animations 1.2                              | `c9d3fbea492dc6edd0903939369a564c2240b892430bcd99e0aee4876110bb8f` | Includes genuine `Dance`, but only a four-bone legacy mannequin rig and no chair transition; rejected as a production cast shortcut                                     |
| KayKit Adventurers 2.0 Free                                         | `abe48f4763fba0896bab486ee9e6d08ca6b5b3884b9601f235c8847ae94dc479` | Compatible with current KayKit chair clips, but fantasy silhouettes fail Vanta City's 1997 grounded-cast fit                                                            |
| Quaternius Animated LowPoly Robot                                   | `5128d2cf906835895b931f6c1e764296ba2e01d3a30d809035fc6c1ee8a1c1ee` | Has dance/sitting/standing, but is a robot-only FBX/Blend asset and fails the grounded human-cast requirement                                                           |

## Validation and evidence outcome

`pnpm validate:characters --json docs/animation/npc-002-character-validation.json`
passes all 16 registered character definitions with zero warnings and zero hard
failures. The six cast definitions complete three instantiate/dispose preview
cycles through the existing validator.

The committed browser audit captures 40 unobstructed canvas images at
1280×720 and 390×844. Every cast member has idle and locomotion evidence while
idle/walk/run are asserted; the performer additionally has two distinct dance
beats, sit/hold/stand, and front/right/rear/left coverage. Exact visible
mesh/material assertions prevent the prior naked base, a missing head or hair,
an omitted garment, a placeholder, or a skipped viewport from passing. The
capture report records zero console errors, zero page errors, zero failed
runtime application requests, and zero external runtime requests. Expected
cancelled local `HEAD` probes are retained separately in the report rather than
silently discarded.
