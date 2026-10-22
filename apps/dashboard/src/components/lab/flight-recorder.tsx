"use client";

import { MIN_SAMPLES_FOR_MEDIAN, attemptTiming, summarize, type RequestEvent } from "@slownet/core";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { TONE_BG, TONE_TEXT, describeOutcome, formatMs, formatOffset } from "@/features/lab/format";
import {
  FILTERS,
  MIN_VIEW_MS,
  buildScale,
  groupRequests,
  panView,
  runExtent,
  zoomView,
  type FilterId,
  type TimeScale,
  type TimelineRequest,
  type ViewWindow,
} from "@/features/lab/timeline-model";
import { Kbd, StatusIcon, UiIcon, type UiIconName } from "./icons";

export type ExportStatus = { tone: "success" | "failure"; message: string } | null;

type Props = {
  events: readonly RequestEvent[];
  selectedId: string | null;
  onSelect: (requestId: string) => void;
  /** Click or Enter: select and show the inspector. */
  onInspect: (requestId: string, via: "pointer" | "keyboard") => void;
  /** Absent for view-only live sessions. */
  onClear: (() => void) | undefined;
  onExport: () => void;
  exportStatus: ExportStatus;
  /** Present for a few seconds after Clear run. */
  onUndoClear: (() => void) | null;
};

/** Shared by the ruler and every row so columns line up. */
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 md:grid-cols-[7rem_minmax(9rem,13rem)_minmax(0,1fr)_6.5rem_3rem] md:items-center";

