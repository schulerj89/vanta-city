# NPC-002 CC0 animated cast source and rejection log

Research and retrieval date: 2026-07-19. The acceptance gate was local CC0 or
public-domain provenance, a production-intended low-poly model, exact idle and
locomotion clips for every retained cast member, and cast-level chair
sit/hold/stand plus a real dance. Applause was never accepted as dance.

## Accepted

| Source                                          | Retained result                         | License evidence                                                             | Technical decision                                                                                                     |
| ----------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Quaternius Ultimate Modular Men                 | Business, Beach, Farmer, Hoodie, Worker | Official Quaternius page and Poly Pizza bundle both identify the pack as CC0 | Five distinct modern/workwear silhouettes; self-contained GLB; 24 clips each; no retargeting                           |
| Quaternius Universal Base Characters Standard   | Superhero Female Full Body              | Archive license and official pack page state CC0                             | Specialty venue-performer body; packed from local glTF resources to GLB without geometry or texture changes            |
| Quaternius Universal Animation Library Standard | `UAL1_Standard.glb`                     | Archive license and official itch page state CC0                             | Rig-compatible external source with exact `Dance_Loop`, `Sitting_Enter`, `Sitting_Idle_Loop`, and `Sitting_Exit` clips |

The five ambient candidates intentionally do not claim seated or dance
coverage they do not possess. Only `cast-performer` exposes those logical
animations and performance intents. None of the six definitions appears in
`npcDefinitions`, so this task adds no world placement or spawn behavior.

## Rejected after local inspection

| Candidate                                                           | Archive SHA-256                                                    | Reason rejected                                                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RG Poly Cartoon City Massive Pack Characters Free                   | `c34b3449aa887e612ce65591f4710308fbaec14b275154f6b8bc461f86143188` | Strong modern silhouettes and compatible shared rig, but its 48-clip animation file has no chair sequence or dance; retaining it would not close the performance gap |
| Universal Animation Library OpenGameArt mirror (2025 legacy export) | `18ff1a7215f4852b320203e8aaf02a1578b5c8eef9027fbaedfcedc7b85a3ac2` | Older `DEF-*` skeleton is incompatible with Ultimate Modular Men; rejected instead of unverified retargeting                                                         |
| KayKit Character Animations 1.1 Free                                | `65882f31f905ad2e953819648a59287cdeab8f623908d5ef701971d3758be20f` | Excellent chair clips but current standard has no dance clip and its rig does not match the grounded cast                                                            |
| KayKit legacy Character Animations 1.2                              | `c9d3fbea492dc6edd0903939369a564c2240b892430bcd99e0aee4876110bb8f` | Includes genuine `Dance`, but only a four-bone legacy mannequin rig and no chair transition; rejected as a production cast shortcut                                  |
| KayKit Adventurers 2.0 Free                                         | `abe48f4763fba0896bab486ee9e6d08ca6b5b3884b9601f235c8847ae94dc479` | Compatible with current KayKit chair clips, but fantasy silhouettes fail Vanta City's 1997 grounded-cast fit                                                         |
| Quaternius Animated LowPoly Robot                                   | `5128d2cf906835895b931f6c1e764296ba2e01d3a30d809035fc6c1ee8a1c1ee` | Has dance/sitting/standing, but is a robot-only FBX/Blend asset and fails the grounded human-cast requirement                                                        |

## Validation outcome

`pnpm validate:characters --json docs/animation/npc-002-character-validation.json`
passes all 16 registered character definitions with zero warnings and zero hard
failures. The six new definitions complete three instantiate/dispose preview
cycles through the existing validator. Browser E2E separately switches all
registered definitions, exercises idle/walk/run on every retained cast member,
and captures deterministic sit, seated hold, stand, and dance frames for the
venue performer.
