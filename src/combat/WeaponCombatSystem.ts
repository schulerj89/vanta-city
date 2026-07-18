import type { GameSystem } from '../core/lifecycle';
import type { CharacterEquipment } from '../equipment/CharacterEquipment';
import { equipmentById } from '../equipment/EquipmentDefinition';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { PlayerControllerSystem } from '../player/PlayerControllerSystem';
import type {
  AimRay,
  WeaponAttackResult,
  WeaponDamageTarget,
} from './WeaponDamage';
import { resolveGunAttack, resolveKnifeAttack } from './WeaponDamage';

export interface WeaponCombatSnapshot {
  readonly attackSequence: number;
  readonly gunSequence: number;
  readonly knifeSequence: number;
  readonly hitCount: number;
  readonly lastResult: WeaponAttackResult | undefined;
}

export class WeaponCombatSystem implements GameSystem {
  public readonly id = 'weapon-combat';
  private readonly unsubscribe: (() => void)[] = [];
  private attackSequence = 0;
  private gunSequence = 0;
  private knifeSequence = 0;
  private hitCount = 0;
  private lastResult: WeaponAttackResult | undefined;

  public constructor(
    private readonly attacker: PlayerControllerSystem,
    private readonly equipment: CharacterEquipment,
    private readonly aim: { getAimRay(): AimRay },
    private readonly collision: Pick<CollisionWorld, 'castSegment'>,
    private readonly targets: () => readonly WeaponDamageTarget[],
  ) {}

  public init(): void {
    this.unsubscribe.push(
      this.equipment.events.on('used', ({ itemId, lastUseSource }) => {
        if (itemId !== 'handgun') return;
        const definition = equipmentById.get(itemId);
        if (!definition?.damage || definition.damage.kind !== 'gun') return;
        const ray = this.aim.getAimRay();
        this.record(
          resolveGunAttack(
            {
              ...ray,
              attackerId: this.equipment.ownerId,
              damage: definition.damage.perUse,
              range: definition.damage.range,
              source: `weapon:${itemId}:${lastUseSource ?? 'unknown'}`,
            },
            this.targets(),
            this.collision,
          ),
          'gun',
        );
      }),
      this.attacker.events.on('character-action:impact', (impact) => {
        if (
          impact.action !== 'knifeSlash' ||
          this.equipment.equipped?.id !== 'knife'
        )
          return;
        const definition = equipmentById.get('knife');
        if (!definition?.damage || definition.damage.kind !== 'knife') return;
        this.record(
          resolveKnifeAttack(
            {
              attackerId: this.equipment.ownerId,
              actor: this.attacker.getWorldPose(),
              damage: definition.damage.perUse,
              forwardOffset: definition.damage.forwardOffset,
              reach: definition.damage.reach,
              radius: definition.damage.radius,
              minimumY: definition.damage.minimumY,
              maximumY: definition.damage.maximumY,
              source: `weapon:knife:${impact.source ?? 'unknown'}`,
            },
            this.targets(),
            this.collision,
          ),
          'knife',
        );
      }),
    );
  }

  public getSnapshot(): WeaponCombatSnapshot {
    return {
      attackSequence: this.attackSequence,
      gunSequence: this.gunSequence,
      knifeSequence: this.knifeSequence,
      hitCount: this.hitCount,
      lastResult: this.lastResult,
    };
  }

  public dispose(): void {
    for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
  }

  private record(result: WeaponAttackResult, kind: 'gun' | 'knife'): void {
    this.attackSequence += 1;
    this.gunSequence += Number(kind === 'gun');
    this.knifeSequence += Number(kind === 'knife');
    this.hitCount += Number(result.outcome === 'hit');
    this.lastResult = result;
  }
}
