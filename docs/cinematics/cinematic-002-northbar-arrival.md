# CINEMATIC-002 — Northbar Arrival

Status: approved preproduction authority; runtime and production assets remain blocked by the dependencies in this brief.

This document is the canonical narrative, cinematic, performance, transition, and visual-acceptance brief for the replacement opening. Runtime definitions may encode it, but must not silently change its story facts, blocking, dialogue, or completion boundary.

## Scene decision

- **Location:** Northbar Coach Depot (`northbar-coach-depot`), a new opening-only production level physically separate from Ashfall Junction.
- **Date and time:** September 29, 1997, 5:42 a.m.
- **Story beat:** `ash-001-northbar-arrival`
- **Cinematic:** `cinematic.ash-001.northbar-arrival`
- **Dialogue/subtitle sequence:** `dialogue.ash-001.northbar-arrival`
- **Mission:** `ash-001-walk-the-block`
- **Transition:** `transition.ash-001.northbar-to-junction`
- **Destination:** level `test-district`, location `landmark.north-approach`, spawn `spawn.player-default`, rotation `[0, π, 0]`
- **Participants:** Rook (`casual`, speaker `rook`), Mack Bell (`mack`), and Della Voss (`della-voss`)
- **Duration target:** 32–38 seconds plus actual destination readiness; nine purposeful shots
- **Voice policy:** subtitles only. Character voice-over, generated character speech, and implied lip sync are prohibited.

Northbar is a 1970s municipal intercity coach annex at Ashfall's northern cut: a glazed-brick waiting room, sawtooth coach bays, a covered baggage lane, pay phones, paper timetables, fluorescent interior light, sodium bay lamps, and wet concrete. Marrow Transit leases the baggage counter as contract overflow, making the depot a credible place for civic transport and private surveillance to overlap. It must be authored as a real, bounded level with collision, staging marks, vehicle paths, camera anchors, readable props, and local licensed assets. It is not an Ashfall Junction reskin and does not count toward the open-world map-expansion percentage because it is a separate opening-only location, not added free-roam area.

## Why the scene happens

Rook arrives on the first overnight coach because Orin bought the ticket through Mack and promised to meet the 5:42 arrival. Rook intends to collect a courier fee, make one delivery, and take the 6:10 eastbound connection out. Mack appears instead and admits that Orin has missed two nights. At the Marrow counter, Della removes the carbon from the coach arrival manifest while sounding as if she is only teasing Mack about his vehicle. She does not yet know Rook's street name; she wants to connect the unidentified outside courier to Mack's garage.

Mack wants Rook into his service wagon before Della can finish the connection. He hides that Orin disappeared after Mack delayed acting on the tow-ledger warning. Rook wants a clean transaction and hides the sealed 1992 cassette inside the duffel. Della wants the arrival record and vehicle plate while hiding that Marrow expected Orin to seek outside help.

The turning point is visible, not narrated: Rook sees Della take the carbon, looks once toward the eastbound timetable, folds the unused ticket, lifts the duffel, and says, “Junction, then.” Rook chooses responsibility while escape is still available. The scene changes the immediate objective from collecting a fee to finding Orin, establishes that Marrow has Rook's arrival time without yet knowing Rook's identity, and converts Mack and Rook from a failed pickup into guarded cooperation.

The wagon ride to Ashfall Junction is necessary because Northbar is outside the playable district, Mack needs to separate Rook from the passenger record, and the Junction garage is the only place Mack can explain more without yielding his worksite to Marrow. The arrival line gives the first gameplay route—Signal Corner, south approach, garage—so the cinematic causes the mission rather than merely decorating it.

## CINEMATIC-001 diagnosis and succession

The current opening is technically sound as a lifecycle demonstration but dramatically insufficient as the production opening:

1. Its own design brief says it does not advance a mission objective. Nothing is decided, learned through action, risked, or made persistent.
2. The mission begins after Rook enters the Junction, then the cinematic visually restages Rook on the north approach. It does not create an arrival or transport the player anywhere.
3. Mack speaks while distant or outside a credible conversational eyeline. Rook and Mack never share a purposeful two-shot, exchange an object, or react to one another.
4. The middle shot points at an empty intersection. The existing captures make participants small against sparse test geometry and contain no justified close-up or performance detail.
5. Dependency data lists no assets or animations, and participant validation checks only presence. The runtime cannot prove that a listening, speaking, decision, prop, or vehicle beat is being performed.
6. Mack's separate introduction currently routes a celebratory clapping clip for a tense warning. That gesture contradicts the story even when the camera is not close.
7. Three static anchors, three subtitles, and an unchanged exit state communicate orientation but not intention, relationship, or consequence.

The reviewed evidence is `docs/screenshots/cinematic-001/opening-arrival-1280x720.png`, `opening-junction-1280x720.png`, and `opening-mack-1280x720.png`.

**Retained system decisions**

- Data-driven cinematic definitions with stable IDs and serializable references.
- One cinematic progression coordinator, one camera-transform owner, centralized named input, shared presentation/modal zones, and immutable public snapshots.
- Pause/resume, accessible skip confirmation, skip cancel resuming the exact progression state, terminal cleanup, and leak-free repeated playback.
- Speaker metadata resolution, subtitle-first delivery, no character voice-over requirement, and deterministic browser controls.
- Camera obstruction queries through the shared collision world and no loaded cameras, models, DOM nodes, listeners, or animation actions embedded in scene data.

**Superseded content and assumptions**

- `cinematic.ash-001.opening`, its three `camera.ash-001.*` anchors, its three `shot.ash-001.*` shots, and its current subtitle copy are replaced as the canonical opening.
- `conversation.mack.introduction` is no longer the initial story reveal. Its useful facts are rewritten into this cinematic; its clapping route must not fire.
- The opening is no longer optional mission decoration inside `test-district`. It is a required prelude starting at Northbar and handing off to Junction gameplay.
- Static-anchor-only framing is insufficient. The runtime must accept authored-wide, participant-relative, prop-relative, and vehicle-relative camera requests while the camera system remains the only transform writer.
- Presence-only participant validation and an empty animation dependency list are insufficient. Every performance intent must resolve before a shot can play.
- `exact-prior-gameplay` alone cannot describe an intentional cross-level arrival. The canonical opening needs an authoritative-destination restoration policy defined below.

## Stable ID registry

