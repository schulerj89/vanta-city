# MISSION-003A production brief: Carbon Copy

Status: design-complete handoff; runtime implementation remains MISSION-003B.

Canonical source: `narrative/ashfall-story-bible.json`.

Structured implementation handoff:
`docs/narrative/mission-003a-carbon-copy-handoff.json`.

Cinematic direction: `docs/cinematics/cinematic-006-carbon-copy.md`.

## Outcome

`ash-002-carbon-copy` is a two-objective evidence mission. Rook takes Orin's
marked carbon from Nox, crosses the expanded Ashfall Junction to a public night
venue, matches its transfer code to Della Voss's original Marrow impound
register, and seals the corroborated copy for Nox. The verification interaction
completes the mission and commits the reward before the optional cinematic
presents Rook rejecting Della's private cash offer.

The scene has one canonical result. It is not a dialogue choice and introduces
no branch UI. The mission's dramatic decision is authored character change:
Rook accepts a slower, witnessed chain of custody instead of a private deal.

## Canon and continuity

- Time: September 29, 1997, with the venue meeting at 11:00 p.m.
- Prior state: `ash-001-walk-the-block` is complete and
  `contact-yard-meeting-completed=true`. Orin remains missing.
- Rook is speaker `rook` and playable entity `casual`; no second Rook entity or
  character definition is allowed.
- Nox retains entity, NPC, and speaker ID `nox`. His current character is
  `npc-hoodie`; NPC-002 must promote him rather than duplicate him.
- Della retains entity, NPC, and speaker ID `della-voss`. Her present
  `pedestrian-street` character is not approved for focal close-up work;
  NPC-002 must provide a verified unique production character while preserving
  her existing story identity.
- Mack, Raze, Orin, and ambient venue patrons do not participate. The mission
  does not need a new named NPC.
- The evidence is not a magical single document. Orin's carbon supplies a
  transfer code, Della's original impound register supplies an independent
  source, and Nox's receipt of a witnessed copy establishes recoverable custody.
- No character voice-over is required. Every clue is visible or subtitled.

## Narrative beat

Nox has Orin's carbon but refuses to call it proof without a source another
person can locate. Della controls the matching original. She will show it in a
public room to Rook, not surrender it to Nox. Nox accepts that restriction
because the venue has two doors and multiple witnesses. Della brings cash to
make privacy easier than accountability. Rook verifies the code, chooses Nox's
envelope, and leaves Della with a record of who rejected Marrow's offer.

The mission moves the campaign question from “Where is Orin?” to “Can his
discovery survive him?” It changes Nox's trust, makes Rook legible to Marrow,
and establishes the corroborated early-closure lead for `ash-003-night-manifest`.

## Mission contract

### Availability and start

- Mission ID: `ash-002-carbon-copy`
- Reward ID: `reward.ash-002-carbon-copy`
- Prerequisite mission: `ash-001-walk-the-block`
- Prerequisite fact: `contact-yard-meeting-completed=true`
- Start location: `location.ash-001.contact-yard`
- Start condition: `entity-interaction-completed` for entity `nox`
- The existing Nox interaction starts `conversation.nox.check-in`; the mission
  start and dialogue event adapters must not race or double-start it.
- Availability highlight: entity `nox`, world channel only.

MISSION-003B should register the definition only when WORLD-004's venue facts,
NPC-002's production placements, and the SAVE-001 persistence schema are
present. A missing integration dependency is a catalog/preflight error, not a
reason to redirect the mission to Signal Corner or Mack.

### Objective 1 — receive the carbon

- Objective ID: `ash-002-take-nox-copy`
- Player copy: “Take Orin's marked carbon and hear Nox's verification rule.”
- Completion condition: `dialogue-completed` for
  `conversation.nox.check-in`
- Highlight ID: `highlight.ash-002.nox`
- Highlight target: entity `nox`
- Channels: `world`
- Priority: primary
- Cancellation remains available until this objective completes.

