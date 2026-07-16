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
} from 'three';
import type { Scene } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { BufferGeometry, Material, Object3D } from 'three';

function isMesh(
  object: Object3D,
): object is Mesh<BufferGeometry, Material | Material[]> {
  return 'isMesh' in object && object.isMesh === true;
}

export class TestSceneSystem implements GameSystem {
  public readonly id = 'test-scene';
  private readonly root = new Group();
  public constructor(private readonly scene: Scene) {}

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
    }
    this.root.add(blocks);

    this.scene.add(this.root);
  }

  public dispose(): void {
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
