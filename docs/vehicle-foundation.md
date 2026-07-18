# Vehicle foundation

## Compact UI design brief

- Player goal: recognize one usable civilian vehicle, enter it, understand the driving controls at a glance, and return safely to on-foot play.
- Dominant action: `G` transfers ownership. Before entry it appears through the existing interaction prompt; while seated it becomes the explicit exit action.
- Information hierarchy: the driving card shows the vehicle label and signed speed first, then a single compact control line. Recovery appears only as a control hint, not as a competing alert.
- Layout ownership: the entry prompt remains in the shared `interaction` zone. The driving card mounts in the shared `loadout` zone and observes only the vehicle system's public snapshot. It never reads vehicle state from the DOM.
- State matrix: the card is hidden on foot, visible while driving, unchanged by pause, and removed on exit/disposal. Existing on-foot quickbar presentation is suppressed only while vehicle ownership is active and restored on exit.
- Responsive behavior: the card stays within the loadout zone safe area, uses a narrow stacked layout below 34 rem, and preserves readable speed/control text without horizontal scrolling. No essential content depends on motion.
- Accessibility: the card is a named status region with polite speed updates; controls use the shared binding labels; color is supplemental; reduced-motion removes transitions through the global UI contract.
- Visual target: Ashfall's restrained amber/teal instrument language, matching existing chamfer, rule, panel, data-font, and safe-area tokens. No genre references or imported HUD patterns.

## Runtime ownership

`VehicleControllerSystem` is the sole transfer authority. Entry disables on-foot control and presentation, assigns the player occupant, moves the authoritative player pose to the seat, claims a bounded gameplay-camera focus, disables the entry interactable, and publishes one immutable snapshot. Exit performs the inverse only after a collision-checked side or rear position is found. Pause freezes vehicle simulation through the normal runtime lifecycle. Recovery returns the car to its last grounded pose without changing ownership.

The vehicle uses an existing catalogued civilian traffic asset. Input remains action-based through `InputSystem`; no vehicle-specific browser handlers or duplicate listeners are installed. Static collision uses the shared collision world, and nearby production traffic is queried through `TrafficSystem` before accepting movement.
