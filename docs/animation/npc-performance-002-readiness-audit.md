# NPC-PERFORMANCE-002 — animation and close-up readiness audit

## Verdict

The current cast is technically healthy but not yet a cinematic performance cast.
All eight reviewed production GLBs load locally, validate, ground, clone, and dispose
cleanly. Rook has useful locomotion plus two noncombat gestures. The seven
Animated Men/Women models share a compatible rig and contain usable idle, walk,
run, seated, and stand-transition material. None of the eight assets has facial
bones or morph targets, however, and none of the NPC definitions exposes a
speaking, listening, thought, tension, reaction, or prop-performance intent.

The immediate semantic defect is authoritative and reproducible: `gesture` maps
to a full-body applause clip. Mack plays it when his conversation begins. The four
pedestrian definitions also advertise applause as their only interaction. Clapping
must not be used as a generic gesture or missing-animation fallback.

Recommended production use:

- Retain Rook for the new scene. Use medium close-ups, neutral holds, walk, turn,
  `Interact`, and `Wave` only where those exact meanings fit.
- Retain Mack, Nox, and Raze for brief medium shots and silent/listening holds after
  their orientation and performance mappings are corrected. Do not use their
  current applause clip for dialogue.
- Promote the four pedestrians only as background/medium-shot extras. They are not
  speaking-close-up performers.
- Acquire new focal assets for any new role expected to carry a sustained close-up,
  nuanced conversation, prop business, or readable emotional turn. Existing
  pedestrian variations must not be recast as story characters merely because they
  are available.

## Scope and evidence method

The audit covers these committed local GLBs:

| Participant / role  | Character definition  | Local GLB                                                            |
| ------------------- | --------------------- | -------------------------------------------------------------------- |
| Rook                | `casual`              | `public/assets/characters/ultimate-modular-men/casual-character.glb` |
| Mack                | `npc-worker`          | `public/assets/characters/animated-men/mack-long-sleeves.glb`        |
| Nox                 | `npc-hoodie`          | `public/assets/characters/animated-men/nox-layered-shirt.glb`        |
| Raze                | `npc-punk`            | `public/assets/characters/animated-men/raze-suit.glb`                |
| Casual pedestrian   | `pedestrian-casual`   | `public/assets/characters/animated-women/casual.glb`                 |
| Street pedestrian   | `pedestrian-street`   | `public/assets/characters/animated-women/street.glb`                 |
| Tank-top pedestrian | `pedestrian-tank-top` | `public/assets/characters/animated-women/tank-top.glb`               |
| Dress pedestrian    | `pedestrian-dress`    | `public/assets/characters/animated-women/dress.glb`                  |

`scripts/animation/audit-npc-performances.ts` parses the committed GLBs through
Three.js, independent of README clip declarations. Its deterministic output is
`docs/animation/npc-performance-002-clip-inventory.json`. The report records exact
clip names and durations, track types, animated-bone coverage, first/last pose
closure, scene/skeleton/body-root translation, bounds, scale, logical mappings,
geometry/material counts, face controls, and rig hierarchy hashes.

`scripts/animation/capture-npc-performance-evidence.ts` drives the development-only
Character/Animation Lab at 1280×720 through its public bridge. It captures exact
idle, close-up, applause, walk, sit, stand, `Interact`, and `Wave` poses with the
lab cross-fade set to zero so the requested clip—not the previous idle—is the
evidence pose. Its deterministic state/error manifest is
`docs/screenshots/npc-performance-002/capture-report.json`.

No production asset, NPC definition, cinematic definition, story data, or runtime
NPC/cinematic system was changed by this audit.

## Programmatic asset findings

### Rig, scale, geometry, and face controls

