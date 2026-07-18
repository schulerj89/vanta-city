# Character and Animation Lab

The lab is a development-only sandbox scenario for inspecting registered character presentation without starting the district or creating a second renderer. Start it with:

```sh
pnpm lab:characters
```

The direct URL is `/?sandbox=character-animation-lab&debug=1`. Vite's `import.meta.env.DEV` gate dynamically loads the existing sandbox path; production builds never select or initialize the lab. The optional `debug=1` parameter opens the shared developer panel.

## Registered models

The model selector is assembled from the authoritative registries:

- playable `casual` and `punk` definitions;
- Animated Men `npc-worker`, `npc-hoodie`, and `npc-punk` definitions;
- `debug-sparring-target`, including its native Ultimate Modular Men get-hit mapping.

Each switch calls `CharacterLoader.instantiate()`. Stale asynchronous results and the previous live instance are disposed. The mixer is stopped, detached from its `finished` listener, and uncached before the model instance is released. The emergency placeholder remains observable through the source and warning diagnostics.

## Controls and graph diagnostics

The panel provides:

- logical graph-state and protected authored-clip selection;
- handgun, knife, or no-equipment selection through the production
  `EquipmentPresentation` path;
- front, right, rear, and left camera views;
- play/pause, normalized-time scrub, `0.1–2.0×` speed, loop/one-shot, and `0–1s` cross-fade controls;
- skeleton lines and world-synchronized bone axes;
- transformed bounds;
- simulation-origin and visual-root axes, the `1.8m × 0.38m` player capsule contract, and foot contact plane;
- authored root-motion trail when a scene-root position track was stripped;
- equipped-model bounds and world-synchronized socket axes;
- graph phase, priority result, fallback, transition reason/sequence, action lock, impact, mixer/fallback completion release, rejected transitions, alignment height/offset, and disposal count.

Logical locomotion, action, and reaction selections pass through the same small `CharacterAnimationStateMachine` used by gameplay. Raw authored clips deliberately bypass graph meaning but remain protected by the same root-motion filtering. A one-shot selection owns the lab action lock until the mixer's `finished` event; a duration fallback releases missing or placeholder playback. Transitions requested while busy are rejected, not queued.

The lab has a fixed `simulationRoot` at `[0, 0, 0]`. Bounds-derived grounding moves only the nested `visualRoot`. Mixer updates restore the simulation origin every frame and never use animation or overlay state to repair gameplay transforms.

## Debug and automation APIs

The shared registry contributes `animation-lab.state`, `animation-lab.lock`, `animation-lab.impact`, and `animation-lab.reset`. Overlay switches stay in the lab panel: registering a global standard helper would duplicate those controls and leave a providerless animation toggle in the normal debug district. The lab adds no global input listeners.

Development pages expose `window.__VANTA_ANIMATION_LAB__` with:

```ts
snapshot();
selectModel(id);
selectAnimation('logical:idle' | 'clip:AuthoredName');
selectEquipment('handgun' | 'knife' | 'none');
setView('front' | 'right' | 'rear' | 'left');
setPlaying(playing);
setLoop(loop);
setSpeed(speed);
setNormalizedTime(time);
setOverlay(
  'skeleton' | 'bounds' | 'alignment' | 'rootMotion' | 'equipment',
  visible,
);
```

The snapshot returns model/source, logical and authored clip inventories, graph state, normalized playback, lock/impact/completion sequences, root-track diagnostics, transformed character and equipment bounds, socket position, equipment asset/fallback status, alignment roots, disposal count, and any lab error.

## Capture policy and limits

The Playwright suite commits two stable locator baselines for the DOM controls surface and attaches full-page presentation captures for Casual, Punk, Animated Men, action impact, bounds, grounding, both playable characters in every handgun/knife state, and both sides of each final weapon pose. State, socket compatibility, local asset status, fixed simulation origin, and measured weapon bounds remain the deterministic test oracles. Full-page SwiftShader output is inspected but is not a pixel oracle because macOS headless captures can contain transient compositor tiles even when the rendered page is correct.

This is an inspection harness, not an editor or combat system. It does not save asset changes, author clips, retarget skeletons, apply damage, create health, add AI/navigation, or mutate production character registries.
