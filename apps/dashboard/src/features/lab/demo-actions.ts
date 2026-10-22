import { PRESETS, isSlowNetError, withRetry, type SlowNetErrorCode } from "@slownet/core";
import { formatMs } from "./format";
import type { ClearedRun, LabSession } from "./lab-session";

export type ActionId = "catalog" | "form" | "account";

export type ActionDefinition = {
  id: ActionId;
  title: string;
  method: "GET" | "POST";
  path: string;
  request: () => RequestInit;
};

export const ACTIONS: readonly ActionDefinition[] = [
  { id: "catalog", title: "Fetch catalog", method: "GET", path: "/api/demo/catalog", request: () => ({}) },
  {
    id: "form",
    title: "Submit form",
    method: "POST",
    path: "/api/demo/orders",
    request: () => ({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "p-102", quantity: 1 }),
    }),
  },
  { id: "account", title: "Load account", method: "GET", path: "/api/demo/account", request: () => ({}) },
];

export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((action) => [action.id, action])) as Record<ActionId, ActionDefinition>;

export const MAX_AUTO_RETRIES = 2;
export const BACKOFF_MS = 300;

export type FailureKind = "offline" | "timeout" | "dropped" | "http" | "network" | "aborted";

export type ActionState =
  | { status: "idle" }
  | { status: "loading"; requestId: string; startedAt: number; attempt: number }
  | { status: "success"; requestId: string; data: unknown; httpStatus: number; durationMs: number; attempts: number }
  | { status: "error"; requestId: string; kind: FailureKind; message: string; source: string; attempts: number };

export type DemoSnapshot = {
  states: Record<ActionId, ActionState>;
  autoRetry: boolean;
  /** The action that R and "Run a scenario" trigger. */
  selected: ActionId;
  sampleRunning: boolean;
  /** Parsed response bodies by requestId, for the inspector's outcome preview. */
  previews: Readonly<Record<string, unknown>>;
  /** Latest completion message for the live region: one per settled request, never per tick. */
  announcement: string;
};

export type ClearedDemo = { run: ClearedRun; states: Record<ActionId, ActionState>; previews: Readonly<Record<string, unknown>> };

class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`Server responded with HTTP ${status}`);
  }
}

const KIND_BY_CODE: Record<SlowNetErrorCode, FailureKind> = {
  OFFLINE: "offline",
  TIMEOUT: "timeout",
  SIMULATED_FAILURE: "dropped",
  NETWORK_ERROR: "network",
  ABORTED: "aborted",
};

function describeFailure(error: unknown): { kind: FailureKind; message: string; source: string } {
  if (error instanceof HttpStatusError) {
    return { kind: "http", message: error.message, source: `Server (HTTP ${error.status})` };
  }
  if (isSlowNetError(error)) {
    const kind = KIND_BY_CODE[error.code];
    return { kind, message: error.message, source: kind === "network" ? "Real network" : "SlowNet simulation" };
  }
  return { kind: "network", message: error instanceof Error ? error.message : "Unknown error", source: "Unknown" };
}

const IDLE_STATES: Record<ActionId, ActionState> = {
  catalog: { status: "idle" },
  form: { status: "idle" },
  account: { status: "idle" },
};

/** Runs the bundled demo app's requests through the session and tracks each action's UI state. */
export class DemoActions {
  private snapshot: DemoSnapshot = { states: IDLE_STATES, autoRetry: false, selected: "catalog", sampleRunning: false, previews: {}, announcement: "" };
  private readonly listeners = new Set<() => void>();
  // Keeps counting across runs so a request id is never reused.
  private requestCounter = 0;

  constructor(private readonly session: LabSession) {}

  getSnapshot = (): DemoSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  select(id: ActionId): void {
    if (this.snapshot.selected !== id) this.update({ selected: id });
  }

  setAutoRetry(autoRetry: boolean): void {
    this.update({ autoRetry });
  }

  isBusy(id: ActionId): boolean {
    return this.snapshot.states[id].status === "loading" || this.snapshot.sampleRunning;
  }

  /** Starts a new logical request. Resolves when it settles; never rejects. */
  run(id: ActionId): Promise<void> {
    if (this.isBusy(id)) return Promise.resolve();
    this.requestCounter += 1;
    this.select(id);
    return this.execute(id, `${id}-${this.requestCounter}`, 1);
  }