| Character             | Runtime height | Triangles | Materials | Bones | Facial bones | Morph targets |
| --------------------- | -------------: | --------: | --------: | ----: | -----------: | ------------: |
| Rook / `casual`       |        1.787 m |     5,776 |         9 |    62 |            0 |             0 |
| Mack / `npc-worker`   |        1.780 m |     1,970 |         5 |    31 |            0 |             0 |
| Nox / `npc-hoodie`    |        1.782 m |     1,854 |         9 |    31 |            0 |             0 |
| Raze / `npc-punk`     |        1.782 m |     2,058 |         7 |    31 |            0 |             0 |
| `pedestrian-casual`   |        1.762 m |     2,776 |         8 |    31 |            0 |             0 |
| `pedestrian-street`   |        1.768 m |     2,004 |        10 |    31 |            0 |             0 |
| `pedestrian-tank-top` |        1.769 m |     1,983 |         7 |    31 |            0 |             0 |
| `pedestrian-dress`    |        1.769 m |     1,786 |         5 |    31 |            0 |             0 |

Rook forms one 62-bone rig family. Mack, Nox, Raze, and all four women have the
same 31-bone hierarchy hash. The shared rig makes authored mapping behavior
consistent across those seven files, but it does not make an unreviewed clip
semantically appropriate. All assets use embedded solid-color materials and zero
textures, so they have low memory cost but show strong polygon facets and specular
hotspots at close range.

The only face-adjacent controls are `Neck` and `Head`. There are no eye, jaw,
mouth, lip, brow, or cheek controls and no morph targets. Eye, brow, mouth, and
hair geometry are static. Subtitle-led acting is possible only through held body
pose, participant facing, camera angle, lighting, and line timing.

### Clip coverage

Rook has 24 discovered clips. Relevant verified material:

| Intent                     | Exact source clip                               | Duration |       Coverage | Loop / root note                                      |
| -------------------------- | ----------------------------------------------- | -------: | -------------: | ----------------------------------------------------- |
| Neutral                    | `CharacterArmature\|Idle`                       |  1.667 s |    21/62 bones | Closed; body XZ 0                                     |
| Neutral preview            | `CharacterArmature\|Idle_Neutral`               |  1.667 s |    24/62 bones | Closed; body XZ 0.000006 source units                 |
| Walk                       | `CharacterArmature\|Walk`                       |  1.333 s |    34/62 bones | Closed; body XZ 0.008803                              |
| Run                        | `CharacterArmature\|Run`                        |  0.792 s |    50/62 bones | Endpoint is not mechanically closed; body XZ 0.009417 |
| Point / practical interact | `CharacterArmature\|Interact`                   |  1.250 s |    23/62 bones | Closed one-shot                                       |
| Greeting / acknowledgment  | `CharacterArmature\|Wave`                       |  1.667 s |    22/62 bones | Closed one-shot                                       |
| Raw physical reaction      | `CharacterArmature\|HitRecieve`, `HitRecieve_2` |  0.542 s | 17–18/62 bones | Discovered but not logically mapped for cinematic use |

The Animated Men and Women packs each expose the same eleven semantic clips with
gendered names. Relevant verified material:

| Intent                       | Exact Men / Women clip                            |      Duration |                  Coverage | Loop / root note                                                        |
| ---------------------------- | ------------------------------------------------- | ------------: | ------------------------: | ----------------------------------------------------------------------- |
| Neutral                      | `HumanArmature\|Man_Idle` / `Female_Idle`         |       4.167 s | Men 12–14/31; women 10/31 | Closed; body XZ 0                                                       |
| Walk                         | `HumanArmature\|Man_Walk` / `Female_Walk`         |       1.042 s |                     21/31 | Closed; body XZ 0.013527                                                |
| Run                          | `HumanArmature\|Man_Run` / `Female_Run`           |       0.875 s |                     17/31 | Closed; body XZ about 0.031                                             |
| Applause                     | `HumanArmature\|Man_Clapping` / `Female_Clapping` |       1.667 s |                     24/31 | Closed one-shot; hands rise to the face and above the head              |
| Seated hold                  | `HumanArmature\|Man_Sitting` / `Female_Sitting`   |       8.333 s |                     21/31 | Not mechanically closed; requires an authored seat/hold window and prop |
| Stand transition             | `HumanArmature\|Man_Standing` / `Female_Standing` |       0.833 s |                  19–21/31 | Not mechanically closed; paired transition, not a general idle          |
| Physical reaction candidates | `Punch`, `Jump`, `Death`, `RunningJump`           | 0.917–2.083 s |                  19–26/31 | Combat/spectacle semantics; not listening or tension substitutes        |

