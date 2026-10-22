import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESETS, connectLive, redactUrl, type LiveEventsBatch, type LiveState } from "../src";

class FakeEventSource {
  static last: FakeEventSource | undefined;
  readyState = 0;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, ((message: { data: string }) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: (message: { data: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) });
  }
  close() {
    this.readyState = 2;
  }
}

const SERVER = "https://slownet.test";
const SESSION = "s_abcdefghijklmnop1234";

function setup() {
  const batches: LiveEventsBatch[] = [];
  const appCalls: string[] = [];
  const transport = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(SERVER)) {
      if (init?.method === "POST") batches.push(JSON.parse(String(init.body)) as LiveEventsBatch);
      return new Response("{}", { status: 200 });
    }
    appCalls.push(url);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  const client = connectLive({
    server: SERVER,
    session: SESSION,
    fetch: transport as unknown as typeof fetch,
    EventSource: FakeEventSource as unknown as typeof EventSource,
    origin: "http://localhost:5173",
  });
  const state = (profile = PRESETS.stable, runId = 1): LiveState => ({ profile, runId, updatedAt: 0 });
  return { client, batches, appCalls, transport, source: FakeEventSource.last!, state };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("connectLive", () => {
  it("subscribes to the app stream and passes requests through until the profile arrives", async () => {
    const { client, source, appCalls } = setup();
    expect(source.url).toBe(`${SERVER}/api/live/${SESSION}/stream?role=app`);
    expect(client.getProfile().id).toBe("passthrough");
    const pending = client.fetch("http://localhost:5173/api/items");
    await vi.advanceTimersByTimeAsync(1); // even a 0 ms simulated delay runs on a timer
    await pending;
    expect(appCalls).toEqual(["http://localhost:5173/api/items"]);
    await client.disconnect();
  });

  it("applies the dashboard's profile and reports redacted attempts as upserts", async () => {
    const { client, source, batches, state } = setup();
    source.emit("state", state({ ...PRESETS["high-latency"], seed: 3 }));
    expect(client.getStatus()).toBe("connected");

    const pending = client.fetch("http://localhost:5173/api/items?token=secret", { label: "GET /api/items" });
    await vi.advanceTimersByTimeAsync(300); // flush the "pending" version
    await vi.advanceTimersByTimeAsync(1_200);
    await pending;
    await vi.advanceTimersByTimeAsync(300);

    const versions = batches.flatMap((batch) => batch.events);
    expect(versions.map((event) => event.outcome)).toEqual(["pending", "success"]);
    expect(new Set(versions.map((event) => event.id)).size).toBe(1);
    expect(versions[1]!.url).toBe("http://localhost:5173/api/items");
    expect(JSON.stringify(batches)).not.toContain("secret");
    expect(batches[0]).toMatchObject({ protocol: 1, runId: 1, origin: "http://localhost:5173" });
    expect(versions[1]!.profileSnapshot).toMatchObject({ id: "high-latency", seed: 3 });
    await client.disconnect();
  });

  it("drops the old run when the dashboard clears it", async () => {
    const { client, source, batches, state } = setup();
    source.emit("state", state(PRESETS.offline, 1));
    await client.fetch("http://localhost:5173/a").catch(() => undefined);
    source.emit("state", state(PRESETS.offline, 2));
    await vi.advanceTimersByTimeAsync(300);
    expect(batches.every((batch) => batch.runId === 2)).toBe(true);
    expect(batches.flatMap((batch) => batch.events)).toHaveLength(0);
    await client.disconnect();
  });

  it("install() shapes same-origin requests only and never touches the relay's own traffic", async () => {
    const { client, source, state } = setup();
    const original = globalThis.fetch;
    const underlying = vi.fn(async () => new Response("{}"));
    globalThis.fetch = underlying as unknown as typeof fetch;
    try {
      source.emit("state", state(PRESETS.offline));
      const uninstall = client.install();
      await expect(fetch("http://localhost:5173/api/x")).rejects.toMatchObject({ code: "OFFLINE" });
      await expect(fetch("https://other.example/x")).resolves.toBeInstanceOf(Response);
      await expect(fetch(`${SERVER}/api/live/${SESSION}/events`)).resolves.toBeInstanceOf(Response);
      expect(underlying).toHaveBeenCalledTimes(2);
      uninstall();
      expect(globalThis.fetch).toBe(underlying);
    } finally {
      globalThis.fetch = original;
      await client.disconnect();
    }
  });

  it("falls back to polling the state when EventSource is unavailable", async () => {
    const transport = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith("/state") ? Response.json({ profile: PRESETS.flaky, runId: 4, updatedAt: 0 }) : new Response("{}"),
    );
    const client = connectLive({ server: SERVER, session: SESSION, fetch: transport as unknown as typeof fetch, EventSource: undefined, origin: "http://app.test" });
    await vi.advanceTimersByTimeAsync(10);
    expect(client.getProfile().id).toBe("flaky");
    await client.disconnect();
  });
});

describe("redactUrl", () => {
  it("strips query and hash unless the query is explicitly allowed", () => {
    expect(redactUrl("/api/x?token=1#h", false, "http://app.test")).toBe("http://app.test/api/x");
    expect(redactUrl("/api/x?page=2", true, "http://app.test")).toBe("http://app.test/api/x?page=2");
  });
});
