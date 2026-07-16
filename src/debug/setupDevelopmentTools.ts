import type { GameSystem } from '../core/lifecycle';
import type { GameRuntime } from '../game/GameRuntime';
import type { InputReader } from '../input/InputSystem';
import { DebugPanelSystem } from './DebugPanelSystem';
import { DebugRegistry } from './DebugRegistry';
import { DebugVisualHelpers } from './DebugVisualHelpers';
import type { StandardVisualHelper } from './DebugVisualHelpers';
import { standardVisualHelpers } from './DebugVisualHelpers';
import { RuntimeErrorReporter } from './RuntimeErrorReporter';

export interface DevelopmentTools {
  readonly debug: DebugRegistry;
  readonly visualHelpers: DebugVisualHelpers;
  readonly systems: readonly GameSystem[];
  readonly errors: RuntimeErrorReporter;
  dispose(): void;
}

export function setupDevelopmentTools(
  mount: HTMLElement,
  runtime: GameRuntime,
  input: InputReader,
  initiallyVisible: boolean,
): DevelopmentTools {
  const debug = new DebugRegistry();
  const visualHelpers = new DebugVisualHelpers(debug);
  const errors = new RuntimeErrorReporter(debug);

  debug.registerValue({
    id: 'runtime.state',
    label: 'State',
    read: () => runtime.state.current,
  });
  debug.registerCommand({
    id: 'runtime.pause-resume',
    label: 'Pause / resume',
    group: 'Actions',
    run: () => {
      if (runtime.state.current === 'paused') runtime.resume();
      else runtime.pause();
    },
  });
  debug.registerCommand({
    id: 'level.reload',
    label: 'Reload level',
    group: 'Actions',
    run: () => window.location.reload(),
  });
  debug.registerCommand({
    id: 'helpers.toggle',
    label: 'Toggle helper',
    group: 'Actions',
    argumentLabel: 'collision, triggers, entityIds…',
    run: (argument) => {
      if (!argument || !(argument in standardVisualHelpers)) {
        throw new Error(
          `Expected helper name: ${Object.keys(standardVisualHelpers).join(', ')}`,
        );
      }
      visualHelpers.toggle(argument as StandardVisualHelper);
    },
  });

  const panel = new DebugPanelSystem(
    mount,
    input,
    debug,
    (scope, error) => errors.report(scope, error),
    initiallyVisible,
  );

  return {
    debug,
    visualHelpers,
    systems: [errors, panel],
    errors,
    dispose: () => visualHelpers.dispose(),
  };
}