No inspected clip translates the glTF scene root or top skeleton root. The packs
animate a child `Body.position` track. Current idle and applause mappings are
effectively stationary; walk/run contain small body motion and work as in-place
locomotion when a simulation owner moves the entity. Jump/death/root-heavy clips
must not be treated as movement authority. `CharacterLoader` strips only scene-root
translation, so body-root behavior must remain in validation and must never be
used to move an NPC world transform.

### Axis and facing discrepancy

Rook has no authored yaw correction and visually faces the lab's positive-Z
front view. All seven shared-rig definitions apply a `π` model-root yaw. Visual
evidence shows their faces from the lab's negative-Z view; the positive-Z view
shows their backs:

- `docs/screenshots/npc-performance-002/npc-worker-idle-full-body.png`
- `docs/screenshots/npc-performance-002/npc-worker-positive-z-authored-view.png`

This contradicts the existing `+Z` visual-facing claim. `NpcEntity` currently
compensates only while a conversation is active by setting its visual alignment
root to `-definition.transform.rotation.y`. That correction is immediate, not
smoothed. Outside conversation, the rendered body can oppose the public
`NpcEntity.getWorldPose()` forward vector; entering dialogue can produce a 180°
visual discontinuity. This must be resolved before participant-relative cameras,
authored facing, or production pedestrian motion rely on public pose.

## Where clapping is mapped, and why it is wrong

The exact mapping chain is:

1. `src/npcs/npcs.ts` maps Animated Men logical `gesture` to
   `HumanArmature|Man_Clapping` and Animated Women logical `gesture` to
   `HumanArmature|Female_Clapping`.
2. Mack, Nox, and Raze each set `gestureAnimation: 'gesture'`.
3. The four pedestrian `CharacterDefinition`s expose the same applause clip as
   their only logical `gesture`.
4. `NpcSystem` listens for `conversation:started`. Mack has no
   `conversationGesture: false`, so `NpcEntity.triggerGesture()` starts applause
   for `conversation.mack.introduction`.
5. Nox and Raze explicitly disable this route. If a Talk interaction fails to
   start a conversation, `NpcSystem` calls `triggerGesture()` again as a generic
   interaction fallback.

The sampled Mack applause is visibly celebratory and expansive:

- `docs/screenshots/npc-performance-002/npc-worker-man-clapping-0.25.png`
- `docs/screenshots/npc-performance-002/npc-worker-man-clapping-0.55.png`
- `docs/screenshots/npc-performance-002/pedestrian-casual-female-clapping-0.40.png`

It raises both hands beside the face and above shoulder/head level. It cannot mean
neutral conversation, waiting, listening, thought, suspicion, tension, or failed
interaction. Camera framing cannot repair that semantic mismatch.

The required deterministic fallback hierarchy is:

1. A verified intentional neutral hold: breathing, weight shift, or a reviewed
   `idle`/`previewIdle` whose silhouette suits the beat.
2. Public procedural body facing and, only if supported, head/look behavior toward
   the authored subject.
3. A verified gesture whose exact meaning matches the requested intent.
4. Block sequence start with `missing-performance` when the beat is mandatory.

There is never a clap-by-default branch. A sequence definition must state whether
neutral fallback is acceptable; mandatory story action defaults to block.

## Current behavior and ownership readiness

- `CharacterPlayerVisual` owns Rook's mixer, graph, locomotion, and one-shots. Its
  public action API accepts gameplay actions such as `wave` and `interact`, not
  cinematic performance intents or restoration tokens.
