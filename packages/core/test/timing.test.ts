import { describe, expect, it } from "vitest";
import { EventRecorder, attemptTiming, buildReport, PRESETS, requestTiming, type RequestEvent } from "../src";

const attempt = (overrides: Partial<RequestEvent>): RequestEvent => ({
  id: "evt",
  requestId: "req",
  label: "Fetch catalog",
  attempt: 1,
  method: "GET",
  url: "/api/demo/catalog",
  profileId: "flaky",
  startedAt: 0,
  endedAt: 300,
  simulatedDelayMs: 250,
  durationMs: 300,
  outcome: "success",
  ...overrides,
});

const sumOf = (timing: ReturnType<typeof requestTiming>) => timing.simulatedMs + timing.executionMs + timing.waitMs;

describe("requestTiming", () => {
  it("splits one successful attempt into applied delay and execution", () => {
    const timing = requestTiming([attempt({})]);
    expect(timing).toMatchObject({ wallMs: 300, simulatedMs: 250, executionMs: 50, waitMs: 0, plannedDelayMs: 250, settled: true });
    expect(sumOf(timing)).toBe(timing.wallMs);
  });

  it("counts retry backoff as wait, so the parts reconcile with wall-clock", () => {
    const timing = requestTiming([
      attempt({ id: "a2", attempt: 2, startedAt: 560, endedAt: 900, simulatedDelayMs: 300, durationMs: 340 }),
      attempt({ id: "a1", attempt: 1, outcome: "simulated-failure", startedAt: 0, endedAt: 261, simulatedDelayMs: 260, durationMs: 261 }),
    ]);
    expect(timing).toMatchObject({ wallMs: 900, simulatedMs: 560, executionMs: 41, waitMs: 299 });
    expect(sumOf(timing)).toBe(900);
  });

  it("caps applied delay at the duration when a timeout cuts the delay short", () => {
    const timing = requestTiming([attempt({ outcome: "timeout", simulatedDelayMs: 5_000, durationMs: 1_000, endedAt: 1_000 })]);
    expect(timing).toMatchObject({ wallMs: 1_000, simulatedMs: 1_000, executionMs: 0, plannedDelayMs: 5_000 });
  });

  it("treats an offline block as zero delay and zero execution", () => {
    const timing = requestTiming([attempt({ outcome: "offline", simulatedDelayMs: 0, durationMs: 0, endedAt: 0 })]);
    expect(timing).toMatchObject({ wallMs: 0, simulatedMs: 0, executionMs: 0 });
  });

  it("reports a pending request as unsettled, with only its planned delay", () => {
    const timing = requestTiming([attempt({ outcome: "pending", endedAt: undefined, durationMs: undefined, simulatedDelayMs: 900 })]);
    expect(timing).toMatchObject({ wallMs: undefined, settled: false, simulatedMs: 0, plannedDelayMs: 900 });
    expect(attemptTiming(attempt({ durationMs: undefined, endedAt: undefined }))).toEqual({ durationMs: undefined, appliedDelayMs: 0, executionMs: 0 });
  });
});

describe("buildReport requests", () => {
  it("adds per-request timing that matches requestTiming, plus definitions and environment", () => {
    const events = [
      attempt({ id: "a1", outcome: "simulated-failure", startedAt: 0, endedAt: 261, simulatedDelayMs: 260, durationMs: 261 }),
      attempt({ id: "a2", attempt: 2, startedAt: 560, endedAt: 900, simulatedDelayMs: 300, durationMs: 340 }),
    ];
    const report = buildReport({ profile: PRESETS.flaky, events, userAgent: "test-agent" });
    expect(report.requests).toEqual([
      { requestId: "req", label: "Fetch catalog", method: "GET", url: "/api/demo/catalog", attempts: 2, finalOutcome: "success", wallMs: 900, simulatedMs: 560, executionMs: 41, waitMs: 299 },
    ]);
    expect(report.timingDefinitions.wallMs).toMatch(/First attempt start/);
    expect(report.environment.userAgent).toBe("test-agent");
  });
});

describe("EventRecorder.restore", () => {
  it("puts back a cleared snapshot and keeps ids unique afterwards", () => {
    const recorder = new EventRecorder();
    const id = recorder.nextId();
    recorder.start(attempt({ id }));
    const snapshot = recorder.getEvents();
    recorder.clear();
    recorder.restore(snapshot);
    expect(recorder.getEvents()).toEqual(snapshot);
    expect(recorder.nextId()).not.toBe(id);
  });
});
