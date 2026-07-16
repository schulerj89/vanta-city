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

Development builds expose passive camera diagnostics in the `Camera` section: mode, owner, yaw/pitch, desired and actual distances, shoulder, target, anchor, obstruction, transition progress, and current sensitivities. Mutating sensitivity, distance, invert-Y, automatic-recenter, and shoulder controls are collected under `Commands / Actions`, consistent with the developer panel's state-versus-action convention.

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

Conversation framing accepts the live player pose, an optional NPC `WorldPoseSource`, one validated `ConversationCameraProfile`, and an optional authored level anchor. A valid anchor wins. Without one, the pure profile strategy creates a translation-invariant two-shot from the participant positions, independent of district origin, authored yaw, or approach side. It prefers the configured gameplay shoulder and selects the opposite participant-relative shoulder when its obstruction clearance is materially better. A missing or non-finite NPC/anchor falls back to a finite player-focused composition instead of producing invalid transforms.

Dialogue-capable NPC definitions may reference `default`, `close`, or `wide` through `conversationCameraProfileId`; omitted values resolve to `default`. NPC definitions remain authoritative for identity and profile selection. Dialogue requests camera ownership and sets presentation-facing targets, but never writes a camera transform. The camera system remains the sole active-camera writer. Player conversation facing rotates only the visual root, so authoritative movement position and facing yaw stay unchanged; NPC presentation similarly compensates authored model yaw while its conversational world pose faces the player.

The camera API only owns framing. Dialogue progression and game-state transitions remain the caller's responsibility. Always release the handle on completion, cancellation, target removal, or owner disposal.

## Tuning and stability

`ThirdPersonCameraConfig` controls pitch and distance bounds, zoom/follow/recenter/shoulder smoothing, transition time, collision radius and padding, and obstruction recovery. Obstructions shorten the camera immediately to remain safe. Recovery waits briefly and damps outward; small collision-distance changes are ignored to prevent near-wall jitter.
