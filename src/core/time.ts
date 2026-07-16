export interface FrameTime {
  readonly delta: number;
  readonly elapsed: number;
  readonly frame: number;
}

export class GameClock {
  private lastTimestamp: number | undefined;
  private elapsedSeconds = 0;
  private frameNumber = 0;

  public constructor(public readonly maxDelta = 0.1) {
    if (maxDelta <= 0) throw new Error('maxDelta must be greater than zero');
  }

  public tick(timestampMs: number): FrameTime {
    const rawDelta =
      this.lastTimestamp === undefined
        ? 0
        : Math.max(0, (timestampMs - this.lastTimestamp) / 1000);
    const delta = Math.min(rawDelta, this.maxDelta);

    this.lastTimestamp = timestampMs;
    this.elapsedSeconds += delta;
    this.frameNumber += 1;

    return { delta, elapsed: this.elapsedSeconds, frame: this.frameNumber };
  }

  public resetFrameDelta(): void {
    this.lastTimestamp = undefined;
  }
}
