import { LIVE_LIMITS, liveEventsBatchSchema } from "@slownet/core";
import { getStore, json, notConfigured, parseSessionId, preflight } from "@/server/live/http";

export function OPTIONS() {
  return preflight();
}

/**
 * Receives attempt updates from a connected app. Anyone with the session id may report;
 * ids are namespaced per client so two apps can't overwrite each other's events.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/live/[session]/events">) {
  const store = getStore();
  if (!store) return notConfigured();
  const id = parseSessionId((await ctx.params).session);
  const state = id ? await store.getState(id) : null;
  if (!id || !state) return json({ error: "not-found" }, 404);

  const text = await request.text();
  if (text.length > LIVE_LIMITS.maxBatchBytes) return json({ error: "too-large", limit: LIVE_LIMITS.maxBatchBytes }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "invalid-json" }, 400);
  }
  const parsed = liveEventsBatchSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid-batch", issues: parsed.error.issues.slice(0, 5) }, 400);
  const batch = parsed.data;

  await store.touchClient(id, { clientId: batch.clientId, origin: batch.origin, lastSeenAt: Date.now() });
  // Events from before the latest Clear run are stale; tell the app which run is current.
  if (batch.runId !== state.runId) return json({ accepted: 0, runId: state.runId }, 409);

  const entries = batch.events.map((event) => ({
    runId: batch.runId,
    event: { ...event, id: `${batch.clientId}:${event.id}`, requestId: `${batch.clientId}:${event.requestId}` },
  }));
  // Each attempt is usually sent twice (start, settle), so the log holds two versions per attempt.
  const appended = await store.append(id, entries, LIVE_LIMITS.maxEventsPerRun * 2);
  if (!appended) return json({ error: "run-full", message: `This run reached ${LIVE_LIMITS.maxEventsPerRun} attempts. Clear the run to continue.` }, 429);
  return json({ accepted: entries.length, runId: state.runId });
}
