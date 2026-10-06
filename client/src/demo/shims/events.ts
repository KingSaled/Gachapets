/** Minimal EventEmitter for the in-browser demo build (aliased from node:events). */
type Listener = (...args: any[]) => void;

export class EventEmitter<_T = unknown> {
  private listeners = new Map<string, Set<Listener>>();
  on(event: string, fn: Listener) {
    (this.listeners.get(event) ?? this.listeners.set(event, new Set()).get(event)!).add(fn);
    return this;
  }
  off(event: string, fn: Listener) {
    this.listeners.get(event)?.delete(fn);
    return this;
  }
  removeListener(event: string, fn: Listener) {
    return this.off(event, fn);
  }
  emit(event: string, ...args: unknown[]) {
    const set = this.listeners.get(event);
    if (!set?.size) return false;
    for (const fn of [...set]) fn(...args);
    return true;
  }
  setMaxListeners() {
    return this;
  }
}
export default { EventEmitter };
