"use client";

import { PRESET_LIST, type NetworkProfile } from "@slownet/core";
import type { ProfileSource } from "@/features/lab/lab-session";
import { formatMs, formatPercent } from "@/features/lab/format";
import { AdvancedConditions } from "./advanced-conditions";
import { Kbd, PlayIcon, UiIcon } from "./icons";

type Props = {
  profile: NetworkProfile;
  /** Re-initialises the advanced form when the profile changes from outside it. */
  profileRevision: number;
  onProfileChange: (profile: NetworkProfile, source: ProfileSource) => void;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  showAdvanced: boolean;
  runLabel: string;
  runDisabled: boolean;
  onRun: () => void;
  sampleRunning: boolean;
  onRunSample: () => void;
  /** Live sessions: requests come from connected apps, so there is nothing to run here. */
  live: boolean;
  /** View-only live link: the profile can be seen but not changed. */
  readOnly: boolean;
};

export function profileSummary(profile: NetworkProfile): string {
  if (profile.offline) return "Offline · every request blocked";
  return `${profile.latencyMs} ms ± ${profile.jitterMs} · ${formatPercent(profile.failureRate)} failures · timeout ${formatMs(profile.timeoutMs)}`;
}

export function ScenarioSetup(props: Props) {
  const { profile } = props;

  function selectPreset(preset: NetworkProfile) {
    const next = { ...preset };
    delete next.seed;
    props.onProfileChange(profile.seed === undefined ? next : { ...next, seed: profile.seed }, "external");
  }

  return (
    <section aria-labelledby="setup-heading" className="rounded-ui bg-surface">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h2 id="setup-heading" className="text-sm font-semibold">
              Profile
            </h2>
            <div role="radiogroup" aria-labelledby="setup-heading" className="flex flex-wrap gap-1 rounded-ui bg-subtle p-1">
              {PRESET_LIST.map((preset, index) => {
                const active = preset.id === profile.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-keyshortcuts={String(index + 1)}
                    onClick={() => selectPreset(preset)}
                    disabled={props.readOnly}
                    title={`${preset.name}: ${profileSummary(preset)} (${index + 1})`}
                    className={`relative flex items-center gap-2 rounded-[4px] px-3 py-1.5 text-sm transition-colors duration-[120ms] disabled:cursor-not-allowed ${
                      active ? "bg-surface font-medium text-fg shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-secondary hover:bg-surface/60 hover:text-fg"
                    }`}
                  >
                    {preset.name}
                    <Kbd aria-hidden className="hidden md:inline-flex">
                      {index + 1}
                    </Kbd>
                  </button>
                );
              })}
              {profile.id === "custom" && (
                <span role="status" className="flex items-center rounded-[4px] bg-surface px-3 py-1.5 text-sm font-medium shadow-[inset_0_-2px_0_var(--color-accent)]">
                  Custom
                </span>
              )}
            </div>
          </div>

          {props.live ? (
            <p className="text-[13px] text-secondary">{props.readOnly ? "View only. " : ""}Requests come from your connected apps.</p>
          ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={props.onRun}
              disabled={props.runDisabled}
              aria-keyshortcuts="R"
              title={`Runs “${props.runLabel}” with the active profile (R)`}
              className="flex items-center gap-2 rounded-ui bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PlayIcon />
              Run scenario
              <span className="font-normal opacity-80">· {props.runLabel}</span>
            </button>
            <button
              type="button"
              onClick={props.onRunSample}
              disabled={props.sampleRunning}
              title="Clears the run, then records three seeded requests through the engine: Stable, Flaky (seed 1, auto-retry) and Offline"
              className="rounded-ui border border-control px-3 py-2 text-sm text-fg transition-colors duration-150 hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              {props.sampleRunning ? "Running sample…" : "Load sample session"}
            </button>
          </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="font-mono text-[13px] text-secondary">
            <span className="text-fg">{profile.name}</span> · {profileSummary(profile)}
            {profile.seed !== undefined ? ` · seed ${profile.seed}` : " · no seed"}
          </p>
          {props.showAdvanced && !props.readOnly && (
            <button
              type="button"
              onClick={props.onToggleAdvanced}
              aria-expanded={props.advancedOpen}
              aria-controls="advanced-conditions"
              className="flex items-center gap-1.5 rounded-ui px-2 py-1 text-sm text-accent hover:bg-accent-soft"
            >
              Advanced conditions
              <UiIcon name="chevronDown" className={`h-4 w-4 transition-transform duration-150 ${props.advancedOpen ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {props.showAdvanced && !props.readOnly && props.advancedOpen && (
        <div id="advanced-conditions" className="animate-fade-in border-t border-line p-4">
          <AdvancedConditions key={props.profileRevision} profile={profile} onChange={(next) => props.onProfileChange(next, "form")} />
        </div>
      )}
    </section>
  );
}
