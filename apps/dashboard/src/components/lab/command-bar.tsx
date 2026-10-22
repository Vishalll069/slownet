"use client";

import type { NetworkProfile } from "@slownet/core";
import { useSyncExternalStore } from "react";
import { Kbd, PacketMark, UiIcon } from "./icons";

type Props = {
  runId: number;
  profile: NetworkProfile;
  inFlight: number;
  liveSessionId: string | null;
  focusMode: boolean;
  onToggleFocus: () => void;
  onOpenPalette: () => void;
  onOpenHelp: () => void;
};

const noop = () => () => {};

/** "⌘" on Apple platforms, "Ctrl" elsewhere. The server renders "Ctrl". */
export function useModifierLabel(): string {
  return useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

export function profileTone(profile: NetworkProfile): { dot: string; label: string } {
  if (profile.offline) return { dot: "bg-failure", label: "blocking all requests" };
  if (profile.failureRate > 0) return { dot: "bg-warning", label: "injecting failures" };
  return { dot: "bg-success", label: "no injected failures" };
}

export function CommandBar({ runId, profile, inFlight, liveSessionId, focusMode, onToggleFocus, onOpenPalette, onOpenHelp }: Props) {
  const modifier = useModifierLabel();
  const tone = profileTone(profile);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur-[2px]">
      <div className="flex h-12 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex items-center gap-2 text-accent">
            <PacketMark />
            <span className="text-[15px] font-semibold tracking-[0.02em] text-fg">SlowNet</span>
          </span>
          <span className="hidden truncate font-mono text-xs text-muted md:inline">
            {liveSessionId ? `live ${liveSessionId.slice(0, 10)}…` : "demo-store"} · run {String(runId).padStart(2, "0")}
          </span>
          <span className="hidden items-center gap-2 text-[13px] text-secondary lg:flex" title={`Simulation on for the bundled demo app only: ${tone.label}`}>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tone.dot}`} />
            Simulating <span className="font-medium text-fg">{profile.name}</span>
            {profile.seed !== undefined && <span className="font-mono text-xs text-muted">seed {profile.seed}</span>}
            {inFlight > 0 && <span className="text-neutral">· {inFlight} in flight</span>}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleFocus}
            aria-pressed={focusMode}
            aria-label="Focus recorder"
            aria-keyshortcuts="F"
            title="Focus recorder: hide endpoints and advanced setup (F)"
            className={`flex h-8 items-center gap-1.5 rounded-ui px-2.5 text-[13px] transition-colors duration-150 ${
              focusMode ? "bg-accent-soft font-medium text-accent" : "text-secondary hover:bg-subtle hover:text-fg"
            }`}
          >
            <UiIcon name="focus" className="h-4 w-4" />
            <span className="hidden sm:inline">Focus recorder</span>
          </button>
          <button
            type="button"
            onClick={onOpenPalette}
            title={`Command menu (${modifier}+K)`}
            aria-keyshortcuts={modifier === "⌘" ? "Meta+K" : "Control+K"}
            className="flex h-8 items-center gap-2 rounded-ui px-2.5 text-[13px] text-secondary transition-colors duration-150 hover:bg-subtle hover:text-fg"
          >
            Commands
            <span aria-hidden="true" className="hidden gap-0.5 sm:flex">
              <Kbd>{modifier}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenHelp}
            aria-label="Keyboard shortcuts"
            aria-keyshortcuts="?"
            title="Keyboard shortcuts (?)"
            className="flex h-8 w-8 items-center justify-center rounded-ui font-mono text-sm text-secondary transition-colors duration-150 hover:bg-subtle hover:text-fg"
          >
            ?
          </button>
        </div>
      </div>
    </header>
  );
}
