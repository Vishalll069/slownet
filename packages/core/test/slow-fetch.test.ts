import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EventRecorder,
  PRESETS,
  SlowNetError,
  createSequenceRandom,
  createSlowFetch,
  type NetworkProfile,
} from "../src";

const okFetch = () => vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

/** A fetch that never resolves on its own, but rejects with signal.reason when aborted. */
const hangingFetch = () =>
  vi.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      }),
  );

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createSlowFetch", () => {
  it("waits the simulated delay, calls the real fetch and records success", async () => {
    const recorder = new EventRecorder();
    const fetchMock = okFetch();
    const slowFetch = createSlowFetch({
      profile: PRESETS["slow-3g"],
      random: createSequenceRandom([0.5, 0.9]),
      fetch: fetchMock,
      recorder,
    });

    const pending = slowFetch("/api/products", { label: "Fetch products" });
    await vi.advanceTimersByTimeAsync(399);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [event] = recorder.getEvents();
    expect(event).toMatchObject({
      label: "Fetch products",
      attempt: 1,
      method: "GET",
      url: "/api/products",
      profileId: "slow-3g",
      simulatedDelayMs: 400,
      outcome: "success",
      httpStatus: 200,
      durationMs: 400,
    });
  });

  it("blocks offline requests immediately with OFFLINE and never calls fetch", async () => {
    const recorder = new EventRecorder();
    const fetchMock = okFetch();
    const slowFetch = createSlowFetch({ profile: PRESETS.offline, fetch: fetchMock, recorder });

    await expect(slowFetch("/api/products")).rejects.toMatchObject({ code: "OFFLINE" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recorder.getEvents()[0]).toMatchObject({ outcome: "offline", errorCode: "OFFLINE", durationMs: 0 });
  });

  it("fails with SIMULATED_FAILURE after the delay when the dice say so", async () => {
    const recorder = new EventRecorder();
    const fetchMock = okFetch();
    const slowFetch = createSlowFetch({
      profile: PRESETS.flaky,
      random: createSequenceRandom([0.5, 0.01]),
      fetch: fetchMock,
      recorder,
    });

    const assertion = expect(slowFetch("/api/products")).rejects.toBeInstanceOf(SlowNetError);
    await vi.advanceTimersByTimeAsync(250);
    await assertion;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recorder.getEvents()[0]).toMatchObject({ outcome: "simulated-failure", errorCode: "SIMULATED_FAILURE" });
  });

  it("times out when the simulated delay exceeds the timeout", async () => {
    const profile: NetworkProfile = { ...PRESETS["high-latency"], timeoutMs: 500 };
    const fetchMock = okFetch();
    const slowFetch = createSlowFetch({ profile, random: createSequenceRandom([0.5, 0.9]), fetch: fetchMock });

    const assertion = expect(slowFetch("/api/products")).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("times out when the real fetch is slow and aborts it", async () => {
    const profile: NetworkProfile = { ...PRESETS.stable, jitterMs: 0, timeoutMs: 1_000 };
    const fetchMock = hangingFetch();
    const slowFetch = createSlowFetch({ profile, random: createSequenceRandom([0.5, 0.9]), fetch: fetchMock });

    const assertion = expect(slowFetch("/api/products")).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    const signal = fetchMock.mock.calls[0]![1]!.signal!;
    expect(signal.aborted).toBe(true);
  });

  it("reports caller aborts as ABORTED", async () => {
    const recorder = new EventRecorder();
    const controller = new AbortController();
    const slowFetch = createSlowFetch({
      profile: PRESETS["slow-3g"],
      random: createSequenceRandom([0.5, 0.9]),
      fetch: okFetch(),
      recorder,
    });

    const assertion = expect(slowFetch("/api/products", { signal: controller.signal })).rejects.toMatchObject({
      code: "ABORTED",
    });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await assertion;
    expect(recorder.getEvents()[0]!.outcome).toBe("aborted");
  });

  it("records non-2xx responses as http-error without throwing", async () => {
    const recorder = new EventRecorder();
    const slowFetch = createSlowFetch({
      profile: { ...PRESETS.stable, jitterMs: 0 },
      random: createSequenceRandom([0.5, 0.9]),
      fetch: async () => new Response("nope", { status: 503 }),
      recorder,
    });

    const pending = slowFetch("/api/products");
    await vi.advanceTimersByTimeAsync(20);
    expect((await pending).status).toBe(503);
    expect(recorder.getEvents()[0]).toMatchObject({ outcome: "http-error", httpStatus: 503 });
  });

  it("wraps real network errors as NETWORK_ERROR", async () => {
    const slowFetch = createSlowFetch({
      profile: { ...PRESETS.stable, jitterMs: 0 },
      random: createSequenceRandom([0.5, 0.9]),
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });

    const assertion = expect(slowFetch("/api/products")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message: "Failed to fetch",
    });
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
  });

  it("leaves no timers behind after success, failure, timeout or offline", async () => {
    const run = async (profile: NetworkProfile, samples: number[]) => {
      const slowFetch = createSlowFetch({ profile, random: createSequenceRandom(samples), fetch: okFetch() });
      const settled = slowFetch("/x").catch(() => undefined);
      await vi.advanceTimersByTimeAsync(10_000);
      await settled;
    };

    await run(PRESETS.stable, [0.5, 0.9]);
    await run(PRESETS.flaky, [0.5, 0.01]);
    await run({ ...PRESETS["high-latency"], timeoutMs: 100 }, [0.5, 0.9]);
    await run(PRESETS.offline, [0.5]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("produces identical outcomes for the same seed", async () => {
    const runOnce = async () => {
      const recorder = new EventRecorder();
      const slowFetch = createSlowFetch({ profile: { ...PRESETS.flaky, seed: 99 }, fetch: okFetch(), recorder });
      for (let i = 0; i < 20; i += 1) {
        const settled = slowFetch(`/x/${i}`).catch(() => undefined);
        await vi.advanceTimersByTimeAsync(1_000);
        await settled;
      }
      return recorder.getEvents().map(({ simulatedDelayMs, outcome }) => ({ simulatedDelayMs, outcome }));
    };

    const first = await runOnce();
    expect(await runOnce()).toEqual(first);
    expect(first.some((event) => event.outcome === "simulated-failure")).toBe(true);
  });

  it("reads the latest profile on every request when given a getter", async () => {
    let profile: NetworkProfile = PRESETS.stable;
    const fetchMock = okFetch();
    const slowFetch = createSlowFetch({ profile: () => profile, random: createSequenceRandom([0.5, 0.9]), fetch: fetchMock });

    const first = slowFetch("/x");
    await vi.advanceTimersByTimeAsync(20);
    await first;

    profile = PRESETS.offline;
    await expect(slowFetch("/x")).rejects.toMatchObject({ code: "OFFLINE" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("records the profile in effect at attempt start and the caller's retry policy", async () => {
    const recorder = new EventRecorder();
    let profile: NetworkProfile = { ...PRESETS.flaky, seed: 7 };
    const slowFetch = createSlowFetch({ profile: () => profile, random: createSequenceRandom([0.5, 0.9]), fetch: okFetch(), recorder });

    const pending = slowFetch("/x", { retryPolicy: { maxRetries: 2, backoffMs: 300 } });
    profile = PRESETS.offline; // changing the profile mid-request must not rewrite the snapshot
    await vi.advanceTimersByTimeAsync(250);
    await pending;

    const [event] = recorder.getEvents();
    expect(event!.profileSnapshot).toEqual({ ...PRESETS.flaky, seed: 7 });
    expect(event!.retryPolicy).toEqual({ maxRetries: 2, backoffMs: 300 });
  });

  it("omits the retry policy when the caller does not pass one", async () => {
    const recorder = new EventRecorder();
    const slowFetch = createSlowFetch({ profile: PRESETS.offline, fetch: okFetch(), recorder });
    await expect(slowFetch("/x")).rejects.toMatchObject({ code: "OFFLINE" });
    expect(recorder.getEvents()[0]).not.toHaveProperty("retryPolicy");
  });
});
