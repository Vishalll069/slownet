import { EventRecorder } from "../event-recorder";
import { createSeededRandom } from "../random";
import { createSlowFetch, type SlowFetch } from "../slow-fetch";
import type { NetworkProfile, RandomSource, RequestEvent } from "../types";
import { LIVE_PROTOCOL_VERSION, livePaths, type LiveEventsBatch, type LiveState } from "./types";

export type LiveStatus = "connecting" | "connected" | "disconnected";

export type LiveClientOptions = {
  /** The SlowNet server's origin, e.g. https://slownet.example.com. */
  server: string;
  /** Session id shown in the SlowNet dashboard. */
  session: string;
  /**
   * Which requests install() shapes. Defaults to same-origin requests only.
   * "*" shapes everything except calls to the SlowNet server itself.
   */
  match?: "*" | string | RegExp | ((url: URL) => boolean);
  /** Query strings are stripped before anything is sent to SlowNet unless this is true. */
  includeQuery?: boolean;
  /** Transport and the real fetch. Defaults to the global fetch captured at connect time. */
  fetch?: typeof fetch;
  /** Defaults to the global EventSource; without one the client polls. */
  EventSource?: typeof EventSource;
  /** The connected page's origin. Defaults to location.origin. */
  origin?: string;
  onStatus?: (status: LiveStatus) => void;
  /** How often pending event updates are sent. */
  flushIntervalMs?: number;
  /** Polling interval when EventSource is unavailable. */
  pollIntervalMs?: number;
};

export type LiveClient = {
  /** A fetch that applies the live profile and reports to the dashboard. */
  fetch: SlowFetch;
  /** Patches globalThis.fetch for matching requests. Returns an uninstall function. */
  install: () => () => void;
  getProfile: () => NetworkProfile;
  getStatus: () => LiveStatus;
  /** Sends what's pending, then stops syncing and uninstalls. */
  disconnect: () => Promise<void>;
};

/** Requests pass through unchanged until the dashboard's profile arrives. */
export const PASSTHROUGH_PROFILE: NetworkProfile = {
  id: "passthrough",
  name: "Passthrough (waiting for SlowNet)",
  latencyMs: 0,
  jitterMs: 0,
  failureRate: 0,
  timeoutMs: 120_000,
  offline: false,
};

const HEARTBEAT_MS = 5_000;

function randomId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toUrl(input: string | URL | Request, base: string | undefined): URL | null {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new URL(raw, base);
  } catch {
    return null;
  }
}

/** What leaves the app: origin + path (+ query only when allowed). Never headers or bodies. */
export function redactUrl(url: string, includeQuery: boolean, base?: string): string {
  try {
    const parsed = new URL(url, base);
    return includeQuery ? `${parsed.origin}${parsed.pathname}${parsed.search}` : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split("?")[0]!.split("#")[0]!;
  }
}

