# SlowNet — Project Log

The single place to track **what SlowNet must do**, **why it's built the way it is**, and **what changed when**. Update it with every meaningful change.

- Product spec (source of truth for functionality): `SlowNet_Project_Specification.docx` (not in the repo)
- UI spec (original visual direction): `SlowNet_Modern_UI_Design_Specification.docx` (not in the repo)
- **UI refinement plan (current source of truth for visuals and interaction):** `SlowNet_UI_Refinement_and_Improvement_Plan.docx` (not in the repo)
- Deeper technical notes: [docs/architecture.md](docs/architecture.md), [docs/known-limitations.md](docs/known-limitations.md)

**How to maintain this file**
- New requirement or scope change → edit **1. Specification** and mark its status.
- Design choice with trade-offs → add a row to **2. Decisions** (never delete old rows; mark them *Superseded by D-xx*).
- Anything shipped or fixed → add an entry at the top of **3. Changelog**.

---

## 1. Specification

**Thesis:** Make real-world network failure reproducible instead of surprising.

**Pitch:** Reproducible, seeded network-failure scenarios for frontend apps and tests, with a timeline and an exportable report.

**Target users:** frontend engineers on unreliable-network apps; mobile-web/product engineers validating loading, retry and offline UX; QA engineers who need repeatable scenarios.

### Functional requirements

| ID | Requirement | Status |
| --- | --- | --- |
| FR-01 | Presets: Stable, Slow 3G, High Latency, Flaky Network, Offline | ✅ Done |
| FR-02 | Custom profile: latency, jitter, failure %, timeout, offline toggle (units shown) | ✅ Done |
| FR-03 | Every demo request goes through the typed `slowFetch` wrapper | ✅ Done |
| FR-04 | Seed / deterministic mode for reproducible failures | ✅ Done |
| FR-05 | Timeline: label, start, duration, simulated delay, status, retry count | ✅ Done |
| FR-06 | Metrics: count, success/failure, median (≥3 samples), total elapsed | ✅ Done |
| FR-07 | Demo shows loading, success, failure, retry and offline states | ✅ Done |
| FR-08 | JSON export: profile, timestamp, events, summary, reproduction steps | ✅ Done |
| FR-09 | Accessibility: keyboard, visible focus, contrast, labels, reduced motion | ✅ Done |
| FR-10 | Reset run without reloading | ✅ Done |

### Preset values (illustrative, editable)

| Preset | Latency | Jitter | Failure | Offline |
| --- | --- | --- | --- | --- |
| Stable | 20 ms | 5 ms | 0% | No |
| Slow 3G | 400 ms | 150 ms | 2% | No |
| High Latency | 900 ms | 100 ms | 0% | No |
| Flaky Network | 250 ms | 300 ms | 25% | No |
| Offline | — | — | blocked | Yes |

Default timeout: 8 000 ms. Limits: latency ≤ 60 s, jitter ≤ 30 s, timeout ≤ 120 s, failure 0–100%.

### Simulation rules
- Injectable random source; delay = `max(0, latency + uniform jitter)`.
- `AbortController` per attempt for timeout/cancel; timers and listeners always cleaned up.
- Offline is its own error code, not a server error.
- No automatic retry by default; bounded retry is opt-in.
- Simulated delay and wall-clock duration recorded separately.
- Never intercept traffic outside the bundled demo app.

### Out of scope (MVP)
System-wide proxy/VPN, traffic shaping of other sites, claims of real radio accuracy, AI features, accounts/cloud sync.

### Definition of done
Typecheck, lint, unit and E2E tests pass; no secrets; README has setup, commands, architecture, limitations and demo walkthrough; demo covers success, failure and offline; export is valid and reproducible.

### Roadmap

