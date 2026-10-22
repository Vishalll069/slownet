"use client";

import { PROFILE_LIMITS, networkProfileSchema, type NetworkProfile } from "@slownet/core";
import { useId, useState } from "react";

type Draft = {
  latencyMs: string;
  jitterMs: string;
  failurePercent: string;
  timeoutMs: string;
  offline: boolean;
  seed: string;
};

function toDraft(profile: NetworkProfile): Draft {
  return {
    latencyMs: String(profile.latencyMs),
    jitterMs: String(profile.jitterMs),
    failurePercent: String(Math.round(profile.failureRate * 1000) / 10),
    timeoutMs: String(profile.timeoutMs),
    offline: profile.offline,
    seed: profile.seed === undefined ? "" : String(profile.seed),
  };
}

const FIELD_FOR_PATH: Record<string, keyof Draft> = {
  latencyMs: "latencyMs",
  jitterMs: "jitterMs",
  failureRate: "failurePercent",
  timeoutMs: "timeoutMs",
  seed: "seed",
};

/** Messages in the units the user typed (e.g. percent, not the schema's 0..1). */
const FIELD_MESSAGE: Partial<Record<keyof Draft, string>> = {
  latencyMs: `Whole number from 0 to ${PROFILE_LIMITS.maxLatencyMs.toLocaleString("en-US")} ms`,
  jitterMs: `Whole number from 0 to ${PROFILE_LIMITS.maxJitterMs.toLocaleString("en-US")} ms`,
  failurePercent: "Must be between 0 and 100%",
  timeoutMs: `Whole number from 1 to ${PROFILE_LIMITS.maxTimeoutMs.toLocaleString("en-US")} ms`,
  seed: "Whole number from 0 to 4,294,967,295",
};

/** Slider ranges cover everyday values; the numeric field accepts the full validated range. */
const SLIDER = {
  latencyMs: { min: 0, max: 3_000, step: 10 },
  jitterMs: { min: 0, max: 1_500, step: 10 },
  failurePercent: { min: 0, max: 100, step: 1 },
  timeoutMs: { min: 500, max: 20_000, step: 100 },
} as const;

/** Latency, jitter, failure rate, timeout, offline and seed. Re-mount (via key) to re-initialise from a new profile. */
export function AdvancedConditions({ profile, onChange }: { profile: NetworkProfile; onChange: (profile: NetworkProfile) => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const noteId = useId();

  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);

    const requiredFields = ["latencyMs", "jitterMs", "failurePercent", "timeoutMs"] as const;
    const blank = requiredFields.filter((field) => next[field].trim() === "");
    if (blank.length > 0) {
      setErrors(Object.fromEntries(blank.map((field) => [field, "Required"])));
      return;
    }

    const conditions = {
      latencyMs: Number(next.latencyMs),
      jitterMs: Number(next.jitterMs),
      failureRate: Number(next.failurePercent) / 100,
      timeoutMs: Number(next.timeoutMs),
      offline: next.offline,
    };
    // A seed doesn't change the network conditions, so only a real parameter edit makes the profile "Custom".
    const unchanged = (Object.keys(conditions) as (keyof typeof conditions)[]).every((key) => conditions[key] === profile[key]);
    const candidate = {
      ...(unchanged ? { id: profile.id, name: profile.name } : { id: "custom", name: "Custom" }),
      ...conditions,
      ...(next.seed.trim() !== "" && { seed: Number(next.seed) }),
    };
    const result = networkProfileSchema.safeParse(candidate);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof Draft, string>> = {};
      for (const issue of result.error.issues) {
        const field = FIELD_FOR_PATH[String(issue.path[0])];
        if (field && !fieldErrors[field]) fieldErrors[field] = FIELD_MESSAGE[field] ?? issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onChange(result.data as NetworkProfile);
  }

  const disabledBy = draft.offline ? noteId : undefined;

  return (
    <form onSubmit={(event) => event.preventDefault()} aria-label="Advanced conditions" className="flex flex-col gap-5">
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Latency" unit="ms" field="latencyMs" draft={draft} error={errors.latencyMs} disabledBy={disabledBy} onChange={update} />
        <Field label="Jitter" unit="± ms" field="jitterMs" draft={draft} error={errors.jitterMs} disabledBy={disabledBy} onChange={update} />
        <Field label="Failure rate" unit="%" step="0.1" field="failurePercent" draft={draft} error={errors.failurePercent} disabledBy={disabledBy} onChange={update} />
        <Field label="Timeout" unit="ms" field="timeoutMs" draft={draft} error={errors.timeoutMs} disabledBy={disabledBy} onChange={update} />
      </div>

      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-4 rounded-ui bg-canvas px-3 py-2.5">
          <span className="flex flex-col">
            <span className="text-sm font-medium">Offline mode: {draft.offline ? "On" : "Off"}</span>
            <span className="text-[13px] text-secondary">{draft.offline ? "Every request is blocked before it leaves the browser." : "Requests are sent after the simulated delay."}</span>
          </span>
          <input type="checkbox" role="switch" checked={draft.offline} onChange={(event) => update({ offline: event.target.checked })} className="switch" />
        </label>
        <SeedField draft={draft} error={errors.seed} onChange={update} />
      </div>

      {draft.offline && (
        <p id={noteId} className="text-[13px] text-secondary">
          Offline mode is on, so latency, jitter, failure rate and timeout are ignored.
        </p>
      )}
    </form>
  );
}

