import type { SandboxContext, SandboxScenario } from './SandboxScenario';
import { foundationSandbox } from './scenarios/foundationSandbox';

const scenarios = new Map<string, SandboxScenario>([
  [foundationSandbox.id, foundationSandbox],
]);

export function loadSandboxScenario(
  id: string,
  context: SandboxContext,
): ReturnType<SandboxScenario['create']> {
  const scenario = scenarios.get(id);
  if (!scenario) {
    throw new Error(
      `Unknown sandbox "${id}". Available: ${[...scenarios.keys()].join(', ')}`,
    );
  }
  document.title = `${scenario.title} · Vanta City Sandbox`;
  return scenario.create(context);
}