| Phase | Feature | Status |
| --- | --- | --- |
| Done | Field Instrument UI (UI spec phases 1–5) | ✅ Done, then refined |
| Done | Field Lab refinement (plan phases 1–4, 6) | ✅ Done |
| Done | Live sessions: shape your own app via a script tag, realtime relay (Vercel-ready) | ✅ Done; production deploy pending your Vercel + Upstash setup |
| Next | Publish `@slownet/core` to npm (ESM import instead of the script tag) | Planned |
| Next | Shape XMLHttpRequest (axios default adapter) in live sessions | Planned |
| Next | Plan phase 5: scenario presets (Timeout boundary, Retry behavior…) | Planned |
| Next | Plan phase 5: run history (saved sessions + replay) | Planned |
| Next | Plan phase 5: before/after comparison (latency deltas, success rate) | Planned |
| Next | Plan phase 5: CSV export; p50/p95 with sample-size labels | Planned |
| Next | Plan phase 5: guided first run; import/export of scenario config | Planned |
| Next | Playwright helper: `slownet.apply(page, 'flaky', { seed: 42 })` | ⏳ Planned (highest priority) |
| V1.1 | HAR import and replay | Planned |
| V2 | Browser extension with explicit permissions | Planned |
| V2 | CI scenario runner + JSON artifacts | Planned |
| V3 | Optional AI summary of trace failures (must cite real events) | Planned |

---

## 2. Decisions

