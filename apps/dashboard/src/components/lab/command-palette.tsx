"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Dialog } from "./dialog";
import { Kbd } from "./icons";

export type Command = {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  commands: Command[];
};

export function CommandPalette({ open, onClose, commands }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      label="Command palette"
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-lg rounded-ui border open:animate-fade-in"
    >
      <PaletteBody commands={commands} onClose={onClose} />
    </Dialog>
  );
}

function PaletteBody({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = commands.filter((command) => terms.every((term) => `${command.group} ${command.label}`.toLowerCase().includes(term)));
  const activeIndex = Math.min(active, Math.max(matches.length - 1, 0));

  function execute(command: Command | undefined) {
    if (!command || command.disabled) return;
    onClose();
    command.run();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + matches.length) % Math.max(matches.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      execute(matches[activeIndex]);
    }
  }

  return (
    <div className="flex flex-col">
      <input
        autoFocus
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={matches[activeIndex] ? `${listId}-${matches[activeIndex].id}` : undefined}
        aria-label="Search commands"
        placeholder="Type a command…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className="border-b border-line bg-transparent px-4 py-3 text-sm text-fg placeholder:text-muted focus-visible:outline-none"
      />
      <ul id={listId} role="listbox" aria-label="Commands" className="max-h-[50vh] overflow-y-auto py-1">
        {matches.length === 0 && <li className="px-4 py-3 text-[13px] text-muted">No matching command.</li>}
        {matches.map((command, index) => (
          <li
            key={command.id}
            id={`${listId}-${command.id}`}
            role="option"
            aria-selected={index === activeIndex}
            aria-disabled={command.disabled || undefined}
            onMouseMove={() => setActive(index)}
            onClick={() => execute(command)}
            className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-1.5 text-[13px] ${
              index === activeIndex ? "bg-subtle text-fg shadow-[inset_2px_0_0_var(--color-accent)]" : "text-secondary"
            } ${command.disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <span>
              <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{command.group}</span>
              {command.label}
            </span>
            {command.shortcut && <Kbd aria-hidden>{command.shortcut}</Kbd>}
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-2 font-mono text-[10px] text-muted">↑↓ move · Enter run · Esc close</p>
    </div>
  );
}
