import { requestTiming, type RequestEvent, type RequestTiming } from "@slownet/core";

/** One logical request: its attempts in order, as recorded by the engine. */
export type TimelineRequest = {
  requestId: string;
  label: string;
  method: string;
  url: string;
  attempts: RequestEvent[];
  first: RequestEvent;
  last: RequestEvent;
  startedAt: number;
  /** Undefined while the latest attempt is pending. */
  endedAt: number | undefined;
  timing: RequestTiming;
  retries: number;
};

export function groupRequests(events: readonly RequestEvent[]): TimelineRequest[] {
  const byId = new Map<string, RequestEvent[]>();
  for (const event of events) {
    const attempts = byId.get(event.requestId);
    if (attempts) attempts.push(event);
    else byId.set(event.requestId, [event]);
  }

  return [...byId.entries()]
    .map(([requestId, unsorted]) => {
      const attempts = [...unsorted].sort((a, b) => a.attempt - b.attempt);
      const first = attempts[0]!;
      const last = attempts[attempts.length - 1]!;
      return {
        requestId,
        label: first.label,
        method: first.method,
        url: first.url,
        attempts,
        first,
        last,
        startedAt: first.startedAt,
        endedAt: last.endedAt,
        timing: requestTiming(attempts),
        retries: attempts.length - 1,
      };
    })
    .sort((a, b) => a.startedAt - b.startedAt);
}

export type FilterId = "all" | "successful" | "failed" | "retried" | "blocked" | "timed-out";

export const FILTERS: { id: FilterId; label: string; test: (request: TimelineRequest) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "successful", label: "Successful", test: (request) => request.last.outcome === "success" },
  { id: "failed", label: "Failed", test: (request) => request.last.outcome !== "success" && request.last.outcome !== "pending" },
  { id: "retried", label: "Retried", test: (request) => request.retries > 0 },
  { id: "blocked", label: "Blocked", test: (request) => request.attempts.some((attempt) => attempt.outcome === "offline") },
  { id: "timed-out", label: "Timed out", test: (request) => request.attempts.some((attempt) => attempt.outcome === "timeout") },
];

/** The run's time origin and the end of everything recorded so far, as run-relative ms. */
export type RunExtent = { origin: number; endMs: number };

export function runExtent(requests: readonly TimelineRequest[], now: number): RunExtent {
  if (requests.length === 0) return { origin: 0, endMs: 1_000 };
  const origin = Math.min(...requests.map((request) => request.startedAt));
  const end = Math.max(...requests.map((request) => request.endedAt ?? Math.max(now, request.startedAt)));
  return { origin, endMs: Math.max(end - origin, 1) };
}

/** A visible window on the run, in run-relative ms. */
export type ViewWindow = { startMs: number; endMs: number };

export type TimeScale = ViewWindow & { origin: number; ticks: number[]; fitted: boolean };

/** Fitted views add a 4% margin after the last event, so endpoint markers aren't cut off. */
const FIT_MARGIN = 1.04;

/** Ticks on a 1–2–5 step, inside the visible window. */
export function buildScale(extent: RunExtent, view: ViewWindow | null, targetTicks = 4): TimeScale {
  const startMs = view?.startMs ?? 0;
  const rawEnd = view?.endMs ?? extent.endMs * FIT_MARGIN;
  const span = Math.max(rawEnd - startMs, 1);
  const roughStep = span / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const endMs = rawEnd;

  const ticks: number[] = [];
  for (let tick = Math.ceil(startMs / step) * step; tick <= endMs + step / 1000; tick += step) ticks.push(tick);
  return { origin: extent.origin, startMs, endMs, ticks, fitted: view === null };
}

export const MIN_VIEW_MS = 20;

export function zoomView(scale: TimeScale, extent: RunExtent, factor: number, centerMs?: number): ViewWindow | null {
  const span = scale.endMs - scale.startMs;
  const nextSpan = Math.max(span * factor, MIN_VIEW_MS);
  if (nextSpan >= extent.endMs * FIT_MARGIN) return null; // zoomed all the way out = fit
  const center = centerMs ?? scale.startMs + span / 2;
  const startMs = Math.min(Math.max(center - nextSpan / 2, 0), Math.max(extent.endMs - nextSpan, 0));
  return { startMs, endMs: startMs + nextSpan };
}

export function panView(scale: TimeScale, extent: RunExtent, direction: -1 | 1): ViewWindow | null {
  if (scale.fitted) return null;
  const span = scale.endMs - scale.startMs;
  const startMs = Math.min(Math.max(scale.startMs + (direction * span) / 2, 0), Math.max(extent.endMs - span, 0));
  return { startMs, endMs: startMs + span };
}