function Field(props: {
  label: string;
  unit: string;
  field: keyof typeof SLIDER;
  draft: Draft;
  error: string | undefined;
  step?: string;
  /** Id of the note explaining why the field is disabled; undefined when enabled. */
  disabledBy: string | undefined;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const id = useId();
  const value = props.draft[props.field];
  const slider = SLIDER[props.field];
  const sliderValue = Math.min(Math.max(Number(value) || 0, slider.min), slider.max);
  const disabled = props.disabledBy !== undefined;

  return (
    <div className={`flex flex-col gap-2 ${disabled ? "opacity-50" : ""}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {props.label}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          aria-label={`${props.label} slider`}
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={sliderValue}
          disabled={disabled}
          onChange={(event) => props.onChange({ [props.field]: event.target.value })}
          className="h-5 min-w-0 flex-1 cursor-pointer disabled:cursor-not-allowed"
        />
        <span className="flex items-center gap-1.5">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={0}
            step={props.step ?? "1"}
            value={value}
            disabled={disabled}
            aria-invalid={props.error ? true : undefined}
            aria-describedby={props.error ? `${id}-error` : props.disabledBy}
            onChange={(event) => props.onChange({ [props.field]: event.target.value })}
            className={`w-24 rounded-ui border bg-surface px-2 py-1.5 text-right font-mono text-sm text-fg focus:border-accent disabled:cursor-not-allowed ${
              props.error ? "border-failure" : "border-control"
            }`}
          />
          <span className="w-8 font-mono text-xs text-muted">{props.unit}</span>
        </span>
      </div>
      {props.error && (
        <p id={`${id}-error`} className="flex items-center gap-1 text-[13px] text-failure">
          <span aria-hidden="true">✕</span> {props.error}
        </p>
      )}
    </div>
  );
}

function SeedField({ draft, error, onChange }: { draft: Draft; error: string | undefined; onChange: (patch: Partial<Draft>) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Seed
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          value={draft.seed}
          placeholder="none: random each run"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          onChange={(event) => onChange({ seed: event.target.value })}
          className={`min-w-0 flex-1 rounded-ui border bg-surface px-2 py-1.5 font-mono text-sm text-fg placeholder:text-muted focus:border-accent ${
            error ? "border-failure" : "border-control"
          }`}
        />
        <button
          type="button"
          onClick={() => onChange({ seed: String(Math.floor(Math.random() * 100_000)) })}
          className="rounded-ui border border-control px-3 text-[13px] text-fg hover:bg-subtle"
        >
          New seed
        </button>
        {draft.seed !== "" && (
          <button type="button" onClick={() => onChange({ seed: "" })} className="rounded-ui px-2 text-[13px] text-secondary underline underline-offset-4 hover:text-fg">
            Clear
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1 text-[13px] text-failure">
          <span aria-hidden="true">✕</span> {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-[13px] text-secondary">
          Same seed + same actions after Clear run = same delays and failures.
        </p>
      )}
    </div>
  );
}
