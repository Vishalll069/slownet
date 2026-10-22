import type { NetworkProfile, RequestEvent } from "../types";

/** Increment when the wire format changes incompatibly. */
export const LIVE_PROTOCOL_VERSION = 1;

/** What a connected app needs to shape its requests. */
export type LiveState = {
  profile: NetworkProfile;
  /** Increments on Clear run; events from an older run are dropped. */
  runId: number;
  updatedAt: number;
};

/** Sent by a connected app. Events are upserts: an attempt is sent when it starts and again when it settles. */
export type LiveEventsBatch = {
  protocol: typeof LIVE_PROTOCOL_VERSION;
  clientId: string;
  runId: number;
  /** The connected page's origin, e.g. http://localhost:5173. Shown in the dashboard. */
  origin: string;
  events: RequestEvent[];
};

export type LiveClientInfo = {
  clientId: string;
  origin: string;
  lastSeenAt: number;
};

/** Paths on the SlowNet server, relative to its origin. */
export const livePaths = {
  sessions: () => "/api/live/sessions",
  state: (session: string) => `/api/live/${encodeURIComponent(session)}/state`,
  events: (session: string) => `/api/live/${encodeURIComponent(session)}/events`,
  clear: (session: string) => `/api/live/${encodeURIComponent(session)}/clear`,
  stream: (session: string, role: "app" | "dashboard") => `/api/live/${encodeURIComponent(session)}/stream?role=${role}`,
};

export const SESSION_ID_PATTERN = /^s_[A-Za-z0-9_-]{16,48}$/;
