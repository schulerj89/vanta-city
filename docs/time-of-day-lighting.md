# Time-of-day lighting

Ashfall Junction uses one `TimeOfDayLightingSystem` for sky color, broad world
lighting, and authored lamp fixtures. It deliberately stops short of a calendar,
weather simulation, or continuously advancing clock.

## Runtime contract

- Day is the default deterministic preset at 13:00; night is 22:00.
- Custom debug times use fixed dawn (05:00–07:00) and dusk (17:00–20:00)
  blend bands. The state does not advance without an explicit command.
- Visual changes use a 1.2 second smooth transition. The existing reduced-motion
  preference makes them immediate.
- The system is a simulation-lifecycle system: transitions freeze while paused
  or in character select, then resume. Dialogue and cinematics continue the
  modest lighting transition because those states continue simulation updates.
- `RenderSystem` owns the renderer and camera only. Levels own authored fixture
  positions and material names, while this system exclusively owns environment
  lights and the scene background.

## Lamp strategy and performance

Each authored lamp binds to the imported fixture's `Light` material and receives
one warm, shadow-free point light. Level validation caps the shared strategy at
four local lights; Ashfall currently uses two. Day sets their intensity and
fixture emission to zero. Night enables both without creating shadow maps.

This is intentionally a bounded presentation strategy, not one shadow-casting
light for every possible pole. Adding more decorative poles should normally
reuse or omit local light coverage rather than raising the cap.

## Debugging and diagnostics

Development tools expose `Set daytime`, `Set nighttime`, and `Set time of day`
(0–24) commands. World diagnostics report the effective hour, target preset,
transition progress, night blend, local-light count, emissive fixture count,
the four-light cap, and the fact that shadows are disabled. The browser-test
snapshot exposes the same typed lighting diagnostics.

The optional `time` URL parameter selects a deterministic initial hour for local
inspection and browser coverage, for example `?time=22&debug=1`.

## Visual evidence

The owned browser test captures and checks console cleanliness for four reviewed
views: [day desktop](screenshots/time-of-day/day-desktop.png),
[night desktop](screenshots/time-of-day/night-desktop.png),
[day narrow](screenshots/time-of-day/day-narrow.png), and
[night narrow](screenshots/time-of-day/night-narrow.png). Together they cover
the sky presets, world and character readability, emissive lamp heads, and the
warm shadow-free pool around the northwest fixture.

## Risks and extension points

- Lamp bulb positions and imported emissive material names are authored level
  facts. Asset replacement must keep those facts aligned; diagnostics reveal a
  fixture that fails to bind.
- The night preset prioritizes gameplay readability over physical darkness.
  Future tone mapping or material changes should be reviewed against both the
  character silhouette and the warm lamp pool screenshots.
- A future large district should not increase the local-light cap casually.
  Camera-proximal pooling or baked emissive lighting would be the next scalable
  step, but is outside this compact system's scope.
