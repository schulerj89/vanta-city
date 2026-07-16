import { DebugRegistry, debugSections } from '../src/debug/DebugRegistry';
import type { DebugRegistryChange } from '../src/debug/DebugRegistry';
import { DebugVisualHelpers } from '../src/debug/DebugVisualHelpers';

describe('DebugRegistry', () => {
  it('registers live values and unregisters them without owning source state', () => {
    const debug = new DebugRegistry();
    let frame = 1;
    const unregister = debug.registerValue({
      id: 'test.frame',
      label: 'Frame',
      read: () => frame,
    });

    expect(debug.readValues()).toMatchObject([{ id: 'test.frame', value: 1 }]);
    frame = 2;
    expect(debug.readValues()).toMatchObject([{ id: 'test.frame', value: 2 }]);

    unregister();
    expect(debug.readValues()).toEqual([]);
  });

  it('executes commands with arguments and drives toggle callbacks', async () => {
    const debug = new DebugRegistry();
    const changed = vi.fn();
    const command = vi.fn();
    debug.registerToggle({
      id: 'test.enabled',
      label: 'Enabled',
      onChange: changed,
    });
    debug.registerCommand({
      id: 'test.run',
      label: 'Run',
      run: command,
    });

    debug.setToggle('test.enabled', true);
    await debug.executeCommand('test.run', 'target');

    expect(debug.isToggleEnabled('test.enabled')).toBe(true);
    expect(changed).toHaveBeenCalledWith(true);
    expect(command).toHaveBeenCalledWith('target');
  });

  it('rejects duplicate and unknown registrations', async () => {
    const debug = new DebugRegistry();
    debug.registerValue({ id: 'same', label: 'Value', read: () => 1 });

    expect(() =>
      debug.registerCommand({ id: 'same', label: 'Command', run: () => {} }),
    ).toThrow('already exists');
    expect(() => debug.toggle('missing')).toThrow('Unknown debug toggle');
    await expect(debug.executeCommand('missing')).rejects.toThrow(
      'Unknown debug command',
    );
  });

  it('uses passive and control defaults and distinguishes structural and toggle changes', () => {
    const debug = new DebugRegistry();
    const changes = vi.fn<(change: DebugRegistryChange) => void>();
    debug.subscribe(changes);
    debug.registerValue({ id: 'test.value', label: 'Value', read: () => 1 });
    const unregister = debug.registerToggle({
      id: 'test.toggle',
      label: 'Test',
    });

    expect(debug.readValues()[0]?.group).toBe(debugSections.runtime);
    expect(debug.listToggles()[0]?.group).toBe(debugSections.actions);
    debug.setToggle('test.toggle', true);
    unregister();

    expect(changes.mock.calls.map(([change]) => change)).toEqual([
      { kind: 'structure', id: 'test.value' },
      { kind: 'structure', id: 'test.toggle' },
      { kind: 'toggle', id: 'test.toggle' },
      { kind: 'structure', id: 'test.toggle' },
    ]);
  });
});

describe('DebugVisualHelpers', () => {
  it('connects registered providers to generic helper toggles', () => {
    const debug = new DebugRegistry();
    const visualHelpers = new DebugVisualHelpers(debug);
    const setVisible = vi.fn();
    const unregister = visualHelpers.register('collision', { setVisible });

    visualHelpers.toggle('collision');
    const lateProvider = vi.fn();
    const unregisterLate = visualHelpers.register('collision', {
      setVisible: lateProvider,
    });
    unregisterLate();
    unregister();

    expect(setVisible.mock.calls).toEqual([[false], [true], [false]]);
    expect(lateProvider.mock.calls).toEqual([[true], [false]]);
    visualHelpers.dispose();
  });
});
