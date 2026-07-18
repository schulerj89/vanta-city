# Camera system

`ThirdPersonCameraSystem` coordinates the renderer's single perspective camera. It owns gameplay follow/orbit behavior and temporary directed modes; features must not create a competing renderer camera or write the active camera transform directly.

## Gameplay controls and settings

- Click the game to enter pointer lock, or hold the left mouse button to orbit without locking.
- Move the mouse to orbit. Horizontal and vertical sensitivities are independent, and vertical input can be inverted.
- Hold `Q` or `E` to orbit left or right at the configured frame-rate-independent keyboard speed.
- Use the mouse wheel to change follow distance. The requested distance and obstruction-adjusted distance both move smoothly and remain inside configured safety limits.
- Press `C` to recenter behind a moving player. Automatic recenter can be disabled; when enabled it waits after manual orbiting.
- Press `V` to switch shoulders. The configured offset crosses between sides smoothly.
- Pausing, entering dialogue/directed camera mode, or focusing a form control releases pointer lock and consumes camera input without applying it.

Gameplay preferences are stored in local storage under `vanta-city:camera-preferences` as a versioned payload. Horizontal sensitivity, vertical sensitivity, invert-Y, follow distance, automatic recenter, and shoulder side persist. Directed modes never modify these preferences.

An untouched profile starts at a `4.4m` follow distance. Desktop and narrow full-body captures keep the complete player silhouette visible while bringing the player and nearby street detail modestly closer than the earlier `4.8m` framing. The value is only a fallback for profiles without stored preferences: an existing valid saved follow distance remains authoritative and is not migrated or overwritten. Combat focus remains a temporary upper-bound layer over that preference, and conversation profiles retain their independently authored composition.

Development builds expose camera diagnostics and controls together in the `Camera` section, separated into labelled **Diagnostics** and **Controls** blocks. The numeric `camera.set-follow-distance` control accepts `2.2–9m` in `0.1m` steps and applies a session-only override; it never writes local storage. **Reset live distance to default** selects `4.4m` for the session, while **Save live distance as preference** explicitly routes the current desired value through `setPreferences()`. Diagnostics show current/desired distance, the saved preference, and whether a live override is active. Explicit preference changes, including ordinary mouse-wheel zoom, clear the override and retain the established persisted-preference behavior.

The development-only [Camera Composition Lab](camera-composition-lab.md) also exposes the unobstructed desired position, obstruction-adjusted position, sweep start, blocker ID, saved gameplay camera, and restoration path. These are passive snapshots from the same camera and collision systems; the lab never writes the renderer camera.

## Modes and ownership

Gameplay is the implicit owner at priority `0`. Temporary owners request the same camera through `requestCamera()` or `requestConversation()`:

| Mode         | Default priority | Intended owner                  |
| ------------ | ---------------: | ------------------------------- |
| Gameplay     |                0 | Player camera                   |
| Conversation |               50 | Dialogue or interaction feature |
| Cinematic    |              100 | Future cinematic coordinator    |

A request from another owner must have strictly higher priority than the active request. A higher-priority request suspends the previous request; releasing it resumes that request. Releasing or cancelling the last temporary request restores the exact saved gameplay ownership, yaw, pitch, requested and smoothed distance, shoulder offset, field of view, camera offset, and target relationship, then smoothly transitions the camera back. The saved relationship follows a live player position during the return and yields immediately to new orbit, zoom, shoulder, recenter, or movement input. Re-requesting from the same owner replaces that owner's prior request, and a completed return snapshot is never reused by a later conversation.

```ts
const anchor = cameraAnchorFromLevel(
  level.getCinematicAnchor('camera.garage-wide'),
);
const profile = resolveConversationCameraProfile(
  npcDefinition.conversationCameraProfileId,
);
const control = camera.requestConversation(
  'dialogue:garage',
  npc,
  anchor,
  profile,
);

try {
  state.transition('dialogue');
  // Dialogue owns framing until completion or cancellation.
} finally {
  control.release();
  state.transition('playing');
}
```

Conversation framing accepts the live player pose, an optional NPC `WorldPoseSource`, one validated `ConversationCameraProfile`, and an optional authored level anchor. A valid anchor wins. Without one, the pure standard policy targets the participant midpoint and derives a translation-invariant three-quarter two-shot from live separation, profile FOV, viewport aspect, participant bounds, minimum backoff, and bounded pitch. The position axis remains authoritative at ordinary distance. Nearly coincident participants blend toward their opposing facing axis so millimetre-scale movement cannot flip the camera; coincident or invalid facing has an explicit deterministic fallback ending at world-forward only when no participant direction exists. Diagnostics report separation, selected side, required distance, pitch, safe-frame status, and fallback reason.

The camera prefers the configured gameplay shoulder and selects the opposite participant-relative shoulder when its authored-world clearance is materially better. Conversation sweeps ignore a tagged NPC occupancy volume only when the sweep midpoint already overlaps it, which is legitimate at minimum interaction spacing. Other NPC bodies, walls, alley blockers, and all other static geometry still participate in both shoulder selection and final adjustment. A missing or non-finite NPC/anchor falls back to a finite player-focused composition instead of producing invalid transforms.

Dialogue-capable NPC definitions may reference `default`, `close`, or `wide` through `conversationCameraProfileId`; omitted values resolve to `default`. NPC definitions remain authoritative for identity and profile selection. Dialogue requests camera ownership and sets presentation-facing targets, but never writes a camera transform. The camera system remains the sole active-camera writer. Player conversation facing rotates only the visual root, so authoritative movement position and facing yaw stay unchanged; NPC presentation similarly compensates authored model yaw while its conversational world pose faces the player.

The camera API only owns framing. Dialogue progression and game-state transitions remain the caller's responsibility. Always release the handle on completion, cancellation, target removal, or owner disposal.

## Tuning and stability

`ThirdPersonCameraConfig` controls pitch and distance bounds, zoom/follow/recenter/shoulder smoothing, transition time, collision radius and padding, and obstruction recovery. Gameplay, conversation shoulder selection, directed anchors, and restoration all cast against the same oriented static geometry used by movement and visibility. Casts conservatively expand each authored box by the camera radius and include pitched ramp thickness. Obstructions shorten the camera immediately to remain safe. Recovery waits briefly and damps outward; small collision-distance changes are ignored to prevent near-wall jitter. Diagnostics expose both the camera's obstructed state and the collision world's last hit ID.

Known limits: the cast is a swept sphere against static oriented boxes, not arbitrary render meshes. In a space with less clearance than the configured radius plus padding, the camera clamps to its safety minimum; the avatar can heavily occlude the view, but the camera does not tunnel through the authored wall. There is no automatic avatar fade, first-person transition, per-material camera exclusion, or dynamic-obstacle cast yet.
