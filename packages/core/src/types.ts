/** A function returning a float in [0, 1), like Math.random. Injected so runs are reproducible. */
export type RandomSource = () => number;

export type NetworkProfile = {
  id: string;
  name: string;
  /** Base artificial delay added before the request is sent. Non-negative. */
  latencyMs: number;
  /** Max deviation from latencyMs, sampled uniformly from [-jitterMs, +jitterMs]. Non-negative. */
  jitterMs: number;
  /** Probability (0..1) that an attempt fails with SIMULATED_FAILURE. */
  failureRate: number;
  /** Total budget for simulated delay + response headers. Positive. */
  timeoutMs: number;
  /** When true, every request is blocked immediately with OFFLINE. */
  offline: boolean;
  /** Optional seed. Same seed + same request order = same delays and failures. */
  seed?: number;
};

export type SlowNetErrorCode =
  | "OFFLINE"
  | "TIMEOUT"
  | "SIMULATED_FAILURE"
  | "ABORTED"
  | "NETWORK_ERROR";

export type RequestOutcome =
  | "pending"
  | "success"
  | "http-error"
  | "offline"
  | "timeout"
  | "simulated-failure"
  | "aborted"
  | "network-error";

/** The retry policy the caller applied to a logical request, recorded for the report. */
export type RecordedRetryPolicy = {
  maxRetries: number;
  backoffMs: number;
};

/** One attempt of one logical request. Retries share a requestId and increment attempt. */
export type RequestEvent = {
  id: string;
  requestId: string;
  label: string;
  attempt: number;
  method: string;
  url: string;
  profileId: string;
  /** The profile values in effect when this attempt started; the active profile may change later. */
  profileSnapshot?: NetworkProfile;
  /** Present when the caller passed one; absent means the caller did not say. */
  retryPolicy?: RecordedRetryPolicy;
  /** Epoch ms when the attempt started. */
  startedAt: number;
  /** Epoch ms when the attempt settled. Undefined while pending. */
  endedAt?: number;
  /** Artificial delay chosen by the simulation engine. */
  simulatedDelayMs: number;
  /** Real wall-clock duration (simulated delay + actual fetch). Undefined while pending. */
  durationMs?: number;
  outcome: RequestOutcome;
  httpStatus?: number;
  errorCode?: SlowNetErrorCode;
  errorMessage?: string;
};
