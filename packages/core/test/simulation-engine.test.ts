import { describe, expect, it } from "vitest";
import {
  PRESET_LIST,
  PRESETS,
  computeDelay,
  createSeededRandom,
  createSequenceRandom,
  networkProfileSchema,
  planAttempt,
} from "../src";

describe("computeDelay", () => {
  const profile = { latencyMs: 400, jitterMs: 150 };

  it("spans [latency - jitter, latency + jitter]", () => {
    expect(computeDelay(profile, 0)).toBe(250);
    expect(computeDelay(profile, 0.5)).toBe(400);
    expect(computeDelay(profile, 0.999999)).toBe(550);
  });

  it("never goes below zero", () => {
    expect(computeDelay({ latencyMs: 20, jitterMs: 300 }, 0)).toBe(0);
  });

  it("stays within bounds for many seeded samples", () => {
    const random = createSeededRandom(7);
    for (let i = 0; i < 1_000; i += 1) {
      const delay = computeDelay(profile, random());
      expect(delay).toBeGreaterThanOrEqual(250);
      expect(delay).toBeLessThanOrEqual(550);
    }
  });
});

describe("planAttempt", () => {
  it("blocks offline profiles with no delay", () => {
    expect(planAttempt(PRESETS.offline, createSequenceRandom([0.5]))).toEqual({ delayMs: 0, verdict: "offline" });
  });

  it("fails when the failure sample is below the failure rate", () => {
    const plan = planAttempt(PRESETS.flaky, createSequenceRandom([0.5, 0.1]));
    expect(plan).toEqual({ delayMs: 250, verdict: "fail" });
  });

  it("passes when the failure sample is at or above the failure rate", () => {
    expect(planAttempt(PRESETS.flaky, createSequenceRandom([0.5, 0.25])).verdict).toBe("pass");
  });

  it("never fails with a 0% failure rate", () => {
    expect(planAttempt(PRESETS.stable, createSequenceRandom([0.5, 0])).verdict).toBe("pass");
  });

  it("draws exactly two values per attempt, even offline", () => {
    let draws = 0;
    const counting = () => {
      draws += 1;
      return 0.5;
    };
    planAttempt(PRESETS.offline, counting);
    planAttempt(PRESETS.stable, counting);
    expect(draws).toBe(4);
  });
});

describe("createSeededRandom", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    expect(Array.from({ length: 10 }, a)).toEqual(Array.from({ length: 10 }, b));
  });

  it("produces different sequences for different seeds", () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);
    expect(Array.from({ length: 5 }, a)).not.toEqual(Array.from({ length: 5 }, b));
  });

  it("returns values in [0, 1)", () => {
    const random = createSeededRandom(123);
    for (let i = 0; i < 1_000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("seed 1 on Flaky fails the first attempt and passes the second (relied on by the E2E suite)", () => {
    const random = createSeededRandom(1);
    expect(planAttempt(PRESETS.flaky, random)).toEqual({ delayMs: 326, verdict: "fail" });
    expect(planAttempt(PRESETS.flaky, random)).toEqual({ delayMs: 266, verdict: "pass" });
  });

  it("matches the observed failure rate over many attempts", () => {
    const random = createSeededRandom(2024);
    const attempts = 10_000;
    let failures = 0;
    for (let i = 0; i < attempts; i += 1) {
      if (planAttempt(PRESETS.flaky, random).verdict === "fail") failures += 1;
    }
    expect(failures / attempts).toBeGreaterThan(0.23);
    expect(failures / attempts).toBeLessThan(0.27);
  });
});

describe("networkProfileSchema", () => {
  it("accepts every preset", () => {
    for (const preset of PRESET_LIST) expect(networkProfileSchema.safeParse(preset).success).toBe(true);
  });

  it.each([
    ["negative latency", { latencyMs: -1 }],
    ["negative jitter", { jitterMs: -5 }],
    ["failure rate above 1", { failureRate: 1.5 }],
    ["failure rate below 0", { failureRate: -0.1 }],
    ["zero timeout", { timeoutMs: 0 }],
    ["latency that would freeze the UI", { latencyMs: 10_000_000 }],
    ["non-integer seed", { seed: 1.5 }],
  ])("rejects %s", (_name, override) => {
    expect(networkProfileSchema.safeParse({ ...PRESETS.stable, ...override }).success).toBe(false);
  });
});
