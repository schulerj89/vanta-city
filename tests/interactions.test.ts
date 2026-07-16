import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';
import type { InputReader } from '../src/input/InputSystem';
import type { Interactable } from '../src/interactions/Interactable';
import { InteractionSystem } from '../src/interactions/InteractionSystem';
import { InteractionPromptSystem } from '../src/ui/InteractionPromptSystem';
import type { WorldPose, WorldPoseSource } from '../src/world/Spatial';
import { StaticCollisionWorld } from '../src/physics/CollisionWorld';

class TestInput implements InputReader {
  public pressed = false;

  public isDown(): boolean {
    return false;
  }

  public wasPressed(): boolean {
    const pressed = this.pressed;
    this.pressed = false;
    return pressed;
  }

  public wasReleased(): boolean {
    return false;
  }
}

interface Harness {
  readonly events: EventBus<StateEvents>;
  readonly input: TestInput;
  readonly pose: { current: WorldPose | undefined };
  readonly state: GameStateMachine;
  readonly system: InteractionSystem;
}

function createHarness(visibility?: StaticCollisionWorld): Harness {
  const events = new EventBus<StateEvents>();
  const state = new GameStateMachine(events);
  state.transition('playing');
  const input = new TestInput();
  const pose = {
    current: {
      position: { x: 0, y: 0, z: 0 },
      forward: { x: 0, y: 0, z: 1 },
    } satisfies WorldPose as WorldPose | undefined,
  };
  const player: WorldPoseSource = {
    getWorldPose: () => pose.current,
  };
  const system = new InteractionSystem(input, state, player, visibility);
  system.init({ events });
  return { events, input, pose, state, system };
}

function target(
  id: string,
  overrides: Partial<Interactable> = {},
): Interactable {
  return {
    id,
    prompt: `Use ${id}`,
    location: { x: 0, y: 0, z: 1 },
    interact: vi.fn(),
    ...overrides,
  };
}

describe('InteractionSystem', () => {
  it('uses the shared collision geometry to reject occluded candidates', () => {
    const collision = new StaticCollisionWorld();
    collision.addDefinition({
      id: 'supporting-floor',
      position: [0, -0.1, 1],
      size: [4, 0.2, 4],
      tags: ['walkable'],
    });
    collision.addDefinition({
      id: 'angled-divider',
      position: [0, 0.8, 1],
      size: [2, 1.6, 0.2],
      rotation: [0, Math.PI / 6, 0],
    });
    const harness = createHarness(collision);
    harness.system.register(
      target('behind-divider', { location: { x: 0, y: 0.8, z: 2 } }),
    );

    harness.system.update();

    expect(harness.system.getActiveTarget()).toBeUndefined();
    expect(harness.system.getDebugSnapshot().candidates).toEqual([]);
  });

  it('ranks overlapping candidates and exposes only the best target', () => {
    const harness = createHarness();
    harness.system.register(
      target('near-off-axis', { location: { x: 0.8, y: 0, z: 1 } }),
    );
    harness.system.register(
      target('centered', { location: { x: 0, y: 0, z: 1.2 } }),
    );
    harness.system.register(
      target('priority', {
        location: { x: 0.6, y: 0, z: 1.8 },
        priority: 1,
      }),
    );

    harness.system.update();

    expect(harness.system.getActiveTarget()?.id).toBe('priority');
    expect(
      harness.system
        .getDebugSnapshot()
        .candidates.map(({ target }) => target.id),
    ).toEqual(['priority', 'centered', 'near-off-axis']);
  });

  it('adds and clears a prompt as the player enters and leaves range', () => {
    const harness = createHarness();
    harness.system.register(target('sign', { range: 1.5 }));
    const mount = document.createElement('div');
    const prompt = new InteractionPromptSystem(mount, harness.system);
    prompt.init();

    harness.system.update();
    expect(mount.textContent).toBe('[G] Use sign');
    expect(mount.querySelector('.interaction-prompt')).not.toHaveProperty(
      'hidden',
      true,
    );

    harness.pose.current = {
      position: { x: 0, y: 0, z: -2 },
      forward: { x: 0, y: 0, z: 1 },
    };
    harness.system.update();
    expect(mount.querySelector('.interaction-prompt')).toHaveProperty(
      'hidden',
      true,
    );
    prompt.dispose();
  });

  it('honors enabled, game-state, predicate, and one-time availability', () => {
    const harness = createHarness();
    let predicateAllows = false;
    const interact = vi.fn();
    harness.system.register(
      target('restricted', {
        enabled: false,
        repeatable: false,
        isAvailable: () => predicateAllows,
        interact,
      }),
    );

    harness.system.update();
    expect(harness.system.getActiveTarget()).toBeUndefined();
    harness.system.setEnabled('restricted', true);
    expect(harness.system.getActiveTarget()).toBeUndefined();
    predicateAllows = true;
    harness.system.update();
    expect(harness.system.getActiveTarget()?.id).toBe('restricted');

    harness.input.pressed = true;
    harness.system.update();
    expect(interact).toHaveBeenCalledOnce();
    expect(harness.system.getActiveTarget()).toBeUndefined();

    harness.state.transition('paused');
    harness.system.register(
      target('playing-only', { requiredStates: ['playing'] }),
    );
    harness.system.update();
    expect(harness.system.getActiveTarget()).toBeUndefined();
  });

  it.each([
    [
      'out-of-range',
      (harness: Harness) => {
        harness.pose.current = {
          position: { x: 0, y: 0, z: -5 },
          forward: { x: 0, y: 0, z: 1 },
        };
        harness.system.update();
      },
    ],
    ['game-state', (harness: Harness) => harness.state.transition('paused')],
    [
      'disabled',
      (harness: Harness) => harness.system.setEnabled('long', false),
    ],
    ['target-removed', (harness: Harness) => harness.system.unregister('long')],
  ] as const)(
    'cancels an asynchronous interaction when %s',
    (reason, cancel) => {
      const harness = createHarness();
      let signal: AbortSignal | undefined;
      harness.system.register(
        target('long', {
          interact: (context) => {
            signal = context.signal;
            return new Promise<void>(() => undefined);
          },
        }),
      );
      const cancelled = vi.fn();
      harness.system.events.on('interaction:cancelled', cancelled);
      harness.system.update();
      harness.input.pressed = true;
      harness.system.update();

      cancel(harness);

      expect(signal?.aborted).toBe(true);
      expect(cancelled).toHaveBeenCalledWith(
        expect.objectContaining({
          reason,
          target: { id: 'long', prompt: 'Use long' },
        }),
      );
    },
  );

  it('emits started and completed around asynchronous completion', async () => {
    const harness = createHarness();
    let finish: (() => void) | undefined;
    harness.system.register(
      target('async', {
        interact: () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      }),
    );
    const facts: string[] = [];
    harness.system.events.on('interaction:started', () =>
      facts.push('started'),
    );
    harness.system.events.on('interaction:completed', () =>
      facts.push('completed'),
    );
    harness.system.update();
    harness.input.pressed = true;
    harness.system.update();
    expect(facts).toEqual(['started']);

    finish?.();
    await Promise.resolve();
    expect(facts).toEqual(['started', 'completed']);
  });
});
