import type { CharacterActionName } from '../characters/CharacterActions';

export type EquipmentId = 'handgun' | 'knife';
export type EquipmentSlot = 'sidearm' | 'melee';
export type EquipmentRigId = 'ultimate-men' | 'animated-men';

export interface EquipmentSocketPresentation {
  readonly boneName: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: number;
}

export interface EquipmentDefinition {
  readonly id: EquipmentId;
  readonly displayName: string;
  readonly icon: string;
  readonly slot: EquipmentSlot;
  readonly quickbarSlot: 1 | 2;
  readonly prop: 'handgun' | 'knife';
  readonly useAction: CharacterActionName;
  readonly ammunition?: {
    readonly capacity: number;
    readonly repeatCadenceSeconds: number;
  };
  readonly idleAnimation?: string;
  readonly runAnimation?: string;
  readonly presentations: Readonly<
    Partial<Record<EquipmentRigId, EquipmentSocketPresentation>>
  >;
}

export const equipmentDefinitions = [
  {
    id: 'handgun',
    displayName: 'Handgun',
    icon: '▰',
    slot: 'sidearm',
    quickbarSlot: 1,
    prop: 'handgun',
    useAction: 'gunFire',
    ammunition: { capacity: 8, repeatCadenceSeconds: 0.72 },
    idleAnimation: 'gunIdle',
    runAnimation: 'gunRun',
    presentations: {
      'ultimate-men': {
        boneName: 'WristR',
        // Authored hand bones inherit 100x armature scale.
        position: [0.0002, 0.0002, -0.0008],
        rotation: [Math.PI / 2, 0, Math.PI],
        scale: 0.009,
      },
    },
  },
  {
    id: 'knife',
    displayName: 'Knife',
    icon: '╱',
    slot: 'melee',
    quickbarSlot: 2,
    prop: 'knife',
    useAction: 'knifeSlash',
    idleAnimation: 'knifeIdle',
    presentations: {
      'ultimate-men': {
        boneName: 'WristR',
        position: [0.0001, 0.0003, -0.0012],
        rotation: [0, 0, Math.PI / 2],
        scale: 0.009,
      },
      'animated-men': {
        boneName: 'PalmR',
        // Animated Men uses the same 100x armature convention under a 0.37 root.
        position: [0, 0.0005, -0.0025],
        rotation: [0, 0, Math.PI / 2],
        scale: 0.024,
      },
    },
  },
] as const satisfies readonly EquipmentDefinition[];

export const equipmentById: ReadonlyMap<EquipmentId, EquipmentDefinition> =
  new Map(
    equipmentDefinitions.map((definition) => [definition.id, definition]),
  );

export function equipmentForQuickbarSlot(
  slot: number,
): EquipmentDefinition | undefined {
  return equipmentDefinitions.find(
    (definition) => definition.quickbarSlot === slot,
  );
}

export function isEquipmentId(value: string | undefined): value is EquipmentId {
  return value === 'handgun' || value === 'knife';
}