- Each `NpcEntity` owns one mixer and one active action. It exposes only
  `triggerGesture()` and equipment actions. One-shot release is a clip-duration
  countdown rather than the mixer's `finished` event.
- NPC facing is smoothed at the entity root during conversation. The visual-root
  yaw compensation described above is not smoothed and is not publicly
  requestable.
- `NpcSystem` owns spawn, conversation event routing, and Talk registration. Mack
  is in `productionNpcDefinitions`; Nox and Raze remain available through the
  development fixture roster. The four pedestrians are presentation definitions
  without a production placement/motion owner.
- `CinematicCoordinator` checks participant availability and requests camera
  anchors. The opening cinematic declares no animation dependencies and never
  starts, holds, releases, snapshots, or restores participant performance.
- `CinematicCoordinator` restores game/camera/input ownership, but current browser
  tests do not assert participant animation, pose phase, facing, action counts, or
  mixer/listener counts.

## Per-character performance matrix

Status vocabulary is intentionally strict: `verified`,
`usable-with-constraints`, `missing`, and `asset-blocker`.

| Participant           | Neutral / close-up hold                                                                                                              | Approach and turn                                                                                                                                         | Speaking / listening / gesture                                                                                                                       | Sit, prop, reaction                                                                                                                             | Production recommendation                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Rook / `casual`       | **verified** — `CharacterPlayerVisual`; `Idle` and `Idle_Neutral`. **usable-with-constraints** at 1.37 m/60° because face is static. | **verified** gameplay walk/run owner. **missing** cinematic mark/facing request and restore surface.                                                      | **missing** speak/listen. **verified** only for exact `Interact` and `Wave` meanings.                                                                | **missing** sit/stand/lean/prop. Raw get-hit is **usable-with-constraints** after a reviewed mapping.                                           | Retain. Use brief medium close-ups and exact existing gestures.                                                     |
| Mack / `npc-worker`   | **verified** `Man_Idle` under `NpcEntity`. **usable-with-constraints** close-up; static face.                                        | Raw `Man_Walk` is **usable-with-constraints**; no NPC movement owner. Facing is **usable-with-constraints** but the π visual discontinuity must be fixed. | Speak/listen are **missing**. `Man_Clapping` is verified applause but an **asset-blocker** for generic dialogue performance.                         | `Man_Sitting`/`Standing` are **usable-with-constraints** with authored chair height/hold window. Lean/prop/restrained reaction are **missing**. | Retain appearance for short/medium shots. Replace or add licensed authored performances for sustained focal acting. |
| Nox / `npc-hoodie`    | **verified** `Man_Idle`; **usable-with-constraints** close-up.                                                                       | Same raw walk and facing constraints as Mack.                                                                                                             | Speak/listen are **missing**; applause is disabled and must remain unused.                                                                           | Sitting/standing **usable-with-constraints**; prop/restrained reaction **missing**.                                                             | Promote only for brief silent/listening or medium dialogue coverage after performance/facing work.                  |
| Raze / `npc-punk`     | **verified** `Man_Idle`; beard and suit give the strongest NPC silhouette, but facial motion remains **missing**.                    | Same raw walk and facing constraints as Mack.                                                                                                             | Speak/listen are **missing**; applause is disabled. A sustained negotiation close-up is an **asset-blocker** without new performance/facial support. | Sitting/standing **usable-with-constraints**; prop/restrained reaction **missing**.                                                             | Promote for medium shots; require new performance support before focal negotiation coverage.                        |
| `pedestrian-casual`   | **verified** `Female_Idle`; close-up **usable-with-constraints** only as a silent extra.                                             | Raw `Female_Walk` **usable-with-constraints**; production motion/turn owner **missing**.                                                                  | Speak/listen **asset-blocker**; applause is not interaction.                                                                                         | Sitting/standing **usable-with-constraints** with a prop; lean/prop/reaction **missing**.                                                       | Promote as background/medium extra only.                                                                            |
| `pedestrian-street`   | **verified** `Female_Idle`; static-face close-up **usable-with-constraints**.                                                        | Same as pedestrian-casual.                                                                                                                                | Speak/listen **asset-blocker**; applause is not interaction.                                                                                         | Same seated constraints; other performance **missing**.                                                                                         | Promote as background/medium extra only.                                                                            |
| `pedestrian-tank-top` | **verified** `Female_Idle`; static-face close-up **usable-with-constraints**.                                                        | Same as pedestrian-casual.                                                                                                                                | Speak/listen **asset-blocker**; applause is not interaction.                                                                                         | Same seated constraints; other performance **missing**.                                                                                         | Promote as background/medium extra only.                                                                            |
| `pedestrian-dress`    | **verified** `Female_Idle`; the dress silhouette reads well, but face is static.                                                     | Same as pedestrian-casual.                                                                                                                                | Speak/listen **asset-blocker**; applause is not interaction.                                                                                         | Sitting requires dress/chair clipping review and is **usable-with-constraints** only after that review; other performance **missing**.          | Promote as standing/background extra; do not assume seated compatibility.                                           |

