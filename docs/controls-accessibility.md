# Controls and accessibility

`InputSystem` is the only gameplay-facing input reader. Keyboard, mouse, and the centralized standard-gamepad poller all publish named actions; gameplay and modal systems never read `navigator.getGamepads()` directly.

## Standard gamepad bindings

- Left stick: analog movement. Right stick: analog camera orbit.
- A: jump in gameplay, confirm in the picker, and continue dialogue.
- B: cancel the picker or dialogue and close controls help.
- X: interact in gameplay, preview the next picker pose, and reveal a typing dialogue line.
- Y: open the character picker.
- D-pad left/right: navigate the character picker.
- LB: directional roll. RT: use equipment and hold to repeat Handgun fire. D-pad down: reload Handgun.
- L3: toggle walk/run. R3: recenter the gameplay camera. RB: switch camera shoulder.
- View: open or close controls help. Menu: pause or resume gameplay.

Punch, kick, quickbar selection, and developer tools remain keyboard-only. Gamepad equipment actions use the existing named-action ownership and remain inert while modal UI owns input.

The poller accepts the first connected standard-layout gamepad. Both sticks use a radial `0.20` deadzone, then rescale the remaining travel to the full output range. Buttons become named-action edges at a value of `0.50`; holding a button produces one `wasPressed` edge until it is released. Keyboard/mouse and gamepad state are combined, so either device can be used at any time.

## Persistent accessibility preferences

Controls help includes preferences stored under the versioned `vanta-city:accessibility-preferences` local-storage key:

- **Reduce camera motion** disables automatic recentering and removes animated camera smoothing and mode transitions.
- **Animate dialogue text** can be disabled to reveal every line immediately.

On a first visit, the browser's `prefers-reduced-motion` setting enables reduced camera motion and disables dialogue typewriter animation. Explicit saved choices take precedence on later visits. Keyboard bindings, pointer behavior, modal focus isolation, and camera ownership/restoration are unchanged.

## Development ownership diagnostics

Development builds add an **Input / Ownership** section to the existing developer tools. It shows the current gameplay/help/picker/dialogue owner, accepted action families, raw named actions per device, raw and deadzone-adjusted sticks, button edges and threshold, pointer lock, focused text entry, accessibility preferences, the latest rejected action, and a bounded recent timeline.

The inspector is observational: gameplay continues to consume only `InputReader` named actions. A rejected action means no alias for that physical edge belongs to the current owner; contextual aliases such as X → interact/reveal/preview are treated as one accepted physical input when the current context owns any alias.

Virtual gamepad connect/disconnect, axes, and button controls are available only through development tools and the browser-test bridge. They do not provide a remapping UI and are not initialized as production telemetry.
