type Listener = (...args: unknown[]) => void;

export class EventEmitter {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => this.off(event, listener);
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach(listener => listener(...args));
    this.listeners.get('*')?.forEach(listener => listener(event, ...args));
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
