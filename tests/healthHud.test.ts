// @vitest-environment jsdom
import { PerspectiveCamera } from 'three';
import { HealthComponent } from '../src/health/Health';
import type { CollisionWorld } from '../src/physics/CollisionWorld';
import { HealthHudSystem } from '../src/ui/HealthHudSystem';

describe('HealthHudSystem', () => {
  it('shows owned player health and projects only an enabled visible target', () => {
    const mount = document.createElement('main');
    Object.defineProperties(mount, {
      clientWidth: { value: 800 },
      clientHeight: { value: 600 },
    });
    document.body.append(mount);
    const player = new HealthComponent('player', 100);
    const target = new HealthComponent('target', 100);
    let enabled = true;
    let obstructed = false;
    const camera = new PerspectiveCamera(60, 4 / 3, 0.1, 100);
    camera.position.set(0, 1, 5);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld(true);
    const collision = {
      castSegment: () => ({
        obstructed,
        fraction: obstructed ? 0.5 : 1,
        colliderId: obstructed ? 'wall' : undefined,
      }),
    } as unknown as CollisionWorld;
    const hud = new HealthHudSystem(
      mount,
      player,
      {
        getHealth: () => target,
        getHealthAnchor: () => (enabled ? { x: 0, y: 2.1, z: 0 } : undefined),
      },
      camera,
      collision,
    );
    hud.init();
    hud.update();
    expect(hud.getSnapshot()).toMatchObject({
      playerHudVisible: true,
      targetHudVisible: true,
      targetOccluded: false,
    });
    expect(
      mount.querySelector('.health-hud__player .health-hud__label')
        ?.textContent,
    ).toBe('CONDITION');
    expect(
      mount.querySelector('.health-hud__player')?.getAttribute('data-status'),
    ).toBe('steady');

    player.damage(25, 'test');
    expect(
      mount.querySelector('.health-hud__player')?.getAttribute('aria-valuenow'),
    ).toBe('75');
    player.damage(50, 'test-critical');
    expect(
      mount.querySelector('.health-hud__player')?.getAttribute('data-status'),
    ).toBe('critical');
    expect(
      mount.querySelector('.health-hud__player .health-hud__label')
        ?.textContent,
    ).toBe('CONDITION · CRITICAL');
    player.damage(25, 'test-depleted');
    expect(
      mount.querySelector('.health-hud__player')?.getAttribute('data-status'),
    ).toBe('depleted');
    expect(
      mount.querySelector('.health-hud__player .health-hud__label')
        ?.textContent,
    ).toBe('CONDITION · DEPLETED');
    obstructed = true;
    hud.update();
    expect(hud.getSnapshot()).toMatchObject({
      targetHudVisible: false,
      targetOccluded: true,
    });
    obstructed = false;
    enabled = false;
    hud.update();
    expect(hud.getSnapshot().targetHudVisible).toBe(false);
    hud.dispose();
    expect(mount.querySelector('.health-hud')).toBeNull();
  });
});
