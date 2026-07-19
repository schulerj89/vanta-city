# Sidewalk pedestrian population

`PedestrianSystem` is the single owner of ambient pedestrian population,
movement, animation mixers, distance activation, and disposal. It is separate
from `NpcSystem`: pedestrians have no conversation identity, Talk interaction,
cinematic-performance controller, equipment, mission role, or applause fallback.
Conversation NPC and cinematic participant behavior is unchanged.

## Authored route contract

`LevelDefinition.pedestrians` contains a deterministic seed, resident cap,
activation/visibility hysteresis, and sector-owned route graphs. Every route has
three or more ordered nodes, loops on one authored sidewalk surface, declares a
population and walk-speed range, and may place an intentional neutral hold on a
node. Nodes reference a static collider tagged `sidewalk`; validation rejects
missing surfaces, road-only surfaces, points outside the referenced collider,
cross-sector ownership, invalid ranges, duplicate IDs, and authored population
above the cap. Road geometry remains owned by the existing environment data.

Ashfall Junction authors four compact rectangular loops, one per original corner
sector. Each loop keeps a 2–3 metre margin from the curb/vehicle lanes and stays
inside the quadrant sidewalk collider. Four walkers per active route produce
eight residents at the default north approach; up to sixteen are resident when
all four corner sectors are active. The fixed seed distributes all four validated
local Animated Women models evenly and derives stable speed/pause variation.

## Runtime behavior and ownership

Each resident owns exactly one `CharacterLoader` instance and one mixer scoped to
that loaded character subtree. The system transitions only between the authored
`Female_Walk` and `Female_Idle` mappings. It restores model-root translation after
every mixer update, smooths yaw through corners, slows a follower inside the
personal-spacing envelope, and sends every displacement through the shared
`CollisionWorld.moveCharacter` contract for obstacle blocking, ground snapping,
and ground-collider reporting. Route ordering prevents random cross-road
wandering; runtime collision is a safety boundary rather than a path generator.

Sector load creates only that sector's route residents. Sector/level unload
invalidates pending loads, removes scene roots, stops and uncaches mixers, and
disposes character instances. Distance hysteresis hides and suspends residents
beyond the visibility budget without destroying sector residency. Normal pause
and map states already stop simulation updates; the pedestrian owner additionally
freezes during cinematics and resumes the exact route position, facing, animation,
and pause timer afterward.

## Public diagnostics and visual decisions

`PedestrianSystem.getSnapshot()` is the stable test/debug seam. It reports the
level seed and cap; resident, active, loading, mixer-owner, route, spawn, and
dispose counts; per-sector counts; and each pedestrian's route, segment, target
node, movement state, speed, model/source, world position, facing, grounding,
ground collider, animation, and mixer-owner count. The development browser bridge
exposes this as `snapshot().pedestrians`.

The visual goal is readable street life without turning pedestrians into focal
actors. Loops keep walkers on broad concrete surfaces, give corners enough space
for smooth turns, stagger four models around each loop, and use short neutral
holds to break synchronized motion. No new model, texture, network request, UI,
road mesh, building, or map geometry is introduced. Evidence lives in
`docs/screenshots/pedestrian-002/` at desktop, narrow, day, night, and overhead
views; the overhead frame is the clearest curb/road-exclusion audit.
