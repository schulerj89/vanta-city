# Controls and accessibility

`InputSystem` is the only gameplay-facing input reader. Keyboard, mouse, and the centralized standard-gamepad poller all publish named actions; gameplay and modal systems never read `navigator.getGamepads()` directly.

## Standard gamepad bindings

- Left stick: analog movement. Right stick: analog camera orbit.
- A: jump in gameplay, confirm in the picker, and continue dialogue.
- B: cancel the picker or dialogue and close controls help.
- X: interact in gameplay, preview the next picker pose, and reveal a typing dialogue line.
- Y: open the character picker.
- D-pad left/right: navigate the character picker.
- L3: toggle walk/run. R3: recenter the gameplay camera. RB: switch camera shoulder.
- View: open or close controls help. Menu: pause or resume gameplay.

Combat actions and developer tools remain keyboard-only. This keeps gamepad face buttons contextual and avoids making destructive or debug actions easy to trigger accidentally.

The poller accepts the first connected standard-layout gamepad. Both sticks use a radial `0.20` deadzone, then rescale the remaining travel to the full output range. Buttons become named-action edges at a value of `0.50`; holding a button produces one `wasPressed` edge until it is released. Keyboard/mouse and gamepad state are combined, so either device can be used at any time.

## Persistent accessibility preferences

Controls help includes preferences stored under the versioned `vanta-city:accessibility-preferences` local-storage key:

- **Reduce camera motion** disables automatic recentering and removes animated camera smoothing and mode transitions.
- **Animate dialogue text** can be disabled to reveal every line immediately.

On a first visit, the browser's `prefers-reduced-motion` setting enables reduced camera motion and disables dialogue typewriter animation. Explicit saved choices take precedence on later visits. Keyboard bindings, pointer behavior, modal focus isolation, and camera ownership/restoration are unchanged.
