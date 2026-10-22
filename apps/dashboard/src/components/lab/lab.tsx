"use client";

import { PRESETS, PRESET_LIST, buildReport, reportFileName, serializeReport, type NetworkProfile } from "@slownet/core";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ACTIONS, ACTION_BY_ID, type ClearedDemo } from "@/features/lab/demo-actions";
import type { ProfileSource } from "@/features/lab/lab-session";
import { useLive, writeLiveLocation } from "@/features/live/use-live";
import { useLab } from "@/features/lab/use-lab";
import { useMediaQuery } from "@/features/lab/use-media-query";
import { usePreference } from "@/features/lab/use-preference";
import { CommandBar, useModifierLabel } from "./command-bar";
import { CommandPalette, type Command } from "./command-palette";
import { Dialog } from "./dialog";
import { EndpointList } from "./endpoint-list";
import { FlightRecorder, type ExportStatus } from "./flight-recorder";
import { LivePanel } from "./live-panel";
import { RequestInspector } from "./request-inspector";
import { ScenarioSetup } from "./scenario-setup";
import { ShortcutHelp } from "./shortcut-help";

/** Wide enough to pin the inspector beside the recorder without squeezing the timeline. */
const WIDE_QUERY = "(min-width: 1280px)";
const UNDO_WINDOW_MS = 10_000;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "reset"].includes(target.type);
}

