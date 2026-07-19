import { describe, expect, it } from 'vitest';
import { Group, Scene, Texture, Vector3 } from 'three';
import type { GameAssetLoader } from '../../src/assets/AssetLoader';
import { EventBus } from '../../src/core/events';
import { StaticCollisionWorld } from '../../src/physics/CollisionWorld';
import { defaultPlayerMovementConfig } from '../../src/player/PlayerMovement';
import { validateLevelDefinition } from '../../src/world/LevelDefinition';
import { LevelRegistry } from '../../src/world/LevelRegistry';
import { LevelSystem } from '../../src/world/LevelSystem';
import type { WorldEvents } from '../../src/world/WorldEvents';
import {
  northbarCoachDepot,
  northbarCoachDepotLayout,
  northbarVehiclePaths,
} from '../../src/world/levels/northbarCoachDepot';

const definition = northbarCoachDepot.definition;

describe('Northbar Coach Depot level', () => {
  it('is a valid, separate production level with deterministic sector ownership', () => {
    expect(() => validateLevelDefinition(definition)).not.toThrow();
    expect(definition.id).toBe('northbar-coach-depot');
    expect(definition.id).not.toBe('test-district');

    const streamable = [
      ...definition.environment.map(({ id }) => id),
      ...definition.staticCollision.map(({ id }) => id),
    ];
    const owned = definition.streaming.sectors.flatMap(
      ({ entryIds }) => entryIds,
    );
    expect(new Set(owned).size).toBe(owned.length);
    expect(new Set(owned)).toEqual(new Set(streamable));
    expect(
      definition.streaming.sectors.find(
        (sector) => 'alwaysLoaded' in sector && sector.alwaysLoaded,
      )?.entryIds,
    ).toContain('c.northbar-ground');
  });

  it('keeps one continuous collidable slab under every staging mark and path point', () => {
    const ground = definition.staticCollision.find(
      ({ id }) => id === 'c.northbar-ground',
    )!;
    const points = [
      ...Object.values(northbarCoachDepotLayout.marks),
      ...northbarVehiclePaths.coachArrival,
      ...northbarVehiclePaths.wagonExit.slice(0, -1),
    ];
    for (const [x, , z] of points) {
      expect(x).toBeGreaterThanOrEqual(ground.position[0] - ground.size[0] / 2);
      expect(x).toBeLessThanOrEqual(ground.position[0] + ground.size[0] / 2);
      expect(z).toBeGreaterThanOrEqual(ground.position[2] - ground.size[2] / 2);
      expect(z).toBeLessThanOrEqual(ground.position[2] + ground.size[2] / 2);
    }
  });

  it('settles every cinematic blocking capsule authoritatively within 0.20 metres', () => {
    const collision = new StaticCollisionWorld(-100);
    definition.staticCollision.forEach((entry) =>
      collision.addDefinition(entry),
    );
    for (const mark of [
      northbarCoachDepotLayout.marks.rookCurb,
      northbarCoachDepotLayout.marks.mackPillar,
      northbarCoachDepotLayout.marks.dellaCounter,
    ]) {
      const requested = new Vector3(...mark);
      const settled = collision.moveCharacter(
        requested,
        new Vector3(0, -defaultPlayerMovementConfig.groundSnapDistance, 0),
        defaultPlayerMovementConfig,
        true,
      );
      expect(settled.grounded).toBe(true);
      expect(settled.position.distanceTo(requested)).toBeLessThanOrEqual(0.2);
      expect(settled.groundColliderId).toMatch(/^c\.northbar-/);
    }
  });

  it('publishes every canonical mark, prop, vehicle, and camera-safe anchor', () => {
    const locationIds = new Set(definition.locations.map(({ id }) => id));
    for (const id of [
      'mark.northbar.rook-coach-step',
      'mark.northbar.rook-curb',
      'mark.northbar.mack-pillar',
      'mark.northbar.della-counter',
      'mark.northbar.wagon-passenger-door',
      'mark.northbar.wagon-driver-door',
      'path.northbar.wagon-exit',
    ]) {
      expect(locationIds).toContain(id);
    }

    const visualIds = new Set(definition.environment.map(({ id }) => id));
    for (const id of [
      'vehicle.northbar.intercity-coach',
      'vehicle.mack.service-wagon',
      'prop.northbar.arrival-manifest',
      'prop.northbar.manifest-carbon',
      'prop.northbar.eastbound-timetable',
      'c.transition-divider',
    ]) {
      expect(
        visualIds.has(id) ||
          definition.staticCollision.some((entry) => entry.id === id),
      ).toBe(true);
    }

    const anchorIds = new Set(definition.cinematicAnchors.map(({ id }) => id));
    for (const id of [
      'camera.northbar.establish-bay-two',
      'camera.northbar.establish-bay-two-safe',
      'camera.northbar.rook-mack-two-shot',
      'camera.northbar.mack-missing-close',
      'camera.northbar.della-carbon-close-safe',
      'camera.northbar.three-way-cover',
      'camera.northbar.rook-decision-close-safe',
      'camera.northbar.ticket-choice',
      'camera.northbar.wagon-entry',
      'camera.northbar.wagon-departure',
    ]) {
      expect(anchorIds).toContain(id);
    }
  });

  it('preserves documented pedestrian, entrance, platform, and departure clearances', () => {
    expect(
      northbarCoachDepotLayout.pedestrianRouteWidth,
    ).toBeGreaterThanOrEqual(4);
    expect(northbarCoachDepotLayout.entranceClearance).toBeGreaterThanOrEqual(
      1.8,
    );
    expect(northbarCoachDepotLayout.cameraPadSize).toBeGreaterThanOrEqual(4);
    expect(
      northbarCoachDepotLayout.platformEdgeClearance,
    ).toBeGreaterThanOrEqual(0.8);
    expect(northbarCoachDepotLayout.departureLaneWidth).toBeGreaterThanOrEqual(
      6,
    );

    const southWalls = definition.staticCollision.filter(({ id }) =>
      id.startsWith('c.waiting-room-south-'),
    );
    const westEdge = southWalls.find(({ id }) => id.endsWith('west'))!;
    const eastEdge = southWalls.find(({ id }) => id.endsWith('east'))!;
    const opening =
      eastEdge.position[0] -
      eastEdge.size[0] / 2 -
      (westEdge.position[0] + westEdge.size[0] / 2);
    expect(opening).toBeGreaterThanOrEqual(4);
  });

  it('keeps all authored anchors finite and outside solid collision volumes', () => {
    for (const anchor of definition.cinematicAnchors) {
      expect(
        [...anchor.position, ...anchor.lookAt].every(Number.isFinite),
      ).toBe(true);
      const insideObstacle = definition.staticCollision.some((collider) => {
        if (!collider.tags?.includes('camera')) return false;
        const [x, y, z] = anchor.position;
        return (
          Math.abs(x - collider.position[0]) < collider.size[0] / 2 &&
          Math.abs(y - collider.position[1]) < collider.size[1] / 2 &&
          Math.abs(z - collider.position[2]) < collider.size[2] / 2
        );
      });
      expect(insideObstacle, anchor.id).toBe(false);
    }
  });

  it('unloads and rebuilds detail sectors without retaining owned resources', async () => {
    const assets: GameAssetLoader = {
      loadTexture: () => Promise.resolve(new Texture()),
      loadGltf: () =>
        Promise.resolve({ scene: new Group(), animations: [] } as never),
      instantiateModel: (assetId) =>
        Promise.resolve({
          assetId,
          scene: new Group(),
          animations: [],
          dispose: vi.fn(),
        }),
      getStatus: (id) => ({ id, phase: 'idle', progress: 0 }),
      onStatus: () => () => undefined,
      dispose: () => undefined,
    };
    const scene = new Scene();
    const system = new LevelSystem(
      scene,
      assets,
      new LevelRegistry([northbarCoachDepot]),
      definition.id,
      new EventBus<WorldEvents>(),
    );
    await system.init();
    const baseline = system.getStreamingSnapshot();
    expect(baseline.active).toHaveLength(3);

    const wagon = scene.getObjectByName('visual:vehicle.mack.service-wagon')!;
    const wagonOrigin = wagon.position.clone();
    const path = system.requestVisualPath({
      owner: 'test:cinematic-wagon',
      visualIds: ['vehicle.mack.service-wagon'],
      points: northbarVehiclePaths.wagonExit.slice(0, 2),
      startSeconds: 0,
      durationSeconds: 2,
    });
    path.update(1);
    expect(wagon.position.x).toBeGreaterThan(wagonOrigin.x);
    const pausedAt = wagon.position.clone();
    path.pause();
    path.update(1);
    expect(wagon.position).toEqual(pausedAt);
    path.resume();
    path.update(1);
    expect(wagon.position.x).toBeCloseTo(northbarVehiclePaths.wagonExit[1][0]);
    path.release('cancelled');
    expect(wagon.position).toEqual(wagonOrigin);

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await system.refreshStreaming({ x: 80, y: 0, z: 80 });
      expect(system.getStreamingSnapshot().active).toEqual([
        'sector.northbar.infrastructure',
      ]);
      await system.refreshStreaming({ x: -13, y: 0, z: 2 });
      expect(system.getStreamingSnapshot()).toMatchObject({
        active: baseline.active,
        sceneObjects: baseline.sceneObjects,
        ownedResources: baseline.ownedResources,
        modelInstances: baseline.modelInstances,
        colliders: baseline.colliders,
      });
    }

    system.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
