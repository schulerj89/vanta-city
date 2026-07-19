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
import {
  TrafficSignalController,
  defaultTrafficSignalConfig,
} from '../src/traffic/TrafficSignalController';

const config = (overrides: Partial<typeof defaultTrafficConfig> = {}) => ({
  ...defaultTrafficConfig,
  spawnCadence: 0,
  ...overrides,
});

describe('TrafficSimulation', () => {
  it('drives a spawned vehicle straight through and despawns at the opposite edge', () => {
    const traffic = new TrafficSimulation(
      config({
        speed: 10,
        acceleration: 100,
        signals: { ...defaultTrafficSignalConfig, greenDuration: 30 },
      }),
    );
    expect(traffic.spawn('north')).toMatchObject({ x: -1.5, z: 32 });

    traffic.update(7);

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
    expect(stopped.progress).toBeGreaterThan(0);
    expect(stopped.progress).toBeLessThanOrEqual(1.5);
    expect(stopped.stoppingReason).toBe('player');

    traffic.update(1);
    const resumed = traffic.getSnapshot().vehicles[0]!;
    expect(resumed.progress).toBeGreaterThan(stopped.progress);
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

  it('stops red approaches before their authored lines and releases them on green', () => {
    const traffic = new TrafficSimulation(config({ maxPopulation: 4 }));
    traffic.spawn('north');
    traffic.spawn('west');

    traffic.update(8);
    const north = traffic
      .getSnapshot()
      .vehicles.find(({ approach }) => approach === 'north')!;
    const west = traffic
      .getSnapshot()
      .vehicles.find(({ approach }) => approach === 'west')!;
    const westLane = ashfallTrafficLanes.find(
      ({ approach }) => approach === 'west',
    )!;
    expect(north.progress).toBeGreaterThan(
      ashfallTrafficLanes.find(({ approach }) => approach === 'north')!
        .intersectionExit,
    );
    expect(west.progress + west.vehicleLength / 2).toBeLessThan(
      westLane.stopLine,
    );
    expect(west.stoppingReason).toBe('signal-red');

    traffic.update(10);
    const released = traffic
      .getSnapshot()
      .vehicles.find(({ approach }) => approach === 'west')!;
    expect(traffic.getSnapshot().signal.groups['east-west']).toBe('green');
    expect(released.progress).toBeGreaterThan(west.progress);
    expect(released.stoppingReason).toBeUndefined();
  });

  it('makes a deterministic safe yellow decision from stopping distance', () => {
    const traffic = new TrafficSimulation(
      config({
        speed: 8,
        acceleration: 100,
        signals: {
          greenDuration: 2.65,
          yellowDuration: 3,
          allRedDuration: 1,
        },
      }),
    );
    traffic.spawn('north');
    traffic.update(2.75);
    const committed = traffic.getSnapshot().vehicles[0]!;
    expect(committed.signalIndication).toBe('yellow');
    expect(committed.committedToIntersection).toBe(true);
    expect(committed.yellowDecision).toBe('go');
    expect(committed.stoppingReason).not.toBe('signal-yellow');

    const cautious = new TrafficSimulation(
      config({
        signals: {
          greenDuration: 0.1,
          yellowDuration: 3,
          allRedDuration: 1,
        },
      }),
    );
    cautious.spawn('north');
    cautious.update(1);
    expect(cautious.getSnapshot().vehicles[0]!.stoppingReason).toBe(
      'signal-yellow',
    );
    expect(cautious.getSnapshot().vehicles[0]!.yellowDecision).toBe('stop');
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
    expect(east.startX).toBeGreaterThan(47);
    expect(east.startX).toBeLessThan(48);
    expect(east.startZ).toBeGreaterThan(8);
    expect(west.startX).toBe(-33.75);
    expect(west.points.at(-1)!.x).toBeGreaterThan(47);
    expect(west.points.at(-1)!.x).toBeLessThan(48.2);
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

  it('seeds eight separated residents without advancing the signal cycle', () => {
    const traffic = new TrafficSimulation(config({ maxPopulation: 8 }));
    expect(traffic.populateResidents()).toBe(8);
    const snapshot = traffic.getSnapshot();
    expect(snapshot.count).toBe(8);
    expect(snapshot.signal).toMatchObject({
      phase: 'north-south-green',
      remaining: defaultTrafficSignalConfig.greenDuration,
    });
    for (const approach of ['north', 'east', 'south', 'west'] as const) {
      const lane = snapshot.vehicles
        .filter((vehicle) => vehicle.approach === approach)
        .sort((a, b) => a.progress - b.progress);
      expect(lane).toHaveLength(2);
      expect(lane[1]!.progress - lane[0]!.progress).toBeGreaterThanOrEqual(7.4);
    }
  });
});

describe('TrafficSignalController', () => {
  it('cycles green, yellow, all-red, opposing green without conflicting greens', () => {
    const signals = new TrafficSignalController({
      greenDuration: 4,
      yellowDuration: 2,
      allRedDuration: 1,
    });
    const phases = [signals.getSnapshot()];
    for (const duration of [4, 2, 1, 4, 2, 1]) {
      signals.update(duration);
      phases.push(signals.getSnapshot());
    }
    expect(phases.map(({ phase }) => phase)).toEqual([
      'north-south-green',
      'north-south-yellow',
      'all-red-to-east-west',
      'east-west-green',
      'east-west-yellow',
      'all-red-to-north-south',
      'north-south-green',
    ]);
    expect(
      phases.every(
        ({ groups }) =>
          !(
            groups['north-south'] === 'green' && groups['east-west'] === 'green'
          ),
      ),
    ).toBe(true);
    expect(phases.at(-1)!.cycle).toBe(1);
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

  it('rebuilds three times without retaining pooled models or signal roots', async () => {
    const scene = new Scene();
    const disposals: ReturnType<typeof vi.fn>[] = [];
    const loader = {
      instantiateModel: vi.fn(
        async (assetId: string): Promise<ModelInstance> => {
          const dispose = vi.fn();
          disposals.push(dispose);
          return { assetId, scene: new Group(), animations: [], dispose };
        },
      ),
    } as unknown as GameAssetLoader;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const system = new TrafficSystem(
        scene,
        loader,
        new StaticCollisionWorld(),
        undefined,
        config({ maxPopulation: 8 }),
      );
      await system.init();
      expect(scene.getObjectByName('traffic-signal-fixtures')).toBeDefined();
      expect(system.getSnapshot().pooledModels).toBe(8);
      system.dispose();
      expect(scene.getObjectByName('traffic-vehicles')).toBeUndefined();
    }
    expect(disposals).toHaveLength(24);
    expect(disposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(
      true,
    );
  });
});
