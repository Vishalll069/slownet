"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  label: string;
  className: string;
  children: ReactNode;
};

/**
 * A modal <dialog>: the browser traps focus, closes on Esc and restores focus on close.
 * Children mount only while open, so their state starts fresh each time.
 */
export function Dialog({ open, onClose, label, className, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className={`border-line bg-surface p-0 text-fg ${className}`}
    >
      {open && children}
    </dialog>
  );
}
