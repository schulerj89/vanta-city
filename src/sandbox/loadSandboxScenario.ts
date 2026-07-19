import type { SandboxContext, SandboxScenario } from './SandboxScenario';
import { characterAnimationLab } from './scenarios/characterAnimationLab';
import { foundationSandbox } from './scenarios/foundationSandbox';
import { cameraCompositionLab } from './scenarios/cameraCompositionLab';
import { buildingVisualLab } from './scenarios/buildingVisualLab';
import { uiCompositionLab } from './scenarios/uiCompositionLab';
import { northbarLocationLab } from './scenarios/northbarLocationLab';

const scenarios = new Map<string, SandboxScenario>([
  [foundationSandbox.id, foundationSandbox],
  [cameraCompositionLab.id, cameraCompositionLab],
  [characterAnimationLab.id, characterAnimationLab],
  [buildingVisualLab.id, buildingVisualLab],
  [uiCompositionLab.id, uiCompositionLab],
  [northbarLocationLab.id, northbarLocationLab],
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
