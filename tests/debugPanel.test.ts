import { DebugPanelSystem } from '../src/debug/DebugPanelSystem';
import { DebugRegistry, debugSections } from '../src/debug/DebugRegistry';
import type { InputReader } from '../src/input/InputSystem';

const noInput: InputReader = {
  isDown: () => false,
  wasPressed: () => false,
  wasReleased: () => false,
};
const frame = { delta: 1 / 60, elapsed: 1, frame: 1 };

function createPanel(registry: DebugRegistry): {
  readonly mount: HTMLElement;
  readonly panel: DebugPanelSystem;
} {
  const mount = document.createElement('main');
  document.body.append(mount);
  const panel = new DebugPanelSystem(mount, noInput, registry, vi.fn(), true);
  panel.init();
  panel.update(frame);
  return { mount, panel };
}

function section(mount: HTMLElement, name: string): HTMLDetailsElement {
  return mount.querySelector<HTMLDetailsElement>(
    `[data-debug-section="${name}"]`,
  )!;
}

describe('DebugPanelSystem', () => {
  it('starts every ordered section collapsed with typed counts and a four-fact summary', () => {
    const registry = new DebugRegistry();
    registry.registerValue({
      id: 'runtime.state',
      label: 'State',
      group: debugSections.runtime,
      read: () => 'playing',
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
    registry.registerValue({
      id: 'errors.count',
      label: 'Errors',
      group: debugSections.runtime,
      read: () => 0,
    });
    registry.registerToggle({
      id: 'visual.collision',
      label: 'Collision geometry',
      group: debugSections.actions,
    });
    registry.registerCommand({
      id: 'player.reset',
      label: 'Reset player',
      group: debugSections.actions,
      run: () => {},
    });
    const { mount, panel } = createPanel(registry);

    const sections = [
      ...mount.querySelectorAll<HTMLDetailsElement>('.debug-section'),
    ];
    expect(sections.map(({ dataset }) => dataset.debugSection)).toEqual([
      debugSections.player,
      debugSections.camera,
      debugSections.runtime,
      debugSections.actions,
    ]);
    expect(sections.every(({ open }) => !open)).toBe(true);
    expect(
      [...mount.querySelectorAll('[data-debug-summary]')].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual(['Stateplaying', 'Player1, 2, 3', 'Cameragameplay', 'Errors0']);
    expect(
      section(mount, debugSections.player).querySelector(
        '.debug-section__count',
      )?.textContent,
    ).toBe('1 value');
    expect(
      section(mount, debugSections.actions).querySelector(
        '.debug-section__count',
      )?.textContent,
    ).toBe('1 toggle · 1 command');

    panel.dispose();
    mount.remove();
  });

  it('keeps expansion, focus, and DOM identity stable during refresh and late registration', () => {
    const registry = new DebugRegistry();
    let position = '1, 2, 3';
    registry.registerValue({
      id: 'player.position',
      label: 'Position',
      group: debugSections.player,
      read: () => position,
    });
    const { mount, panel } = createPanel(registry);
    const initial = section(mount, debugSections.player);
    const initialSummary = initial.querySelector<HTMLElement>('summary')!;
    initial.open = true;
    initial.dispatchEvent(new Event('toggle'));
    initialSummary.focus();

    position = '4, 5, 6';
    panel.update({ ...frame, frame: 2 });
    expect(section(mount, debugSections.player)).toBe(initial);
    expect(initial.open).toBe(true);
    expect(document.activeElement).toBe(initialSummary);
    expect(
      mount.querySelector('[data-debug-summary-value="player.position"]')
        ?.textContent,
    ).toBe('4, 5, 6');

    registry.registerValue({
      id: 'player.velocity',
      label: 'Velocity',
      group: debugSections.player,
      read: () => '0, 0, 0',
    });
    registry.registerValue({
      id: 'custom.late',
      label: 'Late custom value',
      group: 'Custom extension',
      read: () => 'ready',
    });
    panel.update({ ...frame, frame: 3 });

    const rebuilt = section(mount, debugSections.player);
    expect(rebuilt).not.toBe(initial);
    expect(rebuilt.open).toBe(true);
    expect(document.activeElement).toBe(rebuilt.querySelector('summary'));
    expect(rebuilt.querySelector('.debug-section__count')?.textContent).toBe(
      '2 values',
    );
    expect(section(mount, 'Custom extension').open).toBe(false);

    panel.dispose();
    mount.remove();
  });

  it('expands and collapses all sections without invoking controls', () => {
    const registry = new DebugRegistry();
    const run = vi.fn();
    registry.registerValue({
      id: 'player.position',
      label: 'Position',
      group: debugSections.player,
      read: () => '0, 0, 0',
    });
    registry.registerCommand({
      id: 'player.reset',
      label: 'Reset player',
      group: debugSections.actions,
      run,
    });
    const { mount, panel } = createPanel(registry);

    mount
      .querySelector<HTMLButtonElement>('[data-debug-focus="expand-all"]')!
      .click();
    expect(
      [...mount.querySelectorAll<HTMLDetailsElement>('.debug-section')].every(
        ({ open }) => open,
      ),
    ).toBe(true);
    expect(run).not.toHaveBeenCalled();

    mount
      .querySelector<HTMLButtonElement>('[data-debug-focus="collapse-all"]')!
      .click();
    expect(
      [...mount.querySelectorAll<HTMLDetailsElement>('.debug-section')].every(
        ({ open }) => !open,
      ),
    ).toBe(true);
    expect(run).not.toHaveBeenCalled();

    panel.dispose();
    mount.remove();
  });

  it('keeps commands reachable, toggle refresh focused, and listeners cleaned up on disposal', async () => {
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
    const { mount, panel } = createPanel(registry);
    const actions = section(mount, debugSections.actions);
    expect(actions.open).toBe(false);
    actions.open = true;
    actions.dispatchEvent(new Event('toggle'));
    const command = actions.querySelector<HTMLFormElement>(
      '[data-debug-command="player.teleport"]',
    )!;
    const field = command.querySelector('input')!;
    field.value = 'spawn.player-default';
    field.focus();

    registry.setToggle('visual.collision', true);
    panel.update({ ...frame, frame: 2 });
    expect(actions.open).toBe(true);
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
    registry.registerValue({
      id: 'late.after-dispose',
      label: 'Late',
      read: () => 1,
    });
    expect(mount.childElementCount).toBe(0);
    mount.remove();
  });
});
