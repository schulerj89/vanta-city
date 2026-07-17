import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import type { CharacterEquipment } from './CharacterEquipment';
import type {
  EquipmentDefinition,
  EquipmentRigId,
} from './EquipmentDefinition';

export interface EquipmentPresentationSnapshot {
  readonly itemId: string | undefined;
  readonly rigId: EquipmentRigId | undefined;
  readonly socketName: string | undefined;
  readonly attached: boolean;
  readonly compatible: boolean;
  readonly createdCount: number;
  readonly disposedCount: number;
  readonly useFlashActive: boolean;
}

/** Disposable generated-prop presentation bound to a game-owned loadout. */
export class EquipmentPresentation {
  private modelRoot: Object3D | undefined;
  private rigId: EquipmentRigId | undefined;
  private prop: Group | undefined;
  private flash: Object3D | undefined;
  private socketName: string | undefined;
  private compatible = false;
  private flashRemaining = 0;
  private createdCount = 0;
  private disposedCount = 0;
  private readonly unsubscribe: (() => void)[];

  public constructor(private readonly equipment: CharacterEquipment) {
    this.unsubscribe = [
      equipment.events.on('changed', () => this.refresh()),
      equipment.events.on('used', ({ itemId }) => {
        if (itemId === 'handgun' && this.flash) {
          this.flash.visible = true;
          this.flashRemaining = 0.08;
        }
      }),
    ];
  }

  public bind(modelRoot: Object3D, rigId?: EquipmentRigId): void {
    this.clearProp();
    this.modelRoot = modelRoot;
    this.rigId = rigId;
    this.refresh();
  }

  public unbind(): void {
    this.clearProp();
    this.modelRoot = undefined;
    this.rigId = undefined;
  }

  public update(delta: number): void {
    if (this.flashRemaining <= 0) return;
    this.flashRemaining = Math.max(0, this.flashRemaining - Math.max(0, delta));
    if (this.flashRemaining === 0 && this.flash) this.flash.visible = false;
  }

  public getSnapshot(): EquipmentPresentationSnapshot {
    return {
      itemId: this.equipment.equipped?.id,
      rigId: this.rigId,
      socketName: this.socketName,
      attached: Boolean(this.prop?.parent),
      compatible: this.compatible,
      createdCount: this.createdCount,
      disposedCount: this.disposedCount,
      useFlashActive: this.flash?.visible ?? false,
    };
  }

  public dispose(): void {
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    this.clearProp();
    this.modelRoot = undefined;
    this.rigId = undefined;
  }

  private refresh(): void {
    this.clearProp();
    const definition = this.equipment.equipped;
    const presentation = this.rigId
      ? definition?.presentations[this.rigId]
      : undefined;
    const socket =
      presentation && this.modelRoot
        ? this.modelRoot.getObjectByName(presentation.boneName)
        : undefined;
    this.compatible = Boolean(definition && presentation && socket);
    if (!definition || !presentation || !socket) return;

    const generated = createEquipmentProp(definition);
    generated.root.name = `${definition.displayName} equipped prop`;
    generated.root.userData.equipmentPresentationOwned = true;
    generated.root.position.set(...presentation.position);
    generated.root.rotation.set(...presentation.rotation);
    generated.root.scale.setScalar(presentation.scale);
    socket.add(generated.root);
    this.prop = generated.root;
    this.flash = generated.flash;
    this.socketName = presentation.boneName;
    this.createdCount += 1;
  }

  private clearProp(): void {
    if (this.prop) {
      this.prop.removeFromParent();
      disposeGeneratedProp(this.prop);
      this.disposedCount += 1;
    }
    this.prop = undefined;
    this.flash = undefined;
    this.socketName = undefined;
    this.compatible = false;
    this.flashRemaining = 0;
  }
}

function createEquipmentProp(definition: EquipmentDefinition): {
  readonly root: Group;
  readonly flash?: Object3D;
} {
  return definition.prop === 'handgun' ? createHandgun() : createKnife();
}

function createHandgun(): { readonly root: Group; readonly flash: Object3D } {
  const root = new Group();
  const metal = new MeshStandardMaterial({
    color: 0x242b34,
    roughness: 0.42,
    metalness: 0.62,
    flatShading: true,
  });
  const grip = new MeshStandardMaterial({
    color: 0x50382c,
    roughness: 0.88,
    flatShading: true,
  });
  const flashMaterial = new MeshStandardMaterial({
    color: 0xffc34f,
    emissive: 0xff7a18,
    emissiveIntensity: 2.8,
    flatShading: true,
  });
  const slide = new Mesh(new BoxGeometry(0.08, 0.1, 0.34), metal);
  slide.position.z = -0.12;
  const handle = new Mesh(new BoxGeometry(0.075, 0.22, 0.11), grip);
  handle.position.set(0, -0.13, 0.015);
  handle.rotation.x = -0.22;
  const barrel = new Mesh(new CylinderGeometry(0.027, 0.027, 0.13, 8), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.34;
  const flash = new Mesh(new ConeGeometry(0.075, 0.18, 6), flashMaterial);
  flash.rotation.x = -Math.PI / 2;
  flash.position.z = -0.49;
  flash.visible = false;
  root.add(slide, handle, barrel, flash);
  return { root, flash };
}

function createKnife(): { readonly root: Group } {
  const root = new Group();
  const metal = new MeshStandardMaterial({
    color: 0xc9d6dc,
    roughness: 0.28,
    metalness: 0.72,
    flatShading: true,
  });
  const grip = new MeshStandardMaterial({
    color: 0x382721,
    roughness: 0.9,
    flatShading: true,
  });
  const handle = new Mesh(new CylinderGeometry(0.035, 0.042, 0.18, 6), grip);
  handle.rotation.x = Math.PI / 2;
  handle.position.z = -0.02;
  const guard = new Mesh(new BoxGeometry(0.13, 0.025, 0.04), metal);
  guard.position.z = -0.12;
  const blade = new Mesh(new ConeGeometry(0.055, 0.34, 4), metal);
  blade.rotation.x = -Math.PI / 2;
  blade.position.z = -0.3;
  root.add(handle, guard, blade);
  return { root };
}

function disposeGeneratedProp(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((object) => {
    if ('geometry' in object && isGeometry(object.geometry)) {
      geometries.add(object.geometry);
    }
    if (!('material' in object)) return;
    const values = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of values) {
      if (isMaterial(material)) materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.clear();
}

function isGeometry(value: unknown): value is BufferGeometry {
  return Boolean(
    value && typeof value === 'object' && 'isBufferGeometry' in value,
  );
}

function isMaterial(value: unknown): value is Material {
  return Boolean(value && typeof value === 'object' && 'isMaterial' in value);
}
