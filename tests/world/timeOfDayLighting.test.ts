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

function createHarness(): {
  scene: Scene;
  system: TimeOfDayLightingSystem;
  materials: MeshStandardMaterial[];
  accessibility: AccessibilityPreferenceStore;
  debug: DebugRegistry;
} {
  const scene = new Scene();
  const materials = testDistrict.definition.lighting.lamps.map((fixture) => {
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
  const system = new TimeOfDayLightingSystem(
    scene,
    { activeLevel: testDistrict.definition },
    new EventBus<WorldEvents>(),
    accessibility,
    debug,
  );
  return { scene, system, materials, accessibility, debug };
}
