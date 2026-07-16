import {
  Box3,
  Box3Helper,
  CapsuleGeometry,
  CircleGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  WireframeGeometry,
} from 'three';
import type { Scene } from 'three';
import type { BufferGeometry, Material } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { CharacterPlayerVisual } from '../player/CharacterPlayerVisual';
import type { PlayerControllerSystem } from '../player/PlayerControllerSystem';
import type { DebugVisualHelper } from './DebugVisualHelpers';

export class CharacterAlignmentDebugSystem
  implements GameSystem, DebugVisualHelper
{
  public readonly id = 'character-alignment-debug';
  public readonly updateMode = 'always' as const;

  private readonly root = new Group();
  private readonly bounds = new Box3();
  private readonly boundsHelper = new Box3Helper(this.bounds, 0x63ef91);
  private readonly simulationMarker: Mesh;
  private readonly visualRootMarker: Mesh;
  private readonly lowestPointMarker: Mesh;
  private readonly collisionBody: LineSegments;
  private readonly groundPlane: Mesh;
  private readonly ownedGeometries: BufferGeometry[] = [];
  private readonly ownedMaterials: Material[] = [];

  public constructor(
    private readonly scene: Scene,
    private readonly player: PlayerControllerSystem,
    private readonly visual: CharacterPlayerVisual,
  ) {
    this.root.name = 'Character alignment debug';
    this.root.visible = false;

    this.simulationMarker = this.marker(0xff3fa4, 0.09);
    this.simulationMarker.name = 'Simulation origin';
    this.visualRootMarker = this.marker(0xffd84d, 0.07);
    this.visualRootMarker.name = 'Visual root';
    this.lowestPointMarker = this.marker(0xff4949, 0.08);
    this.lowestPointMarker.name = 'Calculated lowest point';

    const shape = this.player.movement.config;
    const capsule = new CapsuleGeometry(
      shape.radius,
      Math.max(0, shape.height - shape.radius * 2),
      6,
      10,
    );
    const capsuleWireframe = new WireframeGeometry(capsule);
    capsule.dispose();
    const collisionMaterial = new LineBasicMaterial({ color: 0x4ddcff });
    this.ownedGeometries.push(capsuleWireframe);
    this.ownedMaterials.push(collisionMaterial);
    this.collisionBody = new LineSegments(capsuleWireframe, collisionMaterial);
    this.collisionBody.name = 'Player collision body';

    const planeGeometry = new CircleGeometry(0.72, 32);
    const planeMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      depthTest: false,
    });
    this.ownedGeometries.push(planeGeometry);
    this.ownedMaterials.push(planeMaterial);
    this.groundPlane = new Mesh(planeGeometry, planeMaterial);
    this.groundPlane.name = 'Ground contact plane';
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.renderOrder = 100;

    this.root.add(
      this.simulationMarker,
      this.visualRootMarker,
      this.lowestPointMarker,
      this.collisionBody,
      this.groundPlane,
      this.boundsHelper,
    );
  }

  public init(): void {
    this.scene.add(this.root);
  }

  public setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  public update(): void {
    if (!this.root.visible) return;
    const simulation = this.player.movement.position;
    const height = this.player.movement.config.height;
    this.simulationMarker.position.copy(simulation);
    this.collisionBody.position.set(
      simulation.x,
      simulation.y + height / 2,
      simulation.z,
    );
    this.groundPlane.position.set(
      simulation.x,
      simulation.y + 0.006,
      simulation.z,
    );

    this.visual.visualRoot.updateWorldMatrix(true, true);
    this.visual.visualRoot.getWorldPosition(this.visualRootMarker.position);
    const report = this.visual.getAlignmentReport();
    this.boundsHelper.visible = report !== undefined;
    this.lowestPointMarker.visible = report !== undefined;
    if (!report) return;

    this.bounds.copy(report.modelBounds);
    this.bounds.translate(new Vector3(0, report.appliedVisualOffset, 0));
    this.bounds.applyMatrix4(this.visual.visualRoot.matrixWorld);
    this.boundsHelper.updateMatrixWorld(true);

    const center = report.modelBounds.getCenter(new Vector3());
    center.y = report.alignedLowestY;
    this.lowestPointMarker.position
      .copy(center)
      .applyMatrix4(this.visual.visualRoot.matrixWorld);
  }

  public dispose(): void {
    this.scene.remove(this.root);
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.boundsHelper.dispose();
    this.root.clear();
  }

  private marker(color: number, radius: number): Mesh {
    const geometry = new SphereGeometry(radius, 8, 6);
    const material = new MeshBasicMaterial({
      color,
      depthTest: false,
    });
    this.ownedGeometries.push(geometry);
    this.ownedMaterials.push(material);
    const marker = new Mesh(geometry, material);
    marker.renderOrder = 101;
    return marker;
  }
}
