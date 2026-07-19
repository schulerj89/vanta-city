# CINEMATIC-006 direction: Carbon Copy

Status: design-complete direction to be implemented within MISSION-003B after
WORLD-004's generic venue, NPC-002's unplaced cast definitions, and SAVE-001's
persistence contract are integrated.

Canonical cinematic ID: `cinematic.ash-002-copy-choice`.

Mission brief: `docs/mission-003-carbon-copy.md`.

Structured handoff:
`docs/narrative/mission-003a-carbon-copy-handoff.json`.

## Dramatic and runtime contract

This 31-second scene presents the already-authored result of the Carbon Copy
mission: Rook verifies Orin's transfer code, rejects Della Voss's private cash,
and gives Nox a witnessed copy. It is not a player choice and owns no mission
progress. `MissionSystem` has already completed the objective, credited 100
units, and committed all five facts before it requests this optional
completed-phase presentation.

The direction emphasizes paper, distance, and witness rather than expressive
facial acting. The venue's original register, carbon, cash, and envelope carry
the visible action through level-owned paths. Character animation remains
strictly within verified profiles: Rook uses exact `indicate`; Nox and Della use
exact `neutral-hold`. No applause, nearest-clip, random, combat, lip-sync, hand
contact, walking arrival, or unverified emotion is implied.

## Definition header

- ID: `cinematic.ash-002-copy-choice`
- Story beat: `story-beat.ash-002-copy-choice`
- Mission: `ash-002-carbon-copy`
- Entry event: `cinematic.ash-002-copy-choice.requested`
- Completion event: `cinematic.ash-002-copy-choice.completed`
- Participants: `casual`, `nox`, `della-voss`
- Speakers: `rook`, `nox`, `della-voss`
- Level: WORLD-004's level containing `location.ashfall.night-venue`
- Location: `location.ashfall.night-venue`
- Skip policy: `confirm`
- Restoration: `exact-prior-gameplay`
- Participant failure: `fail-and-restore`
- Destination transaction: none
- Voice-over: none

The venue is already loaded and all three participants are staged by their
authoritative owners before ownership begins. This cinematic requests no level
transition, spawn, time-of-day mutation, story effect, mission handoff, money,
equipment, or fact transaction.

## Exact dependency IDs

### Participants and spawns

- Rook participant/entity: `casual`; speaker: `rook`
- Nox participant/entity/NPC/speaker: `nox`
- Della participant/entity/NPC/speaker: `della-voss`
- Nox gameplay spawn: existing `spawn.npc-alley` at the Contact Yard; the
  cinematic temporarily stages that production participant to
  `mark.ash-002.nox-table` and restores his exact prior state.
- Planned Della venue spawn: `spawn.npc.della-voss.night-venue`

NPC-002 supplies only unplaced, license-verified AssetCatalog and
CharacterDefinition candidates with their clip inventories. MISSION-003B
preserves the existing story IDs, promotes Nox's existing NpcDefinition into
the production roster, selects Della's focal CharacterDefinition, updates her
existing NpcDefinition and test-district mapping, and reruns Northbar
regressions. This brief does not reserve a new character ID. Della's current
`pedestrian-street` character fails focal acceptance.

INTERIOR-POP-001 owns optional ambient venue patrons. Their absence cannot
block this three-participant story scene, and no ambient actor may substitute
for Nox or Della.

### Blocking marks

- `mark.ash-002.rook-table`
- `mark.ash-002.nox-table`
- `mark.ash-002.della-table`

Each mark needs grounded clearance and at most 0.55 metres of preflight
displacement. Rook faces Della, Della faces Rook, and Nox faces Rook. The marks
form a shallow triangle around a waist-high evidence table, never a perfectly
flat lineup.

### Camera anchors

Primary and responsive-safe anchors are paired per shot:

- `camera.ash-002.venue-establish`
- `camera.ash-002.venue-establish-safe`
- `camera.ash-002.code-match-insert`
- `camera.ash-002.code-match-insert-safe`
- `camera.ash-002.della-offer`
- `camera.ash-002.della-offer-safe`
- `camera.ash-002.rook-choice`
- `camera.ash-002.rook-choice-safe`
- `camera.ash-002.nox-witness`
- `camera.ash-002.nox-witness-safe`
- `camera.ash-002.della-mark`
- `camera.ash-002.della-mark-safe`

