import { describe, expect, it } from "vitest";
import {
  EventRecorder,
  PRESETS,
  buildReport,
  median,
  reportFileName,
  runReportSchema,
  serializeReport,
  summarize,
  type RequestEvent,
} from "../src";

const event = (overrides: Partial<RequestEvent>): RequestEvent => ({
  id: "evt",
  requestId: "req",
  label: "Fetch products",
  attempt: 1,
  method: "GET",
  url: "/api/products",
  profileId: "flaky",
  startedAt: 1_000,
  endedAt: 1_300,
  simulatedDelayMs: 250,
  durationMs: 300,
  outcome: "success",
  ...overrides,
});

const events: RequestEvent[] = [
  event({ id: "evt-1", requestId: "a", attempt: 1, outcome: "simulated-failure", startedAt: 0, endedAt: 250, durationMs: 250 }),
  event({ id: "evt-2", requestId: "a", attempt: 2, outcome: "success", startedAt: 250, endedAt: 600, durationMs: 350 }),
  event({ id: "evt-3", requestId: "b", attempt: 1, outcome: "offline", startedAt: 700, endedAt: 700, durationMs: 0 }),
  event({ id: "evt-4", requestId: "c", attempt: 1, outcome: "pending", startedAt: 800, endedAt: undefined, durationMs: undefined }),
];

describe("summarize", () => {
  it("counts logical requests by their final attempt", () => {
    expect(summarize(events)).toEqual({
      totalRequests: 3,
      totalAttempts: 4,
      succeeded: 1,
      failed: 1,
      pending: 1,
      retries: 1,
      medianDurationMs: 250,
      totalElapsedMs: 700,
    });
  });

  it("reports a null median when there are too few samples", () => {
    expect(summarize(events.slice(0, 2)).medianDurationMs).toBeNull();
  });

  it("handles an empty run", () => {
    expect(summarize([])).toMatchObject({ totalRequests: 0, medianDurationMs: null, totalElapsedMs: 0 });
  });
});

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("buildReport", () => {
  const profile = { ...PRESETS.flaky, seed: 42 };
  const report = buildReport({ profile, events, generatedAt: new Date("2026-10-22T10:00:00Z") });

  it("contains the profile, events, summary and reproduction steps", () => {
    expect(report.profile).toEqual(profile);
    expect(report.events).toHaveLength(4);
    expect(report.summary.retries).toBe(1);
    expect(report.reproduction.seed).toBe(42);
    expect(report.reproduction.steps).toContain("Set seed 42 and clear the run.");
    expect(report.reproduction.steps.filter((step) => step.startsWith("Trigger"))).toHaveLength(3);
  });

  it("serializes to JSON that validates against the schema", () => {
    const parsed = runReportSchema.parse(JSON.parse(serializeReport(report)));
    expect(parsed.generatedAt).toBe("2026-10-22T10:00:00.000Z");
  });

  it("keeps each attempt's profile snapshot and retry policy", () => {
    const withMeta = buildReport({
      profile,
      events: [event({ profileSnapshot: { ...PRESETS.flaky, seed: 1 }, retryPolicy: { maxRetries: 2, backoffMs: 300 } })],
    });
    expect(withMeta.events[0]).toMatchObject({
      profileSnapshot: { id: "flaky", seed: 1, failureRate: 0.25 },
      retryPolicy: { maxRetries: 2, backoffMs: 300 },
    });
  });

  it("warns that results are not reproducible without a seed", () => {
    const unseeded = buildReport({ profile: PRESETS.flaky, events: [] });
    expect(unseeded.reproduction.seed).toBeNull();
    expect(unseeded.reproduction.steps[1]).toMatch(/No seed/);
  });
});

describe("reportFileName", () => {
  it("includes the scenario name and the local date and time", () => {
    expect(reportFileName({ name: "Flaky Network" }, new Date(2026, 9, 22, 8, 5, 9))).toBe("slownet-flaky-network-2026-10-22-080509.json");
  });

  it("falls back to 'custom' when the name has no usable characters", () => {
    expect(reportFileName({ name: "—" }, new Date(2026, 0, 1, 0, 0, 0))).toBe("slownet-custom-2026-01-01-000000.json");
  });
});

describe("EventRecorder.clear", () => {
  it("ignores late updates from requests that started before the clear", () => {
    const recorder = new EventRecorder();
    const staleId = recorder.nextId();
    recorder.start(event({ id: staleId, outcome: "pending" }));
    recorder.clear();
    const freshId = recorder.nextId();
    recorder.start(event({ id: freshId, outcome: "pending" }));
    recorder.finish(staleId, { outcome: "aborted" });
    expect(recorder.getEvents()).toEqual([expect.objectContaining({ id: freshId, outcome: "pending" })]);
  });
});