| ID | Date | Decision | Why |
| --- | --- | --- | --- |
| D-01 | 2026-10-22 | Monorepo: `packages/core` (library) + `apps/dashboard` (showcase) | Answers "why not DevTools?": the engine is installable and usable in tests, not just a demo |
| D-02 | 2026-10-22 | Next.js 16.4 App Router + Tailwind v4, TypeScript strict | Spec stack; latest stable at setup time |
| D-03 | 2026-10-22 | Mulberry32 seeded PRNG, injected as `RandomSource` | Small, fast, reproducible; tests can force outcomes |
| D-04 | 2026-10-22 | `planAttempt` always draws exactly 2 random values (jitter, failure) | Sequence depends only on seed + attempt count, not on the active profile |
| D-05 | 2026-10-22 | One timeout covers the whole attempt (delay + headers) | Single `AbortController`, simple cleanup |
| D-06 | 2026-10-22 | `withRetry`: default 2, hard cap 5, never retries `OFFLINE`/`ABORTED` | Bounded, visible retry per spec |
| D-07 | 2026-10-22 | Typed `SlowNetError` codes: `OFFLINE`, `TIMEOUT`, `SIMULATED_FAILURE`, `ABORTED`, `NETWORK_ERROR`; non-2xx returned like `fetch` | Predictable error handling, mirrors `fetch` semantics |
| D-08 | 2026-10-22 | Event ids keep counting after Reset | A late-settling request can't overwrite an event in the new run |
| D-09 | 2026-10-22 | Core ships TS source, compiled via `transpilePackages` | No build step needed during development |
| D-10 | 2026-10-22 | Turned off `exactOptionalPropertyTypes` | Friction without real safety gain here |
| D-11 | 2026-10-22 | Validation messages in each field's display units, built from `PROFILE_LIMITS` | Failure field is in %, schema in 0..1; numbers can't drift |
| D-12 | 2026-10-22 | Changing only the seed keeps the preset's name | Avoids confusing "Custom" label |
| D-13 | 2026-10-22 | E2E Flaky test uses seed 1 (fail → retry succeeds), pinned by a unit test | Deterministic E2E; breaks loudly if the engine changes |
| D-14 | 2026-10-22 | Install with `npx npm@11 install` | npm 10.8 crashes (`reading 'edgesOut'`) on vitest's optional peers |
| D-15 | 2026-10-22 | Theme: near-black #0D0D0D, warm off-white, coral #E75B50, Instrument Serif / Inter / JetBrains Mono | Spec §8: match portfolio visual language. *Superseded by D-16* |
| D-16 | 2026-10-22 | New theme: modern, user-friendly UI with light (default) + dark mode, indigo accent, Inter headings, rounded cards with soft shadows | User asked for a friendlier, modern look; deliberately departs from spec §8. *Superseded by D-19* |
| D-17 | 2026-10-22 | Semantic color tokens (`canvas`, `surface`, `subtle`, `line`, `fg`, `muted`, `faint`, `accent`, `on-accent`, `danger`, `ok`, `warn`, `offline`) redefined per theme in `globals.css` | One set of class names for both themes; errors (`danger`) no longer share the accent color. *Superseded by D-20* |
| D-18 | 2026-10-22 | Theme choice System / Light / Dark; "System" follows `prefers-color-scheme`; saved in `localStorage`; inline script sets `data-theme` before paint | No flash of the wrong theme; storage failure falls back gracefully. *Superseded by D-19 (single dark theme)* |
| D-19 | 2026-10-22 | Adopt the UI spec's **Field Instrument** direction: one dark warm-neutral theme, signal-orange `#FF6847` as the only accent, IBM Plex Sans/Mono; light mode and theme toggle removed | The UI spec is now the source of truth for visuals and defines a single palette. *Superseded by D-30* |
| D-20 | 2026-10-22 | Tokens per UI spec §3, plus `control` border `#6A7167` and `muted` raised to `#858C82` | Measured contrast: spec muted was 3.8:1 on raised; control borders need 3:1 (WCAG 1.4.11). *Superseded by D-31* |
| D-21 | 2026-10-22 | Shell: 48px command bar · 232px profile rail · workbench · 320px inspector · 30px status strip; viewport-height app shell on desktop | UI spec §5; first viewport shows profile, actions, evidence and run state. *Superseded by D-32* |
| D-22 | 2026-10-22 | Inspector is a static column ≥1280px, a `<dialog>` drawer below | UI spec §10 (collapse at 1024px); native dialog gives focus trap, Esc, focus return. *Superseded by D-33* |
| D-23 | 2026-10-22 | Flight recorder: one row per request, shared 1–2–5 time scale, hatched simulated delay vs solid measured execution, endpoint glyphs, dashed retry backoff | UI spec §2/§8 signature feature; honest separation of simulated vs measured |
| D-24 | 2026-10-22 | Engine records `profileSnapshot` and `retryPolicy` per attempt; `reportFileName(profile, date)` | Inspector needs profile-at-start and retry policy; spec §6D filename with date + scenario |
| D-25 | 2026-10-22 | `LabSession` / `DemoActions` stores outside React (`useSyncExternalStore`) | Scripted sample session, shortcuts and palette can change profile and fetch in one tick |
| D-26 | 2026-10-22 | Demo actions renamed Fetch catalog / Submit form / Load account; `/api/demo/products` → `/api/demo/catalog`; "Reset run" → "Clear run" | UI spec §6B wording |
| D-27 | 2026-10-22 | Export message says "Download started", never "saved" | UI spec §6D: never claim success before the browser confirms |
| D-28 | 2026-10-22 | Shortcuts R, 1–5, E, ?, Ctrl/⌘K, Esc; single keys ignored in text fields, with modifiers, or under a dialog | UI spec §11; don't override typing or assistive tech |
| D-29 | 2026-10-22 | Profile rail not collapsible to an icon rail | UI spec allows collapse only if stable; not needed for the first viewport. *Superseded by D-32 (rail removed)* |
| D-30 | 2026-10-22 | **Field Lab** direction (refinement plan §2): warm light canvas, white surfaces, cobalt `#2643D0` accent | Differentiate from the portfolio (near-black / coral) and reduce the dark-dashboard density |
| D-31 | 2026-10-22 | Field Lab tokens: canvas `#F5F3EE`, surface `#FFF`, subtle `#ECE9E2`, control `#837E74`, muted `#68635A`, status green/amber/red/slate | All text ≥ 4.5:1 on every surface; control borders ≥ 3:1 (measured) |
| D-32 | 2026-10-22 | One page scroll: compact top bar, scenario setup bar, compact endpoint rows, recorder. Profile rail and status strip removed; advanced conditions collapsed | Plan §3–4: one persistent region, no nested scrollbars, recorder above the fold at 1440×900 |
| D-33 | 2026-10-22 | Inspector is a drawer by default, pinnable at ≥1280px (preference in localStorage with in-memory fallback) | Plan §4: don't permanently take width on laptops |
| D-34 | 2026-10-22 | Core `requestTiming()` / `attemptTiming()`: applied delay = min(planned, duration), execution = remainder, wait = gaps; sim + exec + wait = wall | Plan §6: timing arithmetic must reconcile; one model for UI, tooltip and report |
| D-35 | 2026-10-22 | Report adds `requests[]` (per-request timing), `timingDefinitions`, `environment.userAgent` (additive, schemaVersion 1) | Plan §7 evidence export; exported numbers equal displayed numbers |
| D-36 | 2026-10-22 | Recorder: run-relative axis fitted with a 4% margin, filters (All/Successful/Failed/Retried/Blocked/Timed out), zoom/pan, hover+focus tooltip, collapsible legend, Focus recorder (F) | Plan §5 |
| D-37 | 2026-10-22 | Inspector tabs Overview / Timing / Attempts / Response; failed requests lead with the reason; "Used" vs "Active now" table; copyable ids | Plan §6–7 |
| D-38 | 2026-10-22 | Clear run is undoable for 10 s (until a new request); in-flight attempts are restored as cancelled | Plan §8: prefer undo over a confirm dialog |
| D-39 | 2026-10-22 | Outcome categories separate HTTP errors, transport failures (dropped, timeout, network) and offline blocks | Plan §6 |
| D-40 | 2026-10-22 | Plan phase 5 deferred to individual follow-ups | Ship the calmer core workflow first, as the plan's own ordering says |
| D-41 | 2026-10-22 | "Others can use it" = live sessions on their own apps, hosted on Vercel | User choice, 2026-10-22 |
| D-42 | 2026-10-22 | Simulation runs inside the connected app (drop-in `slownet-live.js`, 6.8 kB, built from core with esbuild); the relay only syncs profiles and events | No open proxy; credentials and payloads never leave the app; same engine as the demo |
| D-43 | 2026-10-22 | Transport: SSE streams from route handlers + POSTed event batches; storage: in-memory locally, Upstash Redis REST on Vercel; 503 when serverless without Redis | Vercel functions can't hold WebSockets or share memory; fail loudly instead of half-working |
| D-44 | 2026-10-22 | Session id = watch/report capability; separate control key (sha256 stored, sent as `x-slownet-key`, kept in the URL #fragment) for profile changes and Clear run | Viewer links are safe to share; script tags in public apps can't be used to hijack a session |
| D-45 | 2026-10-22 | Redaction by default: method, origin + path, timings, status, error codes only; no headers, bodies or query strings unless `data-include-query` | Query strings often carry tokens |
| D-46 | 2026-10-22 | Event batches sent as `text/plain` JSON | Simple cross-origin request: no preflight, keepalive allowed |
| D-47 | 2026-10-22 | Limits: 100 events/batch, 128 KB/batch, 2,000 attempts/run, 24 h TTL; stale-run batches get 409 | Bound abuse and storage on a public relay |

---

## 3. Changelog

### 2026-10-22: Published to GitHub
- Public repository: https://github.com/Vishalll069/slownet (default branch `main`).
- Spec `.docx` files are kept out of the repo (`.gitignore`); this log summarises them.

### 2026-10-22 — Live sessions (use SlowNet on your own app)
- **Core:** `connectLive()` client (fetch shaping with the real engine, SSE or polling for state, redacted upsert batches, run resets, relay-traffic exclusion); `slownet-live.js` browser entry; live protocol types and zod schemas; 6 new client tests.
- **Relay:** `/api/live/sessions`, `[s]/state` (GET/PUT), `[s]/clear`, `[s]/events`, `[s]/stream` (SSE, resumable); CORS; control-key checks; `MemoryStore` and `UpstashStore` with 4 unit tests (D-42 to D-47).
- **Dashboard:** Demo / Live switch; Live panel (status, connected apps, script + JS snippets, viewer/control links, privacy note); view-only mode; live profile changes, Clear run and export; inspector notes that bodies aren't sent.
- **Example app:** `/examples/live-demo.html?session=…`.
- **Tests:** 65 core + 4 relay unit tests; 26 E2E, adding a real cross-origin app shaped by the dashboard, viewer-only links, and relay validation (404/403/400/409).
- **Docs:** README live-sessions guide and Vercel deploy steps, `.env.example`, architecture diagram, limitations.

### 2026-10-22 — Field Lab refinement (refinement plan phases 1–4, 6)
- **Clutter:** single page scroll; compact top bar with simulation state; scenario setup bar (presets, Run scenario, Load sample session, profile summary); Advanced conditions collapsed; compact endpoint rows; profile rail and status strip removed (D-32). Inspector became a pinnable drawer (D-33).
- **Identity:** Field Lab tokens with cobalt accent, contrast-checked (D-30, D-31). Fewer borders, no uppercase micro-labels, minimum 12px UI text.
- **Recorder:** fitted run-relative axis, filters with counts, zoom/pan, exact-value tooltip, collapsible legend, guided empty state, Focus recorder (D-36).
- **Trustworthy history:** core timing model with reconciling split (D-34); inspector tabs, failure reason first, profile used vs active now, copyable ids (D-37); outcome categories (D-39); undoable Clear run (D-38); completion announcements in a live region.
- **Export:** per-request timing, timing definitions, environment (D-35).
- **Core:** `requestTiming`, `attemptTiming`, `TIMING_DEFINITIONS`, `EventRecorder.restore`, report additions, with tests (59 unit tests).
- **Tests:** 20 E2E (10 scenarios × desktop + mobile), adding profile-history immutability, export reconciliation, undo, filters/zoom/tooltip and Focus mode.
- **QA:** 1440×900, 1366×768 (pinned), 390px, long run (26 requests), timeout + retry, reduced motion; no console errors; no horizontal overflow.

### 2026-10-22 — Field Instrument UI (UI spec phases 1–5)
- **Foundation:** Field Instrument tokens (D-19, D-20), IBM Plex fonts, tabular numerals, app shell with command bar, profile rail, workbench, inspector and status strip (D-21). Light/dark toggle removed.
- **Core interaction:** presets as instrument modes (accent line + "Active", keys 1–5); Profile dial with sliders, numeric fields, offline switch and seed; demo app with Fetch catalog / Submit form / Load account; Run a scenario; Load sample session (real seeded run) (D-25, D-26).
- **Flight recorder:** per-request rows on a shared scale with calibration grid, hatched delay, measured execution, endpoint glyphs and retry links; listbox keyboard navigation; labelled empty-state example (D-23).
- **Inspector + report:** summary, profile at request start (flags later changes), timing breakdown per attempt, outcome preview or error explanation, retries + policy, copyable reproduction, raw JSON; drawer below 1280px (D-22). Export filename `slownet-<scenario>-<date>-<time>.json` (D-24, D-27).
- **Polish:** command palette, shortcut help, global shortcuts (D-28), aria-keyshortcuts, reduced motion, focus ring in the base layer.
- **Core:** `profileSnapshot`, `retryPolicy`, `reportFileName` added with tests; report step wording "clear the run".
- **Tests:** 52 unit tests; 18 E2E tests (9 scenarios × desktop + mobile), adding the sample session, keyboard/palette/help and shortcut-in-input tests. Lint, typecheck and build pass.
- **Docs:** README design-token table + extension rules + shortcuts; architecture and known limitations updated.

### 2026-10-22 — Modern theme with light/dark mode
- Replaced the dark/coral portfolio theme with a modern light theme plus dark mode (D-16 to D-18).
- Added `ThemeToggle` (System / Light / Dark) in a sticky, blurred header ([theme-toggle.tsx](apps/dashboard/src/components/theme-toggle.tsx), [theme.ts](apps/dashboard/src/features/theme/theme.ts)).
- Dropped Instrument Serif; headings now use Inter. Stat tiles, cards and the profile panel are rounded cards with soft shadows; primary buttons use the indigo accent; errors use a dedicated red.
- No user-visible text changed. Lint, typecheck and all 14 E2E tests pass; checked visually in both themes.

### 2026-10-22 — Project log added
- Added this `PROJECT_LOG.md` to track spec, decisions and changes.

### 2026-10-22 — Initial MVP
- Scaffolded monorepo; built `@slownet/core`: seeded engine, `slowFetch`, `withRetry`, typed errors, `EventRecorder`, JSON report with Zod schema.
- Built dashboard: profile panel (presets + validated custom), demo store (Fetch products, Submit order, Load profile), timeline waterfall (simulated vs real segments), inspector, summary strip, export and reset.
- Tests: 47 Vitest unit tests, 14 Playwright E2E (7 scenarios × desktop + mobile). Lint, typecheck and build pass.
- Fixed: Reset id collision (D-08); wrong-unit validation messages (D-11); seed turning preset into Custom (D-12); state hook reading a ref during render.
- Docs: README (incl. "Why not DevTools?" and demo script), architecture.md, known-limitations.md.
- Known: not in git yet; npm 11 skipped esbuild/unrs-resolver install scripts (approve with `npm install-scripts approve` if needed); Google Fonts unreachable in sandboxed runs (fallback fonts).
