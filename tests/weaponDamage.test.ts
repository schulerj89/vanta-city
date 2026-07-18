import { Vector3 } from 'three';
import type { WeaponDamageTarget } from '../src/combat/WeaponDamage';
import {
  resolveGunAttack,
  resolveKnifeAttack,
} from '../src/combat/WeaponDamage';
import { HealthComponent } from '../src/health/Health';

function target(
  id: string,
  position: readonly [number, number, number],
  health = new HealthComponent(id, 100),
): WeaponDamageTarget {
  return {
    id,
    ownerId: id,
    enabled: true,
    health,
    getWorldPose: () => ({
      position: { x: position[0], y: position[1], z: position[2] },
      forward: { x: 0, y: 0, z: -1 },
    }),
    getHurtVolume: () => ({ radius: 0.35, height: 1.8 }),
  };
}

const gun = {
  attackerId: 'player',
  origin: new Vector3(0, 1, 0),
  direction: new Vector3(0, 0, 1),
  damage: 34,
  range: 10,
  source: 'unit:gun',
} as const;

describe('authoritative weapon damage', () => {
  it('distinguishes ray misses, obstruction, and range without damage', () => {
    const offAxis = target('off-axis', [2, 0, 5]);
    expect(resolveGunAttack(gun, [offAxis]).outcome).toBe('miss');

    const blocked = target('blocked', [0, 0, 5]);
    const obstruction = resolveGunAttack(gun, [blocked], {
      castSegment: () => ({
        obstructed: true,
        fraction: 0.4,
        colliderId: 'wall',
      }),
    });
    expect(obstruction).toMatchObject({
      outcome: 'obstructed',
      targetId: 'blocked',
      obstructionId: 'wall',
      damage: 0,
    });
    expect(blocked.health.current).toBe(100);

    const distant = target('distant', [0, 0, 15]);
    expect(resolveGunAttack(gun, [distant])).toMatchObject({
      outcome: 'out-of-range',
      targetId: 'distant',
      damage: 0,
    });
    expect(distant.health.current).toBe(100);
  });

  it('decrements health once per accepted shot and reaches death deterministically', () => {
    const opponent = target('opponent', [0, 0, 5]);
    expect(resolveGunAttack(gun, [opponent]).damage).toBe(34);
    expect(opponent.health.current).toBe(66);
    expect(resolveGunAttack(gun, [opponent]).damage).toBe(34);
    expect(opponent.health.current).toBe(32);
    expect(resolveGunAttack(gun, [opponent])).toMatchObject({
      outcome: 'hit',
      damage: 32,
    });
    expect(opponent.health.getSnapshot()).toMatchObject({
      current: 0,
      alive: false,
      changeSequence: 3,
    });
  });

  it('uses a short forward knife volume at impact time', () => {
    const opponent = target('opponent', [0, 0, 1]);
    const result = resolveKnifeAttack(
      {
        attackerId: 'player',
        actor: {
          position: { x: 0, y: 0, z: 0 },
          forward: { x: 0, y: 0, z: 1 },
        },
        damage: 45,
        forwardOffset: 0.35,
        reach: 1.05,
        radius: 0.28,
        minimumY: 0.45,
        maximumY: 1.65,
        source: 'unit:knife',
      },
      [opponent],
    );
    expect(result).toMatchObject({
      outcome: 'hit',
      targetId: 'opponent',
      damage: 45,
    });
    expect(opponent.health.current).toBe(55);
  });

  it('never self-hits and preserves disposal enforcement', () => {
    const player = target('player', [0, 0, 1]);
    expect(resolveGunAttack(gun, [player]).outcome).toBe('miss');
    expect(player.health.current).toBe(100);
    expect(
      resolveGunAttack({ ...gun, attackerId: 'npc.attacker', damage: 10 }, [
        player,
      ]),
    ).toMatchObject({ outcome: 'hit', targetId: 'player', damage: 10 });
    expect(player.health.current).toBe(90);
    player.health.dispose();
    expect(() => player.health.damage(1, 'after-disposal')).toThrow(
      'Health "player" is disposed',
    );
  });
});