On completion, the mission-owned evidence state records that Rook is carrying
the carbon for this attempt. This is objective-local state, not an equipment
catalog item and not a campaign fact. The completed objective unlocks the
venue interaction and switches the highlight to objective 2.

### Objective 2 — verify the register

- Objective ID: `ash-002-verify-night-register`
- Player copy: “Cross Ashfall to the night venue, verify Orin's code, and seal
  Nox's copy.”
- Completion condition: `interaction-completed` for
  `interaction.ash-002.verify-register`
- Highlight ID: `highlight.ash-002.night-register`
- Target: interaction `interaction.ash-002.verify-register`
- Channels: `world`, `map`
- Priority: primary

The interaction is authoritative gameplay. It must atomically validate that the
mission is active on objective 2, the venue sector and evidence surface are
ready, and the player has the objective-local carbon state. Its successful
completion represents all of the following before it emits the public event:

1. Della's original register is open to the authored impound entry.
2. Orin's carbon code matches that entry.
3. The corroborated copy is placed in Nox's envelope.
4. The private-offer refusal is the fixed authored outcome.

The interaction is one normal use action, not a sequence of prompt errands or
a timing minigame. It uses the shared interaction distance contract; it does
not add a mission-local radius. Entering the venue never completes the mission.

### Completion ordering

`MissionSystem` remains the sole gameplay authority. The required order is:

1. `interaction.ash-002.verify-register` completes and emits the public event.
2. Objective 2 completes.
3. Mission status becomes completed.
4. The 100-unit reward and five facts commit once.
5. MissionSystem emits the optional completed-phase content request for
   `cinematic.ash-002-copy-choice`.
6. Cinematic preflight may start presentation.

The cinematic may never call objective completion, money, equipment, or fact
APIs. A failed preflight, runtime failure, confirmed skip, or reload after step
4 leaves the mission completed. Reload does not automatically replay this
optional presentation; a future gallery/debug replay may request it with no
landing transaction.

## Dialogue definition request

Preserve the public conversation ID `conversation.nox.check-in` and replace its
placeholder/check-in text with these linear, subtitle-ready lines. All lines use
`portraitPresentation: none`; no portrait asset is an implementation blocker.

| Line ID                           | Speaker | Text                                                           |
| --------------------------------- | ------- | -------------------------------------------------------------- |
| `dialogue.ash-002.nox.orin-code`  | `nox`   | “Orin wrote ‘Rook’ beside this yard. He left a transfer code.” |
| `dialogue.ash-002.rook.not-chain` | `rook`  | “A code is not a chain.”                                       |
| `dialogue.ash-002.nox.venue`      | `nox`   | “Della has the matching impound book. Night venue, eleven.”    |
| `dialogue.ash-002.rook.marrow`    | `rook`  | “You invited Marrow?”                                          |
| `dialogue.ash-002.nox.two-doors`  | `nox`   | “She invited you. I get the second door.”                      |
| `dialogue.ash-002.rook.cash`      | `rook`  | “And the cash?”                                                |
| `dialogue.ash-002.nox.witness`    | `nox`   | “Easier than a witness. That is why she brings it.”            |

The conversation can be cancelled while objective 1 is incomplete. Completion
must emit the existing dialogue-completed adapter event exactly once. Re-entry
after objective 1 is complete may use Nox's ordinary post-check-in bark, but it
must not replay the mission conversation or duplicate the carbon.

## Location, travel, and arrival

- Destination location: `location.ashfall.night-venue`
- Venue interaction: `interaction.ash-002.verify-register`
- Planned Nox spawn: `spawn.npc.nox.night-venue`
- Planned Della spawn: `spawn.npc.della-voss.night-venue`
- WORLD-004 owns transforms, collision, sector IDs, public entrance, map
  geometry, readiness, lighting fixtures, and cinematic anchors.
- The intended traversable route is 85–140 metres from the contact yard after
  WORLD-004 expansion, measurably farther than the `ash-001` contact journey.
  This is an acceptance range, not permission to hard-code story coordinates.
