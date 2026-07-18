import { EventBus } from '../src/core/events';
import type { StateEvents } from '../src/core/gameState';
import type { GameContext } from '../src/game/GameRuntime';
import type {
  VehicleEvents,
  VehicleSnapshot,
} from '../src/vehicles/VehicleControllerSystem';
import { AudioCatalog } from '../src/audio/AudioCatalog';
import { AudioPlaybackCoordinator } from '../src/audio/AudioPlaybackCoordinator';
import { AudioPreferenceStore } from '../src/audio/AudioPreferences';

const tracks = new AudioCatalog([
  {
    id: 'theme.test',
    title: 'Theme',
    channel: 'theme',
    role: 'music',
    url: '/assets/audio/theme.mp3',
    mimeType: 'audio/mpeg',
    loop: true,
    license: 'original-project-owned',
  },
  {
    id: 'radio.break',
    title: 'Radio Break',
    channel: 'radio',
    role: 'station-break',
    url: '/assets/audio/radio-break.mp3',
    mimeType: 'audio/mpeg',
    loop: false,
    license: 'original-project-owned',
  },
  {
    id: 'radio.test',
    title: 'Radio',
    channel: 'radio',
    role: 'music',
    url: '/assets/audio/radio.mp3',
    mimeType: 'audio/mpeg',
    loop: false,
    license: 'original-project-owned',
  },
]);

class MockNode {
  public connect = vi.fn();
  public disconnect = vi.fn();
}

class MockSource extends MockNode {
  public buffer: AudioBuffer | null = null;
  public loop = false;
  public onended: (() => void) | null = null;
  public start = vi.fn();
  public stop = vi.fn();
}

