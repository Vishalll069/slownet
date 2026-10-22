import { PRESETS, liveProfileUpdateSchema } from "@slownet/core";
import { getStore, hashKey, json, newControlKey, newSessionId, notConfigured, publicState } from "@/server/live/http";

/** Creates a live session. The control key is returned once; only its hash is stored. */
export async function POST(request: Request) {
  const store = getStore();
  if (!store) return notConfigured();

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = liveProfileUpdateSchema.safeParse(body);
  const now = Date.now();
  const sessionId = newSessionId();
  const controlKey = newControlKey();
  const state = { profile: parsed.success ? parsed.data.profile : PRESETS.stable, runId: 1, createdAt: now, updatedAt: now, keyHash: hashKey(controlKey) };
  await store.create(sessionId, state);
  return json({ sessionId, controlKey, state: publicState(state), storage: store.kind }, 201);
}
