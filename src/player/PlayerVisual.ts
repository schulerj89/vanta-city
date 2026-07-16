import {
  CapsuleGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import type { GameObject } from '../entities/GameObject';
import type { PlayerMovementSimulation } from './PlayerMovement';

export interface PlayerVisual extends GameObject {
  init?(): void | Promise<void>;
  sync(movement: PlayerMovementSimulation): void;
}

export class PlaceholderPlayerVisual implements PlayerVisual {
  public readonly id = 'player';
  public readonly object3d = new Group();
  private readonly material = new MeshStandardMaterial({
    color: 0x52d6b5,
    roughness: 0.7,
  });
  private readonly accentMaterial = new MeshStandardMaterial({
    color: 0x132d35,
  });
  private readonly geometry = new CapsuleGeometry(0.36, 1.08, 6, 12);
  private readonly facingGeometry = new ConeGeometry(0.13, 0.34, 8);

  public constructor() {
    const body = new Mesh(this.geometry, this.material);
    body.position.y = 0.9;
    body.castShadow = true;
    const facing = new Mesh(this.facingGeometry, this.accentMaterial);
    facing.rotation.x = Math.PI / 2;
    facing.position.set(0, 1.18, 0.39);
    this.object3d.name = 'Placeholder player';
    this.object3d.add(body, facing);
  }

  public sync(movement: PlayerMovementSimulation): void {
    this.object3d.position.copy(movement.position);
    this.object3d.rotation.y = movement.facingYaw;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.facingGeometry.dispose();
    this.material.dispose();
    this.accentMaterial.dispose();
  }
}
