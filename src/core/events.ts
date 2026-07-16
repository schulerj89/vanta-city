export type EventMap = object;
export type EventListener<T> = (payload: T) => void;

export class EventBus<Events extends EventMap> {
  private readonly listeners = new Map<keyof Events, Set<unknown>>();

  public on<Key extends keyof Events>(
    type: Key,
    listener: EventListener<Events[Key]>,
  ): () => void {
    const eventListeners = this.listeners.get(type) ?? new Set();
    eventListeners.add(listener);
    this.listeners.set(type, eventListeners);
    return () => this.off(type, listener);
  }

  public off<Key extends keyof Events>(
    type: Key,
    listener: EventListener<Events[Key]>,
  ): void {
    const eventListeners = this.listeners.get(type);
    eventListeners?.delete(listener);
    if (eventListeners?.size === 0) this.listeners.delete(type);
  }

  public emit<Key extends keyof Events>(type: Key, payload: Events[Key]): void {
    const eventListeners = this.listeners.get(type);
    if (!eventListeners) return;
    for (const listener of [...eventListeners]) {
      (listener as EventListener<Events[Key]>)(payload);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
