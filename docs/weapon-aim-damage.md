# Weapon aiming and damage

`WeaponAimSystem` owns the weapon-only HUD reticle and world projection. It
reads the existing `InputSystem` pointer snapshot, so it adds no browser or
global listeners. The aim point is clamped 24 CSS pixels inside the game
viewport. Unlocked input follows the pointer; pointer-locked input applies
relative movement. The reticle is a labelled circle with a central dot.

Aiming is active only while Handgun or Knife is equipped, game state is
`playing`, and text/select/content-editable UI does not own focus. Unequip,
pause, picker, dialogue, and focused UI hide the reticle and release pointer
lock. Pointer-orbit input is gated during weapon aiming, but
`ThirdPersonCameraSystem` remains the only system that writes camera transforms.
The aim system only reads the current camera matrices to unproject the screen
point into an `AimRay`.

## Authoritative damage contract

`WeaponDamageTarget` is the shared target boundary. A target supplies its
owner ID, live `HealthComponent`, world pose, vertical hurt volume, enabled
state, and optional collision IDs/presentation response. Gun and knife attacks
filter the attacker's owner ID before evaluating contact, preventing self-hit.
NPCs, the debug sparring target, and the player implement this boundary; this
allows future externally-owned NPC attacks to damage the player without moving
health ownership into an AI or visual system.

Handgun damage is emitted only from an accepted `CharacterEquipment.used`
event, after the existing action admission and ammo consumption. Existing
player cadence and held-fire state therefore remain authoritative. Each shot
casts the current aim ray, selects the nearest live hurt volume, enforces the
35 m range, and checks static-world occlusion before applying 34 damage.

Knife damage is emitted once at the existing `knifeSlash` animation impact.
It evaluates a 0.35 m forward offset, 1.05 m sweep, 0.28 m radius, and
0.45–1.65 m vertical band before applying 45 damage. Occlusion ignores a
walkable volume only when the sweep begins inside it; walls and other obstacles
still block contact.

Health depletion remains authoritative in `HealthComponent`. NPC and sparring
presentations observe depletion and may play their existing reaction/death
presentation. Player-death UI and NPC attack decisions are intentionally out
of scope.

## Muzzle presentation contract

The handgun definition declares an asset-local `model.muzzle` transform:
position, rotation, and flash scale at the source pistol's barrel. On successful
asset load, `EquipmentPresentation` reparents the presentation-only flash under
that socket. The procedural fallback keeps its separately authored barrel
location. Neither socket changes the hand attachment or authoritative world
transform.

The Character + Animation Lab exposes live model and muzzle position,
rotation, and scale controls. Weapon bounds, hand-socket axes, and muzzle axes
remain available while inspecting Casual and Punk in idle, firing, moving, and
knife states. `gunFire` holds the muzzle preview on for visual tuning; runtime
uses remain bounded to 80 ms.

## Debugging and limitations

Browser snapshots expose `weaponAim`, `weaponCombat`, NPC health, muzzle
attachment, and muzzle world position. Debug values summarize aim/release and
last damage. `weapon.aim-center` centers the reticle, while
`weapon.target-at-aim [distance]` places and revives the development sparring
target on the current ray.

This slice uses instantaneous hitscan and simple cylinder/forward-volume
contact. It does not implement projectiles, recoil, spread, hit zones, NPC
decision-making, or player-death UI. The animation-lab muzzle values are tuning
inputs; changing them does not alter the aim ray. Integrators adding combat AI
should call the same damage resolvers with an external attacker ID and include
the player target rather than writing health directly or adding another input,
camera, or collision owner.
