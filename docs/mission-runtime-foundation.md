# Mission runtime foundation

## Scope and canon

MISSION-001 adds one authoritative mission/objective runtime and the production skeleton for `ash-001-walk-the-block` (Walk the Block). The structured Ashfall story bible remains canon authority. This slice uses only existing feasible Ashfall Junction hooks: `trigger.intersection-center`, `conversation.mack-introduction.completed`, `interaction.signal-controller`, `landmark.south-approach`, and entity `mack`. It promotes Mack's existing production-ready definition at `spawn.npc-mechanic` without changing the entity, speaker, conversation, portrait, character, or spawn IDs.

No later mission, cinematic sequence, map system, dynamic route, new dialogue, placeholder prose, loaded model, camera, DOM node, or browser listener belongs in mission definitions. The optional references `cinematic.ash-001.opening` and `cinematic.ash-001.mack-return` remain typed requests for CINEMATIC-001 and never advance objectives.

Integration visual review keeps `spawn.npc-mechanic` authoritative but places it at `[-12, 0.22, 9.5]`, west of `c.street-light-nw`. The prior position made a common east-side interaction straddle the pole, so no participant-relative camera profile could reliably show both speakers. The stable NPC, speaker, conversation, portrait, character, mission, and spawn IDs remain unchanged; the camera system still exclusively owns the active camera.

## Authority and lifecycle

- `MissionSystem` is the sole owner of prerequisites, active mission, ordered objective transitions, attempt state, world facts, cancellation, failure, retry, completion, rewards, and highlight requests.
- Definitions contain stable IDs and typed conditions only. Runtime adapters translate existing world, interaction, dialogue-hook, health, money, and equipment surfaces into mission events or reward operations.
- The system samples authored trigger volumes and resolved landmarks through public level/player APIs. It subscribes to existing event buses once during initialization and releases every subscription during disposal.
- Public snapshots are immutable, serializable, schema-versioned, and contain no runtime objects. A persistence snapshot can be JSON-round-tripped and restored against the same validated definition catalog.
- Cancellation is available only before Mack's first conversation completes. Failure creates a retry-ready attempt without granting facts or rewards. Retry restarts the ordered objectives from the mission-start state. Completion grants exactly `reward.ash-001-walk-the-block` (75 units) and facts `rook-arrived-in-ashfall=true`, `junction-surveillance-checked=true`, and `mack-trust=conditional` once.

## Public observation and highlights

The public snapshot publishes mission progress, current objective, facts, latest notification, and highlight requests. A request names `world` and/or `map` channels plus a stable target kind/reference ID; it never contains copied map geometry or a Three.js object. MAP-001 can resolve the same authored references through level/map authority without an adapter. Mission UI and browser/debug tooling observe this snapshot and event stream only.

## Failure, restoration, and disposal

Player depletion or loss of a required mission surface can fail an active attempt. Retry resets objective-local progress while preserving pre-attempt money/equipment and already committed campaign facts. Cancellation removes active highlights and writes no facts. Disposal removes subscriptions, debug registrations, and presentation observers without granting rewards or changing the player, camera, input, or game state.
