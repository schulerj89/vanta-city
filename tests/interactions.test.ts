import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';
import type { InputReader } from '../src/input/InputSystem';
import type { Interactable } from '../src/interactions/Interactable';
import { InteractionSystem } from '../src/interactions/InteractionSystem';
import { InteractionPromptSystem } from '../src/ui/InteractionPromptSystem';
import { StaticCollisionWorld } from '../src/physics/CollisionWorld';
import type { WorldPose, WorldPoseSource } from '../src/world/Spatial';

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
  readonly collision: StaticCollisionWorld;
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
  const collision = visibility ?? new StaticCollisionWorld();
  const system = new InteractionSystem(input, state, player, collision);
  system.init({ events });
  return { collision, events, input, pose, state, system };
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
      target('near-off-axis', {
        location: { x: 0.8, y: 0, z: 1 },
        range: 1.6,
      }),
    );
    harness.system.register(
      target('centered', {
        location: { x: 0, y: 0, z: 1.2 },
        range: 1.5,
      }),
    );
    harness.system.register(
      target('priority', {
        location: { x: 0.6, y: 0, z: 1.8 },
        priority: 1,
        range: 1.6,
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

  it('holds the current target until a challenger clears the score margin', () => {
    const harness = createHarness();
    const challenger = { x: 0.35, y: 0, z: 1.1 };
    harness.system.register(
      target('anchor', { location: { x: 0, y: 0, z: 1 } }),
    );
    harness.system.register(
      target('challenger', { location: () => challenger }),
    );
    harness.system.update();
    expect(harness.system.getActiveTarget()?.id).toBe('anchor');

    challenger.x = 0;
    challenger.z = 0.96;
    harness.system.update();
    expect(harness.system.getActiveTarget()?.id).toBe('anchor');
    expect(harness.system.getDebugSnapshot()).toMatchObject({
      challengerId: 'challenger',
      selectionDecision: 'held-current',
    });

    challenger.z = 0.5;
    harness.system.update();
    expect(harness.system.getActiveTarget()?.id).toBe('challenger');
    expect(harness.system.getDebugSnapshot().selectionDecision).toBe(
      'switched',
    );
  });

  it('uses profile surface boundaries and explicit overrides deterministically', () => {
    const harness = createHarness();
    harness.system.register(
      target('talk-boundary', {
        location: { x: 0, y: 0, z: 0 },
        rangeProfile: 'talk',
      }),
    );
    harness.pose.current = {
      position: { x: 0, y: 0, z: -1.86 },
      forward: { x: 0, y: 0, z: 1 },
      radius: 0.38,
    };
    harness.system.update();
    expect(harness.system.getActiveTarget()?.id).toBe('talk-boundary');
    const talkBoundary = harness.system.getDebugSnapshot().targets[0]!;
    expect(talkBoundary).toMatchObject({
      rangeProfile: 'talk',
      rangeSource: 'profile',
      range: 1.1,
      targetRadius: 0.38,
    });
    expect(talkBoundary.activationRadius).toBeCloseTo(1.86);
    expect(talkBoundary.distance).toBeCloseTo(1.1);

    harness.pose.current = {
      ...harness.pose.current,
      position: { x: 0, y: 0, z: -1.861 },
    };
    harness.system.update();
    expect(harness.system.getActiveTarget()).toBeUndefined();
    expect(harness.system.getDebugSnapshot().targets[0]).toMatchObject({
      rejectionReason: 'out-of-range',
    });

    harness.system.unregister('talk-boundary');
    harness.system.register(
      target('wide-sign', {
        location: { x: 0, y: 0, z: 0 },
        rangeProfile: 'sign',
        range: 1.2,
      }),
    );
    harness.pose.current = {
      ...harness.pose.current,
      position: { x: 0, y: 0, z: -1.58 },
    };
    harness.system.update();
    expect(harness.system.getActiveTarget()?.id).toBe('wide-sign');
    const wideSign = harness.system.getDebugSnapshot().targets[0]!;
    expect(wideSign).toMatchObject({
      rangeProfile: 'sign',
      rangeSource: 'override',
      range: 1.2,
    });
    expect(wideSign.activationRadius).toBeCloseTo(1.58);
  });

  it('uses collision-world LOS and reports the blocking collider', () => {
    const harness = createHarness();
    harness.collision.addDefinition({
      id: 'wall',
      position: [0, 1.2, 1],
      size: [1, 2, 0.2],
    });
    harness.system.register(
      target('hidden', { location: { x: 0, y: 0, z: 2 }, range: 2 }),
    );
    harness.system.register(
      target('owned-collider', {
        location: { x: 0, y: 0, z: 2 },
        range: 2,
        collisionIgnoreIds: ['wall'],
      }),
    );

    harness.system.update();

    expect(harness.system.getActiveTarget()?.id).toBe('owned-collider');
    expect(
      harness.system
        .getDebugSnapshot()
        .targets.find(({ id }) => id === 'hidden'),
    ).toMatchObject({
      lineOfSight: 'blocked',
      blockerId: 'wall',
      rejectionReason: 'occluded',
    });
  });

  it('adds and clears a prompt as the player enters and leaves range', () => {
    const harness = createHarness();
    harness.system.register(target('sign', { range: 1.5 }));
    const mount = document.createElement('div');
    const prompt = new InteractionPromptSystem(mount, harness.system);
    prompt.init();

    harness.system.update();
    expect(mount.textContent).toBe('[G / X] Use sign');
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

  it('projects a target that was selected before the prompt mounts', () => {
    const harness = createHarness();
    harness.system.register(target('vehicle', { range: 1.5 }));
    harness.system.update();
    const mount = document.createElement('div');
    const prompt = new InteractionPromptSystem(mount, harness.system);

    prompt.init();

    expect(mount.textContent).toBe('[G / X] Use vehicle');
    expect(mount.querySelector('.interaction-prompt')).not.toHaveProperty(
      'hidden',
      true,
    );
    prompt.dispose();
  });

  it('keeps prompt visibility coherent across occlusion and removal', () => {
    const harness = createHarness();
    harness.system.register(
      target('terminal', { location: { x: 0, y: 0, z: 2 }, range: 2 }),
    );
    const mount = document.createElement('div');
    const prompt = new InteractionPromptSystem(mount, harness.system);
    prompt.init();
    harness.system.update();
    expect(mount.textContent).toBe('[G / X] Use terminal');

    harness.collision.addDefinition({
      id: 'moving-obstruction',
      position: [0, 1.2, 1],
      size: [1, 2, 0.2],
    });
    harness.system.update();
    expect(mount.querySelector('.interaction-prompt')).toHaveProperty(
      'hidden',
      true,
    );

    harness.collision.remove('moving-obstruction');
    harness.system.update();
    expect(mount.textContent).toBe('[G / X] Use terminal');
    harness.system.unregister('terminal');
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
    [
      'occluded',
      (harness: Harness) => {
        harness.collision.addDefinition({
          id: 'sudden-wall',
          position: [0, 1.2, 0.5],
          size: [1, 2, 0.2],
        });
        harness.system.update();
      },
    ],
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

  it('clears and restores the prompt across pause without stale input', () => {
    const harness = createHarness();
    harness.system.register(target('talk'));
    const mount = document.createElement('div');
    const prompt = new InteractionPromptSystem(mount, harness.system);
    prompt.init();
    harness.system.update();
    expect(mount.querySelector('.interaction-prompt')).not.toHaveProperty(
      'hidden',
      true,
    );

    harness.state.transition('paused');
    expect(mount.querySelector('.interaction-prompt')).toHaveProperty(
      'hidden',
      true,
    );
    harness.input.pressed = true;
    harness.state.transition('playing');
    expect(harness.system.getActiveTarget()?.id).toBe('talk');
    harness.system.update();
    expect(harness.system.getActiveTarget()?.id).toBe('talk');
    prompt.dispose();
  });
});
