import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { GameObjectWorld } from '../entities/GameObjectWorld';
import type { ProximityPickupSystem } from '../pickups/ProximityPickupSystem';
import type { WorldPoseSource } from '../world/Spatial';
import type { PlayerMoneyAccount } from './PlayerMoneyAccount';

export const DEBUG_CASH_PICKUP_AMOUNT = 100;
export const DEBUG_CASH_PICKUP_ID = 'pickup.debug-cash';

export interface DebugCashPickupSnapshot {
  readonly spawned: boolean;
  readonly collected: boolean;
  readonly amount: number;
  readonly position:
    { readonly x: number; readonly y: number; readonly z: number } | undefined;
}

/** Development cash fixture composed over the reusable proximity contract. */
export class DebugCashPickup {
  private unregister: (() => void) | undefined;
  private visual: ReturnType<typeof createCashVisual> | undefined;
  private collected = false;

  public constructor(
    private readonly account: PlayerMoneyAccount,
    private readonly pickups: ProximityPickupSystem,
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
    const position = this.visual.object3d.position;
    this.unregister = this.pickups.register({
      id: DEBUG_CASH_PICKUP_ID,
      position: { x: position.x, y: position.y, z: position.z },
      radius: 0.28,
      halfHeight: 0.55,
      payload: DEBUG_CASH_PICKUP_AMOUNT,
      collect: (amount) => {
        if (this.collected) return false;
        const credited = this.account.credit(amount, {
          reason: 'cash-pickup',
          source: DEBUG_CASH_PICKUP_ID,
        });
        if (!credited) return false;
        this.collected = true;
        if (this.visual) this.visual.object3d.visible = false;
        // The registry removes its atomic contract after this callback returns.
        this.unregister = undefined;
        this.objects.remove(DEBUG_CASH_PICKUP_ID);
        this.visual = undefined;
        return true;
      },
    });
    return true;
  }

  public remove(): boolean {
    if (!this.unregister && !this.visual) return false;
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
      position: this.visual
        ? {
            x: this.visual.object3d.position.x,
            y: this.visual.object3d.position.y,
            z: this.visual.object3d.position.z,
          }
        : undefined,
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
