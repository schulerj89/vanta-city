import { describe, expect, it } from 'vitest';
import {
  AdaptiveSectorStreamingPolicy,
  type StreamingMemorySample,
} from '../../src/world/AdaptiveSectorStreamingPolicy';
import type { WorldSectorDefinition } from '../../src/world/LevelDefinition';

function sector(
  id: string,
  x: number,
  z = 0,
  loadDistance = 6,
  unloadDistance = 10,
): WorldSectorDefinition {
  return { id, center: [x, z], loadDistance, unloadDistance, entryIds: [] };
}

function memory(estimatedProxyMb: number): StreamingMemorySample {
  return {
    renderer: { geometries: 0, textures: 0 },
    assets: {
      sourceReferences: estimatedProxyMb,
      instanceReferences: 0,
      inFlight: 0,
    },
  };
}

describe('AdaptiveSectorStreamingPolicy', () => {
  const policy = new AdaptiveSectorStreamingPolicy({
    hardNearRadius: 12,
    criticalAdjacencyDistance: 26,
    missionNearRadius: 12,
    missionAdjacencyDistance: 26,
    lowPressurePrefetchRadius: 62,
    mediumPressurePrefetchRadius: 38,
    movementLookAheadDistance: 30,
    movementPrefetchRadius: 8,
    teleportDistance: 40,
    hysteresisDistance: 8,
    fallbackBaseMb: 0,
    assetSourceProxyMb: 1,
  });
  const sectors = [
    { ...sector('always', 500), alwaysLoaded: true },
    sector('current', 0),
    sector('adjacent', 25),
    sector('prefetch-medium', 36),
    sector('prefetch-low', 58),
    sector('far', 100),
    sector('mission-neighbor', 125),
  ];

  it('protects the player near ring and current adjacency at hard pressure', () => {
    const result = policy.evaluate({
      sectors,
      playerPosition: { x: 1, y: 0, z: 0 },
      memory: memory(950),
    });

    expect(result.pressure).toBe('high');
    expect(result.decisions.current).toMatchObject({
      disposition: 'desired',
      reason: 'player-current',
      protected: true,
    });
    expect(result.decisions.adjacent).toMatchObject({
      disposition: 'desired',
      reason: 'player-adjacent',
      protected: true,
    });
    expect(result.decisions['prefetch-low']).toMatchObject({
      disposition: 'inactive',
      reason: 'memory-hard-trim',
    });
    expect(result.decisions.always!.reason).toBe('always-loaded');
  });

  it('reduces only soft prefetch across low, medium, and high pressure', () => {
    const evaluate = (proxyMb: number) =>
      policy.evaluate({
        sectors,
        playerPosition: { x: 0, y: 0, z: 0 },
        memory: memory(proxyMb),
      });
    const low = evaluate(100);
    const medium = evaluate(500);
    const high = evaluate(700);

    expect(low.pressure).toBe('low');
    expect(low.desiredSectorIds).toContain('prefetch-low');
    expect(medium.pressure).toBe('medium');
    expect(medium.desiredSectorIds).toContain('prefetch-medium');
    expect(medium.desiredSectorIds).not.toContain('prefetch-low');
    expect(high.pressure).toBe('high');
    expect(high.desiredSectorIds).not.toContain('prefetch-medium');
    expect(high.desiredSectorIds).toEqual(
      expect.arrayContaining(['always', 'current', 'adjacent']),
    );
  });

  it('retains hysteresis at high pressure but evicts it over the hard ceiling', () => {
    const hysteresisPolicy = new AdaptiveSectorStreamingPolicy({
      ...policy.config,
      criticalAdjacencyDistance: 0,
      hardNearRadius: 5,
    });
    const hysteresisSector = sector('hysteresis', 30, 0, 5, 10);
    const evaluate = (proxyMb: number) =>
      hysteresisPolicy.evaluate({
        sectors: [sector('current', 13), hysteresisSector],
        playerPosition: { x: 13, y: 0, z: 0 },
        activeSectorIds: new Set(['hysteresis']),
        memory: memory(proxyMb),
      });

    expect(evaluate(650).decisions.hysteresis).toMatchObject({
      disposition: 'retained',
      reason: 'active-hysteresis',
      protected: false,
    });
    expect(evaluate(950).decisions.hysteresis).toMatchObject({
      disposition: 'evicted',
      reason: 'memory-hard-trim',
      protected: false,
    });
  });

  it('prefetches movement direction but resets stale direction on teleport', () => {
    const moving = policy.evaluate({
      sectors: [sector('origin', 0), sector('ahead', 40)],
      previousPlayerPosition: { x: 0, y: 0, z: 0 },
      playerPosition: { x: 5, y: 0, z: 0 },
    });
    expect(moving.decisions.ahead!.reason).toBe('movement-prefetch');

    const teleported = policy.evaluate({
      sectors: [sector('landing', 100), sector('stale-ahead', 135)],
      previousPlayerPosition: { x: 0, y: 0, z: 0 },
      playerPosition: { x: 100, y: 0, z: 0 },
    });
    expect(teleported.teleported).toBe(true);
    expect(teleported.decisions['stale-ahead']!.reason).not.toBe(
      'movement-prefetch',
    );
  });

  it('always protects the nearest streamable sector at a distant teleport landing', () => {
    const result = policy.evaluate({
      sectors: [sector('distant-nearest', 40), sector('farther', 80)],
      previousPlayerPosition: { x: 0, y: 0, z: 0 },
      playerPosition: { x: 100, y: 0, z: 0 },
      memory: memory(950),
    });

    expect(result.teleported).toBe(true);
    expect(result.desiredSectorIds).toContain('farther');
    expect(result.decisions.farther).toMatchObject({
      disposition: 'desired',
      reason: 'player-current',
      protected: true,
      playerDistance: 20,
    });
  });

  it('protects the mission destination and its neighbor before arrival', () => {
    const result = policy.evaluate({
      sectors,
      playerPosition: { x: 0, y: 0, z: 0 },
      missionPositions: [{ x: 100, y: 0, z: 0 }],
      memory: memory(950),
    });
    expect(result.decisions.far).toMatchObject({
      disposition: 'desired',
      reason: 'mission-near',
      protected: true,
    });
    expect(result.decisions['mission-neighbor']).toMatchObject({
      disposition: 'desired',
      reason: 'mission-adjacent',
      protected: true,
    });
  });

  it('uses a deterministic renderer/asset proxy when heap telemetry is absent', () => {
    expect(policy.assessMemory(memory(100))).toMatchObject({
      source: 'proxy',
      pressure: 'low',
      estimatedWorkingSetMb: 100,
    });
    expect(policy.assessMemory(memory(500)).pressure).toBe('medium');
    expect(policy.assessMemory(memory(950))).toMatchObject({
      pressure: 'high',
      overHardCeiling: true,
    });
  });
});
