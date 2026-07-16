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
import type { InputReader } from '../input/InputSystem';
import type { InteractionSystem } from './InteractionSystem';
import type { WorldLocation } from './Interactable';

const RANGE_SEGMENTS = 48;

function isDebugLine(
  object: Object3D,
): object is Line<BufferGeometry, LineBasicMaterial> {
  return 'isLine' in object && object.isLine === true;
}

export class InteractionDebugSystem implements GameSystem {
  public readonly id = 'interaction-debug';
  public readonly updateMode = 'always' as const;

  private readonly root = new Group();
  private readonly panel = document.createElement('aside');
  private visible: boolean;

  public constructor(
    private readonly scene: Scene,
    private readonly mount: HTMLElement,
    private readonly input: InputReader,
    private readonly interactions: InteractionSystem,
    initiallyVisible = true,
  ) {
    this.visible = initiallyVisible;
  }

  public init(): void {
    this.root.name = 'Interaction debug visualization';
    this.root.renderOrder = 100;
    this.scene.add(this.root);
    this.panel.className = 'interaction-debug-panel';
    this.mount.append(this.panel);
    this.applyVisibility();
  }

  public update(): void {
    if (this.input.wasPressed('toggleDebug')) {
      this.visible = !this.visible;
      this.applyVisibility();
    }
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
      this.root.add(this.createRange(target.location, target.range, color));
    }
    if (snapshot.pose) {
      for (const candidate of snapshot.candidates) {
        this.root.add(
          this.createLine(
            snapshot.pose.position,
            candidate.location,
            candidate.target.id === snapshot.selectedId ? 0x42f5e6 : 0xffb547,
          ),
        );
      }
    }

    const selected = snapshot.selectedId ?? 'none';
    const candidates = snapshot.candidates.length
      ? snapshot.candidates
          .map(
            ({ target, distance, facing, score }) =>
              `${target.id}: ${score.toFixed(2)}  d=${distance.toFixed(2)}  face=${facing.toFixed(2)}`,
          )
          .join('\n')
      : 'none';
    this.panel.textContent = `Interactions\nSelected ${selected}\nCandidates\n${candidates}`;
  }

  public dispose(): void {
    this.clearVisualization();
    this.scene.remove(this.root);
    this.panel.remove();
  }

  private createRange(
    location: WorldLocation,
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
    from: WorldLocation,
    to: WorldLocation,
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
    this.panel.hidden = !this.visible;
  }
}