class MockAudioContext {
  public state: AudioContextState = 'running';
  public currentTime = 10;
  public destination = {} as AudioDestinationNode;
  public sources: MockSource[] = [];
  public createGain(): GainNode {
    return Object.assign(new MockNode(), {
      gain: { value: 1 },
      channelCount: 2,
      channelCountMode: 'max',
    }) as unknown as GainNode;
  }
  public createBufferSource(): AudioBufferSourceNode {
    const source = new MockSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
  public async decodeAudioData(): Promise<AudioBuffer> {
    return { duration: 60 } as AudioBuffer;
  }
  public async resume(): Promise<void> {
    this.state = 'running';
  }
  public async close(): Promise<void> {
    this.state = 'closed';
  }
}

function vehicleSnapshot(mode: 'on-foot' | 'driving'): VehicleSnapshot {
  return {
    mode,
    vehicleId: 'test',
    vehicleLabel: 'Test',
    occupantId: mode === 'driving' ? 'player' : undefined,
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    speed: 0,
    grounded: true,
    groundColliderId: 'floor',
    blocked: false,
    blockedBy: undefined,
    exitAvailable: true,
    recoveryCount: 0,
    ownership: {
      movement: mode === 'driving' ? 'vehicle' : 'player',
      camera: mode === 'driving' ? 'vehicle-focus' : 'gameplay',
      input: mode === 'driving' ? 'vehicle' : 'on-foot',
    },
  };
}

function harness(fail = false) {
  const context = new MockAudioContext();
  const vehicleEvents = new EventBus<VehicleEvents>();
  let currentVehicle = vehicleSnapshot('on-foot');
  const vehicle = {
    events: vehicleEvents,
    getSnapshot: () => currentVehicle,
  };
  const stateEvents = new EventBus<StateEvents>();
  const game = {
    events: stateEvents,
    state: { current: 'booting' },
    input: {
      isDown: () => false,
      wasPressed: () => false,
      wasReleased: () => false,
    },
  } as unknown as GameContext;
  const coordinator = new AudioPlaybackCoordinator(
    tracks,
    new AudioPreferenceStore(),
    vehicle as never,
    () => context,
    async () => {
      if (fail)
        return {
          ok: false,
          status: 404,
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    },
  );
  coordinator.init(game);
  return {
    context,
    coordinator,
    transition(
      from: StateEvents['game-state:changed']['from'],
      to: StateEvents['game-state:changed']['to'],
    ) {
      (game.state as { current: string }).current = to;
      stateEvents.emit('game-state:changed', { from, to });
    },
    vehicle(mode: 'on-foot' | 'driving') {
      currentVehicle = vehicleSnapshot(mode);
      vehicleEvents.emit(
        mode === 'driving' ? 'entered' : 'exited',
        currentVehicle,
      );
    },
  };
}

describe('AudioPlaybackCoordinator', () => {
  it('loads local audio and deterministically swaps theme/radio across vehicle and state interruptions', async () => {
    const h = harness();
    h.transition('booting', 'playing');
    await vi.waitFor(() =>
      expect(h.coordinator.getSnapshot().activeTrackId).toBe('theme.test'),
    );
    h.context.currentTime = 15;
    h.vehicle('driving');
    await vi.waitFor(() =>
      expect(h.coordinator.getSnapshot().activeTrackId).toBe('radio.break'),
    );
    expect(h.coordinator.getSnapshot().pausedOffsets['theme.test']).toBe(5);
    h.transition('playing', 'paused');
    expect(h.coordinator.getSnapshot().liveSources).toBe(0);
    h.transition('paused', 'playing');
    await vi.waitFor(() =>
      expect(h.coordinator.getSnapshot().activeTrackId).toBe('radio.break'),
    );
    h.vehicle('on-foot');
    await vi.waitFor(() =>
      expect(h.coordinator.getSnapshot().activeTrackId).toBe('theme.test'),
    );
    expect(h.coordinator.getSnapshot()).toMatchObject({
      cachedBuffers: 2,
      liveSources: 1,
      lastError: undefined,
    });
  });

  it('advances non-looping radio entries in authoritative catalog order', async () => {
    const h = harness();
    h.transition('booting', 'playing');
    await vi.waitFor(() =>
      expect(h.coordinator.getSnapshot().activeTrackId).toBe('theme.test'),
    );
    h.vehicle('driving');
    await vi.waitFor(() =>
      expect(h.coordinator.getSnapshot().activeTrackId).toBe('radio.break'),
    );

    h.context.sources.at(-1)?.onended?.();

    await vi.waitFor(() =>
      expect(h.coordinator.getSnapshot().activeTrackId).toBe('radio.test'),
    );
    expect(
      h.coordinator.getSnapshot().pausedOffsets['radio.break'],
    ).toBeUndefined();
  });

  it('does not stack sources through repeated lifecycle cycles and disposes context/buffers/listeners', async () => {
    const h = harness();
    h.transition('booting', 'playing');
    await vi.waitFor(() =>
      expect(h.coordinator.getSnapshot().liveSources).toBe(1),
    );
    for (let index = 0; index < 3; index += 1) {
      h.vehicle('driving');
      await vi.waitFor(() =>
        expect(h.coordinator.getSnapshot().activeChannel).toBe('radio'),
      );
      h.vehicle('on-foot');
      await vi.waitFor(() =>
        expect(h.coordinator.getSnapshot().activeChannel).toBe('theme'),
      );
      expect(h.coordinator.getSnapshot().liveSources).toBe(1);
    }
    h.coordinator.dispose();
    await vi.waitFor(() =>
      expect(h.coordinator.getSnapshot()).toMatchObject({
        contextState: 'disposed',
        liveSources: 0,
        cachedBuffers: 0,
      }),
    );
  });

  it('reports local load failure without retaining a playback node', async () => {
    const h = harness(true);
    h.transition('booting', 'playing');
    await vi.waitFor(() =>
      expect(h.coordinator.getSnapshot().loadState).toBe('error'),
    );
    expect(h.coordinator.getSnapshot()).toMatchObject({
      liveSources: 0,
      cachedBuffers: 0,
      lastError: 'Local audio request failed with HTTP 404',
    });
  });
});
