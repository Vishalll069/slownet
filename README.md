# SlowNet

Reproducible, seeded network-failure scenarios for frontend apps.

SlowNet wraps `fetch` so every request goes through a **network profile**: latency, jitter, failure rate, timeout and offline. Each attempt is recorded on a timeline, and a run can be exported as a JSON report that is enough to reproduce it.

## Why not DevTools throttling?

DevTools can slow every request down or switch the page offline. It can't:

- **fail a chosen percentage of requests**, the way real flaky networks do;
- **replay the exact same failures**: with a seed, the same actions after a reset give the same delays and the same failures, so a bug can be reproduced and a fix verified;
- **separate simulated delay from real duration** per attempt, with retry history;
- **run inside your tests**: the engine is a plain TypeScript package with an injectable random source and no dependency on a browser.

## Repository layout

```
packages/core        @slownet/core: simulation engine, slowFetch, retry, recorder, report, live client (no UI)
apps/dashboard       Next.js lab: scenario setup, demo endpoints, flight recorder, inspector drawer, command menu, export
docs/                architecture.md, known-limitations.md, specs
scripts/             build-live-sdk.mjs (bundles /slownet-live.js)
```

## Getting started

Requires Node 20.9+.

```bash
npm install          # if npm 10 fails with "reading 'edgesOut'", use: npx npm@11 install
npm run dev          # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for the core package (Vitest) |
| `npm run typecheck` | TypeScript across all workspaces |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run test:e2e -w @slownet/dashboard` | Playwright E2E tests, desktop + mobile (run `npx playwright install chromium` first) |

## Using the core package

```ts
import { createSlowFetch, EventRecorder, PRESETS, withRetry } from "@slownet/core";

const recorder = new EventRecorder();
const slowFetch = createSlowFetch({ profile: { ...PRESETS.flaky, seed: 42 }, recorder });

const response = await withRetry(
  (attempt) => slowFetch("/api/catalog", { label: "Fetch catalog", requestId: "catalog", attempt }),
  { maxRetries: 2, backoffMs: 300 },
);
```

Failures reject with a typed `SlowNetError` whose `code` is `OFFLINE`, `TIMEOUT`, `SIMULATED_FAILURE`, `ABORTED` or `NETWORK_ERROR`. Non-2xx responses are returned as they are, like `fetch`.

## Demo walkthrough (60–90 s)

1. **Stable** (`1`): press `R` or click **Run scenario**. A fast success lands in the flight recorder.
2. **Slow 3G** (`2`): run it again and compare the hatched simulated delay with the wall-clock duration.
3. **Flaky** (`4`): open **Advanced conditions**, set seed `1`, turn on **Auto-retry**, then run. The first attempt drops (✕), a dotted retry wait follows, and the retry succeeds (`↻ 1`). Hover the row: the tooltip shows `wall = sim + exec + wait` with exact offsets.
4. **Offline** (`5`): select *Submit form* and run it. The blocked state (⊘) is distinct from an HTTP error. Switch back to Stable and click **Try again**; the retry joins the same row.
5. Click a row (or focus the recorder, `↑`/`↓`, `Enter`). The inspector opens on **Overview**: why it failed, the timing split, the profile *used by this request* next to the profile *active now*, copyable ids and reproduction steps. **Timing**, **Attempts** and **Response** hold the detail. Pin it beside the recorder on wide screens.
6. Use the filters (Failed, Retried, Blocked, Timed out) and zoom to look at clusters. Press `F` for Focus recorder.
7. Press `E` (**Export report**): profile, events with per-attempt profile snapshots and retry policy, per-request timing, timing definitions and reproduction steps.

**Load sample session** records steps 1, 3 and 4 through the real engine in one click. **Clear run** can be undone for 10 seconds.

### Keyboard

| Key | Action |
| --- | --- |
| `Ctrl/⌘ K` | Command menu |
| `R` | Run scenario (selected endpoint) |
| `1`–`5` | Stable / Slow 3G / High Latency / Flaky / Offline |
| `E` | Export the current run |
| `F` | Focus recorder |
| `↑` `↓` / `Enter` | Move through the flight recorder / inspect |
| `Esc` | Close the command menu, help or inspector drawer |
| `?` | Shortcut help |

Single-key shortcuts are ignored while typing in a field, with modifier keys held, or while a dialog is open.

## Live sessions: use SlowNet on your own app

The bundled demo shows how SlowNet works. **Live session** applies it to your real frontend.

1. In the dashboard, switch to **Live session**. You get a session id and a control link (the key lives in the URL `#fragment`, so it never reaches a server log).
2. Add the script it shows to your app's HTML, before your code runs:

   ```html
   <script src="https://YOUR-SLOWNET/slownet-live.js" data-session="s_…"></script>
   ```

   or call it from code: `const live = window.SlowNet.connect({ server, session }); await live.fetch("/api/items")`.
