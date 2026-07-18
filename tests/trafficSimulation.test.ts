import { Group, Scene, Vector3 } from 'three';
import type { GameAssetLoader, ModelInstance } from '../src/assets/AssetLoader';
import type { CollisionWorld } from '../src/physics/CollisionWorld';
import type { GameContext } from '../src/game/GameRuntime';
import { StaticCollisionWorld } from '../src/physics/CollisionWorld';
import { DebugRegistry } from '../src/debug/DebugRegistry';
import { TrafficSystem } from '../src/traffic/TrafficSystem';
import {
  ashfallTrafficLanes,
  TrafficSimulation,
  defaultTrafficConfig,
} from '../src/traffic/TrafficSimulation';
import { trafficVehicleCatalog } from '../src/traffic/TrafficVehicleCatalog';

const config = (overrides: Partial<typeof defaultTrafficConfig> = {}) => ({
  ...defaultTrafficConfig,
  spawnCadence: 0,
  ...overrides,
});

describe('TrafficSimulation', () => {
  it('drives a spawned vehicle straight through and despawns at the opposite edge', () => {
    const traffic = new TrafficSimulation(config({ speed: 10 }));
    expect(traffic.spawn('north')).toMatchObject({ x: -1.5, z: 24.5 });

    traffic.update(5);

    expect(traffic.getSnapshot()).toMatchObject({
      count: 0,
      spawned: 1,
      despawned: 1,
    });
  });

  it('stops with spacing for the player and resumes when the query clears', () => {
    const traffic = new TrafficSimulation(config());
    traffic.spawn('north');

    traffic.update(1, { playerDistance: () => 3 });
    const stopped = traffic.getSnapshot().vehicles[0]!;
    expect(stopped.progress).toBe(1);
    expect(stopped.stoppingReason).toBe('player');

    traffic.update(1);
    const resumed = traffic.getSnapshot().vehicles[0]!;
    expect(resumed.progress).toBe(5.5);
    expect(resumed.stoppingReason).toBeUndefined();
  });

  it('maintains car-following spacing without overlap', () => {
    const traffic = new TrafficSimulation(config());
    traffic.spawn('west');
    traffic.update(2);
    traffic.spawn('west');

    for (let index = 0; index < 5; index += 1) {
      traffic.update(0.5);
      const vehicles = traffic.getSnapshot().vehicles;
      if (vehicles.length === 2) {
        const [rear, front] = [...vehicles].sort(
          (a, b) => a.progress - b.progress,
        );
        expect(front!.progress - rear!.progress).toBeGreaterThanOrEqual(6.4);
      }
    }
  });

  it('serializes perpendicular intersection occupancy deterministically', () => {
    const traffic = new TrafficSimulation(config({ maxPopulation: 4 }));
    traffic.spawn('north');
    traffic.spawn('east');

    traffic.update(5);
    const north = traffic
      .getSnapshot()
      .vehicles.find(({ approach }) => approach === 'north')!;
    const east = traffic
      .getSnapshot()
      .vehicles.find(({ approach }) => approach === 'east')!;
    expect(north.progress).toBeGreaterThan(19.2);
    expect(east.progress).toBe(22.5);

    traffic.update(4);
    const eastAtIntersection = traffic
      .getSnapshot()
      .vehicles.find(({ approach }) => approach === 'east')!;
    expect(eastAtIntersection.progress).toBe(
      ashfallTrafficLanes.find(({ approach }) => approach === 'east')!
        .intersectionEntry,
    );
    expect(eastAtIntersection.stoppingReason).toBe('intersection');

    traffic.update(3);
    traffic.update(1);
    expect(
      traffic
        .getSnapshot()
        .vehicles.find(({ approach }) => approach === 'east')!.progress,
    ).toBeGreaterThan(19.2);
  });

  it('follows the spline-derived east and west lane paths through the expansion', () => {
    const east = ashfallTrafficLanes.find(
      ({ approach }) => approach === 'east',
    )!;
    const west = ashfallTrafficLanes.find(
      ({ approach }) => approach === 'west',
    )!;
    expect(east.points.length).toBeGreaterThan(3);
    expect(west.points.length).toBeGreaterThan(3);
    expect(east.startX).toBeGreaterThan(38);
    expect(east.startX).toBeLessThan(40);
    expect(east.startZ).toBeGreaterThan(8);
    expect(west.points.at(-1)!.x).toBeGreaterThan(39);
    expect(west.points.at(-1)!.x).toBeLessThan(40);
    expect(west.points.at(-1)!.z).toBeLessThan(8);

    const traffic = new TrafficSimulation(config({ speed: 8 }));
    traffic.spawn('east');
    traffic.update(1);
    const curved = traffic.getSnapshot().vehicles[0]!;
    expect(Math.abs(curved.directionX)).toBeGreaterThan(0.7);
    expect(Math.abs(curved.directionZ)).toBeGreaterThan(0.1);
    expect(curved.yaw).not.toBeCloseTo(-Math.PI / 2, 2);
  });

  it('freezes while disabled and clears occupancy deterministically', () => {
    const traffic = new TrafficSimulation(config());
    traffic.spawnEachApproach();
    traffic.setEnabled(false);
    traffic.update(10);
    expect(
      traffic.getSnapshot().vehicles.every(({ progress }) => progress === 0),
    ).toBe(true);
    traffic.clear();
    expect(traffic.getSnapshot().count).toBe(0);
  });

  it('selects every catalog entry deterministically within its pool quota', () => {
    const traffic = new TrafficSimulation(config({ maxPopulation: 6 }));
    traffic.spawnEachApproach();
    expect(
      new Set(
        traffic.getSnapshot().vehicles.map(({ vehicleType }) => vehicleType),
      ),
    ).toEqual(new Set(trafficVehicleCatalog.map(({ id }) => id)));
    expect(
      traffic.getSnapshot().vehicles.map(({ vehicleType }) => vehicleType),
    ).toEqual(['pickup-truck', 'sports-car', 'pickup-truck', 'sports-car']);
    for (let index = 0; index < 4; index += 1) traffic.update(11);
    expect(traffic.getSnapshot()).toMatchObject({ count: 0, despawned: 4 });
  });
});

