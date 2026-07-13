export interface Subscription {
  dispose(): void;
}

export class SimpleEvent<T> {
  private readonly listeners = new Set<(value: T) => void>();

  readonly subscribe = (listener: (value: T) => void): Subscription => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };

  fire(value: T): void {
    for (const listener of [...this.listeners]) listener(value);
  }

  dispose(): void {
    this.listeners.clear();
  }
}
