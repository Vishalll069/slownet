import { getStore, hasControl, json, notConfigured, parseSessionId, preflight, publicState } from "@/server/live/http";

export function OPTIONS() {
  return preflight();
}

/** Starts a new run: connected apps reset their random sequence and older events are dropped. */
export async function POST(request: Request, ctx: RouteContext<"/api/live/[session]/clear">) {
  const store = getStore();
  if (!store) return notConfigured();
  const id = parseSessionId((await ctx.params).session);
  const state = id ? await store.getState(id) : null;
  if (!id || !state) return json({ error: "not-found" }, 404);
  if (!hasControl(request, state)) return json({ error: "forbidden", message: "A control key is required to clear this session." }, 403);

  const next = { ...state, runId: state.runId + 1, updatedAt: Date.now() };
  await store.resetLog(id);
  await store.setState(id, next);
  return json(publicState(next));
}
