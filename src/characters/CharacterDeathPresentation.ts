import type { Material, Object3D } from 'three';

interface MaterialBinding {
  readonly object: Object3D & { material: Material | Material[] };
  readonly original: Material | Material[];
  readonly clones: readonly Material[];
}

export interface CharacterDeathPresentationSnapshot {
  readonly depleted: boolean;
  readonly nativeClip: boolean;
  readonly fadeFallback: boolean;
  readonly opacity: number;
  readonly clonedMaterialCount: number;
  readonly disposedMaterialCount: number;
}

/** Presentation-only native-death/fade lifecycle with reversible material clones. */
export class CharacterDeathPresentation {
  private root: Object3D | undefined;
  private bindings: MaterialBinding[] = [];
  private depleted = false;
  private nativeClip = false;
  private elapsed = 0;
  private opacity = 1;
  private disposedMaterialCount = 0;

  public bind(root: Object3D): void {
    this.restoreMaterials();
    this.root = root;
    if (this.depleted && !this.nativeClip) this.cloneFadeMaterials();
  }

  public unbind(): void {
    this.restoreMaterials();
    this.root = undefined;
  }

  public setDepleted(depleted: boolean, nativeClip: boolean): void {
    if (this.depleted === depleted && this.nativeClip === nativeClip) return;
    this.restoreMaterials();
    this.depleted = depleted;
    this.nativeClip = nativeClip;
    this.elapsed = 0;
    this.opacity = 1;
    if (depleted && !nativeClip) this.cloneFadeMaterials();
  }

  public update(delta: number): void {
    if (!this.depleted || this.nativeClip || this.bindings.length === 0) return;
    this.elapsed += Math.max(0, delta);
    const fade = Math.max(0.08, 1 - this.elapsed / 1.5);
    const blink = Math.floor(this.elapsed * 8) % 2 === 0 ? 1 : 0.32;
    this.opacity = fade * blink;
    for (const binding of this.bindings) {
      for (const material of binding.clones) material.opacity = this.opacity;
    }
  }

  public getSnapshot(): CharacterDeathPresentationSnapshot {
    return {
      depleted: this.depleted,
      nativeClip: this.nativeClip,
      fadeFallback: this.depleted && !this.nativeClip,
      opacity: this.opacity,
      clonedMaterialCount: this.bindings.reduce(
        (total, binding) => total + binding.clones.length,
        0,
      ),
      disposedMaterialCount: this.disposedMaterialCount,
    };
  }

  public dispose(): void {
    this.unbind();
    this.depleted = false;
    this.nativeClip = false;
  }

  private cloneFadeMaterials(): void {
    this.root?.traverse((object) => {
      if (isEquipmentPresentationObject(object)) return;
      if (!('material' in object)) return;
      const candidate = object as Object3D & {
        material: Material | Material[];
      };
      const originals = Array.isArray(candidate.material)
        ? candidate.material
        : [candidate.material];
      if (!originals.every(isMaterial)) return;
      const clones = originals.map((material) => {
        const clone = material.clone();
        clone.transparent = true;
        clone.opacity = 1;
        clone.depthWrite = false;
        return clone;
      });
      const original = candidate.material;
      candidate.material = Array.isArray(original) ? clones : clones[0]!;
      this.bindings.push({ object: candidate, original, clones });
    });
  }

  private restoreMaterials(): void {
    for (const binding of this.bindings) {
      binding.object.material = binding.original;
      for (const material of binding.clones) {
        material.dispose();
        this.disposedMaterialCount += 1;
      }
    }
    this.bindings = [];
    this.opacity = 1;
  }
}

function isEquipmentPresentationObject(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (current.userData.equipmentPresentationOwned === true) return true;
    current = current.parent;
  }
  return false;
}

function isMaterial(value: unknown): value is Material {
  return Boolean(value && typeof value === 'object' && 'isMaterial' in value);
}
