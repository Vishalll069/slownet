import type { RequestEvent } from "./types";

/**
 * How one logical request's wall-clock time splits up. For a settled request,
 * simulatedMs + executionMs + waitMs === wallMs exactly (all derived from recorded times).
 */
export type RequestTiming = {
  /** First attempt start to last attempt end. Undefined while the last attempt is pending. */
  wallMs: number | undefined;
  /** Delay the engine actually applied: per attempt, min(planned delay, attempt duration). */
  simulatedMs: number;
  /** Per attempt, duration minus applied delay: the real fetch plus timer overhead. */
  executionMs: number;
  /** Gaps between one attempt's end and the next attempt's start (retry backoff, scheduling). */
  waitMs: number;
  /** Sum of the delays the engine planned, including ones a timeout cut short or still pending. */
  plannedDelayMs: number;
  settled: boolean;
};

export type AttemptTiming = {
  /** Undefined while pending. */
  durationMs: number | undefined;
  appliedDelayMs: number;
  executionMs: number;
};

export function attemptTiming(event: RequestEvent): AttemptTiming {
  if (event.durationMs === undefined) return { durationMs: undefined, appliedDelayMs: 0, executionMs: 0 };
  const appliedDelayMs = Math.min(event.simulatedDelayMs, event.durationMs);
  return { durationMs: event.durationMs, appliedDelayMs, executionMs: event.durationMs - appliedDelayMs };
}

/** `attempts` are the events of one requestId, in any order. */
export function requestTiming(attempts: readonly RequestEvent[]): RequestTiming {
  const ordered = [...attempts].sort((a, b) => a.attempt - b.attempt);
  let simulatedMs = 0;
  let executionMs = 0;
  let waitMs = 0;
  let plannedDelayMs = 0;

  ordered.forEach((event, index) => {
    plannedDelayMs += event.simulatedDelayMs;
    const timing = attemptTiming(event);
    simulatedMs += timing.appliedDelayMs;
    executionMs += timing.executionMs;
    const previous = ordered[index - 1];
    if (previous?.endedAt !== undefined) waitMs += Math.max(event.startedAt - previous.endedAt, 0);
  });

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const settled = last !== undefined && last.endedAt !== undefined;
  return {
    wallMs: settled && first ? last.endedAt! - first.startedAt : undefined,
    simulatedMs,
    executionMs,
    waitMs,
    plannedDelayMs,
    settled,
  };
}

export const TIMING_DEFINITIONS = {
  origin: "Run-relative times are measured from the start of the run's first attempt.",
  wallMs: "First attempt start to last attempt end, measured with the browser clock (1 ms resolution).",
  simulatedMs: "Artificial delay the engine applied before sending: per attempt, the planned delay, cut short if the attempt timed out first.",
  executionMs: "Attempt duration minus applied delay: the real request to the demo API plus timer scheduling overhead (usually ≤ 2 ms).",
  waitMs: "Time between attempts: retry backoff plus scheduling. simulated + execution + wait = wall-clock.",
  determinism: "With a seed, the delays and verdicts (drop/offline/success) of each attempt are reproducible for the same sequence of attempts after Clear run. Wall-clock and execution times are measured, so they vary by a few milliseconds.",
} as const;
