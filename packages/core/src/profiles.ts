import { z } from "zod";
import type { NetworkProfile } from "./types";

/** Upper bounds keep a mistyped value from freezing the UI for minutes. */
export const PROFILE_LIMITS = {
  maxLatencyMs: 60_000,
  maxJitterMs: 30_000,
  maxTimeoutMs: 120_000,
} as const;

export const networkProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  latencyMs: z.number().int().min(0).max(PROFILE_LIMITS.maxLatencyMs),
  jitterMs: z.number().int().min(0).max(PROFILE_LIMITS.maxJitterMs),
  failureRate: z.number().min(0).max(1),
  timeoutMs: z.number().int().positive().max(PROFILE_LIMITS.maxTimeoutMs),
  offline: z.boolean(),
  seed: z.number().int().min(0).max(0xffff_ffff).optional(),
});

export function parseProfile(input: unknown): NetworkProfile {
  return networkProfileSchema.parse(input) as NetworkProfile;
}

export type PresetId = "stable" | "slow-3g" | "high-latency" | "flaky" | "offline";

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Illustrative starting points, not claims about real network types.
 * Values stay visible and editable in the UI.
 */
export const PRESETS: Record<PresetId, NetworkProfile> = {
  stable: {
    id: "stable",
    name: "Stable",
    latencyMs: 20,
    jitterMs: 5,
    failureRate: 0,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    offline: false,
  },
  "slow-3g": {
    id: "slow-3g",
    name: "Slow 3G",
    latencyMs: 400,
    jitterMs: 150,
    failureRate: 0.02,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    offline: false,
  },
  "high-latency": {
    id: "high-latency",
    name: "High Latency",
    latencyMs: 900,
    jitterMs: 100,
    failureRate: 0,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    offline: false,
  },
  flaky: {
    id: "flaky",
    name: "Flaky Network",
    latencyMs: 250,
    jitterMs: 300,
    failureRate: 0.25,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    offline: false,
  },
  offline: {
    id: "offline",
    name: "Offline",
    latencyMs: 0,
    jitterMs: 0,
    failureRate: 0,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    offline: true,
  },
};

export const PRESET_LIST: readonly NetworkProfile[] = Object.values(PRESETS);
