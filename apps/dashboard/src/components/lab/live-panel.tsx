"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { LiveSnapshot } from "@/features/live/live-connection";
import { CopyButton } from "./copy-button";
import { StatusIcon } from "./icons";

const noop = () => () => {};

function useOrigin(): string {
  return useSyncExternalStore(noop, () => location.origin, () => "");
}

/** Re-renders every second so "seen 3 s ago" stays honest. */
function useSecondTick(): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1_000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, []);
  return now;
}

const STATUS_TEXT: Record<LiveSnapshot["status"], string> = {
  idle: "Not connected",
  creating: "Creating session…",
  connecting: "Connecting to relay…",
  live: "Relay connected",
  reconnecting: "Reconnecting to relay…",
  gone: "Session ended",
  error: "Relay unavailable",
};

export function LivePanel({ live, onLeave }: { live: LiveSnapshot; onLeave: () => void }) {
  const origin = useOrigin();
  const now = useSecondTick();
  const sessionId = live.sessionId ?? "";
  const scriptTag = `<script src="${origin}/slownet-live.js" data-session="${sessionId}"></script>`;
  const jsApi = `const live = window.SlowNet.connect({\n  server: "${origin}",\n  session: "${sessionId}",\n});\nconst response = await live.fetch("/api/items"); // shaped and reported`;
  const viewerLink = `${origin}/?live=${sessionId}`;
  const controlLink = live.controlKey ? `${viewerLink}#key=${live.controlKey}` : null;
  const connected = live.status === "live";
  const tone = live.status === "error" || live.status === "gone" ? "text-failure" : connected ? "text-success" : "text-neutral";

  return (
    <section aria-labelledby="live-heading" className="flex flex-col gap-3 rounded-ui bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="live-heading" className="text-sm font-semibold">
            Live session <span className="font-mono font-normal text-secondary">{sessionId}</span>
          </h2>
          <p role="status" className={`flex items-center gap-1.5 text-[13px] ${tone}`}>
            <StatusIcon name={connected ? "check" : live.status === "error" || live.status === "gone" ? "alert" : "pending"} className="h-3.5 w-3.5" />
            {STATUS_TEXT[live.status]}
            {connected && (
              <span className="text-secondary">
                · {live.clients.length === 0 ? "waiting for an app to connect" : `${live.clients.length} ${live.clients.length === 1 ? "app" : "apps"} connected`}
              </span>
            )}
          </p>
          {live.error && <p className="text-[13px] text-failure">{live.error}</p>}
        </div>
        <button type="button" onClick={onLeave} className="rounded-ui px-3 py-1.5 text-sm text-secondary hover:bg-subtle hover:text-fg">
          Leave session
        </button>
      </div>

      {!live.controlKey && (
        <p className="rounded-ui bg-canvas px-3 py-2 text-[13px] text-secondary">
          View only: you can watch this session. Changing the profile or clearing the run needs the control link from whoever created it.
        </p>
      )}

      {live.clients.length > 0 && (
        <ul aria-label="Connected apps" className="flex flex-col gap-1 text-[13px]">
          {live.clients.map((client) => (
            <li key={client.clientId} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
              <span className="font-mono">{client.origin}</span>
              <span className="text-muted">seen {now === 0 ? "just now" : `${Math.max(0, Math.round((now - client.lastSeenAt) / 1_000))} s ago`}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold">1 · Add this to your app&apos;s HTML</h3>
            <CopyButton text={scriptTag} label="Copy script tag" compact />
          </div>
          <pre className="overflow-x-auto rounded-ui bg-canvas p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-fg">{scriptTag}</pre>
          <p className="text-xs text-secondary">
            Load it before your code runs. It shapes <span className="font-mono">fetch</span> calls to your app&apos;s own origin; add{" "}
            <span className="font-mono">data-match=&quot;*&quot;</span> for every origin or <span className="font-mono">data-match=&quot;/api&quot;</span> for a path prefix.
            XMLHttpRequest (and axios&apos;s default adapter) is not shaped.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold">Or call it from code</h3>
            <CopyButton text={jsApi} label="Copy JavaScript" compact />
          </div>
          <pre className="overflow-x-auto rounded-ui bg-canvas p-3 font-mono text-xs leading-relaxed text-fg">{jsApi}</pre>
          <p className="text-xs text-secondary">
            Then pick a profile here: connected apps switch within about a second, and every attempt appears in the flight recorder below.{" "}
            <a href={`/examples/live-demo.html?session=${encodeURIComponent(sessionId)}`} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-4">
              Try it with the example app
            </a>
            .
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-[13px]">
        <span className="flex items-center gap-1">
          Viewer link <CopyButton text={viewerLink} label="Copy viewer link" compact />
        </span>
        {controlLink && (
          <span className="flex items-center gap-1">
            Control link <CopyButton text={controlLink} label="Copy control link" compact />
            <span className="text-xs text-muted">(lets others change the profile)</span>
          </span>
        )}
        <span className="text-xs text-secondary">
          Sent from apps: method, origin + path, timings, status and error codes. Query strings, headers and bodies stay in the app. Sessions expire after 24 h.
        </span>
      </div>
    </section>
  );
}
