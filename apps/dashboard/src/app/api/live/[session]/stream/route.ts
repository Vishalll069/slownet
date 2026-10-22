import { LIVE_LIMITS, type LiveClientInfo } from "@slownet/core";
import { CORS_HEADERS, getStore, notConfigured, parseSessionId, publicState } from "@/server/live/http";

/** Each connection lives under a minute; EventSource reconnects and resumes from Last-Event-ID. */
export const maxDuration = 60;
const CONNECTION_MS = 50_000;
const HEARTBEAT_MS = 15_000;
const POLL_MS = { dashboard: 400, app: 800 } as const;
const CLIENTS_EVERY_MS = 2_000;

const encoder = new TextEncoder();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(request: Request, ctx: RouteContext<"/api/live/[session]/stream">) {
  const store = getStore();
  if (!store) return notConfigured();
  const id = parseSessionId((await ctx.params).session);
  if (!id || !(await store.getState(id))) return new Response("not found", { status: 404, headers: CORS_HEADERS });
  const role = new URL(request.url).searchParams.get("role") === "dashboard" ? "dashboard" : "app";

  // Resume point "runId:cursor" from the previous connection, if any.
  const [resumeRun, resumeCursor] = (request.headers.get("last-event-id") ?? "").split(":").map(Number);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown, eventId?: string) =>
        controller.enqueue(encoder.encode(`${eventId ? `id: ${eventId}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      controller.enqueue(encoder.encode("retry: 1000\n\n"));

      const started = Date.now();
      let lastUpdatedAt = -1;
      let runId = -1;
      let cursor = 0;
      let lastHeartbeat = started;
      let lastClients = 0;

      try {
        while (!request.signal.aborted && Date.now() - started < CONNECTION_MS) {
          const state = await store.getState(id);
          if (!state) {
            send("gone", { reason: "Session expired or removed." });
            break;
          }
          if (state.runId !== runId) {
            cursor = runId === -1 && resumeRun === state.runId && Number.isFinite(resumeCursor) ? resumeCursor! : 0;
            runId = state.runId;
            lastUpdatedAt = -1;
          }
          if (state.updatedAt !== lastUpdatedAt) {
            send("state", publicState(state), `${runId}:${cursor}`);
            lastUpdatedAt = state.updatedAt;
          }

          if (role === "dashboard") {
            const entries = await store.read(id, cursor);
            if (entries.length > 0) {
              cursor += entries.length;
              const events = entries.filter((entry) => entry.runId === runId).map((entry) => entry.event);
              if (events.length > 0) send("events", { runId, events }, `${runId}:${cursor}`);
            }
            if (Date.now() - lastClients >= CLIENTS_EVERY_MS) {
              const clients: LiveClientInfo[] = (await store.listClients(id)).filter((client) => Date.now() - client.lastSeenAt < LIVE_LIMITS.clientFreshMs);
              send("clients", { clients });
              lastClients = Date.now();
            }
          }

          if (Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
            lastHeartbeat = Date.now();
          }
          await sleep(POLL_MS[role]);
        }
      } catch (error) {
        send("error", { message: error instanceof Error ? error.message : "relay error" });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed by the client disconnecting
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