| Kind                    | Stable IDs                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source level/location   | `northbar-coach-depot`, `zone.northbar-depot`, `landmark.northbar-bay-two`, `trigger.northbar-coach-arrival`                                                                                                                                                                                                                          |
| Story/mission/content   | `ash-001-northbar-arrival`, `ash-001-walk-the-block`, `cinematic.ash-001.northbar-arrival`, `dialogue.ash-001.northbar-arrival`                                                                                                                                                                                                       |
| Participants/speakers   | entity `casual` / speaker `rook`; entity/speaker `mack`; entity/speaker `della-voss`                                                                                                                                                                                                                                                  |
| Vehicles                | `vehicle.northbar.intercity-coach`, `vehicle.mack.service-wagon`                                                                                                                                                                                                                                                                      |
| Props                   | `prop.northbar.arrival-manifest`, `prop.northbar.manifest-carbon`, `prop.rook.eastbound-ticket`, `prop.rook.duffel`, `prop.mack.wagon-keys`                                                                                                                                                                                           |
| Blocking marks          | `mark.northbar.rook-coach-step`, `mark.northbar.rook-curb`, `mark.northbar.mack-pillar`, `mark.northbar.della-counter`, `mark.northbar.wagon-passenger-door`, `mark.northbar.wagon-driver-door`                                                                                                                                       |
| Transition/destination  | `transition.ash-001.northbar-to-junction`, `test-district`, `landmark.north-approach`, `spawn.player-default`, `camera.ash-001.junction-arrival`                                                                                                                                                                                      |
| Entry/completion events | `cinematic.ash-001.northbar-arrival.entered`, `story.ash-001.orin-missing-revealed`, `story.ash-001.rook-chooses-junction`, `transition.ash-001.northbar-to-junction.requested`, `transition.ash-001.northbar-to-junction.ready`, `transition.ash-001.northbar-to-junction.completed`, `cinematic.ash-001.northbar-arrival.completed` |
| Persistent facts        | existing `orin-status=missing`; new `rook-accepted-orin-search=true`; new `marrow-has-rook-arrival-time=true`; existing `rook-arrived-in-ashfall=true` at the destination boundary                                                                                                                                                    |

`rook-known-to-marrow` remains `false` until the later evidence-custody turn. Della has an arrival record and Mack's vehicle connection, not Rook's street identity.

## Authority and entry/exit state

### Entry state

- The selected playable entity is `casual`; no duplicate Rook character exists.
- Level `northbar-coach-depot` and its required initial sector are loaded, collision is committed, and every referenced anchor, mark, prop, vehicle, participant, and verified performance mapping resolves.
- `ash-001-walk-the-block` is active at its arrival prelude; no objective reward or persistent scene fact has been granted.
- `orin-status=missing`, `mack-trust=guarded`, `pager-code-compromised=true`, `rook-accepted-orin-search=false`, `marrow-has-rook-arrival-time=false`, and `rook-arrived-in-ashfall=false`.
- Rook is at `mark.northbar.rook-coach-step`; Mack is at `mark.northbar.mack-pillar`; Della is at `mark.northbar.della-counter`.
- The coordinator captures game state, player-control enablement, gameplay-camera snapshot, interaction availability, HUD-zone visibility, focused element, pointer relationship, mission attempt, and source-level transition state before entering `cinematic`.

### Authoritative exit state

Normal completion and confirmed skip must converge before any completion event is emitted:

- Active level is `test-district` and its LevelSystem-calculated initial desired sector set is active.
- Static collision, level locations, map presentation, lighting, and `camera.ash-001.junction-arrival` resolve without fallback.
- Rook is grounded at `spawn.player-default` with rotation `[0, π, 0]`, visible, on foot, control enabled, movement reset, and no cinematic or vehicle ownership.
- Mack is production-resident at `spawn.npc-mechanic`; Della and every Northbar-only actor, prop instance, vehicle path, mixer, and level resource are unloaded.
- `ash-001-walk-the-block` is active at `ash-001-check-signal-corner`; the Northbar arrival and transition objectives are complete, no later observation/report objective is complete, and no money reward is granted.
- Facts are `orin-status=missing`, `rook-accepted-orin-search=true`, `marrow-has-rook-arrival-time=true`, and `rook-arrived-in-ashfall=true`; `junction-surveillance-checked=false` and `mack-trust=guarded` remain unchanged until gameplay earns them.
- Gameplay camera ownership, appropriate HUD zones, interaction availability, focus, pointer relationship, and input consumption are restored for the destination state. The location and minimap immediately report the Junction rather than stale Northbar data.
- `transition.ash-001.northbar-to-junction.completed` is emitted once, followed by `cinematic.ash-001.northbar-arrival.completed` with result `completed` or `skipped`.

The cinematic requests these mutations through level-transition and mission authorities. It never directly teleports the player, edits facts, advances objectives, drives a vehicle simulation, or writes the camera.

## Transition design

Mack's service wagon provides the motivated ride. Shot 8 follows the wagon through Northbar's exit lane until it passes behind a concrete divider. The divider supplies an authored visual cover, not a fake readiness timer. The transition owner then requests `test-district`, unloads Northbar through LevelSystem, and shows a restrained continuation of the wet-windshield/road-light composition in the shared `presentation` zone only while real readiness is pending. It must expose a readable “Ashfall Junction” loading state and failure/retry state; it must not conceal a hang.

The transition waits for all of the following:

1. `LevelSystem.activeLevel.id === 'test-district'` and the public `level:loaded` lifecycle fact.
2. Every sector in the LevelSystem-calculated initial desired set is `active`, with static collision committed.
3. `spawn.player-default`, `spawn.npc-mechanic`, and `camera.ash-001.junction-arrival` resolve to finite authored data.
4. Player teleport/grounding reports the destination pose and the gameplay camera can request the new player relationship.
5. Mack's production entity is ready at the garage, and Northbar-only participants are released without being treated as unexpected failures.
6. MissionSystem accepts the transition result and publishes the exact objective/fact snapshot above.
7. The location/minimap public snapshots identify `landmark.north-approach`/Ashfall Junction before HUD reveal.

Shot 9 begins only after that readiness set passes. A matched red bay lamp/Junction signal and equivalent vehicle travel direction make the geography legible without pretending the two levels are contiguous in one render root.

## Participant objectives and behavior by beat

Every hold is an authored pose or micro-action. “Idle” by itself is not a performance instruction.

