import type { RequestEvent } from "./types";

type Listener = (events: readonly RequestEvent[]) => void;

/**
 * Stores request attempts in order. Every change replaces the array, so
 * getEvents() is a stable snapshot suitable for React's useSyncExternalStore.
 */
export class EventRecorder {
  private events: readonly RequestEvent[] = [];
  private readonly listeners = new Set<Listener>();
  private counter = 0;

  getEvents = (): readonly RequestEvent[] => this.events;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  nextId(): string {
    this.counter += 1;
    return `evt-${this.counter}`;
  }

  start(event: RequestEvent): void {
    this.events = [...this.events, event];
    this.emit();
  }

  finish(id: string, patch: Partial<Omit<RequestEvent, "id">>): void {
    this.events = this.events.map((event) => (event.id === id ? { ...event, ...patch } : event));
    this.emit();
  }

  /** Puts back a snapshot taken before clear(), e.g. to undo it. Ids keep counting, so restored ids never collide. */
  restore(events: readonly RequestEvent[]): void {
    this.events = [...events];
    this.emit();
  }

  /** Ids keep counting after clear() so a late-settling request from the old run can't patch a new event. */
  clear(): void {
    this.events = [];
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.events);
  }
}