The composition adapter chooses the primary or alternate during live preflight.
It does not derive camera transforms in this definition.

### Evidence visuals

- `prop.ash-002.orin-carbon`
- `prop.ash-002.impound-register`
- `prop.ash-002.nox-envelope`
- `prop.ash-002.della-cash`
- `prop.ash-002.marrow-receipt`

These are level-owned cinematic visuals, not equipment IDs. WORLD-004 provides
the generic venue contract and reviewed production geometry; MISSION-003B
authors these mission-specific visual requests and bindings through public
level definitions. Printed text does not need to be legible at screen
resolution; the register number, carbon number, date order, cash, and custody
envelope must remain visually distinct by shape, placement, and subtitle
meaning.

### Level-owned path requests

| Request ID                   | Visuals  | Point IDs                                                      | Purpose                                         |
| ---------------------------- | -------- | -------------------------------------------------------------- | ----------------------------------------------- |
| `path.ash-002.register-open` | register | `point.ash-002.register-closed`, `point.ash-002.register-open` | Reveal the authoritative impound entry          |
| `path.ash-002.carbon-align`  | carbon   | `point.ash-002.carbon-start`, `point.ash-002.carbon-match`     | Align the carbon beside the matching line       |
| `path.ash-002.cash-offer`    | cash     | `point.ash-002.cash-held`, `point.ash-002.cash-offer`          | Place Della's private offer within Rook's reach |
| `path.ash-002.copy-envelope` | carbon   | `point.ash-002.carbon-match`, `point.ash-002.copy-envelope`    | Show Rook choosing the custody envelope         |
| `path.ash-002.cash-withdraw` | cash     | `point.ash-002.cash-offer`, `point.ash-002.cash-withdrawn`     | Remove the refused cash                         |
| `path.ash-002.receipt-mark`  | receipt  | `point.ash-002.receipt-blank`, `point.ash-002.receipt-marked`  | Show Della recording who carried the copy       |

MISSION-003B authors these mission-specific path and point requests against the
generic WORLD-004 venue contract. Path handles own only temporary visual
motion. Cleanup releases them and the world projects its final prop layout from
committed mission facts. No path may move a participant, claim hand contact, or
update an inventory.

## Shot plan and timing

All shot transitions are cuts with `transitionSeconds: 0`. The cinematic clock
is local to each shot. Subtitle cues do not overlap and remain below 17 visible
characters per second before localization expansion.

### Shot 1 — public room, three witnesses

- ID: `shot.ash-002.venue-establish`
- Duration: 4.2 seconds
- Camera: `camera.ash-002.venue-establish`
- Alternate: `camera.ash-002.venue-establish-safe`
- Purpose: establish a public, two-door venue and the witness triangle without
  shrinking the actors into a wide architectural postcard.
- Participants/required subjects: `casual`, `nox`, `della-voss`
- Required visuals: register, carbon, envelope, cash
- Safe frame: minimum 12% subject margin; narrow field of view 38 degrees
- Performance: exact `neutral-hold` for all three at 0.0 seconds, held through
  the shot and released by normal shot cleanup.
- Subtitle: none

Composition keeps Rook and Della as the near diagonal and Nox across the table.
Both doors can read as background routes, but neither needs a separate insert.
No participant walks into place.

### Shot 2 — code matches source

- ID: `shot.ash-002.code-match-insert`
- Duration: 4.8 seconds
- Camera: `camera.ash-002.code-match-insert`
- Alternate: `camera.ash-002.code-match-insert-safe`
- Purpose: prove the carbon and original register share the same car, impound,
  and prematurely dated closure.
- Participants: `nox`
- Required subject: none; Nox may be an edge silhouette, not a face claim
- Required visuals: register and carbon
- Safe frame: minimum 14% visual margin; narrow field of view 36 degrees
- Paths:
  - register open at 0.15 seconds for 0.75 seconds
  - carbon align at 0.95 seconds for 0.85 seconds
- Performance: Nox exact `neutral-hold` at 0.0 seconds
- Subtitle cue `subtitle.ash-002.nox.code-match`, speaker `nox`:
  “Same car. Same impound. Closure dated first.” from 0.65–4.15 seconds
  (44 characters / 3.5 seconds = 12.6 characters/second).

