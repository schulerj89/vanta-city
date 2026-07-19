# Mission runtime foundation

> MISSION-002 supersedes the five-step example below with the two-objective direct-meeting slice documented in [mission-002-direct-meeting.md](mission-002-direct-meeting.md). The lifecycle and ownership contracts in this document remain authoritative.

## Scope and canon

MISSION-001 added one authoritative mission/objective runtime and the production skeleton for `ash-001-walk-the-block` (Walk the Block). The structured Ashfall story bible remains canon authority. MISSION-002 now uses `trigger.intersection-center`, public completion of `conversation.mack.introduction`, and WORLD-002's `location.ash-001.contact-yard`. It preserves Mack at `spawn.npc-mechanic` and Nox at `spawn.npc-alley` without changing their entity, speaker, conversation, character, or spawn IDs.

No later mission, cinematic sequence, map system, dynamic route, loaded model, camera, DOM node, or browser listener belongs in mission definitions. The title/boot flow owns `cinematic.ash-001.opening`; the optional `cinematic.ash-001.destination-reveal` remains a typed mission request and never advances objectives.

Integration visual review keeps `spawn.npc-mechanic` authoritative but places it at `[-12, 0.22, 9.5]`, west of `c.street-light-nw`. The prior position made a common east-side interaction straddle the pole, so no participant-relative camera profile could reliably show both speakers. The stable NPC, speaker, conversation, portrait, character, mission, and spawn IDs remain unchanged; the camera system still exclusively owns the active camera.

## Authority and lifecycle

- `MissionSystem` is the sole owner of prerequisites, active mission, ordered objective transitions, attempt state, world facts, cancellation, failure, retry, completion, rewards, and highlight requests.
- Definitions contain stable IDs and typed conditions only. Runtime adapters translate existing world, interaction, public dialogue-completion, dialogue-hook, health, money, and equipment surfaces into mission events or reward operations.
- The system samples authored trigger volumes and resolved landmarks through public level/player APIs. It subscribes to existing event buses once during initialization and releases every subscription during disposal.
- Public snapshots are immutable, serializable, schema-versioned, and contain no runtime objects. A persistence snapshot can be JSON-round-tripped and restored against the same validated definition catalog.
- Cancellation is available only before Mack's briefing completes. Failure creates a retry-ready attempt without granting facts or rewards. Retry restarts the ordered objectives from the mission-start state. Completion grants exactly `reward.ash-001-walk-the-block` (75 units) and facts `rook-arrived-in-ashfall=true`, `rook-accepted-orin-search=true`, `marrow-has-rook-arrival-time=true`, `contact-yard-meeting-completed=true`, and `mack-trust=conditional` once while preserving `orin-status=missing`.

## Public observation and highlights

The public snapshot publishes mission progress, current objective, facts, latest notification, and highlight requests. A request names `world` and/or `map` channels plus a stable target kind/reference ID; it never contains copied map geometry or a Three.js object. MAP-001 can resolve the same authored references through level/map authority without an adapter. Mission UI and browser/debug tooling observe this snapshot and event stream only.

## Failure, restoration, and disposal

Player depletion or loss of a required mission surface can fail an active attempt. Retry resets objective-local progress while preserving pre-attempt money/equipment and already committed campaign facts. Cancellation removes active highlights and writes no facts. Disposal removes subscriptions, debug registrations, and presentation observers without granting rewards or changing the player, camera, input, or game state.
