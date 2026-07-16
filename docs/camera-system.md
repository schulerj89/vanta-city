# Camera system

`ThirdPersonCameraSystem` coordinates the renderer's single perspective camera. It owns gameplay follow/orbit behavior and temporary directed modes; features must not create a competing renderer camera or write the active camera transform directly.

## Gameplay controls and settings

- Click the game to enter pointer lock, or hold the left mouse button to orbit without locking.
- Move the mouse to orbit. Horizontal and vertical sensitivities are independent, and vertical input can be inverted.
- Use the mouse wheel to change follow distance. The requested distance and obstruction-adjusted distance both move smoothly and remain inside configured safety limits.
- Press `C` to recenter behind a moving player. Automatic recenter can be disabled; when enabled it waits after manual orbiting.
- Press `Q` to switch shoulders. The configured offset crosses between sides smoothly.
- Pausing, entering dialogue/directed camera mode, or focusing a form control releases pointer lock and consumes camera input without applying it.

Gameplay preferences are stored in local storage under `vanta-city:camera-preferences` as a versioned payload. Horizontal sensitivity, vertical sensitivity, invert-Y, follow distance, automatic recenter, and shoulder side persist. Directed modes never modify these preferences.

Development builds expose a `Camera settings` section in the existing developer panel. It contains sensitivity and distance commands, invert-Y and automatic-recenter toggles, and shoulder selection. The `Camera` section reports mode, owner, yaw/pitch, desired and actual distances, shoulder, target, anchor, obstruction, and transition progress.

## Modes and ownership

Gameplay is the implicit owner at priority `0`. Temporary owners request the same camera through `requestCamera()` or `requestConversation()`:

| Mode         | Default priority | Intended owner                  |
| ------------ | ---------------: | ------------------------------- |
| Gameplay     |                0 | Player camera                   |
| Conversation |               50 | Dialogue or interaction feature |
| Cinematic    |              100 | Future cinematic coordinator    |

A request from another owner must have strictly higher priority than the active request. A higher-priority request suspends the previous request; releasing it resumes that request. Releasing or cancelling the last temporary request restores the exact saved gameplay yaw, pitch, requested distance, shoulder offset, and field of view, then smoothly transitions the camera back. Re-requesting from the same owner replaces that owner's prior request.

```ts
const anchor = cameraAnchorFromLevel(
  level.getCinematicAnchor('camera.garage-wide'),
);
const control = camera.requestConversation('dialogue:garage', npc, anchor);

try {
  state.transition('dialogue');
  // Dialogue owns framing until completion or cancellation.
} finally {
  control.release();
  state.transition('playing');
}
```

Conversation framing accepts the player's public transform, an optional NPC `WorldPoseSource`, and an optional authored level anchor. A valid anchor wins. Without one, the camera creates a shoulder-aware two-shot around the participants. A missing or non-finite NPC/anchor falls back to a finite player-focused composition instead of producing invalid transforms. The collision query remains active in directed modes.

The camera API only owns framing. Dialogue progression and game-state transitions remain the caller's responsibility. Always release the handle on completion, cancellation, target removal, or owner disposal.

## Tuning and stability

`ThirdPersonCameraConfig` controls pitch and distance bounds, zoom/follow/recenter/shoulder smoothing, transition time, collision radius and padding, and obstruction recovery. Obstructions shorten the camera immediately to remain safe. Recovery waits briefly and damps outward; small collision-distance changes are ignored to prevent near-wall jitter.