The camera reads paper edges and matching line placement, not microscopic text.
The subtitle delivers the clue non-audibly.

### Shot 3 — Della makes privacy cheaper

- ID: `shot.ash-002.della-offer`
- Duration: 5.8 seconds
- Camera: `camera.ash-002.della-offer`
- Alternate: `camera.ash-002.della-offer-safe`
- Purpose: frame Della's practical coercion as an offer, not a theatrical threat.
- Participants/required subjects: `casual`, `della-voss`
- Required visual: cash
- Safe frame: minimum 12% subject margin; narrow field of view 39 degrees
- Path: cash offer at 0.6 seconds for 0.9 seconds
- Performance: Della and Rook exact `neutral-hold` at 0.0 seconds
- Subtitle cue `subtitle.ash-002.della.private-offer`, speaker `della-voss`:
  “One copy. No witnesses. Your morning gets cheaper.” from 0.55–4.85
  seconds (50 characters / 4.3 seconds = 11.6 characters/second).

Use a restrained medium two-shot. Della is not framed as a villain reveal; the
cash enters low in frame while her silhouette stays readable.

### Shot 4 — Rook chooses the envelope

- ID: `shot.ash-002.rook-choice`
- Duration: 4.6 seconds
- Camera: `camera.ash-002.rook-choice`
- Alternate: `camera.ash-002.rook-choice-safe`
- Purpose: make the fixed accountable choice visible.
- Participants/required subjects: `casual`
- Required visuals: cash, carbon, envelope
- Safe frame: minimum 14% subject margin; narrow field of view 37 degrees
- Performance: Rook exact, required one-shot `indicate` at 0.5 seconds, target
  mark `mark.ash-002.nox-table`; its logical animation ID is lowercase
  `interact`, and mixer completion releases the registered source clip. Start
  exact `neutral-hold` at 1.9 seconds for the rest of the shot. Missing policy
  for both cues: `block`.
- Path: copy to envelope at 0.85 seconds for 1.0 second
- Subtitle cue `subtitle.ash-002.rook.cheap-paper`, speaker `rook`:
  “Cheap paper burns first.” from 0.7–3.2 seconds
  (24 characters / 2.5 seconds = 9.6 characters/second).

The gesture and path synchronize but remain independently owned. The shot
claims that Rook indicates the envelope and that the carbon moves there; it does
not claim fingers grasp paper.

### Shot 5 — Nox names the chain

- ID: `shot.ash-002.nox-witness`
- Duration: 5.4 seconds
- Camera: `camera.ash-002.nox-witness`
- Alternate: `camera.ash-002.nox-witness-safe`
- Purpose: state the source-copy-witness principle and confirm provisional trust.
- Participants/required subjects: `casual`, `nox`
- Required visual: envelope
- Safe frame: minimum 12% subject margin; narrow field of view 39 degrees
- Performance: Nox and Rook exact `neutral-hold` at 0.0 seconds
- Subtitle cue `subtitle.ash-002.nox.witness-chain`, speaker `nox`:
  “Source. Copy. Witness. Now it survives us.” from 0.6–4.4 seconds
  (42 characters / 3.8 seconds = 11.1 characters/second).

Use a medium two-shot. Nox does not celebrate, clap, nod, or mime speech. His
stillness makes the rule feel procedural.

### Shot 6 — Marrow records the refusal

- ID: `shot.ash-002.della-mark`
- Duration: 6.2 seconds
- Camera: `camera.ash-002.della-mark`
- Alternate: `camera.ash-002.della-mark-safe`
- Purpose: close on consequence: Della withdraws the cash and records Rook's
  responsibility instead of escalating into violence.
- Participants/required subjects: `casual`, `della-voss`
- Required visuals: cash and receipt
- Safe frame: minimum 12% subject margin; narrow field of view 39 degrees
- Paths:
  - cash withdraw at 0.25 seconds for 0.85 seconds
  - receipt mark at 1.0 seconds for 0.8 seconds