| Beat             | Rook (`casual`)                                                                                                                  | Mack (`mack`)                                                                                                                         | Della (`della-voss`)                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Arrival          | Get off the coach, verify the expected contact, keep one hand near the duffel's cassette pocket; scan before committing to Mack. | Stay visible to Rook but outside the manifest counter's direct sightline; check the bay clock once, then hold still rather than pace. | Finish a manifest entry without looking eager; track the inbound coach by peripheral head turn while continuing the pencil action. |
| Missing          | Test Mack's story with one precise question; listen with shoulders contained and eyes fixed on him.                              | Get Rook moving by admitting the minimum irreversible fact—Orin missed two nights—while hiding the tow-ledger delay.                  | Continue paperwork and listen; pencil pauses only when Orin's absence is spoken, then resumes.                                     |
| Interception     | Notice Della taking the carbon and infer surveillance before Mack explains it.                                                   | Answer Della with dry misdirection, then watch Rook to see whether they leave.                                                        | Remove the carbon cleanly, needle Mack about “passenger work,” and record the wagon plate without exposing her urgency.            |
| Choice           | Look once toward the eastbound board, fold the unused ticket, lift the duffel, and choose the Junction.                          | Do not plead; expose the keys and wait for Rook's decision. Relief is a released breath and lowered shoulders, not celebration.       | Hold the carbon at chest level and follow the wagon with her eyes; do not chase or threaten.                                       |
| Transit          | Enter the passenger side, sit alert, and watch the depot recede; no generic seated loop if hands intersect the duffel.           | Open the passenger door, enter the driver side, check mirror, and drive the authored path.                                            | Remain at the counter with a deliberate paper-sorting hold until the source level unloads.                                         |
| Junction handoff | Exit to `spawn.player-default`, orient toward Signal Corner, then watch the wagon continue toward the garage.                    | Deliver the route instruction from the driver position and continue west; he does not stand at two places at once.                    | Off source level; release her actions and asset ownership cleanly.                                                                 |

## Performance contract

Performance data names logical intent, never a concrete clip. The NPC-performance owner maps an intent to an inspected clip and records the exact clip name, duration, loop policy, blend, root-motion policy, asset hash, and animation-lab evidence. `procedural-look/facing-only` may rotate bounded presentation roots or gaze targets but cannot replace a needed body action. `asset-blocker` blocks production playback and cannot fall back to clapping, combat, or a static generated placeholder.

**Global prohibition:** `HumanArmature|Man_Clapping`, `HumanArmature|Female_Clapping`, and every logical `gesture` currently mapped to clapping are forbidden throughout this cinematic. Applause never occurs in the story. Dependency validation must fail if a required intent resolves to either clip.

| Logical performance intent                 | Participant | Classification now            | Required behavior                                                                                                 |
| ------------------------------------------ | ----------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `performance.rook.coach-disembark-duffel`  | Rook        | `asset-blocker`               | Step down, acquire grounded contact, settle duffel without foot slide or hand/strap separation.                   |
| `performance.rook.travel-wary-hold`        | Rook        | `must-map-to-verified-clip`   | Purposeful standing hold with contained weight shift; current generic idle is not sufficient for a close-up.      |
| `performance.rook.listen-contained`        | Rook        | `asset-blocker`               | Listening hold with no nod loop, applause, combat readiness, or random arm swing.                                 |
| `performance.rook.ticket-fold-choice`      | Rook        | `asset-blocker`               | Look to timetable, fold ticket, secure it, and take duffel as one interruptible prop beat.                        |
| `performance.rook.wagon-enter-passenger`   | Rook        | `asset-blocker`               | Passenger-side entry with door/seat/duffel contact; the gameplay vehicle teleport/hide behavior does not qualify. |
| `performance.rook.wagon-exit-passenger`    | Rook        | `asset-blocker`               | Exit to the authored destination mark and settle into `travel-wary-hold`.                                         |
| `performance.mack.wait-clock-check`        | Mack        | `asset-blocker`               | One clock check followed by an intentional held posture under the pillar.                                         |
| `performance.mack.talk-contained`          | Mack        | `asset-blocker`               | Low, economical speaking gesture with hands below chest; no repeated generic talk loop.                           |
| `performance.mack.listen-guarded`          | Mack        | `asset-blocker`               | Still listening pose with jaw/face left unclaimed; weight and gaze carry the reaction.                            |
| `performance.mack.keys-offer`              | Mack        | `asset-blocker`               | Reveal keys without handing them over; hold until Rook decides.                                                   |
| `performance.mack.wagon-door-driver`       | Mack        | `asset-blocker`               | Open passenger/driver access as blocked, enter, sit, and take the wheel without mesh intersection.                |
| `performance.mack.drive-alert`             | Mack        | `must-map-to-verified-clip`   | Verified seated driving hold compatible with the service-wagon seat and steering wheel.                           |
| `performance.della.carbon-write-tear`      | Della       | `asset-blocker`               | Pencil, align form, tear carbon, and retain it without a floating prop.                                           |
| `performance.della.listen-without-turning` | Della       | `must-map-to-verified-clip`   | Paperwork hold whose pause can be timed; no friendly wave or applause.                                            |
| `performance.della.plate-note`             | Della       | `asset-blocker`               | One look to the wagon plate, one written note, then a controlled paper hold.                                      |
| `performance.look.rook-mack`               | Rook/Mack   | `procedural-look/facing-only` | Bounded participant-facing through presentation roots; never mutates simulation yaw.                              |
| `performance.look.della-wagon`             | Della       | `procedural-look/facing-only` | Bounded head/presentation-facing toward the wagon path after the carbon is secure.                                |

The current Mack asset contains inspected idle, walk, standing, and sitting clips, but only idle/clapping are mapped by the fixture. Those available names do not prove the close-up acting above. Rook's current interact/idle clips likewise require visual semantic review before reuse. Della has no approved production entity/model. No facial animation, phoneme system, lip sync, eye rig, or additive finger system is assumed.

## Subtitle sequence

All text is original, subtitle-friendly, and performable without voice audio. One cue appears at a time. Cue arrays must replace the current one-subtitle-per-shot limitation; presentation remains in the shared `presentation` zone.

| Line ID                                     | Speaker      | Text                                   | Shot/window         |
| ------------------------------------------- | ------------ | -------------------------------------- | ------------------- |
| `dialogue.ash-001.northbar.mack-late`       | `mack`       | “You're late.”                         | shot 2, 0.35–1.45 s |
| `dialogue.ash-001.northbar.rook-orin`       | `rook`       | “Your nephew was supposed to meet me.” | shot 2, 1.65–4.10 s |
| `dialogue.ash-001.northbar.mack-missing`    | `mack`       | “He missed two nights.”                | shot 3, 0.40–2.75 s |
| `dialogue.ash-001.northbar.della-passenger` | `della-voss` | “Morning, Bell. Passenger work now?”   | shot 4, 1.00–3.70 s |
| `dialogue.ash-001.northbar.mack-battery`    | `mack`       | “Dead battery.”                        | shot 5, 0.25–1.35 s |
| `dialogue.ash-001.northbar.della-coach`     | `della-voss` | “On a coach?”                          | shot 5, 1.60–2.80 s |
| `dialogue.ash-001.northbar.rook-carbon`     | `rook`       | “She took the carbon.”                 | shot 6, 0.35–1.85 s |
| `dialogue.ash-001.northbar.mack-counts`     | `mack`       | “She counts everything.”               | shot 6, 2.05–3.55 s |
| `dialogue.ash-001.northbar.rook-junction`   | `rook`       | “Junction, then.”                      | shot 7, 1.30–2.80 s |
| `dialogue.ash-001.northbar.mack-eyes`       | `mack`       | “One stop. Eyes open.”                 | shot 8, 0.55–2.35 s |
| `dialogue.ash-001.northbar.mack-route`      | `mack`       | “Signal corner. Then the south road.”  | shot 9, 0.35–2.85 s |
| `dialogue.ash-001.northbar.rook-garage`     | `rook`       | “Then your garage.”                    | shot 9, 3.00–4.35 s |

