import { Mesh, MeshStandardMaterial, Scene, SphereGeometry } from 'three';
import { AccessibilityPreferenceStore } from '../../src/accessibility/AccessibilityPreferences';
import { EventBus } from '../../src/core/events';
import { DebugRegistry } from '../../src/debug/DebugRegistry';
import {
  nightBlendForHour,
  TimeOfDayLightingSystem,
} from '../../src/world/TimeOfDayLightingSystem';
import type { WorldEvents } from '../../src/world/WorldEvents';
import { testDistrict } from '../../src/world/levels/testDistrict';

describe('TimeOfDayLightingSystem', () => {
  it('uses deterministic day, twilight, and night bands', () => {
    expect(nightBlendForHour(13)).toBe(0);
    expect(nightBlendForHour(18.5)).toBeCloseTo(0.5);
    expect(nightBlendForHour(22)).toBe(1);
    expect(nightBlendForHour(6)).toBeCloseTo(0.5);
    expect(nightBlendForHour(30)).toBeCloseTo(0.5);
  });

  it('transitions shared world lights and bounded fixture emission', () => {
    const harness = createHarness();
    harness.system.init();

    expect(harness.system.getSnapshot()).toMatchObject({
      preset: 'day',
      hour: 13,
      nightBlend: 0,
      localLightCount: 4,
      emissiveFixtureCount: 4,
      maxLocalLights: 4,
      shadowsEnabled: false,
      pauseBehavior: 'freeze',
      dialogueBehavior: 'continue',
    });
    expect(
      harness.materials.every(
        ({ emissiveIntensity }) => emissiveIntensity === 0,
      ),
    ).toBe(true);

    harness.system.setPreset('night');
    harness.system.update({ delta: 0.6, elapsed: 0.6, frame: 1 });
    expect(harness.system.getSnapshot()).toMatchObject({
      preset: 'night',
      transitioning: true,
      transitionProgress: 0.5,
      nightBlend: 0.5,
    });
    harness.system.update({ delta: 0.6, elapsed: 1.2, frame: 2 });
    expect(harness.system.getSnapshot()).toMatchObject({
      hour: 22,
      transitioning: false,
      nightBlend: 1,
    });
    expect(
      harness.materials.every(
        ({ emissiveIntensity }) => emissiveIntensity === 2.4,
      ),
    ).toBe(true);

    harness.system.dispose();
    expect(
      harness.scene.getObjectByName('environment:time-of-day'),
    ).toBeUndefined();
    expect(
      harness.materials.every(
        ({ emissiveIntensity }) => emissiveIntensity === 0,
      ),
    ).toBe(true);
  });

  it('binds and releases streamed interior emissives without retaining disposed sector materials', () => {
    const harness = createHarness([]);
    harness.system.init();
    harness.system.setPreset('night');
    harness.system.update({ delta: 1.2, elapsed: 1.2, frame: 1 });
    expect(harness.system.getSnapshot()).toMatchObject({
      localLightCount: 4,
      emissiveFixtureCount: 0,
      emissiveFixtureIds: [],
      emissiveMaterialCount: 0,
    });

    const home = addFixtureVisual(harness.scene, 'lamp.interior-rook-home');
    emitSectorLoaded(harness.events, 'sector.world-004-west-south');
    expect(harness.system.getSnapshot()).toMatchObject({
      emissiveFixtureCount: 1,
      emissiveFixtureIds: ['lamp.interior-rook-home'],
      emissiveMaterialCount: 1,
    });
    expect(home.material.emissiveIntensity).toBe(2.4);

    // Duplicate lifecycle publication must rebind, not duplicate ownership.
    emitSectorLoaded(harness.events, 'sector.world-004-west-south');
    expect(harness.system.getSnapshot()).toMatchObject({
      localLightCount: 4,
      emissiveFixtureCount: 1,
      emissiveMaterialCount: 1,
    });

    const venue = addFixtureVisual(harness.scene, 'lamp.interior-night-venue');
    emitSectorLoaded(harness.events, 'sector.world-004-east-north');
    expect(harness.system.getSnapshot()).toMatchObject({
      emissiveFixtureCount: 2,
      emissiveFixtureIds: [
        'lamp.interior-night-venue',
        'lamp.interior-rook-home',
      ],
      emissiveMaterialCount: 2,
    });
    expect(venue.material.emissiveIntensity).toBe(2.4);

    harness.events.emit('sector:unloaded', {
      levelId: testDistrict.definition.id,
      sectorId: 'sector.world-004-west-south',
    });
    expect(home.material.emissiveIntensity).toBe(0);
    expect(harness.system.getSnapshot()).toMatchObject({
      emissiveFixtureCount: 1,
      emissiveFixtureIds: ['lamp.interior-night-venue'],
      emissiveMaterialCount: 1,
    });
    harness.scene.remove(home.mesh);

    const reloadedHome = addFixtureVisual(
      harness.scene,
      'lamp.interior-rook-home',
    );
    emitSectorLoaded(harness.events, 'sector.world-004-west-south');
    expect(reloadedHome.material.emissiveIntensity).toBe(2.4);
    expect(home.material.emissiveIntensity).toBe(0);
    expect(harness.system.getSnapshot()).toMatchObject({
      localLightCount: 4,
      emissiveFixtureCount: 2,
      emissiveMaterialCount: 2,
    });
    const lampLights = harness.scene.getObjectByName('environment:lamp-lights');
    expect(lampLights).toBeDefined();
    const lightNames = lampLights?.children.map(({ name }) => name) ?? [];
    expect(new Set(lightNames).size).toBe(4);

    for (const sectorId of [
      'sector.world-004-west-south',
      'sector.world-004-east-north',
    ]) {
      harness.events.emit('sector:unloaded', {
        levelId: testDistrict.definition.id,
        sectorId,
      });
    }
    expect(reloadedHome.material.emissiveIntensity).toBe(0);
    expect(venue.material.emissiveIntensity).toBe(0);
    expect(harness.system.getSnapshot()).toMatchObject({
      emissiveFixtureCount: 0,
      emissiveFixtureIds: [],
      emissiveMaterialCount: 0,
    });
    harness.system.dispose();
  });

  it('keeps a shared emissive material bound until its last streamed fixture unloads', () => {
    const harness = createHarness([]);
    const shared = new MeshStandardMaterial();
    shared.name = 'InteriorFixture';
    shared.emissiveIntensity = 0;
    addFixtureVisual(harness.scene, 'lamp.interior-rook-home', shared);
    addFixtureVisual(harness.scene, 'lamp.interior-night-venue', shared);
    harness.system.init();
    harness.system.setPreset('night');
    harness.system.update({ delta: 1.2, elapsed: 1.2, frame: 1 });
    expect(harness.system.getSnapshot()).toMatchObject({
      emissiveFixtureCount: 2,
      emissiveMaterialCount: 1,
    });

    harness.events.emit('sector:unloaded', {
      levelId: testDistrict.definition.id,
      sectorId: 'sector.world-004-west-south',
    });
    expect(shared.emissiveIntensity).toBe(2.4);
    expect(harness.system.getSnapshot()).toMatchObject({
      emissiveFixtureCount: 1,
      emissiveFixtureIds: ['lamp.interior-night-venue'],
      emissiveMaterialCount: 1,
    });

    harness.events.emit('sector:unloaded', {
      levelId: testDistrict.definition.id,
      sectorId: 'sector.world-004-east-north',
    });
    expect(shared.emissiveIntensity).toBe(0);
    expect(harness.system.getSnapshot()).toMatchObject({
      emissiveFixtureCount: 0,
      emissiveMaterialCount: 0,
    });
    harness.system.dispose();
  });

  it('releases every fixture for the legacy full-level sector lifecycle', () => {
    const harness = createHarness();
    harness.system.init();
    harness.system.setPreset('night');
    harness.system.update({ delta: 1.2, elapsed: 1.2, frame: 1 });
    expect(harness.system.getSnapshot()).toMatchObject({
      emissiveFixtureCount: 4,
      emissiveMaterialCount: 4,
    });

    harness.events.emit('sector:unloaded', {
      levelId: testDistrict.definition.id,
      sectorId: 'legacy-full-level',
    });
    expect(
      harness.materials.every(
        ({ emissiveIntensity }) => emissiveIntensity === 0,
      ),
    ).toBe(true);
    expect(harness.system.getSnapshot()).toMatchObject({
      localLightCount: 4,
      emissiveFixtureCount: 0,
      emissiveFixtureIds: [],
      emissiveMaterialCount: 0,
    });

    harness.system.dispose();
  });

  it('exposes disposable debug controls and finishes transitions for reduced motion', async () => {
    const harness = createHarness();
    harness.system.init();
    expect(harness.debug.listCommands().map(({ id }) => id)).toEqual(
      expect.arrayContaining(['time.day', 'time.night', 'time.set']),
    );

    await harness.debug.executeCommand('time.night');
    expect(harness.system.getSnapshot().transitioning).toBe(true);
    harness.accessibility.update({ reducedCameraMotion: true });
    expect(harness.system.getSnapshot()).toMatchObject({
      hour: 22,
      nightBlend: 1,
      transitioning: false,
      reducedMotion: true,
    });
    await harness.debug.executeCommand('time.set', '6');
    expect(harness.system.getSnapshot()).toMatchObject({
      preset: 'custom',
      hour: 6,
      nightBlend: 0.5,
      transitioning: false,
    });
    await expect(
      harness.debug.executeCommand('time.set', '25'),
    ).rejects.toThrow(/0 through 24/);

    harness.system.dispose();
    expect(harness.debug.listCommands()).toHaveLength(0);
    expect(harness.debug.readValues()).toHaveLength(0);
  });
});

