"use client";

import { Dialog } from "./dialog";
import { CloseIcon, Kbd } from "./icons";

const SHORTCUTS: [string[], string][] = [
  [["Mod", "K"], "Open the command menu"],
  [["R"], "Run scenario (selected endpoint)"],
  [["1", "–", "5"], "Stable / Slow 3G / High Latency / Flaky / Offline"],
  [["E"], "Export the current run"],
  [["F"], "Focus recorder: hide endpoints and advanced setup"],
  [["↑", "↓"], "Move through the flight recorder (when focused)"],
  [["Enter"], "Inspect the selected request"],
  [["Esc"], "Close the palette, this help or the inspector drawer"],
  [["?"], "Show this help"],
];

export function ShortcutHelp({ open, onClose, modifier }: { open: boolean; onClose: () => void; modifier: string }) {
  return (
    <Dialog open={open} onClose={onClose} label="Keyboard shortcuts" className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-md rounded-ui border open:animate-fade-in">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-[13px] font-semibold">Keyboard shortcuts</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close keyboard shortcuts"
          title="Close (Esc)"
          className="flex h-7 w-7 items-center justify-center rounded-ui border border-control text-secondary hover:bg-subtle hover:text-fg"
        >
          <CloseIcon />
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 py-3 text-[13px]">
        {SHORTCUTS.map(([keys, action]) => (
          <div key={action} className="contents">
            <dt className="flex items-center gap-1">
              {keys.map((key) => (key === "–" ? <span key={key} className="text-muted">–</span> : <Kbd key={key}>{key === "Mod" ? modifier : key}</Kbd>))}
            </dt>
            <dd className="text-secondary">{action}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Single-key shortcuts are ignored while typing in a field.</p>
    </Dialog>
  );
}