Speaker labels are Rook, Mack Bell, and Della Voss through authoritative metadata. The text has no narration, title-card copy, franchise phrasing, modern technology, or implied player dialogue choice.

## Shot plan

### 1. `shot.ash-001.northbar-rainline` — Place, arrival, surveillance triangle

- **Narrative purpose:** Establish a location unlike the Junction and place Rook, Mack, and Della in one readable triangle before dialogue.
- **Subject/look-at IDs:** `vehicle.northbar.intercity-coach`, `casual`, `mack`, and counter silhouette `della-voss`; look-at `mark.northbar.rook-coach-step`.
- **Composition/camera request:** 24–28 mm authored wide from `camera.northbar.establish-bay-two`, low enough to read wet pavement and roofline; the coach frames left, Mack holds mid-right, Della reads through the counter opening. Camera system request type `authored-anchor-wide`.
- **Movement/transition:** Hard cut from black; a restrained 0.6 m lateral settle is allowed only in full-motion mode. Reduced motion uses the final static frame.
- **Obstruction policy:** Shared camera collision; if the coach blocks Rook's landing mark, cut to authored safe alternate `camera.northbar.establish-bay-two-safe` rather than moving through the vehicle.
- **Blocking/eyelines:** Rook lands on `mark.northbar.rook-coach-step` and scans Mack, then counter. Mack faces the bay clock, not directly at Rook. Della's head remains on the manifest until the coach door opens.
- **Subtitle timing:** No cue. Ambient visual action carries the beat; the runtime must support subtitle-optional shots.
- **Performance intent:** `rook.coach-disembark-duffel`, `mack.wait-clock-check`, `della.listen-without-turning`.
- **Animation requirement:** Rook and Mack `asset-blocker`; Della `must-map-to-verified-clip` plus procedural coach glance.
- **Prop interaction:** Rook retains `prop.rook.duffel`; Della writes on `prop.northbar.arrival-manifest`.
- **Safe framing:** Keep every head above the lower 32% subtitle reserve and 8% from side edges. At 390 px, use 32–35 mm equivalent alternate while preserving all three silhouettes.
- **Close-up justification:** None; geography and participant relationship are the subject.
- **Exit condition:** Rook is grounded, duffel is settled, and all three participants hold their authored marks; target 3.6 s.

### 2. `shot.ash-001.northbar-mack-two-shot` — Failed pickup

- **Narrative purpose:** Put the first exchange in a credible shared frame and state the broken expectation.
- **Subject/look-at IDs:** `casual` and `mack`; look-at their live participant midpoint.
- **Composition/camera request:** Waist-up participant-relative two-shot, Rook left profile and Mack right three-quarter, camera request `participant-relative-two-shot` with `camera.northbar.rook-mack-two-shot` as safe fallback.
- **Movement/transition:** Cut on Rook's last step; no camera drift.
- **Obstruction policy:** Shared sweep with shoulder alternative; never accept the pillar between faces.
- **Blocking/eyelines:** Rook stops at `mark.northbar.rook-curb`; Mack remains at `mark.northbar.mack-pillar`; both use `performance.look.rook-mack` after the first line.
- **Subtitle timing:** `mack-late` 0.35–1.45 s; `rook-orin` 1.65–4.10 s.
- **Performance intent:** Mack `talk-contained` then `listen-guarded`; Rook `travel-wary-hold` then `listen-contained`.
- **Animation requirement:** Mack talk/listen and Rook listen are `asset-blocker`; Rook standing hold is `must-map-to-verified-clip`; facing is procedural only.
- **Prop interaction:** Rook keeps the duffel low and does not gesture with it.
- **Safe framing:** 12% headroom, both hands or duffel grip visible, faces in the upper 58%; narrow alternate stacks depth rather than cropping either participant.
- **Close-up justification:** Not a close-up; the two-shot establishes accountability and screen direction.
- **Exit condition:** Rook finishes “meet me” and Mack holds the response for 0.25 s; target 4.3 s.

### 3. `shot.ash-001.northbar-mack-missing-close` — Irreversible information

- **Narrative purpose:** Make Mack own the admission that Orin is missing and let the player read the cost he is withholding.
- **Subject/look-at IDs:** subject `mack`; look-at `casual` eye target.
- **Composition/camera request:** Chest-up 50–58 mm participant-relative medium close-up, camera request `participant-relative-close-up`, with part of Rook's shoulder at frame edge to preserve eyeline.
- **Movement/transition:** Direct cut on Mack's inhale; no push-in.
- **Obstruction policy:** Shared collision with authored `camera.northbar.mack-missing-close` fallback; never compress against the pillar below camera safety minimum.
- **Blocking/eyelines:** Mack stays planted, looks to Rook only after “missed,” and releases one breath after “nights.”
- **Subtitle timing:** `mack-missing` 0.40–2.75 s.
- **Performance intent:** `mack.talk-contained` into `mack.listen-guarded`; procedural Rook eyeline.
- **Animation requirement:** Both Mack intents are `asset-blocker`; a static idle or clapping gesture fails the shot.
- **Prop interaction:** Mack's closed hand rests near `prop.mack.wagon-keys` but does not reveal them yet.
- **Safe framing:** Keep eyes in the upper-middle third and the key hand above the subtitle reserve. Narrow view uses a looser chest-up crop, not an extreme face crop.
- **Close-up justification:** This is the scene's first irreversible fact and Mack's first honest cost; facial detail is limited, so posture, breath, hands, and eyeline must carry it.
- **Exit condition:** Subtitle clears and Mack reaches the intentional listening hold; target 3.2 s; emit `story.ash-001.orin-missing-revealed` once.

### 4. `shot.ash-001.northbar-della-carbon-close` — Surveillance becomes action

