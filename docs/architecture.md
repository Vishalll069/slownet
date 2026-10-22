# Architecture

```
Lab (client, one page scroll)
├── LabSession ────────── profile · seeded random · EventRecorder · run AbortController · clear()/restore() for undo
│                         slowFetch(profile getter) ── planAttempt → delay + verdict
│                                                      ├── offline → reject OFFLINE
│                                                      ├── sleep(delay) (abortable)
│                                                      ├── verdict=fail → SIMULATED_FAILURE
│                                                      └── real fetch → /api/demo/* (Route Handlers)
├── DemoActions ───────── 3 endpoints · auto-retry (withRetry) · sample session · previews · announcements
├── CommandBar ────────── session · simulation state · Focus recorder · command menu (Ctrl/⌘K) · help
├── ScenarioSetup ─────── presets (1–5) · Run scenario · Advanced conditions (collapsed by default)
├── EndpointList ──────── compact rows: select for Run scenario · one-line state · Run / Try again
├── FlightRecorder ────── groupRequests + requestTiming → rows on a run-relative scale
│                         filters · zoom/pan · hover/focus tooltip · legend · undo notice
├── RequestInspector ──── drawer by default; pinned column ≥1280px · Overview / Timing / Attempts / Response
└── Export ────────────── buildReport (events, requests, timingDefinitions, environment) → reportFileName
```

## Key decisions

**An injectable random source.** `planAttempt` always draws exactly two values per attempt (jitter, then failure), even when offline. The random sequence therefore depends only on the seed and the number of attempts, not on which profile was active. Tests use `createSequenceRandom` to force a given outcome.

**One timeout covering the whole attempt.** A single `AbortController` per attempt is aborted by the timeout timer (`TIMEOUT`) or by the caller's signal (`ABORTED`). The simulated delay and the real fetch both listen to it. Timers and listeners are removed in `finally`. A test checks that no timers remain after success, failure, timeout or offline.

**Offline is not a server error.** It rejects before any delay or fetch, with its own code and its own UI state.

**Retries are opt-in and bounded.** `withRetry` defaults to 2 retries, is capped at 5, and never retries `OFFLINE` or `ABORTED`. Retries share a `requestId` and increment `attempt`, which is what powers the retry history.

**Two separate durations.** `simulatedDelayMs` is what the engine chose; `durationMs` is measured wall-clock time. The timeline bar draws them as two segments.

**Clear run.** Clear run aborts the run's controller, clears the recorder and creates a fresh random sequence. Event ids keep counting after a clear, so a request that settles late can't overwrite an event from the new run.

**The core package ships TypeScript source.** The dashboard compiles it via `transpilePackages`. Publishing it to npm would add a build step (`npm run build -w @slownet/core`).

**Session state lives outside React.** `LabSession` and `DemoActions` are small classes with a `subscribe`/`getSnapshot` API read through `useSyncExternalStore`. The sample session, shortcuts and the command palette can therefore switch profile and fire a request in the same tick, without stale closures. `slowFetch` reads the profile through a getter on every attempt.

**Each attempt records its context.** The engine stores a `profileSnapshot` (profile values at attempt start) and the caller's `retryPolicy` on every event. The inspector compares snapshots with the active profile to flag changes, and the report keeps them for reproduction.

**The inspector adapts to width.** At 1280px and above it is a static column. Below that, selecting a row opens it in a modal `<dialog>`, so the browser handles focus trapping, Esc and focus return.

**One timing model.** `requestTiming()` in the core derives every displayed duration from recorded timestamps. Per attempt, applied delay is `min(planned delay, duration)` and execution is `duration − applied delay`. Per request, retry wait is the gap between attempts. So `simulated + execution + wait = wall-clock` exactly, and the UI, tooltip and report all use the same numbers. The time axis is run-relative: its origin is the first attempt's start.

**Clear run is undoable.** `LabSession.clear()` returns what it removed (events, random sequence, run number). In-flight attempts are recorded as cancelled, because the clear aborted them. `restore()` puts it all back until a new request is recorded or 10 seconds pass.

## Live sessions

```
Your app (any origin)                    SlowNet (Next.js on Vercel)                     Dashboard tab
  <script slownet-live.js>                 /api/live/*  (CORS: *)                          LiveConnection
  connectLive ── fetch patch ──► engine    ├─ POST sessions ────────────── create ◄──────── Live session
     │  shapes matching requests           ├─ GET  [s]/stream?role=app ─ SSE state ──► app
     │                                     ├─ POST [s]/events ◄── batches (text/plain, upserts)
     └─ reports attempts ──────────────►   ├─ GET  [s]/stream?role=dashboard ─ SSE state/events/clients ──► recorder
                                           ├─ PUT  [s]/state   (x-slownet-key) ◄─────────── profile change
                                           └─ POST [s]/clear   (x-slownet-key) ◄─────────── Clear run
                                           LiveStore: memory (local) | Upstash Redis REST (serverless)
```

**Simulation stays in the app.** The relay never proxies traffic. The client runs the same engine in the page and only reports what happened, so there is no open proxy, and the app's credentials and payloads never leave it.

**Upserts, not appends.** Each attempt is sent when it starts and again when it settles. The relay namespaces ids per client (`clientId:evt-n`) and appends versions to a per-session log. The dashboard applies them by id, so the timeline grows bars live.

**Runs gate events.** Clear run increments `runId` and empties the log. Apps reset their seeded sequence on the new run, and batches tagged with an older run get `409` with the current run.

**SSE on serverless.** A stream route polls the store (dashboard 400 ms, app 800 ms), emits `state`, `events` and `clients`, and closes after about 50 s. `EventSource` reconnects, and `Last-Event-ID` (`runId:cursor`) resumes without gaps or duplicates.
