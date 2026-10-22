import { z } from "zod";
import { networkProfileSchema } from "../profiles";
import { requestEventSchema } from "../report";
import { LIVE_PROTOCOL_VERSION, SESSION_ID_PATTERN } from "./types";

/** Server-side limits. The relay rejects anything larger rather than truncating silently. */
export const LIVE_LIMITS = {
  maxEventsPerBatch: 100,
  maxEventsPerRun: 2_000,
  maxBatchBytes: 128 * 1024,
  maxLabelLength: 200,
  maxUrlLength: 2_048,
  sessionTtlSeconds: 24 * 60 * 60,
  /** An app counts as connected if it was seen this recently. */
  clientFreshMs: 15_000,
} as const;

export const sessionIdSchema = z.string().regex(SESSION_ID_PATTERN);

const liveEventSchema = requestEventSchema.extend({
  label: z.string().max(LIVE_LIMITS.maxLabelLength),
  url: z.string().max(LIVE_LIMITS.maxUrlLength),
  requestId: z.string().max(128),
  id: z.string().max(128),
  profileSnapshot: networkProfileSchema.optional(),
});

export const liveEventsBatchSchema = z.object({
  protocol: z.literal(LIVE_PROTOCOL_VERSION),
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  runId: z.number().int().min(1),
  origin: z.string().max(256),
  events: z.array(liveEventSchema).max(LIVE_LIMITS.maxEventsPerBatch),
});

export const liveProfileUpdateSchema = z.object({ profile: networkProfileSchema });