- **Narrative purpose:** Show Della creating the new risk through a paper action instead of explaining Marrow's surveillance.
- **Subject/look-at IDs:** subject `della-voss`; secondary `prop.northbar.manifest-carbon`; look-at shifts from the form to `mack`.
- **Composition/camera request:** 55 mm counter-relative medium close-up through the service opening, camera request `prop-participant-close-up`; hands, carbon, and Della's eyes remain in frame.
- **Movement/transition:** Cut on the soundless visual tear; optional 0.2 m rack-like camera settle is prohibited—use one stable focus plane.
- **Obstruction policy:** Counter opening is authored clear space; fallback anchor `camera.northbar.della-carbon-close-safe` if the coach crosses the sightline.
- **Blocking/eyelines:** Della aligns the manifest, tears the carbon, speaks to Mack without turning her torso, then looks down to retain the page.
- **Subtitle timing:** `della-passenger` 1.00–3.70 s.
- **Performance intent:** `della.carbon-write-tear`, `della.listen-without-turning`, procedural glance to Mack.
- **Animation requirement:** Carbon interaction is `asset-blocker`; held paperwork is `must-map-to-verified-clip`; facing only is procedural.
- **Prop interaction:** Manifest remains on the counter; carbon ends visibly in Della's hand. No floating or duplicated page is acceptable.
- **Safe framing:** The carbon action sits above the lower 35% reserve and remains legible at 390 px; no critical text must be readable from the paper texture.
- **Close-up justification:** Della's quiet paper theft creates `marrow-has-rook-arrival-time`; the prop and her controlled attention are the dramatic action.
- **Exit condition:** Carbon is fully separated and retained; target 4.0 s.

### 5. `shot.ash-001.northbar-three-way-cover` — Misdirection under observation

- **Narrative purpose:** Let Mack misdirect Della while Rook sees that the lie does not fool her.
- **Subject/look-at IDs:** foreground `casual`/`mack`, background `della-voss`; look-at live midpoint of Rook/Mack while keeping Della in the depth layer.
- **Composition/camera request:** Layered 35–40 mm three-shot from `camera.northbar.three-way-cover`; camera request `authored-anchor-multi-participant`.
- **Movement/transition:** Cut back across the established axis; no pan between speakers.
- **Obstruction policy:** Shared collision; counter frame may border Della but cannot bisect her face or carbon hand.
- **Blocking/eyelines:** Mack answers Della over his shoulder without leaving his mark. Della looks at the service wagon, not Mack's face. Rook watches both.
- **Subtitle timing:** `mack-battery` 0.25–1.35 s; `della-coach` 1.60–2.80 s.
- **Performance intent:** Mack `talk-contained`; Della `listen-without-turning`; Rook `listen-contained`; procedural eyelines.
- **Animation requirement:** Mack and Rook are `asset-blocker`; Della hold is `must-map-to-verified-clip`; facing only is procedural.
- **Prop interaction:** Della retains carbon; Mack's keys remain concealed.
- **Safe framing:** Three readable silhouettes at desktop; narrow alternate reduces Della to a clear upper-body background figure without shrinking Rook/Mack below waist-up size.
- **Close-up justification:** None; the spatial triangle and failed lie require shared coverage.
- **Exit condition:** Della finishes “coach?” and moves her gaze to the wagon plate; target 3.2 s.

### 6. `shot.ash-001.northbar-rook-decision-close` — Rook understands the risk

- **Narrative purpose:** Show Rook interpreting the carbon before Mack labels Della's habit.
- **Subject/look-at IDs:** subject `casual`; secondary look targets `prop.northbar.manifest-carbon` then `mack`.
- **Composition/camera request:** Chest-up 50–55 mm participant-relative medium close-up with Della/carbon soft but recognizable over Rook's shoulder; request `participant-relative-close-up`.
- **Movement/transition:** Cut on Rook's eye movement; no dramatic push.
- **Obstruction policy:** Shared collision with shoulder selection that preserves Della's counter position; otherwise use authored safe close-up without Della and rely on the established prior shot.
- **Blocking/eyelines:** Rook tracks carbon, returns to Mack, and tightens the duffel grip. Mack answers from just off-frame with a stable eyeline.
- **Subtitle timing:** `rook-carbon` 0.35–1.85 s; `mack-counts` 2.05–3.55 s.
- **Performance intent:** Rook `listen-contained`/`travel-wary-hold`; Mack off-frame `talk-contained`; procedural gaze targets.
- **Animation requirement:** Rook close-up behavior and Mack talk are `asset-blocker`; procedural eye/head facing cannot substitute for the duffel-grip beat.
- **Prop interaction:** Rook's grip changes on `prop.rook.duffel`; Della retains the carbon.
- **Safe framing:** Keep face, shoulder, and bag hand visible above subtitles. Narrow view may omit Della but not the bag-hand reaction.
- **Close-up justification:** This is Rook's inference and the emotional bridge to the coming choice; the close-up is about controlled observation, not generic idle.
- **Exit condition:** Mack's line clears and Rook looks toward the eastbound board; target 3.8 s.

### 7. `shot.ash-001.northbar-ticket-choice` — Chosen obligation

- **Narrative purpose:** Make Rook's choice physical and set the new objective.
- **Subject/look-at IDs:** `casual`, `prop.rook.eastbound-ticket`, and `prop.mack.wagon-keys`; look-at Rook's hands, then Mack.
- **Composition/camera request:** Medium 45–50 mm prop-and-participant frame from `camera.northbar.ticket-choice`, preserving hands and both upper bodies; request `prop-participant-medium`.
- **Movement/transition:** Cut on ticket entering frame; slight participant-relative reframe is allowed when Rook lifts the duffel.
- **Obstruction policy:** Shared collision; no foreground post or bag may hide the ticket fold or key reveal.
- **Blocking/eyelines:** Rook looks once to the eastbound board, folds the ticket, pockets it, and takes the duffel. Mack reveals keys and waits; he does not beckon.
- **Subtitle timing:** `rook-junction` 1.30–2.80 s.
- **Performance intent:** `rook.ticket-fold-choice`, `mack.keys-offer`, then bounded facing.
- **Animation requirement:** Both prop beats are `asset-blocker` and block the shot if they cannot be verified.
- **Prop interaction:** Ticket ends secured on Rook; keys remain with Mack; duffel transfers from ground/leg rest to carried state.
- **Safe framing:** Hands and faces remain above the lower 34% reserve; narrow view favors a slightly higher camera rather than cropping hands.
- **Close-up justification:** The frame is not a facial close-up; it gives the decision object equal weight with the participants.
- **Exit condition:** Duffel clears the ground, Rook reaches the wagon-facing hold, and `story.ash-001.rook-chooses-junction` is requested once; target 3.3 s.

### 8. `shot.ash-001.northbar-wagon-departure` — Motivated travel boundary

