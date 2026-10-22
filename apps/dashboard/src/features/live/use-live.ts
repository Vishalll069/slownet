"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LiveConnection } from "./live-connection";

/** Reads ?live=<session> and #key=<control key>. The key stays in the fragment so it never reaches a server log. */
export function readLiveLocation(): { sessionId: string; controlKey: string | null } | null {
  const sessionId = new URLSearchParams(location.search).get("live");
  if (!sessionId) return null;
  const controlKey = new URLSearchParams(location.hash.slice(1)).get("key");
  return { sessionId, controlKey };
}

export function writeLiveLocation(session: { sessionId: string; controlKey: string | null } | null): void {
  const url = new URL(location.href);
  if (session) {
    url.searchParams.set("live", session.sessionId);
    url.hash = session.controlKey ? `key=${session.controlKey}` : "";
  } else {
    url.searchParams.delete("live");
    url.hash = "";
  }
  history.replaceState(null, "", url);
}

export function useLive() {
  const [connection] = useState(() => new LiveConnection());
  const snapshot = useSyncExternalStore(connection.subscribe, connection.getSnapshot, connection.getSnapshot);

  useEffect(() => {
    const fromUrl = readLiveLocation();
    if (fromUrl) connection.join(fromUrl.sessionId, fromUrl.controlKey);
    return () => connection.leave();
  }, [connection]);

  return { connection, ...snapshot };
}

export type Live = ReturnType<typeof useLive>;
