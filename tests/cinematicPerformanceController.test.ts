import { describe, expect, it, vi } from 'vitest';
import {
  CinematicPerformanceController,
  type CharacterPerformanceBinding,
  type CharacterPerformanceProfile,
  type CinematicPerformancePort,
  type CinematicPerformanceRequest,
} from '../src/cinematics/CinematicPerformanceController';
import {
  characterPerformanceProfiles,
  validateCharacterPerformanceProfiles,
} from '../src/cinematics/CharacterPerformanceProfiles';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';
import { characterDefinitions } from '../src/characters/characters';
import { npcCharacterDefinitions } from '../src/npcs/npcs';

interface FakeState {
  readonly animation: string;
  readonly facing: number | undefined;
  readonly phase: number;
}

function harness(options?: { readonly available?: readonly string[] }) {
  let state: FakeState = { animation: 'walk', facing: 0.4, phase: 0.63 };
  let actionOwners = 1;
  const available = new Set(
    options?.available ?? ['idle', 'interact', 'applaud'],
  );
  const port: CinematicPerformancePort<FakeState> = {
    captureGameplayState: vi.fn(() => ({ ...state })),
    restoreGameplayState: vi.fn((next: FakeState) => {
      state = { ...next };
    }),
    hasAnimation: vi.fn((id: string) => available.has(id)),
    playAnimation: vi.fn((binding: CharacterPerformanceBinding) => {
      state = { ...state, animation: binding.animationId, phase: 0 };
      actionOwners = 1;
      return true;
    }),
    holdAnimation: vi.fn(() => {
      state = { ...state, phase: 0.5 };
    }),
    releaseAnimation: vi.fn(() => undefined),
    setPerformanceFacingTarget: vi.fn((facing: number | undefined) => {
      state = { ...state, facing };
    }),
    getActionOwnerCount: () => actionOwners,
    getMixerOwnerCount: () => 1,
  };
  const profile: CharacterPerformanceProfile = {
    profileId: 'performance.test',
    characterId: 'test',
    intents: {
      'neutral-hold': { animationId: 'idle', playback: 'loop' },
      indicate: { animationId: 'interact', playback: 'one-shot' },
      applaud: { animationId: 'applaud', playback: 'one-shot' },
      approach: {
        animationId: 'idle',
        playback: 'loop',
        requiresMovementOwner: true,
      },
    },
  };
  return {
    controller: new CinematicPerformanceController('rook', profile, port),
    port,
    state: () => state,
  };
}

function request(
  update: Partial<CinematicPerformanceRequest> = {},
): CinematicPerformanceRequest {
  return {
    requestId: 'performance.request-1',
    cueId: 'cue-1',
    shotId: 'shot-1',
    intent: 'indicate',
    ...update,
  };
}

