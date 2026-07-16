import { Group } from 'three';
import type { GameObject } from '../entities/GameObject';
import { createPlaceholderCharacter } from '../characters/PlaceholderCharacter';
import {
  calculateCharacterVisualAlignment,
  measureModelBounds,
} from '../characters/CharacterVisualAlignment';
import type { CharacterAlignmentReport } from '../characters/CharacterVisualAlignment';
import type { PlayerMovementSimulation } from './PlayerMovement';

export interface PlayerVisual extends GameObject {
  /** Rotates presentation without changing the simulation transform. */
  readonly visualRoot: Group;
  /** Receives the one-time bounds-derived alignment translation. */
  readonly loadedModelRoot: Group;
  init?(): void | Promise<void>;
  sync(movement: PlayerMovementSimulation, delta?: number): void;
  getAlignmentReport(): CharacterAlignmentReport | undefined;
}

/** Standalone fallback using the same hierarchy and alignment path as assets. */
export class PlaceholderPlayerVisual implements PlayerVisual {
  public readonly id = 'player';
  public readonly object3d = new Group();
  public readonly visualRoot = new Group();
  public readonly loadedModelRoot = new Group();

  private readonly placeholder = createPlaceholderCharacter();
  private readonly alignment: CharacterAlignmentReport;

  public constructor() {
    this.object3d.name = 'Player simulation transform';
    this.visualRoot.name = 'Player visual root';
    this.loadedModelRoot.name = 'Placeholder model alignment root';
    this.placeholder.root.scale.setScalar(0.6);
    this.placeholder.root.updateMatrixWorld(true);

    const bounds = measureModelBounds(this.placeholder.root);
    const calculated = calculateCharacterVisualAlignment({
      minY: bounds.min.y,
      maxY: bounds.max.y,
    });
    this.loadedModelRoot.position.y = calculated.appliedVisualOffset;
    this.loadedModelRoot.add(this.placeholder.root);
    this.visualRoot.add(this.loadedModelRoot);
    this.object3d.add(this.visualRoot);
    this.alignment = {
      characterId: 'emergency-placeholder',
      modelBounds: bounds,
      ...calculated,
    };
  }

  public sync(movement: PlayerMovementSimulation): void {
    this.object3d.position.copy(movement.position);
    this.visualRoot.rotation.y = movement.facingYaw;
  }

  public getAlignmentReport(): CharacterAlignmentReport {
    return this.alignment;
  }

  public dispose(): void {
    this.placeholder.dispose();
    this.object3d.clear();
  }
}