## Close-up visual assessment

The lab's approved audit framing places the camera about 1.37 m from the actor at
60° vertical field of view. It keeps head and shoulders in frame for every model.
Closer extreme close-ups are not recommended: static eyes/mouth, faceted noses and
cheeks, and hard hair highlights become the subject rather than the performance.
A gesture that needs readable hands should widen to approximately 1.8–2.4 m.

Manual findings:

- Rook has the clearest head topology and hand articulation. `Interact` reads as a
  practical point/indication and `Wave` as an unmistakable greeting. Neither is a
  general speaking loop.
- Mack and Nox have readable eyes and mouth geometry but no expression change.
  Neutral shoulder silhouettes are clean in the sampled pose. Hard top/rim light
  creates white hair/shoulder facets; a cinematic needs a softer key and fill.
- Raze's beard, suit, and open-mouth geometry create a strong identity in still
  close-up, but the fixed mouth makes long subtitle delivery look frozen.
- The women have readable hair and wardrobe silhouettes. Faces are materially
  similar and expressionless. They distinguish a crowd but cannot carry distinct
  emotional close-ups without new assets/animation.
- No neutral sampled pose showed hand/shoulder self-clipping. Mack's applause puts
  hands beside the face and then overhead; it competes with subtitles and close-up
  composition even before its semantic problem.
- The seated clip visibly lowers the pelvis to chair height while leaving the actor
  unsupported. It must be paired with an authored seat mark and matching prop; the
  whole 8.333-second source clip is not a safe general loop.

Core full-body and close-up evidence:

| Character           | Full body                                                                     | Close-up                                                                     |
| ------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Rook                | `docs/screenshots/npc-performance-002/casual-idle-full-body.png`              | `docs/screenshots/npc-performance-002/casual-idle-close-up.png`              |
| Mack                | `docs/screenshots/npc-performance-002/npc-worker-idle-full-body.png`          | `docs/screenshots/npc-performance-002/npc-worker-idle-close-up.png`          |
| Nox                 | `docs/screenshots/npc-performance-002/npc-hoodie-idle-full-body.png`          | `docs/screenshots/npc-performance-002/npc-hoodie-idle-close-up.png`          |
| Raze                | `docs/screenshots/npc-performance-002/npc-punk-idle-full-body.png`            | `docs/screenshots/npc-performance-002/npc-punk-idle-close-up.png`            |
| Casual pedestrian   | `docs/screenshots/npc-performance-002/pedestrian-casual-idle-full-body.png`   | `docs/screenshots/npc-performance-002/pedestrian-casual-idle-close-up.png`   |
| Street pedestrian   | `docs/screenshots/npc-performance-002/pedestrian-street-idle-full-body.png`   | `docs/screenshots/npc-performance-002/pedestrian-street-idle-close-up.png`   |
| Tank-top pedestrian | `docs/screenshots/npc-performance-002/pedestrian-tank-top-idle-full-body.png` | `docs/screenshots/npc-performance-002/pedestrian-tank-top-idle-close-up.png` |
| Dress pedestrian    | `docs/screenshots/npc-performance-002/pedestrian-dress-idle-full-body.png`    | `docs/screenshots/npc-performance-002/pedestrian-dress-idle-close-up.png`    |

