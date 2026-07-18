import type { GameState } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type { GameContext } from '../game/GameRuntime';
import type { InputReader } from '../input/InputSystem';
import type {
  VehicleControllerSystem,
  VehicleSnapshot,
} from '../vehicles/VehicleControllerSystem';
import type { AudioCatalog, AudioChannel } from './AudioCatalog';
import type { AudioPreferenceStore } from './AudioPreferences';

export type AudioLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export interface AudioPlaybackSnapshot {
  readonly contextState: AudioContextState | 'unavailable' | 'disposed';
  readonly desiredTrackId: string | undefined;
  readonly activeTrackId: string | undefined;
  readonly activeChannel: AudioChannel | undefined;
  readonly loadState: AudioLoadState;
  readonly pausedOffsets: Readonly<Record<string, number>>;
  readonly cachedBuffers: number;
  readonly liveSources: number;
  readonly sourcesCreated: number;
  readonly sourcesStopped: number;
  readonly lastError: string | undefined;
  readonly preferences: AudioPreferenceStore['current'];
}

interface AudioContextPort {
  readonly state: AudioContextState;
  readonly currentTime: number;
  readonly destination: AudioDestinationNode;
  createGain(): GainNode;
  createBufferSource(): AudioBufferSourceNode;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
  resume(): Promise<void>;
  close(): Promise<void>;
}

type ContextFactory = () => AudioContextPort;
type AudioFetch = (
  input: RequestInfo | URL,
) => Promise<Pick<Response, 'ok' | 'status' | 'arrayBuffer'>>;

/** Sole owner of AudioContext, decoded buffers, playback nodes, and interruption policy. */
export class AudioPlaybackCoordinator implements GameSystem<GameContext> {
  public readonly id = 'audio-playback';
  public readonly updateMode = 'always' as const;

  private context: AudioContextPort | undefined;
  private masterGain: GainNode | undefined;
  private channelGain: GainNode | undefined;
  private source: AudioBufferSourceNode | undefined;
  private buffers = new Map<string, AudioBuffer>();
  private offsets = new Map<string, number>();
  private desiredTrackId: string | undefined;
  private activeTrackId: string | undefined;
  private activeChannel: AudioChannel | undefined;
  private startedAt = 0;
  private loadState: AudioLoadState = 'idle';
  private lastError: string | undefined;
  private disposed = false;
  private operation = 0;
  private sourcesCreated = 0;
  private sourcesStopped = 0;
  private radioIndex = 0;
  private gameState: GameState = 'booting';
  private input: InputReader | undefined;
  private vehicleState: VehicleSnapshot;
  private unsubscribers: Array<() => void> = [];

  public constructor(
    private readonly catalog: AudioCatalog,
    private readonly preferences: AudioPreferenceStore,
    private readonly vehicle: VehicleControllerSystem,
    private readonly contextFactory: ContextFactory = () => new AudioContext(),
    private readonly request: AudioFetch = (input) => fetch(input),
  ) {
    this.vehicleState = vehicle.getSnapshot();
  }

  public init(context: GameContext): void {
    this.disposed = false;
    this.input = context.input;
    this.gameState = context.state.current;
    this.vehicleState = this.vehicle.getSnapshot();
    this.unsubscribers = [
      context.events.on('game-state:changed', ({ to }) => {
        this.gameState = to;
        void this.applyPolicy();
      }),
      this.vehicle.events.on('entered', (snapshot) => {
        this.vehicleState = snapshot;
        void this.applyPolicy(true);
      }),
      this.vehicle.events.on('exited', (snapshot) => {
        this.vehicleState = snapshot;
        void this.applyPolicy(true);
      }),
      this.preferences.events.on('changed', () => this.applyVolumes()),
    ];
  }

  public update(): void {
    if (!this.desiredTrackId || this.context?.state !== 'suspended') return;
    // Reuse named input ownership: no audio-specific DOM/global listener.
    if (unlockActions.some((action) => this.input?.wasPressed(action)))
      void this.unlock();
  }

  public async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      const audio = this.ensureContext();
      if (audio.state === 'suspended') await audio.resume();
      if (audio.state === 'running' && this.desiredTrackId && !this.source) {
        await this.start(this.desiredTrackId);
      }
      return audio.state === 'running';
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  public async playTheme(): Promise<void> {
    const track = this.catalog.first('theme');
    if (!track) return;
    this.desiredTrackId = track.id;
    await this.start(track.id);
  }

  public async playRadio(): Promise<void> {
    const rotation = this.catalog.all('radio');
    const track =
      rotation.length > 0
        ? rotation[this.radioIndex % rotation.length]
        : undefined;
    if (!track) {
      this.pause();
      return;
    }
    this.desiredTrackId = track.id;
    await this.start(track.id);
  }

  public async nextRadio(): Promise<void> {
    const rotation = this.catalog.all('radio');
    if (rotation.length === 0) {
      this.pause();
      return;
    }
    this.stopSource(false);
    this.radioIndex = (this.radioIndex + 1) % rotation.length;
    await this.start(rotation[this.radioIndex]!.id);
  }

  public pause(): void {
    this.stopSource(true);
  }

  public resume(): void {
    if (this.desiredTrackId) void this.start(this.desiredTrackId);
  }