export function FlightRecorder(props: Props) {
  const { events } = props;
  const requests = groupRequests(events);
  const hasPending = events.some((event) => event.outcome === "pending");
  const now = useNow(hasPending);
  const extent = runExtent(requests, now);
  const [view, setView] = useState<ViewWindow | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [legendOpen, setLegendOpen] = useState(false);
  const scale = buildScale(extent, events.length === 0 ? null : view);
  const summary = summarize(events);
  const settled = events.filter((event) => event.durationMs !== undefined).length;
  const activeFilter = FILTERS.find((candidate) => candidate.id === filter)!;
  const visible = requests.filter(activeFilter.test);
  const selected = requests.find((request) => request.requestId === props.selectedId);

  function zoom(factor: number) {
    const center = selected && factor < 1 ? (selected.startedAt + (selected.endedAt ?? now)) / 2 - extent.origin : undefined;
    setView(zoomView(scale, extent, factor, center));
  }

  return (
    <section aria-labelledby="recorder-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="recorder-heading" className="text-base font-semibold">
            Flight recorder
          </h2>
          <p className="font-mono text-xs text-secondary">
            {events.length === 0 ? (
              "No requests in this run."
            ) : (
              <>
                {summary.totalRequests} requests · {summary.totalAttempts} attempts · <span className="text-success">{summary.succeeded} ok</span> ·{" "}
                <span className={summary.failed > 0 ? "text-failure" : undefined}>{summary.failed} failed</span> · {summary.retries} retries · median{" "}
                {summary.medianDurationMs === null
                  ? `— (n=${settled} attempts, needs ${MIN_SAMPLES_FOR_MEDIAN})`
                  : `${formatMs(summary.medianDurationMs)} (n=${settled} attempts)`}{" "}
                · run {formatMs(summary.totalElapsedMs)}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={props.onClear}
            disabled={events.length === 0 || !props.onClear}
            className="rounded-ui px-3 py-1.5 text-sm text-secondary transition-colors duration-150 hover:bg-subtle hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear run
          </button>
          <button
            type="button"
            onClick={props.onExport}
            disabled={events.length === 0}
            title="Export report (E)"
            aria-keyshortcuts="E"
            className="flex items-center gap-2 rounded-ui border border-control bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors duration-150 hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export report
            <Kbd aria-hidden>E</Kbd>
          </button>
        </div>
      </div>

      {(props.onUndoClear || props.exportStatus) && (
        <div role="status" className="flex flex-wrap items-center gap-3 text-[13px]">
          {props.onUndoClear && (
            <span className="flex items-center gap-2 rounded-ui bg-surface px-3 py-1.5">
              Run cleared.
              <button type="button" onClick={props.onUndoClear} className="flex items-center gap-1 font-medium text-accent underline underline-offset-4">
                <UiIcon name="undo" className="h-3.5 w-3.5" /> Undo
              </button>
            </span>
          )}
          {props.exportStatus && (
            <span className={`flex items-center gap-1.5 ${props.exportStatus.tone === "failure" ? "text-failure" : "text-success"}`}>
              <StatusIcon name={props.exportStatus.tone === "failure" ? "alert" : "check"} className="h-3.5 w-3.5" />
              {props.exportStatus.message}
            </span>
          )}
        </div>
      )}

      {events.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label="Filter requests" className="flex flex-wrap gap-1">
            {FILTERS.map((candidate) => {
              const count = requests.filter(candidate.test).length;
              const active = candidate.id === filter;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setFilter(candidate.id)}
                  className={`rounded-ui px-2.5 py-1 text-[13px] transition-colors duration-[120ms] ${
                    active ? "bg-fg font-medium text-surface" : "text-secondary hover:bg-subtle hover:text-fg"
                  }`}
                >
                  {candidate.label} <span className={`font-mono text-xs ${active ? "opacity-80" : "text-muted"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 font-mono text-xs text-muted">
              {scale.fitted ? "Fit" : "Zoomed"} · {formatOffset(scale.startMs)} – {formatOffset(scale.endMs)}
            </span>
            <ToolButton icon="minus" label="Zoom out" disabled={scale.fitted} onClick={() => zoom(2)} />
            <ToolButton icon="plus" label="Zoom in" disabled={scale.endMs - scale.startMs <= MIN_VIEW_MS} onClick={() => zoom(0.5)} />
            <ToolButton icon="fit" label="Zoom to fit" disabled={scale.fitted} onClick={() => setView(null)} />
            <ToolButton icon="chevronLeft" label="Pan earlier" disabled={scale.fitted || scale.startMs <= 0} onClick={() => setView(panView(scale, extent, -1))} />
            <ToolButton icon="chevronRight" label="Pan later" disabled={scale.fitted || scale.endMs >= extent.endMs} onClick={() => setView(panView(scale, extent, 1))} />
            <button
              type="button"
              onClick={() => setLegendOpen((open) => !open)}
              aria-expanded={legendOpen}
              aria-controls="recorder-legend"
              className="ml-1 rounded-ui px-2 py-1 text-[13px] text-secondary hover:bg-subtle hover:text-fg"
            >
              Legend
            </button>
          </div>
        </div>
      )}

      {legendOpen && events.length > 0 && <Legend />}

      <div className="rounded-ui bg-surface has-[ul:focus-visible]:outline-2 has-[ul:focus-visible]:outline-offset-2 has-[ul:focus-visible]:outline-accent has-[ul:focus-visible]:outline-solid">
        <Ruler scale={scale} />
        {requests.length === 0 ? (
          <EmptyRecorder scale={scale} />
        ) : visible.length === 0 ? (
          <p className="px-4 py-6 text-sm text-secondary">
            No requests match “{activeFilter.label}”.{" "}
            <button type="button" onClick={() => setFilter("all")} className="text-accent underline underline-offset-4">
              Show all
            </button>
          </p>
        ) : (
          <RequestList requests={visible} scale={scale} now={now} selectedId={props.selectedId} onSelect={props.onSelect} onInspect={props.onInspect} />
        )}
      </div>
    </section>
  );
}

function ToolButton({ icon, label, disabled, onClick }: { icon: UiIconName; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-ui text-secondary transition-colors duration-150 hover:bg-subtle hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
    >
      <UiIcon name={icon} className="h-4 w-4" />
    </button>
  );
}

function position(scale: TimeScale, relativeMs: number): number {
  return ((relativeMs - scale.startMs) / Math.max(scale.endMs - scale.startMs, 1)) * 100;
}

function Ruler({ scale }: { scale: TimeScale }) {
  return (
    <div className={`${ROW_GRID} border-b border-line px-4 py-2 text-xs text-muted`} aria-hidden="true">
      <span className="hidden md:block">Status</span>
      <span className="hidden md:block">Request</span>
      <span className="relative col-span-2 h-4 font-mono md:col-span-1">
        {scale.ticks.map((tick) => {
          const left = position(scale, tick);
          return (
            <span
              key={tick}
              className={`absolute top-0 whitespace-nowrap ${left < 4 ? "" : left > 92 ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left: `${left}%` }}
            >
              {formatOffset(tick)}
            </span>
          );
        })}
      </span>
      <span className="hidden text-right md:block">Wall-clock</span>
      <span className="hidden text-right md:block">Retries</span>
    </div>
  );
}

function RequestList(props: {
  requests: TimelineRequest[];
  scale: TimeScale;
  now: number;
  selectedId: string | null;
  onSelect: (requestId: string) => void;
  onInspect: (requestId: string, via: "pointer" | "keyboard") => void;
}) {
  const { requests, selectedId } = props;
  const listRef = useRef<HTMLUListElement>(null);
  const tooltipId = useId();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const selectedIndex = requests.findIndex((request) => request.requestId === selectedId);
  const tooltipFor = hoveredId ?? (keyboardActive ? selectedId : null);

  useEffect(() => {
    if (!selectedId) return;
    listRef.current?.querySelector(`[data-request-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const last = requests.length - 1;
    const moveTo = (index: number) => {
      event.preventDefault();
      setKeyboardActive(true);
      props.onSelect(requests[Math.min(Math.max(index, 0), last)]!.requestId);
    };
    if (event.key === "ArrowDown") moveTo(selectedIndex < 0 ? 0 : selectedIndex + 1);
    else if (event.key === "ArrowUp") moveTo(selectedIndex < 0 ? last : selectedIndex - 1);
    else if (event.key === "Home") moveTo(0);
    else if (event.key === "End") moveTo(last);
    else if (event.key === "Enter" && selectedId) {
      event.preventDefault();
      props.onInspect(selectedId, "keyboard");
    } else if (event.key === "Escape") setKeyboardActive(false);
  }

  return (
    <ul
      ref={listRef}
      role="listbox"
      tabIndex={0}
      aria-label="Request timeline"
      aria-activedescendant={selectedId && selectedIndex >= 0 ? rowDomId(selectedId) : undefined}
      aria-describedby={tooltipFor && keyboardActive ? tooltipId : undefined}
      onKeyDown={onKeyDown}
      onBlur={() => setKeyboardActive(false)}
      onMouseLeave={() => setHoveredId(null)}
      className="focus-visible:outline-none"
    >
      {requests.map((request) => (
        <RequestRow
          key={request.requestId}
          request={request}
          scale={props.scale}
          now={props.now}
          selected={request.requestId === selectedId}
          tooltipId={request.requestId === tooltipFor ? tooltipId : undefined}
          onHover={() => setHoveredId(request.requestId)}
          onClick={() => props.onInspect(request.requestId, "pointer")}
        />
      ))}
    </ul>
  );
}

function rowDomId(requestId: string): string {
  return `request-row-${requestId}`;
}

function RequestRow(props: {
  request: TimelineRequest;
  scale: TimeScale;
  now: number;
  selected: boolean;
  tooltipId: string | undefined;
  onHover: () => void;
  onClick: () => void;
}) {
  const { request, selected } = props;
  const outcome = describeOutcome(request.last);
  const { timing } = request;
  const wall = timing.wallMs ?? Math.max(props.now - request.startedAt, 0);

  return (
    <li
      id={rowDomId(request.requestId)}
      data-request-id={request.requestId}
      role="option"
      aria-selected={selected}
      aria-label={`${request.label}, ${request.method} ${request.url}, ${outcome.label}, ${formatMs(timing.wallMs)} wall-clock, ${request.retries} ${request.retries === 1 ? "retry" : "retries"}`}
      onClick={props.onClick}
      onMouseEnter={props.onHover}
      className={`${ROW_GRID} relative animate-row-in cursor-pointer border-b border-line/70 px-4 py-2.5 transition-colors duration-150 last:border-b-0 ${
        selected ? "bg-accent-soft" : "hover:bg-canvas"
      }`}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
      <span data-cell="status" className={`order-2 flex items-center gap-1.5 text-[13px] font-medium md:order-none ${TONE_TEXT[outcome.tone]}`}>
        <StatusIcon name={outcome.icon} className={`h-4 w-4 ${request.last.outcome === "pending" ? "animate-pending" : ""}`} />
        {outcome.label}
      </span>
      <span className="order-1 min-w-0 md:order-none">
        <span className={`block truncate text-sm ${selected ? "font-semibold" : ""}`}>{request.label}</span>
        <span className="block truncate font-mono text-xs text-secondary">
          {request.method} {request.url}
        </span>
      </span>
      <Rail request={request} scale={props.scale} now={props.now} />
      <span className="order-1 text-right font-mono md:order-none">
        <span className="block text-sm text-fg">{formatMs(wall)}</span>
        <span className="block text-xs text-muted">
          {timing.settled
            ? `sim ${formatMs(timing.simulatedMs)}${timing.waitMs > 0 ? ` · wait ${formatMs(timing.waitMs)}` : ""}`
            : `planned ${formatMs(timing.plannedDelayMs)}`}
        </span>
      </span>
      <span data-cell="retries" className={`order-2 text-right font-mono text-[13px] md:order-none ${request.retries > 0 ? "text-warning" : "text-muted"}`}>
        {request.retries > 0 ? `↻ ${request.retries}` : "—"}
      </span>
      {props.tooltipId && <RowTooltip id={props.tooltipId} request={request} origin={props.scale.origin} />}
    </li>
  );
}

function Rail({ request, scale, now }: { request: TimelineRequest; scale: TimeScale; now: number }) {
  const at = (epoch: number) => `${position(scale, epoch - scale.origin)}%`;
  const width = (ms: number) => `${(Math.max(ms, 0) / Math.max(scale.endMs - scale.startMs, 1)) * 100}%`;

  return (
    <span className="relative order-3 col-span-2 h-6 overflow-hidden md:order-none md:col-span-1" aria-hidden="true">
      <CalibrationGrid scale={scale} />
      <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
      {request.attempts.map((attempt, index) => {
        const previous = request.attempts[index - 1];
        const outcome = describeOutcome(attempt);
        const pending = attempt.outcome === "pending";
        const duration = attempt.durationMs ?? Math.max(now - attempt.startedAt, 0);
        const split = attemptTiming(attempt);
        const delay = pending ? Math.min(attempt.simulatedDelayMs, duration) : split.appliedDelayMs;
        const execution = pending ? 0 : split.executionMs;
        const tone = TONE_TEXT[outcome.tone];

        return (
          <span key={attempt.id}>
            {previous?.endedAt !== undefined && (
              <span
                className="absolute top-1/2 border-t-2 border-dotted border-warning"
                style={{ left: at(previous.endedAt), width: width(attempt.startedAt - previous.endedAt) }}
              />
            )}
            <span className={`absolute top-[5px] h-[14px] w-[2px] rounded-full ${TONE_BG[outcome.tone]}`} style={{ left: at(attempt.startedAt) }} />
            {delay > 0 && (
              <span className={`absolute top-1/2 h-2.5 -translate-y-1/2 ${tone} ${pending ? "animate-pending" : ""}`} style={{ left: at(attempt.startedAt), width: width(delay) }}>
                <span className="hatch block h-full w-full rounded-[2px]" />
              </span>
            )}
            {execution > 0 && (
              <span
                className={`absolute top-1/2 h-2.5 min-w-[2px] -translate-y-1/2 rounded-[2px] ${TONE_BG[outcome.tone]}`}
                style={{ left: at(attempt.startedAt + delay), width: width(execution) }}
              />
            )}
            {!pending && (
              <span className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${tone}`} style={{ left: at(attempt.startedAt + duration) }}>
                <Endpoint icon={outcome.icon} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function Endpoint({ icon }: { icon: ReturnType<typeof describeOutcome>["icon"] }) {
  if (icon === "check") return <span className="block h-2 w-2 rounded-full bg-current ring-2 ring-surface" />;
  return <StatusIcon name={icon} className="h-3.5 w-3.5 rounded-full bg-surface" />;
}

function CalibrationGrid({ scale }: { scale: TimeScale }) {
  return (
    <>
      {scale.ticks.map((tick) => (
        <span key={tick} className="absolute inset-y-0 w-px bg-line/60" style={{ left: `${position(scale, tick)}%` }} />
      ))}
    </>
  );
}

/** Exact values on hover or keyboard focus. The split always adds up: sim + exec + wait = wall. */
function RowTooltip({ id, request, origin }: { id: string; request: TimelineRequest; origin: number }) {
  const { timing } = request;
  return (
    <div
      id={id}
      role="tooltip"
      className="pointer-events-none absolute top-full right-4 z-10 mt-1 w-[min(30rem,calc(100%-2rem))] animate-fade-in rounded-ui border border-line bg-surface p-3 text-xs shadow-[0_4px_16px_rgb(26_25_22/0.12)]"
    >
      <p className="mb-2 font-medium text-fg">
        {request.label}{" "}
        <span className="font-mono font-normal text-secondary">
          {request.method} {request.url}
        </span>
      </p>
      <table className="w-full font-mono">
        <thead className="text-left text-muted">
          <tr>
            <th className="pr-2 font-normal">#</th>
            <th className="pr-2 font-normal">outcome</th>
            <th className="pr-2 font-normal">start</th>
            <th className="pr-2 font-normal">end</th>
            <th className="pr-2 font-normal">sim</th>
            <th className="font-normal">exec</th>
          </tr>
        </thead>
        <tbody className="text-fg">
          {request.attempts.map((attempt) => {
            const split = attemptTiming(attempt);
            const view = describeOutcome(attempt);
            return (
              <tr key={attempt.id}>
                <td className="pr-2">{attempt.attempt}</td>
                <td className={`pr-2 ${TONE_TEXT[view.tone]}`}>{view.label.toLowerCase()}</td>
                <td className="pr-2">{formatOffset(attempt.startedAt - origin)}</td>
                <td className="pr-2">{attempt.endedAt === undefined ? "…" : formatOffset(attempt.endedAt - origin)}</td>
                <td className="pr-2">{split.durationMs === undefined ? `${formatMs(attempt.simulatedDelayMs)} planned` : formatMs(split.appliedDelayMs)}</td>
                <td>{split.durationMs === undefined ? "…" : formatMs(split.executionMs)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 border-t border-line pt-2 font-mono text-secondary">
        {timing.settled
          ? `wall ${formatMs(timing.wallMs)} = sim ${formatMs(timing.simulatedMs)} + exec ${formatMs(timing.executionMs)} + wait ${formatMs(timing.waitMs)}`
          : "in flight: wall-clock not final yet"}
      </p>
    </div>
  );
}

function Legend() {
  const item = "flex items-center gap-2";
  return (
    <div id="recorder-legend" className="flex flex-wrap gap-x-5 gap-y-2 rounded-ui bg-surface px-4 py-3 text-[13px] text-secondary">
      <span className={item}>
        <span className="inline-block h-2.5 w-5 text-neutral">
          <span className="hatch block h-full w-full rounded-[2px]" />
        </span>
        Simulated delay
      </span>
      <span className={item}>
        <span className="inline-block h-2.5 w-5 rounded-[2px] bg-neutral" /> Measured execution
      </span>
      <span className={item}>
        <span className="inline-block w-5 border-t-2 border-dotted border-warning" /> Retry wait
      </span>
      <span className={`${item} text-success`}>
        <span className="inline-block h-2 w-2 rounded-full bg-current" /> <span className="text-secondary">Response</span>
      </span>
      <span className={`${item} text-failure`}>
        <StatusIcon name="cross" className="h-3.5 w-3.5" /> <span className="text-secondary">Dropped / error</span>
      </span>
      <span className={`${item} text-failure`}>
        <StatusIcon name="clock" className="h-3.5 w-3.5" /> <span className="text-secondary">Timed out</span>
      </span>
      <span className={`${item} text-failure`}>
        <StatusIcon name="blocked" className="h-3.5 w-3.5" /> <span className="text-secondary">Blocked (offline)</span>
      </span>
    </div>
  );
}

/** A single labelled anatomy example plus the first-run steps. Static and marked as an example, not data. */
function EmptyRecorder({ scale }: { scale: TimeScale }) {
  const pct = (value: number) => `${value}%`;
  return (
    <div>
      <div className={`${ROW_GRID} border-b border-dashed border-line px-4 py-2.5 text-muted`} aria-hidden="true">
        <span className="order-2 text-xs font-medium tracking-wide uppercase md:order-none">Example</span>
        <span className="order-1 min-w-0 md:order-none">
          <span className="block text-sm text-secondary">Fetch catalog</span>
          <span className="block font-mono text-xs">GET /api/demo/catalog</span>
        </span>
        <span className="relative order-3 col-span-2 h-6 text-neutral md:order-none md:col-span-1">
          <CalibrationGrid scale={scale} />
          <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
          <span className="absolute top-[5px] h-[14px] w-[2px] bg-current" style={{ left: pct(0) }} />
          <span className="absolute top-1/2 h-2.5 -translate-y-1/2" style={{ left: pct(0), width: pct(28) }}>
            <span className="hatch block h-full w-full rounded-[2px]" />
          </span>
          <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: pct(28) }}>
            <StatusIcon name="cross" className="h-3.5 w-3.5 rounded-full bg-surface" />
          </span>
          <span className="absolute top-1/2 border-t-2 border-dotted border-current" style={{ left: pct(29), width: pct(15) }} />
          <span className="absolute top-[5px] h-[14px] w-[2px] bg-current" style={{ left: pct(45) }} />
          <span className="absolute top-1/2 h-2.5 -translate-y-1/2" style={{ left: pct(45), width: pct(24) }}>
            <span className="hatch block h-full w-full rounded-[2px]" />
          </span>
          <span className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-[2px] bg-current" style={{ left: pct(69), width: pct(9) }} />
          <span className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" style={{ left: pct(78) }} />
        </span>
        <span className="order-1 text-right font-mono text-sm md:order-none">—</span>
        <span className="order-2 text-right font-mono text-[13px] md:order-none">↻ 1</span>
      </div>
      <div className="flex flex-col gap-3 px-4 py-5">
        <p className="text-sm font-medium text-fg">No requests yet.</p>
        <p className="max-w-prose text-sm text-secondary">
          The example above shows a hatched simulated delay that ends in a drop (✕), a dotted retry wait, then a second attempt whose measured execution ends in a
          response (●). Your requests will appear the same way, on one time scale measured from the run&apos;s first request.
        </p>
        <ol className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-secondary">
          <li>
            <span className="font-mono text-muted">1</span> Choose a network profile
          </li>
          <li>
            <span className="font-mono text-muted">2</span> Pick an endpoint
          </li>
          <li>
            <span className="font-mono text-muted">3</span> Run scenario <Kbd>R</Kbd>
          </li>
          <li>
            <span className="font-mono text-muted">4</span> Select a row to inspect
          </li>
          <li>
            <span className="font-mono text-muted">5</span> Export report <Kbd>E</Kbd>
          </li>
        </ol>
      </div>
    </div>
  );
}

/** Ticks every 100 ms while `active`, so pending bars grow. Returns 0 until the first tick. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 100);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [active]);
  return now;
}
