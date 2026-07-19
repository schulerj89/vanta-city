# MISSION-002 — direct meeting

## Outcome and story decision

`ash-001-walk-the-block` now asks the player to do two things only: hear Mack's briefing, then take the long east road to meet Nox at `location.ash-001.contact-yard`. The old Signal Corner inspection, south-approach loop, and return-to-Mack report are removed instead of being disguised as optional errands.

Mack remains the giver because his established goal is finding Orin and his existing licensed local model, speaker, portrait metadata, conversation camera profile, production spawn, and garage relationship already make him authoritative. Nox remains the contact because his evidence-network role and existing licensed local model make the yard meeting credible. WORLD-002 owns the physical meeting surface and should keep these IDs aligned:

- contact entity: `nox`
- contact spawn: `spawn.npc-alley`
- contact interaction: `interaction.npc.nox`
- meeting location: `location.ash-001.contact-yard`

The dialogue preserves the 5:42 arrival, Orin's two-night absence, Rook's explicit acceptance of the search, and Marrow taking the manifest carbon. Completing the mission leaves `orin-status=missing`; reaching Nox is a lead, not a false rescue.

## Mission and presentation contract

- Entering `trigger.intersection-center` starts the mission and requests required presentation `cinematic.ash-001.opening`.
- Completing `conversation.mack.introduction` advances the first objective. The mission listens to the public `dialogue:completed` event rather than a line-specific hook.
- That objective transition requests optional presentation `cinematic.ash-001.destination-reveal` exactly once for the completed attempt. It does not complete, replace, or duplicate the travel objective.
- Entering `location.ash-001.contact-yard` completes the only travel/meeting objective and grants `reward.ash-001-walk-the-block` once.
- Reward facts are `rook-arrived-in-ashfall=true`, `rook-accepted-orin-search=true`, `marrow-has-rook-arrival-time=true`, `contact-yard-meeting-completed=true`, and `mack-trust=conditional`. The reward remains 75 units and grants no equipment.
- Cancellation is allowed until Mack's briefing completes. Failure/retry returns to the briefing with no reward or fact mutation. Restoring a persistence snapshot on the travel objective does not replay the reveal request.

## Performance and asset boundary

This slice adds no model, portrait, face substitute, animation clip, cinematic shot, or NPC-system fallback. Because Mack, Nox, and the selected Rook identity have no installed verified portrait in this flow, their authored lines explicitly suppress the generic initials tile and use the existing one-column dialogue layout. Mack and Nox retain their verified CC0 local character assets and remain in neutral idle during ordinary dialogue. The destination-reveal owner may request only verified `neutral-hold`, `indicate`, or `acknowledge` intents; it must use explicit neutral fallback when a participant lacks a requested gesture. Applause/clapping, combat actions, guessed facial acting, and nearest-clip substitution are prohibited.

## Compact UI design brief

- Purpose: answer “who do I speak to?” and then “where is the one meeting?” at a glance.
- Authority: `MissionSystem.getSnapshot()` and its event stream remain the only mission sources. No DOM, cinematic, or map node owns progress.
- Hierarchy: retain the existing mission title, one objective sentence, bounded notification, and one primary destination label. No route recap, errand checklist, portrait, or additional permanent HUD surface is added.
- Zones and tokens: reuse `objectives`, `notifications`, `world-indicator`, and MAP-001's map rendering with the existing Ashfall tokens and motion rules. The only CSS addition collapses the existing dialogue grid when a line explicitly suppresses an unverified portrait; no token, font, icon, focus, pointer, camera, or breakpoint changes are required.
- States: briefing active, destination revealed, travel active, completed, failed/retry-ready, cancelled, and restored. Cinematic skip/cancel changes presentation only.
- Responsive/accessibility: the short objective copy must wrap inside the existing narrow safe width and enlarged-text behavior. Existing named region, polite updates, assertive failure, non-color text, reduced motion, and noninteractive world-indicator contracts remain unchanged.

## Visual and browser acceptance

- Desktop 1280×720: Mack briefing objective and conversation are readable over live Junction gameplay; Mack remains neutral with no gesture substitution.
- Narrow 390×844: the contact-yard objective wraps without clipping, horizontal overflow, or collision with navigation/player-status regions.
- Ultrawide 1920×800: the same objective stays in the authoritative objective zone and does not drift or add a second route surface.
- The public mission snapshot exposes exactly two objectives and the contact-yard highlight on both `world` and `map` channels.
- Until WORLD-002 integrates the physical location, the mission browser owner may use `mission.complete-objective` only to validate once-only completion/reward. Integrated acceptance must replace that seam with real player entry into `location.ash-001.contact-yard` and confirm the map marker resolves physically.
- Console errors, page errors, runtime errors, failed requests, unexpected external requests, camera/pointer ownership changes, and duplicate rewards block acceptance.

Reviewed captures: [desktop briefing](screenshots/mission-002/mission-active-desktop.png), [narrow destination](screenshots/mission-002/mission-contact-yard-narrow.png), and [ultrawide destination](screenshots/mission-002/mission-contact-yard-ultrawide.png).

## Integration boundary

This branch owns story source/render, mission definition/runtime event plumbing, giver/contact dialogue, facts/reward, documentation, and focused tests. It does not implement the destination-reveal cinematic, add or move world geometry/spawns/locations, change traffic or pedestrians, broaden `NpcSystem`, alter shared UI styles, or update coordination state.