  /** Retries the last request of this action as its next attempt, so the timeline links them. */
  retry(id: ActionId): Promise<void> {
    const state = this.snapshot.states[id];
    if (state.status !== "error") return this.run(id);
    if (this.snapshot.sampleRunning) return Promise.resolve();
    return this.execute(id, state.requestId, state.attempts + 1);
  }

  clear(): ClearedDemo {
    const cleared: ClearedDemo = { run: this.session.clear(), states: this.snapshot.states, previews: this.snapshot.previews };
    this.update({ states: IDLE_STATES, previews: {}, announcement: "Run cleared." });
    return cleared;
  }

  undoClear(cleared: ClearedDemo): void {
    this.session.restore(cleared.run);
    const states = Object.fromEntries(
      Object.entries(cleared.states).map(([id, state]) => [
        id,
        state.status === "loading"
          ? { status: "error", requestId: state.requestId, kind: "aborted", message: "Cancelled by Clear run", source: "SlowNet (run cleared)", attempts: state.attempt }
          : state,
      ]),
    ) as Record<ActionId, ActionState>;
    this.update({ states, previews: cleared.previews, announcement: "Clear run undone." });
  }

  /**
   * A short scripted run through the real engine: a fast success, a seeded drop that
   * recovers on retry, and an offline block. Seed 1 on Flaky fails the first attempt.
   */
  async runSample(): Promise<void> {
    if (this.snapshot.sampleRunning) return;
    this.clear();
    const { runId } = this.session.getSnapshot();
    const steps: (() => Promise<void>)[] = [
      () => {
        this.session.setProfile(PRESETS.stable);
        return this.execute("catalog", this.nextRequestId("catalog"), 1);
      },
      () => {
        this.session.setProfile({ ...PRESETS.flaky, seed: 1 });
        this.setAutoRetry(true);
        return this.execute("catalog", this.nextRequestId("catalog"), 1);
      },
      () => {
        this.session.setProfile(PRESETS.offline);
        return this.execute("form", this.nextRequestId("form"), 1);
      },
    ];
    this.update({ sampleRunning: true });
    try {
      for (const step of steps) {
        if (this.session.getSnapshot().runId !== runId) break; // cleared mid-sample
        await step();
      }
    } finally {
      this.update({ sampleRunning: false, announcement: "Sample session finished: 3 requests recorded." });
    }
  }

  private nextRequestId(id: ActionId): string {
    this.requestCounter += 1;
    return `${id}-${this.requestCounter}`;
  }

  private async execute(id: ActionId, requestId: string, firstAttempt: number): Promise<void> {
    const action = ACTION_BY_ID[id];
    const signal = this.session.runSignal;
    const maxRetries = this.snapshot.autoRetry ? MAX_AUTO_RETRIES : 0;
    const startedAt = performance.now();
    let attempt = firstAttempt;
    this.setState(id, { status: "loading", requestId, startedAt, attempt });

    try {
      const response = await withRetry(
        (n) => {
          attempt = firstAttempt + n - 1;
          if (n > 1) this.setState(id, { status: "loading", requestId, startedAt, attempt });
          return this.session.slowFetch(action.path, {
            ...action.request(),
            label: action.title,
            requestId,
            attempt,
            signal,
            retryPolicy: { maxRetries, backoffMs: BACKOFF_MS },
          });
        },
        { maxRetries, backoffMs: BACKOFF_MS, signal },
      );
      const data: unknown = await response.json().catch(() => null);
      if (signal.aborted) return;
      this.update({ previews: { ...this.snapshot.previews, [requestId]: data } });
      if (!response.ok) throw new HttpStatusError(response.status);
      const durationMs = performance.now() - startedAt;
      this.setState(id, { status: "success", requestId, data, httpStatus: response.status, durationMs, attempts: attempt });
      this.update({ announcement: `${action.title} finished: HTTP ${response.status} in ${formatMs(durationMs)}${attempt > 1 ? ` after ${attempt} attempts` : ""}.` });
    } catch (error) {
      if (signal.aborted) return; // the run was cleared; its UI state is already reset
      const failure = describeFailure(error);
      this.setState(id, { status: "error", requestId, ...failure, attempts: attempt });
      this.update({ announcement: `${action.title} failed: ${failure.message}.` });
    }
  }

  private setState(id: ActionId, state: ActionState): void {
    this.update({ states: { ...this.snapshot.states, [id]: state } });
  }

  private update(patch: Partial<DemoSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}
