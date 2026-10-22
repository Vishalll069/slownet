import { PRESETS, type RequestEvent } from "@slownet/core";
import { describe, expect, it, vi } from "vitest";
import { MemoryStore, type StoredState } from "./store";
import { UpstashStore } from "./upstash";

const state: StoredState = { profile: PRESETS.stable, runId: 1, createdAt: 0, updatedAt: 0, keyHash: "ab" };
const event = (id: string): RequestEvent => ({
  id,
  requestId: id,
  label: "GET /x",
  attempt: 1,
  method: "GET",
  url: "http://app.test/x",
  profileId: "stable",
  startedAt: 0,
  simulatedDelayMs: 0,
  outcome: "pending",
});

describe("MemoryStore", () => {
  it("appends, reads from a cursor, resets and refuses to grow past the cap", async () => {
    const store = new MemoryStore(60_000);
    const id = `s_${Math.random().toString(36).slice(2)}xxxxxxxxxxxx`;
    await store.create(id, state);
    expect(await store.append(id, [{ runId: 1, event: event("a") }, { runId: 1, event: event("b") }], 3)).toBe(true);
    expect((await store.read(id, 1)).map((entry) => entry.event.id)).toEqual(["b"]);
    expect(await store.append(id, [{ runId: 1, event: event("c") }, { runId: 1, event: event("d") }], 3)).toBe(false);
    await store.resetLog(id);
    expect(await store.read(id, 0)).toEqual([]);
  });

  it("expires sessions after the TTL", async () => {
    vi.useFakeTimers();
    try {
      const store = new MemoryStore(1_000);
      const id = `s_${Math.random().toString(36).slice(2)}yyyyyyyyyyyy`;
      await store.create(id, state);
      vi.advanceTimersByTime(1_001);
      expect(await store.getState(id)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("UpstashStore", () => {
  it("sends pipelined commands with expiry and parses results", async () => {
    const calls: unknown[][] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const commands = JSON.parse(String(init!.body)) as unknown[][];
      calls.push(...commands);
      return Response.json(commands.map((command) => ({ result: command[0] === "LLEN" ? 0 : command[0] === "LRANGE" ? [JSON.stringify({ runId: 1, event: event("a") })] : "OK" })));
    });
    const store = new UpstashStore("https://redis.test/", "token", 86_400, fetchMock as unknown as typeof fetch);

    await store.create("s_id", state);
    expect(await store.append("s_id", [{ runId: 1, event: event("a") }], 10)).toBe(true);
    const entries = await store.read("s_id", 0);

    expect(fetchMock.mock.calls[0]![0]).toBe("https://redis.test/pipeline");
    expect((fetchMock.mock.calls[0]![1]!.headers as Record<string, string>).authorization).toBe("Bearer token");
    expect(calls[0]).toEqual(["SET", "slownet:s_id:state", JSON.stringify(state), "EX", 86_400]);
    expect(calls).toContainEqual(["EXPIRE", "slownet:s_id:log", 86_400]);
    expect(calls).toContainEqual(["LRANGE", "slownet:s_id:log", 0, -1]);
    expect(entries[0]!.event.id).toBe("a");
  });

  it("surfaces Redis errors instead of pretending the write worked", async () => {
    const store = new UpstashStore("https://redis.test", "t", 60, (async () => Response.json([{ error: "WRONGTYPE" }])) as unknown as typeof fetch);
    await expect(store.getState("s_id")).rejects.toThrow("WRONGTYPE");
  });
});
