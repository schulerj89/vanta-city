import type { GameSystem } from '../core/lifecycle';
import type { DebugRegistry } from '../debug/DebugRegistry';
import type { StaticCollisionWorld } from '../physics/CollisionWorld';
import type { StaticColliderDefinition } from '../physics/StaticCollider';
import type { InteractionSystem } from './InteractionSystem';

const OCCLUDED_BLOCKER_ID = 'c.debug-interaction-occluded';
const SELECTED_BLOCKER_ID = 'c.debug-interaction-selected';

/** Development-only deterministic fixture for interaction browser coverage. */
export class InteractionReliabilityScenario implements GameSystem {
  public readonly id = 'interaction-reliability-scenario';

  private readonly unregister: (() => void)[] = [];
  private challengerZ = -9.5;
  private selectedBlocked = false;
  private activations = 0;

  public constructor(
    private readonly interactions: InteractionSystem,
    private readonly collision: StaticCollisionWorld,
    private readonly debug: DebugRegistry,
  ) {}

  public init(): void {
    this.collision.addDefinition(
      box(OCCLUDED_BLOCKER_ID, [0.35, 1.2, -10.35], [0.16, 2.4, 0.16]),
    );
    this.unregister.push(
      this.interactions.register({
        id: 'interaction.debug.anchor',
        prompt: 'Use stable target',
        location: { x: -0.15, y: 0.15, z: -10 },
        rangeProfile: 'use',
        interact: () => {
          this.activations += 1;
        },
      }),
      this.interactions.register({
        id: 'interaction.debug.challenger',
        prompt: 'Use challenger switch',
        location: () => ({ x: 0.35, y: 0.15, z: this.challengerZ }),
        rangeProfile: 'sign',
        interact: () => {
          this.activations += 1;
        },
      }),
      this.interactions.register({
        id: 'interaction.debug.occluded',
        prompt: 'Hidden target',
        location: { x: 0.7, y: 0.15, z: -9.9 },
        rangeProfile: 'inspect',
        interact: () => {
          this.activations += 1;
        },
      }),
      this.debug.registerCommand({
        id: 'interaction-scenario.challenge',
        label: 'Challenge selected interaction',
        run: () => {
          this.challengerZ = -10;
        },
      }),
      this.debug.registerToggle({
        id: 'interaction-scenario.obstruct-selected',
        label: 'Obstruct selected interaction',
        initialValue: false,
        onChange: (enabled) => this.setSelectedBlocked(enabled),
      }),
      this.debug.registerValue({
        id: 'interaction-scenario.activations',
        label: 'Scenario activations',
        read: () => this.activations,
      }),
    );
  }

  public dispose(): void {
    for (const unregister of this.unregister.splice(0).reverse()) unregister();
    this.collision.remove(OCCLUDED_BLOCKER_ID);
    this.collision.remove(SELECTED_BLOCKER_ID);
  }

  private setSelectedBlocked(enabled: boolean): void {
    if (enabled === this.selectedBlocked) return;
    this.selectedBlocked = enabled;
    if (enabled) {
      this.collision.addDefinition(
        box(SELECTED_BLOCKER_ID, [-0.075, 1.2, -10.4], [0.18, 2.4, 0.18]),
      );
    } else {
      this.collision.remove(SELECTED_BLOCKER_ID);
    }
  }
}

function box(
  id: string,
  position: readonly [number, number, number],
  size: readonly [number, number, number],
): StaticColliderDefinition {
  return { id, position, size, tags: ['debug', 'interaction'] };
}
