import type { StatusIconName } from "@/features/lab/format";

type IconProps = { className?: string };

const STATUS_PATHS: Record<StatusIconName, React.ReactNode> = {
  check: <path d="M3 8.5 6.5 12 13 4.5" />,
  cross: <path d="M4 4l8 8M12 4l-8 8" />,
  blocked: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M4.2 11.8 11.8 4.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3.2l2 1.3" />
    </>
  ),
  pending: <circle cx="8" cy="8" r="4.5" strokeDasharray="2.4 2.2" />,
  retry: <path d="M12.5 7.5A4.5 4.5 0 1 1 10.6 4M12.8 2.5v3h-3" />,
  cancel: <path d="M4 8h8" />,
  alert: <path d="M8 3.5v6M8 12.2v.3" />,
};

/** Outcome glyphs. Always paired with a text label; colour comes from the parent's text colour. */
export function StatusIcon({ name, className = "h-3.5 w-3.5" }: IconProps & { name: StatusIconName }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      {STATUS_PATHS[name]}
    </svg>
  );
}

/** Wordmark glyph: a signal trace that ends in a packet. */
export function PacketMark({ className = "h-[18px] w-[18px]" }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
      <path d="M1 9.5h3l1.8-5 2.9 9 1.8-4H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="13.5" y="7.5" width="3.5" height="3.5" rx="0.5" fill="currentColor" />
    </svg>
  );
}

export function PlayIcon({ className = "h-3 w-3" }: IconProps) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={className}>
      <path d="M3 2v8l7-4z" fill="currentColor" />
    </svg>
  );
}

export function CloseIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function Kbd({ children, className = "", ...rest }: React.ComponentProps<"kbd">) {
  return (
    <kbd {...rest} className={`inline-flex min-w-[18px] items-center justify-center rounded-[4px] border border-line bg-surface px-1 font-mono text-[11px] leading-[16px] text-secondary ${className}`}>
      {children}
    </kbd>
  );
}

const UI_PATHS = {
  chevronDown: <path d="M4 6l4 4 4-4" />,
  chevronLeft: <path d="M10 4L6 8l4 4" />,
  chevronRight: <path d="M6 4l4 4-4 4" />,
  chevronUp: <path d="M4 10l4-4 4 4" />,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  minus: <path d="M3.5 8h9" />,
  fit: <path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3" />,
  pin: <path d="M6 2.5h4M7 2.5v4L4.5 9h7L9 6.5v-4M8 9v4.5" />,
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
    </>
  ),
  focus: <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10M6 8h4" />,
  undo: <path d="M5 4.5 2.5 7 5 9.5M2.5 7H10a3.5 3.5 0 0 1 0 7H7" />,
} as const;

export type UiIconName = keyof typeof UI_PATHS;

export function UiIcon({ name, className = "h-4 w-4" }: IconProps & { name: UiIconName }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      {UI_PATHS[name]}
    </svg>
  );
}
