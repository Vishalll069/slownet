"use client";

import { TIMING_DEFINITIONS, attemptTiming, type NetworkProfile, type RequestEvent } from "@slownet/core";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { OUTCOME_EXPLANATION, TONE_TEXT, describeOutcome, formatClock, formatMs, formatOffset, formatPercent } from "@/features/lab/format";
import { groupRequests, type TimelineRequest } from "@/features/lab/timeline-model";
import { CopyButton } from "./copy-button";
import { CloseIcon, Kbd, StatusIcon, UiIcon } from "./icons";

type Props = {
  events: readonly RequestEvent[];
  selectedId: string | null;
  currentProfile: NetworkProfile;
  previews: Readonly<Record<string, unknown>>;
  headingRef?: Ref<HTMLHeadingElement>;
  onNavigate: (requestId: string) => void;
  /** Present when the panel can be pinned (wide screens). */
  pin?: { pinned: boolean; onToggle: () => void };
  /** Present in drawer mode. */
  onClose?: () => void;
  /** Live sessions never receive response bodies from connected apps. */
  bodiesUnavailable?: boolean;
};

export function RequestInspector({ events, selectedId, currentProfile, previews, headingRef, onNavigate, pin, onClose, bodiesUnavailable = false }: Props) {
  const requests = groupRequests(events);
  const index = requests.findIndex((candidate) => candidate.requestId === selectedId);
  const request = requests[index];
  const runOrigin = events.length ? Math.min(...events.map((event) => event.startedAt)) : 0;
  const iconButton = "flex h-8 w-8 items-center justify-center rounded-ui text-secondary transition-colors duration-150 hover:bg-subtle hover:text-fg disabled:opacity-40";

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold focus-visible:outline-offset-4">
            Request inspector
          </h2>
          <span className="font-mono text-xs text-muted">{request ? `${index + 1} / ${requests.length}` : "no selection"}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" className={iconButton} aria-label="Previous request" title="Previous request" disabled={index <= 0} onClick={() => onNavigate(requests[index - 1]!.requestId)}>
            <UiIcon name="chevronUp" />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label="Next request"
            title="Next request"
            disabled={index < 0 || index >= requests.length - 1}
            onClick={() => onNavigate(requests[index + 1]!.requestId)}
          >
            <UiIcon name="chevronDown" />
          </button>
          {pin && (
            <button
              type="button"
              className={`${iconButton} ${pin.pinned ? "bg-accent-soft text-accent" : ""}`}
              aria-pressed={pin.pinned}
              aria-label={pin.pinned ? "Unpin inspector" : "Pin inspector"}
              title={pin.pinned ? "Unpin: open the inspector as a drawer" : "Pin: keep the inspector beside the recorder"}
              onClick={pin.onToggle}
            >
              <UiIcon name="pin" />
            </button>
          )}
          {onClose && (
            <button type="button" className={iconButton} aria-label="Close inspector" title="Close (Esc)" onClick={onClose}>
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      {request ? (
        <RequestDetail
          key={request.requestId}
          request={request}
          requests={requests}
          runOrigin={runOrigin}
          currentProfile={currentProfile}
          preview={previews[request.requestId]}
          bodiesUnavailable={bodiesUnavailable}
        />
      ) : (
        <div className="flex flex-col gap-2 px-4 py-6 text-sm text-secondary">
          <p className="font-medium text-fg">No request selected.</p>
          <p>
            Select a row in the flight recorder, or focus it and use <Kbd>↑</Kbd> <Kbd>↓</Kbd> then <Kbd>Enter</Kbd>.
          </p>
        </div>
      )}
    </div>
  );
}

const TABS = ["Overview", "Timing", "Attempts", "Response"] as const;
type Tab = (typeof TABS)[number];

function RequestDetail(props: {
  request: TimelineRequest;
  requests: TimelineRequest[];
  runOrigin: number;
  currentProfile: NetworkProfile;
  preview: unknown;
  bodiesUnavailable: boolean;
}) {
  const { request } = props;
  const [tab, setTab] = useState<Tab>("Overview");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const outcome = describeOutcome(request.last);

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const current = TABS.indexOf(tab);
    const next = event.key === "ArrowRight" ? current + 1 : event.key === "ArrowLeft" ? current - 1 : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const wrapped = (next + TABS.length) % TABS.length;
    setTab(TABS[wrapped]!);
    tabRefs.current[wrapped]?.focus();
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4">
        <p className="text-base font-semibold">{request.label}</p>
        <p className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium ${TONE_TEXT[outcome.tone]}`}>
          <span className="flex items-center gap-1.5">
            <StatusIcon name={outcome.icon} className="h-4 w-4" />
            {outcome.label}
          </span>
          <span className="font-normal text-secondary">{outcome.category}</span>
          {request.retries > 0 && <span className="font-normal text-warning">· after {request.retries} {request.retries === 1 ? "retry" : "retries"}</span>}
        </p>
      </div>

      <div role="tablist" aria-label="Request details" onKeyDown={onTabKey} className="mt-3 flex gap-1 border-b border-line px-4">
        {TABS.map((name, index) => {
          const active = name === tab;
          return (
            <button
              key={name}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${name}`}
              aria-selected={active}
              aria-controls={`${baseId}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(name)}
              className={`-mb-px border-b-2 px-2 py-2 text-[13px] transition-colors duration-[120ms] ${
                active ? "border-accent font-medium text-fg" : "border-transparent text-secondary hover:text-fg"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${tab}`} className="flex flex-col gap-5 px-4 py-4">
        {tab === "Overview" && <Overview {...props} />}
        {tab === "Timing" && <TimingTab request={request} runOrigin={props.runOrigin} />}
        {tab === "Attempts" && <AttemptsTab request={request} runOrigin={props.runOrigin} />}
        {tab === "Response" && <ResponseTab request={request} preview={props.preview} bodiesUnavailable={props.bodiesUnavailable} />}
      </div>
    </div>
  );
}

function Block({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-secondary">{term}</dt>
          <dd className="text-right font-mono break-words text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Overview({ request, requests, runOrigin, currentProfile }: { request: TimelineRequest; requests: TimelineRequest[]; runOrigin: number; currentProfile: NetworkProfile }) {
  const failed = request.last.outcome !== "success" && request.last.outcome !== "pending";
  const { timing } = request;
  const used = request.first.profileSnapshot;

  return (
    <>
      {failed && (
        <section aria-label="Why it failed" className="flex flex-col gap-1.5 border-l-[3px] border-failure pl-3">
          <p className="flex items-center gap-2 font-mono text-[13px] text-failure">
            <StatusIcon name={describeOutcome(request.last).icon} />
            {request.last.errorCode ?? `HTTP ${request.last.httpStatus}`}
          </p>
          <p className="text-[13px] leading-relaxed text-fg">{OUTCOME_EXPLANATION[request.last.outcome as keyof typeof OUTCOME_EXPLANATION]}</p>
          {request.last.errorMessage && <p className="font-mono text-xs text-secondary">“{request.last.errorMessage}”</p>}
        </section>
      )}

      <Block title="Timing">
        {timing.settled ? (
          <>
            <TimingSplit request={request} />
            <Rows
              rows={[
                ["Wall-clock", formatMs(timing.wallMs)],
                ["Simulated delay", formatMs(timing.simulatedMs)],
                ["Execution", formatMs(timing.executionMs)],
                ...(timing.waitMs > 0 ? ([["Retry wait", formatMs(timing.waitMs)]] as [string, ReactNode][]) : []),
                ["HTTP status", request.last.httpStatus === undefined ? "none (no response)" : String(request.last.httpStatus)],
              ]}
            />
            <p className="text-xs text-muted">Simulated + execution + retry wait = wall-clock. Definitions are in the exported report.</p>
          </>
        ) : (
          <p className="text-[13px] text-neutral">In flight. Planned simulated delay {formatMs(timing.plannedDelayMs)}.</p>
        )}
      </Block>

      <Block title="Profile used by this request">
        {used ? <ProfileComparison used={used} request={request} current={currentProfile} /> : <p className="text-[13px] text-muted">Not recorded.</p>}
      </Block>

      <Block title="Identifiers">
        <dl className="flex flex-col gap-2 text-[13px]">
          <IdRow term="Request id" value={request.requestId} />
          <IdRow term="Endpoint" value={`${request.method} ${request.url}`} />
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-secondary">Started</dt>
            <dd className="font-mono text-fg">
              {formatClock(request.startedAt)} <span className="text-muted">({formatOffset(request.startedAt - runOrigin)} into run)</span>
            </dd>
          </div>
        </dl>
      </Block>

      <Block title="Reproduction">
        <Reproduction request={request} requests={requests} />
      </Block>
    </>
  );
}

function IdRow({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-secondary">{term}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        <span className="font-mono break-all text-fg">{value}</span>
        <CopyButton text={value} label={`Copy ${term.toLowerCase()}`} compact />
      </dd>
    </div>
  );
}

/** A proportional bar of the same split the numbers show. */
function TimingSplit({ request }: { request: TimelineRequest }) {
  const { timing } = request;
  const total = Math.max(timing.wallMs ?? 0, 1);
  const pct = (ms: number) => `${(ms / total) * 100}%`;
  return (
    <div aria-hidden="true" className="flex h-2.5 overflow-hidden rounded-[2px] bg-subtle">
      <span className="h-full text-neutral" style={{ width: pct(timing.simulatedMs) }}>
        <span className="hatch block h-full w-full" />
      </span>
      <span className="h-full bg-neutral" style={{ width: pct(timing.executionMs) }} />
      <span className="h-full border-t-2 border-dotted border-warning" style={{ width: pct(timing.waitMs) }} />
    </div>
  );
}

const CONDITIONS: { key: keyof NetworkProfile; label: string; format: (profile: NetworkProfile) => string }[] = [
  { key: "latencyMs", label: "Latency", format: (profile) => `${profile.latencyMs} ms` },
  { key: "jitterMs", label: "Jitter", format: (profile) => `± ${profile.jitterMs} ms` },
  { key: "failureRate", label: "Failure rate", format: (profile) => formatPercent(profile.failureRate) },
  { key: "timeoutMs", label: "Timeout", format: (profile) => `${profile.timeoutMs} ms` },
  { key: "offline", label: "Offline", format: (profile) => (profile.offline ? "on" : "off") },
  { key: "seed", label: "Seed", format: (profile) => (profile.seed === undefined ? "none" : String(profile.seed)) },
];

function ProfileComparison({ used, request, current }: { used: NetworkProfile; request: TimelineRequest; current: NetworkProfile }) {
  const changed = CONDITIONS.filter((condition) => used[condition.key] !== current[condition.key]);
  const changedBetweenAttempts = request.attempts.some((attempt) => attempt.profileSnapshot && CONDITIONS.some((condition) => attempt.profileSnapshot![condition.key] !== used[condition.key]));

  return (
    <>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-1 font-normal" />
            <th className="pb-1 text-right font-normal">
              Used <span className="text-secondary">({used.name})</span>
            </th>
            <th className="pb-1 text-right font-normal">
              Active now <span className="text-secondary">({current.name})</span>
            </th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {CONDITIONS.map((condition) => {
            const differs = used[condition.key] !== current[condition.key];
            return (
              <tr key={condition.key}>
                <td className="py-0.5 font-sans text-secondary">{condition.label}</td>
                <td className="py-0.5 text-right text-fg">{condition.format(used)}</td>
                <td className={`py-0.5 text-right ${differs ? "font-medium text-warning" : "text-muted"}`}>
                  {condition.format(current)}
                  {differs && <span className="sr-only"> (changed)</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-secondary">
        {changed.length === 0 ? "The active profile still matches." : `Changed since: ${changed.map((condition) => condition.label.toLowerCase()).join(", ")}. This request keeps the values it ran with.`}
        {changedBetweenAttempts && " Its attempts ran under different profiles; see the Attempts tab."}
      </p>
    </>
  );
}

function TimingTab({ request, runOrigin }: { request: TimelineRequest; runOrigin: number }) {
  const [attemptIndex, setAttemptIndex] = useState(request.attempts.length - 1);
  const attempt = request.attempts[Math.min(attemptIndex, request.attempts.length - 1)]!;
  const split = attemptTiming(attempt);
  const executed = attempt.outcome === "success" || attempt.outcome === "http-error" || attempt.outcome === "network-error";

  // Stages that were not measured for this outcome are omitted rather than shown as zero.
  const stages: { label: string; value: string; detail?: string; swatch?: "hatch" | "solid" }[] = [
    { label: "Start", value: formatOffset(attempt.startedAt - runOrigin), detail: formatClock(attempt.startedAt) },
  ];
  if (attempt.outcome === "offline") stages.push({ label: "Blocked", value: "immediately", detail: "no delay applied, nothing sent" });
  else if (split.durationMs === undefined) stages.push({ label: "Simulated delay", value: formatMs(attempt.simulatedDelayMs), detail: "planned; in flight", swatch: "hatch" });
  else
    stages.push({
      label: "Simulated delay",
      value: formatMs(split.appliedDelayMs),
      detail: split.appliedDelayMs < attempt.simulatedDelayMs ? `planned ${formatMs(attempt.simulatedDelayMs)}, cut short by the timeout` : "applied by the engine",
      swatch: "hatch",
    });
  if (executed) stages.push({ label: "Execution", value: formatMs(split.executionMs), detail: "measured: duration minus applied delay", swatch: "solid" });
  if (attempt.outcome === "timeout" && attempt.profileSnapshot) stages.push({ label: "Timeout budget", value: formatMs(attempt.profileSnapshot.timeoutMs), detail: "delay + response headers" });
  if (attempt.endedAt === undefined) stages.push({ label: "Completion", value: "in flight" });
  else {
    stages.push({ label: "Completion", value: formatOffset(attempt.endedAt - runOrigin), detail: formatClock(attempt.endedAt) });
    stages.push({ label: "Duration", value: formatMs(attempt.durationMs), detail: "wall-clock for this attempt" });
  }

  return (
    <>
      {request.attempts.length > 1 && (
        <div role="group" aria-label="Attempt" className="flex flex-wrap gap-1">
          {request.attempts.map((candidate, index) => {
            const view = describeOutcome(candidate);
            const active = candidate.id === attempt.id;
            return (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={active}
                onClick={() => setAttemptIndex(index)}
                className={`flex items-center gap-1.5 rounded-ui border px-2.5 py-1 text-[13px] ${active ? "border-accent bg-accent-soft font-medium" : "border-control text-secondary hover:text-fg"}`}
              >
                <span className={TONE_TEXT[view.tone]}>
                  <StatusIcon name={view.icon} className="h-3.5 w-3.5" />
                </span>
                Attempt {candidate.attempt}
              </button>
            );
          })}
        </div>
      )}
      <ol className="flex flex-col gap-2.5 text-[13px]">
        {stages.map((stage) => (
          <li key={stage.label} className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-3">
            <span aria-hidden="true" className="mt-1.5 h-2.5 w-4 text-neutral">
              {stage.swatch === "hatch" ? <span className="hatch block h-full w-full" /> : stage.swatch === "solid" ? <span className="block h-full w-full bg-neutral" /> : <span className="mx-auto block h-full w-px bg-control" />}
            </span>
            <span>
              <span className="text-fg">{stage.label}</span>
              {stage.detail && <span className="block text-xs text-secondary">{stage.detail}</span>}
            </span>
            <span className="text-right font-mono text-fg">{stage.value}</span>
          </li>
        ))}
      </ol>
      <details className="text-xs text-secondary">
        <summary className="cursor-pointer text-[13px] text-fg">Timing definitions</summary>
        <dl className="mt-2 flex flex-col gap-1.5">
          {Object.entries(TIMING_DEFINITIONS).map(([term, text]) => (
            <div key={term}>
              <dt className="font-mono text-muted">{term}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}

function AttemptsTab({ request, runOrigin }: { request: TimelineRequest; runOrigin: number }) {
  const policy = request.first.retryPolicy;
  return (
    <>
      <ol className="flex flex-col gap-3">
        {request.attempts.map((attempt, index) => {
          const view = describeOutcome(attempt);
          const split = attemptTiming(attempt);
          const next = request.attempts[index + 1];
          return (
            <li key={attempt.id} className="flex flex-col gap-1 border-l-2 border-line pl-3">
              <p className={`flex items-center gap-1.5 text-[13px] font-medium ${TONE_TEXT[view.tone]}`}>
                <StatusIcon name={view.icon} className="h-3.5 w-3.5" />
                Attempt {attempt.attempt} · {view.label}
                {attempt.errorCode && <span className="font-mono font-normal text-secondary">· {attempt.errorCode}</span>}
              </p>
              <p className="font-mono text-xs text-secondary">
                {formatOffset(attempt.startedAt - runOrigin)} → {attempt.endedAt === undefined ? "…" : formatOffset(attempt.endedAt - runOrigin)} · delay{" "}
                {split.durationMs === undefined ? `${formatMs(attempt.simulatedDelayMs)} planned` : formatMs(split.appliedDelayMs)} · exec {split.durationMs === undefined ? "…" : formatMs(split.executionMs)}
              </p>
              {attempt.profileSnapshot && <p className="text-xs text-muted">Profile: {attempt.profileSnapshot.name}</p>}
              {next && attempt.endedAt !== undefined && (
                <p className="text-xs text-warning">
                  Retried after {formatMs(next.startedAt - attempt.endedAt)} because {attempt.errorCode ?? attempt.outcome} {attempt.retryPolicy?.maxRetries ? "is retryable under the auto-retry policy" : "and Try again was used"}.
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <Block title="Retry policy">
        <p className="text-[13px] text-secondary">
          {!policy
            ? "Not recorded."
            : policy.maxRetries === 0
              ? request.retries > 0
                ? "Auto-retry was off. Later attempts came from Try again."
                : "Auto-retry was off: no automatic retries."
              : `Auto-retry: up to ${policy.maxRetries} retries, ${policy.backoffMs} ms backoff doubling each time. OFFLINE and ABORTED are never retried.`}
        </p>
      </Block>
    </>
  );
}

function ResponseTab({ request, preview, bodiesUnavailable }: { request: TimelineRequest; preview: unknown; bodiesUnavailable: boolean }) {
  const event = request.last;
  const body = preview === undefined ? null : JSON.stringify(preview, null, 2);
  return (
    <>
      {event.outcome === "pending" ? (
        <p className="text-[13px] text-neutral">Still in flight.</p>
      ) : event.outcome === "success" || event.outcome === "http-error" ? (
        <Block title={`Response body · HTTP ${event.httpStatus}`} aside={body ? <CopyButton text={body} label="Copy response" compact /> : undefined}>
          {body ? (
            <pre className="max-h-72 overflow-auto rounded-ui bg-canvas p-3 font-mono text-xs leading-relaxed text-fg">{body}</pre>
          ) : (
            <p className="text-[13px] text-muted">
              {bodiesUnavailable ? "Connected apps never send response bodies to SlowNet; only the status and timings." : "No body was read for this response."}
            </p>
          )}
        </Block>
      ) : (
        <Block title="Error" aside={<CopyButton text={`${event.errorCode}: ${event.errorMessage ?? ""}`} label="Copy error" compact />}>
          <p className="font-mono text-[13px] text-failure">{event.errorCode}</p>
          <p className="text-[13px] text-fg">{OUTCOME_EXPLANATION[event.outcome]}</p>
          {event.errorMessage && <p className="font-mono text-xs break-words text-secondary">“{event.errorMessage}”</p>}
        </Block>
      )}
      <details className="text-[13px]">
        <summary className="cursor-pointer text-fg">Raw events ({request.attempts.length} attempts, JSON)</summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded-ui bg-canvas p-3 font-mono text-xs leading-relaxed text-secondary">{JSON.stringify(request.attempts, null, 2)}</pre>
      </details>
    </>
  );
}

function reproductionText(request: TimelineRequest, requests: TimelineRequest[]): string {
  const snapshot = request.first.profileSnapshot;
  const upTo = requests.slice(0, requests.indexOf(request) + 1);
  const autoRetry = (request.first.retryPolicy?.maxRetries ?? 0) > 0;
  const profileJson = snapshot
    ? JSON.stringify(
        { name: snapshot.name, latencyMs: snapshot.latencyMs, jitterMs: snapshot.jitterMs, failureRate: snapshot.failureRate, timeoutMs: snapshot.timeoutMs, offline: snapshot.offline, seed: snapshot.seed ?? null },
        null,
        2,
      )
    : "(profile not recorded)";

  const steps = [
    snapshot ? `Select "${snapshot.name}"${snapshot.id === "custom" ? " and enter the values above under Advanced conditions" : ""}.` : "Select the same profile.",
    snapshot?.seed !== undefined ? `Set seed ${snapshot.seed}.` : "No seed was set, so outcomes will differ between runs. Set a seed to make them repeatable.",
    `Turn Auto-retry ${autoRetry ? "on" : "off"}.`,
    "Click Clear run so the seeded sequence restarts.",
    `Run in order: ${upTo
      .map((item) => `"${item.label}"${item.first.profileSnapshot && item.first.profileSnapshot.name !== snapshot?.name ? ` (on ${item.first.profileSnapshot.name})` : ""}`)
      .join(", ")}.`,
  ];
  return `${profileJson}\n\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`;
}

function Reproduction({ request, requests }: { request: TimelineRequest; requests: TimelineRequest[] }) {
  const text = reproductionText(request, requests);
  return (
    <div className="flex flex-col gap-2">
      <pre className="max-h-64 overflow-auto rounded-ui bg-canvas p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg">{text}</pre>
      <div>
        <CopyButton text={text} label="Copy profile and steps" />
      </div>
    </div>
  );
}
