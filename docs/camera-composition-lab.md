# Camera Composition Lab

Open `/?sandbox=camera-composition&debug=1` during `pnpm dev`, or run `pnpm camera-lab`. The lab is dynamically reachable only from the development sandbox bootstrap; production builds do not initialize its controls, fixtures, bridge, or imports.

## Purpose and boundaries

The lab is a deterministic tuning surface for the existing participant-relative conversation camera. It creates primitive player and NPC fixtures, feeds their live poses to `ThirdPersonCameraSystem.requestConversation()`, and registers movable oriented boxes with `StaticCollisionWorld`. `ThirdPersonCameraSystem` remains the sole writer of the renderer camera. The panel, debug commands, visual helpers, and browser bridge read public snapshots or update fixture/profile inputs; they never write camera transforms.

The NPC selector derives Mack, Nox, and Raze profile defaults from the authoritative NPC definitions. Profiles remain the shared `default`, `close`, and `wide` definitions. Re-requesting after a control change retains the original saved gameplay-camera snapshot. Restore releases the normal ownership handle and visualizes the return to that saved relationship.

The saved/restored gameplay fixture uses the same untouched `4.4m` follow-distance default as live gameplay. Conversation fixtures retain their profile-authored distances, so the lab can detect accidental coupling between default gameplay framing and dialogue composition.

## Controls

The visible panel and `camera-lab.*` debug commands cover:

- independent player and NPC position/yaw, participant spacing, and left/right/front/back approach;
- active NPC/profile, gameplay shoulder, responsive/desktop/mobile/short viewport stages, and optional authored anchor;
- paired alley blockers with movable position and yaw, registered through the authoritative oriented-box collision query;
- conversation acquisition and normal gameplay-camera restoration.

The `close-minimum`, `normal`, and `obstructed` presets exercise the standard composition policy at capsule-to-capsule spacing, ordinary talk distance, and a constrained Nox-like alley. The legacy `default` and `nox-alley` fixtures remain available alongside `narrow-mobile` and `restoration`. The alley blockers cover both candidate shoulders so the camera still performs its ordinary shoulder-clearance selection and then shortens the selected sweep.

## Visualization legend

- Yellow: unobstructed desired camera and target-to-camera sweep.
- Mint: obstruction-adjusted camera position.
- White: participant midpoint/look target.
- Purple: saved gameplay position and restoration path.
- Red: active oriented blockers; emissive red identifies a hit.
- Cyan/NPC-colored arrows: authored participant facing.
- Screen overlay: action-safe frame, thirds, and center guide.

The status overlay reports active owner/priority, participant separation, selected shoulder, safe-frame state, fallback reason, desired/adjusted poses, blocker ID, saved gameplay position, and restoration error. `window.__VANTA_CAMERA_LAB__` is a development-only browser harness used by Playwright for deterministic snapshots and commands.

## Baselines

`e2e/camera-composition-lab.spec.ts` asserts camera ownership, shared collision blocker selection, adjusted versus desired pose, responsive stage size, saved gameplay state, exact restoration, and clean page diagnostics. Its six active visual baselines (default, close, normal, obstructed, narrow, and restoration) live beside the spec under `e2e/camera-composition-lab.spec.ts-snapshots/`.

Primitive fixtures are intentional: they remove model-loading and animation variance from composition tuning. Current character/NPC models can still be evaluated in the normal conversation slice; the lab does not duplicate their loader or become a cinematic editor.