- The entrance must be visible from a public route and resolve through level/map
  metadata. UI-002A/NAV-001 own distance, hysteresis, compass, arrival wording,
  and full-map behavior.
- PERF-002/LevelSystem must keep the destination's mission-critical interaction
  and presentation dependencies ready while objective 2 is active. A streaming
  unload cannot silently complete, relocate, or erase the objective.

The venue meeting is authored for the night preset. `TimeOfDayLightingSystem`
owns environment lighting and WORLD-004 owns fixture placement. MISSION-003B
may request the existing public `night` preset only through an approved mission
adapter; the cinematic itself requests no time change and stores no lighting
state. If no such mission adapter exists, availability waits for the world to
be at the venue's authored night state rather than reaching into lighting
internals.

## Facts, reward, and equipment

On first completion only:

- Money: `+100` through `PlayerMoneyAccount`
- Equipment: none
- `ledger-copy-custody=nox`
- `nox-trust=provisional`
- `rook-known-to-marrow=true`
- `orin-transfer-code-verified=true`
- `della-private-offer-rejected=true`

All five facts are persistent and must commit in the same mission reward
transaction. Post-mission evidence visuals project from those facts. Cinematic
prop positions are temporary presentation state and cannot become the source of
truth.

SAVE-001 owns the corrected new-game state: neither the knife nor handgun is
owned. This mission grants neither. The handgun remains available only through
the existing `HandgunPurchase` path. A later defensive/accountability mission
may justify a knife acquisition after narrative and economy review; Carbon Copy
does not manufacture that justification.

## Failure, retry, cancellation, death, and reload

### Failure before completion

Fail the active mission when:

- player health depletes before the verification interaction commits;
- the active level changes before that commit; or
- the mission-critical venue, entrance, evidence visual, or interaction becomes
  unavailable after objective 2 begins.

Retry starts a fresh attempt at Nox's contact-yard setup, restores the carbon
there, resets only ash-002 objective-local state, and grants no reward or fact.
All prerequisite `ash-001` facts remain intact. The retry path is deterministic
and does not respawn a second Nox, Della, interaction, or evidence prop.

SAVE-001 selects the death-safe home/clinic/fallback spawn. Mission code must
not teleport the player or own respawn. A restored active snapshot on objective
2 resumes that objective without replaying Nox's setup; a failed snapshot is
retry-ready; a completed snapshot retains the reward and facts once.

### Cancellation

Cancellation is permitted through completion of
`ash-002-take-nox-copy`. Cancelling clears Carbon Copy highlights, the
objective-local carbon, and the venue interaction state. Once the conversation
completes, cancellation is disabled; leaving or depletion is handled as failure.

### Cinematic failure and skip

The mission is already complete when the cinematic begins. Participant removal,
missing camera/visual/path dependencies, or a runtime exception produce
`failed` and exact-prior restoration; they cannot fail or rewind the mission.
Confirmed skip produces `skipped` through the same cleanup path. Cancelled skip
confirmation resumes the exact shot, cue, path, and performance generation.

## Ownership boundaries

- MissionSystem owns availability, objective order, cancellation boundary,
  failure/retry, reward, facts, snapshot restoration, highlights, and content
  request timing.
- DialogueSystem owns `conversation.nox.check-in`, readable line order, and its
  completion event.
- InteractionSystem owns surface distance, prompt activation, and the public
  completion event for `interaction.ash-002.verify-register`.
- LevelSystem/WORLD-004 own venue geometry, route, collision, locations,
  interactions, map references, readiness, lighting fixtures, camera anchors,
  blocking marks, evidence visuals, and prop paths.
- NPC system/NPC-002 own Nox and Della placement, character assets, animation
  capabilities, and exact participant restoration.
- CinematicCoordinator owns temporary camera/subtitle/skip/presentation state;
  it owns no mission truth and no raw Three.js participant objects.
- UI systems own HUD zones, subtitle rendering, skip-confirmation modal, focus,
  pointer-lock presentation, pause/map visibility, responsive layout, and
  accessibility preferences. This design adds no new UI component or token.
