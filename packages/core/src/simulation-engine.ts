import { SlowNetError } from "./errors";
import type { NetworkProfile, RandomSource } from "./types";

export type SimulationPlan = {
  /** Artificial delay to wait before sending (0 when offline). */
  delayMs: number;
  /** What the engine decided for this attempt, before the real fetch runs. */
  verdict: "offline" | "fail" | "pass";
};

/**
 * Jitter is uniform in [-jitterMs, +jitterMs]; the result is clamped at 0.
 * `sample` must be in [0, 1).
 */
export function computeDelay(profile: Pick<NetworkProfile, "latencyMs" | "jitterMs">, sample: number): number {
  const jitter = (sample * 2 - 1) * profile.jitterMs;
  return Math.max(0, Math.round(profile.latencyMs + jitter));
}

/**
 * Decides the fate of one attempt. Always draws exactly two random values
 * (jitter, then failure) so a seed yields the same sequence regardless of
 * which profile is active.
 */
export function planAttempt(profile: NetworkProfile, random: RandomSource): SimulationPlan {
  const jitterSample = random();
  const failureSample = random();

  if (profile.offline) return { delayMs: 0, verdict: "offline" };

  const delayMs = computeDelay(profile, jitterSample);
  const verdict = failureSample < profile.failureRate ? "fail" : "pass";
  return { delayMs, verdict };
}

/** setTimeout as a promise that rejects with signal.reason when aborted, and always clears its timer. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new SlowNetError("ABORTED", "The request was aborted");
}