describe('CinematicPerformanceController', () => {
  it('validates every production profile and logical animation reference', () => {
    expect(
      validateCharacterPerformanceProfiles(characterPerformanceProfiles, [
        ...characterDefinitions,
        ...npcCharacterDefinitions,
      ]),
    ).toHaveLength(characterPerformanceProfiles.length);
  });

  it('preflights exact, explicit neutral fallback, movement ownership, and missing clips', () => {
    const { controller } = harness();
    expect(controller.preflightPerformance(request())).toMatchObject({
      ok: true,
      resolution: 'exact',
      resolvedAnimationId: 'interact',
    });
    expect(
      controller.preflightPerformance(request({ intent: 'listen' })),
    ).toMatchObject({ ok: false, reason: 'missing-performance' });
    expect(
      controller.preflightPerformance(
        request({ intent: 'listen', allowNeutralFallback: true }),
      ),
    ).toMatchObject({
      ok: true,
      resolution: 'neutral-fallback',
      resolvedAnimationId: 'idle',
    });
    expect(
      controller.preflightPerformance(request({ intent: 'approach' })),
    ).toMatchObject({ ok: false, reason: 'missing-movement-owner' });
  });

  it('arbitrates lower-priority movement without interrupting acting', () => {
    const { controller, port } = harness();
    expect(
      controller.startPerformance(request({ priority: 'acting' })).ok,
    ).toBe(true);
    expect(
      controller.startPerformance(
        request({
          requestId: 'movement',
          intent: 'approach',
          priority: 'movement',
          movementOwnerAvailable: true,
        }),
      ),
    ).toMatchObject({ ok: false, reason: 'priority-blocked' });
    expect(port.playAnimation).toHaveBeenCalledTimes(1);
  });

  it('ignores stale release callbacks after a request is superseded', () => {
    const { controller } = harness();
    expect(controller.startPerformance(request()).ok).toBe(true);
    expect(
      controller.startPerformance(
        request({ requestId: 'performance.request-2', cueId: 'cue-2' }),
      ).ok,
    ).toBe(true);
    expect(
      controller.releasePerformance('performance.request-1', 'completed'),
    ).toBe(false);
    expect(controller.getPerformanceSnapshot()).toMatchObject({
      state: 'performing',
      requestId: 'performance.request-2',
      generation: 2,
    });
  });

  it('starts, holds, releases idempotently, and exposes public-only snapshots', () => {
    const { controller } = harness();
    const started: string[] = [];
    controller.events.on('performance:started', ({ state }) =>
      started.push(state),
    );
    expect(
      controller.startPerformance(
        request({ targetParticipantId: 'mack', targetFacingYaw: 1.2 }),
      ).ok,
    ).toBe(true);
    expect(controller.getPerformanceSnapshot()).toMatchObject({
      participantId: 'rook',
      state: 'performing',
      requestedIntent: 'indicate',
      resolvedAnimationId: 'interact',
      targetParticipantId: 'mack',
      generation: 1,
      mixerOwnerCount: 1,
    });
    expect(started).toEqual(['performing']);
    expect(controller.holdPerformance('performance.request-1')).toBe(true);
    expect(controller.getPerformanceSnapshot().state).toBe('holding');
    expect(
      controller.releasePerformance('performance.request-1', 'completed'),
    ).toBe(true);
    expect(
      controller.releasePerformance('performance.request-1', 'completed'),
    ).toBe(false);
    expect(controller.getPerformanceSnapshot()).toMatchObject({
      state: 'gameplay',
      requestId: null,
      releaseReason: 'completed',
    });
    expect(JSON.stringify(controller.getPerformanceSnapshot())).not.toMatch(
      /AnimationAction|Object3D|uuid/,
    );
  });

  it('restores exact animation phase and facing across repeated cycles', () => {
    const { controller, state } = harness();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const before = { ...state() };
      const token = controller.capturePerformanceState();
      const id = `cycle-${cycle}`;
      expect(
        controller.startPerformance(
          request({ requestId: id, targetFacingYaw: 2.5 }),
        ).ok,
      ).toBe(true);
      controller.holdPerformance(id);
      controller.releasePerformance(id, cycle === 1 ? 'skipped' : 'failed');
      expect(controller.restorePerformance(token)).toBe(true);
      expect(state()).toEqual(before);
    }
    expect(controller.getPerformanceSnapshot()).toMatchObject({
      state: 'gameplay',
      generation: 3,
      restoreGeneration: 3,
      actionOwnerCount: 1,
      mixerOwnerCount: 1,
    });
  });

  it('disposes active state, tokens, events, and rejects later work', () => {
    const { controller, port } = harness();
    const token = controller.capturePerformanceState();
    controller.startPerformance(request());
    const restored = vi.fn();
    controller.events.on('performance:restored', restored);
    controller.dispose();
    expect(port.releaseAnimation).toHaveBeenCalledWith('disposed');
    expect(controller.getPerformanceSnapshot().state).toBe('disposed');
    expect(controller.restorePerformance(token)).toBe(false);
    expect(controller.preflightPerformance(request())).toMatchObject({
      ok: false,
      reason: 'disposed',
    });
    expect(restored).not.toHaveBeenCalled();
  });

  it('allows clapping only under the explicit applaud intent', () => {
    const character = {
      id: 'test',
      displayName: 'Test',
      fallback: 'placeholder',
      animations: {
        idle: { clipNames: ['Idle'] },
        applaud: { clipNames: ['Man_Clapping'] },
      },
    } satisfies CharacterDefinition;
    const valid = {
      profileId: 'valid',
      characterId: 'test',
      intents: {
        applaud: { animationId: 'applaud', playback: 'one-shot' },
      },
    } satisfies CharacterPerformanceProfile;
    expect(
      validateCharacterPerformanceProfiles([valid], [character]),
    ).toHaveLength(1);
    const invalid = {
      ...valid,
      profileId: 'invalid',
      intents: {
        listen: { animationId: 'applaud', playback: 'one-shot' },
      },
    } satisfies CharacterPerformanceProfile;
    expect(() =>
      validateCharacterPerformanceProfiles([invalid], [character]),
    ).toThrow('may map applause only to "applaud"');
  });
});