- SAVE-001 owns campaign serialization, no-weapon new-game equipment, and
  death-safe spawn selection.

## Integration dependencies

| Dependency        | Required output                                                                                                                                          | Blocking condition                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| WORLD-004         | Enterable night venue, public route, location/interaction/map/readiness IDs, mission-critical sectors, lighting fixtures, marks, anchors, visuals, paths | Any exact ID or readiness fact is absent                                                                         |
| NPC-002           | Production Nox and focal Della at stable venue spawns; verified idle/locomotion and exact performance capability report                                  | Della remains `pedestrian-street`, either entity is development-only, or required Rook `indicate` is unavailable |
| SAVE-001          | Objective/fact/money persistence, retry and death spawn behavior, no-weapon new game                                                                     | Duplicate reward/facts or weapon ownership survives a new game                                                   |
| MISSION-003B      | Runtime definitions, conversation rewrite, interaction registration, completed-phase cinematic adapter                                                   | More than two objectives, branch UI, or cinematic-owned progress                                                 |
| CINEMATIC-006     | Post-completion scene from its direction brief                                                                                                           | Missing preflight/cleanup/responsive evidence                                                                    |
| UI-002A / NAV-001 | Existing objective/navigation presentation consumes public mission data                                                                                  | Mission reaches into UI internals                                                                                |

No new network asset, font, icon, portrait, audio service, control binding, or
interface component is part of this design.

## Originality and rights

Carbon Copy's venue meeting, document-chain logic, dialogue, prop actions, shot
plan, names, and consequences are original Vanta City material. They do not
adapt a GTA mission, recognizable franchise scene, real criminal organization,
real city, real company, song, public figure, or branded product. Della's cash
offer is local institutional coercion tied to Ashfall's existing Marrow faction,
not a borrowed branching set piece.

This task adds no runtime art, model, portrait, music, character voice, or paid
generation output. The five JPEG files under the evidence directory are local
screenshots of this repository. WORLD-004 and NPC-002 retain license,
provenance, source-hash, asset-catalog, and local-runtime authority for every
future venue prop, texture, and character asset; only CC0-1.0, public-domain,
or original-project-owned material is acceptable.

## Acceptance criteria

1. The mission has exactly two objectives, including setup, and no detour to
   Signal Corner, Mack, or a return trip to Nox.
2. Starting from a valid `ash-001` completion, Nox's conversation advances only
   objective 1; only the venue verification interaction advances objective 2.
3. Entering the venue does not complete the mission. One successful interaction
   commits `+100`, no equipment, and all five facts exactly once.
4. Save/reload on objective 2 does not replay setup. Retry restores setup
   without changing prerequisite facts. Completed reload duplicates nothing.
5. New-game acceptance confirms neither knife nor handgun is owned; the handgun
   purchase path remains functional; Carbon Copy grants no weapon.
6. The destination route is discoverable and 85–140 traversable metres from the
   contact yard. World and map highlights resolve the same interaction ID.
7. The venue and interaction remain ready for the active objective or the
   mission fails explicitly; no silent unload or relocation occurs.
8. The cinematic request is emitted only after mission completion and reward
   commitment. Blocking, failure, or skip changes presentation only.
9. Normal completion, confirmed skip, skip cancellation, participant failure,
   app reload, and reduced motion preserve the exact ownership contracts in the
   cinematic brief.
10. Desktop 1280×720, narrow 390×844, and ultrawide 1920×800 passes show readable
    objectives/subtitles, no HUD or modal overlap, no clipping at 125% text, and
    no console/runtime errors or unexpected external network requests.

## Verification handoff

MISSION-003B should add focused unit coverage for definition validation,
objective order, cancellation, once-only rewards/facts, retry, and snapshot
restore. CINEMATIC-006 should add focused runtime and browser coverage for
preflight, cue order, prop paths, responsive composition, reduced motion, skip
confirmation, failure, and exact restoration. Keep screenshots and console/
network reports under `docs/screenshots/mission-003a/` or the implementing
task's successor evidence directory.
