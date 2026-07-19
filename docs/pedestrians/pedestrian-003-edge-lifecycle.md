# PEDESTRIAN-003 — authored map-edge traversal lifecycle

## Outcome

Pedestrians now have one authoritative, configurable route lifecycle for walking
through an authored map edge and disappearing only after their foot origin clears
that edge. A completed boundary-route resident is disposed and retired; it cannot
snap to its first node, loop visibly, or respawn from a timer. It becomes eligible
again only after its owning sector unloads and reloads.

The implementation intentionally does not change the Ashfall Junction route or
world data. Those files are owned by WORLD-003 in the current implementation wave.
The existing four production routes therefore remain closed loops until WORLD-003
authors suitable sidewalk continuations and terminal nodes. The deterministic
development browser fixture proves the new public contract in the interim.

## Authoritative contract

`PedestrianRouteDefinition` is now a discriminated route intent:

- `loop: true` retains the existing closed sidewalk-loop behavior.
- `loop: false` requires an `exit` definition with one authored map edge, foot
  clearance, minimum traversal length, and `sector-reload` repopulation.

Example future world data:

```ts
{
  id: 'route.west-rim-exit',
  sectorId: 'sector.west-rim-north',
  loop: false,
  exit: {
    edge: 'west',
    clearance: 0.35,
    minimumTraversalDistance: 18,
    repopulation: 'sector-reload',
  },
  population: 1,
  speed: [1.15, 1.48],
  nodes: [/* interior traversal, interior approach, off-map terminal */],
}
```

`PedestrianBoundaryLifecyclePolicy` receives the active level's
`mapPresentation.bounds`; it does not own or duplicate map extents. The route owns
intent while the policy alone translates position into:

- `resident` before the final segment;
- `approaching-boundary` on the terminal segment while inside the map;
- `exiting-boundary` after crossing the selected edge; and
- `authored-boundary-exit` disposal after the configured clearance.

Crossing or teleporting beyond a different edge does not retire the pedestrian.
A teleport beyond the route's selected edge does, so recovery does not leave an
out-of-bounds resident. North, east, south, and west use the same policy.

## Route validation

Production validation rejects an edge route unless:

- the level has authoritative map-presentation bounds;
- it has at least three finite, sidewalk-grounded nodes;
- every pre-terminal node stays inside those bounds;
- the penultimate node approaches the selected edge from inside;
- the terminal segment moves outward through only that selected edge;
- the terminal foot point reaches the configured clearance;
- the same sector owns the referenced sidewalk collision;
- the measured polyline meets `minimumTraversalDistance`;
- clearance is at least the 0.3 m pedestrian collision radius; and
- population is one, preventing overlapping initial residents on a terminal
  route. Multiple residents use separate authored routes.

The terminal point must still lie on its referenced sidewalk collider. This makes
WORLD-003 responsible for a real continuation surface rather than letting the
animation drift through ungrounded scenery.

## Runtime lifecycle and ownership

- `PedestrianEntity` never wraps an exit route back to node zero. It reports a
  public lifecycle state, boundary edge/distance, visibility, and cumulative
  distance traveled.
- Hidden exit-route residents continue deterministic movement toward their edge;
  their mixer is not advanced while hidden. Loop-route activation, visibility
  hysteresis, spacing, grounding, turns, and pause/cinematic behavior remain
  unchanged.
- `PedestrianSystem` removes the scene root, disposes the entity's one mixer and
  loaded character, records a bounded lifecycle event, and moves the stable
  resident ID into a retired set.
- No frame update, timer, player teleport, or duplicate `sector:loaded` event can
  respawn a retired resident.
- `sector:unloaded` makes that stable ID eligible. The following
  `sector:loaded` rebuilds it at its authored first node and increments the public
  repopulation count.
- Pending character construction is tracked by sector. Unloading during a load
  marks the entity disposed immediately; a later loader resolution disposes its
  asset exactly once and never adds a root or mixer to the scene.
- Level unload, sector unload, system disposal, load cancellation, load failure,
  and authored boundary exit have distinct public lifecycle reasons.

The population snapshot adds:

- `visibleCount`, `boundaryExitCount`, `retiredCount`, `repopulationCount`, and
  `loadCancellationCount`;
- a bounded, sequence-numbered `lifecycleEvents` history; and
- per-resident `lifecycleState`, `lifecycleReason`, `boundaryEdge`,
  `signedBoundaryDistance`, `visible`, and `distanceTravelled`.

Lifecycle records include the last position, total distance, and mixer-owner count
before disposal. They contain no Three.js roots, actions, mixers, or asset objects.

## Deterministic evidence

The development-only browser bridge exposes `pedestrianBoundaryFixture()`. It
executes the real policy at resident, approach, crossed-edge, cleared-edge,
inward-teleport, and outward-teleport positions and covers all four edges. Its
18.4 m route exceeds an authored 18 m minimum and clears by 0.35 m.

Evidence:

- `docs/screenshots/pedestrian-003/boundary-policy-and-runtime.json`
- `docs/screenshots/pedestrian-003/current-production-desktop.png`
- `docs/screenshots/pedestrian-003/current-production-narrow.png`

The JSON also records 12 m of cumulative production pedestrian movement, equal
resident/mixer counts, and zero console, runtime-request, or external-request
errors. The screenshots are grounding/visual-regression evidence for the current
production loops, not proof of a production boundary exit.

## WORLD-003 integration contract

WORLD-003 must complete these data-owned steps before visual edge disappearance is
production-accepted:

1. Choose real sidewalk corridors that connect naturally to the authoritative
   `mapPresentation.bounds`; do not extend routes across road or nonwalkable space.
2. Extend the selected sidewalk collision at least the pedestrian radius plus the
   route's clearance beyond the relevant map edge. Keep collision, visual edge,
   sector ownership, minimap/world bounds, and streaming intent coherent.
3. Author a long interior traversal, an interior penultimate approach node, and a
   grounded terminal node beyond the selected edge. Use `loop: false` and the
   exact `exit` contract above.
4. Use a separate route for each simultaneous exiting resident. Do not raise one
   boundary route's population above one.
5. Keep the exit route and continuation collider under the same sector owner.
   Confirm that unloading then reloading that sector visibly repopulates from the
   authored first node, never the terminal edge.
6. Capture desktop and narrow video or screenshots showing the full long walk,
   boundary approach, complete disappearance, absence for at least one subsequent
   traversal window, and the later sector-reload repopulation.
7. Assert public lifecycle events, scene residents, mixer counts, local asset
   ownership, grounding, console/network health, and three unload/reload cycles in
   the production browser spec.

Because the runtime reads active map bounds, a reviewed WORLD-003 bounds update
does not require a second pedestrian constant. A route authored against stale
bounds will fail validation instead of silently disappearing at the wrong edge.

## Integration risks

- The route union will make any concurrent world route authoring compile only when
  it explicitly chooses loop or boundary-exit intent. That is deliberate, but the
  integration owner should review overlapping route-data changes rather than
  resolving them mechanically.
- An exit collider that ends at the visible/map edge cannot satisfy full-clearance
  validation. Extending only the node without extending the sidewalk collider is
  invalid and would break grounding.
- Exit routes continue movement while visually culled so they can finish. A very
  large future exiting population should be measured, though hidden mixers remain
  paused and the intended route population is one.
- Lifecycle history is bounded to 64 records. It is diagnostic evidence, not
  persistence or save-game state.
- Current production screenshots cannot show an actual edge disappearance until
  WORLD-003 supplies the missing world facts. The public fixture must not be
  mistaken for production visual acceptance.