The capture report inventories all 34 exact files and SHA-256 values. The final
run recorded zero console errors, zero page errors, zero failed runtime requests,
and zero external requests. Eight failed local `HEAD` requests are the existing
development availability probes; every actual GLB GET succeeded. Re-entry disposed
three prior lab instances and finished on a real Casual asset with no lab error.

## Replacement/promotion asset requirements

Do not download a marketplace candidate merely because it looks suitable. A
replacement is accepted only when it is CC0-1.0, public-domain, or
original-project-owned and has source URL, creator, license URL/legal copy,
retrieval date, source/archive and accepted-file SHA-256, original filename,
modifications, scale, axis, rig, clip inventory, and intended role recorded beside
the local file. Runtime loading remains local-only.

Recommended targets, subject to later performance benchmarking:

- Focal character: 4,000–12,000 triangles, no more than 12 skinned meshes, no
  more than 12 materials, preferably zero textures and at most two 1024² textures,
  self-contained GLB, finite bounds, approximately 1.72–1.88 m after correction,
  Y-up, documented source forward, and game-facing +Z after one definition
  correction.
- Background character: 1,500–6,000 triangles, no more than 10 materials, zero or
  one 1024² texture, compatible distance silhouette and the same transform rules.
- Keep the character origin/contact plane at the feet. Locomotion clips should be
  in-place or explicitly flagged; no animation may translate a world/simulation
  parent.
- Prefer one reviewed shared skeleton family for extras. A focal asset may use its
  own skeleton only when every required clip is embedded/local and no runtime
  retargeting is assumed.
- Required body clips for a focal participant: neutral breath/weight shift, walk,
  approach stop, restrained listen, restrained speak, emphatic speak, indicate,
  dismiss, alert/reaction, sit, seated hold, stand, and role-specific prop contact.
  Every loop/one-shot and start/hold/release boundary must be documented.
- Required close-up controls for a new focal performer: independent head/neck,
  blink/eye aim, brow or equivalent readable upper-face control, and jaw/mouth or
  authored subtitle-timed speaking shapes. A consciously stylized alternative is
  acceptable only after close-up evidence proves it; static eyes and mouth do not
  satisfy a sustained speaking role.
- Validate neutral, gesture, turn, sit/stand, hand-to-prop contact, shoulder/hand
  clipping, night/day material response, and 1.3–2.4 m camera distances before
  production promotion.

## Architectural and visual decisions

1. Existing mixers remain authoritative. A cinematic performance layer composes
   through public owner APIs; it never creates a second mixer or writes private
   action fields.
2. World translation, mark arrival, and collision stay with a movement/blocking
   owner. An animation request may mirror verified locomotion but cannot move the
   entity transform.
3. Participant definitions and cinematic data reference stable IDs and logical
   intents, never loaded roots, clips, mixers, bones, or cameras.
4. Performance entry is transactional: preflight all mandatory participants,
   capture opaque owner restore tokens, then start. Any failure rolls back every
   participant before camera progression.
5. Neutral fallback is explicit and semantic. Applause, combat, death, jump, and
   sword clips are never generic substitutions.
6. Use medium close-ups rather than extreme close-ups for the current cast. Keep a
   wider composition when hands carry the beat, and use soft directional key/fill
   to preserve low-poly planes without white material hotspots.
7. A static subtitle close-up may last only as long as the neutral body pose and
   line rhythm remain intentional. Longer dialogue requires a verified listen or
   speak performance or blocks production acceptance.

The proposed public contract, lifecycle tests, and implementation dependency split
are defined in
`docs/cinematics/npc-performance-002-performance-contract.md`.