- **Narrative purpose:** Convert the decision into movement and begin the authored trip to the playable location.
- **Subject/look-at IDs:** `vehicle.mack.service-wagon`, `casual`, `mack`, and background `della-voss`; vehicle-relative look-at on the passenger door, then wagon center.
- **Composition/camera request:** 32–38 mm vehicle-relative tracking request, starting at `camera.northbar.wagon-entry` and yielding to `camera.northbar.wagon-departure`; camera system owns the path and collision response.
- **Movement/transition:** Rook enters passenger side; Mack enters driver side; wagon follows `path.northbar.wagon-exit`. Full motion tracks no more than 4 m before settling. Reduced motion cuts from verified seated pose to the wagon at the divider. The concrete divider provides the loading-boundary cover.
- **Obstruction policy:** Vehicle-aware shared collision; never move the camera through doors, actors, or divider. If the tracking path is blocked, use two authored safe cuts.
- **Blocking/eyelines:** Mack checks the mirror; Rook looks back to Della; Della holds the carbon and follows the wagon with her eyes only.
- **Subtitle timing:** `mack-eyes` 0.55–2.35 s.
- **Performance intent:** Rook `wagon-enter-passenger`; Mack `wagon-door-driver`/`drive-alert`; Della `plate-note` and procedural wagon look.
- **Animation requirement:** Rook entry, Mack door/entry, and Della plate note are `asset-blocker`; Mack driving is `must-map-to-verified-clip`; facing only is procedural.
- **Prop interaction:** Rook keeps duffel clear of the door; Mack retains keys; Della writes on the carbon; doors end closed before movement.
- **Safe framing:** Do not place subtitles over entry feet/door contact. Narrow uses authored entry cutaways, not an excessively wide tracking frame.
- **Close-up justification:** None; physical continuity and vehicle occupancy are the subject.
- **Exit condition:** Doors closed, occupants seated, wagon reaches divider cover, and `transition.ash-001.northbar-to-junction.requested` is accepted; minimum 4.2 s, then readiness-held transition presentation.

### 9. `shot.ash-001.junction-arrival` — Story becomes gameplay

- **Narrative purpose:** Prove the trip ended at the real starting location, give the first route, and hand control over without repeating the scene.
- **Subject/look-at IDs:** `vehicle.mack.service-wagon`, `casual`, and Junction targets `interaction.signal-controller`, `landmark.south-approach`, `spawn.npc-mechanic`; initial look-at wagon/passenger side, final look-at Rook at `spawn.player-default`.
- **Composition/camera request:** Matched 35–40 mm authored destination anchor `camera.ash-001.junction-arrival`; the wagon enters in the same screen direction as it left Northbar, with the Junction signal replacing the depot lamp.
- **Movement/transition:** Cut from readiness cover only after the target-ready event. Rook exits; wagon continues west toward the garage. Reduced motion uses static arrival and post-exit cuts with identical blocking.
- **Obstruction policy:** Shared destination collision; authored alternate keeps the street light and traffic out of the participant eyeline. Traffic is held only by the authoritative cinematic traffic policy, not by hiding collisions.
- **Blocking/eyelines:** Rook exits exactly to the destination mark, looks to Signal Corner, then south. Mack remains in the driver seat and continues west, preventing duplicate simultaneous Mack placement.
- **Subtitle timing:** `mack-route` 0.35–2.85 s; `rook-garage` 3.00–4.35 s.
- **Performance intent:** Rook `wagon-exit-passenger` into `travel-wary-hold`; Mack `drive-alert`; procedural looks to authored route targets.
- **Animation requirement:** Rook exit is `asset-blocker`; Mack driving is `must-map-to-verified-clip`; route facing is procedural only.
- **Prop interaction:** Rook exits with duffel; wagon doors end closed; no prop is left floating or duplicated across levels.
- **Safe framing:** Rook remains full figure above the subtitle region; the signal and south-road direction remain legible at desktop and narrow. Do not make the empty intersection the primary subject.
- **Close-up justification:** None; arrival geography and control handoff are the subject.
- **Exit condition:** Rook is grounded at `spawn.player-default`; after the wagon leaves frame, the vehicle-bound Mack action/entity releases before the production roster exposes the same `mack` identity at `spawn.npc-mechanic`, so no duplicate Mack exists. The mission/fact snapshot then matches the authoritative exit state, gameplay camera owns the renderer, and destination HUD snapshots are current; target 4.6 s.

## Skip, pause, failure, and replay

### Skip and normal completion

- First skip input freezes the exact shot clock, subtitle cue, performance time, vehicle path time, and transition phase, then opens the accessible confirmation in `modal`.
- Cancel closes the modal, consumes the input edge, restores prior focus, and resumes the same progression point without replaying line, prop, fact, or transition events.
- Confirm does not restore Northbar gameplay and does not bypass readiness. It enters the same destination transition, waits for the same readiness set, commits the same three scene facts/objective state once, and exits at the same Junction pose as normal completion with result `skipped`.
- A confirmed skip during the readiness-held transition remains in that transition; a cancel returns to the exact readiness presentation state. A confirmed skip during shot 9 omits only remaining presentation and still verifies the authoritative destination snapshot.
- Skip never completes Signal Corner, south-road, report, reward, or later mission objectives.

### Pause/resume

- Pause freezes sequence clocks, animation actions, vehicle choreography, subtitle progression, and camera motion. Destination loading may complete in the background, but its readiness fact is latched and no shot/event advances while paused.
- Resume consumes transient inputs and continues from the captured progression. Audio is nonessential and no clue may depend on it.

### Participant and asset failure

- Preflight validates production model source, every required intent mapping, prop binding, seat/door compatibility, anchors, marks, and asset provenance. A missing dependency blocks cinematic start and production acceptance.
- During playback, unexpected participant or action loss ends through one failure boundary. No clapping, combat clip, generated placeholder, silent T-pose, or generic idle may stand in for acting.
- Runtime safety must not deadlock boot: a recorded `failed` result may route through the same Junction transition and a concise accessible text fallback containing only “Orin is missing. Mack needs you at the Junction.” It applies the canonical destination facts/objective once, reports the failure, and remains a ship-blocking defect.

### Level-load failure

- The loading presentation exposes failure and a keyboard-operable Retry action. Skip cannot fake level readiness or place the player in an unloaded destination.
- Before source unload commits, cancellation/disposal restores the complete Northbar capture. After source unload commits, retry must either finish the Junction load or restore a validated Northbar reload snapshot; it may not leave mixed actors, collision, map facts, or cameras.
- Facts, objectives, and `rook-arrived-in-ashfall` commit only after destination readiness. A failed attempt cannot duplicate them on retry.