describe('TrafficSystem lifecycle', () => {
  it('uses a bounded model pool and releases models, scene nodes, and debug registrations', async () => {
    const scene = new Scene();
    const disposals: ReturnType<typeof vi.fn>[] = [];
    const instantiateModel = vi.fn(
      async (assetId: string): Promise<ModelInstance> => {
        const dispose = vi.fn();
        disposals.push(dispose);
        return { assetId, scene: new Group(), animations: [], dispose };
      },
    );
    const loader = {
      instantiateModel,
    } as unknown as GameAssetLoader;
    const collision = new StaticCollisionWorld();
    const debug = new DebugRegistry();
    const system = new TrafficSystem(
      scene,
      loader,
      collision,
      debug,
      config({ maxPopulation: 4 }),
    );
    const state = { current: 'dialogue' };
    await system.init({ state } as unknown as GameContext);
    expect(instantiateModel).toHaveBeenCalledTimes(4);
    expect(instantiateModel.mock.calls.map(([assetId]) => assetId)).toEqual([
      trafficVehicleCatalog[0]!.assetId,
      trafficVehicleCatalog[1]!.assetId,
      trafficVehicleCatalog[0]!.assetId,
      trafficVehicleCatalog[1]!.assetId,
    ]);
    system.spawnEachApproach();
    system.update({ delta: 1, elapsed: 1, frame: 1 });
    expect(system.getSnapshot()).toMatchObject({
      count: 4,
      pooledModels: 4,
      catalog: [
        { id: 'pickup-truck', pooledModels: 2, activeVehicles: 2 },
        { id: 'sports-car', pooledModels: 2, activeVehicles: 2 },
      ],
    });
    expect(
      system.getSnapshot().vehicles.every(({ progress }) => progress === 0),
    ).toBe(true);
    state.current = 'playing';
    system.update({ delta: 0.1, elapsed: 1.1, frame: 2 });
    expect(
      system.getSnapshot().vehicles.some(({ progress }) => progress > 0),
    ).toBe(true);
    expect(scene.getObjectByName('traffic-vehicles')).toBeDefined();
    expect(debug.listCommands().map(({ id }) => id)).toContain('traffic.clear');

    system.dispose();
    expect(disposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(
      true,
    );
    expect(scene.getObjectByName('traffic-vehicles')).toBeUndefined();
    expect(debug.listCommands().map(({ id }) => id)).not.toContain(
      'traffic.clear',
    );
    expect(
      system
        .getSnapshot()
        .catalog.every(({ activeVehicles }) => activeVehicles === 0),
    ).toBe(true);
  });

  it('queries the game-owned dynamic collision boundary', () => {
    const collision: CollisionWorld = {
      moveCharacter: vi.fn(),
      castCamera: vi.fn(),
      castSegment: () => ({
        fraction: 1,
        obstructed: false,
        colliderId: undefined,
      }),
      castDynamicSegment: () => ({
        fraction: 0.2,
        obstructed: true,
        colliderId: 'dynamic.player',
      }),
    };
    expect(
      collision.castDynamicSegment?.(new Vector3(), new Vector3(0, 0, 7)),
    ).toMatchObject({ colliderId: 'dynamic.player' });
  });
});
