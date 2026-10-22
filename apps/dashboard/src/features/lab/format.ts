import type { RequestEvent, RequestOutcome } from "@slownet/core";

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  return `${(ms / 1_000).toFixed(2)} s`;
}

/** Axis labels: shorter than formatMs and stable across ticks. */
export function formatTick(ms: number): string {
  if (ms === 0) return "0";
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  return `${(ms / 1_000).toFixed(ms % 1_000 === 0 ? 0 : 1)}s`;
}

/** Local wall-clock time with milliseconds, e.g. 08:03:42.531. */
export function formatClock(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

export type Tone = "success" | "warning" | "failure" | "neutral" | "muted";

export const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  failure: "text-failure",
  neutral: "text-neutral",
  muted: "text-muted",
};

export const TONE_BG: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  failure: "bg-failure",
  neutral: "bg-neutral",
  muted: "bg-muted",
};

export type StatusIconName = "check" | "cross" | "blocked" | "clock" | "pending" | "retry" | "cancel" | "alert";

/** `category` separates HTTP errors (the server answered) from transport failures and offline blocks. */
export type OutcomeView = { label: string; tone: Tone; icon: StatusIconName; category: string };

/** A success that used this share of its timeout is shown as a warning. */
export const SLOW_SHARE_OF_TIMEOUT = 0.75;

/** Colour is never the only signal: every outcome also has a label and an icon. */
export function describeOutcome(event: RequestEvent): OutcomeView {
  switch (event.outcome) {
    case "pending":
      return event.attempt > 1
        ? { label: "Retrying", tone: "warning", icon: "retry", category: "In flight · retry attempt" }
        : { label: "Running", tone: "neutral", icon: "pending", category: "In flight" };
    case "success": {
      const timeout = event.profileSnapshot?.timeoutMs;
      const slow = timeout !== undefined && (event.durationMs ?? 0) >= timeout * SLOW_SHARE_OF_TIMEOUT;
      return slow
        ? { label: `Slow ${event.httpStatus ?? ""}`.trim(), tone: "warning", icon: "clock", category: `Success · used ≥${SLOW_SHARE_OF_TIMEOUT * 100}% of the timeout` }
        : { label: `OK ${event.httpStatus ?? ""}`.trim(), tone: "success", icon: "check", category: "Success" };
    }
    case "http-error":
      return { label: `HTTP ${event.httpStatus ?? ""}`.trim(), tone: "failure", icon: "alert", category: "HTTP error · the server answered" };
    case "offline":
      return { label: "Offline", tone: "failure", icon: "blocked", category: "Blocked · offline, never sent" };
    case "timeout":
      return { label: "Timeout", tone: "failure", icon: "clock", category: "Transport · timed out" };
    case "simulated-failure":
      return { label: "Dropped", tone: "failure", icon: "cross", category: "Transport · dropped by the simulation" };
    case "aborted":
      return { label: "Cancelled", tone: "muted", icon: "cancel", category: "Cancelled · run cleared" };
    case "network-error":
      return { label: "Net error", tone: "failure", icon: "alert", category: "Transport · real network error" };
  }
}

export const OUTCOME_EXPLANATION: Record<Exclude<RequestOutcome, "pending" | "success">, string> = {
  offline: "The active profile is offline, so SlowNet blocked the request before it left the browser. Nothing reached the server.",
  "simulated-failure": "SlowNet dropped this attempt after the simulated delay, based on the profile's failure rate. The server never saw it.",
  timeout: "The simulated delay plus the time to response headers exceeded the profile's timeout, so the attempt was aborted.",
  aborted: "The run was cleared while this attempt was in flight, so it was cancelled before it settled.",
  "network-error": "The real fetch to the demo API failed after the simulated delay.",
  "http-error": "The demo API answered with a non-2xx status. SlowNet returns it as-is, like fetch.",
};

/** Run-relative offset, e.g. "+1.24 s". */
export function formatOffset(ms: number): string {
  return `+${formatMs(Math.max(ms, 0))}`;
}