### Repeated playback and restoration

- Canonical production playback is one-time and rejects replay after `rook-arrived-in-ashfall=true`.
- Development replay runs in an explicit preview fixture. It captures the invoking level, player/mission/fact snapshot, camera, input, focus, pointer, HUD, and loaded assets; after preview it restores that exact snapshot instead of re-granting canonical facts.
- Three preview cycles must leave no listeners, DOM nodes, camera handles, transition requests, animation actions/mixers, vehicle paths, participant instances, or asset references beyond stable loader-owned sources.
- Debug cancellation before the irreversible load boundary restores Northbar exactly. Once the boundary commits, all terminal paths converge on the destination state; there is no attempt to resurrect an unloaded partial source scene.

## Responsive, motion, and subtitle presentation

- Presentation remains in the shared `presentation` zone; skip confirmation remains in `modal`. Cinematic code does not invent another global overlay, z-index family, font, or breakpoint.
- Default and 125% text use one speaker label plus no more than two subtitle lines. Cue text scroll is prohibited; timing may lengthen after localization rather than clipping or shrinking below the shared readable size.
- At 390×844, preserve faces and meaningful hands in the upper 66%; reserve the lower 34% for speaker, two lines, safe-area inset, and skip hint. Close-ups become looser rather than cropping foreheads or props.
- At 1920×800, cap subtitle measure and camera composition width so participants do not drift to extreme edges.
- Bright fluorescent hall, dark bay, and visually noisy coach/counter backgrounds use the existing dark-edge treatment and Ashfall amber speaker label. No title card, giant location typography, portrait, or imitation loading art is added.
- Reduced motion converts lateral settles, tracking, and vehicle-follow cameras into authored cuts; actor actions still communicate cause and effect. It does not reduce the scene to static clapping/idle tableaux.
- The skip modal keeps `role=dialog`, accessible title, initial focus on “Keep watching,” complete keyboard operation, visible focus, and non-color wording. The readiness/failure presentation uses an appropriate named status/live region without announcing every frame.

## Production dependencies and blockers

| Dependency          | Production requirement                                                                                                                                                          | Current status                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Northbar level      | Original authored geometry, collision, lighting, sectors, coach/wagon paths, blocking marks, camera anchors, readiness data, and map-hidden opening policy                      | `asset-blocker` / world task                                                                  |
| Mack                | Production roster promotion plus verified close-up listening, contained talking, key, door, and driving intents                                                                 | `asset-blocker`; current idle/clapping fixture is unacceptable                                |
| Della               | Approved local model, portrait metadata, production entity/spawn, provenance, paperwork/listening/plate-note performance                                                        | `asset-blocker`; no current runtime entity                                                    |
| Rook                | Verified duffel, ticket, coach-step, passenger-entry/exit, listening, and held-pose performance on authoritative `casual`                                                       | `asset-blocker` for prop/vehicle beats                                                        |
| Vehicles            | Local provenance for intercity coach and Mack service wagon; seats, doors, path clearance, authored dimensions, and disposal                                                    | `asset-blocker`; the current pickup may be reused only after visual/seat compatibility review |
| Props               | Local duffel, ticket, manifest/carbon, pencil, key assets and attachment metadata                                                                                               | `asset-blocker`                                                                               |
| Performance runtime | Intent requests, verified mapping validation, per-shot action lifecycle, blend/hold timing, procedural-facing boundary, cleanup                                                 | unimplemented                                                                                 |
| Cinematic runtime   | Optional/multiple subtitle cues, relative camera requests, action/event exits, expected participant residency changes, readiness-held transition phase, destination restoration | unimplemented extension to CINEMATIC-001                                                      |
| Mission runtime     | Required opening request, prelude objectives, cinematic result/transition events, once-only mid-mission fact commits, destination objective state                               | unimplemented extension to MISSION-001                                                        |
| Level transition    | Real cross-level readiness, rollback/retry, source/destination resource ownership, destination spawn/grounding and HUD synchronization                                          | unimplemented                                                                                 |
| Audio               | No dependency; environmental audio may be added later but cannot carry story information                                                                                        | not required; character voice-over prohibited                                                 |

All accepted runtime assets must be CC0-1.0, public-domain, or original-project-owned with source URL, author, license, retrieval date, hashes, scale, forward axis, clip inventory, and modifications recorded locally. A placeholder may exist only in an explicit failure-path test.

## Objective acceptance criteria

1. The opening starts in a production Northbar level visibly and spatially distinct from Ashfall Junction, and ends in the real `test-district` at `spawn.player-default`.
2. Rook learns Orin is missing, Della takes the manifest carbon, Rook physically chooses the Junction, and the authoritative objective/risk facts change exactly once.
3. Every participant performs the per-beat behavior above. Every logical animation is reported as a verified mapping, procedural facing only, or a blocking dependency; clapping never plays.
4. Mack and Rook share a clean two-shot; Mack, Della, and Rook receive the justified medium close-ups above; blocking, eyelines, props, and screen direction remain coherent.
5. Normal completion and confirmed skip produce equal level, spawn, rotation, mission objective, facts, camera owner, controls, interaction, HUD, focus, and pointer results; only the completion result differs.
6. Skip cancel and pause/resume preserve the exact shot, cue, performance, path, and readiness progression without replayed events.
7. Participant/asset failure, level-load failure, retry, disposal, and three preview cycles restore or converge according to the explicit boundary without leaks, duplicate facts, mixed-level resources, or deadlock.
8. All dialogue cues fit two lines at default and 125% text on desktop and 390 px narrow layouts; speaker labels, focus, status, contrast, and non-audio information meet the shared UI contract.
9. The camera system is the only camera-transform writer; NPC performance, mission, level transition, vehicle choreography, and UI remain separately owned through public IDs/events.
10. Production acceptance uses licensed local assets and verified animation-lab evidence. Missing final art, Della, props, or action clips blocks approval.
11. Browser console, page errors, runtime reporter, failed runtime requests, viewport overflow, camera obstruction, prop attachment, foot slide, mesh intersection, and source/destination disposal are clean in the screenshot/test matrix.
12. The result remains an original Ashfall scene with no copied franchise story, title-card treatment, dialogue, brand, composition, logo, music, or character voice-over.

## Screenshot and visual-review matrix

