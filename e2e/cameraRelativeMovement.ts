export type MovementKey = 'KeyW' | 'KeyS' | 'KeyA' | 'KeyD';

/** Selects one or two camera-relative inputs that approach a world target. */
export function movementKeysToward(
  cameraYaw: number,
  from: { readonly x: number; readonly z: number },
  to: { readonly x: number; readonly z: number },
): readonly MovementKey[] {
  const length = Math.hypot(to.x - from.x, to.z - from.z) || 1;
  const target = {
    x: (to.x - from.x) / length,
    z: (to.z - from.z) / length,
  };
  const forward = { x: -Math.sin(cameraYaw), z: -Math.cos(cameraYaw) };
  const right = { x: Math.cos(cameraYaw), z: -Math.sin(cameraYaw) };
  const forwardAmount = target.x * forward.x + target.z * forward.z;
  const rightAmount = target.x * right.x + target.z * right.z;
  const keys: MovementKey[] = [];
  if (Math.abs(forwardAmount) > 0.35)
    keys.push(forwardAmount >= 0 ? 'KeyW' : 'KeyS');
  if (Math.abs(rightAmount) > 0.35)
    keys.push(rightAmount >= 0 ? 'KeyD' : 'KeyA');
  return keys;
}
