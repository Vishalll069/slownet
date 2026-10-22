"use client";

import { useEffect, useState } from "react";
import { ACTIONS, BACKOFF_MS, MAX_AUTO_RETRIES, type ActionDefinition, type ActionState, type DemoActions, type DemoSnapshot } from "@/features/lab/demo-actions";
import { formatMs } from "@/features/lab/format";
import { Kbd, PlayIcon, StatusIcon } from "./icons";

type Props = {
  demo: DemoSnapshot;
  actions: DemoActions;
};

export function EndpointList({ demo, actions }: Props) {
  return (
    <section aria-labelledby="endpoints-heading" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="endpoints-heading" className="text-sm font-semibold">
          Demo endpoints <span className="font-normal text-muted">· synthetic data</span>
        </h2>
        <label className="flex items-center gap-2.5 text-sm">
          <span>
            Auto-retry: {demo.autoRetry ? "On" : "Off"}
            {demo.autoRetry && <span className="text-secondary"> · up to {MAX_AUTO_RETRIES}, {BACKOFF_MS} ms backoff</span>}
          </span>
          <input type="checkbox" role="switch" checked={demo.autoRetry} onChange={(event) => actions.setAutoRetry(event.target.checked)} className="switch" />
        </label>
      </div>

      <div role="radiogroup" aria-labelledby="endpoints-heading" className="overflow-hidden rounded-ui bg-surface">
        {ACTIONS.map((action) => (
          <EndpointRow
            key={action.id}
            action={action}
            state={demo.states[action.id]}
            selected={demo.selected === action.id}
            busy={demo.states[action.id].status === "loading" || demo.sampleRunning}
            onSelect={() => actions.select(action.id)}
            onRun={() => void actions.run(action.id)}
            onRetry={() => void actions.retry(action.id)}
          />
        ))}
      </div>
    </section>
  );
}

function EndpointRow(props: {
  action: ActionDefinition;
  state: ActionState;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onRun: () => void;
  onRetry: () => void;
}) {
  const { action, state } = props;

  return (
    <article
      aria-label={action.title}
      aria-busy={state.status === "loading"}
      className={`relative grid items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2 last:border-b-0 sm:grid-cols-[14rem_minmax(0,1fr)_auto] ${
        props.selected ? "bg-accent-soft/50" : ""
      }`}
    >
      {props.selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
      <button type="button" role="radio" aria-checked={props.selected} onClick={props.onSelect} title="Use this endpoint for Run scenario" className="flex items-center gap-3 rounded-ui text-left">
        <span
          aria-hidden="true"
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${props.selected ? "border-accent" : "border-control"}`}
        >
          {props.selected && <span className="h-2 w-2 rounded-full bg-accent" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{action.title}</span>
          <span className="block font-mono text-xs text-secondary">
            {action.method} {action.path}
          </span>
        </span>
      </button>

      <div className="min-w-0 text-[13px]">
        <EndpointState action={action} state={state} />
      </div>

      <div className="flex items-center gap-2 sm:justify-end">
        {state.status === "error" && (
          <button type="button" onClick={props.onRetry} disabled={props.busy} className="rounded-ui px-2 py-1.5 text-[13px] text-accent hover:bg-accent-soft disabled:opacity-50">
            Try again
          </button>
        )}
        <button
          type="button"
          onClick={props.onRun}
          disabled={props.busy}
          aria-label={`Run ${action.title}`}
          aria-keyshortcuts={props.selected ? "R" : undefined}
          title={props.selected ? `Run ${action.title} (R)` : `Run ${action.title}`}
          className="flex items-center gap-2 rounded-ui border border-control bg-surface px-3 py-1 text-[13px] font-medium text-fg transition-colors duration-150 hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlayIcon className="h-2.5 w-2.5" />
          Run
          {props.selected && <Kbd aria-hidden>R</Kbd>}
        </button>
      </div>
    </article>
  );
}

function EndpointState({ action, state }: { action: ActionDefinition; state: ActionState }) {
  if (state.status === "idle") return <p className="text-muted">Not run yet.</p>;

  if (state.status === "loading") {
    return (
      <p className={`flex items-center gap-1.5 ${state.attempt > 1 ? "text-warning" : "text-neutral"}`}>
        <StatusIcon name={state.attempt > 1 ? "retry" : "pending"} className="h-3.5 w-3.5 animate-pending" />
        {state.attempt > 1 ? `Retrying · attempt ${state.attempt}` : "Loading…"} <Elapsed since={state.startedAt} />
      </p>
    );
  }

  if (state.status === "success") {
    return (
      <p className="flex min-w-0 items-center gap-1.5">
        <span className="flex shrink-0 items-center gap-1.5 font-medium text-success">
          <StatusIcon name="check" /> OK {state.httpStatus}
        </span>
        <span className="shrink-0 font-mono text-xs text-secondary">
          {formatMs(state.durationMs)}
          {state.attempts > 1 && <span className="text-warning"> · {state.attempts} attempts</span>}
        </span>
        <span className="truncate text-secondary">· {resultSummary(action, state.data)}</span>
      </p>
    );
  }

  const offline = state.kind === "offline";
  const headline: Record<typeof state.kind, string> = {
    offline: "You're offline",
    timeout: "Request timed out",
    dropped: "Connection dropped",
    http: "Server error",
    network: "Network error",
    aborted: "Request cancelled",
  };
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex items-center gap-1.5 font-medium text-failure">
        <StatusIcon name={offline ? "blocked" : state.kind === "timeout" ? "clock" : state.kind === "aborted" ? "cancel" : "cross"} />
        {headline[state.kind]}
        {state.attempts > 1 && <span className="font-normal text-secondary">· {state.attempts} attempts</span>}
      </p>
      <p className="text-secondary">
        {offline ? "Blocked before leaving the browser; nothing reached the server." : state.message} <span className="font-mono text-xs text-muted">Source: {state.source}</span>
      </p>
    </div>
  );
}

type CatalogItem = { id: string; name: string };

function resultSummary(action: ActionDefinition, data: unknown): string {
  if (action.id === "catalog") {
    const items = (data as { items?: CatalogItem[] }).items ?? [];
    return `${items.length} items: ${items.map((item) => item.name).join(", ")}`;
  }
  if (action.id === "form") {
    const order = (data as { order?: { id: string; status: string } }).order;
    return `Order ${order?.id} ${order?.status}`;
  }
  const account = (data as { account?: { name: string; plan: string } }).account;
  return `${account?.name} · ${account?.plan} plan`;
}

/** Visual only: the live region announces completion, not a ticking counter. */
function Elapsed({ since }: { since: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(performance.now() - since), 100);
    return () => clearInterval(timer);
  }, [since]);
  return (
    <span aria-hidden="true" className="font-mono text-xs">
      {formatMs(elapsed)}
    </span>
  );
}