export function connectLive(options: LiveClientOptions): LiveClient {
  const server = options.server.replace(/\/+$/, "");
  const realFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const EventSourceImpl = options.EventSource ?? (typeof EventSource === "undefined" ? undefined : EventSource);
  const pageOrigin = options.origin ?? (typeof location === "undefined" ? "unknown" : location.origin);
  const includeQuery = options.includeQuery ?? false;
  const clientId = randomId();
  const recorder = new EventRecorder();

  let profile = PASSTHROUGH_PROFILE;
  let runId = 0;
  let random: RandomSource = Math.random;
  let status: LiveStatus = "connecting";
  let stopped = false;
  let source: EventSource | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSentAt = 0;
  // Events whose latest version hasn't been sent yet, by id.
  const dirty = new Map<string, RequestEvent>();
  const uninstallers = new Set<() => void>();

  const setStatus = (next: LiveStatus) => {
    if (next === status) return;
    status = next;
    options.onStatus?.(next);
  };

  const slowFetch = createSlowFetch({ profile: () => profile, random: () => random(), recorder, fetch: realFetch });

  recorder.subscribe((events) => {
    for (const event of events) dirty.set(event.id, event);
  });

  function applyState(state: LiveState) {
    if (state.runId !== runId) {
      // A new run on the dashboard: start a fresh sequence and drop the old run's unsent events.
      recorder.clear();
      dirty.clear();
      random = state.profile.seed === undefined ? Math.random : createSeededRandom(state.profile.seed);
    } else if (state.profile.seed !== profile.seed) {
      random = state.profile.seed === undefined ? Math.random : createSeededRandom(state.profile.seed);
    }
    runId = state.runId;
    profile = state.profile;
    setStatus("connected");
  }

  async function flush(force = false) {
    if (runId === 0) return; // not connected yet; events of the passthrough phase are not reported
    const now = Date.now();
    if (dirty.size === 0 && !force && now - lastSentAt < HEARTBEAT_MS) return;
    const events = [...dirty.values()].slice(0, 100);
    const batch: LiveEventsBatch = {
      protocol: LIVE_PROTOCOL_VERSION,
      clientId,
      runId,
      origin: pageOrigin,
      events: events.map((event) => ({ ...event, url: redactUrl(event.url, includeQuery, pageOrigin === "unknown" ? undefined : pageOrigin) })),
    };
    try {
      const response = await realFetch(`${server}${livePaths.events(options.session)}`, {
        method: "POST",
        // text/plain keeps this a "simple" cross-origin request: no CORS preflight, and keepalive works.
        headers: { "content-type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(batch),
        keepalive: true,
      });
      if (response.ok) {
        lastSentAt = now;
        // Only forget versions that haven't changed since we read them.
        for (const event of events) if (dirty.get(event.id) === event) dirty.delete(event.id);
      }
    } catch {
      // Keep them dirty; the next tick retries.
    }
  }

  const flushTimer = setInterval(() => void flush(), options.flushIntervalMs ?? 250);

  async function poll() {
    if (stopped) return;
    try {
      const response = await realFetch(`${server}${livePaths.state(options.session)}`);
      if (response.ok) applyState((await response.json()) as LiveState);
      else setStatus("disconnected");
    } catch {
      setStatus("disconnected");
    }
    pollTimer = setTimeout(() => void poll(), options.pollIntervalMs ?? 1_000);
  }

  if (EventSourceImpl) {
    source = new EventSourceImpl(`${server}${livePaths.stream(options.session, "app")}`);
    source.addEventListener("state", (message) => applyState(JSON.parse((message as MessageEvent<string>).data) as LiveState));
    source.addEventListener("gone", () => {
      setStatus("disconnected");
      source?.close();
    });
    source.onerror = () => setStatus(source?.readyState === 2 ? "disconnected" : "connecting");
  } else {
    void poll();
  }

  const serverOrigin = (() => {
    try {
      return new URL(server).origin;
    } catch {
      return server;
    }
  })();

  function matches(url: URL): boolean {
    // Never shape SlowNet's own traffic (the relay and this script); other paths on that origin are fair game.
    if (url.origin === serverOrigin && (url.pathname.startsWith("/api/live/") || url.pathname === "/slownet-live.js")) return false;
    const match = options.match;
    if (match === "*") return true;
    if (match === undefined) return pageOrigin === "unknown" || url.origin === pageOrigin;
    if (typeof match === "string") return url.href.startsWith(match) || url.pathname.startsWith(match);
    if (match instanceof RegExp) return match.test(url.href);
    return match(url);
  }

  function install(): () => void {
    const original = globalThis.fetch;
    const patched: typeof fetch = (input, init) => {
      const url = toUrl(input as string | URL | Request, pageOrigin === "unknown" ? undefined : pageOrigin);
      if (stopped || !url || !matches(url)) return original(input, init);
      // The recorder already stores the method and full (redacted) URL; the path makes a readable label.
      return slowFetch(input as string | URL | Request, { ...init, label: url.pathname });
    };
    globalThis.fetch = patched;
    const uninstall = () => {
      if (globalThis.fetch === patched) globalThis.fetch = original;
      uninstallers.delete(uninstall);
    };
    uninstallers.add(uninstall);
    return uninstall;
  }

  return {
    fetch: slowFetch,
    install,
    getProfile: () => profile,
    getStatus: () => status,
    async disconnect() {
      stopped = true;
      clearInterval(flushTimer);
      clearTimeout(pollTimer);
      source?.close();
      for (const uninstall of [...uninstallers]) uninstall();
      await flush(true);
      setStatus("disconnected");
    },
  };
}