| Evidence ID                           | Viewport/state                       | Required proof                                                              |
| ------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `northbar-establish-dark-desktop`     | 1280×720, dark wet bay               | Shot 1 location contrast, coach, all three silhouettes, safe edge treatment |
| `northbar-two-shot-bright-desktop`    | 1280×720, fluorescent hall spill     | Shot 2 eyelines, readable faces/hands, two-line subtitle                    |
| `northbar-mack-close-desktop`         | 1280×720                             | Shot 3 intentional listening/talking, no generic idle/clap                  |
| `northbar-della-carbon-noisy-desktop` | 1280×720, coach/counter visual noise | Shot 4 carbon interaction and Della close-up above subtitles                |
| `northbar-rook-choice-desktop`        | 1280×720                             | Shots 6/7 duffel grip, ticket, keys, and decision performance               |
| `northbar-transition-loading-desktop` | 1280×720, readiness pending          | Shot 8 cover, truthful loading status, no hang concealment                  |
| `junction-arrival-desktop`            | 1280×720                             | Shot 9 real Junction, vehicle direction match, exact spawn, route targets   |
| `northbar-skip-confirm-desktop`       | 1280×720, shot 4                     | Modal hierarchy, focus, paused carbon/action/cue state                      |
| `northbar-two-shot-narrow-large`      | 390×844, 125% text                   | Both participants, hands, two lines, no clipping/overflow                   |
| `northbar-mack-close-narrow`          | 390×844                              | Looser close-up, preserved eyeline, no forehead/hand crop                   |
| `northbar-della-close-narrow`         | 390×844, visually noisy              | Carbon legibility and speaker label without prop occlusion                  |
| `junction-arrival-narrow`             | 390×844                              | Full Rook figure, signal/south-road direction, safe HUD handoff             |
| `northbar-skip-confirm-narrow-large`  | 390×844, 125% text                   | Complete labels, visible default focus, safe-area and button wrap           |
| `northbar-reduced-motion-departure`   | 1280×720 and 390×844, reduced motion | Authored cuts replace tracking while entry/departure cause remains clear    |
| `northbar-ultrawide-establish`        | 1920×800                             | Capped composition/subtitle measure and no extreme participant drift        |
| `junction-restored-gameplay`          | 1280×720 and 390×844                 | Cinematic UI gone; correct HUD/location/minimap/objective and camera owner  |

Each visual family must be inspected over bright, dark, and noisy production backgrounds, not a flat lab alone. Review also records console/page/runtime errors, unexpected requests, overflow, occlusion, focus order, pointer ownership, active camera owner, action intent/clip names, prop binding, source/destination level state, and mission/fact snapshot.

## Recorded architectural decisions

- `CinematicCoordinator` remains sequence/progression authority, but definitions must describe camera requests, subtitle cue arrays, performance intents, events, and transition requests by ID. It does not absorb animation, mission, vehicle, level, or UI simulation.
- `ThirdPersonCameraSystem` remains the only active-camera transform owner. Relative shot types resolve through its public request API and authored safe anchors.
- A dedicated performance owner resolves logical intents to verified actions on participant visual roots, supports deterministic hold/interrupt/cleanup, and rejects forbidden substitutions.
- LevelSystem/transition authority owns Northbar unload, Junction load, sector readiness, rollback, spawn grounding, and source/destination resource disposal.
- MissionSystem owns objectives and persistent facts. Cinematic completion requests facts/events but cannot write them.
- The opening uses `authoritative-destination-gameplay` restoration. Pre-boundary cancellation can restore the source capture; normal completion, confirmed skip, and post-boundary terminals converge at the destination.
- Northbar is a separate production level and opening-only presentation location. It does not silently expand measured Junction free-roam area or duplicate Junction map geometry.
- The current single-subtitle-per-shot shape is superseded by ordered cue IDs so shot duration follows acting rather than forcing a cut for every sentence.
- Required participants may have authored residency windows. Della's expected release during the level boundary is not a failure; unexpected loss before that window is.

## Recorded visual decisions

- Northbar uses cold fluorescent glazing, restrained sodium bay light, wet concrete, glazed brick, paper signage, and real 1997 transport objects. Junction keeps its existing industrial daylight identity, making the matched red lamp/signal transition legible.
- Coverage favors one establishment, one two-shot, three justified performance/prop close-ups, two decision/transit frames, and one destination arrival. There is no montage or title-card interruption.
- Close-ups remain medium close to suit low-poly faces and show hands/posture; no unavailable facial nuance or lip sync is implied.
- Screen direction is depot interior/coach left, exit/Junction travel right. The camera never crosses the Rook/Mack line without a neutral shared frame.
- Subtitles remain the dominant information surface. Portraits, giant names, route cards, fake film grain, and franchise-like loading art are excluded.
- Vehicle and paper actions are story actions, not background decoration; if they cannot be performed cleanly, the scene is blocked rather than reframed to hide them.

## Implementation handoff and dependency order

1. **World — Northbar and destination staging.** Build only `northbar-coach-depot`, its collision/sectors/lighting, stable marks/anchors/vehicle paths, loading cover, props/vehicle placement, and `camera.ash-001.junction-arrival`. Do not change cinematic progression, NPC action ownership, mission facts, or UI. Validate local asset provenance, collision, finite anchors, readiness, streaming/disposal, and desktop/narrow blocking captures.
2. **NPC performance — production cast and action mappings.** In parallel with world construction, promote Mack appropriately, create approved Della identity/entity metadata, inspect Rook/Mack/Della assets, acquire or author only licensed missing production actions, map every logical intent, enforce the clapping prohibition, and prove prop/vehicle compatibility in the animation lab. Do not edit shot timing, world geometry, mission logic, or cinematic transition ownership.
3. **Cinematic runtime — data, camera requests, performance requests, transition phase.** After stable world IDs and performance mapping results exist, extend the serializable definition/coordinator for cue arrays, relative camera request types, action exits, residency windows, readiness-held cross-level transition, destination restoration, and cleanup. Encode this nine-shot plan without owning facts, loaded objects, camera transforms, or direct level mutation.
4. **Mission — canonical prelude and facts.** Update `ash-001-walk-the-block` start/prelude/objectives/content request so Northbar is required, consume the story/transition events, commit the three destination facts once, remove the redundant initial Mack introduction/clap route, and make `ash-001-check-signal-corner` the first interactive Junction objective. Preserve reward, observation, report, cancellation/retry, and later mission continuity.
5. **Browser/visual — behavior and composition acceptance.** After the four owners integrate, add unit and public-bridge coverage for definition validation, animation dependency rejection, pause/skip/result convergence, failures/retry, exact source/destination restoration, and three replay cycles. Capture and manually inspect the complete screenshot matrix, animation names, console/runtime/network state, overflow, focus, pointer/camera ownership, mission facts, and resource counts.

World and NPC-performance work may proceed in parallel. Cinematic runtime depends on their stable IDs/contracts; mission depends on cinematic result/transition events; browser/visual acceptance depends on the integrated behavior. Any worker finding a missing production asset or unverified action reports an `asset-blocker` and does not substitute a placeholder.
