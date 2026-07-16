/** Fixed-capacity insertion-ordered storage used by development diagnostics. */
export class FixedRingBuffer<Value> {
  private readonly values: (Value | undefined)[];
  private next = 0;
  private length = 0;

  public constructor(public readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('Ring buffer capacity must be a positive integer');
    }
    this.values = new Array<Value | undefined>(capacity);
  }

  public get size(): number {
    return this.length;
  }

  public push(value: Value): void {
    this.values[this.next] = value;
    this.next = (this.next + 1) % this.capacity;
    this.length = Math.min(this.length + 1, this.capacity);
  }

  public clear(): void {
    this.values.fill(undefined);
    this.next = 0;
    this.length = 0;
  }

  public toArray(): Value[] {
    const start = (this.next - this.length + this.capacity) % this.capacity;
    return Array.from({ length: this.length }, (_, index) => {
      const value = this.values[(start + index) % this.capacity];
      if (value === undefined) throw new Error('Ring buffer invariant failed');
      return value;
    });
  }
}
