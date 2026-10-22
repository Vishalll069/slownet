/**
 * Entry for the drop-in script served at /slownet-live.js:
 *
 *   <script src="https://YOUR-SLOWNET/slownet-live.js" data-session="s_…"></script>
 *
 * Optional attributes: data-match="*" | "/api" (default: same-origin requests),
 * data-include-query="true", data-server (default: the script's own origin).
 * Without data-session, nothing happens until you call window.SlowNet.connect({ … }).
 */
import { connectLive, type LiveClient, type LiveClientOptions } from "./client";

declare global {
  interface Window {
    SlowNet?: { connect: (options: LiveClientOptions) => LiveClient; client?: LiveClient };
  }
}

const script = document.currentScript as HTMLScriptElement | null;

window.SlowNet = { connect: connectLive };

const session = script?.dataset.session;
if (script && session) {
  const client = connectLive({
    server: script.dataset.server ?? new URL(script.src).origin,
    session,
    match: script.dataset.match,
    includeQuery: script.dataset.includeQuery === "true",
    onStatus: (status) => console.info(`[SlowNet] ${status}`),
  });
  client.install();
  window.SlowNet.client = client;
}
