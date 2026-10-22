"use client";

import { useEffect, useRef, useState } from "react";
import { StatusIcon, UiIcon } from "./icons";

/** Copies `text` and confirms inline. A failure stays visible until the next attempt. */
export function CopyButton({ text, label, compact = false }: { text: string; label: string; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 2_000);
    } catch {
      setState("failed");
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={label}
        title={label}
        className={`inline-flex items-center gap-1 rounded-ui text-secondary transition-colors duration-150 hover:bg-subtle hover:text-fg ${
          compact ? "h-6 w-6 justify-center" : "border border-control px-2.5 py-1 text-[13px]"
        }`}
      >
        <UiIcon name="copy" className="h-3.5 w-3.5" />
        {!compact && label}
      </button>
      <span role="status" className="text-xs">
        {state === "copied" && (
          <span className="inline-flex items-center gap-1 text-success">
            <StatusIcon name="check" className="h-3 w-3" /> Copied
          </span>
        )}
        {state === "failed" && (
          <span className="inline-flex items-center gap-1 text-failure">
            <StatusIcon name="alert" className="h-3 w-3" /> Copy failed. Select the text instead.
          </span>
        )}
      </span>
    </span>
  );
}
