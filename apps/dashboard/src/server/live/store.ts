import type { LiveClientInfo, NetworkProfile, RequestEvent } from "@slownet/core";

export type StoredState = {
  profile: NetworkProfile;
  runId: number;
  createdAt: number;
  updatedAt: number;
  /** sha256 of the control key; never returned to clients. */
  keyHash: string;
};

/** One version of one attempt, in arrival order. Readers apply them as upserts by event id. */
export type LogEntry = { runId: number; event: RequestEvent };

export interface LiveStore {
  readonly kind: "memory" | "upstash";
  create(id: string, state: StoredState): Promise<void>;
  getState(id: string): Promise<StoredState | null>;
  setState(id: string, state: StoredState): Promise<void>;
  /** Appends unless the log would exceed `maxEntries`; returns false when full. */
  append(id: string, entries: LogEntry[], maxEntries: number): Promise<boolean>;
  read(id: string, from: number): Promise<LogEntry[]>;
  resetLog(id: string): Promise<void>;
  touchClient(id: string, client: LiveClientInfo): Promise<void>;
  listClients(id: string): Promise<LiveClientInfo[]>;
}

type MemorySession = { state: StoredState; log: LogEntry[]; clients: Map<string, LiveClientInfo>; expiresAt: number };

const MAX_MEMORY_SESSIONS = 1_000;

/**
 * Single-process store for local development and self-hosting. Kept on globalThis so
 * dev-server reloads don't drop sessions. Not suitable for serverless (instances don't share memory).
 */
export class MemoryStore implements LiveStore {
  readonly kind = "memory";
  private readonly sessions: Map<string, MemorySession>;

  constructor(private readonly ttlMs: number) {
    const holder = globalThis as typeof globalThis & { __slownetLiveSessions?: Map<string, MemorySession> };
    this.sessions = holder.__slownetLiveSessions ??= new Map();
  }

  private get(id: string): MemorySession | undefined {
    const session = this.sessions.get(id);
    if (session && session.expiresAt < Date.now()) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }

  private touch(session: MemorySession) {
    session.expiresAt = Date.now() + this.ttlMs;
  }

  async create(id: string, state: StoredState) {
    if (this.sessions.size >= MAX_MEMORY_SESSIONS) {
      const oldest = [...this.sessions.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
      if (oldest) this.sessions.delete(oldest[0]);
    }
    this.sessions.set(id, { state, log: [], clients: new Map(), expiresAt: Date.now() + this.ttlMs });
  }

  async getState(id: string) {
    return this.get(id)?.state ?? null;
  }

  async setState(id: string, state: StoredState) {
    const session = this.get(id);
    if (!session) return;
    session.state = state;
    this.touch(session);
  }

  async append(id: string, entries: LogEntry[], maxEntries: number) {
    const session = this.get(id);
    if (!session) return false;
    if (session.log.length + entries.length > maxEntries) return false;
    session.log.push(...entries);
    this.touch(session);
    return true;
  }

  async read(id: string, from: number) {
    return this.get(id)?.log.slice(from) ?? [];
  }

  async resetLog(id: string) {
    const session = this.get(id);
    if (session) session.log = [];
  }

  async touchClient(id: string, client: LiveClientInfo) {
    this.get(id)?.clients.set(client.clientId, client);
  }

  async listClients(id: string) {
    return [...(this.get(id)?.clients.values() ?? [])];
  }
}