export function Lab() {
  const lab = useLab();
  const live = useLive();
  const wide = useMediaQuery(WIDE_QUERY);
  const modifier = useModifierLabel();
  const [pinned, setPinned] = usePreference("slownet-inspector-pinned");
  const [exportState, setExportState] = useState<{ runKey: string; status: ExportStatus }>({ runKey: "", status: null });
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [undo, setUndo] = useState<ClearedDemo | null>(null);
  const inspectorHeading = useRef<HTMLHeadingElement>(null);
  const docked = wide && pinned;
  const selectedAction = ACTION_BY_ID[lab.demo.selected];
  // In a live session the profile, run and events belong to the relay; otherwise to the bundled demo.
  const isLive = live.sessionId !== null;
  const canControl = !isLive || live.controlKey !== null;
  const profile = isLive ? (live.state?.profile ?? PRESETS.stable) : lab.profile;
  const events = isLive ? live.events : lab.events;
  const runId = isLive ? (live.state?.runId ?? 1) : lab.runId;
  const runKey = `${isLive ? live.sessionId : "demo"}:${runId}`;
  const inFlight = events.filter((event) => event.outcome === "pending").length;
  // A status from an earlier run (e.g. before the sample session cleared it) no longer applies.
  const exportStatus = exportState.runKey === runKey ? exportState.status : null;
  // Undo only makes sense until something new is recorded; live clears are not undoable.
  const canUndo = !isLive && undo !== null && lab.events.length === 0;

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  function setProfile(next: NetworkProfile, source: ProfileSource) {
    if (!isLive) lab.session.setProfile(next, source);
    else if (canControl) void live.connection.setProfile(next);
  }

  async function startLive() {
    setSelectedRequestId(null);
    setDrawerOpen(false);
    const created = await live.connection.create(lab.profile);
    if (created) writeLiveLocation(created);
  }

  function leaveLive() {
    live.connection.leave();
    writeLiveLocation(null);
    setSelectedRequestId(null);
    setDrawerOpen(false);
  }

  function exportReport() {
    if (events.length === 0) {
      setExportState({ runKey, status: { tone: "failure", message: "Nothing to export yet. Run a request first." } });
      return;
    }
    try {
      const generatedAt = new Date();
      const json = serializeReport(buildReport({ profile, events, generatedAt, userAgent: navigator.userAgent }));
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = reportFileName(profile, generatedAt);
      link.click();
      URL.revokeObjectURL(url);
      // The browser gives no "saved" signal for a download link, so only claim that it started.
      setExportState({ runKey, status: { tone: "success", message: `Download started · ${events.length} records · ${link.download}` } });
    } catch (error) {
      setExportState({ runKey, status: { tone: "failure", message: `Could not build the report: ${error instanceof Error ? error.message : "unknown error"}` } });
    }
  }

  function clearRun() {
    if (events.length === 0 || !canControl) return;
    if (isLive) void live.connection.clear();
    else setUndo(lab.actions.clear());
    setSelectedRequestId(null);
    setDrawerOpen(false);
  }

  function undoClear() {
    if (!undo) return;
    lab.actions.undoClear(undo);
    setUndo(null);
  }

  function selectPreset(preset: NetworkProfile) {
    const next = { ...preset };
    delete next.seed;
    setProfile(profile.seed === undefined ? next : { ...next, seed: profile.seed }, "external");
  }

  function inspect(requestId: string, via: "pointer" | "keyboard") {
    setSelectedRequestId(requestId);
    if (!docked) setDrawerOpen(true);
    else if (via === "keyboard") inspectorHeading.current?.focus();
  }

  function togglePin() {
    setPinned(!pinned);
    setDrawerOpen(false);
  }

  const demoCommands: Command[] = isLive ? [] : [
    { id: "run-selected", group: "Run", label: `Run scenario (${selectedAction.title})`, shortcut: "R", disabled: lab.actions.isBusy(lab.demo.selected), run: () => void lab.actions.run(lab.demo.selected) },
    ...ACTIONS.map((action) => ({
      id: `run-${action.id}`,
      group: "Run",
      label: `Run ${action.title}`,
      disabled: lab.actions.isBusy(action.id),
      run: () => void lab.actions.run(action.id),
    })),
    { id: "sample", group: "Run", label: "Load sample session", disabled: lab.demo.sampleRunning, run: () => void lab.actions.runSample() },
    { id: "auto-retry", group: "Profile", label: `Turn auto-retry ${lab.demo.autoRetry ? "off" : "on"}`, run: () => lab.actions.setAutoRetry(!lab.demo.autoRetry) },
  ];
  const commands: Command[] = [
    ...demoCommands,
    isLive
      ? { id: "leave-live", group: "Live", label: "Leave live session", run: leaveLive }
      : { id: "start-live", group: "Live", label: "Start live session (connect your own app)", run: () => void startLive() },
    ...(canControl
      ? [
          ...PRESET_LIST.map((preset, index) => ({ id: `preset-${preset.id}`, group: "Profile", label: preset.name, shortcut: String(index + 1), run: () => selectPreset(preset) })),
          { id: "advanced", group: "Profile", label: `${advancedOpen ? "Hide" : "Show"} advanced conditions`, run: () => setAdvancedOpen(!advancedOpen) },
        ]
      : []),
    { id: "focus", group: "View", label: `${focusMode ? "Leave" : "Enter"} focus recorder`, shortcut: "F", run: () => setFocusMode(!focusMode) },
    ...(wide ? [{ id: "pin", group: "View", label: pinned ? "Unpin inspector" : "Pin inspector", run: togglePin }] : []),
    { id: "export", group: "Run", label: "Export report", shortcut: "E", disabled: events.length === 0, run: exportReport },
    { id: "clear", group: "Run", label: "Clear run", disabled: events.length === 0 || !canControl, run: clearRun },
    { id: "help", group: "Help", label: "Keyboard shortcuts", shortcut: "?", run: () => setHelpOpen(true) },
  ];

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setHelpOpen(false);
      setPaletteOpen((open) => !open);
      return;
    }
    // Single-key shortcuts never fire while typing, with modifiers held, or under a dialog.
    if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
    if (document.querySelector("dialog[open]")) return;

    const presetIndex = ["1", "2", "3", "4", "5"].indexOf(event.key);
    if (presetIndex >= 0 && PRESET_LIST[presetIndex]) {
      if (!canControl) return;
      selectPreset(PRESET_LIST[presetIndex]);
    } else if (event.key === "r" || event.key === "R") {
      if (isLive) return; // requests come from connected apps
      void lab.actions.run(lab.demo.selected);
    }
    else if (event.key === "e" || event.key === "E") exportReport();
    else if (event.key === "f" || event.key === "F") setFocusMode((on) => !on);
    else if (event.key === "?") setHelpOpen(true);
    else return;
    event.preventDefault();
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const inspector = (
    <RequestInspector
      events={events}
      selectedId={selectedRequestId}
      currentProfile={profile}
      previews={isLive ? {} : lab.demo.previews}
      bodiesUnavailable={isLive}
      headingRef={inspectorHeading}
      onNavigate={setSelectedRequestId}
      pin={wide ? { pinned, onToggle: togglePin } : undefined}
      onClose={docked ? undefined : () => setDrawerOpen(false)}
    />
  );

  return (
    <div className="min-h-dvh">
      <CommandBar
        runId={runId}
        profile={profile}
        inFlight={inFlight}
        liveSessionId={live.sessionId}
        focusMode={focusMode}
        onToggleFocus={() => setFocusMode(!focusMode)}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
      />

      <div className={docked ? "grid grid-cols-[minmax(0,1fr)_400px]" : undefined}>
        <main className="mx-auto flex w-full max-w-[1320px] min-w-0 flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          {!focusMode && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h1 className="text-xl font-semibold tracking-[-0.01em]">Network conditions, on demand.</h1>
                <p className="text-sm text-secondary">
                  {isLive ? "Shaping requests in your connected apps, live." : "Reproduce latency, drops and offline states in the bundled demo app, or connect your own."}
                </p>
              </div>
              <div role="radiogroup" aria-label="Mode" className="flex gap-1 rounded-ui bg-subtle p-1">
                {(
                  [
                    ["Demo app", false],
                    ["Live session", true],
                  ] as const
                ).map(([label, value]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={isLive === value}
                    disabled={live.status === "creating"}
                    onClick={() => {
                      if (value && !isLive) void startLive();
                      else if (!value && isLive) leaveLive();
                    }}
                    className={`rounded-[4px] px-3 py-1 text-sm transition-colors duration-[120ms] ${
                      isLive === value ? "bg-surface font-medium text-fg shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-secondary hover:text-fg"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!isLive && live.status === "error" && live.error && (
            <p role="alert" className="flex items-center gap-2 rounded-ui bg-surface px-4 py-2 text-[13px] text-failure">
              Live session unavailable: {live.error}
            </p>
          )}

          <ScenarioSetup
            profile={profile}
            profileRevision={isLive ? live.profileRevision : lab.profileRevision}
            onProfileChange={setProfile}
            live={isLive}
            readOnly={!canControl}
            advancedOpen={advancedOpen}
            onToggleAdvanced={() => setAdvancedOpen(!advancedOpen)}
            showAdvanced={!focusMode}
            runLabel={selectedAction.title}
            runDisabled={lab.actions.isBusy(lab.demo.selected)}
            onRun={() => void lab.actions.run(lab.demo.selected)}
            sampleRunning={lab.demo.sampleRunning}
            onRunSample={() => void lab.actions.runSample()}
          />

          {!focusMode && (isLive ? <LivePanel live={live} onLeave={leaveLive} /> : <EndpointList demo={lab.demo} actions={lab.actions} />)}

          <FlightRecorder
            key={runKey}
            events={events}
            selectedId={selectedRequestId}
            onSelect={setSelectedRequestId}
            onInspect={inspect}
            onClear={canControl ? clearRun : undefined}
            onExport={exportReport}
            exportStatus={exportStatus}
            onUndoClear={canUndo ? undoClear : null}
          />
        </main>

        {docked && (
          <aside aria-label="Request inspector" className="sticky top-12 h-[calc(100dvh-3rem)] overflow-y-auto border-l border-line bg-surface">
            {inspector}
          </aside>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {lab.demo.announcement}
      </p>

      {!docked && (
        <Dialog
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          label="Request details"
          className="m-0 ml-auto h-dvh max-h-none w-full max-w-[420px] border-l open:animate-drawer-in"
        >
          <aside aria-label="Request inspector" className="h-full overflow-y-auto">
            {inspector}
          </aside>
        </Dialog>
      )}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} modifier={modifier} />
    </div>
  );
}