  public stop(): void {
    this.stopSource(false);
    this.desiredTrackId = undefined;
  }

  public getSnapshot(): AudioPlaybackSnapshot {
    return {
      contextState: this.disposed
        ? 'disposed'
        : (this.context?.state ?? 'unavailable'),
      desiredTrackId: this.desiredTrackId,
      activeTrackId: this.activeTrackId,
      activeChannel: this.activeChannel,
      loadState: this.loadState,
      pausedOffsets: Object.fromEntries(this.offsets),
      cachedBuffers: this.buffers.size,
      liveSources: this.source ? 1 : 0,
      sourcesCreated: this.sourcesCreated,
      sourcesStopped: this.sourcesStopped,
      lastError: this.lastError,
      preferences: this.preferences.current,
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.operation += 1;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.stopSource(false);
    this.masterGain?.disconnect();
    this.channelGain?.disconnect();
    this.masterGain = undefined;
    this.channelGain = undefined;
    this.buffers.clear();
    this.offsets.clear();
    const context = this.context;
    this.context = undefined;
    this.input = undefined;
    if (context && context.state !== 'closed')
      void context.close().catch(() => undefined);
  }

  private async applyPolicy(fromGesture = false): Promise<void> {
    if (this.gameState !== 'playing') {
      if (
        this.gameState !== 'paused' ||
        this.preferences.current.pauseWhenGamePaused
      )
        this.pause();
      return;
    }
    if (this.vehicleState.mode === 'driving') await this.playRadio();
    else await this.playTheme();
    if (fromGesture) await this.unlock();
  }

  private ensureContext(): AudioContextPort {
    if (this.context) return this.context;
    this.context = this.contextFactory();
    this.masterGain = this.context.createGain();
    this.channelGain = this.context.createGain();
    this.channelGain.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);
    this.applyVolumes();
    return this.context;
  }

  private applyVolumes(): void {
    const value = this.preferences.current;
    if (this.masterGain) {
      this.masterGain.gain.value = value.muted ? 0 : value.masterVolume;
      this.masterGain.channelCount = value.monoOutput ? 1 : 2;
      this.masterGain.channelCountMode = value.monoOutput ? 'explicit' : 'max';
    }
    if (this.channelGain) {
      this.channelGain.gain.value =
        this.activeChannel === 'radio' ? value.radioVolume : value.themeVolume;
    }
  }

  private async start(id: string): Promise<void> {
    if (this.disposed) return;
    const track = this.catalog.get(id);
    this.desiredTrackId = id;
    if (this.activeTrackId === id && this.source) return;
    this.stopSource(true);
    const currentOperation = ++this.operation;
    try {
      const audio = this.ensureContext();
      this.loadState = 'loading';
      let buffer = this.buffers.get(id);
      if (!buffer) {
        const response = await this.request(track.url);
        if (!response.ok)
          throw new Error(
            `Local audio request failed with HTTP ${response.status}`,
          );
        buffer = await audio.decodeAudioData(await response.arrayBuffer());
        if (this.disposed || currentOperation !== this.operation) return;
        this.buffers.set(id, buffer);
        while (this.buffers.size > 2)
          this.buffers.delete(this.buffers.keys().next().value!);
      }
      this.loadState = 'loaded';
      if (audio.state !== 'running') return;
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.loop = track.loop;
      source.connect(this.channelGain!);
      const offset = Math.min(
        this.offsets.get(id) ?? 0,
        Math.max(0, buffer.duration - 0.01),
      );
      source.start(0, offset);
      this.source = source;
      this.activeTrackId = id;
      this.activeChannel = track.channel;
      this.startedAt = audio.currentTime - offset;
      this.sourcesCreated += 1;
      this.lastError = undefined;
      this.applyVolumes();
      source.onended = () => {
        if (this.source !== source) return;
        this.source = undefined;
        this.activeTrackId = undefined;
        this.activeChannel = undefined;
        this.offsets.delete(track.id);
        if (
          track.channel === 'radio' &&
          this.gameState === 'playing' &&
          this.vehicleState.mode === 'driving'
        ) {
          void this.nextRadio();
        }
      };
    } catch (error) {
      if (currentOperation === this.operation) this.fail(error);
    }
  }

  private stopSource(rememberOffset: boolean): void {
    const source = this.source;
    const activeId = this.activeTrackId;
    if (rememberOffset && activeId && this.context) {
      const buffer = this.buffers.get(activeId);
      const elapsed = Math.max(0, this.context.currentTime - this.startedAt);
      this.offsets.set(
        activeId,
        buffer?.duration ? elapsed % buffer.duration : elapsed,
      );
    } else if (activeId) {
      this.offsets.delete(activeId);
    }
    this.source = undefined;
    this.activeTrackId = undefined;
    this.activeChannel = undefined;
    if (source) {
      source.onended = null;
      source.stop();
      source.disconnect();
      this.sourcesStopped += 1;
    }
  }

  private fail(error: unknown): void {
    this.loadState = 'error';
    this.lastError = error instanceof Error ? error.message : String(error);
    this.stopSource(true);
  }
}

const unlockActions = [
  'moveForward',
  'moveBackward',
  'moveLeft',
  'moveRight',
  'jump',
  'interact',
  'pause',
  'toggleHelp',
  'openMap',
] as const;
