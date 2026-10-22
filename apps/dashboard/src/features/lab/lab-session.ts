import {
  EventRecorder,
  PRESETS,
  createSeededRandom,
  createSlowFetch,
  type NetworkProfile,
  type RandomSource,
  type RequestEvent,
  type SlowFetch,
} from "@slownet/core";

export type LabSnapshot = {
  profile: NetworkProfile;
  /** Increments on every Clear run; used to number runs in the UI. */
  runId: number;
  /** Increments when the profile changes from outside the custom form (preset, shortcut, palette, sample session). */
  profileRevision: number;
};

export type ProfileSource = "form" | "external";

/** What Clear run removed, so it can be undone. In-flight attempts are recorded as cancelled. */
export type ClearedRun = { events: readonly RequestEvent[]; random: RandomSource; runId: number };

function createRandom(seed: number | undefined): RandomSource {
  return seed === undefined ? Math.random : createSeededRandom(seed);
}

/**
 * Owns the simulation for one browser tab: active profile, the run's random sequence,
 * the recorder and the run's abort controller. Plain mutable state behind a subscribe API,
 * so scripted sequences can switch profile and fetch in the same tick.
 */
export class LabSession {
  readonly recorder = new EventRecorder();
  private profile: NetworkProfile = PRESETS.stable;
  // The random sequence belongs to the run: it restarts on Clear run or when the seed changes,
  // but editing latency or switching presets mid-run keeps consuming the same sequence.
  private random: RandomSource = Math.random;
  private controller = new AbortController();
  private snapshot: LabSnapshot = { profile: this.profile, runId: 1, profileRevision: 0 };
  private readonly listeners = new Set<() => void>();

  readonly slowFetch: SlowFetch = createSlowFetch({
    profile: () => this.profile,
    random: () => this.random(),
    recorder: this.recorder,
  });

  getSnapshot = (): LabSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getProfile(): NetworkProfile {
    return this.profile;
  }

  /** Aborted on Clear run so in-flight demo requests stop and release their timers. */
  get runSignal(): AbortSignal {
    return this.controller.signal;
  }

  setProfile(next: NetworkProfile, source: ProfileSource = "external"): void {
    if (next.seed !== this.profile.seed) this.random = createRandom(next.seed);
    this.profile = next;
    this.update({
      profile: next,
      profileRevision: this.snapshot.profileRevision + (source === "external" ? 1 : 0),
    });
  }

  clear(): ClearedRun {
    const clearedAt = Date.now();
    const cleared: ClearedRun = {
      // Clear run aborts in-flight attempts; record them as cancelled so an undo shows the truth.
      events: this.recorder.getEvents().map((event) =>
        event.outcome === "pending"
          ? {
              ...event,
              outcome: "aborted",
              endedAt: clearedAt,
              durationMs: clearedAt - event.startedAt,
              errorCode: "ABORTED",
              errorMessage: "Cancelled by Clear run",
            }
          : event,
      ),
      random: this.random,
      runId: this.snapshot.runId,
    };
    this.abortInFlight();
    this.recorder.clear();
    this.random = createRandom(this.profile.seed);
    this.update({ runId: this.snapshot.runId + 1 });
    return cleared;
  }

  /** Undo a Clear run: the events, the run number and the random sequence position come back. */
  restore(cleared: ClearedRun): void {
    this.recorder.restore(cleared.events);
    this.random = cleared.random;
    this.update({ runId: cleared.runId });
  }

  /** Stops in-flight requests without clearing the run, e.g. when the page unmounts. */
  abortInFlight(): void {
    this.controller.abort();
    this.controller = new AbortController();
  }

  private update(patch: Partial<LabSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}
