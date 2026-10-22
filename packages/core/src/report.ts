import { z } from "zod";
import { networkProfileSchema } from "./profiles";
import { TIMING_DEFINITIONS, requestTiming } from "./timing";
import type { NetworkProfile, RequestEvent } from "./types";

/** Median is only meaningful with a few samples; below this we report null. */
export const MIN_SAMPLES_FOR_MEDIAN = 3;

export type RunSummary = {
  /** Logical requests (retries of one request count once). */
  totalRequests: number;
  totalAttempts: number;
  succeeded: number;
  failed: number;
  pending: number;
  retries: number;
  /** Median wall-clock duration of settled attempts, or null if too few samples. */
  medianDurationMs: number | null;
  /** From the first attempt start to the last attempt end. */
  totalElapsedMs: number;
};

export function summarize(events: readonly RequestEvent[]): RunSummary {
  const finalAttemptByRequest = new Map<string, RequestEvent>();
  for (const event of events) {
    const previous = finalAttemptByRequest.get(event.requestId);
    if (!previous || event.attempt >= previous.attempt) finalAttemptByRequest.set(event.requestId, event);
  }

  let succeeded = 0;
  let failed = 0;
  let pending = 0;
  for (const event of finalAttemptByRequest.values()) {
    if (event.outcome === "pending") pending += 1;
    else if (event.outcome === "success") succeeded += 1;
    else failed += 1;
  }

  const durations = events
    .map((event) => event.durationMs)
    .filter((duration): duration is number => duration !== undefined);

  const starts = events.map((event) => event.startedAt);
  const ends = events.map((event) => event.endedAt).filter((end): end is number => end !== undefined);
  const totalElapsedMs = starts.length && ends.length ? Math.max(...ends) - Math.min(...starts) : 0;

  return {
    totalRequests: finalAttemptByRequest.size,
    totalAttempts: events.length,
    succeeded,
    failed,
    pending,
    retries: events.filter((event) => event.attempt > 1).length,
    medianDurationMs: durations.length >= MIN_SAMPLES_FOR_MEDIAN ? median(durations) : null,
    totalElapsedMs,
  };
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export const requestEventSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  label: z.string(),
  attempt: z.number().int().positive(),
  method: z.string(),
  url: z.string(),
  profileId: z.string(),
  profileSnapshot: networkProfileSchema.optional(),
  retryPolicy: z.object({ maxRetries: z.number().int().min(0), backoffMs: z.number().min(0) }).optional(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  simulatedDelayMs: z.number().min(0),
  durationMs: z.number().min(0).optional(),
  outcome: z.enum([
    "pending",
    "success",
    "http-error",
    "offline",
    "timeout",
    "simulated-failure",
    "aborted",
    "network-error",
  ]),
  httpStatus: z.number().int().optional(),
  errorCode: z.enum(["OFFLINE", "TIMEOUT", "SIMULATED_FAILURE", "ABORTED", "NETWORK_ERROR"]).optional(),
  errorMessage: z.string().optional(),
});

export const runReportSchema = z.object({
  tool: z.literal("slownet"),
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime(),
  profile: networkProfileSchema,
  summary: z.object({
    totalRequests: z.number().int().min(0),
    totalAttempts: z.number().int().min(0),
    succeeded: z.number().int().min(0),
    failed: z.number().int().min(0),
    pending: z.number().int().min(0),
    retries: z.number().int().min(0),
    medianDurationMs: z.number().min(0).nullable(),
    totalElapsedMs: z.number().min(0),
  }),
  events: z.array(requestEventSchema),
  /** One entry per logical request, with the same timing split the UI shows. */
  requests: z.array(
    z.object({
      requestId: z.string(),
      label: z.string(),
      method: z.string(),
      url: z.string(),
      attempts: z.number().int().positive(),
      finalOutcome: requestEventSchema.shape.outcome,
      wallMs: z.number().min(0).nullable(),
      simulatedMs: z.number().min(0),
      executionMs: z.number().min(0),
      waitMs: z.number().min(0),
    }),
  ),
  timingDefinitions: z.record(z.string(), z.string()),
  environment: z.object({ userAgent: z.string().nullable() }),
  reproduction: z.object({
    seed: z.number().int().nullable(),
    steps: z.array(z.string()),
    note: z.string(),
  }),
});

export type RunReport = z.infer<typeof runReportSchema>;

export function buildReport(input: {
  profile: NetworkProfile;
  events: readonly RequestEvent[];
  generatedAt?: Date;
  /** Recorded as-is; pass navigator.userAgent in the browser. */
  userAgent?: string;
}): RunReport {
  const { profile, events } = input;
  const byRequest = new Map<string, RequestEvent[]>();
  for (const event of events) byRequest.set(event.requestId, [...(byRequest.get(event.requestId) ?? []), event]);
  const requests = [...byRequest.entries()].map(([requestId, attempts]) => {
    const ordered = [...attempts].sort((a, b) => a.attempt - b.attempt);
    const timing = requestTiming(ordered);
    const first = ordered[0]!;
    return {
      requestId,
      label: first.label,
      method: first.method,
      url: first.url,
      attempts: ordered.length,
      finalOutcome: ordered[ordered.length - 1]!.outcome,
      wallMs: timing.wallMs ?? null,
      simulatedMs: timing.simulatedMs,
      executionMs: timing.executionMs,
      waitMs: timing.waitMs,
    };
  });
  const steps = [
    `Apply profile "${profile.name}" (latency ${profile.latencyMs} ms, jitter ±${profile.jitterMs} ms, failure rate ${Math.round(profile.failureRate * 100)}%, timeout ${profile.timeoutMs} ms, offline ${profile.offline ? "on" : "off"}).`,
    profile.seed !== undefined
      ? `Set seed ${profile.seed} and clear the run.`
      : "No seed was set; outcomes will differ between runs. Set a seed to make them reproducible.",
    ...events.filter((event) => event.attempt === 1).map((event) => `Trigger "${event.label}".`),
  ];

  const report: RunReport = {
    tool: "slownet",
    schemaVersion: 1,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    profile,
    summary: summarize(events),
    events: [...events],
    requests,
    timingDefinitions: { ...TIMING_DEFINITIONS },
    environment: { userAgent: input.userAgent ?? null },
    reproduction: {
      seed: profile.seed ?? null,
      steps,
      note: "Delays and failures are simulated in the browser. They do not reproduce radio, DNS, TLS, packet loss or OS-level behaviour.",
    },
  };
  return runReportSchema.parse(report);
}

/** e.g. `slownet-flaky-network-2026-10-22-081530.json`: local date and time plus the scenario (profile) name. */
export function reportFileName(profile: Pick<NetworkProfile, "name">, date: Date): string {
  const slug = profile.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom";
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `slownet-${slug}-${stamp}.json`;
}

export function serializeReport(report: RunReport): string {
  return JSON.stringify(runReportSchema.parse(report), null, 2);
}