- Performance: Della and Rook exact `neutral-hold` at 0.0 seconds
- Subtitle cue `subtitle.ash-002.della.marrow-remembers`, speaker `della-voss`:
  “Then Marrow remembers who carried it.” from 0.4–3.45 seconds
  (37 characters / 3.05 seconds = 12.1 characters/second).
- Subtitle cue `subtitle.ash-002.rook.write-twice`, speaker `rook`:
  “Write it twice.” from 3.75–5.45 seconds
  (15 characters / 1.7 seconds = 8.8 characters/second).

End on Della and the marked receipt in a medium composition. Do not push into
an extreme facial close-up. Cleanup begins after the final cue clears.

Total authored duration: 31.0 seconds.

## Performance request policy

The implementation JSON may request one start and one release cue per looping
held performance if the participant adapter requires explicit releases.
One-shot performance completion is driven by the mixer `finished` event, not by
a `hold` phase or an authored duration. Preflight rules are invariant:

- Rook `indicate` in shot 4 is exact and required. Missing capability blocks
  the cinematic before ownership. It starts at 0.5 seconds, completes through
  the supported one-shot path, and is followed by an exact `neutral-hold` start
  cue at 1.9 seconds.
- Every `neutral-hold` is exact for the selected production participant.
- `speak-restrained`, `listen`, `prop-use`, `dismiss`, `approach`, `turn-to`,
  `react-alert`, `sit`, `stand`, and `acknowledge` are not requested.
- No request may resolve to applause, Wave, a nearest clip, a random clip, a
  combat action, or locomotion.
- Della's MISSION-003B-approved focal character and venue placement, plus Nox's
  MISSION-003B production promotion and temporarily stageable gameplay
  participant, are hard preflight dependencies. The scene does not fall back
  to `pedestrian-street`, duplicate Nox at a second spawn, or use development
  fixtures.

Participant adapters capture opaque restore tokens before staging. Marks and
paths are separate owner requests. The coordinator never edits mixers, skeletons,
roots, props, position vectors, or level objects directly.

## Composition, lighting, and responsive direction

WORLD-004 owns the venue's authored amber practicals, restrained teal/sodium
exterior spill, soft key/fill, collision, and material response. Avoid hard
specular facets on low-detail faces. `TimeOfDayLightingSystem` owns the global
night preset. The cinematic preflight verifies readable participants and props
at the current state but does not set or restore time.

### 1280×720 desktop

- Prefer medium singles/two-shots and a table insert over the current opening
  scene's distant three-body wide.
- Keep required subjects at least 12% from left/right edges and above the lower
  34% subtitle reserve.
- The establishing shot must keep all three bodies readable while still showing
  both public exit directions.
- Subtitle labels and two-line wrapping must not collide with the HUD, skip
  affordance, or evidence props.

### 390×844 narrow

- Composition preflight should select the `-safe` anchors.
- Do not fit three full bodies across the width. Establish the triangle through
  a shallow stacked composition: Rook/Della foreground, Nox readable above or
  between them.
- Keep critical heads above normalized screen Y 0.66 and within the central 76%
  width. The insert shows only the register and carbon essentials.
- Della's cash and Nox's envelope cannot rely on color alone; their silhouette
  and position must differ.
- Existing skip-confirmation modal remains the only modal and must retain focus
  without clipping at 125% text.

### 1920×800 ultrawide

- Keep the dramatic action within the central 70% of the screen rather than
  spreading characters to the edges.
- Primary anchors may be used only when live preflight retains at least 12%
  subject margins; otherwise use the safe alternate.
- Background doors may occupy side space, but required evidence remains central.

For all viewports, the live composition adapter must check required subject and
visual projection, front-facing depth, margins, and occlusion. A blocked or
unresolved required item is a preflight failure; filming through a wall or
dropping a required prop is not an acceptable fallback.

## Reduced-motion alternative

Reduced camera motion uses the same six shots, cut timings, subtitles, facts,
and completion result. It changes presentation only:

- camera transitions are already hard cuts;
- every level-owned path places its visual at the requested end point at the
  cue boundary instead of interpolating;
- Rook's `indicate` may still play if the verified animation is non-locomotive;
  no camera ease, swish, shake, push, or focus animation is introduced;
- time-of-day transitions, if already in progress under their owner, finish
  according to the existing accessibility contract rather than cinematic code.

