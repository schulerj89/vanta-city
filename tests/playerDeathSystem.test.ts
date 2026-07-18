// @vitest-environment jsdom
import { HealthComponent } from '../src/health/Health';
import { PlayerDeathSystem } from '../src/ui/PlayerDeathSystem';

describe('PlayerDeathSystem', () => {
  it('suppresses controls, freezes camera, and restores deterministically', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const health = new HealthComponent('player', 100);
    let controls = true;
    const player = {
      health,
      isControlEnabled: () => controls,
      setControlEnabled: (enabled: boolean) => {
        controls = enabled;
      },
      reset: vi.fn(() => health.reset('test:revive')),
    };
    let cameraActive = false;
    const release = vi.fn(() => {
      cameraActive = false;
    });
    const camera = {
      getDebugSnapshot: () => ({
        position: { x: 1, y: 2, z: 3 },
        target: { x: 0, y: 1, z: 0 },
      }),
      requestCamera: vi.fn(() => {
        cameraActive = true;
        return {
          owner: 'player-death-presentation',
          get active() {
            return cameraActive;
          },
          release,
          cancel: release,
        };
      }),
      snapToPlayer: vi.fn(),
    };
    const resetOpponent = vi.fn();
    const system = new PlayerDeathSystem(
      mount,
      player,
      camera,
      true,
      resetOpponent,
    );
    system.init();

    health.set(0, 'test:deplete');
    expect(system.getSnapshot()).toMatchObject({
      visible: true,
      reducedMotion: true,
      controlsSuppressed: true,
      cameraOwned: true,
      depletionSequence: 1,
    });
    expect(mount.querySelector('.death-overlay')?.hasAttribute('hidden')).toBe(
      false,
    );
    expect(document.activeElement).toBe(
      mount.querySelector('.death-overlay__revive'),
    );

    system.reviveNow();
    expect(resetOpponent).toHaveBeenCalledOnce();
    expect(player.reset).toHaveBeenCalledOnce();
    expect(camera.snapToPlayer).toHaveBeenCalledOnce();
    expect(system.getSnapshot()).toMatchObject({
      visible: false,
      controlsSuppressed: false,
      cameraOwned: false,
      reviveSequence: 1,
    });
    expect(controls).toBe(true);

    health.set(0, 'test:again');
    system.dispose();
    expect(controls).toBe(true);
    expect(mount.querySelector('.death-overlay')).toBeNull();
    health.dispose();
  });
});
