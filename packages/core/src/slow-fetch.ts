import { SlowNetError, isSlowNetError, outcomeForCode } from "./errors";
import type { EventRecorder } from "./event-recorder";
import { createSeededRandom } from "./random";
import { planAttempt, sleep } from "./simulation-engine";
import type { NetworkProfile, RandomSource, RecordedRetryPolicy } from "./types";

export type SlowFetchOptions = {
  /** A profile, or a getter so the active profile can change between requests. */
  profile: NetworkProfile | (() => NetworkProfile);
  /** Defaults to a seeded PRNG when the initial profile has a seed, otherwise Math.random. */
  random?: RandomSource;
  /** The real fetch to call after the simulated delay. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  recorder?: EventRecorder;
  /** Clock in epoch ms. Injectable for tests. */
  now?: () => number;
};

export type SlowFetchInit = RequestInit & {
  /** Human-readable name shown in the timeline, e.g. "Fetch products". */
  label?: string;
  /** Groups retries of the same logical request. Generated when omitted. */
  requestId?: string;
  /** 1 for the first try, 2 for the first retry, and so on. */
  attempt?: number;
  /** The retry policy around this call, recorded on the event. It does not change behaviour here. */
  retryPolicy?: RecordedRetryPolicy;
};

export type SlowFetch = (input: string | URL | Request, init?: SlowFetchInit) => Promise<Response>;

/**
 * Wraps fetch so every call goes through the network profile:
 * offline → blocked immediately; otherwise wait the simulated delay, maybe
 * fail, then call the real fetch. The whole attempt is bounded by timeoutMs.
 * The timeout covers the delay and response headers, not reading the body.
 */
export function createSlowFetch(options: SlowFetchOptions): SlowFetch {
  const getProfile = typeof options.profile === "function" ? options.profile : () => options.profile as NetworkProfile;
  const initialSeed = getProfile().seed;
  const random = options.random ?? (initialSeed !== undefined ? createSeededRandom(initialSeed) : Math.random);
  const fetchImpl = options.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const now = options.now ?? Date.now;
  const recorder = options.recorder;
  let requestCounter = 0;

  return async function slowFetch(input, init = {}) {
    const { label, requestId, attempt = 1, retryPolicy, ...fetchInit } = init;
    const profile = getProfile();
    const plan = planAttempt(profile, random);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (fetchInit.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const startedAt = now();
    const eventId = recorder?.nextId();

    if (recorder && eventId) {
      recorder.start({
        id: eventId,
        requestId: requestId ?? `req-${++requestCounter}`,
        label: label ?? `${method} ${url}`,
        attempt,
        method,
        url,
        profileId: profile.id,
        profileSnapshot: { ...profile },
        ...(retryPolicy && { retryPolicy: { ...retryPolicy } }),
        startedAt,
        simulatedDelayMs: plan.delayMs,
        outcome: "pending",
      });
    }

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => {
      controller.abort(new SlowNetError("TIMEOUT", `Timed out after ${profile.timeoutMs} ms`));
    }, profile.timeoutMs);
    const userSignal = fetchInit.signal;
    const onUserAbort = () => controller.abort(new SlowNetError("ABORTED", "The request was aborted"));
    if (userSignal?.aborted) onUserAbort();
    else userSignal?.addEventListener("abort", onUserAbort, { once: true });

    try {
      if (plan.verdict === "offline") {
        throw new SlowNetError("OFFLINE", "Blocked: the active profile is offline");
      }
      await sleep(plan.delayMs, controller.signal);
      if (plan.verdict === "fail") {
        throw new SlowNetError("SIMULATED_FAILURE", "Simulated network failure");
      }

      const response = await fetchImpl(input, { ...fetchInit, signal: controller.signal });
      if (recorder && eventId) {
        const endedAt = now();
        recorder.finish(eventId, {
          endedAt,
          durationMs: endedAt - startedAt,
          outcome: response.ok ? "success" : "http-error",
          httpStatus: response.status,
        });
      }
      return response;
    } catch (caught) {
      const error = toSlowNetError(caught, controller.signal);
      if (recorder && eventId) {
        const endedAt = now();
        recorder.finish(eventId, {
          endedAt,
          durationMs: endedAt - startedAt,
          outcome: outcomeForCode(error.code),
          errorCode: error.code,
          errorMessage: error.message,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutTimer);
      userSignal?.removeEventListener("abort", onUserAbort);
    }
  };
}

function toSlowNetError(caught: unknown, signal: AbortSignal): SlowNetError {
  if (isSlowNetError(caught)) return caught;
  if (signal.aborted && isSlowNetError(signal.reason)) return signal.reason;
  const message = caught instanceof Error ? caught.message : "Network request failed";
  return new SlowNetError("NETWORK_ERROR", message, { cause: caught });
}
