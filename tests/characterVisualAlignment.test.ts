import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type {
  AssetLoadStatus,
  GameAssetLoader,
  ModelInstance,
} from '../src/assets/AssetLoader';
import { CharacterLoader } from '../src/characters/CharacterLoader';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';
import { CharacterSelectionStore } from '../src/characters/CharacterSelection';
import {
  calculateCharacterVisualAlignment,
  measureModelBounds,
} from '../src/characters/CharacterVisualAlignment';
import { createPlaceholderCharacter } from '../src/characters/PlaceholderCharacter';
import { StaticCollisionWorld } from '../src/physics/CollisionWorld';
import { CharacterPlayerVisual } from '../src/player/CharacterPlayerVisual';
import { PlayerMovementSimulation } from '../src/player/PlayerMovement';

describe('calculateCharacterVisualAlignment', () => {
  it('leaves a feet-origin model on the contact plane', () => {
    expect(calculateCharacterVisualAlignment({ minY: 0, maxY: 1.8 })).toEqual({
      computedHeight: 1.8,
      computedMinimumY: 0,
      appliedVisualOffset: 0,
      alignedLowestY: 0,
      usedExplicitOffset: false,
    });
  });

  it('raises a hips-origin model by its transformed minimum Y', () => {
    const alignment = calculateCharacterVisualAlignment({
      minY: -0.9,
      maxY: 0.9,
    });
    expect(alignment.computedHeight).toBeCloseTo(1.8);
    expect(alignment.appliedVisualOffset).toBeCloseTo(0.9);
    expect(alignment.alignedLowestY).toBeCloseTo(0);
  });

  it('uses bounds after scale correction', () => {
    const model = new Group();
    model.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial()));
    model.scale.setScalar(2);
    const bounds = measureModelBounds(model);
    const alignment = calculateCharacterVisualAlignment({
      minY: bounds.min.y,
      maxY: bounds.max.y,
    });

    expect(alignment.computedHeight).toBeCloseTo(4);
    expect(alignment.computedMinimumY).toBeCloseTo(-2);
    expect(alignment.appliedVisualOffset).toBeCloseTo(2);
  });

  it('uses an explicit override without adding the automatic correction', () => {
    const alignment = calculateCharacterVisualAlignment(
      { minY: -1, maxY: 1 },
      0.25,
    );
    expect(alignment.appliedVisualOffset).toBe(0.25);
    expect(alignment.alignedLowestY).toBe(-0.75);
    expect(alignment.usedExplicitOffset).toBe(true);
  });

  it('aligns the transformed placeholder primitive through the same calculation', () => {
    const placeholder = createPlaceholderCharacter();
    placeholder.root.scale.setScalar(0.6);
    const bounds = measureModelBounds(placeholder.root);
    const alignment = calculateCharacterVisualAlignment({
      minY: bounds.min.y,
      maxY: bounds.max.y,
    });
    expect(alignment.computedHeight).toBeGreaterThan(1.5);
    expect(alignment.alignedLowestY).toBeCloseTo(0);
    placeholder.dispose();
  });
});

describe('CharacterPlayerVisual hierarchy', () => {
  const definitions = [
    {
      id: 'feet-model',
      displayName: 'Feet model',
      modelAssetId: 'feet.model',
      fallback: 'placeholder',
    },
    {
      id: 'hips-model',
      displayName: 'Hips model',
      modelAssetId: 'hips.model',
      fallback: 'placeholder',
    },
  ] as const satisfies readonly CharacterDefinition[];

  it('switches models and follows teleport/sloped ground without moving or accumulating on the body', async () => {
    const selection = new CharacterSelectionStore(definitions, 'feet-model');
    const visual = new CharacterPlayerVisual(
      selection,
      new CharacterLoader(characterAssetLoader()),
    );
    const collision = new StaticCollisionWorld();
    collision.addRamp({
      id: 'slope',
      minX: -2,
      maxX: 2,
      minZ: -2,
      maxZ: 2,
      baseHeight: 0.5,
      slopeX: 0.1,
      slopeZ: 0,
    });
    const movement = new PlayerMovementSimulation(collision);
    movement.teleport(new Vector3(0, 0.5, 0));
    await visual.init();
    visual.sync(movement);
    const simulationBefore = visual.object3d.position.clone();
    expect(visual.getAlignmentReport()?.appliedVisualOffset).toBeCloseTo(0);

    selection.select('hips-model');
    await vi.waitFor(() => {
      expect(visual.getAlignmentReport()?.characterId).toBe('hips-model');
    });
    expect(visual.object3d.position).toEqual(simulationBefore);
    expect(visual.getAlignmentReport()?.appliedVisualOffset).toBeCloseTo(1);

    const offsetAfterSwitch = visual.loadedModelRoot.position.y;
    movement.teleport(new Vector3(1, 0.6, 0));
    visual.sync(movement);
    visual.sync(movement);
    expect(visual.loadedModelRoot.position.y).toBe(offsetAfterSwitch);
    expect(visual.object3d.position).toEqual(movement.position);
    expect(
      visual.object3d.position.y +
        (visual.getAlignmentReport()?.alignedLowestY ?? Number.NaN),
    ).toBeCloseTo(movement.position.y);
    visual.dispose();
  });
});

function characterAssetLoader(): GameAssetLoader {
  return {
    dispose: vi.fn(),
    getStatus: vi.fn((id: string): AssetLoadStatus => ({
      id,
      phase: 'loaded',
      progress: 1,
    })),
    instantiateModel: vi.fn(async (id: string): Promise<ModelInstance> => {
      const scene = new Group();
      const geometry = new BoxGeometry(1, 2, 1);
      const material = new MeshBasicMaterial();
      const mesh = new Mesh(geometry, material);
      mesh.position.y = id === 'feet.model' ? 1 : 0;
      scene.add(mesh);
      return {
        animations: [],
        assetId: id,
        scene,
        dispose: () => {
          geometry.dispose();
          material.dispose();
          scene.removeFromParent();
        },
      };
    }),
    loadGltf: vi.fn(async () => ({ animations: [] }) as unknown as GLTF),
    loadTexture: vi.fn(async () => {
      throw new Error('not used');
    }),
    onStatus: vi.fn(() => () => undefined),
  };
}
