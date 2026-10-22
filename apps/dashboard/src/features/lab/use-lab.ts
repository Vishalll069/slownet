"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DemoActions } from "./demo-actions";
import { LabSession } from "./lab-session";

export function useLab() {
  const [session] = useState(() => new LabSession());
  const [actions] = useState(() => new DemoActions(session));

  // Not a full teardown: StrictMode re-runs effects on the same session in development.
  useEffect(() => () => session.abortInFlight(), [session]);

  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const events = useSyncExternalStore(session.recorder.subscribe, session.recorder.getEvents, session.recorder.getEvents);
  const demo = useSyncExternalStore(actions.subscribe, actions.getSnapshot, actions.getSnapshot);

  return { session, actions, ...snapshot, events, demo };
}

export type Lab = ReturnType<typeof useLab>;
