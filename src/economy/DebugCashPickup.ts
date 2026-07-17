import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { GameObjectWorld } from '../entities/GameObjectWorld';
import type { InteractionSystem } from '../interactions/InteractionSystem';
import type { WorldPoseSource } from '../world/Spatial';
import type { PlayerMoneyAccount } from './PlayerMoneyAccount';

export const DEBUG_CASH_PICKUP_AMOUNT = 100;
export const DEBUG_CASH_PICKUP_ID = 'interaction.debug-cash-pickup';

export interface DebugCashPickupSnapshot {
  readonly spawned: boolean;
  readonly collected: boolean;
  readonly amount: number;
}

/** Development fixture that composes world visuals with the interaction contract. */
export class DebugCashPickup {
  private unregister: (() => void) | undefined;
  private visual: ReturnType<typeof createCashVisual> | undefined;
  private collected = false;
  private removalTimer: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    private readonly account: PlayerMoneyAccount,
    private readonly interactions: InteractionSystem,
    private readonly objects: GameObjectWorld,
    private readonly player: WorldPoseSource,
  ) {}

  public spawn(): boolean {
    if (this.unregister) return false;
    const pose = this.player.getWorldPose();
    if (!pose) return false;
    this.collected = false;
    this.visual = createCashVisual();
    this.visual.object3d.position.set(
      pose.position.x + pose.forward.x * 0.8,
      pose.position.y + 0.16,
      pose.position.z + pose.forward.z * 0.8,
    );
    this.objects.add(this.visual);
    this.unregister = this.interactions.register({
      id: DEBUG_CASH_PICKUP_ID,
      prompt: `Pick up ${DEBUG_CASH_PICKUP_AMOUNT} cash`,
      location: () => {
        const position = this.visual?.object3d.position ?? pose.position;
        return { x: position.x, y: position.y, z: position.z };
      },
      rangeProfile: 'use',
      repeatable: false,
      interact: () => {
        if (this.collected) return;
        const credited = this.account.credit(DEBUG_CASH_PICKUP_AMOUNT, {
          reason: 'cash-pickup',
          source: DEBUG_CASH_PICKUP_ID,
        });
        if (!credited) return;
        this.collected = true;
        if (this.visual) this.visual.object3d.visible = false;
        // Let InteractionSystem complete its one-shot before unregistering.
        this.removalTimer = setTimeout(() => this.remove(), 0);
      },
    });
    return true;
  }

  public remove(): boolean {
    if (!this.unregister && !this.visual) return false;
    if (this.removalTimer !== undefined) clearTimeout(this.removalTimer);
    this.removalTimer = undefined;
    this.unregister?.();
    this.unregister = undefined;
    this.objects.remove(DEBUG_CASH_PICKUP_ID);
    this.visual = undefined;
    return true;
  }

  public getSnapshot(): DebugCashPickupSnapshot {
    return {
      spawned: this.unregister !== undefined,
      collected: this.collected,
      amount: DEBUG_CASH_PICKUP_AMOUNT,
    };
  }

  public dispose(): void {
    this.remove();
  }
}

function createCashVisual() {
  const object3d = new Group();
  const geometry = new BoxGeometry(0.42, 0.12, 0.24);
  const material = new MeshStandardMaterial({
    color: 0x35d477,
    emissive: 0x0a5c2d,
    emissiveIntensity: 0.65,
    roughness: 0.7,
  });
  const mesh = new Mesh(geometry, material);
  object3d.add(mesh);

  const bandGeometry = new BoxGeometry(0.1, 0.125, 0.245);
  const bandMaterial = new MeshStandardMaterial({
    color: 0xcaffdc,
    emissive: 0x2f9b57,
    emissiveIntensity: 0.45,
  });
  object3d.add(new Mesh(bandGeometry, bandMaterial));

  return {
    id: DEBUG_CASH_PICKUP_ID,
    object3d,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      bandGeometry.dispose();
      bandMaterial.dispose();
    },
  };
}
