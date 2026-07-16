import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import type { Scene } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { BufferGeometry, Material, Object3D } from 'three';
import type { StaticCollisionWorld } from '../physics/CollisionWorld';

function isMesh(
  object: Object3D,
): object is Mesh<BufferGeometry, Material | Material[]> {
  return 'isMesh' in object && object.isMesh === true;
}

export class TestSceneSystem implements GameSystem {
  public readonly id = 'test-scene';
  private readonly root = new Group();
  private spinner: Group | undefined;
  private readonly colliderIds: string[] = [];

  public constructor(
    private readonly scene: Scene,
    private readonly collision: StaticCollisionWorld,
  ) {}

  public init(): void {
    this.scene.fog = new Fog(new Color(0x92a8b8), 40, 90);
    this.root.name = 'Foundation test scene';

    const floor = new Mesh(
      new PlaneGeometry(80, 80),
      new MeshStandardMaterial({ color: 0x263c35, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor, new GridHelper(80, 40, 0x557068, 0x405952));

    const sun = new DirectionalLight(0xfff0d0, 2.8);
    sun.position.set(12, 18, 8);
    this.root.add(new AmbientLight(0xb9d5ff, 1.4), sun);

    const blocks = new Group();
    const buildingGeometry = new BoxGeometry(1, 1, 1);
    const colors = [0xd5835b, 0x6b8296, 0xd4b76d, 0x7b688d];
    for (let index = 0; index < 12; index += 1) {
      const height = 1.5 + (index % 4) * 0.8;
      const material = new MeshStandardMaterial({
        color: colors[index % colors.length],
      });
      const building = new Mesh(buildingGeometry, material);
      building.scale.set(2.2, height, 2.2);
      building.position.set(
        (index % 4) * 4 - 6,
        height / 2,
        Math.floor(index / 4) * -4,
      );
      blocks.add(building);
      const id = `test-building-${index}`;
      this.collision.addBox({
        id,
        min: new Vector3(
          building.position.x - 1.1,
          0,
          building.position.z - 1.1,
        ),
        max: new Vector3(
          building.position.x + 1.1,
          height,
          building.position.z + 1.1,
        ),
      });
      this.colliderIds.push(id);
    }
    this.root.add(blocks);

    const step = new Mesh(
      new BoxGeometry(2.4, 0.3, 1.4),
      new MeshStandardMaterial({ color: 0x50685e }),
    );
    step.position.set(4.5, 0.15, 4.5);
    step.receiveShadow = true;
    this.root.add(step);
    this.collision.addBox({
      id: 'test-step',
      min: new Vector3(3.3, 0, 3.8),
      max: new Vector3(5.7, 0.3, 5.2),
    });
    this.colliderIds.push('test-step');

    const rampRise = 0.8;
    const rampRun = 3;
    const ramp = new Mesh(
      new BoxGeometry(rampRun, 0.15, 2),
      new MeshStandardMaterial({ color: 0x7a9084 }),
    );
    ramp.rotation.z = Math.atan2(rampRise, rampRun);
    ramp.position.set(-2.5, rampRise / 2, 4.7);
    ramp.receiveShadow = true;
    this.root.add(ramp);
    this.collision.addRamp({
      id: 'test-ramp',
      minX: -4,
      maxX: -1,
      minZ: 3.7,
      maxZ: 5.7,
      baseHeight: 0.07,
      slopeX: rampRise / rampRun,
      slopeZ: 0,
    });
    this.colliderIds.push('test-ramp');

    this.spinner = new Group();
    const marker = new Mesh(
      new BoxGeometry(1.4, 1.4, 1.4),
      new MeshStandardMaterial({ color: 0xffce45, flatShading: true }),
    );
    marker.rotation.set(0.4, 0.3, 0.2);
    this.spinner.position.set(0, 2.2, 4);
    this.spinner.add(marker);
    this.root.add(this.spinner);
    this.scene.add(this.root);
  }

  public update(time: FrameTime): void {
    if (this.spinner) this.spinner.rotation.y += time.delta * 0.8;
  }

  public dispose(): void {
    for (const id of this.colliderIds) this.collision.remove(id);
    this.colliderIds.length = 0;
    this.scene.remove(this.root);
    this.root.traverse((object) => {
      if (!isMesh(object)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    });
    this.root.clear();
  }
}