function createHarness(
  fixtureIds = testDistrict.definition.lighting.lamps.map(({ id }) => id),
): {
  scene: Scene;
  system: TimeOfDayLightingSystem;
  materials: MeshStandardMaterial[];
  accessibility: AccessibilityPreferenceStore;
  debug: DebugRegistry;
  events: EventBus<WorldEvents>;
} {
  const scene = new Scene();
  const fixtureIdSet = new Set(fixtureIds);
  const materials = testDistrict.definition.lighting.lamps
    .filter(({ id }) => fixtureIdSet.has(id))
    .map((fixture) => {
      const material = new MeshStandardMaterial();
      material.name = fixture.emissiveMaterialName;
      material.emissiveIntensity = 0;
      const mesh = new Mesh(new SphereGeometry(0.1), material);
      mesh.name = `visual:${fixture.visualId}`;
      scene.add(mesh);
      return material;
    });
  const accessibility = new AccessibilityPreferenceStore();
  const debug = new DebugRegistry();
  const events = new EventBus<WorldEvents>();
  const system = new TimeOfDayLightingSystem(
    scene,
    { activeLevel: testDistrict.definition },
    events,
    accessibility,
    debug,
  );
  return { scene, system, materials, accessibility, debug, events };
}

function addFixtureVisual(
  scene: Scene,
  fixtureId: string,
  material = new MeshStandardMaterial(),
) {
  const fixture = testDistrict.definition.lighting.lamps.find(
    ({ id }) => id === fixtureId,
  );
  if (!fixture) throw new Error(`Missing fixture ${fixtureId}`);
  material.name = fixture.emissiveMaterialName;
  material.emissiveIntensity = 0;
  const mesh = new Mesh(new SphereGeometry(0.1), material);
  mesh.name = `visual:${fixture.visualId}`;
  scene.add(mesh);
  return { material, mesh };
}

function emitSectorLoaded(events: EventBus<WorldEvents>, sectorId: string) {
  events.emit('sector:loaded', {
    levelId: testDistrict.definition.id,
    sectorId,
    colliders: [],
  });
}
