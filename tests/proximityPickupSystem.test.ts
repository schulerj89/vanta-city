import type { GameContext } from '../src/game/GameRuntime';
import { ProximityPickupSystem } from '../src/pickups/ProximityPickupSystem';
import type { WorldPose } from '../src/world/Spatial';

describe('ProximityPickupSystem', () => {
  it('collects at the exact capsule edge and across a high-movement sweep', () => {
    let pose: WorldPose = poseAt(0);
    const state = { current: 'playing' };
    const system = new ProximityPickupSystem({ getWorldPose: () => pose });
    system.init({ state } as GameContext);
    const edgeCollect = vi.fn(() => true);
    system.register({
      id: 'edge',
      position: { x: 0.88, y: 0, z: 0 },
      radius: 0.5,
      payload: 'edge-payload',
      collect: (payload) => {
        expect(payload).toBe('edge-payload');
        return edgeCollect();
      },
    });
    system.update();
    expect(edgeCollect).toHaveBeenCalledOnce();

    const sweptCollect = vi.fn(() => true);
    system.register({
      id: 'swept',
      position: { x: 5, y: 0, z: 0 },
      radius: 0.2,
      payload: undefined,
      collect: sweptCollect,
    });
    pose = poseAt(10);
    system.update();
    expect(sweptCollect).toHaveBeenCalledOnce();
    expect(system.getSnapshot()).toMatchObject({ count: 0, collectedCount: 2 });
  });

  it('tracks movement while paused/dialogue and only collects while playing', () => {
    let pose: WorldPose = poseAt(0);
    const state = { current: 'paused' };
    const system = new ProximityPickupSystem({ getWorldPose: () => pose });
    system.init({ state } as GameContext);
    const collect = vi.fn(() => true);
    system.register({
      id: 'gated',
      position: { x: 5, y: 0, z: 0 },
      radius: 0.3,
      payload: undefined,
      collect,
    });
    pose = poseAt(10);
    system.update();
    state.current = 'dialogue';
    pose = poseAt(5);
    system.update();
    expect(collect).not.toHaveBeenCalled();
    state.current = 'playing';
    system.update();
    expect(collect).toHaveBeenCalledOnce();
  });

  it('is one-shot atomic, supports rejection, removal, and complete disposal', () => {
    const pose = poseAt(0);
    const system = new ProximityPickupSystem({ getWorldPose: () => pose });
    system.init({ state: { current: 'playing' } } as GameContext);
    const collect = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const remove = system.register({
      id: 'retry',
      position: { x: 0, y: 0, z: 0 },
      radius: 0.2,
      payload: undefined,
      collect,
    });
    system.update();
    system.update();
    system.update();
    expect(collect).toHaveBeenCalledTimes(2);
    expect(system.getSnapshot().collectedCount).toBe(1);
    expect(() => remove()).not.toThrow();

    const removedCollect = vi.fn(() => true);
    const unregister = system.register({
      id: 'removed',
      position: { x: 0, y: 0, z: 0 },
      radius: 0.2,
      payload: undefined,
      collect: removedCollect,
    });
    unregister();
    system.update();
    expect(removedCollect).not.toHaveBeenCalled();
    system.dispose();
    expect(system.getVisualization().parent).toBeNull();
    expect(() =>
      system.register({
        id: 'late',
        position: { x: 0, y: 0, z: 0 },
        radius: 1,
        payload: undefined,
        collect: () => true,
      }),
    ).toThrow(/disposed/);
  });
});

function poseAt(x: number): WorldPose {
  return {
    position: { x, y: 0, z: 0 },
    forward: { x: 1, y: 0, z: 0 },
    radius: 0.38,
  };
}
