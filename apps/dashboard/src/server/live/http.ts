import { LIVE_LIMITS, sessionIdSchema, type LiveState } from "@slownet/core";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { MemoryStore, type LiveStore, type StoredState } from "./store";
import { UpstashStore } from "./upstash";

/** Connected apps run on other origins, and nothing here uses cookies, so any origin may call the relay. */
export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
  "access-control-allow-headers": "content-type, x-slownet-key, last-event-id",
  "access-control-max-age": "86400",
};

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { ...CORS_HEADERS, "cache-control": "no-store" } });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

let store: LiveStore | null | undefined;

/** Upstash when configured (required on Vercel); in-memory locally; null when serverless without Redis. */
export function getStore(): LiveStore | null {
  if (store !== undefined) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) store = new UpstashStore(url, token, LIVE_LIMITS.sessionTtlSeconds);
  else if (process.env.VERCEL) store = null;
  else store = new MemoryStore(LIVE_LIMITS.sessionTtlSeconds * 1_000);
  return store;
}

export function notConfigured(): Response {
  return json(
    {
      error: "relay-not-configured",
      message: "Live sessions need shared storage on serverless hosts. Add Upstash Redis (UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN) to the deployment.",
    },
    503,
  );
}

export function parseSessionId(raw: string): string | null {
  const result = sessionIdSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function newSessionId(): string {
  return `s_${randomBytes(18).toString("base64url")}`;
}

export function newControlKey(): string {
  return `k_${randomBytes(24).toString("base64url")}`;
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function hasControl(request: Request, state: StoredState): boolean {
  const key = request.headers.get("x-slownet-key");
  if (!key) return false;
  const given = Buffer.from(hashKey(key), "hex");
  const expected = Buffer.from(state.keyHash, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function publicState(state: StoredState): LiveState {
  return { profile: state.profile, runId: state.runId, updatedAt: state.updatedAt };
}
