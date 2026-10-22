import { liveProfileUpdateSchema } from "@slownet/core";
import { getStore, hasControl, json, notConfigured, parseSessionId, preflight, publicState } from "@/server/live/http";

export function OPTIONS() {
  return preflight();
}

export async function GET(_request: Request, ctx: RouteContext<"/api/live/[session]/state">) {
  const store = getStore();
  if (!store) return notConfigured();
  const id = parseSessionId((await ctx.params).session);
  const state = id ? await store.getState(id) : null;
  return state ? json(publicState(state)) : json({ error: "not-found" }, 404);
}

/** Changes the profile connected apps apply. Requires the session's control key. */
export async function PUT(request: Request, ctx: RouteContext<"/api/live/[session]/state">) {
  const store = getStore();
  if (!store) return notConfigured();
  const id = parseSessionId((await ctx.params).session);
  const state = id ? await store.getState(id) : null;
  if (!id || !state) return json({ error: "not-found" }, 404);
  if (!hasControl(request, state)) return json({ error: "forbidden", message: "A control key is required to change this session." }, 403);

  const parsed = liveProfileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid-profile", issues: parsed.error.issues }, 400);
  const next = { ...state, profile: parsed.data.profile, updatedAt: Date.now() };
  await store.setState(id, next);
  return json(publicState(next));
}
