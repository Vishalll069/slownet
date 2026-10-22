import type { RequestOutcome, SlowNetErrorCode } from "./types";

export class SlowNetError extends Error {
  readonly code: SlowNetErrorCode;

  constructor(code: SlowNetErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SlowNetError";
    this.code = code;
  }
}

export function isSlowNetError(value: unknown): value is SlowNetError {
  return value instanceof SlowNetError;
}

const OUTCOME_BY_CODE: Record<SlowNetErrorCode, RequestOutcome> = {
  OFFLINE: "offline",
  TIMEOUT: "timeout",
  SIMULATED_FAILURE: "simulated-failure",
  ABORTED: "aborted",
  NETWORK_ERROR: "network-error",
};

export function outcomeForCode(code: SlowNetErrorCode): RequestOutcome {
  return OUTCOME_BY_CODE[code];
}

/** Errors worth retrying automatically. Offline and user aborts are not: retrying cannot help. */
export function isRetryableError(error: unknown): boolean {
  if (!isSlowNetError(error)) return false;
  return error.code === "TIMEOUT" || error.code === "SIMULATED_FAILURE" || error.code === "NETWORK_ERROR";
}
