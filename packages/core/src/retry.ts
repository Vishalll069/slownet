import { isRetryableError } from "./errors";
import { sleep } from "./simulation-engine";

/** Hard ceiling so a misconfigured policy can never retry forever. */
export const MAX_RETRIES_CEILING = 5;

export type RetryPolicy = {
  /** Retries after the first attempt. Default 2, capped at MAX_RETRIES_CEILING. */
  maxRetries?: number;
  /** Delay before the first retry; doubles on each later retry. Default 0. */
  backoffMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, nextAttempt: number) => void;
  signal?: AbortSignal;
};

/** Runs `operation(attempt)` (attempt starts at 1) and retries retryable failures with a bounded policy. */
export async function withRetry<T>(operation: (attempt: number) => Promise<T>, policy: RetryPolicy = {}): Promise<T> {
  const maxRetries = Math.min(Math.max(0, policy.maxRetries ?? 2), MAX_RETRIES_CEILING);
  const backoffMs = Math.max(0, policy.backoffMs ?? 0);
  const shouldRetry = policy.shouldRetry ?? isRetryableError;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      const retriesUsed = attempt - 1;
      if (retriesUsed >= maxRetries || !shouldRetry(error, attempt)) throw error;
      policy.onRetry?.(error, attempt + 1);
      if (backoffMs > 0) await sleep(backoffMs * 2 ** retriesUsed, policy.signal);
    }
  }
}
