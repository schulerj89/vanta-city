import { Box3, Texture } from 'three';
import type { BufferGeometry, Material } from 'three';
import type { GameAssetLoader } from '../../src/assets/AssetLoader';
import {
  AshfallBuildingRenderer,
  ashfallBuildingAssets,
  ashfallBuildingVariants,
  getAshfallBuildingVariant,
  validateAshfallBuildingKit,
} from '../../src/world/buildings/AshfallBuildingKit';
import { ashfallBuildingPlacements } from '../../src/world/levels/testDistrict';
import { ashfallTrafficLanes } from '../../src/traffic/TrafficSimulation';
import {
  fixturePlayerSpawns,
  fixtureSpawns,
  ashfallExpansionPlan,
  eastQuayCurvedRoad,
  intersectionApproachSpawns,
  intersectionCornerSpawns,
  intersectionLayout,
  sparringTargetArea,
} from '../../src/world/levels/intersectionLayout';
import { sampleSplineRoad } from '../../src/world/levels/SplineRoadGeometry';

describe('Ashfall building kit', () => {
  it('provides 18 reusable, bounded variants across useful sizes', () => {
    expect(validateAshfallBuildingKit()).toEqual([]);
    expect(ashfallBuildingVariants).toHaveLength(18);
    expect(new Set(ashfallBuildingVariants.map(({ id }) => id)).size).toBe(18);
    expect(
      Math.min(...ashfallBuildingVariants.map(({ height }) => height)),
    ).toBeLessThanOrEqual(5);
    expect(
      Math.max(...ashfallBuildingVariants.map(({ height }) => height)),
    ).toBeGreaterThanOrEqual(18);
    expect(
      new Set(ashfallBuildingVariants.map(({ profile }) => profile)).size,
    ).toBe(4);
  });

  it('uses only the controlled local generated texture palette', () => {
    expect(Object.keys(ashfallBuildingAssets)).toHaveLength(7);
    for (const descriptor of Object.values(ashfallBuildingAssets)) {
      expect(descriptor.type).toBe('texture');
      expect(descriptor.url).toMatch(
        /^\/assets\/environment\/ashfall-buildings\/[^/]+\.generated\.jpg$/,
      );
      expect(descriptor.attribution.license).toBe('Project-generated original');
      expect(descriptor.metadata.runtimeNetwork).toBe(false);
    }
  });

  it('pairs each placed shell with an equivalent authored collision footprint', () => {
    expect(ashfallBuildingPlacements).toHaveLength(10);
    for (const placement of ashfallBuildingPlacements) {
      const definition = getAshfallBuildingVariant(placement.visual.variantId);
      const rotated = Math.abs(placement.visual.rotation?.[1] ?? 0) > 0.5;
      expect(placement.collider.size).toEqual([
        rotated ? definition.footprint[1] : definition.footprint[0],
        definition.height,
        rotated ? definition.footprint[0] : definition.footprint[1],
      ]);
      expect(placement.collider.tags).toEqual(
        expect.arrayContaining(['obstacle', 'camera', 'building']),
      );
    }
  });

  it('keeps every building footprint clear of the four traffic lanes', () => {
    for (const placement of ashfallBuildingPlacements) {
      const [width, , depth] = placement.collider.size;
      const minX = placement.collider.position[0] - width / 2;
      const maxX = placement.collider.position[0] + width / 2;
      const minZ = placement.collider.position[2] - depth / 2;
      const maxZ = placement.collider.position[2] + depth / 2;
      for (const lane of ashfallTrafficLanes) {
        for (const point of lane.points) {
          const overlapsLane =
            point.x >= minX - 1.5 &&
            point.x <= maxX + 1.5 &&
            point.z >= minZ - 1.5 &&
            point.z <= maxZ + 1.5;
          expect(
            overlapsLane,
            `${placement.visual.id} / ${lane.approach}`,
          ).toBe(false);
        }
      }
    }
  });

  it('places the expansion buildings on the outer edge with four metres of curved-road clearance', () => {
    const added = ashfallBuildingPlacements.filter(({ visual }) =>
      ashfallExpansionPlan.addedBuildingIds.includes(
        visual.id as (typeof ashfallExpansionPlan.addedBuildingIds)[number],
      ),
    );
    expect(added).toHaveLength(2);
    const centerline = sampleSplineRoad(eastQuayCurvedRoad);
    for (const { visual, collider } of added) {
      const [width, , depth] = collider.size;
      const minX = collider.position[0] - width / 2;
      const maxX = collider.position[0] + width / 2;
      const minZ = collider.position[2] - depth / 2;
      const maxZ = collider.position[2] + depth / 2;
      expect(maxX, `${visual.id} outer edge`).toBe(
        ashfallExpansionPlan.bounds.maxX,
      );
      const clearance = Math.min(
        ...centerline.map(({ position }) => {
          const dx = Math.max(minX - position[0], 0, position[0] - maxX);
          const dz = Math.max(minZ - position[2], 0, position[2] - maxZ);
          return Math.hypot(dx, dz) - eastQuayCurvedRoad.width / 2;
        }),
      );
      expect(clearance, visual.id).toBeGreaterThanOrEqual(
        ashfallExpansionPlan.minimumPedestrianClearanceMetres,
      );
    }
  });

  it('preserves street-edge sidewalk corridors, spawns, signal, and sparring area', () => {
    const protectedPoints = [
      intersectionLayout.defaultSpawn,
      intersectionLayout.signalController,
      sparringTargetArea.player,
      sparringTargetArea.target,
      ...intersectionApproachSpawns.map(({ position }) => position),
      ...intersectionCornerSpawns.map(({ position }) => position),
      ...fixturePlayerSpawns.map(({ position }) => position),
      ...fixtureSpawns.map(({ position }) => position),
    ];
    for (const placement of ashfallBuildingPlacements) {
      const [width, , depth] = placement.collider.size;
      const [x, , z] = placement.collider.position;
      expect(
        Math.abs(x) - width / 2,
        `${placement.visual.id} X corridor`,
      ).toBeGreaterThanOrEqual(5);
      expect(
        Math.abs(z) - depth / 2,
        `${placement.visual.id} Z corridor`,
      ).toBeGreaterThanOrEqual(5);
      for (const point of protectedPoints) {
        const inside =
          Math.abs(point[0] - x) < width / 2 + 0.8 &&
          Math.abs(point[2] - z) < depth / 2 + 0.8;
        expect(
          inside,
          `${placement.visual.id} overlaps [${point.join(',')}]`,
        ).toBe(false);
      }
    }
  });

  it('keeps an exact four-metre walking band and non-overlapping authored footprints', () => {
    const roadEdge = intersectionLayout.roadWidth / 2;
    const clearances = ashfallBuildingPlacements.flatMap(({ collider }) => {
      const [width, , depth] = collider.size;
      const [x, , z] = collider.position;
      return [
        Math.abs(x) - width / 2 - roadEdge,
        Math.abs(z) - depth / 2 - roadEdge,
      ];
    });
    expect(Math.min(...clearances)).toBe(intersectionLayout.sidewalkWidth);

    for (let left = 0; left < ashfallBuildingPlacements.length; left += 1) {
      const a = ashfallBuildingPlacements[left]!.collider;
      for (
        let right = left + 1;
        right < ashfallBuildingPlacements.length;
        right += 1
      ) {
        const b = ashfallBuildingPlacements[right]!.collider;
        const overlapX =
          Math.abs(a.position[0] - b.position[0]) < (a.size[0] + b.size[0]) / 2;
        const overlapZ =
          Math.abs(a.position[2] - b.position[2]) < (a.size[2] + b.size[2]) / 2;
        expect(overlapX && overlapZ, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('builds all variants through one cached five-building-texture renderer', async () => {
    const loadTexture = vi.fn(() => Promise.resolve(new Texture()));
    const assets: GameAssetLoader = {
      loadTexture,
      loadGltf: () => Promise.reject(new Error('Unexpected model load')),
      instantiateModel: () =>
        Promise.reject(new Error('Unexpected model instance')),
      getStatus: (id) => ({ id, phase: 'idle', progress: 0 }),
      onStatus: () => () => undefined,
      dispose: () => undefined,
    };
    const resources = new Set<BufferGeometry | Material>();
    const renderer = new AshfallBuildingRenderer(assets, resources);
    const groups = await Promise.all(
      ashfallBuildingVariants.map((definition) =>
        renderer.create({
          id: `test.${definition.id}`,
          kind: 'building',
          variantId: definition.id,
          position: [0, 0, 0],
        }),
      ),
    );
    expect(loadTexture).toHaveBeenCalledTimes(5);
    for (const [index, group] of groups.entries()) {
      expect(group.userData.buildingVariantId).toBe(
        ashfallBuildingVariants[index]!.id,
      );
      expect(new Box3().setFromObject(group).isEmpty()).toBe(false);
    }
    for (const resource of resources) resource.dispose();
  });
});
