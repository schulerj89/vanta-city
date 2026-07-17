import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
} from 'three';
import type { Object3D, Scene } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { DebugVisualHelper } from '../debug/DebugVisualHelpers';
import type { InteractionSystem } from './InteractionSystem';
import type { WorldPosition } from '../world/Spatial';

const RANGE_SEGMENTS = 48;

function isDebugLine(
  object: Object3D,
): object is Line<BufferGeometry, LineBasicMaterial> {
  return 'isLine' in object && object.isLine === true;
}

export class InteractionDebugSystem implements GameSystem, DebugVisualHelper {
  public readonly id = 'interaction-debug';
  public readonly updateMode = 'always' as const;

  private readonly root = new Group();
  private visible: boolean;

  public constructor(
    private readonly scene: Scene,
    private readonly interactions: InteractionSystem,
    initiallyVisible = false,
  ) {
    this.visible = initiallyVisible;
  }

  public init(): void {
    this.root.name = 'Interaction debug visualization';
    this.root.renderOrder = 100;
    this.scene.add(this.root);
    this.applyVisibility();
  }

  public update(): void {
    if (!this.visible) return;
    this.clearVisualization();

    const snapshot = this.interactions.getDebugSnapshot();
    const candidateIds = new Set(
      snapshot.candidates.map((candidate) => candidate.target.id),
    );
    for (const target of snapshot.targets) {
      const color =
        target.id === snapshot.selectedId
          ? 0x42f5e6
          : candidateIds.has(target.id)
            ? 0xffb547
            : target.available
              ? 0x6196ff
              : 0x666b73;
      this.root.add(
        this.createRange(target.location, target.activationRadius, color),
      );
      this.root.add(this.createRange(target.location, 0.06, 0xffffff));
    }
    if (snapshot.pose) {
      for (const target of snapshot.targets) {
        if (target.lineOfSight !== 'blocked') continue;
        this.root.add(
          this.createLine(snapshot.pose.position, target.location, 0xff496c),
        );
      }
      for (const candidate of snapshot.candidates) {
        this.root.add(
          this.createLine(
            snapshot.pose.position,
            candidate.location,
            candidate.target.id === snapshot.selectedId
              ? 0x42f5e6
              : candidate.target.id === snapshot.challengerId
                ? 0xffcf4a
                : 0x6196ff,
          ),
        );
      }
    }
  }

  public setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    if (!visible) this.clearVisualization();
    this.applyVisibility();
  }

  public dispose(): void {
    this.clearVisualization();
    this.scene.remove(this.root);
  }

  private createRange(
    location: WorldPosition,
    radius: number,
    color: number,
  ): LineLoop {
    const points: number[] = [];
    for (let index = 0; index < RANGE_SEGMENTS; index += 1) {
      const angle = (index / RANGE_SEGMENTS) * Math.PI * 2;
      points.push(
        location.x + Math.cos(angle) * radius,
        location.y + 0.05,
        location.z + Math.sin(angle) * radius,
      );
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    return new LineLoop(geometry, this.createMaterial(color));
  }

  private createLine(
    from: WorldPosition,
    to: WorldPosition,
    color: number,
  ): Line {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute([from.x, from.y, from.z, to.x, to.y, to.z], 3),
    );
    return new Line(geometry, this.createMaterial(color));
  }

  private createMaterial(color: number): LineBasicMaterial {
    return new LineBasicMaterial({
      color: new Color(color),
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });
  }

  private clearVisualization(): void {
    for (const object of [...this.root.children]) {
      this.root.remove(object);
      this.disposeObject(object);
    }
  }

  private disposeObject(object: Object3D): void {
    if (isDebugLine(object)) {
      object.geometry.dispose();
      object.material.dispose();
    }
  }

  private applyVisibility(): void {
    this.root.visible = this.visible;
  }
}