3. Pick profiles in the dashboard. Connected apps switch within about a second, and every attempt they make appears in the flight recorder, inspector and export.

| Option | Default | Effect |
| --- | --- | --- |
| `data-match` | same origin | `*` shapes every origin; `/api` shapes a path prefix |
| `data-include-query` | `false` | Send query strings too (off, because they often carry tokens) |
| `data-server` | the script's origin | Where the relay lives |

**What leaves your app:** method, origin + path, timings, status and SlowNet error codes. Never headers, bodies or (by default) query strings. The relay never shapes its own traffic. Only `fetch` is shaped: `XMLHttpRequest`, and therefore axios's default adapter, are not.

**Access:** anyone with the session id can report events and watch (that's what the viewer link is). Changing the profile or clearing the run needs the control key. Sessions expire after 24 hours; a run holds up to 2,000 attempts.

**Try it without your own app:** the Live panel links to `/examples/live-demo.html?session=…`, a plain page that loads the script and makes ordinary `fetch` calls.

### Deploying to Vercel

1. Import the repository in Vercel and set **Root Directory** to `apps/dashboard` (the npm workspace install runs from the repo root automatically). `npm run build` bundles `slownet-live.js` first.
2. Add **Upstash Redis** from the Vercel Marketplace (or set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` yourself, see `.env.example`). Without it, live endpoints answer `503 relay-not-configured` rather than half-working, because serverless instances don't share memory. The demo works either way.
3. Deploy, open the site, and start a live session.

The relay uses server-sent events: each stream lasts under a minute (`maxDuration = 60`) and `EventSource` reconnects and resumes automatically. With Upstash, every open dashboard polls about 2–3 Redis commands every 400 ms; check your plan's command quota if many dashboards stay open.

## Design system: Field Lab

The current visual source of truth is `SlowNet_UI_Refinement_and_Improvement_Plan.docx` (not in the repo). It builds on the functional spec and the original UI spec. Tokens live in [`apps/dashboard/src/app/globals.css`](apps/dashboard/src/app/globals.css) as Tailwind `@theme` colours, so every utility (`bg-surface`, `text-failure`, `border-control`…) reads from one place.

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | `#F5F3EE` | Page background (warm stone) |
| `surface` | `#FFFFFF` | Panels: setup, endpoints, recorder, inspector |
| `subtle` | `#ECE9E2` | Segmented controls, hover, secondary grouping |
| `line` | `#DCD8CE` | Separators (used sparingly) |
| `control` | `#837E74` | Borders of inputs and buttons (≥ 3:1) |
| `fg` / `secondary` / `muted` | `#1A1916` / `#4F4B43` / `#68635A` | Text hierarchy |
| `accent` / `accent-soft` | `#2643D0` / `#E8ECFB` | Cobalt: primary action, active/selected marker, focus. Nothing else |
| `success` / `warning` / `failure` / `neutral` | `#1D7444` / `#8A5700` / `#BE2D26` / `#4A5466` | Request state only |

Every text token meets WCAG AA (≥ 4.5:1) on `canvas`, `surface`, `subtle` and `accent-soft`. Cobalt was chosen because the portfolio uses near-black, warm off-white and coral `#E75B50`. Type is IBM Plex Sans; IBM Plex Mono is reserved for ids, paths, durations and code. Numerals are tabular.

### Extending components without visual drift

- **Group with space and surface, not boxes.** A white `surface` panel on the `canvas` is the default container. Add a `line` separator only between rows, and don't nest bordered cards.
- **Colour means state.** Use `describeOutcome()` in [`features/lab/format.ts`](apps/dashboard/src/features/lab/format.ts) for any request status. It returns a label, a category (HTTP vs transport vs blocked), a tone and an icon, so colour is never the only signal. Don't add hex values; add a token if one is truly needed.
- **One accent.** Cobalt is for the primary action, the active or selected marker and focus. Status never uses it.
- **Progressive disclosure.** Advanced controls live behind **Advanced conditions**, detail behind inspector tabs. Don't shrink text to make things fit: collapse instead. Minimum UI text is 12px; uppercase eyebrows are not used.
- **Timing comes from one place.** Use `requestTiming()` / `attemptTiming()` from `@slownet/core` for any duration. Simulated delay is drawn hatched, execution solid, retry wait dotted, so `sim + exec + wait = wall` always holds.
- **Motion.** 120–180ms selection, drawer and fade transitions only. `prefers-reduced-motion` disables them; only in-flight elements pulse.
- **Real data only.** Rows, tooltips, the inspector and the report read recorded `RequestEvent`s. The only static drawing is the empty-state example, which is labelled *Example*.

## Limitations

Simulation happens inside the bundled demo app only. See [docs/known-limitations.md](docs/known-limitations.md).
