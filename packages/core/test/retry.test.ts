import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EventRecorder,
  MAX_RETRIES_CEILING,
  PRESETS,
  SlowNetError,
  createSequenceRandom,
  createSlowFetch,
  withRetry,
} from "../src";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const failure = () => new SlowNetError("SIMULATED_FAILURE", "boom");

describe("withRetry", () => {
  it("returns the first success without retrying", async () => {
    const operation = vi.fn(async () => "ok");
    await expect(withRetry(operation)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries retryable errors and succeeds", async () => {
    const operation = vi.fn(async (attempt: number) => {
      if (attempt < 2) throw failure();
      return "ok";
    });
    await expect(withRetry(operation)).resolves.toBe("ok");
    expect(operation.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2]);
  });

  it("gives up after maxRetries (default 2) and rethrows the last error", async () => {
    const operation = vi.fn(async () => {
      throw failure();
    });
    await expect(withRetry(operation)).rejects.toMatchObject({ code: "SIMULATED_FAILURE" });
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("does not retry offline errors", async () => {
    const operation = vi.fn(async () => {
      throw new SlowNetError("OFFLINE", "offline");
    });
    await expect(withRetry(operation)).rejects.toMatchObject({ code: "OFFLINE" });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("caps maxRetries at the ceiling", async () => {
    const operation = vi.fn(async () => {
      throw failure();
    });
    await expect(withRetry(operation, { maxRetries: 1_000 })).rejects.toBeInstanceOf(SlowNetError);
    expect(operation).toHaveBeenCalledTimes(MAX_RETRIES_CEILING + 1);
  });

  it("applies exponential backoff between retries", async () => {
    const operation = vi.fn(async () => {
      throw failure();
    });
    const assertion = expect(withRetry(operation, { backoffMs: 100 })).rejects.toBeInstanceOf(SlowNetError);
    await vi.advanceTimersByTimeAsync(99);
    expect(operation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(operation).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200);
    await assertion;
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("records each attempt under one requestId when combined with slowFetch", async () => {
    const recorder = new EventRecorder();
    const slowFetch = createSlowFetch({
      profile: { ...PRESETS.flaky, jitterMs: 0 },
      // attempt 1 fails, attempt 2 passes
      random: createSequenceRandom([0.5, 0.01, 0.5, 0.9]),
      fetch: async () => new Response("[]"),
      recorder,
    });

    const pending = withRetry((attempt) => slowFetch("/api/products", { requestId: "load", attempt }));
    await vi.advanceTimersByTimeAsync(500);
    await pending;

    expect(recorder.getEvents().map(({ requestId, attempt, outcome }) => ({ requestId, attempt, outcome }))).toEqual([
      { requestId: "load", attempt: 1, outcome: "simulated-failure" },
      { requestId: "load", attempt: 2, outcome: "success" },
    ]);
  });
});
