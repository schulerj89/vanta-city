import { DebugPanelSystem } from '../src/debug/DebugPanelSystem';
import { DebugRegistry, debugSections } from '../src/debug/DebugRegistry';
import type { InputReader } from '../src/input/InputSystem';

const noInput: InputReader = {
  isDown: () => false,
  wasPressed: () => false,
  wasReleased: () => false,
};
const frame = { delta: 1 / 60, elapsed: 1, frame: 1 };

describe('DebugPanelSystem', () => {
  it('orders semantic sections and keeps passive values separate from controls', () => {
    const registry = new DebugRegistry();
    registry.registerCommand({
      id: 'player.reset',
      label: 'Reset player',
      group: debugSections.actions,
      run: () => {},
    });
    registry.registerValue({
      id: 'player.position',
      label: 'Position',
      group: debugSections.player,
      read: () => '1, 2, 3',
    });
    registry.registerValue({
      id: 'camera.owner',
      label: 'Owner',
      group: debugSections.camera,
      read: () => 'gameplay',
    });
    const mount = document.createElement('main');
    const panel = new DebugPanelSystem(mount, noInput, registry, vi.fn(), true);

    panel.init();
    panel.update(frame);

    const sectionNames = [...mount.querySelectorAll('.debug-section')].map(
      (section) => section.getAttribute('data-debug-section'),
    );
    expect(sectionNames).toEqual([
      debugSections.player,
      debugSections.camera,
      debugSections.runtime,
      debugSections.actions,
    ]);
    expect(
      mount
        .querySelector(`[data-debug-value="player.position"]`)
        ?.closest('.debug-section')
        ?.getAttribute('data-debug-section'),
    ).toBe(debugSections.player);
    expect(
      mount
        .querySelector(`[data-debug-command="player.reset"]`)
        ?.closest('.debug-section')
        ?.getAttribute('data-debug-section'),
    ).toBe(debugSections.actions);
    panel.dispose();
  });

  it('preserves collapse and focus when toggles change and submits commands with Enter', async () => {
    const registry = new DebugRegistry();
    const run = vi.fn();
    registry.registerToggle({
      id: 'visual.collision',
      label: 'Collision geometry',
      group: debugSections.actions,
    });
    registry.registerCommand({
      id: 'player.teleport',
      label: 'Teleport to spawn',
      group: debugSections.actions,
      argumentLabel: 'spawn id',
      run,
    });
    const mount = document.createElement('main');
    document.body.append(mount);
    const panel = new DebugPanelSystem(mount, noInput, registry, vi.fn(), true);
    panel.init();
    panel.update(frame);
    const section = mount.querySelector<HTMLDetailsElement>(
      `[data-debug-section="${debugSections.actions}"]`,
    )!;
    section.open = true;
    section.dispatchEvent(new Event('toggle'));
    const command = mount.querySelector<HTMLFormElement>(
      '[data-debug-command="player.teleport"]',
    )!;
    const field = command.querySelector('input')!;
    field.value = 'spawn.player-default';
    field.focus();

    registry.setToggle('visual.collision', true);
    panel.update({ ...frame, frame: 2 });
    expect(section.open).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(
      mount.querySelector<HTMLInputElement>(
        '[data-debug-toggle="visual.collision"] input',
      )?.checked,
    ).toBe(true);

    command.dispatchEvent(new SubmitEvent('submit', { cancelable: true }));
    await Promise.resolve();
    expect(run).toHaveBeenCalledWith('spawn.player-default');
    panel.dispose();
    mount.remove();
  });
});
