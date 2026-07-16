import type { Scene } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { GameObject } from './GameObject';

export class GameObjectWorld implements GameSystem {
  public readonly id = 'game-objects';
  private readonly objects = new Map<string, GameObject>();

  public constructor(private readonly scene: Scene) {}

  public add(object: GameObject): void {
    if (this.objects.has(object.id))
      throw new Error(`Duplicate game object: ${object.id}`);
    this.objects.set(object.id, object);
    this.scene.add(object.object3d);
  }

  public get(id: string): GameObject | undefined {
    return this.objects.get(id);
  }

  public remove(id: string): boolean {
    const object = this.objects.get(id);
    if (!object) return false;
    this.scene.remove(object.object3d);
    object.dispose?.();
    return this.objects.delete(id);
  }

  public update(time: FrameTime): void {
    for (const object of [...this.objects.values()]) object.update?.(time);
  }

  public dispose(): void {
    for (const id of [...this.objects.keys()]) this.remove(id);
  }
}