The reduced-motion pass must be separately captured at desktop and narrow size.

## Skip confirmation

First skip input pauses the cinematic clock and all active subtitle cues,
performance handles, path handles, and transient input generation. It opens the
existing confirmation modal; no new prompt or state is introduced.

- Confirm: complete through the normal cleanup path with result `skipped`.
- Cancel/keep watching: close the modal, restore cinematic input focus, and
  resume the exact shot, local time, subtitle cue, path progress, performance
  generation, and participant state without replay.
- Repeated input while the modal is open is owned by the modal and cannot advance
  the scene.
- Pause/map/dialogue input cannot open competing surfaces during confirmation.

Because the mission is already complete, existing modal copy should be adapted
by the implementing UI owner if it claims the current mission remains active.
The correct meaning is: only presentation ends; completed mission progress and
rewards remain. This brief requests a copy review, not a new modal component.

## Exact-prior cleanup and restoration

Before ownership, capture:

- exact prior `GameState` and pause state;
- gameplay control-enabled state and active input context;
- pointer-lock ownership/request state and focus target;
- gameplay camera owner/handle and transform source;
- HUD, objective/navigation, subtitle, skip affordance, map, pause, dialogue,
  and modal presentation states through their owners;
- player world pose, grounded/interaction state, and transient input generation;
- opaque performance restore tokens for all staged participants;
- staging resolutions and active path handles;
- current level/location readiness and active interaction availability.

Normal completion, confirmed skip, cancellation, participant failure, path or
camera failure, exception, disposal, and app-owned teardown converge on one
idempotent cleanup path:

1. freeze new cues and invalidate the active generation;
2. dismiss any skip-confirmation state through the UI owner;
3. release camera, path, subtitle, staging, and performance handles with the
   correct result reason;
4. restore each participant from its opaque token;
5. restore the exact player pose/interaction and gameplay camera owner;
6. restore HUD/surface visibility, focus, pointer-lock request, controls, input
   context, transient keys, pause, and exact prior game state;
7. project post-mission world props from authoritative facts;
8. emit exactly one completion event and release cinematic ownership.

The cleanup path must tolerate partial preflight/start and multiple cleanup
signals without double release. A preflight failure occurs before any ownership
or visible mutation. Participant removal after start uses `fail-and-restore`.
The mission remains completed in every case.

## Browser and test acceptance

Implementation is not complete until all of the following pass:

1. Definition validation accepts unique IDs, cue order, durations, participants,
   marks, anchors, visuals, path points, and exact-prior policy.
2. Preflight blocks on missing Rook `indicate`, focal Della and her venue spawn,
   production Nox or his exact-restoration staging support, any required
   anchor/mark/visual/path, invalid grounding, occlusion, or failed venue
   readiness before it changes gameplay ownership.
3. At 1280×720, 390×844, and 1920×800, committed early/middle/late frames keep
   required faces/silhouettes and evidence readable outside subtitle/UI reserves.
4. Narrow does not reuse an unreadable three-body wide. Ultrawide keeps the
   action central. At 125% text, subtitle and modal text do not clip.
5. Full-motion and reduced-motion runs preserve identical cue order, duration
   contract, mission facts, and completion event.
6. Normal completion, confirmed skip from early/middle/late shots, skip cancel,
   pause/resume, path failure, participant removal, and disposal all restore
   exact prior state with one completion result.
7. Skip cancellation resumes the exact cue/path/performance generation with no
   duplicate subtitle, jump, replay, or lingering modal focus.
8. Gameplay after cleanup regains camera follow, movement/input, interaction,
   pointer lock, focus, HUD/navigation, pause/map access, and the exact prior
   player pose. No participant stays staged or cinematic-controlled.
9. The reward and five facts are unchanged by every cinematic result, and no
   money, fact, objective, or equipment event originates from the scene.
10. Browser console/runtime exceptions are zero; application requests have no
    unexpected external HTTP(S) traffic or failed GETs. Local optional-asset HEAD
    probes, if retained, must be separately identified rather than hidden.

Baseline review for the existing cinematic/UI composition is recorded in
`docs/screenshots/mission-003a/visual-review.md`. Those images are design
evidence, not acceptance proof for this unimplemented scene.
