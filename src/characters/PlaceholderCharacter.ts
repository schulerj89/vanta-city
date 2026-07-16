import {
  BoxGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import type { Material, Object3D } from 'three';

export interface PlaceholderCharacter {
  readonly root: Group;
  dispose(): void;
}

export function createPlaceholderCharacter(): PlaceholderCharacter {
  const root = new Group();
  root.name = 'Placeholder character';

  const skin = new MeshStandardMaterial({ color: 0xf0ad7a, flatShading: true });
  const jacket = new MeshStandardMaterial({
    color: 0x36c2a1,
    flatShading: true,
  });
  const trousers = new MeshStandardMaterial({
    color: 0x25334f,
    flatShading: true,
  });
  const accent = new MeshStandardMaterial({
    color: 0xffd056,
    flatShading: true,
  });

  const torso = new Mesh(new BoxGeometry(1, 1.25, 0.55), jacket);
  torso.position.y = 1.85;
  const head = new Mesh(new SphereGeometry(0.38, 8, 6), skin);
  head.position.y = 2.85;
  const hips = new Mesh(new BoxGeometry(0.85, 0.4, 0.5), trousers);
  hips.position.y = 1.08;
  root.add(torso, head, hips);

  addLimb(root, [-0.68, 1.9, 0], [0.24, 1.15, 0.24], jacket);
  addLimb(root, [0.68, 1.9, 0], [0.24, 1.15, 0.24], jacket);
  addLimb(root, [-0.26, 0.48, 0], [0.32, 1.05, 0.34], trousers);
  addLimb(root, [0.26, 0.48, 0], [0.32, 1.05, 0.34], trousers);

  const badge = new Mesh(new BoxGeometry(0.24, 0.24, 0.04), accent);
  badge.position.set(0, 2.08, 0.3);
  root.add(badge);

  return {
    root,
    dispose: () => {
      root.removeFromParent();
      disposeOwnedResources(root);
      root.clear();
    },
  };
}

function addLimb(
  root: Group,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  material: Material,
): void {
  const limb = new Mesh(new CapsuleGeometry(0.5, 1, 4, 6), material);
  limb.position.set(...position);
  limb.scale.set(...scale);
  root.add(limb);
}

function disposeOwnedResources(root: Object3D): void {
  const materials = new Set<Material>();
  root.traverse((object) => {
    if ('geometry' in object && isDisposable(object.geometry))
      object.geometry.dispose();
    if (!('material' in object)) return;
    const values = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of values) {
      if (isMaterial(material)) materials.add(material);
    }
  });
  for (const material of materials) material.dispose();
}

function isDisposable(value: unknown): value is { dispose(): void } {
  return typeof value === 'object' && value !== null && 'dispose' in value;
}

function isMaterial(value: unknown): value is Material {
  return typeof value === 'object' && value !== null && 'isMaterial' in value;
}
