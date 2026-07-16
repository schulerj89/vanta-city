# Debug sparring target

The Foundry debug district contains one inactive, stationary sparring target at `spawn.debug-sparring-target`. It is a test hook for completed character actions, not a combat system. Enable **Activate debug sparring target** in `Commands / Actions`; **Reset debug sparring target** clears response and ignored-event counters and returns its presentation to idle.

`CharacterActionTarget` is the gameplay-facing response contract. `SparringTargetSystem` listens only to `PlayerControllerSystem`'s `character-action:completed` event, admits punch/kick completions within `2.6m` and facing dot `0.55`, and delegates the accepted response to the target. It does not inspect keyboard input, UI, animation mixers, dialogue NPCs, or hitboxes. Disabled, out-of-position, and target-busy completions are counted with explicit reasons.

Player one-shots hold an action lock from acceptance until the active Three.js mixer action emits `finished`. A duration-plus-`0.1s` fallback prevents a malformed mixer lifecycle from stranding the lock. Busy requests are rejected, never queued, and do not advance left/right alternation. Completion restores locomotion in the release frame and publishes exactly one completion sequence.

The target uses the local Animated Men `mack-long-sleeves.glb` model and its embedded `HumanArmature|Man_Idle` (`4.166667s`). The pack contains no get-hit clip, so its compatible response tracks are loaded through the existing external-animation binding from the local Casual GLB: `CharacterArmature|HitRecieve` and `CharacterArmature|HitRecieve_2` (both `0.541667s`). The validator confirms the mapped skeleton, bounds, root-motion tolerance, and clone/disposal lifecycle.

The target has no collision or Talk registration, is hidden while disabled, and never enters the normal `NpcSystem` roster. Its world transform remains fixed; bounds-derived visual alignment and post-mixer model-root restoration are presentation-only. There is no damage, health, retaliation, navigation, dialogue, mission state, death, weapon, police, traffic, or AI behavior.
