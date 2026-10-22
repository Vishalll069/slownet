"use client";

import { useSyncExternalStore } from "react";

const EVENT = "slownet-preference";
/** This page view's values, so preferences still work when storage is blocked. */
const memory = new Map<string, boolean>();

function read(key: string): boolean {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false; // storage blocked (private mode, previews): fall back to the default
  }
}

/** A per-viewer boolean convenience (e.g. a pinned panel) kept in localStorage. False on the server. */
export function usePreference(key: string): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    (onChange) => {
      window.addEventListener(EVENT, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    () => read(key),
    () => false,
  );

  function set(next: boolean) {
    memory.set(key, next);
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // Not persisted across visits; `memory` keeps it for this page view.
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return [value, set];
}
