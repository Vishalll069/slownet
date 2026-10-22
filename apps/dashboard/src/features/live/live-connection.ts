import { livePaths, type LiveClientInfo, type LiveState, type NetworkProfile, type RequestEvent } from "@slownet/core";

export type LiveStatus = "idle" | "creating" | "connecting" | "live" | "reconnecting" | "gone" | "error";

export type LiveSnapshot = {
  status: LiveStatus;
  sessionId: string | null;
  /** Present only for whoever created the session or opened a control link. */
  controlKey: string | null;
  state: LiveState | null;
  events: readonly RequestEvent[];
  clients: readonly LiveClientInfo[];
  /** Increments when the profile changes from somewhere other than this tab (re-initialises forms). */
  profileRevision: number;
  error: string | null;
};

const IDLE: LiveSnapshot = { status: "idle", sessionId: null, controlKey: null, state: null, events: [], clients: [], profileRevision: 0, error: null };

/** The dashboard side of a live session: follows the relay stream and sends profile changes. */
export class LiveConnection {
  private snapshot: LiveSnapshot = IDLE;
  private readonly listeners = new Set<() => void>();
  private source: EventSource | null = null;
  private eventIndex = new Map<string, number>();
  private lastSentProfile: NetworkProfile | null = null;

  getSnapshot = (): LiveSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async create(profile: NetworkProfile): Promise<{ sessionId: string; controlKey: string } | null> {
    this.leave();
    this.update({ status: "creating", error: null });
    try {
      const response = await fetch(livePaths.sessions(), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile }) });
      const body = (await response.json()) as { sessionId?: string; controlKey?: string; state?: LiveState; message?: string };
      if (!response.ok || !body.sessionId || !body.controlKey) {
        this.update({ status: "error", error: body.message ?? `Could not create a session (HTTP ${response.status}).` });
        return null;
      }
      this.join(body.sessionId, body.controlKey, body.state ?? null);
      return { sessionId: body.sessionId, controlKey: body.controlKey };
    } catch (error) {
      this.update({ status: "error", error: error instanceof Error ? error.message : "Could not reach the relay." });
      return null;
    }
  }

  join(sessionId: string, controlKey: string | null, initialState: LiveState | null = null): void {
    this.source?.close();
    this.eventIndex = new Map();
    this.snapshot = { ...IDLE, status: "connecting", sessionId, controlKey, state: initialState };
    this.emit();

    const source = new EventSource(livePaths.stream(sessionId, "dashboard"));
    this.source = source;
    source.onopen = () => this.update({ status: "live", error: null });
    source.onerror = () => {
      if (this.snapshot.status !== "gone") this.update({ status: source.readyState === EventSource.CLOSED ? "error" : "reconnecting" });
    };
    source.addEventListener("state", (message) => this.applyState(JSON.parse((message as MessageEvent<string>).data) as LiveState));
    source.addEventListener("events", (message) => {
      const { runId, events } = JSON.parse((message as MessageEvent<string>).data) as { runId: number; events: RequestEvent[] };
      if (runId === this.snapshot.state?.runId) this.upsert(events);
    });
    source.addEventListener("clients", (message) => {
      this.update({ clients: (JSON.parse((message as MessageEvent<string>).data) as { clients: LiveClientInfo[] }).clients });
    });
    source.addEventListener("gone", () => {
      source.close();
      this.update({ status: "gone", error: "This session expired or was removed." });
    });
  }

  leave(): void {
    this.source?.close();
    this.source = null;
    this.eventIndex = new Map();
    this.lastSentProfile = null;
    this.snapshot = { ...IDLE, profileRevision: this.snapshot.profileRevision + 1 };
    this.emit();
  }

  async setProfile(profile: NetworkProfile): Promise<void> {
    const { sessionId, controlKey, state } = this.snapshot;
    if (!sessionId || !controlKey || !state) return;
    this.lastSentProfile = profile;
    this.update({ state: { ...state, profile } }); // optimistic; the stream confirms it
    const response = await fetch(livePaths.state(sessionId), {
      method: "PUT",
      headers: { "content-type": "application/json", "x-slownet-key": controlKey },
      body: JSON.stringify({ profile }),
    }).catch(() => null);
    if (!response?.ok) this.update({ error: "The profile change didn't reach the relay. Connected apps still use the previous profile." });
  }

  async clear(): Promise<boolean> {
    const { sessionId, controlKey } = this.snapshot;
    if (!sessionId || !controlKey) return false;
    const response = await fetch(livePaths.clear(sessionId), { method: "POST", headers: { "x-slownet-key": controlKey } }).catch(() => null);
    if (!response?.ok) {
      this.update({ error: "Clear run didn't reach the relay." });
      return false;
    }
    this.applyState((await response.json()) as LiveState);
    return true;
  }

  private applyState(next: LiveState) {
    const previous = this.snapshot.state;
    const external = !this.lastSentProfile || JSON.stringify(this.lastSentProfile) !== JSON.stringify(next.profile);
    const newRun = previous !== null && previous.runId !== next.runId;
    if (newRun) this.eventIndex = new Map();
    this.update({
      state: next,
      events: newRun ? [] : this.snapshot.events,
      profileRevision: this.snapshot.profileRevision + (external && JSON.stringify(previous?.profile) !== JSON.stringify(next.profile) ? 1 : 0),
    });
  }

  private upsert(incoming: RequestEvent[]) {
    const events = [...this.snapshot.events];
    for (const event of incoming) {
      const index = this.eventIndex.get(event.id);
      if (index === undefined) {
        this.eventIndex.set(event.id, events.length);
        events.push(event);
      } else {
        events[index] = event;
      }
    }
    this.update({ events });
  }

  private update(patch: Partial<LiveSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
